/**
 * The waitlist, as an Endpoint form (#33, #24).
 *
 * ## Why the browser posts this, and not our server
 *
 * The obvious implementation is for the server action to forward the signup.
 * It would work, and it would destroy the only reason `CLAUDE.md` wants this
 * built early. **Risk 1** in `docs/01-positioning.md` — that provenance may not
 * actually distinguish a bot from a human — is the highest-severity risk in the
 * position, and `docs/23-origin-findings.md` has already confirmed it broken in
 * one direction: `curl` with copied Chrome headers is stamped Human.
 *
 * We want our own public site, which draws real humans and real bots, to be the
 * thing that tells us how bad that is. If every signup arrives from one Vercel
 * IP with one set of headers, every stamp is identical and we learn nothing.
 * So the **visitor's browser** posts to the endpoint, which is also exactly how
 * a customer's embedded form works. We are the first customer or we are not
 * dogfooding.
 *
 * ## The two channels, and why one of them is labelled
 *
 * | channel | who sent the HTTP request | expected stamp |
 * |---|---|---|
 * | `browser` | the visitor's browser, cross-origin, with a minted token | Human |
 * | `server-forward` | our server action, for a visitor with no JavaScript | Unverified |
 *
 * `channel` is a **payload field**, which means anyone posting to the public
 * endpoint can write whatever they like in it — it is a note to ourselves about
 * which of our own paths ran, not evidence. The stamp beside it in
 * `submissions.origin` is the part the caller cannot set, and that is the point
 * of the whole mechanism. The server-forward path deliberately sends no origin
 * token and no `Origin` header: inventing a way for a server to look like a
 * browser session is precisely the forgery this product claims to notice.
 */

/**
 * Where a signup goes, and the only place one ever goes. Empty means not
 * configured, and the sink refuses honestly — which is exactly today's
 * production behaviour, so a missing or wrong value here can never be worse
 * than shipping nothing. Nothing catches what this misses, by design: see
 * `src/lib/waitlist-store.ts`.
 *
 * Read as a literal `process.env.NEXT_PUBLIC_*` member expression because that
 * is what Next replaces at build time; destructuring it would leave `undefined`
 * in the browser bundle.
 */
export const WAITLIST_ENDPOINT_URL = process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT_URL ?? "";

/** Which of our two paths carried the signup. Descriptive, never trusted. */
export type WaitlistChannel = "browser" | "server-forward";

/** The reserved field the page echoes its minted token back in (`src/lib/origin/token.ts`). */
const ORIGIN_TOKEN_FIELD = "_origin_token";

/**
 * What a page knows about where the signup came from.
 *
 * `page` is a pathname only — never the query string, which can carry things a
 * visitor did not mean to hand us. `tool` names the calculator when the signup
 * came from one of the eight `/tools` pages.
 */
export type WaitlistContext = {
  page?: string | null;
  tool?: string | null;
};

/** Long enough for any real path, short enough that nobody can stuff the column. */
const MAX_CONTEXT_CHARS = 200;

/** What the visitor is told once the address is actually written down somewhere. */
export const WAITLIST_SUCCESS =
  "You’re on the list. We’ll email you when there’s something to look at.";

/**
 * The body both paths post, so the two of them cannot drift into writing
 * different field names into the same inbox.
 *
 * `application/x-www-form-urlencoded` rather than JSON on purpose: from a
 * browser it is a CORS-safelisted content type, so the signup is a simple
 * request with no preflight — one round trip, and the same shape a plain
 * `<form>` on a customer's site would produce.
 */
export function buildWaitlistBody(input: {
  email: string;
  channel: WaitlistChannel;
  context?: WaitlistContext;
  token?: string | null;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set("email", input.email);
  body.set("channel", input.channel);

  const page = clean(input.context?.page);
  if (page) body.set("page", page);

  const tool = clean(input.context?.tool);
  if (tool) body.set("tool", tool);

  const token = clean(input.token);
  if (token) body.set(ORIGIN_TOKEN_FIELD, token);

  return body;
}

/**
 * Where the page asks for its origin token — the same endpoint, one segment on.
 *
 * Null when the endpoint URL is absent or unparseable, which the caller treats
 * as "submit without a token". Absence scores zero by design: real people block
 * JavaScript, and a form that only works with it is a form that loses leads.
 */
export function waitlistTokenUrl(endpointUrl: string): string | null {
  const base = clean(endpointUrl);
  if (!base) return null;
  try {
    const url = new URL(base);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/token`;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Whether the endpoint said it stored the submission.
 *
 * Deliberately strict: anything that is not an explicit `ok: true` is treated
 * as a failure, so the caller falls through to the next sink rather than
 * telling somebody they are on a list they are not on.
 */
export function acknowledged(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { ok?: unknown }).ok === true
  );
}

/** A pathname from a Referer, for the no-JavaScript path. Null when there isn't one. */
export function pathnameOf(referer: string | null | undefined): string | null {
  const value = clean(referer);
  if (!value) return null;
  try {
    return clean(new URL(value).pathname);
  } catch {
    return null;
  }
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, MAX_CONTEXT_CHARS);
}
