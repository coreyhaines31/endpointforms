/**
 * The caps on an upload, in one place (#66).
 *
 * ## They are numbers with reasons, not round numbers
 *
 * Every value below is pinned to something real — a platform ceiling, a
 * transaction that has to fit in memory, or a bill somebody pays. Where two of
 * them interact, the interaction is stated rather than left to arithmetic.
 *
 * ```
 *   MAX_MULTIPART_BODY_BYTES   4.25 MiB   the whole envelope
 *     └── MAX_FILE_BYTES       4    MiB   one file
 *     └── MAX_UPLOAD_BYTES     4    MiB   all files in one submission
 *         (leaving 256 KiB for the part headers, the boundaries and the
 *          ordinary text fields, which is why the envelope is the larger one)
 * ```
 *
 * **4.25 MiB is 4,456,448 bytes, and Vercel refuses a request body over
 * 4,500,000.** That is the binding constraint on the hosted deployment and the
 * reason the envelope is not a rounder 5 MiB: past that number the platform
 * returns its own `413` before a line of our code runs, so the submitter would
 * see a Vercel error page instead of our sentence explaining what to do. A cap
 * we enforce is a cap we can explain. A self-hoster behind their own proxy has
 * no such ceiling and can raise all of these; see `docs/24` §3.6.
 *
 * **The body is buffered whole**, in memory, before it is parsed — that is what
 * `readBodyCapped` does and it is not new here. Multiplying the cap multiplies
 * the memory a burst of concurrent uploads costs, which is the second reason
 * these are not generous. A résumé is 200 KB and a phone photograph is 3 MB;
 * 4 MiB carries both with room over.
 *
 * ## Why the plain-body cap is untouched
 *
 * `MAX_BODY_BYTES` in `../ingest/limits.ts` still governs urlencoded and JSON
 * posts at 1 MiB. Raising it fleet-wide to make room for files would have
 * quadrupled the memory cost of every ordinary submission — the overwhelming
 * majority — to serve the few that carry one. The larger cap applies **only**
 * when the request declares `multipart/form-data`, which is the only encoding
 * that can carry a file at all.
 *
 * Everything here is read at call time, not at import, so a deployment can set
 * these and a test can change them without reloading modules.
 */

/**
 * A positive integer from the environment, or the default.
 *
 * Deliberately the same shape as `rateLimitConfig` in `../ingest/limits.ts`: a
 * bad value warns and falls back rather than throwing, because a typo in an
 * environment variable must not be the reason an instance will not boot.
 */
function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    console.warn(`[uploads] ${name}=${JSON.stringify(raw)} is not a positive integer; using ${fallback}`);
    return fallback;
  }
  return value;
}

/** Zero is meaningful for retention ("keep forever"), so it needs its own reader. */
function nonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    console.warn(`[uploads] ${name}=${JSON.stringify(raw)} is not a non-negative integer; using ${fallback}`);
    return fallback;
  }
  return value;
}

export type UploadLimits = {
  /** One file. */
  maxFileBytes: number;
  /** Every file in one submission, added up. */
  maxTotalBytes: number;
  /** How many file parts one submission may carry. */
  maxFiles: number;
  /** The whole multipart envelope, files and fields and boundaries together. */
  maxMultipartBodyBytes: number;
};

export function uploadLimits(): UploadLimits {
  return {
    maxFileBytes: positiveInt("UPLOAD_MAX_FILE_BYTES", 4 * 1024 * 1024),
    maxTotalBytes: positiveInt("UPLOAD_MAX_TOTAL_BYTES", 4 * 1024 * 1024),
    // Ten, because a form asking for more attachments than that is asking for a
    // zip file, and because each one costs a row and a hash.
    maxFiles: positiveInt("UPLOAD_MAX_FILES", 10),
    maxMultipartBodyBytes: positiveInt(
      "INGEST_MAX_MULTIPART_BODY_BYTES",
      4 * 1024 * 1024 + 256 * 1024,
    ),
  };
}

/**
 * How long stored bytes are kept, in days. `0` means indefinitely.
 *
 * **Ninety days, and the number is a compromise that is stated rather than
 * hidden.** Files are the most expensive rows in the database and the most
 * sensitive thing in it, so keeping every attachment forever by default is both
 * a bill and a liability. But a résumé somebody wants in March is a résumé they
 * wanted in January, so a short window would be the product deleting a
 * customer's data on their behalf.
 *
 * What makes ninety days defensible rather than arbitrary is that **the
 * submission row never expires and the file's row never disappears.** After the
 * sweep the inbox still lists the attachment, still shows its name, size and
 * SHA-256, and says the date the bytes were removed and the rule that removed
 * them. A customer who needs longer sets `UPLOAD_RETENTION_DAYS=0` and nothing
 * is ever swept.
 */
export function retentionDays(): number {
  return nonNegativeInt("UPLOAD_RETENTION_DAYS", 90);
}

/** The instant a file stored now would be swept, or null when retention is off. */
export function retentionExpiry(now: Date = new Date()): Date | null {
  const days = retentionDays();
  if (days === 0) return null;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * How long a signed download link lasts, by who is going to use it.
 *
 * Three lifetimes because three readers with different needs, and one shared
 * rule: **every one of them is clamped to the file's retention expiry** by
 * `signDownloadUrl`, so no link can outlive the bytes it points at.
 *
 * - `page` — minted fresh on every render of the submission detail screen, so
 *   it only has to survive the click that follows. Short.
 * - `export` — lands in a CSV that somebody opens next week. Long enough to be
 *   useful, short enough that a spreadsheet mailed around does not become a
 *   permanent key to the file. Re-minted on every export, so a stale one is
 *   fixed by downloading the export again.
 * - `delivery` — baked into the payload a webhook receives, which may sit in
 *   their queue over a weekend before anything fetches it.
 */
export const DOWNLOAD_LINK_TTL_MS = {
  page: 15 * 60 * 1000,
  export: 7 * 24 * 60 * 60 * 1000,
  delivery: 7 * 24 * 60 * 60 * 1000,
} as const;

export type DownloadAudience = keyof typeof DOWNLOAD_LINK_TTL_MS;

/**
 * Types the endpoint will accept, when a deployment chooses to restrict them.
 *
 * **Unset by default, which means everything is accepted, and that is the
 * considered position rather than the lazy one.** Refusing by declared MIME
 * type stops approximately no attacker — the type is a string the client
 * chooses — and does reliably stop real people, because browsers disagree about
 * what a `.dwg`, a `.pages` or a `.heic` is and a form that rejects a customer's
 * actual file is a lost lead. The thing that makes a hostile upload harmless is
 * how it is served, not whether it was accepted: downloads leave as
 * `application/octet-stream`, always as an attachment, never inline, from a URL
 * that is not on the app's cookie domain. See `../../app/api/v1/files`.
 *
 * `UPLOAD_ALLOWED_TYPES` exists for the deployment that has a compliance reason
 * to take only PDFs. It is a comma-separated list of MIME types; a trailing
 * `/*` matches a whole family (`image/*`).
 */
export function allowedTypes(): string[] | null {
  const raw = (process.env.UPLOAD_ALLOWED_TYPES ?? "").trim();
  if (raw === "") return null;
  const list = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return list.length > 0 ? list : null;
}

/** True when `contentType` is permitted by the configured allow-list. */
export function isTypeAllowed(contentType: string, list: string[] | null): boolean {
  if (list === null) return true;
  const type = contentType.split(";", 1)[0].trim().toLowerCase();
  return list.some((entry) => {
    if (entry.endsWith("/*")) return type.startsWith(entry.slice(0, -1));
    return entry === type;
  });
}
