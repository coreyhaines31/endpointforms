import type { JsonValue } from "../ingest/body.ts";
import { evaluateRules } from "../rules/evaluate.ts";
import type { FormSchemaDocument } from "../schema/format.ts";
import { validateSubmission, type ValidationIssue } from "../schema/validate.ts";
import { capturesPartials, partialNotice, type FormStep } from "./format.ts";

/**
 * Which screen a visitor is on, and what is on it (#37).
 *
 * Pure. No DOM, no database, no clock — the same document and the same answers
 * give the same plan in the step route, in the page, and in a test. This is the
 * same discipline `src/lib/rules/evaluate.ts` holds itself to, and for the same
 * reason: a form that decides one thing when rendering and another when
 * validating is a form that loses leads in a way nobody can reproduce.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW STEPS AND RULES INTERACT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Rules decide whether a field is being asked. Steps decide which screen asks
 * it. Rules win, and the ordering is not arbitrary:
 *
 *   - **A step with no visible fields is skipped, not shown empty.** If every
 *     field on screen three is hidden by the answers given on screen two, then
 *     screen three is not a question and a visitor should never see a heading
 *     with nothing under it.
 *   - **A step declared with no fields at all is never skipped.** That is an
 *     author writing an intro or a closing screen on purpose, and it stays.
 *   - **"Next" is computed from the answers as they now stand**, after the step
 *     that was just submitted. So answering "no" on screen two can remove
 *     screen three between pressing Next and arriving, which is the behaviour
 *     anybody would expect and the reason navigation is recomputed rather than
 *     precomputed.
 *   - **A field no step names goes on the last screen that asks anything.** Not
 *     dropped. Forgetting to assign a field is the single likeliest authoring
 *     mistake here, and the failure mode of dropping it is a question that
 *     silently stops being asked.
 *   - **Hidden fields are never on a screen.** A `hidden` field is not a
 *     question; it is a value the page already knows. It is carried from the
 *     first screen onward so that a visitor who abandons on screen one still
 *     leaves a partial with their tracking parameters attached.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW A VISITOR GETS FROM ONE SCREEN TO THE NEXT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Post, redirect, get. Each screen is a real `<form method="post">` that posts
 * to `/f/{id}/step`; that route writes the partial and answers with a 303 to
 * `/f/{id}?p={key}&step={id}`; the page reads the partial back and renders the
 * next screen. **No JavaScript is involved at any point in that sentence.**
 * There is no client-side step switcher, and adding one would mean two answers
 * to "which screen am I on" — the same argument `src/lib/rules` makes for
 * having one evaluator, and the same failure if it is ignored.
 *
 * The redirect is what makes refresh and the browser's own Back button behave.
 * A form that renders the next screen straight out of the POST would meet
 * "confirm form resubmission" on both.
 *
 * The cost of the redirect is that the answers cannot travel in the request:
 * a 303 turns a POST into a GET and the body is gone. So the partial row is
 * where they live in between, which is the decision the rest of this feature
 * is downstream of:
 *
 *   - It is why **there is no switch to turn partial capture off** (see
 *     `./format.ts`). The state has to be somewhere. A form that held it and
 *     said it did not would be lying.
 *   - It is why the page **falls back to rendering every field on one screen**
 *     when the partial cannot be read. Our bookkeeping failing must never be
 *     the reason somebody cannot submit a form; the safe degradation is the
 *     form this always was before #37.
 *   - It is why the key in the URL is server-generated and 144 bits wide.
 *     Whoever holds it can read back the answers it names — which are the
 *     visitor's own, which is why the notice tells them the link comes back to
 *     their answers rather than pretending it is a session cookie.
 *
 * Answers given on other screens are *also* re-posted as hidden inputs on each
 * screen (`carryKeys`). That is not the state store — the redirect would lose
 * them — but it does two things worth having. It heals a partial whose earlier
 * write failed, and it makes the last screen's POST an ordinary complete
 * submission: every answer at once, straight to `/f/{id}/submit`, so
 * `handleSubmission` merges nothing, knows nothing about steps, and writes
 * exactly the row a one-screen form would have written. There is still only one
 * way a submission is stored.
 */

export type PlannedStep = {
  id: string;
  title: string | null;
  description: string | null;
  /**
   * The step's position in the document, kept even for steps that are skipped.
   * Navigation is computed from this rather than from the live position, so a
   * step disappearing under the visitor cannot send them backwards.
   */
  declaredIndex: number;
  /** Field keys on this screen, in document order. Never a `hidden` field. */
  fieldKeys: string[];
  /** 1-based position among the steps a visitor will actually see. */
  number: number;
};

export type StepPlan = {
  /** Only the steps this visitor will see, given their answers so far. */
  steps: PlannedStep[];
  current: PlannedStep;
  index: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  /**
   * Field keys to re-post as hidden inputs on this screen: every `hidden` field,
   * plus every answered field that belongs to another screen.
   */
  carryKeys: string[];
  /** True when leaving this form halfway is written down. */
  capture: boolean;
  /** What the visitor is told about that, or null when nothing is captured. */
  notice: string | null;
};

/**
 * The plan for a visitor at `atStepId`, or null when this form is one screen.
 *
 * Null is the load-bearing return value: **a document with no steps, or whose
 * steps all turned out to be empty, plans to nothing and the caller renders
 * exactly the form it rendered before #37.** Every degradation in this file
 * lands there rather than on a half-configured wizard.
 */
export function planSteps(
  document: FormSchemaDocument,
  values: Record<string, JsonValue>,
  atStepId?: string | null,
): StepPlan | null {
  const declared = document.steps ?? [];
  if (declared.length === 0) return null;

  const visible = visibility(document, values);
  const assignment = assignFields(document, declared);

  const built: PlannedStep[] = declared.map((step, declaredIndex) => ({
    id: step.id,
    title: emptyToNull(step.title),
    description: emptyToNull(step.description),
    declaredIndex,
    fieldKeys: (assignment.get(step.id) ?? []).filter((key) => visible(key)),
    number: 0,
  }));

  const live = built.filter(
    (step, index) =>
      // An intro screen — declared with no fields — is always kept. A screen
      // that asks for something is kept only while it still asks for something.
      declared[index]!.fields.length === 0 || step.fieldKeys.length > 0,
  );

  // Every screen emptied itself. Rather than show a wizard with no questions on
  // it, fall back to the one-screen form, which is guaranteed to render every
  // field the visitor is being asked for.
  if (live.length === 0) return null;

  const steps = live.map((step, index) => ({ ...step, number: index + 1 }));
  const requested = atStepId ? steps.findIndex((step) => step.id === atStepId) : -1;
  const index = requested === -1 ? 0 : requested;
  const current = steps[index]!;

  return {
    steps,
    current,
    index,
    total: steps.length,
    isFirst: index === 0,
    isLast: index === steps.length - 1,
    carryKeys: carryKeys(document, current, values),
    capture: capturesPartials(document),
    notice: partialNotice(document),
  };
}

/**
 * Where the visitor goes when they press Next or Back.
 *
 * Returns a step id, or `null` for "there is no next screen" — which on a Next
 * is the signal to submit. Computed from `declaredIndex` rather than from the
 * live list, so a screen that disappeared because of what was just answered
 * cannot be mistaken for the screen before it.
 *
 * A Back from the first screen returns the first screen. There is nowhere
 * further back and a visitor should not be able to navigate out of the form by
 * pressing it.
 */
export function advance(
  document: FormSchemaDocument,
  values: Record<string, JsonValue>,
  fromStepId: string | null,
  direction: "next" | "back",
): string | null {
  const plan = planSteps(document, values, null);
  if (!plan) return null;

  const declaredIndex = declaredPositionOf(document, fromStepId);

  if (direction === "back") {
    const earlier = plan.steps.filter((step) => step.declaredIndex < declaredIndex);
    return (earlier[earlier.length - 1] ?? plan.steps[0]!).id;
  }

  const later = plan.steps.find((step) => step.declaredIndex > declaredIndex);
  return later?.id ?? null;
}

/**
 * The errors a visitor is shown on one screen.
 *
 * **This is a filter over the one validator, never a second validator.** The
 * full `validateSubmission` runs over the whole document and the whole payload,
 * exactly as it does on the ingest path, and then everything that is not about
 * a field on this screen is set aside — not resolved, not suppressed, set aside
 * until the screen that asks for it.
 *
 * That is what makes the hard requirement hold: a form whose screen four has a
 * required field cannot refuse a visitor standing on screen one, because that
 * error names a field `fieldKeys` does not contain. And a partial written from
 * screen one is written without ever being asked whether the whole form was
 * valid, because it never was and never will be.
 *
 * Warnings are dropped entirely. A warning describes drift for whoever owns the
 * form; it is never a reason to stop a visitor.
 */
export function stepErrors(
  document: FormSchemaDocument,
  values: Record<string, JsonValue>,
  step: PlannedStep,
): ValidationIssue[] {
  const onScreen = new Set(step.fieldKeys);
  return validateSubmission(document, values).errors.filter(
    (issue) => issue.field !== null && onScreen.has(issue.field),
  );
}

// ---------------------------------------------------------------------------

/**
 * Which fields each step asks for, after the unassigned ones are placed.
 *
 * `hidden` fields are excluded here rather than filtered later: they are not
 * questions, they never appear on a screen, and letting one into a step's field
 * list would make an otherwise-empty screen look occupied.
 */
function assignFields(
  document: FormSchemaDocument,
  declared: readonly FormStep[],
): Map<string, string[]> {
  const askable = document.fields.filter((field) => field.type !== "hidden");
  const known = new Set(askable.map((field) => field.key));

  const owner = new Map<string, string>();
  for (const step of declared) {
    for (const key of step.fields) {
      if (!known.has(key)) continue;
      if (owner.has(key)) continue;
      owner.set(key, step.id);
    }
  }

  // The last screen that asks for anything, rather than simply the last screen:
  // an author who wrote a closing screen with no fields on it did that
  // deliberately, and dropping a stray question onto it would undo the choice.
  const fallback =
    [...declared].reverse().find((step) => step.fields.length > 0) ??
    declared[declared.length - 1]!;

  const assignment = new Map<string, string[]>();
  for (const step of declared) assignment.set(step.id, []);

  for (const field of askable) {
    const stepId = owner.get(field.key) ?? fallback.id;
    assignment.get(stepId)!.push(field.key);
  }

  // Within a screen, the order the author wrote. Anything that landed there by
  // fallback follows, in document order.
  for (const step of declared) {
    const listed = step.fields.filter((key) => owner.get(key) === step.id);
    const rest = assignment.get(step.id)!.filter((key) => !listed.includes(key));
    assignment.set(step.id, [...listed, ...rest]);
  }

  return assignment;
}

/**
 * Which fields to re-post as hidden inputs on this screen.
 *
 * Every `hidden` field, always — including on screen one, so a visitor who
 * abandons immediately still leaves a partial carrying whatever the page knew
 * about them before they typed anything.
 *
 * Plus every field that has an answer and is not on this screen. That includes
 * fields on *later* screens, which a visitor reaches by going forward, back and
 * forward again — dropping those would mean the Back button quietly erased work.
 *
 * It also includes fields a rule has since hidden. Nothing in this product
 * deletes an answer because a question stopped being asked; `validate.ts` warns
 * about it and stores it, and it would be strange for the Back button to be the
 * one place that behaves differently.
 */
function carryKeys(
  document: FormSchemaDocument,
  current: PlannedStep,
  values: Record<string, JsonValue>,
): string[] {
  const onScreen = new Set(current.fieldKeys);
  const keys: string[] = [];

  for (const field of document.fields) {
    if (onScreen.has(field.key)) continue;
    if (field.type === "hidden") {
      keys.push(field.key);
      continue;
    }
    if (hasAnswer(values[field.key])) keys.push(field.key);
  }

  return keys;
}

function hasAnswer(value: JsonValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.some(hasAnswer);
  return true;
}

/**
 * A predicate for "is this field being asked", from the one evaluator.
 *
 * A document with no rules skips the evaluation entirely and every field is
 * visible, so a stepped form without conditional logic costs nothing extra. A
 * ruleset that could not be evaluated comes back from `evaluateRules` already
 * degraded to every-field-visible, which is the safe direction: the visitor
 * sees every question rather than silently not being asked one.
 */
function visibility(
  document: FormSchemaDocument,
  values: Record<string, JsonValue>,
): (key: string) => boolean {
  if ((document.rules?.length ?? 0) === 0) return () => true;
  const evaluation = evaluateRules(document, values);
  return (key) => evaluation.fields[key]?.visible ?? true;
}

/** Where a step sits in the document, or -1 for a step id we do not recognise. */
function declaredPositionOf(document: FormSchemaDocument, stepId: string | null): number {
  if (stepId === null) return -1;
  const index = (document.steps ?? []).findIndex((step) => step.id === stepId);
  return index;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}
