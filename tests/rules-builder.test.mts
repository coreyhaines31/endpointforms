/**
 * Editing conditional logic (#36), without a browser.
 *
 * The builder's half of #36 is a pure function from what somebody typed to a
 * ruleset the rest of the system already understands, so it is testable the way
 * `builder-state.test.mts` tests the field editor — by loading the module
 * directly.
 *
 * Two things are worth more than the rest here:
 *
 *   1. **A rule the editor cannot draw must round-trip untouched.** The format
 *      nests condition groups arbitrarily; the editor draws one level. If
 *      opening a hand-written nested rule and pressing Publish quietly
 *      flattened it, we would have rewritten somebody's logic without saying so.
 *   2. **Every complaint comes from the analyser, attributed to a row.** The
 *      editor is not allowed a second opinion about what is publishable.
 *
 * `node --experimental-strip-types tests/rules-builder.test.mts`.
 */

import {
  draftIssues,
  fromDocument,
  parseDraft,
  previewDocument,
  toSchemaDocument,
  type DraftDocument,
} from "../src/components/app/builder/state.ts";
import {
  newDraftAction,
  newDraftCondition,
  newDraftRule,
  ruleIssues,
  summarizeDraftRule,
  toRules,
} from "../src/components/app/builder/rules-state.ts";
import { parseSchemaDocument, type FormSchemaDocument } from "../src/lib/schema/format.ts";

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

const FIELDS = [
  {
    key: "has_budget",
    label: "Budget approved?",
    type: "select",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "Not yet" },
    ],
  },
  { key: "budget", label: "Budget", type: "number" },
  { key: "notes", label: "Notes", type: "textarea" },
];

console.log("\nopening a stored ruleset and putting it back");
{
  const stored = doc({
    name: "Demo request",
    fields: FIELDS,
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
        when: { any: [{ field: "budget", op: "gte", value: 50000 }] },
        then: [{ action: "hide", field: "notes" }],
      },
    ],
  });

  const draft = fromDocument(stored);
  t("both rules open in the editor", draft.rules.length, 2);
  t("the label comes across", draft.rules[0].label, "Ask for the number");
  t("so does the join", draft.rules.map((rule) => rule.join), ["all", "any"]);
  t("and every condition", draft.rules[0].conditions.map((condition) => condition.field), [
    "has_budget",
  ]);
  t(
    "a numeric comparison is held as text while editing",
    draft.rules[1].conditions[0].value,
    "50000",
  );
  t("and neither rule needed the read-only fallback", draft.rules.map((rule) => rule.raw), [
    null,
    null,
  ]);

  const back = parseDraft(draft);
  ok("what comes back parses", back.ok, back);
  if (back.ok) {
    t("byte for byte, including the number that was held as text", back.document.rules, stored.rules);
  }
}

console.log("\na rule the editor cannot draw is not flattened");
{
  // Nested groups are legal in the format and this editor draws one level of
  // them. Flattening `(a and b) or c` into a flat list would change what it
  // means, silently, on somebody else's form.
  const nested = doc({
    fields: FIELDS,
    rules: [
      {
        when: {
          any: [
            {
              all: [
                { field: "has_budget", op: "equals", value: "yes" },
                { field: "budget", op: "gte", value: 500 },
              ],
            },
            { field: "budget", op: "gte", value: 50000 },
          ],
        },
        then: [{ action: "show", field: "notes" }],
      },
    ],
  });

  const draft = fromDocument(nested);
  ok("it is held as written rather than as conditions", draft.rules[0].raw !== null);
  t("with nothing pretending to be editable", draft.rules[0].conditions, []);

  const back = parseDraft(draft);
  ok("it still parses", back.ok, back);
  if (back.ok) t("and it round-trips untouched", back.document.rules, nested.rules);
}

console.log("\nwhat the editor writes");
{
  const rule = newDraftRule("r1", {
    label: "  Qualification  ",
    join: "all",
    conditions: [
      newDraftCondition("c1", { field: "has_budget", op: "equals", value: "yes" }),
      newDraftCondition("c2", { field: "budget", op: "gte", value: " 5000 " }),
      newDraftCondition("c3", { field: "notes", op: "is_not_empty", value: "leftover" }),
    ],
    actions: [newDraftAction("a1", { action: "require", field: "budget" })],
  });

  t("the ruleset is shaped the way the format reads it", toRules([rule]), [
    {
      when: {
        all: [
          { field: "has_budget", op: "equals", value: "yes" },
          // Stored as a number, because the analyser's range check reads the
          // stored value and `5000` is easier to read than `"5000"`.
          { field: "budget", op: "gte", value: 5000 },
          // The value box is not cleared when somebody switches to an operator
          // that takes no value, because switching back should not lose what
          // they typed. It is dropped on the way out instead.
          { field: "notes", op: "is_not_empty" },
        ],
      },
      then: [{ action: "require", field: "budget" }],
      label: "Qualification",
    },
  ]);

  t(
    "a rule reads as one sentence",
    summarizeDraftRule(rule),
    'When "has_budget" is "yes" and "budget" is at least "5000" and "notes" is answered, require "budget".',
  );
}

console.log("\nissues land on the row that caused them");
{
  const fields = doc({ fields: FIELDS }).fields;

  const dangling = newDraftRule("r1", {
    conditions: [newDraftCondition("c1", { field: "deleted_yesterday", op: "equals", value: "x" })],
    actions: [newDraftAction("a1", { action: "hide", field: "notes" })],
  });
  const issues = ruleIssues(fields, [dangling]);
  t("a rule naming a field nobody collects is an error", issues[0]?.severity, "error");
  t("attributed to that rule", issues[0]?.ruleId, "r1");
  t("and never to a field", issues[0]?.fieldId, null);

  const circle = [
    newDraftRule("r1", {
      conditions: [newDraftCondition("c1", { field: "budget", op: "is_not_empty", value: "" })],
      actions: [newDraftAction("a1", { action: "hide", field: "notes" })],
    }),
    newDraftRule("r2", {
      conditions: [newDraftCondition("c2", { field: "notes", op: "is_not_empty", value: "" })],
      actions: [newDraftAction("a2", { action: "hide", field: "budget" })],
    }),
  ];
  const cycle = ruleIssues(fields, circle);
  ok(
    "a circle is reported against the ruleset rather than one rule",
    cycle.some((issue) => issue.ruleId === null && issue.severity === "error"),
    cycle,
  );

  const blank = ruleIssues(fields, [newDraftRule("r1")]);
  ok(
    "a rule with nothing in it cannot be published",
    blank.some((issue) => issue.severity === "error"),
    blank,
  );

  const halfTyped = ruleIssues(fields, [
    newDraftRule("r1", {
      conditions: [newDraftCondition("c1", { field: "", op: "equals", value: "" })],
      actions: [newDraftAction("a1", { action: "show", field: "notes" })],
    }),
  ]);
  ok(
    "so cannot a condition with no field chosen yet",
    halfTyped.some((issue) => issue.severity === "error" && issue.ruleId === "r1"),
    halfTyped,
  );

  const fine = ruleIssues(fields, [
    newDraftRule("r1", {
      conditions: [newDraftCondition("c1", { field: "has_budget", op: "equals", value: "yes" })],
      actions: [newDraftAction("a1", { action: "show", field: "budget" })],
    }),
  ]);
  t("a rule that is fine produces nothing at all", fine, []);
}

console.log("\ndeleting a field a rule uses");
{
  // The one that actually happens: somebody removes a field and the rule that
  // referenced it goes quietly wrong. It has to become an error on the
  // keystroke, not at publish time and not on a visitor's submission.
  const draft: DraftDocument = fromDocument(
    doc({
      fields: FIELDS,
      rules: [
        {
          when: { all: [{ field: "has_budget", op: "equals", value: "yes" }] },
          then: [{ action: "show", field: "budget" }],
        },
      ],
    }),
  );

  const before = draftIssues(draft, []);
  t("nothing wrong to begin with", before.filter((issue) => issue.severity === "error"), []);

  const without: DraftDocument = {
    ...draft,
    fields: draft.fields.filter((field) => field.key !== "has_budget"),
  };
  const after = draftIssues(without, []);
  const error = after.find((issue) => issue.severity === "error");
  ok("deleting the field the rule reads is an error", error !== undefined, after);
  ok("named against the rule, not the field list", error?.ruleId === draft.rules[0].id, error);
  ok(
    "and the message says which name it cannot find",
    (error?.message ?? "").includes("has_budget"),
    error?.message,
  );

  // Publishing is blocked through the mechanism that already existed: the
  // document does not parse.
  ok("the document itself refuses to parse", !parseDraft(without).ok);
}

console.log("\nthe preview and the inspector see the same document");
{
  const draft = fromDocument(
    doc({
      fields: FIELDS,
      rules: [
        {
          when: { all: [{ field: "has_budget", op: "equals", value: "yes" }] },
          then: [{ action: "show", field: "budget" }],
        },
      ],
    }),
  );

  const preview = previewDocument(draft);
  t("the preview carries the rules", preview.document.rules?.length, 1);
  t(
    "and they are the same rules the document would be published with",
    preview.document.rules,
    (parseSchemaDocument(toSchemaDocument(draft)) as { ok: true; document: FormSchemaDocument }).document.rules,
  );

  // A rule whose field does not parse cannot be silently dropped from the
  // preview either: the preview is evidence, and evidence that quietly differs
  // from the form is worse than none.
  const broken: DraftDocument = {
    ...draft,
    fields: draft.fields.map((field) =>
      field.key === "has_budget" ? { ...field, options: [] } : field,
    ),
  };
  const brokenPreview = previewDocument(broken);
  t("a field that does not parse is left out of the preview", brokenPreview.skipped, 1);
  ok(
    "and the rule that used it is still there, to be skipped and explained",
    (brokenPreview.document.rules?.length ?? 0) === 1,
    brokenPreview.document.rules,
  );
}

// ---------------------------------------------------------------------------

console.log(`\nrules builder: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
