/**
 * The caps on one outcome request, in one place.
 *
 * The direction these fail in is the opposite of the ingest path's, and
 * deliberately so. Losing a submission loses a lead that someone paid for;
 * losing an outcome loses a grade on a lead we already have. So where ingest
 * fails open — a doubtful rate limiter lets the submission through — this path
 * can afford to be strict, because the caller is a script that can retry and
 * the data is not gone if it does.
 */

/** A single JSON outcome. Generous for a document with five fields in it. */
export const MAX_JSON_BODY_BYTES = 262_144;

/** A bulk CSV. About 40k rows of realistic width; the row cap bites first. */
export const MAX_CSV_BODY_BYTES = 4_194_304;

/**
 * Rows in one bulk upload.
 *
 * Every row is a `select` and possibly an `update` inside one transaction, so
 * this is the number that decides how long that transaction is open. 5,000 is
 * a spreadsheet a person actually maintains; beyond that the honest answer is
 * to split the file, and the error says so.
 */
export const MAX_ROWS = 5_000;

/** Outcomes in one JSON array body. Lower than CSV: this is the convenience path. */
export const MAX_JSON_ROWS = 500;

/**
 * `verdict_value` is `numeric(18, 2)`, so Postgres would take 16 digits before
 * the point. This refuses a trillion-dollar deal a long way before the column
 * does, because at that magnitude the input is a mis-parsed string — cents read
 * as dollars, or a phone number in the wrong column — far more often than it is
 * a real number.
 */
export const MAX_VALUE = 1_000_000_000_000;

/** Characters in a submission reference. The public id is 16; a UUID is 36. */
export const MAX_REFERENCE_CHARS = 128;

/** How far ahead of now an `occurred_at` may be, in ms. Slack for a fast clock. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

/**
 * Two windows, both per minute:
 *
 *   - `workspace` — one workspace's key, from anywhere. Generous, because a CRM
 *     backfilling a quarter of history through the single-outcome endpoint is a
 *     legitimate and predictable thing for a new customer to do on day one.
 *   - `ip` — one client across all workspaces, which is the shape of a leaked
 *     key being sprayed or a broken retry loop.
 *
 * A bulk upload counts as one request against both, not one per row. The row cap
 * is what bounds a bulk caller.
 */
export type VerdictRateLimitConfig = {
  windowMs: number;
  workspace: number;
  ip: number;
};

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    console.warn(
      `[verdict] ${name}=${JSON.stringify(raw)} is not a positive integer; using ${fallback}`,
    );
    return fallback;
  }
  return value;
}

export function verdictRateLimitConfig(): VerdictRateLimitConfig {
  return {
    windowMs: 60_000,
    workspace: positiveInt("VERDICT_RATE_LIMIT_WORKSPACE_PER_MINUTE", 600),
    ip: positiveInt("VERDICT_RATE_LIMIT_IP_PER_MINUTE", 300),
  };
}
