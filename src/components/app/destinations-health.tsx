import Link from "next/link";

import { RelativeTime } from "@/components/app/time";
import type { DestinationHealth } from "@/lib/destinations/types";

/**
 * Whether a destination is working, said out loud (#42).
 *
 * The pillar this belongs to is *"your data goes wherever you need it — **and
 * says so when it doesn't**"*, and the enemy in `docs/00-positioning-spine.md`
 * is "the dashboard that says everything is fine while sales drowns in junk". A
 * green tick that is green because nothing has been checked would be that
 * dashboard. So:
 *
 * - **`untested` is its own state.** A destination nobody has delivered to is
 *   not healthy; it is unproven, and it says so and offers the test button.
 * - **Shape, label and colour ship together**, the same rule
 *   `verdict-chip.tsx` and `provenance-chip.tsx` follow — colour alone cannot
 *   carry five states accessibly (docs/03 §8).
 * - **One failure is not red.** `degraded` exists so a single 502 during
 *   somebody's deploy does not paint the screen red, because a banner that is
 *   red every week is a banner nobody reads. Three in a row is red.
 */

const glyphs: Record<DestinationHealth["state"], React.ReactNode> = {
  // A tick. Delivered, recently.
  healthy: <path d="M1 5.4 3.8 8.2 9 1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  // A hollow ring. Nothing has been tried, and that is not a failure.
  untested: <circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  // An exclamation. Something went wrong, once.
  degraded: (
    <path d="M5 1.4v4.2M5 8.1v.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  ),
  // A cross. It is broken.
  failing: <path d="M1.6 1.6 8.4 8.4M8.4 1.6 1.6 8.4" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  // Two bars. Stopped on purpose.
  paused: (
    <path d="M3.4 1.6v6.8M6.6 1.6v6.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
  ),
};

const styles: Record<DestinationHealth["state"], string> = {
  healthy: "border-signal-edge/40 bg-signal/15 text-signal-ink",
  untested: "border-border text-muted-foreground",
  degraded: "border-bot-edge bg-bot-surface text-bot",
  failing: "border-destructive/40 bg-destructive-surface text-destructive",
  paused: "border-border text-muted-foreground",
};

const labels: Record<DestinationHealth["state"], string> = {
  healthy: "Delivering",
  untested: "Untested",
  degraded: "Degraded",
  failing: "Failing",
  paused: "Paused",
};

export function HealthChip({
  state,
  className,
}: {
  state: DestinationHealth["state"];
  className?: string;
}) {
  return (
    <span
      // Deliberately not cn(): twMerge reads `text-label` as a colour token and
      // drops it beside `text-bot` / `text-destructive`. See verdict-chip.tsx.
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-label uppercase ${styles[state]} ${className ?? ""}`}
    >
      <svg viewBox="0 0 10 10" className="size-2.5 shrink-0" aria-hidden="true">
        {glyphs[state]}
      </svg>
      {labels[state]}
    </span>
  );
}

/**
 * The sentence under the chip.
 *
 * Never "everything is fine". It states the last thing that actually happened
 * and when, because a claim with a timestamp on it can be disagreed with and a
 * claim without one cannot.
 */
export function HealthLine({ health }: { health: DestinationHealth }) {
  if (health.state === "untested") {
    return (
      <>
        Nothing has been delivered here yet, so there is nothing to report.{" "}
        <span className="text-foreground">Send a test</span> to find out whether it works
        before a real lead does.
      </>
    );
  }

  if (health.state === "paused") {
    return (
      <>
        Paused. Submissions still arrive and are still stored — they just stop going out.
        {health.lastSuccessAt ? (
          <>
            {" "}
            Last delivered <RelativeTime value={health.lastSuccessAt} />.
          </>
        ) : null}
      </>
    );
  }

  if (health.state === "healthy") {
    return (
      <>
        Last delivered{" "}
        {health.lastSuccessAt ? <RelativeTime value={health.lastSuccessAt} /> : "recently"}.
        {health.deadLetterCount > 0 ? (
          <>
            {" "}
            {health.deadLetterCount}{" "}
            {health.deadLetterCount === 1 ? "delivery" : "deliveries"} gave up earlier and{" "}
            {health.deadLetterCount === 1 ? "is" : "are"} still waiting to be sent again.
          </>
        ) : null}
      </>
    );
  }

  // degraded and failing
  return (
    <>
      <span className="text-foreground">
        {health.consecutiveFailures}{" "}
        {health.consecutiveFailures === 1 ? "failure" : "failures in a row"}
      </span>
      {health.lastSuccessAt ? (
        <>
          {" "}
          since the last successful delivery <RelativeTime value={health.lastSuccessAt} />.
        </>
      ) : (
        <>, and nothing has ever been delivered here successfully.</>
      )}
      {health.deadLetterCount > 0 ? (
        <>
          {" "}
          {health.deadLetterCount}{" "}
          {health.deadLetterCount === 1 ? "delivery has" : "deliveries have"} stopped
          retrying — nothing was thrown away, and each one can be sent again from the log.
        </>
      ) : null}
    </>
  );
}

/**
 * The banner. Not a log line nobody reads — #42's words.
 *
 * Rendered above everything else on the destinations screen, and on the
 * endpoint page, so the news reaches someone who came here for another reason.
 * Absent entirely when there is nothing wrong: a banner that is always present
 * is furniture.
 */
export function DeliveryAlert({
  failing,
  degraded,
  href,
}: {
  failing: { id: string; name: string }[];
  degraded: { id: string; name: string }[];
  href: string;
}) {
  if (failing.length === 0 && degraded.length === 0) return null;

  const isFailing = failing.length > 0;
  const named = (isFailing ? failing : degraded).map((row) => row.name);
  const listed = named.slice(0, 3).join(", ");
  const remainder = named.length - Math.min(named.length, 3);

  return (
    <div
      role="alert"
      className={
        isFailing
          ? "rounded-lg border border-destructive/40 bg-destructive-surface px-5 py-4"
          : "rounded-lg border border-bot-edge bg-bot-surface px-5 py-4"
      }
    >
      <p
        className={
          isFailing
            ? "font-mono text-label uppercase text-destructive"
            : "font-mono text-label uppercase text-bot"
        }
      >
        {isFailing ? "Delivery is failing" : "Delivery is degraded"}
      </p>
      <p className="mt-2 text-sm text-foreground">
        {listed}
        {remainder > 0 ? ` and ${remainder} more` : ""}{" "}
        {named.length === 1 ? "is not delivering" : "are not delivering"}.{" "}
        {isFailing
          ? `Submissions are still being stored — nothing has been lost — but they are not reaching ${named.length === 1 ? "this destination" : "these destinations"}.`
          : "A delivery failed and is being retried."}{" "}
        <Link
          href={href}
          className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          See what happened
        </Link>
        .
      </p>
    </div>
  );
}
