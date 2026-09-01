"use client";

import {
  Anomalies,
  Meter,
  ResultHeadline,
  ResultTable,
  RowHeader,
  Stat,
  StatGrid,
  Td,
  Th,
  VerdictNote,
} from "@/components/tools/readout";
import {
  CalculatorFrame,
  FieldGroup,
  useToolInputs,
} from "@/components/tools/tool-form";
import {
  computeReconciliation,
  formatMultiple,
  formatNumber,
  formatPercent,
  reconciliationFields,
} from "@/lib/tools/engine";

export function ReconciliationCalculator() {
  const form = useToolInputs(reconciliationFields);
  const result = computeReconciliation(form.values);

  return (
    <CalculatorFrame
      onReset={form.reset}
      pristine={form.pristine}
      inputs={
        <>
          <FieldGroup
            legend="What the tools say"
            specs={reconciliationFields}
            keys={["reported", "inCrm"]}
            form={form}
          />
          <FieldGroup
            legend="What sales did"
            specs={reconciliationFields}
            keys={["attempted", "reached", "real", "won"]}
            form={form}
          />
        </>
      }
      result={
        <div className="flex flex-col gap-8">
          <ResultHeadline
            label="Reported conversions per real prospect"
            value={formatMultiple(result.overstatement, 2)}
            sub={
              result.overstatement === null ? (
                "Not computable until at least one lead turns out to be real."
              ) : (
                <>
                  Your dashboard counts{" "}
                  {formatMultiple(result.overstatement, 2)} conversions for every
                  person who turned out to be worth talking to. Both numbers are
                  correct. Only one of them is a lead.
                </>
              )
            }
          />

          <Anomalies items={result.anomalies} />

          <div className="flex flex-col gap-4">
            {result.stages.map((stage) => (
              <div key={stage.key}>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-medium text-foreground">{stage.label}</p>
                  <p className="tabular font-mono text-sm text-muted-foreground">
                    {formatNumber(stage.count)}
                    {stage.shareOfReported === null
                      ? ""
                      : ` · ${formatPercent(stage.shareOfReported, 1)} of reported`}
                  </p>
                </div>
                <div className="mt-2">
                  <Meter
                    proportion={stage.shareOfReported}
                    tone={stage.anomalous ? "bad" : "neutral"}
                    label={`${stage.label}: ${formatNumber(stage.count)}`}
                  />
                </div>
                {stage.lost !== null && stage.lost > 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Lost {formatNumber(stage.lost)} here —{" "}
                    {formatPercent(
                      stage.retention === null ? null : 1 - stage.retention,
                      1,
                    )}{" "}
                    of what reached the stage above.
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          <StatGrid>
            <Stat
              label="Junk rate"
              value={formatPercent(result.junkRate, 1)}
              tone={
                result.junkRate !== null && result.junkRate >= 0.5 ? "bad" : "warn"
              }
              note="Reported conversions that never turned out to be a real prospect."
            />
            <Stat
              label="Biggest single leak"
              value={result.biggestLeak ? result.biggestLeak.label : "—"}
              note={
                result.biggestLeak
                  ? `${formatNumber(result.biggestLeak.lost)} lost at this step, more than at any other.`
                  : "No stage loses anything on these numbers."
              }
            />
            <Stat
              label="Close rate on reported"
              value={formatPercent(result.closeOnReported, 2)}
              note="The number a dashboard would show you."
            />
            <Stat
              label="Close rate on real prospects"
              value={formatPercent(result.closeOnReal, 2)}
              note="The number your sales team experiences."
            />
          </StatGrid>

          <ResultTable
            head={<><Th>Stage</Th><Th numeric>Count</Th><Th numeric>Kept from previous</Th></>}
            caption="Each funnel stage and how much of the previous stage it kept"
          >
            {result.stages.map((stage) => (
              <tr key={stage.key}>
                <RowHeader>{stage.label}</RowHeader>
                <Td numeric>{formatNumber(stage.count)}</Td>
                <Td numeric muted>{formatPercent(stage.retention, 1)}</Td>
              </tr>
            ))}
          </ResultTable>

          <VerdictNote verdict={result.verdict} />
        </div>
      }
    />
  );
}
