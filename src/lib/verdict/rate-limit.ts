import { VerdictError } from "./errors.ts";
import { verdictRateLimitConfig, type VerdictRateLimitConfig } from "./limits.ts";

/**
 * Fixed-window counters in process memory, with the same honest limitation as
 * `src/lib/ingest/rate-limit.ts`: they are per-instance, so on a serverless
 * platform the effective ceiling is the configured limit times the number of
 * warm instances. A shared counter is the real answer and belongs with #31.
 *
 * This is a separate implementation rather than a reuse of the ingest limiter
 * because the two are counting different things against different budgets — one
 * keyed on an endpoint and a visitor's IP, this one on a workspace and an API
 * client — and collapsing them would mean a busy form throttling a CRM, or a
 * runaway integration eating a marketing campaign's submission budget.
 */

type Window = { count: number; resetAt: number };

const MAX_TRACKED_KEYS = 20_000;

const windows = new Map<string, Window>();

export type VerdictRateLimitDecision = {
  allowed: boolean;
  scope?: "workspace" | "ip";
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
 * Either window can be checked on its own by passing null for the other, which
 * is how the handler counts an IP *before* it knows which workspace a key names
 * and the workspace *after*, without charging the IP twice for one request.
 *
 * Both windows are counted against even when the first already refused, so a
 * client that keeps hammering stays counted rather than resetting its own
 * budget by being blocked.
 */
export function checkVerdictRateLimit(
  workspaceId: string | null,
  ipHash: string | null,
  config: VerdictRateLimitConfig = verdictRateLimitConfig(),
  now: number = Date.now(),
): VerdictRateLimitDecision {
  const { windowMs } = config;

  let workspaceOk = true;
  let workspaceKey = "";
  if (workspaceId) {
    workspaceKey = `w:${workspaceId}`;
    workspaceOk = hit(workspaceKey, config.workspace, windowMs, now);
  }

  let ipOk = true;
  let ipKey = "";
  if (ipHash) {
    ipKey = `i:${ipHash}`;
    ipOk = hit(ipKey, config.ip, windowMs, now);
  }

  if (!workspaceOk) {
    return { allowed: false, scope: "workspace", retryAfter: resetIn(workspaceKey, now) };
  }
  if (!ipOk) {
    return { allowed: false, scope: "ip", retryAfter: resetIn(ipKey, now) };
  }
  return { allowed: true };
}

export function verdictRateLimitError(decision: VerdictRateLimitDecision): VerdictError {
  const retryAfter = decision.retryAfter ?? 60;
  const detail =
    decision.scope === "workspace"
      ? "This workspace is posting outcomes faster than the limit."
      : "Too many outcome requests from this client.";
  return new VerdictError(
    "rate_limited",
    `${detail} Retry in ${retryAfter} second${retryAfter === 1 ? "" : "s"}. Nothing was recorded. To grade many submissions at once, post a CSV instead of one request per row.`,
    { "retry-after": String(retryAfter) },
  );
}

/** Test seam. Nothing in the request path calls this. */
export function resetVerdictRateLimits(): void {
  windows.clear();
}
