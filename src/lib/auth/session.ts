import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

/**
 * The session, on the server.
 *
 * `src/proxy.ts` bounces requests that arrive with no session cookie, but that
 * is a convenience, not the boundary: a cookie's *presence* proves nothing about
 * whether it names a live session. Authorisation happens here and in
 * `getWorkspaceAccess`, both of which ask the database.
 */

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

/**
 * `cache()` because a layout and the page inside it both want the user, and a
 * database session means each call is a real query. One per request.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  };
});

/**
 * The signed-in user, or a redirect to sign in.
 *
 * `next` carries where they were going so the sign-in lands them back there —
 * an invitation link is the case that matters, since it arrives cold from an
 * email and losing it means asking the inviter to send another.
 */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await currentUser();
  if (user) return user;

  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}
