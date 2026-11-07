/**
 * Agent onboarding, end to end against a real database (#128).
 *
 * Drives `handleAccountMcpRequest` exactly as a chat client would — JSON-RPC
 * over POST, no browser, no session — with the mail transport replaced by a
 * sink that keeps what would have been sent. The code is read out of that sink,
 * which is the test's stand-in for a person reading their inbox.
 *
 * Every "this must not work" assertion here has a positive control next to it:
 * the same request, one variable changed, shown to succeed. An absence proves
 * nothing until it has been shown it could have been a presence.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */
import { createHash } from "node:crypto";

import { eq, inArray, like } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { newId, newSubmissionPublicId } from "../src/db/ids.ts";
import { authSessions, destinations, emailCodes, endpoints, memberships, submissions, users, workspaces } from "../src/db/schema.ts";
import { handleAccountMcpRequest } from "../src/lib/account/mcp.ts";
import { MAX_ATTEMPTS } from "../src/lib/auth/email-code.ts";
import type { MailMessage, MailResult } from "../src/lib/destinations/mail.ts";
import { resetRateLimits } from "../src/lib/ingest/rate-limit.ts";
import { createVerdictApiKey } from "../src/lib/verdict/key-store.ts";
import { authenticateKey } from "../src/lib/verdict/auth.ts";
import { VerdictError } from "../src/lib/verdict/errors.ts";

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

const DOMAIN = "onboarding.test";
const SECRET_VALUE = "only-acme-may-read-this";
let otherKeyForOwnership = "";
const sent: MailMessage[] = [];
let mailWorks = true;

async function sink(message: MailMessage): Promise<MailResult> {
  sent.push(message);
  return mailWorks
    ? { ok: true, status: 200, body: "{}", error: null, configuration: false }
    : { ok: false, status: null, body: null, error: "not configured", configuration: true };
}

const options = { send: sink, renderDomain: "forms.test", appUrl: "https://app.test" };

let rpcId = 0;
async function rpc(method: string, params: Record<string, unknown> = {}, key?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  const response = await handleAccountMcpRequest(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
    options,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- assertions walk arbitrary JSON-RPC replies
  return (await response.json()) as { result?: any; error?: any };
}

async function call(name: string, args: Record<string, unknown> = {}, key?: string) {
  const reply = await rpc("tools/call", { name, arguments: args }, key);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same
  return reply.result as { isError: boolean; structuredContent: any; content: { text: string }[] };
}

function lastCodeFor(email: string): string {
  const message = [...sent].reverse().find((m) => m.to[0] === email);
  const code = message?.subject.match(/^(\d{6}) /)?.[1];
  if (!code) throw new Error(`no code was sent to ${email}`);
  return code;
}

function otherCode(code: string): string {
  return String((Number(code) + 1) % 1_000_000).padStart(6, "0");
}

async function cleanup() {
  const testUsers = await unsafeDb.select({ id: users.id }).from(users).where(like(users.email, `%@${DOMAIN}`));
  const ids = testUsers.map((u) => u.id);
  if (ids.length > 0) {
    const owned = await unsafeDb
      .select({ workspaceId: memberships.workspaceId })
      .from(memberships)
      .where(inArray(memberships.userId, ids));
    const wsIds = [...new Set(owned.map((m) => m.workspaceId))];
    if (wsIds.length > 0) await unsafeDb.delete(workspaces).where(inArray(workspaces.id, wsIds));
    await unsafeDb.delete(users).where(inArray(users.id, ids));
  }
  await unsafeDb.delete(emailCodes).where(like(emailCodes.email, `%@${DOMAIN}`));
}

async function main() {
  await cleanup();
  resetRateLimits();

  console.log("\ndiscovery");
  {
    const init = await rpc("initialize", { protocolVersion: "2025-06-18" });
    t("initialize names the server", init.result?.serverInfo?.name, "endpointforms-account");
    ok("and tells the agent never to invent the code", /never guess or invent it/.test(init.result?.instructions ?? ""));
    const list = await rpc("tools/list");
    t(
      "tools/list publishes the onboarding tools",
      list.result?.tools?.map((tool: { name: string }) => tool.name),
      [
        "start_signup",
        "verify_signup",
        "whoami",
        "list_endpoints",
        "create_endpoint",
        "get_install_snippet",
        "get_endpoint",
        "update_endpoint",
        "delete_endpoint",
        "get_form_schema",
        "update_form_schema",
        "list_submissions",
        "get_submission",
        "export_submissions",
        "create_api_key",
      ],
    );
  }

  const dana = `dana@${DOMAIN}`;
  let key = "";

  console.log("\nsign-up, start to finish");
  {
    const started = await call("start_signup", { email: dana });
    t("start_signup succeeds", started.isError, false);
    t("one email went out, to that address", sent.map((m) => m.to[0]), [dana]);
    const code = lastCodeFor(dana);
    ok("the reply does not contain the code", !JSON.stringify(started).includes(code));

    const [row] = await unsafeDb.select().from(emailCodes).where(eq(emailCodes.email, dana));
    ok("the stored row does not contain the code", !JSON.stringify(row).includes(code));
    ok(
      "nor a plain SHA-256 of it, which a dictionary would reverse",
      row.codeHash !== createHash("sha256").update(code).digest("hex"),
    );

    const wrong = await call("verify_signup", { email: dana, code: otherCode(code), company_name: "Acme Onboarding" });
    t("a wrong code is refused", wrong.structuredContent.code, "invalid_code");
    const before = await unsafeDb.select().from(users).where(eq(users.email, dana));
    t("and creates nothing", before.length, 0);

    const verified = await call("verify_signup", {
      email: dana,
      code: code.slice(0, 3) + " " + code.slice(3),
      company_name: "Acme Onboarding",
      client_name: "Test Client",
    });
    t("the right code, typed with a space, is accepted", verified.isError, false);
    t("the account is new", verified.structuredContent.account_created, true);
    t("the workspace is named after the company", verified.structuredContent.workspace.name, "Acme Onboarding");
    t("with a slug derived from it", verified.structuredContent.workspace.slug, "acme-onboarding");
    key = verified.structuredContent.api_key;
    ok("and a key comes back", /^efv2\.[A-Za-z0-9_-]{12}\.[A-Za-z0-9_-]{43}$/.test(key), key);

    const [user] = await unsafeDb.select().from(users).where(eq(users.email, dana));
    ok("the account is marked email-verified", user?.emailVerified instanceof Date);
    t("and has no password", user?.passwordHash ?? null, null);

    const again = await call("verify_signup", { email: dana, code });
    t("the same code does not work twice", again.structuredContent.code, "invalid_code");
  }

  console.log("\nthe key");
  {
    const me = await call("whoami", {}, key);
    t("whoami names the workspace", me.structuredContent.workspace?.slug, "acme-onboarding");
    t("with every scope", me.structuredContent.scopes, ["endpoints:read", "endpoints:write", "keys:write", "outcomes:write", "submissions:read", "submissions:write"]);

    t("no key is refused", (await call("whoami")).structuredContent.code, "unauthorized");
    t("a garbage key is refused", (await call("whoami", {}, "efv2.nope.nope")).structuredContent.code, "unauthorized");
    const tampered = key.slice(0, -1) + (key.endsWith("A") ? "B" : "A");
    t("a key with one character changed is refused", (await call("whoami", {}, tampered)).structuredContent.code, "unauthorized");

    const outcome = await authenticateKey(key);
    t("the same key records outcomes", outcome.slug, "acme-onboarding");
  }

  let endpointId = "";
  let submissionId = "";
  console.log("\nendpoints");
  {
    const created = await call("create_endpoint", { name: "Contact" }, key);
    t("create_endpoint succeeds", created.isError, false);
    endpointId = created.structuredContent.endpoint.id;
    t("it says where leads will be emailed", created.structuredContent.notifies, dana);
    ok(
      "and returns HTML pointing at the endpoint",
      created.structuredContent.snippet.html.includes(`action="https://acme-onboarding.forms.test/e/${endpointId}"`),
      created.structuredContent.snippet.html,
    );

    const [row] = await unsafeDb.select().from(endpoints).where(eq(endpoints.publicId, endpointId));
    ok("the endpoint exists", Boolean(row));
    const notifications = await unsafeDb.select().from(destinations).where(eq(destinations.endpointId, row.id));
    t("with the owner notification, to the verified address", notifications.map((d) => (d.config as { to: string[] }).to), [[dana]]);

    const list = await call("list_endpoints", {}, key);
    t("list_endpoints shows it", list.structuredContent.endpoints.map((e: { id: string }) => e.id), [endpointId]);

    submissionId = newSubmissionPublicId();
    await unsafeDb.insert(submissions).values({
      id: newId(),
      workspaceId: row.workspaceId,
      endpointId: row.id,
      publicId: submissionId,
      values: { email: "lead@example.com", message: SECRET_VALUE },
    });

    const snippet = await call("get_install_snippet", { endpoint_id: endpointId }, key);
    t("get_install_snippet finds it", snippet.isError, false);
    t("and gives the Manifest URL", snippet.structuredContent.endpoint.manifest_url, `https://acme-onboarding.forms.test/e/${endpointId}/mcp`);
  }

  console.log("\nsubmissions, forms and endpoint management");
  {
    const list = await call("list_submissions", {}, key);
    t("list_submissions shows the lead", list.structuredContent.submissions.map((s: { id: string }) => s.id), [submissionId]);
    t("with no next page", list.structuredContent.next_cursor, null);
    t("filters pass through", (await call("list_submissions", { verdict: ["won"] }, key)).structuredContent.submissions, []);
    t("a bad filter is invalid_arguments", (await call("list_submissions", { verdict: ["maybe"] }, key)).structuredContent.code, "invalid_arguments");
    const one = await call("get_submission", { submission_id: submissionId }, key);
    t("get_submission returns the values", one.structuredContent.submission.values.message, SECRET_VALUE);
    const csv = await call("export_submissions", { endpoint_id: endpointId }, key);
    ok("export_submissions returns the CSV", csv.content[0].text.includes(SECRET_VALUE) && csv.structuredContent.count === 1, csv.structuredContent);

    t("get_form_schema: none yet", (await call("get_form_schema", { endpoint_id: endpointId }, key)).structuredContent.schema, null);
    const published = await call(
      "update_form_schema",
      { endpoint_id: endpointId, document: { formatVersion: 1, fields: [{ key: "email", type: "email", required: true }] } },
      key,
    );
    t("update_form_schema publishes", [published.structuredContent.version, published.structuredContent.active], [1, true]);
    t("and it reads back", (await call("get_form_schema", { endpoint_id: endpointId }, key)).structuredContent.schema.version, 1);
    const strictDoc = { formatVersion: 1, fields: [{ key: "email", type: "email", required: true }, { key: "phone", type: "phone", required: true }] };
    const strictAsk = await call("update_form_schema", { endpoint_id: endpointId, document: strictDoc, mode: "strict" }, key);
    t("publishing in strict mode asks first", strictAsk.structuredContent.code, "confirmation_required");
    const live = (await call("get_form_schema", { endpoint_id: endpointId }, key)).structuredContent.schema;
    t("and leaves the live schema alone", [live.version, live.mode], [1, "warn"]);
    const strictDraft = await call("update_form_schema", { endpoint_id: endpointId, document: strictDoc, mode: "strict", activate: false }, key);
    t("a strict draft does not need asking", [strictDraft.isError, strictDraft.structuredContent.active], [false, false]);
    const strictYes = await call("update_form_schema", { endpoint_id: endpointId, document: strictDoc, mode: "strict", confirm: true }, key);
    t("confirmed, strict mode goes live", [strictYes.structuredContent.mode, strictYes.structuredContent.active], ["strict", true]);
    await call("update_form_schema", { endpoint_id: endpointId, document: { formatVersion: 1, fields: [{ key: "email", type: "email" }] } }, key);

    t("get_endpoint", (await call("get_endpoint", { endpoint_id: endpointId }, key)).structuredContent.endpoint.submission_count, 1);
    t("update_endpoint renames without confirming", (await call("update_endpoint", { endpoint_id: endpointId, name: "Contact us" }, key)).structuredContent.endpoint.name, "Contact us");
    await call("update_endpoint", { endpoint_id: endpointId, name: "Contact" }, key);

    const unconfirmed = await call("delete_endpoint", { endpoint_id: endpointId }, key);
    t("delete_endpoint without confirm asks first", unconfirmed.structuredContent.code, "confirmation_required");
    ok("and says what would happen", /refuses every new submission/.test(unconfirmed.content[0].text), unconfirmed.content[0].text);
    t("and changed nothing", (await call("get_endpoint", { endpoint_id: endpointId }, key)).structuredContent.endpoint.archived, false);
    t("confirm: \"yes\" is not confirm: true", (await call("delete_endpoint", { endpoint_id: endpointId, confirm: "yes" }, key)).structuredContent.code, "confirmation_required");
    const archiveUnconfirmed = await call("update_endpoint", { endpoint_id: endpointId, archived: true }, key);
    t("archiving through update_endpoint asks first too", archiveUnconfirmed.structuredContent.code, "confirmation_required");
    const writeOnly = (await call("create_api_key", { label: "Writer", scopes: ["endpoints:write"] }, key)).structuredContent.api_key;
    const writerAsk = await call("delete_endpoint", { endpoint_id: endpointId }, writeOnly);
    t("a write-only key gets the preview too", writerAsk.structuredContent.code, "confirmation_required");
    const readOnly = (await call("create_api_key", { label: "Reader2", scopes: ["endpoints:read"] }, key)).structuredContent.api_key;
    t("a read-only key gets no preview", (await call("delete_endpoint", { endpoint_id: endpointId }, readOnly)).structuredContent.code, "unauthorized");
    t("nor can it archive via update_endpoint", (await call("update_endpoint", { endpoint_id: endpointId, archived: true }, readOnly)).structuredContent.code, "unauthorized");
    const confirmed = await call("delete_endpoint", { endpoint_id: endpointId, confirm: true }, key);
    t("with confirm: true it archives", confirmed.structuredContent.endpoint.archived, true);
    const restored = await call("update_endpoint", { endpoint_id: endpointId, archived: false }, key);
    t("and update_endpoint restores it without confirming", restored.structuredContent.endpoint.archived, false);
  }

  console.log("\nscopes");
  {
    const crm = await call("create_api_key", { label: "HubSpot" }, key);
    t("create_api_key defaults to an outcome key", crm.structuredContent.scopes, ["outcomes:write"]);
    const crmKey = crm.structuredContent.api_key;
    t("which records outcomes", (await authenticateKey(crmKey)).slug, "acme-onboarding");
    t("but cannot create endpoints", (await call("create_endpoint", { name: "Nope" }, crmKey)).structuredContent.code, "unauthorized");
    t("or mint keys", (await call("create_api_key", { label: "ladder", scopes: ["keys:write"] }, crmKey)).structuredContent.code, "unauthorized");
    t("or read submissions", (await call("list_submissions", {}, crmKey)).structuredContent.code, "unauthorized");

    const reader = await call("create_api_key", { label: "Reader", scopes: ["endpoints:read"] }, key);
    const readerKey = reader.structuredContent.api_key;
    t("a read-only key can list", (await call("list_endpoints", {}, readerKey)).isError, false);
    let refused: unknown = null;
    try {
      await authenticateKey(readerKey);
    } catch (error) {
      refused = error instanceof VerdictError ? error.code : String(error);
    }
    t("and the outcome API refuses a key without outcomes:write", refused, "unauthorized");

    const legacyShaped = await createVerdictApiKey({ workspaceId: (await workspaceIdOf("acme-onboarding"))!, label: "settings key" });
    t("a key made the old way still records outcomes", (await authenticateKey(legacyShaped.key)).slug, "acme-onboarding");
    t("and is an outcome key, nothing more", legacyShaped.summary.scopes, ["outcomes:write"]);
    t("and cannot manage endpoints", (await call("list_endpoints", {}, legacyShaped.key)).structuredContent.code, "unauthorized");
  }

  console.log("\ntenant isolation");
  {
    resetRateLimits();
    const other = `other@${DOMAIN}`;
    await call("start_signup", { email: other });
    const otherKey = (await call("verify_signup", { email: other, code: lastCodeFor(other), company_name: "Other Onboarding" })).structuredContent.api_key;
    otherKeyForOwnership = otherKey;
    ok("a second company signs up", typeof otherKey === "string");

    t("their key cannot see the first company's endpoint", (await call("get_install_snippet", { endpoint_id: endpointId }, otherKey)).structuredContent.code, "not_found");
    t("positive control: the owner's key can", (await call("get_install_snippet", { endpoint_id: endpointId }, key)).isError, false);
    t("and their list is their own", (await call("list_endpoints", {}, otherKey)).structuredContent.endpoints, []);
    for (const [tool, args] of [
      ["get_endpoint", { endpoint_id: endpointId }],
      ["update_endpoint", { endpoint_id: endpointId, name: "hijacked" }],
      ["delete_endpoint", { endpoint_id: endpointId, confirm: true }],
      ["get_form_schema", { endpoint_id: endpointId }],
      ["update_form_schema", { endpoint_id: endpointId, document: { fields: [] } }],
      ["list_submissions", { endpoint_id: endpointId }],
      ["export_submissions", { endpoint_id: endpointId }],
      ["get_submission", { submission_id: submissionId }],
    ] as const) {
      t(`${tool} cannot reach the first company's data`, (await call(tool, args, otherKey)).structuredContent.code, "not_found");
    }
    const ownerView = await call("get_endpoint", { endpoint_id: endpointId }, key);
    t("positive control: and it is untouched for its owner", [ownerView.structuredContent.endpoint?.name, ownerView.structuredContent.endpoint?.archived], ["Contact", false]);
    t("positive control: the owner reads the submission", (await call("get_submission", { submission_id: submissionId }, key)).isError, false);
    ok("and the other company's list shows none of it", !JSON.stringify(await call("list_submissions", {}, otherKey)).includes(SECRET_VALUE));
  }

  console.log("\nreturning account");
  {
    resetRateLimits();
    await call("start_signup", { email: dana });
    const back = await call("verify_signup", { email: dana, code: lastCodeFor(dana), company_name: "Ignored Name" });
    t("signing in again is not a new account", back.structuredContent.account_created, false);
    t("and gets a key for the same workspace, not a new one", back.structuredContent.workspace, {
      slug: "acme-onboarding",
      name: "Acme Onboarding",
      created: false,
      url: "https://app.test/app/acme-onboarding",
    });

    const outsiderWs = newId();
    await unsafeDb.insert(workspaces).values({ id: outsiderWs, slug: "onboarding-member-only", name: "Member only" });
    const memberEmail = `member@${DOMAIN}`;
    const memberId = newId();
    await unsafeDb.insert(users).values({ id: memberId, email: memberEmail });
    await unsafeDb.insert(memberships).values({ id: newId(), workspaceId: outsiderWs, userId: memberId, role: "member" });
    await call("start_signup", { email: memberEmail });
    const member = await call("verify_signup", { email: memberEmail, code: lastCodeFor(memberEmail) });
    t("a member who owns nothing gets no key", member.structuredContent.code, "not_owner");
    const memberWorkspaces = await unsafeDb.select().from(memberships).where(eq(memberships.userId, memberId));
    t("and no second workspace is made for them", memberWorkspaces.length, 1);
  }

  console.log("\nenumeration");
  {
    resetRateLimits();
    const existing = await call("start_signup", { email: dana });
    const fresh = await call("start_signup", { email: `nobody@${DOMAIN}` });
    const shape = (r: typeof existing) => ({ ...r.structuredContent, email: "*" });
    t("an existing account and an unknown address get the same answer", shape(existing), shape(fresh));
    t("and both are sent a code", sent.slice(-2).map((m) => m.to[0]), [dana, `nobody@${DOMAIN}`]);
  }

  console.log("\nguessing");
  {
    resetRateLimits();
    const target = `guess@${DOMAIN}`;
    await call("start_signup", { email: target });
    const code = lastCodeFor(target);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await call("verify_signup", { email: target, code: otherCode(code) });
    }
    t(`after ${MAX_ATTEMPTS} wrong guesses the right code no longer works`, (await call("verify_signup", { email: target, code })).structuredContent.code, "invalid_code");

    // Positive control: one fewer wrong guess, and the right code still works.
    // Without this, the line above passes just as well if verification is broken.
    resetRateLimits();
    await call("start_signup", { email: target });
    const fresh = lastCodeFor(target);
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      await call("verify_signup", { email: target, code: otherCode(fresh) });
    }
    t(`after ${MAX_ATTEMPTS - 1} wrong guesses it still does`, (await call("verify_signup", { email: target, code: fresh })).isError, false);

    resetRateLimits();
    const twice = `twice@${DOMAIN}`;
    await call("start_signup", { email: twice });
    const first = lastCodeFor(twice);
    await call("start_signup", { email: twice });
    const second = lastCodeFor(twice);
    if (first !== second) {
      t("asking again retires the older code", (await call("verify_signup", { email: twice, code: first })).structuredContent.code, "invalid_code");
    }
    t("the newest one works", (await call("verify_signup", { email: twice, code: second })).isError, false);

    // A burst of simultaneous guesses must not get more than MAX_ATTEMPTS looks
    // at the code. Counting after comparing let every request in a burst read
    // the row before any of them burned it.
    resetRateLimits();
    const burst = `burst@${DOMAIN}`;
    await call("start_signup", { email: burst });
    const burstCode = lastCodeFor(burst);
    await Promise.all(Array.from({ length: 20 }, () => call("verify_signup", { email: burst, code: otherCode(burstCode) })));
    const [burned] = await unsafeDb.select().from(emailCodes).where(eq(emailCodes.email, burst));
    t(`20 simultaneous guesses are counted as ${MAX_ATTEMPTS}, not 20`, burned.attempts, MAX_ATTEMPTS);
    ok("and the code is burned", burned.consumedAt instanceof Date);
    t("so the right code no longer works", (await call("verify_signup", { email: burst, code: burstCode })).structuredContent.code, "invalid_code");
  }

  console.log("\nan address someone else registered first");
  {
    resetRateLimits();
    // A squatter signs up with a password on an address they do not own —
    // password sign-up checks nothing — and keeps a session open.
    const victim = `victim@${DOMAIN}`;
    const squatterId = newId();
    await unsafeDb.insert(users).values({ id: squatterId, email: victim, passwordHash: "squatter-password-hash" });
    await unsafeDb.insert(authSessions).values({ sessionToken: `squat-${squatterId}`, userId: squatterId, expires: new Date(Date.now() + 86_400_000) });

    await call("start_signup", { email: victim });
    const claimed = await call("verify_signup", { email: victim, code: lastCodeFor(victim), company_name: "Victim Onboarding" });
    t("the real owner can still sign up", claimed.isError, false);
    const [row] = await unsafeDb.select().from(users).where(eq(users.id, squatterId));
    t("the squatter's password is gone", row.passwordHash, null);
    t("and so is their session", (await unsafeDb.select().from(authSessions).where(eq(authSessions.userId, squatterId))).length, 0);

    // Positive control: an address that was already verified keeps its password
    // and sessions. Without this, both lines above pass just as well if every
    // code sign-in wiped every password.
    const owner = `owner@${DOMAIN}`;
    const ownerId = newId();
    await unsafeDb.insert(users).values({ id: ownerId, email: owner, passwordHash: "owner-password-hash", emailVerified: new Date() });
    await unsafeDb.insert(authSessions).values({ sessionToken: `own-${ownerId}`, userId: ownerId, expires: new Date(Date.now() + 86_400_000) });
    await call("start_signup", { email: owner });
    await call("verify_signup", { email: owner, code: lastCodeFor(owner), company_name: "Owner Onboarding" });
    const [kept] = await unsafeDb.select().from(users).where(eq(users.id, ownerId));
    t("a verified account keeps its password", kept.passwordHash, "owner-password-hash");
    t("and its sessions", (await unsafeDb.select().from(authSessions).where(eq(authSessions.userId, ownerId))).length, 1);
  }

  console.log("\nlimits and failures");
  {
    resetRateLimits();
    const spammed = `spammed@${DOMAIN}`;
    const answers = [];
    for (let i = 0; i < 4; i++) {
      // Clearing the in-memory limiter before every request proves the
      // per-address limit is the database's, which survives restarts, other
      // instances, and the in-memory map clearing itself when full.
      resetRateLimits();
      answers.push((await call("start_signup", { email: spammed })).structuredContent.code ?? "sent");
    }
    t("three codes an hour per address, then a refusal", answers, ["sent", "sent", "sent", "rate_limited"]);

    resetRateLimits();
    mailWorks = false;
    const unlucky = `nomail@${DOMAIN}`;
    const failed = await call("start_signup", { email: unlucky });
    mailWorks = true;
    t("when mail cannot be sent, it says so", failed.structuredContent.code, "email_unavailable");
    const leftover = lastCodeFor(unlucky);
    t("and the code that never arrived does not work", (await call("verify_signup", { email: unlucky, code: leftover })).structuredContent.code, "invalid_code");
    const created = await unsafeDb.select().from(users).where(eq(users.email, unlucky));
    t("and nothing was created", created.length, 0);
  }

  console.log("\nkeys follow ownership");
  {
    const [otherUser] = await unsafeDb.select({ id: users.id }).from(users).where(eq(users.email, `other@${DOMAIN}`));
    const otherKey = otherKeyForOwnership;
    t("positive control: an owner's key works", (await call("whoami", {}, otherKey)).isError, false);
    await unsafeDb.update(memberships).set({ role: "member" }).where(eq(memberships.userId, otherUser.id));
    const demoted = await call("whoami", {}, otherKey);
    t("once its creator is no longer an owner, the key stops managing the workspace", demoted.structuredContent.code, "unauthorized");
    ok("and says why", /not an owner of it any more/.test(demoted.content[0].text), demoted.content[0].text);
    await unsafeDb.update(memberships).set({ role: "owner" }).where(eq(memberships.userId, otherUser.id));
    t("and works again if they are made owner again", (await call("whoami", {}, otherKey)).isError, false);
  }

  console.log("\nprotocol");
  {
    t("an unknown tool is a tool error", (await call("delete_everything")).structuredContent.code, "unknown_tool");
    t("bad arguments are a tool error", (await call("create_endpoint", { name: "" }, key)).structuredContent.code, "invalid_arguments");
    const unknownMethod = await rpc("resources/list");
    t("an unknown method is a JSON-RPC error", unknownMethod.error?.code, -32601);
  }

  await cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

async function workspaceIdOf(slug: string): Promise<string | null> {
  const [row] = await unsafeDb.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, slug));
  return row?.id ?? null;
}


main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
