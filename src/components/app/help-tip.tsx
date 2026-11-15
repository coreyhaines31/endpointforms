"use client";

import { Popover } from "@base-ui/react/popover";
import { Info } from "lucide-react";

/**
 * Plain-language definitions for the words this product made up or uses in
 * a narrow sense. One place, so a column header and a detail page never
 * explain the same term two different ways.
 *
 * Origin is worded with care: Agent is structural (the caller used the agent
 * surface), Human is a judgement from request signals and can be forged.
 * Never let this copy claim we detect bots.
 */
export const TERMS = {
  origin:
    "How the submission reached this endpoint. Agent: it came through the agent tool, so the caller identified itself by using it. Human: it came through the human page and the request looked like a browser's. That is a judgement from request signals, not proof. Unverified: it came through the human page but did not pass that check.",
  verdict:
    "What happened to the lead afterwards, as reported by your CRM or an outcome webhook: won, lost or disqualified, with a value. Awaiting means nothing has come back yet, which is normal for recent submissions.",
} as const;

export type Term = keyof typeof TERMS;

/**
 * A small info button beside a term. Opens on hover after a short delay, on
 * keyboard focus plus Enter, and on tap, so it works without a mouse. Escape
 * closes it. Essentials never live here: this only adds a definition to a
 * label that is already visible.
 *
 * The popup grows out of the button (Base UI's --transform-origin) over
 * 160ms, opacity and scale only.
 */
export function HelpTip({ term, label }: { term: Term; label: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={250}
        aria-label={`What ${label} means`}
        className="relative ml-1 inline-flex size-4 translate-y-[2px] items-center justify-center rounded-full align-baseline text-muted-foreground after:absolute after:-inset-3 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[popup-open]:text-foreground"
      >
        <Info className="size-3.5" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} className="z-[60]">
          <Popover.Popup className="w-[min(22rem,calc(100vw-2rem))] origin-(--transform-origin) rounded-md border border-border-control bg-popover px-4 py-3 text-left font-sans text-sm font-normal normal-case tracking-normal text-popover-foreground transition-[opacity,scale] duration-(--dur-quick) ease-enter data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0">
            <Popover.Title className="font-mono text-label uppercase text-muted-foreground">
              {label}
            </Popover.Title>
            <Popover.Description className="mt-2 text-sm text-foreground">
              {TERMS[term]}
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
