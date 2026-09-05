import { createHash } from "node:crypto";

import { dispatchSubmission } from "../destinations/dispatch.ts";
import { decideOrigin } from "../origin/decide.ts";
import { ORIGIN_TOKEN_FIELD_KEYS, ORIGIN_TOKEN_HEADER } from "../origin/token.ts";
import type { OriginSurface } from "../origin/types.ts";
import { extractAttribution } from "./attribution.ts";
import { parseBody, readBodyCapped, sanitizeString, type JsonValue } from "./body.ts";
import { clientIp, hashIp, responseMode } from "./client.ts";
import { IngestError, isIngestError } from "./errors.ts";
import {
  AUTO_IDEMPOTENCY_WINDOW_MS,
  IDEMPOTENCY_FIELD_KEYS,
  MAX_IDEMPOTENCY_KEY_CHARS,
} from "./limits.ts";
import { checkRateLimit, rateLimitError } from "./rate-limit.ts";
import { assessSpam } from "../spam/assess.ts";
import { HONEYPOT_FIELD_KEYS } from "../spam/honeypot.ts";
import { loadSpamConfig } from "../spam/store.ts";
import { observeVelocity } from "../spam/observe.ts";
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
import { validateSubmission, type ValidationIssue } from "../schema/validate.ts";
import { retentionExpiry } from "../uploads/limits.ts";
import { dropForgedFileRefsIn, isStoredFileRef } from "../uploads/types.ts";
import { PARTIAL_KEY_PATTERN, STEP_FIELD_KEYS, PARTIAL_KEY_FIELD } from "../steps/format.ts";
import { completePartial } from "../steps/store.ts";
import { resolveEndpoint, storeSubmission } from "./store.ts";
import type { FormSchemaDocument } from "../schema/format.ts";

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
 *   4. Read it against the endpoint's schema, if it has one (#51).
 *   5. Write the row.
 *   6. Answer in the shape the caller asked in.
 *
 * Step 4 does not gate step 5. On the default `warn` mode a payload that does
 * not match the schema is stored, and the mismatch is reported alongside the
 * acknowledgement. Only an endpoint whose owner has deliberately switched to
 * `strict` refuses anything, and #51's binding constraint is exactly that:
 * declaring a schema must never start dropping submissions that used to
 * succeed.
 *
 * **Delivery to destinations happens after step 5 and outside step 6.** #41
 * owns it, `dispatchSubmission` is the one call into it, and it returns without
 * awaiting anything. A slow webhook must never make a visitor wait, and a
 * broken one must never be the reason a lead was not written down.
 */

const PUBLIC_ID = /^[A-Za-z0-9_-]{1,64}$/;

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

export type SubmissionOptions = {
  /**
   * Which door this arrived through (#30). Defaults to the human form endpoint;
   * the machine-callable surface (#32) passes `"manifest"` and needs to change
   * nothing else. Never read from the request — a caller that could name its
   * own surface could name itself an agent, and the point of the stamp is that
   * it cannot.
   */
  surface?: OriginSurface;
  /** What a manifest caller said it was. Recorded, not trusted. */
  agentDeclaration?: string | null;
  /**
   * Which Hindsight arm served this form (#45), or null for a submission that
   * is not in a test — which is most of them.
   *
   * Passed by the caller rather than read from the request body for the same
   * reason `surface` is: a value the submitter can type is a value the
   * submitter can choose, and a split test whose arm assignment can be chosen
   * by the person being tested is not one. `/f/{id}/submit` re-derives it from
   * the visitor cookie with the same pure function that served the page; see
   * `src/lib/hindsight/serve.ts`.
   */
  variantId?: string | null;
  /**
   * The form definition that arm actually served, when it has one of its own.
   *
   * A submission has to stay readable against the exact definition it arrived
   * under — that is what `submissions.schema_version_id` is for — and for a
   * visitor in a variant arm that definition is the **arm's**, not the
   * endpoint's active schema. Without this the inbox renders a variant's
   * submission against a form it was never shown, and `strict` mode rejects a
   * submission for omitting fields the visitor was never given.
   */
  variantSchema?: { id: string; document: FormSchemaDocument | null } | null;
};

export async function handleSubmission(
  request: Request,
  endpointPublicId: string,
  options: SubmissionOptions = {},
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

    // What this visitor was actually shown. The Hindsight arm's definition when
    // one served them (#45), the endpoint's active schema otherwise — and the
    // difference matters everywhere a document is read below, because a form
    // the visitor never saw is the wrong thing to judge their answers against.
    const servedDocument =
      options.variantSchema?.document ?? endpoint.activeSchema?.document ?? null;

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
      ...ORIGIN_TOKEN_FIELD_KEYS,
      // The spam decoys (#31). Stripped from `values` for the same reason as
      // the token: the inbox should show the customer's fields, not our traps.
      // Still verbatim in `raw_body`, and still read by `assessSpam` below,
      // which is given `parsed.values` rather than this stripped copy.
      ...HONEYPOT_FIELD_KEYS,
      // The multi-step flow's own fields (#37): which partial this visit was
      // writing to, and which screen it came from. Stripped for the same
      // reason as everything above it — the inbox shows the customer's fields,
      // not our plumbing — and note that they are stripped for *every* caller,
      // not only the hosted form. A raw POST that happens to send `_step` gets
      // the same treatment as one that sends `_redirect`.
      ...STEP_FIELD_KEYS,
    ]);
    // ...except a key that carried a real file part on this request. Everything
    // above is our plumbing, and none of it is ever a file input — so a file
    // arriving on one of these names is the customer's data wearing a reserved
    // name, not plumbing.
    //
    // Stripping it anyway would be a quiet loss of exactly the shape this
    // product is named against: `submission_files` is written from the parsed
    // parts rather than from `values`, so the file is stored and the inbox shows
    // it, while destinations and the CSV export — which both read `values` —
    // would carry no link to it. The inbox and the webhook would disagree about
    // whether the lead had an attachment, and the export would silently break
    // the promise that everything is exportable.
    //
    // **Keyed off `parsed.uploads`, never off the shape of `values`.**
    // `isStoredFileRef` is structural, and a caller can post JSON matching it
    // exactly — un-reserving on that shape would let a forged object reinstate
    // any reserved name it liked. `parsed.uploads` is what this request actually
    // carried, and it is empty for every encoding except multipart, so there is
    // nothing here for a JSON body to forge.
    for (const upload of parsed.uploads) reserved.delete(upload.fieldKey);

    // A file-shaped value naming a file this request did not carry is a forgery,
    // not a reference (#71). Dropped here, before anything downstream can be
    // asked to sign it — see `dropForgedFileRefs`.
    const storedIds = new Set(parsed.uploads.map((upload) => upload.publicId));
    const values = dropForgedFileRefsIn(omit(parsed.values, reserved), storedIds);

    const submittedAt = new Date();

    // Decided from the request, before anything about the payload, so that two
    // identical bodies arriving through different doors are stamped
    // differently — which is the entire mechanism.
    const origin = decideOrigin({
      surface: options.surface ?? "form",
      headers: request.headers,
      endpointPublicId: endpoint.publicId,
      token:
        firstField(parsed.values, ORIGIN_TOKEN_FIELD_KEYS) ??
        request.headers.get(ORIGIN_TOKEN_HEADER),
      agentDeclaration: options.agentDeclaration ?? null,
      now: submittedAt.getTime(),
    });

    // Scored, never enforced (#31). `assessSpam` has no path that can refuse a
    // submission, throw, or drop a field — it returns a number, a state of
    // `clear` or `flagged`, and the reasons behind both. A flagged submission
    // takes exactly the same route through the rest of this function as a clean
    // one and gets exactly the same acknowledgement, so a caller cannot learn
    // whether its decoy-filling worked.
    //
    // A separate axis from `origin` on purpose: a person in Chrome can send a
    // casino advert and an agent using Manifest can send the best lead of the
    // quarter. It is also never allowed near `verdict`, which is the downstream
    // business outcome and the input to Yield's ranking.
    //
    // Given `parsed.values`, not `values`: the decoys were stripped above and
    // this is the one thing that still has to see them.
    const spamConfig = await loadSpamConfig(endpoint);
    const spam = assessSpam({
      values: parsed.values,
      endpointPublicId: endpoint.publicId,
      ipHash,
      token:
        firstField(parsed.values, ORIGIN_TOKEN_FIELD_KEYS) ??
        request.headers.get(ORIGIN_TOKEN_HEADER),
      realFieldNames: servedDocument?.fields.map((field) => field.key) ?? [],
      velocity: observeVelocity({
        endpointId: endpoint.id,
        values,
        ipHash,
        userAgent: attribution.userAgent,
        now: submittedAt.getTime(),
      }),
      lists: spamConfig.lists,
      policy: spamConfig.policy,
      now: submittedAt.getTime(),
    });

    // Read against the schema, if there is one. Descriptive by default: this
    // decides what to *say*, not whether to keep the submission. A schema row
    // this build cannot parse yields a null document, which validates as
    // "nothing to say" rather than as a refusal.
    const validation = validateSubmission(servedDocument, values);

    if (endpoint.activeSchema?.mode === "strict" && !validation.valid) {
      throw new IngestError("schema_validation_failed", strictMessage(validation.errors));
    }

    const idempotencyKey =
      explicitKey ?? deriveIdempotencyKey(endpoint.id, ipHash, values, submittedAt.getTime());

    const stored = await storeSubmission(endpoint, {
      variantId: options.variantId ?? null,
      // The arm's version when it served its own form, so the submission stays
      // readable against the definition it actually arrived under.
      schemaVersionId: options.variantSchema?.id ?? endpoint.activeSchemaVersionId,
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
      origin: origin.origin,
      originReasons: origin.reasons,
      spamState: spam.state,
      spamScore: spam.score,
      spamReasons: spam.reasons,
      // Read and hashed by `parseBody`; written by `storeSubmission` inside the
      // same transaction as the row (#66). Nothing between here and there can
      // produce a stored submission whose attachments were not also stored —
      // the two commit together or neither does.
      uploads: parsed.uploads,
      uploadsExpireAt: retentionExpiry(submittedAt),
    });

    // Destinations (#41). The row is committed; from here on nothing can cost
    // this lead. `dispatchSubmission` returns void synchronously and defers the
    // work to `after()`, so a slow third-party endpoint cannot make the visitor
    // wait and a broken one cannot fail the submission — every failure inside
    // it lands in `delivery_attempts` instead of in this response.
    //
    // A collapsed duplicate is not re-delivered: the original already went, and
    // sending it twice is exactly the double lead the idempotency key exists to
    // prevent.
    if (!stored.duplicate) {
      dispatchSubmission({
        workspaceId: endpoint.workspaceId,
        endpointId: endpoint.id,
        submissionPublicId: stored.publicId,
      });
    }

    // The partial this submission grew out of (#37), closed now that it has
    // become a lead. This is what stops one visitor being two rows: the inbox
    // lists open partials only, so a capture that finished stops being one the
    // instant its submission is committed.
    //
    // Placed here, after the write, for the same reason `dispatchSubmission` is:
    // the row is safe, so nothing beyond this point can cost the lead.
    // `completePartial` swallows its own errors, and the worst it can do is
    // leave a row looking open that is not.
    //
    // Done on the ingest path rather than in the hosted form's route so that it
    // is true of every door. A submission carrying a partial key closes that
    // partial whichever surface it came through.
    const partialKey = firstField(parsed.values, [PARTIAL_KEY_FIELD]);
    if (partialKey !== null && PARTIAL_KEY_PATTERN.test(partialKey)) {
      await completePartial(
        endpoint.workspaceId,
        endpoint.id,
        partialKey,
        stored.id,
        submittedAt,
      );
    }

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
      // Only when there is something to say, so an endpoint with no schema
      // answers byte-for-byte as it did before #51.
      ...(validation.issues.length === 0
        ? {}
        : {
            warnings: validation.issues.map((issue) => ({
              field: issue.field,
              code: issue.code,
              message: issue.message,
            })),
          }),
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

/**
 * What a strict endpoint says when it refuses.
 *
 * Names every field and what is wrong with it, because the person reading this
 * is the developer who owns the form, and "validation failed" would send them
 * to our support inbox instead of to their markup.
 */
function strictMessage(errors: ValidationIssue[]): string {
  const listed = errors.slice(0, 5).map((issue) => issue.message);
  const remainder = errors.length - listed.length;
  const tail = remainder > 0 ? ` (and ${remainder} more)` : "";
  return `The submission did not match this endpoint's schema, which is set to strict mode: ${listed.join(" ")}${tail}`;
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
    .update(canonicalize(fingerprintable(values)))
    .digest("hex")
    .slice(0, 32);
  return `auto:${bucket}:${fingerprint}`;
}

/**
 * Strips the parts of a payload that differ between two byte-identical posts.
 *
 * Only file references so far, and they are the reason this exists. A
 * `StoredFileRef` carries a freshly generated id and a freshly signed URL, so
 * the same form submitted twice by a double-click would fingerprint differently
 * and **the duplicate would not collapse** — two rows, two copies of the bytes,
 * and the double lead the idempotency key exists to prevent. Reducing a file to
 * its name, size and content hash restores that, and does it better than the
 * old behaviour did: two posts now count as the same lead only if the attached
 * files are byte-for-byte the same file.
 */
function fingerprintable(value: JsonValue): JsonValue {
  if (isStoredFileRef(value)) {
    return { file: true, filename: value.filename, size: value.size, sha256: value.sha256 };
  }
  if (Array.isArray(value)) return value.map(fingerprintable);
  if (value !== null && typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value)) out[key] = fingerprintable(value[key]);
    return out;
  }
  return value;
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
