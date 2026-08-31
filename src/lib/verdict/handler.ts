import { authenticateRequest, type AuthenticatedWorkspace } from "./auth.ts";
import { applyOutcomes, type ApplyResult, type PendingOutcome, type VerdictSource } from "./apply.ts";
import { clientIp, hashIp } from "../ingest/client.ts";
import { isVerdictError, VerdictError } from "./errors.ts";
import { measureTimeToOutcome, type TimeToOutcomeMeasurement } from "./latency.ts";
import {
  MAX_CSV_BODY_BYTES,
  MAX_JSON_BODY_BYTES,
  MAX_JSON_ROWS,
  MAX_ROWS,
} from "./limits.ts";
import { parseCsv, parseOutcome, VERDICTS, type ParseResult } from "./parse.ts";
import { checkVerdictRateLimit, verdictRateLimitError } from "./rate-limit.ts";

/**
 * `POST /api/v1/verdict` — the outcome webhook (#43).
 *
 * The whole point of this route is that it is one line in someone else's
 * system:
 *
 *     curl -X POST https://…/api/v1/verdict \
 *       -H 'Authorization: Bearer efv1.acme.<signature>' \
 *       -H 'Content-Type: application/json' \
 *       -d '{"submission_id":"fAlO-my_EP2XbtxN","verdict":"won","value":18400,"currency":"USD"}'
 *
 * `docs/01` Risk 3 says our output is a function of someone else's CRM
 * hygiene, and that the mitigation is for this to be *deliberately dumber* than
 * a CRM integration: one POST, an id, a status and a value. Every design choice
 * below follows from that — aliases accepted, assumptions reported rather than
 * refused, a repeat post treated as a no-op, and a CSV accepted on the same URL
 * because plenty of teams live in a spreadsheet and will never build a webhook
 * at all.
 *
 * Plain Web `Request`/`Response` with no Next APIs, like the ingest handler, so
 * `tests/verdict.test.mts` exercises the real thing by calling a function.
 *
 * ## The contract
 *
 * **Auth** — `Authorization: Bearer <key>` (or `X-Api-Key`), one key per
 * workspace, see `./keys.ts`. A key can only reach its own workspace's
 * submissions; another workspace's id is a 404, not a 403.
 *
 * **Single outcome** — `Content-Type: application/json`, an object.
 * `submission_id` (public id or UUID) or `email`; `verdict` (won | lost |
 * disqualified | awaiting); optional `value`, `currency`, `occurred_at`.
 * → `200 {"ok":true,"result":{…}}`
 *
 * **Batch** — the same, as a JSON array or `{"outcomes":[…]}`, up to
 * `MAX_JSON_ROWS`.
 * **Bulk** — `Content-Type: text/csv`, a header row and up to `MAX_ROWS` rows.
 * → `200` when every row applied, `207` when any row failed, with a per-row
 *   `results` array either way. A bad row never fails the file.
 *
 * Errors are `{"ok":false,"error":{"code":…,"message":…}}` and the message
 * always says what to change.
 */

export type VerdictRequestOptions = {
  /** Overrides the recorded `verdict_source`; the content type decides by default. */
  source?: VerdictSource;
  now?: Date;
};

export async function handleVerdict(
  request: Request,
  options: VerdictRequestOptions = {},
): Promise<Response> {
  const now = options.now ?? new Date();

  try {
    if (request.method !== "POST") {
      throw new VerdictError(
        "method_not_allowed",
        `Outcomes are posted, not ${request.method}ed. Send a POST with a JSON body or a CSV.`,
        { allow: "POST, OPTIONS" },
      );
    }

    const ip = hashIp(clientIp(request.headers));

    // Counted before the key is even parsed, so an unauthenticated flood costs
    // one map lookup rather than a database round trip.
    const ipDecision = checkVerdictRateLimit(null, ip);
    if (!ipDecision.allowed) throw verdictRateLimitError(ipDecision);

    const workspace = await authenticateRequest(request);

    const workspaceDecision = checkVerdictRateLimit(workspace.workspaceId, null);
    if (!workspaceDecision.allowed) throw verdictRateLimitError(workspaceDecision);

    const body = await readBody(request);
    const batch = parseRequestBody(body);
    const source = options.source ?? (batch.kind === "csv" ? "csv" : "webhook");

    const applied = await applyOutcomes(workspace.workspaceId, batch.pending, source, now);

    return batch.kind === "single"
      ? singleResponse(applied)
      : await bulkResponse(workspace, applied, options);
  } catch (error) {
    return errorResponse(error);
  }
}

/** `OPTIONS`. No CORS: this is a server-to-server route and a browser is not the client. */
export function handleVerdictPreflight(): Response {
  return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
}

export async function handleVerdictUnsupportedMethod(request: Request): Promise<Response> {
  return handleVerdict(request);
}

// ---------------------------------------------------------------------------
// Reading the body
// ---------------------------------------------------------------------------

type RequestBody = { contentType: string; text: string };

async function readBody(request: Request): Promise<RequestBody> {
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const limit = isCsvType(contentType) ? MAX_CSV_BODY_BYTES : MAX_JSON_BODY_BYTES;

  const bytes = await readCapped(request, limit);
  if (bytes.byteLength === 0) {
    throw new VerdictError(
      "empty_body",
      "The request had no body. Send a JSON outcome or a CSV of them.",
    );
  }

  return { contentType, text: new TextDecoder().decode(bytes) };
}

/** Streams under a byte cap so an oversized body is abandoned, not buffered. */
async function readCapped(request: Request, limit: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > limit) throw tooLarge(limit);
  }

  const stream = request.body;
  if (!stream) {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > limit) throw tooLarge(limit);
    return new Uint8Array(buffer);
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        throw tooLarge(limit);
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

function tooLarge(limit: number): VerdictError {
  return new VerdictError(
    "payload_too_large",
    `The body is larger than ${Math.floor(limit / 1024)} KiB. Split a large CSV into several uploads.`,
  );
}

// ---------------------------------------------------------------------------
// Working out what was sent
// ---------------------------------------------------------------------------

type Batch = { kind: "single" | "batch" | "csv"; pending: PendingOutcome[] };

const CSV_TYPES = new Set([
  "text/csv",
  "application/csv",
  "text/tab-separated-values",
  "text/tsv",
]);

function isCsvType(contentType: string): boolean {
  return CSV_TYPES.has(contentType);
}

export function parseRequestBody(body: RequestBody): Batch {
  const { contentType, text } = body;

  if (isCsvType(contentType)) return csvBatch(text);

  if (contentType === "application/x-www-form-urlencoded") {
    // A webhook builder that only speaks form encoding is still a customer with
    // an outcome to give us.
    const record: Record<string, unknown> = {};
    for (const [key, value] of new URLSearchParams(text)) record[key] = value;
    return { kind: "single", pending: [pendingFrom(1, parseOutcome(record))] };
  }

  if (contentType === "application/json" || contentType.endsWith("+json")) {
    return jsonBatch(text);
  }

  // No content type, or `text/plain` from a client that did not set one. Sniff
  // rather than refuse: the body is unambiguous in practice, and a 415 for a
  // correct outcome is a lost outcome.
  if (contentType === "" || contentType === "text/plain") {
    const trimmed = text.trimStart();
    return trimmed.startsWith("{") || trimmed.startsWith("[") ? jsonBatch(text) : csvBatch(text);
  }

  throw new VerdictError(
    "unsupported_media_type",
    `Content-Type ${JSON.stringify(contentType)} is not one this route reads. Send application/json for one outcome or text/csv for many.`,
  );
}

function jsonBatch(text: string): Batch {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new VerdictError(
      "malformed_body",
      `The body is not valid JSON: ${error instanceof Error ? error.message : "unparseable"}.`,
    );
  }

  const list = asOutcomeList(parsed);

  if (list === null) {
    return { kind: "single", pending: [pendingFrom(1, parseOutcome(asRecord(parsed)))] };
  }

  if (list.length === 0) {
    throw new VerdictError("empty_body", "The outcomes array is empty.");
  }

  if (list.length > MAX_JSON_ROWS) {
    throw new VerdictError(
      "too_many_rows",
      `${list.length} outcomes in one JSON body; the limit is ${MAX_JSON_ROWS}. Post a CSV for a larger backfill — it takes up to ${MAX_ROWS.toLocaleString("en-US")} rows.`,
    );
  }

  return {
    kind: "batch",
    pending: list.map((entry, index) => pendingFrom(index + 1, parseOutcome(asRecord(entry)))),
  };
}

function csvBatch(text: string): Batch {
  const table = parseCsv(text);
  return {
    kind: "csv",
    pending: table.rows.map((row, index) => pendingFrom(index + 1, parseOutcome(row))),
  };
}

/** An array body, or an `outcomes` / `results` / `data` array inside an object. */
function asOutcomeList(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of ["outcomes", "verdicts", "results", "data", "rows"]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function pendingFrom(row: number, result: ParseResult): PendingOutcome {
  return result.ok ? { row, ok: true, input: result.input } : { row, ok: false, error: result.error };
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

function singleResponse(applied: ApplyResult): Response {
  const result = applied.results[0];

  if (!result || !result.ok) {
    const error = result?.error ?? {
      code: "internal_error" as const,
      message: "The outcome could not be read.",
    };
    return json(new VerdictError(error.code, error.message).status, {
      ok: false,
      error: { code: error.code, message: error.message },
    });
  }

  return json(200, { ok: true, result: serialize(result) });
}

async function bulkResponse(
  workspace: AuthenticatedWorkspace,
  applied: ApplyResult,
  options: VerdictRequestOptions,
): Promise<Response> {
  // One aggregate query per upload, not per outcome. A person is watching this
  // response, which is the moment worth telling them whether the loop they are
  // now feeding can work at their sales cycle at all — the same answer
  // /tools/time-to-outcome-calculator gives a stranger.
  let measurement: TimeToOutcomeMeasurement | null = null;
  try {
    measurement = await measureTimeToOutcome(workspace.workspaceId, { now: options.now });
  } catch (error) {
    // A failed measurement must never make a successful upload look failed.
    console.warn("[verdict] time-to-outcome measurement failed", error);
  }

  const status = applied.summary.failed > 0 ? 207 : 200;

  return json(status, {
    ok: applied.summary.failed === 0,
    summary: {
      rows: applied.summary.rows,
      applied: applied.summary.applied,
      unchanged: applied.summary.unchanged,
      failed: applied.summary.failed,
    },
    results: applied.results.map(serialize),
    time_to_outcome: measurement ? serializeMeasurement(measurement) : undefined,
  });
}

function serialize(result: ApplyResult["results"][number]) {
  return {
    row: result.row,
    ok: result.ok,
    submission_id: result.submissionId,
    verdict: result.verdict,
    value: result.value ?? undefined,
    currency: result.currency ?? undefined,
    verdict_at: result.verdictAt ?? undefined,
    matched_by: result.matchedBy,
    changed: result.changed,
    warnings: result.warnings.length > 0 ? result.warnings : undefined,
    error: result.error,
  };
}

/**
 * The honest constraint, in the response.
 *
 * Deliberately includes the discouraging fields — the share of leads that never
 * get an outcome, and the assessment's tone — rather than only the median. A
 * number without the verdict attached is how a slow funnel convinces itself it
 * is a fast one.
 */
export function serializeMeasurement(measurement: TimeToOutcomeMeasurement) {
  return {
    window_days: measurement.windowDays,
    submissions: measurement.submissions,
    graded: measurement.graded,
    awaiting: measurement.awaiting,
    graded_share: round(measurement.gradedShare, 4),
    median_days: measurement.medianDays === null ? null : round(measurement.medianDays, 2),
    p90_days: measurement.p90Days === null ? null : round(measurement.p90Days, 2),
    loop: {
      tone: measurement.assessment.tone,
      headline: measurement.assessment.headline,
      detail: measurement.assessment.detail,
    },
    sales_cycle: {
      tone: measurement.latency.tone,
      headline: measurement.latency.headline,
      detail: measurement.latency.detail,
    },
  };
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function errorResponse(error: unknown): Response {
  if (isVerdictError(error)) {
    return json(
      error.status,
      { ok: false, error: { code: error.code, message: error.message } },
      error.headers,
    );
  }

  // An unhandled exception here is a bug in this code, not something the caller
  // did. Say so rather than blaming their payload.
  console.error("[verdict] unhandled error", error);
  return json(500, {
    ok: false,
    error: {
      code: "internal_error",
      message: "Something went wrong on our side recording that outcome. Nothing was changed; retrying is safe.",
    },
  });
}

/** Re-exported so a caller can build an error message listing the accepted values. */
export { VERDICTS };
