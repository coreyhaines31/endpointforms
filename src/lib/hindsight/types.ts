import type { ProportionTest, SplitTestResult, Verdict } from "../tools/engine.ts";
import type { Interval, YieldReport, YieldTallies } from "../yield/types.ts";

/**
 * The shapes Hindsight produces (#45).
 *
 * Separated from the modules that compute them, the same way
 * `src/lib/yield/types.ts` is: a component can name one of these without
 * importing anything that opens a database connection. `eslint.config.mjs`
 * explains why that separation is enforced rather than encouraged.
 *
 * Money never appears here as a number. Every amount lives inside the
 * `YieldReport` on an arm, as `bigint` cents — see `src/lib/yield/money.ts`.
 */

export type { Interval, ProportionTest, Verdict };

export type SplitTestStatus = "draft" | "running" | "stopped";

/** One variant, as defined rather than as measured. */
export type VariantDefinition = {
  id: string;
  name: string;
  /**
   * The arm every other arm is compared against.
   *
   * Exactly one per test. Without one, "B beat A" and "A beat B" are the same
   * sentence read from different ends, and which variant a workspace *keeps* if
   * the test never resolves stops being defined.
   */
  isControl: boolean;
  /** Relative traffic share. Two variants at 1 and 3 split 25/75. */
  weight: number;
  /**
   * The form definition this arm serves, or null for "whatever the endpoint's
   * active schema is". Null is the ordinary control: an endpoint that already
   * had a form gets a variant pointing at nothing new.
   */
  schemaVersionId: string | null;
};

/** The test itself, without its numbers. */
export type SplitTestDefinition = {
  id: string;
  publicId: string;
  endpointPublicId: string;
  endpointName: string | null;
  name: string;
  status: SplitTestStatus;
  /** When traffic started splitting. Null while the test is a draft. */
  startedAt: Date | null;
  stoppedAt: Date | null;
  variants: VariantDefinition[];
};

/**
 * What a variant was shown, counted.
 *
 * Deliberately named exposures rather than visitors or impressions, because it
 * is neither: it is the number of times the server rendered this arm. A reload
 * is two, a prefetch is one, a crawler is one, and a person who opens the form
 * on their phone and again on their laptop is two. Nothing here corrects for
 * that, and the panel says so — see `basisNote` in `./compare.ts`.
 *
 * Null, not zero, when nothing counted them. Zero would claim the form was
 * never shown, which is exactly wrong for the common case: an endpoint a
 * customer's own HTML posts to is never rendered by us, so we never see the
 * view. That case has submissions and no exposures, and the difference between
 * "shown nought times" and "we were not watching" decides whether a completion
 * rate exists at all.
 */
export type VariantExposure = {
  variantId: string;
  exposures: number | null;
};

/**
 * One arm of the test, measured.
 *
 * The `report` is a full `YieldReport` computed by `computeYield` — the same
 * arithmetic, the same bracket, the same caveats as the Yield panel. Hindsight
 * does not have a second opinion about what a Yield rate is; it has an opinion
 * about when two of them may be compared.
 */
export type VariantArm = {
  variant: VariantDefinition;
  report: YieldReport;
  /** Server renders of this arm. Null when nothing counted them. */
  exposures: number | null;
  /** `submissions / exposures` — the metric every other tool calls the result. */
  completionRate: number | null;
  /** `won / exposures`. The quality-adjusted rate, per person shown the form. */
  yieldRatePerExposure: number | null;
  /** `won / submissions`. Always available; the ranking metric when exposures are not. */
  yieldRatePerSubmission: number | null;
  /** Wilson 95% on whichever of the two above the ranking used. Sampling error only. */
  interval: Interval | null;
  /** `resolved / submissions`. How much of this arm has actually been decided. */
  resolvedShare: number | null;

  /** The share of traffic this arm's weight called for, 0..1. */
  plannedShare: number;
  /** The share it actually received, on the ranking basis. Null with no traffic anywhere. */
  observedShare: number | null;
  /** How many standard deviations the observed share is from the planned one. */
  srmZ: number | null;
  /**
   * True when this arm's traffic share is too far from its weight to be chance.
   *
   * A broken split, not a bad variant: something between the visitor and the
   * form is sorting people — a cache, a redirect, a bot filter — and whatever
   * it sorts on has become a difference between the arms that has nothing to do
   * with the form. Every number on the panel is unreliable while this is true.
   */
  srmSuspect: boolean;
};

/**
 * Which denominator the ranking used.
 *
 * `exposure` is the honest one: a variant that suppresses submissions but
 * closes all of them is genuinely better per person shown the form, and only a
 * per-exposure rate can express that. `submission` is the fallback for an
 * endpoint we never rendered, and it is weaker in a specific direction worth
 * naming — it cannot see a variant that wins by driving fewer, better fills,
 * because the fills it drove away are not in either number.
 */
export type RankingBasis = "exposure" | "submission";

/**
 * One arm measured against a baseline, at an alpha corrected for how many arms
 * there are.
 *
 * Two sets of these exist and they answer different questions. `comparisons`
 * uses the **control** as the baseline — "did my change beat what I was already
 * running", which is what a person wants to read. `leaderComparisons` uses the
 * **front-runner** — "is the arm at the top actually ahead of the others",
 * which is the only thing that licenses declaring a winner. With two arms they
 * are the same set; with three or more they are not, and using the first for
 * the second's job is a bug this type's shape exists to prevent.
 */
export type Comparison = {
  /** The arm being measured against: the control, or the leader. */
  baselineId: string;
  challengerId: string;
  /** Two-sided two-proportion z-test on the ranking metric. */
  test: ProportionTest;
  /** The corrected threshold this p-value was actually judged against. */
  alpha: number;
  /** `test.p < alpha`. Not `test.significant`, which hardcodes 0.05. */
  significant: boolean;
  /** Sample per arm the observed difference needs at 95% confidence and 80% power. */
  requiredPerArm: number | null;
  /** How much more each arm needs. Null when the requirement is unknown or met. */
  shortfallPerArm: number | null;
  /** True when both arms have reached `requiredPerArm`. */
  powered: boolean;
};

/**
 * The decision, as a state rather than a sentence, so the UI can branch on it
 * and a test can assert it.
 *
 * Ordered by how far the test has got. Everything before `no_difference` means
 * "not yet"; only the last two are answers. `split_broken` is the one that is
 * not about waiting: it says the experiment itself is wrong and no amount of
 * further traffic will fix the numbers already collected.
 *
 * `underpowered` exists as its own state rather than being folded into
 * `no_difference`, and the distinction is the whole honesty of the readout: "we
 * looked and they are the same" and "we cannot yet tell them apart" are
 * different claims, and printing the first when the second is true is how a
 * split test talks somebody out of a real difference.
 */
export type HindsightState =
  | "not_enough_data"
  | "split_broken"
  | "still_maturing"
  | "underpowered"
  | "no_difference"
  | "winner";

/**
 * How long outcomes take.
 *
 * The median and p90 are the **workspace's** disposition lag, not this test's.
 * A median measured inside a test is bounded by the test's own age — nothing in
 * it can have taken longer to decide than the test has been running — so it can
 * never show that a test is younger than the sales cycle, which is the one
 * thing the maturity gate needs it for. `src/lib/hindsight/query.ts` has the
 * full argument.
 *
 * `awaitingOlderThanMedian` is scoped to the test: how many of *these* leads
 * are overdue, judged against the workspace's clock.
 */
export type HindsightTiming = {
  medianDaysToVerdict: number | null;
  p90DaysToVerdict: number | null;
  /** This test's open submissions already older than that median. */
  awaitingOlderThanMedian: number;
};

/** What the test would need before it could say something it currently cannot. */
export type Requirement = {
  label: string;
  /** Where it stands now, already formatted. */
  have: string;
  /** What it needs, already formatted. Null when the requirement is unquantifiable. */
  need: string | null;
  met: boolean;
};

export type HindsightReport = {
  test: SplitTestDefinition;
  /** Days of collection. From `startedAt`, or the first submission when never started. */
  runningDays: number | null;
  arms: VariantArm[];
  basis: RankingBasis;
  timing: HindsightTiming;

  /** Variant id with the highest completion rate. Null when no arm has one. */
  completionLeader: string | null;
  /** Variant id with the highest Yield rate on the ranking basis. */
  yieldLeader: string | null;
  /**
   * True when those are different variants.
   *
   * The single most persuasive fact this product can show, and the reason the
   * scoreboard shows both metrics at once with no toggle. It is reported
   * whether or not the difference is significant, because "the two metrics
   * disagree" is a fact about the numbers, while "and it is real" is a separate
   * claim this report makes separately and much more reluctantly.
   */
  disagree: boolean;

  /** Every other arm against the control. What the workings print. */
  comparisons: Comparison[];
  /**
   * Every other arm against the front-runner. What licenses a winner.
   *
   * Identical to `comparisons` when the control is the leader, which is most of
   * the time. When it is not, these are the tests that actually matter: a
   * three-arm test where the control differs significantly from both
   * challengers tells you nothing about whether the leading challenger beat the
   * other one, and declaring it the winner on that basis would be ranking two
   * arms that were never compared.
   */
  leaderComparisons: Comparison[];
  state: HindsightState;
  /** What to tell the customer. Shares `Verdict` with Yield and the public tools. */
  decision: Verdict;
  /** Every gate the decision passed through, met or not. */
  requirements: Requirement[];
  /** What would change the answer, in plain sentences. */
  whatWouldChangeThis: string[];
  /** Caveats that apply to this particular test. */
  caveats: string[];
  /**
   * The public calculator's own verdict on the same two arms.
   *
   * Null unless the test has exactly two arms with exposures on both — the
   * shape `/tools/outcome-weighted-split-test-calculator` accepts. Carried for
   * the reason `src/lib/verdict/latency.ts` carries `computeTimeToOutcome`:
   * the product must not say something softer to a paying customer than the
   * calculator says to a stranger who has paid us nothing, and the way to
   * guarantee that is to run the stranger's arithmetic and print what it says.
   */
  calculator: SplitTestResult | null;
};

/** Everything `computeHindsight` needs, with no database anywhere near it. */
export type HindsightInput = {
  test: SplitTestDefinition;
  /** One entry per variant. Arms with no entry are reported as empty, not dropped. */
  tallies: { variantId: string; tallies: YieldTallies }[];
  timing: HindsightTiming;
  /** Evaluated against `now` so the running window is testable without a clock. */
  now?: Date;
};
