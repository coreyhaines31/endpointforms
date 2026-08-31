import type { Metadata } from "next";

import { AppBar } from "@/components/app/shell";
import { RootShell } from "@/components/root-shell";
import { FONT_VARIABLES } from "@/lib/fonts";
import "../globals.css";
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
 *
 * It is also a root layout now: it renders its own `<html>` and `<body>` rather
 * than inheriting the marketing site's. It keeps IBM Plex — the dashboard is our
 * own surface and the type is part of it — but not the marketing header, footer
 * or Open Graph, which it used to carry and hide with a client-side path check.
 * See `src/components/root-shell.tsx`.
 */

export const metadata: Metadata = {
  // Nothing in the app belongs in an index. docs/05 §4.4.
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.ico" },
};

/** One tenant's data behind one person's session: never static, never cached. */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspaces = await listWorkspacesForUser(user.id);

  return (
    <RootShell htmlClassName={FONT_VARIABLES}>
      <div className="flex flex-1 flex-col">
        <AppBar user={user} workspaces={workspaces} />
        <main className="flex-1 pb-16">{children}</main>
      </div>
    </RootShell>
  );
}
