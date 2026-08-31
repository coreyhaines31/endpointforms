import { createHash } from "node:crypto";

import { extractAttribution } from "./attribution.ts";
import { parseBody, readBodyCapped, sanitizeString, type JsonValue } from "./body.ts";
import { clientIp, hashIp, responseMode } from "./client.ts";
import { IngestError, isIngestError } from "./errors.ts";
import { AUTO_IDEMPOTENCY_WINDOW_MS, MAX_IDEMPOTENCY_KEY_CHARS } from "./limits.ts";
import { checkRateLimit, rateLimitError } from "./rate-limit.ts";
import {
  defaultThanksUrl,
  errorHtml,
  errorJson,
  jsonResponse,
  preflightResponse,
  redirectResponse,
  REDIRECT_FIELD_KEYS,
  resolveRedirect,
  type SubmissionAck,
} from "./respond.ts";
import { resolveEndpoint, storeSubmission } from "./store.ts";

/**
 * The submission endpoint (#50, #29).
 *
 * Accept, validate, persist, acknowledge — and never lose one. This runs on
 * other people's paid traffic, so the ordering below is deliberate:
 *
 *   1. Cheap refusals first (method, endpoint id shape, rate limit) so a flood
 *      never reaches the database.
 *   2. Resolve the endpoint.
 *   3. Read the body under a byte cap, parse it, discover the fields.
 *   4. Write the row.
 *   5. Answer in the shape the caller asked in.
 *
 * **Delivery to destinations is not here.** #41 owns that, and it runs after the
 * row is committed. A slow webhook must never make a visitor wait, and it must
 * never be the reason a lead was not written down.
 */

const PUBLIC_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Field names the endpoint reserves. Stripped from `values`, kept in `raw_body`. */
const IDEMPOTENCY_FIELD_KEYS = ["_idempotency_key", "_idempotency", "_submission_key"] as const;

export async function handlePreflight(request: Request): Promise<Response> {
  return preflightResponse(request);
}

/**
 * `GET /e/{id}` is a person pasting the URL into a browser to see if it works.
 * Tell them what it is rather than 404ing at them.
 */
export async function handleUnsupportedMethod(request: Request): Promise<Response> {
  const error = new IngestError(
    "method_not_allowed",
    `This is a form endpoint. Send a POST with application/x-www-form-urlencoded, multipart/form-data, or application/json; ${request.method} is not accepted.`,
    { allow: "POST, OPTIONS" },
  );
  return respondWithError(request, error);
}

export async function handleSubmission(
  request: Request,
  endpointPublicId: string,
): Promise<Response> {
  try {
    if (!PUBLIC_ID.test(endpointPublicId)) {
      throw new IngestError(
        "endpoint_not_found",
        "That is not a valid endpoint ID. Check the URL in your form's action attribute.",
      );
    }

    const ip = clientIp(request.headers);
    const ipHash = hashIp(ip);

    // Before the database, and keyed on the public ID so an unknown endpoint
    // being hammered costs a map lookup rather than a query.
    const limit = checkRateLimit(endpointPublicId, ipHash);
    if (!limit.allowed) throw rateLimitError(limit);

    const endpoint = await resolveEndpoint(endpointPublicId);

    const bytes = await readBodyCapped(request);
    const parsed = await parseBody(request, bytes);

    if (Object.keys(parsed.values).length === 0) {
      throw new IngestError(
        "empty_body",
        "The submission contained no fields. Check that your form's inputs have name attributes.",
      );
    }

    const attribution = extractAttribution({
      values: parsed.values,
      headers: request.headers,
      requestUrl: request.url,
    });

    const requestedRedirect = firstField(parsed.values, REDIRECT_FIELD_KEYS);
    const explicitKey = explicitIdempotencyKey(request, parsed.values);

    // Everything lifted onto a dedicated column, plus the endpoint's own
    // reserved fields. `raw_body` still holds the payload verbatim, so nothing
    // is actually lost — this only keeps the inbox showing the customer's
    // fields rather than our plumbing.
    const reserved = new Set<string>([
      ...attribution.consumedKeys,
      ...REDIRECT_FIELD_KEYS,
      ...IDEMPOTENCY_FIELD_KEYS,
    ]);
    const values = omit(parsed.values, reserved);

    const submittedAt = new Date();
    const idempotencyKey =
      explicitKey ?? deriveIdempotencyKey(endpoint.id, ipHash, values, submittedAt.getTime());

    const stored = await storeSubmission(endpoint, {
      values,
      rawBody: parsed.rawBody,
      rawContentType: parsed.rawContentType,
      idempotencyKey,
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      utmTerm: attribution.utmTerm,
      utmContent: attribution.utmContent,
      clickIds: attribution.clickIds,
      referrer: attribution.referrer,
      userAgent: attribution.userAgent,
      ipHash,
      submittedAt,
    });

    if (responseMode(request) === "redirect") {
      let target = resolveRedirect(request, requestedRedirect);
      // Only our own fallback page gets the submission id appended; a customer's
      // thank-you URL is left exactly as they wrote it.
      if (target === defaultThanksUrl(request)) {
        const url = new URL(target);
        url.searchParams.set("s", stored.publicId);
        target = url.toString();
      }
      return redirectResponse(request, target);
    }

    const ack: SubmissionAck = {
      ok: true,
      id: stored.publicId,
      endpoint: endpoint.publicId,
      submittedAt: stored.submittedAt.toISOString(),
      duplicate: stored.duplicate,
    };
    return jsonResponse(request, 200, ack);
  } catch (error) {
    if (isIngestError(error)) return respondWithError(request, error);

    // Anything reaching here is our bug, not the caller's. Log enough to find
    // it and nothing from the payload — a submission body is customer data.
    console.error(
      `[ingest] unhandled error on endpoint ${JSON.stringify(endpointPublicId)}`,
      error,
    );
    return respondWithError(
      request,
      new IngestError(
        "internal_error",
        "The submission could not be processed. This is our fault, not yours — please retry.",
      ),
    );
  }
}

function respondWithError(request: Request, error: IngestError): Response {
  const build = responseMode(request) === "redirect" ? errorHtml : errorJson;
  return build(request, error.status, error.code, error.message, error.headers);
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * An explicit key, from a header or a reserved field.
 *
 * A caller that sends one owns the collapsing rule completely: the same key on
 * the same endpoint is the same lead, for as long as the row exists.
 */
function explicitIdempotencyKey(
  request: Request,
  values: Record<string, JsonValue>,
): string | null {
  const header =
    request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  const field = firstField(values, IDEMPOTENCY_FIELD_KEYS);
  const raw = header ?? field;
  if (!raw) return null;

  const cleaned = sanitizeString(raw).trim();
  if (cleaned === "") return null;
  return cleaned.slice(0, MAX_IDEMPOTENCY_KEY_CHARS);
}

/**
 * The key for a plain HTML form, which sends none.
 *
 * A double-clicked submit button posts twice, and both posts are byte-identical
 * from the same client a fraction of a second apart. Fingerprinting the payload
 * and bucketing it by time collapses exactly that, and nothing else: the same
 * person sending the same enquiry again a minute later lands in a new bucket
 * and gets their own row.
 *
 * The bias is deliberate. A window this short means an occasional true
 * duplicate survives, which is a row someone can delete. The opposite error —
 * eating a genuine second enquiry — is a lost lead, which is the failure this
 * whole product exists to complain about.
 *
 * The `auto:` prefix keeps a derived key distinguishable from a customer's own
 * when someone is reading the column trying to work out what happened.
 */
function deriveIdempotencyKey(
  endpointId: string,
  ipHash: string | null,
  values: Record<string, JsonValue>,
  now: number,
): string {
  const bucket = Math.floor(now / AUTO_IDEMPOTENCY_WINDOW_MS);
  const fingerprint = createHash("sha256")
    .update(endpointId)
    .update("\n")
    .update(ipHash ?? "")
    .update("\n")
    .update(canonicalize(values))
    .digest("hex")
    .slice(0, 32);
  return `auto:${bucket}:${fingerprint}`;
}

/** Key order in a payload is not meaningful, so it must not change the fingerprint. */
function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

// ---------------------------------------------------------------------------

/** The first of these field names that holds a non-blank scalar. */
function firstField(
  values: Record<string, JsonValue>,
  names: readonly string[],
): string | null {
  for (const name of names) {
    const value = values[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

/** A copy without the reserved keys, still on a null prototype. */
function omit(
  values: Record<string, JsonValue>,
  keys: Set<string>,
): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const key of Object.keys(values)) {
    if (keys.has(key)) continue;
    Object.defineProperty(out, key, {
      value: values[key],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}
