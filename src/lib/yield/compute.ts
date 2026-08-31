import { clamp, formatPercent, ratio, type Verdict } from "../tools/engine.ts";
import { currencyLabel, divideCents, formatCents, shareOfCents } from "./money.ts";
import type {
  Interval,
  YieldRate,
  YieldReport,
  YieldScope,
  YieldTallies,
  YieldValue,
} from "./types.ts";

/**
 * Yield — the quality-adjusted metric (#44).
 *
 * Completion rate counts submissions. Yield counts what those submissions
 * turned out to be worth. `docs/00-positioning-spine.md` names the enemy as
 * *"the dashboard that says everything is fine while sales drowns in junk"*, so
 * the one job of the arithmetic below is that a form producing many worthless
 * leads must score **worse** than one producing fewer good ones — which raw
 * conversion rate cannot express, because to it those two forms look identical
 * or the junk one looks better.
 *
 * Two numbers, both defined in the public glossary before a line of this was
 * written (`src/lib/glossary.ts`, slug `yield`) and not redefinable here:
 *
 *   - **Yield rate** — the share of submissions that reached a good verdict.
 *   - **Yield value** — revenue per hundred submissions.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW AN UNRESOLVED SUBMISSION IS TREATED, AND WHY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Most submissions have no verdict most of the time. A deal takes weeks; the
 * lead that arrived this morning is `awaiting` and will be for a while. This is
 * the normal state of the data, not an edge case, and how it is counted decides
 * whether the metric is honest.
 *
 * There are three tempting answers and two of them are wrong:
 *
 *   1. **Count an open submission as a loss** (`won / all`, called a point
 *      estimate and left there). Systematically understates anything recent,
 *      because a variant that has been running a week is nearly all open. Ship
 *      this and a customer kills the newer variant every time.
 *   2. **Drop open submissions from the denominator** (`won / resolved`, and
 *      call that "the Yield rate"). Flatters, and worse, it is *selection*: the
 *      leads that resolve first are the ones that resolve fast — small deals
 *      and quick disqualifications — so an immature window reports the rate of
 *      the fast tail as though it were the rate of the cohort. The glossary
 *      already warns strangers about exactly this under "Comparing Yield across
 *      windows shorter than your disposition lag".
 *   3. **Report both bounds, and how far apart they are.** What we do.
 *
 * So Yield rate is published as a **bracket**:
 *
 *      floor   = won / submissions              every open one is not-yet-won
 *      ceiling = (won + awaiting) / submissions every open one becomes a win
 *
 * The true rate of this cohort, once every verdict has landed, is inside that
 * bracket — the floor can only rise and the ceiling can only fall as outcomes
 * arrive. **The width of the bracket is the honesty.** A mature window is a
 * tight bracket and a confident number; a window younger than the sales cycle
 * is a wide one, visibly, instead of a precise-looking number that is wrong.
 *
 * `amongResolved` (`won / resolved`) is computed and shown too, because it is
 * genuinely informative and people will want it — but it is labelled as the
 * rate *among decided leads* and never as "the Yield rate", because those are
 * different claims about different populations.
 *
 * Yield **value** gets no ceiling, on purpose. The floor is real money already
 * recorded; the ceiling would require guessing what the open deals are worth,
 * and a product arguing against invented numbers does not get to invent that
 * one. It is a floor, and it is labelled a floor.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OTHER AWKWARD CASES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - **Disqualified stays in the denominator.** It is a decided, bad outcome —
 *   the junk this product exists to make visible. Removing it would let a
 *   workspace raise its Yield rate by marking its worst leads disqualified,
 *   which is the metric paying you to hide the problem.
 * - **A won deal with no value recorded** counts fully towards Yield *rate*
 *   and contributes nothing to Yield *value*, and the count of such deals is
 *   reported beside the money. It is not a zero-value deal; it is a deal whose
 *   value we were not told.
 * - **Currencies are never mixed.** Totals are kept per currency and there is
 *   no FX table in this product. Adding €5,000 to $5,000 produces a number that
 *   is wrong in every currency.
 * - **`NaN` and `Infinity` never leave this module.** Rates go through
 *   `ratio()` from `src/lib/tools/engine.ts` — the same guard the public
 *   calculators use — which returns `null` for an undefined division; money is
 *   `bigint`, which has no `NaN`. `null` means "no answer from these numbers"
 *   and the UI prints an em dash.
 */

/**
 * Resolved outcomes below which a rate is not worth quoting.
 *
 * Same threshold as `MIN_GRADED` in `src/lib/verdict/latency.ts`, deliberately:
 * two parts of the product disagreeing about how much data is enough is how a
 * customer learns not to trust either. #44's own words: *"do not report a Yield
 * rate as meaningful on 4 verdicts."*
 */
export const MIN_RESOLVED = 8;

/** Open share above which the bracket is wide enough to say so before the number. */
const OPEN_SHARE_WARN = 0.35;

/**
 * One deal above this share of the total value is a concentration worth naming.
 *
 * Two fifths rather than a half: by the time one deal *is* the majority nobody
 * needed telling, and the number that actually misleads is the one where a
 * single large win quietly carries 40% of a figure being read as a property of
 * the form.
 */
const CONCENTRATION_WARN = 0.4;

const Z_95 = 1.959964;

/**
 * Wilson score interval on a proportion, at 95%.
 *
 * Wilson rather than the textbook normal approximation because Yield rates are
 * small and samples are not large, which is precisely where the normal
 * approximation produces a lower bound below zero and a confident-looking
 * interval around a rate of 1/40. Returns null when there are no trials.
 */
export function wilsonInterval(successes: number, trials: number, z = Z_95): Interval | null {
  if (!Number.isFinite(successes) || !Number.isFinite(trials)) return null;
  if (trials <= 0) return null;

  const s = clamp(successes, 0, trials);
  const p = s / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials));

  const low = (centre - spread) / denominator;
  const high = (centre + spread) / denominator;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;

  return { low: clamp(low, 0, 1), high: clamp(high, 0, 1) };
}

/** An empty window. Every field the report needs, all zero. */
export function emptyTallies(): YieldTallies {
  return {
    submissions: 0,
    won: 0,
    lost: 0,
    disqualified: 0,
    awaiting: 0,
    wonWithoutValue: 0,
    money: [],
    moneyUnreadable: false,
    visitors: null,
    firstSubmissionAt: null,
    lastSubmissionAt: null,
    timing: { medianDaysToVerdict: null, p90DaysToVerdict: null, awaitingOlderThanMedian: 0 },
  };
}

const EMPTY_SCOPE: YieldScope = {
  endpointPublicId: null,
  endpointName: null,
  from: null,
  to: null,
};

/**
 * The whole metric, from tallies to something a screen can render.
 *
 * Pure: no database, no clock, no `Intl` beyond the caveat sentences. Given the
 * same tallies it returns the same report, which is what makes the awkward
 * cases testable rather than arguable.
 */
export function computeYield(tallies: YieldTallies, scope: YieldScope = EMPTY_SCOPE): YieldReport {
  const submissions = safeCount(tallies.submissions);
  const won = safeCount(tallies.won);
  const lost = safeCount(tallies.lost);
  const disqualified = safeCount(tallies.disqualified);
  const awaiting = safeCount(tallies.awaiting);

  const resolved = won + lost + disqualified;
  const open = awaiting;

  const floor = ratio(won, submissions);
  const ceiling = ratio(won + open, submissions);

  const rate: YieldRate = {
    floor,
    ceiling,
    amongResolved: ratio(won, resolved),
    uncertainty: floor !== null && ceiling !== null ? ceiling - floor : null,
    interval: wilsonInterval(won, submissions),
  };

  const value = tallies.money.map((total) =>
    computeValue(total, submissions, tallies.visitors),
  );

  const report: YieldReport = {
    scope,
    submissions,
    won,
    lost,
    disqualified,
    resolved,
    open,
    resolvedShare: ratio(resolved, submissions),
    rate,
    qualifiedShare: ratio(won + lost, submissions),
    junkShare: ratio(disqualified, resolved),
    value,
    maturity: { tone: "neutral", headline: "", detail: "" },
    confidence: { tone: "neutral", headline: "", detail: "" },
    caveats: [],
    inputs: { ...tallies, submissions, won, lost, disqualified, awaiting },
  };

  report.maturity = assessMaturity(report);
  report.confidence = assessConfidence(report);
  report.caveats = caveatsFor(report);
  return report;
}

function computeValue(
  total: { currency: string | null; totalCents: bigint; wonWithValue: number; largestCents: bigint },
  submissions: number,
  visitors: number | null,
): YieldValue {
  const denominator = BigInt(submissions);
  return {
    currency: total.currency,
    totalCents: total.totalCents,
    wonWithValue: total.wonWithValue,
    perSubmissionCents: divideCents(total.totalCents, denominator),
    perHundredSubmissionsCents: divideCents(total.totalCents * 100n, denominator),
    perVisitorCents:
      visitors !== null && Number.isFinite(visitors) && visitors > 0
        ? divideCents(total.totalCents, BigInt(Math.trunc(visitors)))
        : null,
    averageWonCents: divideCents(total.totalCents, BigInt(safeCount(total.wonWithValue))),
    largestCents: total.largestCents,
    concentration: shareOfCents(total.largestCents, total.totalCents),
  };
}

/**
 * Is this window ready to be read?
 *
 * Separate from `confidence` for the same reason `latency.ts` splits its two
 * verdicts: "most of this window has not resolved yet" and "there is not enough
 * here to compare" are different problems with different answers, and one
 * headline that collapses them tells a workspace with a mature, tiny window
 * that its data is immature when in fact it is simply small.
 */
export function assessMaturity(report: YieldReport): Verdict {
  const { submissions, open, resolved, resolvedShare, rate, inputs } = report;

  if (submissions === 0) {
    return {
      tone: "neutral",
      headline: "Nothing in this window",
      detail:
        "No submissions arrived in the period being measured, so there is no rate to compute. Widen the window or wait.",
    };
  }

  if (resolved === 0) {
    return {
      tone: "warn",
      headline: "Nothing here has an outcome yet",
      detail: `All ${count(submissions)} ${plural(submissions, "submission is", "submissions are")} still awaiting a verdict, so Yield is unknown rather than zero — anywhere between 0% and 100%. Post outcomes back with the workspace's verdict key, or upload a CSV, and this number starts existing.`,
    };
  }

  const openShare = ratio(open, submissions);
  const late = inputs.timing.awaitingOlderThanMedian;
  const median = inputs.timing.medianDaysToVerdict;

  if (open === 0) {
    return {
      tone: "good",
      headline: "Every submission in this window has been decided",
      detail: `${count(resolved)} of ${count(submissions)} resolved. The rate below is final for this cohort rather than a floor — nothing is still out.`,
    };
  }

  if (late > 0 && median !== null && late >= Math.max(3, resolved * 0.5)) {
    return {
      tone: "bad",
      headline: "Outcomes are overdue, not just pending",
      detail: `${count(late)} ${plural(late, "submission is", "submissions are")} still awaiting a verdict despite being older than the ${days(median)} this workspace usually takes to decide. Those are unlikely to be "not yet" — they are leads nobody dispositioned, and every one of them holds this number down. The fix is in the CRM, not here.`,
    };
  }

  if (openShare !== null && openShare >= OPEN_SHARE_WARN) {
    return {
      tone: "warn",
      headline: `${formatPercent(openShare, 0)} of this window is still open`,
      detail: `${count(open)} of ${count(submissions)} ${plural(submissions, "submission has", "submissions have")} no outcome yet, so the Yield rate for this cohort is somewhere between ${formatPercent(rate.floor, 1)} and ${formatPercent(rate.ceiling, 1)}. ${maturityAdvice(median)}`,
    };
  }

  return {
    tone: "good",
    headline: "Mature enough to read",
    detail: `${formatPercent(resolvedShare, 0)} of this window has an outcome. ${count(open)} still open, which moves the rate by at most ${formatPercent(rate.uncertainty, 1)}.`,
  };
}

function maturityAdvice(median: number | null): string {
  if (median === null) {
    return "Read the floor as what has been proven so far, not as the answer.";
  }
  return `Outcomes here take a median of ${days(median)}, so a window shorter than that reports mostly the leads that resolve fastest — small deals and quick disqualifications — and understates whatever attracts slower, larger ones.`;
}

/**
 * Is there enough here to compare against anything?
 *
 * This is the question Hindsight (#45) asks before it is allowed to declare a
 * winner, and the answer is often no. Refusing to call it is the feature.
 */
export function assessConfidence(report: YieldReport): Verdict {
  const { submissions, resolved, won, rate } = report;

  if (submissions === 0) {
    return {
      tone: "neutral",
      headline: "Nothing to compare",
      detail: "No submissions in this window.",
    };
  }

  if (resolved < MIN_RESOLVED) {
    return {
      tone: "neutral",
      headline: "Too few outcomes to rank on",
      detail: `${count(resolved)} ${plural(resolved, "outcome", "outcomes")} so far. A rate needs at least ${MIN_RESOLVED} before it is worth quoting, and a difference between two variants needs far more than that. Whatever this number says today, do not act on it — that is the same answer /tools/outcome-weighted-split-test-calculator gives a stranger.`,
    };
  }

  if (won === 0) {
    return {
      tone: "warn",
      headline: "Decided, and nothing closed",
      detail: `${count(resolved)} ${plural(resolved, "outcome", "outcomes")} and no wins. That is a real finding rather than missing data — this form's submissions are being decided, and they are being decided against. Check ${report.disqualified > 0 ? `the ${count(report.disqualified)} disqualified` : "where the traffic comes from"} before concluding the form is at fault.`,
    };
  }

  const interval = rate.interval;
  if (interval && rate.floor !== null && interval.high - interval.low > Math.max(rate.floor, 0.02)) {
    return {
      tone: "warn",
      headline: "Directional, not decisive",
      detail: `The 95% interval around ${formatPercent(rate.floor, 1)} runs from ${formatPercent(interval.low, 1)} to ${formatPercent(interval.high, 1)} — wider than the rate itself, on ${count(won)} ${plural(won, "win", "wins")} out of ${count(submissions)}. Useful for spotting where to look; not enough to rank two variants on.`,
    };
  }

  return {
    tone: "good",
    headline: "Enough to compare",
    detail: interval
      ? `${count(won)} ${plural(won, "win", "wins")} from ${count(submissions)} submissions, 95% interval ${formatPercent(interval.low, 1)}–${formatPercent(interval.high, 1)}. That interval covers sampling error only; the open submissions above are a separate uncertainty and do not shrink it.`
      : `${count(won)} ${plural(won, "win", "wins")} from ${count(submissions)} submissions.`,
  };
}

/**
 * The caveats that apply to this particular number.
 *
 * Sentences rather than flags because they are printed verbatim: a customer
 * reading "$70,050 across 20 submissions" deserves to be told, in the same
 * breath, that one deal is 45% of it.
 */
function caveatsFor(report: YieldReport): string[] {
  const caveats: string[] = [];
  const { inputs, value, won } = report;

  if (inputs.wonWithoutValue > 0) {
    caveats.push(
      `${count(inputs.wonWithoutValue)} of ${count(won)} won ${plural(won, "deal", "deals")} ${plural(inputs.wonWithoutValue, "has", "have")} no value recorded, so Yield value is a floor. Those deals count fully towards the Yield rate — a deal with no amount is not a deal worth nothing.`,
    );
  }

  if (value.length > 1) {
    caveats.push(
      `Values were recorded in ${value.length} currencies (${value.map((entry) => currencyLabel(entry.currency)).join(", ")}). They are reported separately and never added together — there is no exchange rate in this product, and a converted total would be a number nobody could check.`,
    );
  }

  for (const entry of value) {
    if (entry.concentration !== null && entry.concentration >= CONCENTRATION_WARN && entry.wonWithValue > 1) {
      caveats.push(
        `One deal is ${formatPercent(entry.concentration, 0)} of the ${currencyLabel(entry.currency)} total (${formatCents(entry.largestCents, entry.currency, { decimals: 0 })} of ${formatCents(entry.totalCents, entry.currency, { decimals: 0 })}). Yield value here is a statement about that deal more than about this form.`,
      );
    }
  }

  if (inputs.moneyUnreadable) {
    caveats.push(
      "At least one recorded value could not be read back as a number, so the total below is incomplete. This should not happen; it is reported rather than hidden.",
    );
  }

  if (inputs.visitors === null) {
    caveats.push(
      "Value per visitor is not shown: Endpoint records submissions, not page views, so nothing here knows how many people saw the form. Every rate on this panel is per submission.",
    );
  }

  return caveats;
}

/** A count that is definitely a non-negative integer, whatever the caller had. */
function safeCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.trunc(value);
}

function count(value: number): string {
  return value.toLocaleString("en-US");
}

function plural(value: number, one: string, many: string): string {
  return value === 1 ? one : many;
}

function days(value: number): string {
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}
