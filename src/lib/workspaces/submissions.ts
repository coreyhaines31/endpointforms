import { desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";

// Relative, extension-bearing imports, matching `./queries.ts` and `src/db/`.
import { withWorkspace } from "../../db/index.ts";
import { deliveryAttempts, destinations, endpoints, submissions } from "../../db/schema.ts";
import type {
  SubmissionDetail,
  SubmissionExportRow,
  SubmissionFilters,
  SubmissionListItem,
  SubmissionPage,
} from "./types.ts";

/**
 * The inbox (#40).
 *
 * Everything here runs inside `withWorkspace()`. The filters are built from
 * query-string values that have already been narrowed to the enum members they
 * claim to be — see `parseSubmissionFilters` below, which is the only thing that
 * turns a `URLSearchParams` into a filter and therefore the only place an
 * unexpected string can be stopped.
 *
 * Pagination is offset-based. A cursor would survive rows arriving mid-scroll,
 * but the inbox is sorted by arrival time descending and new rows land on page
 * one, so the failure a cursor prevents is one this ordering does not have. Page
 * numbers are also linkable, which "load more" is not.
 */

export const PAGE_SIZE = 50;

/** How many rows one export may contain. Beyond this the answer is the API. */
export const EXPORT_LIMIT = 10_000;

const ORIGINS = ["human", "agent", "unverified"] as const;
const VERDICTS = ["won", "lost", "disqualified", "awaiting"] as const;

/**
 * Turns a URL's query string into filters.
 *
 * Anything unrecognised is dropped rather than rejected: a stale bookmark with a
 * filter we have since renamed should show the inbox, not an error page. The
 * enum narrowing here is what keeps an arbitrary string out of a SQL `in (…)`.
 */
export function parseSubmissionFilters(
  params: Record<string, string | string[] | undefined>,
): SubmissionFilters {
  const one = (key: string): string | null => {
    const value = params[key];
    const first = Array.isArray(value) ? value[0] : value;
    const trimmed = (first ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const many = (key: string): string[] => {
    const value = params[key];
    const raw = Array.isArray(value) ? value : value ? [value] : [];
    return raw.flatMap((entry) => entry.split(",")).map((entry) => entry.trim());
  };

  const origin = many("origin").filter((value): value is (typeof ORIGINS)[number] =>
    (ORIGINS as readonly string[]).includes(value),
  );
  const verdict = many("verdict").filter((value): value is (typeof VERDICTS)[number] =>
    (VERDICTS as readonly string[]).includes(value),
  );

  const page = Number.parseInt(one("page") ?? "1", 10);

  return {
    endpointPublicId: one("endpoint"),
    origin,
    verdict,
    from: parseDay(one("from")),
    // `to` is inclusive of the whole day someone typed, so it is stored as the
    // start of the *next* day and compared with `<`. A filter that silently
    // excluded everything submitted after midnight on the end date would look
    // like missing data, which is the one thing this screen must never look like.
    to: parseDay(one("to"), 1),
    q: one("q"),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function parseDay(value: string | null, addDays = 0): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + addDays);
  return date;
}

/** True when the filters would narrow anything. Drives the empty-state wording. */
export function hasActiveFilters(filters: SubmissionFilters): boolean {
  return Boolean(
    filters.endpointPublicId ||
      filters.origin.length > 0 ||
      filters.verdict.length > 0 ||
      filters.from ||
      filters.to ||
      filters.q,
  );
}

/** The filters as a query string, for pagination links and the export URL. */
export function filtersToSearchParams(
  filters: SubmissionFilters,
  overrides: { page?: number } = {},
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.endpointPublicId) params.set("endpoint", filters.endpointPublicId);
  if (filters.origin.length > 0) params.set("origin", filters.origin.join(","));
  if (filters.verdict.length > 0) params.set("verdict", filters.verdict.join(","));
  if (filters.from) params.set("from", filters.from.toISOString().slice(0, 10));
  if (filters.to) {
    // Undo the +1 day `parseDay` applied, so the link round-trips to the same date.
    const inclusive = new Date(filters.to);
    inclusive.setUTCDate(inclusive.getUTCDate() - 1);
    params.set("to", inclusive.toISOString().slice(0, 10));
  }
  if (filters.q) params.set("q", filters.q);

  const page = overrides.page ?? filters.page;
  if (page > 1) params.set("page", String(page));

  return params;
}

/**
 * The predicate every list, count and export share.
 *
 * One function so a filter can never mean one thing in the table and another in
 * the export beside it — "the CSV has different rows than the screen" is the
 * kind of bug that costs the trust the whole product is selling.
 */
function filterConditions(filters: SubmissionFilters): (SQL | undefined)[] {
  const conditions: (SQL | undefined)[] = [];

  if (filters.endpointPublicId) {
    conditions.push(eq(endpoints.publicId, filters.endpointPublicId));
  }
  if (filters.origin.length > 0) {
    conditions.push(inArray(submissions.origin, filters.origin));
  }
  if (filters.verdict.length > 0) {
    conditions.push(inArray(submissions.verdict, filters.verdict));
  }
  if (filters.from) conditions.push(gte(submissions.submittedAt, filters.from));
  if (filters.to) conditions.push(lt(submissions.submittedAt, filters.to));

  if (filters.q) {
    // Across the submitted values and the public ID, which is what someone has
    // in hand when a colleague forwards them "submission sub_…".
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(
      sql`(${submissions.values}::text ilike ${pattern} escape '\\' or ${submissions.publicId} ilike ${pattern} escape '\\')`,
    );
  }

  return conditions;
}

/** `%`, `_` and the escape character itself are literals when someone types them. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

const listColumns = {
  publicId: submissions.publicId,
  endpointPublicId: endpoints.publicId,
  endpointName: endpoints.name,
  submittedAt: submissions.submittedAt,
  origin: submissions.origin,
  verdict: submissions.verdict,
  verdictValue: submissions.verdictValue,
  verdictCurrency: submissions.verdictCurrency,
  values: submissions.values,
  utmSource: submissions.utmSource,
  utmMedium: submissions.utmMedium,
  utmCampaign: submissions.utmCampaign,
  referrer: submissions.referrer,
} as const;

/** One page of the inbox, plus the totals the header needs to say anything useful. */
export async function listSubmissions(
  workspaceId: string,
  filters: SubmissionFilters,
): Promise<SubmissionPage> {
  return withWorkspace(workspaceId, async (ws) => {
    const where = ws.where(submissions, ...filterConditions(filters));
    const offset = (filters.page - 1) * PAGE_SIZE;

    const [rows, [totals]] = await Promise.all([
      ws.tx
        .select(listColumns)
        .from(submissions)
        .innerJoin(endpoints, eq(endpoints.id, submissions.endpointId))
        .where(where)
        .orderBy(desc(submissions.submittedAt), desc(submissions.id))
        .limit(PAGE_SIZE)
        .offset(offset),

      ws.tx
        .select({
          total: sql<number>`count(*)::int`,
          awaiting: sql<number>`(count(*) filter (where ${submissions.verdict} = 'awaiting'))::int`,
        })
        .from(submissions)
        .innerJoin(endpoints, eq(endpoints.id, submissions.endpointId))
        .where(where),
    ]);

    return {
      rows: rows.map(toListItem),
      total: totals?.total ?? 0,
      awaiting: totals?.awaiting ?? 0,
      page: filters.page,
      pageSize: PAGE_SIZE,
    };
  });
}

/** Every matching row, for an export. Same predicate, no page. */
export async function listSubmissionsForExport(
  workspaceId: string,
  filters: SubmissionFilters,
): Promise<SubmissionExportRow[]> {
  return withWorkspace(workspaceId, async (ws) => {
    const rows = await ws.tx
      .select({
        ...listColumns,
        originReasons: submissions.originReasons,
        utmTerm: submissions.utmTerm,
        utmContent: submissions.utmContent,
        clickIds: submissions.clickIds,
        userAgent: submissions.userAgent,
        verdictAt: submissions.verdictAt,
        verdictSource: submissions.verdictSource,
        rawBody: submissions.rawBody,
        rawContentType: submissions.rawContentType,
      })
      .from(submissions)
      .innerJoin(endpoints, eq(endpoints.id, submissions.endpointId))
      .where(ws.where(submissions, ...filterConditions(filters)))
      .orderBy(desc(submissions.submittedAt), desc(submissions.id))
      .limit(EXPORT_LIMIT);

    return rows.map((row) => ({
      ...toListItem(row),
      utmTerm: row.utmTerm,
      utmContent: row.utmContent,
      clickIds: asRecord(row.clickIds),
      userAgent: row.userAgent,
      verdictAt: row.verdictAt,
      verdictSource: row.verdictSource,
      rawBody: row.rawBody,
      rawContentType: row.rawContentType,
      originReasons: asReasons(row.originReasons),
    }));
  });
}

/**
 * One submission, everything about it, and its delivery history.
 *
 * The delivery join is left, and outer on the destination, so an attempt whose
 * destination was later removed still appears. A gap in a delivery log reads as
 * "it was never sent", which is the wrong answer and an expensive one.
 */
export async function getSubmission(
  workspaceId: string,
  publicId: string,
): Promise<SubmissionDetail | null> {
  return withWorkspace(workspaceId, async (ws) => {
    const [row] = await ws.tx
      .select({
        ...listColumns,
        id: submissions.id,
        originReasons: submissions.originReasons,
        utmTerm: submissions.utmTerm,
        utmContent: submissions.utmContent,
        clickIds: submissions.clickIds,
        userAgent: submissions.userAgent,
        ipHash: submissions.ipHash,
        rawBody: submissions.rawBody,
        rawContentType: submissions.rawContentType,
        verdictAt: submissions.verdictAt,
        verdictSource: submissions.verdictSource,
        schemaVersionId: submissions.schemaVersionId,
        idempotencyKey: submissions.idempotencyKey,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .innerJoin(endpoints, eq(endpoints.id, submissions.endpointId))
      .where(ws.where(submissions, eq(submissions.publicId, publicId)))
      .limit(1);

    if (!row) return null;

    const deliveries = await ws.tx
      .select({
        id: deliveryAttempts.id,
        attempt: deliveryAttempts.attempt,
        status: deliveryAttempts.status,
        responseStatus: deliveryAttempts.responseStatus,
        error: deliveryAttempts.error,
        startedAt: deliveryAttempts.startedAt,
        completedAt: deliveryAttempts.completedAt,
        nextRetryAt: deliveryAttempts.nextRetryAt,
        createdAt: deliveryAttempts.createdAt,
        destinationName: destinations.name,
        destinationKind: destinations.kind,
      })
      .from(deliveryAttempts)
      .leftJoin(destinations, eq(destinations.id, deliveryAttempts.destinationId))
      .where(ws.where(deliveryAttempts, eq(deliveryAttempts.submissionId, row.id)))
      .orderBy(desc(deliveryAttempts.createdAt));

    return {
      ...toListItem(row),
      originReasons: asReasons(row.originReasons),
      utmTerm: row.utmTerm,
      utmContent: row.utmContent,
      clickIds: asRecord(row.clickIds),
      userAgent: row.userAgent,
      ipHash: row.ipHash,
      rawBody: row.rawBody,
      rawContentType: row.rawContentType,
      verdictAt: row.verdictAt,
      verdictSource: row.verdictSource,
      schemaVersionId: row.schemaVersionId,
      idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt,
      deliveries,
    };
  });
}

// ---------------------------------------------------------------------------

type ListRow = {
  [K in keyof typeof listColumns]: unknown;
};

/**
 * `jsonb` arrives as `unknown` from the driver, and a row written by an older
 * build may not match today's type. Everything below coerces rather than casts:
 * a submission whose values we cannot read is still a submission, and it must
 * render as an empty object rather than throwing the whole inbox away.
 */
function toListItem(row: ListRow): SubmissionListItem {
  return {
    publicId: String(row.publicId),
    endpointPublicId: String(row.endpointPublicId),
    endpointName: String(row.endpointName),
    submittedAt: row.submittedAt as Date,
    origin: row.origin as SubmissionListItem["origin"],
    verdict: row.verdict as SubmissionListItem["verdict"],
    verdictValue: (row.verdictValue as string | null) ?? null,
    verdictCurrency: (row.verdictCurrency as string | null) ?? null,
    values: asRecord(row.values),
    utmSource: (row.utmSource as string | null) ?? null,
    utmMedium: (row.utmMedium as string | null) ?? null,
    utmCampaign: (row.utmCampaign as string | null) ?? null,
    referrer: (row.referrer as string | null) ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asReasons(value: unknown): SubmissionDetail["originReasons"] {
  return Array.isArray(value) ? (value as SubmissionDetail["originReasons"]) : [];
}

/** Every distinct field name that appears in these rows' values, in first-seen order. */
export function collectValueKeys(rows: { values: Record<string, unknown> }[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.values)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}
