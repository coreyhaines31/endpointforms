import { sanitizeString } from "../ingest/body.ts";
import type { FormSchemaDocument, SchemaField } from "../schema/format.ts";
import { isReservedFieldName } from "../schema/reserved.ts";
import { isControlParam, type Query } from "./params.ts";

/**
 * Filling a form in from its own URL (#39).
 *
 * ## What this input actually is
 *
 * A query parameter on a hosted form is **attacker-controlled text that we are
 * about to render into a form somebody is going to submit**. Not "customer
 * configuration" — anyone who can get a link in front of a person can set every
 * parameter on it. Two separate things follow, and conflating them is how this
 * feature goes wrong:
 *
 *   1. It must not execute. That one is easy and it is React's: every value
 *      below lands in a `value`/`defaultValue` prop, which is escaped, and
 *      nothing in the render path interpolates a prefill value into markup or
 *      into script. `?email=<script>alert(1)</script>` becomes an input
 *      containing those nineteen characters as text.
 *   2. **It must not become a claim the submitter never made.** This is the
 *      harder one and it is the reason for the rules below.
 *
 * ## The rule, stated once
 *
 * > A URL may fill in something the person can see and change. It may never
 * > fill in something they cannot.
 *
 * That single sentence decides every case:
 *
 * - **`hidden` fields are never prefilled.** A hidden field prefilled from a
 *   URL is the embedder's assertion wearing the submitter's signature: the
 *   person sees a contact form, and the row records that they said their plan
 *   was `enterprise` and their referrer was `partner-x`. They did not say it.
 *   Refusing this outright is stronger than recording provenance beside it,
 *   costs nothing anybody needs, and — unlike a provenance column — cannot be
 *   read past by whoever writes the export three months from now.
 * - **Reserved names are never prefilled.** `_redirect` from a query string is
 *   an open redirect on a page whose whole job is to be linked to. `gclid` is
 *   attribution, which has its own columns and its own four-source resolution
 *   in `attribution.ts`; it must not also be able to arrive as one of the
 *   customer's own answers.
 * - **A choice field only accepts its own choices.** Otherwise a URL writes a
 *   value into a controlled vocabulary that the builder guarantees is closed,
 *   and every consumer downstream that trusted the option list is wrong.
 *
 * ## Attribution is embedder-asserted, and that is not a contradiction
 *
 * `_page_url` *is* set from the URL, by `page.tsx`, and it is exactly the thing
 * this module refuses to do. The difference is where it lands: attribution goes
 * to dedicated columns that are documented as "where the traffic said it came
 * from", never into `values`, and it has been settable by anyone who can POST
 * to `/e/{id}` since long before this feature existed. The invariant being
 * protected here is narrower and worth protecting on its own — *the customer's
 * own fields* mean what the person filling them in meant.
 *
 * ## Prefill never overwrites an answer
 *
 * The retry path (`flash.ts`) carries what somebody typed back to a re-rendered
 * form. Prefill is skipped entirely whenever that flash is in force — see
 * `page.tsx`. Merging the two would mean a URL silently restoring a value
 * somebody had just deleted, which is the same bug as a hidden field: a claim
 * they did not make.
 */

export type PrefillRefusal =
  /** The name is ours (`ef_*`) or the retry flag. */
  | "control_parameter"
  /** The endpoint consumes this name before `values` is written. */
  | "reserved_name"
  /** Invisible to the person submitting, so not theirs to assert. */
  | "hidden_field"
  /** Not one of the field's declared options. */
  | "not_an_option"
  /** Longer than a URL has any business putting in a form. */
  | "too_long";

export type Prefill = {
  /** In the shape `FormView` already takes for the retry path. */
  values: Record<string, string | string[]>;
  /** Fields actually filled in, in schema order. */
  keys: string[];
  /** What was asked for and refused. Diagnostics; nothing renders it. */
  refused: { key: string; reason: PrefillRefusal }[];
};

export const NO_PREFILL: Prefill = { values: {}, keys: [], refused: [] };

/**
 * Dropped whole rather than truncated, for `flash.ts`'s reason: a silently
 * shortened answer is one somebody submits without noticing.
 */
const MAX_VALUE_CHARS = 512;

/** What a query string may say to tick a box. */
const TRUE_WORDS = new Set(["1", "true", "yes", "on"]);
const FALSE_WORDS = new Set(["0", "false", "no", "off"]);

function values(raw: string | string[] | undefined): string[] {
  if (raw === undefined) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** Trimmed, control characters removed, or null if there is nothing left. */
function clean(raw: string): string | null {
  const value = sanitizeString(raw).trim();
  return value === "" ? null : value;
}

/**
 * Prefill from the form page's own query string.
 *
 * Iterates the **schema**, not the query: a page can carry any number of
 * parameters and a schema is capped at 250 fields, so the work is bounded by
 * something we control. It also means an unrecognised parameter is silently
 * not a field rather than a refusal worth recording — most query strings are
 * mostly not field names.
 */
export function prefillFromQuery(document: FormSchemaDocument, query: Query): Prefill {
  const out: Prefill = { values: {}, keys: [], refused: [] };

  for (const field of document.fields) {
    const raw = values(query[field.key]);
    if (raw.length === 0) continue;

    const refuse = (reason: PrefillRefusal) => out.refused.push({ key: field.key, reason });

    if (isControlParam(field.key)) {
      refuse("control_parameter");
      continue;
    }
    if (isReservedFieldName(field.key)) {
      refuse("reserved_name");
      continue;
    }
    if (field.type === "hidden") {
      refuse("hidden_field");
      continue;
    }
    if (raw.some((entry) => entry.length > MAX_VALUE_CHARS)) {
      refuse("too_long");
      continue;
    }

    const resolved = resolve(field, raw, refuse);
    if (resolved === null) continue;

    out.values[field.key] = resolved;
    out.keys.push(field.key);
  }

  return out;
}

function resolve(
  field: SchemaField,
  raw: string[],
  refuse: (reason: PrefillRefusal) => void,
): string | string[] | null {
  switch (field.type) {
    case "checkbox": {
      const value = clean(raw[0] ?? "");
      if (value === null) return null;
      const word = value.toLowerCase();
      // `?consent=0` is a real thing to write and it means "leave it alone",
      // not "this is invalid". Only a word that is neither is a refusal.
      if (FALSE_WORDS.has(word)) return null;
      if (!TRUE_WORDS.has(word)) {
        refuse("not_an_option");
        return null;
      }
      // Any non-empty entry ticks the box in `FormView`; "on" is what a browser
      // would have posted for a checkbox with no `value` attribute.
      return ["on"];
    }

    case "select": {
      const value = clean(raw[0] ?? "");
      if (value === null) return null;
      if (!declares(field, value)) {
        refuse("not_an_option");
        return null;
      }
      return value;
    }

    case "multi_select": {
      const chosen: string[] = [];
      let rejected = false;
      for (const entry of raw) {
        const value = clean(entry);
        if (value === null) continue;
        if (!declares(field, value)) {
          rejected = true;
          continue;
        }
        if (!chosen.includes(value)) chosen.push(value);
      }
      // Refused per *field*, not per value: a URL naming three options of which
      // one is invented should not quietly tick the two that happened to exist.
      // Either the caller knows the vocabulary or it does not.
      if (rejected) {
        refuse("not_an_option");
        return null;
      }
      return chosen.length === 0 ? null : chosen;
    }

    default: {
      const value = clean(raw[0] ?? "");
      return value;
    }
  }
}

function declares(field: SchemaField, value: string): boolean {
  return (field.options ?? []).some((option) => option.value === value);
}
