"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "failed";

const visible: Record<CopyState, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Select it",
};

const announced: Record<CopyState, string> = {
  idle: "",
  copied: "Copied to the clipboard.",
  failed: "Copying failed. Select the text and copy it.",
};

/**
 * Copies a string and says so, in three places at once: the icon morphs to a
 * check, the word changes to "Copied", and a polite live region announces it.
 * A button that silently succeeds is indistinguishable from one that silently
 * failed, and the second attempt pastes nothing.
 *
 * `navigator.clipboard` is missing on insecure origins and can be refused, so
 * failure is stated, not swallowed. The text stays selectable either way.
 *
 * All three labels share one grid cell, so the button never changes width.
 * At the default size the visual box is 32px and an `after:` box stretches
 * the hit area to 44px; `size="lg"` is a full 44px box, for a button that
 * sits beside a 44px field.
 *
 * The live region is a sibling of the button, not a child: inside a button
 * that has an aria-label, a screen reader may never announce it.
 */
export function CopyButton({
  value,
  label,
  size = "sm",
  className,
}: {
  value: string;
  /** Accessible name, e.g. "Copy install commands". */
  label: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    let next: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      next = "failed";
    }
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={copy}
        data-state={state}
        className={cn(
          "press relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-border-control bg-card text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          size === "lg" ? "h-11 px-4" : "h-8 px-2.5 after:absolute after:-inset-1.5",
          className,
        )}
      >
        <span aria-hidden="true" className="grid size-3.5 place-items-center">
          {(["idle", "copied", "failed"] as const).map((key) => {
            const Icon = key === "idle" ? Copy : key === "copied" ? Check : X;
            return (
              <Icon
                key={key}
                className={cn(
                  "col-start-1 row-start-1 size-3.5 transition-[opacity,translate,scale,rotate] duration-(--dur-base) ease-enter",
                  key === "copied" && "text-signal-ink",
                  key === "failed" && "text-destructive",
                  state === key ? "scale-100 opacity-100" : "scale-50 opacity-0",
                )}
              />
            );
          })}
        </span>
        <span aria-hidden="true" className="grid">
          {(["idle", "copied", "failed"] as const).map((key) => (
            <span
              key={key}
              className={cn(
                "col-start-1 row-start-1 transition-[opacity,translate,scale,rotate] duration-(--dur-quick) ease-enter",
                state === key ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
              )}
            >
              {visible[key]}
            </span>
          ))}
        </span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {announced[state]}
      </span>
    </>
  );
}
