import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { getWorkspaceAccess, type WorkspaceAccess } from "@/lib/workspaces/queries";

/**
 * The request-shaped wrapper around `./queries.ts`.
 *
 * `queries.ts` is deliberately free of React and Next so the isolation test can
 * load it directly; everything that needs a request — memoisation, `notFound()`,
 * the session — lives here instead.
 */

/**
 * The workspace for the current request, memoised.
 *
 * A layout and the page inside it both call this, and with database sessions
 * each call is a real query. `cache()` collapses them to one per request.
 */
const resolve = cache(async (slug: string, userId: string) =>
  getWorkspaceAccess(slug, userId),
);

/**
 * The workspace for a page, or a 404.
 *
 * Every page under `/app/[slug]` calls this rather than trusting the layout's
 * check. A layout can be bypassed by a future parallel or intercepted route, and
 * "the parent already checked" is how a hole gets opened months later by an edit
 * that looks unrelated. Because it is memoised, insisting on it costs nothing.
 */
export async function requireWorkspace(slug: string): Promise<
  WorkspaceAccess & { userId: string }
> {
  const user = await requireUser();
  const access = await resolve(slug, user.id);
  if (!access) notFound();
  return { ...access, userId: user.id };
}
