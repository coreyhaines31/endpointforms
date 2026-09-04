/**
 * The submission endpoint (#50, #29).
 *
 * This runs on other people's paid traffic, so the tests are written from the
 * question "how does a lead get lost?" rather than "which lines are covered":
 * duplicate collapsing under real concurrency, payloads Postgres would reject,
 * attribution arriving through a broken hidden field, and every malformed input
 * a browser or a script can produce returning a 4xx with a sentence in it
 * instead of a 500.
 *
 * The handler is plain Web `Request`/`Response` and no Next APIs, so it is
 * called directly here — no server, no port, no fixtures beyond one workspace.
 *
 * These fixtures send `x-forwarded-for`, which is only believed when something
 * upstream is known to sanitise it — so the suite declares itself a
 * trusted-proxy deployment below. Without that, `clientIp` correctly returns
 * null and the IP-hash assertions fail, which is exactly what happened when the
 * trust was made explicit. The assertion being preserved is "an IP is stored
 * hashed, never raw", not "a forwarded header is believed".
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */

// Read at call time by the modules under test, so setting them here is enough.
// The rate limiter gets its own test with an explicit config.
process.env.SUBMISSION_IP_SALT = "test-salt";
process.env.INGEST_RATE_LIMIT_ENDPOINT_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_IP_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE = "1000000";

// See the note above: these fixtures supply a forwarded header on purpose.
process.env.TRUST_PROXY_HEADERS = "1";

import { and, eq, isNull } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { describeDatabase } from "../src/db/env.ts";
import { newEndpointPublicId, newId } from "../src/db/ids.ts";
import { endpoints, formSchemas, submissions, users, workspaces } from "../src/db/schema.ts";
import { sanitizeString } from "../src/lib/ingest/body.ts";
import { handlePreflight, handleSubmission, handleUnsupportedMethod } from "../src/lib/ingest/handler.ts";
import { mintOriginToken } from "../src/lib/origin/token.ts";
import type { OriginReason } from "../src/lib/origin/types.ts";
import { checkRateLimit, resetRateLimits } from "../src/lib/ingest/rate-limit.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  }
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

const SLUG = "ingest-test-workspace";
const EMAIL = "ingest@test.invalid";
const BASE = "https://acme.endpointforms.test";

type Fixture = {
  workspaceId: string;
  plain: string;
  schemaed: string;
  schemaVersionId: string;
  deleted: string;
};

async function cleanup() {
  await unsafeDb.delete(workspaces).where(eq(workspaces.slug, SLUG));
  await unsafeDb.delete(users).where(eq(users.email, EMAIL));
}

async function createFixture(): Promise<Fixture> {
  const workspaceId = newId();
  const userId = newId();
  const plainId = newId();
  const schemaedId = newId();
  const deletedId = newId();
  const schemaVersionId = newId();

  await unsafeDb.insert(workspaces).values({ id: workspaceId, slug: SLUG, name: SLUG });
  await unsafeDb.insert(users).values({ id: userId, email: EMAIL });

  const plain = newEndpointPublicId();
  const schemaed = newEndpointPublicId();
  const deleted = newEndpointPublicId();

  await unsafeDb.insert(endpoints).values([
    { id: plainId, workspaceId, publicId: plain, name: "No schema" },
    { id: schemaedId, workspaceId, publicId: schemaed, name: "With schema" },
    {
      id: deletedId,
      workspaceId,
      publicId: deleted,
      name: "Deleted",
      deletedAt: new Date(),
    },
  ]);

  await unsafeDb.insert(formSchemas).values({
    id: schemaVersionId,
    workspaceId,
    endpointId: schemaedId,
    version: 1,
    fields: { fields: [{ key: "email", label: "Email", type: "email", required: true }] },
    mode: "warn",
    source: "html_import",
  });
  await unsafeDb
    .update(endpoints)
    .set({ activeSchemaVersionId: schemaVersionId })
    .where(eq(endpoints.id, schemaedId));

  return { workspaceId, plain, schemaed, schemaVersionId, deleted };
}

/** Every submission on one endpoint, oldest first. */
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

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------

/** What a browser sends when a plain `<form method="post">` navigates. */
const BROWSER_HEADERS: Record<string, string> = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8",
  "sec-fetch-mode": "navigate",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0 Safari/537.36",
  "x-forwarded-for": "203.0.113.7",
};

/** What `fetch()` from a customer's page sends. */
const FETCH_HEADERS: Record<string, string> = {
  accept: "application/json",
  "sec-fetch-mode": "cors",
  origin: "https://acme.example",
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/128.0 Safari/537.36",
  "x-forwarded-for": "203.0.113.9",
};

type RequestOptions = {
  body?: BodyInit | null;
  contentType?: string | null;
  headers?: Record<string, string>;
  query?: string;
  method?: string;
};

function build(publicId: string, opts: RequestOptions = {}): Request {
  const headers = new Headers(opts.headers ?? BROWSER_HEADERS);
  if (opts.contentType) headers.set("content-type", opts.contentType);
  return new Request(`${BASE}/e/${publicId}${opts.query ?? ""}`, {
    method: opts.method ?? "POST",
    headers,
    body: opts.body ?? null,
  });
}

function urlencoded(publicId: string, fields: Record<string, string>, opts: RequestOptions = {}) {
  return build(publicId, {
    ...opts,
    contentType: "application/x-www-form-urlencoded",
    body: new URLSearchParams(fields).toString(),
  });
}

function json(publicId: string, payload: unknown, opts: RequestOptions = {}) {
  return build(publicId, {
    headers: FETCH_HEADERS,
    ...opts,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function body<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** `values` is jsonb, so drizzle types it `unknown`. */
type SubmissionRow = Awaited<ReturnType<typeof rowsFor>>[number];
function vals(row: SubmissionRow): Record<string, unknown> {
  return row.values as Record<string, unknown>;
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`ingest tests against ${describeDatabase()}`);
  await cleanup();
  const f = await createFixture();
  resetRateLimits();

  await contentTypes(f);
  await malformedInput(f);
  await caps(f);
  await hostileValues(f);
  await idempotency(f);
  await concurrency(f);
  await attribution(f);
  await redirects(f);
  await routing(f);
  await origin(f);
  rateLimiting();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------

async function contentTypes(f: Fixture) {
  console.log("\ncontent types — a form works whatever it sends");

  const form = await handleSubmission(
    urlencoded(f.plain, { name: "Priya Raman", email: "priya@dorsetmetal.example" }),
    f.plain,
  );
  t("urlencoded browser post redirects", form.status, 303);
  ok(
    "redirect lands on the default thanks page with the submission id",
    (form.headers.get("location") ?? "").startsWith(`${BASE}/thanks?s=`),
    form.headers.get("location"),
  );

  let rows = await rowsFor(f.plain);
  t("one row written", rows.length, 1);
  t("fields discovered with no schema", rows[0].values, {
    name: "Priya Raman",
    email: "priya@dorsetmetal.example",
  });
  t("raw body stored verbatim", rows[0].rawBody, "name=Priya+Raman&email=priya%40dorsetmetal.example");
  t("raw content type stored", rows[0].rawContentType, "application/x-www-form-urlencoded");
  t("schema version is null on a schemaless endpoint", rows[0].schemaVersionId, null);
  t("origin left for #30", rows[0].origin, "unverified");
  t("verdict defaults to awaiting", rows[0].verdict, "awaiting");
  ok("ip stored hashed, never raw", rows[0].ipHash?.startsWith("sha256:") === true, rows[0].ipHash);
  ok("raw ip is nowhere on the row", !JSON.stringify(rows[0]).includes("203.0.113.7"));

  const ajax = await handleSubmission(json(f.plain, { email: "ana@sortline.example" }), f.plain);
  t("json fetch post answers 200", ajax.status, 200);
  const ack = await body(ajax);
  t("json ack shape", Object.keys(ack).sort(), ["duplicate", "endpoint", "id", "ok", "submittedAt"]);
  t("ack names the endpoint", ack.endpoint, f.plain);
  t("ack is not a duplicate", ack.duplicate, false);
  t("cors header reflects the posting origin", ajax.headers.get("access-control-allow-origin"), "https://acme.example");

  // multipart, with a file part. #66 changed what this asserts: the reference
  // used to say `stored: false` and the bytes were discarded. The rest of the
  // upload behaviour has its own suite in `tests/uploads.test.mts` and
  // `tests/uploads-db.test.mts`; what matters here is that an ordinary
  // multipart post still goes through and still parses its text fields.
  const fd = new FormData();
  fd.set("email", "ruth@camdenworks.example");
  fd.set("resume", new File([new Uint8Array([1, 2, 3, 4, 5])], "cv.pdf", { type: "application/pdf" }));
  const multipartRequest = new Request(`${BASE}/e/${f.plain}`, {
    method: "POST",
    headers: BROWSER_HEADERS,
    body: fd,
  });
  const multipart = await handleSubmission(multipartRequest, f.plain);
  t("multipart post accepted", multipart.status, 303);
  rows = await rowsFor(f.plain);
  const withFile = rows[rows.length - 1];
  t("multipart text field parsed", vals(withFile).email, "ruth@camdenworks.example");

  const fileRef = vals(withFile).resume as Record<string, unknown>;
  t("file part is stored, not merely described", fileRef.stored, true);
  t("file keeps its name", fileRef.filename, "cv.pdf");
  t("file keeps its declared type", fileRef.contentType, "application/pdf");
  t("file keeps its size", fileRef.size, 5);
  t(
    "file carries the hash of its bytes",
    fileRef.sha256,
    "74f81fe167d99b4cb41d6d0ccda82278caee9f3e2f25d5e5a3936ff3dcec60d0",
  );
  ok(
    "file carries a signed download link",
    typeof fileRef.url === "string" && /\/api\/v1\/files\/[A-Za-z0-9_-]+\?e=[0-9a-z]+&s=/.test(fileRef.url),
    fileRef.url,
  );

  // No content-type at all — a broken client, not a lost lead.
  const sniffedForm = await handleSubmission(
    build(f.plain, { body: "email=sniffed%40example.test&name=Sniffed", contentType: null }),
    f.plain,
  );
  t("missing content-type with form body is sniffed", sniffedForm.status, 303);

  const sniffedJson = await handleSubmission(
    build(f.plain, {
      headers: FETCH_HEADERS,
      body: JSON.stringify({ email: "sniffedjson@example.test" }),
      contentType: null,
    }),
    f.plain,
  );
  t("missing content-type with json body is sniffed", sniffedJson.status, 200);

  const repeated = await handleSubmission(
    build(f.plain, {
      contentType: "application/x-www-form-urlencoded",
      body: "topic=a&topic=b&topic=c&email=checkboxes%40example.test",
    }),
    f.plain,
  );
  t("repeated field names accepted", repeated.status, 303);
  rows = await rowsFor(f.plain);
  t("repeated names collapse to an array", vals(rows[rows.length - 1]).topic, ["a", "b", "c"]);

  // The endpoint that has a schema stamps it without validating against it.
  const stamped = await handleSubmission(
    urlencoded(f.schemaed, { email: "stamped@example.test", extra: "not in the schema" }),
    f.schemaed,
  );
  t("endpoint with a schema still accepts an unknown field", stamped.status, 303);
  const schemaRows = await rowsFor(f.schemaed);
  t("submission stamped with the active schema version", schemaRows[0].schemaVersionId, f.schemaVersionId);
  t("unknown field kept, not dropped", vals(schemaRows[0]).extra, "not in the schema");
}

async function malformedInput(f: Fixture) {
  console.log("\nmalformed input — a 4xx with a sentence in it, never a 500");

  const cases: Array<[string, string, Request, number, string]> = [
    [
      "malformed json",
      f.plain,
      build(f.plain, {
        headers: FETCH_HEADERS,
        contentType: "application/json",
        body: '{"email": "broken",',
      }),
      400,
      "malformed_body",
    ],
    [
      "json array instead of an object",
      f.plain,
      build(f.plain, {
        headers: FETCH_HEADERS,
        contentType: "application/json",
        body: '[{"email":"a@b.test"}]',
      }),
      400,
      "malformed_body",
    ],
    [
      "empty body",
      f.plain,
      build(f.plain, { headers: FETCH_HEADERS, contentType: "application/x-www-form-urlencoded", body: "" }),
      422,
      "empty_body",
    ],
    [
      "whitespace-only body",
      f.plain,
      build(f.plain, { headers: FETCH_HEADERS, contentType: "application/json", body: "   \n  " }),
      422,
      "empty_body",
    ],
    [
      "prose body with an unreadable content type",
      f.plain,
      build(f.plain, { headers: FETCH_HEADERS, contentType: "text/xml", body: "<lead>hello</lead>" }),
      415,
      "unsupported_media_type",
    ],
    [
      "body of only separators",
      f.plain,
      build(f.plain, {
        headers: FETCH_HEADERS,
        contentType: "application/x-www-form-urlencoded",
        body: "&&&",
      }),
      422,
      "empty_body",
    ],
    [
      "unknown endpoint",
      "doesnotexist",
      urlencoded("doesnotexist", { email: "a@b.test" }, { headers: FETCH_HEADERS }),
      404,
      "endpoint_not_found",
    ],
    [
      "endpoint id that is not a public id at all",
      "../../etc/passwd",
      urlencoded(f.plain, { email: "a@b.test" }, { headers: FETCH_HEADERS }),
      404,
      "endpoint_not_found",
    ],
    [
      "soft-deleted endpoint",
      f.deleted,
      urlencoded(f.deleted, { email: "a@b.test" }, { headers: FETCH_HEADERS }),
      410,
      "endpoint_deleted",
    ],
    [
      "malformed multipart boundary",
      f.plain,
      build(f.plain, {
        headers: FETCH_HEADERS,
        contentType: "multipart/form-data; boundary=----nope",
        body: "not actually multipart",
      }),
      400,
      "malformed_body",
    ],
  ];

  for (const [name, publicId, request, status, code] of cases) {
    const response = await handleSubmission(request, publicId);
    const payload = await body<{ error?: { code?: string; message?: string } }>(response);
    t(`${name} -> ${status}`, response.status, status);
    t(`${name} -> ${code}`, payload.error?.code, code);
    ok(`${name} explains itself`, (payload.error?.message ?? "").length > 20, payload.error);
  }

  // The same refusal, rendered for a browser window rather than a script.
  const inBrowser = await handleSubmission(
    build(f.plain, { contentType: "application/json", body: "{oops" }),
    f.plain,
  );
  t("a browser gets html, not json", inBrowser.headers.get("content-type"), "text/html; charset=utf-8");
  t("browser refusal keeps the status", inBrowser.status, 400);

  const rows = await rowsFor(f.deleted);
  t("nothing was written for a deleted endpoint", rows.length, 0);
}

async function caps(f: Fixture) {
  console.log("\ncaps — rejected cleanly, never a 500");

  const before = (await rowsFor(f.plain)).length;

  const manyFields: Record<string, string> = {};
  for (let i = 0; i < 500; i++) manyFields[`field_${i}`] = String(i);
  const tooMany = await handleSubmission(
    urlencoded(f.plain, manyFields, { headers: FETCH_HEADERS }),
    f.plain,
  );
  t("500 fields -> 413", tooMany.status, 413);
  t("500 fields -> too_many_fields", (await body<{ error: { code: string } }>(tooMany)).error.code, "too_many_fields");

  const okFields: Record<string, string> = {};
  for (let i = 0; i < 200; i++) okFields[`field_${i}`] = String(i);
  const accepted = await handleSubmission(
    urlencoded(f.plain, okFields, { headers: FETCH_HEADERS }),
    f.plain,
  );
  t("200 fields accepted", accepted.status, 200);

  const huge = "x".repeat(2 * 1024 * 1024);
  const oversized = await handleSubmission(
    build(f.plain, {
      headers: FETCH_HEADERS,
      contentType: "application/x-www-form-urlencoded",
      body: `note=${huge}`,
    }),
    f.plain,
  );
  t("2 MiB body -> 413", oversized.status, 413);
  t(
    "2 MiB body -> payload_too_large",
    (await body<{ error: { code: string } }>(oversized)).error.code,
    "payload_too_large",
  );

  // A lying Content-Length is refused before a byte of body is read.
  const lying = new Request(`${BASE}/e/${f.plain}`, {
    method: "POST",
    headers: { ...FETCH_HEADERS, "content-type": "application/json", "content-length": "99999999" },
    body: '{"email":"a@b.test"}',
  });
  const refused = await handleSubmission(lying, f.plain);
  t("oversized content-length refused up front", refused.status, 413);

  const deeplyNested = { a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { k: { l: { m: 1 } } } } } } } } } } } } };
  const tooDeep = await handleSubmission(json(f.plain, deeplyNested), f.plain);
  t("over-nested json -> 400", tooDeep.status, 400);

  const after = (await rowsFor(f.plain)).length;
  t("only the accepted one was written", after - before, 1);
}

async function hostileValues(f: Fixture) {
  console.log("\nhostile values — everything Postgres would refuse is neutralised first");

  const emoji = "Ana 🌱 Beltrán — 北京 — ñ — \u{1F469}\u{200D}\u{1F4BB}";
  const unicode = await handleSubmission(
    json(f.plain, { name: emoji, note: "Ünïcödé ✓" }),
    f.plain,
  );
  t("unicode and emoji accepted", unicode.status, 200);
  let rows = await rowsFor(f.plain);
  t("unicode round-trips byte for byte", vals(rows[rows.length - 1]).name, emoji);

  // NUL and unpaired surrogates are valid JavaScript strings and invalid
  // Postgres text. Without stripping they are a 500 and a lost lead.
  const nul = String.fromCharCode(0);
  const lone = "\uD800";
  const nasty = await handleSubmission(
    build(f.plain, {
      headers: FETCH_HEADERS,
      contentType: "application/json",
      body: JSON.stringify({ name: `Sam${nul}uel`, note: `bad${lone}surrogate` }),
    }),
    f.plain,
  );
  t("nul byte and lone surrogate accepted, not 500", nasty.status, 200);
  rows = await rowsFor(f.plain);
  const cleaned = rows[rows.length - 1];
  t("nul stripped from the value", vals(cleaned).name, "Samuel");
  t("lone surrogate replaced", vals(cleaned).note, "bad�surrogate");
  ok("nul is gone from the raw body too", !(cleaned.rawBody ?? "").includes(nul));

  t("sanitizeString leaves ordinary text alone", sanitizeString("plain"), "plain");
  t("sanitizeString keeps a valid surrogate pair", sanitizeString("a🌱b"), "a🌱b");

  // A field literally named __proto__, in both encodings.
  const protoJson = await handleSubmission(
    build(f.plain, {
      headers: FETCH_HEADERS,
      contentType: "application/json",
      body: '{"__proto__":{"polluted":true},"email":"proto@example.test"}',
    }),
    f.plain,
  );
  t("__proto__ as a json field name accepted", protoJson.status, 200);
  ok("Object.prototype was not polluted", ({} as Record<string, unknown>).polluted === undefined);

  const protoForm = await handleSubmission(
    build(f.plain, {
      headers: FETCH_HEADERS,
      contentType: "application/x-www-form-urlencoded",
      body: "__proto__=pwned&constructor=also&email=proto2%40example.test",
    }),
    f.plain,
  );
  t("__proto__ as a form field name accepted", protoForm.status, 200);
  rows = await rowsFor(f.plain);
  const stored = rows[rows.length - 1].values as Record<string, unknown>;
  t(
    "__proto__ stored as an ordinary field",
    Object.getOwnPropertyDescriptor(stored, "__proto__")?.value,
    "pwned",
  );
  t("constructor stored as an ordinary field", stored.constructor, "also");
  ok("still no pollution", ({} as Record<string, unknown>).polluted === undefined);
}

async function idempotency(f: Fixture) {
  console.log("\nidempotency — a double-submit is one lead");

  const before = (await rowsFor(f.plain)).length;

  const key = `test-key-${newId()}`;
  const send = () =>
    handleSubmission(
      build(f.plain, {
        headers: { ...FETCH_HEADERS, "idempotency-key": key },
        contentType: "application/json",
        body: JSON.stringify({ email: "dupe@example.test", name: "Dupe" }),
      }),
      f.plain,
    );

  const first = await body<{ id: string; duplicate: boolean }>(await send());
  const second = await body<{ id: string; duplicate: boolean }>(await send());
  t("explicit key: first is new", first.duplicate, false);
  t("explicit key: second is flagged duplicate", second.duplicate, true);
  t("explicit key: same submission id returned", second.id, first.id);
  t("explicit key: one row", (await rowsFor(f.plain)).length - before, 1);

  // A different payload under the same key is still the same lead: the caller
  // owns the key and said so.
  const reused = await body<{ id: string }>(
    await handleSubmission(
      build(f.plain, {
        headers: { ...FETCH_HEADERS, "idempotency-key": key },
        contentType: "application/json",
        body: JSON.stringify({ email: "different@example.test" }),
      }),
      f.plain,
    ),
  );
  t("explicit key wins over payload contents", reused.id, first.id);

  // No key at all — a plain HTML form, double-clicked.
  const doubleClick = () =>
    handleSubmission(
      urlencoded(
        f.plain,
        { email: "doubleclick@example.test", name: "Double Click" },
        { headers: FETCH_HEADERS },
      ),
      f.plain,
    );
  const clickA = await body<{ id: string; duplicate: boolean }>(await doubleClick());
  const clickB = await body<{ id: string; duplicate: boolean }>(await doubleClick());
  t("no key: identical repost collapses", clickB.id, clickA.id);
  t("no key: repost flagged duplicate", clickB.duplicate, true);

  // A genuinely different enquiry from the same client is a second lead.
  const other = await body<{ id: string }>(
    await handleSubmission(
      urlencoded(
        f.plain,
        { email: "doubleclick@example.test", name: "Double Click", note: "one more thing" },
        { headers: FETCH_HEADERS },
      ),
      f.plain,
    ),
  );
  ok("no key: a different payload is a different lead", other.id !== clickA.id);

  // Field order is not meaningful and must not defeat the fingerprint.
  const orderedA = await body<{ id: string }>(
    await handleSubmission(
      build(f.plain, {
        headers: FETCH_HEADERS,
        contentType: "application/json",
        body: '{"a":"1","b":"2","email":"order@example.test"}',
      }),
      f.plain,
    ),
  );
  const orderedB = await body<{ id: string }>(
    await handleSubmission(
      build(f.plain, {
        headers: FETCH_HEADERS,
        contentType: "application/json",
        body: '{"email":"order@example.test","b":"2","a":"1"}',
      }),
      f.plain,
    ),
  );
  t("no key: key order does not change the fingerprint", orderedB.id, orderedA.id);

  const rows = await rowsFor(f.plain);
  const derived = rows.filter((r) => r.idempotencyKey?.startsWith("auto:"));
  ok("derived keys are marked auto:", derived.length > 0);
}

async function concurrency(f: Fixture) {
  console.log("\nconcurrency — the collapse happens in Postgres, not in a race");

  const before = (await rowsFor(f.plain)).length;
  const key = `concurrent-${newId()}`;

  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      handleSubmission(
        build(f.plain, {
          headers: { ...FETCH_HEADERS, "idempotency-key": key },
          contentType: "application/json",
          body: JSON.stringify({ email: "concurrent@example.test" }),
        }),
        f.plain,
      ),
    ),
  );

  t("8 simultaneous posts all succeed", responses.map((r) => r.status), Array(8).fill(200));
  const acks = await Promise.all(responses.map((r) => body<{ id: string }>(r)));
  t("all 8 return the same submission", new Set(acks.map((a) => a.id)).size, 1);
  t("exactly one row exists", (await rowsFor(f.plain)).length - before, 1);

  // Distinct leads arriving at the same instant must all survive.
  const distinct = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      handleSubmission(
        build(f.plain, {
          headers: { ...FETCH_HEADERS, "idempotency-key": `${key}-${i}` },
          contentType: "application/json",
          body: JSON.stringify({ email: `concurrent-${i}@example.test` }),
        }),
        f.plain,
      ),
    ),
  );
  t("8 distinct simultaneous posts all succeed", distinct.map((r) => r.status), Array(8).fill(200));
  const distinctAcks = await Promise.all(distinct.map((r) => body<{ id: string }>(r)));
  t("8 distinct submissions written", new Set(distinctAcks.map((a) => a.id)).size, 8);
  t("row count matches", (await rowsFor(f.plain)).length - before, 9);
}

async function attribution(f: Fixture) {
  console.log("\nattribution — a broken hidden field must not lose the click");

  // The failure the research named: the hidden field exists and is empty.
  await handleSubmission(
    build(f.plain, {
      headers: {
        ...FETCH_HEADERS,
        referer: "https://acme.example/landing?utm_source=google&utm_medium=cpc&utm_campaign=brand-exact&gclid=Cj0-rescued",
      },
      contentType: "application/x-www-form-urlencoded",
      body: "email=rescue%40example.test&gclid=&utm_source=",
    }),
    f.plain,
  );
  let rows = await rowsFor(f.plain);
  let row = rows[rows.length - 1];
  t("empty hidden gclid falls through to the referrer", row.clickIds, { gclid: "Cj0-rescued" });
  t("empty hidden utm_source falls through too", row.utmSource, "google");
  t("utm_medium from the referrer", row.utmMedium, "cpc");
  t("utm_campaign from the referrer", row.utmCampaign, "brand-exact");
  t("referrer recorded", row.referrer, "https://acme.example/landing?utm_source=google&utm_medium=cpc&utm_campaign=brand-exact&gclid=Cj0-rescued");
  ok("user agent recorded", (row.userAgent ?? "").includes("Chrome"), row.userAgent);
  t("attribution fields are not repeated in values", row.values, { email: "rescue@example.test" });

  // A customer's own `url` and `referrer` fields (#72). `normalizeKey` strips
  // separators, so `_url` used to fold onto a bare `url` and consume it — and
  // "Website URL" and "How did you hear about us" are ordinary things to ask.
  await handleSubmission(
    build(f.plain, {
      headers: { ...FETCH_HEADERS, referer: "https://acme.example/landing" },
      contentType: "application/x-www-form-urlencoded",
      body: "email=keeps%40example.test&url=https%3A%2F%2Ftheirsite.example&referrer=a+friend",
    }),
    f.plain,
  );
  rows = await rowsFor(f.plain);
  row = rows[rows.length - 1];
  // Compared key by key: `t` stringifies, and jsonb does not promise key order.
  const kept = row.values as Record<string, unknown>;
  t("a customer's url field stays in values", kept.url, "https://theirsite.example");
  t("so does their referrer field", kept.referrer, "a friend");
  t("alongside the rest", kept.email, "keeps@example.test");
  t("and nothing else was added", Object.keys(kept).sort(), ["email", "referrer", "url"]);

  // The control: our own underscore-prefixed names are still ours, still
  // consumed, and still lifted onto their columns — so the assertion above is
  // about a name collision, not about attribution having stopped working.
  await handleSubmission(
    build(f.plain, {
      headers: FETCH_HEADERS,
      contentType: "application/x-www-form-urlencoded",
      body: "email=ours%40example.test&_url=https%3A%2F%2Facme.example%2Fpricing",
    }),
    f.plain,
  );
  rows = await rowsFor(f.plain);
  row = rows[rows.length - 1];
  t("but _url is still ours and still consumed", row.values, { email: "ours@example.test" });
  t("and still lands on the referrer column", row.referrer, "https://acme.example/pricing");

  // A populated field beats every fallback.
  await handleSubmission(
    build(f.plain, {
      headers: { ...FETCH_HEADERS, referer: "https://acme.example/landing?utm_source=google" },
      contentType: "application/x-www-form-urlencoded",
      body: "email=explicit%40example.test&utm_source=newsletter&li_fat_id=LI-123",
    }),
    f.plain,
  );
  rows = await rowsFor(f.plain);
  row = rows[rows.length - 1];
  t("a populated payload field wins", row.utmSource, "newsletter");
  t("linkedin click id captured", row.clickIds, { li_fat_id: "LI-123" });

  // Casing and separators vary by whoever built the form.
  await handleSubmission(
    json(f.plain, {
      email: "casing@example.test",
      utmSource: "camel",
      "UTM-Medium": "dashes",
      MSCLKID: "MS-999",
    }),
    f.plain,
  );
  rows = await rowsFor(f.plain);
  row = rows[rows.length - 1];
  t("camelCase utmSource recognised", row.utmSource, "camel");
  t("dashed UTM-Medium recognised", row.utmMedium, "dashes");
  t("uppercase MSCLKID recognised", row.clickIds, { msclkid: "MS-999" });
  t("recognised attribution keys stripped from values", row.values, { email: "casing@example.test" });

  // `_page_url` is the robust path, because a cross-origin Referer is trimmed
  // to its origin by the default referrer policy.
  await handleSubmission(
    build(f.plain, {
      headers: { ...FETCH_HEADERS, referer: "https://acme.example/" },
      contentType: "application/x-www-form-urlencoded",
      body: "email=page%40example.test&_page_url=https%3A%2F%2Facme.example%2Foffer%3Futm_source%3Dreddit%26ttclid%3DTT-77",
    }),
    f.plain,
  );
  rows = await rowsFor(f.plain);
  row = rows[rows.length - 1];
  t("_page_url query string read", row.utmSource, "reddit");
  t("tiktok click id from _page_url", row.clickIds, { ttclid: "TT-77" });
  t("_page_url preferred as the referrer", row.referrer, "https://acme.example/offer?utm_source=reddit&ttclid=TT-77");
  t("_page_url consumed, not left in values", row.values, { email: "page@example.test" });

  // Last resort: the action URL's own query string.
  await handleSubmission(
    urlencoded(f.plain, { email: "action@example.test" }, {
      headers: { accept: "application/json", "x-forwarded-for": "203.0.113.11" },
      query: "?utm_source=qr-code&utm_content=poster",
    }),
    f.plain,
  );
  rows = await rowsFor(f.plain);
  row = rows[rows.length - 1];
  t("utm from the endpoint url itself", row.utmSource, "qr-code");
  t("utm_content from the endpoint url", row.utmContent, "poster");

  // A form with no attribution anywhere is not an error.
  await handleSubmission(
    urlencoded(f.plain, { email: "bare@example.test" }, {
      headers: { accept: "application/json", "x-forwarded-for": "203.0.113.12" },
    }),
    f.plain,
  );
  rows = await rowsFor(f.plain);
  row = rows[rows.length - 1];
  t("no attribution is null, not empty string", row.utmSource, null);
  t("no click ids is an empty object", row.clickIds, {});
}

async function redirects(f: Fixture) {
  console.log("\nredirects — the customer's thank-you page, and nobody else's");

  const post = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
    handleSubmission(
      urlencoded(f.plain, fields, { headers: { ...BROWSER_HEADERS, ...headers } }),
      f.plain,
    );

  const sameHost = await post(
    { email: "r1@example.test", _redirect: "https://acme.example/thanks" },
    { origin: "https://acme.example" },
  );
  t("same-host redirect honoured", sameHost.headers.get("location"), "https://acme.example/thanks");

  const formspreeStyle = await post(
    { email: "r2@example.test", _next: "https://acme.example/done" },
    { origin: "https://acme.example" },
  );
  t("_next honoured too", formspreeStyle.headers.get("location"), "https://acme.example/done");

  const relative = await post({ email: "r3@example.test", _redirect: "/local-thanks" });
  t("relative redirect resolves on this origin", relative.headers.get("location"), `${BASE}/local-thanks`);

  const crossHost = await post(
    { email: "r4@example.test", _redirect: "https://evil.example/phish" },
    { origin: "https://acme.example" },
  );
  ok(
    "cross-host redirect refused when Origin disagrees",
    (crossHost.headers.get("location") ?? "").startsWith(`${BASE}/thanks`),
    crossHost.headers.get("location"),
  );

  const scheme = await post(
    { email: "r5@example.test", _redirect: "javascript:alert(1)" },
    { origin: "https://acme.example" },
  );
  ok(
    "javascript: redirect refused",
    (scheme.headers.get("location") ?? "").startsWith(`${BASE}/thanks`),
    scheme.headers.get("location"),
  );

  const protocolRelative = await post(
    { email: "r6@example.test", _redirect: "//evil.example/phish" },
    { origin: "https://acme.example" },
  );
  ok(
    "protocol-relative redirect refused",
    (protocolRelative.headers.get("location") ?? "").startsWith(`${BASE}/thanks`),
    protocolRelative.headers.get("location"),
  );

  const rows = await rowsFor(f.plain);
  const last = rows[rows.length - 1];
  t("a refused redirect still stored the submission", last.values, { email: "r6@example.test" });
  ok("the redirect field is not stored as a form field", !("_redirect" in (last.values as object)));

  // An AJAX caller that sent _redirect still gets JSON: the shape follows the
  // caller, not the payload.
  const ajax = await handleSubmission(
    urlencoded(f.plain, { email: "r7@example.test", _redirect: "https://acme.example/thanks" }, {
      headers: FETCH_HEADERS,
    }),
    f.plain,
  );
  t("_redirect does not force a redirect for a json caller", ajax.status, 200);
}

async function routing(f: Fixture) {
  console.log("\nrouting — preflight, wrong methods");

  const preflight = await handlePreflight(
    new Request(`${BASE}/e/${f.plain}`, {
      method: "OPTIONS",
      headers: {
        origin: "https://acme.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, idempotency-key",
      },
    }),
  );
  t("preflight answers 204", preflight.status, 204);
  t("preflight allows the origin", preflight.headers.get("access-control-allow-origin"), "https://acme.example");
  t("preflight allows POST", preflight.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  t(
    "preflight reflects the requested headers",
    preflight.headers.get("access-control-allow-headers"),
    "content-type, idempotency-key",
  );
  t("preflight varies on origin", preflight.headers.get("vary"), "Origin");
  ok(
    "preflight does not allow credentials",
    preflight.headers.get("access-control-allow-credentials") === null,
  );

  const get = await handleUnsupportedMethod(
    new Request(`${BASE}/e/${f.plain}`, { method: "GET", headers: BROWSER_HEADERS }),
  );
  t("GET answers 405", get.status, 405);
  t("GET names the allowed methods", get.headers.get("allow"), "POST, OPTIONS");
  ok("GET in a browser explains what this url is", (await get.text()).includes("form endpoint"));
}

/**
 * Origin reaches the row (#30). The decision itself is exercised exhaustively in
 * `tests/origin.test.mts`, which needs no database; what is asserted here is the
 * wiring — that the stamp and its reasons survive the write, and that two
 * identical payloads through different doors land differently.
 */
async function origin(f: Fixture) {
  console.log("\norigin — the stamp and its reasons land on the row");

  // A complete Chrome header set, not the abbreviated `BROWSER_HEADERS` the
  // rest of this file uses. Origin reads headers the other tests do not care
  // about, and a fixture that omits Accept-Language and Accept-Encoding is not
  // a browser — no shipping browser has ever left either out.
  const CHROME: Record<string, string> = {
    ...BROWSER_HEADERS,
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-US,en;q=0.9",
    origin: "https://acme.example",
    referer: "https://acme.example/contact",
    "sec-fetch-dest": "document",
    "sec-fetch-site": "cross-site",
  };

  const asHuman = await handleSubmission(
    urlencoded(f.plain, { email: "origin-human@acme.example" }, { headers: CHROME }),
    f.plain,
  );
  t("a browser post is accepted", asHuman.status, 303);

  const asScript = await handleSubmission(
    urlencoded(
      f.plain,
      { email: "origin-script@acme.example" },
      { headers: { accept: "*/*", "user-agent": "curl/8.7.1", "x-forwarded-for": "203.0.113.11" } },
    ),
    f.plain,
  );
  t("a curl post is accepted too — nothing is refused over Origin", asScript.status, 200);

  const rows = await rowsFor(f.plain);
  const human = rows.find((r) => vals(r).email === "origin-human@acme.example");
  const script = rows.find((r) => vals(r).email === "origin-script@acme.example");

  t("the browser submission is stamped human", human?.origin, "human");
  t("the curl submission is stamped unverified", script?.origin, "unverified");

  const scriptReasons = (script?.originReasons ?? []) as OriginReason[];
  ok("the reasons are stored as a readable array", Array.isArray(scriptReasons) && scriptReasons.length > 0);
  ok(
    "and answer 'why is this Unverified?' in words",
    scriptReasons.some((r) => r.code === "user_agent" && /curl/.test(r.note)),
    scriptReasons,
  );
  ok(
    "the threshold the score was judged against is in the row",
    scriptReasons.some((r) => r.code === "threshold"),
  );

  // The token is a reserved field: it must not show up as one of the customer's
  // own answers in the inbox.
  await handleSubmission(
    urlencoded(
      f.plain,
      { email: "origin-token@acme.example", _origin_token: mintOriginToken(f.plain) },
      { headers: CHROME },
    ),
    f.plain,
  );
  const tokened = (await rowsFor(f.plain)).find(
    (r) => vals(r).email === "origin-token@acme.example",
  );
  t("a submission carrying a token is human", tokened?.origin, "human");
  ok("and the token is not left in values", !("_origin_token" in (vals(tokened!) ?? {})));
  ok(
    "the token is still recoverable from raw_body",
    (tokened?.rawBody ?? "").includes("_origin_token"),
  );
  ok(
    "the valid token is recorded as corroboration",
    ((tokened?.originReasons ?? []) as OriginReason[]).some(
      (r) => r.code === "client_token" && r.direction === "browser",
    ),
  );

  // The same body, the same headers, through the machine surface (#32).
  const viaManifest = await handleSubmission(
    urlencoded(
      f.plain,
      { email: "origin-manifest@acme.example" },
      { headers: { ...CHROME, "x-forwarded-for": "203.0.113.12" } },
    ),
    f.plain,
    { surface: "manifest", agentDeclaration: "acme-agent/1.2" },
  );
  t("a manifest submission is accepted", viaManifest.status, 303);
  const agent = (await rowsFor(f.plain)).find(
    (r) => vals(r).email === "origin-manifest@acme.example",
  );
  t("identical headers through the manifest surface are stamped agent", agent?.origin, "agent");
  ok(
    "and the declaration is recorded verbatim",
    ((agent?.originReasons ?? []) as OriginReason[]).some(
      (r) => r.code === "declared_agent" && r.observed === "acme-agent/1.2",
    ),
  );

  // The stamp must never leak back to the caller: telling a forger whether the
  // forgery worked is a free tuning loop.
  const ack = await body(
    await handleSubmission(
      json(f.plain, { email: "origin-ack@acme.example" }, { headers: { ...FETCH_HEADERS, "x-forwarded-for": "203.0.113.13" } }),
      f.plain,
    ),
  );
  ok("the acknowledgement does not report the stamp", !("origin" in ack), ack);
}

function rateLimiting() {
  console.log("\nrate limiting");

  resetRateLimits();
  const config = { windowMs: 60_000, endpoint: 5, ip: 3, endpointIp: 2 };
  const now = Date.now();

  const one = checkRateLimit("rl-endpoint", "sha256:aaa", config, now);
  const two = checkRateLimit("rl-endpoint", "sha256:aaa", config, now);
  const three = checkRateLimit("rl-endpoint", "sha256:aaa", config, now);
  t("first submission allowed", one.allowed, true);
  t("second submission allowed", two.allowed, true);
  t("third from the same client on the same form refused", three.allowed, false);
  t("refusal names the narrowest window", three.scope, "endpoint+ip");
  ok("refusal carries a retry-after", (three.retryAfter ?? 0) > 0, three);

  // A different client on the same endpoint is unaffected by the first one.
  t(
    "a different client is not punished for another's burst",
    checkRateLimit("rl-endpoint", "sha256:bbb", config, now).allowed,
    true,
  );

  // The per-endpoint ceiling still applies across clients.
  checkRateLimit("rl-endpoint", "sha256:ccc", config, now);
  checkRateLimit("rl-endpoint", "sha256:ddd", config, now);
  t(
    "per-endpoint ceiling refuses once every client has had a turn",
    checkRateLimit("rl-endpoint", "sha256:eee", config, now).allowed,
    false,
  );

  // The window expires.
  resetRateLimits();
  checkRateLimit("rl-window", "sha256:aaa", config, now);
  checkRateLimit("rl-window", "sha256:aaa", config, now);
  t(
    "refused inside the window",
    checkRateLimit("rl-window", "sha256:aaa", config, now).allowed,
    false,
  );
  t(
    "allowed again after the window",
    checkRateLimit("rl-window", "sha256:aaa", config, now + 60_001).allowed,
    true,
  );

  // A caller we cannot identify is only held to the per-endpoint ceiling.
  resetRateLimits();
  t(
    "an unidentifiable caller is not blocked by the per-ip window",
    checkRateLimit("rl-noip", null, config, now).allowed &&
      checkRateLimit("rl-noip", null, config, now).allowed &&
      checkRateLimit("rl-noip", null, config, now).allowed,
    true,
  );

  resetRateLimits();
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
