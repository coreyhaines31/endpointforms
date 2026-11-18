/**
 * Motion helpers for components. CSS owns the motion itself (the motion block
 * in `src/app/globals.css`, and `src/app/(site)/motion.css` for the marketing
 * site); `DURATION` mirrors its custom properties for the rare timer that has
 * to agree with a transition. Change one, change both.
 */

export const DURATION = {
  press: 120,
  quick: 160,
  base: 220,
  slow: 320,
  enter: 560,
} as const;

/**
 * Props for a CSS-only load entrance at a given stagger position. Spread onto
 * any element: `<h1 {...enterStep(1)}>`. See `[data-enter]` in `src/app/(site)/motion.css`.
 */
export function enterStep(step: number): {
  "data-enter": "";
  style: React.CSSProperties;
} {
  return { "data-enter": "", style: { "--enter-step": step } as React.CSSProperties };
}
