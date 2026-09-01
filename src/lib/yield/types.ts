import type { Verdict } from "../tools/engine.ts";

/**
 * The shapes Yield produces (#44).
 *
 * Separated from `./compute.ts` and `./query.ts` the way
 * `src/lib/workspaces/types.ts` is, so a component can name one of these
 * without importing a module that opens a database connection.
 *
 * Money is `bigint` cents throughout — see `./money.ts`. Anything that renders
 * one goes through `formatCents`.
 */

export type { Verdict };

/** What a Yield report was computed over. Printed, so it can be checked. */
export type YieldScope = {
  /** Null for the whole workspace. */
  endpointPublicId: string | null;
  endpointName: string | null;
  /** Inclusive. Null means "from the first submission". */
  from: Date | null;
  /** Exclusive, like the inbox's filter. Null means "up to now". */
  to: Date | null;
};

/** Money on won submissions, kept apart by the currency it was recorded in. */
export type CurrencyTotal = {
  /** ISO-4217, or null when a value was recorded without one. */
  currency: string | null;
  totalCents: bigint;
  /** Won submissions carrying a value in this currency. */
  wonWithValue: number;
  /** The single largest deal, for the concentration check. */
  largestCents: bigint;
};

/**
 * What this number does not count, inside the same scope.
 *
 * Yield's denominator is every submission in the window, so anything that
 * removes a submission raises the rate. That is a lever, and a lever nobody can
 * see is the dishonest dashboard we position against — our ICP is agencies
 * showing these numbers to the client paying them, so a silently gameable
 * denominator is not a customer fooling themselves, it is a tool for presenting
 * a better number to someone else with our name on it.
 *
 * Deletion stays allowed and the arithmetic is unchanged. It just cannot happen
 * quietly: if 40 junk submissions are deleted and the rate jumps, the panel says
 * 40 were excluded.
 *
 * Null means "not measured for this slice" rather than zero — see
 * `readYieldByDimension`, which does not count exclusions per group. Reporting
 * a zero we did not measure would be the same lie in the other direction.
 */
export type YieldExclusions = {
  /** Soft-deleted submissions that would otherwise be in this window. */
  deleted: number;
  /** Live submissions in the same scope but outside the date window. */
  outsideWindow: number;
};

/** How long outcomes take here, and how much of this window is still open. */
export type YieldTiming = {
  /** Days from submission to verdict, for the ones that have a verdict. */
  medianDaysToVerdict: number | null;
  p90DaysToVerdict: number | null;
  /**
   * Awaiting submissions already older than the median.
   *
   * The ones that are late, not merely recent. A window can be 60% open
   * because it is three days old — which is fine — or because those leads
   * were never dispositioned, which is not, and this is the number that tells
   * the two apart.
   */
  awaitingOlderThanMedian: number;
};

/**
 * The raw tallies a report is built from. Every one of these is shown in the
 * UI: a number a customer cannot take apart is the dishonest dashboard we
 * position against.
 */
export type YieldTallies = {
  submissions: number;
  won: number;
  lost: number;
  disqualified: number;
  awaiting: number;
  /** Won submissions with no `verdict_value` recorded. Yield value is a floor by this much. */
  wonWithoutValue: number;
  money: CurrencyTotal[];
  /** True when a summed value could not be read back as a number. Should never fire. */
  moneyUnreadable: boolean;
  /**
   * People who saw the form, when something counted them.
   *
   * Null today for every scope in the app: Endpoint stores submissions, not
   * page views. Hindsight (#45) will have a per-variant impression count, and
   * `valuePerVisitorCents` starts answering the moment it is passed in.
   * Fabricating it in the meantime — treating submissions as visitors — would
   * make Yield-per-visitor equal Yield-per-submission and quietly report the
   * wrong metric under the right label.
   */
  visitors: number | null;
  firstSubmissionAt: Date | null;
  lastSubmissionAt: Date | null;
  timing: YieldTiming;
  /** Rows the denominator leaves out. Null when this scope did not measure them. */
  excluded: YieldExclusions | null;
};

/** Yield value, per currency. */
export type YieldValue = {
  currency: string | null;
  totalCents: bigint;
  wonWithValue: number;
  /** Total ÷ every submission in the window, including the open ones. */
  perSubmissionCents: bigint | null;
  /** The version finance recognises (`docs/02` §the vocabulary table). */
  perHundredSubmissionsCents: bigint | null;
  /** Null unless a visitor count was supplied. */
  perVisitorCents: bigint | null;
  /** Total ÷ the won deals that carried a value. Average deal size. */
  averageWonCents: bigint | null;
  largestCents: bigint;
  /** The largest deal's share of the total, 0..1. One deal carrying a metric shows here. */
  concentration: number | null;
};

/** A 95% interval on a rate. */
export type Interval = { low: number; high: number };

export type YieldRate = {
  /**
   * `won / submissions`. Every unresolved submission counted as not-yet-won,
   * which makes this a floor that can only rise as verdicts land.
   */
  floor: number | null;
  /** `(won + awaiting) / submissions`. Every unresolved submission counted as a win. */
  ceiling: number | null;
  /** `won / resolved`. The rate among decided leads; null with nothing decided. */
  amongResolved: number | null;
  /** `ceiling - floor`. The width of what we do not know yet. */
  uncertainty: number | null;
  /** Wilson 95% interval on `floor`. Sampling error only — not the open ones. */
  interval: Interval | null;
};

export type YieldReport = {
  scope: YieldScope;
  submissions: number;
  won: number;
  lost: number;
  disqualified: number;
  /** Submissions with any outcome at all. */
  resolved: number;
  /** Submissions still awaiting a verdict. */
  open: number;
  /** `resolved / submissions`. How much of this window has actually been decided. */
  resolvedShare: number | null;
  rate: YieldRate;
  /** `(won + lost) / submissions` — reached a real sales conversation, either way. */
  qualifiedShare: number | null;
  /** `disqualified / resolved` — the junk share of what has been decided. */
  junkShare: number | null;
  value: YieldValue[];
  /** How mature the window is: whether these numbers are ready to be read. */
  maturity: Verdict;
  /** Whether there is enough here to compare against anything. */
  confidence: Verdict;
  /** Caveats that apply to this particular number, in plain sentences. */
  caveats: string[];
  /** Everything the report was computed from, verbatim. */
  inputs: YieldTallies;
};

/** What a Yield report can be grouped by. Whitelisted; each maps to one column. */
export type YieldDimension =
  | "endpoint"
  | "origin"
  | "variant"
  | "utm_source"
  | "utm_medium"
  | "utm_campaign";

/** One slice of a grouped report. `key` is null for "not set". */
export type YieldGroup = {
  key: string | null;
  label: string;
  report: YieldReport;
};
