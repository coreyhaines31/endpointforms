/**
 * The caps on a single submission, in one place.
 *
 * Every one of these exists so that a hostile or broken client gets a clean,
 * explanatory 4xx instead of a 500 — or instead of a row that Postgres will
 * later refuse. They are deliberately generous: the failure mode we care about
 * is losing a real lead, not accepting a slightly large one.
 */

/**
 * Total request body, in bytes. Read with a streaming cap so an oversized body
 * is abandoned rather than buffered.
 *
 * 1 MiB is far beyond any lead form and still small enough that a submission
 * row stays cheap. Files are not stored (see `body.ts`), so a multipart post
 * with an attachment is measured on the same scale as anything else.
 */
export const MAX_BODY_BYTES = 1_048_576;

/** Distinct field names in one submission. A real form has fewer than 50. */
export const MAX_FIELDS = 250;

/** Characters in a field name. Anything longer is a generated payload, not a form. */
export const MAX_FIELD_NAME_CHARS = 256;

/** Characters in a single field's value. Truncation is never silent — see `body.ts`. */
export const MAX_FIELD_VALUE_CHARS = 65_536;

/** Nesting depth allowed in a JSON body. Guards jsonb against pathological input. */
export const MAX_JSON_DEPTH = 12;

/** Total nodes (scalars, array entries, object entries) in a JSON body. */
export const MAX_JSON_NODES = 5_000;

/**
 * How long an auto-derived idempotency key stays in force, in milliseconds.
 *
 * A plain HTML form sends no key, so a double-click posts twice. We collapse
 * those by deriving a key from the payload and bucketing it by time: two
 * byte-identical submissions inside one window are one lead, and the same
 * payload sent tomorrow is a second one. The window is deliberately short —
 * this fails **open**, keeping a possible duplicate, rather than silently
 * eating a genuine repeat enquiry.
 */
export const AUTO_IDEMPOTENCY_WINDOW_MS = 60_000;

/** An explicit `Idempotency-Key` is echoed into a column; keep it sane. */
export const MAX_IDEMPOTENCY_KEY_CHARS = 255;

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

/**
 * Three windows, each catching a different abuser, all per minute:
 *
 *   - `endpoint`      — one endpoint being hammered, from anywhere.
 *   - `ip`            — one client hammering the whole service.
 *   - `endpointIp`    — the ordinary case, one client on one form.
 *
 * The per-endpoint ceiling is the loosest because a legitimately popular form
 * behind a marketing push is a real thing, and throttling it would be us
 * dropping the leads we exist to protect.
 */
export type RateLimitConfig = {
  windowMs: number;
  endpoint: number;
  ip: number;
  endpointIp: number;
};

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    console.warn(`[ingest] ${name}=${JSON.stringify(raw)} is not a positive integer; using ${fallback}`);
    return fallback;
  }
  return value;
}

export function rateLimitConfig(): RateLimitConfig {
  return {
    windowMs: 60_000,
    endpoint: positiveInt("INGEST_RATE_LIMIT_ENDPOINT_PER_MINUTE", 300),
    ip: positiveInt("INGEST_RATE_LIMIT_IP_PER_MINUTE", 60),
    endpointIp: positiveInt("INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE", 20),
  };
}
