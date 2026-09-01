/**
 * Conditional logic (#36).
 *
 * Four questions, and the first two are the whole feature:
 *
 *   1. **Do the three surfaces agree?** One document drives the hosted form,
 *      the agent-callable tool and validation on raw POSTs. Conditional logic
 *      is the first feature where they could genuinely disagree, so the
 *      assertions here are written as "the browser's payload and the agent's
 *      payload produce the same field states" rather than "the evaluator
 *      returns X".
 *   2. **Is a broken ruleset caught before it ships?** A circle, a rule naming
 *      a deleted field, a rule no answer could satisfy — each has to be an
 *      error at parse time, which is what the builder blocks Publish on.
 *   3. **Is anything ever lost?** A field hidden by a rule after somebody
 *      answered it keeps the answer, stores it, and says so.
 *   4. **Does the inspector explain it?** Which rules fired, in what order,
 *      what each read and what each did.
 *
 * No database, no server:
 * `node --experimental-strip-types tests/rules.test.mts`.
 */

import {
  parseSchemaDocument,
  readStoredDocument,
  serializeSchemaDocument,
  type FormSchemaDocument,
} from "../src/lib/schema/format.ts";
import { validateSubmission } from "../src/lib/schema/validate.ts";
import { analyzeRules } from "../src/lib/rules/analyze.ts";
import { evaluateRules, evaluationOrder, findCycle } from "../src/lib/rules/evaluate.ts";
import { inspectRules } from "../src/lib/rules/inspect.ts";
import { summarizeFieldRules, describeRule } from "../src/lib/rules/describe.ts";
import { buildToolDefinition } from "../src/lib/manifest/tool.ts";
import { prepareSubmission } from "../src/lib/manifest/arguments.ts";
import { nativeConstraints } from "../src/lib/render/controls.ts";
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
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
  if (parsed.ok) return [];
  return parsed.errors;
}

const CONTEXT = { endpointPublicId: "abc123" };

// ---------------------------------------------------------------------------
// The form every behavioural assertion runs against
// ---------------------------------------------------------------------------

/**
 * A qualification flow with a two-step dependency in it, which is the shape
 * that breaks in the tools #36 quotes: `budget` is only asked when there is a
 * budget, and `procurement_contact` is only asked when that budget is large.
 * So a rule reads a field another rule can hide, which is the case a
 * single-pass evaluator gets wrong.
 */
const QUALIFY = doc({
  name: "Demo request",
  fields: [
    { key: "work_email", label: "Work email", type: "email", required: true },
    {
      key: "has_budget",
      label: "Budget approved?",
      type: "select",
      required: true,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "Not yet" },
      ],
    },
    { key: "budget", label: "Budget", type: "number" },
    { key: "procurement_contact", label: "Procurement contact", type: "email" },
    { key: "notes", label: "Anything else", type: "textarea" },
  ],
  rules: [
    {
      label: "Ask for the number",
      when: { all: [{ field: "has_budget", op: "equals", value: "yes" }] },
      then: [
        { action: "show", field: "budget" },
        { action: "require", field: "budget" },
      ],
    },
    {
      label: "Big deals go through procurement",
      when: { all: [{ field: "budget", op: "gte", value: 50000 }] },
      then: [
        { action: "show", field: "procurement_contact" },
        { action: "require", field: "procurement_contact" },
      ],
    },
  ],
});

const state = (values: Record<string, unknown>) => {
  const evaluation = evaluateRules(QUALIFY, values as never);
  return Object.fromEntries(
    Object.entries(evaluation.fields).map(([key, outcome]) => [
      key,
      `${outcome.visible ? "shown" : "hidden"}/${outcome.required ? "required" : "optional"}`,
    ]),
  );
};

console.log("\nbaseline and the two-step dependency");
{
  t("with nothing answered, both conditional fields start hidden", state({}), {
    work_email: "shown/required",
    has_budget: "shown/required",
    budget: "hidden/optional",
    procurement_contact: "hidden/optional",
    notes: "shown/optional",
  });

  t("answering yes shows and requires the budget", state({ has_budget: "yes" }), {
    work_email: "shown/required",
    has_budget: "shown/required",
    budget: "shown/required",
    procurement_contact: "hidden/optional",
    notes: "shown/optional",
  });

  t(
    "a large budget reaches the second step",
    state({ has_budget: "yes", budget: "60000" }),
    {
      work_email: "shown/required",
      has_budget: "shown/required",
      budget: "shown/required",
      procurement_contact: "shown/required",
      notes: "shown/optional",
    },
  );

  t(
    "a small budget does not",
    state({ has_budget: "yes", budget: "4000" }),
    {
      work_email: "shown/required",
      has_budget: "shown/required",
      budget: "shown/required",
      procurement_contact: "hidden/optional",
      notes: "shown/optional",
    },
  );
}

console.log("\na hidden field is not an input, and its answer is not lost");
{
  // Somebody said yes, typed 60000, then changed their mind to "not yet". The
  // budget is no longer asked — so the rule that reads it must not fire — and
  // the 60000 they typed must not disappear.
  const values = { work_email: "a@b.test", has_budget: "no", budget: "60000" };
  const evaluation = evaluateRules(QUALIFY, values);

  t("the field the rules stopped asking for is hidden", evaluation.fields.budget.visible, false);
  t(
    "a rule reading it sees nothing, so the second step does not fire",
    evaluation.fields.procurement_contact.visible,
    false,
  );
  t(
    "and nothing downstream is required off the back of an answer nobody was asked for",
    evaluation.fields.procurement_contact.required,
    false,
  );
  t("the answer is named as kept", evaluation.answeredWhileHidden, ["budget"]);
  t("the evaluator did not touch the values it was given", values, {
    work_email: "a@b.test",
    has_budget: "no",
    budget: "60000",
  });

  const validation = validateSubmission(QUALIFY, values);
  t("the submission is still valid", validation.valid, true);
  const warning = validation.warnings.find((issue) => issue.field === "budget");
  ok("and it carries a warning about the kept answer", warning?.code === "answered_hidden_field");
  ok(
    "which says the value is stored",
    (warning?.message ?? "").includes("stored as-is"),
    warning?.message,
  );

  // The one thing that must never happen: an answer becoming an error.
  t("nothing about it is an error, in any mode", validation.errors, []);
}

console.log("\nconditional requirement, enforced on the server");
{
  const missing = validateSubmission(QUALIFY, {
    work_email: "a@b.test",
    has_budget: "yes",
  });
  const error = missing.errors.find((issue) => issue.field === "budget");
  ok("a rule-required field that arrived empty is an error", error?.code === "missing_required");
  ok(
    "and the message names the rule that required it",
    (error?.message ?? "").includes("rule 1"),
    error?.message,
  );

  const fine = validateSubmission(QUALIFY, { work_email: "a@b.test", has_budget: "no" });
  t(
    "the same field empty under the other answer is not an error at all",
    fine.errors,
    [],
  );
  ok(
    "and not a warning either — it was simply not asked",
    !fine.warnings.some((issue) => issue.field === "budget"),
    fine.warnings,
  );
}

console.log("\nthe browser and the server agree on identical answers");
{
  // What a browser posts: everything is a string, and an unticked box sends
  // nothing. What an agent sends: real JSON types. `prepareSubmission` is the
  // one place the second is turned into the first, so running the evaluator
  // over both has to give the same answer — otherwise a rule fires for a person
  // and not for an agent filling in the same form.
  const fromBrowser = { work_email: "a@b.test", has_budget: "yes", budget: "60000" };
  const fromAgent = prepareSubmission(QUALIFY, {
    work_email: "a@b.test",
    has_budget: "yes",
    budget: 60000,
  });

  t("the agent's arguments coerce to what a browser would have posted", fromAgent.values, fromBrowser);
  t(
    "so the field states are identical",
    evaluateRules(QUALIFY, fromAgent.values).fields,
    evaluateRules(QUALIFY, fromBrowser).fields,
  );
  t("and so is the whole trace", evaluateRules(QUALIFY, fromAgent.values).trace, evaluateRules(QUALIFY, fromBrowser).trace);
  // The agent's own call is refused for the same reason a person's would be: a
  // budget that large makes `procurement_contact` required, and the agent did
  // not send one. The rejection names the rule, so a corrected call is one
  // round trip away — which is the whole argument for enforcing conditional
  // requirements server-side rather than pretending JSON Schema can hold them.
  t(
    "a conditional requirement is enforced on the agent surface too",
    fromAgent.errors.map((issue) => `${issue.field}:${issue.code}`),
    ["procurement_contact:missing_required"],
  );
  ok(
    "and the rejection names the rule that caused it",
    fromAgent.errors[0].message.includes("rule 2"),
    fromAgent.errors[0].message,
  );
  t(
    "sending it is accepted",
    prepareSubmission(QUALIFY, {
      work_email: "a@b.test",
      has_budget: "yes",
      budget: 60000,
      procurement_contact: "buyer@b.test",
    }).errors,
    [],
  );

  // Determinism, said out loud: the same inputs twice are the same object.
  t(
    "evaluating twice gives byte-identical results",
    JSON.stringify(evaluateRules(QUALIFY, fromBrowser)),
    JSON.stringify(evaluateRules(QUALIFY, fromBrowser)),
  );
}

console.log("\nevaluation order is dependency order, and it is reported");
{
  // The rules are written in the order a person thinks of them, which is not
  // the order they can be read in: rule 1 reads `country`, which rule 2 hides.
  const reordered = doc({
    fields: [
      { key: "region", label: "Region", type: "text" },
      { key: "country", label: "Country", type: "text" },
      { key: "vat", label: "VAT number", type: "text" },
    ],
    rules: [
      {
        when: { all: [{ field: "country", op: "equals", value: "de" }] },
        then: [{ action: "show", field: "vat" }],
      },
      {
        when: { all: [{ field: "region", op: "equals", value: "us" }] },
        then: [{ action: "hide", field: "country" }],
      },
    ],
  });

  t(
    "the rule that hides a field runs before the rule that reads it",
    evaluationOrder(reordered.rules ?? [], reordered.fields.map((field) => field.key)),
    [1, 0],
  );

  const inspection = inspectRules(reordered, { region: "us", country: "de" });
  t("the inspector says the order was not the written one", inspection.reordered, true);
  t(
    "hiding `country` stops `vat` being shown, even though `country` still holds \"de\"",
    inspection.fields.find((field) => field.key === "vat")?.visible,
    false,
  );
  t(
    "and the answer to the hidden field is still shown as held",
    inspection.fields.find((field) => field.key === "country")?.answer,
    ["de"],
  );
}

console.log("\ncycles are refused before they can be published");
{
  const circular = {
    fields: [
      { key: "a", label: "A", type: "text" },
      { key: "b", label: "B", type: "text" },
    ],
    rules: [
      {
        when: { all: [{ field: "b", op: "is_not_empty" }] },
        then: [{ action: "hide", field: "a" }],
      },
      {
        when: { all: [{ field: "a", op: "is_not_empty" }] },
        then: [{ action: "hide", field: "b" }],
      },
    ],
  };

  const errors = refused(circular);
  ok("a two-rule circle does not parse", errors.length > 0);
  ok(
    "and the message names both fields in the loop",
    errors.some((message) => message.includes('"a"') && message.includes('"b"')),
    errors,
  );

  const selfReferential = refused({
    fields: [{ key: "a", label: "A", type: "text" }],
    rules: [
      {
        when: { all: [{ field: "a", op: "is_empty" }] },
        then: [{ action: "hide", field: "a" }],
      },
    ],
  });
  ok("a rule that hides the field it reads is the same fault", selfReferential.length > 0);

  // A `require` action cannot take part in a cycle, because nothing reads
  // requiredness. This must stay publishable or half the useful rules die.
  const requireLoop = parseSchemaDocument({
    fields: [
      { key: "a", label: "A", type: "text" },
      { key: "b", label: "B", type: "text" },
    ],
    rules: [
      {
        when: { all: [{ field: "b", op: "is_not_empty" }] },
        then: [{ action: "require", field: "a" }],
      },
      {
        when: { all: [{ field: "a", op: "is_not_empty" }] },
        then: [{ action: "require", field: "b" }],
      },
    ],
  });
  ok("two rules requiring each other's field is not a cycle", requireLoop.ok, requireLoop);

  t(
    "findCycle agrees with the parser",
    findCycle(
      [
        { when: { all: [{ field: "b", op: "is_not_empty" }] }, then: [{ action: "hide", field: "a" }] },
        { when: { all: [{ field: "a", op: "is_not_empty" }] }, then: [{ action: "hide", field: "b" }] },
      ],
      ["a", "b"],
    ),
    ["a", "b", "a"],
  );
}

console.log("\ncontradictions");
{
  const both = refused({
    fields: [
      {
        key: "plan",
        label: "Plan",
        type: "select",
        options: [
          { value: "free", label: "Free" },
          { value: "paid", label: "Paid" },
        ],
      },
      { key: "seats", label: "Seats", type: "number" },
    ],
    rules: [
      {
        when: {
          all: [
            { field: "plan", op: "equals", value: "free" },
            { field: "plan", op: "equals", value: "paid" },
          ],
        },
        then: [{ action: "show", field: "seats" }],
      },
    ],
  });
  ok("a field asked to equal two values at once does not parse", both.length > 0, both);

  const goneOption = refused({
    fields: [
      {
        key: "plan",
        label: "Plan",
        type: "select",
        options: [{ value: "free", label: "Free" }],
      },
      { key: "seats", label: "Seats", type: "number" },
    ],
    rules: [
      {
        when: { all: [{ field: "plan", op: "equals", value: "enterprise" }] },
        then: [{ action: "show", field: "seats" }],
      },
    ],
  });
  ok(
    "a rule written against an option value that no longer exists does not parse",
    goneOption.length > 0,
    goneOption,
  );

  const impossibleRange = refused({
    fields: [
      { key: "seats", label: "Seats", type: "number" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    rules: [
      {
        when: {
          all: [
            { field: "seats", op: "gt", value: 100 },
            { field: "seats", op: "lt", value: 10 },
          ],
        },
        then: [{ action: "show", field: "notes" }],
      },
    ],
  });
  ok("a numeric window with no numbers in it does not parse", impossibleRange.length > 0);

  const emptyAndFull = refused({
    fields: [
      { key: "a", label: "A", type: "text" },
      { key: "b", label: "B", type: "text" },
    ],
    rules: [
      {
        when: {
          all: [
            { field: "a", op: "is_empty" },
            { field: "a", op: "equals", value: "x" },
          ],
        },
        then: [{ action: "show", field: "b" }],
      },
    ],
  });
  ok("unanswered and equal-to-something at once does not parse", emptyAndFull.length > 0);

  // The same contradiction inside an `or` is one dead branch, not a dead rule.
  const deadBranch = parseSchemaDocument({
    fields: [
      { key: "a", label: "A", type: "text" },
      { key: "b", label: "B", type: "text" },
    ],
    rules: [
      {
        when: {
          any: [
            { all: [{ field: "a", op: "is_empty" }, { field: "a", op: "equals", value: "x" }] },
            { field: "a", op: "equals", value: "y" },
          ],
        },
        then: [{ action: "show", field: "b" }],
      },
    ],
  });
  ok("a dead branch of an `or` still parses", deadBranch.ok, deadBranch);
  if (deadBranch.ok) {
    const analysis = analyzeRules(deadBranch.document);
    t("and is reported as a warning", analysis.errors.length, 0);
    ok(
      "which names it as a branch rather than the rule",
      analysis.warnings.some((issue) => issue.code === "dead_branch"),
      analysis.warnings,
    );
  }

  // Hiding and requiring the same field is satisfiable, does nothing, and is
  // therefore a warning. It must not block anybody's publish.
  const hideAndRequire = parseSchemaDocument({
    fields: [
      { key: "a", label: "A", type: "text" },
      { key: "b", label: "B", type: "text" },
    ],
    rules: [
      {
        when: { all: [{ field: "a", op: "equals", value: "x" }] },
        then: [
          { action: "hide", field: "b" },
          { action: "require", field: "b" },
        ],
      },
    ],
  });
  ok("hiding and requiring one field parses", hideAndRequire.ok, hideAndRequire);
  if (hideAndRequire.ok) {
    const analysis = analyzeRules(hideAndRequire.document);
    t("with no errors", analysis.errors.length, 0);
    ok(
      "and a warning saying the requirement never takes effect",
      analysis.warnings.some((issue) => issue.code === "hide_and_require"),
      analysis.warnings,
    );
    const evaluation = evaluateRules(hideAndRequire.document, { a: "x" });
    t("and it really does not", evaluation.fields.b.required, false);
  }
}

console.log("\na rule pointing at a field that is not there");
{
  const dangling = {
    fields: [
      { key: "a", label: "A", type: "text" },
      { key: "b", label: "B", type: "text" },
    ],
    rules: [
      {
        when: { all: [{ field: "deleted_yesterday", op: "is_empty" }] },
        then: [{ action: "hide", field: "b" }],
      },
    ],
  };

  const errors = refused(dangling);
  ok("it does not parse", errors.length > 0);
  ok(
    "and the message names the field it cannot find",
    errors.some((message) => message.includes("deleted_yesterday")),
    errors,
  );

  // A version published before the field was deleted can still be stored, so
  // the evaluator has to survive it. The rule is skipped **whole** — not
  // applied with the missing field read as empty, which would have fired it and
  // quietly hidden `b` on every submission from that moment on.
  const stored = readStoredDocument(dangling);
  ok("but a stored version of it still reads", stored !== null);
  if (stored) {
    const evaluation = evaluateRules(stored, {});
    t("the rule is skipped rather than fired", evaluation.trace[0].status, "skipped");
    t("so nothing is hidden", evaluation.fields.b.visible, true);
    ok(
      "and the trace says why",
      (evaluation.trace[0].skippedReason ?? "").includes("deleted_yesterday"),
      evaluation.trace[0].skippedReason,
    );
  }
}

console.log("\nthe agent-callable tool");
{
  const bare = doc({
    name: "Demo request",
    fields: [
      { key: "work_email", label: "Work email", type: "email", required: true },
      {
        key: "has_budget",
        label: "Budget approved?",
        type: "select",
        required: true,
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "Not yet" },
        ],
      },
      { key: "budget", label: "Budget", type: "number" },
    ],
  });

  const ruled = doc({
    name: "Demo request",
    fields: bare.fields,
    rules: [
      {
        when: { all: [{ field: "has_budget", op: "equals", value: "yes" }] },
        then: [{ action: "require", field: "budget" }],
      },
    ],
  });

  const bareTool = buildToolDefinition(bare, CONTEXT);
  const ruledTool = buildToolDefinition(ruled, CONTEXT);

  // The decision this file exists to pin down. JSON Schema cannot say "required
  // when `has_budget` is `yes`" in the subset we publish, so it is not said
  // there: `required` keeps meaning "this call is refused without it".
  t(
    "a conditionally required field is not in `required`",
    ruledTool.inputSchema.required,
    ["work_email", "has_budget"],
  );
  t(
    "which is the same list the form without any rules produces",
    ruledTool.inputSchema.required,
    bareTool.inputSchema.required,
  );

  const description = ruledTool.inputSchema.properties?.budget.description ?? "";
  ok("the rule is stated in the field's description instead", description.includes("Required when"));
  ok(
    "naming the field by the key an agent can actually send",
    description.includes('"has_budget"') && description.includes('"yes"'),
    description,
  );
  ok(
    "and saying where it is enforced, so it is not mistaken for a schema keyword",
    description.includes("when the submission is read"),
    description,
  );

  // The positive control. Without it, the two assertions above would pass just
  // as well against a projection that had stopped reading the ruleset at all.
  ok(
    "a form with rules produces a different tool from one without",
    JSON.stringify(ruledTool) !== JSON.stringify(bareTool),
  );
  ok(
    "and the tool's own description says the form has conditional logic",
    ruledTool.description.includes("conditional logic"),
    ruledTool.description,
  );

  // The ruleset is described, never encoded. An agent must not be handed a
  // structure it would have to implement an evaluator for.
  const serialized = JSON.stringify(ruledTool);
  t("no rule structure leaks into the tool", serialized.includes('"then"'), false);
  t("nor the condition operators", serialized.includes('"op"'), false);
  t("nor the join keyword", serialized.includes('"all"'), false);

  // A field declared required that a rule can *hide* is the mirror image: it is
  // required most of the time and omittable when the form is not asking for it,
  // so it cannot be declared unconditionally required either.
  const hideable = doc({
    fields: [
      {
        key: "has_budget",
        label: "Budget approved?",
        type: "select",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "Not yet" },
        ],
      },
      { key: "budget", label: "Budget", type: "number", required: true },
    ],
    rules: [
      {
        when: { all: [{ field: "has_budget", op: "equals", value: "no" }] },
        then: [{ action: "hide", field: "budget" }],
      },
    ],
  });
  const hideableTool = buildToolDefinition(hideable, CONTEXT);
  t("a required field a rule can hide is left out of `required`", hideableTool.inputSchema.required, []);
  ok(
    "and says so in prose",
    (hideableTool.inputSchema.properties?.budget.description ?? "").includes("Conditional"),
    hideableTool.inputSchema.properties?.budget.description,
  );

  // The same predicate governs the HTML attribute. If these two ever disagree,
  // the hosted page and the tool have started describing different forms.
  for (const field of hideable.fields) {
    t(
      `\`required\` in the markup matches the tool for "${field.key}"`,
      summarizeFieldRules(hideable, field).alwaysRequired,
      (hideableTool.inputSchema.required ?? []).includes(field.key),
    );
  }
  ok(
    "and the field's own declaration alone would have said otherwise",
    nativeConstraints(hideable.fields[1]).required === true &&
      !(hideableTool.inputSchema.required ?? []).includes("budget"),
  );
}

console.log("\nthe inspector");
{
  const inspection = inspectRules(QUALIFY, { has_budget: "yes", budget: "60000" });

  t("every rule is accounted for", inspection.rules.length, 2);
  t("in the order they ran", inspection.rules.map((rule) => rule.position), [1, 2]);
  t("both fired", inspection.rules.map((rule) => rule.status), ["matched", "matched"]);
  t(
    "each rule is summarised in one sentence",
    inspection.rules[0].summary,
    describeRule((QUALIFY.rules ?? [])[0]),
  );
  t(
    "every condition reports the value it read",
    inspection.rules[1].conditions.map((line) => line.read),
    [[], ["60000"]],
  );
  ok(
    "and the effects say what actually applied",
    inspection.rules[0].effects.every((effect) => effect.applied),
    inspection.rules[0].effects,
  );

  const notFired = inspectRules(QUALIFY, { has_budget: "no" });
  const second = notFired.rules.find((rule) => rule.index === 1);
  t("a rule that did not fire says so", second?.status, "not_matched");
  ok(
    "and its condition says the field it read was hidden",
    (second?.conditions[1]?.note ?? "").includes("hidden"),
    second?.conditions,
  );
  ok(
    "the field panel explains the hiding without reading the ruleset",
    (notFired.fields.find((field) => field.key === "budget")?.visibilityNote ?? "").includes(
      "Hidden until a rule shows it",
    ),
    notFired.fields,
  );
}

console.log("\nstoring and reading a ruleset");
{
  const round = serializeSchemaDocument(QUALIFY);
  t("rules survive serialisation", round.rules?.length, 2);
  t("and reading back", readStoredDocument(round)?.rules, QUALIFY.rules);

  const noRules = serializeSchemaDocument(
    doc({ fields: [{ key: "a", label: "A", type: "text" }] }),
  );
  // A form without conditional logic must serialise to exactly the bytes it did
  // before #36, or every stored schema looks edited the first time it is opened.
  t("a form with no rules gets no `rules` key at all", "rules" in noRules, false);

  // Rules are all-or-nothing, unlike fields: a ruleset with one rule missing is
  // a form behaving in a way nobody authored.
  const halfBroken = readStoredDocument({
    fields: [
      { key: "a", label: "A", type: "text" },
      { key: "b", label: "B", type: "text" },
    ],
    rules: [
      { when: { all: [{ field: "a", op: "equals", value: "x" }] }, then: [{ action: "hide", field: "b" }] },
      { when: { all: [{ field: "a", op: "not_a_real_operator", value: "x" }] }, then: [] },
    ],
  });
  ok("a document with one unreadable rule still reads", halfBroken !== null);
  t("but the whole ruleset is dropped rather than half-applied", halfBroken?.rules, undefined);
  t("so every field is shown", evaluateRules(halfBroken!, { a: "x" }).fields.b.visible, true);

  // An unknown key on a rule is stripped on the stored path, the way unknown
  // keys are everywhere else in `readStoredDocument`... except that it is not:
  // rules are strict, and an unrecognised key means this build does not
  // understand the rule it is about to run.
  const unknownKey = readStoredDocument({
    fields: [
      { key: "a", label: "A", type: "text" },
      { key: "b", label: "B", type: "text" },
    ],
    rules: [
      {
        when: { all: [{ field: "a", op: "equals", value: "x" }] },
        then: [{ action: "hide", field: "b" }],
        unless: "something a newer build understands",
      },
    ],
  });
  t("a rule with a key this build does not know drops the ruleset", unknownKey?.rules, undefined);
}

console.log("\nnesting, and the bar #36 sets");
{
  // "A 20-condition form with nested groups evaluates correctly."
  const nested = doc({
    fields: [
      { key: "role", label: "Role", type: "text" },
      { key: "size", label: "Company size", type: "number" },
      { key: "region", label: "Region", type: "text" },
      { key: "callback", label: "Phone", type: "phone" },
    ],
    rules: [
      {
        label: "Enterprise routing",
        when: {
          any: [
            {
              all: [
                { field: "role", op: "contains", value: "vp" },
                { field: "size", op: "gte", value: 500 },
              ],
            },
            {
              all: [
                { field: "region", op: "equals", value: "emea" },
                { field: "size", op: "gt", value: 1000 },
              ],
            },
          ],
        },
        then: [{ action: "show", field: "callback" }],
      },
    ],
  });

  t(
    "the first branch alone is enough",
    evaluateRules(nested, { role: "VP Marketing", size: "600" }).fields.callback.visible,
    true,
  );
  t(
    "the second branch alone is enough",
    evaluateRules(nested, { region: "EMEA", size: "2000" }).fields.callback.visible,
    true,
  );
  t(
    "half of each branch is not",
    evaluateRules(nested, { role: "VP Marketing", size: "20", region: "emea" }).fields.callback
      .visible,
    false,
  );

  const lines = inspectRules(nested, { role: "VP Marketing", size: "20" }).rules[0].conditions;
  t("the inspector indents the tree it walked", lines.map((line) => line.depth), [0, 1, 2, 2, 1, 2, 2]);
  t(
    "and marks exactly the conditions that held",
    lines.filter((line) => line.kind === "condition").map((line) => line.matched),
    [true, false, false, false],
  );

  // Case and surrounding space are not a rule anybody wrote. "Yes" and "yes"
  // are the same answer to the person filling the form in, and #36 opens with
  // a complaint about logic that "never works right".
  t(
    "comparison is case-insensitive and trimmed",
    evaluateRules(nested, { role: "  vp of sales ", size: "900" }).fields.callback.visible,
    true,
  );
}

console.log("\nthe DOM hooks are not exported from a client module");
{
  // This is a guard against a bug that shipped a page which looked perfectly
  // correct and carried none of the hooks the enhancement queries, with no
  // error anywhere: `form-view.tsx` is a Server Component, and **every** export
  // of a `"use client"` module — not only its components — is replaced by an
  // opaque client reference when the server imports it. A string constant read
  // that way is a proxy, and `{...{ [proxy]: "" }}` is an attribute name nobody
  // will ever select.
  //
  // Source-level rather than behavioural because `node --experimental-strip-types`
  // does not compile JSX, so the rendered markup cannot be asserted here. The
  // rule it protects is worth stating anyway: a value shared between a Server
  // Component and a Client Component belongs to neither of them.
  const attributes = readFileSync(
    new URL("../src/lib/rules/attributes.ts", import.meta.url),
    "utf8",
  );
  const view = readFileSync(
    new URL("../src/components/render/form-view.tsx", import.meta.url),
    "utf8",
  );
  const runtime = readFileSync(
    new URL("../src/components/render/form-rules.tsx", import.meta.url),
    "utf8",
  );

  // The directive, not the words: this file discusses `"use client"` at length
  // in its own comment, and a substring search would match that.
  t(
    "the module holding them is not a client module",
    attributes.trimStart().startsWith('"use client"'),
    false,
  );
  t("while the enhancement is one", runtime.trimStart().startsWith('"use client"'), true);
  ok(
    "it declares all three hooks",
    ["FORM_ATTRIBUTE", "FIELD_ATTRIBUTE", "REQUIRED_MARK_ATTRIBUTE"].every((name) =>
      attributes.includes(`export const ${name}`),
    ),
  );
  ok(
    "the server component reads them from there",
    view.includes('from "@/lib/rules/attributes"'),
  );
  ok(
    "and imports nothing but the component itself from the client module",
    /import \{ FormRules \} from "\.\/form-rules";/.test(view),
    view.match(/import[^;]*form-rules[^;]*;/)?.[0],
  );
  ok(
    "which no longer re-exports them",
    !/export const (FORM|FIELD|REQUIRED_MARK)_ATTRIBUTE/.test(runtime),
  );
}

// ---------------------------------------------------------------------------

console.log(`\nrules: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
