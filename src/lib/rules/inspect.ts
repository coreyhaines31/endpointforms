import type { JsonValue } from "../ingest/body.ts";
import type { FormSchemaDocument } from "../schema/format.ts";
import { describeCondition, describeRule, joinList } from "./describe.ts";
import { evaluateRules, readAnswer, type ConditionTrace } from "./evaluate.ts";

/**
 * The rules inspector (#36).
 *
 * ## Why this is the feature and the engine is the plumbing
 *
 * Everyone in this category ships conditional logic. What nobody ships is a way
 * to see *why* a field is hidden — so the way a form's logic gets debugged today
 * is somebody filling in their own form over and over in a private window,
 * guessing. #36 says the debugger is the differentiator, and it is: it is the
 * same commitment to interrogability that makes every submission carry the
 * schema version it arrived under and every rejection name the field.
 *
 * ## What it shows, and why each part is there
 *
 * - **Every rule, in the order it ran** — which is dependency order, not
 *   document order, and the two differing is itself something an author needs
 *   to be told rather than left to discover.
 * - **Every condition, with the value it actually read.** "`budget` is
 *   `"50k+"` — no answer" explains a rule that did not fire in one line, and
 *   that single line is the support email that never gets sent.
 * - **Every effect, and whether it applied.** A rule can match and still do
 *   nothing, because a later rule overrode it or because the field it wanted to
 *   require was not being asked. A trace that only showed "matched" would be
 *   the half of the story that misleads.
 * - **Every field's final state, with the reason attached to it.** Read from
 *   the other end: "why is this hidden" answered without reading the ruleset.
 * - **Every answer on a field the rules hid.** Never dropped, always named.
 *
 * This module adds no logic of its own. It calls `evaluateRules` — the same
 * function the browser and the ingest path call — and turns its trace into
 * lines. If it disagreed with the running form it would be worse than useless,
 * so it is not allowed to know anything the form does not.
 */

export type InspectedConditionLine = {
  /** Nesting depth, for indentation. Zero is the top of the rule. */
  depth: number;
  /** `all of`, `any of`, or the condition itself in English. */
  text: string;
  matched: boolean;
  /** What the field held, as the comparison read it. Empty when unanswered. */
  read: string[];
  note: string | null;
  kind: "group" | "condition";
};

export type InspectedEffect = {
  text: string;
  applied: boolean;
  note: string | null;
};

export type InspectedRule = {
  /** Index in `document.rules`. The rule's identity. */
  index: number;
  /** Where it ran, 1-based. Differs from `index + 1` when order is not document order. */
  position: number;
  label: string | null;
  summary: string;
  status: "matched" | "not_matched" | "skipped";
  skippedReason: string | null;
  conditions: InspectedConditionLine[];
  effects: InspectedEffect[];
};

export type InspectedField = {
  key: string;
  label: string;
  visible: boolean;
  required: boolean;
  visibilityNote: string;
  requirementNote: string;
  /** The answer as the evaluator read it. A hidden field still shows what it holds. */
  answer: string[];
  answeredWhileHidden: boolean;
};

export type Inspection = {
  rules: InspectedRule[];
  fields: InspectedField[];
  /** True when dependency order put the rules in a different order than written. */
  reordered: boolean;
  /** Set when the ruleset could not be used at all. */
  degraded: string | null;
  /** One sentence, for the top of the panel. */
  summary: string;
  answeredWhileHidden: string[];
};

export function inspectRules(
  document: FormSchemaDocument,
  values: Record<string, JsonValue>,
): Inspection {
  const rules = document.rules ?? [];
  const evaluation = evaluateRules(document, values);

  const inspected: InspectedRule[] = evaluation.trace.map((entry, position) => {
    const rule = rules[entry.index];
    return {
      index: entry.index,
      position: position + 1,
      label: entry.label,
      summary: rule ? describeRule(rule) : "",
      status: entry.status,
      skippedReason: entry.skippedReason,
      conditions: entry.conditions ? flatten(entry.conditions, 0) : [],
      effects: (entry.effects ?? []).map((effect) => ({
        text: `${verb(effect.action.action)} "${effect.action.field}"`,
        applied: effect.applied,
        note: effect.note,
      })),
    };
  });

  const fields: InspectedField[] = document.fields.map((field) => {
    const outcome = evaluation.fields[field.key];
    return {
      key: field.key,
      label: field.label,
      visible: outcome?.visible ?? true,
      required: outcome?.required ?? field.required,
      visibilityNote: outcome?.visibility.note ?? "Shown by default; no rule hides it.",
      requirementNote:
        outcome?.requirement.note ?? (field.required ? "Required by the field itself." : "Optional."),
      // Read directly rather than through the evaluator, which reports a hidden
      // field as unanswered on purpose. Here the point is the opposite: to show
      // that the answer is still there.
      answer: readAnswer(values, field.key),
      answeredWhileHidden: outcome?.answeredWhileHidden ?? false,
    };
  });

  const reordered = evaluation.order.some((index, position) => index !== position);
  const matched = inspected.filter((rule) => rule.status === "matched").length;
  const skipped = inspected.filter((rule) => rule.status === "skipped").length;

  const parts: string[] = [];
  parts.push(
    rules.length === 0
      ? "This form has no rules."
      : `${matched} of ${rules.length} rule${rules.length === 1 ? "" : "s"} fired`,
  );
  if (skipped > 0) parts.push(`${skipped} skipped`);
  const hiddenCount = fields.filter((field) => !field.visible).length;
  if (rules.length > 0) parts.push(`${hiddenCount} field${hiddenCount === 1 ? "" : "s"} hidden`);

  return {
    rules: inspected,
    fields,
    reordered,
    degraded: evaluation.degraded,
    summary: rules.length === 0 ? parts[0] : `${joinList(parts)}.`,
    answeredWhileHidden: evaluation.answeredWhileHidden,
  };
}

function verb(action: "show" | "hide" | "require"): string {
  return action === "show" ? "Show" : action === "hide" ? "Hide" : "Require";
}

/** The condition tree as indented lines, parents before children. */
function flatten(trace: ConditionTrace, depth: number): InspectedConditionLine[] {
  if (trace.kind === "condition") {
    return [
      {
        depth,
        text: describeCondition(trace.condition),
        matched: trace.matched,
        read: trace.read,
        note: trace.note,
        kind: "condition",
      },
    ];
  }

  const head: InspectedConditionLine = {
    depth,
    text: trace.join === "all" ? "all of" : "any of",
    matched: trace.matched,
    read: [],
    note: null,
    kind: "group",
  };

  return [head, ...trace.children.flatMap((child) => flatten(child, depth + 1))];
}
