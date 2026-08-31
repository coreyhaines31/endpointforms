import { cn } from "@/lib/utils";

/**
 * The app's flat surfaces.
 *
 * Same tokens as the marketing site — warm paper, hairline borders, the mono
 * uppercase label as the section tell (docs/03 §6). An internal surface that
 * looks like a different product is how a design system quietly forks.
 */

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-h4">{title}</h2>
        {description ? (
          <p className="mt-1.5 max-w-[60ch] text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function PanelBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-5 py-5", className)}>{children}</div>;
}

/** An empty state that says what to do next rather than just "nothing here". */
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children ? (
        <div className="mx-auto mt-2 max-w-[52ch] text-sm text-muted-foreground">{children}</div>
      ) : null}
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-label uppercase text-muted-foreground">{children}</span>
  );
}

/** owner / member, as a quiet chip rather than a badge that shouts. */
export function RoleChip({ role }: { role: "owner" | "member" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-label uppercase",
        role === "owner"
          ? "border-signal-edge/30 bg-signal/15 text-signal-ink"
          : "border-border text-muted-foreground",
      )}
    >
      {role}
    </span>
  );
}
