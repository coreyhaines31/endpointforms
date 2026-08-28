import { MockupBand, MockupFrame } from "@/components/mockup/frame";
import { MockupMeter } from "@/components/mockup/parts";

/**
 * /features/form-split-testing — both scoreboards on screen at once.
 *
 * The homepage demo makes you toggle between the two metrics
 * (src/components/sections/proof.tsx). This one refuses to hide either, because
 * the page's claim is that the disagreement IS the finding — and that the test
 * is not callable yet, which is the state the category never shows you.
 */

type Variant = {
  id: string;
  name: string;
  description: string;
  views: string;
  submissions: string;
  completion: string;
  completionRatio: number;
  verdictsIn: string;
  won: string;
  yieldRate: string;
  yieldRatio: number;
  yieldValue: string;
  leadsCompletion: boolean;
  leadsYield: boolean;
};

const variants: Variant[] = [
  {
    id: "A",
    name: "Variant A",
    description: "Four fields, qualifying question included",
    views: "1,240",
    submissions: "96",
    completion: "7.7%",
    completionRatio: 0.68,
    verdictsIn: "38 of 96",
    won: "7",
    yieldRate: "7.3%",
    yieldRatio: 1,
    yieldValue: "$40,100",
    leadsCompletion: false,
    leadsYield: true,
  },
  {
    id: "B",
    name: "Variant B",
    description: "One field, email only",
    views: "1,240",
    submissions: "141",
    completion: "11.4%",
    completionRatio: 1,
    verdictsIn: "52 of 141",
    won: "1",
    yieldRate: "0.7%",
    yieldRatio: 0.1,
    yieldValue: "$1,700",
    leadsCompletion: true,
    leadsYield: false,
  },
];

export function HindsightScoreboard() {
  return (
    <MockupFrame
      title="Hindsight split test"
      meta="Pricing page form · day 21"
      caption="Illustration of a Hindsight split test in progress. Endpoint Forms is pre-launch — the two variants and every number attached to them are invented to show what the report looks like while it is still refusing to call a winner."
    >
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-sunken px-4 py-3 sm:px-5">
        <span className="font-mono text-label uppercase text-foreground">Not called yet</span>
        <span className="text-sm text-muted-foreground">
          90 of 237 submissions have a verdict. The test reports what it has and says it
          cannot call it.
        </span>
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2">
        {variants.map((variant) => (
          <section
            key={variant.id}
            className="border-b border-border p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 sm:p-6"
          >
            <h3 className="text-h4">{variant.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{variant.description}</p>

            <div className="mt-6 border-t border-border pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-mono text-label uppercase text-muted-foreground">
                  Completion rate
                </p>
                <p
                  className={`font-mono text-label uppercase ${variant.leadsCompletion ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {variant.leadsCompletion ? "Ahead on fills" : "Behind on fills"}
                </p>
              </div>
              <p className="mt-3 font-mono tabular text-h2">
                <span className="text-foreground">{variant.completion}</span>
              </p>
              <MockupMeter ratio={variant.completionRatio} tone="muted" className="mt-3" />
            </div>

            <div className="mt-6 border-t border-border pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-mono text-label uppercase text-muted-foreground">
                  Yield rate
                </p>
                <p
                  className={`font-mono text-label uppercase ${variant.leadsYield ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {variant.leadsYield ? "Ahead on money" : "Behind on money"}
                </p>
              </div>
              <p className="mt-3 font-mono tabular text-h2">
                <span className="text-foreground">{variant.yieldRate}</span>
              </p>
              <MockupMeter
                ratio={variant.yieldRatio}
                tone={variant.leadsYield ? "signal" : "muted"}
                className="mt-3"
              />
            </div>

            <dl className="mt-6 border-t border-border font-mono text-sm">
              <Row label="Views" value={variant.views} />
              <Row label="Submissions" value={variant.submissions} />
              <Row label="Verdicts in" value={variant.verdictsIn} />
              <Row label="Won" value={variant.won} />
              <Row label="Yield value / 100" value={variant.yieldValue} />
            </dl>
          </section>
        ))}
      </div>

      <MockupBand>
        B is 48% ahead on fills and has produced one closed deal. Every other tool in the
        category would have shipped B on day four, and the report would have been correct
        about the only thing it was measuring.
      </MockupBand>
    </MockupFrame>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="text-label uppercase text-muted-foreground">{label}</dt>
      <dd className="tabular text-foreground">{value}</dd>
    </div>
  );
}
