import { cn } from "@/lib/utils";

/**
 * The app's one table.
 *
 * Wide content scrolls inside its own region rather than making the page scroll
 * sideways, and the region is focusable and labelled so a keyboard can reach it
 * — a `overflow-x-auto` div that cannot be scrolled without a mouse is a table
 * half its users cannot read.
 *
 * Same twMerge caveat as everywhere else: `text-label` never shares a `cn()`
 * call with a colour class, because twMerge classifies it as one and drops it.
 */

export function DataTable({
  caption,
  scrollLabel,
  tableClassName,
  children,
}: {
  caption: string;
  scrollLabel: string;
  tableClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={scrollLabel}
      tabIndex={0}
      className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <table className={cn("w-full border-collapse text-left", tableClassName)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({
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

export function Td({
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

/** A labelled fact in a definition list. The detail screens are made of these. */
export function Fact({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 border-b border-border px-5 py-3.5 sm:flex sm:items-baseline sm:gap-6">
      <dt className="shrink-0 font-mono text-label uppercase text-muted-foreground sm:w-44">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 min-w-0 break-words text-sm text-foreground sm:mt-0",
          mono && "font-mono",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** For a value we do not have. Says so rather than rendering an empty cell. */
export function Absent({ children = "none" }: { children?: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
