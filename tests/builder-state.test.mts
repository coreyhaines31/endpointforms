/**
 * The builder's editing state (#35) — everything that needs no browser.
 *
 * The builder is the fourth producer of a `FormSchemaDocument`, and the only
 * one a person drives directly. So these tests are written from "what would
 * this screen let somebody do to a form that is already collecting leads?"
 * rather than from the function list:
 *
 *   - **A round trip must not change anything.** Opening a published schema in
 *     the editor and saving it untouched has to produce the same document. If
 *     it does not, then simply looking at a form republishes a subtly different
 *     one, and every consumer — the hosted page, the agent tool, validation —
 *     moves under a customer who changed nothing.
 *   - **A rename must be reported.** The key is the HTML `name` attribute and
 *     the tool's argument name. Renaming one silently is the single most
 *     expensive thing this screen could do.
 *   - **Nothing is invented.** Every structural complaint has to come from
 *     `format.ts`, so the test asserts the builder agrees with the format
 *     rather than asserting a message the builder made up.
 *   - **A half-typed constraint is not a constraint.** `""`, `"-"` and `"1e"`
 *     all mean "still typing", and each of them becomes `0` or `NaN` under a
 *     careless `Number()` — which would quietly publish a minimum of zero.
 *
 * No database, no network: `node --experimental-strip-types`.
 */

import {
  parseSchemaDocument,
  serializeSchemaDocument,
  type FormSchemaDocument,
} from "../src/lib/schema/format.ts";
import { importSchemaFromHtml } from "../src/lib/schema/import-html.ts";
import { buildToolDefinition } from "../src/lib/manifest/tool.ts";
import {
  draftIssues,
  emptyDraft,
  fromDocument,
  moveField,
  newDraftField,
  parseDraft,
  previewDocument,
  suggestKey,
  toSchemaDocument,
  type DraftDocument,
} from "../src/components/app/builder/state.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    pass += 1;
    return;
  }
  fail += 1;
  console.error(`FAIL  ${name}\n        got  ${a}\n        want ${b}`);
};

const ok = (name: string, got: boolean) => t(name, got, true);

/** A document, parsed, or a thrown error naming the fixture that is wrong. */
function doc(input: unknown): FormSchemaDocument {
  const parsed = parseSchemaDocument(input);
  if (!parsed.ok) throw new Error(`fixture is not a valid schema: ${parsed.errors.join("; ")}`);
  return parsed.document;
}

function errorsFor(draft: DraftDocument, published: string[] = []): string[] {
  return draftIssues(draft, published)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
}

function warningsFor(draft: DraftDocument, published: string[] = []): string[] {
  return draftIssues(draft, published)
    .filter((issue) => issue.severity === "warning")
    .map((issue) => issue.message);
}

// ---------------------------------------------------------------------------
// The round trip
// ---------------------------------------------------------------------------

/**
 * The fixture is deliberately every shape the format has: a choice type with
 * options, both kinds of numeric bound, a date bound as a literal string, a
 * pattern, a help sentence, a placeholder and a hidden field. A round trip that
 * only survives text fields proves nothing.
 */
const RICH = doc({
  name: "Request a quote",
  fields: [
    { key: "email", label: "Work email", type: "email", required: true, placeholder: "you@company.com" },
    {
      key: "note",
      label: "What do you need?",
      type: "textarea",
      help: "A sentence is plenty.",
      validation: { minLength: 10, maxLength: 2000 },
    },
    {
      key: "budget",
      label: "Budget",
      type: "number",
      validation: { min: 500, max: 100000, step: 1 },
    },
    { key: "needed_by", label: "Needed by", type: "date", validation: { min: "2026-01-01" } },
    {
      key: "size",
      label: "Company size",
      type: "select",
      required: true,
      options: [
        { value: "1-10", label: "1–10" },
        { value: "11-50", label: "11–50" },
      ],
    },
    {
      key: "interests",
      label: "Interested in",
      type: "multi_select",
      options: [
        { value: "cnc", label: "CNC" },
        { value: "fab", label: "Fabrication" },
      ],
      validation: { minSelected: 1, maxSelected: 2 },
    },
    { key: "ref", label: "Referral code", type: "text", validation: { pattern: "[A-Z]{2}[0-9]{4}" } },
    { key: "source_page", label: "Source page", type: "hidden" },
  ],
});

{
  const draft = fromDocument(RICH);
  const parsed = parseDraft(draft);

  ok("a rich document survives being opened for editing", parsed.ok);

  if (parsed.ok) {
    t(
      "editing nothing changes nothing",
      serializeSchemaDocument(parsed.document),
      serializeSchemaDocument(RICH),
    );
  }

  t("a clean draft has no issues at all", draftIssues(draft, []), []);
  t("every field is drawn in the preview", previewDocument(draft).skipped, 0);
}

// ---------------------------------------------------------------------------
// The rename, which is the expensive edit
// ---------------------------------------------------------------------------

{
  const draft = fromDocument(RICH);
  const renamed: DraftDocument = {
    ...draft,
    fields: draft.fields.map((field) =>
      field.key === "email" ? { ...field, key: "work_email" } : field,
    ),
  };

  const warnings = warningsFor(renamed, ["email", "note"]);
  t("renaming a published key warns exactly once", warnings.length, 1);
  ok("the warning names both the old key and the new one", warnings[0].includes('"email"') && warnings[0].includes('"work_email"'));
  t("a rename is never an error", errorsFor(renamed, ["email", "note"]), []);

  // The same edit against an endpoint that has never published is not a
  // breaking change, because there is nothing out there posting the old name.
  t("renaming an unpublished key says nothing", warningsFor(renamed, []), []);
}

{
  // A deleted key breaks exactly as much markup as a renamed one, and there is
  // no row left to attach the warning to — so it is reported once, against the
  // document.
  const draft = fromDocument(RICH);
  const deleted: DraftDocument = {
    ...draft,
    fields: draft.fields.filter((field) => field.key !== "email"),
  };

  const warnings = warningsFor(deleted, ["email", "note"]);
  t("deleting a published key warns", warnings.length, 1);
  ok("the deletion warning names the key", warnings[0].includes('"email"'));
  t(
    "the deletion warning belongs to the document, not a field",
    draftIssues(deleted, ["email"]).filter((issue) => issue.severity === "warning")[0].fieldId,
    null,
  );
}

{
  // A rename must not be reported twice — once against the row and again as a
  // missing key. The second copy carries less information than the first.
  const draft = fromDocument(RICH);
  const renamed: DraftDocument = {
    ...draft,
    fields: draft.fields.map((field) =>
      field.key === "email" ? { ...field, key: "work_email" } : field,
    ),
  };
  t("a rename is not also reported as a deletion", warningsFor(renamed, ["email"]).length, 1);
}

// ---------------------------------------------------------------------------
// The builder never invents a rule
// ---------------------------------------------------------------------------

{
  // Every one of these is refused by `format.ts`. The assertion is that the
  // builder surfaces the format's own refusal rather than a rule of its own.
  const cases: { name: string; field: Partial<ReturnType<typeof newDraftField>> }[] = [
    { name: "a select with no options", field: { key: "size", type: "select" } },
    { name: "a pattern that does not compile", field: { key: "ref", type: "text", pattern: "[a-" } },
    {
      name: "a minLength above its maxLength",
      field: { key: "note", type: "text", minLength: "20", maxLength: "5" },
    },
    {
      name: "a min above its max",
      field: { key: "budget", type: "number", min: "100", max: "1" },
    },
  ];

  for (const { name, field } of cases) {
    const draft: DraftDocument = {
      name: "",
      fields: [newDraftField("f0", field)],
    };
    ok(`${name} is an error in the builder`, errorsFor(draft).length > 0);
    ok(`${name} is refused by the format too`, !parseDraft(draft).ok);
  }
}

{
  const draft: DraftDocument = {
    name: "",
    fields: [
      newDraftField("f0", { key: "email", type: "email" }),
      newDraftField("f1", { key: "email", type: "text" }),
    ],
  };
  ok("two fields sharing a name is an error", errorsFor(draft).length > 0);
  // Attributed to both rows: only one of them is wrong and the builder cannot
  // know which, so it says so on each rather than picking a victim.
  t(
    "a duplicate name is reported against both fields",
    new Set(draftIssues(draft, []).map((issue) => issue.fieldId)).size,
    2,
  );
  t("only one field is drawn in the preview", previewDocument(draft).document.fields.length, 1);
  t("the other is counted as skipped", previewDocument(draft).skipped, 1);
}

{
  // `gclid` is consumed by the ingest path before `values` is written, so a
  // schema field of that name would read as permanently missing.
  const draft: DraftDocument = {
    name: "",
    fields: [newDraftField("f0", { key: "gclid", label: "Click ID", type: "text" })],
  };
  ok("a reserved name is an error", errorsFor(draft).some((message) => message.includes("gclid")));
  // The format itself accepts it — this is the builder knowing a consequence
  // the format has no business knowing, which is the only kind of extra rule
  // it is allowed to have.
  ok("the format accepts it, which is why the builder has to say something", parseDraft(draft).ok);
}

{
  const draft: DraftDocument = {
    name: "",
    fields: [
      newDraftField("f0", {
        key: "interests",
        type: "multi_select",
        options: [{ id: "o0", value: "a", label: "A" }],
        minSelected: "3",
        maxSelected: "1",
      }),
    ],
  };
  ok(
    "an unsatisfiable selection count is an error",
    errorsFor(draft).some((message) => message.includes("Nothing can satisfy both")),
  );
}

// ---------------------------------------------------------------------------
// Half-typed constraints
// ---------------------------------------------------------------------------

{
  const blank: DraftDocument = {
    name: "",
    fields: [
      newDraftField("f0", {
        key: "note",
        label: "Note",
        type: "text",
        minLength: "",
        maxLength: "  ",
        pattern: "   ",
      }),
    ],
  };

  const parsed = parseDraft(blank);
  ok("a field with every box left blank is valid", parsed.ok);
  if (parsed.ok) {
    t(
      "and carries no validation object at all",
      parsed.document.fields[0].validation,
      undefined,
    );
  }
}

{
  for (const partial of ["-", "1e", "e5", "+", "."]) {
    const draft: DraftDocument = {
      name: "",
      fields: [newDraftField("f0", { key: "budget", label: "Budget", type: "number", min: partial })],
    };
    const parsed = parseDraft(draft);
    ok(`"${partial}" mid-type is not yet a minimum`, parsed.ok);
    if (parsed.ok) {
      t(`"${partial}" sets no bound`, parsed.document.fields[0].validation, undefined);
    }
  }
}

{
  // Zero is a real minimum and must survive. The whole reason the boxes hold
  // strings is so that "" and "0" stay different.
  const draft: DraftDocument = {
    name: "",
    fields: [newDraftField("f0", { key: "qty", label: "Qty", type: "number", min: "0" })],
  };
  const parsed = parseDraft(draft);
  ok("zero parses", parsed.ok);
  if (parsed.ok) t("zero is kept as a minimum", parsed.document.fields[0].validation?.min, 0);
}

{
  // A date bound is the literal a `<input type="date" min>` carries. Turning it
  // into a number would store a timestamp nobody typed, which `controls.ts`
  // then refuses to emit.
  const draft: DraftDocument = {
    name: "",
    fields: [
      newDraftField("f0", { key: "when", label: "When", type: "date", min: "2026-03-01" }),
    ],
  };
  const parsed = parseDraft(draft);
  ok("a date bound parses", parsed.ok);
  if (parsed.ok) {
    t("a date bound stays a string", parsed.document.fields[0].validation?.min, "2026-03-01");
  }
}

{
  // A constraint the renderer would discard must not be offered, and must not
  // be published if it somehow is: `controls.ts` only puts `pattern` on text,
  // email and phone.
  const draft: DraftDocument = {
    name: "",
    fields: [
      newDraftField("f0", {
        key: "note",
        label: "Note",
        type: "textarea",
        pattern: "[A-Z]+",
      }),
    ],
  };
  const parsed = parseDraft(draft);
  ok("a textarea parses", parsed.ok);
  if (parsed.ok) {
    t(
      "a pattern the renderer would drop is never written",
      parsed.document.fields[0].validation,
      undefined,
    );
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

{
  const draft: DraftDocument = {
    name: "",
    fields: [
      newDraftField("f0", {
        key: "size",
        label: "Size",
        type: "select",
        options: [
          { id: "o0", value: "small", label: "" },
          { id: "o1", value: "large", label: "Large" },
        ],
      }),
    ],
  };
  const parsed = parseDraft(draft);
  ok("an unlabelled option is allowed", parsed.ok);
  if (parsed.ok) {
    t(
      "and reads as its own value rather than as a gap",
      parsed.document.fields[0].options?.[0].label,
      "small",
    );
  }
}

{
  const draft: DraftDocument = {
    name: "",
    fields: [
      newDraftField("f0", {
        key: "size",
        type: "select",
        options: [
          { id: "o0", value: "same", label: "One" },
          { id: "o1", value: "same", label: "Two" },
        ],
      }),
    ],
  };
  ok("two options with the same value is an error", errorsFor(draft).length > 0);
}

// ---------------------------------------------------------------------------
// Moving fields
// ---------------------------------------------------------------------------

{
  const fields = ["a", "b", "c"].map((key, index) => newDraftField(`f${index}`, { key }));
  const keys = (list: ReturnType<typeof moveField>) => list.map((field) => field.key);

  t("a field moves down", keys(moveField(fields, 0, 1)), ["b", "a", "c"]);
  t("a field moves up", keys(moveField(fields, 2, 0)), ["c", "a", "b"]);
  t("moving to where it already is changes nothing", keys(moveField(fields, 1, 1)), ["a", "b", "c"]);
  t("moving off the top is a no-op", keys(moveField(fields, 0, -1)), ["a", "b", "c"]);
  t("moving off the bottom is a no-op", keys(moveField(fields, 2, 3)), ["a", "b", "c"]);
  t("moving does not mutate the original", keys(fields), ["a", "b", "c"]);

  // Order is not decoration: it is the order of the controls on the page and
  // the order of the columns in an export.
  const draft: DraftDocument = { name: "", fields: moveField(fields, 2, 0) };
  const parsed = parseDraft(draft);
  if (parsed.ok) t("the document keeps the new order", parsed.document.fields.map((f) => f.key), ["c", "a", "b"]);
}

// ---------------------------------------------------------------------------
// Import, into the editor, and back out unchanged
// ---------------------------------------------------------------------------

{
  const html = `
    <form action="/contact" method="post">
      <label for="e">Work email</label>
      <input id="e" type="email" name="email" required placeholder="you@company.com">
      <label for="s">Company size</label>
      <select id="s" name="size">
        <option value="">Choose…</option>
        <option value="1-10">1–10</option>
        <option value="11-50">11–50</option>
      </select>
      <textarea name="note" maxlength="500"></textarea>
      <input type="hidden" name="page" value="/pricing">
      <button type="submit">Send</button>
    </form>`;

  const imported = importSchemaFromHtml(html);
  t("the markup yields one form", imported.forms.length, 1);

  const draft = fromDocument(imported.forms[0].document);
  const parsed = parseDraft(draft);

  ok("an imported form opens in the editor", parsed.ok);
  if (parsed.ok) {
    // This is the demo path end to end: somebody's existing markup becomes a
    // schema, is opened for editing, and is published without being altered.
    t(
      "and publishing it untouched publishes exactly what was imported",
      serializeSchemaDocument(parsed.document),
      serializeSchemaDocument(imported.forms[0].document),
    );
    t("the field order is the markup's order", parsed.document.fields.map((f) => f.key), [
      "email",
      "size",
      "note",
      "page",
    ]);
    // The placeholder somebody already wrote comes across. Without this, an
    // imported form is visibly worse than the one it was imported from.
    t(
      "a placeholder survives the import",
      parsed.document.fields[0].placeholder,
      "you@company.com",
    );
  }

  t("an imported form has nothing to complain about", errorsFor(draft), []);
}

// ---------------------------------------------------------------------------
// The empty document, and the smallest useful edit
// ---------------------------------------------------------------------------

{
  const empty = emptyDraft();
  const parsed = parseDraft(empty);
  // "A schema that describes no fields" is a legitimate state — it is what an
  // import of a form with nothing but a submit button produces — so the editor
  // must be able to hold it without complaining.
  ok("an empty document is valid", parsed.ok);
  if (parsed.ok) t("and has no fields", parsed.document.fields.length, 0);
  t("an empty document has no issues", draftIssues(empty, []), []);
}

{
  const draft: DraftDocument = { name: "", fields: [newDraftField("f0")] };
  ok("a brand-new field with no name is an error", errorsFor(draft).length > 0);
  ok("the error does not mention an array index", !errorsFor(draft)[0].startsWith("fields."));
}

{
  const draft: DraftDocument = {
    name: "  Request a quote  ",
    fields: [newDraftField("f0", { key: "email", label: "Email", type: "email" })],
  };
  const parsed = parseDraft(draft);
  if (parsed.ok) t("the form title is trimmed", parsed.document.name, "Request a quote");

  const unnamed = toSchemaDocument({ ...draft, name: "   " }) as Record<string, unknown>;
  t("a blank title is left off entirely", "name" in unnamed, false);
}

// ---------------------------------------------------------------------------
// Placeholder is presentation, and must stay on the human surface
// ---------------------------------------------------------------------------

/**
 * `placeholder` was added to the format for the builder (#35). It is the greyed
 * hint inside a control — presentation for a person, and nothing an agent
 * should read as a rule.
 *
 * The risk is specific. One document drives three surfaces, and
 * `src/lib/manifest/tool.ts` derives the agent-callable tool from the same
 * fields the hosted page renders. A projection that picked up new optional keys
 * generically would hand an agent "you@company.com" as though it were a
 * constraint, or worse an example value to send. It does not — `fieldToJsonSchema`
 * names every property it emits and builds its `description` from `label` and
 * `help` alone — and this is the test that keeps it that way.
 */
{
  const bare = doc({
    fields: [
      { key: "email", label: "Work email", type: "email", required: true, help: "We reply here." },
    ],
  });

  const withPlaceholder = doc({
    fields: [
      {
        key: "email",
        label: "Work email",
        type: "email",
        required: true,
        help: "We reply here.",
        placeholder: "you@company.com",
      },
    ],
  });

  const context = { endpointPublicId: "abc123" };
  const bareTool = buildToolDefinition(bare, context);
  const placeholderTool = buildToolDefinition(withPlaceholder, context);

  t(
    "a placeholder changes nothing about the agent-callable tool",
    placeholderTool,
    bareTool,
  );

  const serialized = JSON.stringify(placeholderTool);
  t("the placeholder value never reaches an agent", serialized.includes("you@company.com"), false);
  t("nor does the key it arrived under", serialized.includes("placeholder"), false);

  // Without this, the two assertions above would pass just as well against a
  // projection that had stopped reading the document at all. `help` is carried
  // deliberately, so its presence proves the channel a placeholder would have
  // leaked through is open and working.
  ok("while `help` — which is meant for an agent — does reach it", serialized.includes("We reply here."));

  // And the same field still renders its placeholder on the human page, which
  // is the whole point of having added it.
  t(
    "the hosted form still gets it",
    withPlaceholder.fields[0].placeholder,
    "you@company.com",
  );
}

// ---------------------------------------------------------------------------
// Suggesting a key
// ---------------------------------------------------------------------------

{
  t("a label becomes a plausible key", suggestKey("Work email"), "work_email");
  t("punctuation is dropped", suggestKey("What's your budget?"), "whats_your_budget");
  t("leading and trailing separators go", suggestKey("  — Notes — "), "notes");
  t("a label with nothing usable in it suggests nothing", suggestKey("!!!"), "");
}

// ---------------------------------------------------------------------------

console.log(`builder state: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
