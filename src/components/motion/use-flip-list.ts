"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Slides list items to their new places when the order changes, instead of
 * letting them teleport. FLIP: measure where each item was, let React
 * reorder, then start each moved item at its old offset and transition the
 * offset to zero. Only `translate` animates, so nothing is re-laid-out.
 *
 * Items opt in with `data-flip-id`. Positions come from `offsetTop`, which
 * ignores transforms, so a move during another move starts from layout, not
 * from wherever the last animation had got to. Runs only when the order or
 * the set of ids changes; a card growing taller does not slide its siblings.
 * Skipped entirely under reduced motion.
 */
export function useFlipList<T extends HTMLElement>(order: readonly string[]) {
  const list = useRef<T>(null);
  const positions = useRef(new Map<string, number>());
  const lastOrder = useRef<string>("");

  useLayoutEffect(() => {
    const root = list.current;
    if (!root) return;

    const items = [...root.querySelectorAll<HTMLElement>(":scope > [data-flip-id]")];
    const signature = order.join("|");
    const reordered = lastOrder.current !== "" && lastOrder.current !== signature;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    const moved: HTMLElement[] = [];

    for (const item of items) {
      const id = item.dataset.flipId!;
      const top = item.offsetTop;
      next.set(id, top);
      const before = positions.current.get(id);
      if (!reordered || reduce || before === undefined || before === top) continue;

      // Invert: put it back where it was, with no transition.
      item.style.transition = "none";
      item.style.translate = `0 ${before - top}px`;
      moved.push(item);
    }

    if (moved.length > 0) {
      // One forced layout so the inverted positions are committed, then play.
      void root.offsetHeight;
      for (const item of moved) {
        item.style.transition = "translate var(--dur-base) var(--ease-move)";
        item.style.translate = "";
      }
    }

    positions.current = next;
    lastOrder.current = signature;
  });

  return list;
}
