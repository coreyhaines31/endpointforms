import { RETRYABLE_FAILURES, type FailureKind } from "./types.ts";

/**
 * When to try again, and when to stop.
 *
 * The schedule below is not "exponential backoff" as a slogan — each step is
 * chosen against what actually goes wrong with a lead destination:
 *
 *   30s   a deploy, a pod restart, a momentary 502. Most failures end here.
 *   2m    a rolling restart, or a rate limit with a short window.
 *   10m   a database failover, an expired cache of a certificate.
 *   1h    a real outage. If this one fails, a human has to look.
 *
 * Four retries after the first attempt, so five rows in `delivery_attempts` at
 * most. The table's comment is explicit that retries **append** rather than
 * overwrite, and the whole delivery log is worthless if the failed attempt that
 * explains the outage has been overwritten by the one that finally worked.
 *
 * Jitter is applied because everything that failed failed at once — a webhook
 * receiver that fell over under load and gets every retry back in the same
 * millisecond falls over again, and we caused it.
 *
 * Some failures are not retried at all. A 401 will be a 401 in an hour; retrying
 * it four times turns one alert into five and delays the moment the customer
 * finds out their token expired, which is the moment #42 exists to bring
 * forward.
 */

/** Including the first. Five rows per delivery, worst case. */
export const MAX_ATTEMPTS = 5;

/** Milliseconds to wait before attempt N+1, indexed by the attempt that failed. */
export const RETRY_SCHEDULE_MS: readonly number[] = [
  30_000, // after attempt 1
  120_000, // after attempt 2
  600_000, // after attempt 3
  3_600_000, // after attempt 4
];

/** ±20%, so a fleet of failed deliveries does not return as a thundering herd. */
export const RETRY_JITTER = 0.2;

export type RetryDecision = {
  willRetry: boolean;
  /** Null when this was the last attempt, or when the failure is not retryable. */
  nextRetryAt: Date | null;
  /** Plain English, for the delivery log. Always set. */
  reason: string;
};

/**
 * Whether to schedule another attempt, and when.
 *
 * `random` is injected so a test asserts an exact delay rather than a range,
 * and so the jitter is provably inside the band rather than assumed to be.
 */
export function decideRetry(options: {
  attempt: number;
  failure: FailureKind | null;
  now?: Date;
  random?: () => number;
}): RetryDecision {
  const { attempt, failure } = options;
  const now = options.now ?? new Date();

  if (failure !== null && !RETRYABLE_FAILURES.has(failure)) {
    return {
      willRetry: false,
      nextRetryAt: null,
      reason: NOT_RETRYABLE[failure] ?? "This failure will not fix itself, so it was not retried.",
    };
  }

  if (attempt >= MAX_ATTEMPTS) {
    return {
      willRetry: false,
      nextRetryAt: null,
      reason: `Gave up after ${MAX_ATTEMPTS} attempts. Fix the destination and redeliver — nothing was thrown away.`,
    };
  }

  const delay = backoffMs(attempt, options.random);
  return {
    willRetry: true,
    nextRetryAt: new Date(now.getTime() + delay),
    reason: `Retrying in ${describeDelay(delay)}.`,
  };
}

/**
 * The delay before attempt `attempt + 1`, jittered.
 *
 * Clamped to the last step for any attempt past the end of the schedule, so a
 * larger `MAX_ATTEMPTS` later cannot read past the array and return `NaN`.
 */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const index = Math.min(Math.max(attempt, 1), RETRY_SCHEDULE_MS.length) - 1;
  const base = RETRY_SCHEDULE_MS[index];
  const factor = 1 + (random() * 2 - 1) * RETRY_JITTER;
  return Math.round(base * factor);
}

/**
 * Why a failure of this kind is not worth trying again.
 *
 * Appended to `describeFailure`'s sentence in the delivery log, so these are
 * written as the **second half** of a paragraph and must not repeat it. An
 * error string that says "replace it, then redeliver" twice reads as generated
 * text, and generated text is the thing people skim past.
 */
const NOT_RETRYABLE: Partial<Record<FailureKind, string>> = {
  auth: "Not retried — an hour would not change the answer.",
  rejected: "Not retried — the same bytes would be refused again.",
  missing: "Not retried — there is nothing at that URL to retry against.",
  configuration: "Fix its settings, then send it again from this log.",
};

function describeDelay(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

// ---------------------------------------------------------------------------
// Classification (#42)
// ---------------------------------------------------------------------------

/**
 * An HTTP status, as a failure kind.
 *
 * "It failed" is not actionable. This is the first half of making it so; the
 * second half is `describeFailure` below, which turns the kind into the
 * sentence a customer reads.
 */
export function classifyStatus(status: number): FailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404 || status === 410) return "missing";
  if (status === 408) return "network";
  if (status === 429) return "throttled";
  if (status >= 400 && status < 500) return "rejected";
  if (status >= 500) return "target_down";
  return "unknown";
}

/**
 * A thrown error from `fetch`, as a failure kind. There is no response to read.
 *
 * **The `cause` chain is walked, and that is not defensive coding.** Node's
 * `fetch` throws a bare `TypeError: fetch failed` for *every* transport
 * problem — DNS, refused connection, expired certificate — and puts the real
 * reason in `error.cause`. Matching only on the top-level message classified a
 * dead hostname as `unknown`, which the UI then reported as "failed for a reason
 * we could not classify" while the cause underneath said `ENOTFOUND`. That was
 * caught by pressing the button and reading the screen, not by a unit test,
 * which is why both now exist.
 */
export function classifyTransportError(error: unknown): FailureKind {
  const message = describeError(error);
  if (/abort|timed? ?out|ETIMEDOUT|UND_ERR_(CONNECT_TIMEOUT|HEADERS_TIMEOUT)/i.test(message)) {
    return "network";
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|dns/i.test(message)) return "network";
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE|socket/i.test(message)) {
    return "network";
  }
  if (/certificate|TLS|SSL|self.signed|ERR_TLS/i.test(message)) return "network";
  // Undici's catch-all. By this point every transport failure has been ruled in
  // above or is one we have not named, and all of them are still the network.
  if (/fetch failed/i.test(message)) return "network";
  return "unknown";
}

/** An error and everything it was caused by, flattened into one string. */
function describeError(error: unknown, depth = 0): string {
  if (depth > 4 || error === null || error === undefined) return "";
  if (!(error instanceof Error)) return String(error);

  const own = `${error.name}: ${error.message}`;
  // `code` is where Node puts ENOTFOUND and friends. Sometimes it is also in
  // the message — `getaddrinfo ENOTFOUND host` — and appending it again reads
  // as a bug in our error handling rather than as information.
  const raw = "code" in error && typeof error.code === "string" ? error.code : "";
  const code = raw !== "" && !own.includes(raw) ? ` ${raw}` : "";
  const cause = "cause" in error ? describeError(error.cause, depth + 1) : "";
  return `${own}${code} ${cause}`.trim();
}

/**
 * The transport detail worth putting in the delivery log.
 *
 * `fetch failed` on its own tells the person reading it nothing, so the cause
 * underneath is what gets shown.
 */
export function transportDetail(error: unknown): string {
  const full = describeError(error);
  return full === "" ? "no further detail" : full;
}

/**
 * The sentence shown beside a failed delivery.
 *
 * Written for the person who has to fix it, and it names the thing to go and
 * look at. `docs/00-positioning-spine.md` calls the enemy "the dashboard that
 * says everything is fine"; a delivery log that says "error" is the same
 * dashboard with a red pixel on it.
 */
export function describeFailure(failure: FailureKind, destinationName: string): string {
  switch (failure) {
    case "auth":
      return `${destinationName} rejected our credentials. A token or key has expired or been revoked — replace it, then redeliver.`;
    case "rejected":
      return `${destinationName} refused the payload. It is reachable and authenticated, so this is the shape of the data, not the connection.`;
    case "missing":
      return `${destinationName}’s URL returned "not found". It has moved or been deleted.`;
    case "throttled":
      return `${destinationName} is rate limiting us. Retrying with a longer gap.`;
    case "target_down":
      return `${destinationName} returned a server error. Their end, not ours — retrying.`;
    case "network":
      return `${destinationName} could not be reached at all: no response, a refused connection, or a timeout.`;
    case "configuration":
      return `${destinationName} is missing something it needs before it can deliver. Nothing was sent.`;
    default:
      return `${destinationName} failed for a reason we could not classify. The response is below.`;
  }
}
