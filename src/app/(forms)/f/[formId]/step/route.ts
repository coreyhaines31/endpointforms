import { carriedParams } from "@/lib/embed/params";
import { readVisitorKey } from "@/lib/hindsight/assign";
import { resolveVariant } from "@/lib/hindsight/serve";
import { VISITOR_COOKIE } from "@/lib/hindsight/visitor";
import { extractAttribution } from "@/lib/ingest/attribution";
import { parseBody, readBodyCapped, type JsonValue } from "@/lib/ingest/body";
import { clientIp, hashIp, responseMode } from "@/lib/ingest/client";
import { IngestError, isIngestError } from "@/lib/ingest/errors";
import { handleSubmission } from "@/lib/ingest/handler";
import { checkRateLimit, rateLimitError } from "@/lib/ingest/rate-limit";
import { errorHtml, errorJson } from "@/lib/ingest/respond";
import { resolveEndpoint } from "@/lib/ingest/store";
import { decideOrigin } from "@/lib/origin/decide";
import { ORIGIN_TOKEN_FIELD_KEYS, ORIGIN_TOKEN_HEADER } from "@/lib/origin/token";
import type { FormSchemaDocument } from "@/lib/schema/format";
import { validateSubmission } from "@/lib/schema/validate";
import {
  PARTIAL_KEY_FIELD,
  PARTIAL_KEY_PATTERN,
  STEP_FROM_FIELD,
  STEP_TO_FIELD,
} from "@/lib/steps/format";
import { advance, planSteps, stepErrors } from "@/lib/steps/plan";
import {
  PARTIAL_QUERY_PARAM,
  STEP_ERROR_PARAM,
  STEP_QUERY_PARAM,
} from "@/lib/steps/serve";
import { capturePartial, readPartial } from "@/lib/steps/store";
import { newPartialKey } from "@/db/ids";

/**
 * `POST /f/{formId}/step` — moving between the screens of a stepped form (#37).
 *
 * ## What this route is
 *
 * Post, redirect, get. It reads a screen's answers, merges them into the
 * partial, and answers with a 303 to `/f/{formId}` naming the next screen. It
 * renders nothing: the page renders every screen, so there is one renderer and
 * not two, and a browser refresh or Back between screens behaves like an
 * ordinary page rather than offering to resubmit a form.
 *
 * **No JavaScript anywhere in that.** Each screen is a real
 * `<form method="post">` with two real submit buttons; this is a real POST and
 * a real redirect. The hosted form's central promise — that it works with
 * scripting off — is not weakened by having four screens, it is the reason the
 * design looks like this.
 *
 * ## Where the last screen goes
 *
 * Also here, and then straight into `handleSubmission`. The final POST carries
 * every answer at once, because each screen re-posts the ones that are not on
 * it, so the bytes forwarded are an ordinary complete submission and the ingest
 * path merges nothing and knows nothing about steps. Same rate limits, same
 * origin stamping, same idempotency key, same row. **There is still exactly one
 * way a submission is stored.**
 *
 * ## What it refuses, and what it does not
 *
 * Nothing here can lose an answer. A screen whose fields do not validate is
 * still merged into the partial and still written down before the visitor is
 * sent back to correct it — a partial is *what somebody typed*, and it is not
 * required to be valid, complete, or finished. That is the point of it.
 *
 * A Back is never validated at all. A Back button that refuses to go back until
 * you answer the question you are trying to escape is the single most
 * infuriating thing a wizard can do.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ formId: string }> },
): Promise<Response> {
  const { formId } = await ctx.params;

  let bytes: Uint8Array;
  try {
    bytes = await readBodyCapped(request);
  } catch (error) {
    return refuse(request, error);
  }

  const forward = (variantId: string | null, variantSchema: SubmissionVariant) =>
    handleSubmission(
      new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: Buffer.from(bytes),
      }),
      formId,
      { variantId, variantSchema },
    );

  const ipHash = hashIp(clientIp(request.headers));

  // Step navigation gets a budget of its own rather than spending the
  // submission budget. A five-screen form is five posts before the one that
  // matters, and a visitor refused on the last screen because they used the
  // Back button twice would be a lead lost to our own bookkeeping.
  const limit = checkRateLimit(`step:${formId}`, ipHash);
  if (!limit.allowed) return refuse(request, rateLimitError(limit));

  let endpoint: Awaited<ReturnType<typeof resolveEndpoint>>;
  try {
    endpoint = await resolveEndpoint(formId);
  } catch (error) {
    return refuse(request, error);
  }

  // Hindsight (#45), re-derived from the visitor cookie exactly as
  // `submit/route.ts` does it — never read from the posted body, because an arm
  // the person being tested can choose is not an arm.
  let served: Awaited<ReturnType<typeof resolveVariant>> = null;
  try {
    served = await resolveVariant(formId, readVisitorKey(cookieValue(request, VISITOR_COOKIE)));
  } catch (error) {
    console.error(`[steps] could not resolve a variant for ${JSON.stringify(formId)}`, error);
  }
  const variantId = served?.variantId ?? null;
  const variantSchema: SubmissionVariant =
    served?.schemaVersionId && served.document
      ? { id: served.schemaVersionId, document: served.document }
      : null;

  const document = served?.document ?? endpoint.activeSchema?.document ?? null;

  let posted: Record<string, JsonValue>;
  try {
    posted = (await parseBody(request, bytes)).values;
  } catch {
    // Unreadable, empty, or an unsupported content type. `handleSubmission`
    // raises the same error with the status and message that belong to it.
    return forward(variantId, variantSchema);
  }

  // A form that has no steps has nothing for this route to do. Somebody is
  // holding a stale page from before the steps were removed, and the honest
  // answer is to treat their post as the submission it is rather than to
  // navigate them around a wizard that no longer exists.
  if (!document || (document.steps?.length ?? 0) === 0) {
    return forward(variantId, variantSchema);
  }

  const requestedKey = firstString(posted, PARTIAL_KEY_FIELD);
  const fromStepId = firstString(posted, STEP_FROM_FIELD);
  const direction = firstString(posted, STEP_TO_FIELD) === "back" ? "back" : "next";

  // A key the visitor supplied is only honoured when it names a row we can
  // read. Anything else — a typed key, an expired one, one belonging to a visit
  // that already finished — starts a new one, which is what stops a caller
  // writing into a partial they did not create.
  let partialKey: string | null = null;
  let stored: Record<string, JsonValue> = {};
  if (requestedKey !== null && PARTIAL_KEY_PATTERN.test(requestedKey)) {
    const existing = await readPartial(endpoint.workspaceId, endpoint.id, requestedKey);
    if (existing) {
      partialKey = existing.partialKey;
      stored = existing.values;
    }
  }
  if (partialKey === null) partialKey = newPartialKey();

  // What was just posted wins over what was stored — and for the fields on the
  // screen the visitor is leaving, **silence also wins**.
  //
  // This is the merge's one subtlety and getting it wrong is invisible until
  // somebody complains. An unticked checkbox posts nothing at all. A naive
  // `{...stored, ...posted}` therefore reads "they unticked it" as "they said
  // nothing about it" and restores the tick from the partial — the visitor
  // watches their answer come back, and the row we keep says the opposite of
  // what they chose. So the screen they were on is cleared from the stored
  // answers before the posted ones are laid over the top: on that screen the
  // POST is the whole truth, and everywhere else the partial still is.
  //
  // Which screen that was needs a plan, and a plan needs answers, so this is
  // done twice: once permissively to find the screen, once properly.
  const merged = { ...stored, ...schemaOnly(document, posted) };
  const leaving = planSteps(document, merged, fromStepId);
  if (!leaving) return forward(variantId, variantSchema);

  const answers: Record<string, JsonValue> = {
    ...omit(stored, leaving.current.fieldKeys),
    ...schemaOnly(document, posted),
  };

  const plan = planSteps(document, answers, fromStepId);
  if (!plan) return forward(variantId, variantSchema);

  // Written before anything can send the visitor anywhere, and written whether
  // or not the screen validated. A partial is what somebody typed; refusing to
  // record it because a required field is empty would be refusing to record the
  // only interesting thing about it.
  await capturePartial(endpoint, {
    partialKey,
    schemaVersionId: variantSchema?.id ?? endpoint.activeSchemaVersionId,
    variantId,
    stepId: plan.current.id,
    stepNumber: plan.current.number,
    stepsTotal: plan.total,
    values: answers,
    ...attributionFor(request, posted, endpoint.publicId),
    ipHash,
    now: new Date(),
  });

  const back = carriedParams(searchParamsOf(request));

  if (direction === "back") {
    const target = advance(document, answers, fromStepId, "back");
    return redirect(formId, partialKey, target, false, back);
  }

  const errors = stepErrors(document, answers, plan.current);
  if (errors.length > 0) {
    // The errors are not carried — the page re-derives them from the same
    // stored answers with the same validator. Nothing to encode, nothing to
    // truncate, and no cookie to be blocked inside somebody's iframe.
    return redirect(formId, partialKey, plan.current.id, true, back);
  }

  const target = advance(document, answers, fromStepId, "next");
  if (target !== null) return redirect(formId, partialKey, target, false, back);

  // The last screen. Before forwarding, the whole payload is checked rather
  // than just this screen's fields: a rule can require something on screen one
  // in response to an answer given on screen three, and forwarding that to a
  // `strict` endpoint would refuse the submission with a message naming a field
  // the visitor cannot see. Send them to the screen that owns the first such
  // error instead.
  const outstanding = validateSubmission(document, answers).errors;
  if (outstanding.length > 0) {
    const owner = plan.steps.find((step) =>
      outstanding.some((issue) => issue.field !== null && step.fieldKeys.includes(issue.field)),
    );
    if (owner) return redirect(formId, partialKey, owner.id, true, back);
    // Errors that belong to no screen cannot be shown or corrected here.
    // Forward: on the default `warn` mode the submission is stored and the
    // mismatch is reported to whoever owns the form, which is the right
    // destination for a problem the visitor did not cause.
  }

  return forward(variantId, variantSchema);
}

/**
 * `GET /f/{formId}/step` is somebody following a form action in a browser, or a
 * bookmark of a POST-only URL. Send them to the form.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ formId: string }> },
): Promise<Response> {
  const { formId } = await ctx.params;
  return new Response(null, {
    status: 303,
    headers: { location: `/f/${encodeURIComponent(formId)}` },
  });
}

// ---------------------------------------------------------------------------

type SubmissionVariant = { id: string; document: FormSchemaDocument } | null;

/**
 * Back to the form, at a named screen.
 *
 * 303, so the browser follows with GET and a refresh cannot repost — the same
 * reason `submit/route.ts` uses one. The embed and attribution parameters are
 * put back on because the page the visitor is about to be shown is a fresh GET
 * that knows nothing: without them, an embedded form's second screen is the
 * moment it stops being embedded.
 */
function redirect(
  formId: string,
  partialKey: string,
  stepId: string | null,
  withErrors: boolean,
  carried: URLSearchParams,
): Response {
  const params = new URLSearchParams(carried);
  params.set(PARTIAL_QUERY_PARAM, partialKey);
  if (stepId !== null) params.set(STEP_QUERY_PARAM, stepId);
  if (withErrors) params.set(STEP_ERROR_PARAM, "1");

  return new Response(null, {
    status: 303,
    headers: {
      location: `/f/${encodeURIComponent(formId)}?${params.toString()}`,
      // The URL names a partial, so the page it leads to is somebody's
      // half-filled form. Nothing about it may be held in a shared cache.
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}

/**
 * The stamps a partial carries, decided the same way a submission's are.
 *
 * `decideOrigin` reads the request before it reads the payload, so a partial
 * is stamped by the same mechanism and on the same evidence as the submission
 * it may become. There is deliberately **no spam assessment**: scoring is
 * calibrated on complete submissions, and `observeVelocity` in particular would
 * read one visitor stepping through four screens as four submissions from one
 * address inside a minute — poisoning the signal for the real submissions
 * beside it. See the note on the table in `src/db/schema.ts`.
 */
function attributionFor(
  request: Request,
  posted: Record<string, JsonValue>,
  endpointPublicId: string,
) {
  const attribution = extractAttribution({
    values: posted,
    headers: request.headers,
    requestUrl: request.url,
  });

  const origin = decideOrigin({
    surface: "form",
    headers: request.headers,
    endpointPublicId,
    token: firstOf(posted, ORIGIN_TOKEN_FIELD_KEYS) ?? request.headers.get(ORIGIN_TOKEN_HEADER),
    agentDeclaration: null,
    now: Date.now(),
  });

  return {
    origin: origin.origin,
    originReasons: origin.reasons,
    utmSource: attribution.utmSource,
    utmMedium: attribution.utmMedium,
    utmCampaign: attribution.utmCampaign,
    utmTerm: attribution.utmTerm,
    utmContent: attribution.utmContent,
    clickIds: attribution.clickIds,
    referrer: attribution.referrer,
    userAgent: attribution.userAgent,
  };
}

/**
 * The posted values, narrowed to fields the schema actually describes.
 *
 * A partial holds answers, not plumbing: `_step`, `_partial`, `_redirect`, the
 * honeypot decoys and anything else a page carries are not somebody's answers
 * and have no business in the row the inbox shows. Unlike a submission there is
 * no `raw_body` here to fall back on, so the narrowing is to what the schema
 * names rather than a list of things to remove — a decoy this build has not
 * heard of would otherwise be stored as though a visitor had typed it.
 */
function schemaOnly(
  document: FormSchemaDocument,
  posted: Record<string, JsonValue>,
): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const field of document.fields) {
    const value = posted[field.key];
    if (value === undefined) continue;
    out[field.key] = value;
  }
  return out;
}

/** The first of these names holding a non-blank scalar, as `handler.ts` reads them. */
function firstOf(values: Record<string, JsonValue>, names: readonly string[]): string | null {
  for (const name of names) {
    const found = firstString(values, name);
    if (found !== null) return found;
  }
  return null;
}

/** A copy without those keys. */
function omit(
  values: Record<string, JsonValue>,
  keys: readonly string[],
): Record<string, JsonValue> {
  const drop = new Set(keys);
  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (drop.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function firstString(values: Record<string, JsonValue>, key: string): string | null {
  const value = values[key];
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (Array.isArray(value)) {
    const found = value.find((entry) => typeof entry === "string" && entry.trim() !== "");
    return typeof found === "string" ? found.trim() : null;
  }
  return null;
}

function searchParamsOf(request: Request): URLSearchParams {
  try {
    return new URL(request.url).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

function refuse(request: Request, error: unknown): Response {
  const ingest = isIngestError(error)
    ? error
    : new IngestError(
        "internal_error",
        "That step could not be read. This is our fault, not yours — please retry.",
      );

  const build = responseMode(request) === "redirect" ? errorHtml : errorJson;
  return build(request, ingest.status, ingest.code, ingest.message, ingest.headers);
}
