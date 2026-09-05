/**
 * Multi-step forms and partial capture (#37).
 *
 * The four questions this suite exists to answer, in the order they matter:
 *
 *   1. **Does a form with no steps behave exactly as it did before?** Asserted
 *      byte for byte on the serialised document, the agent tool definition, and
 *      the validation result — not by eye. This is the additive claim, and it is
 *      the one a regression would be silent about.
 *   2. **Can a partial ever be refused?** A partial is by definition missing the
 *      required fields on the screens nobody reached. If a required field on
 *      screen four could stop screen one being recorded, the feature is
 *      pointless. So: the full validator says "invalid", the step's own error
 *      list says "nothing to correct here", and both are asserted on the same
 *      document.
 *   3. **Does one visitor stay one row?** A partial that completes is closed,
 *      not duplicated. The pure half of that is asserted here (the reserved
 *      field is stripped, the key round-trips); the database half is
 *      `tests/steps-partials.test.mts`.
 *   4. **Do steps and rules agree?** A screen whose every field a rule has
 *      hidden is skipped rather than shown empty, navigation still goes forward
 *      across it, and a field no step names is still asked.
 *
 * And one that is not about behaviour at all: **is the visitor told?** A form
 * that captures and has no notice is a bug of the kind this product's whole
 * position is built on not having, so it is asserted like any other.
 *
 * No database, no server:
 * `node --experimental-strip-types tests/steps.test.mts`.
 */

import { readFileSync } from "node:fs";

import {
  parseSchemaDocument,
  readStoredDocument,
  serializeSchemaDocument,
  type FormSchemaDocument,
} from "../src/lib/schema/format.ts";
import { validateSubmission } from "../src/lib/schema/validate.ts";
import { buildToolDefinition } from "../src/lib/manifest/tool.ts";
import {
  DEFAULT_PARTIAL_NOTICE,
  PARTIAL_KEY_FIELD,
  PARTIAL_KEY_PATTERN,
  STEP_FIELD_KEYS,
  capturesPartials,
  hasSteps,
  partialNotice,
} from "../src/lib/steps/format.ts";
import { advance, planSteps, stepErrors } from "../src/lib/steps/plan.ts";
import { isReservedFieldName } from "../src/lib/schema/reserved.ts";
import { newPartialKey } from "../src/db/ids.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const okay = JSON.stringify(got) === JSON.stringify(want);
  if (okay) pass++;
  else fail++;
  console.log(`  ${okay ? "PASS" : "FAIL"}  ${name}`);
  if (!okay) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

function doc(input: unknown): FormSchemaDocument {
  const parsed = parseSchemaDocument(input);
  if (!parsed.ok) throw new Error(`fixture schema is invalid: ${parsed.errors.join(" ")}`);
  return parsed.document;
}

function refused(input: unknown): string[] {
  const parsed = parseSchemaDocument(input);
  return parsed.ok ? [] : parsed.errors;
}

const CONTEXT = { endpointPublicId: "abc123" };

// The same five fields throughout, so the only thing that varies between the
// stepped and unstepped assertions is the presence of `steps`.
const FIELDS = [
  { key: "email", label: "Email", type: "email", required: true },
  { key: "name", label: "Name", type: "text", required: true },
  { key: "company", label: "Company", type: "text" },
  { key: "budget", label: "Budget", type: "number", required: true },
  { key: "source", label: "Source", type: "hidden" },
];

const STEPS = [
  { id: "who", title: "About you", fields: ["email", "name"] },
  { id: "company", title: "Your company", fields: ["company"] },
  { id: "money", title: "Budget", fields: ["budget"] },
];

// ---------------------------------------------------------------------------
console.log("\nA form with no steps is the form it always was");
// ---------------------------------------------------------------------------
{
  const plain = doc({ fields: FIELDS });
  const stepped = doc({ fields: FIELDS, steps: STEPS });

  // The claim is *byte for byte*, so it is asserted on the serialised bytes.
  const plainBytes = JSON.stringify(serializeSchemaDocument(plain));
  ok(
    "a document without steps serialises with no steps key",
    !plainBytes.includes('"steps"') && !plainBytes.includes('"partials"'),
    plainBytes,
  );

  // And the guard against a test that passes because the fixture was empty:
  // the same assertion must go the other way on the stepped document.
  const steppedBytes = JSON.stringify(serializeSchemaDocument(stepped));
  ok(
    "…and the stepped one does carry it, so the check above is not vacuous",
    steppedBytes.includes('"steps"'),
    steppedBytes,
  );

  t(
    "a stored row with no steps round-trips to the same bytes",
    JSON.stringify(serializeSchemaDocument(readStoredDocument(serializeSchemaDocument(plain))!)),
    plainBytes,
  );
  t(
    "and a stored row with steps does too",
    JSON.stringify(
      serializeSchemaDocument(readStoredDocument(serializeSchemaDocument(stepped))!),
    ),
    steppedBytes,
  );

  // The agent tool (#32) is generated from `fields` and must not notice steps.
  t(
    "the agent tool definition is identical with and without steps",
    JSON.stringify(buildToolDefinition(stepped, CONTEXT)),
    JSON.stringify(buildToolDefinition(plain, CONTEXT)),
  );

  const payload = { email: "a@b.co", name: "Dana", budget: "400" };
  t(
    "and validation returns the same result on the same payload",
    JSON.stringify(validateSubmission(stepped, payload)),
    JSON.stringify(validateSubmission(plain, payload)),
  );

  t("a document with no steps has none", hasSteps(plain), false);
  t("…and one with steps does", hasSteps(stepped), true);
  t("a document with no steps plans to nothing", planSteps(plain, {}), null);
  t("…and captures no partials", capturesPartials(plain), false);
  t("…and shows no notice", partialNotice(plain), null);
}

// ---------------------------------------------------------------------------
console.log("\nA partial is recorded, never refused");
// ---------------------------------------------------------------------------
{
  const stepped = doc({ fields: FIELDS, steps: STEPS });

  // Somebody who has filled in screen one and stopped. `budget` is required and
  // is on screen three; `name` is required and they answered it.
  const partial = { email: "dana@example.com", name: "Dana" };

  const full = validateSubmission(stepped, partial);
  ok(
    "the full validator does consider this payload invalid",
    !full.valid && full.errors.some((issue) => issue.field === "budget"),
    full.errors.map((issue) => issue.field),
  );

  const plan = planSteps(stepped, partial, "who")!;
  t("the visitor is on screen one of three", [plan.current.id, plan.total], ["who", 3]);
  t(
    "and that screen has nothing to correct",
    stepErrors(stepped, partial, plan.current),
    [],
  );

  // The same assertion the other way round, so an empty list cannot be an
  // artefact of the fixture: an actual error on this screen must show up.
  const bad = { email: "not-an-email", name: "Dana" };
  t(
    "…while a bad answer on this screen does show up",
    stepErrors(stepped, bad, planSteps(stepped, bad, "who")!.current).map((i) => i.code),
    ["invalid_email"],
  );

  // Screen three's required field surfaces only on screen three.
  const atMoney = planSteps(stepped, partial, "money")!;
  t(
    "the required field on screen three is an error only once you are there",
    stepErrors(stepped, partial, atMoney.current).map((issue) => issue.field),
    ["budget"],
  );
}

// ---------------------------------------------------------------------------
console.log("\nWhere a visitor goes next");
// ---------------------------------------------------------------------------
{
  const stepped = doc({ fields: FIELDS, steps: STEPS });
  const answers = { email: "a@b.co", name: "Dana" };

  t("next from screen one", advance(stepped, answers, "who", "next"), "company");
  t("next from screen two", advance(stepped, answers, "company", "next"), "money");
  t("next from the last screen means submit", advance(stepped, answers, "money", "next"), null);
  t("back from screen two", advance(stepped, answers, "company", "back"), "who");
  t("back from the first screen stays put", advance(stepped, answers, "who", "back"), "who");
  t(
    "an unrecognised step id starts the form rather than skipping ahead",
    planSteps(stepped, answers, "no-such-step")!.current.id,
    "who",
  );
}

// ---------------------------------------------------------------------------
console.log("\nSteps and rules");
// ---------------------------------------------------------------------------
{
  // `company` is hidden unless the visitor says they are a business, which
  // empties screen two entirely.
  const conditional = doc({
    fields: [
      { key: "email", label: "Email", type: "email", required: true },
      {
        key: "kind",
        label: "Kind",
        type: "select",
        required: true,
        options: [
          { value: "business", label: "Business" },
          { value: "personal", label: "Personal" },
        ],
      },
      { key: "company", label: "Company", type: "text" },
      { key: "budget", label: "Budget", type: "number" },
    ],
    steps: [
      { id: "who", fields: ["email", "kind"], title: "You" },
      { id: "company", fields: ["company"], title: "Company" },
      { id: "money", fields: ["budget"], title: "Budget" },
    ],
    rules: [
      {
        label: "Ask for a company only from businesses",
        when: { all: [{ field: "kind", op: "equals", value: "business" }] },
        then: [{ action: "show", field: "company" }],
      },
    ],
  });

  const personal = { email: "a@b.co", kind: "personal" };
  const business = { email: "a@b.co", kind: "business" };

  t(
    "a screen whose only field a rule hid is skipped",
    planSteps(conditional, personal, "who")!.steps.map((step) => step.id),
    ["who", "money"],
  );
  t(
    "…and is there again when the rule shows it",
    planSteps(conditional, business, "who")!.steps.map((step) => step.id),
    ["who", "company", "money"],
  );
  t(
    "so Next steps over the empty screen rather than into it",
    advance(conditional, personal, "who", "next"),
    "money",
  );
  t(
    "and Back from the screen after it comes back to the right place",
    advance(conditional, personal, "money", "back"),
    "who",
  );
  t(
    "the count a visitor is shown reflects the screens they will actually see",
    planSteps(conditional, personal, "money")!.total,
    2,
  );
}

// ---------------------------------------------------------------------------
console.log("\nFields the author did not assign, and fields that are not questions");
// ---------------------------------------------------------------------------
{
  // `budget` is named by no step, and `source` is a hidden field.
  const loose = doc({
    fields: FIELDS,
    steps: [
      { id: "who", fields: ["email", "name"] },
      { id: "company", fields: ["company"] },
    ],
  });

  const plan = planSteps(loose, {}, "company")!;
  t(
    "an unassigned field lands on the last screen that asks anything",
    plan.current.fieldKeys,
    ["company", "budget"],
  );
  ok(
    "a hidden field is never on a screen",
    !plan.steps.some((step) => step.fieldKeys.includes("source")),
    plan.steps.map((step) => step.fieldKeys),
  );
  ok(
    "…but it is carried from the first screen, so an early abandon keeps it",
    planSteps(loose, {}, "who")!.carryKeys.includes("source"),
    planSteps(loose, {}, "who")!.carryKeys,
  );

  const answered = { email: "a@b.co", name: "Dana" };
  t(
    "answers from earlier screens are carried, so nothing is lost going forward",
    planSteps(loose, answered, "company")!.carryKeys,
    ["email", "name", "source"],
  );
  ok(
    "and a field on this screen is not carried as well as rendered",
    !planSteps(loose, { company: "Acme" }, "company")!.carryKeys.includes("company"),
  );
}

// ---------------------------------------------------------------------------
console.log("\nWhat a step list may not say");
// ---------------------------------------------------------------------------
{
  t(
    "a step naming a field the form does not collect is refused",
    refused({ fields: FIELDS, steps: [{ id: "a", fields: ["nope"] }] }),
    ['steps: Step "a" asks for "nope", which this form does not collect.'],
  );
  t(
    "a field on two screens is refused",
    refused({
      fields: FIELDS,
      steps: [
        { id: "a", fields: ["email"] },
        { id: "b", fields: ["email"] },
      ],
    }),
    ['steps: "email" is on step "a" and step "b". A field is asked on one screen.'],
  );
  ok(
    "two screens with the same id are refused",
    refused({
      fields: FIELDS,
      steps: [
        { id: "a", fields: ["email"] },
        { id: "a", fields: ["name"] },
      ],
    }).some((message) => message.includes('Two steps share the id "a"')),
  );
  ok(
    "a screen with nothing on it at all is refused",
    refused({ fields: FIELDS, steps: [{ id: "a", fields: [] }] }).some((message) =>
      message.includes("nothing to put on the screen"),
    ),
  );
  t(
    "a screen with a title and no fields is an intro screen, and is fine",
    refused({ fields: FIELDS, steps: [{ id: "intro", title: "Hello" }] }),
    [],
  );
  ok(
    "…and it is never skipped, even though it asks nothing",
    planSteps(
      doc({ fields: FIELDS, steps: [{ id: "intro", title: "Hello" }, { id: "rest", fields: ["email", "name", "company", "budget"] }] }),
      {},
      "intro",
    )!.current.id === "intro",
  );
  t(
    "a field named by no step is not an error",
    refused({ fields: FIELDS, steps: [{ id: "a", fields: ["email"] }] }),
    [],
  );
}

// ---------------------------------------------------------------------------
console.log("\nA stored step list this build cannot read");
// ---------------------------------------------------------------------------
{
  const row = {
    formatVersion: 1,
    fields: FIELDS,
    // One screen is a number rather than an object. All-or-nothing applies.
    steps: [{ id: "who", fields: ["email"] }, 7],
  };
  const read = readStoredDocument(row)!;
  t(
    "an unreadable step list drops to the one-screen form rather than half a wizard",
    read.steps,
    undefined,
  );
  ok(
    "and every field is still there to be asked",
    read.fields.map((field) => field.key).join(",") ===
      FIELDS.map((field) => field.key).join(","),
    read.fields.map((field) => field.key),
  );

  // The same read must succeed when the row is well-formed, or the assertion
  // above would pass on a reader that simply never returns steps.
  const good = readStoredDocument({ formatVersion: 1, fields: FIELDS, steps: STEPS })!;
  t("…while a readable one comes back intact", good.steps?.map((step) => step.id), [
    "who",
    "company",
    "money",
  ]);
}

// ---------------------------------------------------------------------------
console.log("\nThe visitor is told");
// ---------------------------------------------------------------------------
{
  const stepped = doc({ fields: FIELDS, steps: STEPS });
  t("a stepped form captures partials", capturesPartials(stepped), true);
  t("and says so in our words by default", partialNotice(stepped), DEFAULT_PARTIAL_NOTICE);

  const worded = doc({
    fields: FIELDS,
    steps: STEPS,
    partials: { notice: "We keep what you type as you go." },
  });
  t(
    "a customer may reword it",
    partialNotice(worded),
    "We keep what you type as you go.",
  );

  const blanked = doc({ fields: FIELDS, steps: STEPS, partials: { notice: "   " } });
  t(
    "but blanking it falls back to our sentence rather than to silence",
    partialNotice(blanked),
    DEFAULT_PARTIAL_NOTICE,
  );

  // The structural version of the same claim: there is no key that turns
  // capture off, so no stored document can express a form that captures
  // silently. A `capture: false` in a row is refused outright rather than
  // honoured.
  ok(
    "there is no switch in the format for capturing without disclosing",
    refused({ fields: FIELDS, steps: STEPS, partials: { capture: false } }).length > 0,
  );
  const sneaky = readStoredDocument({
    formatVersion: 1,
    fields: FIELDS,
    steps: STEPS,
    partials: { capture: false },
  })!;
  t("…and a stored row claiming one still shows the notice", partialNotice(sneaky), DEFAULT_PARTIAL_NOTICE);

  ok(
    "every form that captures has a notice, for every step arrangement",
    [
      doc({ fields: FIELDS, steps: STEPS }),
      doc({ fields: FIELDS, steps: [{ id: "one", fields: ["email"] }] }),
      doc({ fields: FIELDS, steps: [{ id: "intro", title: "Hi" }, { id: "rest", fields: ["email"] }] }),
    ].every((form) => !capturesPartials(form) || partialNotice(form) !== null),
  );
}

// ---------------------------------------------------------------------------
console.log("\nThe reserved fields, and the key");
// ---------------------------------------------------------------------------
{
  t("the step flow reserves three names", [...STEP_FIELD_KEYS], [
    "_ef_partial",
    "_ef_step",
    "_ef_step_to",
  ]);

  // In the `_ef_` namespace, with `_ef_token` and `_ef_hp`, because these are
  // names our page emits into somebody else's form rather than names a customer
  // types. A bare `_step` would have been a plausible question on a real form.
  ok(
    "in the same namespace as the other page-emitted control fields",
    STEP_FIELD_KEYS.every((key) => key.startsWith("_ef_")),
    [...STEP_FIELD_KEYS],
  );

  // And a schema may not declare one, or the validator would report it missing
  // on every submission — the ingest path strips it before `values` is written.
  ok(
    "and a schema cannot declare one",
    STEP_FIELD_KEYS.every((key) => isReservedFieldName(key)),
  );
  ok(
    "…while an ordinary field name is still the customer's",
    !isReservedFieldName("step") && !isReservedFieldName("partial"),
  );

  // A submission carrying a partial key must not show it in the inbox as a
  // field somebody answered. Asserted against the ingest path's own reserved
  // set rather than by reading the constant back.
  const handler = readFileSync("src/lib/ingest/handler.ts", "utf8");
  ok(
    "and the ingest path strips all three from stored values",
    /\.\.\.STEP_FIELD_KEYS,/.test(handler),
  );
  ok(
    "…and closes the partial only after the submission row is committed",
    handler.indexOf("await completePartial(") > handler.indexOf("const stored = await storeSubmission("),
  );

  const key = newPartialKey();
  ok("a generated key matches the pattern the routes check", PARTIAL_KEY_PATTERN.test(key), key);
  ok("and is wide enough to be unguessable", key.length >= 24, key.length);
  ok(
    "a key somebody typed does not",
    !PARTIAL_KEY_PATTERN.test("short") && !PARTIAL_KEY_PATTERN.test("has spaces in it"),
  );
  t("the key travels under one name", PARTIAL_KEY_FIELD, "_ef_partial");
}

// ---------------------------------------------------------------------------
console.log("\nA form with no steps renders the markup it always did");
// ---------------------------------------------------------------------------
{
  // The runtime half of this is asserted at the top of the file, on serialised
  // bytes. What can go wrong *later* is somebody moving one of the step
  // components out from behind the `step` guard, at which point every
  // single-screen form in production grows a progress bar. So the guard itself
  // is asserted, not just today's output.
  const view = readFileSync("src/components/render/form-view.tsx", "utf8");

  for (const component of ["StepHeader", "StepCarry", "StepNav", "PartialNotice"]) {
    const uses = [...view.matchAll(new RegExp(`<${component}\\b`, "g"))];
    ok(`<${component}> is rendered exactly once`, uses.length === 1, uses.length);
    // The 120 characters before it must contain the guard. Written as a window
    // rather than a full parse because the failure being caught is a component
    // moved to the top level, which no amount of subtlety would hide.
    const before = view.slice(Math.max(0, uses[0]!.index - 120), uses[0]!.index);
    ok(
      `…and only when there is a step to render`,
      /step\??\./.test(before) || /step \?/.test(before),
      before.trim().slice(-80),
    );
  }

  ok(
    "the form posts to the step route only on a stepped form",
    /action=\{step \? \(stepAction \?\? action\) : action\}/.test(view),
  );
  ok(
    "and the one-screen form keeps its own Submit button",
    /\) : \(\s*<button\s+type="submit"/.test(view),
  );
}

// ---------------------------------------------------------------------------
console.log("\nSteps never become a validation rule on the other two surfaces");
// ---------------------------------------------------------------------------
{
  const stepped = doc({ fields: FIELDS, steps: STEPS });
  // What a raw POST or an agent sends: everything at once, no steps involved.
  const complete = { email: "a@b.co", name: "Dana", company: "Acme", budget: "400" };
  t("a complete payload with no step fields validates clean", validateSubmission(stepped, complete).errors, []);

  // And the modules that serve those two surfaces must not read `steps` at all.
  for (const file of [
    "src/lib/schema/validate.ts",
    "src/lib/manifest/tool.ts",
    "src/lib/manifest/arguments.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    ok(`${file} never reads steps`, !/\bsteps\b/.test(source));
  }
}

// ---------------------------------------------------------------------------

console.log(`\nsteps: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
