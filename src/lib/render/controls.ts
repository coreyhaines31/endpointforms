import type { SchemaField } from "../schema/format.ts";

/**
 * A schema field, as the browser controls it actually becomes.
 *
 * Everything in this module exists to make the rendered markup *honest*: the
 * control a browser produces for a declared type, the constraints a browser can
 * enforce on its own, and the hints that decide which keyboard a phone opens.
 *
 * Two of those are load-bearing for reasons beyond politeness:
 *
 *   - **Native constraints are the no-JavaScript validation layer.** `required`,
 *     `type="email"`, `min`, `maxlength` and `pattern` are enforced by the
 *     browser with scripting off. Server-side checking still runs and still has
 *     to render properly (`../../app/f/[formId]/submit/route.ts`), but almost
 *     nobody should ever see it.
 *   - **`inputmode` and `autocomplete` are conversion, not accessibility
 *     theatre.** A phone number field that opens a QWERTY keyboard, or an email
 *     field a password manager cannot fill, costs completions on exactly the
 *     paid traffic this product exists to defend.
 */

/** How many options before a checkbox group becomes an unusable wall. */
export const MAX_CHECKBOX_OPTIONS = 12;

export type ControlKind =
  | "input"
  | "textarea"
  | "select"
  | "checkbox"
  | "checkbox-group"
  | "multi-select"
  | "hidden";

export function controlKind(field: SchemaField): ControlKind {
  switch (field.type) {
    case "textarea":
      return "textarea";
    case "select":
      return "select";
    case "checkbox":
      return "checkbox";
    case "multi_select":
      // A short list is checkboxes, which every visitor can operate. A long one
      // becomes a native multiple-select, because two hundred checkboxes is not
      // a form, and `<select multiple>` is at least a control a browser can
      // scroll and a screen reader can walk.
      return (field.options?.length ?? 0) > MAX_CHECKBOX_OPTIONS ? "multi-select" : "checkbox-group";
    case "hidden":
      return "hidden";
    default:
      return "input";
  }
}

/** The `type` attribute for the field types that become a plain `<input>`. */
export function inputType(field: SchemaField): string {
  switch (field.type) {
    case "email":
      return "email";
    case "phone":
      return "tel";
    case "number":
      return "number";
    case "date":
      return "date";
    default:
      return "text";
  }
}

/** The subset of `inputmode` values a schema field can produce. */
export type InputMode = "email" | "tel" | "numeric" | "decimal";

export function inputMode(field: SchemaField): InputMode | undefined {
  switch (field.type) {
    case "email":
      return "email";
    case "phone":
      return "tel";
    case "number":
      // `decimal` unless the step says whole numbers only. The difference is
      // whether an iPhone shows a decimal point.
      return field.validation?.step !== undefined && Number.isInteger(field.validation.step)
        ? "numeric"
        : "decimal";
    default:
      return undefined;
  }
}

/**
 * The constraints a browser can check for itself.
 *
 * `pattern` is only ever put on the input types that support it. On a
 * `<textarea>` or a `type="number"` the attribute is not merely ignored, it is
 * *invalid*, and emitting it would put a rule in the DOM that nothing enforces
 * — which is worse than not having it, because a later reader believes it.
 */
export type NativeConstraints = {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: string | number;
  max?: string | number;
  step?: number;
};

export function nativeConstraints(field: SchemaField): NativeConstraints {
  const out: NativeConstraints = {};
  const kind = controlKind(field);

  // A checkbox *group* cannot carry `required`: the attribute means "this box",
  // so putting it on each one demands every option be ticked. The server is the
  // only place a "choose at least one" rule can live, and it does.
  if (field.required && kind !== "checkbox-group") out.required = true;

  const validation = field.validation;
  if (!validation) return out;

  const takesText = kind === "input" || kind === "textarea";
  const takesLength = takesText && field.type !== "number" && field.type !== "date";

  if (takesLength) {
    if (validation.minLength !== undefined) out.minLength = validation.minLength;
    if (validation.maxLength !== undefined) out.maxLength = validation.maxLength;
  }

  if (kind === "input" && PATTERNABLE.has(field.type)) {
    if (validation.pattern !== undefined) out.pattern = validation.pattern;
  }

  if (field.type === "number") {
    if (validation.min !== undefined) out.min = validation.min;
    if (validation.max !== undefined) out.max = validation.max;
    if (validation.step !== undefined) out.step = validation.step;
  }

  if (field.type === "date") {
    // Only a string is a date bound. A number here is a timestamp somebody
    // stored by mistake, and `<input type="date" min="1764547200000">` is
    // ignored by the browser and confusing in the DOM.
    if (typeof validation.min === "string") out.min = validation.min;
    if (typeof validation.max === "string") out.max = validation.max;
  }

  return out;
}

/** Input types where `pattern` is a real constraint rather than a no-op. */
const PATTERNABLE = new Set(["text", "email", "phone"]);

// ---------------------------------------------------------------------------
// autocomplete
// ---------------------------------------------------------------------------

/**
 * The autofill token for a field, guessed from its name.
 *
 * Guessed, because the schema has nowhere to declare one — see the note in
 * `src/app/f/[formId]/page.tsx`. The guesses are conservative: a key has to
 * match a known name outright, and anything unrecognised gets no attribute at
 * all rather than a wrong one. A wrong token is worse than none, because the
 * browser will confidently fill the wrong value into a lead form.
 */
export function autoCompleteFor(field: SchemaField): string | undefined {
  const direct = AUTOCOMPLETE[normalizeKey(field.key)];
  if (direct) return direct;

  // Falling back on the declared type is safe where the type *is* the token.
  if (field.type === "email") return "email";
  if (field.type === "phone") return "tel";
  return undefined;
}

/** Lowercased, with everything that is not a letter or digit removed. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const AUTOCOMPLETE: Record<string, string> = {
  email: "email",
  emailaddress: "email",
  workemail: "email",
  name: "name",
  fullname: "name",
  yourname: "name",
  firstname: "given-name",
  fname: "given-name",
  givenname: "given-name",
  lastname: "family-name",
  lname: "family-name",
  surname: "family-name",
  familyname: "family-name",
  company: "organization",
  companyname: "organization",
  organisation: "organization",
  organization: "organization",
  business: "organization",
  jobtitle: "organization-title",
  role: "organization-title",
  phone: "tel",
  telephone: "tel",
  tel: "tel",
  mobile: "tel",
  phonenumber: "tel",
  website: "url",
  url: "url",
  address: "street-address",
  address1: "address-line1",
  addressline1: "address-line1",
  streetaddress: "street-address",
  address2: "address-line2",
  addressline2: "address-line2",
  city: "address-level2",
  town: "address-level2",
  state: "address-level1",
  province: "address-level1",
  region: "address-level1",
  county: "address-level1",
  zip: "postal-code",
  zipcode: "postal-code",
  postcode: "postal-code",
  postalcode: "postal-code",
  country: "country-name",
};
