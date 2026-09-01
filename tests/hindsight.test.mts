/**
 * Hindsight — split tests ranked on Yield (#45).
 *
 * Written from "how does this test declare a winner it should not have?" rather
 * than from line coverage, because a split test that is wrong is not a split
 * test that crashes — it is one that is confidently, plausibly, expensively
 * wrong, and every number on it looks fine.
 *
 * The six ways it lies, each with tests below:
 *
 *   1. **Calling it before the outcomes land.** The single most important
 *      section in this file. A window shorter than the sales cycle sees only
 *      the fast tail, and the fast tail is the small deals and the quick
 *      disqualifications — so an early call ranks variants on how quickly their
 *      leads get turned down.
 *   2. **Calling it on a green p-value.** This panel recomputes on every page
 *      load; significance alone must not be enough.
 *   3. **Saying "no difference" when it means "we cannot tell".** Two claims,
 *      and printing the first for the second is the same lie pointed backwards.
 *   4. **Ranking on fills.** The raw winner and the Yield winner must be
 *      allowed to be different variants, and the report has to say so.
 *   5. **Comparing arms that never got the same traffic.** A broken split is
 *      not a slow test; more data does not fix it.
 *   6. **`NaN`, `Infinity` or a re-shuffled assignment.** Every report produced
 *      here is walked recursively and asserted clean, and the assignment is
 *      asserted deterministic and correctly weighted over ten thousand
 *      synthetic visitors.
 *
 * No database. `tests/hindsight-query.test.mts` covers the SQL.
 */

import {
  assignVariant,
  bucketFor,
  hashToUnitInterval,
  plannedShares,
  readVisitorKey,
} from "../src/lib/hindsight/assign.ts";
import {
  computeHindsight,
  MIN_DETECTABLE_LIFT,
  MIN_RESOLVED_SHARE,
  sampleRatioCheck,
} from "../src/lib/hindsight/compare.ts";
import type {
  HindsightReport,
  HindsightState,
  SplitTestDefinition,
  VariantDefinition,
} from "../src/lib/hindsight/types.ts";
import { emptyTallies, MIN_RESOLVED } from "../src/lib/yield/compute.ts";
import type { YieldTallies } from "../src/lib/yield/types.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const okay = show(got) === show(want);
  if (okay) pass++;
  else fail++;
  console.log(`  ${okay ? "PASS" : "FAIL"}  ${name}`);
  if (!okay) console.log(`        got  ${show(got)}\n        want ${show(want)}`);
};

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${show(detail)}`);
};

/** `JSON.stringify` throws on a bigint, and every amount inside a report is one. */
function show(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => (typeof entry === "bigint" ? `${entry}n` : entry));
}

const section = (name: string) => console.log(`\n${name}`);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-08-31T12:00:00.000Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

/** Ids are sorted inside `assignVariant`, so these are deliberately not in order. */
const CONTROL_ID = "11111111-1111-7111-8111-111111111111";
const CHALLENGER_ID = "22222222-2222-7222-8222-222222222222";
const THIRD_ID = "33333333-3333-7333-8333-333333333333";

function variant(
  id: string,
  name: string,
  overrides: Partial<VariantDefinition> = {},
): VariantDefinition {
  return { id, name, isControl: false, weight: 1, schemaVersionId: null, ...overrides };
}

function definition(
  variants: VariantDefinition[],
  overrides: Partial<SplitTestDefinition> = {},
): SplitTestDefinition {
  return {
    id: "test-1",
    publicId: "tst_public_1",
    endpointPublicId: "ep_public_1",
    endpointName: "Request a quote",
    name: "Four fields against seven",
    status: "running",
    startedAt: daysAgo(90),
    stoppedAt: null,
    variants,
    ...overrides,
  };
}

/**
 * One arm's tallies.
 *
 * `exposures` lands in `visitors`, which is exactly what Yield reserved it for
 * — see the note on `YieldTallies.visitors` in `src/lib/yield/types.ts`.
 */
function arm(options: {
  exposures?: number | null;
  submissions: number;
  won?: number;
  lost?: number;
  disqualified?: number;
  awaiting?: number;
  valueCents?: bigint;
  firstAt?: Date;
}): YieldTallies {
  const won = options.won ?? 0;
  const lost = options.lost ?? 0;
  const disqualified = options.disqualified ?? 0;
  const awaiting = options.awaiting ?? Math.max(0, options.submissions - won - lost - disqualified);

  return {
    ...emptyTallies(),
    submissions: options.submissions,
    won,
    lost,
    disqualified,
    awaiting,
    visitors: options.exposures === undefined ? null : options.exposures,
    money:
      options.valueCents === undefined
        ? []
        : [
            {
              currency: "USD",
              totalCents: options.valueCents,
              wonWithValue: won,
              largestCents: won > 0 ? options.valueCents / BigInt(won) : options.valueCents,
            },
          ],
    firstSubmissionAt: options.firstAt ?? daysAgo(90),
    lastSubmissionAt: daysAgo(1),
  };
}

const NO_TIMING = {
  medianDaysToVerdict: null,
  p90DaysToVerdict: null,
  awaitingOlderThanMedian: 0,
};

/** A workspace that decides a lead in a fortnight, with a long tail. */
const NORMAL_TIMING = {
  medianDaysToVerdict: 14,
  p90DaysToVerdict: 32,
  awaitingOlderThanMedian: 0,
};

const reports: { name: string; report: HindsightReport }[] = [];

function run(
  name: string,
  input: Parameters<typeof computeHindsight>[0],
): HindsightReport {
  const produced = computeHindsight({ now: NOW, ...input });
  reports.push({ name, report: produced });
  return produced;
}

/**
 * Walks a whole report looking for anything a screen must never print.
 *
 * Same rule, same helper, as `tests/yield.test.mts`: `null` means "no answer
 * from these numbers" and renders as an em dash; `NaN` and `Infinity` mean a
 * bug escaped into a customer's revenue report.
 */
function findUnsafeNumbers(value: unknown, path = "report"): string[] {
  if (typeof value === "number") {
    return Number.isFinite(value) ? [] : [`${path} = ${value}`];
  }
  if (typeof value === "string") {
    return /NaN|Infinity/.test(value) ? [`${path} contains "${value}"`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findUnsafeNumbers(entry, `${path}[${index}]`));
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.entries(value).flatMap(([key, entry]) =>
      findUnsafeNumbers(entry, `${path}.${key}`),
    );
  }
  return [];
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

section("assignment — deterministic, sticky, weighted");

{
  const variants = [
    variant(CONTROL_ID, "Control", { isControl: true }),
    variant(CHALLENGER_ID, "Shorter form"),
  ];

  const first = assignVariant("test-1", variants, "visitor-abc");
  const again = assignVariant("test-1", variants, "visitor-abc");
  t("the same visitor gets the same arm", again?.id, first?.id);

  const reversed = assignVariant("test-1", [...variants].reverse(), "visitor-abc");
  t("array order cannot change the assignment", reversed?.id, first?.id);

  const otherTest = assignVariant("test-2", variants, "visitor-abc");
  ok(
    "a different test hashes independently",
    // Not asserting they differ — with two arms they agree half the time by
    // chance. Asserting the *bucket* differs, which is the actual property:
    // a visitor must not be correlated across tests.
    bucketFor("test-1", "visitor-abc") !== bucketFor("test-2", "visitor-abc"),
    { first: first?.name, otherTest: otherTest?.name },
  );

  t("no variants means no assignment", assignVariant("test-1", [], "visitor-abc"), null);
}

{
  // Ten thousand synthetic visitors through an even split. The hash's
  // distribution is asserted rather than assumed — FNV-1a mixes poorly by
  // cryptographic standards, and "poorly" would show up here as a lopsided
  // split that quietly biases every test the product ever runs.
  const variants = [
    variant(CONTROL_ID, "Control", { isControl: true }),
    variant(CHALLENGER_ID, "B"),
  ];
  const counts = new Map<string, number>();
  for (let index = 0; index < 10_000; index++) {
    const assigned = assignVariant("test-1", variants, `visitor-${index}`);
    counts.set(assigned!.id, (counts.get(assigned!.id) ?? 0) + 1);
  }
  const control = counts.get(CONTROL_ID) ?? 0;
  ok(
    "an even split lands within 2% of even over 10,000 visitors",
    Math.abs(control - 5_000) < 200,
    { control, challenger: counts.get(CHALLENGER_ID) },
  );
}

{
  // A 90/10 test, which is what a workspace runs when it is watching a risky
  // change. The minority arm has to actually be a tenth.
  const variants = [
    variant(CONTROL_ID, "Control", { isControl: true, weight: 9 }),
    variant(CHALLENGER_ID, "B", { weight: 1 }),
  ];
  let challenger = 0;
  for (let index = 0; index < 10_000; index++) {
    if (assignVariant("test-1", variants, `visitor-${index}`)?.id === CHALLENGER_ID) challenger++;
  }
  ok("a 90/10 weight is honoured", Math.abs(challenger - 1_000) < 150, challenger);

  t("planned shares match the weights", plannedShares(variants), [0.9, 0.1]);
}

{
  // Every weight zero. A misconfigured test must not stop rendering a form —
  // the traffic was paid for either way.
  const variants = [
    variant(CONTROL_ID, "Control", { isControl: true, weight: 0 }),
    variant(CHALLENGER_ID, "B", { weight: 0 }),
  ];
  ok(
    "all-zero weights fall back to an even split rather than showing nobody anything",
    assignVariant("test-1", variants, "visitor-abc") !== null,
  );
  t("and the planned shares say even", plannedShares(variants), [0.5, 0.5]);

  const hostile = [
    variant(CONTROL_ID, "Control", { isControl: true, weight: Number.NaN }),
    variant(CHALLENGER_ID, "B", { weight: -4 }),
  ];
  ok("junk weights still assign somebody", assignVariant("test-1", hostile, "v") !== null);
}

{
  const unit = hashToUnitInterval("anything");
  ok("the hash lands in [0, 1)", unit >= 0 && unit < 1, unit);
  ok("the bucket is an integer in range", Number.isInteger(bucketFor("t", "v")), bucketFor("t", "v"));

  t("a short cookie value is rejected", readVisitorKey("abc"), null);
  t("a hostile cookie value is rejected", readVisitorKey("../../etc/passwd"), null);
  t("a megabyte of junk is rejected", readVisitorKey("a".repeat(5_000)), null);
  t("a real key is accepted", readVisitorKey(" Ab3-_xyz12345 "), "Ab3-_xyz12345");
  t("nothing is nothing", readVisitorKey(undefined), null);
}

// ---------------------------------------------------------------------------
// The refusals
// ---------------------------------------------------------------------------

section("zero data — nothing to compare");

{
  const report = run("empty test", {
    test: definition([
      variant(CONTROL_ID, "Control", { isControl: true }),
      variant(CHALLENGER_ID, "Shorter form"),
    ]),
    tallies: [],
    timing: NO_TIMING,
  });

  t("state is not_enough_data", report.state, "not_enough_data");
  t("no yield leader", report.yieldLeader, null);
  t("no completion leader", report.completionLeader, null);
  t("nothing disagrees", report.disagree, false);
  ok("the headline says nothing has arrived", /nothing has arrived/i.test(report.decision.headline));
  ok("both arms are still listed", report.arms.length === 2);
  ok("and each has an empty Yield report", report.arms.every((a) => a.report.submissions === 0));
}

section("one variant — a report, not a comparison");

{
  const report = run("one populated arm", {
    test: definition([
      variant(CONTROL_ID, "Control", { isControl: true }),
      variant(CHALLENGER_ID, "Shorter form"),
    ]),
    tallies: [
      { variantId: CONTROL_ID, tallies: arm({ exposures: 4_000, submissions: 300, won: 20, lost: 40, disqualified: 30 }) },
    ],
    timing: NORMAL_TIMING,
  });

  t("state is not_enough_data", report.state, "not_enough_data");
  ok("and says so in those words", /only one arm/i.test(report.decision.headline));
  ok("no winner is named", report.state !== "winner");
  ok(
    "the advice points at the empty arm rather than at sample size",
    /traffic is actually reaching/i.test(report.decision.detail),
  );
}

{
  // A single-variant test cannot trip the sample-ratio check: one arm always
  // receives all of the traffic, and calling that a broken split would make the
  // very first state a new customer sees an accusation.
  const report = run("single arm only", {
    test: definition([variant(CONTROL_ID, "Control", { isControl: true })]),
    tallies: [{ variantId: CONTROL_ID, tallies: arm({ exposures: 4_000, submissions: 300, won: 20 }) }],
    timing: NORMAL_TIMING,
  });
  t("one arm is never a broken split", report.state, "not_enough_data");
  t("and is not flagged", report.arms[0].srmSuspect, false);
}

section("all unresolved — the normal state of a young test");

{
  const report = run("nothing decided", {
    test: definition([
      variant(CONTROL_ID, "Control", { isControl: true }),
      variant(CHALLENGER_ID, "Shorter form"),
    ]),
    tallies: [
      { variantId: CONTROL_ID, tallies: arm({ exposures: 5_000, submissions: 400, awaiting: 400 }) },
      { variantId: CHALLENGER_ID, tallies: arm({ exposures: 5_000, submissions: 560, awaiting: 560 }) },
    ],
    timing: NORMAL_TIMING,
  });

  t("state is not_enough_data", report.state, "not_enough_data");
  ok(
    "the completion leader is still named — that half of the data exists",
    report.completionLeader === CHALLENGER_ID,
    report.completionLeader,
  );
  t("but there is no yield leader on zero wins anywhere", report.yieldLeader, null);
  ok(
    "and the copy says nothing has closed rather than implying a zero rate",
    /nothing has closed/i.test(report.decision.detail),
  );
}

section("a window shorter than the sales cycle — the refusal that matters");

{
  // Both arms fully resolved and a clean, large difference. The ONLY thing
  // wrong is that the test is nine days old and outcomes here take fourteen.
  // Everything else about this data says "winner"; the clock says no.
  const report = run("younger than the cycle", {
    test: definition(
      [
        variant(CONTROL_ID, "Control", { isControl: true }),
        variant(CHALLENGER_ID, "Shorter form"),
      ],
      { startedAt: daysAgo(9) },
    ),
    tallies: [
      { variantId: CONTROL_ID, tallies: arm({ exposures: 6_000, submissions: 400, won: 60, lost: 200, disqualified: 140, firstAt: daysAgo(9) }) },
      { variantId: CHALLENGER_ID, tallies: arm({ exposures: 6_000, submissions: 560, won: 12, lost: 300, disqualified: 248, firstAt: daysAgo(9) }) },
    ],
    timing: NORMAL_TIMING,
  });

  t("state is still_maturing", report.state, "still_maturing");
  ok("the headline names the sales cycle", /younger than your sales cycle/i.test(report.decision.headline));
  ok("the detail gives both numbers", /9 days/.test(report.decision.detail) && /14 days/.test(report.decision.detail));
  ok("it says when to come back", /come back in/i.test(report.decision.detail));
  ok(
    "the fast-tail bias is named rather than hinted at",
    /fast tail|quick disqualification/i.test(report.decision.detail),
  );
  ok(
    // Leading with a sample-size estimate here would tell somebody to buy their
    // way out of a wait. Time is the problem; time has to be the first line.
    "the advice leads with waiting, not with buying more traffic",
    /^Wait\./.test(report.whatWouldChangeThis[0] ?? ""),
    report.whatWouldChangeThis,
  );
  ok(
    "and no winner is declared despite a 5x gap in Yield",
    report.state !== "winner" && report.yieldLeader === CONTROL_ID,
  );
}

{
  // Old enough on the clock, but half the submissions are still open. The
  // measured gate binds where the derived one passes.
  const report = run("half the window still open", {
    test: definition(
      [
        variant(CONTROL_ID, "Control", { isControl: true }),
        variant(CHALLENGER_ID, "Shorter form"),
      ],
      { startedAt: daysAgo(120) },
    ),
    tallies: [
      { variantId: CONTROL_ID, tallies: arm({ exposures: 6_000, submissions: 400, won: 30, lost: 40, disqualified: 20, awaiting: 310 }) },
      { variantId: CHALLENGER_ID, tallies: arm({ exposures: 6_000, submissions: 560, won: 8, lost: 30, disqualified: 30, awaiting: 492 }) },
    ],
    timing: { ...NORMAL_TIMING, awaitingOlderThanMedian: 240 },
  });

  t("state is still_maturing", report.state, "still_maturing");
  ok("the headline names the open share", /no outcome yet/i.test(report.decision.headline));
  ok(
    "and the overdue ones are called a CRM problem, not a waiting problem",
    /CRM problem/i.test(report.decision.detail),
  );
  ok(
    "the requirement list shows the half-decided gate failing",
    report.requirements.some(
      (requirement) => /half decided/i.test(requirement.label) && !requirement.met,
    ),
  );
}

section("peeking — significant is not sufficient");

{
  // The band this gate exists for. `requiredSamplePerArm` asks for roughly
  // twice the sample at which a difference becomes significant — 95%
  // confidence is one hurdle, 80% power is a second and higher one — so
  // between those two numbers a test is green and not yet trustworthy. Here
  // 10% against 4% on 200 views an arm clears significance at about 139 and
  // wants about 283. Every other A/B dashboard ships this as a winner.
  const report = run("green p-value on a small sample", {
    test: definition(
      [
        variant(CONTROL_ID, "Control", { isControl: true }),
        variant(CHALLENGER_ID, "Shorter form"),
      ],
      { startedAt: daysAgo(120) },
    ),
    tallies: [
      { variantId: CONTROL_ID, tallies: arm({ exposures: 200, submissions: 100, won: 20, lost: 50, disqualified: 30, awaiting: 0 }) },
      { variantId: CHALLENGER_ID, tallies: arm({ exposures: 200, submissions: 100, won: 8, lost: 50, disqualified: 42, awaiting: 0 }) },
    ],
    timing: NORMAL_TIMING,
  });

  const comparison = report.comparisons[0];
  ok("the underlying test is significant", comparison.significant, comparison.test.p);
  ok("but the arms have not reached the required sample", comparison.powered === false, comparison);
  t("so no winner is declared", report.state, "underpowered");
  ok("the headline says it has not been earned", /not yet earned/i.test(report.decision.headline));
  ok(
    "and the copy explains the peeking problem in plain words",
    /recomputes every time you open it/i.test(report.decision.detail),
  );
}

section("a clear winner — mature, powered, significant");

{
  const report = run("clear winner", {
    test: definition(
      [
        variant(CONTROL_ID, "Control", { isControl: true }),
        variant(CHALLENGER_ID, "Seven fields"),
      ],
      { startedAt: daysAgo(200) },
    ),
    tallies: [
      { variantId: CONTROL_ID, tallies: arm({ exposures: 20_000, submissions: 2_000, won: 40, lost: 900, disqualified: 1_060, awaiting: 0, valueCents: 4_000_000n }) },
      { variantId: CHALLENGER_ID, tallies: arm({ exposures: 20_000, submissions: 2_000, won: 140, lost: 900, disqualified: 960, awaiting: 0, valueCents: 14_000_000n }) },
    ],
    timing: NORMAL_TIMING,
  });

  t("state is winner", report.state, "winner");
  t("and it is the challenger", report.yieldLeader, CHALLENGER_ID);
  ok("the comparison is both significant and powered", report.comparisons[0].significant && report.comparisons[0].powered);
  ok("the tone is good", report.decision.tone === "good");
  ok(
    "the copy refuses to generalise beyond these two variants",
    /not a general rule about forms/i.test(report.decision.detail),
  );
  ok("nothing further is asked for", report.whatWouldChangeThis.length === 0);
  ok(
    "every gate a winner has to clear is met",
    report.requirements
      .filter((requirement) => !/call it a tie/i.test(requirement.label))
      .every((requirement) => requirement.met),
    report.requirements.filter((requirement) => !requirement.met).map((r) => r.label),
  );
  ok(
    // Deliberately allowed to be unmet, and it is: 40 wins from 20,000 views is
    // a rate of 0.2%, and separating that from 0.24% would take a quarter of a
    // million views an arm. Declaring this winner and being unable to rule out
    // a 20% difference are answers to different questions, and the row that
    // licenses the second is labelled for the second.
    "the tie-calling requirement is separate, and unmet here",
    report.requirements.some(
      (requirement) => /call it a tie/i.test(requirement.label) && !requirement.met,
    ),
  );
}

section("the raw winner is the Yield loser — the screen this product exists for");

{
  // Variant B collects 41% more submissions and closes a fifth as many deals.
  // Every other form builder ships B.
  const report = run("raw winner, yield loser", {
    test: definition(
      [
        variant(CONTROL_ID, "Seven fields", { isControl: true }),
        variant(CHALLENGER_ID, "Three fields"),
      ],
      { startedAt: daysAgo(200) },
    ),
    tallies: [
      { variantId: CONTROL_ID, tallies: arm({ exposures: 12_000, submissions: 1_200, won: 96, lost: 700, disqualified: 404, awaiting: 0, valueCents: 96_000_00n }) },
      { variantId: CHALLENGER_ID, tallies: arm({ exposures: 12_000, submissions: 1_692, won: 20, lost: 500, disqualified: 1_172, awaiting: 0, valueCents: 12_000_00n }) },
    ],
    timing: NORMAL_TIMING,
  });

  t("the completion leader is the three-field form", report.completionLeader, CHALLENGER_ID);
  t("the yield leader is the seven-field form", report.yieldLeader, CONTROL_ID);
  t("and the report says they disagree", report.disagree, true);
  t("state is winner", report.state, "winner");
  ok(
    "the headline names the disagreement rather than burying it",
    /not the one that fills more/i.test(report.decision.headline),
  );
  ok(
    "the detail says shipping the fill winner would be the mistake",
    /closed fewer of them/i.test(report.decision.detail),
  );

  const challenger = report.arms.find((entry) => entry.variant.id === CHALLENGER_ID)!;
  const control = report.arms.find((entry) => entry.variant.id === CONTROL_ID)!;
  ok(
    "the completion rate really is higher on the loser",
    (challenger.completionRate ?? 0) > (control.completionRate ?? 0),
    { challenger: challenger.completionRate, control: control.completionRate },
  );
  ok(
    "and the Yield rate really is higher on the winner",
    (control.yieldRatePerExposure ?? 0) > (challenger.yieldRatePerExposure ?? 0),
  );
  ok(
    "the public calculator agrees on the same numbers",
    report.calculator !== null && report.calculator.disagree,
    report.calculator?.verdict.headline,
  );
}

section("no difference, said only when the test could have found one");

{
  // Enormous, identical arms. A 20% lift would have been visible; nothing is.
  const report = run("genuinely no difference", {
    test: definition(
      [
        variant(CONTROL_ID, "Control", { isControl: true }),
        variant(CHALLENGER_ID, "B"),
      ],
      { startedAt: daysAgo(300) },
    ),
    tallies: [
      { variantId: CONTROL_ID, tallies: arm({ exposures: 400_000, submissions: 40_000, won: 4_000, lost: 20_000, disqualified: 16_000, awaiting: 0 }) },
      { variantId: CHALLENGER_ID, tallies: arm({ exposures: 400_000, submissions: 40_000, won: 4_010, lost: 20_000, disqualified: 15_990, awaiting: 0 }) },
    ],
    timing: NORMAL_TIMING,
  });

  t("state is no_difference", report.state, "no_difference");
  ok("nothing is significant", report.comparisons.every((comparison) => !comparison.significant));
  ok(
    "the copy earns the claim by naming the detectable lift",
    new RegExp(`${Math.round(MIN_DETECTABLE_LIFT * 100)}%`).test(report.decision.detail),
  );
}

{
  // The same non-difference on a small sample. This must NOT say "no
  // difference" — it has found nothing, which is a different sentence.
  const report = run("indistinguishable, small", {
    test: definition(
      [
        variant(CONTROL_ID, "Control", { isControl: true }),
        variant(CHALLENGER_ID, "B"),
      ],
      { startedAt: daysAgo(300) },
    ),
    tallies: [
      { variantId: CONTROL_ID, tallies: arm({ exposures: 400, submissions: 60, won: 6, lost: 30, disqualified: 24, awaiting: 0 }) },
      { variantId: CHALLENGER_ID, tallies: arm({ exposures: 400, submissions: 60, won: 7, lost: 30, disqualified: 23, awaiting: 0 }) },
    ],
    timing: NORMAL_TIMING,
  });

  t("state is underpowered, not no_difference", report.state, "underpowered");
  ok(
    "and the copy says the arms are too small rather than that they are the same",
    /too small|not enough traffic/i.test(`${report.decision.headline} ${report.decision.detail}`),
  );
  ok("it quotes what it would take", report.whatWouldChangeThis.length > 0);
  ok(
    "including the time for the last submissions to get a verdict",
    report.whatWouldChangeThis.some((line) => /before there is anything to call/.test(line)),
  );
}

section("a broken split — more data does not fix it");

{
  const report = run("sample ratio mismatch", {
    test: definition(
      [
        variant(CONTROL_ID, "Control", { isControl: true }),
        variant(CHALLENGER_ID, "B"),
      ],
      { startedAt: daysAgo(200) },
    ),
    tallies: [
      // Configured 50/50. One arm got two thirds of the views.
      { variantId: CONTROL_ID, tallies: arm({ exposures: 20_000, submissions: 2_000, won: 140, lost: 900, disqualified: 960, awaiting: 0 }) },
      { variantId: CHALLENGER_ID, tallies: arm({ exposures: 10_000, submissions: 1_000, won: 20, lost: 500, disqualified: 480, awaiting: 0 }) },
    ],
    timing: NORMAL_TIMING,
  });

  t("state is split_broken", report.state, "split_broken");
  ok("the tone is bad", report.decision.tone === "bad");
  ok("both arms are flagged", report.arms.every((entry) => entry.srmSuspect));
  ok(
    "the advice is to fix the infrastructure, not to wait",
    report.whatWouldChangeThis.some((line) => /cache|redirect|bot filter/i.test(line)) &&
      !report.whatWouldChangeThis.some((line) => /more of traffic/i.test(line)),
  );
  ok(
    "and it says the collected data cannot be repaired",
    report.whatWouldChangeThis.some((line) => /cannot be corrected/i.test(line)),
  );
}

{
  // The identical ratio on the submission basis is NOT a broken split — it is
  // the finding. A variant that drives fewer fills looks exactly like this, and
  // refusing to report it would be refusing to report the effect being tested.
  const report = run("ratio gap without a view count", {
    test: definition(
      [
        variant(CONTROL_ID, "Control", { isControl: true }),
        variant(CHALLENGER_ID, "B"),
      ],
      { startedAt: daysAgo(200) },
    ),
    tallies: [
      { variantId: CONTROL_ID, tallies: arm({ submissions: 2_000, won: 140, lost: 900, disqualified: 960, awaiting: 0 }) },
      { variantId: CHALLENGER_ID, tallies: arm({ submissions: 1_000, won: 20, lost: 500, disqualified: 480, awaiting: 0 }) },
    ],
    timing: NORMAL_TIMING,
  });

  ok("state is not split_broken", report.state !== "split_broken", report.state);
  t("the ranking falls back to per-submission", report.basis, "submission");
  t("there is no completion rate to lead on", report.completionLeader, null);
  ok(
    "and the missing view count is named, with what it costs the comparison",
    report.caveats.some((caveat) => /No view count exists/.test(caveat)) &&
      report.caveats.some((caveat) => /fewer, better fills/.test(caveat)),
    report.caveats,
  );
}

section("three arms — the leader has to beat the runner-up, not just the control");

{
  // The bug this exists to catch. The control is far behind both challengers,
  // so control-vs-B and control-vs-C are both wildly significant — and a test
  // that declared a winner on *those* would ship B, having never compared B
  // against C at all. B and C are within a whisker of each other.
  const report = run("leader level with the runner-up", {
    test: definition(
      [
        variant(CONTROL_ID, "Control", { isControl: true }),
        variant(CHALLENGER_ID, "B"),
        variant(THIRD_ID, "C"),
      ],
      { startedAt: daysAgo(300) },
    ),
    tallies: [
      { variantId: CONTROL_ID, tallies: arm({ exposures: 20_000, submissions: 2_000, won: 100, lost: 1_000, disqualified: 900, awaiting: 0 }) },
      { variantId: CHALLENGER_ID, tallies: arm({ exposures: 20_000, submissions: 2_000, won: 300, lost: 900, disqualified: 800, awaiting: 0 }) },
      { variantId: THIRD_ID, tallies: arm({ exposures: 20_000, submissions: 2_000, won: 290, lost: 900, disqualified: 810, awaiting: 0 }) },
    ],
    timing: NORMAL_TIMING,
  });

  t("B is the leader", report.yieldLeader, CHALLENGER_ID);
  ok(
    "both control comparisons are significant — the trap",
    report.comparisons.every((comparison) => comparison.significant),
    report.comparisons.map((comparison) => comparison.test.p),
  );
  ok(
    "but B against C is not",
    report.leaderComparisons.find((comparison) => comparison.challengerId === THIRD_ID)
      ?.significant === false,
  );
  t("so no winner is declared", report.state, "underpowered");
  ok(
    "and the copy names the runner-up rather than the control",
    /level with C/.test(report.decision.headline),
    report.decision.headline,
  );
  ok(
    "explaining that a front-runner that has not separated is not a winner",
    /front-runner by luck as easily as by merit/.test(report.decision.detail),
  );
}

section("an arm that never got served");

{
  // Three arms, one of which received nothing at all. Without a gate for this
  // the test can never conclude — a comparison against an empty arm has no
  // answer, so `allWinnable` is false forever — and the panel would sit on
  // "not enough traffic" pointing at a sample size that is not the problem.
  const report = run("one arm never served", {
    test: definition(
      [
        variant(CONTROL_ID, "Control", { isControl: true }),
        variant(CHALLENGER_ID, "B"),
        variant(THIRD_ID, "C"),
      ],
      { startedAt: daysAgo(200) },
    ),
    tallies: [
      { variantId: CONTROL_ID, tallies: arm({ submissions: 900, won: 60, lost: 400, disqualified: 440, awaiting: 0 }) },
      { variantId: CHALLENGER_ID, tallies: arm({ submissions: 900, won: 20, lost: 400, disqualified: 480, awaiting: 0 }) },
      // C: nothing at all, and no exposures either.
    ],
    timing: NORMAL_TIMING,
  });

  t("state is not_enough_data", report.state, "not_enough_data");
  ok("the tone is bad — this is broken, not slow", report.decision.tone === "bad");
  ok(
    "the empty arm is named",
    /C has received nothing/.test(report.decision.headline),
    report.decision.headline,
  );
  ok(
    "and the copy says why waiting will not fix it",
    /serving problem rather than a slow start/.test(report.decision.detail),
  );
}

section("three arms — the threshold is corrected");

{
  const report = run("three arms", {
    test: definition(
      [
        variant(CONTROL_ID, "Control", { isControl: true }),
        variant(CHALLENGER_ID, "B"),
        variant(THIRD_ID, "C"),
      ],
      { startedAt: daysAgo(200) },
    ),
    tallies: [
      { variantId: CONTROL_ID, tallies: arm({ exposures: 12_000, submissions: 1_200, won: 90, lost: 600, disqualified: 510, awaiting: 0 }) },
      { variantId: CHALLENGER_ID, tallies: arm({ exposures: 12_000, submissions: 1_200, won: 88, lost: 600, disqualified: 512, awaiting: 0 }) },
      { variantId: THIRD_ID, tallies: arm({ exposures: 12_000, submissions: 1_200, won: 92, lost: 600, disqualified: 508, awaiting: 0 }) },
    ],
    timing: NORMAL_TIMING,
  });

  t("two comparisons, both against the control", report.comparisons.length, 2);
  ok(
    "alpha is divided by the number of comparisons",
    report.comparisons.every((comparison) => Math.abs(comparison.alpha - 0.025) < 1e-9),
    report.comparisons.map((comparison) => comparison.alpha),
  );
  ok(
    "and the correction is stated rather than assumed",
    report.caveats.some((caveat) => /divided by/i.test(caveat)),
  );
  ok("no winner from noise", report.state !== "winner");
  t("the calculator is not run on three arms", report.calculator, null);
}

section("sample ratio check");

{
  t("an exact match is not suspect", sampleRatioCheck(500, 1_000, 0.5).suspect, false);
  t("a small sample tolerates a large gap", sampleRatioCheck(6, 10, 0.5).suspect, false);
  t("a large sample does not", sampleRatioCheck(6_000, 10_000, 0.5).suspect, true);
  t("no traffic is not a mismatch", sampleRatioCheck(0, 0, 0.5).suspect, false);
  t("a planned share of zero cannot be checked", sampleRatioCheck(10, 100, 0).z, null);
}

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

section("invariants that hold across every report above");

for (const { name, report } of reports) {
  const unsafe = findUnsafeNumbers(report);
  ok(`no NaN or Infinity anywhere in "${name}"`, unsafe.length === 0, unsafe);
}

for (const { name, report } of reports) {
  ok(
    `"${name}" never names a winner without reaching the winner state`,
    report.state === "winner" || report.decision.tone !== "good",
    report.decision.headline,
  );
}

{
  const states = new Set<HindsightState>(reports.map((entry) => entry.report.state));
  const wanted: HindsightState[] = [
    "not_enough_data",
    "split_broken",
    "still_maturing",
    "underpowered",
    "no_difference",
    "winner",
  ];
  for (const state of wanted) {
    ok(`state "${state}" is exercised`, states.has(state));
  }
}

ok("MIN_RESOLVED is shared with Yield rather than redefined", MIN_RESOLVED === 8, MIN_RESOLVED);
ok("MIN_RESOLVED_SHARE is a half", MIN_RESOLVED_SHARE === 0.5, MIN_RESOLVED_SHARE);
ok("every report shape was exercised", reports.length >= 12, reports.length);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
