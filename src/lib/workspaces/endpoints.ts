import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

// Relative, extension-bearing imports rather than the `@/` alias, matching
// `./queries.ts` and `src/db/`. Plain `node` does not resolve the alias, and the
// tests that exercise the tenant boundary load these modules directly.
import { newEndpointPublicId, newId, withWorkspace } from "../../db/index.ts";
import { destinations, endpoints, submissions } from "../../db/schema.ts";
import { buildDefaultNotification } from "../destinations/notify.ts";
import type { EndpointDetail, EndpointListItem } from "./types.ts";

/**
 * Endpoint management (#50).
 *
 * Every read and write here goes through `withWorkspace()`, so the predicate and
 * row-level security both apply. Nothing in this file accepts a workspace id
 * from anywhere but a membership check — the callers in `src/actions/endpoints.ts`
 * re-derive it from the slug and the session on every request.
 *
 * Archiving is the soft delete already on the table. It is called *archiving* in
 * the UI on purpose: "I deleted the endpoint and lost the leads" is a support
 * disaster, and the word has to promise what the column actually does. An
 * archived endpoint stops accepting submissions (`resolveEndpoint` returns 410)
 * and keeps every one it already has.
 */

/**
 * The endpoint list, with the two numbers that make it worth looking at.
 *
 * One query with a left join rather than a count per row: an endpoint with no
 * submissions still has to appear, and N+1 on the first screen of the product is
 * the kind of thing that is never fixed later.
 *
 * Archived endpoints are included — `whereIncludingDeleted` — because hiding
 * them is how someone concludes their data is gone. The UI separates them.
 */
export async function listEndpointsWithStats(
  workspaceId: string,
): Promise<EndpointListItem[]> {
  return withWorkspace(workspaceId, async (ws) => {
    const rows = await ws.tx
      .select({
        id: endpoints.id,
        publicId: endpoints.publicId,
        name: endpoints.name,
        createdAt: endpoints.createdAt,
        archivedAt: endpoints.deletedAt,
        hasSchema: sql<boolean>`(${endpoints.activeSchemaVersionId} is not null)`,
        submissionCount: sql<number>`count(${submissions.id})::int`,
        awaitingCount: sql<number>`(count(${submissions.id}) filter (where ${submissions.verdict} = 'awaiting'))::int`,
        // Typed as a string: this is a raw expression, so Drizzle's timestamp
        // mapper does not run on it and the driver's own value comes through.
        // `toDate` below is what makes it a Date on the way out.
        lastSubmissionAt: sql<string | Date | null>`max(${submissions.submittedAt})`,
      })
      .from(endpoints)
      .leftJoin(
        submissions,
        and(
          eq(submissions.endpointId, endpoints.id),
          eq(submissions.workspaceId, workspaceId),
          isNull(submissions.deletedAt),
        ),
      )
      .where(ws.whereIncludingDeleted(endpoints))
      .groupBy(
        endpoints.id,
        endpoints.publicId,
        endpoints.name,
        endpoints.createdAt,
        endpoints.deletedAt,
        endpoints.activeSchemaVersionId,
      )
      .orderBy(asc(endpoints.deletedAt), desc(endpoints.createdAt));

    return rows.map((row) => ({ ...row, lastSubmissionAt: toDate(row.lastSubmissionAt) }));
  });
}

/** One endpoint by its public ID, archived or not, or null when it isn't ours. */
export async function getEndpointByPublicId(
  workspaceId: string,
  publicId: string,
): Promise<EndpointDetail | null> {
  return withWorkspace(workspaceId, async (ws) => {
    const [row] = await ws.tx
      .select({
        id: endpoints.id,
        publicId: endpoints.publicId,
        name: endpoints.name,
        createdAt: endpoints.createdAt,
        archivedAt: endpoints.deletedAt,
        hasSchema: sql<boolean>`(${endpoints.activeSchemaVersionId} is not null)`,
        submissionCount: sql<number>`count(${submissions.id})::int`,
        awaitingCount: sql<number>`(count(${submissions.id}) filter (where ${submissions.verdict} = 'awaiting'))::int`,
        // Typed as a string: this is a raw expression, so Drizzle's timestamp
        // mapper does not run on it and the driver's own value comes through.
        // `toDate` below is what makes it a Date on the way out.
        lastSubmissionAt: sql<string | Date | null>`max(${submissions.submittedAt})`,
      })
      .from(endpoints)
      .leftJoin(
        submissions,
        and(
          eq(submissions.endpointId, endpoints.id),
          eq(submissions.workspaceId, workspaceId),
          isNull(submissions.deletedAt),
        ),
      )
      .where(ws.whereIncludingDeleted(endpoints, eq(endpoints.publicId, publicId)))
      .groupBy(
        endpoints.id,
        endpoints.publicId,
        endpoints.name,
        endpoints.createdAt,
        endpoints.deletedAt,
        endpoints.activeSchemaVersionId,
      )
      .limit(1);

    if (!row) return null;
    return { ...row, lastSubmissionAt: toDate(row.lastSubmissionAt) };
  });
}

/**
 * Creates an endpoint, and the notification it is created with (#64).
 *
 * A customer-chosen ID would be guessable, and a guessable ID on an unauthenticated
 * POST route means anyone can fill a stranger's inbox. `newEndpointPublicId()` is
 * 12 nanoid characters, roughly 72 bits.
 *
 * **`notifyEmail` produces a real destination row, inside this transaction.**
 * The reasoning for the shape is in `../destinations/notify.ts`; the reason it
 * is the *same* transaction is narrower: an endpoint that exists without its
 * notification is precisely the deaf endpoint #65 is about, and a second write
 * after the commit is a second write that can fail. Either both rows exist or
 * neither does.
 *
 * An address that is missing or unusable creates the endpoint without one rather
 * than refusing to create it — a session with no email on it is not a reason
 * somebody cannot have an endpoint, and #65's warning is what covers the gap.
 */
export async function createEndpoint(
  workspaceId: string,
  name: string,
  options: { notifyEmail?: string | null } = {},
): Promise<{ publicId: string; notified: string | null }> {
  return withWorkspace(workspaceId, async (ws) => {
    const [row] = await ws.tx
      .insert(endpoints)
      .values({
        id: newId(),
        workspaceId,
        publicId: newEndpointPublicId(),
        name,
      })
      .returning({ id: endpoints.id, publicId: endpoints.publicId });

    const notification = buildDefaultNotification(options.notifyEmail);
    if (notification !== null) {
      await ws.tx.insert(destinations).values({
        id: newId(),
        workspaceId,
        endpointId: row.id,
        kind: "email",
        name: notification.name,
        config: notification.config,
        defaultNotification: true,
      });
    }

    return {
      publicId: row.publicId,
      notified: notification === null ? null : (options.notifyEmail ?? "").trim(),
    };
  });
}

/** Renames one endpoint by its public ID. False when it is not this workspace's. */
export async function renameEndpointByPublicId(
  workspaceId: string,
  publicId: string,
  name: string,
): Promise<boolean> {
  return withWorkspace(workspaceId, async (ws) => {
    const updated = await ws.tx
      .update(endpoints)
      .set({ name, updatedAt: new Date() })
      .where(ws.whereIncludingDeleted(endpoints, eq(endpoints.publicId, publicId)))
      .returning({ id: endpoints.id });

    return updated.length > 0;
  });
}

/**
 * Archives or restores an endpoint.
 *
 * One function rather than two so the two halves cannot drift — restoring has to
 * clear exactly the column archiving sets, and a separate `restoreEndpoint` that
 * also cleared something else is a bug nobody would look for.
 */
export async function setEndpointArchived(
  workspaceId: string,
  publicId: string,
  archived: boolean,
): Promise<boolean> {
  return withWorkspace(workspaceId, async (ws) => {
    const updated = await ws.tx
      .update(endpoints)
      .set({ deletedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(ws.whereIncludingDeleted(endpoints, eq(endpoints.publicId, publicId)))
      .returning({ id: endpoints.id });

    return updated.length > 0;
  });
}

/**
 * An aggregate's value, as a Date.
 *
 * `max(submitted_at)` reaches us through a raw SQL fragment, which means
 * Drizzle's column mapper never sees it and the driver decides what arrives —
 * sometimes a Date, sometimes the timestamp as text. Both are handled here
 * rather than in the component that renders it, so a screen cannot be one
 * driver upgrade away from `value.toISOString is not a function`.
 */
function toDate(value: string | Date | null): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
