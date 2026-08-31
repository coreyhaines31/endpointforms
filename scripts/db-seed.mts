/**
 * Seeds one workspace with enough realistic data that the inbox, the origin
 * filter and the verdict rollup all have something to render.
 *
 * Deliberately shaped to show the two things the model exists for:
 *
 *   - The endpoint ran for its first eight submissions with **no schema at all**
 *     (#50). Those rows have `schema_version_id = null` and are perfectly valid.
 *     A schema was declared later (#51) and the rest carry its version. Adding
 *     it did not invalidate anything that came before, which is the constraint.
 *   - Most submissions are `awaiting`. A verdict arrives days after the lead
 *     does, and a seed where everything is already won or lost would make the
 *     UI look like a problem we have not actually solved.
 *
 * Rerunning deletes the seeded workspace and rebuilds it.
 */
import { eq } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { describeDatabase } from "../src/db/env.ts";
import { newEndpointPublicId, newId, newSubmissionPublicId } from "../src/db/ids.ts";
import {
  deliveryAttempts,
  destinations,
  endpoints,
  formSchemas,
  memberships,
  submissions,
  users,
  workspaces,
} from "../src/db/schema.ts";

const WORKSPACE_SLUG = "northwind";
const USER_EMAIL = "avery@northwind.example";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY);

/**
 * Twenty submissions. Fixed rather than random so two people running the seed
 * are looking at the same screen when they talk about it.
 *
 * `day` counts backwards from today. The first eight (day >= 30) predate the
 * schema.
 */
const SUBMISSION_FIXTURES = [
  // --- Before any schema existed. Field names are whatever the customer's
  // --- existing HTML form happened to post.
  { day: 44, origin: "human", verdict: "won", value: "18400.00", name: "Priya Raman", email: "priya@dorsetmetal.example", company: "Dorset Metal", note: "Need 200 brackets, powder-coated.", utm: ["google", "cpc", "brand-exact"], gclid: "Cj0KCQjw-brand-01" },
  { day: 42, origin: "unverified", verdict: "disqualified", value: null, name: "aaaa", email: "x@mailinator.example", company: "-", note: "SEO SERVICES CHEAP RANK #1", utm: [null, null, null], gclid: null },
  { day: 40, origin: "human", verdict: "lost", value: null, name: "Tom Whitfield", email: "t.whitfield@harlow.example", company: "Harlow Industrial", note: "Comparing three suppliers.", utm: ["google", "cpc", "generic-fabrication"], gclid: "Cj0KCQjw-gen-07" },
  { day: 38, origin: "human", verdict: "won", value: "6200.00", name: "Sandra Oyelaran", email: "s.oyelaran@keswickeng.example", company: "Keswick Engineering", note: "Repeat order, same spec as March.", utm: [null, null, null], gclid: null },
  { day: 36, origin: "unverified", verdict: "disqualified", value: null, name: "Test Test", email: "test@test.example", company: "Test", note: "test", utm: ["google", "cpc", "generic-fabrication"], gclid: "Cj0KCQjw-gen-11" },
  { day: 34, origin: "human", verdict: "awaiting", value: null, name: "Dan Kovacs", email: "dan@brightwaterco.example", company: "Brightwater", note: "Looking at a 12-week run.", utm: ["linkedin", "paid-social", "q3-manufacturing"], gclid: null },
  { day: 32, origin: "human", verdict: "won", value: "31500.00", name: "Meera Shah", email: "meera@axelrodparts.example", company: "Axelrod Parts", note: "Tooling plus first production batch.", utm: ["google", "cpc", "brand-exact"], gclid: "Cj0KCQjw-brand-04" },
  { day: 30, origin: "human", verdict: "lost", value: null, name: "Gareth Lyons", email: "g.lyons@penwood.example", company: "Penwood", note: "Went with an incumbent.", utm: ["bing", "cpc", "generic-fabrication"], gclid: null },

  // --- Schema v1 declared here. Everything below validates against it.
  { day: 27, origin: "agent", verdict: "won", value: "9800.00", name: "Ana Beltran", email: "ana@sortlinelogistics.example", company: "Sortline Logistics", note: "Requested via procurement assistant.", utm: [null, null, null], gclid: null },
  { day: 25, origin: "human", verdict: "awaiting", value: null, name: "Ruth Ellery", email: "r.ellery@camdenworks.example", company: "Camden Works", note: "Budget approved, waiting on spec sign-off.", utm: ["google", "cpc", "brand-exact"], gclid: "Cj0KCQjw-brand-09" },
  { day: 23, origin: "unverified", verdict: "disqualified", value: null, name: "Крипто Инвест", email: "noreply@bulkmail.example", company: "n/a", note: "Guaranteed returns, contact telegram", utm: [null, null, null], gclid: null },
  { day: 21, origin: "agent", verdict: "awaiting", value: null, name: "Jonah Pike", email: "jonah@fenwickmfg.example", company: "Fenwick Manufacturing", note: "Comparing lead times across four vendors.", utm: [null, null, null], gclid: null },
  { day: 18, origin: "human", verdict: "won", value: "4150.00", name: "Claire Nkemdirim", email: "claire@lowryfab.example", company: "Lowry Fab", note: "Small run, needs it in three weeks.", utm: ["google", "cpc", "generic-fabrication"], gclid: "Cj0KCQjw-gen-22" },
  { day: 16, origin: "human", verdict: "lost", value: null, name: "Stefan Roth", email: "s.roth@arlingtoncnc.example", company: "Arlington CNC", note: "Price too high for the volume.", utm: ["linkedin", "paid-social", "q3-manufacturing"], gclid: null },
  { day: 13, origin: "human", verdict: "awaiting", value: null, name: "Yusuf Adeyemi", email: "yusuf@stonebridgeco.example", company: "Stonebridge", note: "Wants a site visit first.", utm: ["google", "organic", null], gclid: null },
  { day: 11, origin: "unverified", verdict: "awaiting", value: null, name: "Marketing Team", email: "growth@coldoutreach.example", company: "Growth Co", note: "Quick question about your process — 15 min call?", utm: [null, null, null], gclid: null },
  { day: 8, origin: "agent", verdict: "awaiting", value: null, name: "Nadia Choi", email: "nadia@pellamgroup.example", company: "Pellam Group", note: "Automated RFQ, spec attached in reply.", utm: [null, null, null], gclid: null },
  { day: 6, origin: "human", verdict: "awaiting", value: null, name: "Ben Kowalczyk", email: "ben@thornhillsupply.example", company: "Thornhill Supply", note: "Need pricing on two variants.", utm: ["google", "cpc", "brand-exact"], gclid: "Cj0KCQjw-brand-15" },
  { day: 3, origin: "human", verdict: "awaiting", value: null, name: "Imogen Farrell", email: "imogen@waverleyco.example", company: "Waverley", note: "Referred by Keswick Engineering.", utm: [null, null, null], gclid: null },
  { day: 1, origin: "human", verdict: "awaiting", value: null, name: "Oscar Dunne", email: "oscar@millbrookfab.example", company: "Millbrook Fab", note: "First-time enquiry, 50 units.", utm: ["google", "cpc", "generic-fabrication"], gclid: "Cj0KCQjw-gen-31" },
] as const;

/** The reasons behind each stamp (#30). "Why is this Unverified?" must be answerable. */
const ORIGIN_REASONS = {
  human: [
    { signal: "js_token", result: "present", weight: "strong" },
    { signal: "time_to_submit", result: "24s", weight: "supporting" },
    { signal: "surface", result: "human_page", weight: "strong" },
  ],
  agent: [
    { signal: "surface", result: "manifest_tool", weight: "conclusive" },
    { signal: "agent_identity", result: "declared", weight: "strong" },
  ],
  unverified: [
    { signal: "js_token", result: "absent", weight: "strong" },
    { signal: "time_to_submit", result: "0.4s", weight: "supporting" },
    { signal: "surface", result: "human_page", weight: "context" },
  ],
} as const;

const SCHEMA_V1_FIELDS = {
  fields: [
    { key: "name", label: "Your name", type: "text", required: true },
    { key: "email", label: "Work email", type: "email", required: true },
    { key: "company", label: "Company", type: "text", required: false },
    { key: "note", label: "What do you need?", type: "textarea", required: false },
  ],
};

async function main() {
  console.log(`seeding ${describeDatabase()}`);

  // Cascades through memberships, endpoints, schemas, submissions, destinations
  // and delivery attempts.
  await unsafeDb.delete(workspaces).where(eq(workspaces.slug, WORKSPACE_SLUG));
  await unsafeDb.delete(users).where(eq(users.email, USER_EMAIL));

  const workspaceId = newId();
  const userId = newId();
  const endpointId = newId();
  const schemaVersionId = newId();
  const destinationId = newId();

  await unsafeDb.insert(workspaces).values({
    id: workspaceId,
    slug: WORKSPACE_SLUG,
    name: "Northwind Fabrication",
  });

  await unsafeDb.insert(users).values({
    id: userId,
    email: USER_EMAIL,
    name: "Avery Nash",
    emailVerifiedAt: daysAgo(60),
  });

  await unsafeDb.insert(memberships).values({
    id: newId(),
    workspaceId,
    userId,
    role: "owner",
  });

  await unsafeDb.insert(endpoints).values({
    id: endpointId,
    workspaceId,
    publicId: newEndpointPublicId(),
    name: "Request a quote",
    createdAt: daysAgo(46),
  });

  // Declared on day 28, after eight submissions had already been accepted
  // without one.
  await unsafeDb.insert(formSchemas).values({
    id: schemaVersionId,
    workspaceId,
    endpointId,
    version: 1,
    fields: SCHEMA_V1_FIELDS,
    mode: "warn",
    source: "html_import",
    createdByUserId: userId,
    createdAt: daysAgo(28),
  });

  await unsafeDb
    .update(endpoints)
    .set({ activeSchemaVersionId: schemaVersionId })
    .where(eq(endpoints.id, endpointId));

  const submissionRows = SUBMISSION_FIXTURES.map((f) => {
    const [utmSource, utmMedium, utmCampaign] = f.utm;
    const at = daysAgo(f.day);
    const hasSchema = f.day < 28;

    return {
      id: newId(),
      workspaceId,
      endpointId,
      publicId: newSubmissionPublicId(),
      schemaVersionId: hasSchema ? schemaVersionId : null,
      values: { name: f.name, email: f.email, company: f.company, note: f.note },
      rawBody: new URLSearchParams({
        name: f.name,
        email: f.email,
        company: f.company,
        note: f.note,
      }).toString(),
      rawContentType: "application/x-www-form-urlencoded",
      origin: f.origin,
      originReasons: ORIGIN_REASONS[f.origin],
      verdict: f.verdict,
      verdictValue: f.value,
      verdictCurrency: f.value ? "USD" : null,
      // A verdict lands days after the submission does. That gap is the whole
      // reason #43 warns workspaces whose sales cycle is too slow for the loop.
      verdictAt: f.verdict === "awaiting" ? null : daysAgo(Math.max(0, f.day - 9)),
      verdictSource: f.verdict === "awaiting" ? null : "webhook",
      submittedAt: at,
      createdAt: at,
      updatedAt: at,
      utmSource,
      utmMedium,
      utmCampaign,
      clickIds: f.gclid ? { gclid: f.gclid } : {},
      referrer: utmSource ? `https://www.${utmSource}.com/` : null,
      userAgent:
        f.origin === "agent"
          ? "EndpointForms-Manifest/1.0 (+agent)"
          : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
      ipHash: `sha256:${f.email.length.toString(16).padStart(4, "0")}${f.day.toString(16)}`,
    };
  });

  await unsafeDb.insert(submissions).values(submissionRows);

  await unsafeDb.insert(destinations).values({
    id: destinationId,
    workspaceId,
    endpointId,
    kind: "webhook",
    name: "CRM intake",
    config: { url: "https://crm.northwind.example/hooks/leads", method: "POST" },
    enabled: true,
    createdAt: daysAgo(45),
  });

  // The three most recent deliveries, one of them broken — #42 exists so a
  // customer finds out, and there is nothing to find out about in a seed where
  // everything succeeded.
  const recent = submissionRows.slice(-3);
  await unsafeDb.insert(deliveryAttempts).values([
    {
      id: newId(),
      workspaceId,
      destinationId,
      submissionId: recent[0].id,
      attempt: 1,
      status: "succeeded",
      requestBody: JSON.stringify(recent[0].values),
      requestHeaders: { "content-type": "application/json" },
      responseStatus: 200,
      responseBody: '{"ok":true}',
      startedAt: recent[0].submittedAt,
      completedAt: recent[0].submittedAt,
      createdAt: recent[0].submittedAt,
    },
    {
      id: newId(),
      workspaceId,
      destinationId,
      submissionId: recent[1].id,
      attempt: 1,
      status: "failed",
      requestBody: JSON.stringify(recent[1].values),
      requestHeaders: { "content-type": "application/json" },
      responseStatus: 401,
      responseBody: '{"error":"api key expired"}',
      startedAt: recent[1].submittedAt,
      completedAt: recent[1].submittedAt,
      nextRetryAt: daysAgo(0),
      createdAt: recent[1].submittedAt,
    },
    {
      id: newId(),
      workspaceId,
      destinationId,
      submissionId: recent[2].id,
      attempt: 2,
      status: "pending",
      requestBody: JSON.stringify(recent[2].values),
      requestHeaders: { "content-type": "application/json" },
      nextRetryAt: daysAgo(0),
      createdAt: recent[2].submittedAt,
    },
  ]);

  const byVerdict = SUBMISSION_FIXTURES.reduce<Record<string, number>>((acc, f) => {
    acc[f.verdict] = (acc[f.verdict] ?? 0) + 1;
    return acc;
  }, {});
  const byOrigin = SUBMISSION_FIXTURES.reduce<Record<string, number>>((acc, f) => {
    acc[f.origin] = (acc[f.origin] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`seeded workspace ${WORKSPACE_SLUG} (${workspaceId})`);
  console.log(`  1 endpoint, 1 schema version, ${submissionRows.length} submissions`);
  console.log(`  origin  ${JSON.stringify(byOrigin)}`);
  console.log(`  verdict ${JSON.stringify(byVerdict)}`);
  console.log(`  8 submissions predate the schema and have schema_version_id = null`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
