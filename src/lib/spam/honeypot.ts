/**
 * The decoy fields (#31).
 *
 * A field no person should fill, whose population is evidence of an
 * indiscriminate DOM filler. Twenty years old, free, and — per
 * `/spam/honeypot-fields`, which is live on our own site — still worth running
 * as long as two things are true. We published both, so we are held to both:
 *
 * 1. **"Technically visible but humanely hidden."** `display:none`,
 *    `visibility:hidden`, `type=hidden`, zero size and `aria-hidden` are all
 *    read by any filler worth the name. `HONEYPOT_STYLE` below is a real,
 *    rendered, laid-out element that a person never sees.
 * 2. **Store the rejects instead of dropping them.** Our own page calls the
 *    silent-rejection failure "the thing to fix today". A filled decoy raises a
 *    score and marks a row. It never deletes a lead, and it never returns an
 *    error the caller could learn from.
 *
 * ## Two decoys, deliberately weighted differently
 *
 * The published page names the tension exactly: the field names bots find
 * attractive — `url`, `company_website`, `email2` — are the same names password
 * managers and browser autofill reach for. So there are two.
 *
 * - `_ef_hp` is in our reserved `_ef_` namespace. Nothing autofills it, because
 *   no autofill heuristic has ever heard of it. A value here is strong evidence.
 * - `company_website` is the attractive one, and it is exactly the name the page
 *   warns about. It is worth half as much, because some of its hits will be a
 *   real customer whose password manager was being helpful.
 *
 * Neither is a secret. This repository is AGPL and public; an attacker who
 * reads it can skip both in an afternoon. That is not a flaw being papered
 * over, it is what `/spam/honeypot-fields` already says out loud: a honeypot
 * catches indiscriminate automation and nothing aimed at you specifically.
 */

import type { SpamReason } from "./types.ts";

/**
 * The decoy nothing legitimate fills. In the same reserved namespace as
 * `_ef_token`, so it is stripped from `values` and kept in `raw_body`.
 */
export const HONEYPOT_FIELD = "_ef_hp";

/** The attractive decoy, and the one with the real false-positive rate. */
export const HONEYPOT_BAIT_FIELD = "company_website";

export const HONEYPOT_WEIGHT = 6;
export const HONEYPOT_BAIT_WEIGHT = 3;

/**
 * Every name that must be stripped from `values` before they reach the inbox.
 *
 * A customer's own `company_website` field would collide with the bait decoy,
 * which is why `endpointHoneypotFields` takes the endpoint's real field names
 * and drops any decoy that clashes. A form that genuinely collects a company
 * website keeps its data and loses one decoy.
 */
export const HONEYPOT_FIELD_KEYS = [HONEYPOT_FIELD, HONEYPOT_BAIT_FIELD] as const;

/**
 * Markup attributes for the decoy input.
 *
 * `sr-only` is *not* used here, and that is the whole point of this constant.
 * A screen reader announcing "leave this field empty" is an accessibility
 * improvement; a screen reader announcing an unlabelled text input that the
 * user then helpfully completes is a lost lead. The element is laid out and
 * painted, one pixel, behind everything, outside the tab order, and carries a
 * label its user is told to skip.
 */
export const HONEYPOT_STYLE = {
  position: "absolute",
  left: "-9999px",
  top: "auto",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  opacity: 0,
  pointerEvents: "none",
} as const;

/** The same declaration for a renderer that builds markup as a string. */
export const HONEYPOT_STYLE_CSS =
  "position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";

export const HONEYPOT_LABEL = "Leave this field empty";

/**
 * Every attribute the decoy input needs, as data.
 *
 * Returned as a plain object rather than as markup so the hosted renderer can
 * spread it into JSX and a string-building renderer can serialise it, without
 * either of them having to remember the four attributes that make the trap work
 * and keep it off a screen reader.
 */
export function honeypotInputProps(name: string) {
  return {
    type: "text" as const,
    name,
    id: `hp-${name}`,
    tabIndex: -1,
    autoComplete: "off" as const,
    // Announced to assistive technology as an instruction, not hidden from it.
    // A screen-reader user who lands here is told to move on; hiding the field
    // from them entirely is what produces the silent rejection of a real
    // customer that `/spam/honeypot-fields` calls "the thing to fix today".
    "aria-label": HONEYPOT_LABEL,
    style: HONEYPOT_STYLE,
  };
}

/**
 * The decoys this endpoint should render, minus any that collide with a field
 * the customer actually collects.
 */
export function endpointHoneypotFields(
  realFieldNames: readonly string[],
  extra: string | null = null,
): string[] {
  const taken = new Set(realFieldNames.map((name) => name.toLowerCase()));
  const candidates = [HONEYPOT_FIELD, HONEYPOT_BAIT_FIELD, ...(extra ? [extra] : [])];

  const out: string[] = [];
  for (const candidate of candidates) {
    const key = candidate.trim().toLowerCase();
    if (key === "" || taken.has(key) || out.includes(candidate)) continue;
    out.push(candidate);
  }
  return out;
}

export type HoneypotInput = {
  /** The submitted values, **before** reserved keys are stripped. */
  values: Record<string, unknown>;
  /** An endpoint's own extra decoy name, if it configured one. */
  extraField?: string | null;
  /** Field names the endpoint genuinely collects, so a collision is not a trap. */
  realFieldNames?: readonly string[];
};

/**
 * Looks for a populated decoy.
 *
 * Returns a reason in every case, including the quiet one. `/spam/honeypot-fields`
 * makes a specific point of this: "A honeypot that catches nothing is telling
 * you something specific: whatever is hitting your form is looking at your
 * form." A signal that only records itself when it fires cannot tell anyone
 * that.
 */
export function checkHoneypot(input: HoneypotInput): SpamReason {
  const fields = endpointHoneypotFields(input.realFieldNames ?? [], input.extraField ?? null);
  const filled: { field: string; value: string }[] = [];

  for (const field of fields) {
    const value = scalar(input.values[field]);
    if (value !== null && value.trim() !== "") filled.push({ field, value: value.trim() });
  }

  if (filled.length === 0) {
    return {
      code: "honeypot",
      rule: "honeypot.empty",
      observed:
        fields.length === 0
          ? "no decoy rendered"
          : `${fields.length} decoy${fields.length === 1 ? "" : "s"}, all empty`,
      weight: 0,
      note:
        fields.length === 0
          ? "No decoy field was in play for this endpoint, so this signal had nothing to say."
          : "The decoy fields were left empty, which is what a person does — and also what a filler that reads your page does. A quiet decoy is not proof of anything.",
      fields: fields.length > 0 ? fields : undefined,
    };
  }

  // The strong decoy wins the weight when both were filled, which is the usual
  // case for a filler that fills everything.
  const strong = filled.some((hit) => hit.field === HONEYPOT_FIELD);
  const weight = strong ? HONEYPOT_WEIGHT : HONEYPOT_BAIT_WEIGHT;

  return {
    code: "honeypot",
    rule: strong ? "honeypot.reserved_decoy" : "honeypot.bait_decoy",
    observed: filled.map((hit) => `${hit.field}=${truncate(hit.value, 40)}`).join(", "),
    weight,
    note: strong
      ? `A decoy field named ${HONEYPOT_FIELD} was filled in. It is positioned off-screen, excluded from the tab order, and labelled "${HONEYPOT_LABEL}" — no browser autofill has a heuristic for that name, so something filled the page's inputs without looking at the page.`
      : `The decoy field named ${filled[0]?.field} was filled in. That name is attractive to form fillers and also to password managers, so this counts for less than the reserved decoy — if this was your customer, their password manager was being helpful.`,
    fields: filled.map((hit) => hit.field),
  };
}

function scalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string" && entry.trim() !== "");
    return typeof first === "string" ? first : null;
  }
  return null;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
