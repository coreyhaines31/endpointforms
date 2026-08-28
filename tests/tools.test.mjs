import {
  computeClosedDeal,
  computeDropOff,
  computeFieldPayback,
  computeReconciliation,
  computeResponseCost,
  computeSpamCost,
  computeSplitTest,
  computeTimeToOutcome,
  closedDealFields,
  dropOffFields,
  fieldPaybackFields,
  formatCurrency,
  formatDuration,
  formatMultiple,
  formatNumber,
  formatPercent,
  normalCdf,
  ratio,
  readField,
  readInputs,
  reconciliationFields,
  requiredSamplePerArm,
  responseCostFields,
  spamCostFields,
  splitTestFields,
  timeToOutcomeFields,
  twoProportionTest,
} from "../src/lib/tools/engine.ts";

let pass = 0;
let fail = 0;

const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

const near = (name, got, want, epsilon = 1e-6) => {
  const ok = typeof got === "number" && Math.abs(got - want) < epsilon;
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`        got  ${got}\n        want ~${want}`);
};

const ok = (name, condition) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
};

const ALL = [
  ["spam cost", spamCostFields, computeSpamCost],
  ["closed deal", closedDealFields, computeClosedDeal],
  ["split test", splitTestFields, computeSplitTest],
  ["time to outcome", timeToOutcomeFields, computeTimeToOutcome],
  ["field payback", fieldPaybackFields, computeFieldPayback],
  ["response cost", responseCostFields, computeResponseCost],
  ["reconciliation", reconciliationFields, computeReconciliation],
  ["drop-off", dropOffFields, computeDropOff],
];

/** Every finite number anywhere in a result, however deeply nested. */
function numbersIn(value, path = "", out = []) {
  if (typeof value === "number") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => numbersIn(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) numbersIn(v, path ? `${path}.${k}` : k, out);
  return out;
}

function assertClean(label, result) {
  const bad = numbersIn(result).filter(([, n]) => !Number.isFinite(n));
  ok(`${label} — no NaN or Infinity anywhere in the result`, bad.length === 0);
  if (bad.length > 0) console.log(`        offenders: ${JSON.stringify(bad)}`);
}

console.log("INPUT COERCION — the ways a text box breaks arithmetic:");
const spend = spamCostFields.find((f) => f.key === "spend");
t("empty string is zero, not NaN", readField(spend, ""), { value: 0, clamped: false });
t("a lone minus sign is zero", readField(spend, "-"), { value: 0, clamped: false });
t("garbage falls to the floor, not the ceiling", readField(spend, "abc"), { value: 0, clamped: true });
t("1e400 overflows to Infinity and is capped at the ceiling", readField(spend, "1e400"), { value: 10_000_000, clamped: true });
t("negative is clamped to the minimum", readField(spend, "-500"), { value: 0, clamped: true });
t("absurdly large is clamped", readField(spend, "999999999999"), { value: 10_000_000, clamped: true });
t("thousands separators survive", readField(spend, "12,000"), { value: 12000, clamped: false });
t("surrounding whitespace survives", readField(spend, "  900  "), { value: 900, clamped: false });
t("a missing key falls back to the default", readInputs([spend], {}).values, { spend: 12000 });
t("clamped keys are reported", readInputs([spend], { spend: "-1" }).clamped, ["spend"]);

console.log("\nPRIMITIVES:");
t("divide by zero is null, never Infinity", ratio(5, 0), null);
t("zero over anything is zero", ratio(0, 5), 0);
t("Infinity in, null out", ratio(Infinity, 2), null);
near("normalCdf(0)", normalCdf(0), 0.5, 1e-6);
near("normalCdf(1.96)", normalCdf(1.96), 0.975, 1e-4);
t("normalCdf survives Infinity", normalCdf(Infinity), 1);

console.log("\nFORMATTING — nothing non-finite ever reaches the screen:");
t("null currency", formatCurrency(null), "—");
t("NaN currency", formatCurrency(Number.NaN), "—");
t("Infinity currency", formatCurrency(Infinity), "—");
t("NaN number", formatNumber(Number.NaN), "—");
t("NaN percent", formatPercent(Number.NaN), "—");
t("NaN multiple", formatMultiple(Number.NaN), "—");
t("NaN duration", formatDuration(Number.NaN), "—");
t("ordinary currency", formatCurrency(1234.5), "$1,235");
t("ordinary percent", formatPercent(0.283, 1), "28.3%");
t("a very long duration is words, not a number", formatDuration(5000), "over a century");

console.log("\nSTATISTICS:");
const flat = twoProportionTest(100, 1000, 100, 1000);
near("identical proportions give p = 1", flat.p, 1, 1e-6);
ok("identical proportions are not significant", flat.significant === false);
const clear = twoProportionTest(100, 1000, 160, 1000);
ok("a large difference is significant", clear.significant === true);
t("no trials at all is not a test", twoProportionTest(0, 0, 0, 0), {
  p: null,
  z: null,
  significant: false,
  confidence: null,
});
t("zero conversions on both sides is not a test", twoProportionTest(0, 1000, 0, 1000).p, null);
t("equal rates need infinite traffic", requiredSamplePerArm(0.03, 0.03), null);
ok("halving the effect roughly quadruples the sample", (() => {
  const big = requiredSamplePerArm(0.03, 0.036);
  const small = requiredSamplePerArm(0.03, 0.033);
  return small / big > 3.5 && small / big < 4.5;
})());
ok("the sample size is capped rather than infinite", requiredSamplePerArm(0.5, 0.5000000001) <= 1e12);

console.log("\nDEFAULTS — every tool computes cleanly out of the box:");
for (const [label, fields, compute] of ALL) {
  const { values } = readInputs(fields, {});
  assertClean(label, compute(values));
}

console.log("\nZEROES — every tool survives every input being zero:");
for (const [label, fields, compute] of ALL) {
  const zeros = Object.fromEntries(fields.map((f) => [f.key, "0"]));
  assertClean(`${label} (all zero)`, compute(readInputs(fields, zeros).values));
}

console.log("\nBLANKS — every tool survives every input being empty:");
for (const [label, fields, compute] of ALL) {
  const blanks = Object.fromEntries(fields.map((f) => [f.key, ""]));
  assertClean(`${label} (all blank)`, compute(readInputs(fields, blanks).values));
}

console.log("\nCEILINGS — every tool survives every input at its maximum:");
for (const [label, fields, compute] of ALL) {
  const maxed = Object.fromEntries(fields.map((f) => [f.key, "999999999999999"]));
  assertClean(`${label} (all maxed)`, compute(readInputs(fields, maxed).values));
}

console.log("\nGARBAGE — every tool survives text in every box:");
for (const [label, fields, compute] of ALL) {
  const junk = Object.fromEntries(fields.map((f) => [f.key, "not a number"]));
  assertClean(`${label} (all garbage)`, compute(readInputs(fields, junk).values));
}

console.log("\n1 · SPAM COST:");
{
  const v = readInputs(spamCostFields, {
    spend: "10000",
    cpl: "50",
    junkPct: "50",
    minutesPerLead: "6",
    hourlyCost: "60",
    perResponseFee: "0.1",
  }).values;
  const r = computeSpamCost(v);
  t("200 submissions", r.submissions, 200);
  t("half of them junk", r.junkSubmissions, 100);
  t("wasted spend is junk × cpl", r.wastedSpend, 5000);
  t("10 rep hours", r.wastedHours, 10);
  t("payroll is hours × rate", r.wastedPayroll, 600);
  t("form tax is junk × fee", r.formTax, 10);
  t("monthly total adds all three", r.monthlyTotal, 5610);
  t("annual is twelve months", r.annualTotal, 67320);
  t("effective cpl doubles at 50% junk", r.effectiveCpl, 100);
  t("which is a 2x multiple", r.cplMultiple, 2);
}
{
  const v = readInputs(spamCostFields, { junkPct: "100" }).values;
  const r = computeSpamCost(v);
  t("100% junk leaves no real leads", r.realSubmissions, 0);
  t("so the effective cost per usable lead is null, not Infinity", r.effectiveCpl, null);
  t("and the verdict says so", r.verdict.tone, "bad");
}
{
  const r = computeSpamCost(readInputs(spamCostFields, { cpl: "0" }).values);
  t("a zero cost per lead yields no submissions", r.submissions, null);
  t("and asks for the input rather than printing zeroes", r.verdict.tone, "neutral");
}

console.log("\n2 · COST PER CLOSED DEAL:");
{
  const v = readInputs(closedDealFields, {
    aSpend: "6000", aLeads: "400", aCloseRate: "1", aDealValue: "4000",
    bSpend: "6000", bLeads: "120", bCloseRate: "10", bDealValue: "4000",
  }).values;
  const r = computeClosedDeal(v);
  t("A is cheaper per lead", r.cplWinner, "a");
  t("B is cheaper per closed deal", r.dealWinner, "b");
  ok("so the ranking flips", r.flipped === true);
  t("A: $15 per lead", r.a.cpl, 15);
  t("A: 4 deals", r.a.deals, 4);
  t("A: $1,500 per closed deal", r.a.costPerDeal, 1500);
  t("B: $500 per closed deal", r.b.costPerDeal, 500);
  t("the flip is called out", r.verdict.tone, "bad");
}
{
  const v = readInputs(closedDealFields, { aCloseRate: "0", bCloseRate: "0" }).values;
  const r = computeClosedDeal(v);
  t("no deals means no cost per deal", r.a.costPerDeal, null);
  t("and the tool says that rather than guessing", r.verdict.tone, "neutral");
}
{
  const v = readInputs(closedDealFields, { aLeads: "0", bLeads: "0" }).values;
  const r = computeClosedDeal(v);
  t("no leads means no cost per lead", r.a.cpl, null);
  t("and no winner is declared", r.cplWinner, null);
}

console.log("\n3 · OUTCOME-WEIGHTED SPLIT TEST:");
{
  const v = readInputs(splitTestFields, {
    aVisitors: "8000", aCompletions: "640", aWon: "19", aValue: "76000",
    bVisitors: "8000", bCompletions: "896", bWon: "16", bValue: "64000",
  }).values;
  const r = computeSplitTest(v);
  t("B completes better", r.completionWinner, "b");
  t("A yields better", r.yieldWinner, "a");
  ok("so the two metrics disagree", r.disagree === true);
  near("A completion rate is 8%", r.a.completionRate, 0.08);
  near("A yield rate is 0.2375%", r.a.yieldRate, 0.0023750);
  near("A yield value is $9.50 per visitor", r.a.yieldValue, 9.5);
  ok("the completion difference is significant", r.completionTest.significant === true);
  ok("the outcome difference is not", r.yieldTest.significant === false);
  ok("and it says so rather than declaring a winner", r.verdict.tone === "warn");
  ok("the required sample is far above what they have", r.requiredVisitorsPerVariant > 8000);
}
{
  const v = readInputs(splitTestFields, { aWon: "0", bWon: "0", aValue: "0", bValue: "0" }).values;
  const r = computeSplitTest(v);
  t("no closed deals means no yield test", r.yieldTest.p, null);
  t("and the verdict names that state", r.verdict.tone, "warn");
}
{
  const v = readInputs(splitTestFields, { aVisitors: "100", aCompletions: "500" }).values;
  const r = computeSplitTest(v);
  ok("more completions than visitors is flagged", r.anomalies.length > 0);
  ok("and the completion rate is still finite", Number.isFinite(r.a.completionRate));
}

console.log("\n4 · TIME TO OUTCOME:");
{
  const v = readInputs(timeToOutcomeFields, {
    submissions: "600", gradeablePct: "70", closeRate: "3",
    liftPct: "20", medianDays: "30", variants: "2",
  }).values;
  const r = computeTimeToOutcome(v);
  near("420 gradeable a month", r.gradeablePerMonth, 420);
  near("210 per variant", r.perVariantPerMonth, 210);
  near("baseline 3%", r.baseline, 0.03);
  near("target 3.6%", r.target, 0.036);
  ok("this funnel needs years, and is told so", r.monthsTotal > 12);
  t("verdict is a flat no", r.verdict.tone, "bad");
}
{
  const v = readInputs(timeToOutcomeFields, { submissions: "400000", closeRate: "20", liftPct: "50" }).values;
  const r = computeTimeToOutcome(v);
  ok("a big fast funnel gets a yes", r.verdict.tone === "good");
  ok("and a finite duration", Number.isFinite(r.monthsTotal));
}
{
  const r = computeTimeToOutcome(readInputs(timeToOutcomeFields, { closeRate: "0" }).values);
  t("a zero close rate has nothing to test", r.verdict.tone, "bad");
  ok("and does not divide by zero", r.monthsTotal === null || Number.isFinite(r.monthsTotal));
}
{
  const r = computeTimeToOutcome(readInputs(timeToOutcomeFields, { submissions: "0" }).values);
  t("no volume, no answer", r.monthsCollecting, null);
}

console.log("\n5 · FIELD PAYBACK:");
{
  const v = readInputs(fieldPaybackFields, {
    visitors: "10000", completionRate: "10", dropPct: "50",
    closeRate: "4", dealValue: "1000", expectedLiftPct: "0",
  }).values;
  const r = computeFieldPayback(v);
  t("1,000 completions now", r.completionsNow, 1000);
  t("500 after a 50% drop", r.completionsAfter, 500);
  near("break-even needs a 100% lift", r.requiredRelativeLift, 1);
  near("which is an 8% close rate", r.requiredCloseRate, 8);
  ok("that is reachable, so not impossible", r.impossible === false);
}
{
  const v = readInputs(fieldPaybackFields, { completionRate: "10", dropPct: "99", closeRate: "50" }).values;
  const r = computeFieldPayback(v);
  ok("a huge drop with a high close rate cannot break even", r.impossible === true);
  t("and the verdict says do not ask", r.verdict.tone, "bad");
}
{
  const r = computeFieldPayback(readInputs(fieldPaybackFields, { dropPct: "0" }).values);
  near("no drop means no lift required", r.requiredRelativeLift, 0);
  t("and the tool points at the assumption", r.verdict.tone, "neutral");
}
{
  const r = computeFieldPayback(readInputs(fieldPaybackFields, { visitors: "0" }).values);
  t("no traffic, no break-even", r.requiredRelativeLift, null);
}

console.log("\n6 · COST PER USABLE RESPONSE:");
{
  const v = readInputs(responseCostFields, {
    submissions: "2000", junkPct: "50",
    aPrice: "29", aIncluded: "1000", aOverage: "0.05",
    bPrice: "99", bIncluded: "10000", bOverage: "0.02",
    cPrice: "0", cIncluded: "0", cOverage: "0",
  }).values;
  const r = computeResponseCost(v);
  const [a, b, c] = r.plans;
  t("plan A is in use", a.inUse, true);
  t("plan C is not", c.inUse, false);
  t("A: 1,000 responses past the allowance", a.overageUnits, 1000);
  t("A: bill is $29 + $50", a.total, 79);
  near("A: $0.0395 per response", a.costPerResponse, 0.0395);
  near("A: $0.079 per usable response", a.costPerUsableResponse, 0.079);
  near("A: half the bill goes on junk", a.junkCost, 39.5);
  t("A: junk ate the whole included allowance", a.includedEatenByJunk, 1000);
  t("B: inside the allowance", b.overageUnits, 0);
  t("A is the cheaper bill", r.cheapestHeadline.id, "a");
  t("and also the cheaper per usable response", r.cheapestPerUsable.id, "a");
  ok("so nothing flips", r.flipped === false);
}
{
  const v = readInputs(responseCostFields, { junkPct: "100" }).values;
  const r = computeResponseCost(v);
  t("at 100% junk there are no usable responses", r.usable, 0);
  t("so cost per usable is null, not Infinity", r.plans[0].costPerUsableResponse, null);
  t("and no plan wins on it", r.cheapestPerUsable, null);
}
{
  const v = readInputs(responseCostFields, { submissions: "0" }).values;
  const r = computeResponseCost(v);
  t("no submissions, no cost per response", r.plans[0].costPerResponse, null);
  t("and the tool asks for volume", r.verdict.tone, "neutral");
}

console.log("\n7 · RECONCILIATION:");
{
  const v = readInputs(reconciliationFields, {
    reported: "1000", inCrm: "900", attempted: "800",
    reached: "400", real: "250", won: "25",
  }).values;
  const r = computeReconciliation(v);
  t("six stages", r.stages.length, 6);
  near("junk rate is 75%", r.junkRate, 0.75);
  near("four reported conversions per real prospect", r.overstatement, 4);
  t("the biggest leak is the reach step", r.biggestLeak.key, "reached");
  near("close rate on reported is 2.5%", r.closeOnReported, 0.025);
  near("close rate on real prospects is 10%", r.closeOnReal, 0.1);
  t("and that gap is called out", r.verdict.tone, "bad");
  t("nothing is anomalous", r.anomalies.length, 0);
}
{
  const v = readInputs(reconciliationFields, { reported: "100", inCrm: "500" }).values;
  const r = computeReconciliation(v);
  ok("a funnel that grows is flagged", r.anomalies.length > 0);
  t("the impossible stage computes no retention", r.stages[1].retention, null);
  t("and the verdict refuses to conclude", r.verdict.tone, "warn");
}
{
  const r = computeReconciliation(readInputs(reconciliationFields, { real: "0" }).values);
  t("no real prospects means no overstatement ratio", r.overstatement, null);
}

console.log("\n8 · DROP-OFF:");
{
  const v = readInputs(dropOffFields, {
    step1: "1000", step2: "800", step3: "400", step4: "0", step5: "0",
    completed: "380", closeRate: "10", dealValue: "1000",
  }).values;
  const r = computeDropOff(v);
  t("the form ends at the first zero", r.steps.length, 3);
  t("three transitions, including the submit", r.transitions.length, 3);
  near("completion rate is 38%", r.completionRate, 0.38);
  t("the worst step is 2 to 3", r.worst.label, "Step 2 → Step 3");
  near("which keeps half", r.worst.retention, 0.5);
  near("the median of the other two steps is 87.5%", r.medianRetention, 0.875);
  near("fixing it recovers 285 submissions", r.recoveredSubmissions, 285);
  near("worth 28.5 deals", r.recoveredDeals, 28.5);
  near("worth $28,500", r.recoveredRevenue, 28500);
  t("and it is called out as severe", r.verdict.tone, "bad");
}
{
  const v = readInputs(dropOffFields, { step1: "100", step2: "500", step3: "0", step4: "0", step5: "0", completed: "50" }).values;
  const r = computeDropOff(v);
  ok("a step that gains people is flagged", r.anomalies.length > 0);
  t("that transition computes no retention", r.transitions[0].retention, null);
  t("and the verdict refuses to conclude", r.verdict.tone, "warn");
}
{
  const v = readInputs(dropOffFields, { step1: "0", step2: "0", step3: "0", step4: "0", step5: "0", completed: "0" }).values;
  const r = computeDropOff(v);
  t("an empty form has no steps", r.steps.length, 0);
  t("and no completion rate", r.completionRate, null);
}
{
  const v = readInputs(dropOffFields, { step1: "1000", step2: "0", step3: "0", step4: "0", step5: "0", completed: "100" }).values;
  const r = computeDropOff(v);
  t("a single-step form has one transition", r.transitions.length, 1);
  t("no other step to take a median of", r.medianRetention, null);
  t("so no recovery figure is invented", r.recoveredSubmissions, null);
  t("and the verdict says there is no interior", r.verdict.tone, "neutral");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
