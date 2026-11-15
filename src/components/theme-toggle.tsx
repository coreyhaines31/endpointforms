"use client";

import { Moon, Sun } from "lucide-react";

// Which icon shows is decided by CSS, not state — the theme class is already on
// <html> before paint (see theme-script.tsx), so there is nothing to hydrate.
export function ThemeToggle() {
  function apply() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    root.style.colorScheme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // storage blocked; the toggle still works for this page view
    }
  }

  function toggle() {
    // A short crossfade of the whole page instead of every colour snapping at
    // once. Skipped where unsupported or when motion is reduced.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce && typeof document.startViewTransition === "function") {
      document.documentElement.dataset.themeSwitch = "";
      const transition = document.startViewTransition(apply);
      transition.finished.finally(() => {
        delete document.documentElement.dataset.themeSwitch;
      });
    } else {
      apply();
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark theme"
      title="Switch theme"
      className="press relative inline-flex size-9 items-center justify-center rounded-md border border-border-control text-muted-foreground after:absolute after:-inset-1 hover:bg-sunken hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {/* Both icons are always rendered and trade places with a quarter turn,
          so the swap reads as one control changing state. */}
      <Sun
        className="absolute size-4 transition-[opacity,transform] duration-(--dur-slow) ease-enter dark:-rotate-90 dark:scale-50 dark:opacity-0"
        aria-hidden="true"
      />
      <Moon
        className="absolute size-4 rotate-90 scale-50 opacity-0 transition-[opacity,transform] duration-(--dur-slow) ease-enter dark:rotate-0 dark:scale-100 dark:opacity-100"
        aria-hidden="true"
      />
    </button>
  );
}
