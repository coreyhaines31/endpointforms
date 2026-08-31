/**
 * The hosted form renderer (#28) — everything that needs no database.
 *
 * The tests are written from "how does this lose a lead, or lie about one?"
 * rather than from the function list:
 *
 *   - **The retry cookie is the no-JavaScript path.** If it round-trips wrong,
 *     a visitor whose submission was refused gets an empty form back and most
 *     of them do not fill it in twice. So it is tested for what it carries, for
 *     what it refuses to carry, and specifically for dropping an oversized
 *     answer *whole* rather than truncating one — a shortened message is one
 *     somebody sends without noticing.
 *   - **Native constraints are checked for what must NOT be on a control.**
 *     `pattern` on a textarea and `required` on a checkbox group are both
 *     inert-or-wrong in a browser, and both put a rule in the DOM that a later
 *     reader believes.
 *   - **Every issue code has a sentence.** A blank error message is a visitor
 *     staring at a red box with nothing to do about it, and the compiler cannot
 *     catch an empty string.
 *   - **Theme values are checked for what they refuse.** They end up in a
 *     `style` attribute; anything that is not a hex literal must not survive.
 *
 * The end-to-end no-JavaScript submission — serve the page, serialise the form
 * the way a browser would, post it, confirm the row — needs a running server and
 * a database, so it runs only when `RENDER_TEST_BASE_URL` names one. It is the
 * single most important behaviour in this feature, so it is loud about being
 * skipped rather than quietly passing.
 *
 * No database, no network by default: `node --experimental-strip-types`.
 */

import { request as httpRequest } from "node:http";

import {
  autoCompleteFor,
  controlKind,
  inputMode,
  inputType,
  nativeConstraints,
} from "../src/lib/render/controls.ts";
import { decodeFlash, encodeFlash, flashCookie } from "../src/lib/render/flash.ts";
import { visitorMessage } from "../src/lib/render/messages.ts";
import { DEFAULT_THEME, readableInk, readTheme } from "../src/lib/render/theme.ts";
import type { SchemaField } from "../src/lib/schema/format.ts";
import type { IssueCode, ValidationIssue } from "../src/lib/schema/validate.ts";

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

/** A field, with the defaults `format.ts` would have applied. */
function field(partial: Partial<SchemaField> & { key: string; type: SchemaField["type"] }): SchemaField {
  return { label: partial.key, required: false, ...partial } as SchemaField;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function controlTests() {
  console.log("\ncontrols — a schema field as the browser control it becomes");

  t(
    "each type picks its control",
    (["text", "email", "phone", "number", "date", "textarea", "hidden"] as const).map((type) =>
      controlKind(field({ key: "k", type })),
    ),
    ["input", "input", "input", "input", "input", "textarea", "hidden"],
  );

  t(
    "each type picks its input type",
    (["text", "email", "phone", "number", "date"] as const).map((type) =>
      inputType(field({ key: "k", type })),
    ),
    ["text", "email", "tel", "number", "date"],
  );

  // The whole point of these two: a phone field that opens a QWERTY keyboard,
  // or an email a password manager will not fill, costs completions on paid
  // traffic. They are conversion settings that happen to also be accessibility.
  t("email gets the email keyboard", inputMode(field({ key: "email", type: "email" })), "email");
  t("phone gets the tel keyboard", inputMode(field({ key: "phone", type: "phone" })), "tel");
  t(
    "a whole-number field gets the numeric keyboard, not the decimal one",
    inputMode(field({ key: "qty", type: "number", validation: { step: 1 } })),
    "numeric",
  );
  t(
    "a number with no declared step keeps the decimal point",
    inputMode(field({ key: "price", type: "number" })),
    "decimal",
  );
  t("text has no input mode of its own", inputMode(field({ key: "k", type: "text" })), undefined);

  t("a known name gets its autofill token", autoCompleteFor(field({ key: "company", type: "text" })), "organization");
  t("punctuation and case do not hide a name", autoCompleteFor(field({ key: "Postal_Code", type: "text" })), "postal-code");
  t("the declared type is a fallback", autoCompleteFor(field({ key: "contact_1", type: "email" })), "email");
  // A wrong token is worse than none: the browser fills someone's street
  // address into a field asking what they need a quote for.
  t("an unrecognised name gets nothing", autoCompleteFor(field({ key: "widget_gauge", type: "text" })), undefined);

  const checkboxGroup = field({
    key: "finishes",
    type: "multi_select",
    required: true,
    options: [{ value: "a", label: "A" }],
  });
  t("a short multi-select is checkboxes", controlKind(checkboxGroup), "checkbox-group");
  // `required` on a checkbox means *this box*, so putting it on each one demands
  // every option be ticked. Only the server can express "choose at least one".
  t("a checkbox group never carries required", nativeConstraints(checkboxGroup).required, undefined);

  const long = field({
    key: "many",
    type: "multi_select",
    required: true,
    options: Array.from({ length: 40 }, (_, i) => ({ value: `v${i}`, label: `L${i}` })),
  });
  t("a long multi-select becomes a native multiple-select", controlKind(long), "multi-select");
  t("which can carry required", nativeConstraints(long).required, true);

  t(
    "a text field carries the constraints a browser enforces",
    nativeConstraints(
      field({
        key: "ref",
        type: "text",
        required: true,
        validation: { minLength: 3, maxLength: 12, pattern: "[A-Z]{3}" },
      }),
    ),
    { required: true, minLength: 3, maxLength: 12, pattern: "[A-Z]{3}" },
  );

  // `pattern` is not merely ignored on a textarea, it is invalid there. Emitting
  // it would advertise a rule nothing enforces.
  t(
    "pattern is never put on a textarea",
    nativeConstraints(field({ key: "note", type: "textarea", validation: { pattern: "x+" } })).pattern,
    undefined,
  );
  t(
    "nor on a number",
    nativeConstraints(field({ key: "n", type: "number", validation: { pattern: "\\d+" } })).pattern,
    undefined,
  );
  t(
    "a number carries its range and step",
    nativeConstraints(field({ key: "n", type: "number", validation: { min: 1, max: 10, step: 1 } })),
    { min: 1, max: 10, step: 1 },
  );
  // A numeric `min` on a date input is a timestamp somebody stored by mistake;
  // the browser ignores it and the DOM lies about the rule.
  t(
    "a date takes only string bounds",
    nativeConstraints(field({ key: "d", type: "date", validation: { min: 1764547200000, max: "2026-12-01" } })),
    { max: "2026-12-01" },
  );
}

// ---------------------------------------------------------------------------
// The retry cookie
// ---------------------------------------------------------------------------

function flashTests() {
  console.log("\nflash — carrying a rejected submission back to the form");

  const issues: ValidationIssue[] = [
    { field: "email", code: "invalid_email", severity: "error", message: "…" },
    { field: "finishes", code: "invalid_choice_count", severity: "error", message: "…" },
  ];
  const values = { name: "Priya Raman", email: "nope", finishes: ["a", "b", "c"] };
  const round = decodeFlash(encodeFlash(issues, values, ["name", "email", "finishes"]));

  t("errors survive as field/code pairs", round?.errors, [
    { field: "email", code: "invalid_email" },
    { field: "finishes", code: "invalid_choice_count" },
  ]);
  t("answers survive, including multi-valued ones", round?.values, values);
  t("nothing was dropped", round?.truncated, false);

  // The messages are deliberately absent: they are rebuilt at render time from
  // the code and the schema, so a hand-written cookie cannot put text on a page.
  ok(
    "no visitor-visible text travels in the cookie",
    !JSON.stringify(encodeFlash(issues, values, ["name"])).includes("invalid"),
  );

  const huge = { note: "x".repeat(8_000), name: "Priya" };
  const overflow = decodeFlash(encodeFlash(issues, huge, ["note", "name"]));
  t("an oversized answer is dropped whole, never shortened", overflow?.values, { name: "Priya" });
  t("and the visitor is told", overflow?.truncated, true);

  t("a junk cookie is ignored rather than trusted", decodeFlash("not-base64-json"), null);
  t("an absent cookie is not an error", decodeFlash(undefined), null);
  t(
    "a well-formed but wrong-shaped payload is ignored",
    decodeFlash(Buffer.from(JSON.stringify({ e: "oops" })).toString("base64url")),
    null,
  );

  const cookie = flashCookie("abc123", "VALUE", false);
  ok("the cookie is scoped to the one form", cookie.includes("Path=/f/abc123"), cookie);
  ok("and is not readable from script", cookie.includes("HttpOnly"), cookie);
  // Lax, not Strict: the redirect is a top-level GET after a POST, and Strict
  // would withhold the cookie on exactly that navigation.
  ok("and survives the redirect", cookie.includes("SameSite=Lax"), cookie);
  ok("and expires on its own", /Max-Age=\d+/.test(cookie), cookie);
  ok("Secure is opt-in, so http development still works", !cookie.includes("Secure"));
  ok("and is set over https", flashCookie("abc123", "V", true).includes("Secure"));
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const EVERY_CODE: IssueCode[] = [
  "missing_required",
  "unknown_field",
  "repeated_value",
  "unsupported_value",
  "not_an_option",
  "invalid_email",
  "invalid_phone",
  "invalid_number",
  "invalid_date",
  "invalid_choice_count",
  "too_short",
  "too_long",
  "pattern_mismatch",
  "out_of_range",
];

function messageTests() {
  console.log("\nmessages — what a visitor reads, not what a developer reads");

  const subject = field({ key: "email", type: "email", label: "Work email", required: true });
  const empty = EVERY_CODE.filter((code) => visitorMessage(code, subject).trim() === "");
  t("every issue code has a sentence", empty, []);

  t(
    "a missing text field asks for the thing, in lower case",
    visitorMessage("missing_required", field({ key: "name", type: "text", label: "Your name" })),
    "Enter your your name.",
  );
  ok(
    "an acronym keeps its capitals",
    visitorMessage("missing_required", field({ key: "vat", type: "text", label: "VAT number" })).includes(
      "VAT number",
    ),
  );
  t(
    "a missing choice asks you to choose",
    visitorMessage(
      "missing_required",
      field({ key: "m", type: "select", label: "Material", options: [{ value: "a", label: "A" }] }),
    ),
    "Choose an option for “Material”.",
  );
  t(
    "a count limit names the number",
    visitorMessage(
      "invalid_choice_count",
      field({
        key: "f",
        type: "multi_select",
        label: "Finishes",
        options: [{ value: "a", label: "A" }],
        validation: { maxSelected: 1 },
      }),
    ),
    "Choose no more than 1 option for “Finishes”.",
  );
  // The help text is the only place the form's author ever explains their
  // format, so it beats anything generic we could write.
  ok(
    "a format failure repeats the author's own explanation",
    visitorMessage(
      "pattern_mismatch",
      field({ key: "po", type: "text", label: "PO number", help: "Format: PO-123456" }),
    ).includes("Format: PO-123456"),
  );
  ok(
    "a range failure names the bound",
    visitorMessage(
      "out_of_range",
      field({ key: "q", type: "number", label: "Quantity", validation: { min: 1, max: 10 } }),
    ).includes("between 1 and 10"),
  );
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function themeTests() {
  console.log("\ntheme — read from stored JSON, and closed to anything else");

  t("a schema with no theme gets the default", readTheme({ fields: [] }), DEFAULT_THEME);
  t("so does a null row", readTheme(null), DEFAULT_THEME);
  t("and an array-shaped one", readTheme([{ key: "a" }]), DEFAULT_THEME);

  const themed = readTheme({
    fields: [],
    theme: { accent: "#1d4ed8", background: "#ffffff", radius: 12, font: "serif" },
  });
  t("an accent becomes a custom property", themed.vars["--form-accent"], "#1d4ed8");
  t("with readable ink chosen for it", themed.vars["--form-accent-ink"], "#ffffff");
  t("a background sets the page", themed.vars["--form-page"], "#ffffff");
  // One named colour means one ground; a card is what you get by naming two.
  t("and the controls follow it", themed.vars["--form-bg"], "#ffffff");
  t("a radius is expressed in pixels", themed.vars["--form-radius"], "12px");
  ok("a font resolves to a device stack", themed.fontFamily?.includes("Georgia") === true);
  ok("and never to a webfont", !JSON.stringify(themed).includes("--font-"));

  t(
    "a surface can be named separately",
    readTheme({ theme: { background: "#eeeeee", surface: "#ffffff" } }).vars["--form-bg"],
    "#ffffff",
  );

  // These land in a `style` attribute on a page we serve. Anything that is not
  // a hex literal is a way to write arbitrary CSS onto someone else's form.
  const hostile = readTheme({
    theme: { accent: "red; background:url(https://evil.example/x)", background: "var(--anything)" },
  });
  t("a non-hex colour does not survive", hostile.vars, {});
  t("an out-of-range radius does not survive", readTheme({ theme: { radius: 999 } }).vars, {});
  t("an unknown font name does not survive", readTheme({ theme: { font: "Comic Sans" } }).fontFamily, null);
  // Unknown properties are ignored rather than fatal: a row written by a newer
  // build must still render on an older one.
  t(
    "an unknown property is ignored, not fatal",
    readTheme({ theme: { accent: "#000000", somethingNew: true } }).vars["--form-accent"],
    "#000000",
  );

  t("black ink on a pale fill", readableInk("#c7f23c"), "#15140f");
  t("white ink on a dark fill", readableInk("#1d4ed8"), "#ffffff");
  t("shorthand hex is understood", readableInk("#fff"), "#15140f");
}

// ---------------------------------------------------------------------------
// The end-to-end no-JavaScript submission
// ---------------------------------------------------------------------------

/**
 * Serialises a form out of served HTML the way a browser does.
 *
 * Deliberately a from-scratch reader of the markup rather than a browser
 * driver: what it proves is that the *HTML alone* carries everything needed to
 * submit — every name, every value, every checked box, the action and the
 * method — with no script of any kind having run.
 */
type ParsedControl = {
  name: string;
  kind: "input" | "textarea" | "select";
  type: string;
  required: boolean;
  /** For a `<select>`: the first option a person could actually pick. */
  firstOption?: string;
  min?: string;
};

function serializeForm(html: string): {
  action: string;
  method: string;
  body: URLSearchParams;
  controls: ParsedControl[];
  /** Checkbox groups the legend declares required. See below for why. */
  requiredGroups: { name: string; firstValue: string }[];
} {
  const form = /<form\b([^>]*)>([\s\S]*?)<\/form>/i.exec(html);
  if (!form) throw new Error("no <form> in the page");

  const attr = (source: string, name: string) =>
    new RegExp(`\\b${name}="([^"]*)"`, "i").exec(source)?.[1] ?? "";

  const body = new URLSearchParams();
  const controls: ParsedControl[] = [];
  const requiredGroups: { name: string; firstValue: string }[] = [];
  const inner = form[2]!;

  for (const [, tag] of inner.matchAll(/<input\b([^>]*)>/gi)) {
    const name = attr(tag, "name");
    if (!name) continue;
    const type = (attr(tag, "type") || "text").toLowerCase();
    controls.push({ name, kind: "input", type, required: /\brequired\b/i.test(tag), min: attr(tag, "min") });
    if (type === "checkbox" || type === "radio") {
      if (!/\bchecked\b/i.test(tag)) continue;
      body.append(name, attr(tag, "value") || "on");
      continue;
    }
    body.append(name, decodeEntities(attr(tag, "value")));
  }

  for (const [, tag, text] of inner.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
    const name = attr(tag, "name");
    if (!name) continue;
    controls.push({ name, kind: "textarea", type: "textarea", required: /\brequired\b/i.test(tag) });
    body.append(name, decodeEntities(text!));
  }

  // A required checkbox group cannot say so in an attribute — ARIA has no
  // allowed one for `role="group"` — so the renderer states it as words in the
  // legend. Reading it back the same way is the honest test of whether the
  // markup published enough for a machine to fill the form in.
  for (const [, group] of inner.matchAll(/<fieldset\b[^>]*>([\s\S]*?)<\/fieldset>/gi)) {
    const legend = /<legend\b[^>]*>([\s\S]*?)<\/legend>/i.exec(group!)?.[1] ?? "";
    if (!/\(required\)/i.test(legend)) continue;
    const box = /<input\b([^>]*type="checkbox"[^>]*)>/i.exec(group!)?.[1];
    if (!box) continue;
    const name = attr(box, "name");
    if (name) requiredGroups.push({ name, firstValue: attr(box, "value") });
  }

  for (const [, tag, options] of inner.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const name = attr(tag, "name");
    if (!name) continue;
    let firstOption: string | undefined;
    for (const [, optionTag] of options!.matchAll(/<option\b([^>]*)>/gi)) {
      const value = attr(optionTag!, "value");
      if (value !== "" && firstOption === undefined) firstOption = value;
      if (/\bselected\b/i.test(optionTag!) && value !== "") body.append(name, value);
    }
    controls.push({ name, kind: "select", type: "select", required: /\brequired\b/i.test(tag), firstOption });
  }

  return {
    action: attr(form[1]!, "action"),
    method: (attr(form[1]!, "method") || "get").toUpperCase(),
    body,
    controls,
    requiredGroups,
  };
}

/**
 * Fills every control the markup declared required, using only what the markup
 * said about it. If the page has not published enough to be fillable — a type,
 * a set of options — this is where that shows up.
 */
function fillRequired(form: ReturnType<typeof serializeForm>): void {
  for (const group of form.requiredGroups) form.body.set(group.name, group.firstValue);

  for (const control of form.controls) {
    if (!control.required) continue;
    if (control.kind === "select") {
      if (control.firstOption !== undefined) form.body.set(control.name, control.firstOption);
      continue;
    }
    if (control.type === "checkbox") {
      form.body.set(control.name, "on");
      continue;
    }
    form.body.set(control.name, plausible(control));
  }
}

function plausible(control: ParsedControl): string {
  switch (control.type) {
    case "email":
      return "nadia@pellamgroup.example";
    case "tel":
      return "+1 555 019 9000";
    case "number":
      return control.min || "1";
    case "date":
      return control.min || "2027-01-04";
    default:
      return "No-Script Nadia";
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * One HTTP round trip, with the headers exactly as given.
 *
 * `fetch()` is not usable here: it silently drops `Sec-Fetch-Mode`, which is
 * the header the ingest path reads to decide whether the caller is a browser
 * that navigated (answer with a redirect) or a script (answer with JSON). A
 * test that cannot send it cannot check the behaviour that matters most.
 */
function raw(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port || 80,
        path: `${target.pathname}${target.search}`,
        method: init.method ?? "GET",
        headers: {
          ...(init.body === undefined
            ? {}
            : { "content-length": String(Buffer.byteLength(init.body)) }),
          ...init.headers,
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

async function liveTests() {
  const base = process.env.RENDER_TEST_BASE_URL;
  const formId = process.env.RENDER_TEST_FORM_ID;

  if (!base || !formId) {
    console.log(
      "\nSKIPPED — the no-JavaScript submission test needs a running server.\n" +
        "  RENDER_TEST_BASE_URL=http://localhost:3040 RENDER_TEST_FORM_ID=<publicId> npm run test:render",
    );
    return;
  }

  console.log(`\nno-JavaScript submission — ${base}/f/${formId}`);

  const page = await raw(`${base}/f/${formId}`, { headers: { accept: "text/html" } });
  const html = page.body;
  t("the form is served as complete HTML", page.status, 200);
  ok("with a real method=post form", /<form[^>]+method="post"/i.test(html), html.slice(0, 200));
  ok("that a search engine is told not to index", /name="robots"[^>]+noindex/i.test(html));

  const form = serializeForm(html);
  t("the browser would post it", form.method, "POST");
  ok("to the endpoint's own submit route", form.action.startsWith(`/f/${formId}`), form.action);
  ok("carrying the redirect the ingest path reads", form.body.has("_redirect"), [...form.body.keys()]);

  // Fill the form the way a person would, using only what the markup itself
  // published about each control — its type, its bounds, its options.
  ok("the markup declares which fields are required", form.controls.some((c) => c.required));
  fillRequired(form);

  const posted = await raw(String(new URL(form.action, base)), {
    method: form.method,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html",
      // Exactly what a browser sends on a plain form navigation, and what the
      // ingest path reads to decide between a redirect and a JSON body.
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
    },
    body: form.body.toString(),
  });

  ok("a submission with no script at all is accepted", posted.status === 303, {
    status: posted.status,
    body: posted.body.slice(0, 300),
  });
  const location = String(posted.headers.location ?? "");
  ok("and lands on a page, not a JSON blob", location.includes("/thanks"), location);

  const landed = await raw(String(new URL(location, base)), { headers: { accept: "text/html" } });
  t("and that page is served", landed.status, 200);
  ok("saying so in words", /been sent/i.test(landed.body));

  await liveErrorTests(base, formId, form);
}

/**
 * The other half of the no-JavaScript story: a refused submission.
 *
 * A visitor who is told nothing, or who is handed back an empty form, mostly
 * does not fill it in a second time. So this asserts all three things that have
 * to survive the redirect — that the page says what is wrong, that it says so
 * against the right field, and that what they typed is still in the boxes.
 */
async function liveErrorTests(
  base: string,
  formId: string,
  template: ReturnType<typeof serializeForm>,
): Promise<void> {
  const email = template.controls.find((c) => c.type === "email");
  if (!email) {
    console.log("  (no email field in this form; skipping the refusal round trip)");
    return;
  }

  const body = new URLSearchParams(template.body);
  const typed = "Something Worth Keeping";
  const text = template.controls.find((c) => c.type === "text" && c.required);
  if (text) body.set(text.name, typed);
  body.set(email.name, "definitely-not-an-address");

  const refused = await raw(String(new URL(template.action, base)), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html",
      "sec-fetch-mode": "navigate",
    },
    body: body.toString(),
  });

  t("a refusal is a redirect back to the form, not a dead end", refused.status, 303);
  const location = String(refused.headers.location ?? "");
  ok("which is the form's own URL", location.startsWith(`/f/${formId}?`), location);

  const setCookie = ([] as string[]).concat(refused.headers["set-cookie"] ?? []);
  const retry = setCookie.find((c) => c.startsWith(`ef_retry_${formId}=`));
  ok("carrying a retry cookie", retry !== undefined, setCookie);
  if (!retry) return;

  const back = await raw(String(new URL(location, base)), {
    headers: { accept: "text/html", cookie: retry.split(";")[0]! },
  });

  t("the form comes back", back.status, 200);
  ok("with the problem named in words", /Enter an email address/i.test(back.body), back.status);
  ok("in a live region a screen reader announces", /role="alert"/.test(back.body));
  // The plain HTML `autofocus` attribute, which a browser acts on with
  // scripting disabled. Without it a visitor lands at the top of the page with
  // no indication anything went wrong.
  ok("with focus sent to it", /autofocus/i.test(back.body));
  ok("the bad field marked invalid", /aria-invalid="true"/.test(back.body));
  if (text) {
    ok("and everything they typed still in the boxes", back.body.includes(typed));
  }

  // Nothing was written. A refusal that also stored the row would mean the
  // customer's inbox filling up with submissions their visitor never completed.
  const clean = await raw(`${base}/f/${formId}`, { headers: { accept: "text/html" } });
  ok("a plain reload of the form is clean again", !/role="alert"/.test(clean.body));
}

// ---------------------------------------------------------------------------

controlTests();
flashTests();
messageTests();
themeTests();
await liveTests();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
