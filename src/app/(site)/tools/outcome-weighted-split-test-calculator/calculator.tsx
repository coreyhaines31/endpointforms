"use client";

import {
  Anomalies,
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
  computeSplitTest,
  formatCurrency,
  formatNumber,
  formatPercent,
  splitTestFields,
} from "@/lib/tools/engine";

const nameOf = (id: "a" | "b" | "tie" | null) =>
  id === "a" ? "Variant A" : id === "b" ? "Variant B" : id === "tie" ? "A tie" : "—";

function significanceNote(p: number | null, significant: boolean) {
  if (p === null) return "Not computable — no conversions on either side.";
  if (significant) return `p = ${p.toFixed(4)}. Clears the 95% bar.`;
  return `p = ${p.toFixed(4)}. Does not clear the 95% bar.`;
}

export function SplitTestCalculator() {
  const form = useToolInputs(splitTestFields);
  const result = computeSplitTest(form.values);

  const sample = result.requiredVisitorsPerVariant;
  const sampleValue =
    sample === null
      ? "—"
      : sample >= 1e9
        ? "More than a billion"
        : formatNumber(sample);

  return (
    <CalculatorFrame
      onReset={form.reset}
      pristine={form.pristine}
      inputs={
        <>
          <FieldGroup
            legend="Variant A — the control"
            specs={splitTestFields}
            keys={["aVisitors", "aCompletions", "aWon", "aValue"]}
            form={form}
          />
          <FieldGroup
            legend="Variant B — the challenger"
            specs={splitTestFields}
            keys={["bVisitors", "bCompletions", "bWon", "bValue"]}
            form={form}
          />
        </>
      }
      result={
        <div className="flex flex-col gap-8">
          <ResultHeadline
            label="Winner on Yield rate"
            value={nameOf(result.yieldWinner)}
            sub={
              result.disagree ? (
                <>
                  {nameOf(result.completionWinner)} completes better.{" "}
                  {nameOf(result.yieldWinner)} closes better. Completion rate
                  would have shipped the other one.
                </>
              ) : (
                <>
                  Yield rate is closed-won deals per visitor — the same
                  denominator as completion rate, a different numerator. Both
                  metrics are below.
                </>
              )
            }
          />

          <Anomalies items={result.anomalies} />

          <ResultTable head={<><Th>Metric</Th><Th numeric>Variant A</Th><Th numeric>Variant B</Th></>} caption="Two form variants compared on completion rate and Yield rate">
            <tr>
              <RowHeader>Completion rate</RowHeader>
              <Td numeric>{formatPercent(result.a.completionRate, 2)}</Td>
              <Td numeric>{formatPercent(result.b.completionRate, 2)}</Td>
            </tr>
            <tr>
              <RowHeader>Yield rate — closed-won per visitor</RowHeader>
              <Td numeric>{formatPercent(result.a.yieldRate, 3)}</Td>
              <Td numeric>{formatPercent(result.b.yieldRate, 3)}</Td>
            </tr>
            <tr>
              <RowHeader>Yield value — closed value per visitor</RowHeader>
              <Td numeric>{formatCurrency(result.a.yieldValue, 2)}</Td>
              <Td numeric>{formatCurrency(result.b.yieldValue, 2)}</Td>
            </tr>
            <tr>
              <RowHeader>Closed-won deals</RowHeader>
              <Td numeric muted>{formatNumber(result.a.won)}</Td>
              <Td numeric muted>{formatNumber(result.b.won)}</Td>
            </tr>
          </ResultTable>

          <StatGrid>
            <Stat
              label="Completion difference"
              value={result.completionTest.significant ? "Significant" : "Not significant"}
              tone={result.completionTest.significant ? "good" : "neutral"}
              note={significanceNote(result.completionTest.p, result.completionTest.significant)}
            />
            <Stat
              label="Outcome difference"
              value={result.yieldTest.significant ? "Significant" : "Not significant"}
              tone={result.yieldTest.significant ? "good" : "warn"}
              note={significanceNote(result.yieldTest.p, result.yieldTest.significant)}
            />
          </StatGrid>

          <StatGrid columns={2}>
            <Stat
              label="Visitors needed per variant"
              value={sampleValue}
              note="To call a difference this size on closed deals at 95% confidence and 80% power."
            />
            <Stat
              label="Visitors you have per variant"
              value={formatNumber(Math.min(result.a.visitors, result.b.visitors))}
              note="The smaller of the two arms, since that is what the test is limited by."
            />
          </StatGrid>

          <VerdictNote verdict={result.verdict} />
        </div>
      }
    />
  );
}
