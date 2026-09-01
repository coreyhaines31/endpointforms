import { z } from "zod";

import type { JsonValue } from "../ingest/body.ts";
import { evaluateRules, readAnswer, type FieldOutcome } from "../rules/evaluate.ts";
import {
  compilePattern,
  findField,
  type FormSchemaDocument,
  type SchemaField,
} from "./format.ts";

/**
 * Reading a submission against a schema (#51).
 *
 * ## The rule this whole file exists to enforce
 *
 * **Adding a schema must never break an endpoint that was working without one.**
 *
 * Somebody's lead capture has been running for six months against markup nobody
 * has looked at since. They import a schema to get a Manifest, and the import
 * gets one field's type slightly wrong. If that starts dropping submissions,
 * we have put a footgun in the one place a customer cannot afford one.
 *
 * So validation here produces a **description, not a verdict**. Every mismatch
 * becomes an issue with a severity, the submission is stored either way, and
 * only an endpoint whose owner has deliberately set `mode = "strict"` refuses
 * anything at all. `docs/21-data-model.md` records the same rule in the column
 * defaults; this is the code half of it.
 *
 * ## Why some mismatches can never be errors
 *
 * ## Conditional logic is enforced here, and only here
 *
 * A `required` rule that only ran in a browser would not exist: a raw POST has
 * no browser, and neither does an agent. So `evaluateRules` runs on this path
 * for every submission, from every surface, and it is the same function the
 * page's enhancement calls — see `src/lib/rules/evaluate.ts`.
 *
 * Two consequences follow, and both are load-bearing:
 *
 *   - **A field the rules did not ask for is never required.** It is not
 *     checked at all. A conditional requirement that could refuse a submission
 *     whose condition is false would be a schema that started dropping leads,
 *     which is the one thing this file exists to prevent.
 *   - **An answer to a hidden field is kept and named.** Never dropped, never
 *     an error. `answered_hidden_field` is a warning in every mode.
 *
 * A field in the payload that the schema does not mention is always a
 * **warning**, in every mode. Adding a hidden input to your HTML is a routine,
 * additive change, and an endpoint that starts 422ing because a marketing tag
 * appended `msclkid` would be indefensible. The same reasoning covers a field
 * that arrived twice: the data is present, only its shape is surprising.
 *
 * ## Nothing is persisted from here
 *
 * Issues are derived, not stored. A submission carries the immutable
 * `schema_version_id` it arrived under and the `values` it arrived with, so
 * re-deriving them later gives exactly the same answer — and re-deriving them
 * against the version in force *that day* keeps being right after the schema
 * has moved on. A submission that predates the schema has a null
 * `schema_version_id` and therefore no issues, forever: declaring a schema
 * cannot retroactively flag history.
 */

export type IssueSeverity = "error" | "warning";

export type IssueCode =
  | "missing_required"
  | "unknown_field"
  | "repeated_value"
  | "unsupported_value"
  | "not_an_option"
  | "invalid_email"
  | "invalid_phone"
  | "invalid_number"
  | "invalid_date"
  | "invalid_choice_count"
  | "too_short"
  | "too_long"
  | "pattern_mismatch"
  | "out_of_range"
  | "answered_hidden_field"
  | "rules_ignored";

export type ValidationIssue = {
  /** The payload key, or null for an issue about the submission as a whole. */
  field: string | null;
  code: IssueCode;
  severity: IssueSeverity;
  /** A sentence naming what to change, addressed to whoever owns the form. */
  message: string;
};

export type ValidationResult = {
  /** No errors. Warnings do not make a submission invalid. */
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

const EMPTY_RESULT: ValidationResult = { valid: true, issues: [], errors: [], warnings: [] };

const emailCheck = z.email();

/**
 * Describes a payload against a schema.
 *
 * Pure and synchronous: no database, no clock, no configuration. The ingest
 * path calls it before writing the row and the inbox calls it when displaying
 * one, and both must get the same answer.
 */
export function validateSubmission(
  document: FormSchemaDocument | null,
  values: Record<string, JsonValue>,
): ValidationResult {
  if (!document) return EMPTY_RESULT;

  const issues: ValidationIssue[] = [];

  // Conditional logic (#36). The same evaluator the browser runs, on the same
  // answers, so a rule cannot fire on one surface and not the other. A document
  // with no rules skips it entirely and validates exactly as it did before.
  const evaluation =
    (document.rules?.length ?? 0) > 0 ? evaluateRules(document, values) : null;

  if (evaluation?.degraded) {
    // Said out loud rather than swallowed. A form whose logic we could not run
    // is a form behaving differently from the one its owner published, and the
    // owner finding that out from a warning on a submission is the whole
    // difference between this product and the category it is arguing with.
    issues.push({
      field: null,
      code: "rules_ignored",
      severity: "warning",
      message: `This form's conditional logic could not be evaluated, so it was ignored: every field was treated as shown and none as conditionally required. ${evaluation.degraded}`,
    });
  }

  for (const field of document.fields) {
    const outcome = evaluation?.fields[field.key];

    if (outcome && !outcome.visible) {
      // The field was not being asked, so there is nothing to check. What there
      // *is*, sometimes, is an answer — from a visitor who filled it in before
      // a rule hid it, or from a caller that sent it anyway. It is stored, and
      // it is named. Never an error, in any mode: a rule must not be able to
      // turn a lead into a 422, and the answer is not lost either way.
      if (readAnswer(values, field.key).length > 0) {
        issues.push({
          field: field.key,
          code: "answered_hidden_field",
          severity: "warning",
          message: `"${field.label}" carries an answer, but this form's rules do not ask for it under these answers (${outcome.visibility.note.replace(/\.$/, "")}). It is stored as-is and left out of the checks.`,
        });
      }
      continue;
    }

    validateField(field, values[field.key], issues, outcome);
  }

  for (const key of Object.keys(values)) {
    if (findField(document, key)) continue;
    // A blank extra field is not news. Honeypots post empty strings and so do
    // hidden inputs whose script did not run; warning about them would bury the
    // one warning that matters under noise on every submission.
    if (isBlank(values[key])) continue;
    issues.push({
      field: key,
      code: "unknown_field",
      severity: "warning",
      // Never an error, in any mode. See the note at the top of this file.
      message: `"${key}" was submitted but is not in the schema. It is stored as-is; add it to the schema if it should be exported or validated.`,
    });
  }

  return summarize(issues);
}

/** Nothing, an empty string, or a list of nothings. */
function isBlank(value: JsonValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.every(isBlank);
  return false;
}

function summarize(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { valid: errors.length === 0, issues, errors, warnings };
}

// ---------------------------------------------------------------------------
// Per-field
// ---------------------------------------------------------------------------

function validateField(
  field: SchemaField,
  raw: JsonValue | undefined,
  issues: ValidationIssue[],
  outcome: FieldOutcome | undefined,
): void {
  const present = extract(field, raw, issues);

  // A rule can only ever *add* a requirement (`format.ts` in `src/lib/rules`
  // explains why there is no `optional` action), and a field the rules did not
  // ask for never reaches here at all. So this is the declared requirement, or
  // a rule's, and the message says which.
  const required = outcome?.required ?? field.required;

  if (present.values.length === 0) {
    if (required) {
      const because =
        outcome && outcome.requirement.ruleIndex !== null
          ? ` ${outcome.requirement.note}`
          : "";
      issues.push({
        field: field.key,
        code: "missing_required",
        severity: "error",
        message: `"${field.label}" is required and arrived empty.${because}`,
      });
    }
    // An optional field left blank is the single most common thing a form
    // posts. It gets no further checks and no issue of any kind.
    return;
  }

  if (field.type === "checkbox") {
    // Reaching here means something was posted for it, which is what a checked
    // box is. An unchecked box posts nothing and was handled above.
    return;
  }

  if (field.type === "multi_select") {
    validateChoiceCount(field, present.values, issues);
  } else if (present.values.length > 1) {
    issues.push({
      field: field.key,
      code: "repeated_value",
      severity: "warning",
      message: `"${field.label}" was submitted ${present.values.length} times but is declared as a single value. All of them are stored.`,
    });
  }

  for (const value of present.values) {
    validateValue(field, value, issues);
  }
}

/**
 * The scalar strings a field's raw payload value holds.
 *
 * A checkbox group posts an array, a repeated name collapses into one, and a
 * `fetch()` can send a number or a boolean. All of it is normalised to strings
 * for checking; nothing here changes what gets stored.
 */
function extract(
  field: SchemaField,
  raw: JsonValue | undefined,
  issues: ValidationIssue[],
): { values: string[] } {
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const values: string[] = [];

  for (const entry of list) {
    if (entry === null) continue;
    if (typeof entry === "string") {
      // A whitespace-only value is a field the visitor did not fill in.
      if (entry.trim() === "") continue;
      values.push(entry);
      continue;
    }
    if (typeof entry === "number" || typeof entry === "boolean") {
      values.push(String(entry));
      continue;
    }
    issues.push({
      field: field.key,
      code: "unsupported_value",
      severity: "warning",
      message: `"${field.label}" received a structured value rather than text. It is stored, but cannot be checked against the schema.`,
    });
  }

  return { values };
}

function validateValue(field: SchemaField, value: string, issues: ValidationIssue[]): void {
  const trimmed = value.trim();

  switch (field.type) {
    case "email":
      if (!emailCheck.safeParse(trimmed).success) {
        issues.push(error(field, "invalid_email", `"${field.label}" is not an email address.`));
      }
      break;

    case "phone":
      if (!isPhone(trimmed)) {
        issues.push(
          error(field, "invalid_phone", `"${field.label}" is not a phone number.`),
        );
      }
      break;

    case "number": {
      const parsed = Number(trimmed);
      if (trimmed === "" || !Number.isFinite(parsed)) {
        issues.push(error(field, "invalid_number", `"${field.label}" is not a number.`));
        break;
      }
      checkRange(field, parsed, issues);
      break;
    }

    case "date": {
      const parsed = parseDate(trimmed);
      if (parsed === null) {
        issues.push(error(field, "invalid_date", `"${field.label}" is not a date.`));
        break;
      }
      checkDateRange(field, parsed, trimmed, issues);
      break;
    }

    case "select":
    case "multi_select":
      if (!(field.options ?? []).some((option) => option.value === value)) {
        issues.push(
          error(
            field,
            "not_an_option",
            `"${field.label}" received ${JSON.stringify(value)}, which is not one of its options.`,
          ),
        );
      }
      break;

    case "text":
    case "textarea":
    case "hidden":
      break;

    case "checkbox":
      break;
  }

  checkLength(field, value, issues);
  checkPattern(field, value, issues);
}

function checkLength(field: SchemaField, value: string, issues: ValidationIssue[]): void {
  const validation = field.validation;
  if (!validation) return;

  if (validation.minLength !== undefined && value.length < validation.minLength) {
    issues.push(
      error(
        field,
        "too_short",
        `"${field.label}" is shorter than the ${validation.minLength} characters the schema requires.`,
      ),
    );
  }
  if (validation.maxLength !== undefined && value.length > validation.maxLength) {
    issues.push(
      error(
        field,
        "too_long",
        `"${field.label}" is longer than the ${validation.maxLength} characters the schema allows.`,
      ),
    );
  }
}

function checkPattern(field: SchemaField, value: string, issues: ValidationIssue[]): void {
  const source = field.validation?.pattern;
  if (source === undefined) return;
  const pattern = compilePattern(source);
  // An uncompilable pattern is our problem, not the visitor's. `format.ts`
  // refuses to store one, so this can only be a row from a build that did not.
  if (!pattern) return;
  if (!pattern.test(value)) {
    issues.push(
      error(field, "pattern_mismatch", `"${field.label}" does not match the required format.`),
    );
  }
}

function checkRange(field: SchemaField, value: number, issues: ValidationIssue[]): void {
  const validation = field.validation;
  if (!validation) return;

  const min = asNumber(validation.min);
  const max = asNumber(validation.max);

  if (min !== null && value < min) {
    issues.push(error(field, "out_of_range", `"${field.label}" is below the minimum of ${min}.`));
  }
  if (max !== null && value > max) {
    issues.push(error(field, "out_of_range", `"${field.label}" is above the maximum of ${max}.`));
  }
}

function checkDateRange(
  field: SchemaField,
  value: number,
  literal: string,
  issues: ValidationIssue[],
): void {
  const validation = field.validation;
  if (!validation) return;

  const min = typeof validation.min === "string" ? parseDate(validation.min) : null;
  const max = typeof validation.max === "string" ? parseDate(validation.max) : null;

  if (min !== null && value < min) {
    issues.push(
      error(field, "out_of_range", `"${field.label}" (${literal}) is earlier than ${validation.min}.`),
    );
  }
  if (max !== null && value > max) {
    issues.push(
      error(field, "out_of_range", `"${field.label}" (${literal}) is later than ${validation.max}.`),
    );
  }
}

function validateChoiceCount(
  field: SchemaField,
  values: string[],
  issues: ValidationIssue[],
): void {
  const validation = field.validation;
  if (!validation) return;

  if (validation.minSelected !== undefined && values.length < validation.minSelected) {
    issues.push(
      error(
        field,
        "invalid_choice_count",
        `"${field.label}" needs at least ${validation.minSelected} selections and got ${values.length}.`,
      ),
    );
  }
  if (validation.maxSelected !== undefined && values.length > validation.maxSelected) {
    issues.push(
      error(
        field,
        "invalid_choice_count",
        `"${field.label}" allows at most ${validation.maxSelected} selections and got ${values.length}.`,
      ),
    );
  }
}

function error(field: SchemaField, code: IssueCode, message: string): ValidationIssue {
  return { field: field.key, code, severity: "error", message };
}

function asNumber(value: number | string | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A phone number as people actually type them.
 *
 * Deliberately loose. Country conventions vary more than any regex can hold,
 * and the failure mode of a strict check is refusing a real customer's real
 * number — so this only asks whether there are plausibly enough digits and
 * nothing that could not be part of a dialable string.
 */
function isPhone(value: string): boolean {
  if (!/^[+()\-. \d /x;,ext]*$/i.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 20;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/** Milliseconds, or null. Only shapes a date input actually produces. */
function parseDate(value: string): number | null {
  const match = ISO_DATE.exec(value.trim());
  if (match) {
    const parsed = Date.parse(value.trim().length === 10 ? `${value.trim()}T00:00:00Z` : value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  // A form that posts `03/14/2026` is ambiguous by construction, and guessing
  // which half is the month is how a European lead gets the wrong date. It is
  // reported as not-a-date rather than silently interpreted.
  return null;
}
