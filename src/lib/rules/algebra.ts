/**
 * Conditional logic, as data — the algebra itself (#36).
 *
 * ## Why this is split from `format.ts`
 *
 * Nothing in this file imports Zod, and that is load-bearing rather than tidy.
 * `evaluate.ts` is shipped **to the browser** on every hosted form that has
 * rules, and a lead-capture page is the last place to spend fifty kilobytes on
 * a validation library it will never call. So the shapes and the walkers live
 * here, the parser lives next door in `format.ts`, and the browser only ever
 * loads the half it needs.
 *
 * ## Why the ruleset is a value and not a callback
 *
 * A rule has to be evaluated in three places — a browser, the ingest path, and
 * the agent tool's description — and it has to be *explained* in a fourth, the
 * inspector. Anything expressive enough to need executing is anything we cannot
 * analyse: we could not tell an author their rule can never fire, could not
 * detect that two rules chase each other in a circle, and could not print what
 * a rule did. So the ruleset is a small closed algebra of conditions and
 * actions, in exactly the spirit `format.ts` gives for the ten field types: a
 * language that can express anything can be reasoned about by nothing.
 *
 * ## Identity is position
 *
 * A rule has no id. Its identity is its index in `document.rules`, which is
 * also the order it is written in and the order the inspector reports. Adding
 * an id would create a second name for the same thing, and the first time the
 * two disagreed we would have a rule that fired under one name and was reported
 * under another. `label` is a caption and nothing reads it but a human.
 *
 * ## What is deliberately absent
 *
 * There is no `set value` action and no `skip step`. #36 lists both; neither is
 * here. A rule that writes an answer nobody typed is the one thing this
 * category does that we are positioned against, and steps do not exist in the
 * format yet — a rule that skipped one would be a rule about a concept the
 * renderer has never heard of. Both can be added additively later; neither can
 * be taken back once a stored document contains it.
 *
 * There is also no `optional` action. `require` only ever adds a requirement,
 * so a field declared `required: true` cannot be argued out of it by a rule.
 * The one thing that lifts a requirement is the field not being asked at all —
 * see `evaluate.ts`, where a hidden field is never required.
 */

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "is_empty",
  "is_not_empty",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

/** Operators that ask about presence and therefore carry no comparison value. */
export const VALUELESS_OPERATORS = ["is_empty", "is_not_empty"] as const satisfies
  readonly ConditionOperator[];

/** Operators that compare numbers, and refuse to guess at anything else. */
export const NUMERIC_OPERATORS = ["gt", "gte", "lt", "lte"] as const satisfies
  readonly ConditionOperator[];

export function isValuelessOperator(op: ConditionOperator): boolean {
  return op === "is_empty" || op === "is_not_empty";
}

export function isNumericOperator(op: ConditionOperator): boolean {
  return op === "gt" || op === "gte" || op === "lt" || op === "lte";
}

export const RULE_ACTIONS = ["show", "hide", "require"] as const;

export type RuleActionKind = (typeof RULE_ACTIONS)[number];

/** A condition, or a group of them joined by AND (`all`) or OR (`any`). */
export type Condition = {
  /** The `key` of another field in the same document. */
  field: string;
  op: ConditionOperator;
  /** Absent for `is_empty` and `is_not_empty`, which compare with nothing. */
  value?: string | number;
};

export type ConditionGroup = { all: ConditionNode[] } | { any: ConditionNode[] };

export type ConditionNode = Condition | ConditionGroup;

export type RuleAction = {
  action: RuleActionKind;
  /** The `key` of the field this acts on. */
  field: string;
};

export type Rule = {
  /** A caption. Nothing reads it but a person; the rule's identity is its index. */
  label?: string;
  when: ConditionNode;
  then: RuleAction[];
};

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/**
 * #36's own bar is "a 20-condition form with nested groups evaluates
 * correctly", and competitors are reported to break at about five. These caps
 * are an order of magnitude above the bar and exist only so that a hand-written
 * or generated document cannot make the analyser or the inspector quadratic.
 */
export const MAX_RULES = 200;
export const MAX_NODES_PER_RULE = 60;
export const MAX_GROUP_DEPTH = 6;
export const MAX_ACTIONS_PER_RULE = 25;
export const MAX_CONDITION_VALUE_CHARS = 1_000;

// ---------------------------------------------------------------------------
// Walking a condition tree
// ---------------------------------------------------------------------------

export function isGroup(node: ConditionNode): node is ConditionGroup {
  return "all" in node || "any" in node;
}

export function groupKind(group: ConditionGroup): "all" | "any" {
  return "all" in group ? "all" : "any";
}

export function groupChildren(group: ConditionGroup): ConditionNode[] {
  return "all" in group ? group.all : group.any;
}

/** Every leaf condition in a tree, in the order it is written. */
export function conditions(node: ConditionNode): Condition[] {
  if (!isGroup(node)) return [node];
  return groupChildren(node).flatMap(conditions);
}

export function countConditions(node: ConditionNode): number {
  return conditions(node).length;
}

export function groupDepth(node: ConditionNode): number {
  if (!isGroup(node)) return 0;
  const children = groupChildren(node);
  if (children.length === 0) return 1;
  return 1 + Math.max(...children.map(groupDepth));
}

/** Every field key a rule reads. Deduplicated, in first-seen order. */
export function sourceFields(rule: Rule): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const condition of conditions(rule.when)) {
    if (seen.has(condition.field)) continue;
    seen.add(condition.field);
    out.push(condition.field);
  }
  return out;
}

/**
 * Every field key a rule can change the *visibility* of.
 *
 * `require` is deliberately excluded. Requiredness is not readable by any
 * condition, so a `require` action cannot feed back into anything and cannot
 * take part in a cycle. Only `show` and `hide` can, which is why the dependency
 * graph in `analyze.ts` is built from these alone.
 */
export function visibilityTargets(rule: Rule): string[] {
  const seen = new Set<string>();
  for (const action of rule.then) {
    if (action.action === "show" || action.action === "hide") seen.add(action.field);
  }
  return [...seen];
}

/** Every field key a rule acts on at all. */
export function targetFields(rule: Rule): string[] {
  const seen = new Set<string>();
  for (const action of rule.then) seen.add(action.field);
  return [...seen];
}

/**
 * A field's baseline visibility, before any rule runs.
 *
 * **A field is visible unless something shows it.** Writing `show X when C` is
 * only meaningful if X is not already on the page, so a field that any rule
 * shows starts hidden and a field nothing shows starts visible. That is the
 * whole of the rule, it is stated in the inspector against every field so it is
 * never invisible, and it means the format needs no per-field "starts hidden"
 * flag that could disagree with the rules beside it.
 */
export function startsHidden(rules: readonly Rule[], key: string): boolean {
  return rules.some((rule) =>
    rule.then.some((action) => action.action === "show" && action.field === key),
  );
}
