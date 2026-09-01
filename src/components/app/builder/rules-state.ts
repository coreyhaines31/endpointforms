import {
  groupChildren,
  groupKind,
  isGroup,
  isNumericOperator,
  isValuelessOperator,
  type Condition,
  type ConditionNode,
  type ConditionOperator,
  type Rule,
  type RuleActionKind,
} from "../../../lib/rules/algebra.ts";
import { analyzeRules } from "../../../lib/rules/analyze.ts";
import { describeRule } from "../../../lib/rules/describe.ts";
import { rulesSchema } from "../../../lib/rules/format.ts";
import type { SchemaField } from "../../../lib/schema/format.ts";
import type { FormSchemaDocument } from "../../../lib/schema/format.ts";
import type { BuilderIssue } from "./state.ts";

/**
 * The builder's rule-editing state (#36).
 *
 * ## Why this is not React either
 *
 * Same reason `state.ts` has no React in it: the interesting part of editing a
 * rule is a pure function from what somebody typed to a ruleset the rest of the
 * system already understands, and that function is worth testing without a
 * browser. `tests/rules-builder.test.mts` loads this module directly under
 * `node --experimental-strip-types`, which is why the imports carry extensions.
 *
 * ## The builder never decides what a valid rule is
 *
 * Every complaint this screen shows comes from `analyzeRules` — the same
 * function `parseSchemaDocument` runs, so the editor and the format can never
 * disagree about whether something is publishable. There is nothing here that
 * knows a rule is broken; there is only a translation of what the analyser
 * said into the row it belongs to.
 *
 * ## One level of grouping, and what happens to the rest
 *
 * The format nests condition groups arbitrarily. This editor draws **one**
 * level: all-of or any-of, over a flat list of conditions, which is what a form
 * with a two-page qualification flow actually needs. A rule loaded from a
 * document that nests deeper is held in `raw` and shown read-only rather than
 * flattened — flattening it would silently change what it means, and a builder
 * that quietly rewrites logic somebody wrote by hand is worse than one that
 * declines to draw it. It round-trips byte for byte.
 */

export type DraftCondition = {
  /** Client-side only, for React keys. Never leaves this module. */
  id: string;
  field: string;
  op: ConditionOperator;
  /** Held as text for the same reason constraints are in `state.ts`. */
  value: string;
};

export type DraftAction = {
  id: string;
  action: RuleActionKind;
  field: string;
};

export type DraftRule = {
  id: string;
  label: string;
  join: "all" | "any";
  conditions: DraftCondition[];
  actions: DraftAction[];
  /**
   * The rule's condition tree verbatim, when the editor cannot draw it.
   *
   * Null for everything the editor made and everything it can represent. When
   * set, `conditions` and `join` are ignored and this is what gets serialised,
   * so opening a hand-written nested rule and pressing Publish changes nothing
   * about it.
   */
  raw: ConditionNode | null;
};

export function newDraftRule(id: string, seed: Partial<DraftRule> = {}): DraftRule {
  return {
    id,
    label: "",
    join: "all",
    conditions: [],
    actions: [],
    raw: null,
    ...seed,
  };
}

export function newDraftCondition(id: string, seed: Partial<DraftCondition> = {}): DraftCondition {
  return { id, field: "", op: "equals", value: "", ...seed };
}

export function newDraftAction(id: string, seed: Partial<DraftAction> = {}): DraftAction {
  return { id, action: "show", field: "", ...seed };
}

// ---------------------------------------------------------------------------
// Reading a stored ruleset
// ---------------------------------------------------------------------------

export function rulesFromDocument(document: FormSchemaDocument): DraftRule[] {
  return (document.rules ?? []).map((rule, index) => fromRule(rule, `r${index}`));
}

function fromRule(rule: Rule, id: string): DraftRule {
  const flat = flatten(rule.when);
  return {
    id,
    label: rule.label ?? "",
    join: flat?.join ?? "all",
    conditions: (flat?.conditions ?? []).map((condition, index) => ({
      id: `${id}-c${index}`,
      field: condition.field,
      op: condition.op,
      value: condition.value === undefined ? "" : String(condition.value),
    })),
    actions: rule.then.map((action, index) => ({
      id: `${id}-a${index}`,
      action: action.action,
      field: action.field,
    })),
    raw: flat === null ? rule.when : null,
  };
}

/**
 * A condition tree the editor can draw, or null.
 *
 * A bare condition counts as a one-condition `all`, because that is what the
 * editor would have produced for it and round-tripping it that way changes
 * nothing about how it evaluates.
 */
function flatten(node: ConditionNode): { join: "all" | "any"; conditions: Condition[] } | null {
  if (!isGroup(node)) return { join: "all", conditions: [node] };

  const conditions: Condition[] = [];
  for (const child of groupChildren(node)) {
    if (isGroup(child)) return null;
    conditions.push(child);
  }
  return { join: groupKind(node), conditions };
}

// ---------------------------------------------------------------------------
// Turning edits back into a ruleset
// ---------------------------------------------------------------------------

/**
 * The ruleset, in the shape `parseSchemaDocument` reads.
 *
 * Typed `unknown[]` for the reason `toSchemaField` is typed `unknown`: this is
 * the *input* to validation, and half of what makes the editor worth having is
 * that it can hold a rule that is not yet a valid one.
 */
export function toRules(drafts: readonly DraftRule[]): unknown[] {
  return drafts.map((draft) => {
    const out: Record<string, unknown> = {
      when: draft.raw ?? {
        [draft.join]: draft.conditions.map(toCondition),
      },
      then: draft.actions.map((action) => ({ action: action.action, field: action.field })),
    };
    if (draft.label.trim() !== "") out.label = draft.label.trim();
    return out;
  });
}

function toCondition(condition: DraftCondition): Record<string, unknown> {
  const out: Record<string, unknown> = { field: condition.field, op: condition.op };
  if (isValuelessOperator(condition.op)) return out;

  // A comparison typed into a number box is stored as a number when it is one.
  // The evaluator would read `"5"` correctly either way, but the analyser's
  // range check reads the stored value, and a document that says `5` is easier
  // to read than one that says `"5"` for the same rule.
  const trimmed = condition.value.trim();
  if (isNumericOperator(condition.op) && trimmed !== "" && Number.isFinite(Number(trimmed))) {
    out.value = Number(trimmed);
  } else {
    out.value = condition.value;
  }
  return out;
}

/**
 * The rules the preview can actually run.
 *
 * Shape only: a rule that is still being typed cannot be represented and is
 * left out, but a rule that merely points at a field which does not exist yet
 * is kept. That is deliberate. The evaluator skips such a rule and says so, and
 * the preview showing exactly what the hosted form would show — including the
 * skip — is the only reason to have a preview at all. Dropping the whole
 * ruleset because one rule is dangling would draw a form nobody will ever see.
 */
export function previewRules(drafts: readonly DraftRule[]): Rule[] {
  const out: Rule[] = [];
  const candidates = toRules(drafts);
  for (const candidate of candidates) {
    const parsed = rulesSchema.safeParse([candidate]);
    if (parsed.success) out.push(parsed.data[0]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

/**
 * The analyser's complaints, attributed to the row that caused them.
 *
 * Two passes, and the order matters. A rule is first parsed on its own, so a
 * rule that is not yet a rule — a condition with no field, a comparison with no
 * value — is reported against its own card rather than taking the whole
 * document down with it. Whatever parsed then goes through `analyzeRules`,
 * which is the same function `parseSchemaDocument` runs: the editor and the
 * format cannot disagree about what blocks Publish, because it is one function.
 *
 * `fields` is what the field editor currently parses to. Rules are analysed
 * against exactly that, so deleting a field and seeing "there is no field named
 * X" on the rule that used it happens on the keystroke rather than at publish.
 */
export function ruleIssues(
  fields: readonly SchemaField[],
  drafts: readonly DraftRule[],
): BuilderIssue[] {
  if (drafts.length === 0) return [];

  const issues: BuilderIssue[] = [];
  const parsed: Rule[] = [];
  /** Index in `parsed` → the draft it came from. */
  const origin: string[] = [];

  const candidates = toRules(drafts);
  for (let index = 0; index < drafts.length; index++) {
    const one = rulesSchema.safeParse([candidates[index]]);
    if (!one.success) {
      for (const message of formatRuleIssues(one.error.issues)) {
        issues.push({ fieldId: null, ruleId: drafts[index].id, severity: "error", message });
      }
      continue;
    }
    origin.push(drafts[index].id);
    parsed.push(one.data[0]);
  }

  for (const issue of analyzeRules({ fields, rules: parsed }).issues) {
    issues.push({
      fieldId: null,
      ruleId: issue.ruleIndex === null ? null : (origin[issue.ruleIndex] ?? null),
      severity: issue.severity,
      message: issue.message,
    });
  }

  return issues;
}

/**
 * Zod's issues as sentences, deduplicated and without their paths.
 *
 * `0.when.all.2.value` names a position in a structure the person editing has
 * never seen; the card the message is attached to is the only address they
 * need. Repeats are dropped because a rule with four blank conditions produces
 * the same sentence four times, and four copies of it is not four problems.
 */
function formatRuleIssues(zodIssues: readonly { message: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const issue of zodIssues) {
    if (seen.has(issue.message)) continue;
    seen.add(issue.message);
    out.push(issue.message);
  }
  return out;
}

/** One rule as a sentence, for the collapsed header of its card. */
export function summarizeDraftRule(draft: DraftRule): string {
  const rules = toRules([draft]);
  const candidate = rules[0] as { when?: ConditionNode; then?: { action: RuleActionKind; field: string }[] };
  if (!candidate.when || !candidate.then) return "Incomplete rule.";
  try {
    return describeRule({ when: candidate.when, then: candidate.then });
  } catch {
    return "Incomplete rule.";
  }
}
