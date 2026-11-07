/**
 * The REST surface of the agent API, `/api/v1` (#133), over HTTP-shaped calls.
 *
 * `tests/api-core.test.mts` proves scoping and pagination in the core; this
 * proves the HTTP layer in front of it maps them faithfully — status codes,
 * the bearer key, query strings, JSON bodies, the export download — and does
 * not open a hole of its own. Refusals are paired with positive controls.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */
import { inArray } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { newEndpointPublicId, newId, newSubmissionPublicId } from "../src/db/ids.ts";
import { endpoints, memberships, submissions, users, workspaces } from "../src/db/schema.ts";
import { ALL_SCOPES } from "../src/lib/account/scopes.ts";
import { handleRest, type OperationName } from "../src/lib/api/rest.ts";
import { resetRateLimits } from "../src/lib/ingest/rate-limit.ts";
import { createVerdictApiKey } from "../src/lib/verdict/key-store.ts";

let pass = 0;
let fail = 0;
const t = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (good) pass++;
  else fail++;
  console.log(`  ${good ? "PASS" : "FAIL"}  ${name}`);
  if (!good) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};
const ok = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

const SLUGS = ["api-rest-alpha", "api-rest-beta"];
const EMAILS = ["owner@api-rest-alpha.test", "owner@api-rest-beta.test"];
const B_MARKER = "rest-beta-only-marker";

async function cleanup() {
  await unsafeDb.delete(workspaces).where(inArray(workspaces.slug, SLUGS));
  await unsafeDb.delete(users).where(inArray(users.email, EMAILS));
}

async function fixture(index: number, count: number) {
  const workspaceId = newId();
  const ownerId = newId();
  const endpointId = newId();
  const endpointPublicId = newEndpointPublicId();
  const submissionIds: string[] = [];
  await unsafeDb.insert(workspaces).values({ id: workspaceId, slug: SLUGS[index], name: SLUGS[index] });
  await unsafeDb.insert(users).values({ id: ownerId, email: EMAILS[index] });
  await unsafeDb.insert(memberships).values({ id: newId(), workspaceId, userId: ownerId, role: "owner" });
  await unsafeDb.insert(endpoints).values({ id: endpointId, workspaceId, publicId: endpointPublicId, name: "Contact" });
  for (let i = 0; i < count; i++) {
    const publicId = newSubmissionPublicId();
    submissionIds.push(publicId);
    await unsafeDb.insert(submissions).values({
      id: newId(),
      workspaceId,
      endpointId,
      publicId,
      values: { email: `lead${i}@example.com`, note: index === 1 ? B_MARKER : "alpha" },
      verdict: i === 0 ? "won" : "awaiting",
      submittedAt: new Date(Date.UTC(2026, 2, 1, 0, 0, i)),
    });
  }
  const key = await createVerdictApiKey({ workspaceId, label: "full", createdByUserId: ownerId, scopes: ALL_SCOPES, createdVia: "mcp" });
  return { workspaceId, ownerId, endpointPublicId, submissionIds, key: key.key };
}

const options = { renderDomain: "forms.test", appUrl: "https://app.test" };

type Call = {
  key?: string | null;
  query?: string;
  body?: unknown;
  rawBody?: string;
  contentType?: string;
  params?: Record<string, string>;
  method?: string;
};

async function call(name: OperationName, c: Call = {}) {
  const headers: Record<string, string> = {};
  if (c.key) headers.authorization = `Bearer ${c.key}`;
  const payload = c.rawBody ?? (c.body !== undefined ? JSON.stringify(c.body) : undefined);
  if (payload !== undefined) headers["content-type"] = c.contentType ?? "application/json";
  const request = new Request(`http://localhost/api/v1/x${c.query ? `?${c.query}` : ""}`, {
    method: c.method ?? (payload !== undefined ? "POST" : "GET"),
    headers,
    body: payload,
  });
  const response = await handleRest(request, name, c.params ?? {}, options);
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON — the export.
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- assertions walk arbitrary JSON replies
  return { status: response.status, headers: response.headers, text, json: json as any };
}

async function main() {
  await cleanup();
  resetRateLimits();

  const a = await fixture(0, 5);
  const b = await fixture(1, 1);
  const reader = await createVerdictApiKey({
    workspaceId: a.workspaceId,
    label: "reader",
    createdByUserId: a.ownerId,
    scopes: ["endpoints:read"],
    createdVia: "mcp",
  });

  console.log("\nauth over HTTP");
  {
    const none = await call("listEndpoints");
    t("no key is a 401", none.status, 401);
    t("with the error envelope", [none.json?.ok, none.json?.error?.code], [false, "unauthorized"]);
    t("and a WWW-Authenticate challenge", none.headers.get("www-authenticate"), "Bearer");
    t("a bad key is a 401", (await call("listEndpoints", { key: "efv2.abc.def" })).status, 401);
    const viaHeader = await handleRest(
      new Request("http://localhost/api/v1/me", { headers: { "x-api-key": a.key } }),
      "whoami",
      {},
      options,
    );
    t("X-Api-Key works too", viaHeader.status, 200);
    const me = await call("whoami", { key: a.key });
    t("whoami", [me.status, me.json?.data?.workspace?.slug], [200, SLUGS[0]]);
    t("responses are never cached", me.headers.get("cache-control"), "no-store");
    t("a missing scope is a 403", (await call("listSubmissions", { key: reader.key })).status, 403);
    t("positive control: the full key is a 200", (await call("listSubmissions", { key: a.key })).status, 200);
  }

  console.log("\nworkspace scoping over HTTP");
  {
    const params = { id: b.submissionIds[0] };
    t("positive control: B reads its submission", (await call("getSubmission", { key: b.key, params })).status, 200);
    t("A gets a 404 for B's submission", (await call("getSubmission", { key: a.key, params })).status, 404);
    t("and cannot delete it", (await call("deleteSubmission", { key: a.key, params, method: "DELETE" })).status, 404);
    t("which still exists", (await call("getSubmission", { key: b.key, params })).status, 200);
    const ep = { id: b.endpointPublicId };
    t("A gets a 404 for B's endpoint", (await call("getEndpoint", { key: a.key, params: ep })).status, 404);
    t(
      "and cannot rename it",
      (await call("updateEndpoint", { key: a.key, params: ep, body: { name: "x" }, method: "PATCH" })).status,
      404,
    );
    const bList = await call("listSubmissions", { key: b.key });
    ok("positive control: B's list has the marker", bList.text.includes(B_MARKER));
    const aList = await call("listSubmissions", { key: a.key, query: "limit=200" });
    ok("A's does not", !aList.text.includes(B_MARKER) && aList.json?.data?.length === 5, aList.json?.data?.length);
    const aExport = await call("exportSubmissions", { key: a.key, query: "format=json" });
    ok("nor A's export", aExport.status === 200 && !aExport.text.includes(B_MARKER) && aExport.text.includes("alpha"));
  }

  console.log("\nendpoints over HTTP");
  {
    const created = await call("createEndpoint", { key: a.key, body: { name: "Demo" } });
    t("POST is a 201", created.status, 201);
    t("returning the endpoint", created.json?.data?.name, "Demo");
    const id = created.json?.data?.id as string;
    const listed = await call("listEndpoints", { key: a.key });
    ok("which is listed", listed.json?.data?.some((e: { id: string }) => e.id === id));
    t("bad JSON is a 400", (await call("createEndpoint", { key: a.key, rawBody: "{nope" })).status, 400);
    t(
      "a non-JSON content type is a 400",
      (await call("createEndpoint", { key: a.key, rawBody: "name=x", contentType: "application/x-www-form-urlencoded" })).status,
      400,
    );
    const patched = await call("updateEndpoint", { key: a.key, params: { id }, body: { name: "Demo 2" }, method: "PATCH" });
    t("PATCH renames", [patched.status, patched.json?.data?.name], [200, "Demo 2"]);
    const deleted = await call("deleteEndpoint", { key: a.key, params: { id }, method: "DELETE" });
    t("DELETE archives", [deleted.status, deleted.json?.data?.archived], [200, true]);
    const destinations = await call("listDestinations", { key: a.key, params: { id } });
    t("destinations list", destinations.status, 200);
  }

  console.log("\nform schema over HTTP");
  {
    const params = { id: a.endpointPublicId };
    t("GET with no schema", (await call("getFormSchema", { key: a.key, params })).json?.data?.schema, null);
    const put = await call("setFormSchema", {
      key: a.key,
      params,
      method: "PUT",
      body: { document: { formatVersion: 1, fields: [{ key: "email", type: "email", required: true }] } },
    });
    t("PUT publishes", [put.status, put.json?.data?.version, put.json?.data?.active], [200, 1, true]);
    const bad = await call("setFormSchema", { key: a.key, params, method: "PUT", body: { document: { fields: [{ key: "x", type: "nope" }] } } });
    t("an invalid schema is a 400", bad.status, 400);
    ok("which lists what is wrong", Array.isArray(bad.json?.error?.errors) && bad.json.error.errors.length > 0, bad.json);
  }

  console.log("\nsubmissions over HTTP");
  {
    const first = await call("listSubmissions", { key: a.key, query: "limit=2" });
    t("a page of 2", first.json?.data?.length, 2);
    ok("with a next_cursor", typeof first.json?.next_cursor === "string");
    const seen: string[] = first.json.data.map((s: { id: string }) => s.id);
    let cursor = first.json.next_cursor as string | null;
    while (cursor) {
      const page = await call("listSubmissions", { key: a.key, query: `limit=2&cursor=${encodeURIComponent(cursor)}` });
      seen.push(...page.json.data.map((s: { id: string }) => s.id));
      cursor = page.json.next_cursor;
    }
    t("walking the cursor visits all 5 once", [seen.length, new Set(seen).size], [5, 5]);
    t("newest first", seen, [...a.submissionIds].reverse());

    t("repeated query params are a list", (await call("listSubmissions", { key: a.key, query: "verdict=won&verdict=lost" })).json?.data?.length, 1);
    t("comma lists work too", (await call("listSubmissions", { key: a.key, query: "verdict=won,awaiting" })).json?.data?.length, 5);
    t("an unknown parameter is a 400", (await call("listSubmissions", { key: a.key, query: "colour=red" })).status, 400);
    t("a bad limit is a 400", (await call("listSubmissions", { key: a.key, query: "limit=abc" })).status, 400);

    const csv = await call("exportSubmissions", { key: a.key });
    t("export defaults to CSV", csv.headers.get("content-type"), "text/csv; charset=utf-8");
    ok("as a download", (csv.headers.get("content-disposition") ?? "").startsWith(`attachment; filename="${SLUGS[0]}-submissions-`));
    t("with its row count", csv.headers.get("x-export-row-count"), "5");
    ok("and the rows", csv.text.includes("lead4@example.com"));

    const id = a.submissionIds[0];
    const detail = await call("getSubmission", { key: a.key, params: { id } });
    t("detail", [detail.status, detail.json?.data?.id], [200, id]);
    t("deliveries", (await call("listSubmissionDeliveries", { key: a.key, params: { id } })).json?.data, []);
    t("DELETE", (await call("deleteSubmission", { key: a.key, params: { id }, method: "DELETE" })).json?.data, { id, deleted: true });
    t("and it is gone", (await call("getSubmission", { key: a.key, params: { id } })).status, 404);
  }

  await cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
}

main()
  .catch((error) => {
    console.error(error);
    fail++;
  })
  .finally(async () => {
    await sqlClient.end();
    process.exit(fail > 0 ? 1 : 0);
  });
