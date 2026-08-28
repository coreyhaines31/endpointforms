/**
 * The calculation layer behind /tools. Every number any tool page prints comes
 * from this file.
 *
 * Two deliberate constraints:
 *
 * 1. **No imports.** Plain arithmetic only, so `tests/tools.test.mjs` can run it
 *    under `node --experimental-strip-types` with no bundler, and so the whole
 *    of the site's maths is auditable in one place. Being auditable is the brand.
 * 2. **Nothing here returns NaN or Infinity.** Every division goes through
 *    `ratio()`, which returns `null` when the answer is undefined. `null` means
 *    "we cannot answer that from these numbers" and the UI prints an em dash.
 *
 * ── SEAM: dogfooding ──────────────────────────────────────────────────────────
 * Each tool is a `FieldSpec[]` plus a pure `compute(...)`. That pair is the same
 * shape an Endpoint form definition produces: the field list is the form, the
 * compute is the computed output, and `readInputs()` is the coercion the form
 * runtime would do. When the product exists, the `useState` in each
 * `calculator.tsx` gets replaced by the form runtime and this file does not
 * change. Field keys are stable and are the thing a form definition would key on.
 */

/* ────────────────────────────────────────────────────────────── field schema */

export type FieldUnit = "currency" | "percent" | "count" | "minutes" | "days";

export type FieldSpec = {
  /** Stable. A form definition would key on this. */
  key: string;
  label: string;
  unit: FieldUnit;
  min: number;
  max: number;
  step: number;
  /** Sensible enough that the tool is useful before anyone touches it. */
  default: number;
  /** Shown under the input. Say where a default came from, or that it's a guess. */
  help?: string;
};

export type Inputs = Record<string, number>;

/** True when the raw string was outside the field's range and got pulled back in. */
export type Coercion = { value: number; clamped: boolean };

/**
 * One raw string in, one usable number out. Empty, "-", "abc", "1e400" and
 * "99999999999999" all resolve to something the maths can survive.
 */
export function readField(spec: FieldSpec, raw: string): Coercion {
  const trimmed = String(raw ?? "").trim().replace(/,/g, "");
  if (trimmed === "" || trimmed === "-" || trimmed === ".") {
    return { value: spec.min > 0 ? spec.min : 0, clamped: false };
  }
  const parsed = Number(trimmed);
  // Three distinct failure modes, three different right answers. "1e400" is a
  // number that overflowed and belongs at the ceiling; "abc" is not a number at
  // all and belongs at the floor. Collapsing them would print a trillion-dollar
  // result for a typo.
  if (Number.isNaN(parsed)) return { value: spec.min > 0 ? spec.min : 0, clamped: true };
  if (parsed === Infinity) return { value: spec.max, clamped: true };
  if (parsed === -Infinity) return { value: spec.min, clamped: true };
  if (parsed < spec.min) return { value: spec.min, clamped: true };
  if (parsed > spec.max) return { value: spec.max, clamped: true };
  return { value: parsed, clamped: false };
}

/** Coerce a whole form's worth of raw strings. Missing keys fall back to default. */
export function readInputs(
  specs: FieldSpec[],
  raw: Record<string, string>,
): { values: Inputs; clamped: string[] } {
  const values: Inputs = {};
  const clamped: string[] = [];
  for (const spec of specs) {
    const source = raw[spec.key];
    if (source === undefined) {
      values[spec.key] = spec.default;
      continue;
    }
    const read = readField(spec, source);
    values[spec.key] = read.value;
    if (read.clamped) clamped.push(spec.key);
  }
  return { values, clamped };
}

export function defaultsFor(specs: FieldSpec[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const spec of specs) out[spec.key] = String(spec.default);
  return out;
}

/* ───────────────────────────────────────────────────────────────── primitives */

/** The only division in this file. `null` when the answer does not exist. */
export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  const out = numerator / denominator;
  return Number.isFinite(out) ? out : null;
}

export function pct(value: number): number {
  return value / 100;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/* ──────────────────────────────────────────────────────────────── formatting */

const EMPTY = "—";

function guard(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

export function formatCurrency(value: number | null, decimals = 0): string {
  const safe = guard(value);
  if (safe === null) return EMPTY;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe);
}

export function formatNumber(value: number | null, decimals = 0): string {
  const safe = guard(value);
  if (safe === null) return EMPTY;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe);
}

/** Takes a proportion (0.283), prints a percentage ("28.3%"). */
export function formatPercent(value: number | null, decimals = 1): string {
  const safe = guard(value);
  if (safe === null) return EMPTY;
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe * 100)}%`;
}

export function formatMultiple(value: number | null, decimals = 1): string {
  const safe = guard(value);
  if (safe === null) return EMPTY;
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe)}×`;
}

/** Months, rendered the way a person would say them. */
export function formatDuration(months: number | null): string {
  const safe = guard(months);
  if (safe === null) return EMPTY;
  if (safe >= 1200) return "over a century";
  if (safe < 0.25) return "under a week";
  if (safe < 1) return `${formatNumber(safe * 4.345, 0)} weeks`;
  if (safe < 24) return `${formatNumber(safe, 1)} months`;
  return `${formatNumber(safe / 12, 1)} years`;
}

/* ───────────────────────────────────────────────────────────────── statistics */

/** Abramowitz & Stegun 7.1.26. |error| < 1.5e-7, which is far past what we print. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export type ProportionTest = {
  /** null when the test is undefined — no traffic, or no conversions at all. */
  p: number | null;
  z: number | null;
  significant: boolean;
  confidence: number | null;
};

/** Two-sided two-proportion z-test. The standard one; no continuity correction. */
export function twoProportionTest(
  successesA: number,
  trialsA: number,
  successesB: number,
  trialsB: number,
): ProportionTest {
  const none = { p: null, z: null, significant: false, confidence: null };
  if (trialsA <= 0 || trialsB <= 0) return none;
  const a = clamp(successesA, 0, trialsA);
  const b = clamp(successesB, 0, trialsB);
  const pa = a / trialsA;
  const pb = b / trialsB;
  const pooled = (a + b) / (trialsA + trialsB);
  if (pooled <= 0 || pooled >= 1) return none;
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / trialsA + 1 / trialsB));
  if (se === 0) return none;
  const z = (pb - pa) / se;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  const bounded = clamp(p, 0, 1);
  return {
    p: bounded,
    z,
    significant: bounded < 0.05,
    confidence: 1 - bounded,
  };
}

/**
 * Visitors needed *per variant* to detect a difference this size at 95%
 * confidence and 80% power. Returns null when the two rates are equal (you
 * would need infinite traffic) and caps at a trillion so nothing overflows.
 */
export function requiredSamplePerArm(rateA: number, rateB: number): number | null {
  const a = clamp(rateA, 0, 1);
  const b = clamp(rateB, 0, 1);
  const delta = Math.abs(b - a);
  if (delta === 0) return null;
  const zAlpha = 1.959964;
  const zBeta = 0.8416212;
  const pooled = (a + b) / 2;
  const term =
    zAlpha * Math.sqrt(2 * pooled * (1 - pooled)) +
    zBeta * Math.sqrt(a * (1 - a) + b * (1 - b));
  const n = (term * term) / (delta * delta);
  if (!Number.isFinite(n)) return null;
  return Math.min(1e12, Math.ceil(n));
}

/* ───────────────────────────────────────────────────────────────── verdicts */

export type Tone = "good" | "warn" | "bad" | "neutral";
export type Verdict = { tone: Tone; headline: string; detail: string };

/* ═══════════════════════════════════════════════════ 1 · form spam cost ═══ */

export const spamCostFields: FieldSpec[] = [
  {
    key: "spend",
    label: "Monthly ad spend on this form",
    unit: "currency",
    min: 0,
    max: 10_000_000,
    step: 100,
    default: 12_000,
  },
  {
    key: "cpl",
    label: "Cost per lead the ad platform reports",
    unit: "currency",
    min: 0,
    max: 100_000,
    step: 1,
    default: 45,
    help: "The number on the dashboard, before anyone calls anybody.",
  },
  {
    key: "junkPct",
    label: "Share sales calls junk, spam or unreachable",
    unit: "percent",
    min: 0,
    max: 100,
    step: 1,
    default: 28,
    help: "Our default is a placeholder, not a benchmark — we have no data on your junk rate and neither does anyone else. Ask your reps and replace it.",
  },
  {
    key: "minutesPerLead",
    label: "Minutes a rep burns before writing one off",
    unit: "minutes",
    min: 0,
    max: 480,
    step: 1,
    default: 9,
    help: "Dial, voicemail, a note in the CRM, and the second attempt nobody logs.",
  },
  {
    key: "hourlyCost",
    label: "Fully-loaded rep cost per hour",
    unit: "currency",
    min: 0,
    max: 5_000,
    step: 1,
    default: 42,
    help: "Salary plus tax plus tooling, divided by hours. Your finance team has this.",
  },
  {
    key: "perResponseFee",
    label: "What your form tool charges per response",
    unit: "currency",
    min: 0,
    max: 100,
    step: 0.01,
    default: 0,
    help: "Zero if you are inside your plan's cap. Above the cap, this is the per-response tax.",
  },
];

export type SpamCostResult = {
  submissions: number | null;
  junkSubmissions: number | null;
  realSubmissions: number | null;
  wastedSpend: number | null;
  wastedHours: number | null;
  wastedPayroll: number | null;
  formTax: number | null;
  monthlyTotal: number | null;
  annualTotal: number | null;
  effectiveCpl: number | null;
  cplMultiple: number | null;
  verdict: Verdict;
};

export function computeSpamCost(v: Inputs): SpamCostResult {
  const submissions = ratio(v.spend, v.cpl);

  if (submissions === null || submissions === 0) {
    return {
      submissions: null,
      junkSubmissions: null,
      realSubmissions: null,
      wastedSpend: null,
      wastedHours: null,
      wastedPayroll: null,
      formTax: null,
      monthlyTotal: null,
      annualTotal: null,
      effectiveCpl: null,
      cplMultiple: null,
      verdict: {
        tone: "neutral",
        headline: "Add a spend and a cost per lead",
        detail:
          "With a cost per lead of zero there is no submission count to work from, so there is nothing to divide. Everything below waits on those two numbers.",
      },
    };
  }

  const junkShare = pct(v.junkPct);
  const junkSubmissions = submissions * junkShare;
  const realSubmissions = submissions - junkSubmissions;
  const wastedSpend = junkSubmissions * v.cpl;
  const wastedHours = (junkSubmissions * v.minutesPerLead) / 60;
  const wastedPayroll = wastedHours * v.hourlyCost;
  const formTax = junkSubmissions * v.perResponseFee;
  const monthlyTotal = wastedSpend + wastedPayroll + formTax;
  const effectiveCpl = ratio(v.spend, realSubmissions);
  const cplMultiple = effectiveCpl === null ? null : ratio(effectiveCpl, v.cpl);

  let verdict: Verdict;
  if (v.junkPct >= 100) {
    verdict = {
      tone: "bad",
      headline: "Every lead is junk, so there is no cost per lead",
      detail:
        "At 100% junk the whole spend is waste and the effective cost per usable lead is undefined — you cannot divide by zero real leads. That is not a maths failure, it is the finding: turn the campaign off before you optimise anything about the form.",
    };
  } else if (v.junkPct >= 40) {
    verdict = {
      tone: "bad",
      headline: "Most of what you are buying, you cannot sell to",
      detail:
        "Above roughly 40% junk the reported cost per lead has stopped being a useful planning number. Any bid decision made on it is being made on a figure that is wrong in the flattering direction.",
    };
  } else if (v.junkPct >= 15) {
    verdict = {
      tone: "warn",
      headline: "The gap between reported and real is now large enough to change decisions",
      detail:
        "At this junk rate, two campaigns with the same reported cost per lead can differ by a wide margin on the leads a rep can actually work. Comparing them on the dashboard number will rank them wrongly.",
    };
  } else {
    verdict = {
      tone: "good",
      headline: "Your reported cost per lead is close to your real one",
      detail:
        "At this junk rate the dashboard number is roughly honest and the waste below is a rounding error rather than a crisis. Worth re-running whenever a campaign or a landing page changes — junk rate moves with the traffic source, not with the form.",
    };
  }

  return {
    submissions,
    junkSubmissions,
    realSubmissions,
    wastedSpend,
    wastedHours,
    wastedPayroll,
    formTax,
    monthlyTotal,
    annualTotal: monthlyTotal * 12,
    effectiveCpl,
    cplMultiple,
    verdict,
  };
}

/* ══════════════════════════════════════════ 2 · cost per closed deal ═══ */

const campaignFields = (id: "a" | "b", label: string, spend: number, leads: number, close: number, value: number): FieldSpec[] => [
  { key: `${id}Spend`, label: `${label} — spend`, unit: "currency", min: 0, max: 10_000_000, step: 100, default: spend },
  { key: `${id}Leads`, label: `${label} — form submissions`, unit: "count", min: 0, max: 1_000_000, step: 1, default: leads },
  {
    key: `${id}CloseRate`,
    label: `${label} — share that closed`,
    unit: "percent",
    min: 0,
    max: 100,
    step: 0.1,
    default: close,
    help: "Closed-won divided by submissions, from your CRM — not from the form tool, which cannot see it.",
  },
  { key: `${id}DealValue`, label: `${label} — average closed deal`, unit: "currency", min: 0, max: 10_000_000, step: 100, default: value },
];

export const closedDealFields: FieldSpec[] = [
  ...campaignFields("a", "Campaign A", 6_000, 400, 1.2, 4_000),
  ...campaignFields("b", "Campaign B", 6_000, 120, 9, 4_000),
];

export type CampaignResult = {
  spend: number;
  leads: number;
  deals: number;
  cpl: number | null;
  costPerDeal: number | null;
  revenue: number;
  roas: number | null;
  profit: number;
};

export type ClosedDealResult = {
  a: CampaignResult;
  b: CampaignResult;
  cplWinner: "a" | "b" | "tie" | null;
  dealWinner: "a" | "b" | "tie" | null;
  flipped: boolean;
  cplGap: number | null;
  dealGap: number | null;
  verdict: Verdict;
};

function campaign(spend: number, leads: number, closeRate: number, dealValue: number): CampaignResult {
  const deals = leads * pct(closeRate);
  const revenue = deals * dealValue;
  return {
    spend,
    leads,
    deals,
    cpl: ratio(spend, leads),
    costPerDeal: ratio(spend, deals),
    revenue,
    roas: ratio(revenue, spend),
    profit: revenue - spend,
  };
}

function cheaper(x: number | null, y: number | null): "a" | "b" | "tie" | null {
  if (x === null || y === null) return null;
  if (Math.abs(x - y) < 1e-9) return "tie";
  return x < y ? "a" : "b";
}

export function computeClosedDeal(v: Inputs): ClosedDealResult {
  const a = campaign(v.aSpend, v.aLeads, v.aCloseRate, v.aDealValue);
  const b = campaign(v.bSpend, v.bLeads, v.bCloseRate, v.bDealValue);

  const cplWinner = cheaper(a.cpl, b.cpl);
  const dealWinner = cheaper(a.costPerDeal, b.costPerDeal);
  const flipped =
    cplWinner !== null &&
    dealWinner !== null &&
    cplWinner !== "tie" &&
    dealWinner !== "tie" &&
    cplWinner !== dealWinner;

  const cplGap =
    a.cpl !== null && b.cpl !== null
      ? ratio(Math.max(a.cpl, b.cpl), Math.min(a.cpl, b.cpl))
      : null;
  const dealGap =
    a.costPerDeal !== null && b.costPerDeal !== null
      ? ratio(Math.max(a.costPerDeal, b.costPerDeal), Math.min(a.costPerDeal, b.costPerDeal))
      : null;

  let verdict: Verdict;
  if (a.costPerDeal === null && b.costPerDeal === null) {
    verdict = {
      tone: "neutral",
      headline: "Neither campaign has closed anything yet",
      detail:
        "Cost per closed deal is undefined when the numerator of closed deals is zero, and that is the honest answer rather than a bug. Until one of these produces a closed deal, cost per lead is the only number you have — which is exactly the position this tool exists to make uncomfortable.",
    };
  } else if (flipped) {
    verdict = {
      tone: "bad",
      headline: "The cheaper campaign is the more expensive one",
      detail:
        "One of these wins on cost per lead and loses on cost per closed deal. Every bid, budget and pause decision made on the dashboard number is being made on the metric that ranks them backwards. This is the whole reason the second column exists.",
    };
  } else if (dealWinner === "tie") {
    verdict = {
      tone: "neutral",
      headline: "The same cost per closed deal, by different routes",
      detail:
        "These two buy pipeline at the same price. Pick on something the arithmetic cannot see — sales capacity, how much rep time the cheaper leads consume, or how quickly each one disqualifies.",
    };
  } else {
    verdict = {
      tone: "good",
      headline: "Both metrics agree, so the cheap one really is cheap",
      detail:
        "Cost per lead and cost per closed deal rank these the same way, which means the dashboard number happens to be telling the truth here. It is worth knowing that it agrees rather than assuming it — the agreement is a property of these two campaigns, not of the metric.",
    };
  }

  return { a, b, cplWinner, dealWinner, flipped, cplGap, dealGap, verdict };
}

/* ═════════════════════════════════ 3 · outcome-weighted split test ═══ */

const variantFields = (
  id: "a" | "b",
  label: string,
  visitors: number,
  completions: number,
  won: number,
  value: number,
): FieldSpec[] => [
  { key: `${id}Visitors`, label: `${label} — visitors`, unit: "count", min: 0, max: 100_000_000, step: 1, default: visitors },
  { key: `${id}Completions`, label: `${label} — completed submissions`, unit: "count", min: 0, max: 100_000_000, step: 1, default: completions },
  {
    key: `${id}Won`,
    label: `${label} — closed-won`,
    unit: "count",
    min: 0,
    max: 100_000_000,
    step: 1,
    default: won,
    help: "Deals from this variant's submissions that your CRM marked won.",
  },
  { key: `${id}Value`, label: `${label} — total closed value`, unit: "currency", min: 0, max: 1_000_000_000, step: 100, default: value },
];

export const splitTestFields: FieldSpec[] = [
  ...variantFields("a", "Variant A", 8_000, 640, 19, 76_000),
  ...variantFields("b", "Variant B", 8_000, 896, 16, 64_000),
];

export type VariantResult = {
  visitors: number;
  completions: number;
  won: number;
  value: number;
  completionRate: number | null;
  /** Closed-won per visitor. The quality-adjusted conversion rate. */
  yieldRate: number | null;
  /** Closed value per visitor. */
  yieldValue: number | null;
};

export type SplitTestResult = {
  a: VariantResult;
  b: VariantResult;
  completionWinner: "a" | "b" | "tie" | null;
  yieldWinner: "a" | "b" | "tie" | null;
  disagree: boolean;
  completionTest: ProportionTest;
  yieldTest: ProportionTest;
  requiredVisitorsPerVariant: number | null;
  anomalies: string[];
  verdict: Verdict;
};

function variant(visitors: number, completions: number, won: number, value: number): VariantResult {
  return {
    visitors,
    completions,
    won,
    value,
    completionRate: ratio(completions, visitors),
    yieldRate: ratio(won, visitors),
    yieldValue: ratio(value, visitors),
  };
}

function higher(x: number | null, y: number | null): "a" | "b" | "tie" | null {
  if (x === null || y === null) return null;
  if (Math.abs(x - y) < 1e-12) return "tie";
  return x > y ? "a" : "b";
}

export function computeSplitTest(v: Inputs): SplitTestResult {
  const a = variant(v.aVisitors, v.aCompletions, v.aWon, v.aValue);
  const b = variant(v.bVisitors, v.bCompletions, v.bWon, v.bValue);

  const anomalies: string[] = [];
  if (a.completions > a.visitors || b.completions > b.visitors) {
    anomalies.push(
      "A variant has more completed submissions than visitors. Either the visitor count is a unique count and the submissions are not, or the two numbers come from different date ranges.",
    );
  }
  if (a.won > a.completions || b.won > b.completions) {
    anomalies.push(
      "A variant has more closed-won deals than submissions. Deals are probably being attributed to the form that did not originate there.",
    );
  }

  const completionWinner = higher(a.completionRate, b.completionRate);
  const yieldWinner = higher(a.yieldRate, b.yieldRate);
  const disagree =
    completionWinner !== null &&
    yieldWinner !== null &&
    completionWinner !== "tie" &&
    yieldWinner !== "tie" &&
    completionWinner !== yieldWinner;

  const completionTest = twoProportionTest(a.completions, a.visitors, b.completions, b.visitors);
  const yieldTest = twoProportionTest(a.won, a.visitors, b.won, b.visitors);

  const requiredVisitorsPerVariant =
    a.yieldRate !== null && b.yieldRate !== null
      ? requiredSamplePerArm(a.yieldRate, b.yieldRate)
      : null;

  let verdict: Verdict;
  if (a.visitors === 0 || b.visitors === 0) {
    verdict = {
      tone: "neutral",
      headline: "Add visitors for both variants",
      detail:
        "Neither rate can be computed without a denominator. Visitors, not sessions and not impressions — whatever your split-testing tool counted when it decided which variant to show.",
    };
  } else if (a.won === 0 && b.won === 0) {
    verdict = {
      tone: "warn",
      headline: "No closed deals yet, so there is no yield rate to compare",
      detail:
        "This is the most common state and it is worth sitting with. The completion test below may already be significant while the outcome test has literally nothing in it. A test that has concluded on completions and not started on outcomes has not concluded.",
    };
  } else if (disagree && yieldTest.significant) {
    verdict = {
      tone: "bad",
      headline: "The variant that completes better closes worse — and the difference is real",
      detail:
        "The two metrics rank these variants in opposite directions, and the outcome difference clears 95% confidence. Shipping the completion winner here would ship the losing variant. This is the case the whole method exists for, and it is rarer than it is exciting — check the anomalies above before you act on it.",
    };
  } else if (disagree) {
    verdict = {
      tone: "warn",
      headline: "The two metrics disagree, but not yet believably",
      detail:
        "The completion winner and the yield winner are different variants, which is interesting. The outcome difference does not clear 95% confidence, which means it is also consistent with noise. Interesting is not the same as decided.",
    };
  } else if (yieldTest.significant) {
    verdict = {
      tone: "good",
      headline: "Both metrics point the same way and the outcome difference holds up",
      detail:
        "The variant that completes better also closes better, and the closed-deal difference clears 95% confidence. Ship it. Note what you have actually learned: this is a property of these two variants, not evidence for a general rule about forms.",
    };
  } else {
    verdict = {
      tone: "warn",
      headline: "Not enough closed deals to believe the difference",
      detail:
        "This is the answer most outcome-weighted tests give, and it is the honest one. The completion difference may look decisive; closed deals are a much rarer event, so the same traffic buys far less certainty about them. The sample figure below is what it would actually take.",
    };
  }

  return {
    a,
    b,
    completionWinner,
    yieldWinner,
    disagree,
    completionTest,
    yieldTest,
    requiredVisitorsPerVariant,
    anomalies,
    verdict,
  };
}

/* ═══════════════════════════════════════════ 4 · time to outcome ═══ */

export const timeToOutcomeFields: FieldSpec[] = [
  { key: "submissions", label: "Form submissions per month", unit: "count", min: 0, max: 10_000_000, step: 10, default: 600 },
  {
    key: "gradeablePct",
    label: "Share that ever gets a won / lost / disqualified back",
    unit: "percent",
    min: 0,
    max: 100,
    step: 1,
    default: 70,
    help: "Leads that go into the CRM and never get a disposition are not gradeable, however real they were.",
  },
  {
    key: "closeRate",
    label: "Share of submissions that close",
    unit: "percent",
    min: 0,
    max: 100,
    step: 0.1,
    default: 3,
  },
  {
    key: "liftPct",
    label: "Relative improvement you want to be able to detect",
    unit: "percent",
    min: 1,
    max: 500,
    step: 1,
    default: 20,
    help: "20% means going from a 3% close rate to 3.6%. Smaller differences cost dramatically more traffic to see.",
  },
  {
    key: "medianDays",
    label: "Median days from submission to a final answer",
    unit: "days",
    min: 0,
    max: 3_650,
    step: 1,
    default: 30,
  },
  { key: "variants", label: "Variants in the test, including the control", unit: "count", min: 2, max: 8, step: 1, default: 2 },
];

export type TimeToOutcomeResult = {
  gradeablePerMonth: number | null;
  perVariantPerMonth: number | null;
  baseline: number;
  target: number;
  requiredPerVariant: number | null;
  monthsCollecting: number | null;
  monthsLag: number;
  monthsTotal: number | null;
  verdict: Verdict;
};

export function computeTimeToOutcome(v: Inputs): TimeToOutcomeResult {
  const gradeablePerMonth = v.submissions * pct(v.gradeablePct);
  const variants = Math.max(2, Math.round(v.variants));
  const perVariantPerMonth = ratio(gradeablePerMonth, variants);

  const baseline = clamp(pct(v.closeRate), 0, 1);
  const target = clamp(baseline * (1 + pct(v.liftPct)), 0, 0.999999);
  const requiredPerVariant = requiredSamplePerArm(baseline, target);
  const monthsCollecting =
    requiredPerVariant === null || perVariantPerMonth === null || perVariantPerMonth <= 0
      ? null
      : requiredPerVariant / perVariantPerMonth;
  const monthsLag = v.medianDays / 30.44;
  const monthsTotal = monthsCollecting === null ? null : monthsCollecting + monthsLag;

  let verdict: Verdict;
  if (baseline <= 0) {
    verdict = {
      tone: "bad",
      headline: "Nothing closes, so there is nothing to test on",
      detail:
        "At a zero close rate an outcome-weighted test has no signal to find. Fix the offer or the traffic before instrumenting the form; no amount of measurement rescues a funnel with no outcomes in it.",
    };
  } else if (monthsTotal === null) {
    verdict = {
      tone: "neutral",
      headline: "Add a submission volume",
      detail:
        "With no gradeable submissions per month there is no rate of accumulation, so there is no answer. Volume is the input this whole question turns on.",
    };
  } else if (monthsTotal <= 1.5) {
    verdict = {
      tone: "good",
      headline: "Fast enough to actually run this",
      detail:
        "At your volume and sales cycle, an outcome-weighted split test concludes inside a normal testing cadence. You are in the minority — most funnels that ask this question get a number several times larger.",
    };
  } else if (monthsTotal <= 4) {
    verdict = {
      tone: "good",
      headline: "Workable, on a quarterly rhythm",
      detail:
        "This concludes, but not fast enough to iterate weekly. Run outcome-weighted tests on the decisions that stay decided — the form's shape, the qualifying questions — and leave copy tweaks to completion-rate testing, knowing what that metric cannot see.",
    };
  } else if (monthsTotal <= 12) {
    verdict = {
      tone: "warn",
      headline: "Technically possible, practically fragile",
      detail:
        "A test this long outlives the thing it is testing. Your traffic mix, offer and sales team will all change before it concludes, and any of those changes invalidates it. Treat outcome data as a running ledger of what your leads turned out to be, not as an experiment you wait on.",
    };
  } else {
    verdict = {
      tone: "bad",
      headline: "No — outcome-weighted split testing will not work at this volume",
      detail:
        "This is the honest answer and it is not the answer that sells software. At your volume and cycle length the test cannot conclude before it is meaningless. The outcome data is still worth collecting — knowing which leads turned into money is useful on its own — but it should grade your traffic sources, not adjudicate a form variant.",
    };
  }

  return {
    gradeablePerMonth,
    perVariantPerMonth,
    baseline,
    target,
    requiredPerVariant,
    monthsCollecting,
    monthsLag,
    monthsTotal,
    verdict,
  };
}

/* ═══════════════════════════════════════════ 5 · form field payback ═══ */

export const fieldPaybackFields: FieldSpec[] = [
  { key: "visitors", label: "People who reach the form each month", unit: "count", min: 0, max: 10_000_000, step: 100, default: 5_000 },
  { key: "completionRate", label: "Completion rate today", unit: "percent", min: 0, max: 100, step: 0.1, default: 12 },
  {
    key: "dropPct",
    label: "Completion you expect to lose by adding the field",
    unit: "percent",
    min: 0,
    max: 99,
    step: 0.5,
    default: 8,
    help: "Relative, not percentage points: 8% turns a 12% completion rate into 11.04%. This is your assumption, not our statistic — see the note below the result.",
  },
  { key: "closeRate", label: "Share of submissions that close today", unit: "percent", min: 0, max: 100, step: 0.1, default: 4 },
  { key: "dealValue", label: "Average closed deal", unit: "currency", min: 0, max: 10_000_000, step: 100, default: 3_500 },
  {
    key: "expectedLiftPct",
    label: "Close-rate improvement you expect from the better leads",
    unit: "percent",
    min: 0,
    max: 500,
    step: 1,
    default: 0,
    help: "Leave at zero to read the break-even only. Anything above zero is a forecast, and forecasts are where this gets dishonest.",
  },
];

export type FieldPaybackResult = {
  completionsNow: number;
  completionsAfter: number;
  leadsLost: number;
  requiredRelativeLift: number | null;
  requiredCloseRate: number | null;
  impossible: boolean;
  revenueNow: number;
  revenueAfter: number;
  revenueDelta: number;
  dealsLost: number;
  verdict: Verdict;
};

export function computeFieldPayback(v: Inputs): FieldPaybackResult {
  const completionsNow = v.visitors * pct(v.completionRate);
  const completionsAfter = completionsNow * (1 - pct(v.dropPct));
  const leadsLost = completionsNow - completionsAfter;

  const retention = ratio(completionsAfter, completionsNow);
  const requiredRelativeLift = retention === null || retention === 0 ? null : 1 / retention - 1;
  const requiredCloseRate =
    requiredRelativeLift === null ? null : v.closeRate * (1 + requiredRelativeLift);
  const impossible = requiredCloseRate !== null && requiredCloseRate > 100;

  const closeNow = pct(v.closeRate);
  const closeAfter = clamp(closeNow * (1 + pct(v.expectedLiftPct)), 0, 1);
  const revenueNow = completionsNow * closeNow * v.dealValue;
  const revenueAfter = completionsAfter * closeAfter * v.dealValue;

  let verdict: Verdict;
  if (completionsNow === 0) {
    verdict = {
      tone: "neutral",
      headline: "Add traffic and a completion rate",
      detail:
        "With no completions today there is no baseline to trade against, and the break-even is undefined rather than zero.",
    };
  } else if (v.dropPct === 0) {
    verdict = {
      tone: "neutral",
      headline: "By your own assumption, this field is free",
      detail:
        "You have set the completion cost to zero, so the break-even lift is zero and the field pays for itself trivially. That is the assumption worth interrogating: a field that costs nothing to ask is unusual, and nobody in this category has published data either way.",
    };
  } else if (impossible) {
    verdict = {
      tone: "bad",
      headline: "No close rate is high enough to pay for this field",
      detail:
        "Recovering the lost completions would require closing more than 100% of the leads you keep, which is not available. On these numbers the field cannot pay for itself no matter how much better the leads it filters for are. Ask it after the submission, not inside it.",
    };
  } else if (requiredRelativeLift !== null && requiredRelativeLift <= 0.05) {
    verdict = {
      tone: "good",
      headline: "A small quality gain covers this",
      detail:
        "The bar is low enough that a modest improvement in lead quality pays for the completions you lose. Low bars are worth taking, with one caveat: you still have to verify that the quality gain happened, and completion rate cannot verify it for you.",
    };
  } else if (requiredRelativeLift !== null && requiredRelativeLift <= 0.25) {
    verdict = {
      tone: "warn",
      headline: "A real, and checkable, bar",
      detail:
        "This is the interesting middle. The required improvement is large enough that it will not happen by accident and small enough that it plausibly could. It is also large enough that you would notice it in closed-won data — which means this is a question you can settle rather than argue about.",
    };
  } else {
    verdict = {
      tone: "bad",
      headline: "That is a big bar to clear",
      detail:
        "The field would have to filter for substantially better leads to break even. Possible — a phone number or a budget question genuinely does change who submits — but on these numbers it is a bet, and it should be run as one rather than assumed.",
    };
  }

  return {
    completionsNow,
    completionsAfter,
    leadsLost,
    requiredRelativeLift,
    requiredCloseRate,
    impossible,
    revenueNow,
    revenueAfter,
    revenueDelta: revenueAfter - revenueNow,
    dealsLost: leadsLost * closeNow,
    verdict,
  };
}

/* ══════════════════════════════════════ 6 · cost per usable response ═══ */

const planFields = (id: "a" | "b" | "c", label: string, price: number, included: number, overage: number): FieldSpec[] => [
  { key: `${id}Price`, label: `${label} — monthly price`, unit: "currency", min: 0, max: 100_000, step: 1, default: price },
  { key: `${id}Included`, label: `${label} — responses included`, unit: "count", min: 0, max: 10_000_000, step: 100, default: included },
  { key: `${id}Overage`, label: `${label} — price per extra response`, unit: "currency", min: 0, max: 1_000, step: 0.01, default: overage },
];

export const responseCostFields: FieldSpec[] = [
  { key: "submissions", label: "Submissions your form takes per month", unit: "count", min: 0, max: 10_000_000, step: 100, default: 3_000 },
  {
    key: "junkPct",
    label: "Share of those you cannot sell to",
    unit: "percent",
    min: 0,
    max: 100,
    step: 1,
    default: 30,
    help: "Bots, spam, and people who were never going to buy. They consume your allowance identically to real ones.",
  },
  ...planFields("a", "Plan A", 29, 1_000, 0.05),
  ...planFields("b", "Plan B", 99, 10_000, 0.02),
  ...planFields("c", "Plan C", 0, 0, 0),
];

export type PlanResult = {
  id: "a" | "b" | "c";
  label: string;
  inUse: boolean;
  price: number;
  included: number;
  overageUnits: number;
  overageCost: number;
  total: number;
  costPerResponse: number | null;
  costPerUsableResponse: number | null;
  junkCost: number;
  includedEatenByJunk: number;
  capped: boolean;
};

export type ResponseCostResult = {
  submissions: number;
  usable: number;
  junkSubmissions: number;
  plans: PlanResult[];
  cheapestHeadline: PlanResult | null;
  cheapestPerUsable: PlanResult | null;
  flipped: boolean;
  verdict: Verdict;
};

function plan(
  id: "a" | "b" | "c",
  label: string,
  price: number,
  included: number,
  overage: number,
  submissions: number,
  usable: number,
  junkSubmissions: number,
): PlanResult {
  const inUse = price > 0 || included > 0 || overage > 0;
  const overageUnits = Math.max(0, submissions - included);
  const overageCost = overageUnits * overage;
  const total = price + overageCost;
  const junkShare = ratio(junkSubmissions, submissions) ?? 0;
  return {
    id,
    label,
    inUse,
    price,
    included,
    overageUnits,
    overageCost,
    total,
    costPerResponse: ratio(total, submissions),
    costPerUsableResponse: ratio(total, usable),
    junkCost: total * junkShare,
    includedEatenByJunk: Math.min(included, junkSubmissions),
    capped: overageUnits > 0 && overage === 0,
  };
}

export function computeResponseCost(v: Inputs): ResponseCostResult {
  const submissions = v.submissions;
  const junkSubmissions = submissions * pct(v.junkPct);
  const usable = submissions - junkSubmissions;

  const plans = [
    plan("a", "Plan A", v.aPrice, v.aIncluded, v.aOverage, submissions, usable, junkSubmissions),
    plan("b", "Plan B", v.bPrice, v.bIncluded, v.bOverage, submissions, usable, junkSubmissions),
    plan("c", "Plan C", v.cPrice, v.cIncluded, v.cOverage, submissions, usable, junkSubmissions),
  ];

  const live = plans.filter((p) => p.inUse);
  const byTotal = [...live].sort((x, y) => x.total - y.total);
  const withUsable = live.filter((p) => p.costPerUsableResponse !== null);
  const byUsable = [...withUsable].sort(
    (x, y) => (x.costPerUsableResponse ?? 0) - (y.costPerUsableResponse ?? 0),
  );

  const cheapestHeadline = byTotal[0] ?? null;
  const cheapestPerUsable = byUsable[0] ?? null;
  const flipped =
    cheapestHeadline !== null &&
    cheapestPerUsable !== null &&
    live.length > 1 &&
    cheapestHeadline.id !== cheapestPerUsable.id;

  let verdict: Verdict;
  if (live.length === 0) {
    verdict = {
      tone: "neutral",
      headline: "Fill in at least one plan",
      detail:
        "A plan counts as filled in once it has a price, an allowance, or an overage rate. We do not ship any vendor's numbers here, on purpose — see the note under the table.",
    };
  } else if (submissions === 0) {
    verdict = {
      tone: "neutral",
      headline: "Add a submission volume",
      detail: "Cost per response needs a response count to divide by.",
    };
  } else if (v.junkPct >= 50) {
    verdict = {
      tone: "bad",
      headline: "You are paying mostly for submissions you cannot sell to",
      detail:
        "Above half junk, per-response pricing has stopped being a price for a lead and become a price for traffic. The allowance is consumed by whoever arrives first, and bots arrive first. That is the sharpest version of the complaint this tool came from: if your form software has a submission limit, bots use it before real people get a chance.",
    };
  } else if (flipped) {
    verdict = {
      tone: "warn",
      headline: "The cheaper plan is not the cheaper plan",
      detail:
        "One plan wins on the monthly bill and a different one wins on cost per usable response. Which is right depends on whether you are buying software or buying leads — and every pricing page in this category is written on the assumption that you are buying software.",
    };
  } else {
    verdict = {
      tone: "good",
      headline: "The cheapest bill is also the cheapest per usable lead",
      detail:
        "On your volume and junk rate these rank the same way. Re-run it if your volume changes: allowances create step changes, so the ranking can flip on a single busy month.",
    };
  }

  return {
    submissions,
    usable,
    junkSubmissions,
    plans,
    cheapestHeadline,
    cheapestPerUsable,
    flipped,
    verdict,
  };
}

/* ═════════════════════════════════════ 7 · submission reconciliation ═══ */

export const reconciliationFields: FieldSpec[] = [
  {
    key: "reported",
    label: "Conversions your form tool or ad platform reports",
    unit: "count",
    min: 0,
    max: 10_000_000,
    step: 1,
    default: 840,
    help: "The headline number. The one that looks fine.",
  },
  { key: "inCrm", label: "Records that actually arrived in the CRM", unit: "count", min: 0, max: 10_000_000, step: 1, default: 790 },
  { key: "attempted", label: "Leads someone attempted to contact", unit: "count", min: 0, max: 10_000_000, step: 1, default: 640 },
  { key: "reached", label: "Leads someone actually reached", unit: "count", min: 0, max: 10_000_000, step: 1, default: 250 },
  {
    key: "real",
    label: "Leads that turned out to be real prospects",
    unit: "count",
    min: 0,
    max: 10_000_000,
    step: 1,
    default: 180,
    help: "Not bots, not fake details, not somebody who had no idea they filled anything in.",
  },
  { key: "won", label: "Closed-won", unit: "count", min: 0, max: 10_000_000, step: 1, default: 21 },
];

export type Stage = {
  key: string;
  label: string;
  count: number;
  /** Kept from the previous stage. null for the first stage or an impossible one. */
  retention: number | null;
  lost: number | null;
  /** Kept from the reported headline number. */
  shareOfReported: number | null;
  anomalous: boolean;
};

export type ReconciliationResult = {
  stages: Stage[];
  junkRate: number | null;
  overstatement: number | null;
  biggestLeak: Stage | null;
  closeOnReported: number | null;
  closeOnReal: number | null;
  anomalies: string[];
  verdict: Verdict;
};

export function computeReconciliation(v: Inputs): ReconciliationResult {
  const raw = [
    { key: "reported", label: "Reported conversions", count: v.reported },
    { key: "inCrm", label: "Reached the CRM", count: v.inCrm },
    { key: "attempted", label: "Contact attempted", count: v.attempted },
    { key: "reached", label: "Actually reached", count: v.reached },
    { key: "real", label: "Real prospects", count: v.real },
    { key: "won", label: "Closed-won", count: v.won },
  ];

  const anomalies: string[] = [];
  const stages: Stage[] = raw.map((stage, index) => {
    const previous = index === 0 ? null : raw[index - 1].count;
    const anomalous = previous !== null && stage.count > previous;
    if (anomalous) {
      anomalies.push(
        `“${stage.label}” is larger than “${raw[index - 1].label}”. A funnel cannot grow. Either another source is writing into this stage, or the two counts cover different date ranges.`,
      );
    }
    return {
      key: stage.key,
      label: stage.label,
      count: stage.count,
      retention: previous === null || anomalous ? null : ratio(stage.count, previous),
      lost: previous === null || anomalous ? null : previous - stage.count,
      shareOfReported: ratio(stage.count, v.reported),
      anomalous,
    };
  });

  const realShare = ratio(v.real, v.reported);
  const junkRate = realShare === null ? null : clamp(1 - realShare, 0, 1);
  const overstatement = ratio(v.reported, v.real);

  const leaks = stages.filter((s) => s.lost !== null && s.lost > 0);
  const biggestLeak =
    leaks.length === 0
      ? null
      : leaks.reduce((worst, s) => ((s.lost ?? 0) > (worst.lost ?? 0) ? s : worst));

  let verdict: Verdict;
  if (v.reported === 0) {
    verdict = {
      tone: "neutral",
      headline: "Start with the reported number",
      detail:
        "Everything here is measured against the figure your dashboard shows, so that is the one input the tool cannot do without.",
    };
  } else if (anomalies.length > 0) {
    verdict = {
      tone: "warn",
      headline: "These numbers do not reconcile",
      detail:
        "At least one stage is larger than the one above it, which cannot happen in a single funnel over a single period. Worth resolving before drawing conclusions — a reconciliation that does not reconcile is telling you something real about your instrumentation.",
    };
  } else if (overstatement !== null && overstatement >= 3) {
    verdict = {
      tone: "bad",
      headline: "Your dashboard counts several conversions for every real person",
      detail:
        "The gap between the reported number and the number of real prospects is wide enough that the reported number is no longer a proxy for anything. Every downstream decision — bids, budgets, which campaign gets scaled — is being made on it.",
    };
  } else if (overstatement !== null && overstatement >= 1.5) {
    verdict = {
      tone: "warn",
      headline: "The reported number runs meaningfully ahead of reality",
      detail:
        "Not catastrophic, and large enough to misrank two campaigns that look similar on the dashboard. The useful move is not to fix the dashboard but to carry the disposition back to the submission, so the two numbers stop being separate systems.",
    };
  } else {
    verdict = {
      tone: "good",
      headline: "Reported and real are close together",
      detail:
        "Your reported conversions are a decent proxy for real prospects, which is a genuinely good position and a fragile one — junk rate tracks the traffic source, so it moves the moment the media mix does. The number worth watching is the ratio, not either figure alone.",
    };
  }

  return {
    stages,
    junkRate,
    overstatement,
    biggestLeak,
    closeOnReported: ratio(v.won, v.reported),
    closeOnReal: ratio(v.won, v.real),
    anomalies,
    verdict,
  };
}

/* ══════════════════════════════════════════ 8 · multi-step drop-off ═══ */

export const dropOffFields: FieldSpec[] = [
  {
    key: "step1",
    label: "Step 1 — people who saw it",
    unit: "count",
    min: 0,
    max: 10_000_000,
    step: 1,
    default: 4_200,
    help: "Set a step to zero to end the form there. Everything after the first zero is ignored.",
  },
  { key: "step2", label: "Step 2 — people who reached it", unit: "count", min: 0, max: 10_000_000, step: 1, default: 2_950 },
  { key: "step3", label: "Step 3 — people who reached it", unit: "count", min: 0, max: 10_000_000, step: 1, default: 1_180 },
  { key: "step4", label: "Step 4 — people who reached it", unit: "count", min: 0, max: 10_000_000, step: 1, default: 1_010 },
  { key: "step5", label: "Step 5 — people who reached it", unit: "count", min: 0, max: 10_000_000, step: 1, default: 0 },
  { key: "completed", label: "Submitted", unit: "count", min: 0, max: 10_000_000, step: 1, default: 880 },
  { key: "closeRate", label: "Share of submissions that close", unit: "percent", min: 0, max: 100, step: 0.1, default: 4 },
  { key: "dealValue", label: "Average closed deal", unit: "currency", min: 0, max: 10_000_000, step: 100, default: 3_500 },
];

export type Transition = {
  label: string;
  from: number;
  to: number;
  retention: number | null;
  dropped: number;
  dropRate: number | null;
  anomalous: boolean;
};

export type DropOffResult = {
  steps: { label: string; count: number }[];
  transitions: Transition[];
  completionRate: number | null;
  worst: Transition | null;
  medianRetention: number | null;
  recoveredSubmissions: number | null;
  recoveredDeals: number | null;
  recoveredRevenue: number | null;
  anomalies: string[];
  verdict: Verdict;
};

export function computeDropOff(v: Inputs): DropOffResult {
  const declared = [
    { label: "Step 1", count: v.step1 },
    { label: "Step 2", count: v.step2 },
    { label: "Step 3", count: v.step3 },
    { label: "Step 4", count: v.step4 },
    { label: "Step 5", count: v.step5 },
  ];

  // The form ends at the first zero. Anything after it is a step that isn't there.
  const steps: { label: string; count: number }[] = [];
  for (const step of declared) {
    if (step.count === 0) break;
    steps.push(step);
  }

  const empty: DropOffResult = {
    steps: [],
    transitions: [],
    completionRate: null,
    worst: null,
    medianRetention: null,
    recoveredSubmissions: null,
    recoveredDeals: null,
    recoveredRevenue: null,
    anomalies: [],
    verdict: {
      tone: "neutral",
      headline: "Start with step 1",
      detail:
        "With nobody entering the form there is nothing to lose along the way. Step 1 is the denominator every number below is measured against.",
    },
  };
  if (steps.length === 0) return empty;

  const points = [...steps, { label: "Submitted", count: v.completed }];
  const anomalies: string[] = [];
  const transitions: Transition[] = [];

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const anomalous = to.count > from.count;
    if (anomalous) {
      anomalies.push(
        `More people reached “${to.label}” than “${from.label}”. Steps cannot gain people — the likely cause is a step that can be reached directly, or two counts measured over different windows.`,
      );
    }
    const retention = anomalous ? null : ratio(to.count, from.count);
    transitions.push({
      label: `${from.label} → ${to.label}`,
      from: from.count,
      to: to.count,
      retention,
      dropped: Math.max(0, from.count - to.count),
      dropRate: retention === null ? null : 1 - retention,
      anomalous,
    });
  }

  const completionRate = ratio(v.completed, steps[0].count);

  const usable = transitions.filter((t) => t.retention !== null);
  const worst =
    usable.length === 0
      ? null
      : usable.reduce((w, t) => ((t.retention ?? 1) < (w.retention ?? 1) ? t : w));

  const others = usable.filter((t) => t !== worst).map((t) => t.retention as number).sort((x, y) => x - y);
  const medianRetention =
    others.length === 0
      ? null
      : others.length % 2 === 1
        ? others[(others.length - 1) / 2]
        : (others[others.length / 2 - 1] + others[others.length / 2]) / 2;

  let recoveredSubmissions: number | null = null;
  if (worst && medianRetention !== null && worst.retention !== null && worst.retention > 0) {
    const factor = medianRetention / worst.retention;
    recoveredSubmissions = factor > 1 ? v.completed * factor - v.completed : 0;
  }
  const recoveredDeals = recoveredSubmissions === null ? null : recoveredSubmissions * pct(v.closeRate);
  const recoveredRevenue = recoveredDeals === null ? null : recoveredDeals * v.dealValue;

  let verdict: Verdict;
  if (anomalies.length > 0) {
    verdict = {
      tone: "warn",
      headline: "One of these steps gains people",
      detail:
        "A later step has a higher count than the step before it, which a single linear funnel cannot do. Resolve that before acting on the drop-off numbers; the transitions around it are unreliable.",
    };
  } else if (steps.length === 1) {
    verdict = {
      tone: "neutral",
      headline: "A single-step form has one number and it is the completion rate",
      detail:
        "There is no interior to diagnose. Add the steps of a multi-step form to find out where people leave — which is the only question this tool answers that a completion rate cannot.",
    };
  } else if (worst && worst.dropRate !== null && worst.dropRate >= 0.5) {
    verdict = {
      tone: "bad",
      headline: `Half your remaining traffic leaves at ${worst.label}`,
      detail:
        "A drop this steep in one place is usually a single identifiable cause — a required field people will not answer, a slow load, a keyboard that will not open on mobile — rather than general friction. It is the most concentrated fix on the page, and it is worth watching what the recovered submissions turn out to be worth rather than assuming they match your current close rate.",
    };
  } else if (worst && worst.dropRate !== null && worst.dropRate >= 0.25) {
    verdict = {
      tone: "warn",
      headline: `The worst loss is at ${worst.label}`,
      detail:
        "Steep enough to be worth a look and not so steep that something is obviously broken. Before rebuilding it, check whether that step is doing qualifying work: a step that loses people who were never going to buy is earning its place, and completion rate will call that a failure.",
    };
  } else {
    verdict = {
      tone: "good",
      headline: "Loss is spread fairly evenly across the steps",
      detail:
        "No single step is doing outsized damage, which means there is no cheap structural fix here — the gains are in the offer, the traffic, or the number of steps, not in one broken screen.",
    };
  }

  return {
    steps,
    transitions,
    completionRate,
    worst,
    medianRetention,
    recoveredSubmissions,
    recoveredDeals,
    recoveredRevenue,
    anomalies,
    verdict,
  };
}
