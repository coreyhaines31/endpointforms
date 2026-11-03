import { eq } from "drizzle-orm";
import { z } from "zod";

import { unsafeDb } from "../../db/client.ts";
import { users, workspaces } from "../../db/schema.ts";
import { requestEmailCode, type Mailer } from "../auth/email-code.ts";
import { readBodyCapped } from "../ingest/body.ts";
import { clientIp, hashIp } from "../ingest/client.ts";
import { isIngestError } from "../ingest/errors.ts";
import { checkRateLimit } from "../ingest/rate-limit.ts";
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "../manifest/handler.ts";
import { parseRpc, RPC, rpcError, rpcResult, type RpcId, type RpcRequest } from "../manifest/jsonrpc.ts";
import { createVerdictApiKey, VerdictKeyError } from "../verdict/key-store.ts";
import { createEndpoint, getEndpointByPublicId } from "../workspaces/endpoints.ts";
import { endpointUrl } from "../workspaces/endpoint-url.ts";
import { listEndpoints } from "../workspaces/queries.ts";
import {
  AccountAuthError,
  authenticateAccountKey,
  readApiKeyHeader,
  requireScope,
  type AccountCaller,
} from "./auth.ts";
import { completeSignup } from "./onboarding.ts";
import { grantableScopes, isScope, SCOPES, type Scope } from "./scopes.ts";

/**
 * The account MCP server, `POST /api/mcp` (#128).
 *
 * Where the per-endpoint Manifest server (`/e/{id}/mcp`) lets an agent *fill
 * in* a form, this one lets an agent *set one up*: sign someone up, create an
 * endpoint, hand back the snippet and a key — without anybody opening a
 * browser. The one step outside the chat is reading a six-digit code from an
 * inbox, which is also the step that proves the address belongs to the person
 * in the chat.
 *
 * Stateless JSON-RPC over HTTP, same as Manifest: no session, no stream, one
 * request per POST. Signing up needs no key; everything after it takes the key
 * `verify_signup` returned, as `Authorization: Bearer efv2.<id>.<secret>`.
 */

export const ACCOUNT_SERVER_VERSION = "1.0.0";

export type AccountMcpOptions = {
  /** Replaces the mail transport in tests. Production sends through PostShiba. */
  send?: Mailer;
  /** e.g. `endpointforms.app`. */
  renderDomain?: string;
  /** e.g. `https://app.endpointforms.com`. */
  appUrl?: string;
  now?: () => Date;
};

function renderDomain(options: AccountMcpOptions): string {
  return options.renderDomain ?? process.env.NEXT_PUBLIC_RENDER_DOMAIN ?? "endpointforms.app";
}

function appUrl(options: AccountMcpOptions): string {
  return options.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://app.endpointforms.com";
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const RATE_LIMIT = { windowMs: 60_000, endpoint: 100_000, ip: 60, endpointIp: 60 };

function corsHeaders(request: Request): Record<string, string> {
  return {
    "access-control-allow-origin": request.headers.get("origin") ?? "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers":
      request.headers.get("access-control-request-headers") ??
      "content-type, accept, authorization, x-api-key, mcp-protocol-version, mcp-session-id",
    "access-control-expose-headers": "retry-after, mcp-protocol-version",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(request: Request, status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(request),
      ...extra,
    },
  });
}

export function handleAccountMcpPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function handleAccountMcpUnsupportedMethod(request: Request): Response {
  return json(
    request,
    405,
    {
      ok: false,
      error: {
        code: "method_not_allowed",
        message:
          'This is the Endpoint Forms account MCP server. POST a JSON-RPC 2.0 request — "tools/list" to see what it can do, "tools/call" to do it. There is no server-initiated stream, so GET is not supported.',
      },
    },
    { allow: "POST, OPTIONS" },
  );
}

export async function handleAccountMcpRequest(
  request: Request,
  options: AccountMcpOptions = {},
): Promise<Response> {
  const ipHash = hashIp(clientIp(request.headers));
  const limit = checkRateLimit("account-mcp", ipHash ? `account-mcp:${ipHash}` : null, RATE_LIMIT);
  if (!limit.allowed) {
    const retryAfter = limit.retryAfter ?? 60;
    return json(
      request,
      429,
      rpcError(null, RPC.SERVER_ERROR, `Too many requests. Retry in ${retryAfter} seconds.`, {
        retry_after_seconds: retryAfter,
      }),
      { "retry-after": String(retryAfter) },
    );
  }

  let payload: unknown;
  try {
    const bytes = await readBodyCapped(request);
    if (bytes.byteLength === 0) {
      return json(request, 400, rpcError(null, RPC.INVALID_REQUEST, "The request had no body. POST a JSON-RPC 2.0 message."));
    }
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (isIngestError(error)) {
      return json(request, error.status, rpcError(null, RPC.INVALID_REQUEST, error.message), error.headers);
    }
    return json(request, 400, rpcError(null, RPC.PARSE_ERROR, "The request body is not valid JSON."));
  }

  const parsed = parseRpc(payload);
  if (!parsed.ok) {
    return json(request, 400, rpcError(parsed.failure.id, parsed.failure.code, parsed.failure.message));
  }

  const rpc = parsed.request;
  if (rpc.id === null) return new Response(null, { status: 202, headers: corsHeaders(request) });

  try {
    return json(request, 200, await dispatch(request, rpc, rpc.id, options));
  } catch (error) {
    console.error(`[account-mcp] unhandled error in ${JSON.stringify(rpc.method)}`, error);
    return json(
      request,
      500,
      rpcError(rpc.id, RPC.INTERNAL_ERROR, "The request could not be processed. This is our fault, not yours — please retry."),
    );
  }
}

async function dispatch(request: Request, rpc: RpcRequest, id: RpcId, options: AccountMcpOptions) {
  switch (rpc.method) {
    case "initialize":
      return rpcResult(id, initializeResult(rpc));
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) });
    case "tools/call":
      return rpcResult(id, await callTool(request, rpc, options));
    default:
      return rpcError(
        id,
        RPC.METHOD_NOT_FOUND,
        `This server implements initialize, ping, tools/list and tools/call. It does not implement ${JSON.stringify(rpc.method)}.`,
      );
  }
}

export const ACCOUNT_INSTRUCTIONS = [
  "This server sets up Endpoint Forms for a business: an account, a workspace, form endpoints, and API keys — entirely from this conversation.",
  "To sign someone up or in: call start_signup with their work email. A 6-digit code is emailed to them. Ask them to read it to you — never guess or invent it — then call verify_signup with the email and the code.",
  "verify_signup returns an API key, shown once. Keep it for the rest of this conversation and send it as `Authorization: Bearer <key>` on every other tool. Tell the person to store it somewhere safe; it cannot be shown again.",
  "Then: create_endpoint makes a form endpoint and returns the HTML to paste into their site. Submissions are emailed to the person who verified the code.",
].join("\n\n");

function initializeResult(rpc: RpcRequest) {
  const requested = rpc.params.protocolVersion;
  const protocolVersion =
    typeof requested === "string" && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
      ? requested
      : LATEST_PROTOCOL_VERSION;

  return {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo: { name: "endpointforms-account", title: "Endpoint Forms", version: ACCOUNT_SERVER_VERSION },
    instructions: ACCOUNT_INSTRUCTIONS,
  };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
  isError: boolean;
};

function ok(text: string, structured: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured, isError: false };
}

function fail(code: string, message: string, extra: Record<string, unknown> = {}): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { status: "error", code, message, ...extra },
    isError: true,
  };
}

type ToolContext = {
  request: Request;
  options: AccountMcpOptions;
  now: Date;
  /** Resolves the bearer key; throws `AccountAuthError` with a sentence for the agent. */
  caller: () => Promise<AccountCaller>;
};

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

const emailArg = { type: "string", format: "email", description: "The person's work email address." };

const TOOLS: Tool[] = [
  {
    name: "start_signup",
    title: "Start sign-up or sign-in",
    description:
      "Emails a 6-digit code to this address. Works the same whether or not the address already has an account. Next, ask the person for the code and call verify_signup. No API key needed.",
    inputSchema: { type: "object", properties: { email: emailArg }, required: ["email"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    run: startSignup,
  },
  {
    name: "verify_signup",
    title: "Verify the code",
    description:
      "Checks the 6-digit code the person read from their email. Creates their account and a workspace if they are new, and returns an API key (shown once) for every other tool. No API key needed.",
    inputSchema: {
      type: "object",
      properties: {
        email: emailArg,
        code: { type: "string", description: "The 6-digit code from the email, exactly as the person read it." },
        company_name: {
          type: "string",
          description: "Optional. Names the new workspace. Ignored for an existing account.",
        },
        workspace: {
          type: "string",
          description: "Optional. The slug of the workspace to get a key for, when the account owns more than one.",
        },
        client_name: { type: "string", description: "Optional. Your client's name, shown next to the key in settings." },
      },
      required: ["email", "code"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: verifySignup,
  },
  {
    name: "whoami",
    title: "Show the key's workspace",
    description: "Returns the workspace this API key belongs to and what it is allowed to do.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: whoami,
  },
  {
    name: "list_endpoints",
    title: "List endpoints",
    description: "Lists the workspace's form endpoints with the URL each one receives submissions at. Needs endpoints:read.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: listEndpointsTool,
  },
  {
    name: "create_endpoint",
    title: "Create an endpoint",
    description:
      "Creates a form endpoint and returns the HTML to paste into a site. Submissions are emailed to the person who created the API key. Needs endpoints:write.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: 'What the form is for, e.g. "Contact" or "Demo request".' } },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: createEndpointTool,
  },
  {
    name: "get_install_snippet",
    title: "Get the install snippet",
    description: "Returns the HTML form, a curl test command, and the agent (Manifest) URL for one endpoint. Needs endpoints:read.",
    inputSchema: {
      type: "object",
      properties: { endpoint_id: { type: "string", description: "The endpoint's ID, as list_endpoints returns it." } },
      required: ["endpoint_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: getInstallSnippet,
  },
  {
    name: "create_api_key",
    title: "Create another API key",
    description:
      "Mints another key for this workspace — for example an outcomes:write key for a CRM. It can only have scopes this key has. Shown once. Needs keys:write.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: 'What will use it, e.g. "HubSpot workflow".' },
        scopes: {
          type: "array",
          items: { type: "string", enum: [...SCOPES] },
          description: 'Defaults to ["outcomes:write"].',
        },
      },
      required: ["label"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: createApiKeyTool,
  },
];

async function callTool(request: Request, rpc: RpcRequest, options: AccountMcpOptions): Promise<ToolResult> {
  const name = typeof rpc.params.name === "string" ? rpc.params.name : null;
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return fail(
      "unknown_tool",
      `${name === null ? "A tools/call needs a \"name\"." : `There is no tool called ${JSON.stringify(name)}.`} This server's tools are: ${TOOLS.map((t) => t.name).join(", ")}.`,
    );
  }

  const rawArgs = rpc.params.arguments ?? {};
  if (rawArgs === null || typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return fail("invalid_arguments", '"arguments" must be an object.');
  }

  const now = options.now?.() ?? new Date();
  let cached: Promise<AccountCaller> | null = null;
  const ctx: ToolContext = {
    request,
    options,
    now,
    caller: () =>
      (cached ??= authenticateAccountKey(readApiKeyHeader(request.headers), {
        ip: clientIp(request.headers),
        now,
      })),
  };

  try {
    return await tool.run(rawArgs as Record<string, unknown>, ctx);
  } catch (error) {
    if (error instanceof AccountAuthError) return fail("unauthorized", error.message);
    if (error instanceof z.ZodError) {
      return fail("invalid_arguments", error.issues.map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`).join(" "));
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Tool bodies
// ---------------------------------------------------------------------------

const startSchema = z.object({ email: z.string().trim().min(3).max(254) });

async function startSignup(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const { email } = startSchema.parse(args);
  const result = await requestEmailCode({
    email,
    ipHash: hashIp(clientIp(ctx.request.headers)),
    send: ctx.options.send,
    now: ctx.now,
  });

  if (result.ok) {
    const minutes = Math.round(result.expiresInSeconds / 60);
    return ok(
      `A 6-digit code is on its way to ${email.trim()}. It expires in ${minutes} minutes. Ask the person to read it to you, then call verify_signup with the email and the code. If it has not arrived in a minute, have them check spam before you ask for another.`,
      { status: "code_sent", email: email.trim().toLowerCase(), expires_in_seconds: result.expiresInSeconds },
    );
  }

  switch (result.reason) {
    case "invalid-email":
      return fail("invalid_email", "That does not look like an email address. Ask the person for the address they use at work.");
    case "rate-limited":
      return fail(
        "rate_limited",
        `Too many codes have been sent to that address or from here recently. Try again in ${Math.ceil(result.retryAfterSeconds / 60)} minutes — or, if the person already has a code from the last hour, use the newest one.`,
        { retry_after_seconds: result.retryAfterSeconds },
      );
    case "mail-failed":
      return fail(
        "email_unavailable",
        result.mail.configuration
          ? "This deployment cannot send email right now, so no code was sent and nothing was created. Signing up from a chat needs email; try again later or sign up at the website."
          : "The email with the code could not be sent, so nothing was created. Try start_signup again in a minute.",
      );
  }
}

const verifySchema = z.object({
  email: z.string().trim().min(3).max(254),
  code: z.string().trim().min(1).max(20),
  company_name: z.string().trim().max(120).optional(),
  workspace: z.string().trim().max(63).optional(),
  client_name: z.string().trim().max(200).optional(),
});

async function verifySignup(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const input = verifySchema.parse(args);
  const result = await completeSignup({
    email: input.email,
    code: input.code,
    workspace: input.workspace,
    companyName: input.company_name,
    clientName: input.client_name || ctx.request.headers.get("user-agent")?.slice(0, 200) || null,
    now: ctx.now,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "invalid-code":
        return fail(
          "invalid_code",
          "That code is not valid. It may be mistyped, expired (codes last 10 minutes), already used, or replaced by a newer one. Ask the person to check the newest email, or call start_signup for a fresh code. After 5 wrong tries a code stops working.",
        );
      case "choose-workspace":
        return fail(
          "choose_workspace",
          `The code was correct, but this account owns several workspaces: ${result.workspaces.map((w) => `${w.slug} (${w.name})`).join(", ")}. Ask which one, then call start_signup again and pass the slug as "workspace" to verify_signup. The code has been used, so a new one is needed.`,
          { workspaces: result.workspaces },
        );
      case "not-a-member":
        return fail(
          "not_a_member",
          `This account is not a member of a workspace called ${JSON.stringify(result.workspace)}. Call start_signup again and leave "workspace" out, or use a slug the account belongs to. The code has been used, so a new one is needed.`,
        );
      case "not-owner":
        return fail(
          "not_owner",
          `This account is a member of ${JSON.stringify(result.workspace)} but not an owner, and only owners can create API keys. Ask a workspace owner to invite them as an owner, or to create a key in workspace settings.`,
        );
      case "too-many-keys":
        return fail("too_many_keys", result.message);
    }
  }

  const base = appUrl(ctx.options);
  return ok(
    [
      result.user.created ? `Account created for ${result.user.email}.` : `Signed in as ${result.user.email}.`,
      result.workspace.created
        ? `New workspace "${result.workspace.name}" (${result.workspace.slug}).`
        : `Workspace "${result.workspace.name}" (${result.workspace.slug}).`,
      `API key: ${result.apiKey}`,
      "This key is shown once and cannot be recovered. Send it as `Authorization: Bearer <key>` on the other tools, and tell the person to store it somewhere safe. They can revoke it any time in workspace settings.",
      `They can sign in to the web app at ${base}/login with the same email — a code is sent there too, no password needed.`,
    ].join("\n\n"),
    {
      status: "verified",
      account_created: result.user.created,
      email: result.user.email,
      workspace: {
        slug: result.workspace.slug,
        name: result.workspace.name,
        created: result.workspace.created,
        url: `${base}/app/${result.workspace.slug}`,
      },
      api_key: result.apiKey,
      scopes: result.scopes,
    },
  );
}

async function whoami(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const caller = await ctx.caller();
  const [workspace] = await unsafeDb
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, caller.workspaceId))
    .limit(1);

  return ok(`This key belongs to workspace "${workspace?.name ?? caller.workspaceSlug}" (${caller.workspaceSlug}). Scopes: ${caller.scopes.join(", ")}.`, {
    workspace: { slug: caller.workspaceSlug, name: workspace?.name ?? null, url: `${appUrl(ctx.options)}/app/${caller.workspaceSlug}` },
    scopes: caller.scopes,
  });
}

function describeEndpoint(slug: string, publicId: string, name: string, options: AccountMcpOptions) {
  const url = endpointUrl(slug, renderDomain(options), publicId);
  return {
    id: publicId,
    name,
    submit_url: url,
    manifest_url: `${url}/mcp`,
    dashboard_url: `${appUrl(options)}/app/${slug}/endpoints/${publicId}`,
  };
}

function installSnippet(url: string) {
  return {
    html: [
      `<form action="${url}" method="POST">`,
      `  <input type="email" name="email" required>`,
      `  <textarea name="message"></textarea>`,
      `  <button type="submit">Send</button>`,
      `</form>`,
    ].join("\n"),
    curl: [`curl -X POST ${url} \\`, `  -d "email=you@example.com" \\`, `  -d "message=Testing the endpoint"`].join("\n"),
  };
}

async function listEndpointsTool(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const caller = await ctx.caller();
  requireScope(caller, "endpoints:read");

  const rows = await listEndpoints(caller.workspaceId);
  const items = rows.map((row) => describeEndpoint(caller.workspaceSlug, row.publicId, row.name, ctx.options));

  return ok(
    items.length === 0
      ? "This workspace has no endpoints yet. create_endpoint makes one."
      : items.map((item) => `${item.name} — ${item.id} — ${item.submit_url}`).join("\n"),
    { endpoints: items },
  );
}

const createEndpointSchema = z.object({ name: z.string().trim().min(1).max(120) });

async function createEndpointTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const caller = await ctx.caller();
  requireScope(caller, "endpoints:write");
  const { name } = createEndpointSchema.parse(args);

  // The notification goes to the address that verified the code — read from
  // the key's creator, never from an argument. An address in an argument is
  // whatever the agent was told, and this one decides where strangers' leads go.
  const notifyEmail = caller.createdByUserId ? await userEmail(caller.createdByUserId) : null;

  const created = await createEndpoint(caller.workspaceId, name, { notifyEmail });
  const endpoint = describeEndpoint(caller.workspaceSlug, created.publicId, name, ctx.options);
  const snippet = installSnippet(endpoint.submit_url);

  return ok(
    [
      `Created "${name}". Paste this into the site, or point an existing form's action at ${endpoint.submit_url}:`,
      snippet.html,
      created.notified
        ? `Each submission is emailed to ${created.notified}.`
        : "No notification email is set up for this endpoint; submissions are in the dashboard.",
      `Dashboard: ${endpoint.dashboard_url}`,
    ].join("\n\n"),
    { endpoint, snippet, notifies: created.notified },
  );
}

const snippetSchema = z.object({ endpoint_id: z.string().trim().min(1).max(64) });

async function getInstallSnippet(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const caller = await ctx.caller();
  requireScope(caller, "endpoints:read");
  const { endpoint_id } = snippetSchema.parse(args);

  const found = await getEndpointByPublicId(caller.workspaceId, endpoint_id);
  if (!found) {
    return fail("not_found", `No endpoint ${JSON.stringify(endpoint_id)} in this workspace. list_endpoints shows the ones that exist.`);
  }

  const endpoint = describeEndpoint(caller.workspaceSlug, found.publicId, found.name, ctx.options);
  const snippet = installSnippet(endpoint.submit_url);
  const archivedNote = found.archivedAt ? "\n\nThis endpoint is archived and refuses submissions until it is restored in the dashboard." : "";

  return ok(`${snippet.html}\n\nTest it:\n\n${snippet.curl}${archivedNote}`, {
    endpoint,
    snippet,
    archived: Boolean(found.archivedAt),
    has_schema: found.hasSchema,
  });
}

const createKeySchema = z.object({
  label: z.string().trim().min(1).max(80),
  scopes: z.array(z.string()).min(1).max(SCOPES.length).optional(),
});

async function createApiKeyTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const caller = await ctx.caller();
  requireScope(caller, "keys:write");
  const input = createKeySchema.parse(args);

  const requested = input.scopes ?? ["outcomes:write"];
  const unknown = requested.filter((scope) => !isScope(scope));
  if (unknown.length > 0) {
    return fail("invalid_scope", `Unknown scope: ${unknown.join(", ")}. Valid scopes are ${SCOPES.join(", ")}.`);
  }

  const grant = grantableScopes(requested as Scope[], caller.scopes);
  if (!grant.ok) {
    return fail("scope_not_held", `This key cannot grant ${grant.missing.join(", ")} because it does not hold it.`);
  }

  try {
    const created = await createVerdictApiKey({
      workspaceId: caller.workspaceId,
      label: input.label,
      createdByUserId: caller.createdByUserId,
      scopes: grant.scopes,
      createdVia: "mcp",
      clientName: ctx.request.headers.get("user-agent"),
      now: ctx.now,
    });

    return ok(
      `New key "${input.label}" (${grant.scopes.join(", ")}): ${created.key}\n\nShown once. It can be revoked in workspace settings.`,
      { api_key: created.key, label: input.label, scopes: grant.scopes },
    );
  } catch (error) {
    if (error instanceof VerdictKeyError) return fail(error.code, error.message);
    throw error;
  }
}

async function userEmail(userId: string): Promise<string | null> {
  const [row] = await unsafeDb.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.email ?? null;
}
