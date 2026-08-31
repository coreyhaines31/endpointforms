import { createHash } from "node:crypto";

/**
 * Duplicate and burst detection (#31).
 *
 * ## This never refuses anything, and that is the design
 *
 * There is already a hard rate limiter on the ingest path
 * (`src/lib/ingest/rate-limit.ts`) that returns 429 when an endpoint or an
 * address is being hammered. That one exists to stop a catastrophe — the
 * "665 fills in seventy-six minutes" case — and it belongs where it is.
 *
 * This module is the other half, and it deliberately does the opposite: it
 * counts, it scores, and it lets everything through. `/spam/ip-rate-limiting`
 * is live on our site and its central point is that per-address limits protect
 * your infrastructure reliably and your CRM barely at all, because a residential
 * proxy pool sends one submission per address. It also names the false positive
 * precisely: "A tight per-IP limit does not block a bot farm; it blocks the
 * third person at your enterprise prospect who tried to register for the
 * webinar that morning." Turning that into a refusal is the failure this
 * product exists to complain about. Turning it into two points on a score that
 * cannot flag anything by itself is not.
 *
 * ## The honest limitation, stated up front
 *
 * These counters live in process memory, so on a serverless platform every warm
 * instance keeps its own. A burst spread across instances is undercounted, and
 * a duplicate seen by two instances looks like two firsts. That makes this a
 * corroborating signal rather than a reliable count, which is why its weights
 * are small. A shared counter in Postgres would fix it and would put a write on
 * the hottest path in the product; that trade is worth making only once there
 * is real traffic to measure it against.
 *
 * It also fails **open**: under memory pressure the maps are cleared, every
 * counter restarts, and submissions score lower rather than higher. Wrong in
 * the direction that keeps leads.
 */

/** How long two identical payloads count as the same blast. */
export const DUPLICATE_WINDOW_MS = 6 * 60 * 60 * 1000;

/** The rolling window for burst counting. */
export const VELOCITY_WINDOW_MS = 10 * 60 * 1000;

/**
 * Generous on purpose. A busy office behind one address genuinely produces
 * several submissions in ten minutes, and the cost of being wrong here is a
 * flag on a real lead.
 */
export const VELOCITY_BURST = 8;
export const VELOCITY_SEVERE = 25;

export const DUPLICATE_WEIGHT = 4;
export const VELOCITY_BURST_WEIGHT = 2;
export const VELOCITY_SEVERE_WEIGHT = 3;

/** Bounded so a flood of distinct payloads cannot grow these without limit. */
const MAX_TRACKED = 20_000;
/** Distinct clients remembered per payload. Enough to answer "more than one?". */
const MAX_CLIENTS_PER_PAYLOAD = 8;

type DuplicateEntry = { firstSeen: number; count: number; clients: Set<string> };
type VelocityEntry = { windowStart: number; count: number };

const duplicates = new Map<string, DuplicateEntry>();
const velocities = new Map<string, VelocityEntry>();

/**
 * What the counters saw. Passed into `assess()` so the scoring function stays
 * pure and testable without touching this module's state.
 */
export type VelocityObservation = {
  /** How many times this exact payload has been seen on this endpoint, including now. */
  duplicateCount: number;
  /** How many distinct clients sent it. Two or more is the interesting case. */
  duplicateClients: number;
  /** Submissions from this fingerprint in the current window, including now. */
  burstCount: number;
};

export const NO_VELOCITY: VelocityObservation = {
  duplicateCount: 1,
  duplicateClients: 1,
  burstCount: 1,
};

/**
 * A stable hash of what was actually submitted.
 *
 * Key order is not meaningful, whitespace is normalised, and case is preserved
 * — two people typing the same sentence with different capitalisation are two
 * people, and collapsing that would make the signal fire on ordinary forms with
 * a small number of options.
 */
export function payloadHash(values: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalize(values)).digest("hex").slice(0, 32);
}

/**
 * A rough identity for burst counting: this client, on this endpoint, with this
 * browser. The User-Agent is included so a shared office address does not
 * collapse thirty different people onto one counter.
 */
export function clientFingerprint(
  endpointId: string,
  ipHash: string | null,
  userAgent: string | null,
): string {
  return createHash("sha256")
    .update(endpointId)
    .update("\n")
    .update(ipHash ?? "")
    .update("\n")
    .update(userAgent ?? "")
    .digest("hex")
    .slice(0, 32);
}

/**
 * Records this submission and reports what the counters had already seen.
 *
 * Called once per submission on the ingest path. `now` is injected so tests can
 * walk the clock without sleeping.
 */
export function observe(input: {
  endpointId: string;
  contentHash: string;
  fingerprint: string;
  clientKey: string | null;
  now?: number;
}): VelocityObservation {
  const now = input.now ?? Date.now();
  const client = input.clientKey ?? "unknown";

  const duplicateKey = `${input.endpointId}:${input.contentHash}`;
  const existing = duplicates.get(duplicateKey);

  let duplicateCount = 1;
  let duplicateClients = 1;

  if (existing && now - existing.firstSeen <= DUPLICATE_WINDOW_MS) {
    existing.count += 1;
    if (existing.clients.size < MAX_CLIENTS_PER_PAYLOAD) existing.clients.add(client);
    duplicateCount = existing.count;
    duplicateClients = existing.clients.size;
  } else {
    if (duplicates.size >= MAX_TRACKED) sweep(now);
    duplicates.set(duplicateKey, { firstSeen: now, count: 1, clients: new Set([client]) });
  }

  const velocity = velocities.get(input.fingerprint);
  let burstCount = 1;
  if (velocity && now - velocity.windowStart <= VELOCITY_WINDOW_MS) {
    velocity.count += 1;
    burstCount = velocity.count;
  } else {
    if (velocities.size >= MAX_TRACKED) sweep(now);
    velocities.set(input.fingerprint, { windowStart: now, count: 1 });
  }

  return { duplicateCount, duplicateClients, burstCount };
}

function sweep(now: number): void {
  for (const [key, entry] of duplicates) {
    if (now - entry.firstSeen > DUPLICATE_WINDOW_MS) duplicates.delete(key);
  }
  for (const [key, entry] of velocities) {
    if (now - entry.windowStart > VELOCITY_WINDOW_MS) velocities.delete(key);
  }
  // Still full after sweeping. Clearing lets traffic through and undercounts,
  // which is the right direction for this product to be wrong in.
  if (duplicates.size >= MAX_TRACKED) duplicates.clear();
  if (velocities.size >= MAX_TRACKED) velocities.clear();
}

/** Test seam. Nothing in the request path calls this. */
export function resetVelocity(): void {
  duplicates.clear();
  velocities.clear();
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value.replace(/\s+/g, " ").trim());
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}
