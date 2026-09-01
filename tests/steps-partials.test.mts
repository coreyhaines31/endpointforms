/**
 * Partial capture, against a real database (#37).
 *
 * The pure half is `tests/steps.test.mts`. What can only be asserted here is
 * the half the whole feature turns on:
 *
 *   1. **A partial with missing required fields is stored, not rejected.** The
 *      row exists, it holds what was typed, and nothing about the unanswered
 *      screens prevented it.
 *   2. **A partial followed by a completion is one lead, not two.** The
 *      submission lands in `submissions`; the partial is closed and stops being
 *      an open one. Asserted by counting both tables, because "the inbox looks
 *      right" is not a thing a test can see.
 *   3. **Nothing about any of this reached the submission count or Yield.**
 *      `submissions` is untouched by every step post. This is the assertion
 *      that would have caught the design we did not build — partials as rows in
 *      `submissions` with a flag — and it is written by counting the table
 *      before and after rather than by reading the code.
 *   4. **A partial is a partial, not a submission.** No verdict, no spam state,
 *      no place in the denominator. Asserted structurally: the columns are not
 *      there to be wrong about.
 *
 * Each of the three "nothing appeared" assertions is paired with one that shows
 * the same measurement can be non-zero, because an empty result set is equally
 * consistent with "the guard works" and "the fixture wrote nothing".
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */

process.env.SUBMISSION_IP_SALT = "test-salt";
process.env.INGEST_RATE_LIMIT_ENDPOINT_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_IP_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE = "1000000";

import { and, eq, isNull, sql } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { describeDatabase } from "../src/db/env.ts";
import { newEndpointPublicId, newId, newPartialKey } from "../src/db/ids.ts";
import {
  endpoints,
  formSchemas,
  submissionPartials,
  submissions,
  users,
  workspaces,
} from "../src/db/schema.ts";
import { handleSubmission } from "../src/lib/ingest/handler.ts";
import { resolveEndpoint } from "../src/lib/ingest/store.ts";
import { planSteps, stepErrors } from "../src/lib/steps/plan.ts";
import { capturePartial, countOpenPartials, readPartial } from "../src/lib/steps/store.ts";
import { readStoredDocument } from "../src/lib/schema/format.ts";
import { validateSubmission } from "../src/lib/schema/validate.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const okay = JSON.stringify(got) === JSON.stringify(want);
  if (okay) pass++;
  else fail++;
  console.log(`  ${okay ? "PASS" : "FAIL"}  ${name}`);
  if (!okay) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
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

const SLUG = "steps-test-workspace";
const EMAIL = "steps@test.invalid";
const BASE = "https://acme.endpointforms.test";

const SCHEMA = {
  formatVersion: 1,
  fields: [
    { key: "email", label: "Email", type: "email", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "budget", label: "Budget", type: "number", required: true },
  ],
  steps: [
    { id: "who", title: "About you", fields: ["email", "name"] },
    { id: "money", title: "Budget", fields: ["budget"] },
  ],
};

async function cleanup() {
  await unsafeDb.delete(workspaces).where(eq(workspaces.slug, SLUG));
  await unsafeDb.delete(users).where(eq(users.email, EMAIL));
}

async function createFixture() {
  const workspaceId = newId();
  const endpointId = newId();
  const schemaVersionId = newId();
  const publicId = newEndpointPublicId();

  await unsafeDb.insert(workspaces).values({ id: workspaceId, slug: SLUG, name: SLUG });
  await unsafeDb.insert(users).values({ id: newId(), email: EMAIL });
  await unsafeDb
    .insert(endpoints)
    .values({ id: endpointId, workspaceId, publicId, name: "Stepped form" });
  await unsafeDb.insert(formSchemas).values({
    id: schemaVersionId,
    workspaceId,
    endpointId,
    version: 1,
    fields: SCHEMA,
    mode: "warn",
    source: "builder",
  });
  await unsafeDb
    .update(endpoints)
    .set({ activeSchemaVersionId: schemaVersionId })
    .where(eq(endpoints.id, endpointId));

  return { workspaceId, endpointId, publicId, schemaVersionId };
}

async function countSubmissions(endpointId: string): Promise<number> {
  const rows = await unsafeDb
    .select({ count: sql<number>`count(*)::int` })
    .from(submissions)
    .where(eq(submissions.endpointId, endpointId));
  return rows[0]?.count ?? 0;
}

async function countPartials(endpointId: string, openOnly: boolean): Promise<number> {
  const rows = await unsafeDb
    .select({ count: sql<number>`count(*)::int` })
    .from(submissionPartials)
    .where(
      openOnly
        ? and(
            eq(submissionPartials.endpointId, endpointId),
            isNull(submissionPartials.completedAt),
          )
        : eq(submissionPartials.endpointId, endpointId),
    );
  return rows[0]?.count ?? 0;
}

// ---------------------------------------------------------------------------

console.log(`\nsteps/partials — ${describeDatabase()}`);

await cleanup();
const fx = await createFixture();
const endpoint = await resolveEndpoint(fx.publicId);
const document = readStoredDocument(SCHEMA)!;

try {
  // -------------------------------------------------------------------------
  console.log("\nA partial missing its required fields is stored, not rejected");
  // -------------------------------------------------------------------------
  const key = newPartialKey();
  const screenOne = { email: "dana@example.com", name: "Dana" };

  // The premise, asserted rather than assumed: this payload is genuinely
  // invalid against the whole form.
  const full = validateSubmission(document, screenOne);
  ok(
    "the full validator does refuse this payload",
    !full.valid && full.errors.some((issue) => issue.field === "budget"),
    full.errors.map((issue) => issue.field),
  );

  const plan = planSteps(document, screenOne, "who")!;
  t("…and yet the screen the visitor is on has nothing to correct", stepErrors(document, screenOne, plan.current), []);

  await capturePartial(endpoint, {
    partialKey: key,
    schemaVersionId: fx.schemaVersionId,
    variantId: null,
    stepId: "who",
    stepNumber: 1,
    stepsTotal: 2,
    values: screenOne,
    origin: "human",
    originReasons: [],
    utmSource: "google",
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    clickIds: {},
    referrer: null,
    userAgent: "test",
    ipHash: "hash-a",
    now: new Date(),
  });

  const stored = await readPartial(fx.workspaceId, fx.endpointId, key);
  t("the partial exists", stored !== null, true);
  // Compared as sorted entries: `jsonb` does not preserve key order, and a
  // test that depended on it would fail for a reason that is not a bug.
  t(
    "and holds what was typed",
    Object.entries(stored?.values ?? {}).sort(),
    Object.entries(screenOne).sort(),
  );
  t("and remembers the screen they reached", stored?.stepId, "who");
  t("one open partial on this endpoint", await countOpenPartials(fx.workspaceId, fx.endpointId), 1);
  t("and no submissions at all", await countSubmissions(fx.endpointId), 0);

  // -------------------------------------------------------------------------
  console.log("\nStepping again updates the one row rather than adding another");
  // -------------------------------------------------------------------------
  await capturePartial(endpoint, {
    partialKey: key,
    schemaVersionId: fx.schemaVersionId,
    variantId: null,
    stepId: "money",
    stepNumber: 2,
    stepsTotal: 2,
    values: { ...screenOne, budget: "50000" },
    origin: "human",
    originReasons: [],
    utmSource: "google",
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    clickIds: {},
    referrer: null,
    userAgent: "test",
    ipHash: "hash-a",
    now: new Date(),
  });

  t("still one row", await countPartials(fx.endpointId, false), 1);
  t("now on the second screen", (await readPartial(fx.workspaceId, fx.endpointId, key))?.stepId, "money");

  // A second visitor is a second row, so the assertion above is about the key
  // and not about the table only ever holding one thing.
  const otherKey = newPartialKey();
  await capturePartial(endpoint, {
    partialKey: otherKey,
    schemaVersionId: fx.schemaVersionId,
    variantId: null,
    stepId: "who",
    stepNumber: 1,
    stepsTotal: 2,
    values: { email: "sam@example.com" },
    origin: "unverified",
    originReasons: [],
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    clickIds: {},
    referrer: null,
    userAgent: "test",
    ipHash: "hash-b",
    now: new Date(),
  });
  t("a different visitor is a different row", await countPartials(fx.endpointId, false), 2);
  t("and both are open", await countOpenPartials(fx.workspaceId, fx.endpointId), 2);

  // -------------------------------------------------------------------------
  console.log("\nFinishing is one lead, not two");
  // -------------------------------------------------------------------------
  const before = await countSubmissions(fx.endpointId);

  const body = new URLSearchParams({
    email: "dana@example.com",
    name: "Dana",
    budget: "50000",
    _ef_partial: key,
    _ef_step: "money",
    _ef_step_to: "next",
  });
  const response = await handleSubmission(
    new Request(`${BASE}/e/${fx.publicId}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
    }),
    fx.publicId,
  );
  t("the submission is accepted", response.status, 200);

  t("exactly one submission was written", (await countSubmissions(fx.endpointId)) - before, 1);
  t("the partial is closed", await readPartial(fx.workspaceId, fx.endpointId, key), null);
  t("so only the other visitor is still open", await countOpenPartials(fx.workspaceId, fx.endpointId), 1);
  t("but the row is kept, not deleted", await countPartials(fx.endpointId, false), 2);

  const closed = await unsafeDb
    .select({ completedAt: submissionPartials.completedAt, submissionId: submissionPartials.submissionId })
    .from(submissionPartials)
    .where(eq(submissionPartials.partialKey, key))
    .limit(1);
  ok("and it names the submission it became", closed[0]?.submissionId !== null, closed[0]);

  const row = await unsafeDb
    .select({ values: submissions.values })
    .from(submissions)
    .where(eq(submissions.endpointId, fx.endpointId))
    .limit(1);
  t(
    "the submission holds the customer's fields and none of our plumbing",
    Object.keys(row[0]?.values as Record<string, unknown>).sort(),
    ["budget", "email", "name"],
  );

  // -------------------------------------------------------------------------
  console.log("\nA replayed step post cannot reopen a finished visit");
  // -------------------------------------------------------------------------
  await capturePartial(endpoint, {
    partialKey: key,
    schemaVersionId: fx.schemaVersionId,
    variantId: null,
    stepId: "who",
    stepNumber: 1,
    stepsTotal: 2,
    values: { email: "dana@example.com" },
    origin: "human",
    originReasons: [],
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    clickIds: {},
    referrer: null,
    userAgent: "test",
    ipHash: "hash-a",
    now: new Date(),
  });
  t("still closed", await readPartial(fx.workspaceId, fx.endpointId, key), null);
  t("still one open partial", await countOpenPartials(fx.workspaceId, fx.endpointId), 1);
  t("still two rows", await countPartials(fx.endpointId, false), 2);
  t("and still one submission", await countSubmissions(fx.endpointId), before + 1);

  // -------------------------------------------------------------------------
  console.log("\nPartials cannot reach the submission count or Yield's denominator");
  // -------------------------------------------------------------------------
  const submissionsBefore = await countSubmissions(fx.endpointId);
  for (let i = 0; i < 5; i++) {
    await capturePartial(endpoint, {
      partialKey: newPartialKey(),
      schemaVersionId: fx.schemaVersionId,
      variantId: null,
      stepId: "who",
      stepNumber: 1,
      stepsTotal: 2,
      values: { email: `visitor${i}@example.com` },
      origin: "unverified",
      originReasons: [],
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      clickIds: {},
      referrer: null,
      userAgent: "test",
      ipHash: `hash-${i}`,
      now: new Date(),
    });
  }
  t("five more partials landed", await countOpenPartials(fx.workspaceId, fx.endpointId), 6);
  t(
    "and the submission count did not move",
    await countSubmissions(fx.endpointId),
    submissionsBefore,
  );

  // Structural, not incidental: the two live in different tables, so no query
  // over `submissions` can see a partial by accident.
  const columns = await sqlClient`
    select column_name from information_schema.columns
    where table_name = 'submission_partials'
  `;
  const names = columns.map((c: Record<string, unknown>) => c.column_name);
  ok("a partial has no verdict column", !names.includes("verdict"), names);
  ok("…and no verdict value", !names.includes("verdict_value"), names);
  ok("…and no spam state", !names.includes("spam_state"), names);
  ok(
    "but it does carry the stamps that make sense for it",
    names.includes("origin") && names.includes("variant_id") && names.includes("schema_version_id"),
    names,
  );

  // -------------------------------------------------------------------------
  console.log("\nA partial belongs to its workspace and nobody else's");
  // -------------------------------------------------------------------------
  const strangerWorkspace = newId();
  await unsafeDb
    .insert(workspaces)
    .values({ id: strangerWorkspace, slug: `${SLUG}-stranger`, name: "Stranger" });
  try {
    const leaked = await readPartial(strangerWorkspace, fx.endpointId, otherKey);
    t("another workspace cannot read it", leaked, null);
    // The paired check: the same read from the right workspace does return it,
    // so the null above is isolation rather than a bad key.
    ok(
      "…while its own workspace can",
      (await readPartial(fx.workspaceId, fx.endpointId, otherKey)) !== null,
    );
  } finally {
    await unsafeDb.delete(workspaces).where(eq(workspaces.id, strangerWorkspace));
  }
} finally {
  await cleanup();
  await sqlClient.end();
}

console.log(`\nsteps/partials: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
