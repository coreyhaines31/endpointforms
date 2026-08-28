import type { Tone, Verdict } from "@/lib/tools/engine";
import { cn } from "@/lib/utils";

/**
 * Result primitives shared by all eight calculators.
 *
 * Tone mapping follows docs/03-brand.md §7: Signal marks the winner, amber says
 * "look at this", and red is kept for the states that have genuinely failed.
 * Nothing here is coloured for decoration.
 */

const toneText: Record<Tone, string> = {
  good: "text-signal-ink",
  warn: "text-bot",
  bad: "text-destructive",
  neutral: "text-muted-foreground",
};

const toneBorder: Record<Tone, string> = {
  good: "border-signal-ink",
  warn: "border-bot",
  bad: "border-destructive",
  neutral: "border-border-control",
};

const toneWord: Record<Tone, string> = {
  good: "Reading",
  warn: "Watch this",
  bad: "Finding",
  neutral: "Waiting on you",
};

export function ResultHeadline({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-mono text-label uppercase text-muted-foreground">{label}</p>
      {/* Size token and colour never share a cn() call — twMerge reads
          `text-display` as a colour and drops it. See src/components/prose.tsx. */}
      <p className="mt-3 font-mono text-display tabular">
        <span className="text-foreground">{value}</span>
      </p>
      {sub ? <div className="mt-3 max-w-[46ch] text-sm text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function VerdictNote({ verdict }: { verdict: Verdict }) {
  return (
    <div className={cn("border-l-2 pl-5", toneBorder[verdict.tone])}>
      {/* Deliberately not cn(): twMerge classifies `text-label` as a colour and
          would drop it next to `text-bot`. Verified — see the note in
          src/components/prose.tsx. A plain template literal never merges. */}
      <p className={`font-mono text-label uppercase ${toneText[verdict.tone]}`}>
        {toneWord[verdict.tone]}
      </p>
      <p className="mt-3 text-base font-medium text-foreground">{verdict.headline}</p>
      <p className="mt-3 max-w-[62ch] text-base text-muted-foreground">{verdict.detail}</p>
    </div>
  );
}

export function StatGrid({
  children,
  columns = 2,
}: {
  children: React.ReactNode;
  columns?: 2 | 3;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 border-t border-border",
        columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
      )}
    >
      {children}
    </dl>
  );
}

export function Stat({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="border-b border-border py-4 pr-6">
      <dt className="font-mono text-label uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-2">
        <span className="font-mono text-h3 tabular">
          <span className={tone === "neutral" ? "text-foreground" : toneText[tone]}>{value}</span>
        </span>
        {note ? <p className="mt-2 max-w-[34ch] text-sm text-muted-foreground">{note}</p> : null}
      </dd>
    </div>
  );
}

/** A horizontal bar. Proportion 0–1; anything outside that is clamped. */
export function Meter({
  proportion,
  tone = "neutral",
  label,
}: {
  proportion: number | null;
  tone?: Tone;
  label: string;
}) {
  const safe =
    proportion === null || !Number.isFinite(proportion)
      ? 0
      : Math.min(1, Math.max(0, proportion));
  const fill =
    tone === "bad"
      ? "bg-destructive"
      : tone === "warn"
        ? "bg-bot"
        : tone === "good"
          ? "bg-signal-ink"
          : "bg-foreground";
  return (
    <div
      role="img"
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-sm bg-sunken"
    >
      <div className={cn("h-full", fill)} style={{ width: `${safe * 100}%` }} />
    </div>
  );
}

export function Anomalies({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="border border-bot-edge bg-bot-surface p-5">
      <p className="font-mono text-label uppercase text-bot">These numbers do not add up</p>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** A table that scrolls itself rather than the page. */
export function ResultTable({
  head,
  children,
  caption,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  caption?: string;
}) {
  return (
    <div className="-mx-[5%] overflow-x-auto px-[5%] lg:mx-0 lg:px-0">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-border-control">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  children,
  numeric,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      scope="col"
      // Same trap as VerdictNote: `text-label` and `text-muted-foreground` are
      // both "colours" to twMerge, so cn() would silently drop the size.
      className={`pb-3 pr-6 font-mono text-label font-medium uppercase text-muted-foreground${
        numeric ? " text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric,
  muted,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-b border-border py-3 pr-6 text-sm",
        numeric && "tabular text-right font-mono",
        muted ? "text-muted-foreground" : "text-foreground",
      )}
    >
      {children}
    </td>
  );
}

export function RowHeader({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="row"
      className="border-b border-border py-3 pr-6 text-left text-sm font-medium text-foreground"
    >
      {children}
    </th>
  );
}
