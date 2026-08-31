/**
 * The optional schema on the live submission path (#51).
 *
 * **The test this file exists for is `warnNotReject`.** An endpoint collects
 * fine with no schema; a schema is then declared that is wrong about the real
 * payloads in every way one can be wrong — required fields the form does not
 * send, an email field that receives something else, a dropdown whose options
 * do not include what people actually pick, a number field receiving prose.
 * The same traffic is replayed, and **not one submission is lost**.
 *
 * That is the hard constraint from `docs/20-product-plan.md`: adding a schema
 * must never break an endpoint that worked without one. Everything else here —
 * versioning, rollback, strict mode being opt-in, an inferred schema needing a
 * human — is a supporting property of the same rule.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */

process.env.SUBMISSION_IP_SALT = "test-salt";
process.env.INGEST_RATE_LIMIT_ENDPOINT_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_IP_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE = "1000000";

import { and, eq, isNull } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { describeDatabase } from "../src/db/env.ts";
import { newEndpointPublicId, newId } from "../src/db/ids.ts";
import { endpoints, formSchemas, submissions, users, workspaces } from "../src/db/schema.ts";
import { handleSubmission } from "../src/lib/ingest/handler.ts";
import type { FormSchemaDocument } from "../src/lib/schema/format.ts";
import {
  activateSchemaVersion,
  clearActiveSchema,
  getActiveSchema,
  listSchemaVersions,
  proposeSchemaFromSubmissions,
  publishSchemaVersion,
  SchemaStoreError,
} from "../src/lib/schema/store.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const equal = JSON.stringify(got) === JSON.stringify(want);
  if (equal) pass++;
  else fail++;
  console.log(`  ${equal ? "PASS" : "FAIL"}  ${name}`);
  if (!equal) {
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

const SLUG = "schema-test-workspace";
const EMAIL = "schema@test.invalid";
const BASE = "https://acme.endpointforms.test";

type Fixture = {
  workspaceId: string;
  userId: string;
  endpointId: string;
  publicId: string;
};

async function cleanup() {
  await unsafeDb.delete(workspaces).where(eq(workspaces.slug, SLUG));
  await unsafeDb.delete(users).where(eq(users.email, EMAIL));
}

async function createFixture(): Promise<Fixture> {
  const workspaceId = newId();
  const userId = newId();
  const endpointId = newId();
  const publicId = newEndpointPublicId();

  await unsafeDb.insert(workspaces).values({ id: workspaceId, slug: SLUG, name: SLUG });
  await unsafeDb.insert(users).values({ id: userId, email: EMAIL });
  await unsafeDb
    .insert(endpoints)
    .values({ id: endpointId, workspaceId, publicId, name: "Contact" });

  return { workspaceId, userId, endpointId, publicId };
}

/**
 * The traffic this endpoint actually gets — five real enquiries, none of them
 * tidy. Two omit the company, one sends a phone number where a schema will
 * later claim a number, and the addresses are what people type.
 */
const REAL_PAYLOADS: Record<string, string>[] = [
  { name: "Priya Raman", email: "priya@dorsetmetal.example", company: "Dorset Metal", enquiry: "Need 200 brackets, powder-coated.", how_many: "200" },
  { name: "Tom Whitfield", email: "t.whitfield@harlow.example", enquiry: "Comparing three suppliers.", how_many: "a few hundred" },
  { name: "Sandra Oyelaran", email: "s.oyelaran+quotes@keswickeng.example", company: "Keswick Engineering", enquiry: "Repeat order, same spec as March.", how_many: "50" },
  { name: "Dan Kovacs", email: "dan(at)brightwaterco.example", company: "Brightwater", enquiry: "Looking at a 12-week run.", how_many: "" },
  { name: "Meera Shah", email: "meera@axelrodparts.example", enquiry: "Tooling plus first production batch.", how_many: "1000", newsletter: "yes" },
];

/**
 * A schema that is wrong about that traffic in five separate ways, which is
 * what a hurried import or a half-remembered form produces:
 *
 *   - `phone` is required and the form has never had a phone field.
 *   - `company` is required, and two of the five do not send one.
 *   - `email` is an email, and one of the five is not.
 *   - `how_many` is a number, and one of them is "a few hundred".
 *   - `enquiry_type` is a select nobody has ever submitted.
 *   - `newsletter` is not in the schema at all.
 */
const MISMATCHED_SCHEMA: FormSchemaDocument = {
  formatVersion: 1,
  name: "Contact (wrong)",
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "email", label: "Work email", type: "email", required: true },
    { key: "phone", label: "Phone", type: "phone", required: true },
    { key: "company", label: "Company", type: "text", required: true },
    { key: "how_many", label: "How many", type: "number", required: false },
    {
      key: "enquiry_type",
      label: "Enquiry type",
      type: "select",
      required: true,
      options: [
        { value: "quote", label: "Quote" },
        { value: "support", label: "Support" },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

const FETCH_HEADERS: Record<string, string> = {
  accept: "application/json",
  "sec-fetch-mode": "cors",
  origin: "https://acme.example",
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/128.0 Safari/537.36",
  "x-forwarded-for": "203.0.113.21",
};

function post(publicId: string, fields: Record<string, string>, key: string): Request {
  return new Request(`${BASE}/e/${publicId}`, {
    method: "POST",
    headers: { ...FETCH_HEADERS, "content-type": "application/x-www-form-urlencoded" },
    // An explicit key, so replaying the same five payloads a second time is
    // five new submissions rather than five collapsed duplicates. Without it
    // this test would "prove" nothing was lost by counting rows that were
    // deduplicated on purpose.
    body: new URLSearchParams({ ...fields, _idempotency_key: key }).toString(),
  });
}

type Ack = {
  ok: boolean;
  id: string;
  duplicate: boolean;
  warnings?: { field: string | null; code: string; message: string }[];
};

async function send(
  publicId: string,
  fields: Record<string, string>,
  key: string,
): Promise<{ status: number; ack: Ack }> {
  const response = await handleSubmission(post(publicId, fields, key), publicId);
  return { status: response.status, ack: (await response.json()) as Ack };
}

async function rowsFor(endpointId: string) {
  return unsafeDb
    .select()
    .from(submissions)
    .where(and(eq(submissions.endpointId, endpointId), isNull(submissions.deletedAt)))
    .orderBy(submissions.createdAt);
}

// ---------------------------------------------------------------------------
// The guarantee
// ---------------------------------------------------------------------------

async function warnNotReject(f: Fixture) {
  console.log("\nadding a schema loses nothing");

  // --- Before. An endpoint with no schema, collecting fine. -----------------
  for (const [index, payload] of REAL_PAYLOADS.entries()) {
    const { status, ack } = await send(f.publicId, payload, `before-${index}`);
    ok(`submission ${index + 1} of 5 accepted with no schema`, status === 200 && ack.ok, {
      status,
      ack,
    });
    ok("...and no warnings are reported when there is no schema", !("warnings" in ack), ack);
  }

  const before = await rowsFor(f.endpointId);
  t("five rows before the schema", before.length, 5);
  t("none of them is stamped with a schema version", before.filter((row) => row.schemaVersionId !== null).length, 0);

  // --- The schema is declared, and it is wrong. ----------------------------
  const published = await publishSchemaVersion({
    workspaceId: f.workspaceId,
    endpointId: f.endpointId,
    document: MISMATCHED_SCHEMA,
    source: "html_import",
    createdByUserId: f.userId,
  });
  t("it is version 1", published.version, 1);
  t("and it is warn by default — strict is never the default", published.mode, "warn");

  // --- After. The same five payloads, replayed. ---------------------------
  const acks: Ack[] = [];
  for (const [index, payload] of REAL_PAYLOADS.entries()) {
    const { status, ack } = await send(f.publicId, payload, `after-${index}`);
    ok(`submission ${index + 1} of 5 still accepted with a mismatched schema`, status === 200 && ack.ok, {
      status,
      ack,
    });
    acks.push(ack);
  }

  const after = await rowsFor(f.endpointId);

  // The assertion the whole issue turns on.
  t("ten rows: not one submission was lost", after.length, 10);
  t(
    "the five that predate the schema are untouched and still unstamped",
    after.slice(0, 5).map((row) => row.schemaVersionId),
    [null, null, null, null, null],
  );
  t(
    "the five that followed it are stamped with the version they arrived under",
    new Set(after.slice(5).map((row) => row.schemaVersionId)).size,
    1,
  );
  t(
    "every payload was stored in full, mismatches included",
    (after[8].values as Record<string, unknown>).email,
    "dan(at)brightwaterco.example",
  );

  // Stored is not enough; it has to be visible.
  const codes = new Set(acks.flatMap((ack) => (ack.warnings ?? []).map((issue) => issue.code)));
  ok("the mismatches are reported back to the caller", codes.has("missing_required"), [...codes]);
  ok("...including a value of the wrong type", codes.has("invalid_email"), [...codes]);
  ok("...and a value outside the declared options", codes.has("invalid_number"), [...codes]);
  ok(
    "a field the schema has never heard of is reported, not refused",
    (acks[4].warnings ?? []).some((issue) => issue.code === "unknown_field" && issue.field === "newsletter"),
    acks[4].warnings,
  );
  ok(
    "every warning names the field and says what to change",
    (acks[1].warnings ?? []).every((issue) => issue.message.length > 20),
    acks[1].warnings,
  );

  return published.id;
}

// ---------------------------------------------------------------------------
// Strict mode is something you choose
// ---------------------------------------------------------------------------

async function strictIsOptIn(f: Fixture, warnVersionId: string) {
  console.log("\nstrict mode");

  const strict = await publishSchemaVersion({
    workspaceId: f.workspaceId,
    endpointId: f.endpointId,
    document: MISMATCHED_SCHEMA,
    source: "file",
    mode: "strict",
    createdByUserId: f.userId,
  });
  t("publishing again writes version 2, never edits version 1", strict.version, 2);

  const refused = await send(f.publicId, REAL_PAYLOADS[3], "strict-0");
  t("a mismatched payload is now refused", refused.status, 422);
  ok(
    "...with a message naming every field to fix",
    JSON.stringify(refused.ack).includes("Phone"),
    refused.ack,
  );

  const rows = await rowsFor(f.endpointId);
  t("the refused submission was not written", rows.length, 10);

  // A payload that satisfies the schema still gets through in strict mode.
  const good = await send(
    f.publicId,
    {
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+44 20 7946 0958",
      company: "Analytical Engines",
      how_many: "12",
      enquiry_type: "quote",
    },
    "strict-1",
  );
  t("a payload that matches is accepted", good.status, 200);
  ok("...with nothing to warn about", !("warnings" in good.ack), good.ack);

  // Rolling back is pointing the endpoint at the older version.
  await activateSchemaVersion(f.workspaceId, f.endpointId, warnVersionId);
  const afterRollback = await send(f.publicId, REAL_PAYLOADS[3], "rollback-0");
  t("rolling back to the warn version accepts the payload again", afterRollback.status, 200);
  t(
    "...and stamps it with the version that was live at the time",
    (await rowsFor(f.endpointId)).at(-1)?.schemaVersionId,
    warnVersionId,
  );

  const active = await getActiveSchema(f.workspaceId, f.endpointId);
  t("the active version is the one rolled back to", active?.id, warnVersionId);
  t("both versions are still on the endpoint", (await listSchemaVersions(f.workspaceId, f.endpointId)).length, 2);
}

// ---------------------------------------------------------------------------
// A schema can be removed, and a broken one cannot break ingest
// ---------------------------------------------------------------------------

async function removalAndCorruption(f: Fixture) {
  console.log("\nremoving a schema, and surviving an unreadable one");

  await clearActiveSchema(f.workspaceId, f.endpointId);
  const unschemaed = await send(f.publicId, REAL_PAYLOADS[1], "cleared-0");
  t("clearing the schema returns the endpoint to accepting anything", unschemaed.status, 200);
  t(
    "...and the submission is stamped with no version, which is a valid state",
    (await rowsFor(f.endpointId)).at(-1)?.schemaVersionId,
    null,
  );
  t(
    "clearing deletes no versions",
    (await listSchemaVersions(f.workspaceId, f.endpointId)).length,
    2,
  );

  // A row this build cannot read — written by a later version of the format,
  // or corrupted. It must not take the endpoint down with it.
  const futureId = newId();
  await unsafeDb.insert(formSchemas).values({
    id: futureId,
    workspaceId: f.workspaceId,
    endpointId: f.endpointId,
    version: 3,
    fields: { formatVersion: 99, fields: [{ key: "who_knows", type: "quantum" }] },
    mode: "strict",
    source: "builder",
  });
  await unsafeDb
    .update(endpoints)
    .set({ activeSchemaVersionId: futureId })
    .where(eq(endpoints.id, f.endpointId));

  const unreadable = await send(f.publicId, REAL_PAYLOADS[0], "future-0");
  t("a schema this build cannot read still accepts the submission", unreadable.status, 200);
  ok(
    "...even though that unreadable schema is in strict mode",
    unreadable.ack.ok && !("warnings" in unreadable.ack),
    unreadable.ack,
  );
  t(
    "...and it is still stamped with the version in force",
    (await rowsFor(f.endpointId)).at(-1)?.schemaVersionId,
    futureId,
  );
}

// ---------------------------------------------------------------------------
// Inference proposes; a person applies
// ---------------------------------------------------------------------------

async function inferenceIsProposalOnly(f: Fixture) {
  console.log("\ninference from real submissions");

  await clearActiveSchema(f.workspaceId, f.endpointId);

  const proposal = await proposeSchemaFromSubmissions(f.workspaceId, f.endpointId);
  const keys = proposal.document.fields.map((field) => field.key);
  ok("the proposal is drawn from the submissions on this endpoint", keys.includes("name") && keys.includes("email"), keys);
  ok("...and is marked as needing confirmation", proposal.notes.some((note) => note.includes("guessed")), proposal.notes);

  const active = await getActiveSchema(f.workspaceId, f.endpointId);
  t("proposing changed nothing about the endpoint", active, null);

  let refused: unknown = null;
  try {
    await publishSchemaVersion({
      workspaceId: f.workspaceId,
      endpointId: f.endpointId,
      document: proposal.document,
      source: "inferred",
    });
  } catch (error) {
    refused = error;
  }
  ok(
    "an inferred schema cannot be published without a person behind it",
    refused instanceof SchemaStoreError && refused.code === "confirmation_required",
    refused instanceof Error ? refused.message : refused,
  );

  const confirmed = await publishSchemaVersion({
    workspaceId: f.workspaceId,
    endpointId: f.endpointId,
    document: proposal.document,
    source: "inferred",
    createdByUserId: f.userId,
  });
  t("with a confirming user it publishes", confirmed.source, "inferred");
  t("...as the next version, never overwriting one", confirmed.version, 4);

  // The point of inferring from real traffic: it must not flag the traffic it
  // was inferred from.
  const replay = await send(f.publicId, REAL_PAYLOADS[0], "inferred-0");
  t("the inferred schema accepts the traffic it came from", replay.status, 200);
  t("...with no errors of any kind", replay.ack.warnings ?? [], []);
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`schema + ingest against ${describeDatabase()}`);
  await cleanup();
  const fixture = await createFixture();

  const warnVersionId = await warnNotReject(fixture);
  await strictIsOptIn(fixture, warnVersionId);
  await removalAndCorruption(fixture);
  await inferenceIsProposalOnly(fixture);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
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
