/**
 * Origin — provenance on every submission (#30).
 *
 * The decision function is pure, so these tests are the experiment's control
 * group: real browser header sets on one side, forgeries on the other, and the
 * awkward middle — a person with JavaScript off, an ancient browser, a corporate
 * proxy — asserted explicitly, because those are the cases where being wrong
 * costs a customer a real lead.
 *
 * The header sets below are transcribed from actual requests, not invented.
 * Where one was captured during the write-up it is cited in
 * `docs/23-origin-findings.md`.
 *
 * No database and no server: `node --experimental-strip-types tests/origin.test.mts`.
 */

import {
  decideOrigin,
  HUMAN_THRESHOLD,
  mintOriginToken,
  ORIGIN_TOKEN_MAX_AGE_MS,
  verifyOriginToken,
  type OriginDecision,
  type OriginSignalCode,
} from "../src/lib/origin/index.ts";

process.env.ORIGIN_TOKEN_SECRET = "origin-test-secret";

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
// Header sets
// ---------------------------------------------------------------------------

const ENDPOINT = "ep_test123";
const NOW = 1_800_000_000_000;

/** Chrome 128 on macOS, a plain `<form method="post">` navigating cross-origin. */
const CHROME_FORM_POST = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-encoding": "gzip, deflate, br, zstd",
  "accept-language": "en-US,en;q=0.9",
  "content-type": "application/x-www-form-urlencoded",
  origin: "https://acme.example",
  referer: "https://acme.example/contact",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "cross-site",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};

/** The same page submitting through `fetch()` instead. */
const CHROME_FETCH = {
  accept: "application/json",
  "accept-encoding": "gzip, deflate, br, zstd",
  "accept-language": "en-US,en;q=0.9",
  "content-type": "application/json",
  origin: "https://acme.example",
  referer: "https://acme.example/contact",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "cross-site",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};

/** Safari 17 on an iPhone. Sends no `zstd`, and trims Referer more aggressively. */
const SAFARI_IOS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "en-GB,en;q=0.9",
  origin: "https://acme.example",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
};

/** Firefox with `privacy.resistFingerprinting` on — a hardened privacy setup. */
const FIREFOX_RFP = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "en-US,en;q=0.5",
  origin: "https://acme.example",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "same-origin",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0",
};

/** IE 11. No Sec-Fetch headers exist in this browser's world at all. */
const IE11 = {
  accept: "text/html, application/xhtml+xml, */*",
  "accept-encoding": "gzip, deflate",
  "accept-language": "en-US",
  referer: "https://acme.example/contact",
  "user-agent": "Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko",
};

/** A hostile middlebox: Sec-Fetch stripped, Origin and Referer removed. */
const STRIPPING_PROXY = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
};

const CURL = { accept: "*/*", "user-agent": "curl/8.7.1" };

const PYTHON_REQUESTS = {
  accept: "*/*",
  "accept-encoding": "gzip, deflate",
  "user-agent": "python-requests/2.32.3",
};

/** The commodity form stuffer: a copied Chrome UA and nothing else. */
const LAZY_SPOOFER = {
  "content-type": "application/x-www-form-urlencoded",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

/** Half-remembered Sec-Fetch: a navigation that claims to want an empty body. */
const INCOHERENT_FETCH_METADATA = {
  ...CHROME_FORM_POST,
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "navigate",
};

/** Every header from a real Chrome POST, replayed by a script. */
const FULL_FORGERY = { ...CHROME_FORM_POST };

function headers(record: Record<string, string>): Headers {
  return new Headers(record);
}

function decide(
  record: Record<string, string>,
  extra: { token?: string | null; now?: number } = {},
): OriginDecision {
  return decideOrigin({
    surface: "form",
    headers: headers(record),
    endpointPublicId: ENDPOINT,
    token: extra.token ?? null,
    now: extra.now ?? NOW,
  });
}

function reasonFor(decision: OriginDecision, code: OriginSignalCode) {
  return decision.reasons.find((r) => r.code === code);
}

// ---------------------------------------------------------------------------

function realBrowsers() {
  console.log("\nreal browsers — the people whose leads we must not quarantine");

  t("Chrome form navigation is Human", decide(CHROME_FORM_POST).origin, "human");
  t("Chrome fetch() is Human", decide(CHROME_FETCH).origin, "human");
  t("Safari on iOS is Human", decide(SAFARI_IOS).origin, "human");
  t("Firefox with resistFingerprinting is Human", decide(FIREFOX_RFP).origin, "human");
  t("IE 11, with no Sec-Fetch headers in existence, is Human", decide(IE11).origin, "human");
  t(
    "a proxy that strips Sec-Fetch, Origin and Referer still leaves Human",
    decide(STRIPPING_PROXY).origin,
    "human",
  );

  // The margin matters more than the verdict: the proxy case is the one that
  // gets closest to the bar, and how close is the false-positive risk.
  const proxy = decide(STRIPPING_PROXY);
  ok(
    `stripping proxy clears the bar by ${proxy.score - HUMAN_THRESHOLD}`,
    proxy.score >= HUMAN_THRESHOLD,
    proxy,
  );
}

function javascriptOff() {
  console.log("\nJavaScript off — absence of the token is a signal, never a verdict");

  const withJs = decide(CHROME_FORM_POST, { token: mintOriginToken(ENDPOINT, NOW - 30_000) });
  const withoutJs = decide(CHROME_FORM_POST);

  t("with the token: Human", withJs.origin, "human");
  t("without the token: still Human", withoutJs.origin, "human");
  t("a missing token is scored zero", reasonFor(withoutJs, "client_token")?.weight, 0);
  t(
    "a missing token points neither way",
    reasonFor(withoutJs, "client_token")?.direction,
    "neither",
  );
  ok("the token only ever adds", withJs.score > withoutJs.score, {
    withJs: withJs.score,
    withoutJs: withoutJs.score,
  });

  // The whole point of the zero: no otherwise-Human submission is ever flipped
  // by JavaScript being off. Asserted on every genuine browser set, not one.
  for (const [name, set] of [
    ["Chrome", CHROME_FORM_POST],
    ["Chrome fetch", CHROME_FETCH],
    ["Safari iOS", SAFARI_IOS],
    ["Firefox RFP", FIREFOX_RFP],
    ["IE 11", IE11],
    ["stripping proxy", STRIPPING_PROXY],
  ] as const) {
    t(`${name} is Human with JavaScript disabled`, decide(set).origin, "human");
  }
}

function selfDeclaringSoftware() {
  console.log("\nsoftware that says what it is");

  t("curl is Unverified", decide(CURL).origin, "unverified");
  t("python-requests is Unverified", decide(PYTHON_REQUESTS).origin, "unverified");
  t(
    "the reason names the library",
    /curl/.test(reasonFor(decide(CURL), "user_agent")?.note ?? ""),
    true,
  );

  // The declaration overrides the arithmetic. A caller that copies a complete
  // browser header set but leaves `curl` in its User-Agent has still told us.
  const curlWithBrowserHeaders = decide({ ...CHROME_FORM_POST, "user-agent": "curl/8.7.1" });
  t(
    "a named HTTP client is Unverified even with a perfect header set",
    curlWithBrowserHeaders.origin,
    "unverified",
  );
  ok(
    "and it would otherwise have scored above the bar",
    curlWithBrowserHeaders.score + 6 >= HUMAN_THRESHOLD,
    curlWithBrowserHeaders,
  );

  t("no User-Agent at all is Unverified", decide({ accept: "*/*" }).origin, "unverified");
  t(
    "headless Chrome is Unverified",
    decide({ ...CHROME_FORM_POST, "user-agent": `${CHROME_FORM_POST["user-agent"]} HeadlessChrome/128.0.0.0` })
      .origin,
    "unverified",
  );
}

function forgeries() {
  console.log("\nforgeries — how much work does passing actually take?");

  t("a copied User-Agent and nothing else is Unverified", decide(LAZY_SPOOFER).origin, "unverified");

  // Like for like: the same request with Sec-Fetch set wrongly, versus with it
  // absent. Getting the set half-right has to cost more than omitting it, or a
  // forger is better off guessing than abstaining.
  const withoutFetchMetadata = { ...CHROME_FORM_POST } as Record<string, string>;
  delete withoutFetchMetadata["sec-fetch-dest"];
  delete withoutFetchMetadata["sec-fetch-mode"];
  delete withoutFetchMetadata["sec-fetch-site"];
  t(
    "incoherent Sec-Fetch headers score worse than absent ones",
    decide(INCOHERENT_FETCH_METADATA).score < decide(withoutFetchMetadata).score,
    true,
  );

  // The finding this whole issue exists to establish. Copying a genuine browser
  // header set verbatim produces the Human stamp, because at this layer there
  // is nothing left to tell them apart. This test asserts the failure so that
  // nobody later reads a green suite as evidence the mechanism is airtight.
  t(
    "RISK 1: a verbatim replay of a real browser header set is stamped Human",
    decide(FULL_FORGERY).origin,
    "human",
  );
  t(
    "RISK 1: and a fetched-then-replayed token raises its score further",
    decide(FULL_FORGERY, { token: mintOriginToken(ENDPOINT, NOW - 5_000) }).origin,
    "human",
  );

  // Partial forgeries are where the mechanism does earn its keep.
  t(
    "Origin and Referer naming different sites is Unverified",
    decide({ ...LAZY_SPOOFER, origin: "https://attacker.example", referer: "https://acme.example/x" })
      .origin,
    "unverified",
  );
}

function tokens() {
  console.log("\nthe client token");

  const fresh = mintOriginToken(ENDPOINT, NOW - 10_000);

  t("a fresh token verifies", verifyOriginToken(fresh, ENDPOINT, NOW).status, "valid");
  t("its age is measured", verifyOriginToken(fresh, ENDPOINT, NOW).ageMs, 10_000);
  t("absent is its own status", verifyOriginToken(null, ENDPOINT, NOW).status, "absent");
  t("empty is absent, not malformed", verifyOriginToken("   ", ENDPOINT, NOW).status, "absent");
  t("gibberish is malformed", verifyOriginToken("nonsense", ENDPOINT, NOW).status, "malformed");
  t(
    "a wrong version is malformed",
    verifyOriginToken(fresh.replace(/^eo1/, "eo9"), ENDPOINT, NOW).status,
    "malformed",
  );
  t(
    "an altered signature fails",
    verifyOriginToken(`${fresh.slice(0, -1)}${fresh.endsWith("A") ? "B" : "A"}`, ENDPOINT, NOW)
      .status,
    "bad_signature",
  );
  t(
    "an altered timestamp fails the signature, not the clock",
    verifyOriginToken(
      (() => {
        const parts = fresh.split(".");
        parts[2] = (NOW - 1000).toString(36);
        return parts.join(".");
      })(),
      ENDPOINT,
      NOW,
    ).status,
    "bad_signature",
  );
  t(
    "a token minted for another endpoint is rejected by name",
    verifyOriginToken(mintOriginToken("ep_other", NOW - 1000), ENDPOINT, NOW).status,
    "endpoint_mismatch",
  );
  t(
    "an old token expires",
    verifyOriginToken(fresh, ENDPOINT, NOW + ORIGIN_TOKEN_MAX_AGE_MS + 1).status,
    "expired",
  );
  t(
    "a token from the future is refused",
    verifyOriginToken(mintOriginToken(ENDPOINT, NOW + 600_000), ENDPOINT, NOW).status,
    "not_yet_valid",
  );

  // A token that is present and wrong is evidence *against*, unlike one that is
  // simply missing.
  const withBadToken = decide(LAZY_SPOOFER, { token: "eo1.ep_test123.abc.def.ghi" });
  ok(
    "a fabricated token counts against the submission",
    (reasonFor(withBadToken, "client_token")?.weight ?? 0) < 0,
    withBadToken,
  );

  // A token minted for a different endpoint counts against the submission, but
  // deliberately does not overturn an otherwise coherent browser session. The
  // realistic cause is a customer with two forms on one page wiring the hidden
  // inputs up the wrong way round, and quarantining a real lead over their
  // markup mistake is the expensive kind of wrong. It is recorded either way.
  const clean = decide(CHROME_FORM_POST);
  const stolen = decide(CHROME_FORM_POST, { token: mintOriginToken("ep_other", NOW - 1000) });
  t("a token from another form is recorded", reasonFor(stolen, "client_token")?.direction, "software");
  ok("and lowers the score", stolen.score < clean.score, { stolen: stolen.score, clean: clean.score });
  t("but a real browser session survives it", stolen.origin, "human");

  // On a request that was already marginal, the same token is decisive.
  const marginal = decide(STRIPPING_PROXY, { token: mintOriginToken("ep_other", NOW - 1000) });
  t("on a marginal request the same token is decisive", marginal.origin, "unverified");

  // The token is also accepted from a header, which is what a `fetch()` caller
  // that cannot add a field will use.
  const viaHeader = decideOrigin({
    surface: "form",
    headers: headers({ ...CHROME_FETCH, "x-origin-token": mintOriginToken(ENDPOINT, NOW - 4000) }),
    endpointPublicId: ENDPOINT,
    token: null,
    now: NOW,
  });
  t("the header form is not read by decide() itself", reasonFor(viaHeader, "client_token")?.observed, "none");
}

function dwell() {
  console.log("\ndwell time — recorded, and weighted lightly on purpose");

  const instant = decide(CHROME_FORM_POST, { token: mintOriginToken(ENDPOINT, NOW - 50) });
  const considered = decide(CHROME_FORM_POST, { token: mintOriginToken(ENDPOINT, NOW - 45_000) });

  t("a 50ms fill is noted as fast", reasonFor(instant, "dwell_time")?.direction, "software");
  ok("but does not on its own condemn", instant.origin === "human", instant);
  t("a 45s fill is recorded at zero", reasonFor(considered, "dwell_time")?.weight, 0);
  t("no token means no dwell reason", reasonFor(decide(CHROME_FORM_POST), "dwell_time"), undefined);
}

function manifestSurface() {
  console.log("\nthe manifest surface — categorical, not evidential");

  const agent = decideOrigin({
    surface: "manifest",
    headers: headers({ "user-agent": "acme-agent/1.2 (+https://acme.example/bot)" }),
    endpointPublicId: ENDPOINT,
    agentDeclaration: "acme-agent/1.2",
    now: NOW,
  });
  t("the manifest surface is Agent", agent.origin, "agent");
  t("the declaration is recorded", reasonFor(agent, "declared_agent")?.observed, "acme-agent/1.2");

  // Agent does not mean trusted, and the reasons must not imply it does.
  const anonymous = decideOrigin({
    surface: "manifest",
    headers: headers({}),
    endpointPublicId: ENDPOINT,
    now: NOW,
  });
  t("an agent that names nothing is still Agent", anonymous.origin, "agent");

  // A caller cannot talk its way onto the manifest surface from the form one.
  // The surface is decided by the route, never read from the request.
  const pretender = decideOrigin({
    surface: "form",
    headers: headers({ ...CURL, "x-surface": "manifest", "user-agent": "claude-agent/1.0" }),
    endpointPublicId: ENDPOINT,
    agentDeclaration: "claude-agent/1.0",
    now: NOW,
  });
  t(
    "declaring itself an agent on the form surface does not grant Agent",
    pretender.origin,
    "unverified",
  );

  // A browser header set on the manifest surface is still Agent: the surface
  // wins, and a browser has no reason to be there.
  const browserish = decideOrigin({
    surface: "manifest",
    headers: headers(CHROME_FORM_POST),
    endpointPublicId: ENDPOINT,
    now: NOW,
  });
  t("browser headers on the manifest surface are still Agent", browserish.origin, "agent");
}

function reasonsAreAnswerable() {
  console.log("\nthe reasons — 'why is this Unverified?' has to be answerable from the row");

  for (const [name, decision] of [
    ["Chrome", decide(CHROME_FORM_POST)],
    ["curl", decide(CURL)],
    ["lazy spoofer", decide(LAZY_SPOOFER)],
  ] as const) {
    ok(`${name}: every reason has a sentence`, decision.reasons.every((r) => r.note.length > 10));
    ok(
      `${name}: every reason says what was observed`,
      decision.reasons.every((r) => r.observed.length > 0),
    );
    ok(
      `${name}: the weights sum to the stored score`,
      decision.reasons.reduce((sum, r) => sum + r.weight, 0) === decision.score,
      decision,
    );
    ok(
      `${name}: the threshold is recorded in the row`,
      decision.reasons.some((r) => r.code === "threshold"),
    );
  }

  // Signals that pointed nowhere are still recorded. A reader must be able to
  // tell "we looked and it said nothing" from "we never looked".
  const chrome = decide(CHROME_FORM_POST);
  const codes = chrome.reasons.map((r) => r.code);
  for (const code of [
    "surface",
    "user_agent",
    "fetch_metadata",
    "accept",
    "accept_language",
    "accept_encoding",
    "origin_referer",
    "client_token",
    "threshold",
  ] as const) {
    ok(`${code} is always recorded`, codes.includes(code));
  }

  // Nothing in a reason may accuse. The word this product does not use.
  const everything = [
    decide(CURL),
    decide(LAZY_SPOOFER),
    decide(PYTHON_REQUESTS),
    decide(CHROME_FORM_POST),
  ];
  const text = JSON.stringify(everything).toLowerCase();
  ok("no reason calls anyone a bot", !/\bbot\b/.test(text));
  ok("no reason says 'suspected'", !text.includes("suspected"));
  ok("no reason says 'spam'", !text.includes("spam"));
}

function determinism() {
  console.log("\ndeterminism — the same request always gets the same stamp");

  const a = decide(CHROME_FORM_POST, { token: mintOriginToken(ENDPOINT, NOW - 1000) });
  const b = decide(CHROME_FORM_POST, { token: mintOriginToken(ENDPOINT, NOW - 1000) });
  t("two identical requests agree", a.origin, b.origin);
  t("and score identically", a.score, b.score);

  // Header casing is not meaningful, and `Headers` normalises it. Asserted so
  // that a future refactor reading a raw record instead cannot regress it.
  const upper: Record<string, string> = {};
  for (const [k, v] of Object.entries(CHROME_FORM_POST)) upper[k.toUpperCase()] = v;
  t("header casing does not change the verdict", decide(upper).score, decide(CHROME_FORM_POST).score);
}

function main() {
  console.log("origin decision tests");
  realBrowsers();
  javascriptOff();
  selfDeclaringSoftware();
  forgeries();
  tokens();
  dwell();
  manifestSurface();
  reasonsAreAnswerable();
  determinism();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
