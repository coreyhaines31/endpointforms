import {
  compilePattern,
  FIELD_TYPES,
  isChoiceType,
  parseSchemaDocument,
  type FieldType,
  type FormSchemaDocument,
  type SchemaField,
} from "../../../lib/schema/format.ts";
import { isReservedFieldName } from "../../../lib/schema/reserved.ts";

/**
 * The builder's editing state, and the only place it is turned back into a
 * schema document (#35).
 *
 * ## Why this file has no React in it
 *
 * Two reasons, and the second is the load-bearing one.
 *
 * The builder is the fourth producer of a `FormSchemaDocument` — after HTML
 * import, a declared file, and inference — and `src/lib/schema/index.ts` says
 * plainly that it "hands `store.ts` a document like every other producer does".
 * So the interesting part of the builder is a pure function from what someone
 * typed to a document the rest of the system already understands, and that
 * function is testable without a browser. `tests/builder-state.test.mts` loads
 * this module directly under `node --experimental-strip-types`, which is why
 * the imports above are relative and carry their extensions.
 *
 * ## The rule this file exists to keep
 *
 * **The builder never decides what a valid field is.** Every structural
 * complaint it shows — a select with no options, a pattern that does not
 * compile, a minLength above its maxLength, two fields sharing a name — comes
 * from running the edited state through `parseSchemaDocument` and reading back
 * what Zod said. If a rule needs to change, it changes in
 * `src/lib/schema/format.ts` and this screen follows for free.
 *
 * There are exactly three things this module knows that the format does not,
 * and each is advice about *consequences* rather than a second definition of a
 * field:
 *
 *   1. A **reserved name** is consumed by the endpoint before `values` is ever
 *      written, so a schema field of that name would read as permanently
 *      missing on every submission. See `reserved.ts`.
 *   2. **Renaming a key that is already published is a breaking change.** The
 *      key is the HTML `name` attribute and the Manifest tool's argument name;
 *      it is the contract, not a caption.
 *   3. `minSelected` above `maxSelected` is unsatisfiable. The format accepts
 *      it because it accepts anything a person could plausibly have meant, and
 *      nobody means this.
 *
 * ## Why constraints are held as strings
 *
 * A number input mid-edit is `""`, or `"-"`, or `"1e"`. Storing these as
 * `number | undefined` would force a decision on every keystroke about whether
 * a half-typed value means "unset" — and the honest answer is that it means
 * nothing yet. They are text until the moment they become a document.
 */

export type DraftOption = { id: string; value: string; label: string };

/**
 * One field, as the editor holds it.
 *
 * Every property is present and every one is a string or a boolean, so a
 * controlled input never flips between controlled and uncontrolled and no
 * caller has to spell `?? ""`. `toSchemaField` is what drops the blanks.
 */
export type DraftField = {
  /** Client-side only. Never leaves this module; the schema key is `key`. */
  id: string;
  /**
   * The key this row carried when the editor was opened, or null for a row
   * somebody added since.
   *
   * This is what makes a rename *detectable*. Without it, "the field formerly
   * called `email` is now called `work_email`" and "there is a new field called
   * `work_email` and `email` is gone" are the same edit — and only one of them
   * is worth interrupting somebody over.
   */
  originKey: string | null;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  help: string;
  placeholder: string;
  options: DraftOption[];
  minLength: string;
  maxLength: string;
  pattern: string;
  min: string;
  max: string;
  step: string;
  minSelected: string;
  maxSelected: string;
};

export type DraftDocument = {
  name: string;
  fields: DraftField[];
};

export type IssueSeverity = "error" | "warning";

export type BuilderIssue = {
  /** The `DraftField.id` this is about, or null for the document as a whole. */
  fieldId: string | null;
  severity: IssueSeverity;
  message: string;
};

// ---------------------------------------------------------------------------
// What the Server Actions hand back
// ---------------------------------------------------------------------------

/**
 * These live here rather than in `src/actions/form-state.ts` for the reason
 * that file names itself: a `"use server"` module may only export async
 * functions, so the shape its `useActionState` callers need has to sit outside
 * one. This module is already the vocabulary both halves share.
 */
export type SchemaActionState = {
  status: "idle" | "success" | "error";
  message: string;
  /** The version number this action wrote, when it wrote one. */
  version?: number;
  /**
   * Exactly what got stored, as `mode|document-json`.
   *
   * Echoed back rather than remembered on the client, because the client's
   * answer to "what did I just save?" is a guess about timing. A save that
   * lands while somebody is still typing has not saved the words typed since,
   * and a screen that then says "no unsaved changes" is lying about the one
   * thing it exists to be right about. The server knows; it says.
   */
  saved?: string;
};

export const idleSchemaState: SchemaActionState = { status: "idle", message: "" };

/** One form an import found. Several is normal — a page can hold more than one. */
export type ImportCandidate = {
  id: string;
  /** How the form identifies itself: its id, its name, or its action. */
  label: string;
  /** The `<form action>` verbatim, when there was one. */
  action: string | null;
  fieldCount: number;
  document: FormSchemaDocument;
  /** What the importer could not do cleanly, in its own words. */
  notes: string[];
};

export type ImportActionState = {
  status: "idle" | "success" | "error";
  message: string;
  candidates: ImportCandidate[];
  /** Notes about the page as a whole rather than about one form. */
  notes: string[];
};

export const idleImportState: ImportActionState = {
  status: "idle",
  message: "",
  candidates: [],
  notes: [],
};

// ---------------------------------------------------------------------------
// Constructing
// ---------------------------------------------------------------------------

const EMPTY_FIELD: Omit<DraftField, "id"> = {
  originKey: null,
  key: "",
  label: "",
  type: "text",
  required: false,
  help: "",
  placeholder: "",
  options: [],
  minLength: "",
  maxLength: "",
  pattern: "",
  min: "",
  max: "",
  step: "",
  minSelected: "",
  maxSelected: "",
};

export function newDraftField(id: string, seed: Partial<DraftField> = {}): DraftField {
  return { ...EMPTY_FIELD, ...seed, id };
}

export function newDraftOption(id: string, seed: Partial<DraftOption> = {}): DraftOption {
  return { id, value: "", label: "", ...seed };
}

export function emptyDraft(): DraftDocument {
  return { name: "", fields: [] };
}

/** A stored document, opened for editing. Ids are positional and stable. */
export function fromDocument(document: FormSchemaDocument): DraftDocument {
  return {
    name: document.name ?? "",
    fields: document.fields.map((field, index) => fromField(field, `f${index}`)),
  };
}

function fromField(field: SchemaField, id: string): DraftField {
  const validation = field.validation;
  return {
    id,
    originKey: field.key,
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    help: field.help ?? "",
    placeholder: field.placeholder ?? "",
    options: (field.options ?? []).map((option, index) => ({
      id: `${id}-o${index}`,
      value: option.value,
      label: option.label,
    })),
    minLength: text(validation?.minLength),
    maxLength: text(validation?.maxLength),
    pattern: validation?.pattern ?? "",
    min: text(validation?.min),
    max: text(validation?.max),
    step: text(validation?.step),
    minSelected: text(validation?.minSelected),
    maxSelected: text(validation?.maxSelected),
  };
}

function text(value: number | string | undefined): string {
  return value === undefined ? "" : String(value);
}

// ---------------------------------------------------------------------------
// Turning edits back into a document
// ---------------------------------------------------------------------------

/**
 * One field, in the shape `parseSchemaDocument` reads.
 *
 * Deliberately typed `unknown`: this is the *input* to validation, not its
 * output, and half of what makes the builder worth having is that it can hold a
 * field that is not yet a valid one. Claiming `SchemaField` here would be a lie
 * the type system then propagates.
 */
export function toSchemaField(field: DraftField): unknown {
  const out: Record<string, unknown> = {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
  };

  if (field.help.trim() !== "") out.help = field.help;
  if (field.placeholder.trim() !== "") out.placeholder = field.placeholder;

  if (isChoiceType(field.type)) {
    out.options = field.options.map((option) => ({
      value: option.value,
      // An option nobody labelled reads better as its own value than as a gap.
      label: option.label.trim() === "" ? option.value : option.label,
    }));
  }

  const validation = toValidation(field);
  if (validation !== undefined) out.validation = validation;

  return out;
}

function toValidation(field: DraftField): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  const takesText = TEXTUAL.has(field.type);

  if (takesText) {
    put(out, "minLength", integer(field.minLength));
    put(out, "maxLength", integer(field.maxLength));
  }
  if (PATTERNABLE.has(field.type) && field.pattern.trim() !== "") {
    out.pattern = field.pattern;
  }
  if (field.type === "number") {
    put(out, "min", decimal(field.min));
    put(out, "max", decimal(field.max));
    put(out, "step", decimal(field.step));
  }
  if (field.type === "date") {
    // A date bound is the literal a `<input type="date" min>` carries. Parsing
    // it into a number here would store a timestamp nobody typed and which
    // `controls.ts` then refuses to emit.
    if (field.min.trim() !== "") out.min = field.min.trim();
    if (field.max.trim() !== "") out.max = field.max.trim();
  }
  if (field.type === "multi_select") {
    put(out, "minSelected", integer(field.minSelected));
    put(out, "maxSelected", integer(field.maxSelected));
  }

  return Object.keys(out).length === 0 ? undefined : out;
}

function put(target: Record<string, unknown>, key: string, value: number | undefined): void {
  if (value !== undefined) target[key] = value;
}

/**
 * A half-typed number is not a number.
 *
 * `""`, `"-"` and `"1e"` all mean "the person is still typing", and every one
 * of them becomes `NaN` or `0` under a careless `Number()`. Returning
 * `undefined` leaves the constraint unset, which is the truthful reading —
 * and if what they end up typing really is nonsense, the format rejects it
 * with its own message rather than this file inventing one.
 */
function integer(value: string): number | undefined {
  // Deliberately the same as `decimal`. A `2.5` typed into a maxLength box is
  // passed through so the format can say "expected int" in its own words,
  // rather than being silently rounded into a rule nobody wrote.
  return decimal(value);
}

function decimal(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Types where a length constraint is a real constraint. Mirrors `controls.ts`. */
const TEXTUAL = new Set<FieldType>(["text", "textarea", "email", "phone"]);

/** Types where `pattern` is enforced rather than ignored. Mirrors `controls.ts`. */
const PATTERNABLE = new Set<FieldType>(["text", "email", "phone"]);

/** The whole document, in the shape `parseSchemaDocument` reads. */
export function toSchemaDocument(draft: DraftDocument): unknown {
  const out: Record<string, unknown> = {
    fields: draft.fields.map(toSchemaField),
  };
  if (draft.name.trim() !== "") out.name = draft.name.trim();
  return out;
}

/** The document, if the whole of it is valid. Errors otherwise, as sentences. */
export function parseDraft(draft: DraftDocument) {
  return parseSchemaDocument(toSchemaDocument(draft));
}

/**
 * What the preview can actually draw.
 *
 * A field that does not parse is left out rather than guessed at, and the
 * screen says how many were left out. Rendering a broken field as though it
 * were fine is how a preview stops being evidence.
 */
export function previewDocument(draft: DraftDocument): {
  document: FormSchemaDocument;
  skipped: number;
} {
  const fields: SchemaField[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  for (const field of draft.fields) {
    const parsed = parseSchemaDocument({ fields: [toSchemaField(field)] });
    // A duplicate key is a document-level fault, and the second one has to go:
    // two controls posting one name is exactly what the format refuses.
    if (!parsed.ok || seen.has(parsed.document.fields[0].key)) {
      skipped += 1;
      continue;
    }
    seen.add(parsed.document.fields[0].key);
    fields.push(parsed.document.fields[0]);
  }

  return {
    document: {
      formatVersion: 1,
      ...(draft.name.trim() === "" ? {} : { name: draft.name.trim() }),
      fields,
    },
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

/**
 * Everything wrong with the draft, attributed to the field it belongs to.
 *
 * `publishedKeys` is what the live version declares. It is what makes a rename
 * detectable at all: without it, a renamed field and a newly-added one are the
 * same edit, and only one of them breaks somebody's HTML.
 */
export function draftIssues(
  draft: DraftDocument,
  publishedKeys: readonly string[] = [],
): BuilderIssue[] {
  const issues: BuilderIssue[] = [];

  for (const field of draft.fields) {
    for (const message of formatIssuesFor(field)) {
      issues.push({ fieldId: field.id, severity: "error", message });
    }
    for (const issue of consequenceIssuesFor(field, draft, publishedKeys)) {
      issues.push(issue);
    }
  }

  issues.push(...removedKeyIssues(draft, publishedKeys));

  return issues;
}

/**
 * The format's own complaints about one field, as sentences.
 *
 * Run one field at a time so the message can be attached to the row that
 * caused it. The `fields.0.` prefix Zod prepends is stripped, because it names
 * a position in an array the person editing has never seen.
 */
function formatIssuesFor(field: DraftField): string[] {
  const parsed = parseSchemaDocument({ fields: [toSchemaField(field)] });
  if (parsed.ok) return [];
  return parsed.errors.map(stripPath);
}

function stripPath(message: string): string {
  return message.replace(/^fields\.0\.?/, "").replace(/^[a-zA-Z0-9_.[\]]*:\s*/, "");
}

function consequenceIssuesFor(
  field: DraftField,
  draft: DraftDocument,
  publishedKeys: readonly string[],
): BuilderIssue[] {
  const issues: BuilderIssue[] = [];
  const key = field.key;

  if (key.trim() !== "") {
    const duplicate = draft.fields.some(
      (other) => other.id !== field.id && other.key === key,
    );
    if (duplicate) {
      issues.push({
        fieldId: field.id,
        severity: "error",
        message: `Two fields are named "${key}". A form posts one value list per name, so a schema can only describe it once.`,
      });
    }

    // A rename, reported against the row that did it. Never an error — this is
    // a change somebody may well mean, and the only wrong move is letting them
    // make it without knowing what it costs. The key is the HTML `name`
    // attribute and the Manifest tool's argument name; it is the contract.
    if (
      field.originKey !== null &&
      field.originKey !== key &&
      publishedKeys.includes(field.originKey)
    ) {
      issues.push({
        fieldId: field.id,
        severity: "warning",
        message: `This field is published as "${field.originKey}". Renaming it to "${key}" is a breaking change: HTML posting "${field.originKey}" will stop matching the schema, and an agent calling the tool will have to send "${key}" instead.`,
      });
    }

    if (isReservedFieldName(key)) {
      issues.push({
        fieldId: field.id,
        severity: "error",
        message: `"${key}" is consumed by the endpoint before a submission is stored — it becomes attribution or a redirect, not an answer. A schema field of that name would look empty on every submission. Pick another name.`,
      });
    }
  }

  if (field.type === "multi_select") {
    const min = decimal(field.minSelected);
    const max = decimal(field.maxSelected);
    if (min !== undefined && max !== undefined && min > max) {
      issues.push({
        fieldId: field.id,
        severity: "error",
        message: `"${label(field)}" asks for at least ${min} selections and allows at most ${max}. Nothing can satisfy both.`,
      });
    }
  }

  return issues;
}

/**
 * A key that used to be published and now is not.
 *
 * Reported against the document rather than a field, because the field it
 * belonged to may have been deleted — and a deleted key breaks exactly as much
 * markup as a renamed one. Never an error: this is a change somebody may well
 * mean, and the only wrong move is letting them make it without knowing.
 */
function removedKeyIssues(
  draft: DraftDocument,
  publishedKeys: readonly string[],
): BuilderIssue[] {
  if (publishedKeys.length === 0) return [];

  const current = new Set(draft.fields.map((field) => field.key));
  // A key whose row is still on screen under a new name has already been
  // reported against that row, in a sentence that names both halves. Saying it
  // again here would be the same warning twice, and the second copy is the one
  // with less information in it.
  const renamed = new Set(
    draft.fields
      .filter((field) => field.originKey !== null && field.originKey !== field.key)
      .map((field) => field.originKey as string),
  );

  const gone = publishedKeys.filter((key) => !current.has(key) && !renamed.has(key));
  if (gone.length === 0) return [];

  const list = gone.map((key) => `"${key}"`).join(", ");
  return [
    {
      fieldId: null,
      severity: "warning",
      message:
        gone.length === 1
          ? `${list} is in the published version and not in this draft. Any HTML posting that name, and any agent calling the tool with that argument, stops matching the schema the moment you publish.`
          : `${list} are in the published version and not in this draft. Any HTML posting those names, and any agent calling the tool with those arguments, stops matching the schema the moment you publish.`,
    },
  ];
}

function label(field: DraftField): string {
  return field.label.trim() !== "" ? field.label : field.key || "This field";
}

// ---------------------------------------------------------------------------
// Moving fields
// ---------------------------------------------------------------------------

/** A field moved to a new index. Out-of-range moves are no-ops, not errors. */
export function moveField(
  fields: readonly DraftField[],
  from: number,
  to: number,
): DraftField[] {
  if (from === to) return [...fields];
  if (from < 0 || from >= fields.length) return [...fields];
  if (to < 0 || to >= fields.length) return [...fields];

  const next = [...fields];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** What each type is called on screen, and what it is for. */
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  email: "Email",
  phone: "Phone",
  number: "Number",
  select: "Choose one",
  multi_select: "Choose several",
  checkbox: "Checkbox",
  textarea: "Long text",
  date: "Date",
  hidden: "Hidden",
};

export const FIELD_TYPE_ORDER: readonly FieldType[] = FIELD_TYPES;

/**
 * A field name suggested from a label.
 *
 * Only ever used to fill an *empty* key, and never to correct one somebody
 * typed: the key is the contract with their existing markup, and quietly
 * rewriting it is the one thing this screen must not do.
 */
export function suggestKey(labelText: string): string {
  const slug = labelText
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.slice(0, 64);
}

/** True when a pattern would be rejected. Used to warn before the parse does. */
export function patternCompiles(source: string): boolean {
  return source.trim() === "" || compilePattern(source) !== null;
}
