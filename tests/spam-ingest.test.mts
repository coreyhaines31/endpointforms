/**
 * Spam defenses, end to end through the real submission path (#31).
 *
 * `tests/spam.test.mts` proves the arithmetic. This proves the thing that
 * actually matters and that a pure test cannot reach: **a flagged submission is
 * a stored submission**, it comes back out of the database, it is exportable,
 * and the caller is told nothing that would let it learn its decoy-filling
 * worked.
 *
 * Written from the question "how does a lead get lost?", the same as
 * `tests/ingest.test.mts` — because the way this feature fails is not that it
 * misses spam, it is that it eats a customer's best lead and says nothing.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */

process.env.SUBMISSION_IP_SALT = "test-salt";
process.env.ORIGIN_TOKEN_SECRET = "spam-ingest-test-secret";
process.env.INGEST_RATE_LIMIT_ENDPOINT_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_IP_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE = "1000000";

import { and, eq, isNull, sql } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { withWorkspace } from "../src/db/scoped.ts";
import { newEndpointPublicId, newId } from "../src/db/ids.ts";
import {
  endpoints,
  endpointSpamPolicies,
  spamListEntries,
  submissions,
  users,
  workspaces,
} from "../src/db/schema.ts";
import { handleSubmission } from "../src/lib/ingest/handler.ts";
import { HONEYPOT_BAIT_FIELD, HONEYPOT_FIELD } from "../src/lib/spam/honeypot.ts";
import {
  addSpamListEntry,
  listSpamEntries,
  removeSpamListEntry,
  reviewSubmissionSpam,
  saveSpamPolicy,
} from "../src/lib/spam/review.ts";
import { invalidateSpamConfig, loadSpamConfig } from "../src/lib/spam/store.ts";
import { resetVelocity } from "../src/lib/spam/velocity.ts";
import { getSubmission, listSubmissionsForExport, parseSubmissionFilters } from "../src/lib/workspaces/submissions.ts";
import type { SpamReason } from "../src/lib/spam/types.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const isOk = JSON.stringify(got) === JSON.stringify(want);
  if (isOk) pass++;
  else fail++;
  console.log(`  ${isOk ? "PASS" : "FAIL"}  ${name}`);
  if (!isOk) {
    console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  }
};

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

const SLUG = "spam-test-workspace";
const EMAIL = "spam@test.invalid";
const BASE = "https://acme.endpointforms.test";

async function cleanup() {
  await unsafeDb.delete(workspaces).where(eq(workspaces.slug, SLUG));
  await unsafeDb.delete(users).where(eq(users.email, EMAIL));
}

const BROWSER_HEADERS: Record<string, string> = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8",
  "content-type": "application/x-www-form-urlencoded",
  "sec-fetch-mode": "navigate",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0 Safari/537.36",
  "x-forwarded-for": "203.0.113.7",
};

function post(endpointId: string, body: Record<string, string>, headers = BROWSER_HEADERS) {
  return new Request(`${BASE}/e/${endpointId}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(body).toString(),
    redirect: "manual",
  });
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

async function main() {
  await cleanup();
  resetVelocity();
  invalidateSpamConfig();

  const workspaceId = newId();
  const endpointId = newId();
  const publicId = newEndpointPublicId();

  await unsafeDb.insert(workspaces).values({ id: workspaceId, slug: SLUG, name: SLUG });
  await unsafeDb.insert(users).values({ id: newId(), email: EMAIL });
  const [user] = await unsafeDb.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
  await unsafeDb
    .insert(endpoints)
    .values({ id: endpointId, workspaceId, publicId, name: "Spam test" });

  // -------------------------------------------------------------------------
  console.log("\nA clean submission");
  // -------------------------------------------------------------------------
  {
    const response = await handleSubmission(
      post(publicId, {
        name: "Priya Raghunathan",
        email: "priya@northwindlogistics.co.uk",
        message: "Could someone call me this week about pricing for forty vehicles?",
      }),
      publicId,
    );
    ok("is accepted", response.status === 303 || response.status === 200, response.status);

    const rows = await rowsFor(publicId);
    t("and stored clear", rows[0]?.spamState, "clear");
    t("with a score of zero", rows[0]?.spamScore, 0);
    ok(
      "and every signal recorded anyway, not just the ones that fired",
      (rows[0]?.spamReasons as SpamReason[]).length >= 8,
      (rows[0]?.spamReasons as SpamReason[])?.map((reason) => reason.rule),
    );
  }

  // -------------------------------------------------------------------------
  console.log("\nA filled decoy — the whole point of the feature");
  // -------------------------------------------------------------------------
  {
    const before = (await rowsFor(publicId)).length;
    const response = await handleSubmission(
      post(publicId, {
        name: "Best SEO",
        email: "seo@example.invalid",
        message: "We can get you backlinks to the first page of google.",
        [HONEYPOT_FIELD]: "http://buy-links.example",
      }),
      publicId,
    );

    const rows = await rowsFor(publicId);
    t("THE HARD REQUIREMENT: the row is still written", rows.length, before + 1);

    const row = rows.find((entry) => entry.spamState === "flagged");
    ok("and it is flagged", Boolean(row), rows.map((entry) => entry.spamState));
    ok("with a score above the bar", (row?.spamScore ?? 0) >= 5, row?.spamScore);

    // The acknowledgement must be byte-identical to a clean one. Telling a
    // caller its forgery was caught is a free tuning loop — the same rule
    // `docs/23-origin-findings.md` asserts for the Origin stamp.
    ok("the caller is accepted exactly as a clean one is", response.status === 303, response.status);
    const body = await response.text();
    ok(
      "and the response says nothing about spam, a score, or a decoy",
      !/spam|flag|honeypot|score|decoy/i.test(body),
      body.slice(0, 200),
    );

    // The decoy must not turn up in the customer's inbox as a field.
    const values = row?.values as Record<string, unknown>;
    t("the decoy is stripped from values", values?.[HONEYPOT_FIELD], undefined);
    ok(
      "but is still recoverable verbatim from raw_body",
      String(row?.rawBody ?? "").includes(HONEYPOT_FIELD),
      row?.rawBody,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\nThe undo");
  // -------------------------------------------------------------------------
  {
    const flagged = (await rowsFor(publicId)).find((row) => row.spamState === "flagged");
    ok("there is a flagged row to undo", Boolean(flagged));

    const done = await reviewSubmissionSpam(
      workspaceId,
      flagged?.publicId ?? "",
      "not_spam",
      user?.id ?? "",
    );
    t("marking it not spam succeeds", done, true);

    const after = (await rowsFor(publicId)).find(
      (row) => row.publicId === flagged?.publicId,
    );
    t("the state is overruled", after?.spamState, "not_spam");
    t("the score is left alone as evidence", after?.spamScore, flagged?.spamScore);
    ok("the reasons are left alone too", Array.isArray(after?.spamReasons));
    ok("and who did it is recorded", after?.spamReviewedByUserId === user?.id);
    ok("with when", after?.spamReviewedAt instanceof Date);

    const missing = await reviewSubmissionSpam(workspaceId, "sub_does_not_exist", "not_spam", user?.id ?? "");
    t("a submission from another workspace cannot be reviewed", missing, false);
  }

  // -------------------------------------------------------------------------
  console.log("\nWorkspace lists");
  // -------------------------------------------------------------------------
  {
    await addSpamListEntry({
      workspaceId,
      kind: "email_domain",
      effect: "block",
      value: "blocked.example",
      label: "blocked.example",
      createdByUserId: user?.id ?? "",
    });
    // Same entry twice is a no-op rather than an error.
    await addSpamListEntry({
      workspaceId,
      kind: "email_domain",
      effect: "block",
      value: "blocked.example",
      label: "blocked.example",
      createdByUserId: user?.id ?? "",
    });
    const entries = await listSpamEntries(workspaceId);
    t("adding the same entry twice yields one row", entries.length, 1);

    invalidateSpamConfig();
    await handleSubmission(
      post(publicId, { email: "someone@blocked.example", message: "hello there" }),
      publicId,
    );
    const blocked = (await rowsFor(publicId)).at(-1);
    t("a blocklisted domain flags the submission", blocked?.spamState, "flagged");
    ok(
      "and the reason names the entry rather than being unexplained",
      (blocked?.spamReasons as SpamReason[]).some((reason) => reason.rule === "blocklist.email_domain"),
      (blocked?.spamReasons as SpamReason[])?.map((reason) => reason.rule),
    );

    // The allowlist has to beat everything, including a filled decoy.
    await addSpamListEntry({
      workspaceId,
      kind: "email_domain",
      effect: "allow",
      value: "trusted.example",
      label: "trusted.example",
      createdByUserId: user?.id ?? "",
    });
    invalidateSpamConfig();
    await handleSubmission(
      post(publicId, {
        email: "buyer@trusted.example",
        message: "backlinks casino https://a.example https://b.example",
        [HONEYPOT_FIELD]: "http://x.example",
        [HONEYPOT_BAIT_FIELD]: "http://y.example",
      }),
      publicId,
    );
    const allowed = (await rowsFor(publicId)).at(-1);
    t("an allowlisted domain is clear despite everything else", allowed?.spamState, "clear");
    t("and scoring stopped rather than continuing quietly", allowed?.spamScore, 0);

    const first = (await listSpamEntries(workspaceId))[0];
    t("an entry can be removed", await removeSpamListEntry(workspaceId, first?.id ?? ""), true);
    t(
      "and removing it twice is not an error, it just does nothing",
      await removeSpamListEntry(workspaceId, first?.id ?? ""),
      false,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\nPer-endpoint policy");
  // -------------------------------------------------------------------------
  {
    const saved = await saveSpamPolicy(workspaceId, publicId, {
      enabled: false,
      honeypot: true,
      timing: true,
      duplicate: true,
      velocity: true,
      content: true,
      disposableEmail: true,
      threshold: 5,
      honeypotField: null,
    });
    t("the policy saves", saved, true);
    invalidateSpamConfig();

    await handleSubmission(
      post(publicId, {
        email: "x@mailinator.com",
        message: "casino backlinks",
        [HONEYPOT_FIELD]: "http://spam.example",
      }),
      publicId,
    );
    const off = (await rowsFor(publicId)).at(-1);
    t("with scoring off, nothing is flagged", off?.spamState, "clear");
    ok(
      "and the row says why rather than looking like a clean submission",
      (off?.spamReasons as SpamReason[])?.[0]?.rule === "policy.disabled",
      off?.spamReasons,
    );
    ok("the submission is still stored, as always", Boolean(off));

    // Saving again on the same endpoint updates rather than erroring.
    const again = await saveSpamPolicy(workspaceId, publicId, {
      enabled: true,
      honeypot: true,
      timing: true,
      duplicate: true,
      velocity: true,
      content: true,
      disposableEmail: true,
      threshold: 99,
      honeypotField: null,
    });
    t("saving twice updates rather than failing", again, true);
    invalidateSpamConfig();

    await handleSubmission(
      post(publicId, {
        email: "y@mailinator.com",
        message: "casino backlinks escorts",
        [HONEYPOT_FIELD]: "http://spam.example",
      }),
      publicId,
    );
    const raised = (await rowsFor(publicId)).at(-1);
    t("a raised threshold clears what would otherwise flag", raised?.spamState, "clear");
    ok(
      "and the bar used is stored on the row, not assumed from today's default",
      (raised?.spamReasons as SpamReason[]).some((reason) => reason.observed.includes("threshold=99")),
      raised?.spamReasons,
    );

    const gone = await saveSpamPolicy(workspaceId, "ep_not_here", {
      enabled: true,
      honeypot: true,
      timing: true,
      duplicate: true,
      velocity: true,
      content: true,
      disposableEmail: true,
      threshold: 5,
      honeypotField: null,
    });
    t("a policy cannot be saved against an endpoint you cannot see", gone, false);
  }

  // -------------------------------------------------------------------------
  console.log("\nFlagged submissions are first-class rows");
  // -------------------------------------------------------------------------
  {
    const rows = await rowsFor(publicId);
    const flagged = rows.find((row) => row.spamState === "flagged");
    ok("there is at least one flagged row on this endpoint", Boolean(flagged));

    const detail = await getSubmission(workspaceId, flagged?.publicId ?? "");
    ok("it is readable through the ordinary detail query", Boolean(detail));
    t("carrying its state", detail?.spamState, "flagged");
    ok("and its reasons, so the screen can explain itself", (detail?.spamReasons.length ?? 0) > 0);

    const exported = await listSubmissionsForExport(workspaceId, parseSubmissionFilters({}));
    ok(
      "and it is in the export, not quietly filtered out of it",
      exported.some((row) => row.publicId === flagged?.publicId),
      exported.map((row) => `${row.publicId}:${row.spamState}`),
    );
    t(
      "every row this endpoint received is in the export",
      exported.length,
      rows.length,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\nTenant isolation on the two new tables");
  // -------------------------------------------------------------------------
  {
    // `tests/tenant-isolation.test.mts` asserts that every table in
    // `workspaceScopedTableNames` *has* policies. This asserts they actually
    // bite, which is a different claim: a policy on a table whose owner has
    // BYPASSRLS, or one that is ENABLE'd but not FORCE'd, is present and inert.
    const [role] = await unsafeDb.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );
    ok(
      "the connecting role cannot bypass RLS, so these assertions mean something",
      role !== undefined && !role.rolsuper && !role.rolbypassrls,
      role,
    );

    // A second workspace with one entry in each new table.
    const otherId = newId();
    const otherEndpointId = newId();
    const otherPublic = newEndpointPublicId();
    await unsafeDb
      .insert(workspaces)
      .values({ id: otherId, slug: `${SLUG}-other`, name: "other" });
    await unsafeDb.insert(endpoints).values({
      id: otherEndpointId,
      workspaceId: otherId,
      publicId: otherPublic,
      name: "Other",
    });
    await addSpamListEntry({
      workspaceId: otherId,
      kind: "email_domain",
      effect: "block",
      value: "other-workspace-only.example",
      label: "other-workspace-only.example",
      createdByUserId: user?.id ?? "",
    });
    await saveSpamPolicy(otherId, otherPublic, {
      enabled: false,
      honeypot: true,
      timing: true,
      duplicate: true,
      velocity: true,
      content: true,
      disposableEmail: true,
      threshold: 5,
      honeypotField: null,
    });

    // The realistic bug is a forgotten predicate, not a mistyped one — so these
    // read with **no where clause at all** and rely on the policy alone.
    const leaked = await withWorkspace(workspaceId, async (ws) => ({
      lists: await ws.tx.select().from(spamListEntries),
      policies: await ws.tx.select().from(endpointSpamPolicies),
    }));

    t(
      "an unfiltered read of spam_list_entries sees no other workspace's rows",
      leaked.lists.filter((row) => row.workspaceId !== workspaceId).length,
      0,
    );
    t(
      "an unfiltered read of endpoint_spam_policies sees no other workspace's rows",
      leaked.policies.filter((row) => row.workspaceId !== workspaceId).length,
      0,
    );

    // And the config loader, which runs on every submission, must not pick up
    // another tenant's blocklist. This is the one that would be a real leak:
    // one workspace's rules silently flagging another workspace's leads.
    invalidateSpamConfig();
    const config = await loadSpamConfig({ id: endpointId, workspaceId });
    t(
      "the ingest-path config loader does not inherit another workspace's blocklist",
      config.lists.blockedEmailDomains.includes("other-workspace-only.example"),
      false,
    );
    t("nor another workspace's policy", config.policy.enabled, true);

    await unsafeDb.delete(workspaces).where(eq(workspaces.id, otherId));
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
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
