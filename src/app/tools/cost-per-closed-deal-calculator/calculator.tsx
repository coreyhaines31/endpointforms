"use client";

import {
  ResultHeadline,
  ResultTable,
  RowHeader,
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
  closedDealFields,
  computeClosedDeal,
  formatCurrency,
  formatMultiple,
  formatNumber,
  formatPercent,
} from "@/lib/tools/engine";

const nameOf = (id: "a" | "b" | "tie" | null) =>
  id === "a" ? "Campaign A" : id === "b" ? "Campaign B" : id === "tie" ? "Neither" : "—";

export function ClosedDealCalculator() {
  const form = useToolInputs(closedDealFields);
  const result = computeClosedDeal(form.values);

  const winner = result.dealWinner;
  const winnerResult = winner === "a" ? result.a : winner === "b" ? result.b : null;

  return (
    <CalculatorFrame
      onReset={form.reset}
      pristine={form.pristine}
      inputs={
        <>
          <FieldGroup
            legend="Campaign A"
            hint="The one with the cost per lead you are happy about."
            specs={closedDealFields}
            keys={["aSpend", "aLeads", "aCloseRate", "aDealValue"]}
            form={form}
          />
          <FieldGroup
            legend="Campaign B"
            hint="The one your CFO keeps asking about."
            specs={closedDealFields}
            keys={["bSpend", "bLeads", "bCloseRate", "bDealValue"]}
            form={form}
          />
        </>
      }
      result={
        <div className="flex flex-col gap-8">
          <ResultHeadline
            label="Cheaper per closed deal"
            value={nameOf(result.dealWinner)}
            sub={
              result.flipped ? (
                <>
                  {nameOf(result.cplWinner)} wins on cost per lead by{" "}
                  {formatMultiple(result.cplGap, 2)} and loses on cost per closed
                  deal by {formatMultiple(result.dealGap, 2)}. The two metrics
                  rank these campaigns in opposite directions.
                </>
              ) : winnerResult ? (
                <>
                  At {formatCurrency(winnerResult.costPerDeal)} per closed deal,
                  {" "}
                  {formatMultiple(result.dealGap, 2)} cheaper than the other one.
                  Cost per lead agrees.
                </>
              ) : (
                "Not computable until at least one campaign closes something."
              )
            }
          />

          <ResultTable head={<><Th>Metric</Th><Th numeric>Campaign A</Th><Th numeric>Campaign B</Th></>} caption="Campaign A and Campaign B compared on six metrics">
            <tr>
              <RowHeader>Cost per lead</RowHeader>
              <Td numeric>{formatCurrency(result.a.cpl, 2)}</Td>
              <Td numeric>{formatCurrency(result.b.cpl, 2)}</Td>
            </tr>
            <tr>
              <RowHeader>Closed deals</RowHeader>
              <Td numeric>{formatNumber(result.a.deals, 1)}</Td>
              <Td numeric>{formatNumber(result.b.deals, 1)}</Td>
            </tr>
            <tr>
              <RowHeader>Cost per closed deal</RowHeader>
              <Td numeric>{formatCurrency(result.a.costPerDeal)}</Td>
              <Td numeric>{formatCurrency(result.b.costPerDeal)}</Td>
            </tr>
            <tr>
              <RowHeader>Revenue</RowHeader>
              <Td numeric>{formatCurrency(result.a.revenue)}</Td>
              <Td numeric>{formatCurrency(result.b.revenue)}</Td>
            </tr>
            <tr>
              <RowHeader>Return on ad spend</RowHeader>
              <Td numeric>{formatMultiple(result.a.roas, 2)}</Td>
              <Td numeric>{formatMultiple(result.b.roas, 2)}</Td>
            </tr>
            <tr>
              <RowHeader>Revenue less spend</RowHeader>
              <Td numeric>{formatCurrency(result.a.profit)}</Td>
              <Td numeric>{formatCurrency(result.b.profit)}</Td>
            </tr>
            <tr>
              <RowHeader>Share of submissions that close</RowHeader>
              <Td numeric muted>{formatPercent(result.a.leads > 0 ? result.a.deals / result.a.leads : null, 2)}</Td>
              <Td numeric muted>{formatPercent(result.b.leads > 0 ? result.b.deals / result.b.leads : null, 2)}</Td>
            </tr>
          </ResultTable>

          <VerdictNote verdict={result.verdict} />
        </div>
      }
    />
  );
}
