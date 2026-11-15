import { MockupBand, MockupFrame } from "@/components/mockup/frame";
import { ProvenanceChip } from "@/components/provenance-chip";
import { enterStep } from "@/lib/motion";

/**
 * The hero mockup: one submission, from arrival to ending.
 *
 * The whole argument in one object — a form record that keeps going after the
 * submit button. Every value is invented; the frame says so.
 */

const steps = [
  {
    step: "01",
    when: "Received",
    value: <span className="font-mono text-foreground">sub_8f21</span>,
    body: "Tue 09:14 · Demo request form",
  },
  {
    step: "02",
    when: "Origin",
    value: <ProvenanceChip origin="human" />,
    body: "Came through the human page, behaving like a browser session.",
  },
  {
    step: "03",
    when: "Days 1–33",
    value: <span className="font-mono text-foreground">Awaiting verdict</span>,
    body: "Where most submissions sit. Shown as a state, not rounded down to a no.",
  },
  {
    step: "04",
    when: "Day 34",
    value: (
      <span className="font-mono tabular text-foreground">
        Won · <span className="whitespace-nowrap">$18,400</span>
      </span>
    ),
    body: "The outcome comes back from the CRM and is written onto this same record.",
  },
];

/**
 * `animated` plays the record being written on load: the four steps arrive in
 * order, each value landing a beat after its label, while a hairline runs
 * across the top like a write head. CSS only; see `[data-enter]` in
 * globals.css. Off by default so the record can sit anywhere else static.
 */
export function RecordJourney({ animated = false }: { animated?: boolean }) {
  return (
    <MockupFrame
      title="Submission record"
      meta="sub_8f21"
      caption="Illustration of a single submission record, drawn to show the shape of the thing. Endpoint Forms is pre-launch: the identifier, the dates and the amount are invented, not a customer result."
    >
      <ol className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {animated ? (
          <span
            aria-hidden="true"
            className="record-write-head pointer-events-none absolute inset-x-0 top-0 hidden h-px origin-left bg-foreground lg:block"
          />
        ) : null}
        {steps.map((item, index) => (
          <li
            key={item.step}
            {...(animated ? enterStep(6 + index * 2) : {})}
            className="border-b border-border px-4 py-5 last:border-b-0 sm:px-5 sm:[&:nth-child(2n)]:border-l sm:[&:nth-child(n+3)]:border-b-0 lg:border-b-0 lg:border-l lg:first:border-l-0"
          >
            <p className="flex items-baseline gap-2 font-mono text-label uppercase text-muted-foreground">
              <span>{item.step}</span>
              <span className="text-foreground">{item.when}</span>
            </p>
            <div {...(animated ? enterStep(7 + index * 2) : {})} className="mt-3 text-base">
              {item.value}
            </div>
            <p className="mt-2 max-w-[30ch] text-sm text-muted-foreground">{item.body}</p>
          </li>
        ))}
      </ol>
      <MockupBand>
        Every other form builder&rsquo;s copy of this record ends at step one. That is where
        the count of 1 gets added, and where the story stops.
      </MockupBand>
    </MockupFrame>
  );
}
