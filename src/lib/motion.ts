/**
 * Motion tokens for the few places JavaScript drives a value frame by frame.
 *
 * CSS owns almost all motion on this site (see the motion block in
 * `src/app/globals.css`); these mirror its custom properties so a tweened
 * number and a CSS bar beside it finish together. Change one, change both.
 */

export const DURATION = {
  press: 120,
  quick: 160,
  base: 220,
  slow: 320,
  enter: 560,
} as const;

/** cubic-bezier(0.77, 0, 0.175, 1), the `--ease-move` curve, as a function. */
export function easeMove(t: number): number {
  return cubicBezier(0.77, 0, 0.175, 1)(t);
}

/** cubic-bezier(0.23, 1, 0.32, 1), the `--ease-enter` curve, as a function. */
export function easeEnter(t: number): number {
  return cubicBezier(0.23, 1, 0.32, 1)(t);
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * A CSS cubic-bezier timing function, solved for y given x by Newton's method
 * with a bisection fallback. Small enough that a dependency is not worth it.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  function solveT(x: number): number {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-5) return t;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (hi - lo > 1e-5) {
      if (sampleX(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  }

  return (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solveT(x)));
}

/**
 * Props for a CSS-only load entrance at a given stagger position. Spread onto
 * any element: `<h1 {...enterStep(1)}>`. See `[data-enter]` in globals.css.
 */
export function enterStep(step: number): {
  "data-enter": "";
  style: React.CSSProperties;
} {
  return { "data-enter": "", style: { "--enter-step": step } as React.CSSProperties };
}
