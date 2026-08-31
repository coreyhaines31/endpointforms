import { desc, eq, inArray } from "drizzle-orm";

import { newId } from "../../db/ids.ts";
import { withWorkspace } from "../../db/scoped.ts";
import { endpoints, formSchemas, submissions } from "../../db/schema.ts";
import type { JsonValue } from "../ingest/body.ts";
import {
  parseSchemaJson,
  readStoredDocument,
  serializeSchemaDocument,
  type FormSchemaDocument,
} from "./format.ts";
import { inferSchema, type InferenceOptions, type InferenceResult } from "./infer.ts";

/**
 * Reading and writing schema versions.
 *
 * Two invariants from `docs/21-data-model.md` are enforced here rather than
 * merely described:
 *
 * 1. **Versions are append-only.** There is no update and no delete in this
 *    file. Changing a schema writes version N+1; a submission stays readable
 *    against the exact definition it arrived under, forever.
 * 2. **The live version is a pointer on the endpoint.** Activating one is a
 *    single `UPDATE endpoints`, so "at most one active version" is true by
 *    construction, and rolling back is the same operation pointed at an older
 *    row.
 *
 * And one from #51 itself: an **inferred** schema cannot be published without a
 * user id. Inference is a guess, and a guess that can activate itself is how an
 * endpoint starts flagging traffic nobody agreed to flag.
 */

export type SchemaMode = "warn" | "strict";
export type SchemaSource = "html_import" | "file" | "inferred" | "builder";

export type PublishSchemaInput = {
  workspaceId: string;
  endpointId: string;
  document: FormSchemaDocument;
  source: SchemaSource;
  /** Defaults to `warn`. Rejecting submissions is always something you opt in to. */
  mode?: SchemaMode;
  createdByUserId?: string | null;
  /** Defaults to true. False writes the version without pointing the endpoint at it. */
  activate?: boolean;
};

export type PublishedSchema = {
  id: string;
  version: number;
  mode: SchemaMode;
  source: SchemaSource;
  active: boolean;
};

export class SchemaStoreError extends Error {
  readonly code: "endpoint_not_found" | "version_not_found" | "confirmation_required";

  constructor(code: SchemaStoreError["code"], message: string) {
    super(message);
    this.name = "SchemaStoreError";
    this.code = code;
  }
}

/** Postgres unique violation. Two publishes racing for the same version number. */
const UNIQUE_VIOLATION = "23505";

export async function publishSchemaVersion(
  input: PublishSchemaInput,
): Promise<PublishedSchema> {
  if (input.source === "inferred" && !input.createdByUserId) {
    // The one hard precondition. `infer.ts` proposes; a person confirms; only
    // then is there a user id to record. Without this the "propose, never
    // auto-apply" rule would be a comment rather than a guarantee.
    throw new SchemaStoreError(
      "confirmation_required",
      "An inferred schema must be confirmed by someone before it can be published; no user was recorded.",
    );
  }

  const mode = input.mode ?? "warn";
  const activate = input.activate ?? true;
  const fields = serializeSchemaDocument(input.document);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await withWorkspace(input.workspaceId, async (ws) => {
        const endpoint = await ws.tx
          .select({ id: endpoints.id })
          .from(endpoints)
          .where(ws.where(endpoints, eq(endpoints.id, input.endpointId)))
          .limit(1);

        if (!endpoint[0]) {
          throw new SchemaStoreError(
            "endpoint_not_found",
            "That endpoint does not exist in this workspace.",
          );
        }

        const latest = await ws.tx
          .select({ version: formSchemas.version })
          .from(formSchemas)
          .where(ws.where(formSchemas, eq(formSchemas.endpointId, input.endpointId)))
          .orderBy(desc(formSchemas.version))
          .limit(1);

        const version = (latest[0]?.version ?? 0) + 1;
        const id = newId();

        await ws.tx.insert(formSchemas).values({
          id,
          workspaceId: input.workspaceId,
          endpointId: input.endpointId,
          version,
          fields,
          mode,
          source: input.source,
          createdByUserId: input.createdByUserId ?? null,
        });

        if (activate) {
          await ws.tx
            .update(endpoints)
            .set({ activeSchemaVersionId: id, updatedAt: new Date() })
            .where(ws.where(endpoints, eq(endpoints.id, input.endpointId)));
        }

        return { id, version, mode, source: input.source, active: activate };
      });
    } catch (error) {
      if (attempt < 2 && isUniqueViolation(error)) continue;
      throw error;
    }
  }

  // Unreachable: the loop either returns or rethrows.
  throw new SchemaStoreError(
    "endpoint_not_found",
    "The schema version could not be written after three attempts.",
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export type SchemaVersion = {
  id: string;
  version: number;
  mode: SchemaMode;
  source: SchemaSource;
  createdAt: Date;
  createdByUserId: string | null;
  /** Null when the stored row could not be read by this build. */
  document: FormSchemaDocument | null;
  active: boolean;
};

export async function listSchemaVersions(
  workspaceId: string,
  endpointId: string,
): Promise<SchemaVersion[]> {
  return withWorkspace(workspaceId, async (ws) => {
    const endpoint = await ws.tx
      .select({ activeSchemaVersionId: endpoints.activeSchemaVersionId })
      .from(endpoints)
      .where(ws.where(endpoints, eq(endpoints.id, endpointId)))
      .limit(1);

    const activeId = endpoint[0]?.activeSchemaVersionId ?? null;

    const rows = await ws.tx
      .select()
      .from(formSchemas)
      .where(ws.where(formSchemas, eq(formSchemas.endpointId, endpointId)))
      .orderBy(desc(formSchemas.version));

    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      mode: row.mode,
      source: row.source,
      createdAt: row.createdAt,
      createdByUserId: row.createdByUserId,
      document: readStoredDocument(row.fields),
      active: row.id === activeId,
    }));
  });
}

/** The schema in force for an endpoint, or null when it has none. */
export async function getActiveSchema(
  workspaceId: string,
  endpointId: string,
): Promise<SchemaVersion | null> {
  const versions = await listSchemaVersions(workspaceId, endpointId);
  return versions.find((version) => version.active) ?? null;
}

/**
 * Points an endpoint at an existing version — activation, or a rollback.
 *
 * Deliberately the same operation for both. Rolling back is not an exceptional
 * path that needs its own code; it is pointing at an older row.
 */
export async function activateSchemaVersion(
  workspaceId: string,
  endpointId: string,
  schemaVersionId: string,
): Promise<void> {
  await withWorkspace(workspaceId, async (ws) => {
    const version = await ws.tx
      .select({ id: formSchemas.id })
      .from(formSchemas)
      .where(
        ws.where(
          formSchemas,
          eq(formSchemas.id, schemaVersionId),
          eq(formSchemas.endpointId, endpointId),
        ),
      )
      .limit(1);

    if (!version[0]) {
      throw new SchemaStoreError(
        "version_not_found",
        "That schema version does not belong to this endpoint.",
      );
    }

    await ws.tx
      .update(endpoints)
      .set({ activeSchemaVersionId: schemaVersionId, updatedAt: new Date() })
      .where(ws.where(endpoints, eq(endpoints.id, endpointId)));
  });
}

/**
 * Removes the schema from an endpoint without deleting a thing.
 *
 * The endpoint goes back to accepting anything, which is #50's behaviour and a
 * perfectly good state — not a broken one. Every version row stays, and every
 * submission keeps pointing at the version it arrived under, so this is
 * reversible and loses no history.
 */
export async function clearActiveSchema(
  workspaceId: string,
  endpointId: string,
): Promise<void> {
  await withWorkspace(workspaceId, async (ws) => {
    await ws.tx
      .update(endpoints)
      .set({ activeSchemaVersionId: null, updatedAt: new Date() })
      .where(ws.where(endpoints, eq(endpoints.id, endpointId)));
  });
}

/** Documents for a set of version ids, for an inbox rendering a page of rows. */
export async function loadSchemaDocuments(
  workspaceId: string,
  schemaVersionIds: readonly string[],
): Promise<Map<string, FormSchemaDocument>> {
  const ids = [...new Set(schemaVersionIds)];
  if (ids.length === 0) return new Map();

  return withWorkspace(workspaceId, async (ws) => {
    const rows = await ws.tx
      .select({ id: formSchemas.id, fields: formSchemas.fields })
      .from(formSchemas)
      .where(ws.where(formSchemas, inArray(formSchemas.id, ids)));

    const out = new Map<string, FormSchemaDocument>();
    for (const row of rows) {
      const document = readStoredDocument(row.fields);
      if (document) out.set(row.id, document);
    }
    return out;
  });
}

export type ProposalOptions = InferenceOptions & {
  /** How many recent submissions to read. */
  limit?: number;
};

/**
 * Proposes a schema from what this endpoint has actually received.
 *
 * Reads and returns. It does not write, and the caller cannot make it write —
 * publishing is a separate, explicitly-confirmed call.
 */
export async function proposeSchemaFromSubmissions(
  workspaceId: string,
  endpointId: string,
  options: ProposalOptions = {},
): Promise<InferenceResult> {
  const limit = options.limit ?? 200;

  const payloads = await withWorkspace(workspaceId, async (ws) => {
    const rows = await ws.tx
      .select({ values: submissions.values })
      .from(submissions)
      .where(
        // `ws.where` already excludes soft-deleted rows.
        ws.where(submissions, eq(submissions.endpointId, endpointId)),
      )
      .orderBy(desc(submissions.createdAt))
      .limit(limit);

    return rows.map((row) => (row.values ?? {}) as Record<string, JsonValue>);
  });

  // Oldest first, so the proposed field order matches the order the form was
  // filled in rather than the order the query happened to return.
  return inferSchema(payloads.reverse(), options);
}

/**
 * The developer-native path (#51, producer two): a JSON file, validated, then
 * applied. Parsing and publishing are separate functions so a CLI can show the
 * errors without a database round-trip; this is the two of them together.
 */
export async function applyDeclaredSchema(input: {
  workspaceId: string;
  endpointId: string;
  json: string;
  mode?: SchemaMode;
  createdByUserId?: string | null;
  activate?: boolean;
}): Promise<{ ok: true; published: PublishedSchema } | { ok: false; errors: string[] }> {
  const parsed = parseSchemaJson(input.json);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const published = await publishSchemaVersion({
    workspaceId: input.workspaceId,
    endpointId: input.endpointId,
    document: parsed.document,
    source: "file",
    mode: input.mode,
    createdByUserId: input.createdByUserId,
    activate: input.activate,
  });

  return { ok: true, published };
}
