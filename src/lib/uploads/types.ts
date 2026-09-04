/**
 * The shapes an uploaded file takes (#66).
 *
 * **Nothing here imports anything at runtime**, deliberately — the inbox, the
 * export and a Client Component all have to be able to name a file reference,
 * and none of them may pull a database connection or `node:crypto` in to do it.
 * Same rule as `../workspaces/types.ts`.
 *
 * ## The type that no longer exists
 *
 * There used to be a `FileRef` with `stored: false` on it, and a comment saying
 * attachments were a later issue. A submission carrying one looked, from the
 * visitor's side, exactly like a submission that had kept their file. That is
 * the quiet data loss this product is named against, sitting inside the
 * product.
 *
 * It is gone, and its absence is enforced by the type system rather than by
 * remembering: `stored` is the literal `true`, so **there is no value of this
 * type that describes a file we did not keep.** A file part that cannot be
 * stored — over a cap, a type the deployment refuses, a database that will not
 * take it — cannot produce a reference at all. It produces an `IngestError`,
 * and the submitter is told. See `../ingest/body.ts`.
 */

/**
 * A file that is in the database, as it appears in `submissions.values`.
 *
 * This object rides in `values`, which means it reaches the inbox, the export
 * and every destination payload without any of them being taught about files.
 * That is why `url` is on it: a webhook receiver gets a working link with no
 * change to `src/lib/destinations`, and a CSV cell has something a person can
 * click.
 */
export type StoredFileRef = {
  file: true;
  /** Public id. What `/api/v1/files/{id}` names, and what a fresh link is minted from. */
  id: string;
  /** The submitter's filename, sanitised for display. Never used as a path. */
  filename: string;
  /** What the client claimed. Recorded, never trusted, never served back. */
  contentType: string;
  /** What the leading bytes actually look like, or null when nothing matched. */
  detectedType: string | null;
  size: number;
  /** Hex SHA-256 of the stored bytes. */
  sha256: string;
  /** Always `true`. The type has no other value; see the note above. */
  stored: true;
  /**
   * A signed, expiring download URL, minted when the submission was stored.
   *
   * Long-lived by the standards of this file (`DOWNLOAD_LINK_TTL_MS.delivery`)
   * because a webhook receiver may not fetch it for days — and clamped to the
   * file's retention expiry, so it can never point at bytes that have been
   * swept. The inbox and the export both ignore it and mint a fresh one, so
   * what a person clicks is never the stale copy.
   */
  url: string;
  /** When `url` stops working, ISO 8601. */
  urlExpiresAt: string;
  /** When the bytes are swept under the retention rule, or null when kept. */
  expiresAt: string | null;
};

/**
 * A file that has been read and hashed but not yet written down.
 *
 * Exists only between `parseBody` and the insert, and both of those happen
 * inside `handleSubmission`. It carries the bytes, so it must never be logged,
 * serialised into an error, or put on a response.
 */
export type PendingUpload = {
  publicId: string;
  /** The form field it arrived in. */
  fieldKey: string;
  filename: string;
  declaredContentType: string;
  detectedContentType: string | null;
  size: number;
  sha256: string;
  bytes: Uint8Array;
};

/** One file as the inbox reads it back. Never carries the bytes. */
export type SubmissionFileRow = {
  publicId: string;
  fieldKey: string;
  filename: string;
  declaredContentType: string | null;
  detectedContentType: string | null;
  size: number;
  sha256: string;
  /** Null once the retention sweep has taken the bytes. */
  purgedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
};

/**
 * True for a value in `values` that is a stored file.
 *
 * Structural rather than nominal, because `values` comes back out of `jsonb`
 * as plain JSON with no class to check against. Every field is verified —
 * a submitter can post a field whose value is `{"file":true}` and this must not
 * be fooled into rendering a download link for it. The `id` shape is checked
 * too: it is what a URL is built from.
 */
export function isStoredFileRef(value: unknown): value is StoredFileRef {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.file === true &&
    candidate.stored === true &&
    typeof candidate.id === "string" &&
    /^[A-Za-z0-9_-]{1,64}$/.test(candidate.id) &&
    typeof candidate.filename === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.sha256 === "string" &&
    typeof candidate.url === "string"
  );
}

/** Every stored file in a `values` object, in field order, flattening arrays. */
export function collectFileRefs(
  values: Record<string, unknown>,
): { key: string; ref: StoredFileRef }[] {
  const out: { key: string; ref: StoredFileRef }[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (isStoredFileRef(value)) {
      out.push({ key, ref: value });
      continue;
    }
    // A repeated `<input type="file" multiple>` collapses into an array, the
    // same way a checkbox group does.
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (isStoredFileRef(entry)) out.push({ key, ref: entry });
      }
    }
  }
  return out;
}

/** `1.4 MB`. Decimal units, because that is what a file manager shows. */
export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "unknown size";
  if (size < 1000) return `${size} B`;
  const units = ["kB", "MB", "GB"];
  let value = size / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
