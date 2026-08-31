import { and, eq, sql } from "drizzle-orm";

import { unsafeDb } from "../../db/client.ts";
import { newId, newSubmissionPublicId } from "../../db/ids.ts";
import { withWorkspace } from "../../db/scoped.ts";
import { endpoints, submissions } from "../../db/schema.ts";
import type { JsonValue } from "./body.ts";
import { IngestError } from "./errors.ts";

/**
 * Resolving an endpoint, and writing the submission down.
 *
 * ## The one unscoped query, and why it has to be
 *
 * `withWorkspace()` needs a workspace id, and a submission arrives carrying only
 * a public endpoint id. Resolving one to the other is the same shape of query as
 * the auth layer's "which workspaces does this user belong to?" — it exists
 * precisely to *decide* which workspace we are in, so it cannot already be
 * scoped to one. `src/db/scoped.ts` names this category explicitly.
 *
 * It is kept as narrow as a query can be: one table, one indexed unique column,
 * four fields returned, no customer data. Everything the submission actually
 * touches runs inside `withWorkspace` with row-level security armed.
 *
 * This module lives under `src/lib` rather than `src/app` so the ESLint rule
 * that blocks `unsafeDb` from route code is not weakened for the route itself.
 */

export type ResolvedEndpoint = {
  id: string;
  workspaceId: string;
  publicId: string;
  activeSchemaVersionId: string | null;
};

export async function resolveEndpoint(publicId: string): Promise<ResolvedEndpoint> {
  const rows = await unsafeDb
    .select({
      id: endpoints.id,
      workspaceId: endpoints.workspaceId,
      publicId: endpoints.publicId,
      activeSchemaVersionId: endpoints.activeSchemaVersionId,
      deletedAt: endpoints.deletedAt,
    })
    .from(endpoints)
    .where(eq(endpoints.publicId, publicId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new IngestError(
      "endpoint_not_found",
      "No endpoint with that ID. Check the URL in your form's action attribute.",
    );
  }

  if (row.deletedAt) {
    // 410 rather than 404. Public IDs are unguessable, so there is nothing to
    // hide, and "this endpoint was deleted" is the answer that ends the support
    // thread on the first reply.
    throw new IngestError(
      "endpoint_deleted",
      "This endpoint was deleted and is no longer accepting submissions.",
    );
  }

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    publicId: row.publicId,
    activeSchemaVersionId: row.activeSchemaVersionId,
  };
}

export type SubmissionRecord = {
  values: Record<string, JsonValue>;
  rawBody: string;
  rawContentType: string | null;
  idempotencyKey: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  clickIds: Record<string, string>;
  referrer: string | null;
  userAgent: string | null;
  ipHash: string | null;
  submittedAt: Date;
};

export type StoredSubmission = {
  publicId: string;
  submittedAt: Date;
  /** True when an identical key already had a row, and this one was collapsed onto it. */
  duplicate: boolean;
};

/**
 * Writes the submission, collapsing duplicates in the database rather than in
 * application code.
 *
 * `ON CONFLICT DO NOTHING` against the partial unique index on
 * `(endpoint_id, idempotency_key)` is what makes two simultaneous requests with
 * the same key produce one row. Checking first and inserting second would race:
 * both requests would find nothing and both would insert. Postgres holds the
 * second insert until the first commits, then reports the conflict, and the
 * follow-up select sees the committed row.
 *
 * The index is partial (`where idempotency_key is not null`), so the `where`
 * clause here is required — without it Postgres cannot infer which index the
 * conflict target refers to.
 *
 * `origin` is left at its `unverified` default with no reasons. Deciding
 * provenance is #30, and guessing here would put a stamp on real submissions
 * that the feature has not earned yet.
 */
export async function storeSubmission(
  endpoint: ResolvedEndpoint,
  record: SubmissionRecord,
): Promise<StoredSubmission> {
  return withWorkspace(endpoint.workspaceId, async (ws) => {
    const inserted = await ws.tx
      .insert(submissions)
      .values({
        id: newId(),
        workspaceId: endpoint.workspaceId,
        endpointId: endpoint.id,
        publicId: newSubmissionPublicId(),
        // Stamped, not validated. Reading a submission against the exact schema
        // in force when it arrived is what this column is for; enforcing that
        // schema is #51.
        schemaVersionId: endpoint.activeSchemaVersionId,
        values: record.values,
        rawBody: record.rawBody,
        rawContentType: record.rawContentType,
        submittedAt: record.submittedAt,
        utmSource: record.utmSource,
        utmMedium: record.utmMedium,
        utmCampaign: record.utmCampaign,
        utmTerm: record.utmTerm,
        utmContent: record.utmContent,
        clickIds: record.clickIds,
        referrer: record.referrer,
        userAgent: record.userAgent,
        ipHash: record.ipHash,
        idempotencyKey: record.idempotencyKey,
      })
      .onConflictDoNothing({
        target: [submissions.endpointId, submissions.idempotencyKey],
        where: sql`${submissions.idempotencyKey} is not null`,
      })
      .returning({
        publicId: submissions.publicId,
        submittedAt: submissions.submittedAt,
      });

    const row = inserted[0];
    if (row) {
      return { publicId: row.publicId, submittedAt: row.submittedAt, duplicate: false };
    }

    const existing = await ws.tx
      .select({ publicId: submissions.publicId, submittedAt: submissions.submittedAt })
      .from(submissions)
      .where(
        ws.where(
          submissions,
          eq(submissions.endpointId, endpoint.id),
          eq(submissions.idempotencyKey, record.idempotencyKey),
        ),
      )
      .limit(1);

    const prior = existing[0];
    if (prior) {
      return { publicId: prior.publicId, submittedAt: prior.submittedAt, duplicate: true };
    }

    // The only way here is a conflict with a row that has since been soft
    // deleted, so `ws.where` filtered it out. Look again without that filter
    // rather than reporting a failure for a submission that did land.
    const deleted = await ws.tx
      .select({ publicId: submissions.publicId, submittedAt: submissions.submittedAt })
      .from(submissions)
      .where(
        and(
          eq(submissions.workspaceId, endpoint.workspaceId),
          eq(submissions.endpointId, endpoint.id),
          eq(submissions.idempotencyKey, record.idempotencyKey),
        ),
      )
      .limit(1);

    const priorDeleted = deleted[0];
    if (priorDeleted) {
      return {
        publicId: priorDeleted.publicId,
        submittedAt: priorDeleted.submittedAt,
        duplicate: true,
      };
    }

    throw new IngestError(
      "internal_error",
      "The submission could not be stored. Please retry.",
    );
  });
}
