import { NextResponse, type NextRequest } from "next/server";

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

  // Vanity paths from the apex (docs/05 §4.4). There is no separate signup:
  // the first magic link both creates the account and signs it in.
  if (pathname === "/signup") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const signedIn = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (signedIn) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/app/:path*", "/signup"],
};
