import { and, eq, sql } from "drizzle-orm";

import { unsafeDb } from "../../db/client.ts";
import { newId, newSubmissionPublicId } from "../../db/ids.ts";
import { withWorkspace } from "../../db/scoped.ts";
import { endpoints, formSchemas, submissions } from "../../db/schema.ts";
import type { OriginReason, OriginState } from "../origin/types.ts";
import type { SpamReason } from "../spam/types.ts";
import { readStoredDocument, type FormSchemaDocument } from "../schema/format.ts";
import { insertUploads } from "../uploads/store.ts";
import type { PendingUpload } from "../uploads/types.ts";
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

/** The schema in force for an endpoint, already parsed. */
export type ActiveSchema = {
  id: string;
  mode: "warn" | "strict";
  /**
   * Null when the stored row cannot be read by this build. The submission is
   * still accepted and still stamped with the version id — a schema we cannot
   * parse is our problem, and it must not become a lost lead.
   */
  document: FormSchemaDocument | null;
};

export type ResolvedEndpoint = {
  id: string;
  workspaceId: string;
  publicId: string;
  activeSchemaVersionId: string | null;
  activeSchema: ActiveSchema | null;
};

/**
 * One query, left-joined onto the active schema version.
 *
 * A second round-trip for the schema would be a second round-trip on the
 * hottest path in the product, and the join is on a primary key the endpoint
 * row already points at.
 */
export async function resolveEndpoint(publicId: string): Promise<ResolvedEndpoint> {
  const rows = await unsafeDb
    .select({
      id: endpoints.id,
      workspaceId: endpoints.workspaceId,
      publicId: endpoints.publicId,
      activeSchemaVersionId: endpoints.activeSchemaVersionId,
      deletedAt: endpoints.deletedAt,
      schemaMode: formSchemas.mode,
      schemaFields: formSchemas.fields,
    })
    .from(endpoints)
    .leftJoin(formSchemas, eq(formSchemas.id, endpoints.activeSchemaVersionId))
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

  const activeSchema: ActiveSchema | null =
    row.activeSchemaVersionId === null
      ? null
      : {
          id: row.activeSchemaVersionId,
          mode: row.schemaMode ?? "warn",
          document: readStoredDocument(row.schemaFields),
        };

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    publicId: row.publicId,
    activeSchemaVersionId: row.activeSchemaVersionId,
    activeSchema,
  };
}

export type SubmissionRecord = {
  /**
   * Which Hindsight arm served the form (#45), or null when the submission is
   * not in a test. Stamped once and never rewritten, exactly like
   * `schemaVersionId` above it — a test has to stay readable months later
   * against arms that may since have been superseded.
   */
  variantId: string | null;
  /**
   * The definition this submission arrived under.
   *
   * Normally the endpoint's active version, but a Hindsight arm serving its own
   * form (#45) supplies that arm's version instead — the submission has to stay
   * readable against the form the visitor was actually shown, not the one the
   * endpoint happened to have live.
   */
  schemaVersionId: string | null;
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
  /** Which surface this came through, and how coherently (#30). */
  origin: OriginState;
  /** The signals behind the stamp. "Why is this Unverified?" is read from here. */
  originReasons: OriginReason[];
  /**
   * Spam scoring (#31). A third axis, kept apart from both `origin` and
   * `verdict` — see `src/lib/spam/types.ts` for why neither could carry it.
   *
   * `spamState` is only ever `clear` or `flagged` here. The other two states in
   * the column, `not_spam` and `confirmed_spam`, are human decisions and are
   * written by `src/actions/spam.ts`, never by ingest.
   */
  spamState: "clear" | "flagged";
  spamScore: number;
  /** Every signal consulted, including the ones that scored nothing. */
  spamReasons: SpamReason[];
  /**
   * The file parts this submission carried (#66), already read and hashed.
   *
   * They are written **inside the same transaction as the row below**, which is
   * the whole reason they are a parameter here rather than a separate call the
   * handler makes afterwards. A separate call has a window in which the
   * submission exists and the attachment does not, and a submission that claims
   * a file it does not have is the failure this feature was built to remove.
   */
  uploads: PendingUpload[];
  /** When those files are swept, or null when this deployment keeps them. */
  uploadsExpireAt: Date | null;
};

export type StoredSubmission = {
  /** The internal primary key. Only the partial link (#37) reads it. */
  id: string;
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
 * `origin` and `origin_reasons` arrive already decided — `src/lib/origin`
 * answers from the request, before the payload is looked at, and this function
 * only writes down what it said.
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
        // Stamped, never rewritten. Reading a submission against the exact
        // schema in force when it arrived is what this column is for, and it
        // is also what lets the issues on a submission be re-derived later
        // instead of frozen into a column that could disagree with the values
        // beside it.
        schemaVersionId: record.schemaVersionId,
        // Stamped, never rewritten, for the same reason as the line above. This
        // is the only place a submission is attributed to a split test arm, and
        // nothing recomputes it afterwards.
        variantId: record.variantId,
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
        origin: record.origin,
        originReasons: record.originReasons,
        // Written down, never acted on. Nothing downstream of this insert reads
        // spam_state to decide whether to keep, deliver or count the row.
        spamState: record.spamState,
        spamScore: record.spamScore,
        spamReasons: record.spamReasons,
      })
      .onConflictDoNothing({
        target: [submissions.endpointId, submissions.idempotencyKey],
        where: sql`${submissions.idempotencyKey} is not null`,
      })
      .returning({
        id: submissions.id,
        publicId: submissions.publicId,
        submittedAt: submissions.submittedAt,
      });

    const row = inserted[0];
    if (row) {
      // Same transaction, deliberately. If this throws — a constraint, a
      // disconnect, a disk that is full — the insert above is rolled back with
      // it, `handleSubmission` answers with an error, and there is no row
      // anywhere claiming an attachment that was never written. The submitter
      // is told, which is the entire point.
      //
      // Only on the freshly inserted branch: a collapsed duplicate's files were
      // written by the original request and re-inserting them would be a second
      // copy of the same bytes under new ids.
      await insertUploads(ws, {
        endpointId: endpoint.id,
        submissionId: row.id,
        uploads: record.uploads,
        expiresAt: record.uploadsExpireAt,
      });

      return {
        id: row.id,
        publicId: row.publicId,
        submittedAt: row.submittedAt,
        duplicate: false,
      };
    }

    const existing = await ws.tx
      .select({
        id: submissions.id,
        publicId: submissions.publicId,
        submittedAt: submissions.submittedAt,
      })
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
      return {
        id: prior.id,
        publicId: prior.publicId,
        submittedAt: prior.submittedAt,
        duplicate: true,
      };
    }

    // The only way here is a conflict with a row that has since been soft
    // deleted, so `ws.where` filtered it out. Look again without that filter
    // rather than reporting a failure for a submission that did land.
    const deleted = await ws.tx
      .select({
        id: submissions.id,
        publicId: submissions.publicId,
        submittedAt: submissions.submittedAt,
      })
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
        id: priorDeleted.id,
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
