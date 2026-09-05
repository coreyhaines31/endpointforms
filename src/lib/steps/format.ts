import { z } from "zod";

import { MAX_FIELD_NAME_CHARS } from "../ingest/limits.ts";
import type { FormSchemaDocument } from "../schema/format.ts";

/**
 * Steps, and partial capture (#37).
 *
 * ## Partial capture is the feature. Multi-step is the thing that makes it
 * possible.
 *
 * Every form builder in the category can show a form four screens at a time.
 * What almost none of them will tell you is what happened to the person who
 * filled in three of those screens and left — because they threw it away. This
 * module exists so that person is a row somebody can look at.
 *
 * That obligation runs both ways, and the second half is the part that keeps
 * this from being creepy: a partial is **stored, shown, and labelled**, never
 * quietly folded in among the submissions. It is not a submission. Nobody
 * pressed submit.
 *
 * ## The shape, and why it is two keys
 *
 * `steps` is an optional top-level array on `FormSchemaDocument`, exactly like
 * `rules` (#36) and for the same reasons: it is part of the definition the
 * three surfaces are projections of, it travels with the version, and a
 * document written before it existed has no `steps` key and reads byte for byte
 * as it always did.
 *
 * `partials` is a second, separate optional key rather than a property on the
 * array, because it is not a property of any one step — it is a statement about
 * what the form does with an unfinished visit, and it has to be answerable
 * without reading the step list.
 *
 * ## Steps are a *rendering* concern and can never become a validation rule
 *
 * A raw POST to `/e/{id}` has no steps. An agent calling the Manifest tool
 * (#32) has no steps. Only the hosted page does. So nothing in this file is
 * ever consulted by `validateSubmission`, by `manifest/tool.ts`, or by the
 * ingest path — a submission that arrives with every field at once is complete,
 * whatever the step list says, and a schema that could refuse it would have
 * broken two of our three surfaces to decorate the third.
 *
 * What the steps *do* decide is which subset of the errors the hosted page
 * shows a visitor at a time. That is `stepErrors` in `./plan.ts`, it filters
 * the output of the one validator rather than running a second one, and it can
 * only ever show fewer errors than the full check — never different ones.
 */

/** Steps beyond this are a wizard nobody finishes. */
export const MAX_STEPS = 50;

const MAX_STEP_TITLE_CHARS = 200;
const MAX_STEP_DESCRIPTION_CHARS = 1_000;
const MAX_STEP_ID_CHARS = 64;

/** The longest a customer's own disclosure sentence may be. */
export const MAX_NOTICE_CHARS = 300;

/**
 * What a visitor is told, when the form has not been given words of its own.
 *
 * Present on the page, in the flow, next to the button that causes it — not in
 * a policy link and not in a tooltip. `docs/05` §4 is about not surprising a
 * customer's end users, and capturing what somebody typed and then abandoned is
 * the textbook case: it is only creepy when it is hidden.
 *
 * The sentence says the three things a person would want to know — that answers
 * are saved, when, and that leaving does not undo it — in the order they would
 * ask them.
 */
export const DEFAULT_PARTIAL_NOTICE =
  "Your answers are saved each time you continue, so you can come back to this page \u2014 and so this form's owner can see them even if you don't finish.";

/**
 * A step id, and why steps are named rather than numbered.
 *
 * A partial records the step a visitor reached. If that record were an index,
 * inserting a screen at the front would silently rewrite history — every stored
 * partial would claim the visitor got one step further than they did. The id is
 * the same kind of promise `submissions.schema_version_id` makes: what was
 * written down stays true after the form moves on.
 */
const stepId = z
  .string()
  .min(1, "A step needs an id.")
  .max(MAX_STEP_ID_CHARS)
  .regex(/^[A-Za-z0-9_-]+$/, "A step id may only contain letters, digits, hyphens and underscores.");

const stepSchema = z.strictObject({
  id: stepId,
  /** The heading above this screen. Optional; the form's own title carries it otherwise. */
  title: z.string().max(MAX_STEP_TITLE_CHARS).optional(),
  /** A sentence under the heading. */
  description: z.string().max(MAX_STEP_DESCRIPTION_CHARS).optional(),
  /**
   * Field keys, in the order they are asked.
   *
   * Keys rather than embedded field definitions, so there is exactly one place
   * a field is defined and a step cannot disagree with it. A field named by no
   * step is not an error — see `planSteps`, which puts it on the last screen
   * rather than dropping it.
   */
  fields: z.array(z.string().max(MAX_FIELD_NAME_CHARS)).max(500).default([]),
});

export type FormStep = z.infer<typeof stepSchema>;

export const stepsSchema = z.array(stepSchema).max(MAX_STEPS);

/**
 * What the visitor is told, and nothing else.
 *
 * ## There is no switch for turning partial capture off, and that is the design
 *
 * A stepped form has to hold the answers from screen one while the visitor is
 * on screen two. There is nowhere for them to be except with us. So the choice
 * was never "capture or not" — it was "capture and say so" or "capture and call
 * it a session", and the second is the behaviour this product spends its entire
 * positioning arguing against.
 *
 * So the rule is stated plainly instead: **steps mean partial capture.** Turn a
 * form into four screens and the answers on screens one to three are kept and
 * shown to its owner, whether or not anybody reaches screen four, and the
 * visitor is told so on every screen. A customer who does not want that has an
 * exact alternative one click away, and it is what every form here does by
 * default: one screen, which stores nothing at all until somebody submits it.
 *
 * A switch would have been three lines. It would also have meant a form
 * advertising "we don't keep unfinished answers" while holding them in a table
 * to make its own Back button work, with a sweeper we have not written as the
 * only thing standing between that and a lie. `./store.ts` explains where the
 * state has to live and why.
 *
 * What is configurable is the wording, because the sentence is addressed to
 * somebody else's customers in somebody else's voice.
 */
export const partialSettingsSchema = z.strictObject({
  /**
   * The customer's own wording. Blank falls back to `DEFAULT_PARTIAL_NOTICE`
   * rather than to nothing — the notice can be reworded and cannot be removed.
   */
  notice: z.string().max(MAX_NOTICE_CHARS).optional(),
});

export type PartialSettings = z.infer<typeof partialSettingsSchema>;

/**
 * Reserved field names the step flow posts, which never reach `values`.
 *
 * `_ef_partial` is the opaque key naming the partial row this visit is writing
 * to. The other two are navigation: which screen was just submitted, and which
 * way to go. All three are stripped on the ingest path the same way the
 * redirect fields and the honeypots are — see `handler.ts` — so a customer's
 * inbox shows the customer's fields and not our plumbing.
 *
 * ## Why the `_ef_` namespace and not a bare `_step`
 *
 * There are two families of control field here and they are named differently
 * on purpose. `_redirect` and `_next` are names a **customer types into their
 * own markup**, so they read like English. `_ef_token` and `_ef_hp` are names
 * **our rendered page emits into somebody else's form**, so they sit in a
 * namespace nobody would reach for by accident.
 *
 * These are the second kind: nobody hand-writes `_ef_step`, the hosted page
 * writes it. A bare `_step` would also have been a plausible name for a
 * customer's own question — a form that asks which step of a process you are at
 * would have had that answer silently swallowed by our navigation.
 */
export const PARTIAL_KEY_FIELD = "_ef_partial";
export const STEP_FROM_FIELD = "_ef_step";
export const STEP_TO_FIELD = "_ef_step_to";

export const STEP_FIELD_KEYS = [
  PARTIAL_KEY_FIELD,
  STEP_FROM_FIELD,
  STEP_TO_FIELD,
] as const;

/** A partial key as generated by `newPartialKey`, and nothing else. */
export const PARTIAL_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

// ---------------------------------------------------------------------------
// Reading and writing the document keys
// ---------------------------------------------------------------------------

/**
 * The errors that make a step list meaningless rather than merely unwise.
 *
 * Mirrors `ruleErrorMessages` deliberately: anything a person could plausibly
 * have meant is accepted, and only a document whose *behaviour cannot be
 * stated* is refused. A field nobody collects is such a case — the step would
 * render a control for a field the endpoint does not have — and so is a field
 * on two screens at once, because there is no answer to which screen asks it.
 *
 * A field named by no step is conspicuously absent from this list. It is the
 * single most likely thing for an author to do by accident, and the cost of
 * refusing it would be a form they cannot save; `planSteps` puts it on the last
 * screen, which is where an unclassified question belongs.
 */
export function stepErrorMessages(document: {
  fields: readonly { key: string }[];
  steps?: readonly FormStep[];
}): string[] {
  const steps = document.steps ?? [];
  if (steps.length === 0) return [];

  const messages: string[] = [];
  const known = new Set(document.fields.map((field) => field.key));

  const seenIds = new Set<string>();
  for (const step of steps) {
    if (seenIds.has(step.id)) {
      messages.push(
        `Two steps share the id "${step.id}". A partial records the step it reached by id, so a form can only have one.`,
      );
    }
    seenIds.add(step.id);
  }

  const owner = new Map<string, string>();
  for (const step of steps) {
    for (const key of step.fields) {
      if (!known.has(key)) {
        messages.push(
          `Step "${step.id}" asks for "${key}", which this form does not collect.`,
        );
        continue;
      }
      const already = owner.get(key);
      if (already !== undefined && already !== step.id) {
        messages.push(
          `"${key}" is on step "${already}" and step "${step.id}". A field is asked on one screen.`,
        );
        continue;
      }
      owner.set(key, step.id);
    }
  }

  for (const step of steps) {
    const blank =
      step.fields.length === 0 &&
      (step.title ?? "").trim() === "" &&
      (step.description ?? "").trim() === "";
    if (blank) {
      messages.push(
        `Step "${step.id}" has no fields, no title and no description, so there is nothing to put on the screen.`,
      );
    }
  }

  return messages;
}

/**
 * Steps out of a stored row.
 *
 * All-or-nothing, exactly like `rules` in `readStoredDocument` and for the same
 * reason: a step list with one screen missing is a form asking a different set
 * of questions from the one its owner published. Discarding the lot puts the
 * form back where it was before #37 — one screen, every field, nothing
 * conditionally deferred — which is a form that works.
 */
export function readStoredSteps(record: Record<string, unknown>): FormStep[] | undefined {
  if (record.steps === undefined) return undefined;
  const parsed = stepsSchema.safeParse(record.steps);
  if (!parsed.success) return undefined;
  return parsed.data.length === 0 ? undefined : parsed.data;
}

/**
 * Partial settings out of a stored row.
 *
 * Not all-or-nothing, because there is a safe default and it is the one that
 * protects the visitor: an unreadable `partials` key falls back to capture-on
 * *with the default notice*, so the worst case is a form that discloses in our
 * words rather than the customer's. The opposite default — capture on, notice
 * lost — is the one that must be unreachable.
 */
export function readStoredPartials(record: Record<string, unknown>): PartialSettings | undefined {
  if (record.partials === undefined) return undefined;
  const parsed = partialSettingsSchema.safeParse(record.partials);
  // An unreadable value falls back to *our* wording rather than to no wording.
  // The failure this guards against is a stored row we cannot parse quietly
  // becoming a form that captures without disclosing.
  if (!parsed.success) return {};
  return parsed.data;
}

/** What gets written for `steps`, or nothing at all when there are none. */
export function serializeSteps(steps: readonly FormStep[] | undefined): FormStep[] | undefined {
  if (steps === undefined || steps.length === 0) return undefined;
  return steps.map((step) => ({
    id: step.id,
    ...(step.title === undefined || step.title === "" ? {} : { title: step.title }),
    ...(step.description === undefined || step.description === ""
      ? {}
      : { description: step.description }),
    fields: [...step.fields],
  }));
}

/**
 * What gets written for `partials`, or nothing when it says nothing.
 *
 * Capture-on with no custom wording is the default, so it serialises away
 * entirely and a form nobody has configured produces the same bytes it did
 * before this feature existed.
 */
export function serializePartials(
  settings: PartialSettings | undefined,
): PartialSettings | undefined {
  if (settings === undefined) return undefined;
  const notice = (settings.notice ?? "").trim();
  return notice === "" ? undefined : { notice };
}

// ---------------------------------------------------------------------------
// Questions the rest of the product asks
// ---------------------------------------------------------------------------

/** True when this document renders as more than one screen. */
export function hasSteps(document: Pick<FormSchemaDocument, "steps">): boolean {
  return (document.steps?.length ?? 0) > 0;
}

/**
 * True when an unfinished visit to this form is written down.
 *
 * Exactly `hasSteps`, and a separate function only because the two questions
 * get asked in different places — reading `hasSteps` at a privacy decision
 * would hide which one was meant. A one-screen form has no boundary at which a
 * visit could be half-finished, and stores nothing until submit.
 */
export function capturesPartials(
  document: Pick<FormSchemaDocument, "steps" | "partials">,
): boolean {
  return hasSteps(document);
}

/**
 * The sentence a visitor reads, in the customer's words when they wrote any.
 *
 * Null only when there is nothing to disclose. No path through this function
 * returns null for a form that captures.
 */
export function partialNotice(
  document: Pick<FormSchemaDocument, "steps" | "partials">,
): string | null {
  if (!capturesPartials(document)) return null;
  const custom = (document.partials?.notice ?? "").trim();
  return custom === "" ? DEFAULT_PARTIAL_NOTICE : custom;
}
