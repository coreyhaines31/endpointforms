"use client";

import {
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
  computeTimeToOutcome,
  formatDuration,
  formatNumber,
  formatPercent,
  timeToOutcomeFields,
} from "@/lib/tools/engine";

export function TimeToOutcomeCalculator() {
  const form = useToolInputs(timeToOutcomeFields);
  const result = computeTimeToOutcome(form.values);

  const required = result.requiredPerVariant;
  const requiredValue =
    required === null
      ? "—"
      : required >= 1e9
        ? "More than a billion"
        : formatNumber(required);

  return (
    <CalculatorFrame
      onReset={form.reset}
      pristine={form.pristine}
      inputs={
        <>
          <FieldGroup
            legend="Your volume"
            specs={timeToOutcomeFields}
            keys={["submissions", "gradeablePct", "variants"]}
            form={form}
          />
          <FieldGroup
            legend="Your outcomes"
            specs={timeToOutcomeFields}
            keys={["closeRate", "liftPct", "medianDays"]}
            form={form}
          />
        </>
      }
      result={
        <div className="flex flex-col gap-8">
          <ResultHeadline
            label="Time for one outcome-weighted test to conclude"
            value={formatDuration(result.monthsTotal)}
            sub={
              result.monthsTotal === null ? (
                "Not computable from these numbers."
              ) : (
                <>
                  {formatDuration(result.monthsCollecting)} accumulating enough
                  submissions, plus {formatDuration(result.monthsLag)} waiting for
                  the last of them to resolve into a won or lost.
                </>
              )
            }
          />

          <StatGrid>
            <Stat
              label="Gradeable submissions a month"
              value={formatNumber(result.gradeablePerMonth)}
              note="Submissions that eventually get a disposition. The rest are invisible to a test."
            />
            <Stat
              label="Per variant, per month"
              value={formatNumber(result.perVariantPerMonth)}
              note="Split evenly across the variants in the test."
            />
            <Stat
              label="Submissions needed per variant"
              value={requiredValue}
              note="To detect a lift this size on the close rate at 95% confidence and 80% power."
            />
            <Stat
              label="The difference being tested for"
              value={`${formatPercent(result.baseline, 2)} → ${formatPercent(result.target, 2)}`}
              note="Baseline close rate against the improved one you asked to be able to detect."
            />
          </StatGrid>

          <VerdictNote verdict={result.verdict} />
        </div>
      }
    />
  );
}
