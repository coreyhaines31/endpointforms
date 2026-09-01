import type { SchemaField } from "../schema/format.ts";
import type { IssueCode } from "../schema/validate.ts";

/**
 * What a visitor reads when their submission comes back.
 *
 * `validate.ts` already writes a message for every issue, and those messages are
 * right for the audience they were written for — "whoever owns the form". They
 * say things like *is not one of its options* and *does not match the required
 * format*, which tell a developer where to look and tell a visitor nothing they
 * can act on.
 *
 * So the codes are reused and the sentences are not. Every message here names
 * the thing to do, in the second person, and repeats the field's own label so
 * that reading it out of context — from an error summary, or through a screen
 * reader jumping between live regions — still identifies which box is wrong.
 *
 * Deriving the text here rather than carrying it in the redirect is also what
 * lets the retry cookie hold nothing but codes. See `./flash.ts`.
 */
export function visitorMessage(code: IssueCode, field: SchemaField | undefined): string {
  const label = field?.label ?? "This field";
  const validation = field?.validation;

  switch (code) {
    case "missing_required":
      return field && isChoice(field)
        ? `Choose an option for “${label}”.`
        : `Enter your ${lower(label)}.`;

    case "invalid_email":
      return `Enter an email address in the format name@example.com.`;

    case "invalid_phone":
      return `Enter a phone number using digits, and optionally + ( ) - and spaces.`;

    case "invalid_number":
      return `Enter “${label}” as a number.`;

    case "invalid_date":
      return `Enter “${label}” as a date, in the format YYYY-MM-DD.`;

    case "not_an_option":
      return `Choose one of the listed options for “${label}”.`;

    case "invalid_choice_count": {
      const min = validation?.minSelected;
      const max = validation?.maxSelected;
      if (min !== undefined && max !== undefined) {
        return `Choose between ${min} and ${max} options for “${label}”.`;
      }
      if (min !== undefined) {
        return `Choose at least ${min} ${plural(min, "option")} for “${label}”.`;
      }
      if (max !== undefined) {
        return `Choose no more than ${max} ${plural(max, "option")} for “${label}”.`;
      }
      return `Change how many options you chose for “${label}”.`;
    }

    case "too_short":
      return validation?.minLength === undefined
        ? `“${label}” is too short.`
        : `Use at least ${validation.minLength} ${plural(validation.minLength, "character")} for “${label}”.`;

    case "too_long":
      return validation?.maxLength === undefined
        ? `“${label}” is too long.`
        : `Use ${validation.maxLength} ${plural(validation.maxLength, "character")} or fewer for “${label}”.`;

    case "pattern_mismatch":
      // The help text is the only place the form's author ever explains the
      // format they want, so it beats anything generic we could write.
      return field?.help
        ? `“${label}” is not in the expected format: ${field.help}`
        : `“${label}” is not in the expected format.`;

    case "out_of_range": {
      const min = validation?.min;
      const max = validation?.max;
      if (min !== undefined && max !== undefined) {
        return `Enter “${label}” between ${min} and ${max}.`;
      }
      if (min !== undefined) return `Enter “${label}” as ${min} or more.`;
      if (max !== undefined) return `Enter “${label}” as ${max} or less.`;
      return `“${label}” is outside the allowed range.`;
    }

    // These are warnings in every mode and never reach a visitor. Handled so
    // that adding a code to `IssueCode` is a compile error here rather than a
    // blank message on somebody's form.
    //
    // `answered_hidden_field` and `rules_ignored` (#36) belong to this group
    // for a reason worth stating: they describe the *form's* conditional logic
    // to the person who owns it, and neither is ever something to stop a
    // visitor with. A rule must not be able to turn a lead into an error page.
    case "unknown_field":
    case "repeated_value":
    case "unsupported_value":
    case "answered_hidden_field":
    case "rules_ignored":
      return `Check “${label}”.`;
  }
}

/** The heading over the error summary. */
export function summaryTitle(count: number): string {
  return count === 1 ? "There is a problem" : `There are ${count} problems`;
}

function isChoice(field: SchemaField): boolean {
  return field.type === "select" || field.type === "multi_select" || field.type === "checkbox";
}

/**
 * "Enter your work email", not "Enter your Work email" — but "Enter your VAT
 * number" keeps its capitals, because lowercasing an acronym looks like a bug.
 */
function lower(label: string): string {
  const first = label.slice(0, 1);
  const rest = label.slice(1);
  return rest === rest.toLowerCase() ? `${first.toLowerCase()}${rest}` : label;
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
