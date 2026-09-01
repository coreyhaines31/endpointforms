import { and, desc, eq, inArray, isNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm";

// Relative, extension-bearing imports rather than the `@/` alias, matching
// `src/lib/yield/` and `src/db/`. Plain `node` does not resolve the alias, and
// `tests/hindsight-query.test.mts` loads this module directly.
import { withWorkspace, type WorkspaceScope } from "../../db/scoped.ts";
import {
  endpoints,
  splitTestExposures,
  splitTestVariants,
  splitTests,
  submissions,
} from "../../db/schema.ts";
import { measureTimeToOutcomeIn } from "../verdict/latency.ts";
import { MIN_RESOLVED } from "../yield/compute.ts";
import { centsFromNumeric } from "../yield/money.ts";
import type { CurrencyTotal, YieldTallies } from "../yield/types.ts";
import { emptyTallies } from "../yield/compute.ts";
import { computeHindsight } from "./compare.ts";
import type {
  HindsightReport,
  HindsightTiming,
  SplitTestDefinition,
  VariantDefinition,
} from "./types.ts";

/**
 * Reading a Hindsight test out of the database (#45).
 *
 * The arithmetic is in `./compare.ts` and none of it is here — this file turns
 * rows into the `HindsightInput` that function takes, so every awkward case is
 * testable without a database and the SQL is checkable against a real one. Same
 * division, same reasoning, as `src/lib/yield/query.ts`.
 *
 * Three rules, two of them inherited from Yield because a split test is a
 * revenue report with more columns:
 *
 * 1. **Everything runs inside `withWorkspace`**, so the predicate and row-level
 *    security both apply.
 * 2. **Money is summed in Postgres, in `numeric`**, and only becomes a
 *    JavaScript value as `bigint` cents.
 * 3. **A submission belongs to the arm stamped on it, forever.** Nothing here
 *    re-derives which variant a lead came from — `submissions.variant_id` was
 *    written when the form was served and is never rewritten, which is what
 *    makes a test readable months later against arms that have since changed.
 */

const SECONDS_PER_DAY = 86_400;

export type HindsightQuery = {
  /** Evaluated against this instant, so the maturity gate is testable. */
  now?: Date;
};

/** One test, by its public id. Opens its own scoped transaction. */
export async function readSplitTest(
  workspaceId: string,
  testPublicId: string,
  query: HindsightQuery = {},
): Promise<HindsightReport | null> {
  return withWorkspace(workspaceId, (ws) => readSplitTestIn(ws, testPublicId, query));
}

export async function readSplitTestIn(
  ws: WorkspaceScope,
  testPublicId: string,
  query: HindsightQuery = {},
): Promise<HindsightReport | null> {
  const definition = await readDefinition(ws, testPublicId);
  if (definition === null) return null;

  const variantIds = definition.variants.map((variant) => variant.id);
  if (variantIds.length === 0) {
    return computeHindsight({ test: definition, tallies: [], timing: emptyTiming(), now: query.now });
  }

  const scope: SQL = inArray(submissions.variantId, variantIds);

  const [counts, money, exposures, deleted, timing] = await Promise.all([
    readCounts(ws, scope),
    readMoney(ws, scope),
    readExposures(ws, variantIds),
    readDeleted(ws, variantIds),
    readTiming(ws, variantIds, scope, query.now ?? new Date()),
  ]);

  const tallies = definition.variants.map((variant) => ({
    variantId: variant.id,
    tallies: talliesFor(variant.id, counts, money, exposures, deleted),
  }));

  return computeHindsight({ test: definition, tallies, timing, now: query.now });
}

/** Every test on one endpoint, newest first. Definitions only — no tallies. */
export async function listSplitTests(
  workspaceId: string,
  endpointPublicId: string,
): Promise<SplitTestDefinition[]> {
  return withWorkspace(workspaceId, async (ws) => {
    const rows = await ws.tx
      .select({
        id: splitTests.id,
        publicId: splitTests.publicId,
        name: splitTests.name,
        status: splitTests.status,
        startedAt: splitTests.startedAt,
        stoppedAt: splitTests.stoppedAt,
        endpointPublicId: endpoints.publicId,
        endpointName: endpoints.name,
      })
      .from(splitTests)
      .innerJoin(endpoints, endpointJoin(ws))
      .where(ws.where(splitTests, eq(endpoints.publicId, endpointPublicId)))
      .orderBy(desc(splitTests.createdAt));

    if (rows.length === 0) return [];

    const variants = await readVariants(
      ws,
      rows.map((row) => row.id),
    );

    return rows.map((row) => ({
      id: row.id,
      publicId: row.publicId,
      endpointPublicId: row.endpointPublicId,
      endpointName: row.endpointName,
      name: row.name,
      status: row.status,
      startedAt: row.startedAt,
      stoppedAt: row.stoppedAt,
      variants: variants.get(row.id) ?? [],
    }));
  });
}

/**
 * The running test on an endpoint, if there is one.
 *
 * The serving path's only read, and it is on the hottest page in the product,
 * so it is one query against the partial index in `split_tests_running_idx`
 * joined to its arms. A test that is a draft or stopped is not returned — not
 * because it is invisible, but because there is nothing to assign a visitor to.
 */
export async function readRunningTest(
  workspaceId: string,
  endpointId: string,
): Promise<SplitTestDefinition | null> {
  return withWorkspace(workspaceId, async (ws) => {
    const [row] = await ws.tx
      .select({
        id: splitTests.id,
        publicId: splitTests.publicId,
        name: splitTests.name,
        status: splitTests.status,
        startedAt: splitTests.startedAt,
        stoppedAt: splitTests.stoppedAt,
        endpointPublicId: endpoints.publicId,
        endpointName: endpoints.name,
      })
      .from(splitTests)
      .innerJoin(endpoints, endpointJoin(ws))
      .where(
        ws.where(
          splitTests,
          eq(splitTests.endpointId, endpointId),
          eq(splitTests.status, "running"),
        ),
      )
      .limit(1);

    if (!row) return null;

    const variants = await readVariants(ws, [row.id]);
    return {
      id: row.id,
      publicId: row.publicId,
      endpointPublicId: row.endpointPublicId,
      endpointName: row.endpointName,
      name: row.name,
      status: row.status,
      startedAt: row.startedAt,
      stoppedAt: row.stoppedAt,
      variants: variants.get(row.id) ?? [],
    };
  });
}

// ---------------------------------------------------------------------------
// The queries
// ---------------------------------------------------------------------------

async function readDefinition(
  ws: WorkspaceScope,
  testPublicId: string,
): Promise<SplitTestDefinition | null> {
  const [row] = await ws.tx
    .select({
      id: splitTests.id,
      publicId: splitTests.publicId,
      name: splitTests.name,
      status: splitTests.status,
      startedAt: splitTests.startedAt,
      stoppedAt: splitTests.stoppedAt,
      endpointPublicId: endpoints.publicId,
      endpointName: endpoints.name,
    })
    .from(splitTests)
    .innerJoin(endpoints, endpointJoin(ws))
    .where(ws.where(splitTests, eq(splitTests.publicId, testPublicId)))
    .limit(1);

  if (!row) return null;

  const variants = await readVariants(ws, [row.id]);
  return {
    id: row.id,
    publicId: row.publicId,
    endpointPublicId: row.endpointPublicId,
    endpointName: row.endpointName,
    name: row.name,
    status: row.status,
    startedAt: row.startedAt,
    stoppedAt: row.stoppedAt,
    variants: variants.get(row.id) ?? [],
  };
}

/**
 * Arms for a set of tests.
 *
 * Ordered control first, then by name, so the table reads left to right the way
 * a person describes the test out loud: what we were doing, and what we changed.
 */
async function readVariants(
  ws: WorkspaceScope,
  testIds: readonly string[],
): Promise<Map<string, VariantDefinition[]>> {
  const out = new Map<string, VariantDefinition[]>();
  if (testIds.length === 0) return out;

  const rows = await ws.tx
    .select({
      id: splitTestVariants.id,
      testId: splitTestVariants.testId,
      name: splitTestVariants.name,
      isControl: splitTestVariants.isControl,
      weight: splitTestVariants.weight,
      schemaVersionId: splitTestVariants.schemaVersionId,
    })
    .from(splitTestVariants)
    .where(ws.where(splitTestVariants, inArray(splitTestVariants.testId, [...testIds])))
    .orderBy(desc(splitTestVariants.isControl), splitTestVariants.name);

  for (const row of rows) {
    const list = out.get(row.testId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      isControl: row.isControl,
      weight: row.weight,
      schemaVersionId: row.schemaVersionId,
    });
    out.set(row.testId, list);
  }

  return out;
}

/** A won submission that actually carries an amount. Same predicate as Yield's. */
const WON_WITH_VALUE: SQL = sql`${submissions.verdict} = 'won' and ${submissions.verdictValue} is not null`;

type CountRow = {
  variantId: string | null;
  submissions: number;
  won: number;
  lost: number;
  disqualified: number;
  awaiting: number;
  wonWithoutValue: number;
  first: string | Date | null;
  last: string | Date | null;
};

async function readCounts(ws: WorkspaceScope, scope: SQL): Promise<CountRow[]> {
  return ws.tx
    .select({
      variantId: submissions.variantId,
      submissions: sql<number>`count(*)::int`,
      won: sql<number>`(count(*) filter (where ${submissions.verdict} = 'won'))::int`,
      lost: sql<number>`(count(*) filter (where ${submissions.verdict} = 'lost'))::int`,
      disqualified: sql<number>`(count(*) filter (where ${submissions.verdict} = 'disqualified'))::int`,
      awaiting: sql<number>`(count(*) filter (where ${submissions.verdict} = 'awaiting'))::int`,
      wonWithoutValue: sql<number>`(count(*) filter (where ${submissions.verdict} = 'won' and ${submissions.verdictValue} is null))::int`,
      first: sql<string | Date | null>`min(${submissions.submittedAt})`,
      last: sql<string | Date | null>`max(${submissions.submittedAt})`,
    })
    .from(submissions)
    .where(ws.where(submissions, scope))
    .groupBy(submissions.variantId);
}

type MoneyRow = {
  variantId: string | null;
  currency: string | null;
  total: string | null;
  largest: string | null;
  rows: number;
};

async function readMoney(ws: WorkspaceScope, scope: SQL): Promise<MoneyRow[]> {
  return ws.tx
    .select({
      variantId: submissions.variantId,
      currency: submissions.verdictCurrency,
      total: sql<string | null>`sum(${submissions.verdictValue})`,
      largest: sql<string | null>`max(${submissions.verdictValue})`,
      rows: sql<number>`count(*)::int`,
    })
    .from(submissions)
    .where(ws.where(submissions, scope, WON_WITH_VALUE))
    .groupBy(submissions.variantId, submissions.verdictCurrency);
}

/**
 * Exposures per arm, summed over every day the test has run.
 *
 * A `Map<string, number>` with no entry for an arm nothing was recorded for.
 * The absence has to survive as an absence: `talliesFor` turns a missing entry
 * into `visitors: null`, which is what tells `./compare.ts` there is no
 * completion rate rather than that the form was shown to nobody.
 */
async function readExposures(
  ws: WorkspaceScope,
  variantIds: readonly string[],
): Promise<Map<string, number>> {
  const rows = await ws.tx
    .select({
      variantId: splitTestExposures.variantId,
      total: sql<number>`coalesce(sum(${splitTestExposures.count}), 0)::int`,
    })
    .from(splitTestExposures)
    .where(
      ws.where(splitTestExposures, inArray(splitTestExposures.variantId, [...variantIds])),
    )
    .groupBy(splitTestExposures.variantId);

  return new Map(rows.map((row) => [row.variantId, row.total]));
}

/**
 * Soft-deleted submissions per arm.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS QUERY EXISTS, AND WHY IT MATTERS MORE HERE THAN IN YIELD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A Yield rate is wins over every submission that arrived, so **deleting
 * submissions raises it**. `YieldExclusions` exists because that lever is
 * invisible unless counted, and our ICP is agencies showing these numbers to
 * the client paying them — a silently gameable denominator is not a customer
 * fooling themselves, it is a tool for presenting a better number to someone
 * else with our name on it.
 *
 * Here it is worse, because here it changes a **ranking**. Deleting forty junk
 * submissions from one arm does not merely flatter a number, it can flip which
 * variant this panel says to ship. `readYieldByDimension` declines to measure
 * exclusions per slice and reports `null` for them, which is honest for a
 * breakdown nobody acts on. It would not be honest for a comparison somebody
 * ships a form on the strength of, so Hindsight pays for the extra query.
 *
 * Deletion stays allowed and the arithmetic is unchanged. It just cannot happen
 * quietly: an arm whose rate moved because rows were removed says so, in a
 * sentence, beside its rate.
 */
async function readDeleted(
  ws: WorkspaceScope,
  variantIds: readonly string[],
): Promise<Map<string, number>> {
  const rows = await ws.tx
    .select({
      variantId: submissions.variantId,
      count: sql<number>`count(*)::int`,
    })
    .from(submissions)
    // Includes soft-deleted rows on purpose: they are the thing being counted.
    .where(
      ws.whereIncludingDeleted(
        submissions,
        inArray(submissions.variantId, [...variantIds]),
        sql`${submissions.deletedAt} is not null`,
      ),
    )
    .groupBy(submissions.variantId);

  return new Map(
    rows.flatMap((row) => (row.variantId === null ? [] : [[row.variantId, row.count] as const])),
  );
}

/**
 * How long outcomes take, and how much of this test is overdue rather than
 * merely pending.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MEDIAN COMES FROM THE WORKSPACE, NOT FROM THE TEST. THIS MATTERS.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The obvious implementation measures the median over the test's own decided
 * submissions, and it is worthless — provably so. No submission can have taken
 * longer to decide than the test has been running, so a median measured that
 * way is **always** less than or equal to the test's age, and the maturity gate
 * `runningDays < medianDaysToVerdict` can never fire. A five-day-old test in a
 * business with a six-week sales cycle would report a median of two days,
 * because two days is as long as anything in it has had, and would then declare
 * itself old enough to read. That is the exact failure the gate exists to
 * prevent, dressed up as the gate.
 *
 * So the median is the **workspace's** disposition lag, measured by
 * `measureTimeToOutcomeIn` over its default 180-day window — the same function
 * `/tools/time-to-outcome-calculator` renders for a stranger, on the same
 * inputs. How long this business takes to decide a lead is a property of the
 * business, not of one experiment inside it, and only the wider measurement can
 * see a six-week cycle from inside a five-day test.
 *
 * `awaitingOlderThanMedian` stays scoped to the test, because "how many of
 * *these* leads are overdue" is a question about this test — it is just judged
 * against the workspace's clock rather than against its own.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND THE TEST'S OWN SUBMISSIONS ARE EXCLUDED FROM IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Taking the median over the whole workspace is not enough on its own, because
 * the test's submissions are *in* the workspace. A test big enough to dominate
 * its own workspace — which is the normal shape of a workspace whose main form
 * is being tested — would set the median it is then judged against, and the
 * age-bounded self-measurement above comes straight back in through the side
 * door. So the measurement excludes every submission stamped with one of this
 * test's variants. The test does not grade its own homework.
 *
 * When there is not enough evidence left after that exclusion, the median is
 * reported as null rather than as a number computed from three leads, and the
 * gate that uses it is simply skipped. That is the right outcome and not a
 * gap: with no external evidence about the sales cycle, the half-decided gate
 * is what protects the comparison, and it is the stronger of the two anyway —
 * the fast-tail bias comes entirely from *unresolved* leads, so a fully decided
 * cohort has no fast tail to be misled by.
 */
async function readTiming(
  ws: WorkspaceScope,
  variantIds: readonly string[],
  scope: SQL,
  now: Date,
): Promise<HindsightTiming> {
  const outsideThisTest = or(
    isNull(submissions.variantId),
    notInArray(submissions.variantId, [...variantIds]),
  ) as SQL;

  const workspace = await measureTimeToOutcomeIn(ws, { now, exclude: outsideThisTest });

  // A median over a handful of leads is noise wearing a number's clothes. Same
  // threshold as everywhere else in the product, deliberately.
  const enough = workspace.graded >= MIN_RESOLVED;
  const medianDaysToVerdict = enough ? workspace.medianDays : null;
  const p90DaysToVerdict = enough ? workspace.p90Days : null;

  const [row] = await ws.tx
    .select({
      awaiting: sql<number>`(count(*) filter (where ${submissions.verdict} = 'awaiting'))::int`,
    })
    .from(submissions)
    .where(ws.where(submissions, scope));

  let awaitingOlderThanMedian = 0;
  if (medianDaysToVerdict !== null && (row?.awaiting ?? 0) > 0) {
    const cutoff = new Date(now.getTime() - medianDaysToVerdict * SECONDS_PER_DAY * 1000);
    const [censored] = await ws.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .where(
        ws.where(
          submissions,
          scope,
          eq(submissions.verdict, "awaiting"),
          lt(submissions.submittedAt, cutoff),
        ),
      );
    awaitingOlderThanMedian = censored?.count ?? 0;
  }

  return { medianDaysToVerdict, p90DaysToVerdict, awaitingOlderThanMedian };
}

// ---------------------------------------------------------------------------
// Rows into tallies
// ---------------------------------------------------------------------------

function talliesFor(
  variantId: string,
  counts: CountRow[],
  money: MoneyRow[],
  exposures: Map<string, number>,
  deleted: Map<string, number>,
): YieldTallies {
  const row = counts.find((entry) => entry.variantId === variantId);
  const totals: CurrencyTotal[] = [];
  let unreadable = false;

  for (const entry of money.filter((candidate) => candidate.variantId === variantId)) {
    const totalCents = centsFromNumeric(entry.total);
    if (totalCents === null) {
      // Postgres summed a `numeric` and we could not read it back. Impossible
      // in practice; reported rather than silently making the total smaller.
      unreadable = true;
      continue;
    }
    totals.push({
      currency: entry.currency,
      totalCents,
      wonWithValue: entry.rows,
      largestCents: centsFromNumeric(entry.largest) ?? 0n,
    });
  }

  totals.sort((a, b) => (b.totalCents > a.totalCents ? 1 : b.totalCents < a.totalCents ? -1 : 0));

  return {
    ...emptyTallies(),
    submissions: row?.submissions ?? 0,
    won: row?.won ?? 0,
    lost: row?.lost ?? 0,
    disqualified: row?.disqualified ?? 0,
    awaiting: row?.awaiting ?? 0,
    wonWithoutValue: row?.wonWithoutValue ?? 0,
    money: totals,
    moneyUnreadable: unreadable,
    // Yield reserved `visitors` for exactly this — see the note on
    // `YieldTallies.visitors`. `has()` rather than `?? null`, because a
    // recorded zero and a missing row mean different things and only the
    // missing row may become null.
    visitors: exposures.has(variantId) ? (exposures.get(variantId) ?? 0) : null,
    firstSubmissionAt: toDate(row?.first ?? null),
    lastSubmissionAt: toDate(row?.last ?? null),
    // Measured, unlike `readYieldByDimension`, which reports null here. A
    // deletion moves a Yield rate, and in a comparison it can move which
    // variant this panel says to ship — see `readDeleted`. `outsideWindow` is a
    // truthful zero rather than an unmeasured one: a Hindsight report has no
    // date filter, so every submission stamped with this arm is in scope.
    excluded: { deleted: deleted.get(variantId) ?? 0, outsideWindow: 0 },
  };
}

function emptyTiming(): HindsightTiming {
  return { medianDaysToVerdict: null, p90DaysToVerdict: null, awaitingOlderThanMedian: 0 };
}

/**
 * The join every query here shares.
 *
 * Deliberately not filtered on `endpoints.deleted_at`, matching Yield: an
 * archived endpoint's test is still a test that ran, and hiding it would make a
 * result disappear for a housekeeping reason.
 */
function endpointJoin(ws: WorkspaceScope): SQL {
  return and(
    eq(splitTests.endpointId, endpoints.id),
    eq(endpoints.workspaceId, ws.workspaceId),
  ) as SQL;
}

/** `min()`/`max()` arrive through raw SQL, so the driver decides what comes back. */
function toDate(value: string | Date | null): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

