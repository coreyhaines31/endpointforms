import Link from "next/link";

import type { EndpointReach } from "@/lib/destinations/reach";

/**
 * "Nobody will be told about this" (#65).
 *
 * The banner that exists because the alternative is us doing the thing the
 * product is named against — storing a lead, saying everything is fine, and
 * telling no one. `endpointReach` decides whether there is anything to say; this
 * renders it and adds the one link that fixes it.
 *
 * ## Why it is amber and not red
 *
 * Red is what `DeliveryAlert` uses for a destination that has failed three times
 * in a row: something is broken and leads are not reaching a place they used to
 * reach. Nothing is broken here. Every submission is stored, none has been lost,
 * and one click ends the state. Painting both the same red is how a colour stops
 * meaning anything — which is the argument `destinations-health.tsx` already
 * makes about a banner that is always present.
 *
 * Shape and words carry the state, not colour alone (docs/03 §8): the heading
 * says it in full, so a reader who sees no colour at all loses nothing.
 */
export function ReachAlert({
  reach,
  href,
  className,
}: {
  reach: EndpointReach;
  /** The destinations screen for this endpoint. */
  href: string;
  className?: string;
}) {
  if (reach.state === "reachable") return null;

  return (
    <div
      role="alert"
      className={`rounded-lg border border-bot-edge bg-bot-surface px-5 py-4 ${className ?? ""}`}
    >
      <p className="font-mono text-label uppercase text-bot">Nothing leaves this endpoint</p>
      <p className="mt-2 max-w-[68ch] text-sm text-foreground">
        {reach.title}. {reach.detail}{" "}
        <Link
          href={href}
          className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {reach.state === "deaf" ? "Add a destination" : "Manage destinations"}
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * The marker on a submission that was delivered nowhere.
 *
 * Attached to the row rather than to the endpoint, because it is a fact about
 * this lead: no attempt to deliver it was ever made. It reads as past tense on
 * purpose — adding a destination now does not un-happen it, and the row is the
 * only place that will ever say so.
 *
 * Not `cn()`: twMerge reads `text-label` as a colour token and drops it beside
 * `text-bot`. Same note as `HealthChip` and `verdict-chip.tsx`.
 */
export function NowhereChip() {
  return (
    <span
      // Outline, not filled. The Origin chip beside it in the inbox is a filled
      // amber for `unverified`, and two filled amber chips in one row read as
      // one fact said twice. They are different axes and must look it.
      className="inline-flex items-center gap-1.5 rounded-sm border border-bot-edge px-2 py-1 font-mono text-label uppercase text-bot"
      title="No attempt was made to deliver this submission — the endpoint had nothing switched on when it arrived. It is still stored, and can be delivered from the log once a destination exists."
    >
      <svg viewBox="0 0 10 10" className="size-2.5 shrink-0" aria-hidden="true">
        {/* A circle with a bar through it: went nowhere. */}
        <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.5 7.5 7.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      Went nowhere
    </span>
  );
}
