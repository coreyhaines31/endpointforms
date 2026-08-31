import type { FormSchemaDocument, SchemaField } from "../schema/format.ts";

/**
 * Generating the tool definition (#32).
 *
 * ## The one rule this file exists to keep
 *
 * **There is no second place for the two surfaces to drift.** Everything below
 * is derived from `FormSchemaDocument` — the same document `src/lib/render`
 * turns into a page and `src/lib/schema/validate.ts` reads a payload against.
 * A field added to the form appears here; a required field is required here; a
 * pattern is the same pattern, anchored the same way. Nothing in this module
 * may be hand-maintained, and nothing may consult a list of fields that did not
 * come out of the document it was handed.
 *
 * ## Why this is not "an API for the form"
 *
 * An API contract is a second artefact somebody has to keep in step. This is a
 * *projection* of the one artefact, computed per request. If it is wrong, the
 * schema is wrong, and fixing the schema fixes both surfaces at once.
 *
 * ## What the tool definition deliberately does not say
 *
 * `additionalProperties` is left open rather than set to `false`. The human
 * page accepts a field the schema does not mention — a marketing tag appending
 * `msclkid` is a routine, additive change and `validate.ts` treats it as a
 * warning in every mode. Declaring the tool stricter than the endpoint would be
 * exactly the drift this file exists to prevent, and an agent that trusted the
 * declaration would refuse to send something we would happily have stored.
 */

/** The subset of JSON Schema this module emits. Draft 2020-12 compatible. */
export type JsonSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  format?: string;
  enum?: string[];
  const?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
};

/**
 * A tool, in the shape MCP's `tools/list` returns.
 *
 * `annotations` are hints, not guarantees, and the spec says so — they are here
 * because an agent deciding whether it may call something unattended reads them,
 * and every one of ours is knowable: submitting a form writes, is not
 * destructive, is not idempotent, and touches a system outside our own.
 */
export type ManifestTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
};

export type ToolContext = {
  /** The endpoint's public id, which is what a person sees in the form action. */
  endpointPublicId: string;
  /** Where the same form is posted to by a browser, for the description. */
  submitUrl?: string;
};

/** MCP constrains tool names to this, so a generated one has to be checked. */
const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

const MAX_ENUM_LABELS = 12;

/**
 * The tool's name.
 *
 * Derived from the schema's own name — which is the `<form id>` or `name` the
 * import found — so an agent's tool list reads `submit_demo_request` rather
 * than an opaque id. A form with no name gets `submit_form`; the endpoint is
 * already identified by the URL the tool was discovered at, so the name does
 * not have to carry the id as well.
 *
 * Renaming the form renames the tool. That is a discovery-time change and
 * `tools/list` is how an agent finds out, so it costs nothing that a cached
 * definition does not already cost.
 */
export function toolName(document: FormSchemaDocument): string {
  const slug = slugify(document.name ?? "");
  const candidate = `submit_${slug === "" ? "form" : slug}`.slice(0, 64).replace(/_+$/, "");
  return TOOL_NAME.test(candidate) ? candidate : "submit_form";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/**
 * The whole tool definition, from the document and nothing else.
 */
export function buildToolDefinition(
  document: FormSchemaDocument,
  context: ToolContext,
): ManifestTool {
  const name = toolName(document);
  const title = document.name?.trim() || "Submit form";

  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const field of document.fields) {
    properties[field.key] = fieldToJsonSchema(field);
    if (field.required) required.push(field.key);
  }

  const inputSchema: JsonSchema = {
    type: "object",
    properties,
    // Always present, even when empty. An agent reading `required: []` knows
    // the form asks for nothing; an agent reading a missing key has to guess.
    required,
  };

  return {
    name,
    title,
    description: describeTool(document, required, context),
    inputSchema,
    outputSchema: OUTPUT_SCHEMA,
    annotations: {
      title,
      // It writes a row. Nothing about a form submission is read-only.
      readOnlyHint: false,
      // It adds; it never removes or overwrites anything that existed.
      destructiveHint: false,
      // Two identical calls are two leads unless the caller sends its own
      // `Idempotency-Key`. Saying otherwise would invite a retry loop to
      // duplicate somebody's pipeline.
      idempotentHint: false,
      openWorldHint: true,
    },
  };
}

/**
 * What the model reads when it is deciding whether this is the right tool.
 *
 * Written for that decision rather than as documentation: what the form is,
 * what it needs, and — the part nothing else in the category can say — that
 * using this surface is itself the provenance declaration, so there is no
 * reason to imitate a browser.
 */
function describeTool(
  document: FormSchemaDocument,
  required: string[],
  context: ToolContext,
): string {
  const what = document.name?.trim()
    ? `Submit the "${document.name.trim()}" form`
    : "Submit this form";

  const count = document.fields.length;
  const fieldSentence =
    count === 0
      ? "It declares no fields."
      : `It declares ${count} field${count === 1 ? "" : "s"}${
          required.length === 0
            ? ", none of them required"
            : `, of which ${required.length} ${required.length === 1 ? "is" : "are"} required: ${required.join(", ")}`
        }.`;

  const where = context.submitUrl
    ? ` The same form is posted to ${context.submitUrl} by a browser; this tool is the machine-callable half of that one definition.`
    : "";

  return [
    `${what} (endpoint ${context.endpointPublicId}).`,
    fieldSentence,
    "A submission made through this tool is recorded with origin \"agent\": using this surface is itself the declaration, so there is nothing to gain by imitating a browser.",
    "On acceptance the result carries the submission id. On rejection it carries a reason per field, so a corrected call can be retried.",
  ].join(" ") + where;
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/**
 * One field, as JSON Schema.
 *
 * Every constraint emitted here is one `validate.ts` actually enforces. The
 * temptation is to describe more than we check — a `format: "tel"`, a length on
 * a select — and it is the wrong trade: a declaration nothing enforces teaches
 * an agent a rule that does not exist, and a rule we enforce but never declare
 * gets discovered as a rejection.
 */
export function fieldToJsonSchema(field: SchemaField): JsonSchema {
  const validation = field.validation;
  const notes: string[] = [];
  if (field.label && field.label !== field.key) notes.push(field.label);
  if (field.help) notes.push(field.help);

  const schema: JsonSchema = {};

  switch (field.type) {
    case "checkbox":
      // A lone checkbox posts nothing when it is unticked and "on" when it is
      // ticked, so a boolean is the honest shape for an agent. The mapping back
      // to what a browser posts is `arguments.ts`, not here.
      schema.type = "boolean";
      notes.push("A single checkbox. True means ticked; omit it or send false to leave it unticked.");
      break;

    case "multi_select": {
      const options = field.options ?? [];
      schema.type = "array";
      schema.items = { type: "string", enum: options.map((option) => option.value) };
      schema.uniqueItems = true;
      if (validation?.minSelected !== undefined) schema.minItems = validation.minSelected;
      if (validation?.maxSelected !== undefined) schema.maxItems = validation.maxSelected;
      const labels = describeOptions(field);
      if (labels) notes.push(labels);
      break;
    }

    case "select": {
      schema.type = "string";
      schema.enum = (field.options ?? []).map((option) => option.value);
      const labels = describeOptions(field);
      if (labels) notes.push(labels);
      break;
    }

    case "number":
      schema.type = "number";
      if (typeof validation?.min === "number") schema.minimum = validation.min;
      if (typeof validation?.max === "number") schema.maximum = validation.max;
      if (validation?.step !== undefined) schema.multipleOf = validation.step;
      break;

    case "email":
      schema.type = "string";
      schema.format = "email";
      applyTextConstraints(schema, field, notes);
      break;

    case "date":
      schema.type = "string";
      schema.format = "date";
      notes.push("An ISO date, YYYY-MM-DD.");
      // JSON Schema has no standard bound for a formatted date, so the range is
      // stated in words rather than emitted as a keyword nothing checks.
      if (typeof validation?.min === "string") notes.push(`Not earlier than ${validation.min}.`);
      if (typeof validation?.max === "string") notes.push(`Not later than ${validation.max}.`);
      break;

    case "phone":
      schema.type = "string";
      notes.push("A phone number, in whatever form the person would write it.");
      applyTextConstraints(schema, field, notes);
      break;

    case "hidden":
      schema.type = "string";
      // Named for what it is on the other surface. An agent supplying a value
      // for a field the page fills in for itself is usually a mistake, and the
      // only place to say so is here.
      notes.push("Hidden on the human page and normally filled in by the page itself. Send it only if you know the value it should carry.");
      applyTextConstraints(schema, field, notes);
      break;

    case "text":
    case "textarea":
      schema.type = "string";
      applyTextConstraints(schema, field, notes);
      break;
  }

  if (notes.length > 0) schema.description = notes.join(" ");
  return schema;
}

function applyTextConstraints(schema: JsonSchema, field: SchemaField, notes: string[]): void {
  const validation = field.validation;
  if (!validation) return;
  if (validation.minLength !== undefined) schema.minLength = validation.minLength;
  if (validation.maxLength !== undefined) schema.maxLength = validation.maxLength;
  if (validation.pattern !== undefined) {
    // Anchored exactly the way `compilePattern` anchors it. JSON Schema's
    // `pattern` is an unanchored search, HTML's is a whole-value match, and
    // emitting the bare source would publish a looser rule than we enforce.
    schema.pattern = `^(?:${validation.pattern})$`;
    notes.push("Must match the declared pattern in full.");
  }
}

/**
 * The option labels, when they differ from the values.
 *
 * The values are what gets posted and the labels are what the person reading
 * the form sees, and a model choosing between `5k-25k` and `25k+` picks better
 * when it has been told those mean "$5k – $25k" and "$25k and up".
 */
function describeOptions(field: SchemaField): string | null {
  const options = field.options ?? [];
  const informative = options.filter((option) => option.label && option.label !== option.value);
  if (informative.length === 0) return null;

  const shown = informative.slice(0, MAX_ENUM_LABELS);
  const listed = shown.map((option) => `${option.value} = ${option.label}`).join("; ");
  const rest = informative.length - shown.length;
  return `Options: ${listed}${rest > 0 ? `; and ${rest} more` : ""}.`;
}

// ---------------------------------------------------------------------------
// The result shape
// ---------------------------------------------------------------------------

/**
 * One schema describing both outcomes, discriminated by `status`.
 *
 * Two schemas would mean an agent has to know which one it got before it can
 * read either. `status` is always present, and everything else is conditional
 * on it — which is what makes "rejected" something an agent can branch on
 * rather than an exception it has to parse out of prose.
 *
 * `origin` is reported here and deliberately **not** on the form surface.
 * `docs/23-origin-findings.md` withholds the stamp there because telling a
 * caller whether its forgery worked is a free tuning loop. There is no forgery
 * to tune here: the stamp is `agent` because the surface was used, the caller
 * chose the surface, and it already knows the answer. Echoing it is a receipt.
 */
export const OUTPUT_SCHEMA: JsonSchema = {
  type: "object",
  description: "The outcome of the submission. Check `status` first.",
  properties: {
    status: {
      type: "string",
      enum: ["accepted", "rejected"],
      description: "Whether the submission was stored.",
    },
    submission_id: {
      type: "string",
      description: "The stored submission's id. Present when status is accepted.",
    },
    endpoint: { type: "string", description: "The endpoint the submission was stored on." },
    submitted_at: { type: "string", format: "date-time" },
    origin: {
      type: "string",
      const: "agent",
      description:
        "How the submission is stamped. Always \"agent\" through this surface, because the surface is the declaration.",
    },
    duplicate: {
      type: "boolean",
      description:
        "True when an identical submission already existed and this call was collapsed onto it.",
    },
    warnings: {
      type: "array",
      description:
        "Ways the payload differed from the schema that did not prevent it being stored.",
      items: issueSchema(),
    },
    code: {
      type: "string",
      description: "Why it was rejected, as a stable code. Present when status is rejected.",
    },
    message: { type: "string", description: "The rejection, as a sentence." },
    errors: {
      type: "array",
      description: "What to change, one entry per field. Present when status is rejected.",
      items: issueSchema(),
    },
    retry_after_seconds: {
      type: "number",
      description: "How long to wait before retrying. Present only when rate limited.",
    },
  },
  required: ["status"],
};

function issueSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      field: { type: ["string", "null"], description: "The field name, or null for the submission as a whole." },
      code: { type: "string" },
      message: { type: "string" },
    },
    required: ["field", "code", "message"],
  };
}
