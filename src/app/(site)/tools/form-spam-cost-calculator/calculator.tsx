"use client";

import {
  Anomalies,
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
  computeSpamCost,
  formatCurrency,
  formatMultiple,
  formatNumber,
  spamCostFields,
} from "@/lib/tools/engine";

export function SpamCostCalculator() {
  const form = useToolInputs(spamCostFields);
  const result = computeSpamCost(form.values);

  const anomalies =
    result.submissions !== null && result.submissions > 500_000
      ? [
          "That spend and cost per lead imply more than half a million submissions a month. The arithmetic still holds, but check the two figures are over the same period.",
        ]
      : [];

  return (
    <CalculatorFrame
      onReset={form.reset}
      pristine={form.pristine}
      inputs={
        <>
          <FieldGroup
            legend="The campaign"
            specs={spamCostFields}
            keys={["spend", "cpl", "junkPct"]}
            form={form}
          />
          <FieldGroup
            legend="What cleaning it up costs"
            specs={spamCostFields}
            keys={["minutesPerLead", "hourlyCost", "perResponseFee"]}
            form={form}
          />
        </>
      }
      result={
        <div className="flex flex-col gap-8">
          <ResultHeadline
            label="Your real cost per usable lead"
            value={formatCurrency(result.effectiveCpl)}
            sub={
              result.submissions === null ? (
                "Waiting on a spend and a cost per lead above zero — with a cost per lead of zero there is no submission count to divide by."
              ) : result.cplMultiple === null ? (
                "Undefined while no submissions survive the junk filter — which is itself the answer."
              ) : (
                <>
                  Your dashboard reports {formatCurrency(form.values.cpl)}. Taking
                  the junk out, each lead a rep can actually work costs{" "}
                  {formatMultiple(result.cplMultiple, 2)} that. Same spend, same
                  form, different denominator.
                </>
              )
            }
          />

          <Anomalies items={anomalies} />

          <StatGrid>
            <Stat
              label="Submissions a month"
              value={formatNumber(result.submissions)}
              note="Spend divided by the reported cost per lead."
            />
            <Stat
              label="Of those, junk"
              value={formatNumber(result.junkSubmissions)}
              note="Bots, spam and people who were never reachable."
            />
            <Stat
              label="Ad spend on junk"
              value={formatCurrency(result.wastedSpend)}
              note="You were billed for these clicks at the same rate as the good ones."
            />
            <Stat
              label="Rep hours on junk"
              value={formatNumber(result.wastedHours, 1)}
              note="Dialling, voicemail, and the CRM note nobody wanted to write."
            />
            <Stat
              label="Payroll on junk"
              value={formatCurrency(result.wastedPayroll)}
              note="Those hours at your fully-loaded rate."
            />
            <Stat
              label="Per-response tax on junk"
              value={formatCurrency(result.formTax)}
              note="What your form tool charged you to receive them."
            />
          </StatGrid>

          <StatGrid>
            <Stat
              label="Total, per month"
              value={formatCurrency(result.monthlyTotal)}
              tone={result.verdict.tone === "good" ? "neutral" : result.verdict.tone}
            />
            <Stat
              label="Total, per year"
              value={formatCurrency(result.annualTotal)}
              note="Assuming the junk rate holds, which it will not — it moves with the traffic source."
            />
          </StatGrid>

          <VerdictNote verdict={result.verdict} />
        </div>
      }
    />
  );
}
