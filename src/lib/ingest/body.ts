import {
  MAX_BODY_BYTES,
  MAX_FIELD_NAME_CHARS,
  MAX_FIELD_VALUE_CHARS,
  MAX_FIELDS,
  MAX_JSON_DEPTH,
  MAX_JSON_NODES,
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
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A file part, recorded but not stored. See `parseMultipart`. */
export type FileRef = {
  file: true;
  filename: string;
  contentType: string;
  size: number;
  /** Attachments are a later issue; nothing about the bytes is retained. */
  stored: false;
};

export type ParsedBody = {
  values: Record<string, JsonValue>;
  rawBody: string;
  rawContentType: string | null;
  /** How we ended up parsing it, which is not always what the header claimed. */
  parsedAs: "urlencoded" | "multipart" | "json";
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
 * Reads the body with a hard byte cap, abandoning the stream once it is
 * exceeded rather than buffering the whole thing first. An oversized post costs
 * us `MAX_BODY_BYTES` of memory and no more.
 */
export async function readBodyCapped(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      throw tooLarge();
    }
  }

  const body = request.body;
  if (!body) {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > MAX_BODY_BYTES) throw tooLarge();
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
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw tooLarge();
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

function tooLarge(): IngestError {
  return new IngestError(
    "payload_too_large",
    `Submission body exceeds the ${MAX_BODY_BYTES} byte limit.`,
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
    return { values: parseUrlEncoded(rawBody), rawBody, rawContentType, parsedAs: "urlencoded" };
  }

  if (mime === "multipart/form-data") {
    return {
      values: await parseMultipart(bytes, header ?? ""),
      rawBody,
      rawContentType,
      parsedAs: "multipart",
    };
  }

  if (mime === "application/json" || mime.endsWith("+json")) {
    return { values: parseJson(rawBody), rawBody, rawContentType, parsedAs: "json" };
  }

  // No content-type, or one we do not recognise. Sniff rather than refuse: the
  // payload is usually perfectly good and the header is the broken part.
  const trimmed = rawBody.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return { values: parseJson(rawBody), rawBody, rawContentType, parsedAs: "json" };
  }

  // `URLSearchParams` never fails, so "looks like form data" has to mean more
  // than "parsed without error" — a line of prose would otherwise become one
  // field with an empty value. Requiring a `=` is the cheap, correct test.
  if (rawBody.includes("=")) {
    const sniffed = parseUrlEncoded(rawBody);
    if (Object.keys(sniffed).length > 0) {
      return { values: sniffed, rawBody, rawContentType, parsedAs: "urlencoded" };
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
 * File parts are acknowledged and described, never stored.
 *
 * There is no attachment storage in the data model yet, and inventing one here
 * would be worse than the gap. Recording the filename, type and size means a
 * customer whose form has a file input still gets a complete submission row and
 * can see that something was attached, rather than the field vanishing.
 */
async function parseMultipart(
  bytes: Uint8Array,
  contentType: string,
): Promise<Record<string, JsonValue>> {
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

  const collector = new Collector();
  for (const [key, value] of form) {
    if (typeof value === "string") {
      collector.add(key, value);
      continue;
    }
    const ref: FileRef = {
      file: true,
      filename: sanitizeString(value.name ?? "").slice(0, MAX_FIELD_NAME_CHARS),
      contentType: sanitizeString(value.type ?? "").slice(0, 255),
      size: value.size ?? 0,
      stored: false,
    };
    collector.addValue(key, ref as unknown as JsonValue);
  }
  return collector.finish();
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
