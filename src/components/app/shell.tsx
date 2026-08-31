import Link from "next/link";

import { signOutAction } from "@/actions/auth";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkspaceSwitcher } from "@/components/app/nav";
import type { SessionUser } from "@/lib/auth/session";
import type { WorkspaceSummary } from "@/lib/workspaces/types";

/**
 * The authenticated app's chrome.
 *
 * Deliberately one narrow bar rather than a sidebar. There are three
 * destinations inside a workspace; a 240px navigation rail to hold three links
 * would spend the screen on itself.
 */
export function AppBar({
  user,
  workspaces,
}: {
  user: SessionUser;
  workspaces: WorkspaceSummary[];
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-sm">
      <div className="flex h-14 items-center gap-3 px-[5%]">
        <Link
          href="/app"
          aria-label="Endpoint Forms — your workspaces"
          className="shrink-0 rounded-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <LogoMark className="h-6 w-6" />
        </Link>

        <WorkspaceSwitcher workspaces={workspaces} />

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden max-w-[24ch] truncate text-sm text-muted-foreground sm:block">
            {user.email}
          </span>
          <ThemeToggle />
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border-control hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
