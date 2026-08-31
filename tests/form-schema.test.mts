/**
 * The optional form schema (#51) — everything that needs no database.
 *
 * The tests are written from "how does this lose a lead, or lie about one?"
 * rather than from the function list:
 *
 *   - HTML import is run against markup with the faults real pages have, not
 *     against a clean example. Every fault has its own assertion, because each
 *     one silently produces a *plausible* wrong schema, and a plausible wrong
 *     schema is worse than a failed import.
 *   - Validation is checked hardest on the cases that must NOT be errors. A
 *     blank optional field and an unrecognised extra field are the two most
 *     common things a real form posts, and treating either as a failure is how
 *     declaring a schema starts dropping traffic.
 *   - Inference is checked for what it refuses to claim: `required` on
 *     anything it has ever seen blank, options it has not observed, a number
 *     where a leading zero says otherwise.
 *
 * No database, no network: `node --experimental-strip-types`.
 */

import {
  emptyDocument,
  parseSchemaDocument,
  parseSchemaJson,
  readStoredDocument,
  SCHEMA_FORMAT_VERSION,
  serializeSchemaDocument,
  type FormSchemaDocument,
} from "../src/lib/schema/format.ts";
import { importSchemaFromHtml } from "../src/lib/schema/import-html.ts";
import { isPrivateHost } from "../src/lib/schema/import-url.ts";
import { inferSchema } from "../src/lib/schema/infer.ts";
import { isReservedFieldName } from "../src/lib/schema/reserved.ts";
import { validateSubmission } from "../src/lib/schema/validate.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
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
// The format
// ---------------------------------------------------------------------------

function formatTests() {
  console.log("\nformat");

  const declared: FormSchemaDocument = {
    formatVersion: 1,
    name: "Contact",
    fields: [
      { key: "email", label: "Work email", type: "email", required: true },
      {
        key: "budget",
        label: "Budget",
        type: "select",
        required: false,
        options: [
          { value: "small", label: "Under $5k" },
          { value: "large", label: "Over $5k" },
        ],
      },
      {
        key: "note",
        label: "Note",
        type: "textarea",
        required: false,
        validation: { maxLength: 500 },
      },
    ],
  };

  const parsed = parseSchemaDocument(declared);
  ok("a declared document parses", parsed.ok, parsed);

  // The round trip that matters: what goes into `form_schemas.fields` must come
  // back out identical, or a stored schema means something different tomorrow.
  const serialized = serializeSchemaDocument(declared);
  const reparsed = parseSchemaDocument(JSON.parse(JSON.stringify(serialized)));
  ok("a serialized document reparses", reparsed.ok, reparsed);
  if (reparsed.ok) {
    t("round trip is lossless", serializeSchemaDocument(reparsed.document), serialized);
  }

  t("a bare array is accepted as shorthand", parseSchemaDocument([
    { key: "email", type: "email", required: true },
  ]).ok, true);

  // Unknown properties are refused on the declare-a-file path. A typo'd rule is
  // a rule the author believes they wrote and does not have.
  const typo = parseSchemaDocument({
    fields: [{ key: "email", type: "email", requred: true }],
  });
  ok("a misspelled property is refused, not ignored", !typo.ok, typo);

  const noOptions = parseSchemaDocument({
    fields: [{ key: "budget", type: "select", required: true }],
  });
  ok("a select with no options is refused", !noOptions.ok, noOptions);

  const badPattern = parseSchemaDocument({
    fields: [{ key: "code", type: "text", validation: { pattern: "([a-z" } }],
  });
  ok("a pattern that does not compile is refused", !badPattern.ok, badPattern);

  const duplicate = parseSchemaDocument({
    fields: [
      { key: "email", type: "email" },
      { key: "email", type: "text" },
    ],
  });
  ok("two fields with one name are refused", !duplicate.ok, duplicate);

  t("an unlabelled field falls back to its key", (() => {
    const result = parseSchemaDocument({ fields: [{ key: "first_name", type: "text" }] });
    return result.ok ? result.document.fields[0].label : null;
  })(), "first_name");

  // The format carries its own version so a future change cannot silently
  // reinterpret a stored row.
  const fromTheFuture = parseSchemaDocument({ formatVersion: 99, fields: [] });
  ok("a newer format version is refused rather than guessed at", !fromTheFuture.ok, fromTheFuture);
  t("a newer format version reads as unreadable, not as empty", readStoredDocument({
    formatVersion: 99,
    fields: [{ key: "email", type: "email" }],
  }), null);

  // What the seed wrote before `formatVersion` existed.
  const legacy = readStoredDocument({
    fields: [
      { key: "name", label: "Your name", type: "text", required: true },
      { key: "email", label: "Work email", type: "email", required: true },
    ],
  });
  t("a stored row with no formatVersion still reads", legacy?.fields.map((f) => f.key), [
    "name",
    "email",
  ]);
  t("...and is treated as version 1", legacy?.formatVersion, SCHEMA_FORMAT_VERSION);

  // Reading is lenient in one direction only: a property this build does not
  // know is dropped, never fatal.
  const withExtras = readStoredDocument({
    formatVersion: 1,
    fields: [{ key: "email", label: "Email", type: "email", required: true, colour: "blue" }],
  });
  t("an unknown property on a stored field is dropped, not fatal", withExtras?.fields[0], {
    key: "email",
    label: "Email",
    type: "email",
    required: true,
  });

  // One unusable field must not take the rest of the schema down with it.
  const partlyBroken = readStoredDocument({
    formatVersion: 1,
    fields: [
      { key: "email", label: "Email", type: "email", required: true },
      { key: "broken", label: "Broken", type: "not_a_type" },
      { key: "note", label: "Note", type: "textarea" },
    ],
  });
  t("an unreadable field is dropped and the rest survive", partlyBroken?.fields.map((f) => f.key), [
    "email",
    "note",
  ]);

  t("a non-object stored value reads as unreadable", readStoredDocument("nonsense"), null);
  t("an empty document is valid", parseSchemaDocument(emptyDocument()).ok, true);

  const fromJson = parseSchemaJson('{"fields":[{"key":"email","type":"email"}]}');
  ok("a JSON file parses", fromJson.ok, fromJson);
  ok("invalid JSON reports itself as such", !parseSchemaJson("{nope").ok);
}

// ---------------------------------------------------------------------------
// HTML import
// ---------------------------------------------------------------------------

/** The markup a real page has: mixed case, unquoted attributes, entities. */
const MESSY_FORM = `
<!DOCTYPE html>
<div class=wrap>
<script>if (a < b) { document.write("<form action=/fake><input name=decoy></form>") }</script>
<style>.form > input { color: red }</style>
<FORM ACTION="/contact" METHOD=POST id="lead-form">
  <label for=fname>First name *</label>
  <input id=fname name=first_name required>

  <input id="email2" type=EMAIL name="email" placeholder="you@work.com" required>
  <label for="email2">Work email</label>

  <label>Phone <input type="tel" name="phone"></label>
  <input type=text name=email>

  <select name="budget" required>
    <option value="">Choose one&hellip;</option>
    <optgroup label="Small">
      <option value=under_5k>Under $5k</option>
      <option>5k&ndash;20k</option>
    </optgroup>
    <optgroup label="Large">
      <option value="over_20k" selected>Over $20k</option>
    </optgroup>
  </select>

  <fieldset>
    <legend>How did you hear about us?</legend>
    <label><input type=radio name=source value=google> Google</label>
    <label><input type="radio" name="source" value="friend"> A friend</label>
  </fieldset>

  <fieldset>
    <legend>Services needed</legend>
    <label><input type=checkbox name="services[]" value=web> Web</label>
    <label><input type=checkbox name="services[]" value=seo> SEO</label>
  </fieldset>

  <label><input type=checkbox name=terms value=yes required> I agree to the terms</label>

  <textarea name=note maxlength="500" title="Tell us > everything">Draft <b>text</b></textarea>
  <input type=number name=headcount min=1 max=5000 step=1>
  <input type=date name=start_by min="2026-01-01">
  <input type=hidden name=gclid value="">
  <input type=hidden name=plan value=pro>
  <input type=hidden name=_next value=/thanks>
  <input type=file name=brief>
  <input type=text placeholder="not submitted">
  <button type=submit>Send <span>it</span></button>
</FORM>
</div>
`;

function importTests() {
  console.log("\nHTML import");

  const result = importSchemaFromHtml(MESSY_FORM);
  t("one form found", result.forms.length, 1);

  const form = result.forms[0];
  const fields = form.document.fields;
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const noteCodes = form.notes.map((note) => note.code);

  t("the action is kept verbatim", form.action, "/contact");
  t("an uppercase METHOD is normalised", form.method, "post");

  // A script containing `<` must not be scanned as markup, or the decoy input
  // inside it becomes a field of a form that does not exist.
  ok("markup inside <script> is ignored", !byKey.has("decoy"), fields.map((f) => f.key));

  // Labels, four ways.
  t("a label with for= resolves", byKey.get("first_name")?.label, "First name");
  t("a label that follows its input resolves", byKey.get("email")?.label, "Work email");
  t("a wrapping label resolves", byKey.get("phone")?.label, "Phone");
  t("a legend labels a radio group", byKey.get("source")?.label, "How did you hear about us?");
  t("a field with no label at all is humanised", byKey.get("headcount")?.label, "Headcount");
  t("a wrapping label on a checkbox resolves", byKey.get("terms")?.label, "I agree to the terms");

  // Types.
  t("type=EMAIL is an email", byKey.get("email")?.type, "email");
  t("type=tel is a phone", byKey.get("phone")?.type, "phone");
  t("a <select> is a select", byKey.get("budget")?.type, "select");
  t("radios sharing a name are one select", byKey.get("source")?.type, "select");
  t("checkboxes sharing a name are a multi-select", byKey.get("services[]")?.type, "multi_select");
  t("a lone checkbox is a checkbox, not a one-option list", byKey.get("terms")?.type, "checkbox");
  t("a <textarea> is a textarea", byKey.get("note")?.type, "textarea");
  t("type=date is a date", byKey.get("start_by")?.type, "date");
  t("a hidden input is hidden", byKey.get("plan")?.type, "hidden");

  // required.
  t("required is carried", byKey.get("first_name")?.required, true);
  t("absent required means optional", byKey.get("phone")?.required, false);

  // Options, through optgroups, with the placeholder dropped.
  t("optgroup options are collected with their group", byKey.get("budget")?.options, [
    { value: "under_5k", label: "Small: Under $5k" },
    { value: "5k–20k", label: "Small: 5k–20k" },
    { value: "over_20k", label: "Large: Over $20k" },
  ]);
  ok("an empty-valued placeholder option is reported", noteCodes.includes("empty_option"));
  t("radio values become options", byKey.get("source")?.options, [
    { value: "google", label: "Google" },
    { value: "friend", label: "A friend" },
  ]);

  // Constraints.
  t("maxlength is carried", byKey.get("note")?.validation, { maxLength: 500 });
  t("number bounds are numbers", byKey.get("headcount")?.validation, {
    min: 1,
    max: 5000,
    step: 1,
  });
  t("date bounds stay date strings", byKey.get("start_by")?.validation, { min: "2026-01-01" });

  // The five things that quietly produce a wrong schema.
  ok("an input with no name is skipped", !fields.some((f) => f.key === ""));
  ok("...and says so", noteCodes.includes("control_without_name"));
  ok("a duplicate name becomes one field", fields.filter((f) => f.key === "email").length === 1);
  ok("...and says so", noteCodes.includes("conflicting_types"));
  ok("a file input is skipped", !byKey.has("brief"));
  ok("...and says so", noteCodes.includes("unsupported_control"));
  ok("a submit button is not a field", !fields.some((f) => f.type === "text" && f.label === "Send it"));

  // Attribution and control fields never reach `values`, so a schema field for
  // one would be missing on every single submission, forever.
  ok("a hidden gclid is not imported", !byKey.has("gclid"));
  ok("a _next redirect field is not imported", !byKey.has("_next"));
  ok("...and both are explained", noteCodes.filter((code) => code === "reserved_name").length === 2);
  ok("an ordinary hidden field IS imported", byKey.has("plan"));

  // The schema an import produces has to be a legal schema.
  const reparsed = parseSchemaDocument(JSON.parse(JSON.stringify(serializeSchemaDocument(form.document))));
  ok("an imported schema is a valid schema", reparsed.ok, reparsed);

  console.log("\nHTML import — markup that is simply broken");

  const broken = importSchemaFromHtml(`
    <form>
      <p>Name<br>
      <input name=name placeholder="Ada Lovelace"
      <input name="email" type=email>
      <label>Notes
      <textarea name=notes></textarea>
      <select name=plan multiple>
        <option value=a>A
        <option value=b>B
      </select>
    </form>
  `);
  const brokenKeys = broken.forms[0]?.document.fields.map((field) => field.key) ?? [];
  ok(
    "unclosed tags and a malformed input do not stop the import",
    brokenKeys.includes("email") && brokenKeys.includes("notes") && brokenKeys.includes("plan"),
    brokenKeys,
  );
  t(
    "unclosed <option> tags still yield options",
    broken.forms[0]?.document.fields.find((field) => field.key === "plan")?.options,
    [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
  );
  t(
    "a multiple select is a multi-select",
    broken.forms[0]?.document.fields.find((field) => field.key === "plan")?.type,
    "multi_select",
  );

  const fragment = importSchemaFromHtml(`
    <label>Email <input name="email" type="email" required></label>
    <input name="company">
  `);
  t("a pasted fragment with no <form> still imports", fragment.forms[0]?.document.fields.length, 2);
  ok("...and says there was no form element", fragment.notes.some((note) => note.code === "no_form_element"));

  const twoForms = importSchemaFromHtml(`
    <form id="newsletter"><input name="email" type="email"></form>
    <form id="contact"><input name="email" type="email"><textarea name="msg"></textarea></form>
  `);
  t("two forms are both returned", twoForms.forms.map((form) => form.id), ["newsletter", "contact"]);
  ok("...and the ambiguity is flagged", twoForms.notes.some((note) => note.code === "multiple_forms"));

  const empty = importSchemaFromHtml(`<div id="root"></div>`);
  t("a JavaScript-rendered page imports nothing", empty.forms.length, 0);
  ok(
    "...and explains what to do instead",
    empty.notes.some((note) => note.code === "no_fields" && note.message.includes("inspector")),
  );

  const placeholderOnly = importSchemaFromHtml(`
    <form><select name="plan"><option value="">Pick one</option></select></form>
  `);
  t(
    "a select with only a placeholder becomes text rather than an impossible select",
    placeholderOnly.forms[0]?.document.fields[0]?.type,
    "text",
  );

  const noteAttr = importSchemaFromHtml(`<form><input name=q title="Search > everything"></form>`);
  t(
    "a > inside a quoted attribute does not end the tag",
    noteAttr.forms[0]?.document.fields[0]?.label,
    "Search > everything",
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SCHEMA: FormSchemaDocument = {
  formatVersion: 1,
  fields: [
    { key: "email", label: "Work email", type: "email", required: true },
    { key: "company", label: "Company", type: "text", required: false },
    { key: "phone", label: "Phone", type: "phone", required: false },
    { key: "headcount", label: "Headcount", type: "number", required: false, validation: { min: 1, max: 100 } },
    { key: "start_by", label: "Start by", type: "date", required: false },
    { key: "terms", label: "Terms", type: "checkbox", required: true },
    {
      key: "budget",
      label: "Budget",
      type: "select",
      required: false,
      options: [
        { value: "small", label: "Small" },
        { value: "large", label: "Large" },
      ],
    },
    {
      key: "services",
      label: "Services",
      type: "multi_select",
      required: false,
      options: [
        { value: "web", label: "Web" },
        { value: "seo", label: "SEO" },
      ],
    },
    { key: "code", label: "Code", type: "text", required: false, validation: { pattern: "[A-Z]{3}" } },
  ],
};

function validationTests() {
  console.log("\nvalidation");

  const clean = validateSubmission(SCHEMA, {
    email: "ada@example.com",
    terms: "on",
    company: "",
    budget: "small",
    services: ["web", "seo"],
  });
  t("a matching payload has no issues", clean.issues, []);

  // The two cases that must never be errors, because they are what real forms
  // post every day.
  const blankOptional = validateSubmission(SCHEMA, {
    email: "ada@example.com",
    terms: "on",
    company: "   ",
    phone: "",
  });
  t("a blank optional field is not an issue at all", blankOptional.issues, []);

  const extra = validateSubmission(SCHEMA, {
    email: "ada@example.com",
    terms: "on",
    msclkid_extra: "abc",
    honeypot: "",
  });
  t("an unrecognised field is one warning", extra.errors.length, 0);
  t("...reported as a warning", extra.warnings.map((issue) => issue.code), ["unknown_field"]);
  ok("...and the submission is still valid", extra.valid);

  const missing = validateSubmission(SCHEMA, { company: "Acme" });
  t("a missing required field is an error", missing.errors.map((issue) => issue.field).sort(), [
    "email",
    "terms",
  ]);
  ok("...and the result is invalid", !missing.valid);

  t(
    "an unchecked checkbox reads as missing, not as invalid",
    validateSubmission(SCHEMA, { email: "a@b.com" }).errors.map((issue) => issue.code),
    ["missing_required"],
  );

  const typed = validateSubmission(SCHEMA, {
    email: "not-an-email",
    terms: "on",
    phone: "banana",
    headcount: "500",
    start_by: "03/14/2026",
    budget: "enormous",
    services: ["web", "carpentry"],
    code: "ab",
  });
  t(
    "every type and range violation is reported",
    typed.errors.map((issue) => `${issue.field}:${issue.code}`).sort(),
    [
      "budget:not_an_option",
      "code:pattern_mismatch",
      "email:invalid_email",
      "headcount:out_of_range",
      "phone:invalid_phone",
      "services:not_an_option",
      "start_by:invalid_date",
    ],
  );

  t(
    "a phone with the punctuation people type is accepted",
    validateSubmission(SCHEMA, { email: "a@b.com", terms: "1", phone: "+44 (0)20 7946 0958" }).issues,
    [],
  );

  t(
    "a repeated single-value field is a warning, not an error",
    validateSubmission(SCHEMA, {
      email: "a@b.com",
      terms: "on",
      company: ["Acme", "Acme Ltd"],
    }).warnings.map((issue) => issue.code),
    ["repeated_value"],
  );

  t(
    "a file part is stored and reported, never rejected",
    validateSubmission(SCHEMA, {
      email: "a@b.com",
      terms: "on",
      company: { file: true, filename: "brief.pdf" } as never,
    }).errors,
    [],
  );

  t("no schema means no issues", validateSubmission(null, { anything: "at all" }).issues, []);

  // Every issue has to name what to change; a message that does not is a
  // support ticket.
  ok(
    "every message names its field",
    typed.errors.every((issue) => issue.message.includes("\"")),
    typed.errors.map((issue) => issue.message),
  );
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

function inferenceTests() {
  console.log("\ninference");

  const payloads: Record<string, string>[] = [
    { name: "Priya Raman", email: "priya@dorset.example", company: "Dorset", budget: "small", note: "Need 200 brackets, powder-coated and delivered to two sites before the end of the quarter please.", phone: "0207 946 0958", terms: "on", gclid: "abc" },
    { name: "Tom Whitfield", email: "t@harlow.example", company: "Harlow", budget: "large", note: "Comparing three suppliers.", phone: "+44 20 7946 0000", terms: "on" },
    { name: "Sandra Oyelaran", email: "s@keswick.example", budget: "small", note: "Repeat order, same spec as March.", phone: "020 7946 1111", terms: "on" },
    { name: "Dan Kovacs", email: "dan@brightwater.example", company: "", budget: "large", note: "Looking at a 12-week run.", phone: "020 7946 2222", terms: "on" },
    { name: "Meera Shah", email: "meera@axelrod.example", company: "Axelrod", budget: "small", note: "Tooling plus first production batch.", phone: "020 7946 3333", terms: "on", weird_one_off: "x" },
  ];

  const result = inferSchema(payloads);
  const byKey = new Map(result.fields.map((field) => [field.key, field]));

  ok("five submissions is enough to be ready", result.ready, result);
  t("the sample size is reported", result.observed, 5);

  t("an email column is inferred as email", byKey.get("email")?.type, "email");
  t("a long free-text column is a textarea", byKey.get("note")?.type, "textarea");
  t("a repeating short column is a select", byKey.get("budget")?.type, "select");
  t("...with the observed values as options", byKey.get("budget")?.options, [
    { value: "small", label: "small" },
    { value: "large", label: "large" },
  ]);
  t("an on/off column is a checkbox", byKey.get("terms")?.type, "checkbox");

  // The leading zero is the whole reason this is not a number.
  t("a phone column stays a phone, not a number", byKey.get("phone")?.type, "phone");

  // The single most dangerous guess.
  t("a column present every time is proposed required", byKey.get("email")?.required, true);
  t("a column ever seen missing is proposed optional", byKey.get("company")?.required, false);
  ok(
    "...and says why",
    (byKey.get("company")?.notes ?? []).some((note) => note.includes("proposed as optional")),
    byKey.get("company")?.notes,
  );
  ok(
    "the option list warns that it is only what has been seen",
    (byKey.get("budget")?.notes ?? []).some((note) => note.includes("actually been submitted")),
  );

  ok("an attribution key is never proposed as a field", !byKey.has("gclid"));
  ok("a one-off stray key is left out", !byKey.has("weird_one_off"));
  ok(
    "the proposal says out loud that it is a guess",
    result.notes.some((note) => note.includes("guessed from what arrived")),
  );

  // Whatever it proposes has to be publishable.
  const parsed = parseSchemaDocument(JSON.parse(JSON.stringify(serializeSchemaDocument(result.document))));
  ok("an inferred document is a valid schema", parsed.ok, parsed);

  // And what it proposes must not immediately flag the submissions it was
  // drawn from. An inference that fails its own evidence is worthless.
  let flagged = 0;
  for (const payload of payloads) {
    const validation = validateSubmission(result.document, payload);
    flagged += validation.errors.length;
  }
  t("an inferred schema produces no errors on the payloads it came from", flagged, 0);

  const thin = inferSchema([{ email: "a@b.example" }]);
  ok("one submission is not enough to be ready", !thin.ready);
  ok(
    "...and says how many it wants",
    thin.notes.some((note) => note.includes("draft")),
    thin.notes,
  );

  const leadingZero = inferSchema(
    [{ ref: "007" }, { ref: "0042" }, { ref: "0100" }],
    { minimum: 3 },
  );
  t("a leading zero keeps a numeric-looking column as text", leadingZero.fields[0]?.type, "text");

  const numbers = inferSchema([{ n: "3" }, { n: "7" }, { n: "12" }], { minimum: 3 });
  t("a plain numeric column is a number, not a three-option select", numbers.fields[0]?.type, "number");
}

// ---------------------------------------------------------------------------
// Reserved names and the URL guard
// ---------------------------------------------------------------------------

function guardTests() {
  console.log("\nreserved names and the URL guard");

  ok("utm_source is reserved", isReservedFieldName("utm_source"));
  ok("utmSource is the same field", isReservedFieldName("utmSource"));
  ok("gclid is reserved", isReservedFieldName("gclid"));
  ok("_next is reserved", isReservedFieldName("_next"));
  ok("a customer's own `redirect` field is theirs", !isReservedFieldName("redirect"));
  ok("an ordinary field is not reserved", !isReservedFieldName("email"));

  // "Point us at your URL" is a server fetching an address a user typed.
  ok("localhost is refused", isPrivateHost("localhost"));
  ok("127.0.0.1 is refused", isPrivateHost("127.0.0.1"));
  ok("the cloud metadata address is refused", isPrivateHost("169.254.169.254"));
  ok("a decimal-encoded loopback is refused", isPrivateHost("2130706433"));
  ok("an octal-encoded loopback is refused", isPrivateHost("0177.0.0.1"));
  ok("a hex-encoded loopback is refused", isPrivateHost("0x7f.0.0.1"));
  ok("the short form 127.1 is refused", isPrivateHost("127.1"));
  ok("a private range is refused", isPrivateHost("10.1.2.3"));
  ok("172.16/12 is refused", isPrivateHost("172.20.0.1"));
  ok("172.32 is public", !isPrivateHost("172.32.0.1"));
  ok("IPv6 loopback is refused", isPrivateHost("::1"));
  ok("an IPv4-mapped loopback is refused", isPrivateHost("::ffff:127.0.0.1"));
  ok("a .local name is refused", isPrivateHost("printer.local"));
  ok("an ordinary host is allowed", !isPrivateHost("example.com"));
}

// ---------------------------------------------------------------------------

formatTests();
importTests();
validationTests();
inferenceTests();
guardTests();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
