/**
 * Which forwarded header, if any, may be believed about who is calling.
 *
 * A forwarded header is a claim made by whoever is upstream. If nothing
 * trustworthy sits in front of the app, that "whoever" is the caller, and the
 * claim is worth nothing — a client can send a different `X-Forwarded-For` on
 * every request and appear as a different person each time.
 *
 * That is not theoretical. Against a local server with no proxy, 25 submissions
 * each carrying a distinct spoofed `X-Forwarded-For` were all accepted, while
 * the identical 25 without the header hit a 429 at request 21. The rate limiter
 * was working; the identity it was given was forged.
 *
 * So the trust is now explicit rather than assumed:
 *
 *   - **On Vercel** (`process.env.VERCEL`) — `x-vercel-forwarded-for` only.
 *     Vercel sets it at the edge and overwrites any client-supplied copy, so it
 *     is the one header here that a caller cannot choose. Its own
 *     `x-forwarded-for` is deliberately *not* consulted.
 *   - **Behind your own proxy** — set `TRUST_PROXY_HEADERS=1` and the usual
 *     chain is believed. Only do this when something you control strips
 *     inbound copies of these headers.
 *   - **Otherwise** — no header is believed and the caller is anonymous.
 *
 * That last case is the important one, and it is a deliberate downgrade rather
 * than a fallback: per-IP limits stop applying and the per-endpoint ceiling is
 * what remains. Losing a limit is bad; keeping one that reports protection it
 * does not have is worse, because nobody goes looking for the hole.
 *
 * None of this ever grants access. The value is used for rate limiting and for
 * a salted hash, never for authorization — which is why the anonymous case is
 * survivable at all.
 */

/** Vercel's own header. A caller cannot set this one; the edge overwrites it. */
const VERCEL_HEADER = "x-vercel-forwarded-for";

/** Believed only when TRUST_PROXY_HEADERS says something upstream sanitises them. */
const PROXY_HEADERS = ["x-forwarded-for", "cf-connecting-ip", "x-real-ip"] as const;

let warned = false;

function trustsProxyHeaders(): boolean {
  const flag = process.env.TRUST_PROXY_HEADERS;
  return flag === "1" || flag === "true";
}

/**
 * The caller's address, or null when nothing here can be believed.
 *
 * Null is a real answer and callers must handle it: it means "we cannot tell
 * these callers apart", not "this is one caller".
 */
export function trustedClientIp(headers: Headers): string | null {
  const first = (name: string): string | null => {
    const value = headers.get(name);
    if (!value) return null;
    const head = value.split(",")[0]?.trim();
    return head ? head : null;
  };

  // On Vercel, only Vercel's header. Reading x-forwarded-for here would
  // reintroduce the spoof, because a caller can send that one.
  if (process.env.VERCEL) return first(VERCEL_HEADER);

  if (trustsProxyHeaders()) {
    for (const header of [VERCEL_HEADER, ...PROXY_HEADERS]) {
      const value = first(header);
      if (value) return value;
    }
    return null;
  }

  // Nothing trustworthy in front. Say so once, loudly enough to be actionable,
  // rather than quietly pretending the per-IP limits are holding.
  if (process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    const offered = [VERCEL_HEADER, ...PROXY_HEADERS].filter((h) => headers.get(h));
    if (offered.length > 0) {
      console.warn(
        `[net] Ignoring ${offered.join(", ")}: TRUST_PROXY_HEADERS is not set, so a caller could forge them. ` +
          "Per-IP rate limits are not in effect. Set TRUST_PROXY_HEADERS=1 only if a proxy you control strips inbound copies.",
      );
    }
  }

  return null;
}
