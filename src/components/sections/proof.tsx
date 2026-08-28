"use client";

import { useState } from "react";
import { Container } from "@/components/container";
import { IllustrationTag } from "@/components/mockup/frame";
import { cn } from "@/lib/utils";

type Metric = "completion" | "yield";

type Variant = {
  id: string;
  name: string;
  fields: string;
  views: string;
  submissions: string;
  completion: { display: string; ratio: number };
  closed: string;
  value: string;
  yield: { display: string; ratio: number };
};

const variants: Variant[] = [
  {
    id: "A",
    name: "Variant A",
    fields: "3 fields, budget question included",
    views: "1,000",
    submissions: "84",
    completion: { display: "8.4%", ratio: 0.71 },
    closed: "6",
    value: "$84,200",
    yield: { display: "7.1%", ratio: 1 },
  },
  {
    id: "B",
    name: "Variant B",
    fields: "1 field, email only",
    views: "1,000",
    submissions: "118",
    completion: { display: "11.8%", ratio: 1 },
    closed: "0",
    value: "$0",
    yield: { display: "0.0%", ratio: 0 },
  },
];

const metricCopy: Record<Metric, { label: string; caption: string; winner: string }> = {
  completion: {
    label: "Completion rate",
    caption: "Ranked the way every form builder ranks it: how many people finished.",
    winner: "B",
  },
  yield: {
    label: "Yield",
    caption:
      "Ranked on the verdicts your CRM sent back: won, lost, disqualified, and what it was worth.",
    winner: "A",
  },
};

export function Proof() {
  const [metric, setMetric] = useState<Metric>("completion");
  const active = metricCopy[metric];

  return (
    <section id="proof" className="scroll-mt-20 bg-sunken py-[clamp(4rem,9vw,7rem)]">
      <Container>
        <p className="font-mono text-label uppercase text-muted-foreground">The demo</p>
        <h2 className="mt-5 max-w-[24ch] text-h2 sm:text-display">
          Two variants. One converted 41% better. It also produced zero closed deals.
        </h2>
        <p className="mt-6 max-w-[62ch] text-lead text-muted-foreground">
          Every form builder declares a winner before anyone has picked up the phone. We
          wait for the phone call. Switch the metric and watch the winner change.
        </p>

        <div className="mt-10 border border-border bg-card">
          <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-label uppercase text-muted-foreground">
                Hindsight split test · Demo request form · 30 days
              </p>
              {/* Same stamp every mockup on the site carries. */}
              <IllustrationTag />
            </div>

            <div
              role="group"
              aria-label="Rank variants by"
              className="inline-flex self-start rounded-md border border-border-control p-0.5 sm:self-auto"
            >
              {(Object.keys(metricCopy) as Metric[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={metric === key}
                  onClick={() => setMetric(key)}
                  className={cn(
                    "rounded-sm px-3 py-1.5 font-mono text-label uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    metric === key
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {metricCopy[key].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2">
            {variants.map((variant) => {
              const leading = active.winner === variant.id;
              const bar = metric === "completion" ? variant.completion : variant.yield;
              const headline =
                metric === "completion" ? variant.completion.display : variant.yield.display;

              return (
                <div
                  key={variant.id}
                  className="border-b border-border p-5 last:border-b-0 sm:p-6 md:border-b-0 md:border-r md:last:border-r-0"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-h4">{variant.name}</h3>
                    <span
                      className={cn(
                        "font-mono text-label uppercase",
                        leading ? "text-signal-ink" : "text-muted-foreground",
                      )}
                    >
                      {leading ? "Leading" : "Trailing"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{variant.fields}</p>

                  <p className="mt-6 font-mono text-display tabular text-foreground">
                    {headline}
                  </p>
                  <p className="mt-1 font-mono text-label uppercase text-muted-foreground">
                    {active.label}
                  </p>

                  <div
                    className="mt-4 h-3 w-full border border-border bg-background"
                    role="img"
                    aria-label={`${variant.name}: ${headline} ${active.label.toLowerCase()}`}
                  >
                    <div
                      className={cn(
                        "h-full transition-[width] duration-500 ease-out motion-reduce:transition-none",
                        leading ? "signal-fill" : "bg-border-strong",
                      )}
                      style={{ width: `${Math.max(bar.ratio * 100, bar.ratio > 0 ? 4 : 0)}%` }}
                    />
                  </div>

                  <dl className="mt-6 border-t border-border font-mono text-sm">
                    <Row label="Views" value={variant.views} />
                    <Row label="Submissions" value={variant.submissions} />
                    <Row
                      label="Completion rate"
                      value={variant.completion.display}
                      dim={metric !== "completion"}
                    />
                    <Row label="Closed deals" value={variant.closed} dim={metric !== "yield"} />
                    <Row label="Closed value" value={variant.value} dim={metric !== "yield"} />
                  </dl>
                </div>
              );
            })}
          </div>

          <p
            role="status"
            aria-live="polite"
            className="border-t border-border px-5 py-4 text-sm text-muted-foreground sm:px-6"
          >
            {active.caption}
          </p>
        </div>

        <p className="mt-5 max-w-[68ch] text-sm text-muted-foreground">
          Illustrative. Endpoint Forms is pre-launch, so these are the numbers the product
          reports &mdash; not a customer result. We&rsquo;ll swap them for a real split test
          with real verdicts behind it the day we have one.
        </p>
      </Container>
    </section>
  );
}

function Row({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="text-label uppercase text-muted-foreground">{label}</dt>
      <dd className={cn("tabular", dim ? "text-muted-foreground" : "text-foreground")}>
        {value}
      </dd>
    </div>
  );
}
