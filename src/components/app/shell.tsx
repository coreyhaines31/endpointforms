import { AppSidebar, NavPreferenceScript } from "@/components/app/sidebar";
import type { SessionUser } from "@/lib/auth/session";
import type { WorkspaceSummary } from "@/lib/workspaces/types";

/**
 * The authenticated app's chrome.
 *
 * A vertical sidebar, not the bar this used to be. The old comment argued that
 * three destinations did not justify a rail; there are five now, with
 * destinations, a builder and a yield metric queued behind them, and a
 * horizontal bar answers "what else is in here?" by running out of room.
 *
 * This component owns only the composition — the sidebar's own behaviour is in
 * `./sidebar.tsx` and the list of destinations is `WORKSPACE_NAV` in `./nav.tsx`.
 *
 * `AppSidebar` is a Client Component and takes `user` and `workspaces` as props;
 * both are plain serialisable rows, and both are already loaded by the layout
 * for the session check, so nothing is fetched twice.
 */
export function AppShell({
  user,
  workspaces,
  children,
}: {
  user: SessionUser;
  workspaces: WorkspaceSummary[];
  children: React.ReactNode;
}) {
  return (
    <>
      <NavPreferenceScript />

      {/*
        First focusable thing on the page. Without it, reaching the content of a
        submission means tabbing past every link in the sidebar, on every page.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:border focus:border-border-control focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:text-foreground"
      >
        Skip to content
      </a>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <AppSidebar user={user} workspaces={workspaces} />
        <main id="main" className="min-w-0 flex-1 pb-16">
          {children}
        </main>
      </div>
    </>
  );
}
