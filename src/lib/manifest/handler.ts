import { readBodyCapped } from "../ingest/body.ts";
import { isIngestError } from "../ingest/errors.ts";
import { handleSubmission } from "../ingest/handler.ts";
import { checkRateLimit } from "../ingest/rate-limit.ts";
import { hashIp, clientIp } from "../ingest/client.ts";
import { resolveEndpoint, type ResolvedEndpoint } from "../ingest/store.ts";
import type { FormSchemaDocument } from "../schema/format.ts";
import type { ValidationIssue } from "../schema/validate.ts";
import { prepareSubmission } from "./arguments.ts";
import { parseRpc, RPC, rpcError, rpcResult, type RpcId, type RpcRequest } from "./jsonrpc.ts";
import { buildToolDefinition, type ManifestTool } from "./tool.ts";

/**
 * Manifest — the agent-callable surface (#32).
 *
 * ## What this is, in one paragraph
 *
 * Every form that has declared a schema publishes a second surface beside its
 * human page: an MCP endpoint an agent can discover a tool from and call. The
 * tool definition is generated from the same `FormSchemaDocument` that renders
 * the page, so the two cannot drift. A submission through here goes down the
 * same write path as everything else and is stamped `agent` — not because it
 * asked to be, but because it used this door.
 *
 * ## Why the stamp cannot be spoofed from either side
 *
 * `surface` is an argument this module passes to `handleSubmission`, and it is
 * a constant in the call below. It is never read from the body, from a header
 * or from a parameter, so:
 *
 *   - A caller posting to `/e/{id}` cannot claim `agent`. There is no input
 *     that reaches `decideOrigin`'s `surface`, so the only way to be stamped
 *     `agent` is to be routed here — which means calling this endpoint, which
 *     *is* the declaration.
 *   - A caller here cannot claim `human`. `decideOrigin` returns `agent`
 *     categorically for this surface and never consults the header weights, so
 *     a perfect Chrome header set on a tool call changes nothing.
 *
 * `docs/23-origin-findings.md` is the reason this property is worth stating so
 * loudly: it measured the form half being forged with nine copied headers, and
 * found this half sound for a structural reason — using the tool surface is the
 * declaration, so there is nothing to forge.
 *
 * ## One write path
 *
 * Nothing here writes a submission. `handleSubmission` does, with the rate
 * limiting, the byte caps, the idempotency collapsing, the attribution lifting
 * and the schema check it already performs. This module shapes the request that
 * goes into it and the answer that comes back out.
 *
 * ## No Next APIs
 *
 * Plain Web `Request`/`Response` throughout, so `tests/manifest.test.mts` calls
 * it as a function rather than standing up a server.
 */

/** Revisions of the MCP spec this server can speak, newest first. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

/** Bumped when the shape of what this server publishes changes. */
export const MANIFEST_SERVER_VERSION = "1.0.0";

const PUBLIC_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * `_meta` keys are namespaced by the MCP spec, and the reverse-DNS prefix is
 * how a client tells ours apart from another server's.
 */
const META_PREFIX = "endpointforms.com/";
const META_AGENT = `${META_PREFIX}agent`;
const META_IDEMPOTENCY = `${META_PREFIX}idempotency-key`;

/**
 * The rate limit on protocol chatter, kept in its own namespace.
 *
 * Deliberately *not* the same window as the submissions. `handleSubmission`
 * already counts every write against `e:{endpointId}`, and counting a tool call
 * twice would silently halve an agent's submission budget. So discovery,
 * handshakes and rejected calls are limited under `mcp:{endpointId}` — which
 * caps a client hammering this endpoint without ever storing anything — and the
 * writes are limited exactly once, by the one write path, in the same window as
 * the human form. One endpoint has one submission budget, whichever door it
 * arrives at.
 */
function rateLimitKey(endpointPublicId: string): string {
  return `mcp:${endpointPublicId}`;
}

export type ManifestOptions = {
  /** Overrides the URL used in descriptions. Defaults to the request's own. */
  submitUrl?: string;
};

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/**
 * CORS, for the same reason `/e/{id}` has it: the caller is on somebody else's
 * origin. There is no cookie and no credential on this route, so a reflected
 * origin grants nothing a plain HTTP client could not have taken anyway.
 */
function corsHeaders(request: Request): Record<string, string> {
  return {
    "access-control-allow-origin": request.headers.get("origin") ?? "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers":
      request.headers.get("access-control-request-headers") ??
      "content-type, accept, mcp-protocol-version, mcp-session-id, idempotency-key, x-agent-identity",
    "access-control-expose-headers": "retry-after, mcp-protocol-version",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(
  request: Request,
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      ...corsHeaders(request),
      ...extra,
    },
  });
}

export function handleManifestPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * Anything that is not a POST.
 *
 * A GET here is either a person pasting the URL into a browser or an MCP client
 * trying to open the optional server-to-client SSE stream. The spec sanctions
 * 405 for the second case, and the first deserves a sentence rather than a bare
 * status, so both get the same explanatory body.
 */
export function handleManifestUnsupportedMethod(
  request: Request,
  endpointPublicId: string,
): Response {
  return json(
    request,
    405,
    {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: `This is the Manifest endpoint for form ${endpointPublicId}: an MCP server over HTTP. POST a JSON-RPC 2.0 request — "tools/list" to discover the tool, "tools/call" to submit. There is no server-initiated stream on this URL, so GET is not supported.`,
      },
    },
    { allow: "POST, OPTIONS" },
  );
}

/**
 * One JSON-RPC request.
 */
export async function handleManifestRequest(
  request: Request,
  endpointPublicId: string,
  options: ManifestOptions = {},
): Promise<Response> {
  if (!PUBLIC_ID.test(endpointPublicId)) {
    return json(
      request,
      404,
      rpcError(
        null,
        RPC.SERVER_ERROR,
        "That is not a valid endpoint ID. Check the URL you discovered this server at.",
      ),
    );
  }

  const limit = checkRateLimit(rateLimitKey(endpointPublicId), hashIp(clientIp(request.headers)));
  if (!limit.allowed) {
    const retryAfter = limit.retryAfter ?? 60;
    return json(
      request,
      429,
      rpcError(
        null,
        RPC.SERVER_ERROR,
        `Too many requests to this Manifest endpoint. Retry in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`,
        { retry_after_seconds: retryAfter },
      ),
      { "retry-after": String(retryAfter) },
    );
  }

  let payload: unknown;
  try {
    const bytes = await readBodyCapped(request);
    if (bytes.byteLength === 0) {
      return json(
        request,
        400,
        rpcError(null, RPC.INVALID_REQUEST, "The request had no body. POST a JSON-RPC 2.0 message."),
      );
    }
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (isIngestError(error)) {
      // The byte cap, reached before anything was parsed. Same limit as the
      // form endpoint, because it is the same limit — `MAX_BODY_BYTES`.
      return json(
        request,
        error.status,
        rpcError(null, RPC.INVALID_REQUEST, error.message),
        error.headers,
      );
    }
    return json(
      request,
      400,
      rpcError(
        null,
        RPC.PARSE_ERROR,
        `The request body is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}.`,
      ),
    );
  }

  const parsed = parseRpc(payload);
  if (!parsed.ok) {
    return json(
      request,
      400,
      rpcError(parsed.failure.id, parsed.failure.code, parsed.failure.message),
    );
  }

  const rpc = parsed.request;

  // A notification takes no answer at all. `notifications/initialized` is the
  // one every client sends, and answering it with a result is a protocol
  // violation some clients treat as fatal.
  if (rpc.id === null) {
    return new Response(null, { status: 202, headers: corsHeaders(request) });
  }

  try {
    return await dispatch(request, rpc, rpc.id, endpointPublicId, options);
  } catch (error) {
    if (isIngestError(error)) {
      return json(
        request,
        error.status,
        rpcError(rpc.id, RPC.SERVER_ERROR, error.message, { code: error.code }),
        error.headers,
      );
    }
    // Ours, not the caller's. Log enough to find it and nothing from the
    // arguments — a tool call carries the same customer data a submission does.
    console.error(
      `[manifest] unhandled error on endpoint ${JSON.stringify(endpointPublicId)} method ${JSON.stringify(rpc.method)}`,
      error,
    );
    return json(
      request,
      500,
      rpcError(
        rpc.id,
        RPC.INTERNAL_ERROR,
        "The request could not be processed. This is our fault, not yours — please retry.",
      ),
    );
  }
}

async function dispatch(
  request: Request,
  rpc: RpcRequest,
  id: RpcId,
  endpointPublicId: string,
  options: ManifestOptions,
): Promise<Response> {
  switch (rpc.method) {
    case "initialize":
      return json(request, 200, rpcResult(id, await initializeResult(rpc, endpointPublicId, options, request)));

    case "ping":
      // The spec's liveness check. An empty result is the whole answer.
      return json(request, 200, rpcResult(id, {}));

    case "tools/list":
      return json(request, 200, rpcResult(id, await listTools(endpointPublicId, options, request)));

    case "tools/call":
      return json(request, 200, rpcResult(id, await callTool(request, rpc, endpointPublicId, options)));

    default:
      return json(
        request,
        200,
        rpcError(
          id,
          RPC.METHOD_NOT_FOUND,
          `This server implements initialize, ping, tools/list and tools/call. It does not implement ${JSON.stringify(rpc.method)}.`,
        ),
      );
  }
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

async function initializeResult(
  rpc: RpcRequest,
  endpointPublicId: string,
  options: ManifestOptions,
  request: Request,
): Promise<Record<string, unknown>> {
  const requested = rpc.params.protocolVersion;
  // Echo the client's revision when we speak it, otherwise name ours and let
  // the client decide whether it can continue. That is what the spec asks for,
  // and it is also the only honest answer.
  const protocolVersion =
    typeof requested === "string" &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
      ? requested
      : LATEST_PROTOCOL_VERSION;

  const endpoint = await resolveEndpoint(endpointPublicId);
  const document = activeDocument(endpoint);
  const tool = document ? buildToolDefinition(document, toolContext(endpointPublicId, options, request)) : null;

  return {
    protocolVersion,
    capabilities: {
      // No `listChanged`: the tool list is derived from the active schema on
      // every request, and this transport has no channel to push a change down.
      tools: {},
    },
    serverInfo: {
      name: "endpointforms",
      title: "Endpoint Forms — Manifest",
      version: MANIFEST_SERVER_VERSION,
    },
    instructions: tool
      ? `This server publishes one tool, ${tool.name}, which submits the form behind endpoint ${endpointPublicId}. Submissions made through it are recorded with origin "agent" — using this surface is itself the declaration, so there is no reason to imitate a browser. Call tools/list for the current field list before submitting; it is generated from the live form definition and changes when the form does.`
      : `Endpoint ${endpointPublicId} accepts submissions but has not declared a form schema, so there is no tool to publish yet. Nothing is broken — the endpoint still accepts a plain POST at ${submitUrlFor(endpointPublicId, options, request)}.`,
  };
}

// ---------------------------------------------------------------------------
// tools/list
// ---------------------------------------------------------------------------

/**
 * The tool list, which is empty rather than an error when there is no schema.
 *
 * An endpoint with no schema is a perfectly working endpoint (#50) that simply
 * has nothing to declare. Erroring at an agent would say the form is broken; an
 * empty list with a sentence in `_meta` says the true thing, which is that
 * there is nothing here to call yet and the plain POST endpoint still works.
 */
export async function listTools(
  endpointPublicId: string,
  options: ManifestOptions,
  request: Request,
): Promise<Record<string, unknown>> {
  const endpoint = await resolveEndpoint(endpointPublicId);
  const document = activeDocument(endpoint);
  const submitUrl = submitUrlFor(endpointPublicId, options, request);

  if (!document) {
    return {
      tools: [],
      _meta: {
        [`${META_PREFIX}endpoint`]: endpointPublicId,
        [`${META_PREFIX}submit_url`]: submitUrl,
        [`${META_PREFIX}notice`]: endpoint.activeSchemaVersionId
          ? `Endpoint ${endpointPublicId} has a form schema this build cannot read, so no tool can be published from it. The endpoint still accepts a plain POST at ${submitUrl}.`
          : `Endpoint ${endpointPublicId} has not declared a form schema, so it publishes no tool. This is not an error: the endpoint accepts a plain POST at ${submitUrl}, and a tool appears here as soon as a schema is declared.`,
      },
    };
  }

  const tool = buildToolDefinition(document, toolContext(endpointPublicId, options, request));
  return {
    tools: [tool],
    _meta: {
      [`${META_PREFIX}endpoint`]: endpointPublicId,
      [`${META_PREFIX}submit_url`]: submitUrl,
      [`${META_PREFIX}origin`]: "agent",
    },
  };
}

// ---------------------------------------------------------------------------
// tools/call
// ---------------------------------------------------------------------------

type ToolResult = Record<string, unknown>;

async function callTool(
  request: Request,
  rpc: RpcRequest,
  endpointPublicId: string,
  options: ManifestOptions,
): Promise<ToolResult> {
  const name = typeof rpc.params.name === "string" ? rpc.params.name : null;
  const rawArgs = rpc.params.arguments;
  const submitUrl = submitUrlFor(endpointPublicId, options, request);

  const endpoint = await resolveEndpoint(endpointPublicId);
  const document = activeDocument(endpoint);

  if (!document) {
    return rejection("no_tool_published", [], {
      message: endpoint.activeSchemaVersionId
        ? `Endpoint ${endpointPublicId} has a form schema this build cannot read, so there is no tool to call. The endpoint still accepts a plain POST at ${submitUrl}.`
        : `Endpoint ${endpointPublicId} has not declared a form schema, so it publishes no tool. The endpoint still accepts a plain POST at ${submitUrl}.`,
    });
  }

  const tool = buildToolDefinition(document, toolContext(endpointPublicId, options, request));

  if (name !== tool.name) {
    return rejection("unknown_tool", [], {
      message:
        name === null
          ? `A tools/call needs a "name". This server publishes one tool: ${tool.name}.`
          : `This server publishes one tool, ${tool.name}, and ${JSON.stringify(name)} is not it.`,
    });
  }

  if (rawArgs !== undefined && (rawArgs === null || typeof rawArgs !== "object" || Array.isArray(rawArgs))) {
    return rejection("invalid_arguments", [], {
      message: '"arguments" must be an object whose keys are the form\'s field names.',
    });
  }

  const args = (rawArgs ?? {}) as Record<string, unknown>;
  const prepared = prepareSubmission(document, args);

  if (prepared.errors.length > 0) {
    return rejection("schema_validation_failed", prepared.errors, {
      message: `The submission does not match the form's ${tool.name} schema and was not stored. ${prepared.errors.length} field${prepared.errors.length === 1 ? "" : "s"} need${prepared.errors.length === 1 ? "s" : ""} correcting; send a corrected call.`,
    });
  }

  if (Object.keys(prepared.values).length === 0) {
    return rejection("empty_submission", [], {
      message: `The call carried no field values, so there is no lead to store. ${
        document.fields.length === 0
          ? "This form declares no fields."
          : `Supply at least one of: ${document.fields.map((field) => field.key).join(", ")}.`
      }`,
    });
  }

  // ---- the one write path ------------------------------------------------
  const response = await handleSubmission(
    submissionRequest(request, endpointPublicId, prepared.values, rpc),
    endpointPublicId,
    {
      // A constant. Never read from the request — see the note at the top of
      // this file. This single argument is the whole Origin mechanism.
      surface: "manifest",
      agentDeclaration: agentDeclaration(rpc, request.headers),
    },
  );

  const ack = (await response.json().catch(() => null)) as AckShape | null;

  if (!ack || ack.ok !== true) {
    const code = ack?.error?.code ?? "internal_error";
    const message =
      ack?.error?.message ?? "The submission could not be stored. This is our fault, not yours — please retry.";
    const retryAfter = Number(response.headers.get("retry-after"));
    return rejection(code, [], {
      message,
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retry_after_seconds: retryAfter } : {}),
    });
  }

  const structured: Record<string, unknown> = {
    status: "accepted",
    submission_id: ack.id,
    endpoint: ack.endpoint,
    submitted_at: ack.submittedAt,
    // Reported here and withheld on the form surface, deliberately. See the
    // note on `OUTPUT_SCHEMA` in `tool.ts`: there is no forgery to tune when
    // the caller chose the surface that decides the answer.
    origin: "agent",
    duplicate: ack.duplicate,
    ...(ack.warnings && ack.warnings.length > 0 ? { warnings: ack.warnings } : {}),
  };

  const summary = ack.duplicate
    ? `Already recorded. This call matched an existing submission (${ack.id}) and was collapsed onto it rather than creating a second lead.`
    : `Submitted. Submission ${ack.id} was stored on endpoint ${ack.endpoint} and stamped origin "agent".`;

  const warningLine =
    ack.warnings && ack.warnings.length > 0
      ? ` Stored with ${ack.warnings.length} warning${ack.warnings.length === 1 ? "" : "s"}: ${ack.warnings.map((issue) => issue.message).join(" ")}`
      : "";

  return {
    content: [{ type: "text", text: `${summary}${warningLine}` }],
    structuredContent: structured,
    isError: false,
  };
}

type AckShape = {
  ok?: boolean;
  id?: string;
  endpoint?: string;
  submittedAt?: string;
  duplicate?: boolean;
  warnings?: { field: string | null; code: string; message: string }[];
  error?: { code?: string; message?: string };
};

/**
 * A refusal the model gets to read.
 *
 * `isError: true` on the *result* rather than a JSON-RPC `error`, because a
 * protocol error is raised inside the client library and typically never
 * reaches the model. A field-level reason is only worth writing if the thing
 * that can act on it sees it.
 */
function rejection(
  code: string,
  errors: ValidationIssue[],
  extra: { message: string; retry_after_seconds?: number },
): ToolResult {
  const structured: Record<string, unknown> = {
    status: "rejected",
    code,
    message: extra.message,
    errors: errors.map((issue) => ({
      field: issue.field,
      code: issue.code,
      message: issue.message,
    })),
    ...(extra.retry_after_seconds === undefined
      ? {}
      : { retry_after_seconds: extra.retry_after_seconds }),
  };

  const detail = errors.length > 0 ? ` ${errors.map((issue) => issue.message).join(" ")}` : "";

  return {
    content: [{ type: "text", text: `Not submitted. ${extra.message}${detail}` }],
    structuredContent: structured,
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// The request handed to the write path
// ---------------------------------------------------------------------------

/**
 * The submission, rebuilt as the request `handleSubmission` expects.
 *
 * Headers are carried across rather than invented, so the caller's IP still
 * reaches the rate limiter and the hash, and its `User-Agent` still reaches the
 * `user_agent` column. The three that are replaced are replaced because they
 * describe the *envelope* we just unwrapped, not the payload we are handing on.
 */
function submissionRequest(
  request: Request,
  endpointPublicId: string,
  values: Record<string, unknown>,
  rpc: RpcRequest,
): Request {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/\/mcp\/?$/, "");

  const headers = new Headers();
  for (const [key, value] of request.headers) {
    // `content-*` described the JSON-RPC envelope; `accept` described what the
    // agent wanted back from this route, not from the write path.
    if (key === "content-type" || key === "content-length" || key === "accept") continue;
    headers.set(key, value);
  }
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("accept", "application/json");

  // An agent that wants a retry to be safe can say so, either as an HTTP header
  // (already carried across above) or in `_meta`, which is the only place an
  // MCP client can reliably put one.
  const key = metaString(rpc, META_IDEMPOTENCY);
  if (key && !headers.has("idempotency-key")) headers.set("idempotency-key", key);

  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(values),
  });
}

/**
 * What the caller says it is.
 *
 * Recorded on the submission as the `declared_agent` reason and never trusted —
 * `decideOrigin` is explicit that an agent can call itself anything. It is not
 * required either: the stamp came from the surface, so naming yourself is a
 * courtesy that makes an inbox readable, not a credential.
 *
 * Three places, in order of how deliberate they are: an explicit `_meta` key,
 * an explicit header, and finally the `User-Agent` — which `decideOrigin`
 * already falls back to on its own, so it is not read here.
 */
function agentDeclaration(rpc: RpcRequest, headers: Headers): string | null {
  const declared = metaString(rpc, META_AGENT);
  if (declared) return declared;

  const header = headers.get("x-agent-identity") ?? headers.get("x-mcp-client");
  const trimmed = header?.trim();
  return trimmed ? trimmed : null;
}

/**
 * A `_meta` value, as a string.
 *
 * `{ name, version }` is accepted alongside a bare string because that is the
 * shape MCP already uses for `clientInfo`, and an agent copying its own
 * identity across should not have to reformat it.
 */
function metaString(rpc: RpcRequest, key: string): string | null {
  const meta = rpc.params._meta;
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>)[key];

  if (typeof value === "string") return value.trim() === "" ? null : value.trim();

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const version = typeof record.version === "string" ? record.version.trim() : "";
    if (name === "") return null;
    return version === "" ? name : `${name}/${version}`;
  }

  return null;
}

// ---------------------------------------------------------------------------

function activeDocument(endpoint: ResolvedEndpoint): FormSchemaDocument | null {
  return endpoint.activeSchema?.document ?? null;
}

function toolContext(endpointPublicId: string, options: ManifestOptions, request: Request) {
  return {
    endpointPublicId,
    submitUrl: submitUrlFor(endpointPublicId, options, request),
  };
}

/** Where a browser posts the same form. Derived from this URL, minus `/mcp`. */
function submitUrlFor(
  endpointPublicId: string,
  options: ManifestOptions,
  request: Request,
): string {
  if (options.submitUrl) return options.submitUrl;
  try {
    const url = new URL(request.url);
    url.pathname = url.pathname.replace(/\/mcp\/?$/, "");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return `/e/${endpointPublicId}`;
  }
}

export type { ManifestTool };
