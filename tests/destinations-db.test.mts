/**
 * Destinations, against a real database (#41, #42).
 *
 * The pure half is in `tests/destinations.test.mts`. This half is for the
 * claims that are only true if the rows are right, and the load-bearing one is
 * the first section: **a destination that fails, throws, or hangs must not cost
 * anyone a lead.** That is asserted through the real ingest handler rather than
 * by calling the dispatcher directly, because the thing being tested is the
 * relationship between the two.
 *
 * Also here: that retries append rows instead of overwriting them, that the
 * health numbers count failures *since the last success* rather than for all
 * time, and that a soft-deleted destination keeps its history.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */

process.env.SUBMISSION_IP_SALT = "test-salt";
process.env.INGEST_RATE_LIMIT_ENDPOINT_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_IP_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE = "1000000";
// The delivery guard blocks loopback, and the fixture below delivers to a
// loopback server on purpose. Nothing outside the tests sets this.
process.env.ALLOW_PRIVATE_DESTINATIONS = "1";
process.env.ALLOW_INSECURE_DESTINATIONS = "1";

import { createServer, type Server } from "node:http";
import { eq } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { describeDatabase } from "../src/db/env.ts";
import { newEndpointPublicId, newId } from "../src/db/ids.ts";
import {
  deliveryAttempts,
  destinations,
  endpoints,
  submissions,
  users,
  workspaces,
} from "../src/db/schema.ts";
import { handleSubmission } from "../src/lib/ingest/handler.ts";
import {
  createDestination,
  deleteDestination,
  deliverSubmission,
  drainDispatch,
  getDestination,
  handleSweep,
  listDeliveryAttempts,
  listDestinations,
  newDestinationSecret,
  reapStaleAttempts,
  runSweep,
  sendTestDelivery,
  sweepDueRetries,
  updateDestination,
  verifySignature,
  HEADER_ATTEMPT,
  HEADER_DELIVERY_ID,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  STALE_ATTEMPT_MS,
} from "../src/lib/destinations/index.ts";
// Not part of the public surface in `index.ts` — the abandonment test has to
// call the claim on its own, without the delivery that normally follows it,
// because that gap *is* the thing under test.
import { claimDueRetries, workspacesWithDeliveryWork } from "../src/lib/destinations/store.ts";
// #64 and #65: the notification an endpoint is created with, and the inbox
// marker for a submission nothing was ever attempted for.
import { createEndpoint } from "../src/lib/workspaces/endpoints.ts";
import {
  listSubmissions,
  parseSubmissionFilters,
} from "../src/lib/workspaces/submissions.ts";

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

// ---------------------------------------------------------------------------
// A receiver we control
// ---------------------------------------------------------------------------

type Received = {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

type Receiver = {
  server: Server;
  url: string;
  received: Received[];
  /** Set to change what the next requests answer with. */
  reply: {
    status: number;
    body: string;
    delayMs?: number;
    /**
     * Awaited before the response is written, so a test can change the world
     * *during* a delivery. The only way to reach a code path that depends on
     * something moving between two steps of one function call.
     */
    beforeRespond?: (() => Promise<void>) | null;
  };
};

async function startReceiver(): Promise<Receiver> {
  const received: Received[] = [];
  const reply: Receiver["reply"] = {
    status: 200,
    body: '{"ok":true}',
    delayMs: 0,
    beforeRespond: null,
  };

  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      received.push({ path: request.url ?? "", headers: request.headers, body });
      const send = () => {
        response.writeHead(reply.status, { "content-type": "application/json" });
        response.end(reply.body);
      };
      const respond = async () => {
        if (reply.beforeRespond) await reply.beforeRespond();
        if (reply.delayMs) setTimeout(send, reply.delayMs);
        else send();
      };
      void respond();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return { server, url: `http://127.0.0.1:${port}`, received, reply };
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const SLUG = "destinations-test-workspace";
const EMAIL = "destinations@test.invalid";
const BASE = "https://acme.endpointforms.test";
const SECRET = newDestinationSecret();

async function cleanup() {
  await unsafeDb.delete(workspaces).where(eq(workspaces.slug, SLUG));
  await unsafeDb.delete(users).where(eq(users.email, EMAIL));
}

type Fixture = { workspaceId: string; endpointId: string; endpointPublicId: string };

async function createFixture(): Promise<Fixture> {
  const workspaceId = newId();
  const endpointId = newId();
  const endpointPublicId = newEndpointPublicId();

  await unsafeDb.insert(workspaces).values({ id: workspaceId, slug: SLUG, name: SLUG });
  await unsafeDb.insert(users).values({ id: newId(), email: EMAIL });
  await unsafeDb
    .insert(endpoints)
    .values({ id: endpointId, workspaceId, publicId: endpointPublicId, name: "Contact form" });

  return { workspaceId, endpointId, endpointPublicId };
}

/**
 * Posts a form to the real ingest handler and returns its response.
 *
 * Note what this does NOT do: wait for delivery. `handleSubmission` dispatches
 * fire-and-forget, so the response comes back before anything has been sent —
 * which is the property being tested, and also why every caller below has to
 * `await drainDispatch()` before asserting on rows.
 */
async function submit(endpointPublicId: string, values: Record<string, string>) {
  return handleSubmission(
    new Request(`${BASE}/e/${endpointPublicId}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams(values).toString(),
    }),
    endpointPublicId,
  );
}

async function attemptsFor(destinationId: string) {
  return unsafeDb
    .select()
    .from(deliveryAttempts)
    .where(eq(deliveryAttempts.destinationId, destinationId));
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`\ndestinations against ${describeDatabase()}`);

  await cleanup();
  const fixture = await createFixture();
  const receiver = await startReceiver();

  try {
    await theSubmissionSurvivesAnything(fixture, receiver);
    await deliveryWritesRows(fixture, receiver);
    await retriesAppend(fixture, receiver);
    await health(fixture, receiver);
    await crud(fixture);
    await testDelivery(fixture, receiver);
    await pendingRowsAndTheSweep(fixture, receiver);
    await abandonedClaims(fixture, receiver);
    await concurrentClaimsTakeItOnce(fixture, receiver);
    await claimsWhoseDestinationGoesAway(fixture, receiver);
    await supersededClaims(fixture, receiver);
    await notifiedByDefault(fixture);
    await wentNowhere(fixture, receiver);
  } finally {
    await new Promise<void>((resolve) => receiver.server.close(() => resolve()));
  }
}

// ---------------------------------------------------------------------------
// Notified by default (#64)
// ---------------------------------------------------------------------------

/**
 * Creating an endpoint creates the notification, in the same transaction.
 *
 * Asserted through `createEndpoint` and read back through `listDestinations` —
 * the function the screen calls — rather than by selecting the row directly,
 * because what is being claimed is that the notification is an **ordinary
 * destination**: it appears in the list, it has health, and everything built for
 * #41 and #42 applies to it without a second code path.
 */
async function notifiedByDefault(fixture: Fixture) {
  console.log("\nnotified by default");

  const created = await createEndpoint(fixture.workspaceId, "Notified form", {
    notifyEmail: EMAIL,
  });
  t("the address it will notify comes back", created.notified, EMAIL);

  const rows = await listDestinations(fixture.workspaceId, created.publicId);
  t("one destination exists on a brand-new endpoint", rows.length, 1);
  t("it is an email destination", rows[0]?.kind, "email");
  t("switched on", rows[0]?.enabled, true);
  t("and flagged as the one we made", rows[0]?.defaultNotification, true);
  ok(
    "named for the address, which is what the delivery log will show",
    (rows[0]?.name ?? "").includes(EMAIL),
    rows[0]?.name,
  );
  ok(
    "and the address survives the redaction the screen reads through",
    JSON.stringify(rows[0]?.config.summary ?? []).includes(EMAIL),
    rows[0]?.config.summary,
  );
  t(
    "it starts untested, because nothing has been delivered to it",
    rows[0]?.health.state,
    "untested",
  );

  // Switching it off has to be possible, and has to be the customer's act.
  await updateDestination(fixture.workspaceId, rows[0]!.id, { enabled: false });
  const afterPause = await listDestinations(fixture.workspaceId, created.publicId);
  t("it can be switched off", afterPause[0]?.enabled, false);
  t("and pausing it does not hide where it came from", afterPause[0]?.defaultNotification, true);

  // End to end, without a mail provider and without a network call.
  //
  // `deliverEmail` refuses before it opens a socket when there is no key, so
  // this exercises the whole chain — createEndpoint, dispatch, the delivery log
  // — and proves the notification is wired to the *real* ingest path rather
  // than merely existing as a row. The refusal is the point: an unset key must
  // produce a written-down configuration failure, never a silent success.
  const previousKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  await updateDestination(fixture.workspaceId, rows[0]!.id, { enabled: true });
  await submit(created.publicId, { email: "first@dorsetmetal.example" });
  await drainDispatch();

  const attempts = await listDeliveryAttempts(fixture.workspaceId, rows[0]!.id);
  t("the first submission produced an attempt against it", attempts.length, 1);
  t("which failed rather than reporting success", attempts[0]?.status, "failed");
  ok(
    "and says the deployment cannot send, not that something broke",
    /not switched on for this deployment/.test(attempts[0]?.error ?? ""),
    attempts[0]?.error,
  );
  if (previousKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = previousKey;

  // The falsifying case: without an address there is no row, which is what makes
  // the assertion above mean "created because we asked for it" rather than
  // "created by something else on the way past".
  const without = await createEndpoint(fixture.workspaceId, "Unnotified form");
  t("no address means no notification", without.notified, null);
  t(
    "and the endpoint really is created with nothing on it",
    (await listDestinations(fixture.workspaceId, without.publicId)).length,
    0,
  );
}

// ---------------------------------------------------------------------------
// A submission that went nowhere (#65)
// ---------------------------------------------------------------------------

/**
 * The inbox marker, both ways round.
 *
 * An assertion that a flag is true proves nothing on its own — an empty result
 * and a broken fixture look identical — so this drives the same query to
 * `false` twice for two different reasons: once because the submission is too
 * young to judge, and once because an attempt row exists. Only then does the
 * `true` in the middle mean what it says.
 */
async function wentNowhere(fixture: Fixture, receiver: Receiver) {
  console.log("\nsubmissions that went nowhere");

  const deaf = await createEndpoint(fixture.workspaceId, "Deaf form");
  const filters = parseSubmissionFilters({ endpoint: deaf.publicId });

  await submit(deaf.publicId, { email: "lead@dorsetmetal.example" });
  await drainDispatch();

  const fresh = await listSubmissions(fixture.workspaceId, filters);
  t("the submission was stored regardless", fresh.total, 1);
  t(
    "and is not called lost while it could still be in flight",
    fresh.rows[0]?.deliveredNowhere,
    false,
  );

  const publicId = fresh.rows[0]!.publicId;
  // Older than the grace window. Nothing else about the row changes.
  await unsafeDb
    .update(submissions)
    .set({ submittedAt: new Date(Date.now() - 10 * 60_000) })
    .where(eq(submissions.publicId, publicId));

  const aged = await listSubmissions(fixture.workspaceId, filters);
  t(
    "past the window with no attempt on it, the inbox says it went nowhere",
    aged.rows[0]?.deliveredNowhere,
    true,
  );

  // Now give it somewhere to go and send it. The row is still backdated, so the
  // only thing that changed is that an attempt exists.
  const destination = await createDestination(fixture.workspaceId, deaf.publicId, {
    kind: "webhook",
    name: "Late arrival",
    config: { url: `${receiver.url}/late`, secret: SECRET },
  });
  ok("a destination was added after the fact", destination !== null);
  receiver.reply.status = 200;
  receiver.reply.body = "ok";
  await deliverSubmission(fixture.workspaceId, publicId, { force: true });
  await drainDispatch();

  const delivered = await listSubmissions(fixture.workspaceId, filters);
  t(
    "and once something was attempted, it no longer says so",
    delivered.rows[0]?.deliveredNowhere,
    false,
  );
}

// ---------------------------------------------------------------------------
// The one that matters
// ---------------------------------------------------------------------------

/**
 * A destination failure is never a submission failure.
 *
 * Three ways a destination can be broken, and all three must produce a 200 with
 * a stored lead. This is asserted through `handleSubmission` — the real entry
 * point — rather than by calling the dispatcher, because what is being checked
 * is that the ingest path does not await, does not catch too late, and does not
 * let an exception escape into the response.
 */
async function theSubmissionSurvivesAnything(fixture: Fixture, receiver: Receiver) {
  console.log("\na broken destination cannot cost a lead");

  const broken: {
    name: string;
    kind?: "webhook" | "hubspot";
    config: Record<string, unknown>;
  }[] = [
    // Answers 500 to everything.
    { name: "always 500", config: { url: `${receiver.url}/boom`, secret: SECRET } },
    // Nothing is listening on this port at all.
    { name: "nothing listening", config: { url: "http://127.0.0.1:1/hook", secret: SECRET } },
    // Config so broken the adapter refuses before it opens a socket.
    { name: "no secret at all", config: { url: `${receiver.url}/x` } },
    // A kind this build has no adapter for. Unreachable through the UI, but a
    // row could arrive from a seed or an older release, and it must produce a
    // visibly broken destination rather than a quiet one.
    { name: "unbuilt kind", kind: "hubspot", config: {} },
  ];

  // Deliberately NOT including `http://169.254.169.254/` here. The guard that
  // blocks it is switched off in this file so the fixture can deliver to a
  // loopback receiver, so the case would not test the guard — it would really
  // dial the cloud metadata service and block for the full 10s timeout, and
  // that hang once outlived the fixture teardown and produced a foreign-key
  // error on a workspace that had already been dropped. The guard is tested
  // properly in `tests/destinations.test.mts`, with the guard on.
  const created: string[] = [];
  for (const entry of broken) {
    const row = await createDestination(fixture.workspaceId, fixture.endpointPublicId, {
      kind: entry.kind ?? "webhook",
      name: entry.name,
      config: entry.config,
    });
    if (row) created.push(row.id);
  }
  t("four broken destinations created", created.length, 4);

  receiver.reply.status = 500;
  receiver.reply.body = "kaboom";

  const response = await submit(fixture.endpointPublicId, {
    name: "Priya Raman",
    email: "priya@dorsetmetal.example",
  });
  const ack = (await response.json()) as { ok: boolean; id: string };

  t("the submitter still gets a 200", response.status, 200);
  ok("and an acknowledgement with an id", ack.ok === true && typeof ack.id === "string", ack);

  const [stored] = await unsafeDb
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(eq(submissions.publicId, ack.id));
  ok("and the lead is in the database", stored !== undefined);

  // The ingest path dispatched on its own — nothing in this test called the
  // dispatcher. Waiting for it here is what turns "it returned before
  // delivering" into an observable fact rather than a race.
  await drainDispatch();

  for (const destinationId of created) {
    const rows = await attemptsFor(destinationId);
    t(
      `the ingest path delivered here without being asked (${destinationId.slice(0, 8)})`,
      rows.length,
      1,
    );
    t("and it failed", rows[0]?.status, "failed");
    ok(
      "and the row says something a person could act on",
      (rows[0]?.error ?? "").length > 30,
      rows[0]?.error,
    );
  }

  // Clean up so the later sections start from a known state.
  for (const destinationId of created) {
    await unsafeDb.delete(deliveryAttempts).where(eq(deliveryAttempts.destinationId, destinationId));
    await unsafeDb.delete(destinations).where(eq(destinations.id, destinationId));
  }
  await unsafeDb.delete(submissions).where(eq(submissions.id, stored.id));

  receiver.reply.status = 200;
  receiver.reply.body = '{"ok":true}';
}

// ---------------------------------------------------------------------------

async function deliveryWritesRows(fixture: Fixture, receiver: Receiver) {
  console.log("\na successful delivery");

  const created = await createDestination(fixture.workspaceId, fixture.endpointPublicId, {
    kind: "webhook",
    name: "CRM intake",
    config: { url: `${receiver.url}/hooks/leads`, secret: SECRET },
  });
  ok("destination created", created !== null);
  if (!created) return;

  receiver.received.length = 0;

  const response = await submit(fixture.endpointPublicId, {
    name: "Meera Shah",
    email: "meera@axelrodparts.example",
    utm_source: "google",
    utm_campaign: "brand-exact",
  });
  const ack = (await response.json()) as { id: string };
  await drainDispatch();

  t("the receiver got exactly one request", receiver.received.length, 1);
  const request = receiver.received[0];
  t("at the configured path", request.path, "/hooks/leads");

  const body = JSON.parse(request.body) as {
    submission: { values: Record<string, string>; origin: string; verdict: string; attribution: Record<string, unknown> };
    endpoint: { id: string; name: string };
  };
  t("carrying the submitted values", body.submission.values.email, "meera@axelrodparts.example");
  t("and the origin stamp", body.submission.origin, "unverified");
  t("and the verdict", body.submission.verdict, "awaiting");
  t("and the attribution lifted off the payload", body.submission.attribution.utmSource, "google");
  t("and the endpoint's name", body.endpoint.name, "Contact form");
  ok(
    "and the utm fields are not left in the customer's values",
    body.submission.values.utm_source === undefined,
    body.submission.values,
  );

  // End to end: the signature a real receiver would check, over the real bytes.
  ok(
    "the signature verifies at the receiver",
    verifySignature({
      secret: SECRET,
      rawBody: request.body,
      signature: String(request.headers[HEADER_SIGNATURE]),
      timestamp: String(request.headers[HEADER_TIMESTAMP]),
    }),
  );
  ok("and a delivery id is present", typeof request.headers[HEADER_DELIVERY_ID] === "string");
  t("on attempt 1", String(request.headers[HEADER_ATTEMPT]), "1");

  const log = await listDeliveryAttempts(fixture.workspaceId, created.id);
  t("one attempt in the log", log.length, 1);
  t("marked succeeded", log[0].status, "succeeded");
  t("with the response status", log[0].responseStatus, 200);
  t("and the response body", log[0].responseBody, '{"ok":true}');
  ok("and the request body it sent", (log[0].requestBody ?? "").includes("meera@"), log[0].requestBody);
  ok("and the submission it belongs to", log[0].submissionPublicId === ack.id);

  // Redelivering the same submission is attempt 2 with the SAME delivery id —
  // which is the only thing that lets a receiver dedupe.
  receiver.received.length = 0;
  await deliverSubmission(fixture.workspaceId, ack.id, { timeoutMs: 3_000 });
  t("a redelivery is attempt 2", String(receiver.received[0].headers[HEADER_ATTEMPT]), "2");
  t(
    "but carries the same delivery id, so a receiver can dedupe",
    String(receiver.received[0].headers[HEADER_DELIVERY_ID]),
    String(request.headers[HEADER_DELIVERY_ID]),
  );
  t("and appends rather than overwriting", (await listDeliveryAttempts(fixture.workspaceId, created.id)).length, 2);

  await unsafeDb.delete(deliveryAttempts).where(eq(deliveryAttempts.destinationId, created.id));
  await unsafeDb.delete(destinations).where(eq(destinations.id, created.id));
}

// ---------------------------------------------------------------------------

async function retriesAppend(fixture: Fixture, receiver: Receiver) {
  console.log("\nretries");

  const created = await createDestination(fixture.workspaceId, fixture.endpointPublicId, {
    kind: "webhook",
    name: "Flaky CRM",
    config: { url: `${receiver.url}/flaky`, secret: SECRET },
  });
  if (!created) return;

  receiver.reply.status = 503;
  receiver.reply.body = "upstream unavailable";

  await submit(fixture.endpointPublicId, { email: "flaky@test.example" });
  await drainDispatch();

  let log = await listDeliveryAttempts(fixture.workspaceId, created.id);
  t("the first attempt failed", log[0].status, "failed");
  t("with the target's status", log[0].responseStatus, 503);
  ok("a retry is scheduled", log[0].nextRetryAt !== null);
  ok("and the log says when", /Retrying in/.test(log[0].error ?? ""), log[0].error);
  ok("and keeps the target's own response", log[0].responseBody === "upstream unavailable");

  // Nothing is due yet, so a sweep now must not fire anything — otherwise the
  // backoff is decorative.
  const early = await sweepDueRetries(fixture.workspaceId, {
    endpointId: fixture.endpointId,
    timeoutMs: 3_000,
  });
  t("a sweep before the backoff elapses does nothing", early.delivered + early.failed, 0);
  t("and adds no rows", (await listDeliveryAttempts(fixture.workspaceId, created.id)).length, 1);

  // Now let it succeed, and sweep with a clock far enough forward that the
  // retry is due. `now` is injected rather than slept for — an hour is a long
  // time to wait for a test.
  receiver.reply.status = 200;
  receiver.reply.body = '{"ok":true}';

  const swept = await sweepDueRetries(fixture.workspaceId, {
    endpointId: fixture.endpointId,
    now: new Date(Date.now() + 2 * 3_600_000),
    timeoutMs: 3_000,
  });
  t("a sweep after the backoff delivers it", swept.delivered, 1);

  log = await listDeliveryAttempts(fixture.workspaceId, created.id);
  t("two rows now, not one overwritten", log.length, 2);
  const succeeded = log.filter((row) => row.status === "succeeded");
  const failed = log.filter((row) => row.status === "failed");
  t("one succeeded", succeeded.length, 1);
  t("and the failed one is still there, with its evidence", failed.length, 1);
  t("the retry is attempt 2", succeeded[0].attempt, 2);
  ok("and the failed row's schedule was cleared when it was claimed", failed[0].nextRetryAt === null);

  // A second sweep must not re-deliver something already claimed and done.
  const again = await sweepDueRetries(fixture.workspaceId, {
    endpointId: fixture.endpointId,
    now: new Date(Date.now() + 4 * 3_600_000),
    timeoutMs: 3_000,
  });
  t("sweeping again does not re-send a settled delivery", again.delivered, 0);

  // A failure that will never fix itself schedules nothing at all.
  receiver.reply.status = 401;
  receiver.reply.body = '{"error":"token expired"}';
  await submit(fixture.endpointPublicId, { email: "auth@test.example" });
  await drainDispatch();

  const authLog = (await listDeliveryAttempts(fixture.workspaceId, created.id)).filter(
    (row) => row.responseStatus === 401,
  );
  t("a 401 is recorded", authLog.length, 1);
  ok("and schedules no retry", authLog[0].nextRetryAt === null);
  ok(
    "and says the credentials are the problem",
    /credentials/i.test(authLog[0].error ?? ""),
    authLog[0].error,
  );

  receiver.reply.status = 200;
  receiver.reply.body = '{"ok":true}';

  await unsafeDb.delete(deliveryAttempts).where(eq(deliveryAttempts.destinationId, created.id));
  await unsafeDb.delete(destinations).where(eq(destinations.id, created.id));
}

// ---------------------------------------------------------------------------

async function health(fixture: Fixture, receiver: Receiver) {
  console.log("\nhealth (#42)");

  const created = await createDestination(fixture.workspaceId, fixture.endpointPublicId, {
    kind: "webhook",
    name: "Health check",
    config: { url: `${receiver.url}/health`, secret: SECRET },
  });
  if (!created) return;

  const fresh = await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id);
  t("a destination with no history is untested, not healthy", fresh?.health.state, "untested");
  t("and not failing", fresh?.health.consecutiveFailures, 0);

  receiver.reply.status = 500;
  receiver.reply.body = "down";

  const response = await submit(fixture.endpointPublicId, { email: "health@test.example" });
  const ack = (await response.json()) as { id: string };
  await drainDispatch();

  let row = await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id);
  t("one failure is degraded, not failing", row?.health.state, "degraded");
  t("and counted", row?.health.consecutiveFailures, 1);
  ok("with a last-failure time", row?.health.lastFailureAt !== null);
  ok("and no last-success time", row?.health.lastSuccessAt === null);

  // Three in a row is the point at which it is said in red — the step exists so
  // one 502 during a deploy does not train people to ignore the banner.
  await deliverSubmission(fixture.workspaceId, ack.id, { timeoutMs: 3_000 });
  await deliverSubmission(fixture.workspaceId, ack.id, { timeoutMs: 3_000 });
  row = await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id);
  t("three in a row is failing", row?.health.state, "failing");
  t("and the count is three", row?.health.consecutiveFailures, 3);

  receiver.reply.status = 200;
  receiver.reply.body = '{"ok":true}';
  await deliverSubmission(fixture.workspaceId, ack.id, { timeoutMs: 3_000 });

  row = await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id);
  t("one success clears it", row?.health.state, "healthy");
  // The whole reason the count is "since the last success": the three failures
  // are still in the log, and they no longer mean anything.
  t("the earlier failures stop counting", row?.health.consecutiveFailures, 0);
  ok("but they are still in the log", (await listDeliveryAttempts(fixture.workspaceId, created.id)).length === 4);
  ok("and there is a last-success time", row?.health.lastSuccessAt !== null);

  await updateDestination(fixture.workspaceId, created.id, { enabled: false });
  row = await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id);
  t("a disabled destination reads as paused, not broken", row?.health.state, "paused");

  await updateDestination(fixture.workspaceId, created.id, { enabled: true });

  // The dead-letter count is about leads that never arrived, not attempts that
  // failed. This destination has four attempts on one submission, three of them
  // failures — and the last one worked. Nothing is stuck.
  row = await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id);
  t("a failure a later retry recovered is not dead-lettered", row?.health.deadLetterCount, 0);

  // Now one that really is stuck: a 401, which schedules no retry and never
  // succeeds. One submission, one stuck delivery — however many attempts.
  receiver.reply.status = 401;
  receiver.reply.body = '{"error":"token expired"}';
  const stuckResponse = await submit(fixture.endpointPublicId, { email: "stuck@test.example" });
  const stuckAck = (await stuckResponse.json()) as { id: string };
  await drainDispatch();
  await deliverSubmission(fixture.workspaceId, stuckAck.id, { timeoutMs: 3_000 });

  row = await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id);
  t("a delivery that gave up is dead-lettered", row?.health.deadLetterCount, 1);
  t("counted once per lead, not once per attempt", row?.health.deadLetterCount, 1);

  receiver.reply.status = 200;
  receiver.reply.body = '{"ok":true}';
  await deliverSubmission(fixture.workspaceId, stuckAck.id, { timeoutMs: 3_000 });
  row = await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id);
  t("and stops being dead-lettered once it is sent again", row?.health.deadLetterCount, 0);

  // A paused destination gets nothing. Pausing has to actually stop delivery,
  // or the button is a lie.
  await updateDestination(fixture.workspaceId, created.id, { enabled: false });
  receiver.received.length = 0;
  const skipped = await deliverSubmission(fixture.workspaceId, ack.id, { timeoutMs: 3_000 });
  t("a paused destination receives nothing", skipped.delivered + skipped.failed, 0);
  t("and no request was made", receiver.received.length, 0);

  await unsafeDb.delete(deliveryAttempts).where(eq(deliveryAttempts.destinationId, created.id));
  await unsafeDb.delete(destinations).where(eq(destinations.id, created.id));
}

// ---------------------------------------------------------------------------

async function crud(fixture: Fixture) {
  console.log("\nmanaging destinations");

  const created = await createDestination(fixture.workspaceId, fixture.endpointPublicId, {
    kind: "webhook",
    name: "CRUD test",
    config: { url: "https://crm.example.com/hook", secret: SECRET },
  });
  if (!created) return;

  const listed = await listDestinations(fixture.workspaceId, fixture.endpointPublicId);
  t("it appears in the list", listed.length, 1);

  // The read path a page uses must never carry a secret. This is the assertion
  // that would catch someone adding a raw `config` field to the list item.
  const serialised = JSON.stringify(listed);
  ok("and the listed shape contains no secret", !serialised.includes(SECRET), serialised.slice(0, 300));
  ok("but says one exists", listed[0].config.hasSecret === true);
  ok("and shows the URL", listed[0].config.url === "https://crm.example.com/hook");

  const single = await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id);
  ok("reading one is also redacted", !JSON.stringify(single).includes(SECRET));

  await updateDestination(fixture.workspaceId, created.id, { name: "Renamed" });
  t(
    "renaming works",
    (await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id))?.name,
    "Renamed",
  );

  // Another workspace's id must not reach this row, and must not error either —
  // it simply is not there.
  const otherWorkspace = newId();
  await unsafeDb
    .insert(workspaces)
    .values({ id: otherWorkspace, slug: `${SLUG}-other`, name: "other" });
  try {
    t(
      "another workspace cannot read it",
      await getDestination(otherWorkspace, fixture.endpointPublicId, created.id),
      null,
    );
    t(
      "and cannot rename it",
      await updateDestination(otherWorkspace, created.id, { name: "stolen" }),
      false,
    );
    t(
      "and cannot delete it",
      await deleteDestination(otherWorkspace, created.id),
      false,
    );
    t(
      "and it is still called what we called it",
      (await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id))?.name,
      "Renamed",
    );
  } finally {
    await unsafeDb.delete(workspaces).where(eq(workspaces.id, otherWorkspace));
  }

  t("a malformed id is not a query", await getDestination(fixture.workspaceId, fixture.endpointPublicId, "not-a-uuid"), null);

  // Soft delete: the row survives so the delivery history stays readable, which
  // is the schema's own stated reason for the column.
  t("deleting works", await deleteDestination(fixture.workspaceId, created.id), true);
  t("and it leaves the list", (await listDestinations(fixture.workspaceId, fixture.endpointPublicId)).length, 0);

  const [raw] = await unsafeDb
    .select({ deletedAt: destinations.deletedAt })
    .from(destinations)
    .where(eq(destinations.id, created.id));
  ok("but the row is still there — nothing was actually deleted", raw?.deletedAt !== null);

  await unsafeDb.delete(destinations).where(eq(destinations.id, created.id));
}

// ---------------------------------------------------------------------------

async function testDelivery(fixture: Fixture, receiver: Receiver) {
  console.log("\ntest delivery");

  receiver.received.length = 0;
  receiver.reply.status = 200;
  receiver.reply.body = '{"received":true}';

  // Counted rather than asserted as zero: earlier sections leave rows behind on
  // purpose, and what matters is that a test delivery adds none.
  const before = (await unsafeDb.select().from(deliveryAttempts)).length;
  const testDestinationId = newId();

  const result = await sendTestDelivery(
    { publicId: fixture.endpointPublicId, name: "Contact form" },
    { id: testDestinationId, kind: "webhook", name: "Test target" },
    { url: `${receiver.url}/test`, secret: SECRET },
    { timeoutMs: 3_000 },
  );

  ok("a test delivery reports success", result.ok);
  t("and the real status code, not a green tick", result.responseStatus, 200);
  t("and the real response body", result.responseBody, '{"received":true}');
  ok("and the exact bytes it sent", (result.requestBody ?? "").includes("submission.created"));

  const sent = JSON.parse(receiver.received[0].body) as { delivery: { test: boolean }; submission: { id: string; origin: string } };
  ok("the payload is marked as a test", sent.delivery.test === true);
  ok("with an obviously fake submission id", sent.submission.id.startsWith("sub_test"));
  ok("and does not claim a human filled it in", sent.submission.origin === "unverified");

  // No row: the delivery log is the record of real leads, and a test in it
  // would make the health numbers lie.
  const after = (await unsafeDb.select().from(deliveryAttempts)).length;
  t("and nothing was written to the delivery log", after, before);

  receiver.reply.status = 500;
  receiver.reply.body = "nope";
  const failed = await sendTestDelivery(
    { publicId: fixture.endpointPublicId, name: "Contact form" },
    { id: newId(), kind: "webhook", name: "Test target" },
    { url: `${receiver.url}/test`, secret: SECRET },
    { timeoutMs: 3_000 },
  );
  ok("a failing test says it failed", !failed.ok);
  t("and shows the status it got", failed.responseStatus, 500);
  t("and the body, which is where the reason usually is", failed.responseBody, "nope");

  const unavailable = await sendTestDelivery(
    { publicId: fixture.endpointPublicId, name: "Contact form" },
    { id: newId(), kind: "hubspot", name: "HubSpot" },
    {},
    { timeoutMs: 3_000 },
  );
  ok("testing a kind we have not built refuses honestly", !unavailable.ok);
  ok("and says why", /not available yet/.test(unavailable.error ?? ""), unavailable.error);
}

// ---------------------------------------------------------------------------
// The attempt row's lifecycle, and the scheduled sweep (#42)
// ---------------------------------------------------------------------------

/**
 * The row exists before the request does.
 *
 * This is the property that stops the delivery log developing silent holes. A
 * delivery whose process is torn down mid-flight — a serverless function frozen
 * once the response is flushed, a connection dropped under load — must still
 * leave a trace, or a destination that has been failing for three weeks reads
 * as "no failures recorded", which is the dashboard this product is named
 * against.
 */
async function pendingRowsAndTheSweep(fixture: Fixture, receiver: Receiver) {
  console.log("\npending rows and the sweep");

  const created = await createDestination(fixture.workspaceId, fixture.endpointPublicId, {
    kind: "webhook",
    name: "Sweep target",
    config: { url: `${receiver.url}/sweep`, secret: SECRET },
  });
  if (!created) return;

  // A receiver that never answers, so the attempt is observably in flight while
  // we look at the row. `delayMs` outlives the adapter timeout we pass below.
  receiver.reply.status = 200;
  receiver.reply.body = '{"ok":true}';
  receiver.reply.delayMs = 3_000;

  const response = await submit(fixture.endpointPublicId, { email: "pending@test.example" });
  const ack = (await response.json()) as { id: string };

  // Deliberately not drained yet: the point is what is on disk *during* the
  // request, not after it.
  await new Promise((resolve) => setTimeout(resolve, 600));
  const inFlight = await attemptsFor(created.id);
  t("a row exists before the request has come back", inFlight.length, 1);
  t("and it is pending", inFlight[0]?.status, "pending");
  ok("with a start time", inFlight[0]?.startedAt !== null);
  ok("and no completion time yet", inFlight[0]?.completedAt === null);
  ok(
    "and the bytes it is sending, so a torn-down delivery still says what it tried",
    (inFlight[0]?.requestBody ?? "").includes("pending@test.example"),
  );

  await drainDispatch();
  receiver.reply.delayMs = 0;

  const settled = await listDeliveryAttempts(fixture.workspaceId, created.id);
  t("the same row settles rather than a second one appearing", settled.length, 1);
  t("as succeeded", settled[0].status, "succeeded");
  ok("with a completion time", settled[0].completedAt !== null);

  // --- The reaper.
  //
  // A pending row nobody will ever finish. Written by hand because the only
  // honest way to produce one is to kill the process that owned it.
  //
  // Note this is the *same* submission that just succeeded above, which is what
  // makes the assertion below what it is.
  const abandonedId = newId();
  await unsafeDb.insert(deliveryAttempts).values({
    id: abandonedId,
    workspaceId: fixture.workspaceId,
    destinationId: created.id,
    submissionId: (
      await unsafeDb
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.publicId, ack.id))
    )[0].id,
    attempt: 2,
    status: "pending",
    requestBody: "{}",
    // Older than STALE_ATTEMPT_MS, i.e. the process that opened it is long gone.
    startedAt: new Date(Date.now() - 30 * 60_000),
    createdAt: new Date(Date.now() - 30 * 60_000),
  });

  let health = await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id);
  t("an abandoned pending row does not count as a failure on its own", health?.health.consecutiveFailures, 0);

  const reaped = await reapStaleAttempts(fixture.workspaceId);
  t("the reaper finds it", reaped, 1);

  const afterReap = (await listDeliveryAttempts(fixture.workspaceId, created.id)).find(
    (row) => row.id === abandonedId,
  );
  t("and calls it a failure rather than leaving it pending", afterReap?.status, "failed");
  ok(
    "with a sentence saying what actually happened",
    /started and never finished/i.test(afterReap?.error ?? ""),
    afterReap?.error,
  );
  // No retry, and that is the point: this destination already delivered *this*
  // submission successfully a few lines above. Rescheduling would put a second
  // copy of the same lead in front of a receiver that may not dedupe.
  //
  // This assertion used to require the opposite, and it was wrong — it encoded a
  // duplicate delivery as the expected behaviour. Found by an independent review
  // of the #60 fix, then reproduced: the resend really happened, and the sweep
  // sent a third request for a lead already delivered twice.
  //
  // The other half — an abandoned row on a submission that has NOT arrived does
  // still get its retry — is asserted in `abandonedClaims`.
  ok(
    "and no retry, because this submission already reached this destination",
    afterReap?.nextRetryAt === null,
    { status: afterReap?.status, nextRetryAt: afterReap?.nextRetryAt },
  );
  ok(
    "with a sentence saying nothing is missing",
    /already been delivered/i.test(afterReap?.error ?? ""),
    afterReap?.error,
  );

  health = await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id);
  // It does NOT bump `consecutiveFailures`, and that is right rather than a
  // gap: this row is older than the last successful delivery, and the count is
  // deliberately "failures since the last success". Nor is it dead-lettered —
  // the lead reached this destination, so nothing is missing. What changed is
  // that it is now visible in the log as a failure with a reason on it instead
  // of sitting `pending` forever, looking like nothing happened.
  t("it does not count against a destination that has succeeded since", health?.health.consecutiveFailures, 0);
  t("and it is not dead-lettered, because the lead did arrive", health?.health.deadLetterCount, 0);
  t("but it is no longer pending", health?.health.pendingCount, 0);

  // --- The sweep, end to end through the HTTP handler.
  //
  // It needs real work to do. The reaped row above no longer supplies any — its
  // submission had already been delivered, so scheduling a retry for it would
  // have been a duplicate — so make a delivery that genuinely fails and is still
  // owed its next attempt.
  receiver.reply.status = 503;
  const owedResponse = await submit(fixture.endpointPublicId, { email: "owed@test.example" });
  await owedResponse.json();
  await drainDispatch();
  receiver.reply.status = 200;

  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "sweep-test-secret";
  const url = "https://endpointforms.test/api/v1/deliveries/sweep";

  const refused = await handleSweep(new Request(url, { method: "GET" }));
  t("an unauthenticated sweep does no work", refused.status, 401);

  const swept = await handleSweep(
    new Request(url, {
      method: "GET",
      headers: { authorization: "Bearer sweep-test-secret" },
    }),
    // Far enough forward that the reaped row's backoff has elapsed.
    { now: new Date(Date.now() + 2 * 3_600_000), timeoutMs: 3_000 },
  );
  t("an authorised sweep runs", swept.status, 200);
  const summary = (await swept.json()) as {
    ok: boolean;
    workspaces: number;
    delivered: number;
  };
  ok("and reports what it did", summary.ok === true && summary.workspaces >= 1, summary);
  ok("including delivering a retry that was genuinely owed", summary.delivered >= 1, summary);

  const finalLog = await listDeliveryAttempts(fixture.workspaceId, created.id);
  const delivered = finalLog.filter((row) => row.status === "succeeded");
  ok("so the failed delivery did eventually arrive", delivered.length >= 2, finalLog.length);

  // Idempotent: the first sweep cleared `next_retry_at` on everything it took,
  // so a second one — a cron whose previous run overran — finds nothing.
  const again = await handleSweep(
    new Request(url, {
      method: "GET",
      headers: { authorization: "Bearer sweep-test-secret" },
    }),
    { now: new Date(Date.now() + 4 * 3_600_000), timeoutMs: 3_000 },
  );
  const secondSummary = (await again.json()) as { delivered: number };
  t("sweeping again delivers nothing — it is safe to run twice", secondSummary.delivered, 0);

  if (previousSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousSecret;

  await unsafeDb.delete(deliveryAttempts).where(eq(deliveryAttempts.destinationId, created.id));
  await unsafeDb.delete(destinations).where(eq(destinations.id, created.id));
}

// ---------------------------------------------------------------------------
// A claim that is never attempted (#60)
// ---------------------------------------------------------------------------

/**
 * The gap between claiming a retry and attempting it.
 *
 * `claimDueRetries` commits before any request goes out, and the attempts then
 * run sequentially. A process that dies in that window used to leave the row
 * `failed` with `next_retry_at` null and **no attempt row at all** — which
 * matches neither branch of `workspacesWithDeliveryWork`, so nothing ever came
 * back for it. The lead was still stored and still visible, but the redelivery
 * was gone, and the destinations screen said "gave up" about a delivery that had
 * never been tried.
 *
 * The crash is simulated the only honest way available: call the claim, and then
 * do nothing. No delivery, no settle. Everything after that point asks whether
 * the system recovers on its own.
 */
async function abandonedClaims(fixture: Fixture, receiver: Receiver) {
  console.log("\nabandoned claims (#60)");

  const created = await createDestination(fixture.workspaceId, fixture.endpointPublicId, {
    kind: "webhook",
    name: "Abandoned claim target",
    config: { url: `${receiver.url}/abandoned`, secret: SECRET },
  });
  if (!created) return;

  const requests = () => receiver.received.filter((row) => row.path === "/abandoned").length;

  receiver.reply.status = 503;
  receiver.reply.body = "upstream unavailable";
  await submit(fixture.endpointPublicId, { email: "abandoned@test.example" });
  await drainDispatch();
  receiver.reply.status = 200;
  receiver.reply.body = '{"ok":true}';

  let log = await listDeliveryAttempts(fixture.workspaceId, created.id);
  t("the first attempt failed", log.length, 1);
  ok("and scheduled a retry", log[0].nextRetryAt !== null);
  t("having sent exactly one request", requests(), 1);

  // The crash. A sweep claims the due retry — and then the process goes away
  // before the request is made.
  const claimedAt = new Date(Date.now() + 2 * 3_600_000);
  const claimed = await claimDueRetries(fixture.workspaceId, {
    endpointId: fixture.endpointId,
    now: claimedAt,
  });
  t("the sweep claims the due retry", claimed.length, 1);
  t("and sends nothing yet", requests(), 1);

  const afterClaim = await attemptsFor(created.id);
  t("claiming opens the attempt row, so an abandoned claim leaves a trace", afterClaim.length, 2);
  const open = afterClaim.find((row) => row.status === "pending");
  ok("which is pending", open !== undefined, afterClaim.map((row) => row.status));
  t("numbered as the next attempt, not a repeat of the failed one", open?.attempt, 2);

  // A delivery with an attempt open has not given up. The dead-letter count is
  // the number a customer reads as "these leads are not coming", and it must not
  // say that about one that is in flight.
  let health = await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id);
  t("an open attempt does not read as a delivery that gave up", health?.health.deadLetterCount, 0);

  // The other half of the fix: re-claiming must not overlap a live attempt.
  const concurrent = await sweepDueRetries(fixture.workspaceId, {
    endpointId: fixture.endpointId,
    now: new Date(claimedAt.getTime() + 60_000),
    timeoutMs: 3_000,
  });
  t(
    "a second sweep while the attempt is open claims nothing",
    concurrent.delivered + concurrent.failed + concurrent.skipped,
    0,
  );
  t("and sends nothing", requests(), 1);

  // Recovery, with no submission to this endpoint to piggyback on. Once the
  // open row is older than `STALE_ATTEMPT_MS` the reaper's own machinery covers
  // it — which is the whole reason the row is opened at claim time.
  const staleAt = new Date(claimedAt.getTime() + STALE_ATTEMPT_MS + 60_000);
  const waiting = await workspacesWithDeliveryWork({ now: staleAt });
  ok(
    "an abandoned claim still counts as delivery work waiting",
    waiting.includes(fixture.workspaceId),
    waiting,
  );

  const reapPass = await runSweep({ now: staleAt, timeoutMs: 3_000 });
  ok("the sweep reaps it", reapPass.reaped >= 1, reapPass);

  const reaped = (await listDeliveryAttempts(fixture.workspaceId, created.id)).find(
    (row) => row.id === open?.id,
  );
  t("turning the abandoned attempt into an honest failure", reaped?.status, "failed");
  // `reaped?.nextRetryAt !== null` would be vacuously true when the row does not
  // exist at all, which is precisely the broken case. Asserted against the row.
  ok("with a retry scheduled", reaped !== undefined && reaped.nextRetryAt !== null, reaped);

  const laterOn = new Date(staleAt.getTime() + 2 * 3_600_000);
  await runSweep({ now: laterOn, timeoutMs: 3_000 });

  log = await listDeliveryAttempts(fixture.workspaceId, created.id);
  const succeeded = log.filter((row) => row.status === "succeeded");
  t("and the lead is eventually delivered", succeeded.length, 1);
  t("having been sent to the receiver exactly twice — once failed, once good", requests(), 2);
  t("with every attempt on the record", log.length, 3);

  health = await getDestination(fixture.workspaceId, fixture.endpointPublicId, created.id);
  t("and nothing is left dead-lettered", health?.health.deadLetterCount, 0);
  t("or pending", health?.health.pendingCount, 0);

  await unsafeDb.delete(deliveryAttempts).where(eq(deliveryAttempts.destinationId, created.id));
  await unsafeDb.delete(destinations).where(eq(destinations.id, created.id));
}

/**
 * Two sweeps racing for the same due retry.
 *
 * A cron and a submission can collide, and now that a claim *inserts* a row the
 * cost of both winning would be two attempts and two outbound requests for one
 * lead. The claim is therefore an update that also requires the schedule to
 * still be set, and only the transaction whose update returns the row has taken
 * it — the other re-checks the predicate after the row lock clears and finds
 * nothing.
 */
async function concurrentClaimsTakeItOnce(fixture: Fixture, receiver: Receiver) {
  console.log("\ntwo sweeps racing for one retry (#60)");

  const created = await createDestination(fixture.workspaceId, fixture.endpointPublicId, {
    kind: "webhook",
    name: "Contended",
    config: { url: `${receiver.url}/contended`, secret: SECRET },
  });
  if (!created) return;

  receiver.reply.status = 503;
  receiver.reply.body = "upstream unavailable";
  await submit(fixture.endpointPublicId, { email: "contended@test.example" });
  await drainDispatch();
  receiver.reply.status = 200;
  receiver.reply.body = '{"ok":true}';

  const now = new Date(Date.now() + 2 * 3_600_000);
  const [left, right] = await Promise.all([
    claimDueRetries(fixture.workspaceId, { endpointId: fixture.endpointId, now }),
    claimDueRetries(fixture.workspaceId, { endpointId: fixture.endpointId, now }),
  ]);

  t("exactly one of the two sweeps takes it", left.length + right.length, 1);

  const rows = await attemptsFor(created.id);
  t("and exactly one attempt is opened, not two", rows.filter((row) => row.status === "pending").length, 1);
  t("so the delivery has two rows in total", rows.length, 2);

  await unsafeDb.delete(deliveryAttempts).where(eq(deliveryAttempts.destinationId, created.id));
  await unsafeDb.delete(destinations).where(eq(destinations.id, created.id));
}

/**
 * A claim whose destination goes away before the delivery runs.
 *
 * The claim opens a `pending` row, and if nothing is ever attempted against it
 * nothing settles it. That happens when a destination is paused between the
 * claim and the delivery — both check that it is live, a moment apart. Left
 * alone the row would sit until the reaper called it a network failure, which
 * would be a lie about what happened, so the sweep closes it itself.
 *
 * Reaching that gap needs the world to change *inside* one call, so the
 * receiver pauses the first delivery and pauses the second destination while it
 * is holding the request open.
 */
async function claimsWhoseDestinationGoesAway(fixture: Fixture, receiver: Receiver) {
  console.log("\na claim whose destination is paused mid-sweep (#60)");

  const first = await createDestination(fixture.workspaceId, fixture.endpointPublicId, {
    kind: "webhook",
    name: "Still here",
    config: { url: `${receiver.url}/still-here`, secret: SECRET },
  });
  const second = await createDestination(fixture.workspaceId, fixture.endpointPublicId, {
    kind: "webhook",
    name: "Paused mid-sweep",
    config: { url: `${receiver.url}/paused`, secret: SECRET },
  });
  if (!first || !second) return;

  // Both fail, so both have a retry due.
  receiver.reply.status = 503;
  receiver.reply.body = "upstream unavailable";
  await submit(fixture.endpointPublicId, { email: "vanishing@test.example" });
  await drainDispatch();
  receiver.reply.status = 200;
  receiver.reply.body = '{"ok":true}';

  t("both destinations failed", (await attemptsFor(second.id)).length, 1);

  // Claims come back in `next_retry_at` order, and the schedule carries ±20%
  // jitter — so the order is pinned by hand rather than left to chance. The
  // surviving destination must be delivered first, because the pause has to
  // happen while the sweep is still working.
  const due = new Date(Date.now() + 3_600_000);
  await unsafeDb
    .update(deliveryAttempts)
    .set({ nextRetryAt: due })
    .where(eq(deliveryAttempts.destinationId, first.id));
  await unsafeDb
    .update(deliveryAttempts)
    .set({ nextRetryAt: new Date(due.getTime() + 1_000) })
    .where(eq(deliveryAttempts.destinationId, second.id));

  // The sweep claims both up front, then delivers them one at a time. While the
  // first delivery is in flight, the second destination is paused.
  receiver.reply.beforeRespond = async () => {
    receiver.reply.beforeRespond = null;
    await updateDestination(fixture.workspaceId, second.id, { enabled: false });
  };

  const swept = await sweepDueRetries(fixture.workspaceId, {
    endpointId: fixture.endpointId,
    now: new Date(Date.now() + 2 * 3_600_000),
    timeoutMs: 3_000,
  });
  receiver.reply.beforeRespond = null;

  t("the destination that is still there gets its retry", swept.delivered, 1);

  const orphan = (await attemptsFor(second.id)).find((row) => row.attempt === 2);
  ok("the paused one's claimed row exists", orphan !== undefined);
  t("and is not left pending forever", orphan?.status, "failed");
  ok(
    "with a sentence naming what actually happened, not a made-up network error",
    /paused or removed/i.test(orphan?.error ?? ""),
    orphan?.error,
  );
  ok("and no retry scheduled against a destination that is off", orphan?.nextRetryAt === null);

  await unsafeDb.delete(deliveryAttempts).where(eq(deliveryAttempts.destinationId, first.id));
  await unsafeDb.delete(deliveryAttempts).where(eq(deliveryAttempts.destinationId, second.id));
  await unsafeDb.delete(destinations).where(eq(destinations.id, first.id));
  await unsafeDb.delete(destinations).where(eq(destinations.id, second.id));
}

// ---------------------------------------------------------------------------

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // A fire-and-forget delivery still running when `sqlClient.end()` fires
    // produces a CONNECTION_ENDED that has nothing to do with the code under
    // test. Drain before tearing the connection down.
    await drainDispatch();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail > 0) process.exitCode = 1;
    await cleanup();
    await sqlClient.end();
  });


/**
 * A claim abandoned, and then overtaken by a delivery that succeeded.
 *
 * Found by an independent review of the #60 fix rather than by writing this
 * test first — worth recording, because it is an interleaving the fix itself
 * made reachable. Opening a `pending` row at claim time means an abandoned
 * claim can now outlive a success on a different attempt:
 *
 *   attempt 1 fails and schedules a retry
 *   a sweep claims it, opening pending attempt 2 — that worker dies
 *   someone redelivers by hand and it SUCCEEDS as attempt 3
 *   the reaper finds attempt 2 stale and schedules a retry anyway
 *   a later sweep sends attempt 4 — a second copy of a lead already delivered
 *
 * The lead is not lost. It arrives twice, at a receiver that may not dedupe —
 * which is precisely what the lease design was rejected for, so it must not
 * come back in by the side door.
 *
 * Runs last: it claims every due retry on the endpoint, so placed earlier it
 * would eat retries the other cases are waiting for.
 */
async function supersededClaims(fixture: Fixture, receiver: Receiver) {
  console.log("\nan abandoned claim overtaken by a success (#60 follow-up)");

  const dest = await createDestination(fixture.workspaceId, fixture.endpointPublicId, {
    kind: "webhook",
    name: "Superseded claim target",
    config: { url: `${receiver.url}/superseded`, secret: SECRET },
  });
  if (!dest) return;

  const sent = () => receiver.received.filter((row) => row.path === "/superseded").length;

  receiver.reply.status = 503;
  await submit(fixture.endpointPublicId, { email: "superseded@test.example" });
  await drainDispatch();
  receiver.reply.status = 200;

  const base = new Date(Date.now() + 6 * 3_600_000);
  const took = await claimDueRetries(fixture.workspaceId, {
    endpointId: fixture.endpointId,
    now: base,
  });
  const mine = took.filter((row) => row.destinationId === dest.id);
  t("the superseded case claims its own retry", mine.length, 1);
  if (mine.length !== 1) return;

  // The claim is abandoned — nothing is attempted. Then a manual redelivery
  // succeeds on a fresh attempt.
  const before = sent();
  await deliverSubmission(fixture.workspaceId, mine[0]!.submissionPublicId, {
    destinationId: dest.id,
    force: true,
    now: new Date(base.getTime() + 1_000),
    timeoutMs: 3_000,
  });
  t("a manual redelivery sends one request", sent(), before + 1);

  const afterSuccess = await listDeliveryAttempts(fixture.workspaceId, dest.id);
  ok(
    "and it succeeded",
    afterSuccess.some((row) => row.status === "succeeded"),
    afterSuccess.map((row) => row.status),
  );

  // The reaper now meets the abandoned claim, after the success.
  const late = new Date(base.getTime() + STALE_ATTEMPT_MS + 60_000);
  await reapStaleAttempts(fixture.workspaceId, { now: late });

  const reaped = (await listDeliveryAttempts(fixture.workspaceId, dest.id)).find(
    (row) => row.id === mine[0]!.attemptId,
  );
  ok(
    "the abandoned claim is closed rather than left pending",
    reaped !== undefined && reaped.status !== "pending",
    reaped?.status,
  );
  ok(
    "and NOT rescheduled, because the lead already arrived",
    reaped !== undefined && reaped.nextRetryAt === null,
    { status: reaped?.status, nextRetryAt: reaped?.nextRetryAt },
  );

  // Sweep *after* whatever the reaper scheduled, not 60s after the reap — the
  // first version of this assertion passed only because the rescheduled retry
  // was not due yet, which is the same vacuous-pass this suite already caught
  // once. Ask at a time when the retry would actually fire.
  const settled = sent();
  const afterDue = reaped?.nextRetryAt
    ? new Date(new Date(reaped.nextRetryAt).getTime() + 60_000)
    : new Date(late.getTime() + 60_000);
  await runSweep({ now: afterDue, timeoutMs: 3_000 });
  t("so no later sweep re-sends a lead that already arrived", sent(), settled);
}
