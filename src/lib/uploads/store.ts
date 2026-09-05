import { and, asc, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";

import { unsafeDb } from "../../db/client.ts";
import { newId } from "../../db/ids.ts";
import { withWorkspace, type WorkspaceScope } from "../../db/scoped.ts";
import { submissionFiles } from "../../db/schema.ts";
import type { PendingUpload } from "./types.ts";

/**
 * Writing the bytes down, and reading them back (#66).
 *
 * ## This is the storage driver, and there is exactly one
 *
 * Everything that touches stored bytes goes through this module: three
 * functions to write, read and sweep. That is the seam. Moving to object
 * storage later means reimplementing these three against a bucket and changing
 * nothing else — and it also means confronting, in one place, the property that
 * made Postgres the choice in the first place.
 *
 * **`insertUploads` takes a transaction it did not open.** It is called from
 * inside `storeSubmission`'s `withWorkspace` block, so the file rows and the
 * submission row are one commit. If the file write fails, the submission is
 * rolled back and the submitter gets an error — there is no state in which we
 * have told somebody their form went through while their attachment did not
 * exist. An object store cannot offer that: it is a second system with its own
 * failure modes, and bridging it needs either a two-phase dance or an orphan
 * reaper, both of which are code that can be wrong. This is code that cannot.
 *
 * ## The one unscoped query, and why it has to be
 *
 * `resolveFileWorkspace` looks a file up by its public id with no workspace, for
 * the same reason `resolveEndpoint` in `../ingest/store.ts` does: a signed
 * download URL carries a public id and nothing else, and the query's whole job
 * is to *decide* which workspace we are in. It is as narrow as a query can be —
 * one table, one unique indexed column, two columns returned, **never the
 * bytes.** The read that actually returns file contents runs inside
 * `withWorkspace` with row-level security armed.
 */

/**
 * Writes one submission's files, inside the caller's transaction.
 *
 * Returns nothing: the references that go into `values` were built before this
 * ran, because they had to be in the row this same transaction is inserting.
 * The ids match because both come from the same `PendingUpload`.
 */
export async function insertUploads(
  ws: WorkspaceScope,
  input: {
    endpointId: string;
    submissionId: string;
    uploads: PendingUpload[];
    expiresAt: Date | null;
  },
): Promise<void> {
  if (input.uploads.length === 0) return;

  await ws.tx.insert(submissionFiles).values(
    input.uploads.map((upload) => ({
      id: newId(),
      workspaceId: ws.workspaceId,
      endpointId: input.endpointId,
      submissionId: input.submissionId,
      publicId: upload.publicId,
      fieldKey: upload.fieldKey,
      filename: upload.filename,
      declaredContentType: upload.declaredContentType,
      detectedContentType: upload.detectedContentType,
      size: upload.size,
      sha256: upload.sha256,
      bytes: upload.bytes,
      expiresAt: input.expiresAt,
    })),
  );
}

/**
 * Which workspace a public file id belongs to. See the module note.
 *
 * Returns null for an id that does not exist, and the caller answers a bad
 * signature and a missing file identically — a signed URL is a capability, and
 * a response that distinguishes "wrong signature" from "no such file" turns the
 * route into an oracle for which ids exist.
 */
async function resolveFileWorkspace(
  publicId: string,
): Promise<{ workspaceId: string; id: string } | null> {
  const rows = await unsafeDb
    .select({ workspaceId: submissionFiles.workspaceId, id: submissionFiles.id })
    .from(submissionFiles)
    .where(eq(submissionFiles.publicId, publicId))
    .limit(1);
  return rows[0] ?? null;
}

export type LoadedFile = {
  filename: string;
  size: number;
  sha256: string;
  bytes: Uint8Array;
};

export type FileLoad =
  | { state: "found"; file: LoadedFile }
  | { state: "missing" }
  /** The row is here; the bytes are not, because retention took them. */
  | { state: "purged"; filename: string; purgedAt: Date };

/** The bytes behind a public id, for a caller that has already checked the signature. */
export async function loadFile(publicId: string): Promise<FileLoad> {
  const located = await resolveFileWorkspace(publicId);
  if (!located) return { state: "missing" };

  return withWorkspace(located.workspaceId, async (ws) => {
    const rows = await ws.tx
      .select({
        filename: submissionFiles.filename,
        size: submissionFiles.size,
        sha256: submissionFiles.sha256,
        bytes: submissionFiles.bytes,
        purgedAt: submissionFiles.purgedAt,
        expiresAt: submissionFiles.expiresAt,
      })
      .from(submissionFiles)
      .where(
        and(
          eq(submissionFiles.workspaceId, located.workspaceId),
          eq(submissionFiles.id, located.id),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return { state: "missing" } as const;

    // Both conditions, not just `purgedAt`: a file whose retention has passed
    // but which the sweep has not reached yet must not be served. The rule is
    // the date, not the sweep's schedule.
    const overdue = row.expiresAt !== null && row.expiresAt.getTime() <= Date.now();
    if (row.bytes === null || row.purgedAt !== null || overdue) {
      return {
        state: "purged",
        filename: row.filename,
        purgedAt: row.purgedAt ?? row.expiresAt ?? new Date(),
      } as const;
    }

    return {
      state: "found",
      file: {
        filename: row.filename,
        size: row.size,
        sha256: row.sha256,
        bytes: row.bytes,
      },
    } as const;
  });
}

/**
 * Retention, applied.
 *
 * **The row survives; only the bytes go.** A deleted attachment that vanished
 * from the inbox would leave a submission that once said "CV.pdf" and now says
 * nothing, which is indistinguishable from us having lost it. Instead the row
 * keeps the name, the size and the hash, gains a `purged_at`, and the screen
 * says which rule removed the bytes and when.
 *
 * Cross-workspace, so it enumerates workspaces with `unsafeDb` and then does
 * the writing inside `withWorkspace` — the same shape as
 * `workspacesWithDeliveryWork` in `../destinations/store.ts`.
 */
export async function purgeExpiredUploads(
  options: { now?: Date; workspaceLimit?: number; perWorkspaceLimit?: number } = {},
): Promise<{ workspaces: number; purged: number; more: boolean }> {
  const now = options.now ?? new Date();
  const workspaceLimit = options.workspaceLimit ?? 100;
  const perWorkspaceLimit = options.perWorkspaceLimit ?? 500;

  const due = await unsafeDb
    .selectDistinct({ workspaceId: submissionFiles.workspaceId })
    .from(submissionFiles)
    .where(
      and(
        isNull(submissionFiles.purgedAt),
        isNotNull(submissionFiles.expiresAt),
        lte(submissionFiles.expiresAt, now),
      ),
    )
    .limit(workspaceLimit + 1);

  const workspaces = due.slice(0, workspaceLimit).map((row) => row.workspaceId);
  let purged = 0;
  let more = due.length > workspaceLimit;

  for (const workspaceId of workspaces) {
    const taken = await withWorkspace(workspaceId, async (ws) => {
      // Selected first, then updated by id. A `limit` inside the `update`
      // itself would need raw SQL, and the two-step is bounded the same way:
      // the batch is whatever this select returned, oldest expiry first, so a
      // workspace with a hundred thousand overdue files is drained over several
      // runs rather than in one statement that holds locks for a minute.
      const overdue = await ws.tx
        .select({ id: submissionFiles.id })
        .from(submissionFiles)
        .where(
          and(
            eq(submissionFiles.workspaceId, workspaceId),
            isNull(submissionFiles.purgedAt),
            isNotNull(submissionFiles.expiresAt),
            lte(submissionFiles.expiresAt, now),
          ),
        )
        .orderBy(asc(submissionFiles.expiresAt))
        .limit(perWorkspaceLimit);

      if (overdue.length === 0) return 0;

      const rows = await ws.tx
        .update(submissionFiles)
        .set({ bytes: null, purgedAt: now })
        .where(
          and(
            eq(submissionFiles.workspaceId, workspaceId),
            isNull(submissionFiles.purgedAt),
            inArray(
              submissionFiles.id,
              overdue.map((row) => row.id),
            ),
          ),
        )
        .returning({ id: submissionFiles.id });
      return rows.length;
    });

    purged += taken;
    if (taken >= perWorkspaceLimit) more = true;
  }

  return { workspaces: workspaces.length, purged, more };
}
