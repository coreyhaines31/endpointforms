"use client";

import {
  Anomalies,
  Meter,
  ResultHeadline,
  Stat,
  StatGrid,
  VerdictNote,
} from "@/components/tools/readout";
import {
  CalculatorFrame,
  FieldGroup,
  useToolInputs,
} from "@/components/tools/tool-form";
import {
  computeDropOff,
  dropOffFields,
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/tools/engine";

export function DropOffCalculator() {
  const form = useToolInputs(dropOffFields);
  const result = computeDropOff(form.values);

  return (
    <CalculatorFrame
      onReset={form.reset}
      pristine={form.pristine}
      inputs={
        <>
          <FieldGroup
            legend="The steps"
            hint="How many people reached each step. Set a step to zero to end the form there."
            specs={dropOffFields}
            keys={["step1", "step2", "step3", "step4", "step5", "completed"]}
            form={form}
          />
          <FieldGroup
            legend="What a submission is worth"
            specs={dropOffFields}
            keys={["closeRate", "dealValue"]}
            form={form}
          />
        </>
      }
      result={
        <div className="flex flex-col gap-8">
          <ResultHeadline
            label="Worst step"
            value={result.worst ? result.worst.label : "—"}
            sub={
              result.worst && result.worst.dropRate !== null ? (
                <>
                  {formatPercent(result.worst.dropRate, 1)} of the people who
                  reached it leave there —{" "}
                  {formatNumber(result.worst.dropped)} of them. Overall completion
                  is {formatPercent(result.completionRate, 1)}.
                </>
              ) : (
                "Add at least two steps to find out where people leave."
              )
            }
          />

          <Anomalies items={result.anomalies} />

          <div className="flex flex-col gap-5">
            {result.transitions.map((transition) => {
              const isWorst = result.worst !== null && transition.label === result.worst.label;
              return (
                <div key={transition.label}>
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-sm font-medium text-foreground">
                      {transition.label}
                    </p>
                    <p className="tabular font-mono text-sm text-muted-foreground">
                      {formatPercent(transition.retention, 1)} kept
                    </p>
                  </div>
                  <div className="mt-2">
                    <Meter
                      proportion={transition.retention}
                      tone={transition.anomalous ? "bad" : isWorst ? "warn" : "neutral"}
                      label={`${transition.label}: ${formatPercent(transition.retention, 1)} kept`}
                    />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {formatNumber(transition.from)} → {formatNumber(transition.to)}
                    {transition.dropped > 0
                      ? `, losing ${formatNumber(transition.dropped)}`
                      : ""}
                    {isWorst ? " · the steepest loss on the form" : ""}
                  </p>
                </div>
              );
            })}
          </div>

          <StatGrid>
            <Stat
              label="Completion rate"
              value={formatPercent(result.completionRate, 1)}
              note="Submissions divided by people who saw step 1."
            />
            <Stat
              label="Median step, for comparison"
              value={formatPercent(result.medianRetention, 1)}
              note="What a typical step on your form keeps, excluding the worst one."
            />
            <Stat
              label="Submissions recovered"
              value={formatNumber(result.recoveredSubmissions, 0)}
              note="If the worst step merely performed like a median step on your own form."
            />
            <Stat
              label="What that is worth"
              value={formatCurrency(result.recoveredRevenue)}
              tone={
                result.recoveredRevenue !== null && result.recoveredRevenue > 0
                  ? "good"
                  : "neutral"
              }
              note={`About ${formatNumber(result.recoveredDeals, 1)} more closed deals a month, if the recovered submissions are no better and no worse than the rest.`}
            />
          </StatGrid>

          <VerdictNote verdict={result.verdict} />
        </div>
      }
    />
  );
}
