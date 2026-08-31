import type { Metadata } from "next";

import { AppBar } from "@/components/app/shell";
import { requireUser } from "@/lib/auth/session";
import { listWorkspacesForUser } from "@/lib/workspaces/queries";

/**
 * The authenticated app.
 *
 * This layout is the boundary. `src/proxy.ts` redirects requests that arrive
 * with no session cookie, but that is a courtesy — `requireUser()` here is what
 * asks the database whether the cookie names a live session, and nothing below
 * this layout renders until it has.
 *
 * The *workspace* is resolved one level down, in `app/[slug]/layout.tsx`, because
 * two routes in here deliberately have no workspace: creating your first one, and
 * accepting an invitation to someone else's.
 */

export const metadata: Metadata = {
  // Nothing in the app belongs in an index. docs/05 §4.4.
  robots: { index: false, follow: false },
};

/** One tenant's data behind one person's session: never static, never cached. */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspaces = await listWorkspacesForUser(user.id);

  return (
    <div className="flex flex-1 flex-col">
      <AppBar user={user} workspaces={workspaces} />
      <main className="flex-1 pb-16">{children}</main>
    </div>
  );
}
