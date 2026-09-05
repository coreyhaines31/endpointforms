import { carriedParams } from "@/lib/embed/params";
import { readVisitorKey } from "@/lib/hindsight/assign";
import { resolveVariant } from "@/lib/hindsight/serve";
import { VISITOR_COOKIE } from "@/lib/hindsight/visitor";
import { parseBody, readBodyCapped, type JsonValue } from "@/lib/ingest/body";
import { IngestError, isIngestError } from "@/lib/ingest/errors";
import { handleSubmission } from "@/lib/ingest/handler";
import { errorHtml, errorJson } from "@/lib/ingest/respond";
import { responseMode } from "@/lib/ingest/client";
import { encodeFlash, ERROR_FLAG, flashCookie } from "@/lib/render/flash";
import { loadForm } from "@/lib/render/form";
import { validateSubmission } from "@/lib/schema/validate";

/**
 * `POST /f/{formId}/submit` — where the hosted form posts.
 *
 * ## Why this route exists at all
 *
 * The form could post straight to `/e/{publicId}`, and everything except one
 * thing would work. That one thing is the requirement that **server-side
 * validation errors come back into the page, in the fields, with the visitor's
 * answers still in them, without JavaScript.** The ingest path cannot do that
 * and should not learn how: on its default `warn` mode it never refuses at all,
 * and on `strict` it answers a refusal with a bare standalone page, which is
 * the right answer for a developer debugging their own markup and the wrong one
 * for a visitor who mistyped an email address.
 *
 * So this route is a thin front door, and it is deliberately *thin*:
 *
 *   1. Read the body once, under the ingest path's own byte cap.
 *   2. Read it against the schema with the ingest path's own validator.
 *   3. Errors → redirect back to the form with a retry cookie. Nothing is
 *      written, and the visitor is still on their filled-in form.
 *   4. Otherwise → hand the identical bytes and headers to `handleSubmission`.
 *
 * Step 4 is the point. The submission that reaches the database went through
 * exactly the same code as one posted to `/e/{publicId}` from a customer's own
 * site: the same rate limits, the same origin stamping, the same idempotency
 * key, the same row. This route adds a check in front; it does not fork the
 * write path, and there is no second way for a submission to be stored.
 *
 * ## Where this is stricter than ingest, and why that is not the footgun
 *
 * `validate.ts` exists to make sure declaring a schema never starts dropping
 * submissions that used to succeed, and it is right. That rule protects an
 * endpoint whose markup we do not control and cannot fix. Here we rendered the
 * markup ourselves from the same schema, so a mismatch is not drift between two
 * systems, it is a visitor who needs to correct a field — and correcting it
 * costs them one screen, because they never leave the form and never lose what
 * they typed. Nothing is dropped. The submission has not happened yet.
 *
 * A post that arrives here for an endpoint with no schema, or with a schema we
 * cannot read, is forwarded untouched. There is nothing to check it against,
 * and refusing it would be losing a lead over our own gap.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ formId: string }> },
): Promise<Response> {
  const { formId } = await ctx.params;

  // The body has to be read here, so it is read the way the ingest path reads
  // it — streaming, under `MAX_BODY_BYTES`, abandoned rather than buffered when
  // it is too big — and then replayed from the bytes.
  let bytes: Uint8Array;
  try {
    bytes = await readBodyCapped(request);
  } catch (error) {
    return refuse(request, error);
  }

  // Hindsight (#45). Re-derived from the visitor's cookie rather than read out
  // of the posted body, so the arm a submission is attributed to cannot be
  // chosen by the person being tested. `assignVariant` is pure, so this returns
  // the same arm the page rendered — see `src/lib/hindsight/serve.ts`.
  //
  // Resolved before anything can return, so the rejected-and-retried path below
  // is attributed identically to the accepted one. Failing here must never cost
  // the lead: an unattributed submission is a submission, and a 500 is not.
  let served: Awaited<ReturnType<typeof resolveVariant>> = null;
  try {
    served = await resolveVariant(
      formId,
      readVisitorKey(cookieValue(request, VISITOR_COOKIE)),
    );
  } catch (error) {
    console.error(`[hindsight] could not resolve a variant for ${JSON.stringify(formId)}`, error);
  }
  const variantId = served?.variantId ?? null;

  // Replayed as a `Buffer` rather than the raw `Uint8Array` only because that
  // is the shape `BodyInit` is typed for; the bytes are the ones that arrived.
  const forward = () =>
    handleSubmission(
      new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: Buffer.from(bytes),
      }),
      formId,
      {
        variantId,
        // Both, so the ingest path judges and stamps against the same form the
        // visitor was shown rather than the endpoint's active schema.
        variantSchema:
          served?.schemaVersionId && served.document
            ? { id: served.schemaVersionId, document: served.document }
            : null,
      },
    );

  let form: Awaited<ReturnType<typeof loadForm>>;
  try {
    form = await loadForm(formId);
  } catch (error) {
    // A read that failed is not a reason to lose the lead. Forward it: the
    // ingest path does its own lookup and either stores the submission or gives
    // the caller a better-informed refusal than we could.
    console.error(`[render] could not load form ${JSON.stringify(formId)}`, error);
    return forward();
  }

  if (form.status !== "ok") return forward();

  let values: Record<string, JsonValue>;
  try {
    values = (await parseBody(request, bytes)).values;
  } catch {
    // Empty, malformed, or an unsupported content type. `handleSubmission`
    // raises the same error with the message and status that belong to it.
    return forward();
  }

  // The definition the visitor was actually shown, which is the variant's when
  // a Hindsight test served one (#45) and the endpoint's active schema
  // otherwise.
  //
  // **Not `form.document`.** Validating a submission against a form the visitor
  // never saw is how an arm with fewer fields gets its leads rejected for
  // omitting fields it did not render — every submission bounced back to a form
  // showing errors on inputs that are not on the page, which is both unfixable
  // by the visitor and invisible in testing until a variant actually differs.
  // Caught end to end rather than by review: the shorter arm's submissions were
  // silently 303ing back to the form and never reaching the database.
  const document = served?.document ?? form.document;

  // Only `errors` gate anything. Warnings — an unknown field, a value posted
  // twice — describe drift for whoever owns the form and are never something to
  // stop a visitor with.
  const { errors } = validateSubmission(document, values);
  if (errors.length === 0) return forward();

  const keys = document.fields.map((field) => field.key);
  const cookie = flashCookie(
    formId,
    encodeFlash(errors, retainable(values, keys), keys),
    isSecure(request),
  );

  // The embed and attribution parameters have to be put back on (#39). They
  // reached this route on the form's `action`, and the form the visitor is
  // about to be shown again is a fresh GET that knows nothing: without them an
  // embedded form's first validation error is the moment it stops being
  // embedded — full-height marketing layout inside somebody's section, no
  // resize handshake, and every retry submitted with the attribution gone.
  const back = carriedParams(searchParamsOf(request));
  back.set(ERROR_FLAG, "1");

  return new Response(null, {
    // 303, so the browser follows with GET and a refresh of the form cannot
    // repost. Matches `redirectResponse` in the ingest path for the same reason.
    status: 303,
    headers: {
      location: `/f/${encodeURIComponent(formId)}?${back.toString()}`,
      "set-cookie": cookie,
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}

/**
 * `GET /f/{formId}/submit` is somebody following the form's action in a browser.
 *
 * Send them to the form rather than to a 405. There is nothing at this URL to
 * look at, and the page they were trying to reach is one segment up.
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

/**
 * The visitor's answers, for the fields the form actually renders.
 *
 * Anything the schema does not name is left behind: it is not drawn on the way
 * back, so carrying it would spend the retry cookie's few kilobytes on values
 * nothing can show.
 */
function retainable(
  values: Record<string, JsonValue>,
  keys: readonly string[],
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};

  for (const key of keys) {
    const value = values[key];
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      const strings = value.filter((entry): entry is string => typeof entry === "string");
      if (strings.length > 0) out[key] = strings;
      continue;
    }
    if (typeof value === "string") {
      out[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = String(value);
    }
  }

  return out;
}

/**
 * The query string this route was posted to, or an empty one.
 *
 * A `Request` URL is always absolute so the parse cannot realistically fail —
 * but this is on the path back to a visitor whose submission was refused, and
 * throwing here would turn a correctable typo into a 500 on a lead that is
 * still recoverable.
 */
function searchParamsOf(request: Request): URLSearchParams {
  try {
    return new URL(request.url).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

/** Answers a body we could not even read, in the shape the caller asked in. */
function refuse(request: Request, error: unknown): Response {
  const ingest = isIngestError(error)
    ? error
    : new IngestError(
        "internal_error",
        "The submission could not be read. This is our fault, not yours — please retry.",
      );

  const build = responseMode(request) === "redirect" ? errorHtml : errorJson;
  return build(request, ingest.status, ingest.code, ingest.message, ingest.headers);
}

/**
 * One cookie out of the request header.
 *
 * Read from the raw header rather than through `next/headers`, because this is
 * a Route Handler holding a `Request` and `cookies()` would be a second, less
 * direct route to the same string.
 */
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

/**
 * Whether to mark the retry cookie `Secure`.
 *
 * A `Secure` cookie is dropped silently over plain HTTP, which would mean local
 * development quietly losing every visitor's answers on a failed submit and
 * nobody noticing until production. The forwarded protocol header is checked
 * first because behind a proxy the request URL is the internal one.
 */
function isSecure(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]?.trim() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}
