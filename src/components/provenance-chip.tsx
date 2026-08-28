export type Origin = "human" | "agent" | "unverified";

// Shape, label and colour ship together — always. Colour alone cannot carry three
// states accessibly (docs/03-brand.md §8), so there is deliberately no bare-dot variant.
const glyphs: Record<Origin, React.ReactNode> = {
  human: <circle cx="5" cy="5" r="4" />,
  agent: <path d="M5 0.6 9.4 5 5 9.4 0.6 5Z" />,
  unverified: <path d="M5 0.8 9.5 9.2H0.5Z" />,
};

const styles: Record<Origin, string> = {
  human: "border-human-edge bg-human-surface text-human",
  agent: "border-agent-edge bg-agent-surface text-agent",
  unverified: "border-bot-edge bg-bot-surface text-bot",
};

const labels: Record<Origin, string> = {
  human: "Human",
  agent: "Agent",
  unverified: "Unverified",
};

type ProvenanceChipProps = {
  origin: Origin;
  className?: string;
};

export function ProvenanceChip({ origin, className }: ProvenanceChipProps) {
  return (
    <span
      // Deliberately not cn(): twMerge classifies `text-label` as a colour and
      // drops it next to `text-human` / `text-agent` / `text-bot`, which is how
      // the stamp loses its size. See src/components/prose.tsx.
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-label uppercase ${styles[origin]} ${className ?? ""}`}
    >
      <svg viewBox="0 0 10 10" className="size-2.5 shrink-0 fill-current" aria-hidden="true">
        {glyphs[origin]}
      </svg>
      {labels[origin]}
    </span>
  );
}
