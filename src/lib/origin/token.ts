import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The browser-set token (#30).
 *
 * A page that rendered in a browser asks for one of these and echoes it back on
 * submit. It proves one narrow thing: *this submission was preceded by a page
 * load from this endpoint, recently*. It is not an identity, it is not a
 * session, and it grants nothing — which is why it can be minted without
 * authentication.
 *
 * ## What it is deliberately not
 *
 * **Not required.** Plenty of real people block JavaScript, and a form that
 * only works with JS is a form that loses leads. Absence scores zero, is
 * recorded as such, and never flips a verdict on its own.
 *
 * **Not single-use.** Enforcing that needs shared state on the write path, and
 * would break the ordinary case of a page that legitimately submits twice. The
 * consequence is honest and documented in `docs/23-origin-findings.md`: anyone
 * who can fetch a token can replay it. Since minting is unauthenticated, this
 * signal raises the cost of forgery by roughly one HTTP request.
 *
 * **Not a secret shared with the visitor.** The HMAC key never leaves the
 * server; the visitor holds an opaque string.
 *
 * Format: `eo1.<endpointPublicId>.<issuedAtBase36>.<nonce>.<signature>`
 * Dots are safe as a separator because every part is `[A-Za-z0-9_-]`.
 */

/** Reserved field names a form can echo the token in. Stripped from `values`. */
export const ORIGIN_TOKEN_FIELD_KEYS = ["_origin_token", "_ef_token"] as const;

/** The header a `fetch()` caller can send it in instead of a field. */
export const ORIGIN_TOKEN_HEADER = "x-origin-token";

/**
 * How long a token stays good. Long, on purpose: a form left open in a
 * background tab for the working day is an ordinary thing, and expiring it
 * would quarantine the most patient visitors.
 */
export const ORIGIN_TOKEN_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Slack for a client clock running fast. Beyond it, the timestamp is invented. */
const CLOCK_SKEW_MS = 60_000;

const VERSION = "eo1";
const PART = /^[A-Za-z0-9_-]{1,64}$/;

const DEFAULT_SECRET = "endpointforms-origin-token-v1";

let warnedAboutSecret = false;

function secret(): string {
  const configured = process.env.ORIGIN_TOKEN_SECRET;
  if (configured) return configured;

  if (process.env.NODE_ENV === "production" && !warnedAboutSecret) {
    warnedAboutSecret = true;
    // Not fatal, and deliberately so. A forgeable token is a weaker signal;
    // refusing the submission would be a lost lead, and this product does not
    // trade one for the other.
    console.warn(
      "[origin] ORIGIN_TOKEN_SECRET is not set. Client tokens use the built-in key and can be forged by anyone reading the source.",
    );
  }
  return DEFAULT_SECRET;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/**
 * A token for one endpoint, valid from now.
 *
 * The nonce exists so two page loads in the same millisecond produce different
 * strings — not for uniqueness enforcement, which we do not do.
 */
export function mintOriginToken(endpointPublicId: string, now: number = Date.now()): string {
  const nonce = randomNonce();
  const body = `${VERSION}.${endpointPublicId}.${now.toString(36)}.${nonce}`;
  return `${body}.${sign(body)}`;
}

function randomNonce(): string {
  // 8 bytes is plenty to separate two loads; this value carries no security.
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export type OriginTokenStatus =
  | "valid"
  | "absent"
  | "malformed"
  | "bad_signature"
  | "expired"
  | "not_yet_valid"
  | "endpoint_mismatch";

export type OriginTokenCheck = {
  status: OriginTokenStatus;
  /** Milliseconds between mint and submit. Null unless the signature checked out. */
  ageMs: number | null;
};

/**
 * Checks a token against the endpoint it was presented to.
 *
 * The signature is verified *before* the endpoint and the age, so a token
 * someone made up cannot be distinguished from one they altered — and the
 * comparison is constant-time, so the failure cannot be walked byte by byte.
 */
export function verifyOriginToken(
  token: string | null | undefined,
  endpointPublicId: string,
  now: number = Date.now(),
): OriginTokenCheck {
  if (!token || token.trim() === "") return { status: "absent", ageMs: null };

  const parts = token.trim().split(".");
  if (parts.length !== 5) return { status: "malformed", ageMs: null };

  const [version, endpoint, issuedAt36, nonce, signature] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (version !== VERSION) return { status: "malformed", ageMs: null };
  if (!PART.test(endpoint) || !PART.test(issuedAt36) || !PART.test(nonce)) {
    return { status: "malformed", ageMs: null };
  }

  const body = `${version}.${endpoint}.${issuedAt36}.${nonce}`;
  if (!signatureMatches(body, signature)) return { status: "bad_signature", ageMs: null };

  const issuedAt = Number.parseInt(issuedAt36, 36);
  if (!Number.isFinite(issuedAt)) return { status: "malformed", ageMs: null };

  // Signature checked out, so the timestamp is ours and the age is meaningful
  // even when the token is rejected for another reason.
  const ageMs = now - issuedAt;

  if (endpoint !== endpointPublicId) return { status: "endpoint_mismatch", ageMs };
  if (ageMs < -CLOCK_SKEW_MS) return { status: "not_yet_valid", ageMs };
  if (ageMs > ORIGIN_TOKEN_MAX_AGE_MS) return { status: "expired", ageMs };

  return { status: "valid", ageMs: Math.max(ageMs, 0) };
}

/**
 * Compares the base64url text rather than the decoded bytes, so a signature
 * re-encoded with different padding fails rather than passing on a technicality.
 * The length check is unavoidable — `timingSafeEqual` throws on a mismatch — and
 * leaks only the length of a value the caller already knows.
 */
function signatureMatches(body: string, presented: string): boolean {
  const expected = Buffer.from(sign(body));
  const candidate = Buffer.from(presented);
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
