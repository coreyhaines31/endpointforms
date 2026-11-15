"use client";

import { useEffect, useRef, useState } from "react";
import { DURATION, easeMove, prefersReducedMotion } from "@/lib/motion";

/**
 * A number that travels to its new value instead of jumping to it.
 *
 * Used where the change itself is the information, like the demo's winner
 * flipping when the metric switches. The first render returns `target`
 * unchanged, so server HTML and no-JavaScript visitors see the real figure.
 * Under reduced motion it never tweens.
 */
export function useTweenedNumber(target: number, duration: number = DURATION.slow * 1.5): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = from.current;
    if (start === target) return;

    // Reduced motion lands on the target in the first frame.
    const span = prefersReducedMotion() ? 0 : duration;
    const began = performance.now();
    const tick = (now: number) => {
      const progress = span === 0 ? 1 : Math.min(1, (now - began) / span);
      const next = start + (target - start) * easeMove(progress);
      from.current = next;
      setValue(next);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);

  return value;
}
