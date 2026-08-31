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
import { hashPassword } from "../src/lib/auth/password.ts";
import { buildPayload, serialisePayload } from "../src/lib/destinations/payload.ts";
import { deliveryIdFor } from "../src/lib/destinations/signature.ts";
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
import { seedWaitlistEndpoint } from "./seed-waitlist.mts";
import { assessSpam } from "../src/lib/spam/assess.ts";
import type { SpamAssessment } from "../src/lib/spam/types.ts";

/**
 * The shipped scorer, run over the fixture exactly as ingest would run it over
 * a real payload. Memoised because it is called three times per row above and
 * the cost is a handful of regexes either way.
 */
const spamCache = new Map<string, SpamAssessment>();
function spamFor(f: { name: string; email: string; company: string; note: string }): SpamAssessment {
  const key = f.email + "\u0000" + f.note;
  const cached = spamCache.get(key);
  if (cached) return cached;
  const assessment = assessSpam({
    values: { name: f.name, email: f.email, company: f.company, note: f.note },
    endpointPublicId: "seed",
    ipHash: null,
  });
  spamCache.set(key, assessment);
  return assessment;
}

const WORKSPACE_SLUG = "northwind";
const USER_EMAIL = "avery@northwind.example";
/** Development only. Long enough to satisfy MIN_PASSWORD_LENGTH. */
const SEED_PASSWORD = "northwind-demo-2026";

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
  { day: 42, origin: "unverified", verdict: "disqualified", value: null, name: "aaaa", email: "x@mailinator.com", company: "-", note: "I came across your website and noticed some issues. We can get you backlinks and first page of google rankings — https://seo-boost.example https://rank-fast.example https://cheap-links.example", utm: [null, null, null], gclid: null },
  { day: 40, origin: "human", verdict: "lost", value: null, name: "Tom Whitfield", email: "t.whitfield@harlow.example", company: "Harlow Industrial", note: "Comparing three suppliers.", utm: ["google", "cpc", "generic-fabrication"], gclid: "Cj0KCQjw-gen-07" },
  { day: 38, origin: "human", verdict: "won", value: "6200.00", name: "Sandra Oyelaran", email: "s.oyelaran@keswickeng.example", company: "Keswick Engineering", note: "Repeat order, same spec as March.", utm: [null, null, null], gclid: null },
  { day: 36, origin: "unverified", verdict: "disqualified", value: null, name: "Test Test", email: "test@test.example", company: "Test", note: "test", utm: ["google", "cpc", "generic-fabrication"], gclid: "Cj0KCQjw-gen-11" },
  { day: 34, origin: "human", verdict: "awaiting", value: null, name: "Dan Kovacs", email: "dan@brightwaterco.example", company: "Brightwater", note: "Looking at a 12-week run.", utm: ["linkedin", "paid-social", "q3-manufacturing"], gclid: null },
  { day: 32, origin: "human", verdict: "won", value: "31500.00", name: "Meera Shah", email: "meera@axelrodparts.example", company: "Axelrod Parts", note: "Tooling plus first production batch.", utm: ["google", "cpc", "brand-exact"], gclid: "Cj0KCQjw-brand-04" },
  { day: 30, origin: "human", verdict: "lost", value: null, name: "Gareth Lyons", email: "g.lyons@penwood.example", company: "Penwood", note: "Went with an incumbent.", utm: ["bing", "cpc", "generic-fabrication"], gclid: null },

  // --- Schema v1 declared here. Everything below validates against it.
  { day: 27, origin: "agent", verdict: "won", value: "9800.00", name: "Ana Beltran", email: "ana@sortlinelogistics.example", company: "Sortline Logistics", note: "Requested via procurement assistant.", utm: [null, null, null], gclid: null },
  { day: 25, origin: "human", verdict: "awaiting", value: null, name: "Ruth Ellery", email: "r.ellery@camdenworks.example", company: "Camden Works", note: "Budget approved, waiting on spec sign-off.", utm: ["google", "cpc", "brand-exact"], gclid: "Cj0KCQjw-brand-09" },
  { day: 23, origin: "unverified", verdict: "disqualified", value: null, name: "Крипто Инвест", email: "noreply@bulkmail.example", company: "n/a", note: "Act now — guaranteed bitcoin returns, 100% risk-free. [url=http://t.example]contact telegram[/url]", utm: [null, null, null], gclid: null },
  { day: 21, origin: "agent", verdict: "awaiting", value: null, name: "Jonah Pike", email: "jonah@fenwickmfg.example", company: "Fenwick Manufacturing", note: "Comparing lead times across four vendors.", utm: [null, null, null], gclid: null },
  // A deal that closed and whose amount nobody ever recorded. Yield (#44) counts
  // it fully towards the rate and not at all towards the value, and says so on
  // the panel — a won deal with no amount is not a deal worth nothing.
  { day: 20, origin: "human", verdict: "won", value: null, name: "Elena Marsh", email: "elena@calderwoodsteel.example", company: "Calderwood Steel", note: "Order placed over the phone.", utm: ["google", "cpc", "brand-exact"], gclid: "Cj0KCQjw-brand-12" },
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

  // A password, so the demo data is reachable. Without one this user exists but
  // cannot sign in, and the only way into the app is to sign up fresh — which
  // lands you in an empty workspace while all 21 submissions, the verdicts, the
  // spam examples and the destinations sit in this one, invisible.
  //
  // Development only. `db-seed.mts` refuses to run against anything but a local
  // database, and the credential is printed rather than hidden because a seed
  // password nobody can find is the same as no seed password.
  await unsafeDb.insert(users).values({
    id: userId,
    email: USER_EMAIL,
    name: "Avery Nash",
    emailVerified: daysAgo(60),
    passwordHash: await hashPassword(SEED_PASSWORD),
  });

  await unsafeDb.insert(memberships).values({
    id: newId(),
    workspaceId,
    userId,
    role: "owner",
  });

  // Held in a variable: the seeded delivery payloads carry it, and a second
  // call to `newEndpointPublicId()` would put a different id in them than the
  // endpoint actually has.
  const endpointPublicId = newEndpointPublicId();

  await unsafeDb.insert(endpoints).values({
    id: endpointId,
    workspaceId,
    publicId: endpointPublicId,
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
      // Scored by the real function rather than hand-written (#31), so the demo
      // data can never claim a flag the shipped ruleset would not produce — and
      // so a change to the weights shows up here the next time anyone seeds.
      // Note that the SEO row and the crypto row are `disqualified` on the
      // *outcome* axis too: a person decided that, downstream, and the two
      // columns agreeing is a coincidence rather than a mechanism.
      spamState: spamFor(f).state,
      spamScore: spamFor(f).score,
      spamReasons: spamFor(f).reasons,
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

  // Destinations (#41) and their delivery history (#42).
  //
  // Four of them, chosen so every health state has something behind it on a
  // fresh clone: one delivering, one failing with a dead-lettered delivery, one
  // email that works, and one paused Slack that has never been tried. A seed
  // where everything succeeded would make the health banner unreachable, and
  // the banner is the half of pillar 2 nobody else does.
  const crmDestinationId = destinationId;
  const warehouseDestinationId = newId();
  const inboxDestinationId = newId();
  const slackDestinationId = newId();

  await unsafeDb.insert(destinations).values([
    {
      id: crmDestinationId,
      workspaceId,
      endpointId,
      kind: "webhook",
      name: "CRM intake",
      config: {
        url: "https://crm.northwind.example/hooks/leads",
        // Seeded rather than generated so two people running the seed can
        // verify the same signature by hand. A real one is never re-readable.
        secret: "whsec_seed_northwind_crm_intake_000",
      },
      enabled: true,
      createdAt: daysAgo(45),
    },
    {
      id: warehouseDestinationId,
      workspaceId,
      endpointId,
      kind: "webhook",
      name: "Ops warehouse sync",
      config: {
        url: "https://warehouse.northwind.example/ingest/leads",
        secret: "whsec_seed_northwind_warehouse_0000",
        headers: { Authorization: "Bearer seed-token-that-expired" },
      },
      enabled: true,
      createdAt: daysAgo(30),
    },
    {
      id: inboxDestinationId,
      workspaceId,
      endpointId,
      kind: "email",
      name: "Sales inbox",
      config: { to: ["sales@northwind.example"] },
      enabled: true,
      createdAt: daysAgo(20),
    },
    {
      id: slackDestinationId,
      workspaceId,
      endpointId,
      kind: "slack",
      name: "#leads",
      config: { webhookUrl: "https://hooks.slack.com/services/T0SEED/B0SEED/seedtoken" },
      // Paused, and never delivered to. "Untested" is a first-class state and
      // the screen has to be able to show it.
      enabled: false,
      createdAt: daysAgo(4),
    },
  ]);

  /**
   * A seeded delivery body, in the real payload shape.
   *
   * Built with `buildPayload` rather than hand-written JSON so the seed cannot
   * drift from the contract in `docs/28-destinations.md`. A delivery log full
   * of a shape we no longer send is a debugging aid that misleads.
   */
  const seededBody = (
    row: (typeof submissionRows)[number],
    destinationId: string,
    attempt: number,
  ) =>
    serialisePayload(
      buildPayload(
        {
          endpointPublicId,
          endpointName: "Request a quote",
          submissionPublicId: row.publicId,
          submittedAt: row.submittedAt,
          origin: row.origin,
          originReasons: [],
          verdict: row.verdict,
          verdictValue: row.verdictValue ?? null,
          verdictCurrency: row.verdictCurrency ?? null,
          values: row.values,
          utmSource: row.utmSource,
          utmMedium: row.utmMedium,
          utmCampaign: row.utmCampaign,
          utmTerm: null,
          utmContent: null,
          clickIds: row.clickIds,
          referrer: row.referrer,
          schemaVersionId: row.schemaVersionId ?? null,
        },
        {
          id: deliveryIdFor(destinationId, row.id),
          attempt,
          sentAt: row.submittedAt,
          test: false,
        },
      ),
    );

  const signedHeaders = (destinationId: string, row: (typeof submissionRows)[number]) => ({
    "content-type": "application/json",
    "user-agent": "EndpointForms/1.0 (+https://endpointforms.com/docs/destinations)",
    "x-endpoint-event": "submission.created",
    "x-endpoint-delivery-id": deliveryIdFor(destinationId, row.id),
    "x-endpoint-timestamp": String(Math.floor(row.submittedAt.getTime() / 1000)),
    "x-endpoint-signature": "v1=seeded-signature-not-recomputed",
  });

  const recent = submissionRows.slice(-6);

  await unsafeDb.insert(deliveryAttempts).values([
    // --- CRM intake: delivering. The most recent attempt succeeded, so the
    // --- older failure below no longer counts against it — which is the point
    // --- of counting failures *since the last success*.
    ...recent.slice(-3).map((row, index) => ({
      id: newId(),
      workspaceId,
      destinationId: crmDestinationId,
      submissionId: row.id,
      attempt: 1,
      status: "succeeded" as const,
      requestBody: seededBody(row, crmDestinationId, 1),
      requestHeaders: signedHeaders(crmDestinationId, row),
      responseStatus: 200,
      responseBody: `{"ok":true,"contactId":"c_${1000 + index}"}`,
      startedAt: row.submittedAt,
      completedAt: row.submittedAt,
      createdAt: row.submittedAt,
    })),
    {
      id: newId(),
      workspaceId,
      destinationId: crmDestinationId,
      submissionId: recent[0].id,
      attempt: 1,
      status: "failed" as const,
      requestBody: seededBody(recent[0], crmDestinationId, 1),
      requestHeaders: signedHeaders(crmDestinationId, recent[0]),
      responseStatus: 502,
      responseBody: "<html><head><title>502 Bad Gateway</title></head></html>",
      error:
        "CRM intake returned a server error. Their end, not ours — retrying. Retrying in 30s.",
      startedAt: recent[0].submittedAt,
      completedAt: recent[0].submittedAt,
      createdAt: recent[0].submittedAt,
    },
    {
      id: newId(),
      workspaceId,
      destinationId: crmDestinationId,
      submissionId: recent[0].id,
      attempt: 2,
      status: "succeeded" as const,
      requestBody: seededBody(recent[0], crmDestinationId, 2),
      requestHeaders: signedHeaders(crmDestinationId, recent[0]),
      responseStatus: 200,
      responseBody: '{"ok":true,"contactId":"c_0994"}',
      startedAt: new Date(recent[0].submittedAt.getTime() + 31_000),
      completedAt: new Date(recent[0].submittedAt.getTime() + 31_400),
      createdAt: new Date(recent[0].submittedAt.getTime() + 31_000),
    },

    // --- Ops warehouse sync: an expired token. Three failures since the last
    // --- success, none of them retried, because a 401 will be a 401 in an hour.
    ...recent.slice(-3).map((row) => ({
      id: newId(),
      workspaceId,
      destinationId: warehouseDestinationId,
      submissionId: row.id,
      attempt: 1,
      status: "failed" as const,
      requestBody: seededBody(row, warehouseDestinationId, 1),
      requestHeaders: {
        ...signedHeaders(warehouseDestinationId, row),
        // A customer's own header is masked in the log — that is where an API
        // key lives, and the log is readable by the whole workspace.
        Authorization: "[redacted]",
      },
      responseStatus: 401,
      responseBody: '{"error":"token_expired","hint":"rotate the service token"}',
      error:
        "Ops warehouse sync rejected our credentials. A token or key has expired or been revoked — replace it, then redeliver. Not retried — an hour would not change the answer.",
      startedAt: row.submittedAt,
      completedAt: row.submittedAt,
      // Null: not retried, and therefore dead-lettered. Nothing was thrown
      // away — "Send again" in the log replays it once the token is fixed.
      nextRetryAt: null,
      createdAt: row.submittedAt,
    })),

    // --- Sales inbox: quietly working.
    ...recent.slice(-2).map((row) => ({
      id: newId(),
      workspaceId,
      destinationId: inboxDestinationId,
      submissionId: row.id,
      attempt: 1,
      status: "succeeded" as const,
      requestBody: seededBody(row, inboxDestinationId, 1),
      requestHeaders: {
        to: "sales@northwind.example",
        subject: `${row.origin === "human" ? "Human" : row.origin === "agent" ? "Agent" : "Unverified"} submission — Request a quote`,
      },
      responseStatus: 200,
      responseBody: '{"id":"3f7c2b91-seed"}',
      startedAt: row.submittedAt,
      completedAt: row.submittedAt,
      createdAt: row.submittedAt,
    })),
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
  console.log(`  sign in at /login as ${USER_EMAIL} / ${SEED_PASSWORD}`);
  console.log(`  1 endpoint, 1 schema version, ${submissionRows.length} submissions`);
  console.log(`  origin  ${JSON.stringify(byOrigin)}`);
  console.log(`  verdict ${JSON.stringify(byVerdict)}`);
  console.log(`  8 submissions predate the schema and have schema_version_id = null`);
  console.log(`  4 destinations: one delivering, one failing on an expired token, one email, one paused`);

  // Our own waitlist form (#33). Additive and idempotent — unlike everything
  // above it, this endpoint holds real signups and is never torn down.
  await seedWaitlistEndpoint(unsafeDb);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
