import type { SpamState } from "@/lib/spam/types";

/**
 * The spam mark (#31).
 *
 * Built to the same rule as `ProvenanceChip` and `VerdictChip`: **shape, label
 * and colour ship together, always** (docs/03-brand.md §8).
 *
 * Two things it does differently, both deliberate:
 *
 * 1. **`clear` renders nothing.** The overwhelming majority of submissions are
 *    clear, and a green "not spam" chip on every row is noise that trains
 *    people to stop reading the chips that matter. Absence is the signal.
 * 2. **The wording is "Flagged", not "Spam".** The score is an observation, and
 *    a submission that has not been read by a person has not been judged by
 *    one. "Spam" appears only on `confirmed_spam`, where a human said it.
 */

const glyphs: Record<Exclude<SpamState, "clear">, React.ReactNode> = {
  // A flag on a pole. Two elements rather than one path: the pole is a stroke
  // and the pennant is a fill, and a single path cannot be both — drawn as one
  // it rendered as a small unreadable blob beside the triangle and dash.
  flagged: (
    <>
      <path d="M2 0.7v8.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3.3 1.1h5.5L7.2 3.3l1.6 2.2H3.3Z" fill="currentColor" stroke="none" />
    </>
  ),
  // A tick. A person looked and said no.
  not_spam: (
    <path d="M1 5.4 3.8 8.2 9 1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
  ),
  // A cross. A person looked and said yes.
  confirmed_spam: (
    <path d="M1.6 1.6 8.4 8.4M8.4 1.6 1.6 8.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
  ),
};

const styles: Record<Exclude<SpamState, "clear">, string> = {
  flagged: "border-bot-edge bg-bot-surface text-bot",
  not_spam: "border-border text-muted-foreground",
  confirmed_spam: "border-destructive/30 bg-destructive-surface text-destructive",
};

const labels: Record<Exclude<SpamState, "clear">, string> = {
  flagged: "Flagged",
  not_spam: "Not spam",
  confirmed_spam: "Spam",
};

export function SpamChip({
  state,
  score,
  className,
}: {
  state: SpamState;
  /** Shown on `flagged` only — a number nobody can act on is decoration. */
  score?: number;
  className?: string;
}) {
  if (state === "clear") return null;

  return (
    <span
      // Deliberately not cn(): twMerge reads `text-label` as a colour token and
      // drops it beside `text-bot` / `text-destructive`. See src/components/prose.tsx.
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-label uppercase ${styles[state]} ${className ?? ""}`}
    >
      <svg viewBox="0 0 10 10" className="size-2.5 shrink-0" aria-hidden="true">
        {glyphs[state]}
      </svg>
      {labels[state]}
      {state === "flagged" && typeof score === "number" ? (
        <span className="opacity-70">{score}</span>
      ) : null}
    </span>
  );
}
