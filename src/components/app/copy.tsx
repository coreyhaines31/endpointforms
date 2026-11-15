"use client";

import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

// The app and the marketing site share one copy button, so feedback looks and
// is announced the same everywhere. Re-exported for the app's existing imports.
export { CopyButton };

/**
 * A block of code with a button that actually copies it.
 *
 * The snippet is the product's first minute: someone creates an endpoint, copies
 * three lines into their page, and submits. So the copy has to work, and it has
 * to say that it worked — a button that silently succeeds is indistinguishable
 * from one that silently failed, and the second attempt pastes nothing.
 *
 * `navigator.clipboard` is unavailable on an insecure origin and can be refused
 * outright, so the failure is handled and stated rather than swallowed. The code
 * is selectable text either way; the button is a convenience, never the only way
 * to get the string.
 */
export function CopyBlock({
  label,
  code,
  description,
  className,
}: {
  label: string;
  code: string;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-label uppercase text-muted-foreground">{label}</p>
        <CopyButton value={code} label={`Copy ${label.toLowerCase()}`} />
      </div>

      {description ? (
        <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">{description}</p>
      ) : null}

      <pre
        // Long lines scroll inside the block. Wrapping a form action across two
        // lines invites someone to copy half of it by hand.
        tabIndex={0}
        role="region"
        aria-label={label}
        className="mt-3 overflow-x-auto rounded-md border border-border bg-sunken px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <code className="font-mono text-sm text-foreground">{code}</code>
      </pre>
    </div>
  );
}
