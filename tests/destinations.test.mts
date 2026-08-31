/**
 * Destinations — the delivery engine (#41), and failing loudly (#42).
 *
 * Everything here is pure or fed a fake `fetch`, so there is no database, no
 * server and no port: `node --experimental-strip-types tests/destinations.test.mts`.
 * The database side lives in `tests/destinations-db.test.mts`.
 *
 * These are written from the question "how does a lead get delivered to the
 * wrong place, twice, or not at all?" rather than from a coverage target:
 *
 *   - the signature, including the replay window and a one-byte tamper
 *   - the SSRF guard, against every obfuscated loopback form a resolver accepts
 *   - the retry policy, including the failures that must *not* be retried
 *   - the delivery id, which is the only thing standing between a retry and a
 *     duplicate lead in someone's CRM
 *   - the redaction, because a secret rendered once is a secret forever
 */

import {
  assertDeliverableUrl,
  backoffMs,
  buildConfig,
  buildPayload,
  classifyStatus,
  classifyTransportError,
  decideRetry,
  deliveryIdFor,
  describeFailure,
  DestinationUrlError,
  HEADER_ATTEMPT,
  HEADER_DELIVERY_ID,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  MAX_ATTEMPTS,
  maskSecret,
  newDestinationSecret,
  redactConfig,
  sampleSource,
  serialisePayload,
  signPayload,
  transportDetail,
  verifySignature,
  ADAPTER_OPTIONS,
  handleSweep,
  isAuthorisedSweep,
  isAvailableKind,
} from "../src/lib/destinations/index.ts";
import { deliverWebhook } from "../src/lib/destinations/adapters/webhook.ts";
import { deliverEmail } from "../src/lib/destinations/adapters/email.ts";
import { deliverSlack, slackMessage } from "../src/lib/destinations/adapters/slack.ts";
import { parseConfig } from "../src/lib/destinations/config.ts";
import type { SubmissionPayload } from "../src/lib/destinations/types.ts";

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
// Fixtures
// ---------------------------------------------------------------------------

const SECRET = "whsec_test_secret_that_is_long_enough";
const NOW = new Date("2026-08-31T12:00:00.000Z");

function payload(overrides: Partial<{ attempt: number; test: boolean }> = {}): SubmissionPayload {
  return buildPayload(sampleSource({ publicId: "ep_abc123", name: "Contact form" }), {
    id: "dlv_fixed",
    attempt: overrides.attempt ?? 1,
    sentAt: NOW,
    test: overrides.test ?? false,
  });
}

/** A `fetch` that records what it was asked to do and answers however we say. */
function fakeFetch(reply: {
  status?: number;
  body?: string;
  throws?: Error;
  headers?: Record<string, string>;
}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (reply.throws) throw reply.throws;
    return new Response(reply.body ?? "", {
      status: reply.status ?? 200,
      headers: reply.headers,
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

console.log("\nsignature");
{
  const body = '{"hello":"world"}';
  const timestamp = 1_800_000_000;
  const signature = signPayload(SECRET, timestamp, body);

  ok("is versioned", signature.startsWith("v1="), signature);
  ok(
    "verifies with the right secret, body and timestamp",
    verifySignature({ secret: SECRET, rawBody: body, signature, timestamp, nowSeconds: timestamp }),
  );
  ok(
    "is deterministic — two calls produce the same MAC",
    signPayload(SECRET, timestamp, body) === signature,
  );

  ok(
    "rejects a body changed by one byte",
    !verifySignature({
      secret: SECRET,
      rawBody: '{"hello":"worlD"}',
      signature,
      timestamp,
      nowSeconds: timestamp,
    }),
  );
  ok(
    "rejects the wrong secret",
    !verifySignature({
      secret: "whsec_a_completely_different_secret",
      rawBody: body,
      signature,
      timestamp,
      nowSeconds: timestamp,
    }),
  );
  ok(
    "rejects a signature that is missing entirely",
    !verifySignature({ secret: SECRET, rawBody: body, signature: null, timestamp, nowSeconds: timestamp }),
  );

  // The timestamp is inside the MAC, so a replay cannot be re-stamped: changing
  // the header invalidates the signature, and keeping it makes it stale.
  ok(
    "rejects a replay six minutes later",
    !verifySignature({
      secret: SECRET,
      rawBody: body,
      signature,
      timestamp,
      nowSeconds: timestamp + 360,
    }),
  );
  ok(
    "accepts a delivery four minutes late — clocks drift",
    verifySignature({
      secret: SECRET,
      rawBody: body,
      signature,
      timestamp,
      nowSeconds: timestamp + 240,
    }),
  );
  ok(
    "rejects a timestamp that is not a number",
    !verifySignature({ secret: SECRET, rawBody: body, signature, timestamp: "soon", nowSeconds: timestamp }),
  );
  ok(
    "rejects a signature under a different timestamp than the one signed",
    !verifySignature({
      secret: SECRET,
      rawBody: body,
      signature,
      timestamp: timestamp + 1,
      nowSeconds: timestamp + 1,
    }),
  );

  const secret = newDestinationSecret();
  ok("a generated secret is prefixed and long", secret.startsWith("whsec_") && secret.length > 30, secret);
  ok("two generated secrets differ", newDestinationSecret() !== newDestinationSecret());
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

console.log("\ndelivery id");
{
  const a = deliveryIdFor("dest-1", "sub-1");

  // The whole point: attempt 2 of the same delivery carries the same id, so a
  // receiver that already wrote attempt 1 to its CRM can drop it.
  t("is stable across retries", deliveryIdFor("dest-1", "sub-1"), a);
  ok("differs per submission", deliveryIdFor("dest-1", "sub-2") !== a);
  ok("differs per destination", deliveryIdFor("dest-2", "sub-1") !== a);
  ok("is prefixed", a.startsWith("dlv_"), a);
  // Hashed, so the receiver does not learn our row ids.
  ok("does not leak the ids it was built from", !a.includes("dest-1") && !a.includes("sub-1"), a);
}

// ---------------------------------------------------------------------------
// The SSRF guard
// ---------------------------------------------------------------------------

console.log("\nssrf guard");
{
  const blocked = [
    "http://127.0.0.1/hook",
    "https://127.0.0.1/hook",
    "https://localhost/hook",
    "https://127.1/hook",
    "https://0x7f.0.0.1/hook",
    "https://2130706433/hook",
    "https://[::1]/hook",
    // `new URL()` normalises this to `[::ffff:7f00:1]` — in hex — so a guard
    // that pattern-matches the dotted spelling never fires on it. The next
    // three are the same 32 bits written three more ways.
    "https://[::ffff:127.0.0.1]/hook",
    "https://[::ffff:7f00:1]/hook",
    "https://[::ffff:a9fe:a9fe]/latest/meta-data/",
    "https://[0:0:0:0:0:ffff:169.254.169.254]/",
    "https://[64:ff9b::7f00:1]/hook",
    "https://[::127.0.0.1]/hook",
    "https://[fe80::1]/hook",
    "https://[fd00::1]/hook",
    "https://169.254.169.254/latest/meta-data/",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://10.0.0.5/hook",
    "https://192.168.1.1/hook",
    "https://172.16.4.4/hook",
    "https://100.64.0.1/hook",
    "https://0.0.0.0/hook",
    "https://printer.local/hook",
    "https://vault.internal/hook",
  ];

  for (const url of blocked) {
    let threw: DestinationUrlError | null = null;
    try {
      assertDeliverableUrl(url, { allowInsecure: true });
    } catch (error) {
      threw = error as DestinationUrlError;
    }
    ok(`blocks ${url}`, threw !== null && threw.code === "blocked_host", threw?.code ?? "accepted");
  }

  const allowed = [
    "https://crm.example.com/hooks/leads",
    "https://hooks.slack.com/services/T000/B000/xxxx",
    "https://8.8.8.8/hook",
    "https://example.co.uk:8443/hook",
    // A public IPv6 address is not blocked just for being IPv6.
    "https://[2606:4700:4700::1111]/hook",
  ];
  for (const url of allowed) {
    let threw: unknown = null;
    try {
      assertDeliverableUrl(url);
    } catch (error) {
      threw = error;
    }
    ok(`allows ${url}`, threw === null, threw instanceof Error ? threw.message : threw);
  }

  const codeOf = (input: string, options = {}) => {
    try {
      assertDeliverableUrl(input, options);
      return "accepted";
    } catch (error) {
      return error instanceof DestinationUrlError ? error.code : "other";
    }
  };

  t("refuses plaintext http by default", codeOf("http://example.com/hook"), "insecure_scheme");
  t(
    "allows http when a self-hoster opts in",
    codeOf("http://example.com/hook", { allowInsecure: true }),
    "accepted",
  );
  t("refuses a non-http scheme", codeOf("file:///etc/passwd"), "invalid_url");
  t("refuses gopher", codeOf("gopher://example.com/"), "invalid_url");
  t("refuses something that is not a URL", codeOf("example.com/hook"), "invalid_url");
  t(
    "refuses credentials in the URL — they would land in every log line",
    codeOf("https://user:hunter2@example.com/hook"),
    "credentials_in_url",
  );
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

console.log("\nretries");
{
  // Failures that will still be failures in an hour are not retried. Retrying a
  // 401 four times turns one alert into five and delays the one that matters.
  for (const failure of ["auth", "rejected", "missing", "configuration"] as const) {
    const decision = decideRetry({ attempt: 1, failure, now: NOW });
    ok(`does not retry ${failure}`, !decision.willRetry && decision.nextRetryAt === null);
    ok(`says why it did not retry ${failure}`, decision.reason.trim().length > 10, decision.reason);

    // The reason is appended to `describeFailure`'s sentence in the delivery
    // log, so the two together must read as one paragraph. A log line that
    // says "replace it, then redeliver" twice reads as generated text, and
    // generated text is what people skim past — which defeats failing loudly.
    const combined = `${describeFailure(failure, "CRM intake")} ${decision.reason}`;
    const sentences = combined
      .split(/(?<=\.)\s+/)
      .map((sentence) => sentence.trim().toLowerCase())
      .filter((sentence) => sentence !== "");
    ok(
      `and does not repeat itself for ${failure}`,
      new Set(sentences).size === sentences.length,
      combined,
    );
  }

  for (const failure of ["throttled", "target_down", "network", "unknown"] as const) {
    const decision = decideRetry({ attempt: 1, failure, now: NOW });
    ok(`retries ${failure}`, decision.willRetry && decision.nextRetryAt !== null);
  }

  // Backoff grows, and the cap is real.
  const noJitter = () => 0.5;
  t("attempt 1 waits 30s", backoffMs(1, noJitter), 30_000);
  t("attempt 2 waits 2m", backoffMs(2, noJitter), 120_000);
  t("attempt 3 waits 10m", backoffMs(3, noJitter), 600_000);
  t("attempt 4 waits 1h", backoffMs(4, noJitter), 3_600_000);
  // Clamped rather than reading past the end of the schedule and returning NaN.
  t("an attempt past the schedule clamps to the last step", backoffMs(9, noJitter), 3_600_000);

  ok("jitter never exceeds ±20%", (() => {
    for (const random of [() => 0, () => 1, () => 0.13, () => 0.87]) {
      const value = backoffMs(1, random);
      if (value < 24_000 || value > 36_000) return false;
    }
    return true;
  })());
  ok(
    "jitter actually varies — two draws are not the same",
    backoffMs(3, () => 0) !== backoffMs(3, () => 1),
  );

  const last = decideRetry({ attempt: MAX_ATTEMPTS, failure: "target_down", now: NOW });
  ok("stops at the attempt cap", !last.willRetry && last.nextRetryAt === null);
  ok(
    "says the submission was not thrown away when it gives up",
    /redeliver/i.test(last.reason) && /nothing was thrown away/i.test(last.reason),
    last.reason,
  );

  const scheduled = decideRetry({ attempt: 1, failure: "target_down", now: NOW, random: noJitter });
  t(
    "schedules the next attempt 30s out",
    scheduled.nextRetryAt?.toISOString(),
    new Date(NOW.getTime() + 30_000).toISOString(),
  );
}

console.log("\nfailure classification");
{
  t("401 is auth", classifyStatus(401), "auth");
  t("403 is auth", classifyStatus(403), "auth");
  t("404 is missing", classifyStatus(404), "missing");
  t("410 is missing", classifyStatus(410), "missing");
  t("422 is rejected", classifyStatus(422), "rejected");
  t("429 is throttled", classifyStatus(429), "throttled");
  t("500 is the target being down", classifyStatus(500), "target_down");
  t("503 is the target being down", classifyStatus(503), "target_down");
  t("a timeout is a network failure", classifyTransportError(new Error("The operation timed out")), "network");
  t(
    "a refused connection is a network failure",
    classifyTransportError(new Error("connect ECONNREFUSED 1.2.3.4:443")),
    "network",
  );
  t(
    "a DNS failure is a network failure",
    classifyTransportError(new Error("getaddrinfo ENOTFOUND nope.example")),
    "network",
  );
  t(
    "an expired certificate is a network failure",
    classifyTransportError(new Error("unable to verify the first certificate: TLS")),
    "network",
  );

  // Node's `fetch` throws a bare `TypeError: fetch failed` for every transport
  // problem and puts the real reason in `cause`. Classifying on the top-level
  // message alone reported a dead hostname as "a reason we could not classify",
  // which is what the screen actually said before this was fixed.
  const undiciStyle = (code: string, message: string) => {
    const cause = new Error(message) as Error & { code?: string };
    cause.code = code;
    return Object.assign(new TypeError("fetch failed"), { cause });
  };

  t(
    "a dead hostname is a network failure, not an unknown one",
    classifyTransportError(undiciStyle("ENOTFOUND", "getaddrinfo ENOTFOUND nope.example")),
    "network",
  );
  t(
    "a refused connection under `fetch failed` is a network failure",
    classifyTransportError(undiciStyle("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:1")),
    "network",
  );
  t(
    "and a bare `fetch failed` with no cause at all is still the network",
    classifyTransportError(new TypeError("fetch failed")),
    "network",
  );
  ok(
    "the detail shown in the log names the actual cause",
    /ENOTFOUND/.test(
      transportDetail(undiciStyle("ENOTFOUND", "getaddrinfo ENOTFOUND nope.example")),
    ),
    transportDetail(undiciStyle("ENOTFOUND", "getaddrinfo ENOTFOUND nope.example")),
  );
  ok(
    "rather than only saying `fetch failed`",
    transportDetail(new TypeError("fetch failed")) !== "",
  );
  t(
    "a cycle in the cause chain does not hang the classifier",
    (() => {
      const a = new Error("a") as Error & { cause?: unknown };
      const b = new Error("b") as Error & { cause?: unknown };
      a.cause = b;
      b.cause = a;
      return classifyTransportError(a);
    })(),
    "unknown",
  );
}

// ---------------------------------------------------------------------------
// Payload contract
// ---------------------------------------------------------------------------

console.log("\npayload");
{
  const sent = payload();

  t("names the event", sent.type, "submission.created");
  t("carries the origin stamp", sent.submission.origin, "unverified");
  t("carries the verdict", sent.submission.verdict, "awaiting");
  ok("carries the origin reasons", Array.isArray(sent.submission.originReasons));
  ok("carries the submitted values", sent.submission.values.email === "test@endpointforms.com");

  // Always present, null when unknown — a receiver's code must not have to
  // handle a key that appears on some deliveries and not others.
  const attribution = sent.submission.attribution;
  const attributionKeys = Object.keys(attribution).sort();
  t(
    "attribution keys are always all present",
    attributionKeys,
    ["clickIds", "referrer", "utmCampaign", "utmContent", "utmMedium", "utmSource", "utmTerm"],
  );
  ok("a missing utm is null, not absent", attribution.utmCampaign === null);
  ok("verdictValue is null rather than 0 before an outcome", sent.submission.verdictValue === null);

  t("marks a test delivery", payload({ test: true }).delivery.test, true);
  t("a real delivery is not marked as a test", sent.delivery.test, false);
  t("the attempt number is in the payload", payload({ attempt: 3 }).delivery.attempt, 3);

  // Signing one serialisation and sending another is a signature that verifies
  // only until the shape gains something non-deterministic.
  ok(
    "serialises identically twice",
    serialisePayload(sent) === serialisePayload(sent),
  );
  ok("the test sample is obviously fake", sent.submission.id.startsWith("sub_test"), sent.submission.id);
  t(
    "the test sample does not claim to be human",
    sampleSource({ publicId: "ep", name: "n" }).origin,
    "unverified",
  );
}

// ---------------------------------------------------------------------------
// Config: building, and never handing a secret back
// ---------------------------------------------------------------------------

console.log("\nconfig and redaction");
{
  const built = buildConfig("webhook", { url: "https://crm.example.com/hooks/leads" });
  ok("generates a secret on create", built.ok === true && built.secret !== null);
  ok(
    "stores the secret in the config",
    built.ok === true && typeof built.config.secret === "string",
  );

  if (built.ok) {
    const redacted = redactConfig("webhook", built.config);
    const serialised = JSON.stringify(redacted);
    ok(
      "the redacted config does not contain the secret",
      !serialised.includes(String(built.config.secret)),
      serialised,
    );
    ok("but says a secret exists", redacted.hasSecret);
    ok("and shows the URL, which is not a secret", redacted.url === "https://crm.example.com/hooks/leads");

    // An edit that does not retype the secret must not un-sign every future
    // delivery — that would be a silent downgrade nobody would notice.
    const edited = buildConfig("webhook", { url: "https://crm.example.com/v2" }, built.config);
    ok("an edit carries the existing secret forward", edited.ok === true && edited.config.secret === built.config.secret);
    ok("and does not re-show it", edited.ok === true && edited.secret === null);

    const rotated = buildConfig(
      "webhook",
      { url: "https://crm.example.com/v2", rotateSecret: true },
      built.config,
    );
    ok("rotating replaces the secret", rotated.ok === true && rotated.config.secret !== built.config.secret);
    ok("and shows the new one exactly once", rotated.ok === true && rotated.secret !== null);
  }

  ok("masking keeps enough to tell two secrets apart", maskSecret(SECRET).startsWith("whsec_t"));
  ok("masking drops the middle", !maskSecret(SECRET).includes("secret_that_is"));
  t("masking a short value reveals nothing at all", maskSecret("abc"), "••••••••");

  const blocked = buildConfig("webhook", { url: "https://169.254.169.254/latest/" });
  ok("a webhook cannot be created against the metadata address", blocked.ok === false);

  const headers = buildConfig("webhook", {
    url: "https://crm.example.com/hook",
    headers: "Authorization: Bearer sk-live-12345\nX-Team: sales",
  });
  ok("parses `Name: value` headers", headers.ok === true && (headers.config.headers as Record<string, string>)["X-Team"] === "sales");
  if (headers.ok) {
    const redacted = redactConfig("webhook", headers.config);
    ok(
      "custom header VALUES never come back — that is where an API key lives",
      !JSON.stringify(redacted).includes("sk-live-12345"),
      JSON.stringify(redacted),
    );
    ok("only their names do", redacted.headerNames.includes("Authorization"));
  }

  const reserved = buildConfig("webhook", {
    url: "https://crm.example.com/hook",
    headers: "X-Endpoint-Signature: forged",
  });
  ok("refuses to let a customer override our signature header", reserved.ok === false);

  const slack = buildConfig("slack", { webhookUrl: "https://hooks.slack.com/services/T0/B0/zzz" });
  ok("accepts a Slack incoming webhook", slack.ok === true);
  if (slack.ok) {
    const redacted = redactConfig("slack", slack.config);
    ok(
      "the Slack URL is a credential and is masked whole",
      !JSON.stringify(redacted).includes("zzz"),
      JSON.stringify(redacted),
    );
  }
  ok(
    "refuses a Slack destination pointed somewhere that is not Slack",
    buildConfig("slack", { webhookUrl: "https://evil.example/collect" }).ok === false,
  );
  ok(
    "a Slack edit that leaves the field blank keeps the existing credential",
    (() => {
      const kept = buildConfig("slack", { webhookUrl: "" }, { webhookUrl: "https://hooks.slack.com/services/A/B/C" });
      return kept.ok === true && kept.config.webhookUrl === "https://hooks.slack.com/services/A/B/C";
    })(),
  );

  const email = buildConfig("email", { to: "a@example.com, b@example.com" });
  ok("splits email recipients", email.ok === true && (email.config.to as string[]).length === 2);
  ok("refuses a bad address", buildConfig("email", { to: "not-an-address" }).ok === false);
  ok("refuses no address at all", buildConfig("email", { to: "  " }).ok === false);

  // A config this build cannot read must fail the delivery loudly rather than
  // half-form a request.
  let configError = false;
  try {
    parseConfig("webhook", { url: "https://x.example" });
  } catch {
    configError = true;
  }
  ok("a config missing its secret is a hard error, not a silent send", configError);
}

// ---------------------------------------------------------------------------
// Unavailable kinds
// ---------------------------------------------------------------------------

console.log("\nunavailable kinds");
{
  for (const kind of ["google_sheets", "hubspot", "salesforce"] as const) {
    ok(`${kind} is not offered as a working option`, !isAvailableKind(kind));
    const option = ADAPTER_OPTIONS.find((entry) => entry.kind === kind);
    ok(`${kind} is still named, and says why not`, option !== undefined && option.available === false);
    ok(
      `${kind} cannot be built from a form`,
      buildConfig(kind, { url: "https://example.com" }).ok === false,
    );
  }
  for (const kind of ["webhook", "email", "slack"] as const) {
    ok(`${kind} is available`, isAvailableKind(kind));
  }
}

// ---------------------------------------------------------------------------
// The webhook adapter, against a fake receiver
// ---------------------------------------------------------------------------

console.log("\nwebhook adapter");
{
  const config = { url: "https://crm.example.com/hooks/leads", secret: SECRET };

  {
    const { impl, calls } = fakeFetch({ status: 200, body: '{"ok":true}' });
    const result = await deliverWebhook({
      destinationName: "CRM intake",
      payload: payload(),
      config,
      fetchImpl: impl,
    });

    ok("a 200 succeeds", result.ok);
    t("keeps the response status", result.responseStatus, 200);
    t("keeps the response body", result.responseBody, '{"ok":true}');

    const headers = calls[0].init.headers as Record<string, string>;
    ok("sends a signature", typeof headers[HEADER_SIGNATURE] === "string");
    ok("sends a timestamp", typeof headers[HEADER_TIMESTAMP] === "string");
    t("sends the delivery id", headers[HEADER_DELIVERY_ID], "dlv_fixed");
    t("sends the attempt number", headers[HEADER_ATTEMPT], "1");

    // The signature must verify over the bytes actually sent, which is the only
    // property a receiver can act on.
    ok(
      "the signature verifies over the body that was sent",
      verifySignature({
        secret: SECRET,
        rawBody: String(calls[0].init.body),
        signature: headers[HEADER_SIGNATURE],
        timestamp: headers[HEADER_TIMESTAMP],
        nowSeconds: Number(headers[HEADER_TIMESTAMP]),
      }),
    );
    t("does not follow redirects", calls[0].init.redirect, "manual");
  }

  {
    const { impl } = fakeFetch({ status: 401, body: "expired token" });
    const result = await deliverWebhook({
      destinationName: "CRM intake",
      payload: payload(),
      config,
      fetchImpl: impl,
    });
    ok("a 401 fails", !result.ok);
    t("and is classified as auth", result.failure, "auth");
    ok("and says what to do about it", /expired or been revoked/.test(result.error ?? ""), result.error);
  }

  {
    const { impl } = fakeFetch({ status: 503 });
    const result = await deliverWebhook({
      destinationName: "CRM intake",
      payload: payload(),
      config,
      fetchImpl: impl,
    });
    t("a 503 is the target being down", result.failure, "target_down");
  }

  {
    const { impl } = fakeFetch({ status: 302, headers: { location: "http://169.254.169.254/" } });
    const result = await deliverWebhook({
      destinationName: "CRM intake",
      payload: payload(),
      config,
      fetchImpl: impl,
    });
    // Following this hop is the classic way an SSRF guard gets defeated.
    ok("a redirect is a failure, not a hop", !result.ok);
    ok("and says so", /redirect/i.test(result.error ?? ""), result.error);
  }

  {
    const { impl } = fakeFetch({ throws: new Error("connect ECONNREFUSED 93.184.216.34:443") });
    const result = await deliverWebhook({
      destinationName: "CRM intake",
      payload: payload(),
      config,
      fetchImpl: impl,
    });
    ok("a refused connection fails rather than throwing", !result.ok);
    t("and is classified as network", result.failure, "network");
    ok("and keeps the transport message", /ECONNREFUSED/.test(result.error ?? ""), result.error);
  }

  {
    // A URL that was public when it was saved and resolves to loopback now.
    const { impl, calls } = fakeFetch({ status: 200 });
    const result = await deliverWebhook({
      destinationName: "CRM intake",
      payload: payload(),
      config: { url: "https://127.0.0.1/hook", secret: SECRET },
      fetchImpl: impl,
    });
    ok("re-checks the URL on every delivery, not only on save", !result.ok);
    t("and does not attempt the request at all", calls.length, 0);
    t("and is a configuration failure, so it is not retried", result.failure, "configuration");
  }

  {
    const { impl } = fakeFetch({ status: 200 });
    const result = await deliverWebhook({
      destinationName: "CRM intake",
      payload: payload(),
      config: {
        url: "https://crm.example.com/hook",
        secret: SECRET,
        headers: { Authorization: "Bearer sk-live-secret" },
      },
      fetchImpl: impl,
    });
    ok(
      "a customer's own header is redacted in the delivery log",
      JSON.stringify(result.requestHeaders).includes("[redacted]") &&
        !JSON.stringify(result.requestHeaders).includes("sk-live-secret"),
      result.requestHeaders,
    );
    ok(
      "but our signature header is kept, or the log cannot debug a signature",
      typeof result.requestHeaders?.[HEADER_SIGNATURE] === "string",
    );
  }

  {
    const long = "x".repeat(100_000);
    const { impl } = fakeFetch({ status: 500, body: long });
    const result = await deliverWebhook({
      destinationName: "CRM intake",
      payload: payload(),
      config,
      fetchImpl: impl,
    });
    ok("caps a huge response body", (result.responseBody ?? "").length < 20_000, (result.responseBody ?? "").length);
    ok("and says it truncated", /truncated/.test(result.responseBody ?? ""));
  }
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

console.log("\nslack adapter");
{
  const config = { webhookUrl: "https://hooks.slack.com/services/T0/B0/secret-token" };

  const { impl, calls } = fakeFetch({ status: 200, body: "ok" });
  const result = await deliverSlack({
    destinationName: "#leads",
    payload: payload(),
    config,
    fetchImpl: impl,
  });

  ok("posts to the webhook", result.ok);
  ok(
    "never writes the webhook URL into the delivery log — it is the credential",
    !JSON.stringify(result.requestHeaders).includes("secret-token"),
    result.requestHeaders,
  );

  const sent = JSON.parse(String(calls[0].init.body));
  ok("has a text fallback for notifications and screen readers", typeof sent.text === "string" && sent.text.length > 0);
  ok("leads with the origin stamp", /Unverified/.test(sent.text), sent.text);

  const escaped = slackMessage(
    buildPayload(
      { ...sampleSource({ publicId: "ep", name: "n" }), values: { name: "<script>alert(1)</script>" } },
      { id: "dlv", attempt: 1, sentAt: NOW, test: false },
    ),
  );
  ok(
    "escapes Slack's reserved characters so a lead cannot inject markup",
    !JSON.stringify(escaped).includes("<script>"),
    JSON.stringify(escaped).slice(0, 200),
  );

  const failed = await deliverSlack({
    destinationName: "#leads",
    payload: payload(),
    config: { webhookUrl: "https://hooks.slack.com/services/T0/B0/gone" },
    fetchImpl: fakeFetch({ status: 404, body: "no_service" }).impl,
  });
  ok("a deleted webhook fails", !failed.ok);
  t("and is a configuration problem rather than something to retry", failed.failure, "configuration");
  ok("and quotes Slack's own word for it", /no_service/.test(failed.error ?? ""), failed.error);
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

console.log("\nemail adapter");
{
  const previousKey = process.env.RESEND_API_KEY;
  const config = { to: ["sales@northwind.example"] };

  delete process.env.RESEND_API_KEY;
  const unconfigured = await deliverEmail({
    destinationName: "Sales inbox",
    payload: payload(),
    config,
    fetchImpl: fakeFetch({ status: 200 }).impl,
  });
  ok("says so when there is no mail transport rather than reporting success", !unconfigured.ok);
  t("and calls it a configuration failure", unconfigured.failure, "configuration");
  ok("and names the variable to set", /RESEND_API_KEY/.test(unconfigured.error ?? ""), unconfigured.error);
  ok(
    "and says the submission is still here",
    /still here/.test(unconfigured.error ?? ""),
    unconfigured.error,
  );

  process.env.RESEND_API_KEY = "re_test_key";
  const { impl, calls } = fakeFetch({ status: 200, body: '{"id":"abc"}' });
  const sent = await deliverEmail({
    destinationName: "Sales inbox",
    payload: payload(),
    config: { to: ["sales@northwind.example"] },
    fetchImpl: impl,
  });
  ok("sends when configured", sent.ok);

  const body = JSON.parse(String(calls[0].init.body));
  ok("puts the origin stamp in the subject", /Unverified/.test(body.subject), body.subject);
  ok("names the endpoint in the subject", /Contact form/.test(body.subject), body.subject);
  ok("sends both text and html", typeof body.text === "string" && typeof body.html === "string");
  t("replies go to the lead, not to us", body.reply_to, "test@endpointforms.com");
  ok("escapes html so a lead cannot inject markup", !body.html.includes("<script>"));
  const { impl: testImpl, calls: testCalls } = fakeFetch({ status: 200 });
  await deliverEmail({
    destinationName: "Sales inbox",
    payload: payload({ test: true }),
    config,
    fetchImpl: testImpl,
  });
  const testSubject = JSON.parse(String(testCalls[0].init.body)).subject;
  ok("marks a test delivery in the subject", /^\[Test\]/.test(testSubject), testSubject);

  const rejected = await deliverEmail({
    destinationName: "Sales inbox",
    payload: payload(),
    config,
    fetchImpl: fakeFetch({ status: 401, body: '{"message":"API key is invalid"}' }).impl,
  });
  ok("a rejected API key fails", !rejected.ok);
  t("and is a configuration failure, not something to retry forever", rejected.failure, "configuration");

  if (previousKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = previousKey;
}

// ---------------------------------------------------------------------------
// The sweep guard (#42)
// ---------------------------------------------------------------------------

console.log("\nsweep authorisation");
{
  const previous = process.env.CRON_SECRET;
  const ask = (headers: Record<string, string> = {}, method = "GET") =>
    new Request("https://endpointforms.test/api/v1/deliveries/sweep", { method, headers });

  // The failure mode of a misconfiguration has to be "nothing runs", never
  // "anyone can run it". An unguarded sweep is a free way for a stranger to
  // make our server issue outbound requests.
  delete process.env.CRON_SECRET;
  ok(
    "with no CRON_SECRET set, nothing is authorised — it does not fall open",
    !isAuthorisedSweep(ask({ authorization: "Bearer anything" })),
  );
  ok(
    "not even an empty bearer",
    !isAuthorisedSweep(ask({ authorization: "Bearer " })),
  );

  process.env.CRON_SECRET = "cron-secret-value";
  ok("the right secret is authorised", isAuthorisedSweep(ask({ authorization: "Bearer cron-secret-value" })));
  ok("the wrong secret is not", !isAuthorisedSweep(ask({ authorization: "Bearer nope" })));
  ok("no header at all is not", !isAuthorisedSweep(ask()));
  ok(
    "the secret without the Bearer prefix is not",
    !isAuthorisedSweep(ask({ authorization: "cron-secret-value" })),
  );
  ok(
    "a prefix of the secret is not — length is checked before the compare",
    !isAuthorisedSweep(ask({ authorization: "Bearer cron-secret-valu" })),
  );
  ok(
    "and neither is the secret with something appended",
    !isAuthorisedSweep(ask({ authorization: "Bearer cron-secret-valuex" })),
  );

  // Whitespace around the env var is a copy-paste artefact, not a different
  // secret. A deployment whose cron silently 401s because someone pasted a
  // trailing newline is a very quiet outage.
  process.env.CRON_SECRET = "  cron-secret-value  ";
  ok(
    "a secret pasted with surrounding whitespace still matches",
    isAuthorisedSweep(ask({ authorization: "Bearer cron-secret-value" })),
  );

  if (previous === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previous;
}

console.log("\nsweep responses");
{
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "cron-secret-value";
  const url = "https://endpointforms.test/api/v1/deliveries/sweep";

  const unauthorised = await handleSweep(new Request(url, { method: "GET" }));
  t("an unauthenticated sweep is a 401", unauthorised.status, 401);
  ok(
    "and challenges rather than 404ing",
    (unauthorised.headers.get("www-authenticate") ?? "").startsWith("Bearer"),
  );
  const body = (await unauthorised.json()) as { message: string };
  ok(
    "and does not reveal whether a secret is configured",
    !/CRON_SECRET is|not configured|no secret/i.test(body.message),
    body.message,
  );

  const wrongMethod = await handleSweep(
    new Request(url, { method: "PUT", headers: { authorization: "Bearer cron-secret-value" } }),
  );
  t("an unsupported verb is a 405", wrongMethod.status, 405);
  t("and says which verbs work", wrongMethod.headers.get("allow"), "GET, POST");

  // Vercel Cron issues GET. Refusing it would mean the schedule 405s forever
  // and the retry sweep silently never runs — the exact failure this route
  // exists to prevent, one layer up.
  ok(
    "GET is accepted, because that is what Vercel Cron sends",
    (await handleSweep(new Request(url, { method: "GET", headers: { authorization: "Bearer wrong" } }))).status === 401,
  );

  if (previous === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previous;
}

// ---------------------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
