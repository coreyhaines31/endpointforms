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
  completion: { value: number; ratio: number };
  closed: string;
  value: string;
  yield: { value: number; ratio: number };
};

const variants: Variant[] = [
  {
    id: "A",
    name: "Variant A",
    fields: "3 fields, budget question included",
    views: "1,000",
    submissions: "84",
    completion: { value: 8.4, ratio: 0.71 },
    closed: "6",
    value: "$84,200",
    yield: { value: 7.1, ratio: 1 },
  },
  {
    id: "B",
    name: "Variant B",
    fields: "1 field, email only",
    views: "1,000",
    submissions: "118",
    completion: { value: 11.8, ratio: 1 },
    closed: "0",
    value: "$0",
    yield: { value: 0, ratio: 0 },
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

        <div data-reveal className="mt-10 border border-border bg-card">
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
                    // The after: box stretches the hit area to 44px without
                    // changing how tall the control looks.
                    "press relative rounded-sm px-3 py-1.5 font-mono text-label uppercase after:absolute after:inset-x-0 after:-inset-y-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
            {variants.map((variant) => (
              <VariantColumn
                key={variant.id}
                variant={variant}
                metric={metric}
                leading={active.winner === variant.id}
                label={active.label}
              />
            ))}
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

function format(value: number) {
  return `${value.toFixed(1)}%`;
}

/**
 * One variant's scoreboard. When the metric switches, the bar rescales
 * (transform only, never width) and carries the motion; the headline number,
 * the metric caption and the Leading/Trailing stamp swap with a short drop-in.
 * The number deliberately does not count through in-between values: every
 * figure on screen should be one the illustration actually claims.
 */
function VariantColumn({
  variant,
  metric,
  leading,
  label,
}: {
  variant: Variant;
  metric: Metric;
  leading: boolean;
  label: string;
}) {
  const bar = metric === "completion" ? variant.completion : variant.yield;
  const final = format(bar.value);
  // A sliver for any non-zero bar, so a small value never reads as none.
  const scale = bar.ratio > 0 ? Math.max(bar.ratio, 0.04) : 0;

  return (
    <div className="border-b border-border p-5 last:border-b-0 sm:p-6 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-h4">{variant.name}</h3>
        <span
          key={leading ? "leading" : "trailing"}
          className={cn(
            "animate-swap font-mono text-label uppercase",
            leading ? "text-signal-ink" : "text-muted-foreground",
          )}
        >
          {leading ? "Leading" : "Trailing"}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{variant.fields}</p>

      <p className="mt-6 font-mono text-display tabular text-foreground">
        <span key={metric} className="animate-swap inline-block">
          {final}
        </span>
      </p>
      <p
        key={metric}
        className="animate-swap mt-1 font-mono text-label uppercase text-muted-foreground"
      >
        {label}
      </p>

      <div
        className="mt-4 h-3 w-full overflow-hidden border border-border bg-background"
        role="img"
        aria-label={`${variant.name}: ${final} ${label.toLowerCase()}`}
      >
        <div
          className={cn(
            "h-full w-full origin-left transition-transform duration-(--dur-slow) ease-move",
            leading ? "signal-fill" : "bg-muted-foreground",
          )}
          style={{ transform: `scaleX(${scale})` }}
        />
      </div>

      <dl className="mt-6 border-t border-border font-mono text-sm">
        <Row label="Views" value={variant.views} />
        <Row label="Submissions" value={variant.submissions} />
        <Row
          label="Completion rate"
          value={format(variant.completion.value)}
          dim={metric !== "completion"}
        />
        <Row label="Closed deals" value={variant.closed} dim={metric !== "yield"} />
        <Row label="Closed value" value={variant.value} dim={metric !== "yield"} />
      </dl>
    </div>
  );
}

function Row({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="text-label uppercase text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular transition-colors duration-(--dur-base)",
          dim ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
