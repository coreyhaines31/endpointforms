"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

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

export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2500);
      }}
      className={cn(
        "shrink-0 rounded-md border border-border-control px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <span aria-hidden="true">
        {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : "Copy"}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied"
          ? "Copied to the clipboard."
          : state === "failed"
            ? "Copying failed. Select the text and copy it."
            : ""}
      </span>
    </button>
  );
}
