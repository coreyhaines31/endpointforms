/**
 * Google Sheets as a destination (#67) — the OAuth half and the delivery half.
 *
 * No Google project, no network: every request goes to a fake `fetch` that
 * records it and answers however the test says. That is also how the claim
 * "this only ever talks to Google" is checked — the fake sees every URL.
 *
 * `node --experimental-strip-types tests/google-sheets.test.mts`. The database
 * side (the destination's health after a revoked grant, end to end through
 * dispatch) is in `tests/destinations-db.test.mts`.
 *
 * Written from the question "how does a lead go missing from somebody's sheet
 * without anyone being told?":
 *
 *   - a refresh token Google has invalidated, read as anything but `revoked`
 *   - a grant without the Sheets scope, accepted and failing on the first lead
 *   - the OAuth round trip completed in somebody else's browser
 */

import {
  exchangeCode,
  GOOGLE_SCOPES,
  GOOGLE_SHEETS_NOT_CONFIGURED,
  GOOGLE_TOKEN_ENDPOINT,
  googleAuthUrl,
  googleClient,
  googleRedirectUri,
  isGoogleSheetsConfigured,
  newNonce,
  openPendingConnection,
  refreshAccessToken,
  sealPendingConnection,
  SHEETS_SCOPE,
  type PendingConnection,
} from "../src/lib/destinations/google.ts";

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

type Call = { url: string; method: string; body: string; headers: Record<string, string> };

/**
 * A `fetch` that answers from a list of handlers, first match wins, and records
 * everything it was asked. An unmatched request is a 599 rather than a throw,
 * so a test that forgot a handler fails on an assertion it can read.
 */
function fakeGoogle(
  handlers: { match: (call: Call) => boolean; status: number; body: unknown }[],
) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ]),
      ),
    };
    calls.push(call);
    const handler = handlers.find((candidate) => candidate.match(call));
    if (!handler) return new Response("no handler", { status: 599 });
    const body = typeof handler.body === "string" ? handler.body : JSON.stringify(handler.body);
    return new Response(body, {
      status: handler.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const isToken = (call: Call) => call.url === GOOGLE_TOKEN_ENDPOINT;

/** An unsigned JWT with the claims we read. The signature is never checked. */
function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

function withEnv(values: Record<string, string | undefined>, run: () => Promise<void> | void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(run)
    .finally(restore);
}

const CLIENT = {
  GOOGLE_SHEETS_CLIENT_ID: "client-id.apps.googleusercontent.com",
  GOOGLE_SHEETS_CLIENT_SECRET: "client-secret-value",
};

// ---------------------------------------------------------------------------

async function configuration() {
  console.log("\nconfiguration");

  await withEnv({ GOOGLE_SHEETS_CLIENT_ID: undefined, GOOGLE_SHEETS_CLIENT_SECRET: undefined }, () => {
    t("no client without both variables", googleClient(), null);
    ok("and it says it is not configured", !isGoogleSheetsConfigured());
  });

  await withEnv({ ...CLIENT, GOOGLE_SHEETS_CLIENT_SECRET: "  " }, () => {
    ok("a blank secret is not a secret", !isGoogleSheetsConfigured());
  });

  await withEnv(CLIENT, () => {
    ok("configured with both", isGoogleSheetsConfigured());
  });

  await withEnv({ GOOGLE_SHEETS_REDIRECT_URI: undefined }, () => {
    t(
      "the callback is derived from the origin the person is on",
      googleRedirectUri("http://localhost:3000"),
      "http://localhost:3000/api/v1/integrations/google-sheets/callback",
    );
  });
  await withEnv({ GOOGLE_SHEETS_REDIRECT_URI: "https://app.example.com/cb" }, () => {
    t("and can be pinned for a proxy", googleRedirectUri("http://internal:3000"), "https://app.example.com/cb");
  });

  const url = new URL(
    googleAuthUrl({
      client: { clientId: "cid", clientSecret: "never-in-a-url" },
      redirectUri: "https://app.example.com/cb",
      state: "nonce-123",
      loginHint: "ops@example.com",
    }),
  );
  t("the consent screen is Google's", url.origin, "https://accounts.google.com");
  t("asks for a refresh token", url.searchParams.get("access_type"), "offline");
  // Without `prompt=consent` Google only issues a refresh token on the first
  // grant, so a reconnect would succeed and store nothing usable.
  t("every time, not only the first", url.searchParams.get("prompt"), "consent");
  t("carries the state", url.searchParams.get("state"), "nonce-123");
  t("asks for exactly the scopes we use", url.searchParams.get("scope"), GOOGLE_SCOPES.join(" "));
  ok("including the spreadsheets one", (url.searchParams.get("scope") ?? "").includes(SHEETS_SCOPE));
  t("prefills the account on a reconnect", url.searchParams.get("login_hint"), "ops@example.com");
  ok("and never carries the client secret", !url.toString().includes("never-in-a-url"));
}

// ---------------------------------------------------------------------------

async function codeExchange() {
  console.log("\ncode exchange");

  await withEnv({ GOOGLE_SHEETS_CLIENT_ID: undefined, GOOGLE_SHEETS_CLIENT_SECRET: undefined }, async () => {
    const google = fakeGoogle([]);
    const result = await exchangeCode({ code: "c", redirectUri: "https://x/cb", fetchImpl: google.impl });
    ok("refuses without a client", !result.ok);
    t("and makes no request", google.calls.length, 0);
  });

  await withEnv(CLIENT, async () => {
    const google = fakeGoogle([
      {
        match: isToken,
        status: 200,
        body: {
          access_token: "ya29.access",
          refresh_token: "1//refresh",
          scope: `openid ${SHEETS_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
          id_token: idToken({ email: "ops@dorsetmetal.example" }),
        },
      },
    ]);
    const result = await exchangeCode({
      code: "auth-code",
      redirectUri: "https://app.example.com/cb",
      fetchImpl: google.impl,
    });
    ok("a full grant succeeds", result.ok, result);
    if (result.ok) {
      t("with the refresh token", result.refreshToken, "1//refresh");
      t("and the account it belongs to", result.email, "ops@dorsetmetal.example");
    }
    t("one request", google.calls.length, 1);
    const sent = new URLSearchParams(google.calls[0]?.body ?? "");
    t("posted to the token endpoint", google.calls[0]?.url, GOOGLE_TOKEN_ENDPOINT);
    t("as an authorization_code grant", sent.get("grant_type"), "authorization_code");
    t("with the same redirect it was issued for", sent.get("redirect_uri"), "https://app.example.com/cb");

    // Google's consent screen lets the person untick a scope. A destination
    // made from that grant would fail on its first lead.
    const narrow = fakeGoogle([
      {
        match: isToken,
        status: 200,
        body: { access_token: "a", refresh_token: "r", scope: "openid email" },
      },
    ]);
    const refused = await exchangeCode({ code: "c", redirectUri: "https://x/cb", fetchImpl: narrow.impl });
    ok("a grant without the Sheets scope is refused", !refused.ok);
    ok(
      "and says which box to leave ticked",
      !refused.ok && /Google Sheets box/.test(refused.error),
      refused,
    );

    const noRefresh = fakeGoogle([
      { match: isToken, status: 200, body: { access_token: "a", scope: SHEETS_SCOPE } },
    ]);
    const short = await exchangeCode({ code: "c", redirectUri: "https://x/cb", fetchImpl: noRefresh.impl });
    ok("a grant with no refresh token is refused rather than dying in an hour", !short.ok, short);

    const badCode = fakeGoogle([
      { match: isToken, status: 400, body: { error: "invalid_grant" } },
    ]);
    const bad = await exchangeCode({ code: "c", redirectUri: "https://x/cb", fetchImpl: badCode.impl });
    ok("a used or expired code is refused", !bad.ok);
    ok("and names Google's reason", !bad.ok && bad.error.includes("invalid_grant"), bad);
  });
}

// ---------------------------------------------------------------------------

async function refresh() {
  console.log("\nrefreshing the token");

  await withEnv({ GOOGLE_SHEETS_CLIENT_ID: undefined, GOOGLE_SHEETS_CLIENT_SECRET: undefined }, async () => {
    const google = fakeGoogle([]);
    const result = await refreshAccessToken("1//refresh", { fetchImpl: google.impl });
    t("without a client it is a configuration failure", result.ok ? null : result.failure, "configuration");
    t("with the sentence for both readers", result.ok ? null : result.error, GOOGLE_SHEETS_NOT_CONFIGURED);
    t("and no request", google.calls.length, 0);
  });

  await withEnv(CLIENT, async () => {
    const good = fakeGoogle([{ match: isToken, status: 200, body: { access_token: "ya29.fresh" } }]);
    const fresh = await refreshAccessToken("1//refresh", { fetchImpl: good.impl });
    t("a live grant gives an access token", fresh.ok ? fresh.accessToken : fresh, "ya29.fresh");
    const sent = new URLSearchParams(good.calls[0]?.body ?? "");
    t("as a refresh_token grant", sent.get("grant_type"), "refresh_token");

    // Every way a refresh token dies comes back as this one answer.
    const revoked = fakeGoogle([
      {
        match: isToken,
        status: 400,
        body: { error: "invalid_grant", error_description: "Token has been expired or revoked." },
      },
    ]);
    const dead = await refreshAccessToken("1//refresh", { fetchImpl: revoked.impl });
    t("invalid_grant is revoked", dead.ok ? null : dead.failure, "revoked");
    t("with Google's status kept", dead.ok ? null : dead.responseStatus, 400);
    ok(
      "and Google's own words kept for the log",
      !dead.ok && (dead.responseBody ?? "").includes("expired or revoked"),
      dead,
    );

    // The control for the assertion above: a 400 that is *not* invalid_grant
    // must not be read as revoked, or every Google hiccup would tell the
    // customer to reconnect.
    const client = fakeGoogle([{ match: isToken, status: 401, body: { error: "invalid_client" } }]);
    const ours = await refreshAccessToken("1//refresh", { fetchImpl: client.impl });
    t("our own client being rejected is configuration, not revoked", ours.ok ? null : ours.failure, "configuration");
    ok(
      "and says it is not the customer's connection",
      !ours.ok && /not anything you connected/.test(ours.error),
      ours,
    );

    const down = fakeGoogle([{ match: isToken, status: 503, body: "unavailable" }]);
    const outage = await refreshAccessToken("1//refresh", { fetchImpl: down.impl });
    t("a Google outage is retryable", outage.ok ? null : outage.failure, "target_down");

    const throwing = (async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }) });
    }) as unknown as typeof fetch;
    const unreachable = await refreshAccessToken("1//refresh", { fetchImpl: throwing });
    t("an unreachable Google is network", unreachable.ok ? null : unreachable.failure, "network");
  });
}

// ---------------------------------------------------------------------------

async function roundTrip() {
  console.log("\nthe round trip through Google");

  const now = new Date("2026-10-01T12:00:00Z");
  const pending: PendingConnection = {
    slug: "acme",
    endpointPublicId: "ep_abc",
    destinationId: null,
    name: "Leads sheet",
    spreadsheetId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
    sheetName: "",
    nonce: newNonce(),
    expiresAt: now.getTime() + 600_000,
  };

  await withEnv({ AUTH_SECRET: "a-test-auth-secret-that-is-long", NODE_ENV: "test" }, () => {
    const sealed = sealPendingConnection(pending);
    ok("it seals", typeof sealed === "string" && sealed.includes("."));
    t("and opens with the matching nonce", openPendingConnection(sealed, pending.nonce, now), pending);

    // The attack `state` exists for: the callback reached with somebody
    // else's nonce. The cookie in this browser is not the one that started it.
    t("a different nonce opens nothing", openPendingConnection(sealed, newNonce(), now), null);
    t("no state opens nothing", openPendingConnection(sealed, null, now), null);
    t("no cookie opens nothing", openPendingConnection(null, pending.nonce, now), null);

    const [body, signature] = (sealed ?? ".").split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...pending, spreadsheetId: "attacker-sheet" }),
    ).toString("base64url");
    t("a rewritten body with the old signature opens nothing", openPendingConnection(`${forged}.${signature}`, pending.nonce, now), null);
    // The control: the untouched body with the same signature does open, so
    // the line above failed on the forgery and not on the splitting.
    ok("while the untouched body does", openPendingConnection(`${body}.${signature}`, pending.nonce, now) !== null);

    t(
      "an expired one opens nothing",
      openPendingConnection(sealed, pending.nonce, new Date(pending.expiresAt + 1)),
      null,
    );
  });

  await withEnv({ AUTH_SECRET: "a-different-secret-entirely-xx", NODE_ENV: "test" }, () => {
    const sealedElsewhere = (() => {
      const previous = process.env.AUTH_SECRET;
      process.env.AUTH_SECRET = "a-test-auth-secret-that-is-long";
      const value = sealPendingConnection(pending);
      process.env.AUTH_SECRET = previous;
      return value;
    })();
    t("a cookie signed under another key opens nothing", openPendingConnection(sealedElsewhere, pending.nonce, now), null);
  });

  await withEnv({ AUTH_SECRET: undefined, NODE_ENV: "production" }, () => {
    t("production with no AUTH_SECRET refuses to seal", sealPendingConnection(pending), null);
  });
}

// ---------------------------------------------------------------------------

async function main() {
  await configuration();
  await codeExchange();
  await refresh();
  await roundTrip();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

await main();
