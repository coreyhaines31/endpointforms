import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

/**
 * A command or snippet someone is meant to paste: one block, monospace,
 * scrolling sideways inside itself instead of pushing the page, with a copy
 * button in its header. Long lines scroll rather than wrap, because a wrapped
 * command invites someone to copy half of it by hand.
 */
export function CodeBlock({
  code,
  label,
  className,
}: {
  code: string;
  /** Shown in the header and used to name the region and the copy button. */
  label: string;
  className?: string;
}) {
  return (
    <figure className={cn("m-0 min-w-0 rounded-md border border-border bg-sunken", className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-border py-2 pl-4 pr-2">
        <span className="font-mono text-label uppercase text-muted-foreground">{label}</span>
        <CopyButton value={code} label={`Copy ${label.toLowerCase()}`} />
      </figcaption>
      <pre
        tabIndex={0}
        role="region"
        aria-label={label}
        className="overflow-x-auto px-4 py-3.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <code className="font-mono text-sm leading-relaxed text-foreground">{code}</code>
      </pre>
    </figure>
  );
}
