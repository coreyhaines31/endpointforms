/**
 * Manifest, the endpoint (#32).
 *
 * `tests/manifest-tool.test.mts` covers the generation and the envelope with no
 * database. This file covers the thing that can only be checked against a row:
 *
 *   - An agent discovers the tool and submits, and a lead exists afterwards.
 *   - **The same payload through the two doors is stamped differently.** That
 *     is the entire mechanism, and it is asserted on the stored `origin`
 *     column, not on anything the response says.
 *   - **The surface cannot be claimed.** A caller posting to `/e/{id}` cannot
 *     talk its way into `agent`, with a field named `surface`, a header naming
 *     it, or a perfect browser header set. A caller here cannot claim `human`.
 *   - A rejection carries a reason per field, and stores nothing.
 *   - The caps and the rate limit apply here too, because they are the same
 *     ones — this route does not have its own copies.
 *
 * The handler is plain Web `Request`/`Response` and no Next APIs, so it is
 * called directly — no server, no port.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */

// Read at call time by the modules under test. The rate limit gets its own
// section that sets these deliberately and puts them back.
process.env.SUBMISSION_IP_SALT = "test-salt";
process.env.INGEST_RATE_LIMIT_ENDPOINT_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_IP_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE = "1000000";

import { and, eq, isNull } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { newEndpointPublicId, newId } from "../src/db/ids.ts";
import { endpoints, formSchemas, submissions, users, workspaces } from "../src/db/schema.ts";
import { handleSubmission } from "../src/lib/ingest/handler.ts";
import { resetRateLimits } from "../src/lib/ingest/rate-limit.ts";
import {
  handleManifestPreflight,
  handleManifestRequest,
  handleManifestUnsupportedMethod,
} from "../src/lib/manifest/handler.ts";
import type { OriginReason } from "../src/lib/origin/types.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (good) pass++;
  else fail++;
  console.log(`  ${good ? "PASS" : "FAIL"}  ${name}`);
  if (!good) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const SLUG = "manifest-test-workspace";
const EMAIL = "manifest@test.invalid";
const BASE = "https://acme.endpointforms.test";

type Fixture = { workspaceId: string; schemaed: string; plain: string };

async function cleanup() {
  await unsafeDb.delete(workspaces).where(eq(workspaces.slug, SLUG));
  await unsafeDb.delete(users).where(eq(users.email, EMAIL));
}

async function createFixture(): Promise<Fixture> {
  const workspaceId = newId();
  const schemaedId = newId();
  const plainId = newId();
  const schemaVersionId = newId();

  await unsafeDb.insert(workspaces).values({ id: workspaceId, slug: SLUG, name: SLUG });
  await unsafeDb.insert(users).values({ id: newId(), email: EMAIL });

  const schemaed = newEndpointPublicId();
  const plain = newEndpointPublicId();

  await unsafeDb.insert(endpoints).values([
    { id: schemaedId, workspaceId, publicId: schemaed, name: "Demo request" },
    { id: plainId, workspaceId, publicId: plain, name: "No schema" },
  ]);

  await unsafeDb.insert(formSchemas).values({
    id: schemaVersionId,
    workspaceId,
    endpointId: schemaedId,
    version: 1,
    fields: {
      formatVersion: 1,
      name: "Demo request",
      fields: [
        { key: "work_email", label: "Work email", type: "email", required: true },
        { key: "company", label: "Company", type: "text", required: true },
        {
          key: "ad_spend",
          label: "Monthly ad spend",
          type: "select",
          required: false,
          options: [
            { value: "5k-25k", label: "$5k – $25k" },
            { value: "25k+", label: "$25k and up" },
          ],
        },
        { key: "consent", label: "Keep me updated", type: "checkbox", required: false },
      ],
    },
    mode: "warn",
    source: "html_import",
  });

  await unsafeDb
    .update(endpoints)
    .set({ activeSchemaVersionId: schemaVersionId })
    .where(eq(endpoints.id, schemaedId));

  return { workspaceId, schemaed, plain };
}

async function rowsFor(publicId: string) {
  const endpoint = await unsafeDb
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(eq(endpoints.publicId, publicId))
    .limit(1);
  if (!endpoint[0]) return [];
  return unsafeDb
    .select()
    .from(submissions)
    .where(and(eq(submissions.endpointId, endpoint[0].id), isNull(submissions.deletedAt)))
    .orderBy(submissions.createdAt);
}

async function rowById(publicId: string) {
  const rows = await unsafeDb
    .select()
    .from(submissions)
    .where(eq(submissions.publicId, publicId))
    .limit(1);
  return rows[0];
}

/**
 * The row a submission produced, found by its idempotency key.
 *
 * Needed because a browser-shaped post gets a 303 with no body — which is the
 * correct answer for it, and the reason the comparison below cannot read the id
 * out of the response without changing the very headers it is comparing.
 */
async function rowByKey(key: string) {
  const rows = await unsafeDb
    .select()
    .from(submissions)
    .where(eq(submissions.idempotencyKey, key))
    .limit(1);
  return rows[0];
}

/** Key order in jsonb is not meaningful, so it must not decide an assertion. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

// ---------------------------------------------------------------------------
// Callers
// ---------------------------------------------------------------------------

/**
 * The nine copied headers that scored +8 and were stamped Human in
 * `docs/23-origin-findings.md` (case A3). Reused verbatim so that "the same
 * request, through two doors" means literally the same request.
 */
const CHROME: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "accept-encoding": "gzip, deflate, br, zstd",
  origin: "https://acme.example",
  referer: "https://acme.example/contact",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "cross-site",
};

/** What an MCP client over HTTP actually sends. */
function mcpRequest(
  endpointId: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${BASE}/e/${endpointId}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-forwarded-for": "203.0.113.10",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

let nextRpcId = 1;

async function rpc(
  endpointId: string,
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Promise<{ status: number; body: RpcResponse; response: Response }> {
  const request = mcpRequest(endpointId, { jsonrpc: "2.0", id: nextRpcId++, method, params }, headers);
  const response = await handleManifestRequest(request, endpointId);
  const text = await response.clone().text();
  return {
    status: response.status,
    body: text === "" ? ({} as RpcResponse) : (JSON.parse(text) as RpcResponse),
    response,
  };
}

type RpcResponse = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: {
    tools?: { name: string; description: string; inputSchema: Record<string, unknown> }[];
    _meta?: Record<string, string>;
    content?: { type: string; text: string }[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
    protocolVersion?: string;
    serverInfo?: Record<string, unknown>;
    instructions?: string;
    capabilities?: Record<string, unknown>;
  };
  error?: { code: number; message: string; data?: unknown };
};

/** The same submission a browser makes, so the two doors can be compared. */
function formPost(
  endpointId: string,
  values: Record<string, string>,
  headers: Record<string, string>,
): Request {
  return new Request(`${BASE}/e/${endpointId}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": "203.0.113.10",
      ...headers,
    },
    body: new URLSearchParams(values).toString(),
  });
}

function reasonFor(row: { originReasons: unknown }, code: string): OriginReason | undefined {
  const reasons = (row.originReasons ?? []) as OriginReason[];
  return reasons.find((reason) => reason.code === code);
}

// ---------------------------------------------------------------------------

async function main() {
  await cleanup();
  const fx = await createFixture();

  await discovery(fx);
  await submitting(fx);
  await theSurfaceCannotBeClaimed(fx);
  await rejections(fx);
  await caps(fx);
  await rateLimiting(fx);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------

async function discovery(fx: Fixture) {
  console.log("\nDiscovery");

  const init = await rpc(fx.schemaed, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "acme-agent", version: "1.0" },
  });
  t("initialize answers 200", init.status, 200);
  t("and echoes a protocol revision it speaks", init.body.result?.protocolVersion, "2025-06-18");
  ok("and advertises the tools capability", "tools" in (init.body.result?.capabilities ?? {}), init.body.result);
  ok(
    "its instructions say what the stamp will be",
    (init.body.result?.instructions ?? "").includes('"agent"'),
    init.body.result?.instructions,
  );

  const unknownVersion = await rpc(fx.schemaed, "initialize", { protocolVersion: "1999-01-01" });
  ok(
    "an unknown protocol revision gets ours back rather than an echo",
    unknownVersion.body.result?.protocolVersion === "2025-06-18",
    unknownVersion.body.result,
  );

  const listed = await rpc(fx.schemaed, "tools/list");
  const tools = listed.body.result?.tools ?? [];
  t("tools/list publishes exactly one tool", tools.length, 1);
  t("named from the form", tools[0]?.name, "submit_demo_request");
  t(
    "whose required fields are the schema's required fields",
    (tools[0]?.inputSchema as { required?: string[] })?.required,
    ["work_email", "company"],
  );
  ok(
    "and whose properties are the schema's fields",
    Object.keys((tools[0]?.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {})
      .sort()
      .join(",") === "ad_spend,company,consent,work_email",
    tools[0]?.inputSchema,
  );

  // Issue #50: an endpoint works with no schema. It has nothing to publish, and
  // saying so is not the same as being broken.
  const empty = await rpc(fx.plain, "tools/list");
  t("an endpoint with no schema answers 200, not an error", empty.status, 200);
  t("with an empty tool list", empty.body.result?.tools, []);
  ok("and no error object at all", empty.body.error === undefined, empty.body);
  const notice = empty.body.result?._meta?.["endpointforms.com/notice"] ?? "";
  ok("the notice says there is no schema yet", notice.includes("has not declared a form schema"), notice);
  ok(
    "and that the plain endpoint still accepts posts",
    notice.includes(`/e/${fx.plain}`),
    notice,
  );

  const ping = await rpc(fx.schemaed, "ping");
  t("ping answers with an empty result", ping.body.result, {});

  const unknownMethod = await rpc(fx.schemaed, "resources/list");
  ok(
    "an unimplemented method is a protocol error naming what does exist",
    unknownMethod.body.error?.code === -32601 &&
      unknownMethod.body.error.message.includes("tools/call"),
    unknownMethod.body.error,
  );

  // A notification takes no answer. Replying to `notifications/initialized`
  // with a result is a protocol violation some clients treat as fatal.
  const notification = await handleManifestRequest(
    mcpRequest(fx.schemaed, { jsonrpc: "2.0", method: "notifications/initialized" }),
    fx.schemaed,
  );
  t("a notification is accepted with no body", notification.status, 202);
  t("and really has no body", await notification.text(), "");

  const get = handleManifestUnsupportedMethod(
    new Request(`${BASE}/e/${fx.schemaed}/mcp`),
    fx.schemaed,
  );
  t("GET is 405", get.status, 405);
  t("and says how to use the endpoint", get.headers.get("allow"), "POST, OPTIONS");

  const preflight = handleManifestPreflight(
    new Request(`${BASE}/e/${fx.schemaed}/mcp`, {
      method: "OPTIONS",
      headers: { origin: "https://agent.example" },
    }),
  );
  t("a preflight is answered", preflight.status, 204);
  t(
    "with the calling origin reflected",
    preflight.headers.get("access-control-allow-origin"),
    "https://agent.example",
  );
}

// ---------------------------------------------------------------------------

async function submitting(fx: Fixture) {
  console.log("\nAn agent submits a lead");

  const called = await rpc(
    fx.schemaed,
    "tools/call",
    {
      name: "submit_demo_request",
      arguments: {
        work_email: "buyer@northgate.test",
        company: "Northgate",
        ad_spend: "5k-25k",
        consent: true,
      },
      _meta: { "endpointforms.com/agent": "acme-agent/1.0" },
    },
    { "idempotency-key": "manifest-happy-path" },
  );

  const structured = called.body.result?.structuredContent ?? {};
  t("the call succeeds", called.status, 200);
  t("and is not an error result", called.body.result?.isError, false);
  t("the status is accepted", structured.status, "accepted");
  t("the stamp is reported back", structured.origin, "agent");
  ok("a submission id is returned", typeof structured.submission_id === "string", structured);
  ok(
    "and the text content says so too, for a client that only reads content",
    (called.body.result?.content?.[0]?.text ?? "").startsWith("Submitted."),
    called.body.result?.content,
  );

  const row = await rowById(String(structured.submission_id));
  ok("the row exists", row !== undefined, structured);
  t("stamped agent in the database, not merely in the reply", row?.origin, "agent");

  const surface = reasonFor(row!, "surface");
  t("the reason names the surface", surface?.observed, "manifest");
  const declared = reasonFor(row!, "declared_agent");
  t("the identity the caller offered is recorded", declared?.observed, "acme-agent/1.0");
  t("and recorded as unverified, because it is", declared?.weight, 0);

  // The row has to be shaped like a row a page wrote, or "one definition, two
  // surfaces" is false at the only place it can be checked.
  t(
    "the values are what the rendered page would have posted",
    canonical(row?.values),
    canonical({
      work_email: "buyer@northgate.test",
      company: "Northgate",
      ad_spend: "5k-25k",
      // A ticked checkbox posts "on", not `true`. A row written by an agent has
      // to be indistinguishable in shape from a row written by the page.
      consent: "on",
    }),
  );

  // An agent that identifies itself only through a header is still recorded.
  const viaHeader = await rpc(
    fx.schemaed,
    "tools/call",
    {
      name: "submit_demo_request",
      arguments: { work_email: "second@northgate.test", company: "Northgate" },
    },
    { "idempotency-key": "manifest-header-identity", "x-agent-identity": "research-bot/2.3" },
  );
  const headerRow = await rowById(
    String(viaHeader.body.result?.structuredContent?.submission_id ?? ""),
  );
  t(
    "an identity offered in a header is recorded too",
    reasonFor(headerRow!, "declared_agent")?.observed,
    "research-bot/2.3",
  );

  // Anonymity is allowed. The surface is the stamp; naming yourself is manners.
  const anonymous = await rpc(
    fx.schemaed,
    "tools/call",
    {
      name: "submit_demo_request",
      arguments: { work_email: "third@northgate.test", company: "Northgate" },
    },
    { "idempotency-key": "manifest-anonymous" },
  );
  const anonRow = await rowById(
    String(anonymous.body.result?.structuredContent?.submission_id ?? ""),
  );
  t("a caller that names nothing is still stamped agent", anonRow?.origin, "agent");

  // An agent can make a retry safe, which a browser has no way to do.
  const retried = await rpc(
    fx.schemaed,
    "tools/call",
    {
      name: "submit_demo_request",
      arguments: { work_email: "buyer@northgate.test", company: "Northgate", ad_spend: "5k-25k", consent: true },
      _meta: { "endpointforms.com/idempotency-key": "manifest-happy-path" },
    },
  );
  t(
    "a retry under the same key collapses onto the first lead",
    retried.body.result?.structuredContent?.duplicate,
    true,
  );
  t(
    "and returns the same submission id rather than a second one",
    retried.body.result?.structuredContent?.submission_id,
    structured.submission_id,
  );

  // An undeclared field is stored and reported, exactly as on the human page.
  const warned = await rpc(
    fx.schemaed,
    "tools/call",
    {
      name: "submit_demo_request",
      arguments: { work_email: "fourth@northgate.test", company: "Northgate", department: "growth" },
    },
    { "idempotency-key": "manifest-warning" },
  );
  t("an undeclared field does not prevent acceptance", warned.body.result?.structuredContent?.status, "accepted");
  const warnings = (warned.body.result?.structuredContent?.warnings ?? []) as { field: string }[];
  ok("but it is reported", warnings.some((issue) => issue.field === "department"), warnings);
}

// ---------------------------------------------------------------------------

async function theSurfaceCannotBeClaimed(fx: Fixture) {
  console.log("\nThe surface comes from the route, never from the request");

  // Byte-for-byte the same values, and the same nine Chrome headers that
  // `docs/23-origin-findings.md` measured being stamped Human. Only the door
  // differs. Distinct idempotency keys, so the two are two rows rather than one
  // collapsed onto the other.
  const values = { work_email: "same@payload.test", company: "Northgate" };

  // Answered with a 303 and no body, because that is what a browser-shaped
  // request asks for. The row is read from the database instead, which is the
  // only way to compare the two without altering the headers under comparison.
  const throughForm = await handleSubmission(
    formPost(fx.schemaed, values, { ...CHROME, "idempotency-key": "two-doors-form" }),
    fx.schemaed,
  );
  t("the browser-shaped post is answered with a redirect", throughForm.status, 303);
  const formRow = await rowByKey("two-doors-form");

  const throughManifest = await rpc(
    fx.schemaed,
    "tools/call",
    { name: "submit_demo_request", arguments: values },
    { ...CHROME, "idempotency-key": "two-doors-manifest" },
  );
  const manifestRow = await rowById(
    String(throughManifest.body.result?.structuredContent?.submission_id ?? ""),
  );

  t("the same payload through the form endpoint is not agent", formRow?.origin, "human");
  t("and through the manifest endpoint it is", manifestRow?.origin, "agent");
  t("the values stored are identical", canonical(manifestRow?.values), canonical(formRow?.values));
  ok(
    "so the only thing that separated them was the door",
    formRow?.origin !== manifestRow?.origin &&
      canonical(formRow?.values) === canonical(manifestRow?.values),
    { form: formRow?.origin, manifest: manifestRow?.origin },
  );

  // A caller on the form surface trying every way it has of naming itself.
  const claimed = await handleSubmission(
    formPost(
      fx.schemaed,
      {
        ...values,
        surface: "manifest",
        _surface: "manifest",
        origin: "agent",
        _origin: "agent",
        agent: "acme-agent/1.0",
      },
      {
        ...CHROME,
        "x-origin-surface": "manifest",
        "x-surface": "manifest",
        "x-origin": "agent",
        "x-agent-identity": "acme-agent/1.0",
        "idempotency-key": "claiming-agent",
      },
    ),
    fx.schemaed,
  );
  ok("the claim did not break the submission", claimed.status === 303, claimed.status);
  const claimedRow = await rowByKey("claiming-agent");
  ok(
    "a form-surface caller cannot claim agent with a field or a header",
    claimedRow?.origin !== "agent",
    { origin: claimedRow?.origin, reasons: claimedRow?.originReasons },
  );
  t("its surface reason still says form", reasonFor(claimedRow!, "surface")?.observed, "form");

  // And the reverse: a manifest caller cannot climb back out to human, however
  // browser-shaped it makes itself look. The Chrome header set above already
  // covers this; the explicit claim is the belt.
  const claimedHuman = await rpc(
    fx.schemaed,
    "tools/call",
    {
      name: "submit_demo_request",
      arguments: { ...values, surface: "form", origin: "human" },
      _meta: { "endpointforms.com/agent": "definitely a person" },
    },
    { ...CHROME, "x-origin-surface": "form", "idempotency-key": "claiming-human" },
  );
  const humanClaimRow = await rowById(
    String(claimedHuman.body.result?.structuredContent?.submission_id ?? ""),
  );
  t("a manifest caller cannot claim human", humanClaimRow?.origin, "agent");
  ok(
    "and none of the header weights were even consulted",
    ((humanClaimRow?.originReasons ?? []) as OriginReason[]).every(
      (reason) => reason.code === "surface" || reason.code === "declared_agent",
    ),
    humanClaimRow?.originReasons,
  );
}

// ---------------------------------------------------------------------------

async function rejections(fx: Fixture) {
  console.log("\nA rejection is a structured answer, not a page with a red border");

  const before = (await rowsFor(fx.schemaed)).length;

  const invalid = await rpc(fx.schemaed, "tools/call", {
    name: "submit_demo_request",
    arguments: { work_email: "not-an-email", ad_spend: "50k+" },
  });

  const structured = invalid.body.result?.structuredContent ?? {};
  t("the call is answered, not failed at the protocol level", invalid.status, 200);
  ok("with no JSON-RPC error", invalid.body.error === undefined, invalid.body);
  t("the result is flagged as an error the model should read", invalid.body.result?.isError, true);
  t("the status is rejected", structured.status, "rejected");
  t("with a stable code", structured.code, "schema_validation_failed");

  const errors = (structured.errors ?? []) as { field: string; code: string; message: string }[];
  t(
    "and a reason for each field, naming the field",
    errors.map((issue) => `${issue.field}:${issue.code}`).sort(),
    ["ad_spend:not_an_option", "company:missing_required", "work_email:invalid_email"],
  );
  ok(
    "each reason is a sentence, not a code",
    errors.every((issue) => issue.message.length > 15),
    errors,
  );

  t("and nothing was stored", (await rowsFor(fx.schemaed)).length, before);

  const wrongName = await rpc(fx.schemaed, "tools/call", {
    name: "submit_something_else",
    arguments: { work_email: "a@b.test", company: "N" },
  });
  ok(
    "calling a tool that does not exist names the one that does",
    wrongName.body.result?.isError === true &&
      (wrongName.body.result?.content?.[0]?.text ?? "").includes("submit_demo_request"),
    wrongName.body.result,
  );

  const badArgs = await rpc(fx.schemaed, "tools/call", {
    name: "submit_demo_request",
    arguments: ["work_email", "a@b.test"],
  });
  t("a non-object arguments value is rejected", badArgs.body.result?.structuredContent?.code, "invalid_arguments");

  const empty = await rpc(fx.schemaed, "tools/call", { name: "submit_demo_request", arguments: {} });
  const emptyErrors = (empty.body.result?.structuredContent?.errors ?? []) as { field: string }[];
  t(
    "a call carrying nothing is rejected naming every field it wanted",
    emptyErrors.map((issue) => issue.field).sort(),
    ["company", "work_email"],
  );

  // #50 again, from the calling side.
  const noTool = await rpc(fx.plain, "tools/call", { name: "submit_form", arguments: { a: "b" } });
  t("an endpoint with no schema has no tool to call", noTool.body.result?.structuredContent?.code, "no_tool_published");
  ok(
    "and says where a plain post still works",
    (noTool.body.result?.content?.[0]?.text ?? "").includes(`/e/${fx.plain}`),
    noTool.body.result?.content,
  );
  t("nothing was stored on it", (await rowsFor(fx.plain)).length, 0);

  const missing = await rpc("doesnotexist000", "tools/list");
  t("an unknown endpoint is a 404", missing.status, 404);
  ok("with a sentence rather than a stack", (missing.body.error?.message ?? "").length > 20, missing.body);
}

// ---------------------------------------------------------------------------

async function caps(fx: Fixture) {
  console.log("\nThe caps are the same caps");

  const before = (await rowsFor(fx.schemaed)).length;

  // 1 MiB is MAX_BODY_BYTES, shared with the form endpoint. This route does not
  // have its own copy of the number, and this asserts it does not grow one.
  const huge = "x".repeat(1_200_000);
  const oversized = await handleManifestRequest(
    mcpRequest(fx.schemaed, {
      jsonrpc: "2.0",
      id: 900,
      method: "tools/call",
      params: {
        name: "submit_demo_request",
        arguments: { work_email: "a@b.test", company: huge },
      },
    }),
    fx.schemaed,
  );
  t("an oversized request is refused with 413", oversized.status, 413);
  const oversizedBody = (await oversized.json()) as RpcResponse;
  ok(
    "and says which limit, in bytes, rather than a bare status",
    (oversizedBody.error?.message ?? "").includes("1048576"),
    oversizedBody.error,
  );
  t("nothing was stored", (await rowsFor(fx.schemaed)).length, before);

  const notJson = await handleManifestRequest(
    new Request(`${BASE}/e/${fx.schemaed}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    }),
    fx.schemaed,
  );
  t("a malformed body is a parse error", notJson.status, 400);
  t(
    "with the JSON-RPC parse code",
    ((await notJson.json()) as RpcResponse).error?.code,
    -32700,
  );

  const noBody = await handleManifestRequest(
    new Request(`${BASE}/e/${fx.schemaed}/mcp`, { method: "POST" }),
    fx.schemaed,
  );
  t("an empty body is refused with a sentence", noBody.status, 400);
}

// ---------------------------------------------------------------------------

async function rateLimiting(fx: Fixture) {
  console.log("\nRate limiting");

  resetRateLimits();
  const previous = process.env.INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE;
  process.env.INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE = "2";

  try {
    const first = await rpc(fx.schemaed, "tools/list");
    const second = await rpc(fx.schemaed, "tools/list");
    const third = await rpc(fx.schemaed, "tools/list");

    t("the first call is allowed", first.status, 200);
    t("the second call is allowed", second.status, 200);
    t("the third is refused", third.status, 429);
    ok(
      "with a Retry-After the caller can act on",
      Number(third.response.headers.get("retry-after")) > 0,
      third.response.headers.get("retry-after"),
    );
    ok(
      "and the wait is in the error data too, for a client that only reads JSON",
      typeof (third.body.error?.data as { retry_after_seconds?: number })?.retry_after_seconds ===
        "number",
      third.body.error,
    );
  } finally {
    if (previous === undefined) delete process.env.INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE;
    else process.env.INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE = previous;
    resetRateLimits();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await sqlClient.end();
  });
