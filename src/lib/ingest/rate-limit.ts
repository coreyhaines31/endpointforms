import { IngestError } from "./errors.ts";
import { rateLimitConfig, type RateLimitConfig } from "./limits.ts";

/**
 * Fixed-window counters, held in process memory.
 *
 * **The honest limitation, stated up front:** this is per-instance. On Vercel
 * every concurrent function instance keeps its own counters, so the effective
 * ceiling is the configured limit multiplied by however many instances are warm.
 * That makes this a blunt guard against a single client hammering a single
 * instance, not a precise quota. A shared counter (Postgres or Redis) is the
 * real answer and belongs with #31, where abuse handling gets designed properly
 * rather than bolted on here.
 *
 * It is still worth having: it costs nothing, it survives the common case of a
 * runaway script or a jammed submit button, and it fails **open** — if the
 * counter is wrong, a submission gets through. That is the right direction for
 * this product to be wrong in.
 */

type Window = { count: number; resetAt: number };

/**
 * Bounded so a flood of distinct IPs cannot grow this without limit. When the
 * cap is hit, expired entries are swept first, and if that frees nothing the
 * map is cleared — every counter restarts, which lets traffic through. Failing
 * open under memory pressure is deliberate.
 */
const MAX_TRACKED_KEYS = 20_000;

const windows = new Map<string, Window>();

export type RateLimitDecision = {
  allowed: boolean;
  /** The window that refused, for the error message. */
  scope?: "endpoint" | "ip" | "endpoint+ip";
  /** Seconds until the offending window resets. */
  retryAfter?: number;
};

function hit(key: string, limit: number, windowMs: number, now: number): boolean {
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) sweep(now);
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  existing.count += 1;
  return existing.count <= limit;
}

function resetIn(key: string, now: number): number {
  const existing = windows.get(key);
  if (!existing) return 1;
  return Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
}

function sweep(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  if (windows.size >= MAX_TRACKED_KEYS) windows.clear();
}

/**
 * Checks all three windows and counts against every one of them.
 *
 * All three are incremented even when an earlier one already refused, so a
 * client that keeps pushing stays counted rather than resetting its own budget
 * by being blocked.
 */
export function checkRateLimit(
  endpointId: string,
  ipHash: string | null,
  config: RateLimitConfig = rateLimitConfig(),
  now: number = Date.now(),
): RateLimitDecision {
  const { windowMs } = config;

  const endpointKey = `e:${endpointId}`;
  const endpointOk = hit(endpointKey, config.endpoint, windowMs, now);

  let ipOk = true;
  let endpointIpOk = true;
  let ipKey = "";
  let endpointIpKey = "";

  if (ipHash) {
    ipKey = `i:${ipHash}`;
    endpointIpKey = `ei:${endpointId}:${ipHash}`;
    ipOk = hit(ipKey, config.ip, windowMs, now);
    endpointIpOk = hit(endpointIpKey, config.endpointIp, windowMs, now);
  }

  // Narrowest scope first: "you, on this form" is the most useful thing to be
  // told, and the most likely to be the real cause.
  if (!endpointIpOk) {
    return { allowed: false, scope: "endpoint+ip", retryAfter: resetIn(endpointIpKey, now) };
  }
  if (!ipOk) {
    return { allowed: false, scope: "ip", retryAfter: resetIn(ipKey, now) };
  }
  if (!endpointOk) {
    return { allowed: false, scope: "endpoint", retryAfter: resetIn(endpointKey, now) };
  }
  return { allowed: true };
}

export function rateLimitError(decision: RateLimitDecision): IngestError {
  const retryAfter = decision.retryAfter ?? 60;
  const detail =
    decision.scope === "endpoint"
      ? "This endpoint is receiving too many submissions."
      : "Too many submissions from this client.";
  return new IngestError(
    "rate_limited",
    `${detail} Retry in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`,
    { "retry-after": String(retryAfter) },
  );
}

/** Test seam. Nothing in the request path calls this. */
export function resetRateLimits(): void {
  windows.clear();
}
