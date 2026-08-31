import { z } from "zod";

import type { JsonValue } from "../ingest/body.ts";
import {
  SCHEMA_FORMAT_VERSION,
  type FieldOption,
  type FieldType,
  type FormSchemaDocument,
  type SchemaField,
} from "./format.ts";
import { humanize } from "./import-html.ts";
import { isReservedFieldName } from "./reserved.ts";

/**
 * Proposing a schema from submissions already received (#51, producer three).
 *
 * This is the path for the endpoint that has been running for months against
 * markup nobody can find any more. It reads what actually arrived and proposes
 * a schema for a person to confirm.
 *
 * ## Propose, never apply
 *
 * Nothing in this module writes anything. There is no code path from ingest to
 * here, and `publishSchemaVersion` refuses a schema with `source: "inferred"`
 * unless a user id is supplied — so an inference cannot become the active
 * schema without a human having been in the loop. That is not a policy someone
 * has to remember; it is a precondition in `./store.ts`, and it has a test.
 *
 * The reason is the same one that makes `warn` the default mode: an inference
 * is a guess drawn from a sample, and a guess that starts validating live
 * traffic on its own is a footgun with a delay fuse. The single most dangerous
 * guess is `required` — mark a genuinely optional field required and every
 * submission that leaves it blank is flagged from then on. So `required` is
 * proposed only when the field was present and non-empty in **every single**
 * observed payload, and even then it is proposed, not applied.
 *
 * ## Where the types come from
 *
 * Every value of a key is examined, and the type is the narrowest one that
 * every value satisfies. Ties break wide: a column of digits that could be a
 * number or a phone number becomes text unless the name says otherwise,
 * because a leading zero on a "number" is a lost digit in someone's phone.
 */

/** Below this, an inference is not worth showing. Small samples propose noise. */
export const MIN_SUBMISSIONS_FOR_INFERENCE = 5;

/**
 * A key this rare, in a sample big enough to judge, is a stray rather than a
 * field: a one-off from a bot, a renamed input, a paste into the wrong form.
 * Seen exactly once counts as rare however small the sample, which is what
 * keeps a single spam submission from adding a field to the proposal.
 */
const RARE_KEY_RATIO = 0.05;

/** A key with at most this many distinct short values looks like a choice. */
const MAX_CHOICE_VALUES = 12;

/** ...and only if each value repeats, so a free-text field is not mistaken for one. */
const MIN_REPEATS_PER_CHOICE = 2;

/**
 * Past this, a value is prose rather than a line. An address or a long company
 * name can reach it, which is why the proposal is confirmed by a person — the
 * cost of guessing textarea for a text field is a slightly wrong label, and the
 * cost of guessing the other way is a truncated enquiry in an export.
 */
const LONG_TEXT_CHARS = 80;

export type InferredField = SchemaField & {
  /** How often this key was present and non-empty, 0–1. */
  presence: number;
  /** How sure we are of the *type*. Presence is reported separately. */
  confidence: "high" | "medium" | "low";
  /** Plain sentences for the confirmation screen. */
  notes: string[];
};

export type InferenceResult = {
  /** False when there were not enough submissions to say anything useful. */
  ready: boolean;
  observed: number;
  minimum: number;
  document: FormSchemaDocument;
  fields: InferredField[];
  notes: string[];
};

const emailCheck = z.email();

export type InferenceOptions = {
  /** Overridable so a test does not have to fabricate five payloads for one assertion. */
  minimum?: number;
};

export function inferSchema(
  payloads: readonly Record<string, JsonValue>[],
  options: InferenceOptions = {},
): InferenceResult {
  const minimum = options.minimum ?? MIN_SUBMISSIONS_FOR_INFERENCE;
  const notes: string[] = [];
  const total = payloads.length;

  // First-seen order, so the proposal reads in the order the form was filled
  // in rather than alphabetically.
  const observations = new Map<string, Observation>();
  for (const payload of payloads) {
    for (const key of Object.keys(payload)) {
      let observation = observations.get(key);
      if (!observation) {
        observation = newObservation();
        observations.set(key, observation);
      }
      record(observation, payload[key]);
    }
  }

  const fields: InferredField[] = [];

  for (const [key, observation] of observations) {
    if (isReservedFieldName(key)) {
      notes.push(
        `"${key}" was ignored: the endpoint reads it as attribution or a redirect, so it is never a stored field.`,
      );
      continue;
    }
    const field = proposeField(key, observation, total, minimum);
    if (field) fields.push(field);
    else {
      notes.push(
        `"${key}" appeared in ${observation.present} of ${total} submissions and was left out. Add it by hand if it belongs.`,
      );
    }
  }

  if (total < minimum) {
    notes.unshift(
      `Only ${total} submission${total === 1 ? "" : "s"} to read from; ${minimum} is the point at which a proposal is worth trusting. This one is a draft.`,
    );
  }

  notes.push(
    "Every field here was guessed from what arrived, not from your form. Check the required flags and the option lists before applying it.",
  );

  return {
    ready: total >= minimum && fields.length > 0,
    observed: total,
    minimum,
    document: {
      formatVersion: SCHEMA_FORMAT_VERSION,
      fields: fields.map(stripInferenceMetadata),
    },
    fields,
    notes,
  };
}

function stripInferenceMetadata(field: InferredField): SchemaField {
  const { presence, confidence, notes, ...rest } = field;
  void presence;
  void confidence;
  void notes;
  return rest;
}

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------

type Observation = {
  /** Payloads in which the key was present with a non-empty value. */
  present: number;
  /** Payloads in which the key was present but blank. */
  blank: number;
  values: string[];
  distinct: Map<string, number>;
  sawArray: boolean;
  sawBoolean: boolean;
  sawNumber: boolean;
  sawStructured: boolean;
  maxLength: number;
  sawNewline: boolean;
};

function newObservation(): Observation {
  return {
    present: 0,
    blank: 0,
    values: [],
    distinct: new Map(),
    sawArray: false,
    sawBoolean: false,
    sawNumber: false,
    sawStructured: false,
    maxLength: 0,
    sawNewline: false,
  };
}

function record(observation: Observation, raw: JsonValue | undefined): void {
  if (raw === undefined || raw === null) {
    observation.blank++;
    return;
  }

  const list = Array.isArray(raw) ? raw : [raw];
  if (Array.isArray(raw)) observation.sawArray = true;

  let any = false;
  for (const entry of list) {
    if (entry === null) continue;
    if (typeof entry === "boolean") {
      observation.sawBoolean = true;
      push(observation, String(entry));
      any = true;
      continue;
    }
    if (typeof entry === "number") {
      observation.sawNumber = true;
      push(observation, String(entry));
      any = true;
      continue;
    }
    if (typeof entry === "string") {
      if (entry.trim() === "") continue;
      push(observation, entry);
      any = true;
      continue;
    }
    observation.sawStructured = true;
  }

  if (any) observation.present++;
  else observation.blank++;
}

function push(observation: Observation, value: string): void {
  observation.values.push(value);
  observation.distinct.set(value, (observation.distinct.get(value) ?? 0) + 1);
  observation.maxLength = Math.max(observation.maxLength, value.length);
  if (value.includes("\n")) observation.sawNewline = true;
}

// ---------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------

function proposeField(
  key: string,
  observation: Observation,
  total: number,
  minimum: number,
): InferredField | null {
  if (observation.present === 0) return null;

  const presence = observation.present / total;
  if (total >= minimum && (observation.present <= 1 || presence < RARE_KEY_RATIO)) {
    return null;
  }

  const notes: string[] = [];
  const { type, confidence, options } = inferType(key, observation, notes);

  // Required only on a clean sweep. A single blank arrival is proof that the
  // form allows one, and proposing `required` anyway would flag it forever.
  const required = observation.present === total && observation.blank === 0;
  if (!required) {
    notes.push(
      `Present in ${observation.present} of ${total} submissions, not all of them, so it is proposed as optional.`,
    );
  }

  if (observation.sawStructured) {
    notes.push(
      "Some submissions sent a structured value (a file or a nested object) for this field.",
    );
  }

  return {
    key,
    label: humanize(key),
    type,
    required,
    ...(options ? { options } : {}),
    presence,
    confidence,
    notes,
  };
}

type TypeGuess = {
  type: FieldType;
  confidence: InferredField["confidence"];
  options?: FieldOption[];
};

function inferType(key: string, observation: Observation, notes: string[]): TypeGuess {
  const values = observation.values;
  const hint = nameHint(key);

  if (values.length === 0) return { type: "text", confidence: "low" };

  const every = (predicate: (value: string) => boolean) => values.every(predicate);

  if (every(isBooleanish) && observation.distinct.size <= 2 && !observation.sawArray) {
    return { type: "checkbox", confidence: observation.sawBoolean ? "high" : "medium" };
  }

  if (every((value) => emailCheck.safeParse(value.trim()).success)) {
    return { type: "email", confidence: "high" };
  }

  // Phone before number, and only on a name hint. A column of ten-digit
  // strings is a phone number far more often than it is an integer, and
  // `Number("0207946...")` silently eats the leading zero.
  if (hint === "phone" && every(isPhoneish)) {
    return { type: "phone", confidence: "high" };
  }

  if (every(isIsoDate)) {
    return { type: "date", confidence: "high" };
  }

  // Numbers are settled before choice sets, so a rating of 1-5 stays a number
  // rather than becoming a five-option dropdown.
  if (every(isNumeric) && hint !== "phone" && !observation.sawArray) {
    if (values.some(hasLeadingZero)) {
      notes.push(
        "Some values have a leading zero, which a number would lose, so this was left as text.",
      );
      return { type: "text", confidence: "low" };
    }
    return { type: "number", confidence: observation.sawNumber ? "high" : "medium" };
  }

  const choice = asChoice(observation);
  if (choice) {
    notes.push(
      "The options below are the values that have actually been submitted. An option nobody has picked yet will not be here.",
    );
    return {
      type: observation.sawArray ? "multi_select" : "select",
      confidence: "medium",
      options: choice,
    };
  }

  if (observation.sawNewline || observation.maxLength > LONG_TEXT_CHARS) {
    return { type: "textarea", confidence: "medium" };
  }

  if (observation.sawArray) {
    notes.push(
      "This field arrived as a list. It is proposed as text; make it a multi-select if it is a checkbox group.",
    );
  }

  return { type: "text", confidence: values.length > 0 ? "medium" : "low" };
}

function asChoice(observation: Observation): FieldOption[] | null {
  const distinct = observation.distinct;
  if (distinct.size === 0 || distinct.size > MAX_CHOICE_VALUES) return null;
  if (observation.maxLength > 60) return null;
  if (observation.values.length < distinct.size * MIN_REPEATS_PER_CHOICE) return null;

  return [...distinct.keys()].map((value) => ({ value, label: value }));
}

/** What the field's own name says it is, when it says anything. */
function nameHint(key: string): "phone" | "email" | null {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
  if (/(phone|mobile|cell|tel|fax|whatsapp)/.test(normalized)) return "phone";
  if (/(email|mail)/.test(normalized)) return "email";
  return null;
}

const BOOLEANISH = new Set(["true", "false", "on", "off", "yes", "no", "1", "0", "checked"]);

function isBooleanish(value: string): boolean {
  return BOOLEANISH.has(value.trim().toLowerCase());
}

function isNumeric(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  return Number.isFinite(Number(trimmed));
}

function hasLeadingZero(value: string): boolean {
  return /^[+-]?0\d/.test(value.trim());
}

function isPhoneish(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 20 && /^[+()\-. \d]*$/.test(value.trim());
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/.test(value.trim());
}
