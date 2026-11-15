"use client";

import { useEffect } from "react";

const SELECTOR = "[data-reveal]:not([data-revealed]), [data-reveal-stagger]:not([data-revealed])";

/**
 * Marks `[data-reveal]` and `[data-reveal-stagger]` elements as revealed the
 * first time they scroll into view. CSS in `globals.css` does the animating.
 *
 * Order matters, and is why nothing flashes: anything already on screen is
 * marked revealed *before* `data-reveal-ready` goes on <html>, and only that
 * attribute lets the CSS hide anything. So content that was painted visible
 * stays visible, and only content still below the fold waits for its turn.
 * With JavaScript off this never runs and nothing is ever hidden.
 *
 * Renders nothing. One instance per root layout; a MutationObserver picks up
 * elements that arrive with client-side navigation.
 */
export function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    // "initial" marks content that was already on screen at load. It is shown
    // as painted; nothing inside it replays an entrance after hydration.
    const reveal = (element: Element, how: "" | "initial" = "") =>
      element.setAttribute("data-revealed", how);

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target);
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );

    const watch = (scope: ParentNode) => {
      const viewport = window.innerHeight;
      scope.querySelectorAll(SELECTOR).forEach((element) => {
        const box = element.getBoundingClientRect();
        // Already on screen, or already scrolled past: show it as it is.
        if (box.top < viewport) reveal(element, "initial");
        else io.observe(element);
      });
    };

    watch(document);
    root.setAttribute("data-reveal-ready", "");

    const mo = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            if (node.matches(SELECTOR)) watch(node.parentElement ?? document);
            else watch(node);
          }
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      root.removeAttribute("data-reveal-ready");
    };
  }, []);

  return null;
}
