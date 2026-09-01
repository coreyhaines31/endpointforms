import { z } from "zod";

import { MAX_FIELD_NAME_CHARS } from "../ingest/limits.ts";
import { ruleErrorMessages } from "../rules/analyze.ts";
import { type Rule } from "../rules/algebra.ts";
import { rulesSchema } from "../rules/format.ts";
import { readStoredTheme, serializeTheme, themeSchema } from "../render/theme.ts";
import {
  partialSettingsSchema,
  readStoredPartials,
  readStoredSteps,
  serializePartials,
  serializeSteps,
  stepErrorMessages,
  stepsSchema,
} from "../steps/format.ts";

/**
 * The optional form schema (#51).
 *
 * An endpoint works with no schema at all — that is #50, and it stays true.
 * Declaring one is what unlocks Manifest (#32), Hindsight (#45), server-side
 * validation and typed exports, because those need to know *what the form is*
 * and not merely what was posted to it.
 *
 * Three properties of this format are load-bearing:
 *
 * 1. **The type set is small and closed.** Ten types, each of which a browser
 *    control actually produces and an agent tool definition can actually
 *    describe. A schema language that can express anything can be generated
 *    from nothing.
 * 2. **The format itself is versioned.** `formatVersion` is stamped on every
 *    document. A stored schema is immutable and may outlive several revisions
 *    of this file, so reading one has to be a decision rather than an
 *    assumption. See `readStoredDocument`.
 * 3. **Nothing here rejects anything.** This module parses and describes. What
 *    happens to a submission that does not match is decided in `./validate.ts`
 *    and, by default, the answer is "store it and say so".
 */

/** Bumped only when an older reader could misunderstand a newer document. */
export const SCHEMA_FORMAT_VERSION = 1;

/**
 * Every field type, and nothing else.
 *
 * `multi_select` rather than a `multiple` flag on `select`: a field that can
 * hold several values validates differently, exports differently and appears
 * differently in a tool definition, so it is a different type rather than a
 * modifier that every consumer has to remember to check.
 *
 * There is deliberately no `file`. Attachments are not in the data model yet
 * (`parseMultipart` records them and stores nothing), and a schema that claims
 * to describe a file field would be describing something we do not keep.
 */
export const FIELD_TYPES = [
  "text",
  "email",
  "phone",
  "number",
  "select",
  "multi_select",
  "checkbox",
  "textarea",
  "date",
  "hidden",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** Types whose value must be one of a declared set. */
export const CHOICE_TYPES = ["select", "multi_select"] as const satisfies readonly FieldType[];

export function isChoiceType(type: FieldType): boolean {
  return type === "select" || type === "multi_select";
}

const MAX_LABEL_CHARS = 500;
const MAX_HELP_CHARS = 1_000;
const MAX_OPTIONS = 500;
const MAX_FIELDS_IN_SCHEMA = 250;
const MAX_PATTERN_CHARS = 500;

const fieldKey = z
  .string()
  .min(1, "A field needs a name.")
  .max(MAX_FIELD_NAME_CHARS, `A field name may not exceed ${MAX_FIELD_NAME_CHARS} characters.`)
  // The key is the HTML `name` attribute verbatim, so `contact[email]` and
  // `interests[]` are legal and must round-trip untouched. Only characters that
  // could not survive the wire are refused.
  .refine((value) => !hasControlCharacter(value), {
    message: "A field name may not contain control characters.",
  });

const optionSchema = z.strictObject({
  /** What the browser posts. */
  value: z.string().max(MAX_FIELD_NAME_CHARS),
  /** What a person reads. Defaults to the value when the markup gave us nothing. */
  label: z.string().max(MAX_LABEL_CHARS),
});

export type FieldOption = z.infer<typeof optionSchema>;

/**
 * Constraints, all optional.
 *
 * `min` and `max` are `number | string` because a `<input type="date" min="…">`
 * is a date and a `<input type="number" min="…">` is a number, and collapsing
 * them into one numeric field would either lose the date bounds or store a
 * timestamp nobody typed. The type of the field decides how they are read.
 */
const validationSchema = z.strictObject({
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(1).optional(),
  /** A JavaScript-compatible regular expression source, anchored on use. */
  pattern: z.string().min(1).max(MAX_PATTERN_CHARS).optional(),
  min: z.union([z.number(), z.string()]).optional(),
  max: z.union([z.number(), z.string()]).optional(),
  step: z.number().positive().optional(),
  /** `multi_select` only. */
  minSelected: z.number().int().min(0).optional(),
  maxSelected: z.number().int().min(1).optional(),
});

export type FieldValidation = z.infer<typeof validationSchema>;

const baseFieldSchema = z.strictObject({
  key: fieldKey,
  label: z.string().max(MAX_LABEL_CHARS).default(""),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  help: z.string().max(MAX_HELP_CHARS).optional(),
  /**
   * The greyed-out hint inside the control. Distinct from `help`, which is a
   * sentence that stays readable once the field is filled in — a placeholder
   * disappears the moment somebody types, so anything a person needs to *keep*
   * reading belongs in `help` instead.
   *
   * Optional and additive: a document that predates this property reads exactly
   * as it always did, and a hosted form simply renders no placeholder.
   */
  placeholder: z.string().max(MAX_LABEL_CHARS).optional(),
  options: z.array(optionSchema).max(MAX_OPTIONS).optional(),
  validation: validationSchema.optional(),
});

/**
 * A field, after the cross-checks that a per-property schema cannot express.
 *
 * Every refusal here is a schema that would be *unusable* rather than merely
 * unusual — a choice field with no choices, a pattern that does not compile.
 * Anything a person could plausibly have meant is accepted.
 */
const fieldSchema = baseFieldSchema
  .transform((field) => ({
    ...field,
    // An unlabelled field is common in real markup and is not an error; the
    // key is a serviceable label and beats an empty string everywhere it shows.
    label: field.label.trim() === "" ? field.key : field.label,
  }))
  .superRefine((field, ctx) => {
    if (isChoiceType(field.type)) {
      if (!field.options || field.options.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: `Field "${field.key}" is a ${field.type} and needs at least one option.`,
        });
      } else {
        const seen = new Set<string>();
        for (const option of field.options) {
          if (seen.has(option.value)) {
            ctx.addIssue({
              code: "custom",
              path: ["options"],
              message: `Field "${field.key}" has two options with the value "${option.value}".`,
            });
            break;
          }
          seen.add(option.value);
        }
      }
    } else if (field.options && field.options.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: `Field "${field.key}" is a ${field.type}, which does not take options.`,
      });
    }

    const validation = field.validation;
    if (!validation) return;

    if (validation.pattern !== undefined && !compilePattern(validation.pattern)) {
      ctx.addIssue({
        code: "custom",
        path: ["validation", "pattern"],
        message: `Field "${field.key}" has a pattern that is not a valid regular expression.`,
      });
    }

    if (
      validation.minLength !== undefined &&
      validation.maxLength !== undefined &&
      validation.minLength > validation.maxLength
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["validation"],
        message: `Field "${field.key}" has a minLength greater than its maxLength.`,
      });
    }

    if (
      typeof validation.min === "number" &&
      typeof validation.max === "number" &&
      validation.min > validation.max
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["validation"],
        message: `Field "${field.key}" has a min greater than its max.`,
      });
    }
  });

export type SchemaField = z.infer<typeof fieldSchema>;

const documentShape = z.strictObject({
  formatVersion: z.number().int().min(1).default(SCHEMA_FORMAT_VERSION),
  /** Optional human name, e.g. the `<form id>` we imported it from. */
  name: z.string().max(MAX_LABEL_CHARS).optional(),
  fields: z.array(fieldSchema).max(MAX_FIELDS_IN_SCHEMA),
  /**
   * Conditional logic (#36). Optional, and additive in the strictest sense: a
   * document written before it existed has no `rules` key, reads exactly as it
   * always did, and produces the same form, the same tool definition and the
   * same validation result byte for byte.
   *
   * The rules live *in* the document rather than in a table of their own
   * because they are part of the definition the three surfaces are projections
   * of. A version published on Tuesday carries the logic it was published with,
   * so a submission from Tuesday stays readable against the rules it actually
   * arrived under — the same reason the fields live here.
   *
   * `src/lib/rules` holds the algebra, the evaluator and the analyser. What is
   * enforced *here* is only what makes a ruleset meaningless rather than
   * merely unwise; see the document-level refinement below.
   */
  rules: rulesSchema.optional(),
  /**
   * Presentation (#38). Optional, and additive on exactly the same terms as
   * `rules`: a document written before it existed has no `theme` key, reads
   * exactly as it always did, and renders the same form byte for byte.
   *
   * It lives on the document rather than on the endpoint because it is part of
   * the definition a version *is*. A form published on Tuesday carries the look
   * it was published with, so rolling back a version rolls back its appearance
   * too — and there is no state where the fields are from one version and the
   * colours are from another.
   *
   * `src/lib/render/theme.ts` holds the shape, the palettes and the contrast
   * derivation. What is enforced here is only that the value is one this build
   * can turn into CSS: every property is a closed enum bar one hex colour, so
   * nothing a person types can reach a style attribute unmatched.
   */
  theme: themeSchema.optional(),
  /**
   * Multi-step rendering (#37). Optional, and additive on exactly the same
   * terms as `rules` and `theme`: a document written before it existed has no
   * `steps` key and produces the same form, the same tool definition and the
   * same validation result byte for byte.
   *
   * It is a **rendering** key and nothing else reads it. `validate.ts` never
   * consults it, `manifest/tool.ts` never consults it, and the ingest path
   * never consults it — a raw POST and an agent call have no steps and must
   * never be judged against them. `src/lib/steps` holds the reasoning in full.
   */
  steps: stepsSchema.optional(),
  /**
   * What this form does with a visit that stops halfway (#37), and what the
   * visitor is told about it. Only meaningful alongside `steps`; a one-screen
   * form has no boundary at which a visit could be half-finished.
   */
  partials: partialSettingsSchema.optional(),
});

/**
 * A document, after the checks that span fields.
 *
 * An empty field list is allowed. "This endpoint has a schema and it describes
 * no fields" is a legitimate intermediate state — it is what an import of a
 * form with nothing but a submit button produces, and refusing it would send
 * someone to the support inbox instead of to their markup.
 */
const documentSchema = documentShape.superRefine((doc, ctx) => {
  if (doc.formatVersion > SCHEMA_FORMAT_VERSION) {
    ctx.addIssue({
      code: "custom",
      path: ["formatVersion"],
      message: `This schema is format version ${doc.formatVersion}; this build understands up to ${SCHEMA_FORMAT_VERSION}.`,
    });
  }

  const seen = new Set<string>();
  for (const field of doc.fields) {
    if (seen.has(field.key)) {
      ctx.addIssue({
        code: "custom",
        path: ["fields"],
        message: `Two fields share the name "${field.key}". A form posts one value list per name, so a schema can only describe it once.`,
      });
    }
    seen.add(field.key);
  }

  // Conditional logic, checked here rather than in the builder so that every
  // producer of a document gets it: the editor, a committed JSON file, an
  // import. A ruleset that cannot be ordered, names a field nobody collects, or
  // contains a rule no answer could ever satisfy is not a schema with a
  // questionable rule in it — it is a schema whose behaviour cannot be stated.
  // Anything merely unwise is a warning, lives in `analyzeRules`, and does not
  // reach this refinement. See `src/lib/rules/analyze.ts`.
  for (const message of ruleErrorMessages(doc)) {
    ctx.addIssue({ code: "custom", path: ["rules"], message });
  }

  // Steps, on the same terms as the rules above: only a step list whose
  // behaviour cannot be stated is refused. A field no step names is *not* an
  // error — see `stepErrorMessages`.
  for (const message of stepErrorMessages(doc)) {
    ctx.addIssue({ code: "custom", path: ["steps"], message });
  }
});

export type FormSchemaDocument = z.infer<typeof documentShape>;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; document: FormSchemaDocument }
  | { ok: false; errors: string[] };

/**
 * Parses a document a human or a CLI supplied.
 *
 * Unknown properties are refused rather than stripped. This is the *declare a
 * file* path (#51's second producer), where a silently ignored `requred: true`
 * is a validation rule the author believes they wrote and does not have.
 *
 * A bare array is accepted as shorthand for `{ fields: [...] }`, because that
 * is what people write.
 */
export function parseSchemaDocument(input: unknown): ParseResult {
  const candidate = Array.isArray(input) ? { fields: input } : input;
  const parsed = documentSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, document: parsed.data };
  return { ok: false, errors: formatIssues(parsed.error) };
}

/** As `parseSchemaDocument`, but from JSON text. */
export function parseSchemaJson(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [
        `The file is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}.`,
      ],
    };
  }
  return parseSchemaDocument(value);
}

/**
 * Reads a document out of the `form_schemas.fields` column.
 *
 * Deliberately more forgiving than `parseSchemaDocument`, in one direction
 * only: unknown properties are **stripped rather than refused**, so a row
 * written by a newer build — or by the seed, which predates `formatVersion` —
 * still reads here. Stored rows are immutable and cannot be corrected; a reader
 * that throws on one takes the endpoint down with it.
 *
 * Returns null when the row cannot be understood at all. Callers on the ingest
 * path must treat null as "no schema" and keep the submission. See
 * `handler.ts`: a schema we cannot read is our problem, not a reason to lose
 * somebody's lead.
 */
export function readStoredDocument(stored: unknown): FormSchemaDocument | null {
  const candidate = Array.isArray(stored) ? { fields: stored } : stored;
  if (candidate === null || typeof candidate !== "object") return null;

  const record = candidate as Record<string, unknown>;
  const version = typeof record.formatVersion === "number" ? record.formatVersion : 1;
  if (version > SCHEMA_FORMAT_VERSION) return null;

  const lenient = z.looseObject({
    formatVersion: z.number().int().min(1).default(SCHEMA_FORMAT_VERSION),
    name: z.string().optional(),
    // `unknown` rather than the field schema, deliberately: parsing the array
    // as a whole would make one unreadable field discard every other field
    // beside it, and the rest of a stored schema is still worth honouring.
    fields: z.array(z.unknown()).catch([]),
  });

  const parsed = lenient.safeParse(record);
  if (!parsed.success) return null;

  // Rules are all-or-nothing, unlike fields.
  //
  // A field this build cannot read is dropped and the rest of the schema still
  // stands, because the fields are independent of each other. Rules are not: a
  // ruleset with one rule missing is a form behaving in a way nobody authored —
  // the rule that hid a field is gone and the field appears, or the rule that
  // showed it is gone and it never does. So an unreadable ruleset is discarded
  // entirely, which puts the form back exactly where it was before #36: every
  // field shown, nothing conditionally required, nothing refused.
  const storedRules = rulesSchema.safeParse(record.rules);
  const rules: Rule[] | undefined =
    record.rules === undefined ? undefined : storedRules.success ? storedRules.data : undefined;

  const fields: SchemaField[] = [];
  const seen = new Set<string>();
  for (const entry of parsed.data.fields) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    // Re-run each field through the strict schema so the refinements (options
    // on choice types, compilable patterns) hold for anything the validator
    // will later act on. A field that fails is dropped, not fatal: the rest of
    // the schema is still worth honouring.
    const field = fieldSchema.safeParse(stripUnknown(raw));
    if (!field.success) continue;
    if (seen.has(field.data.key)) continue;
    seen.add(field.data.key);
    fields.push(field.data);
  }

  // Read and re-serialised in one step, which is what strips a property this
  // build does not know about and drops one whose value is already the default.
  // A row that carries `theme: {}`, or a theme whose every key is the default,
  // comes back with no `theme` at all — so reopening it and saving it again
  // writes the same bytes. See `serializeTheme`.
  const theme = serializeTheme(readStoredTheme(record));

  // Steps are all-or-nothing like rules, and for the same reason: a step list
  // with one screen missing is a form asking a different set of questions from
  // the one its owner published. Anything unreadable falls back to the
  // one-screen form, which is what every form was before #37.
  //
  // A step naming a field this build dropped above is left alone rather than
  // repaired. `planSteps` renders only the fields it can find, so a stale key
  // costs nothing — and rewriting somebody's step list on read would mean the
  // bytes that come back are not the bytes that went in.
  const steps = readStoredSteps(record);
  const partials = readStoredPartials(record);

  return {
    formatVersion: parsed.data.formatVersion,
    ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
    fields,
    ...(rules === undefined || rules.length === 0 ? {} : { rules }),
    ...(theme === undefined ? {} : { theme }),
    ...(steps === undefined ? {} : { steps }),
    // Dropped when it carries nothing but the defaults, so reopening a stored
    // schema and saving it again writes the same bytes.
    ...(serializePartials(partials) === undefined ? {} : { partials }),
  };
}

/** The properties this build knows about, and only those. */
function stripUnknown(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of [
    "key",
    "label",
    "type",
    "required",
    "help",
    "placeholder",
    "options",
    "validation",
  ]) {
    if (raw[key] !== undefined) out[key] = raw[key];
  }
  if (Array.isArray(raw.options)) {
    out.options = raw.options.map((option) =>
      option !== null && typeof option === "object"
        ? { value: (option as Record<string, unknown>).value, label: (option as Record<string, unknown>).label }
        : option,
    );
  }
  return out;
}

/**
 * What gets written to `form_schemas.fields`.
 *
 * Always stamped with the current `formatVersion`, so no row ever has to be
 * dated by guesswork.
 */
export function serializeSchemaDocument(document: FormSchemaDocument): FormSchemaDocument {
  const serializedTheme = document.theme === undefined ? undefined : serializeTheme(document.theme);
  return {
    formatVersion: SCHEMA_FORMAT_VERSION,
    ...(document.name === undefined ? {} : { name: document.name }),
    fields: document.fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      ...(field.help === undefined ? {} : { help: field.help }),
      ...(field.placeholder === undefined ? {} : { placeholder: field.placeholder }),
      ...(field.options === undefined ? {} : { options: field.options }),
      ...(field.validation === undefined ? {} : { validation: field.validation }),
    })),
    // Omitted entirely when there are none, so a form with no conditional logic
    // serialises to exactly the bytes it did before #36. The builder compares
    // the serialised document against what the server echoed back to decide
    // whether there are unsaved changes, and an always-present `rules: []`
    // would have made every stored schema look edited on first open.
    ...(document.rules === undefined || document.rules.length === 0
      ? {}
      : {
          rules: document.rules.map((rule) => ({
            ...(rule.label === undefined ? {} : { label: rule.label }),
            when: rule.when,
            then: rule.then.map((action) => ({ action: action.action, field: action.field })),
          })),
        }),
    // Omitted entirely when the theme sets nothing, so a form nobody has themed
    // serialises to exactly the bytes it did before #38 — the same requirement
    // `rules` has, and for the same reason: the builder decides whether there
    // are unsaved changes by comparing serialised documents, and an
    // always-present `theme: {}` would make every stored schema look edited the
    // moment it was opened.
    ...(serializedTheme === undefined ? {} : { theme: serializedTheme }),
    // Steps and partial settings, omitted entirely when there are none — the
    // same requirement as `rules` and `theme` above, for the same reason.
    ...(serializeSteps(document.steps) === undefined
      ? {}
      : { steps: serializeSteps(document.steps) }),
    ...(serializePartials(document.partials) === undefined
      ? {}
      : { partials: serializePartials(document.partials) }),
  };
}

/** Compiles a stored pattern, anchored. Returns null when it does not compile. */
export function compilePattern(source: string): RegExp | null {
  try {
    // HTML's `pattern` is implicitly anchored at both ends; matching it any
    // other way would accept values a browser refuses.
    return new RegExp(`^(?:${source})$`, "u");
  } catch {
    return null;
  }
}

/** Zod issues as sentences, with the path a person can act on. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : null;
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * NUL, the C0 range and DEL. Written as a code-point scan rather than a regex
 * so the source file itself stays free of literal control bytes.
 */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function emptyDocument(): FormSchemaDocument {
  return { formatVersion: SCHEMA_FORMAT_VERSION, fields: [] };
}

export function findField(
  document: FormSchemaDocument,
  key: string,
): SchemaField | undefined {
  return document.fields.find((field) => field.key === key);
}
