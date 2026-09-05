import {
  clamp,
  computeSplitTest,
  computeTimeToOutcome,
  formatNumber,
  formatPercent,
  normalCdf,
  ratio,
  requiredSamplePerArm,
  twoProportionTest,
  type ProportionTest,
  type SplitTestResult,
  type TimeToOutcomeResult,
  type Verdict,
} from "../tools/engine.ts";
import { computeYield, emptyTallies, MIN_RESOLVED, wilsonInterval } from "../yield/compute.ts";
import { plannedShares } from "./assign.ts";
import type { YieldTallies } from "../yield/types.ts";
import type {
  Comparison,
  HindsightInput,
  HindsightReport,
  HindsightState,
  PreRegisteredEffect,
  RankingBasis,
  Requirement,
  SampleRequirement,
  VariantArm,
  VariantDefinition,
} from "./types.ts";

/**
 * Hindsight — ranking variants on Yield, and refusing to (#45).
 *
 * *"Your form isn't the endpoint. The closed deal is."* Every other form
 * builder's split test ranks on the submit event, because the submit event is
 * the last thing it can observe. This one ranks on what the submissions turned
 * out to be worth, which means the answer is not available when the test would
 * like to give it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE MOSTLY DOES IS SAY NO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A tool that says *"keep waiting, and here is exactly what would change that"*
 * is worth more than one that manufactures a winner, so "not yet" is the
 * primary state here and not the error case. There are six states and four of
 * them decline to name a winner. That is the design, not a shortcoming of it.
 *
 * The gates are ordered by which problem actually bites first, the way
 * `src/lib/verdict/latency.ts` orders its own:
 *
 *   1. **`not_enough_data`** — fewer than two arms with anything in them, or an
 *      arm with fewer than `MIN_RESOLVED` outcomes. No amount of cleverness
 *      substitutes for verdicts that have not arrived.
 *   2. **`split_broken`** — the arms did not receive the traffic they were
 *      configured for. The only state that is not about waiting: more traffic
 *      through a broken splitter is more unusable data.
 *   3. **`still_maturing`** — the window is younger than the sales cycle, or an
 *      arm is less than half decided. **This is the refusal that matters most**
 *      and the one every other tool gets wrong by not having it. See below.
 *   4. **`underpowered`** — mature, but the sample cannot resolve a difference
 *      worth acting on. Includes the case where the difference *is* significant
 *      but has not earned it yet; see the peeking note.
 *   5. **`no_difference`** — enough traffic that a difference worth acting on
 *      would have shown up, and none did. A real answer: stop testing this.
 *   6. **`winner`** — one arm is ahead on Yield, significantly, with the sample
 *      to back it, on a window old enough to be read.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY AN IMMATURE WINDOW IS WORSE THAN A SMALL ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `src/lib/yield/compute.ts` explains why an unresolved submission cannot be
 * dropped from a denominator: **the leads that resolve first are the ones that
 * resolve fast** — small deals and quick disqualifications — so an immature
 * window reports the rate of the fast tail as though it were the rate of the
 * cohort. Yield answers that with a bracket, floor to ceiling, and shows how
 * wide it is.
 *
 * A comparison cannot use a bracket. Ranking two brackets that overlap is not a
 * ranking, and ranking two floors is ranking two numbers that are both wrong by
 * an unknown and *different* amount — the arm whose leads resolve more slowly
 * has the more understated floor, which means an immature test is biased
 * towards whichever variant attracts the quicker, smaller deals. That is
 * precisely the bias this product exists to argue against, arriving through the
 * back door of the feature meant to fix it.
 *
 * So there is no clever adjustment. There is a gate:
 *
 *   - The test must have run for at least one **median time-to-verdict**, and
 *     that median is the **workspace's**, not the test's. Measured over the
 *     test's own submissions it would be useless: nothing inside a test can
 *     have taken longer to decide than the test has been running, so a
 *     self-measured median is always shorter than the window and the gate could
 *     never fire. `./query.ts` explains the substitution at length. Under any
 *     arrival pattern, a window shorter than the business's real disposition
 *     lag cannot have decided the median lead, so whatever has resolved is the
 *     fast tail by construction.
 *   - Every compared arm must be at least **half decided**. Below half, the
 *     decided leads are a minority selected for speed. At half, the
 *     median-speed lead is in, which is what makes the observed rate a
 *     statement about the cohort rather than about its front runners.
 *
 * The second gate is measured and the first is derived, and they usually agree:
 * with submissions arriving evenly, a window of two medians is roughly a
 * half-decided cohort. When they disagree the measured one binds, because it is
 * the one that looked.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PEEKING, WHICH IS HOW EVERY OTHER A/B DASHBOARD LIES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This panel recomputes on every page load. A 95% test read once has a 5% false
 * positive rate; the same test read every morning until it goes green has a far
 * higher one, because "significant at some point during the run" is a much
 * weaker claim than "significant at the end". Every dashboard that shows a
 * live-updating p-value and a Ship It button has this problem, and almost none
 * of them mention it.
 *
 * The fix here is a second gate on the winner: significance is necessary and
 * not sufficient. An arm must **also** have reached the sample size the
 * observed difference actually needs at 95% confidence and 80% power
 * (`requiredSamplePerArm`, the same function the public calculator uses). A
 * difference that goes significant early on a handful of outcomes has not
 * reached that number, so the panel keeps saying "not yet" and prints how much
 * further there is to go.
 *
 * This does not make the test immune to peeking — nothing short of a
 * pre-registered horizon or always-valid inference does — and the readout says
 * so out loud rather than implying a rigour it does not have.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND WHY THAT SAMPLE SIZE USED TO BE CIRCULAR (#59)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Read the paragraph above again and the defect is visible in it: the sample a
 * winner has to reach is derived from **the difference the test observed**. When
 * that difference is real the requirement is about right. When it is noise, the
 * requirement derived from it is *too small* — a large spurious gap demands a
 * small sample — so the gate is loosest exactly when it is most needed. It is
 * the same class of defect as the two maturity-gate holes #45 fixed: a gate that
 * looks like it is doing work and is quietly not.
 *
 * The fix is a **pre-registered effect**: the smallest improvement worth acting
 * on, fixed when the test is created, together with the baseline rate it is
 * relative to. `requiredSamplePerArm` then depends on nothing the test observes,
 * and three things follow.
 *
 *   - The finish line stops moving. `no_difference` is currently sized from the
 *     *observed* control rate, so it drifts as data arrives and a test can never
 *     quite arrive at "these are the same". Fixed, it can.
 *   - The requirement exists **before any data does**, so a draft can be told
 *     what it will cost and — through `report.forecast`, which is the public
 *     calculator's own arithmetic — roughly how long it will take. Some tests
 *     should never be started, and until now that was only discoverable by
 *     starting one. For an agency spending a client's money on traffic, being
 *     told in advance is worth more than being told afterwards.
 *   - It is strictly more conservative on the winner gate. The pre-registered
 *     sample is sized for the smallest effect worth acting on, so it is never
 *     smaller than the sample a larger observed effect would have demanded. A
 *     test with a pre-registration therefore never declares a winner *earlier*
 *     than the same test without one, only later or never.
 *
 * It is opt-in per test, and a test with no pre-registration keeps the observed
 * rule exactly as it was — every test created before this existed is running
 * under it, and changing the rule underneath a live experiment would be its own
 * kind of dishonesty. `report.requirement.source` says which is in force.
 *
 * What it does **not** fix, and the readout still says so: peeking is reduced,
 * not eliminated. A pre-registered effect size is not a pre-registered horizon.
 * The panel still recomputes on every load, and stopping the moment it agrees
 * with you is still available.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OTHER TRAPS, EACH WITH THE LINE THAT HANDLES IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - **Multiple arms inflate false positives.** Three variants means two
 *   comparisons against the control, each at 5%, which is not a 5% test. Alpha
 *   is Bonferroni-corrected by the number of comparisons, and the corrected
 *   threshold is printed rather than assumed.
 * - **The leader has to beat the runner-up, not just the control.** With three
 *   arms a control that is far behind both challengers makes both
 *   control-comparisons significant, and a test that declared a winner on those
 *   would ship the front-runner without ever having compared it to the arm
 *   directly behind it. Two sets of comparisons are computed: control-based,
 *   which is what the workings print because it is the question a person ran
 *   the test to answer, and leader-based, which is the only set allowed to
 *   declare a winner.
 * - **A ratio mismatch means the split is broken.** If an arm received
 *   materially less traffic than its weight called for, something upstream —
 *   a cache, a redirect, a bot filter — is interfering, and every number below
 *   is describing two populations rather than one split two ways. Checked, and
 *   loud when it fires.
 * - **"No difference" is a claim about power, not about p.** Saying two
 *   variants are the same on a sample that could never have told them apart is
 *   the same lie as declaring a winner, pointed the other way. That sentence is
 *   only allowed once the arms are big enough to have detected a
 *   `MIN_DETECTABLE_LIFT` improvement.
 * - **`NaN` and `Infinity` never leave this module.** Rates go through
 *   `ratio()`; money stays `bigint` cents inside the Yield reports and is never
 *   arithmetic here. `null` means "no answer from these numbers".
 */

/**
 * Each compared arm must be at least this decided before its rate is a
 * statement about the cohort rather than about its fastest leads.
 *
 * A half rather than a rounder-sounding two thirds because a half is the
 * threshold with a meaning: it is exactly the point at which the median lead
 * has been decided, which is the same lead the median time-to-verdict describes.
 * Every other value would be a preference.
 */
export const MIN_RESOLVED_SHARE = 0.5;

/**
 * The improvement a test has to be able to detect before it is allowed to say
 * two variants are the same.
 *
 * Twenty per cent relative, which is the default
 * `/tools/time-to-outcome-calculator` puts in front of a stranger for the same
 * question. Using a different number here would mean the product and its own
 * marketing disagreeing about how much traffic an experiment needs, and the
 * marketing is the one a customer read before paying us.
 */
export const MIN_DETECTABLE_LIFT = 0.2;

/** Uncorrected two-sided threshold. Divided by the number of comparisons below. */
const BASE_ALPHA = 0.05;

/**
 * Standard deviations of shortfall against a variant's configured weight before
 * the split is called broken rather than unlucky.
 *
 * Three, not two: this check runs on every arm of every test on every page
 * load, and a two-sigma alarm on a handful of arms fires on healthy tests often
 * enough to be ignored, which is worse than not having it.
 */
const SRM_SIGMA = 3;

/** A test younger than this many days is reported as young whatever else is true. */
const MIN_RUNNING_DAYS = 1;

/**
 * The whole comparison, from tallies to something a screen can render.
 *
 * Pure: no database, no clock beyond `input.now`, no `Intl` beyond the
 * sentences. Given the same input it returns the same report, which is what
 * makes "would this declare a winner?" a question a test can ask rather than a
 * question a person has to eyeball on a dashboard.
 */
export function computeHindsight(input: HindsightInput): HindsightReport {
  const now = input.now ?? new Date();
  const { test, timing } = input;

  const talliesByVariant = new Map(input.tallies.map((entry) => [entry.variantId, entry.tallies]));
  const arms = test.variants.map((variant) =>
    buildArm(variant, talliesByVariant.get(variant.id) ?? emptyTallies()),
  );

  const basis = decideBasis(arms, test.preRegistered);
  for (const arm of arms) arm.interval = intervalFor(arm, basis);
  applySampleRatio(arms, basis);

  const runningDays = measureRunningDays(test, arms, now);
  const control = arms.find((arm) => arm.variant.isControl) ?? arms[0] ?? null;

  const completionLeader = leaderBy(arms, (arm) => arm.completionRate);
  const yieldLeader = leaderBy(arms, (arm) => rankingRate(arm, basis));

  const requirement = decideRequirement(arms, control, basis, test.preRegistered);

  const comparisons =
    control === null ? [] : buildComparisons(control, arms, basis, requirement);

  // The set that licenses a winner. Identical to the above whenever the control
  // is the front-runner, which is most of the time; different, and decisive,
  // when it is not.
  const leader = arms.find((arm) => arm.variant.id === yieldLeader) ?? null;
  const leaderComparisons =
    leader === null
      ? []
      : leader.variant.id === control?.variant.id
        ? comparisons
        : buildComparisons(leader, arms, basis, requirement);

  const state = decideState({
    arms,
    control,
    basis,
    runningDays,
    timing,
    comparisons,
    leaderComparisons,
    yieldLeader,
    requirement,
  });

  const report: HindsightReport = {
    test,
    runningDays,
    arms,
    basis,
    timing,
    completionLeader,
    yieldLeader,
    disagree:
      completionLeader !== null &&
      yieldLeader !== null &&
      completionLeader !== yieldLeader,
    comparisons,
    leaderComparisons,
    state,
    requirement,
    forecast: forecastFor(test.preRegistered, arms.length, timing),
    decision: { tone: "neutral", headline: "", detail: "" },
    requirements: [],
    whatWouldChangeThis: [],
    caveats: [],
    calculator: runCalculator(arms, control, basis),
  };

  report.requirements = requirementsFor(report);
  report.decision = describe(report);
  report.whatWouldChangeThis = whatWouldChangeThis(report);
  report.caveats = caveatsFor(report);
  return report;
}

// ---------------------------------------------------------------------------
// Arms
// ---------------------------------------------------------------------------

function buildArm(variant: VariantDefinition, tallies: YieldTallies): VariantArm {
  // The same `computeYield` the Yield panel calls, on the same shape. Hindsight
  // does not get its own definition of a Yield rate — a customer comparing the
  // endpoint's Yield panel against this table and finding two different numbers
  // for the same submissions would be right to stop trusting both.
  const report = computeYield(tallies);
  const exposures = safeExposures(tallies.visitors);

  return {
    variant,
    report,
    exposures,
    completionRate: exposures === null ? null : ratio(report.submissions, exposures),
    yieldRatePerExposure: exposures === null ? null : ratio(report.won, exposures),
    yieldRatePerSubmission: report.rate.floor,
    interval: null,
    resolvedShare: report.resolvedShare,
    plannedShare: 0,
    observedShare: null,
    srmZ: null,
    srmSuspect: false,
  };
}

/**
 * Fills in each arm's planned versus observed traffic share, and flags the ones
 * that do not match.
 *
 * Runs on the ranking basis, so a test with exposures is checked on views —
 * where a broken split actually shows — and one without is checked on
 * submissions, which is weaker: a variant that genuinely suppresses fills looks
 * like a broken split there. That is why a mismatch is reported as "explain
 * this" rather than as a fault.
 */
function applySampleRatio(arms: VariantArm[], basis: RankingBasis): void {
  const shares = plannedShares(arms.map((arm) => arm.variant));
  const total = arms.reduce((sum, arm) => sum + rankingTrials(arm, basis), 0);

  arms.forEach((arm, index) => {
    arm.plannedShare = shares[index] ?? 0;
    arm.observedShare = total > 0 ? ratio(rankingTrials(arm, basis), total) : null;

    // Meaningless with one arm: a single variant always receives all of the
    // traffic and always matches a planned share of 1.
    if (arms.length < 2) return;

    const check = sampleRatioCheck(rankingTrials(arm, basis), total, arm.plannedShare);
    arm.srmZ = check.z;
    arm.srmSuspect = check.suspect;
  });
}

/**
 * Per-exposure when every arm has a view count, per-submission otherwise.
 *
 * All or nothing on purpose. Comparing an arm's wins-per-view against another
 * arm's wins-per-submission is comparing two different quantities that happen
 * to be printed in the same column, and it would favour whichever arm we
 * happened not to be counting views for.
 */
function decideBasis(
  arms: VariantArm[],
  preRegistered: PreRegisteredEffect | null,
): RankingBasis {
  const populated = arms.filter((arm) => arm.report.submissions > 0 || (arm.exposures ?? 0) > 0);
  // Nothing has arrived, so nothing observed can decide this. A draft that
  // pre-registered its effect said which denominator it meant, and reporting a
  // requirement in the other one would be answering a question nobody asked.
  if (populated.length === 0) return preRegistered?.basis ?? "submission";
  return populated.every((arm) => (arm.exposures ?? 0) > 0) ? "exposure" : "submission";
}

/** The rate the ranking uses, on the chosen basis. */
export function rankingRate(arm: VariantArm, basis: RankingBasis): number | null {
  return basis === "exposure" ? arm.yieldRatePerExposure : arm.yieldRatePerSubmission;
}

/** The denominator the ranking uses. Exposures, or submissions. */
export function rankingTrials(arm: VariantArm, basis: RankingBasis): number {
  return basis === "exposure" ? (arm.exposures ?? 0) : arm.report.submissions;
}

function intervalFor(arm: VariantArm, basis: RankingBasis) {
  return wilsonInterval(arm.report.won, rankingTrials(arm, basis));
}

function leaderBy(arms: VariantArm[], read: (arm: VariantArm) => number | null): string | null {
  let best: VariantArm | null = null;
  let bestRate = -1;
  let tied = false;

  for (const arm of arms) {
    const rate = read(arm);
    if (rate === null) continue;
    if (rate > bestRate + 1e-12) {
      best = arm;
      bestRate = rate;
      tied = false;
    } else if (Math.abs(rate - bestRate) <= 1e-12) {
      tied = true;
    }
  }

  // A tie has no leader. Naming one of two identical numbers as ahead is the
  // smallest possible version of the lie this whole module is against.
  return tied || best === null ? null : best.variant.id;
}

function safeExposures(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

// ---------------------------------------------------------------------------
// Comparisons
// ---------------------------------------------------------------------------

/**
 * Every other arm against one baseline, at an alpha divided by how many of them
 * there are.
 *
 * Against a single baseline rather than every pair, because k(k-1)/2 pairs
 * would correct alpha into uselessness for a question nobody asked.
 *
 * Called twice, with two different baselines, and the difference matters:
 *
 *   - **against the control** — "did my change beat what I was already
 *     running". This is what the workings print, because it is the question a
 *     person ran the test to answer.
 *   - **against the leader** — "is the front-runner actually ahead of the
 *     others". This is the only set that licenses declaring a winner. With two
 *     arms they are the same set. With three they are not, and using the first
 *     for the second's job is a real bug: a control that differs significantly
 *     from both challengers says nothing about whether the *leading* challenger
 *     beat the other one, and shipping it on that basis would rank two arms
 *     that were never compared to each other.
 */
function buildComparisons(
  baseline: VariantArm,
  arms: VariantArm[],
  basis: RankingBasis,
  requirement: SampleRequirement,
): Comparison[] {
  const challengers = arms.filter((arm) => arm.variant.id !== baseline.variant.id);
  if (challengers.length === 0) return [];

  const alpha = BASE_ALPHA / challengers.length;

  return challengers.map((challenger) => {
    const baselineTrials = rankingTrials(baseline, basis);
    const challengerTrials = rankingTrials(challenger, basis);

    const test: ProportionTest = twoProportionTest(
      baseline.report.won,
      baselineTrials,
      challenger.report.won,
      challengerTrials,
    );

    const baselineRate = rankingRate(baseline, basis);
    const challengerRate = rankingRate(challenger, basis);
    const observedRequiredPerArm =
      baselineRate === null || challengerRate === null
        ? null
        : requiredSamplePerArm(baselineRate, challengerRate);

    // The pre-registered requirement supersedes the observed one, and is
    // counted in the units it was registered in — which need not be the units
    // this z-test ran in. A test can rank per visitor while its finish line is
    // stated in submissions, because a per-visitor baseline is not knowable
    // before the form has ever been served and being knowable in advance is the
    // whole property being bought.
    const preRegistered = requirement.source === "pre_registered";
    const requiredPerArm = preRegistered ? requirement.perArm : observedRequiredPerArm;
    const countedOn = preRegistered ? requirement.basis : basis;
    const smallest = Math.min(
      rankingTrials(baseline, countedOn),
      rankingTrials(challenger, countedOn),
    );
    const shortfallPerArm =
      requiredPerArm === null ? null : Math.max(0, requiredPerArm - smallest);

    return {
      baselineId: baseline.variant.id,
      challengerId: challenger.variant.id,
      test,
      alpha,
      // Deliberately not `test.significant`, which hardcodes 0.05 and knows
      // nothing about how many comparisons this p-value is one of.
      significant: test.p !== null && test.p < alpha,
      requiredPerArm,
      requirementSource: requirement.source,
      observedRequiredPerArm,
      shortfallPerArm,
      powered: requiredPerArm !== null && smallest >= requiredPerArm,
    };
  });
}

/**
 * The sample a pre-registered effect demands, computed from nothing but the
 * pre-registration itself.
 *
 * **This function never touches a tally**, which is the entire point of #59 and
 * why it is exported: a draft screen can call it with no data in existence and
 * get the real number, and a test can assert that the number does not move when
 * the data does.
 */
export function preRegisteredSamplePerArm(
  effect: Pick<PreRegisteredEffect, "relativeLift" | "baselineRate">,
): number | null {
  const baseline = clamp(effect.baselineRate, 0, 1);
  if (baseline <= 0) return null;
  // The same clamp `computeTimeToOutcome` applies, so the two never disagree
  // about a baseline near 1 — the product must not contradict its own public
  // calculator by a rounding rule.
  const target = clamp(baseline * (1 + effect.relativeLift), 0, 0.999999);
  return requiredSamplePerArm(baseline, target);
}

/**
 * The sample every arm has to reach, and where the number came from.
 *
 * Two rules, in order:
 *
 * 1. **A pre-registration wins whenever it can be evaluated.** It is fixed,
 *    knowable in advance, and never smaller than what a larger observed effect
 *    would have demanded — so honouring it can only ever delay a winner, never
 *    hasten one.
 * 2. **Otherwise the old rule stands, unchanged.** Sized from the control's
 *    observed rate and `MIN_DETECTABLE_LIFT`. Circular, and documented as such,
 *    and still what every test created before #59 is running under.
 *
 * The one case where a recorded pre-registration cannot be honoured is a
 * requirement stated in visitors for arms nobody counted visitors for. That is
 * reported in `unusableReason` and printed, rather than silently downgraded —
 * a test whose stated finish line quietly stopped applying would be the exact
 * failure this feature exists to remove.
 */
function decideRequirement(
  arms: VariantArm[],
  control: VariantArm | null,
  basis: RankingBasis,
  preRegistered: PreRegisteredEffect | null,
): SampleRequirement {
  if (preRegistered) {
    const perArm = preRegisteredSamplePerArm(preRegistered);
    const countable =
      preRegistered.basis === "submission" ||
      arms.every((arm) => arm.report.submissions === 0 || arm.exposures !== null);

    if (perArm !== null && countable) {
      return {
        perArm,
        basis: preRegistered.basis,
        source: "pre_registered",
        baselineRate: preRegistered.baselineRate,
        relativeLift: preRegistered.relativeLift,
        unusableReason: null,
      };
    }

    return {
      ...observedRequirement(control, basis),
      unusableReason:
        perArm === null
          ? "The effect size recorded for this test cannot produce a sample size — a baseline of zero has no relative improvement to detect. The observed rule is being used instead."
          : "This test's effect size was registered per visitor, and no view count exists for these arms, so that requirement cannot be counted. The observed rule is being used instead, and it is the weaker one.",
    };
  }

  return { ...observedRequirement(control, basis), unusableReason: null };
}

/**
 * The pre-#59 rule: detect a `MIN_DETECTABLE_LIFT` improvement on the control's
 * **observed** rate.
 *
 * This is what licenses the sentence "these two variants are the same" for a
 * test with no pre-registration. A test that could not have seen a fifth more
 * closed deals has not found that there is no difference; it has found nothing.
 * It is also the circular one — the baseline moves as the data arrives, so the
 * finish line moves with it.
 */
function observedRequirement(
  control: VariantArm | null,
  basis: RankingBasis,
): Omit<SampleRequirement, "unusableReason"> {
  const rate = control === null ? null : rankingRate(control, basis);
  return {
    perArm:
      rate === null || rate <= 0
        ? null
        : requiredSamplePerArm(rate, Math.min(1, rate * (1 + MIN_DETECTABLE_LIFT))),
    basis,
    source: "observed",
    baselineRate: rate,
    relativeLift: MIN_DETECTABLE_LIFT,
  };
}

/**
 * How much traffic and how long, at this workspace's measured rate.
 *
 * `computeTimeToOutcome` is `/tools/time-to-outcome-calculator`'s own
 * arithmetic, run on measured inputs instead of typed ones — the same device
 * `src/lib/verdict/latency.ts` uses, and for the same reason: the product must
 * not tell a paying customer something softer than the public calculator tells
 * a stranger. Its verdict is carried through unedited, including the ones that
 * say this test cannot conclude in any useful timeframe.
 *
 * Submissions only. That calculator's denominator is gradeable submissions per
 * month, and a draft has no view rate to convert a per-visitor requirement
 * with — which is itself the honest answer, since nothing has ever counted
 * views for a form that has not been served.
 */
function forecastFor(
  preRegistered: PreRegisteredEffect | null,
  arms: number,
  timing: HindsightReport["timing"],
): TimeToOutcomeResult | null {
  if (!preRegistered || preRegistered.basis !== "submission") return null;
  if (!Number.isFinite(timing.submissionsPerMonth) || timing.submissionsPerMonth <= 0) return null;

  return computeTimeToOutcome({
    submissions: timing.submissionsPerMonth,
    gradeablePct: clamp(timing.gradedShare, 0, 1) * 100,
    closeRate: clamp(preRegistered.baselineRate, 0, 1) * 100,
    liftPct: preRegistered.relativeLift * 100,
    medianDays: timing.medianDaysToVerdict ?? 0,
    variants: Math.max(2, arms),
  });
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

type StateInput = {
  arms: VariantArm[];
  control: VariantArm | null;
  basis: RankingBasis;
  runningDays: number | null;
  timing: HindsightReport["timing"];
  comparisons: Comparison[];
  leaderComparisons: Comparison[];
  yieldLeader: string | null;
  requirement: SampleRequirement;
};

/**
 * The gates, in the order the problems bite.
 *
 * Exported so `tests/hindsight.test.mts` can assert the state directly rather
 * than pattern-matching on a headline, and so a future surface cannot reach a
 * different conclusion from the same numbers by reimplementing the ladder.
 */
export function decideState(input: StateInput): HindsightState {
  const { arms, control, basis, runningDays, timing, comparisons, leaderComparisons, requirement } =
    input;

  const compared = arms.filter((arm) => arm.report.submissions > 0);
  if (control === null || compared.length < 2) return "not_enough_data";
  if (comparisons.length === 0) return "not_enough_data";

  // An arm that received nothing at all while its siblings received hundreds.
  //
  // Without this the test never concludes and never says why: `allWinnable`
  // requires every comparison to clear, the empty arm's z-test has no trials
  // and can never clear, and the panel sits on "underpowered" forever pointing
  // at a sample size that is not the problem. On the exposure basis the ratio
  // check below catches it first and says so more precisely; on the submission
  // basis nothing else would.
  if (compared.length < arms.length && compared.some((arm) => arm.report.submissions >= 10)) {
    return "not_enough_data";
  }

  // Gate 0.5 — is this even a split?
  //
  // Only on the exposure basis. On submissions a ratio mismatch is not
  // necessarily a broken split at all — a variant that genuinely drives fewer
  // fills produces exactly this signature, and that is the finding rather than
  // a fault. Blocking on it there would mean refusing to report the very effect
  // the test was run to detect.
  if (basis === "exposure" && compared.some((arm) => arm.srmSuspect)) return "split_broken";

  // Gate 1 — outcomes. Same threshold as Yield's `assessConfidence` and
  // `latency.ts`'s `MIN_GRADED`, on purpose: three parts of the product
  // disagreeing about how much data is enough is how a customer learns not to
  // trust any of them.
  if (compared.some((arm) => arm.report.resolved < MIN_RESOLVED)) return "not_enough_data";

  // Gate 2 — maturity. Either half of it blocks. This is the gate the whole
  // feature is for; see the header.
  if (runningDays === null || runningDays < MIN_RUNNING_DAYS) return "still_maturing";
  if (timing.medianDaysToVerdict !== null && runningDays < timing.medianDaysToVerdict) {
    return "still_maturing";
  }
  if (
    compared.some(
      (arm) => arm.resolvedShare === null || arm.resolvedShare < MIN_RESOLVED_SHARE,
    )
  ) {
    return "still_maturing";
  }

  // Gate 3 — the ranking metric has to exist for everyone being ranked.
  if (compared.some((arm) => rankingRate(arm, basis) === null)) return "not_enough_data";

  // Against the *leader*, not the control. A three-arm test where the control
  // differs significantly from both challengers says nothing about whether the
  // leading challenger beat the other one; declaring it the winner on that
  // basis would ship an arm that was never compared to its nearest rival.
  if (leaderComparisons.length === 0) return "not_enough_data";

  const anySignificant = leaderComparisons.some((comparison) => comparison.significant);
  const allWinnable = leaderComparisons.every(
    (comparison) => comparison.significant && comparison.powered,
  );

  if (allWinnable) return "winner";

  // Significant somewhere but not yet backed by the sample that difference
  // needs. The peeking guard: this is the state that stops a green p-value on
  // twelve outcomes from being a recommendation.
  if (anySignificant) return "underpowered";

  // Nothing significant. Whether that means "they are the same" or "we cannot
  // tell" is decided by whether a difference worth acting on could have been
  // seen at all.
  //
  // With a pre-registration this is the state that finally became reachable:
  // the threshold is a fixed number decided before the data existed, rather
  // than one recomputed from the observed control rate on every page load. A
  // finish line that moves with the thing being measured is a finish line a
  // test can approach forever without crossing.
  const smallest = Math.min(...compared.map((arm) => rankingTrials(arm, requirement.basis)));
  if (requirement.perArm !== null && smallest >= requirement.perArm) {
    return "no_difference";
  }
  return "underpowered";
}

/**
 * How long the test has been collecting.
 *
 * From `startedAt` when there is one. A draft that somehow has submissions
 * falls back to its first submission, because a test measured from a start it
 * never had would report zero days and refuse forever.
 */
function measureRunningDays(
  test: HindsightReport["test"],
  arms: VariantArm[],
  now: Date,
): number | null {
  const starts: number[] = [];
  if (test.startedAt) starts.push(test.startedAt.getTime());
  for (const arm of arms) {
    const first = arm.report.inputs.firstSubmissionAt;
    if (first) starts.push(first.getTime());
  }
  if (starts.length === 0) return null;

  const from = Math.min(...starts);
  const to = (test.stoppedAt ?? now).getTime();
  const days = (to - from) / 86_400_000;
  return Number.isFinite(days) && days >= 0 ? days : null;
}

// ---------------------------------------------------------------------------
// Saying it out loud
// ---------------------------------------------------------------------------

function describe(report: HindsightReport): Verdict {
  // `leaderComparisons` throughout, not `comparisons`: every sentence below is
  // about why a winner was or was not declared, and that decision is made
  // against the front-runner. The control-based set is what the workings print.
  const { state, arms, basis, leaderComparisons: comparisons, runningDays, timing, requirement } =
    report;
  const leader = armById(report, report.yieldLeader);
  const control = arms.find((arm) => arm.variant.isControl) ?? arms[0] ?? null;

  switch (state) {
    case "not_enough_data":
      return notEnoughData(report);

    case "split_broken": {
      const broken = arms.filter((arm) => arm.srmSuspect);
      return {
        tone: "bad",
        headline: "The traffic split is not what it was set to",
        detail: `${broken.map((arm) => `${name(arm)} was set to ${formatPercent(arm.plannedShare, 0)} of traffic and received ${formatPercent(arm.observedShare, 0)}`).join("; ")}. On this much traffic that is too large a gap to be chance, which means something between the visitor and the form is sorting people — a cache serving one variant, a redirect, a bot filter, an ad blocker. Whatever it sorts on is now a difference between these arms that has nothing to do with the form, so nothing below can be read as a comparison. Fix the split and start a new test; the submissions already collected cannot be repaired.`,
      };
    }

    case "still_maturing":
      return stillMaturing(report, runningDays, timing);

    case "underpowered": {
      // The comparison that is actually blocking, not merely the first
      // significant one. With three arms the leader can be miles clear of the
      // control and level with the runner-up, and naming the control
      // comparison there would explain the wrong thing.
      const blocking = comparisons.find(
        (comparison) => !(comparison.significant && comparison.powered),
      );

      if (blocking?.significant) {
        const rival = armById(report, blocking.challengerId);
        return {
          tone: "warn",
          headline: "Ahead, and not yet earned",
          detail: `${name(leader)} is ahead of ${name(rival)} on Yield and the difference clears the ${formatPercent(1 - blocking.alpha, 1)} bar — but neither arm has reached the ${formatNumber(blocking.requiredPerArm)} ${unit(requirement.basis, blocking.requiredPerArm ?? 0)} per arm ${requiredBy(requirement)}. This panel recomputes every time you open it, and stopping the first time it turns green is how a split test reports a coin flip as a finding. Keep it running.${observedAside(blocking)}`,
        };
      }

      if (blocking && comparisons.some((comparison) => comparison.significant)) {
        const rival = armById(report, blocking.challengerId);
        return {
          tone: "warn",
          headline: `${name(leader)} is ahead overall, and level with ${name(rival)}`,
          detail: `${name(leader)} has the highest Yield rate and beats at least one other arm convincingly, but the gap between it and ${name(rival)} does not clear ${formatPercent(1 - blocking.alpha, 1)}${blocking.requiredPerArm === null ? "" : ` and would need about ${formatNumber(blocking.requiredPerArm)} ${unit(requirement.basis, blocking.requiredPerArm)} per arm to`}. A front-runner that has not separated from the arm behind it is a front-runner by luck as easily as by merit, so there is no winner here yet — only a shortlist of two.`,
        };
      }
      return {
        tone: "neutral",
        headline: "Not enough traffic to tell these apart",
        detail: `Nothing here clears ${formatPercent(1 - (comparisons[0]?.alpha ?? BASE_ALPHA), 1)}, and the arms are too small for that to mean much: detecting a ${formatPercent(requirement.relativeLift, 0)} improvement on ${requirement.source === "pre_registered" ? `the ${formatPercent(requirement.baselineRate, 1)} baseline this test was registered against` : `${name(control)}'s observed Yield rate`} would take about ${requirement.perArm === null ? "more traffic than this window has" : `${formatNumber(requirement.perArm)} ${unit(requirement.basis, requirement.perArm)} per arm`}. This is the answer most outcome-weighted tests give, and it is the honest one.`,
      };
    }

    case "no_difference":
      return {
        tone: "neutral",
        headline: "No difference worth acting on",
        detail: `Both arms have enough ${unit(requirement.basis, 2)} that a ${formatPercent(requirement.relativeLift, 0)} improvement in Yield would have shown up, and none did. That is a result rather than a shrug: whatever separates these two variants, it is not moving what the submissions turn out to be worth. Spend the traffic on a bigger change.${requirement.source === "pre_registered" ? ` This is the size of effect you registered as worth acting on before the test started, so the finish line is where you put it rather than somewhere the data moved it.` : ""}`,
      };

    case "winner": {
      const worst = comparisons.reduce<Comparison | null>(
        (lowest, comparison) =>
          lowest === null || (comparison.test.p ?? 1) > (lowest.test.p ?? 1) ? comparison : lowest,
        null,
      );
      return {
        tone: "good",
        headline: report.disagree
          ? `${name(leader)} closes more, and it is not the one that fills more`
          : `${name(leader)} is ahead on money`,
        detail: `${name(leader)} has the highest Yield rate ${basis === "exposure" ? "per visitor shown the form" : "per submission"}, the gap holds at ${formatPercent(1 - (worst?.alpha ?? BASE_ALPHA), 1)} against every other arm, and both sides have reached ${requirement.source === "pre_registered" ? "the sample this test was registered to need" : "the sample that difference needs"}. ${report.disagree ? `${name(armById(report, report.completionLeader))} collected more submissions and closed fewer of them — which is the mistake this test exists to catch. ` : ""}What you have learned is a fact about these two variants on this traffic, not a general rule about forms.`,
      };
    }
  }
}

function notEnoughData(report: HindsightReport): Verdict {
  const populated = report.arms.filter((arm) => arm.report.submissions > 0);

  if (populated.length === 0) {
    return {
      tone: "neutral",
      headline: "Nothing has arrived yet",
      detail:
        "Both arms are empty. Once the form starts being served, submissions land against whichever variant the visitor was shown and this table starts filling in — outcomes some weeks after that.",
    };
  }

  if (populated.length < 2) {
    return {
      tone: "neutral",
      headline: "Only one arm has anything in it",
      detail: `${name(populated[0])} has submissions and nothing else does. A split test with one populated arm is a report on one variant, which is worth reading and is not a comparison. Check that traffic is actually reaching the other arm.`,
    };
  }

  const empty = report.arms.filter((arm) => arm.report.submissions === 0);
  if (empty.length > 0) {
    return {
      tone: "bad",
      headline: `${empty.map((arm) => name(arm)).join(" and ")} ${empty.length === 1 ? "has" : "have"} received nothing`,
      detail: `The other ${populated.length} arms have ${formatNumber(populated.reduce((sum, arm) => sum + arm.report.submissions, 0))} submissions between them and ${empty.length === 1 ? "this one has" : "these have"} none, which is a serving problem rather than a slow start. Until it is fixed nothing here can conclude: a comparison against an empty arm has no answer, so the test would sit on "not enough traffic" indefinitely while pointing at the wrong number.`,
    };
  }

  const thin = populated
    .filter((arm) => arm.report.resolved < MIN_RESOLVED)
    .map((arm) => `${name(arm)} has ${formatNumber(arm.report.resolved)}`);

  const nothingClosed = populated.every((arm) => arm.report.won === 0);

  return {
    tone: "neutral",
    headline: "Too few outcomes to rank on",
    detail: `A rate needs at least ${MIN_RESOLVED} decided submissions before it is worth quoting, and a difference between two of them needs far more. ${thin.join("; ")}. ${nothingClosed ? "Nothing has closed in any arm yet, so there is no Yield rate anywhere to compare — that may change, or it may turn out to be the finding." : "The submissions are arriving; the verdicts are what is missing."} This is the same answer /tools/outcome-weighted-split-test-calculator gives a stranger.`,
  };
}

function stillMaturing(
  report: HindsightReport,
  runningDays: number | null,
  timing: HindsightReport["timing"],
): Verdict {
  const median = timing.medianDaysToVerdict;
  const worst = report.arms
    .filter((arm) => arm.report.submissions > 0)
    .reduce<VariantArm | null>(
      (lowest, arm) =>
        lowest === null || (arm.resolvedShare ?? 0) < (lowest.resolvedShare ?? 0) ? arm : lowest,
      null,
    );

  if (median !== null && runningDays !== null && runningDays < median) {
    return {
      tone: "warn",
      headline: "This test is younger than your sales cycle",
      detail: `It has been running ${days(runningDays)}, and outcomes in this workspace take a median of ${days(median)} to land. A window shorter than that cannot have decided the median lead, so everything that has resolved is the fast tail — the small deals and the quick disqualifications — and reading a winner off it would rank the variants on how quickly their leads get turned down. There is no adjustment for this, only time. Come back in ${days(Math.max(0, median * 2 - runningDays))}.`,
    };
  }

  if (worst && (worst.resolvedShare ?? 0) < MIN_RESOLVED_SHARE) {
    return {
      tone: "warn",
      headline: "Most of this test has no outcome yet",
      detail: `${name(worst)} is ${formatPercent(worst.resolvedShare, 0)} decided — ${formatNumber(worst.report.open)} of its ${formatNumber(worst.report.submissions)} submissions are still awaiting a verdict. Below half decided, the leads that have come back are the ones that came back *fast*, and their rate is not the cohort's. ${timing.awaitingOlderThanMedian > 0 ? `${formatNumber(timing.awaitingOlderThanMedian)} of the open ones are already older than the median, which is a CRM problem rather than a waiting problem — those are unlikely to be "not yet".` : "Yield for each arm is shown as a bracket below; when those brackets stop overlapping there will be something to say."}`,
    };
  }

  return {
    tone: "warn",
    headline: "Too new to read",
    detail: `The test has been running ${runningDays === null ? "for no measurable time" : days(runningDays)}. Give it long enough that a submission from the first day could plausibly have closed.`,
  };
}

/**
 * Every gate, met or not, as a list.
 *
 * The point of printing the ones that pass as well as the ones that block is
 * that "not yet" stops being a mood and becomes a checklist with a bottom.
 */
function requirementsFor(report: HindsightReport): Requirement[] {
  // Again the leader-based set: these rows are the gates a winner has to clear.
  const { arms, runningDays, timing, leaderComparisons: comparisons, requirement } = report;
  const compared = arms.filter((arm) => arm.report.submissions > 0);
  const requirements: Requirement[] = [];

  requirements.push({
    // `have` is the count that is being judged, never "x of y" — the row
    // renders as "have · needs need", so a `have` containing its own "of"
    // produced "2 of 2 of 2".
    label:
      arms.length > 2
        ? `Arms with traffic, of ${formatNumber(arms.length)}`
        : "Two arms with traffic",
    have: formatNumber(compared.length),
    need: "2",
    met: compared.length >= 2,
  });

  const leanest = compared.reduce<VariantArm | null>(
    (lowest, arm) =>
      lowest === null || arm.report.resolved < lowest.report.resolved ? arm : lowest,
    null,
  );
  requirements.push({
    label: "Decided submissions in every arm",
    have: leanest ? `${formatNumber(leanest.report.resolved)} in ${name(leanest)}` : "0",
    need: String(MIN_RESOLVED),
    met: compared.length > 0 && compared.every((arm) => arm.report.resolved >= MIN_RESOLVED),
  });

  requirements.push({
    label: "Run for at least one of this workspace's median times-to-verdict",
    have: runningDays === null ? "not started" : days(runningDays),
    need: timing.medianDaysToVerdict === null ? null : days(timing.medianDaysToVerdict),
    met:
      runningDays !== null &&
      runningDays >= MIN_RUNNING_DAYS &&
      (timing.medianDaysToVerdict === null || runningDays >= timing.medianDaysToVerdict),
  });

  const leastResolved = compared.reduce<VariantArm | null>(
    (lowest, arm) =>
      lowest === null || (arm.resolvedShare ?? 0) < (lowest.resolvedShare ?? 0) ? arm : lowest,
    null,
  );
  requirements.push({
    label: "Every arm at least half decided",
    have: leastResolved ? `${formatPercent(leastResolved.resolvedShare, 0)} in ${name(leastResolved)}` : "—",
    need: formatPercent(MIN_RESOLVED_SHARE, 0),
    met:
      compared.length > 0 &&
      compared.every((arm) => (arm.resolvedShare ?? 0) >= MIN_RESOLVED_SHARE),
  });

  const smallest = compared.length > 0
    ? Math.min(...compared.map((arm) => rankingTrials(arm, requirement.basis)))
    : 0;
  const have = `${formatNumber(smallest)} ${unit(requirement.basis, smallest)}`;

  if (requirement.source === "pre_registered") {
    // **One row, not two.** With a pre-registration the sample that licenses a
    // winner and the sample that licenses "these are the same" are the same
    // number, because both come from the same fixed effect. Printing it twice
    // under two labels would suggest two gates where there is one, and the
    // single row is the honest shape of what changed: the finish line is now a
    // constant a person chose rather than a pair of numbers the data moves.
    requirements.push({
      label: `Sample the pre-registered effect needs (${formatPercent(requirement.relativeLift, 0)} improvement on a ${formatPercent(requirement.baselineRate, 1)} baseline)`,
      have,
      need: requirement.perArm === null ? null : formatNumber(requirement.perArm),
      met: requirement.perArm !== null && smallest >= requirement.perArm,
    });
  } else {
    const observedRequirement = comparisons.reduce<number | null>(
      (highest, comparison) =>
        comparison.requiredPerArm === null
          ? highest
          : Math.max(highest ?? 0, comparison.requiredPerArm),
      null,
    );

    requirements.push({
      label: "Sample the observed difference needs",
      have,
      need: observedRequirement === null ? null : `${formatNumber(observedRequirement)}`,
      met: observedRequirement !== null && smallest >= observedRequirement,
    });

    // Deliberately labelled for the conclusion it licenses rather than for the
    // arithmetic. It is not a gate on declaring a winner — a large effect can be
    // proven on a sample far too small to rule out a small one — and a row that
    // read "sample to rule out a 20% improvement" sitting unmet beside a declared
    // winner would look like the panel contradicting itself.
    requirements.push({
      label: `Sample to call it a tie (detecting a ${formatPercent(MIN_DETECTABLE_LIFT, 0)} improvement)`,
      have,
      need: requirement.perArm === null ? null : formatNumber(requirement.perArm),
      met: requirement.perArm !== null && smallest >= requirement.perArm,
    });
  }

  const best = comparisons.reduce<Comparison | null>(
    (lowest, comparison) =>
      lowest === null || (comparison.test.p ?? 1) < (lowest.test.p ?? 1) ? comparison : lowest,
    null,
  );
  requirements.push({
    label: "A difference that clears the corrected threshold",
    have: best?.test.p === null || best === null ? "no test possible" : `p = ${best.test.p.toFixed(3)}`,
    need: best ? `< ${best.alpha.toFixed(3)}` : null,
    met: comparisons.some((comparison) => comparison.significant),
  });

  return requirements;
}

/**
 * What would change the answer.
 *
 * The half of "not yet" that makes it useful. A refusal with no route out of it
 * is indistinguishable from a broken feature.
 */
function whatWouldChangeThis(report: HindsightReport): string[] {
  const { state, arms, runningDays, timing, leaderComparisons: comparisons, requirement } = report;
  if (state === "winner" || state === "no_difference") return [];

  if (state === "split_broken") {
    // Deliberately not a sample-size estimate. More traffic through a broken
    // splitter produces more unusable data, and offering a "come back in 12
    // days" here would be telling someone to wait out a problem that waiting
    // does not touch.
    return [
      "Check what sits between the visitor and the form: a CDN or page cache that stores one variant and serves it to everyone, a redirect that only fires for some visitors, or a bot filter that removes traffic unevenly.",
      "Confirm the variant weights are what you think they are, and that nobody changed them mid-run.",
      "Start a fresh test once the split is fixed. The submissions collected under a broken split cannot be corrected after the fact, because there is no record of who should have seen what.",
    ];
  }

  const out: string[] = [];
  const compared = arms.filter((arm) => arm.report.submissions > 0);

  // Time first when time is the problem. A test that is younger than the sales
  // cycle does not have a traffic shortage, and leading with a sample-size
  // estimate would tell somebody to buy their way out of a wait.
  if (
    state === "still_maturing" &&
    timing.medianDaysToVerdict !== null &&
    runningDays !== null &&
    runningDays < timing.medianDaysToVerdict
  ) {
    out.push(
      `Wait. Outcomes in this workspace take a median of ${days(timing.medianDaysToVerdict)} and the test has run for ${days(runningDays)}; no amount of extra traffic decides a lead faster.`,
    );
  }

  const target =
    requirement.source === "pre_registered"
      ? requirement.perArm
      : (comparisons.reduce<number | null>(
          (highest, comparison) =>
            comparison.requiredPerArm === null
              ? highest
              : Math.max(highest ?? 0, comparison.requiredPerArm),
          null,
        ) ?? requirement.perArm);

  if (target !== null && compared.length > 0 && runningDays !== null && runningDays > 0) {
    const smallest = Math.min(...compared.map((arm) => rankingTrials(arm, requirement.basis)));
    const shortfall = Math.max(0, target - smallest);
    if (shortfall > 0) {
      const perDay = smallest / runningDays;
      const daysToCollect = perDay > 0 ? shortfall / perDay : null;
      const settle = timing.medianDaysToVerdict ?? 0;
      out.push(
        daysToCollect === null
          ? `Each arm needs about ${formatNumber(target)} ${unit(requirement.basis, target)} and the leanest has ${formatNumber(smallest)}. Nothing is arriving, so no amount of waiting closes that gap.`
          : `Each arm needs roughly ${formatNumber(target)} ${unit(requirement.basis, target)}; the leanest has ${formatNumber(smallest)}. At the rate this test has been collecting that is about ${days(daysToCollect)} more of traffic${settle > 0 ? `, plus the ${days(settle)} the last of those submissions will take to get a verdict — so ${days(daysToCollect + settle)} before there is anything to call` : ""}.`,
      );
    }
  }

  if (timing.medianDaysToVerdict !== null && runningDays !== null && runningDays < timing.medianDaysToVerdict) {
    out.push(
      `Nothing shortens the wait for an outcome except a faster disposition. If your CRM can mark a lead sales-accepted or meeting-held sooner than won or lost, post that back as the verdict instead and re-run the test against a signal you can actually wait for.`,
    );
  }

  if (timing.awaitingOlderThanMedian > 0) {
    out.push(
      `${formatNumber(timing.awaitingOlderThanMedian)} submissions are still awaiting a verdict despite being older than the median. Those are not slow, they are undispositioned, and every one of them holds both arms down. That fix is in the CRM, not here.`,
    );
  }

  if (report.basis === "submission") {
    out.push(
      "There is no view count for these arms, so there is no completion rate to compare against Yield — only submission counts. A view count exists once the form is served from this endpoint rather than posted to it from markup we never render.",
    );
  }

  if (report.test.status === "draft") {
    out.push("The test is still a draft. Nothing is being split until it is started.");
  }

  return out;
}

/**
 * Caveats that apply to this particular test.
 *
 * Sentences rather than flags, matching Yield's, because they are printed
 * verbatim next to the number they qualify.
 */
function caveatsFor(report: HindsightReport): string[] {
  const { arms, basis, comparisons, timing, requirement } = report;
  const caveats: string[] = [];

  // Named rather than left implicit, because a reader who does not know which
  // rule is gating their test cannot tell how much the "not yet" is worth. The
  // observed rule is the one with the defect #59 records; saying so is the
  // difference between a limitation and a surprise.
  if (requirement.unusableReason !== null) {
    caveats.push(requirement.unusableReason);
  } else if (requirement.source === "observed") {
    caveats.push(
      "No effect size was registered for this test, so the sample it has to reach is derived from the difference the arms have actually shown. That is circular: a gap that is mostly noise is a large gap, and a large gap asks for a small sample — so the requirement is loosest exactly when it is doing the most work. Fixing the effect you care about when the test is created removes that, and it can only be done before a test starts.",
    );
  } else {
    caveats.push(
      `The sample this test is waiting for was fixed before it started — enough to detect a ${formatPercent(requirement.relativeLift, 0)} improvement on a ${formatPercent(requirement.baselineRate, 1)} baseline — so it does not move as the numbers do. That removes one way a split test flatters itself and not the others: this panel still recomputes every time you open it, and a pre-registered effect size is not a pre-registered stopping point.`,
    );
  }

  if (comparisons.length > 1) {
    caveats.push(
      `${formatNumber(comparisons.length)} arms are being compared against the control, so the threshold each one is judged at has been divided by ${formatNumber(comparisons.length)} — ${comparisons[0].alpha.toFixed(4)} rather than ${BASE_ALPHA}. Running several comparisons at 95% each is not a 95% test; one of them goes green by chance eventually.`,
    );
  }

  caveats.push(
    "Every number here recomputes when you open the page. A test read once a day until it agrees with you is not a 95% test, which is why a winner needs the sample the difference requires and not only a p-value under the line.",
  );

  if (basis === "exposure") {
    caveats.push(
      "Exposures count server renders, not people. A reload, a prefetch and a crawler each add one, and the same person on a phone and a laptop is two. That inflates both arms in the same direction and does not bias the comparison, but it does mean the completion rates here are lower than a human-only measurement would give.",
    );
    // Named for the same reason Yield names its deleted rows: an exclusion
    // nobody can see is the dishonest dashboard we position against. Enrolling
    // a cookie-refusing visitor would mean fingerprinting exactly the people
    // who signalled they did not want to be followed, so they are left out —
    // and being left out is a sampling fact a reader is entitled to.
    caveats.push(
      "Only visitors who accept a first-party cookie are in this test. Sticking somebody to one variant needs a stable key, and the alternative — deriving one from their address and browser — is a fingerprint whatever it is called, so visitors who refuse the cookie are not enrolled. Their submissions are still stored, delivered and counted in Yield; they are simply not in these numbers. That makes this a measurement of cookie-accepting visitors, who are not a random sample of everyone who saw the form.",
    );
  } else {
    caveats.push(
      "No view count exists for these arms, so every rate here is per submission. That cannot see a variant that wins by attracting fewer, better fills: the people it turned away are not in either number.",
    );
  }

  const srm = arms.filter((arm) => arm.srmSuspect === true);
  if (srm.length > 0) {
    caveats.push(
      `${srm.map((arm) => name(arm)).join(" and ")} received materially ${srm.length === 1 ? "a different share of traffic" : "different shares of traffic"} from the weight configured for ${srm.length === 1 ? "it" : "them"}. Something between the visitor and the form is interfering — a cache, a redirect, a bot filter — and until that is explained these arms are two populations rather than one split in two.`,
    );
  }

  for (const arm of arms) {
    for (const caveat of arm.report.caveats) {
      // Yield's own caveats about a single arm, attributed rather than merged,
      // so "one deal is 60% of this total" is readable as a fact about the arm
      // it applies to instead of about the test.
      if (caveat.startsWith("Value per visitor")) continue;
      caveats.push(`${name(arm)}: ${caveat}`);
    }
  }

  if (timing.p90DaysToVerdict !== null && timing.medianDaysToVerdict !== null && timing.p90DaysToVerdict > timing.medianDaysToVerdict * 3) {
    caveats.push(
      `The tail is long: half of these leads are decided in ${days(timing.medianDaysToVerdict)} and one in ten takes ${days(timing.p90DaysToVerdict)} or more. The median understates how long this test has to run, because the slow deals are also the large ones.`,
    );
  }

  return caveats;
}

// ---------------------------------------------------------------------------
// Sample ratio, and the public calculator
// ---------------------------------------------------------------------------

/**
 * Did each arm actually receive the share of traffic it was configured for?
 *
 * A split test whose arms got 70/30 when they were set to 50/50 is not a test —
 * something upstream is sorting visitors, and whatever it is sorting on is now
 * a difference between the arms that has nothing to do with the form. This is
 * the check that catches a broken experiment before its numbers are believed,
 * and it is left out of most A/B tools entirely.
 *
 * A normal approximation to the binomial rather than a chi-square, because it
 * needs nothing this codebase does not already have (`normalCdf`) and because
 * the per-arm z is the number a person can act on: it names *which* arm is
 * short.
 */
export function sampleRatioCheck(
  observed: number,
  totalObserved: number,
  expectedShare: number,
): { z: number | null; p: number | null; suspect: boolean } {
  if (totalObserved <= 0 || expectedShare <= 0 || expectedShare >= 1) {
    return { z: null, p: null, suspect: false };
  }
  const expected = totalObserved * expectedShare;
  const variance = totalObserved * expectedShare * (1 - expectedShare);
  if (variance <= 0) return { z: null, p: null, suspect: false };

  const z = (observed - expected) / Math.sqrt(variance);
  if (!Number.isFinite(z)) return { z: null, p: null, suspect: false };

  const p = clamp(2 * (1 - normalCdf(Math.abs(z))), 0, 1);
  return { z, p, suspect: Math.abs(z) > SRM_SIGMA };
}

/**
 * What `/tools/outcome-weighted-split-test-calculator` says about these same
 * numbers.
 *
 * The same device `src/lib/verdict/latency.ts` uses: the product does not get
 * to be softer to a paying customer than the public calculator is to a stranger
 * who has paid us nothing, and the only way to guarantee that is to run the
 * stranger's arithmetic and print what it says. If the bands here ever start
 * flattering the product, this line contradicts them on the same screen.
 *
 * Only for the two-arm case with exposures on both, because that is the shape
 * the calculator's inputs describe. The float it takes for value goes nowhere
 * near anything printed as money — every amount on this page comes from the
 * `bigint` cents inside each arm's Yield report.
 */
function runCalculator(
  arms: VariantArm[],
  control: VariantArm | null,
  basis: RankingBasis,
): SplitTestResult | null {
  if (basis !== "exposure" || control === null || arms.length !== 2) return null;
  const challenger = arms.find((arm) => arm.variant.id !== control.variant.id);
  if (!challenger) return null;
  if ((control.exposures ?? 0) <= 0 || (challenger.exposures ?? 0) <= 0) return null;

  return computeSplitTest({
    aVisitors: control.exposures ?? 0,
    aCompletions: control.report.submissions,
    aWon: control.report.won,
    aValue: dollars(control),
    bVisitors: challenger.exposures ?? 0,
    bCompletions: challenger.report.submissions,
    bWon: challenger.report.won,
    bValue: dollars(challenger),
  });
}

/**
 * An arm's recorded value as a plain number of currency units.
 *
 * The only float derived from money anywhere in Hindsight, and it exists solely
 * to feed the calculator above, whose signature predates `bigint` cents. It is
 * never rendered: `formatCents` on the arm's own totals is what the screen
 * shows. Only the largest currency is passed, because the calculator has one
 * value field and adding two currencies together would be wrong in both.
 */
function dollars(arm: VariantArm): number {
  const first = arm.report.value[0];
  if (!first) return 0;
  const value = Number(first.totalCents) / 100;
  return Number.isFinite(value) ? value : 0;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function armById(report: HindsightReport, id: string | null): VariantArm | null {
  if (id === null) return null;
  return report.arms.find((arm) => arm.variant.id === id) ?? null;
}

function name(arm: VariantArm | null): string {
  return arm?.variant.name ?? "that variant";
}

/** How a requirement earned its number, in the middle of a sentence. */
function requiredBy(requirement: SampleRequirement): string {
  return requirement.source === "pre_registered"
    ? `this test was registered to need, to detect the ${formatPercent(requirement.relativeLift, 0)} improvement you said was worth acting on`
    : "a difference that size actually needs";
}

/**
 * The gap between a pre-registered requirement and what the observed gap alone
 * would have asked for.
 *
 * Printed only when the observed number is materially smaller, because that is
 * the whole argument for #59 made concrete: a difference that demands far less
 * sample than the effect you care about is a difference large enough to be
 * mostly noise, and the old rule would have called it early on exactly that.
 */
function observedAside(comparison: Comparison): string {
  if (comparison.requirementSource !== "pre_registered") return "";
  const { requiredPerArm, observedRequiredPerArm } = comparison;
  if (requiredPerArm === null || observedRequiredPerArm === null) return "";
  if (observedRequiredPerArm >= requiredPerArm * 0.5) return "";
  return ` The gap as currently observed would only need ${formatNumber(observedRequiredPerArm)} — which is what a difference this large looks like when a good deal of it is noise, and is why the number being waited for is the one fixed before the test began.`;
}

function unit(basis: RankingBasis, count: number): string {
  const one = basis === "exposure" ? "visitor" : "submission";
  return count === 1 ? one : `${one}s`;
}

function days(value: number): string {
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}
