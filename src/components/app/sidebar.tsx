"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

import { signOutAction } from "@/actions/auth";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkspaceNav, WorkspaceSwitcher, activeSlugFrom } from "@/components/app/nav";
import type { SessionUser } from "@/lib/auth/session";
import type { WorkspaceSummary } from "@/lib/workspaces/types";
import { cn } from "@/lib/utils";

/**
 * The app's vertical navigation.
 *
 * ## Three states, two mechanisms
 *
 * Below `lg` the sidebar is an off-canvas drawer behind a top bar, because a
 * 248px rail on a 390px screen is most of the screen. That state is React's —
 * it is per-page-view and nobody wants a drawer to still be open tomorrow.
 *
 * At `lg` and up it is a persistent column that collapses to an icon rail. That
 * state is *not* React's. It is a `data-nav` attribute on `<html>`, written by
 * `NavPreferenceScript` before paint from the same localStorage key the button
 * writes — the pattern `ThemeToggle` already uses here. Holding it in React
 * would mean the server rendering "expanded", the client correcting it after
 * hydration, and the whole page jumping 180px on every load for anyone who
 * collapsed it. Everything that changes with the collapse is a
 * `group-data-[nav=collapsed]/app:` variant off that attribute, so it costs
 * nothing at runtime and cannot desync.
 *
 * Consequently the collapse button carries no `aria-expanded`: the server does
 * not know the answer and a confidently wrong one is worse than none. Its label
 * is a pair of `sr-only` spans swapped by the same CSS, so it is always right.
 *
 * ## What is not here
 *
 * The list of destinations. That lives in `WORKSPACE_NAV` in `./nav.tsx`, and
 * adding a section means adding a line to that array — not touching this file.
 */

const NAV_STORAGE_KEY = "app-nav";

/**
 * Runs before the sidebar is parsed, so a collapsed rail is collapsed on the
 * first frame rather than after hydration. Same shape as `ThemeScript`.
 */
const preferenceScript = `(function(){try{var v=localStorage.getItem("${NAV_STORAGE_KEY}");document.documentElement.dataset.nav=v==="collapsed"?"collapsed":"expanded"}catch(e){}})()`;

export function NavPreferenceScript() {
  return <script dangerouslySetInnerHTML={{ __html: preferenceScript }} />;
}

const COLLAPSE_BUTTON_ID = "app-nav-collapse";
const EXPAND_BUTTON_ID = "app-nav-expand";

function toggleCollapsed() {
  const root = document.documentElement;
  const next = root.dataset.nav === "collapsed" ? "expanded" : "collapsed";
  root.dataset.nav = next;
  try {
    localStorage.setItem(NAV_STORAGE_KEY, next);
  } catch {
    // storage blocked; the toggle still works for this page view
  }

  // Each button hides the other, and the one that was just pressed is the one
  // that disappears — which drops focus to <body> and sends the next Tab back
  // to the top of the document. Hand focus to its opposite number instead.
  const successor = next === "collapsed" ? EXPAND_BUTTON_ID : COLLAPSE_BUTTON_ID;
  document.getElementById(successor)?.focus();
}

export function AppSidebar({
  user,
  workspaces,
}: {
  user: SessionUser;
  workspaces: WorkspaceSummary[];
}) {
  const pathname = usePathname();
  const slug = activeSlugFrom(pathname);
  const [open, setOpen] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Navigating is the one thing a drawer is for, so it closes itself when the
  // route changes rather than leaving the page it just loaded behind a scrim.
  // Adjusted during render rather than in an effect: an effect would paint the
  // new page with the drawer still over it, then close it a frame later.
  const [renderedPath, setRenderedPath] = useState(pathname);
  if (pathname !== renderedPath) {
    setRenderedPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      openButton.current?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const active = workspaces.find((workspace) => workspace.slug === slug);

  return (
    <>
      {/* The mobile top bar. `lg:hidden`, so it is not a flex item at all on desktop. */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-sm lg:hidden">
        <button
          ref={openButton}
          type="button"
          onClick={() => setOpen(true)}
          aria-controls="app-sidebar"
          aria-expanded={open}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border-control text-muted-foreground transition-colors hover:bg-sunken hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Menu className="size-4" aria-hidden="true" />
          <span className="sr-only">Open navigation</span>
        </button>
        <LogoMark className="h-6 w-6 shrink-0 text-foreground" />
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {active ? active.name : "Endpoint Forms"}
        </span>
      </header>

      {/*
        The scrim. Rendered only while the drawer is open — a permanently
        mounted `pointer-events-none` overlay is one stacking-context bug away
        from swallowing every click on the page.
      */}
      {open ? (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={cn(
          // Closed on mobile it is `invisible`, not merely translated: an
          // off-screen link is still in the tab order, and tabbing into a
          // sidebar you cannot see is the classic drawer bug.
          "fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col border-r border-border bg-card transition-[transform,width] duration-200 ease-out",
          open ? "translate-x-0" : "invisible -translate-x-full",
          "lg:visible lg:sticky lg:top-0 lg:z-30 lg:h-dvh lg:w-[15.5rem] lg:translate-x-0",
          "lg:group-data-[nav=collapsed]/app:w-[4.5rem]",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 lg:group-data-[nav=collapsed]/app:justify-center lg:group-data-[nav=collapsed]/app:px-0">
          <Link
            href="/app"
            aria-label="Endpoint Forms — your workspaces"
            className="shrink-0 rounded-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <LogoMark className="h-6 w-6" />
          </Link>

          <span className="min-w-0 flex-1 truncate font-mono text-label uppercase text-muted-foreground lg:group-data-[nav=collapsed]/app:hidden">
            Endpoint Forms
          </span>

          {/*
            Two buttons rather than one with a swapped icon, so the label is
            carried by which button exists rather than by React state the server
            cannot know. Both are `lg:` only — the drawer closes instead.
          */}
          <button
            id={COLLAPSE_BUTTON_ID}
            type="button"
            onClick={toggleCollapsed}
            className="hidden size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:inline-flex lg:group-data-[nav=collapsed]/app:hidden"
          >
            <PanelLeftClose className="size-4" aria-hidden="true" />
            <span className="sr-only">Collapse sidebar</span>
          </button>

          <button
            id={EXPAND_BUTTON_ID}
            type="button"
            onClick={toggleCollapsed}
            className="hidden size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:group-data-[nav=collapsed]/app:inline-flex"
          >
            <PanelLeftOpen className="size-4" aria-hidden="true" />
            <span className="sr-only">Expand sidebar</span>
          </button>

          <button
            ref={closeButton}
            type="button"
            onClick={() => {
              setOpen(false);
              openButton.current?.focus();
            }}
            className="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
          >
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Close navigation</span>
          </button>
        </div>

        <div className="shrink-0 px-2 py-3">
          <WorkspaceSwitcher workspaces={workspaces} />
        </div>

        {/*
          `overflow-y-auto` because this list grows: destinations, a builder and
          a yield metric are all queued behind `WORKSPACE_NAV`, and a nav that
          runs off the bottom of a 700px laptop is not a rendering detail.
        */}
        <nav aria-label="Workspace" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {slug ? (
            <WorkspaceNav slug={slug} />
          ) : (
            <p className="px-2.5 py-2 text-sm text-muted-foreground lg:group-data-[nav=collapsed]/app:sr-only">
              Pick a workspace to see its submissions and endpoints.
            </p>
          )}
        </nav>

        <div className="shrink-0 border-t border-border px-3 py-3 lg:group-data-[nav=collapsed]/app:px-2">
          <p
            title={user.email}
            className="truncate text-sm text-muted-foreground lg:group-data-[nav=collapsed]/app:sr-only"
          >
            {user.email}
          </p>

          <div className="mt-2 flex items-center gap-2 lg:group-data-[nav=collapsed]/app:mt-0 lg:group-data-[nav=collapsed]/app:flex-col">
            <ThemeToggle />
            <form
              action={signOutAction}
              className="lg:group-data-[nav=collapsed]/app:flex lg:group-data-[nav=collapsed]/app:justify-center"
            >
              <button
                type="submit"
                title="Sign out"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-2.5 text-sm text-muted-foreground transition-colors hover:border-border-control hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:group-data-[nav=collapsed]/app:size-9 lg:group-data-[nav=collapsed]/app:justify-center lg:group-data-[nav=collapsed]/app:px-0"
              >
                <LogOut className="size-4 shrink-0" aria-hidden="true" />
                <span className="lg:group-data-[nav=collapsed]/app:sr-only">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
