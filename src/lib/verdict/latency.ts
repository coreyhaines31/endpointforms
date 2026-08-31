import { eq, gte, lte, sql } from "drizzle-orm";

import { withWorkspace, type WorkspaceScope } from "../../db/scoped.ts";
import { submissions } from "../../db/schema.ts";
import { computeTimeToOutcome, type TimeToOutcomeResult, type Verdict } from "../tools/engine.ts";

/**
 * How long this workspace actually takes to decide, and whether the loop works.
 *
 * `docs/01` Risk 4 is the reason this file exists: *"you need to consider how
 * fast you or your client can qualify the leads, because if it's not immediate,
 * like 1-2 days, that will also hurt the feedback loop"*. A 90-day sales cycle
 * makes form-level learning nearly useless, and the honest thing — the thing
 * `/tools/time-to-outcome-calculator` already tells strangers on the marketing
 * site — is to say so.
 *
 * The product cannot say something softer to a paying customer than the
 * calculator says to a visitor who has not paid us anything. So this does not
 * have its own opinion: it measures the four inputs the public tool asks a
 * visitor to type — volume, graded share, close rate, median days to
 * disposition — and hands them to `computeTimeToOutcome`, the same function
 * that renders the tool. One arithmetic, two front doors. Changing the bands to
 * flatter the product would visibly change the marketing site too.
 *
 * There is no UI here on purpose (#43 scope): this is a function other people's
 * surfaces call.
 */

/** Below this, a median is noise and the honest answer is "not yet". */
const MIN_GRADED = 8;

/** Below this share of leads ever getting a disposition, latency is not the problem. */
const MIN_GRADED_SHARE = 0.25;

/** Default measurement window. Two quarters covers a slow cycle without ancient data. */
export const DEFAULT_WINDOW_DAYS = 180;

const SECONDS_PER_DAY = 86_400;

export type TimeToOutcomeMeasurement = {
  windowDays: number;
  /** Days actually observed — a workspace three days old is not measured over 180. */
  observedDays: number;
  submissions: number;
  /** Submissions carrying a real verdict and a timestamp for it. */
  graded: number;
  won: number;
  lost: number;
  disqualified: number;
  awaiting: number;
  /** `graded / submissions`. The CRM-hygiene number (Risk 3). */
  gradedShare: number;
  /** Median days from submission to verdict. Null when nothing is graded. */
  medianDays: number | null;
  /** The long tail the calculator's own copy warns a median hides. */
  p90Days: number | null;
  /**
   * Ungraded submissions already older than the median.
   *
   * The measurement is censored: a median over decided leads cannot see the
   * ones still open, so a workspace whose slow deals never resolve looks faster
   * than it is. This is the count that says how much of that is happening.
   */
  awaitingOlderThanMedian: number;
  submissionsPerMonth: number;
  closeRate: number;
  /** The public calculator's own projection, run on measured inputs. */
  projection: TimeToOutcomeResult | null;
  /**
   * The cycle length on its own — Risk 4, and nothing else.
   *
   * Separate from `assessment` because "your leads take four months to
   * disposition" and "you do not have the volume to call a split test" are
   * different problems with different answers, and a single headline that
   * collapses them tells a fast, small workspace that its outcome data is
   * worthless when in fact its ledger is fine and only the test is out of reach.
   */
  latency: Verdict;
  /** What to tell the customer. Shares `Verdict` with the marketing tools. */
  assessment: Verdict;
};

export type MeasureOptions = {
  windowDays?: number;
  /** Relative improvement the projection should be able to detect, as a percent. */
  detectableLiftPct?: number;
  /** Variants in a hypothetical test, including the control. */
  variants?: number;
  now?: Date;
};

/** Measures one workspace. Opens its own scoped transaction. */
export async function measureTimeToOutcome(
  workspaceId: string,
  options: MeasureOptions = {},
): Promise<TimeToOutcomeMeasurement> {
  return withWorkspace(workspaceId, (ws) => measureTimeToOutcomeIn(ws, options));
}

/** The same measurement inside a transaction a caller already opened. */
export async function measureTimeToOutcomeIn(
  ws: WorkspaceScope,
  options: MeasureOptions = {},
): Promise<TimeToOutcomeMeasurement> {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - windowDays * SECONDS_PER_DAY * 1000);

  const decided = sql`${submissions.verdict} <> 'awaiting' and ${submissions.verdictAt} is not null and ${submissions.verdictAt} >= ${submissions.submittedAt}`;

  const [row] = await ws.tx
    .select({
      total: sql<number>`count(*)::int`,
      graded: sql<number>`(count(*) filter (where ${decided}))::int`,
      won: sql<number>`(count(*) filter (where ${submissions.verdict} = 'won'))::int`,
      lost: sql<number>`(count(*) filter (where ${submissions.verdict} = 'lost'))::int`,
      disqualified: sql<number>`(count(*) filter (where ${submissions.verdict} = 'disqualified'))::int`,
      awaiting: sql<number>`(count(*) filter (where ${submissions.verdict} = 'awaiting'))::int`,
      medianSeconds: sql<
        number | null
      >`percentile_cont(0.5) within group (order by extract(epoch from (${submissions.verdictAt} - ${submissions.submittedAt}))) filter (where ${decided})`,
      p90Seconds: sql<
        number | null
      >`percentile_cont(0.9) within group (order by extract(epoch from (${submissions.verdictAt} - ${submissions.submittedAt}))) filter (where ${decided})`,
      earliestSeconds: sql<
        number | null
      >`extract(epoch from (now() - min(${submissions.submittedAt})))`,
    })
    .from(submissions)
    .where(ws.where(submissions, gte(submissions.submittedAt, since)));

  const total = row?.total ?? 0;
  const graded = row?.graded ?? 0;
  const medianDays = toDays(row?.medianSeconds ?? null);
  const p90Days = toDays(row?.p90Seconds ?? null);

  let awaitingOlderThanMedian = 0;
  if (medianDays !== null && (row?.awaiting ?? 0) > 0) {
    const cutoff = new Date(now.getTime() - medianDays * SECONDS_PER_DAY * 1000);
    const [censored] = await ws.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .where(
        ws.where(
          submissions,
          gte(submissions.submittedAt, since),
          eq(submissions.verdict, "awaiting"),
          lte(submissions.submittedAt, cutoff),
        ),
      );
    awaitingOlderThanMedian = censored?.count ?? 0;
  }

  // A workspace two weeks old has two weeks of evidence, not six months of it.
  const observedDays = Math.max(
    1,
    Math.min(windowDays, Math.round(((row?.earliestSeconds ?? 0) / SECONDS_PER_DAY) * 10) / 10 || 1),
  );

  const submissionsPerMonth = total === 0 ? 0 : (total / observedDays) * 30.44;
  const gradedShare = total === 0 ? 0 : graded / total;
  const closeRate = total === 0 ? 0 : (row?.won ?? 0) / total;

  const projection =
    graded >= MIN_GRADED && medianDays !== null
      ? computeTimeToOutcome({
          submissions: submissionsPerMonth,
          gradeablePct: gradedShare * 100,
          closeRate: closeRate * 100,
          liftPct: options.detectableLiftPct ?? 20,
          medianDays,
          variants: options.variants ?? 2,
        })
      : null;

  const measurement: TimeToOutcomeMeasurement = {
    windowDays,
    observedDays,
    submissions: total,
    graded,
    won: row?.won ?? 0,
    lost: row?.lost ?? 0,
    disqualified: row?.disqualified ?? 0,
    awaiting: row?.awaiting ?? 0,
    gradedShare,
    medianDays,
    p90Days,
    awaitingOlderThanMedian,
    submissionsPerMonth,
    closeRate,
    projection,
    latency: { tone: "neutral", headline: "", detail: "" },
    assessment: { tone: "neutral", headline: "", detail: "" },
  };

  measurement.latency = assessLatency(measurement);
  measurement.assessment = assess(measurement);
  return measurement;
}

/**
 * Is the sales cycle itself fast enough for form-level learning?
 *
 * The bands are `docs/01` Risk 4's own numbers rather than invented ones: the
 * corpus quote is *"if it's not immediate, like 1-2 days, that will also hurt
 * the feedback loop"*, and the same section says a 90-day cycle makes
 * form-level learning nearly useless. So two days is the good case, and the
 * band that says no starts well before ninety — a verdict that arrives after
 * six weeks is attached to a form that has since changed.
 *
 * This deliberately says nothing about volume. `assess` handles that, by asking
 * the public calculator.
 */
export function assessLatency(measurement: TimeToOutcomeMeasurement): Verdict {
  const { medianDays, graded } = measurement;

  if (medianDays === null || graded < MIN_GRADED) {
    return {
      tone: "neutral",
      headline: "Not measured yet",
      detail: `A median needs at least ${MIN_GRADED} graded submissions to mean anything; there ${graded === 1 ? "is" : "are"} ${graded}.`,
    };
  }

  if (medianDays <= 2) {
    return {
      tone: "good",
      headline: "Fast enough for the loop to work",
      detail: `${describeMedian(medianDays)} That is inside the window where an outcome can still be attributed to the form that produced it.`,
    };
  }

  if (medianDays <= 14) {
    return {
      tone: "good",
      headline: "Fast enough to learn from",
      detail: `${describeMedian(medianDays)} Outcomes come back while the form that produced them is still the form you are running.`,
    };
  }

  if (medianDays <= 45) {
    return {
      tone: "warn",
      headline: "Slow enough to blunt the loop",
      detail: `${describeMedian(medianDays)} By the time a verdict lands, whatever you changed on the form is weeks old. The outcome ledger is still worth keeping — it grades your traffic sources honestly — but do not expect it to adjudicate a form change.`,
    };
  }

  return {
    tone: "bad",
    headline: "Too slow for form-level learning",
    detail: `${describeMedian(medianDays)} At that lag an outcome cannot be attributed to a form variant in any useful way; the form, the traffic and the offer will all have moved. This is the constraint /tools/time-to-outcome-calculator names publicly, and it applies here too. Use the outcomes to grade lead sources, not to pick a form.`,
  };
}

/**
 * What to tell the customer.
 *
 * The order is the order the problems actually bite in. No data beats slow
 * data; nobody dispositioning the leads (Risk 3) beats a slow cycle (Risk 4),
 * because a latency number computed from 4% of the leads is not a latency
 * number. Only once both are cleared does the public calculator's own verdict
 * get to speak, unedited.
 */
export function assess(measurement: TimeToOutcomeMeasurement): Verdict {
  const { submissions: total, graded, gradedShare, medianDays, projection } = measurement;

  if (total === 0) {
    return {
      tone: "neutral",
      headline: "No submissions yet",
      detail:
        "There is nothing to grade until leads arrive. Once outcomes start coming back, this will tell you whether the feedback loop can work at your sales cycle — including if the answer is no.",
    };
  }

  if (graded === 0) {
    return {
      tone: "neutral",
      headline: "Nothing has an outcome yet",
      detail: `${format(total)} submission${total === 1 ? "" : "s"} and no outcomes posted back. Until something tells us which leads turned into money, every report here is a lead count wearing a revenue costume. Post outcomes with the API key for this workspace, or upload a CSV.`,
    };
  }

  if (graded < MIN_GRADED) {
    return {
      tone: "neutral",
      headline: "Not enough outcomes to say yet",
      detail: `${graded} graded submission${graded === 1 ? "" : "s"}. A median needs at least ${MIN_GRADED} before it means anything, and quoting one from ${graded} would be the kind of confident number this product exists to argue against. Provisionally: ${describeMedian(medianDays)}`,
    };
  }

  if (gradedShare < MIN_GRADED_SHARE) {
    return {
      tone: "bad",
      headline: "Most leads never get an outcome",
      detail: `Only ${percent(gradedShare)} of submissions ever come back with a won, lost or disqualified. Whatever the median says, this loop is measuring a quarter of your funnel and guessing at the rest — and the fix is in the CRM, not here. Leads that go in and never get a disposition are not gradeable, however real they were.`,
    };
  }

  // From here the public calculator answers, on measured inputs rather than
  // typed ones. Anything else would mean the product contradicting its own
  // marketing to whoever is paying for it.
  if (!projection) {
    return {
      tone: "neutral",
      headline: "Not enough outcomes to say yet",
      detail: describeMedian(medianDays),
    };
  }

  return {
    tone: projection.verdict.tone,
    headline: projection.verdict.headline,
    detail: `${describeMedian(medianDays)} ${censoringNote(measurement)}${projection.verdict.detail}`.trim(),
  };
}

function censoringNote(measurement: TimeToOutcomeMeasurement): string {
  const { awaitingOlderThanMedian, graded, p90Days, medianDays } = measurement;

  const parts: string[] = [];

  if (p90Days !== null && medianDays !== null && p90Days > medianDays * 3) {
    parts.push(
      `The tail is long: one in ten takes ${describeDays(p90Days)} or more, so the median flatters the slowest deals.`,
    );
  }

  if (awaitingOlderThanMedian > Math.max(3, graded * 0.5)) {
    parts.push(
      `${format(awaitingOlderThanMedian)} submissions are still awaiting a verdict and are already older than that median, so the real figure is longer than this one — a median can only see the leads that came back.`,
    );
  }

  return parts.length > 0 ? `${parts.join(" ")} ` : "";
}

function describeMedian(medianDays: number | null): string {
  if (medianDays === null) return "No median yet.";
  return `Half of this workspace's graded leads get an answer within ${describeDays(medianDays)}.`;
}

function describeDays(days: number): string {
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const rounded = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

function toDays(seconds: number | null): number | null {
  if (seconds === null || seconds === undefined) return null;
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return null;
  return value / SECONDS_PER_DAY;
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function format(value: number): string {
  return value.toLocaleString("en-US");
}
