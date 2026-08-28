import { cn } from "@/lib/utils";
import { MockupScroll } from "@/components/mockup/frame";

/**
 * Table, stat and meter atoms shared by every mockup.
 *
 * Same twMerge caveat as frame.tsx: a size token and a colour token never share
 * a `cn()` call, because twMerge reads `text-label` as a colour and drops it.
 */

export function MockupTable({
  caption,
  scrollLabel,
  tableClassName,
  children,
}: {
  /** Read by screen readers. Say what the table shows AND that it is invented. */
  caption: string;
  /** Short name for the scroll region wrapping the table. */
  scrollLabel: string;
  tableClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <MockupScroll label={scrollLabel}>
      <table className={cn("w-full border-collapse text-left", tableClassName)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </MockupScroll>
  );
}

export function MockupTh({
  children,
  numeric,
  className,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`border-b border-border px-4 py-2.5 font-mono text-label font-medium uppercase text-muted-foreground ${numeric ? "text-right" : "text-left"} ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

export function MockupTd({
  children,
  numeric,
  dim,
  className,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  dim?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-border px-4 py-3 align-middle text-sm",
        numeric && "text-right font-mono tabular",
        dim ? "text-muted-foreground" : "text-foreground",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** A labelled number. Mono, tabular, label above. */
export function MockupStat({
  label,
  value,
  sub,
  size = "md",
  className,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      <p className="font-mono text-label uppercase text-muted-foreground">{label}</p>
      <p className={`mt-2 font-mono tabular ${size === "lg" ? "text-h2" : "text-h3"}`}>
        <span className="text-foreground">{value}</span>
      </p>
      {sub ? <p className="mt-1 text-sm text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export type MeterTone = "signal" | "ink" | "muted" | "human" | "agent" | "bot";

const meterFill: Record<MeterTone, string> = {
  signal: "signal-fill",
  ink: "bg-foreground",
  muted: "bg-border-strong",
  human: "bg-human",
  agent: "bg-agent",
  bot: "bg-bot",
};

/**
 * A bar. Always decorative: the number it depicts is printed next to it in
 * text, so colour and length never carry meaning on their own (docs/03 §8).
 */
export function MockupMeter({
  ratio,
  tone = "ink",
  className,
}: {
  ratio: number;
  tone?: MeterTone;
  className?: string;
}) {
  const width = ratio <= 0 ? 0 : Math.max(ratio * 100, 2);
  return (
    <div
      aria-hidden="true"
      className={cn("h-2 w-full border border-border bg-background", className)}
    >
      <div className={cn("h-full", meterFill[tone])} style={{ width: `${width}%` }} />
    </div>
  );
}
