import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { DataTable, Td, Th } from "@/components/app/table";
import { VerdictNote } from "@/components/tools/readout";
import { formatNumber, formatPercent } from "@/lib/tools/engine";
import type {
  HindsightReport,
  RankingBasis,
  Requirement,
  VariantArm,
} from "@/lib/hindsight/types";
import { currencyLabel, formatCents } from "@/lib/yield/money";
import { cn } from "@/lib/utils";

/**
 * Hindsight, on a screen (#45).
 *
 * Four rules, all of them arguments the product makes out loud and one of them
 * the single most persuasive thing it can put in front of a person:
 *
 * 1. **Both scoreboards, always, no toggle.** Completion rate and Yield sit at
 *    the same size in the same card for every arm. A toggle would let a
 *    customer pick the number that flatters the decision they already made,
 *    which is the dishonest dashboard we position against, rebuilt as a
 *    preference. `/features/form-split-testing` promises this in those words.
 * 2. **The disagreement is the headline when it happens.** The case where the
 *    variant that collects more submissions closes fewer deals is the whole
 *    argument for the product, and it gets a callout above the table rather
 *    than a footnote below it.
 * 3. **"Not yet" is a first-class state with a checklist under it.** Every gate
 *    the decision passed through is printed, met or not, with what it has and
 *    what it needs. A refusal with no route out of it is indistinguishable
 *    from a broken feature.
 * 4. **Every input is on the page.** Views, submissions, won, lost,
 *    disqualified, awaiting, the p-value, the corrected threshold, the required
 *    sample — all of it, under "How this was decided". A number a customer
 *    cannot take apart is the thing we are arguing against.
 *
 * Server components. Amounts are `bigint` cents and are formatted here; none of
 * this crosses to the client, where a `bigint` would not survive
 * serialisation. Same arrangement as `yield-panel.tsx`.
 */

export function HindsightPanel({
  report,
  action,
  className,
}: {
  report: HindsightReport;
  action?: React.ReactNode;
  className?: string;
}) {
  const populated = report.arms.some((arm) => arm.report.submissions > 0);

  return (
    <Panel className={className}>
      <PanelHeader
        title={report.test.name}
        description="Variants ranked on Yield — what the submissions turned out to be worth — beside the completion rate every other form builder would rank them on."
        action={action}
      />

      <PanelBody className="border-b border-border">
        <StatusLine report={report} />
      </PanelBody>

      {populated ? (
        <>
          {report.disagree ? (
            <PanelBody className="border-b border-border">
              <Disagreement report={report} />
            </PanelBody>
          ) : null}

          <PanelBody className="border-b border-border">
            <Scoreboard report={report} />
          </PanelBody>

          <PanelBody className="border-b border-border">
            <VerdictNote verdict={report.decision} />
          </PanelBody>

          <PanelBody className="border-b border-border">
            <Requirements requirements={report.requirements} state={report.state} />
          </PanelBody>

          {report.whatWouldChangeThis.length > 0 ? (
            <PanelBody className="border-b border-border">
              <SectionLabel>What would change this</SectionLabel>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                {report.whatWouldChangeThis.map((line) => (
                  <li key={line} className="max-w-[68ch]">
                    {line}
                  </li>
                ))}
              </ul>
            </PanelBody>
          ) : null}

          {report.caveats.length > 0 ? (
            <PanelBody className="border-b border-border">
              <SectionLabel>What this does not say</SectionLabel>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                {report.caveats.map((caveat) => (
                  <li key={caveat} className="max-w-[68ch]">
                    {caveat}
                  </li>
                ))}
              </ul>
            </PanelBody>
          ) : null}

          <PanelBody>
            <Workings report={report} />
          </PanelBody>
        </>
      ) : (
        <>
          <EmptyState title="Nothing has been served yet.">
            Start the test and traffic splits between the arms below. Submissions
            land against whichever variant the visitor was shown; the outcomes
            follow weeks later, and this panel says what it can at every stage in
            between — including that it cannot say anything yet.
          </EmptyState>
          <PanelBody className="border-t border-border">
            <Scoreboard report={report} />
          </PanelBody>
        </>
      )}
    </Panel>
  );
}

/** Status, arms and how long it has been running, in one line above everything. */
function StatusLine({ report }: { report: HindsightReport }) {
  const { test, runningDays } = report;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
      <StatusChip status={test.status} />
      <span>
        {formatNumber(test.variants.length)} {test.variants.length === 1 ? "arm" : "arms"}
      </span>
      <span>
        {runningDays === null
          ? "not started"
          : `running ${describeDays(runningDays)}${test.stoppedAt ? " before it was stopped" : ""}`}
      </span>
      <span>
        {report.basis === "exposure"
          ? "Ranked per visitor shown the form"
          : "Ranked per submission — no view count for these arms"}
      </span>
    </div>
  );
}

function StatusChip({ status }: { status: HindsightReport["test"]["status"] }) {
  // Deliberately a template literal rather than cn(). twMerge classifies
  // `text-label` as a colour and silently drops it next to `text-signal-ink`,
  // which renders the chip at body size — verified against tailwind-merge
  // directly, not assumed. Same caveat as `src/components/prose.tsx` and
  // `src/components/tools/readout.tsx`.
  const tone =
    status === "running"
      ? "border-signal-edge/30 bg-signal/15 text-signal-ink"
      : "border-border text-muted-foreground";

  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-label uppercase ${tone}`}
    >
      {status}
    </span>
  );
}

/**
 * The callout this whole product exists to be able to show.
 *
 * One variant collected more submissions. A different one produced more closed
 * business. Every other form builder in the category would have shipped the
 * first, because the first is the only thing it can see. Deliberately stated
 * before the table and deliberately *without* a claim about significance — that
 * is a separate, much more reluctant sentence, and it lives in the verdict
 * below.
 */
function Disagreement({ report }: { report: HindsightReport }) {
  const fills = armById(report, report.completionLeader);
  const money = armById(report, report.yieldLeader);
  if (!fills || !money) return null;

  return (
    <div className="border-l-2 border-signal-ink pl-5">
      <p className="font-mono text-label uppercase text-signal-ink">The two metrics disagree</p>
      <p className="mt-3 max-w-[62ch] text-base font-medium text-foreground">
        {fills.variant.name} collects more submissions. {money.variant.name} produces
        more closed business.
      </p>
      <p className="mt-3 max-w-[68ch] text-base text-muted-foreground">
        {fills.variant.name} is ahead on completion rate at{" "}
        <span className="tabular text-foreground">
          {formatPercent(fills.completionRate, 1)}
        </span>{" "}
        against {formatPercent(money.completionRate, 1)}, and behind on Yield at{" "}
        <span className="tabular text-foreground">
          {formatPercent(rate(fills, report.basis), 2)}
        </span>{" "}
        against {formatPercent(rate(money, report.basis), 2)}. A split test that ranks
        on fills would ship {fills.variant.name}.
      </p>
      {/* The claim, qualified in the same block rather than in the verdict
          below it.

          A disagreement between the two metrics is a fact about the numbers and
          is reported whenever it is true, including on a test far too young to
          mean anything. But this is the most screenshot-able thing on the page,
          and a screenshot does not travel with the caveat underneath it — the
          same argument that makes the Yield panel withhold "per 100
          submissions" below a hundred submissions rather than footnote it. So
          when the test has not cleared its gates, the sentence that says so is
          inside the callout. */}
      <p className="mt-3 max-w-[68ch] text-base text-muted-foreground">
        {report.state === "winner" ? (
          <>
            That gap clears the significance threshold and both arms have the
            sample it requires, so this one is real.
          </>
        ) : (
          <>
            <span className="text-foreground">
              This test has not concluded, so that gap is not yet a finding.
            </span>{" "}
            {report.decision.headline}. Two metrics can rank two variants in
            opposite directions by chance, and on this much data they often do.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Each arm as a card, with its two numbers at the same size.
 *
 * Not one big number and one small one. Which of these matters is the argument
 * the customer is being invited to have, and the layout must not settle it for
 * them — the same rule the Yield panel's headline follows.
 */
function Scoreboard({ report }: { report: HindsightReport }) {
  return (
    <div>
      <div
        className={cn(
          "grid grid-cols-1 gap-x-6 gap-y-8",
          report.arms.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {report.arms.map((arm) => (
          <ArmCard key={arm.variant.id} arm={arm} report={report} />
        ))}
      </div>
      <ArmTable report={report} />
    </div>
  );
}

function ArmCard({ arm, report }: { arm: VariantArm; report: HindsightReport }) {
  const isFillLeader = report.completionLeader === arm.variant.id;
  const isYieldLeader = report.yieldLeader === arm.variant.id;
  const value = arm.report.value[0];

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-base font-medium text-foreground">{arm.variant.name}</h3>
        {arm.variant.isControl ? (
          <span className="font-mono text-label uppercase text-muted-foreground">control</span>
        ) : null}
        {arm.srmSuspect ? (
          <span className="font-mono text-label uppercase text-destructive">
            traffic split off
          </span>
        ) : null}
      </div>

      <dl className="mt-4 flex flex-col gap-5">
        <div>
          <dt className="font-mono text-label uppercase text-muted-foreground">
            Completion rate
          </dt>
          <dd className="mt-2">
            {/* Size token and colour never share a cn() call — twMerge reads
                `text-h3` as a colour and drops it. See src/components/prose.tsx. */}
            <span className="font-mono text-h3 tabular">
              <span className="text-foreground">{formatPercent(arm.completionRate, 1)}</span>
            </span>
            {isFillLeader ? <Ahead>Ahead on fills</Ahead> : null}
            <p className="mt-2 max-w-[32ch] text-sm text-muted-foreground">
              {arm.exposures === null
                ? `${formatNumber(arm.report.submissions)} submissions. No view count for this arm, so there is no rate — only the count.`
                : `${formatNumber(arm.report.submissions)} submissions from ${formatNumber(arm.exposures)} views. What every other form builder would rank on.`}
            </p>
          </dd>
        </div>

        <div>
          <dt className="font-mono text-label uppercase text-muted-foreground">Yield rate</dt>
          <dd className="mt-2">
            <span className="font-mono text-h3 tabular">
              <span className={arm.report.won > 0 ? "text-signal-ink" : "text-foreground"}>
                {formatPercent(rate(arm, report.basis), 2)}
              </span>
            </span>
            {isYieldLeader ? <Ahead>Ahead on money</Ahead> : null}
            <p className="mt-2 max-w-[32ch] text-sm text-muted-foreground">
              {formatNumber(arm.report.won)} closed{" "}
              {report.basis === "exposure"
                ? `from ${formatNumber(arm.exposures ?? 0)} views`
                : `from ${formatNumber(arm.report.submissions)} submissions`}
              {value
                ? `, worth ${formatCents(value.totalCents, value.currency, { decimals: 0 })}`
                : ""}
              .{" "}
              {arm.report.open > 0
                ? `${formatNumber(arm.report.open)} still awaiting a verdict, so this can only rise.`
                : "Every submission in this arm has been decided."}
            </p>
          </dd>
        </div>
      </dl>

      <Maturity arm={arm} />
    </div>
  );
}

/**
 * How much of this arm is actually decided, drawn.
 *
 * The same bar as the Yield panel's bracket and for the same reason: the
 * fastest way to know whether a number is ready to act on is to see how much of
 * it is still out. Here it does a second job — two arms with visibly different
 * amounts of pale bar are two arms that cannot yet be compared, whatever the
 * rates above them say.
 */
function Maturity({ arm }: { arm: VariantArm }) {
  const decided = clampShare(arm.resolvedShare);
  return (
    <div className="mt-5">
      <div
        role="img"
        aria-label={`${formatPercent(arm.resolvedShare, 0)} of ${arm.variant.name}'s submissions have an outcome; ${formatNumber(arm.report.open)} are still awaiting one.`}
        className="flex h-1.5 w-full overflow-hidden rounded-sm bg-sunken"
      >
        <div className="h-full bg-signal-ink" style={{ width: `${decided * 100}%` }} />
      </div>
      <p className="mt-2 font-mono text-label uppercase text-muted-foreground">
        {formatPercent(arm.resolvedShare, 0)} decided
      </p>
    </div>
  );
}

function Ahead({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-3 inline-flex items-center rounded-sm border border-signal-edge/30 bg-signal/15 px-1.5 py-0.5 align-middle font-mono text-label uppercase text-signal-ink">
      {children}
    </span>
  );
}

/** The same arms as numbers, for anyone who would rather read a table. */
function ArmTable({ report }: { report: HindsightReport }) {
  return (
    <div className="mt-8">
      <DataTable
        caption="Every arm of this test: views, submissions, completion rate, closed deals, Yield rate and recorded value."
        scrollLabel="Variant scoreboard"
        tableClassName="min-w-[46rem]"
      >
        <thead>
          <tr>
            <Th>Variant</Th>
            <Th numeric>Views</Th>
            <Th numeric>Submissions</Th>
            <Th numeric>Completion</Th>
            <Th numeric>Won</Th>
            <Th numeric>Yield</Th>
            <Th numeric>Open</Th>
            <Th numeric>Value</Th>
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {report.arms.map((arm) => {
            const value = arm.report.value[0];
            return (
              <tr key={arm.variant.id}>
                <Td>
                  {arm.variant.name}
                  {arm.variant.isControl ? (
                    <span className="ml-2 font-mono text-label uppercase text-muted-foreground">
                      control
                    </span>
                  ) : null}
                </Td>
                <Td numeric dim>
                  {arm.exposures === null ? "—" : formatNumber(arm.exposures)}
                </Td>
                <Td numeric>{formatNumber(arm.report.submissions)}</Td>
                <Td numeric>{formatPercent(arm.completionRate, 1)}</Td>
                <Td numeric>{formatNumber(arm.report.won)}</Td>
                <Td numeric>{formatPercent(rate(arm, report.basis), 2)}</Td>
                <Td numeric dim>
                  {formatNumber(arm.report.open)}
                </Td>
                <Td numeric>
                  {value ? formatCents(value.totalCents, value.currency, { decimals: 0 }) : "—"}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}

/**
 * The gates, met or not.
 *
 * This is what turns "not yet" from a mood into a checklist with a bottom to
 * it. Printed in full whatever the state, including when the test *has* called
 * a winner — a customer who can see which bars were cleared is a customer who
 * can judge the call rather than take it.
 */
function Requirements({
  requirements,
  state,
}: {
  requirements: Requirement[];
  state: HindsightReport["state"];
}) {
  const met = requirements.filter((requirement) => requirement.met).length;

  return (
    <div>
      <SectionLabel>
        {state === "winner"
          ? `How this was cleared — ${met} of ${requirements.length}`
          : `Not called yet — ${met} of ${requirements.length} conditions met`}
      </SectionLabel>
      <dl className="mt-4 grid grid-cols-1">
        {requirements.map((requirement) => (
          <div
            key={requirement.label}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-2.5"
          >
            <dt className="flex items-baseline gap-2.5 text-sm">
              <span
                aria-hidden
                className={cn(
                  "inline-block size-1.5 shrink-0 translate-y-[-1px] rounded-full",
                  requirement.met ? "bg-signal-ink" : "bg-border-control",
                )}
              />
              <span className={requirement.met ? "text-foreground" : "text-muted-foreground"}>
                {requirement.label}
              </span>
              <span className="sr-only">{requirement.met ? "met" : "not met"}</span>
            </dt>
            {/* "have · needs need", not "have of need". Several of these
                carry a qualifier — "80 in Seven fields", "p = 0.001" — and
                "of" between two such phrases reads as part of the number
                rather than as a comparison. */}
            <dd className="tabular text-sm text-muted-foreground">
              {requirement.have}
              {requirement.need === null ? null : (
                <>
                  <span aria-hidden> · </span>
                  <span className="sr-only">, </span>
                  needs <span className="text-foreground">{requirement.need}</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The workings.
 *
 * A `<details>` rather than a modal or a tooltip, open by default, matching the
 * Yield panel: it is on the page, it is copyable, it works with JavaScript
 * disabled, and the whole claim is that we are not hiding it.
 */
function Workings({ report }: { report: HindsightReport }) {
  const rows: [string, string][] = [
    ["Ranking metric", report.basis === "exposure" ? "Closed deals ÷ views" : "Closed deals ÷ submissions"],
    ["Test running for", report.runningDays === null ? "not started" : describeDays(report.runningDays)],
    ["Median days to a verdict", days(report.timing.medianDaysToVerdict)],
    ["Slowest tenth take", days(report.timing.p90DaysToVerdict)],
    ["Open and already older than that median", formatNumber(report.timing.awaitingOlderThanMedian)],
    ["Decision state", report.state.replace(/_/g, " ")],
  ];

  for (const arm of report.arms) {
    const prefix = arm.variant.name;
    rows.push([`${prefix} — views`, arm.exposures === null ? "not counted" : formatNumber(arm.exposures)]);
    rows.push([`${prefix} — traffic share, planned vs actual`, `${formatPercent(arm.plannedShare, 0)} vs ${formatPercent(arm.observedShare, 0)}`]);
    rows.push([`${prefix} — submissions`, formatNumber(arm.report.submissions)]);
    rows.push([
      `${prefix} — won / lost / disqualified / awaiting`,
      `${formatNumber(arm.report.won)} / ${formatNumber(arm.report.lost)} / ${formatNumber(arm.report.disqualified)} / ${formatNumber(arm.report.open)}`,
    ]);
    rows.push([`${prefix} — Yield rate`, formatPercent(rate(arm, report.basis), 3)]);
    rows.push([
      `${prefix} — 95% interval on that rate`,
      arm.interval
        ? `${formatPercent(arm.interval.low, 3)}–${formatPercent(arm.interval.high, 3)}`
        : "—",
    ]);
    for (const value of arm.report.value) {
      rows.push([
        `${prefix} — value recorded (${currencyLabel(value.currency)})`,
        `${formatCents(value.totalCents, value.currency)} across ${formatNumber(value.wonWithValue)} ${value.wonWithValue === 1 ? "deal" : "deals"}`,
      ]);
    }
  }

  // Both sets, and labelled with which baseline each used. They are the same
  // list whenever the control is the front-runner; when it is not, the
  // leader-based set is the one that decided the outcome and hiding it would
  // make the verdict unauditable.
  const control = report.arms.find((arm) => arm.variant.isControl) ?? null;
  const leader = armById(report, report.yieldLeader);
  const sets: [string, typeof report.comparisons][] = [
    [`vs ${control?.variant.name ?? "control"}`, report.comparisons],
  ];
  if (leader && control && leader.variant.id !== control.variant.id) {
    sets.push([`vs ${leader.variant.name}, the front-runner`, report.leaderComparisons]);
  }

  for (const [baseline, set] of sets)
  for (const comparison of set) {
    const challenger = armById(report, comparison.challengerId);
    const prefix = `${challenger?.variant.name ?? "challenger"} ${baseline}`;
    rows.push([
      `${prefix} — p-value`,
      comparison.test.p === null ? "no test possible" : comparison.test.p.toFixed(4),
    ]);
    rows.push([`${prefix} — threshold after correction`, comparison.alpha.toFixed(4)]);
    rows.push([
      `${prefix} — sample this difference needs, per arm`,
      comparison.requiredPerArm === null ? "—" : formatNumber(comparison.requiredPerArm),
    ]);
    rows.push([
      `${prefix} — still short by, per arm`,
      comparison.shortfallPerArm === null ? "—" : formatNumber(comparison.shortfallPerArm),
    ]);
  }

  if (report.calculator) {
    rows.push([
      "The public calculator, on these same numbers",
      report.calculator.verdict.headline,
    ]);
  }

  return (
    <details open className="group">
      <summary className="cursor-pointer list-none font-mono text-label uppercase text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        How this was decided
      </summary>
      <p className="mt-3 max-w-[68ch] text-sm text-muted-foreground">
        Every input, so the call can be checked rather than believed. An
        unresolved submission counts as not-yet-won and is never counted as a
        loss, so each Yield rate here is a floor that can only rise. A winner
        needs the difference to clear the corrected threshold{" "}
        <em>and</em> both arms to have reached the sample that difference
        requires — because this page recomputes every time it is opened, and
        stopping the first time a p-value goes green is how a split test reports
        a coin flip as a finding.
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

/** A list of tests on an endpoint. Deliberately says nothing about who is winning. */
export function HindsightList({
  tests,
  href,
  className,
  action,
}: {
  tests: {
    publicId: string;
    name: string;
    status: HindsightReport["test"]["status"];
    variants: number;
    startedAt: Date | null;
  }[];
  href: (publicId: string) => string;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Panel className={className}>
      <PanelHeader
        title="Hindsight tests"
        description="Split tests on this endpoint, ranked on what the submissions turned out to be worth rather than on how many of them there were."
        action={action}
      />
      {tests.length === 0 ? (
        <EmptyState title="No tests on this endpoint yet.">
          A Hindsight test runs two or more versions of this form and ranks them
          on Yield. It will not declare a winner until the outcomes have landed,
          which is usually weeks — so the sooner one starts, the sooner it has
          something to say.
        </EmptyState>
      ) : (
        <DataTable
          caption="Split tests on this endpoint, with their status and how many arms each has."
          scrollLabel="Hindsight tests"
          tableClassName="min-w-[32rem]"
        >
          <thead>
            <tr>
              <Th>Test</Th>
              <Th>Status</Th>
              <Th numeric>Arms</Th>
              <Th>Started</Th>
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-b-0">
            {tests.map((test) => (
              <tr key={test.publicId}>
                <Td>
                  <a
                    href={href(test.publicId)}
                    className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {test.name}
                  </a>
                </Td>
                <Td>
                  <StatusChip status={test.status} />
                </Td>
                <Td numeric>{formatNumber(test.variants)}</Td>
                <Td dim>
                  {test.startedAt ? test.startedAt.toISOString().slice(0, 10) : "not started"}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-label uppercase text-muted-foreground">{children}</p>
  );
}

function armById(report: HindsightReport, id: string | null): VariantArm | null {
  if (id === null) return null;
  return report.arms.find((arm) => arm.variant.id === id) ?? null;
}

function rate(arm: VariantArm, basis: RankingBasis): number | null {
  return basis === "exposure" ? arm.yieldRatePerExposure : arm.yieldRatePerSubmission;
}

function clampShare(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function describeDays(value: number): string {
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${rounded === 1 ? "day" : "days"}`;
}

function days(value: number | null): string {
  return value === null ? "—" : describeDays(value);
}
