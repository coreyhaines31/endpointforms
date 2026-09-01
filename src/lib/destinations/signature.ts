import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signing a webhook delivery, and the delivery id a receiver dedupes on.
 *
 * A webhook URL is a public, unauthenticated endpoint on somebody else's
 * server. Without a signature the only thing standing between their CRM and a
 * forged lead is that nobody guessed the URL, and URLs leak — into logs, into
 * screenshots, into a support ticket. So every webhook delivery carries an HMAC
 * over the exact bytes we sent, and the recipe to check it is documented rather
 * than left as an exercise.
 *
 * ## The contract
 *
 * Headers on every webhook request:
 *
 *   x-endpoint-event        submission.created
 *   x-endpoint-delivery-id  dlv_… — stable across retries of the same delivery
 *   x-endpoint-attempt      1, 2, 3 … — increments; the delivery id does not
 *   x-endpoint-timestamp    unix seconds, as a decimal string
 *   x-endpoint-signature    v1=<hex>
 *
 * The signed message is `${timestamp}.${rawBody}` — the timestamp is inside the
 * MAC, not merely beside it, so an attacker cannot replay yesterday's body under
 * today's clock. Verify like this:
 *
 * ```js
 * import { createHmac, timingSafeEqual } from "node:crypto";
 *
 * // The RAW body. Parsing and re-serialising changes the bytes and the MAC.
 * const raw = await readRawBody(req);
 * const ts = req.headers["x-endpoint-timestamp"];
 * const sent = req.headers["x-endpoint-signature"];       // "v1=abc123…"
 *
 * // 1. Reject a stale timestamp before doing anything else.
 * if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return reject();
 *
 * // 2. Recompute over `${ts}.${raw}` with the secret shown when you created
 * //    the destination.
 * const expected = "v1=" + createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
 *
 * // 3. Compare in constant time. `===` on a MAC leaks it a byte at a time.
 * const a = Buffer.from(expected), b = Buffer.from(sent ?? "");
 * if (a.length !== b.length || !timingSafeEqual(a, b)) return reject();
 * ```
 *
 * `v1=` is a version prefix, so a future scheme can be added without every
 * receiver breaking on the day we add it.
 */

export const SIGNATURE_VERSION = "v1";

export const HEADER_EVENT = "x-endpoint-event";
export const HEADER_DELIVERY_ID = "x-endpoint-delivery-id";
export const HEADER_ATTEMPT = "x-endpoint-attempt";
export const HEADER_TIMESTAMP = "x-endpoint-timestamp";
export const HEADER_SIGNATURE = "x-endpoint-signature";

/** How far apart our clock and theirs may be before a signature is stale. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Enough entropy that guessing is not a strategy; short enough to paste. */
export function newDestinationSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/** The exact bytes the MAC covers. Exported so a test cannot get it subtly wrong. */
export function signingMessage(timestampSeconds: number, rawBody: string): string {
  return `${timestampSeconds}.${rawBody}`;
}

export function signPayload(
  secret: string,
  timestampSeconds: number,
  rawBody: string,
): string {
  const mac = createHmac("sha256", secret)
    .update(signingMessage(timestampSeconds, rawBody))
    .digest("hex");
  return `${SIGNATURE_VERSION}=${mac}`;
}

/**
 * The verifier, as a receiver would write it.
 *
 * We are the sender, so nothing in the product calls this — the tests do. It
 * lives here anyway because a documented recipe that has never been executed is
 * a documented guess, and the one in the comment above is this function.
 */
export function verifySignature(options: {
  secret: string;
  rawBody: string;
  signature: string | null | undefined;
  timestamp: string | number | null | undefined;
  /** Unix seconds. Injected so the skew test is not a race against the clock. */
  nowSeconds?: number;
  toleranceSeconds?: number;
}): boolean {
  const { secret, rawBody, signature } = options;
  if (!signature) return false;

  const timestamp = Number(options.timestamp);
  if (!Number.isFinite(timestamp)) return false;

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) return false;

  const expected = Buffer.from(signPayload(secret, timestamp, rawBody), "utf8");
  const received = Buffer.from(signature, "utf8");
  // timingSafeEqual throws on a length mismatch, so the length is checked first
  // — and a length mismatch is not a secret worth protecting.
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

/**
 * The delivery id, derived rather than stored.
 *
 * It has to be **stable across retries** — that is the entire point, because a
 * receiver that already wrote attempt 1 to its CRM must recognise attempt 2 as
 * the same lead and drop it. Deriving it from the pair it identifies makes that
 * true by construction: there is no column that could disagree, and a retry
 * computed on a different machine three hours later produces the same string.
 *
 * Hashed rather than concatenated so it does not leak our internal row ids to
 * whoever runs the receiving endpoint.
 */
export function deliveryIdFor(destinationId: string, submissionId: string): string {
  const digest = createHash("sha256")
    .update(destinationId)
    .update("\n")
    .update(submissionId)
    .digest("base64url")
    .slice(0, 24);
  return `dlv_${digest}`;
}
