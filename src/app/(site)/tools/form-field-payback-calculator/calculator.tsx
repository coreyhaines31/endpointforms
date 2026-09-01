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
  computeFieldPayback,
  fieldPaybackFields,
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/tools/engine";

export function FieldPaybackCalculator() {
  const form = useToolInputs(fieldPaybackFields);
  const result = computeFieldPayback(form.values);

  const forecasting = form.values.expectedLiftPct > 0;

  return (
    <CalculatorFrame
      onReset={form.reset}
      pristine={form.pristine}
      inputs={
        <>
          <FieldGroup
            legend="The form today"
            specs={fieldPaybackFields}
            keys={["visitors", "completionRate", "closeRate", "dealValue"]}
            form={form}
          />
          <FieldGroup
            legend="The field you are thinking about adding"
            hint="Both of these are your assumptions. We have no data on either and neither does anyone else."
            specs={fieldPaybackFields}
            keys={["dropPct", "expectedLiftPct"]}
            form={form}
          />
        </>
      }
      result={
        <div className="flex flex-col gap-8">
          <ResultHeadline
            label="Close-rate improvement needed to break even"
            value={
              result.impossible
                ? "Unreachable"
                : formatPercent(result.requiredRelativeLift, 1)
            }
            sub={
              result.impossible ? (
                <>
                  Breaking even would need a close rate above 100%, which is not
                  available. On these numbers the field cannot pay for itself.
                </>
              ) : (
                <>
                  The leads you keep would have to close at{" "}
                  {formatPercent(
                    result.requiredCloseRate === null
                      ? null
                      : result.requiredCloseRate / 100,
                    2,
                  )}{" "}
                  instead of {formatPercent(form.values.closeRate / 100, 2)} just
                  to end the month where you started.
                </>
              )
            }
          />

          <StatGrid>
            <Stat
              label="Submissions now"
              value={formatNumber(result.completionsNow)}
            />
            <Stat
              label="Submissions after"
              value={formatNumber(result.completionsAfter)}
              note="Using the completion cost you entered."
            />
            <Stat
              label="Submissions lost"
              value={formatNumber(result.leadsLost)}
              tone={result.leadsLost > 0 ? "warn" : "neutral"}
            />
            <Stat
              label="Deals lost at today's close rate"
              value={formatNumber(result.dealsLost, 1)}
              note="What the lost submissions would have been worth if they were no better and no worse than the rest."
            />
          </StatGrid>

          {forecasting ? (
            <StatGrid>
              <Stat
                label="Revenue now"
                value={formatCurrency(result.revenueNow)}
              />
              <Stat
                label="Revenue at your forecast lift"
                value={formatCurrency(result.revenueAfter)}
                tone={result.revenueDelta >= 0 ? "good" : "bad"}
                note={`${result.revenueDelta >= 0 ? "Up" : "Down"} ${formatCurrency(Math.abs(result.revenueDelta))} a month. This half of the page is a forecast, not a measurement.`}
              />
            </StatGrid>
          ) : null}

          <VerdictNote verdict={result.verdict} />
        </div>
      }
    />
  );
}
