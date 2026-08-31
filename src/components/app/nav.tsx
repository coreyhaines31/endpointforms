"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { WorkspaceSummary } from "@/lib/workspaces/types";
import { cn } from "@/lib/utils";

/**
 * Navigation inside the app.
 *
 * Both pieces read the active workspace from the path rather than taking it as a
 * prop. The app bar is rendered once, in `(app)/layout.tsx`, above the segment
 * that knows which workspace it is — passing the slug down would mean rendering
 * the bar separately on every route that has one and every route that doesn't.
 */

/** `/app/{slug}/...` → `{slug}`, or null on `/app`, `/app/new`, `/app/invitations/...`. */
function activeSlugFrom(pathname: string): string | null {
  const match = /^\/app\/([^/]+)/.exec(pathname);
  if (!match) return null;
  const slug = match[1];
  return slug === "new" || slug === "invitations" ? null : slug;
}

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
      <span className="font-mono text-label uppercase text-muted-foreground">
        Endpoint Forms
      </span>
    );
  }

  return (
    <details className="relative min-w-0 [&[open]>summary>svg]:rotate-180">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium text-foreground hover:border-border-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="truncate">{active ? active.name : "Choose a workspace"}</span>
        <svg
          viewBox="0 0 12 12"
          className="size-3 shrink-0 text-muted-foreground transition-transform"
          aria-hidden="true"
        >
          <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="sr-only">Switch workspace</span>
      </summary>

      <div className="absolute left-0 z-50 mt-1.5 w-64 rounded-lg border border-border bg-popover p-1 shadow-lg">
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

/** The destinations inside a workspace. */
export function WorkspaceTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/app/${slug}`;

  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/submissions`, label: "Submissions" },
    { href: `${base}/endpoints`, label: "Endpoints" },
    { href: `${base}/members`, label: "Members" },
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <nav aria-label="Workspace" className="border-b border-border">
      <ul className="flex items-center gap-6 overflow-x-auto px-[5%]">
        {tabs.map((tab) => {
          // A detail page keeps its section's tab lit. `pathname === href` alone
          // would leave the whole bar unlit while reading one submission, which
          // reads as "you have navigated out of the app".
          const active =
            tab.href === base ? pathname === base : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px block whitespace-nowrap border-b-2 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
