/**
 * The agent API core (#133), against a real database.
 *
 * REST, MCP and the CLI all reach endpoints, forms and submissions through
 * `src/lib/api/`, so this is where auth, scopes, workspace scoping and
 * pagination are proven once for all three.
 *
 * Every "this must not be reachable" assertion is paired with a positive
 * control: the same call, made by the workspace that does own the row, shown
 * to succeed. An absence proves nothing until it has been shown it could have
 * been a presence.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */
import { eq, inArray, sql } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { newEndpointPublicId, newId, newSubmissionPublicId } from "../src/db/ids.ts";
import {
  endpoints,
  memberships,
  submissionFiles,
  submissions,
  users,
  verdictApiKeys,
  workspaces,
} from "../src/db/schema.ts";
import { AccountAuthError, authenticateAccountKey } from "../src/lib/account/auth.ts";
import { ALL_SCOPES } from "../src/lib/account/scopes.ts";
import { isApiError, type ApiContext } from "../src/lib/api/context.ts";
import {
  createEndpoint,
  deleteEndpoint,
  getEndpoint,
  listEndpoints,
  updateEndpoint,
  whoami,
} from "../src/lib/api/endpoints.ts";
import { getFormSchema, setFormSchema } from "../src/lib/api/forms.ts";
import {
  decodeCursor,
  deleteSubmission,
  encodeCursor,
  exportSubmissions,
  getSubmission,
  listDestinations,
  listSubmissionDeliveries,
  listSubmissions,
} from "../src/lib/api/submissions.ts";
import { createVerdictApiKey, revokeVerdictApiKey } from "../src/lib/verdict/key-store.ts";

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

/** The ApiError code a call failed with, or "ok". */
async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (error) {
    if (isApiError(error)) return error.code;
    if (error instanceof AccountAuthError) return "unauthorized";
    throw error;
  }
}

const SLUGS = ["api-core-alpha", "api-core-beta"];
const EMAILS = ["owner@api-core-alpha.test", "owner@api-core-beta.test"];
const MEMBER_EMAIL = "member@api-core-alpha.test";
/** Only workspace B's submission carries this, so its absence from A's reads means something. */
const B_MARKER = "beta-only-secret-marker";

type Fixture = {
  workspaceId: string;
  ownerId: string;
  endpointId: string;
  endpointPublicId: string;
  submissionPublicIds: string[];
};

async function cleanup() {
  await unsafeDb.delete(workspaces).where(inArray(workspaces.slug, SLUGS));
  await unsafeDb.delete(users).where(inArray(users.email, [...EMAILS, MEMBER_EMAIL]));
}

async function createFixture(index: number, submissionCount: number): Promise<Fixture> {
  const f: Fixture = {
    workspaceId: newId(),
    ownerId: newId(),
    endpointId: newId(),
    endpointPublicId: newEndpointPublicId(),
    submissionPublicIds: [],
  };

  await unsafeDb.insert(workspaces).values({ id: f.workspaceId, slug: SLUGS[index], name: SLUGS[index] });
  await unsafeDb.insert(users).values({ id: f.ownerId, email: EMAILS[index] });
  await unsafeDb.insert(memberships).values({ id: newId(), workspaceId: f.workspaceId, userId: f.ownerId, role: "owner" });
  await unsafeDb.insert(endpoints).values({
    id: f.endpointId,
    workspaceId: f.workspaceId,
    publicId: f.endpointPublicId,
    name: `${SLUGS[index]} contact`,
  });

  for (let i = 0; i < submissionCount; i++) {
    const id = newId();
    const publicId = newSubmissionPublicId();
    f.submissionPublicIds.push(publicId);
    await unsafeDb.insert(submissions).values({
      id,
      workspaceId: f.workspaceId,
      endpointId: f.endpointId,
      publicId,
      values: { email: `lead${i}@example.com`, note: index === 1 ? B_MARKER : `alpha note ${i}` },
      verdict: i % 3 === 0 ? "won" : "awaiting",
      spamState: i === 1 ? "flagged" : "clear",
      origin: i % 2 === 0 ? "human" : "agent",
    });
  }

  return f;
}

/**
 * Times with microseconds, several inside one millisecond. A cursor that
 * round-trips through a JS `Date` loses the microseconds and skips rows here.
 */
const TIMES = [
  "2026-03-01T10:00:00.000900Z",
  "2026-03-01T10:00:00.000500Z",
  "2026-03-01T10:00:00.000100Z",
  "2026-02-15T09:00:00.000000Z",
  "2026-02-15T09:00:00.000000Z", // an exact tie — broken by id
  "2026-01-10T08:00:00.000000Z",
  "2026-01-01T00:00:00.000000Z",
];

async function setTimes(f: Fixture) {
  for (const [i, publicId] of f.submissionPublicIds.entries()) {
    await unsafeDb.execute(
      sql`update submissions set submitted_at = ${TIMES[i % TIMES.length]}::timestamptz where public_id = ${publicId}`,
    );
  }
}

async function main() {
  await cleanup();

  const a = await createFixture(0, TIMES.length);
  const b = await createFixture(1, 1);
  await setTimes(a);

  const full = await createVerdictApiKey({
    workspaceId: a.workspaceId,
    label: "full",
    createdByUserId: a.ownerId,
    scopes: ALL_SCOPES,
    createdVia: "mcp",
  });
  const bFull = await createVerdictApiKey({
    workspaceId: b.workspaceId,
    label: "full",
    createdByUserId: b.ownerId,
    scopes: ALL_SCOPES,
    createdVia: "mcp",
  });
  const endpointsOnly = await createVerdictApiKey({
    workspaceId: a.workspaceId,
    label: "endpoints only",
    createdByUserId: a.ownerId,
    scopes: ["endpoints:read"],
    createdVia: "mcp",
  });

  const opts = { renderDomain: "forms.test", appUrl: "https://app.test" };
  const ctxA: ApiContext = { caller: await authenticateAccountKey(full.key), ...opts };
  const ctxB: ApiContext = { caller: await authenticateAccountKey(bFull.key), ...opts };
  const ctxReadOnly: ApiContext = { caller: await authenticateAccountKey(endpointsOnly.key), ...opts };

  // -------------------------------------------------------------------------
  console.log("\nauth");
  {
    t("no key is refused", await codeOf(() => authenticateAccountKey(null)), "unauthorized");
    t("a malformed key is refused", await codeOf(() => authenticateAccountKey("efv2.nope.nope")), "unauthorized");
    t(
      "a well-formed key with the wrong secret is refused",
      await codeOf(() => authenticateAccountKey(`${full.key.slice(0, -4)}AAAA`)),
      "unauthorized",
    );
    t("positive control: the real key authenticates", await codeOf(() => authenticateAccountKey(full.key)), "ok");
    t("and resolves to its own workspace", ctxA.caller.workspaceId, a.workspaceId);

    const doomed = await createVerdictApiKey({
      workspaceId: a.workspaceId,
      label: "doomed",
      createdByUserId: a.ownerId,
      scopes: ALL_SCOPES,
      createdVia: "mcp",
    });
    t("a fresh key works", await codeOf(() => authenticateAccountKey(doomed.key)), "ok");
    await revokeVerdictApiKey(a.workspaceId, String(doomed.summary.id));
    t("and is refused once revoked", await codeOf(() => authenticateAccountKey(doomed.key)), "unauthorized");

    // A key minted by someone who is only a member cannot manage the workspace.
    const memberId = newId();
    await unsafeDb.insert(users).values({ id: memberId, email: MEMBER_EMAIL });
    await unsafeDb.insert(memberships).values({ id: newId(), workspaceId: a.workspaceId, userId: memberId, role: "member" });
    const memberKey = await createVerdictApiKey({
      workspaceId: a.workspaceId,
      label: "member",
      createdByUserId: memberId,
      scopes: ALL_SCOPES,
      createdVia: "mcp",
    });
    t("a key whose creator is not an owner is refused", await codeOf(() => authenticateAccountKey(memberKey.key)), "unauthorized");

    const me = await whoami(ctxA);
    t("whoami names the key's workspace", me.workspace.slug, SLUGS[0]);
  }

  // -------------------------------------------------------------------------
  console.log("\nscopes");
  {
    t("endpoints:read can list endpoints", await codeOf(() => listEndpoints(ctxReadOnly)), "ok");
    t("but cannot read submissions without submissions:read", await codeOf(() => listSubmissions(ctxReadOnly, {})), "forbidden");
    t("nor get one", await codeOf(() => getSubmission(ctxReadOnly, a.submissionPublicIds[0])), "forbidden");
    t("nor export", await codeOf(() => exportSubmissions(ctxReadOnly, {})), "forbidden");
    t("nor delete", await codeOf(() => deleteSubmission(ctxReadOnly, a.submissionPublicIds[0])), "forbidden");
    t("nor create endpoints", await codeOf(() => createEndpoint(ctxReadOnly, { name: "x" })), "forbidden");
    t("nor write a form schema", await codeOf(() => setFormSchema(ctxReadOnly, a.endpointPublicId, { document: { fields: [] } })), "forbidden");
    t("positive control: the full key reads submissions", await codeOf(() => listSubmissions(ctxA, {})), "ok");
  }

  // -------------------------------------------------------------------------
  console.log("\nno cross-workspace access");
  {
    const bSub = b.submissionPublicIds[0];
    const bEp = b.endpointPublicId;

    t("positive control: B reads its own submission", await codeOf(() => getSubmission(ctxB, bSub)), "ok");
    t("A cannot read B's submission", await codeOf(() => getSubmission(ctxA, bSub)), "not_found");
    t("nor its deliveries", await codeOf(() => listSubmissionDeliveries(ctxA, bSub)), "not_found");
    t("nor delete it", await codeOf(() => deleteSubmission(ctxA, bSub)), "not_found");
    t("and B's submission survived the attempt", await codeOf(() => getSubmission(ctxB, bSub)), "ok");

    t("positive control: B reads its own endpoint", await codeOf(() => getEndpoint(ctxB, bEp)), "ok");
    t("A cannot read B's endpoint", await codeOf(() => getEndpoint(ctxA, bEp)), "not_found");
    t("nor rename it", await codeOf(() => updateEndpoint(ctxA, bEp, { name: "hijacked" })), "not_found");
    t("nor archive it", await codeOf(() => deleteEndpoint(ctxA, bEp)), "not_found");
    const bAfter = await getEndpoint(ctxB, bEp);
    t("and B's endpoint is untouched", [bAfter.name, bAfter.archived], [`${SLUGS[1]} contact`, false]);
    t("A cannot read B's form schema", await codeOf(() => getFormSchema(ctxA, bEp)), "not_found");
    t("nor write one", await codeOf(() => setFormSchema(ctxA, bEp, { document: { fields: [] } })), "not_found");
    t("nor list B's destinations", await codeOf(() => listDestinations(ctxA, bEp)), "not_found");
    t("nor filter submissions by B's endpoint", await codeOf(() => listSubmissions(ctxA, { endpoint: bEp })), "not_found");

    const bList = await listSubmissions(ctxB, {});
    ok("positive control: B's list carries the marker", JSON.stringify(bList).includes(B_MARKER));
    const aList = await listSubmissions(ctxA, { limit: 200 });
    ok("A's list does not", !JSON.stringify(aList).includes(B_MARKER));
    ok("and A's list is not empty, so that means something", aList.data.length === TIMES.length, aList.data.length);
    t("searching A for B's marker finds nothing", (await listSubmissions(ctxA, { q: B_MARKER })).data.length, 0);

    const bExport = await exportSubmissions(ctxB, { format: "json" });
    ok("positive control: B's export carries the marker", bExport.body.includes(B_MARKER));
    const aExport = await exportSubmissions(ctxA, { format: "json" });
    ok("A's export does not", !aExport.body.includes(B_MARKER));
    t("and A's export has A's rows", aExport.count, TIMES.length);

    const aEndpoints = await listEndpoints(ctxA);
    ok("A's endpoint list does not include B's", !aEndpoints.some((e) => e.id === bEp) && aEndpoints.some((e) => e.id === a.endpointPublicId));
  }

  // -------------------------------------------------------------------------
  console.log("\npagination");
  {
    const all = (await listSubmissions(ctxA, { limit: 200 })).data;
    t("one page holds everything, newest first", all.map((s) => s.submitted_at.slice(0, 10)), TIMES.map((x) => x.slice(0, 10)));
    t("and there is no next page", (await listSubmissions(ctxA, { limit: 200 })).next_cursor, null);

    const walked: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listSubmissions(ctxA, { limit: 2, cursor });
      walked.push(...page.data.map((s) => s.id));
      cursor = page.next_cursor ?? undefined;
      pages++;
    } while (cursor && pages < 20);

    t("walking pages of 2 visits every row exactly once, in order", walked, all.map((s) => s.id));
    t("in ceil(7/2) pages", pages, 4);

    const first = await listSubmissions(ctxA, { limit: 1 });
    const decoded = decodeCursor(first.next_cursor ?? "");
    ok("the cursor keeps microseconds", decoded.at.endsWith(".000900Z"), decoded);
    t("and round-trips", decodeCursor(encodeCursor(decoded)), decoded);

    t("a garbage cursor is a 400", await codeOf(() => listSubmissions(ctxA, { cursor: "not-a-cursor" })), "invalid_request");
    const injected = Buffer.from(JSON.stringify(["2026-01-01'; drop table submissions;--", "x"])).toString("base64url");
    t("a cursor carrying SQL is a 400", await codeOf(() => listSubmissions(ctxA, { cursor: injected })), "invalid_request");
    t("a limit above the cap is a 400", await codeOf(() => listSubmissions(ctxA, { limit: 1000 })), "invalid_request");
    t("an unknown filter is a 400", await codeOf(() => listSubmissions(ctxA, { colour: "red" })), "invalid_request");
  }

  // -------------------------------------------------------------------------
  console.log("\nfilters");
  {
    const won = await listSubmissions(ctxA, { verdict: "won" });
    t("verdict", won.data.map((s) => s.outcome.verdict), ["won", "won", "won"]);
    const flagged = await listSubmissions(ctxA, { spam: ["flagged"] });
    t("spam state", flagged.data.length, 1);
    t("a bad enum value is a 400", await codeOf(() => listSubmissions(ctxA, { spam: "maybe" })), "invalid_request");
    const agent = await listSubmissions(ctxA, { origin: "agent" });
    ok("origin", agent.data.length === 3 && agent.data.every((s) => s.origin === "agent"), agent.data.length);
    const feb = await listSubmissions(ctxA, { from: "2026-02-01", to: "2026-02-15" });
    t("a date-only range includes its last day", feb.data.length, 2);
    const before = await listSubmissions(ctxA, { to: "2026-02-15T09:00:00Z" });
    t("a timestamp `to` is exclusive", before.data.length, 2);
    const byEndpoint = await listSubmissions(ctxA, { endpoint: a.endpointPublicId, limit: 200 });
    t("by endpoint", byEndpoint.data.length, TIMES.length);
    const search = await listSubmissions(ctxA, { q: "lead3@" });
    t("search across values", search.data.map((s) => s.values.email), ["lead3@example.com"]);
    const pct = await listSubmissions(ctxA, { q: "%" });
    t("a % in a search is a literal, not a wildcard", pct.data.length, 0);
  }

  // -------------------------------------------------------------------------
  console.log("\nsubmission detail, files and delete");
  {
    const target = a.submissionPublicIds[2];
    const [row] = await unsafeDb.select({ id: submissions.id }).from(submissions).where(eq(submissions.publicId, target));
    const filePublicId = `file${newId().replace(/-/g, "").slice(0, 16)}`;
    await unsafeDb.insert(submissionFiles).values({
      id: newId(),
      workspaceId: a.workspaceId,
      endpointId: a.endpointId,
      submissionId: row.id,
      publicId: filePublicId,
      fieldKey: "cv",
      filename: "cv.pdf",
      declaredContentType: "application/pdf",
      size: 1234,
      sha256: "0".repeat(64),
    });
    // One genuine reference to that file, and one forged reference to B's
    // (made-up) file id, both in `values`.
    const ref = (id: string) => ({ file: true, stored: true, id, filename: "x.pdf", contentType: "application/pdf", detectedType: null, size: 1, sha256: "0", url: "https://stale.example/old", expiresAt: null });
    await unsafeDb
      .update(submissions)
      .set({ values: { email: "lead2@example.com", cv: ref(filePublicId), forged: ref("someone-elses-file") } })
      .where(eq(submissions.id, row.id));

    const detail = await getSubmission(ctxA, target);
    t("detail lists the file from the table", detail.files.map((f) => [f.id, f.field, f.size]), [[filePublicId, "cv", 1234]]);
    ok("with a signed download link", typeof detail.files[0]?.download_url === "string" && detail.files[0].download_url.includes(filePublicId));
    const values = detail.values as Record<string, { url: string }>;
    ok("the genuine reference in values is re-signed", values.cv.url !== "https://stale.example/old" && values.cv.url.includes(filePublicId), values.cv.url);
    t("a forged reference is left exactly as stored, never signed", values.forged.url, "https://stale.example/old");
    t("deliveries are listed (none here)", await listSubmissionDeliveries(ctxA, target), []);

    t("delete works", (await deleteSubmission(ctxA, target)).deleted, true);
    t("and the submission is gone", await codeOf(() => getSubmission(ctxA, target)), "not_found");
    t("from the list too", (await listSubmissions(ctxA, { limit: 200 })).data.length, TIMES.length - 1);
    t("deleting it again is a 404", await codeOf(() => deleteSubmission(ctxA, target)), "not_found");
    t("an id that cannot be a public id is a 404", await codeOf(() => getSubmission(ctxA, "../../etc")), "not_found");
  }

  // -------------------------------------------------------------------------
  console.log("\nendpoints");
  {
    const created = await createEndpoint(ctxA, { name: "Demo request" });
    t("create names it", created.name, "Demo request");
    t("and notifies the key's creator, not an argument", created.notifies, EMAILS[0]);
    ok("and returns its submit URL", created.submit_url.includes(created.id) && created.submit_url.includes("forms.test"), created.submit_url);
    t("create refuses an empty name", await codeOf(() => createEndpoint(ctxA, { name: "  " })), "invalid_request");
    t("and an unknown field", await codeOf(() => createEndpoint(ctxA, { name: "x", notify: "attacker@evil.test" })), "invalid_request");

    const renamed = await updateEndpoint(ctxA, created.id, { name: "Demo" });
    t("update renames", renamed.name, "Demo");
    t("an empty update is a 400", await codeOf(() => updateEndpoint(ctxA, created.id, {})), "invalid_request");
    const archived = await deleteEndpoint(ctxA, created.id);
    t("delete archives", archived.archived, true);
    t("and it is still readable", (await getEndpoint(ctxA, created.id)).archived, true);
    const restored = await updateEndpoint(ctxA, created.id, { archived: false });
    t("update can restore it", restored.archived, false);

    const destinations = await listDestinations(ctxA, created.id);
    t("its default notification is listed", destinations.map((d) => [d.kind, d.default_notification]), [["email", true]]);
    ok("with no config in it", destinations.every((d) => !("config" in d)));
  }

  // -------------------------------------------------------------------------
  console.log("\nform schema");
  {
    t("no schema to start with", (await getFormSchema(ctxA, a.endpointPublicId)).schema, null);
    const document = { formatVersion: 1, fields: [{ key: "email", label: "Email", type: "email", required: true }] };
    const published = await setFormSchema(ctxA, a.endpointPublicId, { document, mode: "warn" });
    t("set publishes version 1", [published.version, published.active], [1, true]);
    const read = await getFormSchema(ctxA, a.endpointPublicId);
    t("get returns it", read.schema?.document?.fields.map((f) => f.key), ["email"]);
    t("recorded as a file producer", read.schema?.source, "file");

    const draft = await setFormSchema(ctxA, a.endpointPublicId, { document: JSON.stringify(document), activate: false });
    t("a draft writes version 2 without going live", [draft.version, draft.active], [2, false]);
    t("so the live one is still version 1", (await getFormSchema(ctxA, a.endpointPublicId)).schema?.version, 1);

    t(
      "an invalid schema is a 400",
      await codeOf(() => setFormSchema(ctxA, a.endpointPublicId, { document: { fields: [{ key: "x", type: "nope" }] } })),
      "invalid_request",
    );

    await deleteEndpoint(ctxA, a.endpointPublicId);
    t("publishing to an archived endpoint is a conflict", await codeOf(() => setFormSchema(ctxA, a.endpointPublicId, { document })), "conflict");
    await updateEndpoint(ctxA, a.endpointPublicId, { archived: false });
  }

  // Nothing above leaves a key behind outside the two test workspaces.
  const stray = await unsafeDb.select({ id: verdictApiKeys.id }).from(verdictApiKeys).where(eq(verdictApiKeys.label, "doomed"));
  ok("fixture keys live only in the test workspaces", stray.length === 1);

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
