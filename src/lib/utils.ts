import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The project's own font-size tokens, from the `--text-*` custom properties in
 * `globals.css`. Anything defined there must be listed here.
 *
 * tailwind-merge resolves conflicts from a built-in table of class groups. It
 * has never heard of `text-label` or `text-h3`, and its fallback for an unknown
 * `text-*` class is to treat it as a **text colour** — so putting one beside a
 * real colour made the size vanish:
 *
 *   cn("font-mono text-label uppercase", "text-muted-foreground")
 *     -> "font-mono uppercase text-muted-foreground"      // text-label gone
 *
 * Silently, at runtime, only when both classes met in the same `cn()` call. The
 * element still rendered, one size too big, which is exactly the kind of defect
 * that survives review and gets noticed in a screenshot weeks later. It was
 * found and fixed five separate times in this codebase — in `prose`, `readout`,
 * `ProvenanceChip`, `Th` and `StatusChip` — each time as a local workaround,
 * because each looked like a one-off.
 *
 * Registering the tokens as font sizes fixes every present and future site at
 * once: `text-label` now conflicts with `text-h3` (correct) and not with
 * `text-muted-foreground` (also correct).
 */
const FONT_SIZE_TOKENS = [
  "display",
  "h2",
  "h3",
  "h4",
  "lead",
  "label",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": FONT_SIZE_TOKENS.map((token) => `text-${token}`),
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { FONT_SIZE_TOKENS };
