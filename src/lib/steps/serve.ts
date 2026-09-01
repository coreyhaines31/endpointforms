import type { JsonValue } from "../ingest/body.ts";
import { resolveEndpoint } from "../ingest/store.ts";
import type { FormSchemaDocument } from "../schema/format.ts";
import type { ValidationIssue } from "../schema/validate.ts";
import { PARTIAL_KEY_PATTERN } from "./format.ts";
import { planSteps, stepErrors, type StepPlan } from "./plan.ts";
import { readPartial } from "./store.ts";

/**
 * What the hosted page needs to know to draw one screen of a stepped form (#37).
 *
 * One function, so that the page's diff for this feature is a call and a prop.
 * Everything awkward — the missing partial, the stale step id, the form that
 * turned out to have no steps after all — is resolved here and comes back as
 * either a `StepContext` or `null`, and **null means render the form exactly as
 * it was rendered before #37**: every field, one screen, one submit button.
 *
 * That null is the whole safety story. There is no state in which a visitor is
 * shown a wizard we cannot drive.
 */

/** The query keys the step flow reads off the page's URL. */
export const PARTIAL_QUERY_PARAM = "p";
export const STEP_QUERY_PARAM = "step";
export const STEP_ERROR_PARAM = "e";

export type StepContext = {
  plan: StepPlan;
  /** Every answer so far, including the ones not on this screen. */
  values: Record<string, string | string[]>;
  /** Carried into each screen's markup so the next POST names the same visit. */
  partialKey: string | null;
  /**
   * Errors for the fields on this screen — populated only when the visitor has
   * actually tried to leave it. Re-derived here rather than carried across the
   * redirect: it is the same `validateSubmission` over the same stored answers,
   * so there is nothing to encode, nothing to truncate, and no cookie to be
   * blocked inside somebody's iframe.
   */
  errors: ValidationIssue[];
};

/**
 * Reads the step a visitor is on out of the URL and the partial it names.
 *
 * Returns null — meaning "draw the ordinary one-screen form" — when the
 * document has no steps, when every step turned out to be empty under this
 * visitor's answers, or when the partial named by the URL cannot be read. That
 * last case covers a key that expired, a key for a visit that already finished,
 * a key someone typed, and a database we could not reach; `readPartial` refuses
 * to tell them apart precisely so that no caller can be tempted to show an
 * error page for one of them.
 */
export async function resolveStepContext(
  formId: string,
  document: FormSchemaDocument,
  query: Record<string, string | string[] | undefined>,
  /** What the page would otherwise have rendered — a prefill, or a retry. */
  fallbackValues: Record<string, string | string[]> = {},
): Promise<StepContext | null> {
  if ((document.steps?.length ?? 0) === 0) return null;

  const partialKey = first(query[PARTIAL_QUERY_PARAM]);
  const requestedStep = first(query[STEP_QUERY_PARAM]);
  const showErrors = first(query[STEP_ERROR_PARAM]) === "1";

  let values = fallbackValues;
  let key: string | null = null;

  if (partialKey !== null && PARTIAL_KEY_PATTERN.test(partialKey)) {
    try {
      const endpoint = await resolveEndpoint(formId);
      const stored = await readPartial(endpoint.workspaceId, endpoint.id, partialKey);
      if (stored) {
        key = stored.partialKey;
        // The stored answers win over a prefill. A query parameter is an
        // instruction from before the visitor touched the form; what they
        // typed is the truth about it. Same rule `page.tsx` already applies
        // when a retry cookie is in force, for the same reason.
        values = { ...fallbackValues, ...displayable(stored.values) };
      }
    } catch (error) {
      // A partial we could not resolve is a one-screen form, not an error page.
      console.error(`[steps] step context unavailable for ${JSON.stringify(formId)}`, error);
    }
  }

  const plan = planSteps(
    document,
    asJson(values),
    // The URL names the screen. A key with no readable partial has no
    // authority to name one, so it falls back to the first — a visitor who
    // arrives with a dead link starts the form rather than landing in the
    // middle of one with nothing filled in. An id `planSteps` does not
    // recognise clamps to the first screen too, which is the safe direction:
    // a question asked again beats a question skipped.
    key === null ? null : requestedStep,
  );
  if (!plan) return null;

  return {
    plan,
    values,
    partialKey: key,
    errors: showErrors ? stepErrors(document, asJson(values), plan.current) : [],
  };
}

/** JSON values as the renderer wants them: strings and lists of strings. */
export function displayable(
  values: Record<string, JsonValue>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      out[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = String(value);
      continue;
    }
    if (Array.isArray(value)) {
      const strings = value
        .filter((entry) => entry !== null && typeof entry !== "object")
        .map((entry) => String(entry));
      if (strings.length > 0) out[key] = strings;
    }
    // A structured value is stored and is not renderable as a control. It stays
    // in the partial; it simply has nothing to draw.
  }
  return out;
}

/** The same, back the other way, so the plan and the validator see one shape. */
export function asJson(
  values: Record<string, string | string[]>,
): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(values)) out[key] = value;
  return out;
}

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? null : trimmed;
}
