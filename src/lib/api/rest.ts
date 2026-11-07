import { AccountAuthError, authenticateAccountKey, readApiKeyHeader } from "../account/auth.ts";
import { readBodyCapped } from "../ingest/body.ts";
import { clientIp, hashIp } from "../ingest/client.ts";
import { isIngestError } from "../ingest/errors.ts";
import { checkRateLimit } from "../ingest/rate-limit.ts";
import { ApiError, isApiError, type ApiContext } from "./context.ts";
import {
  createEndpoint,
  deleteEndpoint,
  getEndpoint,
  listEndpoints,
  updateEndpoint,
  whoami,
} from "./endpoints.ts";
import { getFormSchema, setFormSchema } from "./forms.ts";
import {
  deleteSubmission,
  exportSubmissions,
  getSubmission,
  listDestinations,
  listSubmissionDeliveries,
  listSubmissions,
} from "./submissions.ts";

/**
 * The REST surface of the agent API, `/api/v1` (#133).
 *
 * Glue between HTTP and `./endpoints.ts`, `./forms.ts` and `./submissions.ts`:
 * read the key, the path parameters, the query string and the body, call the
 * core, write JSON. Nothing about who may see what is decided here — the core
 * does that — so this file can be wrong about HTTP without being wrong about
 * tenancy.
 *
 * Plain Web `Request`/`Response` with no Next APIs, so `tests/api-rest.test.mts`
 * drives it by calling a function. The files under `src/app/api/v1/` are one
 * line each.
 *
 * Responses: `{"ok":true,"data":…}` (plus `next_cursor` on a list), or
 * `{"ok":false,"error":{"code":…,"message":…}}` with the matching status.
 */

export type RestOptions = {
  renderDomain?: string;
  appUrl?: string;
  now?: () => Date;
};

type Input = {
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: unknown;
};

type Operation = (ctx: ApiContext, input: Input) => Promise<unknown>;

/** Every operation, by name. The names are the OpenAPI operationIds. */
export const OPERATIONS = {
  whoami: (ctx) => whoami(ctx),
  listEndpoints: (ctx) => listEndpoints(ctx),
  createEndpoint: (ctx, { body }) => createEndpoint(ctx, body),
  getEndpoint: (ctx, { params }) => getEndpoint(ctx, params.id),
  updateEndpoint: (ctx, { params, body }) => updateEndpoint(ctx, params.id, body),
  deleteEndpoint: (ctx, { params }) => deleteEndpoint(ctx, params.id),
  getFormSchema: (ctx, { params }) => getFormSchema(ctx, params.id),
  setFormSchema: (ctx, { params, body }) => setFormSchema(ctx, params.id, body),
  listDestinations: (ctx, { params }) => listDestinations(ctx, params.id),
  listSubmissions: (ctx, { query }) => listSubmissions(ctx, query),
  getSubmission: (ctx, { params }) => getSubmission(ctx, params.id),
  deleteSubmission: (ctx, { params }) => deleteSubmission(ctx, params.id),
  listSubmissionDeliveries: (ctx, { params }) => listSubmissionDeliveries(ctx, params.id),
  exportSubmissions: (ctx, { query }) => exportSubmissions(ctx, query),
} satisfies Record<string, Operation>;

export type OperationName = keyof typeof OPERATIONS;

/** Operations that read a JSON body. Everything else ignores one. */
const WITH_BODY: ReadonlySet<OperationName> = new Set(["createEndpoint", "updateEndpoint", "setFormSchema"]);

const IP_LIMIT = { windowMs: 60_000, endpoint: 1_000_000, ip: 300, endpointIp: 300 };
const KEY_LIMIT = { windowMs: 60_000, endpoint: 600, ip: 0, endpointIp: 0 };

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(`${JSON.stringify(body)}\n`, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // One workspace's data behind one key. Never cached by anything in between.
      "cache-control": "no-store",
      ...extra,
    },
  });
}

function errorResponse(error: ApiError, extra: Record<string, string> = {}): Response {
  return json(error.status, { ok: false, error: { code: error.code, message: error.message, ...error.details } }, extra);
}

function rateLimited(retryAfter: number | undefined): Response {
  const seconds = retryAfter ?? 60;
  return errorResponse(
    new ApiError("rate_limited", `Too many requests. Retry in ${seconds} seconds.`, { retry_after_seconds: seconds }),
    { "retry-after": String(seconds) },
  );
}

function readQuery(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    Object.defineProperty(out, key, {
      value: values.length === 1 ? values[0] : values,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  let bytes: Uint8Array;
  try {
    bytes = await readBodyCapped(request);
  } catch (error) {
    if (isIngestError(error)) throw new ApiError("invalid_request", error.message);
    throw error;
  }
  if (bytes.byteLength === 0) return {};
  if (!/^application\/(.+\+)?json\b/i.test(type)) {
    throw new ApiError("invalid_request", "Send the body as JSON, with Content-Type: application/json.");
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError("invalid_request", "The request body is not valid JSON.");
  }
}

/**
 * Runs one operation for one request.
 *
 * `params` are the route's path parameters, already awaited by the route file.
 */
export async function handleRest(
  request: Request,
  name: OperationName,
  params: Record<string, string> = {},
  options: RestOptions = {},
): Promise<Response> {
  const ipHash = hashIp(clientIp(request.headers));
  // Counted before the key is parsed, so an unauthenticated flood costs a map
  // lookup rather than a database round trip. Prefixed so this bucket is not
  // shared with form ingest, which counts the same IP hash.
  const byIp = checkRateLimit("api-v1", ipHash ? `api-v1:${ipHash}` : null, IP_LIMIT);
  if (!byIp.allowed) return rateLimited(byIp.retryAfter);

  try {
    const now = options.now?.() ?? new Date();
    const key = readApiKeyHeader(request.headers);
    if (!key) {
      // The shared message is written for an MCP client; this one is for HTTP.
      throw new AccountAuthError(
        "This API needs a workspace API key, sent as `Authorization: Bearer efv2.<id>.<secret>`. Run `npx endpointforms login`, or call verify_signup on the account MCP server (/api/mcp), to get one.",
      );
    }
    const caller = await authenticateAccountKey(key, {
      ip: clientIp(request.headers),
      now,
    });

    const byKey = checkRateLimit(`api-v1-key:${caller.keyId}`, null, KEY_LIMIT);
    if (!byKey.allowed) return rateLimited(byKey.retryAfter);

    const ctx: ApiContext = { caller, renderDomain: options.renderDomain, appUrl: options.appUrl, now };
    const input: Input = {
      params,
      query: readQuery(new URL(request.url)),
      body: WITH_BODY.has(name) ? await readJson(request) : undefined,
    };

    const result = await OPERATIONS[name](ctx, input);

    if (name === "exportSubmissions") {
      const file = result as Awaited<ReturnType<typeof exportSubmissions>>;
      return new Response(file.body, {
        status: 200,
        headers: {
          "content-type": file.content_type,
          "content-disposition": `attachment; filename="${file.filename}"`,
          "cache-control": "no-store",
          "x-export-row-count": String(file.count),
          ...(file.truncated ? { "x-export-truncated": "true" } : {}),
        },
      });
    }

    if (name === "listSubmissions") {
      const page = result as Awaited<ReturnType<typeof listSubmissions>>;
      return json(200, { ok: true, data: page.data, next_cursor: page.next_cursor });
    }

    return json(name === "createEndpoint" ? 201 : 200, { ok: true, data: result });
  } catch (error) {
    if (isApiError(error)) return errorResponse(error);
    if (error instanceof AccountAuthError) {
      return errorResponse(new ApiError("unauthorized", error.message), { "www-authenticate": "Bearer" });
    }
    // The operation name only — never the body or the query, which can carry
    // submitted values.
    console.error(`[api/v1] unhandled error in ${name}`, error instanceof Error ? error.name : "unknown");
    return json(500, {
      ok: false,
      error: { code: "internal_error", message: "The request could not be processed. This is our fault, not yours — please retry." },
    });
  }
}
