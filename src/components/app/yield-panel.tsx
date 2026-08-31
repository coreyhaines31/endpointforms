import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { DataTable, Td, Th } from "@/components/app/table";
import { Stat, StatGrid, VerdictNote } from "@/components/tools/readout";
import { formatPercent } from "@/lib/tools/engine";
import { currencyLabel, formatCents } from "@/lib/yield/money";
import type { YieldGroup, YieldReport } from "@/lib/yield/types";

/**
 * Yield, on a screen (#44).
 *
 * Three rules this surface exists to keep, all of them arguments the product
 * makes out loud:
 *
 * 1. **Never instead of the raw count.** The submission count sits beside the
 *    Yield rate, always, at the same size. The *gap between them is the pitch*
 *    — "412 submissions" and "1.9% Yield" in the same sentence is the whole
 *    argument, and replacing one number with the other would just be a
 *    different dashboard telling a different single story.
 * 2. **A rate is a bracket until the window resolves.** What is shown is
 *    "at least X, at most Y, and Z are still open", because a point estimate
 *    over a window younger than the sales cycle is confidently wrong. See the
 *    header of `src/lib/yield/compute.ts` for why.
 * 3. **Every input is on the page.** Won, lost, disqualified, awaiting, deals
 *    with no value recorded, the median time to a verdict — all of it, under
 *    "How this number was made", open by default on the detail view. A number
 *    a customer cannot take apart is exactly the dishonest dashboard we
 *    position against, and hiding the workings behind a tooltip would be the
 *    same sin in a smaller font.
 *
 * Server components. Amounts are `bigint` cents and are formatted here; none of
 * this crosses to the client, where a `bigint` would not survive serialisation.
 */

export function YieldPanel({
  report,
  title = "Yield",
  description = "What these submissions turned out to be worth. Completion rate counts fills; Yield counts what closed.",
  action,
  className,
}: {
  report: YieldReport;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Panel className={className}>
      <PanelHeader title={title} description={description} action={action} />

      {report.submissions === 0 ? (
        <EmptyState title="Nothing to weigh yet.">
          Yield is completion rate with the outcome attached, so it needs
          submissions first and outcomes second. Point a form at this endpoint,
          then post back what each lead turned into — won, lost or disqualified
          — with the workspace’s verdict key or a CSV.
        </EmptyState>
      ) : (
        <>
          <PanelBody className="border-b border-border">
            <Headline report={report} />
            <div className="mt-6">
              <Bracket report={report} />
            </div>
          </PanelBody>

          <PanelBody className="border-b border-border">
            <VerdictNote verdict={report.maturity} />
          </PanelBody>

          <PanelBody className="border-b border-border">
            <StatGrid columns={3}>
              <Stat
                label="Won"
                value={count(report.won)}
                tone={report.won > 0 ? "good" : "neutral"}
                note="Reached a good verdict."
              />
              <Stat label="Lost" value={count(report.lost)} note="A real deal that went the other way." />
              <Stat
                label="Disqualified"
                value={count(report.disqualified)}
                tone={report.disqualified > 0 ? "warn" : "neutral"}
                note="Junk, spam or not a fit. Stays in the denominator — it is what the form produced."
              />
            </StatGrid>
            {report.value.length > 0 ? <ValueStats report={report} /> : <NoValue report={report} />}
          </PanelBody>

          {report.caveats.length > 0 ? (
            <PanelBody className="border-b border-border">
              <p className="font-mono text-label uppercase text-muted-foreground">
                What this number does not say
              </p>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                {report.caveats.map((caveat) => (
                  <li key={caveat} className="max-w-[68ch]">
                    {caveat}
                  </li>
                ))}
              </ul>
            </PanelBody>
          ) : null}

          <PanelBody className="border-b border-border">
            <VerdictNote verdict={report.confidence} />
          </PanelBody>

          <PanelBody>
            <Inputs report={report} />
          </PanelBody>
        </>
      )}
    </Panel>
  );
}

/**
 * The two numbers, side by side and the same size.
 *
 * Deliberately not one big number with a small one under it. Which of these is
 * the important one is the argument the customer is being invited to have, and
 * the layout should not settle it for them.
 */
function Headline({ report }: { report: YieldReport }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div>
        <p className="font-mono text-label uppercase text-muted-foreground">Submissions</p>
        <p className="mt-3 font-mono text-h2 tabular">
          <span className="text-foreground">{count(report.submissions)}</span>
        </p>
        <p className="mt-2 max-w-[34ch] text-sm text-muted-foreground">
          What every other form builder would show you, on its own.
        </p>
      </div>
      <div>
        <p className="font-mono text-label uppercase text-muted-foreground">Yield rate</p>
        <p className="mt-3 font-mono text-h2 tabular">
          <span className={report.won > 0 ? "text-signal-ink" : "text-foreground"}>
            {formatPercent(report.rate.floor, 1)}
          </span>
          {report.open > 0 ? (
            <span className="text-muted-foreground">
              {" – "}
              {formatPercent(report.rate.ceiling, 1)}
            </span>
          ) : null}
        </p>
        <p className="mt-2 max-w-[34ch] text-sm text-muted-foreground">
          {report.open > 0
            ? `${count(report.won)} of ${count(report.submissions)} closed so far, ${count(report.open)} still open. The true rate for this window is inside that range.`
            : `${count(report.won)} of ${count(report.submissions)} closed. Every submission in this window has been decided.`}
        </p>
      </div>
    </div>
  );
}

/**
 * The bracket, drawn.
 *
 * The solid bar is what has been proven; the pale one is what is still out.
 * Reading the width of the pale section is meant to be the fastest way to know
 * whether this number is ready to be acted on.
 */
function Bracket({ report }: { report: YieldReport }) {
  const floor = clampShare(report.rate.floor);
  const ceiling = clampShare(report.rate.ceiling);
  const open = Math.max(0, ceiling - floor);
  const label =
    report.open > 0
      ? `Yield rate is at least ${formatPercent(report.rate.floor, 1)} and at most ${formatPercent(report.rate.ceiling, 1)}; ${count(report.open)} of ${count(report.submissions)} submissions have no outcome yet.`
      : `Yield rate is ${formatPercent(report.rate.floor, 1)}, on a fully decided window.`;

  return (
    <div>
      <div
        role="img"
        aria-label={label}
        className="flex h-2 w-full overflow-hidden rounded-sm bg-sunken"
      >
        <div className="h-full bg-signal-ink" style={{ width: `${floor * 100}%` }} />
        <div className="h-full bg-signal/40" style={{ width: `${open * 100}%` }} />
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <div className="flex items-baseline gap-2">
          <dt className="font-mono text-label uppercase">Proven</dt>
          <dd className="tabular text-foreground">{formatPercent(report.rate.floor, 1)}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="font-mono text-label uppercase">Still possible</dt>
          <dd className="tabular text-foreground">{formatPercent(report.rate.ceiling, 1)}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="font-mono text-label uppercase">Among decided</dt>
          <dd className="tabular text-foreground">{formatPercent(report.rate.amongResolved, 1)}</dd>
        </div>
      </dl>
    </div>
  );
}

function ValueStats({ report }: { report: YieldReport }) {
  return (
    <div className="mt-6 flex flex-col gap-6">
      {report.value.map((value) => (
        <div key={value.currency ?? "none"}>
          {report.value.length > 1 ? (
            <p className="font-mono text-label uppercase text-muted-foreground">
              {currencyLabel(value.currency)}
            </p>
          ) : null}
          <StatGrid columns={3}>
            <Stat
              label="Yield value"
              value={formatCents(value.totalCents, value.currency, { decimals: 0 })}
              tone="good"
              note={`Recorded on ${count(value.wonWithValue)} won ${value.wonWithValue === 1 ? "deal" : "deals"}. A floor, not a forecast.`}
            />
            {value.perHundredSubmissionsCents !== null ? (
              <Stat
                label="Per 100 submissions"
                value={formatCents(value.perHundredSubmissionsCents, value.currency, {
                  decimals: 0,
                })}
                note={`A rate, not money received: the total spread across all ${count(report.submissions)} submissions in this window. Open submissions are in that denominator, so it can only rise.`}
              />
            ) : (
              <Stat
                label="Per submission"
                value={formatCents(value.perSubmissionCents, value.currency)}
                note={`Across all ${count(report.submissions)} submissions, open ones included. Per-100 is not shown below 100 submissions — it would be this number multiplied up rather than anything this window measured.`}
              />
            )}
            <Stat
              label="Average won deal"
              value={formatCents(value.averageWonCents, value.currency, { decimals: 0 })}
              note={
                value.concentration !== null
                  ? `Largest was ${formatCents(value.largestCents, value.currency, { decimals: 0 })} — ${formatPercent(value.concentration, 0)} of the total.`
                  : undefined
              }
            />
          </StatGrid>
        </div>
      ))}
    </div>
  );
}

function NoValue({ report }: { report: YieldReport }) {
  return (
    <p className="mt-6 max-w-[68ch] text-sm text-muted-foreground">
      No deal values have been recorded in this window, so there is a Yield rate
      but no Yield value.{" "}
      {report.won > 0
        ? `The ${count(report.won)} won ${report.won === 1 ? "deal" : "deals"} arrived without an amount. Send a value field with the outcome and this becomes money.`
        : "Nothing has closed yet."}
    </p>
  );
}

/**
 * The workings.
 *
 * A `<details>` rather than a modal or a tooltip: it is on the page, it is
 * copyable, it works with JavaScript disabled, and it is open by default,
 * because the whole claim is that we are not hiding this.
 */
function Inputs({ report }: { report: YieldReport }) {
  const { inputs } = report;
  const rows: [string, string][] = [
    ["Submissions in window", count(report.submissions)],
    ["Won", count(report.won)],
    ["Lost", count(report.lost)],
    ["Disqualified", count(report.disqualified)],
    ["Awaiting a verdict", count(report.open)],
    ["Resolved", `${count(report.resolved)} (${formatPercent(report.resolvedShare, 0)})`],
    ["Won with no value recorded", count(inputs.wonWithoutValue)],
    ["Yield rate (won ÷ submissions)", formatPercent(report.rate.floor, 2)],
    [
      "95% interval on that rate",
      report.rate.interval
        ? `${formatPercent(report.rate.interval.low, 2)}–${formatPercent(report.rate.interval.high, 2)}`
        : "—",
    ],
    ["Highest it could reach ((won + awaiting) ÷ submissions)", formatPercent(report.rate.ceiling, 2)],
    ["Rate among decided leads (won ÷ resolved)", formatPercent(report.rate.amongResolved, 2)],
    ["Reached a real conversation ((won + lost) ÷ submissions)", formatPercent(report.qualifiedShare, 2)],
    ["Junk share (disqualified ÷ resolved)", formatPercent(report.junkShare, 2)],
    ["Median days to a verdict", days(inputs.timing.medianDaysToVerdict)],
    ["Slowest tenth take", days(inputs.timing.p90DaysToVerdict)],
    ["Open and already older than that median", count(inputs.timing.awaitingOlderThanMedian)],
    ["Window", describeWindow(report)],
    ["Deleted submissions, not counted", exclusion(inputs.excluded?.deleted)],
    ["Submissions outside this window", exclusion(inputs.excluded?.outsideWindow)],
  ];

  for (const value of report.value) {
    rows.push([
      `Value recorded (${currencyLabel(value.currency)})`,
      `${formatCents(value.totalCents, value.currency)} across ${count(value.wonWithValue)} ${value.wonWithValue === 1 ? "deal" : "deals"}`,
    ]);
    rows.push([
      `Value per submission (${currencyLabel(value.currency)})`,
      formatCents(value.perSubmissionCents, value.currency),
    ]);
  }

  return (
    <details open className="group">
      <summary className="cursor-pointer list-none font-mono text-label uppercase text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        How this number was made
      </summary>
      <p className="mt-3 max-w-[68ch] text-sm text-muted-foreground">
        Every input, so the number can be checked rather than believed. An
        unresolved submission is counted as not-yet-won in the rate and is never
        counted as a loss, and anything the denominator leaves out is counted at
        the bottom — deleting submissions raises this rate, so it should not be
        possible to do it quietly.
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-border py-2"
          >
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="tabular text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/**
 * Yield for a list of things — endpoints, sources, variants.
 *
 * The submission count stays in the table for the same reason it stays on the
 * panel: a row that produced 400 submissions and no deals has to be readable as
 * exactly that.
 */
export function YieldBreakdown({
  groups,
  title,
  description,
  keyLabel,
  href,
  className,
}: {
  groups: YieldGroup[];
  title: string;
  description?: string;
  keyLabel: string;
  href?: (group: YieldGroup) => string | null;
  className?: string;
}) {
  return (
    <Panel className={className}>
      <PanelHeader title={title} description={description} />
      {groups.length === 0 ? (
        <EmptyState title="Nothing to slice yet.">
          Once submissions arrive they will be grouped here, and the groups that
          produce deals will separate from the ones that only produce fills.
        </EmptyState>
      ) : (
        <DataTable
          caption={`${title}. Submissions, Yield rate as a range while outcomes are still open, and the value recorded so far.`}
          scrollLabel={title}
          tableClassName="min-w-[40rem]"
        >
          <thead>
              <tr>
                <Th>{keyLabel}</Th>
                <Th numeric>Submissions</Th>
                <Th numeric>Won</Th>
                <Th numeric>Yield rate</Th>
                <Th numeric>Open</Th>
                <Th numeric>Value</Th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {groups.map((group) => {
                const link = href?.(group) ?? null;
                const value = group.report.value[0];
                return (
                  <tr key={group.key ?? "none"}>
                    <Td>
                      {link ? (
                        <a
                          href={link}
                          className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {group.label}
                        </a>
                      ) : (
                        group.label
                      )}
                    </Td>
                    <Td numeric>{count(group.report.submissions)}</Td>
                    <Td numeric>{count(group.report.won)}</Td>
                    <Td numeric>
                      {formatPercent(group.report.rate.floor, 1)}
                      {group.report.open > 0 ? (
                        <span className="text-muted-foreground">
                          {" – "}
                          {formatPercent(group.report.rate.ceiling, 1)}
                        </span>
                      ) : null}
                    </Td>
                    <Td numeric dim>
                      {count(group.report.open)}
                    </Td>
                    <Td numeric>
                      {value
                        ? formatCents(value.totalCents, value.currency, { decimals: 0 })
                        : "—"}
                    </Td>
                  </tr>
                );
              })}
          </tbody>
        </DataTable>
      )}
      <PanelBody className="border-t border-border">
        <p className="max-w-[68ch] text-sm text-muted-foreground">
          A range means outcomes are still open in that row: the rate is at least
          the first number and at most the second. Rows are ordered by the proven
          rate, which is not the same as a winner — ranking two of these against
          each other needs the outcomes to have landed first.
        </p>
      </PanelBody>
    </Panel>
  );
}

function clampShare(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function count(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * An exclusion count.
 *
 * `undefined` means the read did not measure it, which is not the same as none
 * and must not print as "0" — a zero here is a claim that nothing was left out.
 */
function exclusion(value: number | undefined): string {
  return value === undefined ? "not measured for this view" : count(value);
}

function days(value: number | null): string {
  if (value === null) return "—";
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${rounded === 1 ? "day" : "days"}`;
}

function describeWindow(report: YieldReport): string {
  const { from, to } = report.scope;
  const format = (date: Date) => date.toISOString().slice(0, 10);
  if (from && to) return `${format(from)} to ${format(to)}`;
  if (from) return `since ${format(from)}`;
  if (to) return `up to ${format(to)}`;
  const first = report.inputs.firstSubmissionAt;
  return first ? `everything since ${format(first)}` : "everything";
}
