import { and, desc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";

// Relative, extension-bearing imports rather than the `@/` alias, matching
// `src/lib/workspaces/` and `src/db/`. Plain `node` does not resolve the alias,
// and the tests load these modules directly.
import { newId, withWorkspace } from "../../db/index.ts";
import {
  deliveryAttempts,
  destinations,
  endpoints,
  submissions,
} from "../../db/schema.ts";
import { redactConfig } from "./config.ts";
import type {
  DeliveryLogRow,
  DeliveryStatus,
  DestinationHealth,
  DestinationKind,
  DestinationListItem,
  PayloadSource,
  RedactedConfig,
} from "./types.ts";

// Re-exported so a server module can keep importing these from where the
// queries are. They are defined in `./types.ts` because that module has no
// runtime imports, and a component naming one must not pull a database
// connection or `node:crypto` in with it.
export type { DeliveryLogRow, DestinationHealth, DestinationListItem, RedactedConfig };

/**
 * Reading and writing destinations and their delivery history.
 *
 * Everything here goes through `withWorkspace()`, so the predicate and the
 * row-level security policies both apply — same rule as `src/lib/workspaces/`.
 * Nothing in this file takes a workspace id from anywhere but a membership
 * check performed by the caller in `src/actions/destinations.ts`.
 *
 * **Nothing here returns a raw config.** Every read path hands back
 * `RedactedConfig`; the one function that returns the real thing is
 * `loadDeliverable`, which is called only by `./dispatch.ts` and named so that
 * a reviewer notices it in a diff. A signing secret that reaches a page has
 * reached a browser, a proxy log and a screenshot.
 */

// ---------------------------------------------------------------------------
// Health (#42)
// ---------------------------------------------------------------------------

/**
 * One failing at all is the banner. Two in a row is "degraded"; three is
 * "failing" and gets said in red. The step exists so a single 502 during
 * somebody's deploy does not paint the screen red — that would train people to
 * ignore it, which is the failure mode that makes an alert worthless.
 */
const DEGRADED_AT = 1;
const FAILING_AT = 3;

function healthState(
  enabled: boolean,
  consecutiveFailures: number,
  lastAttemptAt: Date | null,
): DestinationHealth["state"] {
  if (!enabled) return "paused";
  if (lastAttemptAt === null) return "untested";
  if (consecutiveFailures >= FAILING_AT) return "failing";
  if (consecutiveFailures >= DEGRADED_AT) return "degraded";
  return "healthy";
}

/**
 * The health columns, as one scalar subquery each.
 *
 * A correlated subquery rather than a join-and-group-by, because the outer query
 * lists destinations and a `group by` over a left join would have to repeat
 * every destination column — and because "failures since the last success"
 * cannot be written as a plain aggregate: it needs the last success first.
 *
 * `-infinity` is the identity here: when nothing has ever succeeded, every
 * failure counts.
 */
const healthColumns = {
  consecutiveFailures: sql<number>`(
    select count(*)::int from ${deliveryAttempts} a
    where a.destination_id = ${destinations.id}
      and a.workspace_id = ${destinations.workspaceId}
      and a.status = 'failed'
      and a.created_at > coalesce((
        select max(b.created_at) from ${deliveryAttempts} b
        where b.destination_id = ${destinations.id}
          and b.workspace_id = ${destinations.workspaceId}
          and b.status = 'succeeded'
      ), '-infinity'::timestamptz)
  )`,
  lastSuccessAt: sql<string | Date | null>`(
    select max(a.created_at) from ${deliveryAttempts} a
    where a.destination_id = ${destinations.id}
      and a.workspace_id = ${destinations.workspaceId}
      and a.status = 'succeeded'
  )`,
  lastFailureAt: sql<string | Date | null>`(
    select max(a.created_at) from ${deliveryAttempts} a
    where a.destination_id = ${destinations.id}
      and a.workspace_id = ${destinations.workspaceId}
      and a.status = 'failed'
  )`,
  lastAttemptAt: sql<string | Date | null>`(
    select max(a.created_at) from ${deliveryAttempts} a
    where a.destination_id = ${destinations.id}
      and a.workspace_id = ${destinations.workspaceId}
  )`,
  pendingCount: sql<number>`(
    select count(*)::int from ${deliveryAttempts} a
    where a.destination_id = ${destinations.id}
      and a.workspace_id = ${destinations.workspaceId}
      and a.status = 'pending'
  )`,
  /**
   * Deliveries that stopped and never arrived. The dead-letter queue — not a
   * separate table, a query, and "replay" is the redeliver button acting on one
   * of these.
   *
   * Three conditions, and the two `not exists` clauses are the ones that make
   * the number true rather than merely large:
   *
   * - A failed attempt **whose delivery later succeeded** is not stuck. It is a
   *   502 during someone's deploy that the retry recovered, and counting it
   *   would put a permanent "1 delivery gave up" on a destination that is
   *   working — a number that is wrong in the alarming direction, which is how
   *   an alert gets ignored.
   * - A failed attempt **with a retry still scheduled** on some attempt of the
   *   same delivery is pending, not dead.
   *
   * Counted per **submission**, not per attempt: one submission that failed
   * five times is one lead that did not arrive, not five.
   */
  deadLetterCount: sql<number>`(
    select count(distinct a.submission_id)::int from ${deliveryAttempts} a
    where a.destination_id = ${destinations.id}
      and a.workspace_id = ${destinations.workspaceId}
      and a.status = 'failed'
      and a.next_retry_at is null
      and not exists (
        select 1 from ${deliveryAttempts} s
        where s.destination_id = a.destination_id
          and s.workspace_id = a.workspace_id
          and s.submission_id = a.submission_id
          and s.status = 'succeeded'
      )
      and not exists (
        select 1 from ${deliveryAttempts} p
        where p.destination_id = a.destination_id
          and p.workspace_id = a.workspace_id
          and p.submission_id = a.submission_id
          and p.next_retry_at is not null
      )
  )`,
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every live destination on one endpoint, with its health. Config redacted. */
export async function listDestinations(
  workspaceId: string,
  endpointPublicId: string,
): Promise<DestinationListItem[]> {
  return withWorkspace(workspaceId, async (ws) => {
    const rows = await ws.tx
      .select({
        id: destinations.id,
        kind: destinations.kind,
        name: destinations.name,
        enabled: destinations.enabled,
        createdAt: destinations.createdAt,
        config: destinations.config,
        ...healthColumns,
      })
      .from(destinations)
      .innerJoin(
        endpoints,
        and(
          eq(endpoints.id, destinations.endpointId),
          eq(endpoints.workspaceId, workspaceId),
        ),
      )
      .where(ws.where(destinations, eq(endpoints.publicId, endpointPublicId)))
      .orderBy(desc(destinations.createdAt));

    return rows.map(toListItem);
  });
}

/** One destination, or null when it is not this workspace's. Config redacted. */
export async function getDestination(
  workspaceId: string,
  endpointPublicId: string,
  destinationId: string,
): Promise<DestinationListItem | null> {
  if (!isUuid(destinationId)) return null;

  return withWorkspace(workspaceId, async (ws) => {
    const [row] = await ws.tx
      .select({
        id: destinations.id,
        kind: destinations.kind,
        name: destinations.name,
        enabled: destinations.enabled,
        createdAt: destinations.createdAt,
        config: destinations.config,
        ...healthColumns,
      })
      .from(destinations)
      .innerJoin(
        endpoints,
        and(
          eq(endpoints.id, destinations.endpointId),
          eq(endpoints.workspaceId, workspaceId),
        ),
      )
      .where(
        ws.where(
          destinations,
          eq(destinations.id, destinationId),
          eq(endpoints.publicId, endpointPublicId),
        ),
      )
      .limit(1);

    return row ? toListItem(row) : null;
  });
}

/**
 * The delivery log — every attempt, newest first.
 *
 * Both sides of every exchange, because the schema retains both and #42 is the
 * issue about being able to say *why* something broke. An attempt row without
 * its response is a log line nobody can act on.
 */
export async function listDeliveryAttempts(
  workspaceId: string,
  destinationId: string,
  limit = 50,
): Promise<DeliveryLogRow[]> {
  if (!isUuid(destinationId)) return [];

  return withWorkspace(workspaceId, async (ws) => {
    const rows = await ws.tx
      .select({
        id: deliveryAttempts.id,
        attempt: deliveryAttempts.attempt,
        status: deliveryAttempts.status,
        responseStatus: deliveryAttempts.responseStatus,
        responseBody: deliveryAttempts.responseBody,
        requestBody: deliveryAttempts.requestBody,
        requestHeaders: deliveryAttempts.requestHeaders,
        error: deliveryAttempts.error,
        startedAt: deliveryAttempts.startedAt,
        completedAt: deliveryAttempts.completedAt,
        nextRetryAt: deliveryAttempts.nextRetryAt,
        createdAt: deliveryAttempts.createdAt,
        submissionId: deliveryAttempts.submissionId,
        submissionPublicId: submissions.publicId,
      })
      .from(deliveryAttempts)
      .leftJoin(submissions, eq(submissions.id, deliveryAttempts.submissionId))
      .where(ws.where(deliveryAttempts, eq(deliveryAttempts.destinationId, destinationId)))
      .orderBy(desc(deliveryAttempts.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      ...row,
      requestHeaders: (row.requestHeaders ?? null) as Record<string, unknown> | null,
    }));
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createDestination(
  workspaceId: string,
  endpointPublicId: string,
  input: { kind: DestinationKind; name: string; config: Record<string, unknown> },
): Promise<{ id: string } | null> {
  return withWorkspace(workspaceId, async (ws) => {
    // The endpoint is resolved inside the same scoped transaction, so a public
    // id belonging to another workspace finds nothing rather than being trusted.
    const [endpoint] = await ws.tx
      .select({ id: endpoints.id })
      .from(endpoints)
      .where(ws.whereIncludingDeleted(endpoints, eq(endpoints.publicId, endpointPublicId)))
      .limit(1);
    if (!endpoint) return null;

    const [row] = await ws.tx
      .insert(destinations)
      .values({
        id: newId(),
        workspaceId,
        endpointId: endpoint.id,
        kind: input.kind,
        name: input.name,
        config: input.config,
      })
      .returning({ id: destinations.id });

    return { id: row.id };
  });
}

export async function updateDestination(
  workspaceId: string,
  destinationId: string,
  patch: { name?: string; config?: Record<string, unknown>; enabled?: boolean },
): Promise<boolean> {
  if (!isUuid(destinationId)) return false;

  return withWorkspace(workspaceId, async (ws) => {
    const updated = await ws.tx
      .update(destinations)
      .set({
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.config === undefined ? {} : { config: patch.config }),
        ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        updatedAt: new Date(),
      })
      .where(ws.where(destinations, eq(destinations.id, destinationId)))
      .returning({ id: destinations.id });

    return updated.length > 0;
  });
}

/**
 * Soft delete, as the schema's own comment requires: the delivery history
 * references this row, and a hard delete would cascade away the evidence of what
 * happened — which is exactly the record someone needs when they are working out
 * why a lead never arrived.
 */
export async function deleteDestination(
  workspaceId: string,
  destinationId: string,
): Promise<boolean> {
  if (!isUuid(destinationId)) return false;

  return withWorkspace(workspaceId, async (ws) => {
    const updated = await ws.tx
      .update(destinations)
      .set({ deletedAt: new Date(), enabled: false, updatedAt: new Date() })
      .where(ws.where(destinations, eq(destinations.id, destinationId)))
      .returning({ id: destinations.id });

    return updated.length > 0;
  });
}

/** The raw config for one destination. Rotating a secret has to read the old one. */
export async function rawConfig(
  workspaceId: string,
  destinationId: string,
): Promise<Record<string, unknown> | null> {
  if (!isUuid(destinationId)) return null;

  return withWorkspace(workspaceId, async (ws) => {
    const [row] = await ws.tx
      .select({ config: destinations.config })
      .from(destinations)
      .where(ws.where(destinations, eq(destinations.id, destinationId)))
      .limit(1);

    return row ? ((row.config ?? {}) as Record<string, unknown>) : null;
  });
}

// ---------------------------------------------------------------------------
// What the delivery engine loads
// ---------------------------------------------------------------------------

export type Deliverable = {
  destinationId: string;
  kind: DestinationKind;
  name: string;
  /** **Includes secrets.** Only `./dispatch.ts` sees this. */
  config: Record<string, unknown>;
};

export type DeliveryJob = {
  submissionId: string;
  source: PayloadSource;
  destinations: Deliverable[];
};

/**
 * Everything needed to deliver one submission everywhere it goes, in one query
 * pair.
 *
 * Called from `after()`, off the response path, so a second round trip would
 * cost the visitor nothing — but it runs once per submission on every endpoint
 * in the product, and two queries is already the floor.
 */
export async function loadDeliveryJob(
  workspaceId: string,
  submissionPublicId: string,
  options: { destinationId?: string; includeDisabled?: boolean } = {},
): Promise<DeliveryJob | null> {
  return withWorkspace(workspaceId, async (ws) => {
    const [row] = await ws.tx
      .select({
        id: submissions.id,
        publicId: submissions.publicId,
        submittedAt: submissions.submittedAt,
        origin: submissions.origin,
        originReasons: submissions.originReasons,
        verdict: submissions.verdict,
        verdictValue: submissions.verdictValue,
        verdictCurrency: submissions.verdictCurrency,
        values: submissions.values,
        utmSource: submissions.utmSource,
        utmMedium: submissions.utmMedium,
        utmCampaign: submissions.utmCampaign,
        utmTerm: submissions.utmTerm,
        utmContent: submissions.utmContent,
        clickIds: submissions.clickIds,
        referrer: submissions.referrer,
        schemaVersionId: submissions.schemaVersionId,
        endpointId: submissions.endpointId,
        endpointPublicId: endpoints.publicId,
        endpointName: endpoints.name,
      })
      .from(submissions)
      .innerJoin(
        endpoints,
        and(
          eq(endpoints.id, submissions.endpointId),
          eq(endpoints.workspaceId, workspaceId),
        ),
      )
      .where(ws.where(submissions, eq(submissions.publicId, submissionPublicId)))
      .limit(1);

    if (!row) return null;

    const targets = await ws.tx
      .select({
        destinationId: destinations.id,
        kind: destinations.kind,
        name: destinations.name,
        config: destinations.config,
        enabled: destinations.enabled,
      })
      .from(destinations)
      .where(
        ws.where(
          destinations,
          eq(destinations.endpointId, row.endpointId),
          options.destinationId ? eq(destinations.id, options.destinationId) : undefined,
        ),
      );

    return {
      submissionId: row.id,
      source: {
        endpointPublicId: row.endpointPublicId,
        endpointName: row.endpointName,
        submissionPublicId: row.publicId,
        submittedAt: row.submittedAt,
        origin: row.origin,
        originReasons: (row.originReasons ?? []) as PayloadSource["originReasons"],
        verdict: row.verdict,
        verdictValue: row.verdictValue,
        verdictCurrency: row.verdictCurrency,
        values: (row.values ?? {}) as Record<string, unknown>,
        utmSource: row.utmSource,
        utmMedium: row.utmMedium,
        utmCampaign: row.utmCampaign,
        utmTerm: row.utmTerm,
        utmContent: row.utmContent,
        clickIds: (row.clickIds ?? {}) as Record<string, unknown>,
        referrer: row.referrer,
        schemaVersionId: row.schemaVersionId,
      },
      destinations: targets
        .filter((target) => options.includeDisabled === true || target.enabled)
        .map((target) => ({
          destinationId: target.destinationId,
          kind: target.kind,
          name: target.name,
          config: (target.config ?? {}) as Record<string, unknown>,
        })),
    };
  });
}

// ---------------------------------------------------------------------------
// Attempt rows
// ---------------------------------------------------------------------------

export type AttemptRecord = {
  destinationId: string;
  submissionId: string;
  attempt: number;
  status: DeliveryStatus;
  requestBody: string | null;
  requestHeaders: Record<string, string> | null;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  startedAt: Date;
  completedAt: Date;
  nextRetryAt: Date | null;
};

/**
 * Appends one attempt. Never updates a previous one.
 *
 * The schema's comment on `attempt` is explicit — *"retries append rows; they
 * never overwrite the failed one"* — and it is the reason the delivery log can
 * answer "it was failing for two days and then started working" instead of only
 * "it works now".
 */
export async function recordAttempt(
  workspaceId: string,
  record: AttemptRecord,
): Promise<void> {
  await withWorkspace(workspaceId, async (ws) => {
    await ws.tx.insert(deliveryAttempts).values({
      id: newId(),
      workspaceId,
      destinationId: record.destinationId,
      submissionId: record.submissionId,
      attempt: record.attempt,
      status: record.status,
      requestBody: record.requestBody,
      requestHeaders: record.requestHeaders,
      responseStatus: record.responseStatus,
      responseBody: record.responseBody,
      error: record.error,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      nextRetryAt: record.nextRetryAt,
    });
  });
}

/** The highest attempt number so far for one (destination, submission) pair. */
export async function lastAttemptNumber(
  workspaceId: string,
  destinationId: string,
  submissionId: string,
): Promise<number> {
  return withWorkspace(workspaceId, async (ws) => {
    const [row] = await ws.tx
      .select({ highest: sql<number>`coalesce(max(${deliveryAttempts.attempt}), 0)::int` })
      .from(deliveryAttempts)
      .where(
        ws.where(
          deliveryAttempts,
          eq(deliveryAttempts.destinationId, destinationId),
          eq(deliveryAttempts.submissionId, submissionId),
        ),
      );

    return row?.highest ?? 0;
  });
}

export type DueRetry = {
  attemptId: string;
  destinationId: string;
  submissionId: string;
  submissionPublicId: string;
  attempt: number;
};

/**
 * Deliveries whose backoff has elapsed.
 *
 * This is the query the `delivery_attempts_retry_idx` index was built for — the
 * schema calls it "the retry worker's only query", and this is that worker,
 * such as it is. There is no queue in this stack; see `./dispatch.ts` for what
 * actually calls this and what that costs.
 *
 * `nextRetryAt` is cleared on the row we are about to retry, inside the same
 * transaction that reads it, so two concurrent sweeps cannot both pick it up.
 */
export async function claimDueRetries(
  workspaceId: string,
  options: { endpointId?: string; limit?: number; now?: Date } = {},
): Promise<DueRetry[]> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 20;

  return withWorkspace(workspaceId, async (ws) => {
    const due = await ws.tx
      .select({
        attemptId: deliveryAttempts.id,
        destinationId: deliveryAttempts.destinationId,
        submissionId: deliveryAttempts.submissionId,
        submissionPublicId: submissions.publicId,
        attempt: deliveryAttempts.attempt,
      })
      .from(deliveryAttempts)
      .innerJoin(submissions, eq(submissions.id, deliveryAttempts.submissionId))
      .innerJoin(
        destinations,
        and(
          eq(destinations.id, deliveryAttempts.destinationId),
          eq(destinations.workspaceId, workspaceId),
        ),
      )
      .where(
        ws.where(
          deliveryAttempts,
          isNotNull(deliveryAttempts.nextRetryAt),
          // `lte` rather than a `sql` fragment: a raw fragment bypasses
          // Drizzle's column mapper, and postgres.js then refuses the bare
          // `Date` with "the string argument must be of type string". The
          // operator carries the column's timestamp codec with it.
          lte(deliveryAttempts.nextRetryAt, now),
          eq(destinations.enabled, true),
          isNull(destinations.deletedAt),
          options.endpointId ? eq(destinations.endpointId, options.endpointId) : undefined,
        ),
      )
      .orderBy(deliveryAttempts.nextRetryAt)
      .limit(limit);

    if (due.length === 0) return [];

    // Claimed by clearing the schedule. The row keeps its failed status and its
    // bodies — this only stops a second sweep picking the same one up.
    for (const row of due) {
      await ws.tx
        .update(deliveryAttempts)
        .set({ nextRetryAt: null })
        .where(ws.where(deliveryAttempts, eq(deliveryAttempts.id, row.attemptId)));
    }

    return due;
  });
}

// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A destination id arrives from a URL segment, so it is checked before a query. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

type HealthRow = {
  id: string;
  kind: DestinationKind;
  name: string;
  enabled: boolean;
  createdAt: Date;
  config: unknown;
  consecutiveFailures: number;
  lastSuccessAt: string | Date | null;
  lastFailureAt: string | Date | null;
  lastAttemptAt: string | Date | null;
  pendingCount: number;
  deadLetterCount: number;
};

function toListItem(row: HealthRow): DestinationListItem {
  const lastAttemptAt = toDate(row.lastAttemptAt);
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    enabled: row.enabled,
    createdAt: row.createdAt,
    config: redactConfig(row.kind, row.config),
    health: {
      state: healthState(row.enabled, row.consecutiveFailures, lastAttemptAt),
      consecutiveFailures: row.consecutiveFailures,
      lastSuccessAt: toDate(row.lastSuccessAt),
      lastFailureAt: toDate(row.lastFailureAt),
      lastAttemptAt,
      pendingCount: row.pendingCount,
      deadLetterCount: row.deadLetterCount,
    },
  };
}

/**
 * A raw SQL expression's value, as a Date.
 *
 * The health columns are `sql` fragments, so Drizzle's timestamp mapper never
 * runs on them and the driver decides what arrives — sometimes a Date,
 * sometimes text. Both are handled here rather than in a component, for the
 * same reason `src/lib/workspaces/endpoints.ts` does it: a screen must not be
 * one driver upgrade away from `value.toISOString is not a function`.
 */
function toDate(value: string | Date | null): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
