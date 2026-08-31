/**
 * Yield — the quality-adjusted metric (#44).
 *
 * Written from "how does this number end up lying?" rather than from line
 * coverage, because a metric is not a feature that breaks loudly. The four ways
 * it lies, each with tests below:
 *
 *   1. **An unresolved submission counted as a zero.** That understates
 *      anything recent, so a customer kills the newer variant every time. The
 *      bracket tests are the ones that matter most in this file.
 *   2. **A won deal with no value recorded treated as a £0 deal.** It counts
 *      fully towards the rate and not at all towards the value, and the report
 *      has to say so.
 *   3. **Money through a float.** Every amount is `bigint` cents; the
 *      arithmetic is asserted exactly, including a total that overflows a
 *      double.
 *   4. **`NaN` or `Infinity` reaching a screen.** Every report produced here is
 *      walked recursively and asserted clean.
 *
 * No database. `tests/yield-query.test.mts` covers the SQL.
 */

import {
  computeYield,
  emptyTallies,
  MIN_RESOLVED,
  wilsonInterval,
} from "../src/lib/yield/compute.ts";
import {
  centsFromNumeric,
  currencyLabel,
  divideCents,
  formatCents,
  numericFromCents,
  shareOfCents,
} from "../src/lib/yield/money.ts";
import type { CurrencyTotal, YieldReport, YieldTallies } from "../src/lib/yield/types.ts";

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

/** `JSON.stringify` throws on a bigint, and every amount here is one. */
function show(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    typeof entry === "bigint" ? `${entry}n` : entry,
  );
}

const section = (name: string) => console.log(`\n${name}`);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function tallies(overrides: Partial<YieldTallies> = {}): YieldTallies {
  return { ...emptyTallies(), ...overrides };
}

function usd(totalCents: bigint, wonWithValue: number, largestCents = totalCents): CurrencyTotal {
  return { currency: "USD", totalCents, wonWithValue, largestCents };
}

/**
 * Walks a whole report looking for anything a screen must never print.
 *
 * The house rule from `src/lib/tools/engine.ts`: `null` means "no answer from
 * these numbers" and renders as an em dash; `NaN` and `Infinity` mean a bug
 * escaped into a customer's revenue report.
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

const reports: { name: string; report: YieldReport }[] = [];
function report(name: string, input: YieldTallies): YieldReport {
  const produced = computeYield(input);
  reports.push({ name, report: produced });
  return produced;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

section("money — bigint cents, never a float");

t("a numeric(18,2) string becomes cents", centsFromNumeric("18400.00"), 1_840_000n);
t("no decimal point still becomes cents", centsFromNumeric("18400"), 1_840_000n);
t("one decimal place is padded", centsFromNumeric("18400.5"), 1_840_050n);
t("a third decimal place rounds up", centsFromNumeric("0.125"), 13n);
t("a third decimal place rounds down", centsFromNumeric("0.124"), 12n);
t("a negative value keeps its sign", centsFromNumeric("-5.25"), -525n);
t("null is null, not zero", centsFromNumeric(null), null);
t("empty string is null", centsFromNumeric(""), null);
t("a word is null", centsFromNumeric("eighteen thousand"), null);
t("exponent notation is refused rather than guessed at", centsFromNumeric("1e4"), null);
t("NaN as text is null", centsFromNumeric("NaN"), null);
t("Infinity as text is null", centsFromNumeric("Infinity"), null);

t("cents round-trip to the column's string", numericFromCents(1_840_050n), "18400.50");
t("cents below a dollar keep both places", numericFromCents(7n), "0.07");
t("negative cents round-trip", numericFromCents(-525n), "-5.25");

t("dividing by zero submissions has no answer", divideCents(100n, 0n), null);
t("division rounds half away from zero", divideCents(5n, 2n), 3n);
t("division rounds down below the half", divideCents(4n, 3n), 1n);
t("negative division rounds away from zero too", divideCents(-5n, 2n), -3n);

// The point of bigint: this total does not fit in a double.
const huge = centsFromNumeric("123456789012345678.99");
t("a total past 2^53 is exact", huge, 12_345_678_901_234_567_899n);
t("and formats with every digit intact", formatCents(huge, "USD"), "$123,456,789,012,345,678.99");
ok(
  "a float would have lost the last three digits",
  BigInt(Math.round(Number("123456789012345678.99") * 100)) !== huge,
  Math.round(Number("123456789012345678.99") * 100).toString(),
);

t("cents format as money", formatCents(7_005_000n, "USD"), "$70,050.00");
t("whole-dollar formatting drops the pennies", formatCents(7_005_000n, "USD", { decimals: 0 }), "$70,050");
t("a non-USD currency formats as itself", formatCents(500_000n, "EUR"), "€5,000.00");
// Intl puts a non-breaking space after a code it has no symbol for. Pinned
// deliberately: a test that "looks the same" is how that becomes a mystery.
t("an unknown-but-valid code prints the code", formatCents(500_000n, "XYZ"), "XYZ\u00a05,000.00");
t(
  "no currency says so rather than assuming dollars",
  formatCents(500_000n, null),
  "5,000.00 unspecified currency",
);
t("a currency that is not a code cannot make Intl throw", formatCents(100n, "US"), "1.00 US");
t("no total is an em dash", formatCents(null, "USD"), "—");
t("the unspecified label is shared", currencyLabel(null), "unspecified currency");

t("a share of zero has no answer", shareOfCents(5n, 0n), null);
t("a share is a plain ratio", shareOfCents(1n, 4n), 0.25);

// ---------------------------------------------------------------------------
// The bracket — the decision the metric rests on
// ---------------------------------------------------------------------------

section("unresolved submissions — the bracket");

{
  const zero = report("zero submissions", tallies());
  t("no submissions gives no rate rather than 0%", zero.rate.floor, null);
  t("and no ceiling", zero.rate.ceiling, null);
  t("and no interval", zero.rate.interval, null);
  t("and no resolved share", zero.resolvedShare, null);
  t("maturity says the window is empty", zero.maturity.headline, "Nothing in this window");
  t("confidence has nothing to compare", zero.confidence.headline, "Nothing to compare");
}

{
  // The commonest state in the product: leads arrived, nothing has been graded.
  const open = report("nothing resolved", tallies({ submissions: 40, awaiting: 40 }));
  t("the floor is 0% — nothing has been proven", open.rate.floor, 0);
  t("the ceiling is 100% — nothing has been ruled out", open.rate.ceiling, 1);
  t("so the uncertainty is total", open.rate.uncertainty, 1);
  t("and the rate among resolved has no answer at all", open.rate.amongResolved, null);
  t("resolved share is zero", open.resolvedShare, 0);
  t("maturity leads with it", open.maturity.headline, "Nothing here has an outcome yet");
  ok(
    "and says unknown rather than zero, in those words",
    open.maturity.detail.includes("unknown rather than zero"),
    open.maturity.detail,
  );
  t("confidence refuses to rank", open.confidence.headline, "Too few outcomes to rank on");
}

{
  // The case the whole treatment exists for: a young window. 12 of 100 are
  // decided, 4 of those won. Counting the 88 open ones as losses would report
  // 4% and hide that the truthful answer is "somewhere between 4% and 92%".
  const young = report(
    "young window",
    tallies({ submissions: 100, won: 4, lost: 6, disqualified: 2, awaiting: 88 }),
  );
  t("floor counts every open submission as not-yet-won", young.rate.floor, 0.04);
  t("ceiling counts every open submission as a win", young.rate.ceiling, 0.92);
  t("the rate among decided leads is much higher", young.rate.amongResolved, 1 / 3);
  t("resolved share is the maturity", young.resolvedShare, 0.12);
  ok(
    "maturity names the open share in the headline",
    young.maturity.headline === "88% of this window is still open",
    young.maturity.headline,
  );
  ok(
    "and prints the bracket rather than a point estimate",
    young.maturity.detail.includes("4.0%") && young.maturity.detail.includes("92.0%"),
    young.maturity.detail,
  );
  ok("maturity warns", young.maturity.tone === "warn", young.maturity.tone);
}

{
  const mature = report(
    "mature window",
    tallies({ submissions: 200, won: 20, lost: 100, disqualified: 70, awaiting: 10 }),
  );
  ok(
    "floor and ceiling converge as the window matures",
    Math.abs((mature.rate.uncertainty ?? 0) - 0.05) < 1e-9,
    mature.rate.uncertainty,
  );
  t("floor is the headline number", mature.rate.floor, 0.1);
  ok("maturity is satisfied", mature.maturity.tone === "good", mature.maturity);
  ok("confidence is satisfied", mature.confidence.tone === "good", mature.confidence);
}

{
  const closed = report(
    "fully resolved",
    tallies({ submissions: 50, won: 5, lost: 20, disqualified: 25, awaiting: 0 }),
  );
  t("with nothing open the bracket collapses to a point", closed.rate.uncertainty, 0);
  t("floor equals the rate among resolved", closed.rate.floor, closed.rate.amongResolved);
  t(
    "and maturity says the cohort is final",
    closed.maturity.headline,
    "Every submission in this window has been decided",
  );
}

section("junk — the thing completion rate cannot see");

{
  // The pitch, as arithmetic. Two forms, one with ten times the submissions and
  // twice the wins; the junk one must score worse.
  const junk = report(
    "high volume, mostly junk",
    tallies({ submissions: 1_000, won: 10, lost: 90, disqualified: 800, awaiting: 100 }),
  );
  const good = report(
    "low volume, good leads",
    tallies({ submissions: 100, won: 5, lost: 40, disqualified: 5, awaiting: 50 }),
  );

  ok(
    "the form with more submissions and more wins scores worse on Yield",
    (junk.rate.floor ?? 0) < (good.rate.floor ?? 0),
    { junk: junk.rate.floor, good: good.rate.floor },
  );
  t("junk share is disqualified over resolved, not over everything", junk.junkShare, 800 / 900);
  t("qualified share counts a lost deal as a real conversation", junk.qualifiedShare, 0.1);
  t("all-disqualified is a real answer, not an error", report(
    "all disqualified",
    tallies({ submissions: 30, disqualified: 30 }),
  ).rate.floor, 0);
}

{
  const allJunk = report("all disqualified", tallies({ submissions: 30, disqualified: 30 }));
  t("a window of nothing but junk has a 0% ceiling too", allJunk.rate.ceiling, 0);
  t("junk share is 100%", allJunk.junkShare, 1);
  t("and it is decided, not immature", allJunk.maturity.tone, "good");
  t("confidence calls it what it is", allJunk.confidence.headline, "Decided, and nothing closed");
  ok(
    "and does not blame the form on its own",
    allJunk.confidence.detail.includes("before concluding the form is at fault"),
    allJunk.confidence.detail,
  );
}

section("disqualifying leads cannot buy a better Yield rate");

{
  const before = computeYield(
    tallies({ submissions: 100, won: 5, lost: 40, disqualified: 5, awaiting: 50 }),
  );
  // The same window, with 30 of the lost deals re-filed as disqualified.
  const after = computeYield(
    tallies({ submissions: 100, won: 5, lost: 10, disqualified: 35, awaiting: 50 }),
  );
  t("the Yield rate does not move", after.rate.floor, before.rate.floor);
  ok(
    "but the qualified share drops, which is visible",
    (after.qualifiedShare ?? 1) < (before.qualifiedShare ?? 0),
    { before: before.qualifiedShare, after: after.qualifiedShare },
  );
}

// ---------------------------------------------------------------------------
// Value
// ---------------------------------------------------------------------------

section("Yield value");

{
  const money = report(
    "won deals with values",
    tallies({
      submissions: 20,
      won: 5,
      lost: 3,
      disqualified: 3,
      awaiting: 9,
      money: [usd(7_005_000n, 5, 3_150_000n)],
    }),
  );
  const [value] = money.value;
  t("total is exact cents", value.totalCents, 7_005_000n);
  t("per submission divides by every submission, open ones included", value.perSubmissionCents, 350_250n);
  t("per hundred submissions is the finance version", value.perHundredSubmissionsCents, 35_025_000n);
  t("average deal size divides by the deals that had one", value.averageWonCents, 1_401_000n);
  t("per visitor is null when nobody counted visitors", value.perVisitorCents, null);
  t("concentration is the largest deal's share", value.concentration, 0.4497);
  ok(
    "and a concentrated total is called out",
    money.caveats.some((line) => line.includes("One deal is 45%")),
    money.caveats,
  );
  ok(
    "the missing visitor count is stated, not silently ignored",
    money.caveats.some((line) => line.includes("Value per visitor is not shown")),
    money.caveats,
  );
}

{
  const withVisitors = computeYield(
    tallies({ submissions: 20, won: 5, awaiting: 15, visitors: 1_000, money: [usd(7_005_000n, 5)] }),
  );
  t("per visitor exists once a visitor count is supplied", withVisitors.value[0].perVisitorCents, 7_005n);
  t("and zero visitors is not a divide", computeYield(
    tallies({ submissions: 20, won: 5, awaiting: 15, visitors: 0, money: [usd(7_005_000n, 5)] }),
  ).value[0].perVisitorCents, null);
}

{
  // The awkward one: a deal closed, nobody told us for how much.
  const partial = report(
    "won deal with a null value",
    tallies({
      submissions: 10,
      won: 3,
      lost: 2,
      awaiting: 5,
      wonWithoutValue: 1,
      money: [usd(1_000_000n, 2, 600_000n)],
    }),
  );
  t("it counts fully towards the rate", partial.rate.floor, 0.3);
  t("the value total ignores it", partial.value[0].totalCents, 1_000_000n);
  t("average deal size divides by the two we know", partial.value[0].averageWonCents, 500_000n);
  ok(
    "and the report says the value is a floor",
    partial.caveats.some((line) => line.includes("no value recorded") && line.includes("floor")),
    partial.caveats,
  );
  ok(
    "and refuses to call it a worthless deal",
    partial.caveats.some((line) => line.includes("not a deal worth nothing")),
    partial.caveats,
  );
}

{
  const noMoney = report(
    "wins, none with a value",
    tallies({ submissions: 10, won: 2, awaiting: 8, wonWithoutValue: 2 }),
  );
  t("there is no currency to report", noMoney.value.length, 0);
  t("but the rate is unaffected", noMoney.rate.floor, 0.2);
}

{
  const mixed = report(
    "two currencies",
    tallies({
      submissions: 40,
      won: 4,
      awaiting: 36,
      money: [usd(1_000_000n, 2, 600_000n), { currency: "EUR", totalCents: 500_000n, wonWithValue: 2, largestCents: 300_000n }],
    }),
  );
  t("both are kept", mixed.value.length, 2);
  t("and never added together", mixed.value[0].totalCents, 1_000_000n);
  ok(
    "the report says why",
    mixed.caveats.some((line) => line.includes("never added together")),
    mixed.caveats,
  );
}

// ---------------------------------------------------------------------------
// Statistical honesty
// ---------------------------------------------------------------------------

section("statistical honesty");

t("no trials, no interval", wilsonInterval(0, 0), null);
{
  const interval = wilsonInterval(1, 40);
  ok("a rate of 1/40 has a lower bound above zero", (interval?.low ?? -1) > 0, interval);
  ok("and an upper bound several times the point estimate", (interval?.high ?? 0) > 0.1, interval);
}
{
  const wide = wilsonInterval(0, 10);
  t("zero successes gives a lower bound of exactly zero", wide?.low, 0);
  ok("and a non-trivial upper bound", (wide?.high ?? 0) > 0.2, wide);
}
{
  const tight = wilsonInterval(500, 5_000);
  ok(
    "a large sample gives a tight interval around the rate",
    (tight?.high ?? 1) - (tight?.low ?? 0) < 0.02,
    tight,
  );
}
ok("successes above trials cannot escape the bounds", (() => {
  const clamped = wilsonInterval(50, 10);
  return clamped !== null && clamped.low >= 0 && clamped.high <= 1;
})());

{
  const few = computeYield(tallies({ submissions: 30, won: 2, lost: 2, awaiting: 26 }));
  t(
    `${MIN_RESOLVED - 1} outcomes is not enough to rank on`,
    few.confidence.headline,
    "Too few outcomes to rank on",
  );
  ok(
    "and it says so in the same words the public calculator does",
    few.confidence.detail.includes("outcome-weighted-split-test-calculator"),
    few.confidence.detail,
  );
}

{
  const directional = computeYield(
    tallies({ submissions: 300, won: 3, lost: 100, disqualified: 100, awaiting: 97 }),
  );
  t("a wide interval is directional, not decisive", directional.confidence.headline, "Directional, not decisive");
  ok("and warns", directional.confidence.tone === "warn", directional.confidence.tone);
}

section("late outcomes are not the same as recent ones");

{
  const late = report(
    "overdue",
    tallies({
      submissions: 100,
      won: 5,
      lost: 10,
      disqualified: 5,
      awaiting: 80,
      timing: { medianDaysToVerdict: 9, p90DaysToVerdict: 20, awaitingOlderThanMedian: 60 },
    }),
  );
  t("overdue outcomes are called overdue", late.maturity.headline, "Outcomes are overdue, not just pending");
  ok("with the strongest tone", late.maturity.tone === "bad", late.maturity.tone);
  ok(
    "and the fix named as the CRM rather than the form",
    late.maturity.detail.includes("The fix is in the CRM"),
    late.maturity.detail,
  );

  const recent = computeYield(
    tallies({
      submissions: 100,
      won: 5,
      lost: 10,
      disqualified: 5,
      awaiting: 80,
      timing: { medianDaysToVerdict: 9, p90DaysToVerdict: 20, awaitingOlderThanMedian: 0 },
    }),
  );
  ok(
    "the same window with nothing overdue is only immature, not broken",
    recent.maturity.tone === "warn",
    recent.maturity,
  );
  ok(
    "and it explains what a short window over-samples",
    recent.maturity.detail.includes("resolve fastest"),
    recent.maturity.detail,
  );
}

// ---------------------------------------------------------------------------
// The inputs must survive into the report
// ---------------------------------------------------------------------------

section("interrogability");

{
  const input = tallies({
    submissions: 20,
    won: 5,
    lost: 3,
    disqualified: 3,
    awaiting: 9,
    wonWithoutValue: 1,
    money: [usd(7_005_000n, 4)],
    timing: { medianDaysToVerdict: 9, p90DaysToVerdict: 21, awaitingOlderThanMedian: 2 },
  });
  const produced = computeYield(input);
  t("every tally is carried through verbatim", produced.inputs, input);
  t("the counts add up to the submissions", produced.resolved + produced.open, produced.submissions);
}

{
  // Nonsense in — a caller that hands us garbage still must not produce garbage.
  const nonsense = report(
    "hostile input",
    tallies({
      submissions: Number.NaN,
      won: Number.POSITIVE_INFINITY,
      lost: -5,
      disqualified: 2.7,
      awaiting: Number.NEGATIVE_INFINITY,
    }),
  );
  t("NaN submissions become zero", nonsense.submissions, 0);
  t("an infinite win count becomes zero", nonsense.won, 0);
  t("a negative count becomes zero", nonsense.lost, 0);
  t("a fractional count is truncated", nonsense.disqualified, 2);
  t("and no rate is invented from it", nonsense.rate.floor, null);
}

section("nothing unsafe escapes to the UI");

for (const { name, report: produced } of reports) {
  const unsafe = findUnsafeNumbers(produced);
  ok(`no NaN or Infinity anywhere in "${name}"`, unsafe.length === 0, unsafe);
}

ok("every report shape was exercised", reports.length >= 12, reports.length);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
