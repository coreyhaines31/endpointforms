import { createHash } from "node:crypto";

/**
 * What we can tell about the caller, and how to answer them.
 *
 * Two questions, both answered from headers alone:
 *
 *   - **Who is this, for rate-limiting purposes?** A hash of the IP, never the
 *     IP. Enough to correlate abuse, not enough to be a liability — the same
 *     rule `docs/21-data-model.md` sets for the `ip_hash` column.
 *   - **How should we answer?** A browser that navigated here expects a
 *     redirect; a `fetch()` expects JSON. Getting this backwards means either a
 *     visitor staring at a JSON blob or a script following a redirect to an
 *     HTML page it cannot read.
 */

/**
 * In header order of trust. On Vercel the platform sets `x-forwarded-for` and
 * strips any client-supplied copy, so the first entry is the real client.
 * Self-hosted behind a proxy, this is only as trustworthy as that proxy — which
 * is why the value is used for rate limiting and correlation, and never for
 * anything that grants access.
 */
const IP_HEADERS = [
  "x-vercel-forwarded-for",
  "x-forwarded-for",
  "cf-connecting-ip",
  "x-real-ip",
] as const;

const DEFAULT_SALT = "endpointforms-ip-hash-v1";

let warnedAboutSalt = false;

function ipSalt(): string {
  const salt = process.env.SUBMISSION_IP_SALT;
  if (salt) return salt;

  if (process.env.NODE_ENV === "production" && !warnedAboutSalt) {
    warnedAboutSalt = true;
    // Not fatal. A weaker hash is a privacy shortfall; refusing to accept the
    // submission would be a lost lead, and this product does not trade one for
    // the other.
    console.warn(
      "[ingest] SUBMISSION_IP_SALT is not set. IP hashes are using the built-in salt and are correlatable across installs.",
    );
  }
  return DEFAULT_SALT;
}

export function clientIp(headers: Headers): string | null {
  for (const header of IP_HEADERS) {
    const value = headers.get(header);
    if (!value) continue;
    const first = value.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}

/** `sha256:<hex>` of a salted IP, matching the format the seed writes. */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const digest = createHash("sha256").update(`${ipSalt()}:${ip}`).digest("hex");
  return `sha256:${digest}`;
}

// ---------------------------------------------------------------------------
// How to answer
// ---------------------------------------------------------------------------

export type ResponseMode = "redirect" | "json";

/**
 * Whether the caller is a browser that navigated here, or a script.
 *
 * `Sec-Fetch-Mode` is the reliable signal and every current browser sends it: a
 * plain `<form method="post">` produces `navigate`, and `fetch()` produces
 * `cors` or `same-origin`. `Accept` is the fallback for the browsers and
 * clients that do not, and an explicit `Accept: application/json` always wins,
 * because a caller naming a type is stating an intent rather than leaking one.
 */
export function responseMode(request: Request): ResponseMode {
  const accept = request.headers.get("accept") ?? "";
  const acceptsJson = /\bapplication\/json\b/i.test(accept);
  const acceptsHtml = /\btext\/html\b/i.test(accept);

  // An explicit, exclusive ask for JSON settles it either way.
  if (acceptsJson && !acceptsHtml) return "json";

  const fetchMode = request.headers.get("sec-fetch-mode");
  if (fetchMode === "navigate") return "redirect";
  if (fetchMode === "cors" || fetchMode === "same-origin" || fetchMode === "no-cors") {
    return "json";
  }

  // No Sec-Fetch-Mode. `Accept: text/html` means a browser rendered this.
  if (acceptsHtml) return "redirect";
  if (acceptsJson) return "json";

  // A bare client with no opinion — curl, a server-to-server post, a test.
  // JSON is the useful answer and the safe one: a redirect it cannot follow
  // looks like a failure.
  return "json";
}
