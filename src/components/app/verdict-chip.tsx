import type { SubmissionVerdict } from "@/lib/workspaces/types";

/**
 * The downstream outcome, as a chip (#43).
 *
 * Built to the same rule as `ProvenanceChip`: **shape, label and colour ship
 * together, always.** Colour alone cannot carry four states accessibly
 * (docs/03-brand.md §8), and `awaiting` is the state most likely to be read at a
 * glance — it is the default, and "142 submissions awaiting verdict" is the line
 * the whole product hangs on. It gets a glyph like the rest.
 *
 * `awaiting` is deliberately quiet rather than a warning colour. A submission
 * with no outcome yet is not a problem; it is the normal state of a lead that
 * arrived this morning.
 */

const glyphs: Record<SubmissionVerdict, React.ReactNode> = {
  // A tick. Something completed.
  won: <path d="M1 5.4 3.8 8.2 9 1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  // A cross. Something closed the other way.
  lost: <path d="M1.6 1.6 8.4 8.4M8.4 1.6 1.6 8.4" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  // A bar. Something ruled out rather than lost.
  disqualified: <path d="M1.4 5h7.2" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  // A hollow ring. Nothing has happened yet, and that is fine.
  awaiting: <circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />,
};

const styles: Record<SubmissionVerdict, string> = {
  won: "border-signal-edge/40 bg-signal/15 text-signal-ink",
  lost: "border-destructive/30 bg-destructive-surface text-destructive",
  disqualified: "border-bot-edge bg-bot-surface text-bot",
  awaiting: "border-border text-muted-foreground",
};

const labels: Record<SubmissionVerdict, string> = {
  won: "Won",
  lost: "Lost",
  disqualified: "Disqualified",
  awaiting: "Awaiting",
};

export function VerdictChip({
  verdict,
  className,
}: {
  verdict: SubmissionVerdict;
  className?: string;
}) {
  return (
    <span
      // Deliberately not cn(): twMerge reads `text-label` as a colour token and
      // drops it beside `text-bot` / `text-destructive`. See src/components/prose.tsx.
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-label uppercase ${styles[verdict]} ${className ?? ""}`}
    >
      <svg viewBox="0 0 10 10" className="size-2.5 shrink-0" aria-hidden="true">
        {glyphs[verdict]}
      </svg>
      {labels[verdict]}
    </span>
  );
}
