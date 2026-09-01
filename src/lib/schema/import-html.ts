import {
  collapseWhitespace,
  tokenizeHtml,
  type Attributes,
  type HtmlToken,
} from "./html.ts";
import {
  SCHEMA_FORMAT_VERSION,
  type FieldOption,
  type FieldType,
  type FieldValidation,
  type FormSchemaDocument,
  type SchemaField,
} from "./format.ts";
import { isReservedFieldName } from "./reserved.ts";

/**
 * Deriving a schema from HTML (#51, producer one).
 *
 * This is the bridge between the endpoint path and everything the schema
 * unlocks, and it is the producer most people will actually use: you already
 * have a form, you point us at it, and you get a Manifest. So it is written
 * against the markup people have rather than the markup examples have.
 *
 * ## What "real-world markup" turns out to mean
 *
 * Every one of these is handled deliberately, and each has a test:
 *
 * - **Nested labels.** `<label>Email <input name="email"></label>` is as common
 *   as `<label for="…">`, and a `for` that points at nothing at all is common
 *   too. Both wrapping and `for` are resolved, and a control with neither falls
 *   back through `aria-label`, `title`, `placeholder`, the enclosing
 *   `<legend>`, and finally a humanised version of its own name.
 * - **Controls with no `name`.** A browser does not submit them. They are
 *   skipped with a note that says exactly that, because the alternative is a
 *   schema field that can never be filled and therefore warns forever.
 * - **Duplicate names.** Two `<input name="email">` in one form post two
 *   values under one key, so they become one field, and the note says so.
 * - **`<select>` with `<optgroup>`.** Options are collected through the group;
 *   the group label is kept as the option's context rather than dropped.
 * - **Checkboxes sharing a name.** That is a multi-select, not five booleans —
 *   and a single checkbox is a boolean, not a one-option multi-select. The
 *   count decides, except for a `name` ending in `[]`, which is a group of one
 *   today and a group of six tomorrow.
 * - **Radios sharing a name.** One `select` field whose options are the radio
 *   values.
 * - **Hidden attribution inputs.** `gclid`, `utm_source`, `_next` and the rest
 *   never reach `values`, so importing them would produce a field that is
 *   missing on every submission. Skipped, with a note.
 * - **Unclosed tags, unquoted attributes, uppercase tag names, inline scripts
 *   containing `<`.** Handled in `./html.ts`, which never throws.
 *
 * ## What it will not do
 *
 * It does not execute JavaScript, so a form rendered entirely by a framework at
 * runtime imports as empty. That returns a note saying so rather than an empty
 * schema with no explanation — the fix is to paste the rendered markup, and the
 * import has to say that out loud or it looks broken.
 */

export type ImportNoteCode =
  | "no_form_element"
  | "multiple_forms"
  | "no_fields"
  | "control_without_name"
  | "duplicate_name"
  | "conflicting_types"
  | "reserved_name"
  | "unsupported_control"
  | "empty_option"
  | "no_options";

export type ImportNote = {
  code: ImportNoteCode;
  /** The field or control this is about, when there is one. */
  field: string | null;
  message: string;
};

export type ImportedForm = {
  /** The `<form action>` verbatim, when there was one. */
  action: string | null;
  method: string | null;
  id: string | null;
  name: string | null;
  document: FormSchemaDocument;
  notes: ImportNote[];
};

export type HtmlImportResult = {
  forms: ImportedForm[];
  /** Notes about the document as a whole, not about one form. */
  notes: ImportNote[];
};

// ---------------------------------------------------------------------------
// Control collection
// ---------------------------------------------------------------------------

type LabelAccumulator = { text: string };

type RawControl = {
  tag: "input" | "select" | "textarea";
  name: string;
  attrs: Attributes;
  /** Lowercased `type` for inputs; "select" or "textarea" otherwise. */
  inputType: string;
  wrappingLabel: LabelAccumulator | null;
  /**
   * A `<label for="…">` that points at this control's id. Resolved after the
   * whole document is scanned, because a floating-label pattern puts the label
   * *after* the input it names and a single forward pass would miss it.
   */
  explicitLabel: LabelAccumulator | null;
  legend: LabelAccumulator | null;
  options: FieldOption[];
};

type FormAccumulator = {
  action: string | null;
  method: string | null;
  id: string | null;
  name: string | null;
  controls: RawControl[];
  /** Controls we could not use, kept so the notes can explain each one. */
  notes: ImportNote[];
  synthetic: boolean;
};

/** Input types that are chrome, not data. */
const NON_DATA_INPUT_TYPES = new Set(["submit", "reset", "button", "image"]);

/** Input types with no home in the schema format. */
const UNSUPPORTED_INPUT_TYPES = new Set(["file"]);

const INPUT_TYPE_MAP: Record<string, FieldType> = {
  text: "text",
  search: "text",
  url: "text",
  password: "text",
  color: "text",
  email: "email",
  tel: "phone",
  number: "number",
  range: "number",
  date: "date",
  "datetime-local": "date",
  month: "date",
  week: "date",
  time: "text",
  hidden: "hidden",
};

export type ImportOptions = {
  /** Recorded on the form so a caller can tell two imports apart. */
  sourceUrl?: string;
};

export function importSchemaFromHtml(
  html: string,
  options: ImportOptions = {},
): HtmlImportResult {
  const tokens = tokenizeHtml(html);
  const { forms, notes } = collectForms(tokens);

  const imported = forms
    .map((form) => buildForm(form, options))
    .filter((form) => form !== null);

  if (imported.length === 0) {
    notes.push({
      code: "no_fields",
      field: null,
      message:
        "No submittable fields were found. If the form is rendered by JavaScript, paste the markup from the browser's element inspector rather than the page source.",
    });
  }

  if (imported.length > 1) {
    notes.push({
      code: "multiple_forms",
      field: null,
      message: `${imported.length} forms were found. Pick the one whose action or id matches the endpoint you are configuring.`,
    });
  }

  return { forms: imported, notes };
}

function collectForms(tokens: HtmlToken[]): {
  forms: FormAccumulator[];
  notes: ImportNote[];
} {
  const notes: ImportNote[] = [];
  const forms: FormAccumulator[] = [];

  // Controls that turn up outside any <form>. That is a pasted fragment, which
  // is exactly what someone copying "the form bit" out of their page produces.
  const stray: FormAccumulator = {
    action: null,
    method: null,
    id: null,
    name: null,
    controls: [],
    notes: [],
    synthetic: true,
  };

  let current: FormAccumulator | null = null;
  const openLabels: LabelAccumulator[] = [];
  const labelsFor = new Map<string, LabelAccumulator>();
  const legends: LabelAccumulator[] = [];
  let openLegend: LabelAccumulator | null = null;
  let openSelect: RawControl | null = null;
  let openOption: { value: string | null; text: string } | null = null;
  let optgroupLabel: string | null = null;
  let suppressText = 0;

  const target = () => current ?? stray;

  const closeLabels = () => {
    openLabels.length = 0;
  };

  for (const token of tokens) {
    if (token.kind === "text") {
      if (suppressText > 0) continue;
      if (openOption) {
        openOption.text += token.text;
        continue;
      }
      if (openLegend) openLegend.text += token.text;
      for (const label of openLabels) label.text += token.text;
      continue;
    }

    if (token.kind === "close") {
      switch (token.name) {
        case "form":
          closeLabels();
          legends.length = 0;
          current = null;
          break;
        case "label":
          openLabels.pop();
          break;
        case "legend":
          openLegend = null;
          break;
        case "fieldset":
          legends.pop();
          break;
        case "option":
          finishOption();
          break;
        case "optgroup":
          optgroupLabel = null;
          break;
        case "select":
          finishOption();
          openSelect = null;
          break;
        case "textarea":
        case "button":
          if (suppressText > 0) suppressText--;
          break;
      }
      continue;
    }

    const { name, attrs, selfClosing } = token;

    switch (name) {
      case "form": {
        closeLabels();
        current = {
          action: attrs.action ?? null,
          method: attrs.method?.toLowerCase() ?? null,
          id: attrs.id ?? null,
          name: attrs.name ?? null,
          controls: [],
          notes: [],
          synthetic: false,
        };
        forms.push(current);
        break;
      }

      case "label": {
        // Labels do not nest in valid HTML, and an unclosed one is common. A
        // new label ends the previous one rather than swallowing the rest of
        // the page into its text.
        const label: LabelAccumulator = { text: "" };
        openLabels.length = 0;
        openLabels.push(label);
        if (attrs.for !== undefined && attrs.for !== "") labelsFor.set(attrs.for, label);
        break;
      }

      case "fieldset": {
        const legend: LabelAccumulator = { text: "" };
        legends.push(legend);
        break;
      }

      case "legend": {
        openLegend = legends[legends.length - 1] ?? null;
        break;
      }

      case "optgroup":
        optgroupLabel = collapseWhitespace(attrs.label ?? "") || null;
        break;

      case "option": {
        finishOption();
        openOption = { value: attrs.value ?? null, text: "" };
        // `selected` is not carried into the schema: a default is a rendering
        // concern (#45), and a schema that hard-codes one would make the
        // renderer and the validator disagree the first time it changed.
        break;
      }

      case "select": {
        const control = makeControl("select", "select", attrs, openLabels, legends);
        openSelect = control;
        register(target(), control);
        break;
      }

      case "textarea": {
        suppressText++;
        const control = makeControl("textarea", "textarea", attrs, openLabels, legends);
        register(target(), control);
        break;
      }

      case "button":
        suppressText++;
        break;

      case "input": {
        const inputType = (attrs.type ?? "text").toLowerCase();
        const control = makeControl("input", inputType, attrs, openLabels, legends);
        register(target(), control);
        break;
      }
    }

    // A `<textarea/>` or `<button/>` written self-closing never sends a close
    // token, so the suppression counter has to be released here.
    if (selfClosing && (name === "textarea" || name === "button")) suppressText--;
  }

  function finishOption() {
    if (!openOption || !openSelect) {
      openOption = null;
      return;
    }
    const text = collapseWhitespace(openOption.text);
    const value = openOption.value ?? text;
    const label = text === "" ? value : text;
    openSelect.options.push({
      value,
      label: optgroupLabel ? `${optgroupLabel}: ${label}` : label,
    });
    openOption = null;
  }

  finishOption();

  for (const form of [...forms, stray]) {
    for (const control of form.controls) {
      const id = control.attrs.id;
      if (id === undefined || id === "") continue;
      control.explicitLabel = labelsFor.get(id) ?? null;
    }
  }

  if (stray.controls.length > 0) forms.push(stray);
  else notes.push(...stray.notes);

  if (forms.length === 0 || (forms.length === 1 && forms[0].synthetic)) {
    notes.push({
      code: "no_form_element",
      field: null,
      message:
        "No <form> element was found, so every control in the markup was treated as one form.",
    });
  }

  return { forms, notes };
}

function makeControl(
  tag: RawControl["tag"],
  inputType: string,
  attrs: Attributes,
  openLabels: LabelAccumulator[],
  legends: LabelAccumulator[],
): RawControl {
  return {
    tag,
    name: attrs.name ?? "",
    attrs,
    inputType,
    wrappingLabel: openLabels[openLabels.length - 1] ?? null,
    explicitLabel: null,
    legend: legends[legends.length - 1] ?? null,
    options: [],
  };
}

/** Adds a control to a form, or records why it was not usable. */
function register(form: FormAccumulator, control: RawControl): void {
  if (NON_DATA_INPUT_TYPES.has(control.inputType)) return;

  if (UNSUPPORTED_INPUT_TYPES.has(control.inputType)) {
    form.notes.push({
      code: "unsupported_control",
      field: control.name || null,
      message: `A file input${control.name ? ` ("${control.name}")` : ""} was skipped. Attachments are recorded on the submission but are not part of the schema format yet.`,
    });
    return;
  }

  if (control.name.trim() === "") {
    form.notes.push({
      code: "control_without_name",
      field: null,
      message: `A <${control.tag}${control.tag === "input" ? ` type="${control.inputType}"` : ""}> has no name attribute, so a browser never submits it. It was skipped.`,
    });
    return;
  }

  if (isReservedFieldName(control.name)) {
    form.notes.push({
      code: "reserved_name",
      field: control.name,
      message: `"${control.name}" is read by the endpoint itself — it becomes attribution or a redirect rather than a stored field — so it was left out of the schema.`,
    });
    return;
  }

  form.controls.push(control);
}

// ---------------------------------------------------------------------------
// Control groups to fields
// ---------------------------------------------------------------------------

function buildForm(form: FormAccumulator, options: ImportOptions): ImportedForm | null {
  const groups = new Map<string, RawControl[]>();
  for (const control of form.controls) {
    const existing = groups.get(control.name);
    if (existing) existing.push(control);
    else groups.set(control.name, [control]);
  }

  const notes = [...form.notes];
  const fields: SchemaField[] = [];

  for (const [name, controls] of groups) {
    const field = buildField(name, controls, notes);
    if (field) fields.push(field);
  }

  if (fields.length === 0 && notes.length === 0) return null;
  if (fields.length === 0 && form.synthetic) return null;

  const document: FormSchemaDocument = {
    formatVersion: SCHEMA_FORMAT_VERSION,
    ...(nameFor(form, options) === null ? {} : { name: nameFor(form, options)! }),
    fields,
  };

  return {
    action: form.action,
    method: form.method,
    id: form.id,
    name: form.name,
    document,
    notes,
  };
}

function nameFor(form: FormAccumulator, options: ImportOptions): string | null {
  return form.id ?? form.name ?? options.sourceUrl ?? null;
}

function buildField(
  name: string,
  controls: RawControl[],
  notes: ImportNote[],
): SchemaField | null {
  const types = new Set(controls.map((control) => control.inputType));
  const first = controls[0];

  if (controls.length > 1 && types.size > 1) {
    notes.push({
      code: "conflicting_types",
      field: name,
      message: `"${name}" is used by ${controls.length} controls of different types (${[...types].join(", ")}). It was imported once, as ${describe(first)}.`,
    });
  } else if (controls.length > 1 && first.inputType !== "checkbox" && first.inputType !== "radio") {
    notes.push({
      code: "duplicate_name",
      field: name,
      message: `"${name}" is used by ${controls.length} controls. A form posts one value list per name, so it was imported as a single field.`,
    });
  }

  if (first.inputType === "radio") {
    return choiceField(name, controls, "select", notes);
  }

  if (first.inputType === "checkbox") {
    // A single checkbox is a boolean — "I agree" — and turning it into a
    // one-option multi-select would misdescribe the most common checkbox there
    // is. A `[]` suffix is PHP-and-Rails for "this is a list", so it is trusted
    // over the count of one that happens to be in the markup today.
    if (controls.length === 1 && !name.endsWith("[]")) {
      return {
        key: name,
        label: labelFor(first, name),
        type: "checkbox",
        required: controls.some(isRequired),
      };
    }
    return choiceField(name, controls, "multi_select", notes);
  }

  if (first.tag === "select") {
    const multiple = first.attrs.multiple !== undefined;
    const options = dedupeOptions(
      controls.flatMap((control) => control.options),
      name,
      notes,
    );

    if (options.length === 0) {
      notes.push({
        code: "no_options",
        field: name,
        message: `"${name}" is a <select> with no usable options, so it was imported as a text field. Add its options to the schema if you want the values checked.`,
      });
      return {
        key: name,
        label: labelFor(first, name),
        type: "text",
        required: controls.some(isRequired),
      };
    }

    return {
      key: name,
      label: labelFor(first, name),
      type: multiple ? "multi_select" : "select",
      required: controls.some(isRequired),
      options,
      ...validationOf(first, multiple ? "multi_select" : "select"),
    };
  }

  const type = fieldTypeOf(first);
  const label = labelFor(first, name);

  return {
    key: name,
    label,
    type,
    required: controls.some(isRequired),
    ...placeholderOf(first, label),
    ...validationOf(first, type),
  };
}

/**
 * The control's own placeholder, kept as one.
 *
 * Dropped when it is the same string the label ended up being, which happens
 * whenever `labelFor` had nothing else to work with and fell back to it. A
 * field captioned "you@company.com" with "you@company.com" greyed out inside it
 * is the same words twice, and the imported form would look worse than the one
 * it came from.
 */
function placeholderOf(control: RawControl, label: string): { placeholder?: string } {
  if (control.tag === "select") return {};
  const placeholder = collapseWhitespace(control.attrs.placeholder ?? "");
  if (placeholder === "" || placeholder === label) return {};
  return { placeholder };
}

function choiceField(
  name: string,
  controls: RawControl[],
  type: "select" | "multi_select",
  notes: ImportNote[],
): SchemaField {
  const options = dedupeOptions(
    controls.map((control) => {
      // `value` defaults to "on" in a browser when it is omitted, which is what
      // is actually posted, so that is what the schema has to allow.
      const value = control.attrs.value ?? "on";
      const text = labelText(control);
      return { value, label: text === "" ? value : text };
    }),
    name,
    notes,
  );

  const groupLabel =
    collapseWhitespace(controls[0].legend?.text ?? "") || humanize(name);

  return {
    key: name,
    label: groupLabel,
    type,
    required: controls.some(isRequired),
    options,
  };
}

function dedupeOptions(
  options: FieldOption[],
  name: string,
  notes: ImportNote[],
): FieldOption[] {
  const out: FieldOption[] = [];
  const seen = new Set<string>();
  let droppedEmpty = false;

  for (const option of options) {
    if (option.value === "") {
      // `<option value="">Choose one…</option>` is a placeholder. Keeping it as
      // a legal value would mean a required select could be satisfied by not
      // choosing anything.
      droppedEmpty = true;
      continue;
    }
    if (seen.has(option.value)) continue;
    seen.add(option.value);
    out.push(option);
  }

  if (droppedEmpty) {
    notes.push({
      code: "empty_option",
      field: name,
      message: `"${name}" has an option with an empty value, which is a placeholder rather than a choice. It was not imported as an allowed value.`,
    });
  }

  return out;
}

function fieldTypeOf(control: RawControl): FieldType {
  if (control.tag === "textarea") return "textarea";
  return INPUT_TYPE_MAP[control.inputType] ?? "text";
}

function describe(control: RawControl): string {
  return control.tag === "input" ? `input type="${control.inputType}"` : `<${control.tag}>`;
}

function isRequired(control: RawControl): boolean {
  if (control.attrs.required === undefined) return false;
  // `required="false"` is not HTML, but people write it, and honouring it as
  // "required" would make a field mandatory that its author marked optional.
  return control.attrs.required.toLowerCase() !== "false";
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

function labelText(control: RawControl): string {
  const explicit = collapseWhitespace(control.explicitLabel?.text ?? "");
  if (explicit !== "") return explicit;
  const wrapping = collapseWhitespace(control.wrappingLabel?.text ?? "");
  if (wrapping !== "") return wrapping;
  return "";
}

function labelFor(control: RawControl, name: string): string {
  const direct = labelText(control);
  if (direct !== "") return trimLabel(direct);

  const aria = collapseWhitespace(control.attrs["aria-label"] ?? "");
  if (aria !== "") return trimLabel(aria);

  const title = collapseWhitespace(control.attrs.title ?? "");
  if (title !== "") return trimLabel(title);

  const placeholder = collapseWhitespace(control.attrs.placeholder ?? "");
  if (placeholder !== "") return trimLabel(placeholder);

  const legend = collapseWhitespace(control.legend?.text ?? "");
  if (legend !== "") return trimLabel(legend);

  return humanize(name);
}

/** Labels routinely carry a trailing colon and a required asterisk. */
function trimLabel(value: string): string {
  return value.replace(/[\s:*]+$/u, "").trim() || value;
}

/**
 * `first_name` and `firstName` and `contact[first-name]` all become
 * "First name". A generated label is not as good as the author's own, but it is
 * far better than showing a raw key in an inbox column header.
 */
export function humanize(name: string): string {
  const cleaned = name
    .replace(/\[\]$/u, "")
    .replace(/[[\]]+/gu, " ")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (cleaned === "") return name;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

function validationOf(
  control: RawControl,
  type: FieldType,
): { validation?: FieldValidation } {
  const validation: FieldValidation = {};
  const attrs = control.attrs;

  const minLength = intAttr(attrs.minlength);
  if (minLength !== null && minLength > 0) validation.minLength = minLength;

  const maxLength = intAttr(attrs.maxlength);
  if (maxLength !== null && maxLength > 0) validation.maxLength = maxLength;

  if (attrs.pattern !== undefined && attrs.pattern !== "") {
    // Kept only if it compiles here, so a schema never carries a pattern the
    // validator would silently skip.
    try {
      new RegExp(`^(?:${attrs.pattern})$`, "u");
      validation.pattern = attrs.pattern;
    } catch {
      /* An invalid pattern is dropped; the field still imports. */
    }
  }

  if (type === "number") {
    const min = numberAttr(attrs.min);
    if (min !== null) validation.min = min;
    const max = numberAttr(attrs.max);
    if (max !== null) validation.max = max;
    const step = numberAttr(attrs.step);
    if (step !== null && step > 0) validation.step = step;
  }

  if (type === "date") {
    if (attrs.min) validation.min = attrs.min;
    if (attrs.max) validation.max = attrs.max;
  }

  return Object.keys(validation).length > 0 ? { validation } : {};
}

function intAttr(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberAttr(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
