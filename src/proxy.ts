import { NextResponse, type NextRequest } from "next/server";

import { readVisitorKey } from "@/lib/hindsight/assign";
import {
  newVisitorKey,
  VISITOR_COOKIE,
  visitorCookieOptions,
} from "@/lib/hindsight/visitor";

/**
 * Route protection for the authenticated app.
 *
 * **This file was `middleware.ts` in the brief.** Next.js 16 deprecated that
 * convention and renamed it to `proxy.ts` — same position in the request
 * lifecycle, same `config.matcher`, only the file and export names changed. Host
 * routing for the render domain belongs here when it arrives.
 *
 * ## What this is, and what it is not
 *
 * It is a redirect for the common case: someone with no session cookie clicking
 * a bookmark. It sends them to `/login` with where they were going, instead of
 * letting them watch a dashboard shell render and then bounce.
 *
 * It is **not** the authorisation boundary, and must never be treated as one. A
 * cookie's presence says nothing about whether it names a live session, and
 * nothing at all about which workspace its owner may read. Next's own guidance
 * agrees: proxy is for optimistic checks, not session management. The real
 * checks are `requireUser()` in `src/app/(app)/layout.tsx` and
 * `getWorkspaceAccess()` on every workspace route — both of which ask the
 * database, and both of which run whatever this file decides.
 *
 * Kept deliberately small for that reason: logic that looks like security but
 * runs before the database is the kind that gets trusted by mistake.
 */

/** Auth.js's session cookie. `__Secure-` prefixed once cookies are secure. */
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Hosted forms (#45). Nothing here is a security decision — it mints an
  // opaque id so a visitor sees the same variant on their second visit as on
  // their first, and it exists in this file only because a Server Component
  // cannot set a cookie. See `src/lib/hindsight/visitor.ts` for why this is a
  // random value rather than a fingerprint, and who it deliberately excludes.
  if (pathname.startsWith("/f/")) return withVisitorCookie(request);

  const signedIn = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (signedIn) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

/**
 * Gives a form visitor a stable key, once.
 *
 * Deliberately only mints when there is nothing usable there already: rewriting
 * the cookie on every request would reset the expiry forever, which turns a
 * twelve-week cookie into a permanent one, and would also hand a fresh key to
 * anyone whose existing one we merely failed to parse — silently re-randomising
 * their arm mid-test.
 *
 * A visitor whose browser drops it simply arrives without one next time and is
 * not enrolled. That is the intended behaviour, not a failure to handle.
 */
function withVisitorCookie(request: NextRequest) {
  const existing = readVisitorKey(request.cookies.get(VISITOR_COOKIE)?.value);
  if (existing) return NextResponse.next();

  const key = newVisitorKey();

  // Set on the **request** as well as the response, and forwarded with
  // `next({ request })`.
  //
  // Without this the page rendering *this* request still sees no cookie — it
  // only arrives with the response, so the browser has it from the second
  // pageview onwards. Every visitor's first view of a form would therefore be
  // unenrolled, which is not a rounding error: for a form most people see
  // exactly once, it is nearly the whole audience, and the exposure counted at
  // render would never match the arm their submission was attributed to.
  request.cookies.set(VISITOR_COOKIE, key);

  const response = NextResponse.next({ request });
  response.cookies.set(
    VISITOR_COOKIE,
    key,
    visitorCookieOptions(request.nextUrl.protocol === "https:"),
  );
  return response;
}

/**
 * `/app` and `/f`, and nothing else.
 *
 * `/signup` used to be matched here so it could 308 to `/login` — there was no
 * separate sign-up when the first magic link both created the account and
 * signed it in. It is a real page now (`src/app/(auth)/signup`), and it has to
 * be reachable without a session, which is the one thing this file exists to
 * prevent.
 *
 * `/f` was added for Hindsight (#45), and the narrowness is the point: the
 * per-request cost of minting a visitor cookie is paid by hosted form routes
 * only. The marketing site, the ingest endpoint at `/e/:id` and the MCP surface
 * are all untouched, and none of them renders a variant.
 */
export const config = {
  matcher: ["/app/:path*", "/f/:path*"],
};
