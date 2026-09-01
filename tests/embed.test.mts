/**
 * Embed modes and parameter passthrough (#39).
 *
 * The tests are written from "how does this quietly lose a lead, or attribute
 * one to the wrong thing, or put words in somebody's mouth?" rather than from
 * the function list:
 *
 *   - **Prefill is attacker-controlled input.** Anyone who can put a link in
 *     front of a person controls every parameter on it. So the refusals are
 *     tested one at a time — hidden fields, reserved names, a choice that is
 *     not one of the choices — and the values that *are* accepted are checked
 *     for arriving byte-for-byte, because escaping them is React's job and
 *     mangling them here would only hide a mistake somewhere else.
 *   - **`ef_o` decides who receives a `postMessage`.** Everything that is not
 *     exactly an origin has to be refused, including the two that look like
 *     one: `*` and `null`.
 *   - **The empty case.** A form embedded on a page with no query string at all
 *     is the ordinary case, and "passthrough with nothing to pass" must not
 *     produce a stray `?`, a blank UTM, or a `_page_url` of `undefined`.
 *   - **The two lists that can drift.** `public/embed.js` names the click IDs
 *     it persists across pages, and `attribution.ts` names the ones the server
 *     recognises. Adding one to the server and not the script is a silent,
 *     partial feature, so it is a failing test instead.
 *
 * No database, no network, no DOM: `node --experimental-strip-types`.
 */

import { readFileSync } from "node:fs";

import { ATTRIBUTION_FIELD_KEYS } from "../src/lib/ingest/attribution.ts";
import {
  carriedParams,
  isAttributionParam,
  isControlParam,
  queryEntries,
  readEmbedContext,
  readOrigin,
  readPageUrl,
  withQuery,
} from "../src/lib/embed/params.ts";
import { prefillFromQuery } from "../src/lib/embed/prefill.ts";
import {
  cspDirectives,
  embedSnippets,
  formPageUrl,
  prefillExample,
  safeFormId,
} from "../src/lib/embed/snippets.ts";
import type { FormSchemaDocument, SchemaField } from "../src/lib/schema/format.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const okay = JSON.stringify(got) === JSON.stringify(want);
  if (okay) pass++;
  else fail++;
  console.log(`  ${okay ? "PASS" : "FAIL"}  ${name}`);
  if (!okay) {
    console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  }
};

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

function field(
  partial: Partial<SchemaField> & { key: string; type: SchemaField["type"] },
): SchemaField {
  return { label: partial.key, required: false, ...partial } as SchemaField;
}

function doc(...fields: SchemaField[]): FormSchemaDocument {
  return { fields } as FormSchemaDocument;
}

const ORIGIN = "https://acme.endpointforms.app";

// ---------------------------------------------------------------------------
// The embed context
// ---------------------------------------------------------------------------

function contextTests() {
  console.log("\nembed context — what a query string is allowed to assert");

  t(
    "no ef_embed means not embedded, whatever else is on the URL",
    readEmbedContext({ ef_o: "https://evil.example", ef_page: "https://evil.example/x" }),
    { mode: null, parentOrigin: null, pageUrl: null, instanceId: null },
  );

  t(
    "a known mode is read with its origin, page and instance",
    readEmbedContext({
      ef_embed: "inline",
      ef_o: "https://shop.example",
      ef_page: "https://shop.example/pricing?utm_source=google",
      ef_i: "i1-a3f9k2",
    }),
    {
      mode: "inline",
      parentOrigin: "https://shop.example",
      pageUrl: "https://shop.example/pricing?utm_source=google",
      instanceId: "i1-a3f9k2",
    },
  );

  t("an invented mode is not a mode", readEmbedContext({ ef_embed: "drawer" }).mode, null);

  t(
    "a repeated ef_o is nobody's origin",
    readEmbedContext({ ef_embed: "inline", ef_o: ["https://a.example", "https://b.example"] })
      .parentOrigin,
    null,
  );

  console.log("\n  the origin, which decides who receives a postMessage");

  // The two that look like origins and are not. `*` broadcasts the frame's
  // height to whatever page framed it; `null` is what an opaque origin
  // serialises to and would match a sandboxed attacker frame.
  for (const bad of ["*", "null", "", "   "]) {
    t(`${JSON.stringify(bad)} is refused`, readOrigin(bad), null);
  }

  t("javascript: is refused", readOrigin("javascript:alert(1)"), null);
  t("data: is refused", readOrigin("data:text/html,x"), null);
  t("file: is refused", readOrigin("file:///etc/passwd"), null);
  t("a bare hostname is not an origin", readOrigin("shop.example"), null);

  // The round trip has to be exact. `new URL(x).origin` would launder each of
  // these into a clean origin string, which is how a malformed value becomes a
  // valid-looking one.
  t("an origin with a path is refused", readOrigin("https://shop.example/pricing"), null);
  t("an origin with a query is refused", readOrigin("https://shop.example/?a=1"), null);
  t("a trailing slash is refused", readOrigin("https://shop.example/"), null);
  t("credentials are refused", readOrigin("https://user:pw@shop.example"), null);

  t("a plain origin survives", readOrigin("https://shop.example"), "https://shop.example");
  t("a port survives", readOrigin("http://localhost:3000"), "http://localhost:3000");

  console.log("\n  the page URL, which becomes a hidden field on the post");

  t("javascript: is refused", readPageUrl("javascript:alert(1)"), null);
  t("a relative path is refused", readPageUrl("/pricing"), null);
  t(
    "a normal page survives verbatim",
    readPageUrl("https://shop.example/pricing?utm_source=google&gclid=abc"),
    "https://shop.example/pricing?utm_source=google&gclid=abc",
  );
  t("2049 characters is too long", readPageUrl(`https://a.example/${"x".repeat(2049)}`), null);
}

// ---------------------------------------------------------------------------
// Passthrough
// ---------------------------------------------------------------------------

function carryTests() {
  console.log("\npassthrough — what survives form → submit → back to the form");

  // The ordinary case, and the one most likely to be got wrong by a `?` that
  // is appended unconditionally.
  t("nothing to carry produces no query string", carriedParams(new URLSearchParams()).toString(), "");
  t("and no stray ? on the action", withQuery("/f/abc/submit", new URLSearchParams()), "/f/abc/submit");

  t(
    "a page with parameters that are none of ours carries nothing",
    carriedParams(new URLSearchParams("page=2&sort=asc&q=widgets")).toString(),
    "",
  );

  t(
    "the embed parameters and the attribution parameters, and nothing else",
    carriedParams(
      new URLSearchParams(
        "utm_source=google&gclid=abc123&page=2&ef_embed=inline&ef_o=https%3A%2F%2Fshop.example&ef_i=i1-a&email=nope",
      ),
    ).toString(),
    "utm_source=google&gclid=abc123&ef_embed=inline&ef_o=https%3A%2F%2Fshop.example&ef_i=i1-a",
  );

  t(
    "a differently-spelled UTM is still a UTM",
    carriedParams(new URLSearchParams("utmSource=newsletter")).toString(),
    "utmSource=newsletter",
  );

  // The broken-hidden-field shape, at the URL level: a parameter that exists
  // and is empty must not travel, or it becomes a blank that beats nothing.
  t("an empty value is not carried", carriedParams(new URLSearchParams("gclid=")).toString(), "");

  t(
    "an absurd value is not carried",
    carriedParams(new URLSearchParams(`gclid=${"x".repeat(513)}`)).toString(),
    "",
  );

  t(
    "a repeated parameter carries its first spelling only",
    carriedParams(new URLSearchParams("utm_source=a&utm_source=b")).toString(),
    "utm_source=a",
  );

  t(
    "a page cannot smuggle in a second embed mode",
    carriedParams(new URLSearchParams("ef_embed=inline&ef_embed=popup")).toString(),
    "ef_embed=inline",
  );

  ok("ef_ names are control parameters", ["ef_embed", "ef_o", "ef_page", "ef_i"].every(isControlParam));
  ok("and so is the retry flag, which is one character", isControlParam("e"));
  ok("an ordinary field name is not", !isControlParam("email"));

  t(
    "Next's repeated-parameter shape becomes repeated pairs",
    queryEntries({ tag: ["a", "b"], one: "x", missing: undefined }),
    [
      ["tag", "a"],
      ["tag", "b"],
      ["one", "x"],
    ],
  );
}

// ---------------------------------------------------------------------------
// Prefill
// ---------------------------------------------------------------------------

function prefillTests() {
  console.log("\nprefill — a URL filling in somebody else's form");

  const schema = doc(
    field({ key: "name", type: "text" }),
    field({ key: "email", type: "email" }),
    field({ key: "note", type: "textarea" }),
  );

  t("no query string prefills nothing", prefillFromQuery(schema, {}), {
    values: {},
    keys: [],
    refused: [],
  });

  t(
    "a parameter that is not a field is not a refusal, it is just not a field",
    prefillFromQuery(schema, { page: "2", utm_source: "google" }),
    { values: {}, keys: [], refused: [] },
  );

  t(
    "matching names fill in, in schema order",
    prefillFromQuery(schema, { email: "ada@example.com", name: "Ada" }),
    { values: { name: "Ada", email: "ada@example.com" }, keys: ["name", "email"], refused: [] },
  );

  t("an empty value fills in nothing", prefillFromQuery(schema, { name: "" }).values, {});
  t("and neither does whitespace", prefillFromQuery(schema, { name: "   " }).values, {});

  console.log("\n  cross-site scripting: the value is data, and stays data");

  // The value is handed to React as a `defaultValue`, which is escaped into an
  // attribute. Nothing in the render path interpolates it into markup or into
  // script, so the correct behaviour here is to pass it through UNCHANGED —
  // stripping `<` would be a second, weaker defence that hides whether the
  // first one is working, and would corrupt a legitimate answer.
  const xss = '"><script>alert(1)</script>';
  t("a script tag survives as fifty-odd characters of text", prefillFromQuery(schema, { name: xss }).values, {
    name: xss,
  });
  t(
    "an event-handler attribute break-out likewise",
    prefillFromQuery(schema, { name: '" onfocus="alert(1)' }).values,
    { name: '" onfocus="alert(1)' },
  );
  t(
    "a javascript: URL in a text field is text",
    prefillFromQuery(schema, { note: "javascript:alert(1)" }).values,
    { note: "javascript:alert(1)" },
  );

  // A NUL would be stripped by `sanitizeString` on the way into the database
  // anyway; doing it here means the box shows what the row will hold.
  t(
    "a NUL byte is removed rather than carried into the row",
    prefillFromQuery(schema, { name: "Ada\u0000Lovelace" }).values,
    { name: "AdaLovelace" },
  );

  t(
    "an answer longer than a URL should carry is dropped whole, not truncated",
    prefillFromQuery(schema, { note: "x".repeat(513) }),
    { values: {}, keys: [], refused: [{ key: "note", reason: "too_long" }] },
  );
  t("512 is still accepted", Object.keys(prefillFromQuery(schema, { note: "x".repeat(512) }).values), [
    "note",
  ]);

  console.log("\n  hidden fields — the embedder's claim, wearing the submitter's signature");

  const withHidden = doc(
    field({ key: "email", type: "email" }),
    field({ key: "plan", type: "hidden" }),
    field({ key: "partner_id", type: "hidden" }),
  );

  t(
    "a hidden field is never prefilled from a URL",
    prefillFromQuery(withHidden, { plan: "enterprise", partner_id: "abc", email: "ada@example.com" }),
    {
      values: { email: "ada@example.com" },
      keys: ["email"],
      refused: [
        { key: "plan", reason: "hidden_field" },
        { key: "partner_id", reason: "hidden_field" },
      ],
    },
  );

  console.log("\n  reserved names — attribution and redirects are not the customer's fields");

  const withReserved = doc(
    field({ key: "email", type: "email" }),
    // A schema *can* declare these; `import-html.ts` drops them, but a
    // hand-written JSON document is not obliged to.
    field({ key: "gclid", type: "text" }),
    field({ key: "utm_source", type: "text" }),
    field({ key: "_redirect", type: "text" }),
    field({ key: "_idempotency_key", type: "text" }),
    field({ key: "ef_embed", type: "text" }),
  );

  const reserved = prefillFromQuery(withReserved, {
    email: "ada@example.com",
    gclid: "forged",
    utm_source: "forged",
    _redirect: "https://evil.example/harvest",
    _idempotency_key: "collide",
    ef_embed: "popup",
  });

  t("only the real field is filled in", reserved.values, { email: "ada@example.com" });
  t(
    "and every reserved name says why it was refused",
    reserved.refused,
    [
      { key: "gclid", reason: "reserved_name" },
      { key: "utm_source", reason: "reserved_name" },
      { key: "_redirect", reason: "reserved_name" },
      { key: "_idempotency_key", reason: "reserved_name" },
      // Checked before the reserved list, because it is ours rather than the
      // ingest path's — a form cannot be made to re-embed itself.
      { key: "ef_embed", reason: "control_parameter" },
    ],
  );

  // The one that matters most, said on its own: an open redirect on a page
  // whose entire purpose is to be linked to would be a phishing primitive.
  ok("_redirect is not settable from the query string", reserved.values._redirect === undefined);

  console.log("\n  choices — a closed vocabulary stays closed");

  const choices = doc(
    field({
      key: "size",
      type: "select",
      options: [
        { value: "s", label: "Small" },
        { value: "l", label: "Large" },
      ],
    }),
    field({
      key: "topics",
      type: "multi_select",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    }),
    field({ key: "consent", type: "checkbox" }),
  );

  t("a declared option is accepted", prefillFromQuery(choices, { size: "l" }).values, { size: "l" });
  t(
    "an undeclared one is refused rather than written",
    prefillFromQuery(choices, { size: "xl" }),
    { values: {}, keys: [], refused: [{ key: "size", reason: "not_an_option" }] },
  );
  t("several declared options are accepted", prefillFromQuery(choices, { topics: ["a", "b"] }).values, {
    topics: ["a", "b"],
  });
  t(
    "one invented option refuses the whole field rather than ticking the rest",
    prefillFromQuery(choices, { topics: ["a", "invented"] }),
    { values: {}, keys: [], refused: [{ key: "topics", reason: "not_an_option" }] },
  );

  t("a box can be ticked", prefillFromQuery(choices, { consent: "1" }).values, { consent: ["on"] });
  t("or explicitly left alone", prefillFromQuery(choices, { consent: "0" }), {
    values: {},
    keys: [],
    refused: [],
  });
  t(
    "and anything else is a refusal, not a tick",
    prefillFromQuery(choices, { consent: "maybe" }),
    { values: {}, keys: [], refused: [{ key: "consent", reason: "not_an_option" }] },
  );
}

// ---------------------------------------------------------------------------
// Snippets
// ---------------------------------------------------------------------------

function snippetTests() {
  console.log("\nsnippets — what somebody pastes, and what it tells them");

  const snippets = embedSnippets(ORIGIN, "abc123");
  t("four modes", snippets.map((entry) => entry.id), ["link", "iframe", "inline", "popup"]);

  for (const snippet of snippets) {
    ok(`${snippet.id}: names the render origin`, snippet.code.includes(ORIGIN), snippet.code);
    ok(`${snippet.id}: says what it does not do`, snippet.caveat.length > 40);
  }

  const byId = new Map(snippets.map((entry) => [entry.id, entry]));

  // The comment is the deliverable here as much as the markup is. Somebody
  // reading the page source six weeks later is the person this sentence is for.
  ok(
    "the inline snippet says the passthrough is the script's doing, not magic",
    /cannot read its parent/i.test(byId.get("inline")!.code),
    byId.get("inline")!.code,
  );
  ok(
    "the plain iframe admits it drops attribution",
    /cannot read the URL of the page it is on/i.test(byId.get("iframe")!.code),
    byId.get("iframe")!.code,
  );
  ok(
    "and admits it cannot resize",
    /height\n?\s*\*?\s*below is fixed|cannot tell your page how tall/i.test(byId.get("iframe")!.code),
    byId.get("iframe")!.code,
  );
  ok(
    "the plain iframe loads no script",
    !/<script/.test(byId.get("iframe")!.code),
    byId.get("iframe")!.code,
  );
  ok(
    "but still asks for the embedded layout, which needs none",
    byId.get("iframe")!.code.includes(`src="${ORIGIN}/f/abc123?ef_embed=inline"`),
    byId.get("iframe")!.code,
  );
  ok(
    "the link works before the script does",
    byId.get("link")!.code.includes(`<a href="${ORIGIN}/f/abc123"`),
    byId.get("link")!.code,
  );

  console.log("\n  the id lands in an HTML attribute, so it cannot be allowed to leave one");

  // Ids come from our own database and already match the public-id shape, so
  // this removes nothing in practice. It is here because these strings are
  // concatenated rather than rendered as React children: there is no escaping
  // in this path, so the value has to be one that cannot need any.
  t("a quote and a tag are stripped", safeFormId('a"><script>x</script>'), "ascriptxscript");
  t("a space is stripped", safeFormId("a b"), "ab");
  t("a legitimate id is untouched", safeFormId("aZ0_-"), "aZ0_-");

  const attack = '"><img src=x onerror=alert(1)>';
  const hostile = embedSnippets(ORIGIN, attack);
  const sanitized = embedSnippets(ORIGIN, safeFormId(attack));
  for (const [index, snippet] of hostile.entries()) {
    // Identical to the snippet the already-safe id produces: the id was
    // reduced before it was concatenated, so there is no context — attribute,
    // comment or script — it could have left.
    t(`${snippet.id}: the id is reduced before it is interpolated`, snippet.code, sanitized[index].code);
    ok(
      `${snippet.id}: and carries none of the attack's syntax`,
      !snippet.code.includes("src=x") && !snippet.code.includes("<img"),
      snippet.code,
    );
  }
  ok(
    "a reduced id can only be id characters",
    !/[^A-Za-z0-9_-]/.test(safeFormId(attack)),
    safeFormId(attack),
  );

  console.log("\n  prefill example and CSP");

  t(
    "the example uses this form's own field names",
    prefillExample(ORIGIN, "abc123", ["name", "email"]),
    `${ORIGIN}/f/abc123?name=Ada%20Lovelace&email=ada%40example.com`,
  );
  t("a form with no prefillable field gets no example", prefillExample(ORIGIN, "abc123", []), null);
  t("the page URL is the plain one", formPageUrl(ORIGIN, "abc123"), `${ORIGIN}/f/abc123`);

  t("both directives, no unsafe-inline", cspDirectives(ORIGIN), `script-src ${ORIGIN}; frame-src ${ORIGIN}`);
}

// ---------------------------------------------------------------------------
// The script that runs on somebody else's page
// ---------------------------------------------------------------------------

function scriptTests() {
  console.log("\npublic/embed.js — the half we do not control the page of");

  const source = readFileSync(new URL("../public/embed.js", import.meta.url), "utf8");

  // The banner comment states these rules in prose, so a substring search over
  // the whole file matches the documentation rather than the code. Same trap
  // `tests/rules.test.mts` names for `"use client"`: check the directive, not
  // the words about it.
  const body = source.replace(/^\/\*![\s\S]*?\*\//, "");

  // Source-level, for the same reason `tests/rules.test.mts` reads a component
  // as text: there is no DOM here, and these are properties of the file rather
  // than of a call. Each one is a rule the file would break silently.
  ok("it is an IIFE", /^\s*\/\*![\s\S]*?\*\/\s*\(function \(\) \{/.test(source), source.slice(0, 400));
  ok("it declares strict mode", body.includes('"use strict"'));

  // A global is how two customers' embeds, or an embed and the host page's own
  // code, start overwriting each other.
  ok("it assigns nothing to window", !/\bwindow\.[A-Za-z_$][\w$]*\s*=/.test(body));
  ok("no eval", !/\beval\s*\(/.test(body));
  ok("no new Function", !/new Function\s*\(/.test(body));

  // `postMessage(..., "*")` would broadcast to whatever framed the form, and
  // an unchecked `event.origin` would accept a message from anything.
  ok('no postMessage to "*"', !/postMessage\([^)]*["']\*["']/.test(body));
  ok("it checks the message origin", body.includes("event.origin !== base"));
  // Origin alone is not enough: a second form from our origin on the same page
  // passes it. The instance id is what makes one frame unable to move another.
  ok("and the instance id", body.includes("frames[data.id]"));

  // A `style` attribute or an injected <style> both need `style-src
  // 'unsafe-inline'`, which is exactly what a strict-CSP customer will not add.
  ok("no injected <style>", !/createElement\(\s*["']style["']\s*\)/.test(body));
  ok('no setAttribute("style")', !/\.setAttribute\(\s*["']style["']/.test(body));

  // Storage can throw on the property access alone in a locked-down browser.
  ok("every storage touch is guarded", guardedStorage(body), "sessionStorage outside try/catch");

  ok("it fails visibly rather than silently", body.includes("could not be loaded"));

  console.log("\n  the frame's own script, which is not in this file");

  const frame = readFileSync(
    new URL("../src/app/(forms)/f/[formId]/embed-frame.tsx", import.meta.url),
    "utf8",
  );
  const resize = frame.match(/const RESIZE_SCRIPT = `([^`]*)`/)?.[1] ?? "";
  ok("the resize script is readable from the source", resize.length > 0);

  // The regression this exists for, because it passes every test that only
  // watches a frame grow: `documentElement.scrollHeight` cannot return less
  // than the viewport, and inside an iframe the viewport IS the frame's current
  // height. A frame measured that way grows once and then never shrinks — so a
  // form that submits and becomes a four-line thank-you leaves several hundred
  // pixels of blank space on the customer's page at the one moment the embed
  // has just worked. Caught on screen, not in review.
  ok(
    "it does not measure with documentElement.scrollHeight",
    !/documentElement\.scrollHeight/.test(resize),
    resize,
  );
  ok("it measures the content box instead", resize.includes("getBoundingClientRect().height"));

  // Same rule as `public/embed.js`, from the other end of the channel.
  ok('it never posts to "*"', !/postMessage\([^)]*["\']\*["\']/.test(resize));
  ok("and takes its origin from an attribute, never from an interpolation", resize.includes('getAttribute("data-ef-origin")'));
  ok(
    "nothing is interpolated into it at all",
    !/\$\{/.test(resize),
    resize,
  );

  console.log("\n  the two click-ID lists that must not drift apart");

  const persisted = body.match(/var PERSIST =\s*\n?\s*"([^"]+)"/)?.[1]?.split(" ") ?? [];
  ok("the list is readable from the source", persisted.length > 0, persisted);

  for (const name of persisted) {
    ok(`${name} is a name the server recognises`, isAttributionParam(name));
  }

  // The other direction is the one that actually breaks: a click ID added to
  // `attribution.ts` and not to the script is carried within a page and lost
  // between pages, which nobody notices until a report is short.
  //
  // `_`-prefixed control fields and the page/referrer names are deliberately
  // not persisted — a referrer from an earlier page is not this page's.
  const notPersistable = new Set(["page_url", "pageurl", "referrer", "referer"]);
  const expected = ATTRIBUTION_FIELD_KEYS.filter(
    (key) => !key.startsWith("_") && !notPersistable.has(key),
  );
  t("and the script persists every one of them", expected.filter((key) => !persisted.includes(key)), []);
}

/**
 * Whether every `sessionStorage` reference sits inside a `try`.
 *
 * Crude on purpose — it counts braces from each `try {` — but it catches the
 * regression it is for: somebody adding a second storage read outside the
 * helpers, which throws outright in a browser configured to block site data and
 * takes the whole embed down with it.
 */
function guardedStorage(source: string): boolean {
  const ranges: [number, number][] = [];
  for (const match of source.matchAll(/try \{/g)) {
    let depth = 0;
    let i = match.index! + match[0].length - 1;
    for (; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    ranges.push([match.index!, i]);
  }

  for (const match of source.matchAll(/sessionStorage/g)) {
    const at = match.index!;
    if (!ranges.some(([start, end]) => at > start && at < end)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Against a running server
// ---------------------------------------------------------------------------

/**
 * The one assertion that cannot be made anywhere else.
 *
 * `node --experimental-strip-types` does not compile JSX, so the rendered HTML
 * of `FormView` is unreachable from a unit test — and "a prefill value is
 * escaped" is a claim about **HTML**, not about a string. Asserting it on the
 * value would prove only that this file agrees with itself.
 *
 * So it runs against a real response, and it is loud about being skipped rather
 * than quietly passing, the way `tests/form-render.test.mts` does:
 *
 *   RENDER_TEST_BASE_URL=http://localhost:3040 RENDER_TEST_FORM_ID=<publicId> \
 *     npm run test:embed
 */
async function liveTests() {
  const base = process.env.RENDER_TEST_BASE_URL;
  const formId = process.env.RENDER_TEST_FORM_ID;

  console.log("\nagainst a running server");
  if (!base || !formId) {
    console.log("  SKIPPED — set RENDER_TEST_BASE_URL and RENDER_TEST_FORM_ID to run these.");
    console.log("  They are the only place the *rendered HTML* is asserted; without them");
    console.log("  the cross-site-scripting check is a claim about a string, not a page.");
    console.log(`  RENDER_TEST_BASE_URL=http://localhost:3040 RENDER_TEST_FORM_ID=<publicId> npm run test:embed`);
    return;
  }

  const form = `${base}/f/${encodeURIComponent(formId)}`;
  const parent = "http://localhost:3041";

  // Which field to aim the payload at is read off the page rather than
  // hardcoded, so this works against whatever form somebody points it at.
  const plain = await text(form);
  const key = plain.match(/data-ef-field="([^"_][^"]*)"/)?.[1];
  ok("the form names at least one field of its own", key !== undefined, plain.slice(0, 200));
  if (!key) return;

  console.log("\n  not embedded — nothing is added, and no stray ?");
  t(
    "the action is the bare submit path",
    plain.match(/<form[^>]*action="([^"]*)"/)?.[1],
    `/f/${formId}/submit`,
  );
  ok("no page-url field", !plain.includes('name="_page_url"'), plain.match(/name="_[a-z_]*"/g));
  ok("and no embed stylesheet", !plain.includes("body{min-height:0!important}"));

  console.log("\n  prefill, rendered");
  const payload = "<script>alert(1)</script>";
  const embedded = await text(
    `${form}?ef_embed=inline&ef_o=${encodeURIComponent(parent)}&ef_i=i1-a3f9k2` +
      `&ef_page=${encodeURIComponent(`${parent}/pricing?utm_source=google&gclid=abc123`)}` +
      `&utm_source=google&gclid=abc123&${encodeURIComponent(key)}=${encodeURIComponent(payload)}`,
  );

  // The whole point. Not "the value was sanitised" — the value is intact, and
  // the *document* is not a document containing a script tag.
  ok("the payload does not become a script tag", !embedded.includes(payload), excerpt(embedded, "alert(1)"));
  ok("it becomes escaped text in the value", embedded.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  // `\\s*` and not `[^<]*`: the framework's own inline flight data carries the
  // value as a JS string with `\\u003c` for every `<`, which is correct escaping
  // and contains no tag. A looser pattern matches that and reports a hole that
  // is not there — a check measuring the wrong thing, which is this project's
  // recurring verification failure. An injected payload has nothing between the
  // `>` and the call.
  ok("no script element opens straight onto the payload", !/<script[^>]*>\s*alert/i.test(embedded), excerpt(embedded, "alert"));

  console.log("\n  the frame's own additions");
  ok(
    "the parent origin is an attribute, never interpolated into the script",
    embedded.includes(`data-ef-origin="${parent}"`),
  );
  ok('and the script never targets "*"', !/postMessage\([^)]*['"]\*['"]/.test(embedded));
  t(
    "the page the frame is on becomes the reserved control field",
    embedded.match(/name="_page_url" value="([^"]*)"/)?.[1],
    `${parent}/pricing?utm_source=google&amp;gclid=abc123`,
  );
  ok(
    "and the action carries the attribution onto the POST",
    /action="[^"]*utm_source=google[^"]*gclid=abc123/.test(embedded),
    embedded.match(/<form[^>]*action="[^"]*"/)?.[0],
  );

  console.log("\n  an origin we will not talk to");
  const starred = await text(`${form}?ef_embed=inline&ef_o=*&ef_i=i1-a3f9k2`);
  ok("the layout still applies", starred.includes("body{min-height:0!important}"));
  ok("but no handshake is offered at all", !starred.includes("data-ef-origin"), excerpt(starred, "data-ef"));

  console.log("\n  a refusal keeps the frame a frame");

  // An address the validator will refuse, the way `form-render.test.mts` does
  // it. An empty body is not the same test: it fails to parse at all and is
  // answered by the ingest path with a 422, never reaching the retry redirect.
  const emailKey = plain.match(/<input[^>]*type="email"[^>]*name="([^"]+)"/)?.[1]
    ?? plain.match(/<input[^>]*name="([^"]+)"[^>]*type="email"/)?.[1];
  if (!emailKey) {
    console.log("  (no email field in this form; skipping the refusal round trip)");
    return;
  }

  const action = `${form}/submit?ef_embed=inline&ef_o=${encodeURIComponent(parent)}&ef_i=i1-a3f9k2&utm_source=google`;
  const refused = await fetch(action, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: new URLSearchParams({ [emailKey]: "definitely-not-an-address" }).toString(),
  });
  const location = refused.headers.get("location") ?? "";
  t("it is a 303 back to the form", refused.status, 303);
  ok("carrying the embed context", location.includes("ef_embed=inline") && location.includes("ef_i=i1-a3f9k2"));
  ok("and the attribution", location.includes("utm_source=google"), location);
  ok("and the retry flag", location.includes("e=1"), location);
}

async function text(url: string): Promise<string> {
  const response = await fetch(url, { headers: { accept: "text/html" } });
  return response.text();
}

/** A window around a needle, so a failure prints the offending markup. */
function excerpt(haystack: string, needle: string): string {
  const at = haystack.indexOf(needle);
  return at === -1 ? "(not present)" : haystack.slice(Math.max(0, at - 120), at + 120);
}

// ---------------------------------------------------------------------------

contextTests();
carryTests();
prefillTests();
snippetTests();
scriptTests();
await liveTests();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
