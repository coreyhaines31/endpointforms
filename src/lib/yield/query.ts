import { and, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

// Relative, extension-bearing imports rather than the `@/` alias, matching
// `src/lib/workspaces/` and `src/db/`. Plain `node` does not resolve the alias,
// and `tests/yield-query.test.mts` loads this module directly.
import { withWorkspace, type WorkspaceScope } from "../../db/scoped.ts";
import { endpoints, submissions } from "../../db/schema.ts";
import { computeYield, emptyTallies } from "./compute.ts";
import { centsFromNumeric } from "./money.ts";
import type {
  CurrencyTotal,
  YieldDimension,
  YieldGroup,
  YieldReport,
  YieldScope,
  YieldTallies,
} from "./types.ts";

/**
 * Reading Yield out of the database (#44).
 *
 * The arithmetic is in `./compute.ts` and none of it is here — this file's only
 * job is to turn rows into the tallies that function takes, so the awkward
 * cases can be tested without a database and the SQL can be checked against a
 * real one.
 *
 * Three rules:
 *
 * 1. **Everything runs inside `withWorkspace`**, so the predicate and row-level
 *    security both apply. A Yield report is a revenue report; it leaking across
 *    a tenant boundary would be worse than the inbox doing it.
 * 2. **Money is summed in Postgres, in `numeric`**, and only becomes a
 *    JavaScript value as `bigint` cents. `sum(verdict_value)` on a `numeric`
 *    column is exact; the same sum in JavaScript floats is not.
 * 3. **Submissions from archived endpoints still count.** Archiving stops new
 *    submissions and hides nothing that already arrived — a workspace whose
 *    Yield changed because someone tidied up an endpoint would be looking at a
 *    number that moved for no business reason.
 */

const SECONDS_PER_DAY = 86_400;

export type YieldQuery = {
  /** Narrow to one endpoint. Null or absent is the whole workspace. */
  endpointPublicId?: string | null;
  /** Inclusive lower bound on `submitted_at`. */
  from?: Date | null;
  /** Exclusive upper bound, matching the inbox's date filter. */
  to?: Date | null;
  /**
   * Visitors who saw the form, if anything counted them.
   *
   * Nothing in the app passes this yet — see `YieldTallies.visitors`. It is a
   * parameter rather than a query because the count will come from Hindsight's
   * variant impressions (#45), which are not in this table.
   */
  visitors?: number | null;
  now?: Date;
};

/** Yield for one workspace, or one endpoint inside it. Opens its own transaction. */
export async function readYield(
  workspaceId: string,
  query: YieldQuery = {},
): Promise<YieldReport> {
  return withWorkspace(workspaceId, (ws) => readYieldIn(ws, query));
}

/** The same read inside a transaction a caller already opened. */
export async function readYieldIn(
  ws: WorkspaceScope,
  query: YieldQuery = {},
): Promise<YieldReport> {
  const scope = await resolveScope(ws, query);
  if (query.endpointPublicId && scope.endpointName === null) {
    // The endpoint is not this workspace's, or does not exist. An empty report
    // rather than someone else's numbers.
    return computeYield(emptyTallies(), scope);
  }

  const conditions = windowConditions(query);
  const tallies = await readTallies(ws, conditions, query);
  return computeYield(tallies, scope);
}

/**
 * Yield sliced by one dimension — the "which source, which variant, which
 * endpoint" question (#44 scope).
 *
 * Every group is a full report, including its own maturity and confidence
 * verdicts, because the whole point of slicing is that one slice can be mature
 * and another not. Hindsight (#45) ranks on these: a variant is one group, and
 * `report.rate` plus `report.confidence` is everything a ranking needs to
 * either call a winner or refuse to.
 *
 * Sorted by Yield rate floor descending, ties broken by submission count, so
 * the caller gets a ranking rather than an arbitrary order — but note that
 * "top of this list" is not "the winner", and refusing to call it is
 * Hindsight's job, not this function's.
 */
export async function readYieldByDimension(
  workspaceId: string,
  dimension: YieldDimension,
  query: YieldQuery = {},
): Promise<YieldGroup[]> {
  return withWorkspace(workspaceId, (ws) => readYieldByDimensionIn(ws, dimension, query));
}

export async function readYieldByDimensionIn(
  ws: WorkspaceScope,
  dimension: YieldDimension,
  query: YieldQuery = {},
): Promise<YieldGroup[]> {
  const scope = await resolveScope(ws, query);
  if (query.endpointPublicId && scope.endpointName === null) return [];

  const conditions = windowConditions(query);
  const keyColumn = dimensionColumn(dimension);

  const countRows = await ws.tx
    .select({
      key: sql<string | null>`${keyColumn}::text`,
      label: dimension === "endpoint" ? endpoints.name : sql<string | null>`${keyColumn}::text`,
      ...COUNT_COLUMNS,
    })
    .from(submissions)
    .innerJoin(endpoints, endpointJoin(ws))
    .where(ws.where(submissions, ...conditions))
    .groupBy(keyColumn, dimension === "endpoint" ? endpoints.name : keyColumn);

  const moneyRows = await ws.tx
    .select({
      key: sql<string | null>`${keyColumn}::text`,
      currency: submissions.verdictCurrency,
      total: sql<string | null>`sum(${submissions.verdictValue})`,
      largest: sql<string | null>`max(${submissions.verdictValue})`,
      rows: sql<number>`count(*)::int`,
    })
    .from(submissions)
    .innerJoin(endpoints, endpointJoin(ws))
    .where(ws.where(submissions, ...conditions, WON_WITH_VALUE))
    .groupBy(keyColumn, submissions.verdictCurrency);

  const groups = countRows.map((row) => {
    const money = moneyRows.filter((entry) => entry.key === row.key);
    const tallies = talliesFrom(row, money, query.visitors ?? null, {
      medianDaysToVerdict: null,
      p90DaysToVerdict: null,
      awaitingOlderThanMedian: 0,
    });
    return {
      key: row.key,
      label: groupLabel(dimension, row.key, row.label),
      report: computeYield(tallies, scope),
    };
  });

  return groups.sort((a, b) => {
    const byRate = (b.report.rate.floor ?? -1) - (a.report.rate.floor ?? -1);
    if (byRate !== 0) return byRate;
    return b.report.submissions - a.report.submissions;
  });
}

// ---------------------------------------------------------------------------
// The queries
// ---------------------------------------------------------------------------

/** A won submission that actually carries an amount. */
const WON_WITH_VALUE: SQL = sql`${submissions.verdict} = 'won' and ${submissions.verdictValue} is not null`;

/** One `count(*) filter (...)` per state. Shared by the scope and group reads. */
const COUNT_COLUMNS = {
  submissions: sql<number>`count(*)::int`,
  won: sql<number>`(count(*) filter (where ${submissions.verdict} = 'won'))::int`,
  lost: sql<number>`(count(*) filter (where ${submissions.verdict} = 'lost'))::int`,
  disqualified: sql<number>`(count(*) filter (where ${submissions.verdict} = 'disqualified'))::int`,
  awaiting: sql<number>`(count(*) filter (where ${submissions.verdict} = 'awaiting'))::int`,
  wonWithoutValue: sql<number>`(count(*) filter (where ${submissions.verdict} = 'won' and ${submissions.verdictValue} is null))::int`,
};

async function readTallies(
  ws: WorkspaceScope,
  conditions: (SQL | undefined)[],
  query: YieldQuery,
): Promise<YieldTallies> {
  const [counts] = await ws.tx
    .select({
      ...COUNT_COLUMNS,
      first: sql<string | Date | null>`min(${submissions.submittedAt})`,
      last: sql<string | Date | null>`max(${submissions.submittedAt})`,
      medianSeconds: sql<
        number | null
      >`percentile_cont(0.5) within group (order by extract(epoch from (${submissions.verdictAt} - ${submissions.submittedAt}))) filter (where ${DECIDED})`,
      p90Seconds: sql<
        number | null
      >`percentile_cont(0.9) within group (order by extract(epoch from (${submissions.verdictAt} - ${submissions.submittedAt}))) filter (where ${DECIDED})`,
    })
    .from(submissions)
    .innerJoin(endpoints, endpointJoin(ws))
    .where(ws.where(submissions, ...conditions));

  const moneyRows = await ws.tx
    .select({
      key: sql<string | null>`null::text`,
      currency: submissions.verdictCurrency,
      total: sql<string | null>`sum(${submissions.verdictValue})`,
      largest: sql<string | null>`max(${submissions.verdictValue})`,
      rows: sql<number>`count(*)::int`,
    })
    .from(submissions)
    .innerJoin(endpoints, endpointJoin(ws))
    .where(ws.where(submissions, ...conditions, WON_WITH_VALUE))
    .groupBy(submissions.verdictCurrency);

  const medianDays = toDays(counts?.medianSeconds ?? null);
  const p90Days = toDays(counts?.p90Seconds ?? null);

  // The censored ones: still open, and already older than this workspace
  // usually takes to decide. A window that is 60% open because it is three days
  // old is fine; one that is 60% open because nobody dispositioned the leads is
  // not, and only this number separates them.
  let awaitingOlderThanMedian = 0;
  if (medianDays !== null && (counts?.awaiting ?? 0) > 0) {
    const now = query.now ?? new Date();
    const cutoff = new Date(now.getTime() - medianDays * SECONDS_PER_DAY * 1000);
    const [row] = await ws.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .innerJoin(endpoints, endpointJoin(ws))
      .where(
        ws.where(
          submissions,
          ...conditions,
          eq(submissions.verdict, "awaiting"),
          lt(submissions.submittedAt, cutoff),
        ),
      );
    awaitingOlderThanMedian = row?.count ?? 0;
  }

  return talliesFrom(
    {
      submissions: counts?.submissions ?? 0,
      won: counts?.won ?? 0,
      lost: counts?.lost ?? 0,
      disqualified: counts?.disqualified ?? 0,
      awaiting: counts?.awaiting ?? 0,
      wonWithoutValue: counts?.wonWithoutValue ?? 0,
      first: counts?.first ?? null,
      last: counts?.last ?? null,
    },
    moneyRows,
    query.visitors ?? null,
    {
      medianDaysToVerdict: medianDays,
      p90DaysToVerdict: p90Days,
      awaitingOlderThanMedian,
    },
  );
}

/** A submission with a real outcome and a usable timestamp for it. */
const DECIDED: SQL = sql`${submissions.verdict} <> 'awaiting' and ${submissions.verdictAt} is not null and ${submissions.verdictAt} >= ${submissions.submittedAt}`;

type CountRow = {
  submissions: number;
  won: number;
  lost: number;
  disqualified: number;
  awaiting: number;
  wonWithoutValue: number;
  first?: string | Date | null;
  last?: string | Date | null;
};

type MoneyRow = {
  currency: string | null;
  total: string | null;
  largest: string | null;
  rows: number;
};

function talliesFrom(
  counts: CountRow,
  money: MoneyRow[],
  visitors: number | null,
  timing: YieldTallies["timing"],
): YieldTallies {
  const totals: CurrencyTotal[] = [];
  let unreadable = false;

  for (const row of money) {
    const totalCents = centsFromNumeric(row.total);
    const largestCents = centsFromNumeric(row.largest);
    if (totalCents === null) {
      // Postgres summed a `numeric` and we could not read it back. This should
      // be impossible; if it ever happens the report says so rather than
      // silently reporting a smaller number than the truth.
      unreadable = true;
      continue;
    }
    totals.push({
      currency: row.currency,
      totalCents,
      wonWithValue: row.rows,
      largestCents: largestCents ?? 0n,
    });
  }

  // Biggest total first, so the currency a workspace actually trades in leads.
  totals.sort((a, b) => (b.totalCents > a.totalCents ? 1 : b.totalCents < a.totalCents ? -1 : 0));

  return {
    submissions: counts.submissions,
    won: counts.won,
    lost: counts.lost,
    disqualified: counts.disqualified,
    awaiting: counts.awaiting,
    wonWithoutValue: counts.wonWithoutValue,
    money: totals,
    moneyUnreadable: unreadable,
    visitors,
    firstSubmissionAt: toDate(counts.first ?? null),
    lastSubmissionAt: toDate(counts.last ?? null),
    timing,
  };
}

// ---------------------------------------------------------------------------
// Scope, filters and dimensions
// ---------------------------------------------------------------------------

function windowConditions(query: YieldQuery): (SQL | undefined)[] {
  const conditions: (SQL | undefined)[] = [];
  if (query.endpointPublicId) {
    conditions.push(eq(endpoints.publicId, query.endpointPublicId));
  }
  if (query.from) conditions.push(gte(submissions.submittedAt, query.from));
  if (query.to) conditions.push(lt(submissions.submittedAt, query.to));
  return conditions;
}

/**
 * The join every query here shares.
 *
 * Deliberately not filtered on `endpoints.deleted_at`: an archived endpoint's
 * submissions are still submissions that happened, and dropping them would move
 * a revenue number for a housekeeping reason.
 */
function endpointJoin(ws: WorkspaceScope): SQL {
  return and(
    eq(submissions.endpointId, endpoints.id),
    eq(endpoints.workspaceId, ws.workspaceId),
  ) as SQL;
}

async function resolveScope(ws: WorkspaceScope, query: YieldQuery): Promise<YieldScope> {
  const scope: YieldScope = {
    endpointPublicId: query.endpointPublicId ?? null,
    endpointName: null,
    from: query.from ?? null,
    to: query.to ?? null,
  };

  if (!query.endpointPublicId) return scope;

  const [row] = await ws.tx
    .select({ name: endpoints.name })
    .from(endpoints)
    .where(ws.whereIncludingDeleted(endpoints, eq(endpoints.publicId, query.endpointPublicId)))
    .limit(1);

  return { ...scope, endpointName: row?.name ?? null };
}

/** Whitelisted: a dimension is one of these columns and cannot be anything else. */
function dimensionColumn(dimension: YieldDimension): AnyPgColumn {
  switch (dimension) {
    case "endpoint":
      return endpoints.publicId;
    case "origin":
      return submissions.origin;
    case "variant":
      return submissions.variantId;
    case "utm_source":
      return submissions.utmSource;
    case "utm_medium":
      return submissions.utmMedium;
    case "utm_campaign":
      return submissions.utmCampaign;
  }
}

function groupLabel(dimension: YieldDimension, key: string | null, label: string | null): string {
  if (dimension === "endpoint") return label ?? key ?? "Unknown endpoint";
  if (key === null) {
    // Named rather than blank. "Not set" is a real and usually large segment —
    // direct traffic, an email link, anything without a UTM — and hiding it
    // behind an empty cell is how a slice quietly excludes half the leads.
    return dimension === "variant" ? "No variant" : "Not set";
  }
  return key;
}

/**
 * An aggregate's value, as a Date.
 *
 * `min()` and `max()` arrive through a raw SQL fragment, so Drizzle's column
 * mapper never sees them and the driver decides what comes back. Same helper,
 * same reasoning, as `src/lib/workspaces/endpoints.ts`.
 */
function toDate(value: string | Date | null): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDays(seconds: number | null): number | null {
  if (seconds === null || seconds === undefined) return null;
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return null;
  return value / SECONDS_PER_DAY;
}
