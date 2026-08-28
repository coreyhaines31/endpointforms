import { MockupPanel } from "@/components/mockup/frame";
import { ProvenanceChip, type Origin } from "@/components/provenance-chip";

/**
 * Three compact panels, one per homepage pillar. They sit under one shared
 * caption in the pillars section, and each still carries its own Illustration
 * stamp — see the note at the top of frame.tsx.
 */

/* 1 — Origin. Which door it came through is the stamp. */

const doors: { origin: Origin; door: string }[] = [
  { origin: "human", door: "Human page" },
  { origin: "agent", door: "Manifest" },
  { origin: "unverified", door: "Human page, acting like software" },
];

export function OriginPanel() {
  return (
    <MockupPanel title="Origin">
      <dl className="px-4 py-2">
        {doors.map((row) => (
          <div
            key={row.origin}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-3 last:border-b-0"
          >
            <dt className="shrink-0">
              <ProvenanceChip origin={row.origin} />
            </dt>
            <dd className="text-sm text-muted-foreground">
              <span className="font-mono text-muted-foreground" aria-hidden="true">
                ←{" "}
              </span>
              {row.door}
            </dd>
          </div>
        ))}
      </dl>
    </MockupPanel>
  );
}

/* 2 — Verdict. What 90 submissions turned out to be. */

const verdicts = [
  { label: "Awaiting verdict", count: 61, swatch: "bg-muted", ratio: 61 / 90 },
  { label: "Won", count: 9, swatch: "signal-fill", ratio: 9 / 90 },
  { label: "Lost", count: 14, swatch: "bg-border-strong", ratio: 14 / 90 },
  { label: "Disqualified", count: 6, swatch: "bg-muted-foreground", ratio: 6 / 90 },
];

export function VerdictPanel() {
  return (
    <MockupPanel title="Verdict">
      <div className="px-4 py-4">
        <div aria-hidden="true" className="flex h-3 w-full border border-border">
          {verdicts.map((slice) => (
            <span
              key={slice.label}
              className={`${slice.swatch} block border-r border-border last:border-r-0`}
              style={{ width: `${slice.ratio * 100}%` }}
            />
          ))}
        </div>
        <dl className="mt-4">
          {verdicts.map((slice) => (
            <div
              key={slice.label}
              className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
            >
              <dt className="flex items-center gap-2 text-sm text-foreground">
                <span
                  aria-hidden="true"
                  className={`${slice.swatch} size-2.5 shrink-0 border border-border`}
                />
                {slice.label}
              </dt>
              <dd className="font-mono text-sm tabular text-foreground">{slice.count}</dd>
            </div>
          ))}
        </dl>
      </div>
    </MockupPanel>
  );
}

/* 3 — Pricing. What a per-submission plan bills you for. */

const CELLS = 30;
const UNVERIFIED = 7;

export function MeteredPanel() {
  return (
    <MockupPanel title="Per-submission billing">
      <div className="px-4 py-4">
        <div aria-hidden="true" className="grid grid-cols-10 gap-1">
          {Array.from({ length: CELLS }, (_, index) => (
            <span
              key={index}
              className={
                index >= CELLS - UNVERIFIED
                  ? "aspect-square border border-bot-edge bg-bot-surface"
                  : "aspect-square border border-border-strong bg-muted"
              }
            />
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          <span className="text-foreground">7 of every 30</span> submissions in this
          illustration could not say what they were. A plan metered by the submission bills
          you for all 30.
        </p>
      </div>
    </MockupPanel>
  );
}
