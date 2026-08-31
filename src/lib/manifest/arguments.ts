import type { JsonValue } from "../ingest/body.ts";
import { ORIGIN_TOKEN_FIELD_KEYS } from "../origin/token.ts";
import { isReservedFieldName } from "../schema/reserved.ts";
import { findField, type FormSchemaDocument, type SchemaField } from "../schema/format.ts";
import { validateSubmission, type ValidationIssue } from "../schema/validate.ts";

/**
 * Turning a tool call's arguments into a submission (#32).
 *
 * ## Why this file exists at all
 *
 * An agent sends JSON with real types: `true`, `42`, `["a","b"]`. A browser
 * sends `application/x-www-form-urlencoded`, where everything is a string, an
 * unticked box sends nothing at all and a ticked one sends `"on"`.
 *
 * If the two surfaces wrote different shapes into `submissions.values`, then
 * "one definition, two surfaces" would be false at the only place it can be
 * checked — the row. An export would hold `42` in one row and `"42"` in the
 * next; the inbox would render a boolean where every other submission has a
 * word. So this module normalises an agent's arguments to **exactly what the
 * rendered page would have posted**, and the row it produces is
 * indistinguishable in shape from a person's.
 *
 * ## The one place it is stricter than the form endpoint, and why
 *
 * `/e/{id}` stores a payload that does not match the schema and reports the
 * mismatch, because it is pointed at forms we did not render and losing a lead
 * is worse than storing a messy one — `validate.ts` argues that at length and
 * it is not weakened here.
 *
 * Here, an error-severity issue is a **rejection**. That is the same rule
 * applied to a caller that can act on it. The human page enforces `required`,
 * `type="email"` and `pattern` in the browser, before anything is sent, so
 * almost nobody reaches the server with those wrong. A tool call is the agent's
 * equivalent of that moment, and the agent is the one party in this product
 * that can read a field-level reason and immediately send a corrected call.
 * Storing junk and answering "accepted" throws away the only chance to get the
 * lead right.
 */

/** Field names the endpoint consumes before `values` is written. */
function isConsumedByEndpoint(key: string): boolean {
  return isReservedFieldName(key) || (ORIGIN_TOKEN_FIELD_KEYS as readonly string[]).includes(key);
}

export type CoercionResult = {
  /** What to post, shaped exactly as the rendered page would have posted it. */
  values: Record<string, JsonValue>;
  /** Errors that stop the call, in the same shape as a validation issue. */
  errors: ValidationIssue[];
  /** Mismatches worth reporting that did not stop it. */
  warnings: ValidationIssue[];
};

/**
 * Coerce and check, in one pass.
 *
 * Checking is delegated to `validateSubmission` — the same function the ingest
 * path runs — so a rule can never be enforced differently on the two surfaces.
 * The only thing decided here is the shape of the values it runs against.
 */
export function prepareSubmission(
  document: FormSchemaDocument,
  args: Record<string, unknown>,
): CoercionResult {
  const values: Record<string, JsonValue> = {};
  const shapeErrors: ValidationIssue[] = [];

  for (const [key, raw] of Object.entries(args)) {
    if (raw === undefined || raw === null) continue;
    const field = findField(document, key);
    const coerced = field
      ? coerceDeclared(field, raw, shapeErrors)
      : coerceUndeclared(key, raw, shapeErrors);
    if (coerced === undefined) continue;
    // `defineProperty` rather than assignment, for the same reason `body.ts`
    // uses it: an argument named `__proto__` must be a field, not a mutation.
    Object.defineProperty(values, key, {
      value: coerced,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  // The endpoint lifts these onto their own columns before `values` is written,
  // so a validator reading them here would report fields that are about to stop
  // existing. Excluded from the check; still sent, so `utm_source` from an
  // agent lands in the same column as `utm_source` from a page.
  const checkable: Record<string, JsonValue> = {};
  for (const key of Object.keys(values)) {
    if (isConsumedByEndpoint(key)) continue;
    checkable[key] = values[key];
  }

  const validation = validateSubmission(document, checkable);

  return {
    values,
    errors: [...shapeErrors, ...validation.errors],
    warnings: validation.warnings,
  };
}

// ---------------------------------------------------------------------------
// Per-field coercion
// ---------------------------------------------------------------------------

/**
 * Returns what the browser would have posted, or `undefined` for "post nothing".
 */
function coerceDeclared(
  field: SchemaField,
  raw: unknown,
  errors: ValidationIssue[],
): JsonValue | undefined {
  switch (field.type) {
    case "checkbox":
      return coerceCheckbox(field, raw, errors);

    case "multi_select": {
      const list = Array.isArray(raw) ? raw : [raw];
      const out: string[] = [];
      for (const entry of list) {
        if (entry === null || entry === undefined) continue;
        const scalar = asScalarString(entry);
        if (scalar === null) {
          errors.push(
            shapeError(
              field.key,
              `"${field.label}" takes a list of text values; one entry was ${describeType(entry)}.`,
            ),
          );
          continue;
        }
        // A blank entry is a box nobody ticked, which posts nothing.
        if (scalar.trim() === "") continue;
        out.push(scalar);
      }
      // A checkbox group with nothing ticked posts nothing at all, and the
      // difference matters: an empty array in `values` is a field the visitor
      // answered with "none", which is not what happened.
      return out.length === 0 ? undefined : out;
    }

    default: {
      if (Array.isArray(raw)) {
        // Passed through rather than refused. A repeated name is something a
        // real form produces, and `validate.ts` already has the right answer
        // for it — a warning, with every value kept.
        const out: string[] = [];
        for (const entry of raw) {
          if (entry === null || entry === undefined) continue;
          const scalar = asScalarString(entry);
          if (scalar === null) {
            errors.push(
              shapeError(
                field.key,
                `"${field.label}" takes text; one entry was ${describeType(entry)}.`,
              ),
            );
            continue;
          }
          out.push(scalar);
        }
        return out.length === 0 ? undefined : out;
      }

      const scalar = asScalarString(raw);
      if (scalar === null) {
        errors.push(
          shapeError(
            field.key,
            `"${field.label}" takes a single text value; ${describeType(raw)} was sent. Send it the way a person would type it.`,
          ),
        );
        return undefined;
      }
      return scalar.trim() === "" ? undefined : scalar;
    }
  }
}

/**
 * A lone checkbox, which is the one control whose absence is meaningful.
 *
 * `true` becomes `"on"` — the value a browser posts for an
 * `<input type="checkbox">` with no `value` attribute, which is exactly what
 * `form-view.tsx` renders. `false` posts nothing, because that is what an
 * unticked box does.
 *
 * The bug this prevents is worth naming: `validate.ts` treats *any* present
 * value as ticked, so handing `false` straight through would record a consent
 * nobody gave.
 */
function coerceCheckbox(
  field: SchemaField,
  raw: unknown,
  errors: ValidationIssue[],
): JsonValue | undefined {
  if (typeof raw === "boolean") return raw ? "on" : undefined;

  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "" || normalized === "false" || normalized === "off" || normalized === "0") {
      return undefined;
    }
    // "on", "true", "yes", or the customer's own value — a browser posts
    // whatever the value attribute said, so anything else is kept verbatim.
    return raw;
  }

  if (typeof raw === "number") return raw === 0 ? undefined : "on";

  errors.push(
    shapeError(
      field.key,
      `"${field.label}" is a checkbox and takes true or false; ${describeType(raw)} was sent.`,
    ),
  );
  return undefined;
}

/**
 * A field the schema does not declare.
 *
 * Kept, not refused. `validate.ts` reports it as a warning on every surface,
 * and an endpoint that started refusing a hidden input somebody added to their
 * page would be the drift this whole design exists to prevent.
 */
function coerceUndeclared(
  key: string,
  raw: unknown,
  errors: ValidationIssue[],
): JsonValue | undefined {
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const entry of raw) {
      if (entry === null || entry === undefined) continue;
      const scalar = asScalarString(entry);
      if (scalar === null) {
        errors.push(
          shapeError(
            key,
            `"${key}" is not in the schema and one of its entries is ${describeType(entry)}, which cannot be stored as a form value.`,
          ),
        );
        continue;
      }
      out.push(scalar);
    }
    return out.length === 0 ? undefined : out;
  }

  const scalar = asScalarString(raw);
  if (scalar === null) {
    errors.push(
      shapeError(
        key,
        `"${key}" is not in the schema and was sent as ${describeType(raw)}. A form posts text, so send it as a string.`,
      ),
    );
    return undefined;
  }
  return scalar;
}

// ---------------------------------------------------------------------------

/**
 * The string a browser would have put on the wire, or null when there isn't one.
 *
 * Numbers and booleans are stringified rather than kept as JSON. A row written
 * by an agent has to be shaped like a row written by a page, and a page has no
 * way to post the number 42 — it posts `"42"`.
 */
function asScalarString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return String(value);
  return null;
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "number" && !Number.isFinite(value)) return "a non-finite number";
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

function shapeError(field: string, message: string): ValidationIssue {
  return { field, code: "unsupported_value", severity: "error", message };
}
