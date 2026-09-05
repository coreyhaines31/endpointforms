import { createHash } from "node:crypto";

import { newFilePublicId } from "../../db/ids.ts";
import {
  canStoreUploads,
  linkExpiry,
  signDownloadUrl,
  UPLOADS_NOT_CONFIGURED,
} from "../uploads/links.ts";
import {
  allowedTypes,
  isTypeAllowed,
  retentionExpiry,
  uploadLimits,
} from "../uploads/limits.ts";
import { detectContentType, sanitizeFilename } from "../uploads/serve.ts";
import type { PendingUpload, StoredFileRef } from "../uploads/types.ts";
import {
  MAX_BODY_BYTES,
  MAX_FIELD_NAME_CHARS,
  MAX_FIELD_VALUE_CHARS,
  MAX_FIELDS,
  MAX_JSON_DEPTH,
  MAX_JSON_NODES,
  MAX_MULTIPART_RAW_BODY_CHARS,
} from "./limits.ts";
import { IngestError } from "./errors.ts";

/**
 * Reading and parsing the body of a submission.
 *
 * Three encodings are first-class — urlencoded, multipart and JSON — because
 * those are what a browser form, a file-carrying form and a fetch call actually
 * send. Anything else is **sniffed rather than refused**: an endpoint people
 * point existing forms at will be posted to by clients that get the header
 * wrong, and "no content-type" is a broken integration, not a reason to lose
 * the lead.
 *
 * Two things here are load-bearing and easy to miss:
 *
 *   - **NUL and unpaired surrogates are stripped from every string.** Postgres
 *     rejects both in `text` and in `jsonb`. Without this, a payload carrying a
 *     stray NUL byte is not a rejected submission, it is a 500 and a lost lead.
 *     Emoji and ordinary non-Latin text pass through untouched.
 *   - **Field names never reach a prototype.** Every key is set with
 *     `Object.defineProperty`, which stores an own data property instead of
 *     walking the setter that plain assignment would, so a field named
 *     `__proto__` is an ordinary field rather than a mutation.
 *   - **A file part is either stored or refused.** There is no third outcome.
 *     `parseMultipart` reads the bytes, hashes them and hands them to the
 *     transaction that writes the submission; anything that stops it storing a
 *     file — a cap, a type this deployment refuses, an instance that cannot
 *     sign a download link — throws instead, and the submitter is told. The
 *     `stored: false` reference this module used to produce is gone, and the
 *     type system is what keeps it gone (`../uploads/types.ts`).
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ParsedBody = {
  values: Record<string, JsonValue>;
  rawBody: string;
  rawContentType: string | null;
  /** How we ended up parsing it, which is not always what the header claimed. */
  parsedAs: "urlencoded" | "multipart" | "json";
  /**
   * File parts, read and hashed, waiting for the transaction that writes the
   * submission (#66). Empty for every encoding except multipart, and for a
   * multipart post that carried no files.
   *
   * These carry the bytes. Never log this, never put it in an error, never
   * serialise it into a response.
   */
  uploads: PendingUpload[];
};

const REPLACEMENT = "�";
const SUSPECT = /[\u0000\uD800-\uDFFF]/;

/**
 * Removes NUL and repairs unpaired surrogates.
 *
 * Both survive JavaScript happily and are rejected outright by Postgres, so
 * this is the difference between a stored submission and a 500.
 */
export function sanitizeString(input: string): string {
  if (!SUSPECT.test(input)) return input;

  let out = "";
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code === 0) continue;

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += input[i] + input[i + 1];
        i++;
      } else {
        out += REPLACEMENT;
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      out += REPLACEMENT;
      continue;
    }

    out += input[i];
  }
  return out;
}

/**
 * The byte cap for this request, which depends on what it says it is.
 *
 * A `multipart/form-data` post is the only one that can carry a file, so it —
 * and only it — gets the larger allowance. **Sniffed multipart does not**: a
 * body with no `Content-Type` that happens to be multipart is measured at
 * `MAX_BODY_BYTES` like anything else, because the cap has to be decided from
 * the headers before a byte of the body is read, and a client that wants to
 * send 4 MiB can send the header that goes with it.
 */
function bodyCap(request: Request): number {
  const mime = mimeType(request.headers.get("content-type"));
  return mime === "multipart/form-data"
    ? uploadLimits().maxMultipartBodyBytes
    : MAX_BODY_BYTES;
}

/**
 * Reads the body with a hard byte cap, abandoning the stream once it is
 * exceeded rather than buffering the whole thing first. An oversized post costs
 * us one cap's worth of memory and no more.
 */
export async function readBodyCapped(request: Request): Promise<Uint8Array> {
  const cap = bodyCap(request);

  const declared = request.headers.get("content-length");
  if (declared) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > cap) {
      throw tooLarge(cap);
    }
  }

  const body = request.body;
  if (!body) {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > cap) throw tooLarge(cap);
    return new Uint8Array(buffer);
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel().catch(() => {});
        throw tooLarge(cap);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function tooLarge(cap: number): IngestError {
  return new IngestError(
    "payload_too_large",
    `Submission body exceeds the ${cap} byte limit.`,
  );
}

/** `application/json; charset=utf-8` -> `application/json`. */
function mimeType(header: string | null): string {
  if (!header) return "";
  return header.split(";", 1)[0].trim().toLowerCase();
}

export async function parseBody(request: Request, bytes: Uint8Array): Promise<ParsedBody> {
  const header = request.headers.get("content-type");
  const rawContentType = header ? sanitizeString(header).slice(0, 255) : null;

  const text = new TextDecoder("utf-8").decode(bytes);
  const rawBody = sanitizeString(text);

  if (bytes.byteLength === 0 || rawBody.trim() === "") {
    throw new IngestError(
      "empty_body",
      "The submission had an empty body. A form post must contain at least one field.",
    );
  }

  const mime = mimeType(header);

  if (mime === "application/x-www-form-urlencoded") {
    return {
      values: parseUrlEncoded(rawBody),
      rawBody,
      rawContentType,
      parsedAs: "urlencoded",
      uploads: [],
    };
  }

  if (mime === "multipart/form-data") {
    const multipart = await parseMultipart(bytes, header ?? "");
    return {
      values: multipart.values,
      // Truncated rather than verbatim, and only here — see
      // `MAX_MULTIPART_RAW_BODY_CHARS`. The marker is the same one an over-long
      // field value gets, so somebody reading the inbox recognises it.
      rawBody:
        rawBody.length <= MAX_MULTIPART_RAW_BODY_CHARS
          ? rawBody
          : `${rawBody.slice(0, MAX_MULTIPART_RAW_BODY_CHARS)}…[truncated]`,
      rawContentType,
      parsedAs: "multipart",
      uploads: multipart.uploads,
    };
  }

  if (mime === "application/json" || mime.endsWith("+json")) {
    return { values: parseJson(rawBody), rawBody, rawContentType, parsedAs: "json", uploads: [] };
  }

  // No content-type, or one we do not recognise. Sniff rather than refuse: the
  // payload is usually perfectly good and the header is the broken part.
  const trimmed = rawBody.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return { values: parseJson(rawBody), rawBody, rawContentType, parsedAs: "json", uploads: [] };
  }

  // `URLSearchParams` never fails, so "looks like form data" has to mean more
  // than "parsed without error" — a line of prose would otherwise become one
  // field with an empty value. Requiring a `=` is the cheap, correct test.
  if (rawBody.includes("=")) {
    const sniffed = parseUrlEncoded(rawBody);
    if (Object.keys(sniffed).length > 0) {
      return { values: sniffed, rawBody, rawContentType, parsedAs: "urlencoded", uploads: [] };
    }
  }

  throw new IngestError(
    "unsupported_media_type",
    header
      ? `Cannot read a submission sent as ${mime || header}. Use application/x-www-form-urlencoded, multipart/form-data, or application/json.`
      : "The submission had no Content-Type and its body did not look like form data or JSON. Use application/x-www-form-urlencoded, multipart/form-data, or application/json.",
  );
}

function parseUrlEncoded(rawBody: string): Record<string, JsonValue> {
  const collector = new Collector();
  const params = new URLSearchParams(rawBody);
  for (const [key, value] of params) {
    collector.add(key, value);
  }
  return collector.finish();
}

/**
 * File parts are read, hashed, capped — and kept (#66).
 *
 * ## What this used to do, and why that was the bug
 *
 * It described the file and threw the bytes away. The submission row said
 * `stored: false`, the visitor got a thank-you page, and the CV they attached
 * did not exist anywhere. **Nothing about that looked like a failure from the
 * outside**, which is exactly the quiet data loss this product is named
 * against. There is now no code path from a file part to a stored submission
 * that does not also store the bytes:
 *
 *   - Every cap is checked *here*, before a row is written, and a breach throws
 *     an `IngestError` — so the request is refused with a status and a sentence
 *     rather than accepted and quietly reduced.
 *   - The reference this builds is a `StoredFileRef`, whose `stored` field is
 *     the literal `true`. There is no longer a type that can say otherwise.
 *   - The bytes ride out in `uploads` and are inserted **in the same
 *     transaction** as the submission (`../uploads/store.ts`), so a failed file
 *     write rolls the submission back rather than leaving a row pointing at
 *     nothing.
 *
 * ## An unfilled file input is not a file
 *
 * A browser posts `<input type="file">` with an empty filename and zero bytes
 * when nobody chose anything. Storing that would put an empty attachment on
 * every submission from every form with an optional upload. Those parts are
 * skipped. A zero-byte file with a real filename **is** stored — somebody
 * attached it, it is empty, and saying so is the honest answer.
 */
async function parseMultipart(
  bytes: Uint8Array,
  contentType: string,
): Promise<{ values: Record<string, JsonValue>; uploads: PendingUpload[] }> {
  let form: FormData;
  try {
    // The original body has already been consumed by the capped read, so parse
    // from the bytes we kept. Same bytes, same boundary, no second read.
    const replay = new Request("http://ingest.invalid/", {
      method: "POST",
      headers: { "content-type": contentType },
      body: bytes as unknown as BodyInit,
    });
    form = await replay.formData();
  } catch {
    throw new IngestError(
      "malformed_body",
      "The multipart body could not be parsed. Check that the boundary in the Content-Type header matches the body.",
    );
  }

  const limits = uploadLimits();
  const allowList = allowedTypes();
  const now = new Date();
  // One expiry for the whole submission, so two files attached together are
  // swept together rather than a few milliseconds apart.
  const expiresAt = retentionExpiry(now);

  const collector = new Collector();
  const uploads: PendingUpload[] = [];
  let totalBytes = 0;

  for (const [key, value] of form) {
    if (typeof value === "string") {
      collector.add(key, value);
      continue;
    }

    const declaredName = value.name ?? "";
    const declaredSize = value.size ?? 0;
    if (declaredName === "" && declaredSize === 0) continue;

    // Checked before the bytes are read, so a hostile client cannot make us
    // materialise a hundred buffers before we refuse.
    if (uploads.length >= limits.maxFiles) {
      throw new IngestError(
        "too_many_files",
        `This form accepts at most ${limits.maxFiles} attached ${limits.maxFiles === 1 ? "file" : "files"} per submission. Nothing was stored — send it again with fewer.`,
      );
    }

    // Checked before the upload is stored rather than at the download, so a
    // deployment that cannot sign links never accepts a file it could not hand
    // back. See `canStoreUploads`.
    if (!canStoreUploads()) {
      throw new IngestError("uploads_not_configured", UPLOADS_NOT_CONFIGURED);
    }

    const filename = sanitizeFilename(sanitizeString(declaredName));
    const declaredType = sanitizeString(value.type ?? "").slice(0, 255);

    if (!isTypeAllowed(declaredType, allowList)) {
      throw new IngestError(
        "file_type_not_allowed",
        `This form does not accept ${declaredType || "files of that type"} (${filename}). Nothing was stored. Accepted types: ${(allowList ?? []).join(", ")}.`,
      );
    }

    if (declaredSize > limits.maxFileBytes) {
      throw new IngestError("file_too_large", fileTooLarge(filename, limits.maxFileBytes));
    }

    const fileBytes = new Uint8Array(await value.arrayBuffer());

    // `size` on a `File` is metadata; this is the count of bytes we actually
    // hold. Checking both means a lying `size` cannot get a large file past the
    // first check and into storage.
    if (fileBytes.byteLength > limits.maxFileBytes) {
      throw new IngestError("file_too_large", fileTooLarge(filename, limits.maxFileBytes));
    }

    totalBytes += fileBytes.byteLength;
    if (totalBytes > limits.maxTotalBytes) {
      throw new IngestError(
        "file_too_large",
        `The files attached to this submission add up to more than ${megabytes(limits.maxTotalBytes)}. Nothing was stored — send it again with smaller files.`,
      );
    }

    const publicId = newFilePublicId();
    const sha256 = createHash("sha256").update(fileBytes).digest("hex");
    const detectedContentType = detectContentType(fileBytes);

    // Minted now and stored on the row, so it reaches every destination payload
    // without `src/lib/destinations` needing to know files exist. The inbox and
    // the export both ignore it and mint a fresh one; see `StoredFileRef.url`.
    const url = signDownloadUrl(publicId, "delivery", expiresAt, now);
    if (url === null) {
      // Unreachable — `canStoreUploads` above returns false in exactly the case
      // that makes this null. Kept because "unreachable" and "cannot happen"
      // are different claims, and this is the one that must never silently
      // become a reference to a file nobody can fetch.
      throw new IngestError("uploads_not_configured", UPLOADS_NOT_CONFIGURED);
    }

    const ref: StoredFileRef = {
      file: true,
      id: publicId,
      filename,
      contentType: declaredType,
      detectedType: detectedContentType,
      size: fileBytes.byteLength,
      sha256,
      stored: true,
      url,
      urlExpiresAt: linkExpiry("delivery", expiresAt, now).toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };

    uploads.push({
      publicId,
      fieldKey: checkName(sanitizeString(key)),
      filename,
      declaredContentType: declaredType,
      detectedContentType,
      size: fileBytes.byteLength,
      sha256,
      bytes: fileBytes,
    });

    collector.addValue(key, ref as unknown as JsonValue);
  }

  return { values: collector.finish(), uploads };
}

function fileTooLarge(filename: string, cap: number): string {
  return `${filename} is larger than the ${megabytes(cap)} limit for a single file. Nothing was stored — send it again with a smaller file.`;
}

/** `4 MB`, for a message a person reads. Decimal, like a file manager. */
function megabytes(bytes: number): string {
  return `${Math.round(bytes / 100_000) / 10} MB`;
}

function parseJson(rawBody: string): Record<string, JsonValue> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch (error) {
    throw new IngestError(
      "malformed_body",
      `The JSON body could not be parsed: ${error instanceof Error ? error.message : "invalid JSON"}.`,
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new IngestError(
      "malformed_body",
      "A JSON submission must be an object of field names to values.",
    );
  }

  const budget = { nodes: 0 };
  const collector = new Collector();
  for (const key of Object.keys(parsed as Record<string, unknown>)) {
    const value = (parsed as Record<string, unknown>)[key];
    collector.addValue(key, normalizeJson(value, 1, budget));
  }
  return collector.finish();
}

function normalizeJson(value: unknown, depth: number, budget: { nodes: number }): JsonValue {
  if (depth > MAX_JSON_DEPTH) {
    throw new IngestError(
      "malformed_body",
      `The JSON body nests deeper than ${MAX_JSON_DEPTH} levels.`,
    );
  }
  if (++budget.nodes > MAX_JSON_NODES) {
    throw new IngestError(
      "too_many_fields",
      `The JSON body contains more than ${MAX_JSON_NODES} values.`,
    );
  }

  if (value === null) return null;
  if (typeof value === "string") return truncate(sanitizeString(value));
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    // NaN and Infinity cannot survive JSON.stringify into jsonb.
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJson(entry, depth + 1, budget));
  }
  if (typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      defineField(out, checkName(sanitizeString(key)), normalizeJson(
        (value as Record<string, unknown>)[key],
        depth + 1,
        budget,
      ));
    }
    return out;
  }

  // undefined, function, symbol, bigint — not reachable from JSON.parse.
  return null;
}

function truncate(value: string): string {
  if (value.length <= MAX_FIELD_VALUE_CHARS) return value;
  // Never silent: the marker is visible in the inbox, and the untouched
  // original is on the row in `raw_body`.
  return `${value.slice(0, MAX_FIELD_VALUE_CHARS)}…[truncated]`;
}

function checkName(name: string): string {
  if (name.length <= MAX_FIELD_NAME_CHARS) return name;
  throw new IngestError(
    "field_name_too_long",
    `A field name exceeded ${MAX_FIELD_NAME_CHARS} characters.`,
  );
}

/**
 * Sets an own, enumerable property even when the name is `__proto__`.
 *
 * Plain assignment to `__proto__` on a normal object walks the setter on
 * `Object.prototype` and mutates the object instead of storing a field. Null
 * prototypes make that impossible already; `defineProperty` makes it impossible
 * regardless of how this object is later built.
 */
function defineField(target: Record<string, JsonValue>, key: string, value: JsonValue): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * Assembles the values object.
 *
 * Repeated names collapse into an array, which is what a group of checkboxes
 * posts.
 */
class Collector {
  private readonly seen = new Map<string, JsonValue>();
  private count = 0;

  add(key: string, value: string): void {
    this.addValue(key, truncate(sanitizeString(value)));
  }

  addValue(rawKey: string, value: JsonValue): void {
    const key = checkName(sanitizeString(rawKey));

    if (++this.count > MAX_FIELDS) {
      throw new IngestError(
        "too_many_fields",
        `The submission contains more than ${MAX_FIELDS} fields.`,
      );
    }

    const existing = this.seen.get(key);
    if (existing === undefined) {
      this.seen.set(key, value);
      return;
    }
    if (Array.isArray(existing)) {
      existing.push(value);
      return;
    }
    this.seen.set(key, [existing, value]);
  }

  finish(): Record<string, JsonValue> {
    const out: Record<string, JsonValue> = {};
    for (const [key, value] of this.seen) {
      defineField(out, key, value);
    }
    return out;
  }
}
