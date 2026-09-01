/**
 * The sticky visitor key a Hindsight test assigns against (#45).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A COOKIE, AND DELIBERATELY NOT A FINGERPRINT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `./assign.ts` is a pure function of a test id and a visitor key, so the only
 * thing that has to persist for an assignment to be sticky is the key itself.
 * There were two ways to get one, and the choice is a product decision rather
 * than a technical one:
 *
 * 1. **A random opaque id in a first-party cookie.** What this file does.
 * 2. **A hash of IP address and user-agent.** Rejected. It would have worked,
 *    needed no cookie, and covered every visitor — and it is a fingerprint
 *    whatever it is called. `SUBMISSION_IP_SALT` hashes an address that is
 *    *already being recorded on the submission it belongs to*; using the same
 *    trick to follow somebody across pageviews they have not made yet is a
 *    different act. A product whose whole pitch is honesty about data does not
 *    get to fingerprint visitors to make its split test tidier.
 *
 * The cookie carries no information about the person. It is bytes from a CSPRNG
 * and it means nothing outside the hash in `./assign.ts` — there is no lookup
 * table, no profile, and nothing to join it against.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHO THIS EXCLUDES, AND WHY THAT IS SAID OUT LOUD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A visitor who blocks cookies cannot be given a stable key, so they cannot be
 * stuck to an arm — and rather than fall back to a fingerprint for exactly the
 * people who signalled they did not want one, **they are not enrolled**. They
 * see the endpoint's ordinary active schema, they submit normally, their lead is
 * stored and delivered and counted in Yield like any other, and they are simply
 * not in the test.
 *
 * That is the right behaviour and it is also a real sampling caveat: a Hindsight
 * test measures cookie-accepting visitors, who are not a random sample of all
 * visitors. `./compare.ts` prints that beside the numbers rather than leaving it
 * to be discovered, on the same principle as every other exclusion in this
 * product — a lever nobody can see is the dishonest dashboard we position
 * against.
 */

/**
 * Named to be legible in a browser inspector rather than clever.
 *
 * No `__Host-` prefix: that would require `Path=/` and forbid a domain, and
 * forms render on their own registrable domain (`docs/05` §4) where the cookie
 * is already scoped by origin.
 */
export const VISITOR_COOKIE = "ef_visitor";

/**
 * Twelve weeks.
 *
 * Long enough to outlive a sales cycle, so a visitor who comes back while their
 * first submission is still awaiting a verdict is still counted in the arm that
 * produced it. Short enough that it is not a tracking cookie wearing a split
 * test's clothes — nothing here needs to remember somebody for a year, and a
 * lifetime that long would be asking for a permission the feature does not
 * need.
 */
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 12 * 7 * 24 * 60 * 60;

/** 16 bytes of CSPRNG as URL-safe base64. Opaque, and derived from nothing. */
export function newVisitorKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * The cookie's attributes.
 *
 * `httpOnly` because no script needs to read it and a value scripts cannot
 * reach is one an embedded third-party tag cannot exfiltrate. `sameSite: lax`
 * because a form is frequently arrived at from an ad or an email, and `strict`
 * would mint a fresh key on every one of those arrivals — which is to say it
 * would not be sticky at all for precisely the paid traffic these tests exist
 * to judge.
 */
export function visitorCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
  };
}
