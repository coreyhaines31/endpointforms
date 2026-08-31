"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  LayoutGrid,
  Settings,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";

import type { WorkspaceSummary } from "@/lib/workspaces/types";
import { cn } from "@/lib/utils";

/**
 * Navigation inside the app.
 *
 * Both pieces read the active workspace from the path rather than taking it as a
 * prop. The sidebar is rendered once, in `(app)/layout.tsx`, above the segment
 * that knows which workspace it is — passing the slug down would mean rendering
 * the sidebar separately on every route that has one and every route that
 * doesn't.
 */

/** `/app/{slug}/...` → `{slug}`, or null on `/app`, `/app/new`, `/app/invitations/...`. */
export function activeSlugFrom(pathname: string): string | null {
  const match = /^\/app\/([^/]+)/.exec(pathname);
  if (!match) return null;
  const slug = match[1];
  return slug === "new" || slug === "invitations" ? null : slug;
}

/**
 * One destination inside a workspace.
 *
 * `segment` is appended to `/app/{slug}`; the empty string is the workspace
 * overview. Nothing here holds a full href, because the slug is only known at
 * render time and a list of hrefs would have to be rebuilt per workspace.
 */
export type WorkspaceNavItem = {
  segment: string;
  label: string;
  icon: LucideIcon;
};

/**
 * **The nav. Adding a section is one entry in this array — nothing else.**
 *
 * `WorkspaceNav` below renders every entry, derives the href, and derives the
 * active state from the current path. A new area (destinations, a form builder,
 * a yield metric) needs a route and a line here, in that order. Do not add a
 * link to the sidebar's JSX; if a link does not belong in this array it does not
 * belong in the sidebar.
 *
 * Order is display order, and it is a claim about importance: the inbox is what
 * people open the app for, so it sits above the machinery that feeds it.
 */
export const WORKSPACE_NAV: WorkspaceNavItem[] = [
  { segment: "", label: "Overview", icon: LayoutGrid },
  { segment: "submissions", label: "Submissions", icon: Inbox },
  { segment: "endpoints", label: "Endpoints", icon: Webhook },
  { segment: "members", label: "Members", icon: Users },
  { segment: "settings", label: "Settings", icon: Settings },
];

/**
 * A `<details>` element rather than a scripted menu.
 *
 * It opens, closes on Escape, is keyboard-reachable and works before hydration,
 * which is more than a hand-rolled dropdown usually manages. The cost is that it
 * does not close on an outside click; for a list of workspaces that is a fair
 * trade against a focus trap nobody asked for.
 */
export function WorkspaceSwitcher({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  const pathname = usePathname();
  const activeSlug = activeSlugFrom(pathname);
  const active = workspaces.find((workspace) => workspace.slug === activeSlug);

  if (workspaces.length === 0) {
    return (
      <span className="block truncate px-1 font-mono text-label uppercase text-muted-foreground lg:group-data-[nav=collapsed]/app:sr-only">
        Endpoint Forms
      </span>
    );
  }

  const name = active ? active.name : "Choose a workspace";

  return (
    <details className="relative [&[open]>summary>svg]:rotate-180">
      <summary
        title={name}
        className="flex w-full cursor-pointer list-none items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm font-medium text-foreground hover:border-border-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:group-data-[nav=collapsed]/app:justify-center lg:group-data-[nav=collapsed]/app:px-0"
      >
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded bg-muted font-mono text-[0.6875rem] font-medium uppercase text-foreground"
        >
          {(active ? active.name : "?").charAt(0)}
        </span>
        <span className="min-w-0 flex-1 truncate text-left lg:group-data-[nav=collapsed]/app:sr-only">
          {name}
        </span>
        <svg
          viewBox="0 0 12 12"
          className="size-3 shrink-0 text-muted-foreground transition-transform lg:group-data-[nav=collapsed]/app:hidden"
          aria-hidden="true"
        >
          <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="sr-only">Switch workspace</span>
      </summary>

      <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-border bg-popover p-1 shadow-lg">
        <ul>
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <Link
                href={`/app/${workspace.slug}`}
                aria-current={workspace.slug === activeSlug ? "true" : undefined}
                className={cn(
                  "flex items-baseline justify-between gap-3 rounded-md px-2.5 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  workspace.slug === activeSlug ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="truncate">{workspace.name}</span>
                <span className="shrink-0 font-mono text-label uppercase text-subtle-foreground">
                  {workspace.role}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-1 border-t border-border pt-1">
          <Link
            href="/app/new"
            className="block rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            New workspace
          </Link>
        </div>
      </div>
    </details>
  );
}

/**
 * The destinations inside a workspace, rendered from `WORKSPACE_NAV`.
 *
 * A detail page keeps its section lit. `pathname === href` alone would leave the
 * whole sidebar unlit while reading one submission, which reads as "you have
 * navigated out of the app". The overview is the exception — it is a prefix of
 * everything else, so it only lights on an exact match.
 */
export function WorkspaceNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/app/${slug}`;

  return (
    <ul className="space-y-0.5">
      {WORKSPACE_NAV.map((item) => {
        const href = item.segment ? `${base}/${item.segment}` : base;
        const active = item.segment ? pathname.startsWith(href) : pathname === base;
        const Icon = item.icon;

        return (
          <li key={item.segment || "overview"}>
            <Link
              href={href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                "lg:group-data-[nav=collapsed]/app:justify-center lg:group-data-[nav=collapsed]/app:px-0",
              )}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-foreground"
                />
              ) : null}
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate lg:group-data-[nav=collapsed]/app:sr-only">
                {item.label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
