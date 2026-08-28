"use client";

import {
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
  computeResponseCost,
  formatCurrency,
  formatNumber,
  responseCostFields,
} from "@/lib/tools/engine";

export function ResponseCostCalculator() {
  const form = useToolInputs(responseCostFields);
  const result = computeResponseCost(form.values);
  const live = result.plans.filter((plan) => plan.inUse);

  return (
    <CalculatorFrame
      onReset={form.reset}
      pristine={form.pristine}
      inputs={
        <>
          <FieldGroup
            legend="Your form"
            specs={responseCostFields}
            keys={["submissions", "junkPct"]}
            form={form}
          />
          <FieldGroup
            legend="Plan A"
            specs={responseCostFields}
            keys={["aPrice", "aIncluded", "aOverage"]}
            form={form}
          />
          <FieldGroup
            legend="Plan B"
            specs={responseCostFields}
            keys={["bPrice", "bIncluded", "bOverage"]}
            form={form}
          />
          <FieldGroup
            legend="Plan C"
            hint="Leave all three at zero if you are only comparing two."
            specs={responseCostFields}
            keys={["cPrice", "cIncluded", "cOverage"]}
            form={form}
          />
        </>
      }
      result={
        <div className="flex flex-col gap-8">
          <ResultHeadline
            label="Cheapest per usable response"
            value={result.cheapestPerUsable ? result.cheapestPerUsable.label : "—"}
            sub={
              result.flipped ? (
                <>
                  {result.cheapestHeadline?.label} has the smaller monthly bill.{" "}
                  {result.cheapestPerUsable?.label} is cheaper for every lead you
                  can actually sell to.
                </>
              ) : result.cheapestPerUsable ? (
                <>
                  At{" "}
                  {formatCurrency(result.cheapestPerUsable.costPerUsableResponse, 3)}{" "}
                  per usable response, against{" "}
                  {formatCurrency(result.cheapestPerUsable.costPerResponse, 3)} per
                  response of any kind.
                </>
              ) : (
                "Fill in at least one plan."
              )
            }
          />

          <StatGrid>
            <Stat
              label="Submissions a month"
              value={formatNumber(result.submissions)}
            />
            <Stat
              label="Of those, usable"
              value={formatNumber(result.usable)}
              note="The rest consume your allowance identically and cannot be sold to."
            />
          </StatGrid>

          <ResultTable
            head={
              <>
                <Th>Plan</Th>
                <Th numeric>Monthly bill</Th>
                <Th numeric>Per response</Th>
                <Th numeric>Per usable</Th>
                <Th numeric>Spent on junk</Th>
              </>
            }
            caption="Each plan priced on your volume and junk rate"
          >
            {live.length === 0 ? (
              <tr>
                <Td muted>No plans entered yet</Td>
                <Td numeric muted>—</Td>
                <Td numeric muted>—</Td>
                <Td numeric muted>—</Td>
                <Td numeric muted>—</Td>
              </tr>
            ) : (
              live.map((plan) => (
                <tr key={plan.id}>
                  <RowHeader>{plan.label}</RowHeader>
                  <Td numeric>{formatCurrency(plan.total, 2)}</Td>
                  <Td numeric>{formatCurrency(plan.costPerResponse, 3)}</Td>
                  <Td numeric>{formatCurrency(plan.costPerUsableResponse, 3)}</Td>
                  <Td numeric muted>{formatCurrency(plan.junkCost, 2)}</Td>
                </tr>
              ))
            )}
          </ResultTable>

          {live.length > 0 ? (
            <div className="flex flex-col gap-3">
              {live.map((plan) => (
                <p key={plan.id} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{plan.label}:</span>{" "}
                  {plan.overageUnits > 0
                    ? `${formatNumber(plan.overageUnits)} responses past the allowance, billed at ${formatCurrency(plan.overageUnits > 0 ? plan.overageCost / plan.overageUnits : null, 3)} each.`
                    : "Inside the allowance, no overage."}{" "}
                  {plan.included > 0
                    ? `Junk consumed ${formatNumber(plan.includedEatenByJunk)} of the ${formatNumber(plan.included)} responses you paid for up front.`
                    : "No included allowance to consume."}
                  {plan.capped
                    ? " With no overage price entered, everything past the allowance is treated as free — most plans instead stop accepting submissions, which is worse."
                    : ""}
                </p>
              ))}
            </div>
          ) : null}

          <VerdictNote verdict={result.verdict} />
        </div>
      }
    />
  );
}
