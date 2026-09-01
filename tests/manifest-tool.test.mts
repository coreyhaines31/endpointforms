/**
 * Manifest, the parts that need no database (#32).
 *
 * Three questions, and the first one is the whole feature:
 *
 *   1. **Can the two surfaces drift?** The tool definition is generated from
 *      `FormSchemaDocument`. Every assertion about it is written as "the tool
 *      says exactly what the document says" rather than "the tool says X", so
 *      a future change that hard-codes a field, drops one, or invents a rule
 *      the validator does not enforce fails here.
 *   2. **Does an agent's JSON become the same row a browser's form post does?**
 *      A ticked checkbox, a number, a repeated name — all of it has to land in
 *      `values` shaped the way the page would have posted it.
 *   3. **Does the envelope behave?** JSON-RPC, and specifically the cases that
 *      lose calls silently if they are got wrong.
 *
 * No database, no server: `node --experimental-strip-types tests/manifest-tool.test.mts`.
 */

import {
  parseSchemaDocument,
  type FormSchemaDocument,
} from "../src/lib/schema/format.ts";
import { buildToolDefinition, fieldToJsonSchema, toolName } from "../src/lib/manifest/tool.ts";
import { prepareSubmission } from "../src/lib/manifest/arguments.ts";
import { parseRpc, RPC } from "../src/lib/manifest/jsonrpc.ts";

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

const CONTEXT = { endpointPublicId: "abc123", submitUrl: "https://forms.test/e/abc123" };

/**
 * One form using every type the format has, so nothing is asserted against a
 * shape that only ever holds text fields.
 */
const EVERY_TYPE = doc({
  name: "Demo request",
  fields: [
    { key: "work_email", label: "Work email", type: "email", required: true },
    {
      key: "company",
      label: "Company",
      type: "text",
      required: true,
      validation: { minLength: 2, maxLength: 120 },
    },
    { key: "phone", label: "Phone", type: "phone" },
    { key: "seats", label: "Seats", type: "number", validation: { min: 1, max: 500, step: 1 } },
    { key: "start_on", label: "Start date", type: "date", validation: { min: "2026-01-01" } },
    {
      key: "ad_spend",
      label: "Monthly ad spend",
      type: "select",
      options: [
        { value: "5k-25k", label: "$5k – $25k" },
        { value: "25k+", label: "$25k and up" },
      ],
    },
    {
      key: "channels",
      label: "Channels",
      type: "multi_select",
      options: [
        { value: "search", label: "Search" },
        { value: "social", label: "Social" },
        { value: "email", label: "Email" },
      ],
      validation: { minSelected: 1, maxSelected: 2 },
    },
    { key: "consent", label: "Keep me updated", type: "checkbox" },
    { key: "problem", label: "What are you trying to fix?", type: "textarea" },
    { key: "source", label: "Source", type: "hidden" },
    {
      key: "ref_code",
      label: "Referral code",
      type: "text",
      validation: { pattern: "[A-Z]{3}-\\d{4}" },
    },
  ],
});

// ---------------------------------------------------------------------------
console.log("\nThe tool definition is a projection of the schema, not a copy of it");
// ---------------------------------------------------------------------------
{
  const tool = buildToolDefinition(EVERY_TYPE, CONTEXT);
  const properties = tool.inputSchema.properties ?? {};

  // The drift assertions. Written against the document rather than a literal.
  t(
    "every declared field, and only those, becomes a property",
    Object.keys(properties).sort(),
    EVERY_TYPE.fields.map((field) => field.key).sort(),
  );
  t(
    "required is exactly the schema's required fields",
    [...(tool.inputSchema.required ?? [])].sort(),
    EVERY_TYPE.fields.filter((field) => field.required).map((field) => field.key).sort(),
  );
  ok(
    "required is present even when nothing is required",
    Array.isArray(buildToolDefinition(doc({ fields: [] }), CONTEXT).inputSchema.required),
  );

  t("the name is derived from the form's name", tool.name, "submit_demo_request");
  t("an unnamed form still gets a usable name", toolName(doc({ fields: [] })), "submit_form");
  ok(
    "the name is a legal MCP tool name",
    /^[a-zA-Z0-9_-]{1,64}$/.test(toolName(doc({ name: "Contact us — now! ✳", fields: [] }))),
    toolName(doc({ name: "Contact us — now! ✳", fields: [] })),
  );

  t("email declares the format", properties.work_email?.format, "email");
  t("text carries its length bounds", [properties.company?.minLength, properties.company?.maxLength], [2, 120]);
  t("number becomes a number", properties.seats?.type, "number");
  t(
    "number carries min, max and step",
    [properties.seats?.minimum, properties.seats?.maximum, properties.seats?.multipleOf],
    [1, 500, 1],
  );
  t("select becomes an enum of the option values", properties.ad_spend?.enum, ["5k-25k", "25k+"]);
  t("multi_select becomes an array", properties.channels?.type, "array");
  t("its items are the option values", properties.channels?.items?.enum, ["search", "social", "email"]);
  t(
    "minSelected and maxSelected become minItems and maxItems",
    [properties.channels?.minItems, properties.channels?.maxItems],
    [1, 2],
  );
  t("a checkbox is a boolean", properties.consent?.type, "boolean");
  t("a date declares the format", properties.start_on?.format, "date");

  // The subtle one. HTML's `pattern` is a whole-value match and JSON Schema's
  // is an unanchored search, so publishing the bare source would advertise a
  // looser rule than `validate.ts` enforces.
  t(
    "a pattern is published anchored, exactly as compilePattern anchors it",
    properties.ref_code?.pattern,
    "^(?:[A-Z]{3}-\\d{4})$",
  );

  ok(
    "option labels reach the description when they differ from the values",
    (properties.ad_spend?.description ?? "").includes("$5k – $25k"),
    properties.ad_spend?.description,
  );
  ok(
    "a hidden field says it is hidden rather than pretending to be an input",
    (properties.source?.description ?? "").toLowerCase().includes("hidden"),
    properties.source?.description,
  );

  // Not `false`. The endpoint stores an undeclared field and warns; a tool that
  // refused one would be stricter than the surface it describes.
  ok(
    "additionalProperties is left open, matching what the endpoint actually does",
    tool.inputSchema.additionalProperties === undefined,
    tool.inputSchema.additionalProperties,
  );

  ok(
    "the description tells the model the submission will be stamped agent",
    tool.description.includes('"agent"'),
    tool.description,
  );
  t(
    "the annotations do not claim a submission is idempotent",
    [tool.annotations.readOnlyHint, tool.annotations.destructiveHint, tool.annotations.idempotentHint],
    [false, false, false],
  );
  ok(
    "an output schema is published, discriminated by status",
    tool.outputSchema.properties?.status?.enum?.join(",") === "accepted,rejected",
    tool.outputSchema.properties?.status,
  );

  // A field the format allows but this fixture does not exercise must still
  // produce something, so a new type cannot be added without a mapping.
  for (const field of EVERY_TYPE.fields) {
    const schema = fieldToJsonSchema(field);
    ok(`${field.type} maps to a typed schema`, typeof schema.type === "string", { field: field.key, schema });
  }
}

// ---------------------------------------------------------------------------
console.log("\nAn agent's JSON becomes the row a browser would have posted");
// ---------------------------------------------------------------------------
{
  const prepared = prepareSubmission(EVERY_TYPE, {
    work_email: "buyer@northgate.test",
    company: "Northgate",
    seats: 25,
    channels: ["search", "email"],
    consent: true,
    start_on: "2026-09-01",
    ad_spend: "5k-25k",
  });

  t("no errors on a well-formed call", prepared.errors, []);
  t(
    "a number is posted as the string a form would have posted",
    prepared.values.seats,
    "25",
  );
  t("a ticked checkbox posts what an <input type=checkbox> posts", prepared.values.consent, "on");
  t("a multi_select stays a list of its option values", prepared.values.channels, ["search", "email"]);
  ok(
    "every stored value is a string or a list of strings, as urlencoded would give",
    Object.values(prepared.values).every(
      (value) =>
        typeof value === "string" || (Array.isArray(value) && value.every((entry) => typeof entry === "string")),
    ),
    prepared.values,
  );

  // The bug this prevents: `validate.ts` treats any present value as a ticked
  // box, so passing `false` through would record a consent nobody gave.
  const unticked = prepareSubmission(EVERY_TYPE, {
    work_email: "buyer@northgate.test",
    company: "Northgate",
    consent: false,
  });
  ok("false on a checkbox posts nothing at all", !("consent" in unticked.values), unticked.values);
  t("and that is not an error", unticked.errors, []);

  // An empty multi_select is a group with nothing ticked, which posts nothing —
  // not an empty list, which would read as "answered: none".
  const none = prepareSubmission(EVERY_TYPE, {
    work_email: "b@n.test",
    company: "Northgate",
    channels: [],
  });
  ok("an empty selection posts nothing", !("channels" in none.values), none.values);

  const extra = prepareSubmission(EVERY_TYPE, {
    work_email: "b@n.test",
    company: "Northgate",
    department: "growth",
  });
  t("an undeclared field is kept, exactly as the human page keeps it", extra.values.department, "growth");
  t("and reported as a warning rather than a refusal", extra.errors, []);
  ok(
    "the warning names the field",
    extra.warnings.some((issue) => issue.field === "department" && issue.code === "unknown_field"),
    extra.warnings,
  );

  // Attribution and control fields are consumed by the endpoint before `values`
  // is written, so warning about them would fire on every submission.
  const attributed = prepareSubmission(EVERY_TYPE, {
    work_email: "b@n.test",
    company: "Northgate",
    utm_source: "claude",
    _idempotency_key: "lead-9",
  });
  t("an agent can pass attribution through", attributed.values.utm_source, "claude");
  t("without it being reported as an unknown field", attributed.warnings, []);
}

// ---------------------------------------------------------------------------
console.log("\nA rejection names the field, so a corrected call can be made");
// ---------------------------------------------------------------------------
{
  const missing = prepareSubmission(EVERY_TYPE, { company: "Northgate" });
  ok(
    "a missing required field is an error naming that field",
    missing.errors.some((issue) => issue.field === "work_email" && issue.code === "missing_required"),
    missing.errors,
  );

  const bad = prepareSubmission(EVERY_TYPE, {
    work_email: "not-an-email",
    company: "Northgate",
    ad_spend: "50k+",
    ref_code: "abc-1",
  });
  const codes = bad.errors.map((issue) => `${issue.field}:${issue.code}`).sort();
  t(
    "every broken rule is reported, not just the first",
    codes,
    ["ad_spend:not_an_option", "ref_code:pattern_mismatch", "work_email:invalid_email"],
  );
  ok(
    "each one is a sentence a caller can act on",
    bad.errors.every((issue) => issue.message.length > 10 && issue.message.includes('"')),
    bad.errors,
  );

  const structured = prepareSubmission(EVERY_TYPE, {
    work_email: "b@n.test",
    company: { legal_name: "Northgate" },
  });
  ok(
    "a structured value where the form wants text is refused, not stringified",
    structured.errors.some((issue) => issue.field === "company"),
    structured.errors,
  );

  const overSelected = prepareSubmission(EVERY_TYPE, {
    work_email: "b@n.test",
    company: "Northgate",
    channels: ["search", "social", "email"],
  });
  ok(
    "the multi_select bounds are enforced by the same validator the page uses",
    overSelected.errors.some((issue) => issue.code === "invalid_choice_count"),
    overSelected.errors,
  );

  // A prototype-shaped field name has to be a field, never a mutation.
  const proto = prepareSubmission(EVERY_TYPE, {
    work_email: "b@n.test",
    company: "Northgate",
    __proto__: "polluted",
  });
  ok("a field named __proto__ does not reach a prototype", ({} as Record<string, unknown>).polluted === undefined, proto.values);
}

// ---------------------------------------------------------------------------
console.log("\nThe JSON-RPC envelope");
// ---------------------------------------------------------------------------
{
  const good = parseRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  ok("a well-formed request parses", good.ok && good.request.method === "tools/list", good);
  t("absent params become an empty object", good.ok ? good.request.params : null, {});

  const notification = parseRpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  ok(
    "a notification is recognised by having no id",
    notification.ok && notification.request.id === null,
    notification,
  );

  // Batching was removed from MCP in 2025-06-18. A server that accepts an array
  // and answers only its first entry drops leads silently.
  const batch = parseRpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]);
  ok(
    "a batch is refused rather than half-answered",
    !batch.ok && batch.failure.code === RPC.INVALID_REQUEST,
    batch,
  );

  const wrongVersion = parseRpc({ jsonrpc: "1.0", id: 2, method: "tools/list" });
  ok(
    "a non-2.0 envelope is refused with its id echoed back",
    !wrongVersion.ok && wrongVersion.failure.id === 2,
    wrongVersion,
  );

  const positional = parseRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: ["x"] });
  ok(
    "positional params are refused",
    !positional.ok && positional.failure.code === RPC.INVALID_PARAMS,
    positional,
  );

  const noMethod = parseRpc({ jsonrpc: "2.0", id: 4 });
  ok("a request with no method is refused", !noMethod.ok, noMethod);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
