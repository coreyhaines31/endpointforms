import type { SchemaField } from "../schema/format.ts";
import { describeConditions, joinList } from "./describe.ts";
import { findCycle } from "./evaluate.ts";
import {
  conditions,
  groupChildren,
  groupKind,
  isGroup,
  isNumericOperator,
  isValuelessOperator,
  type Condition,
  type ConditionNode,
  type Rule,
} from "./algebra.ts";

/**
 * What is wrong with a ruleset, at the moment somebody writes it (#36).
 *
 * ## Why this runs at edit time and not at submit time
 *
 * A broken rule discovered at submit time is discovered on somebody else's paid
 * traffic. Every check here answers a question about the rules *alone* — no
 * answers, no submission — so all of it can be answered while the author is
 * still looking at the screen. `format.ts` runs the errors inside
 * `parseSchemaDocument`, which is what the builder already blocks Publish on,
 * so nothing new had to be wired into the editor for a cycle to be unpublishable.
 *
 * ## Errors block; warnings never do
 *
 * An **error** is a ruleset that has no meaning: it cannot be ordered, it names
 * a field that is not there, or it contains a rule that could never fire under
 * any answers at all. Publishing one would put a form on the internet whose
 * behaviour nobody — including us — can state.
 *
 * A **warning** is a ruleset that means something the author probably did not
 * intend: an action that will never take effect, a branch of an `or` that is
 * dead. Those are their decision to make, and a builder that refuses to let
 * somebody write a redundant rule is a builder they will work around.
 *
 * ## What is not detected, said plainly
 *
 * This is not a satisfiability solver, and it does not pretend to be one.
 * Contradictions are found **within a single conjunction over a single field** —
 * two different values demanded of the same select, a numeric range with no
 * numbers in it, an option value that no longer exists. It will not notice that
 * two *separate* rules can never both fire because of something a third rule
 * does. The honest bar is: everything it reports is genuinely broken, and it
 * never reports something that is fine.
 */

export type RuleIssueCode =
  | "unknown_field"
  | "no_conditions"
  | "no_actions"
  | "cycle"
  | "unsatisfiable"
  | "self_contradictory"
  | "dead_branch"
  | "hide_and_require"
  | "duplicate_action"
  | "hidden_type_target";

export type RuleIssue = {
  /** The rule's index in `document.rules`, or null for the ruleset as a whole. */
  ruleIndex: number | null;
  severity: "error" | "warning";
  code: RuleIssueCode;
  message: string;
};

export type RuleAnalysis = {
  issues: RuleIssue[];
  errors: RuleIssue[];
  warnings: RuleIssue[];
};

const EMPTY: RuleAnalysis = { issues: [], errors: [], warnings: [] };

export function analyzeRules(document: {
  fields: readonly SchemaField[];
  rules?: readonly Rule[];
}): RuleAnalysis {
  const rules = document.rules ?? [];
  if (rules.length === 0) return EMPTY;

  const byKey = new Map(document.fields.map((field) => [field.key, field]));
  const keys = document.fields.map((field) => field.key);
  const issues: RuleIssue[] = [];

  for (let index = 0; index < rules.length; index++) {
    issues.push(...analyzeRule(rules[index], index, byKey));
  }

  // Only worth asking once every rule names fields that exist: a cycle
  // reported against a rule that also references a deleted field is two
  // messages about one fix, and the second one is the confusing one.
  const dangling = issues.some((issue) => issue.code === "unknown_field");
  if (!dangling) {
    const cycle = findCycle(rules, keys);
    if (cycle) {
      const loop = cycle.map((key) => `"${key}"`).join(" → ");
      issues.push({
        ruleIndex: null,
        severity: "error",
        code: "cycle",
        message: `These rules depend on each other in a circle: ${loop}. A hidden field counts as unanswered, so each of these is deciding whether to show the next one from an answer the next one is deciding whether to collect. There is no order in which they can be read, and a form built from them would behave differently depending on which rule happened to run first. Break the loop by making one of them read a field nothing hides.`,
      });
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { issues, errors, warnings };
}

/** The errors alone, as sentences. What `parseSchemaDocument` reports. */
export function ruleErrorMessages(document: {
  fields: readonly SchemaField[];
  rules?: readonly Rule[];
}): string[] {
  return analyzeRules(document).errors.map((issue) =>
    issue.ruleIndex === null ? issue.message : `Rule ${issue.ruleIndex + 1}: ${issue.message}`,
  );
}

// ---------------------------------------------------------------------------
// One rule
// ---------------------------------------------------------------------------

function analyzeRule(
  rule: Rule,
  index: number,
  byKey: ReadonlyMap<string, SchemaField>,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const at = (severity: RuleIssue["severity"], code: RuleIssueCode, message: string) =>
    issues.push({ ruleIndex: index, severity, code, message });

  const leaves = conditions(rule.when);
  if (leaves.length === 0) {
    at(
      "error",
      "no_conditions",
      "This rule has no conditions, so it would apply to every submission — which is not a rule, it is a change to the field itself. Add a condition, or make the change on the field.",
    );
  }
  if (rule.then.length === 0) {
    at("error", "no_actions", "This rule has conditions but does nothing when they hold.");
  }

  const missing = new Set<string>();
  for (const condition of leaves) if (!byKey.has(condition.field)) missing.add(condition.field);
  for (const action of rule.then) if (!byKey.has(action.field)) missing.add(action.field);
  if (missing.size > 0) {
    const names = [...missing].map((key) => `"${key}"`);
    at(
      "error",
      "unknown_field",
      `${joinList(names)} ${missing.size === 1 ? "is not a field" : "are not fields"} on this form. A rule that names a field nobody collects cannot be read: an unanswered field is empty, so the rule would quietly start firing on every submission. Point it at a field that exists, or delete it.`,
    );
  }

  // Actions
  const seen = new Set<string>();
  const shows = new Set<string>();
  const hides = new Set<string>();
  const requires = new Set<string>();
  for (const action of rule.then) {
    const signature = `${action.action}:${action.field}`;
    if (seen.has(signature)) {
      at(
        "warning",
        "duplicate_action",
        `This rule ${action.action}s "${action.field}" twice. The second one does nothing.`,
      );
    }
    seen.add(signature);
    if (action.action === "show") shows.add(action.field);
    if (action.action === "hide") hides.add(action.field);
    if (action.action === "require") requires.add(action.field);

    const field = byKey.get(action.field);
    if (field && field.type === "hidden" && action.action !== "require") {
      at(
        "warning",
        "hidden_type_target",
        `"${action.field}" is a hidden input, so ${action.action === "show" ? "showing" : "hiding"} it changes nothing a visitor can see. It still changes what the rules read: a field the rules have hidden counts as unanswered everywhere else, even though its value is still posted and still stored.`,
      );
    }
  }

  for (const key of shows) {
    if (!hides.has(key)) continue;
    at(
      "error",
      "self_contradictory",
      `This rule both shows and hides "${key}" under the same conditions. Whichever is written last would win, which is an accident rather than a decision.`,
    );
  }

  for (const key of requires) {
    if (!hides.has(key)) continue;
    at(
      "warning",
      "hide_and_require",
      `This rule hides "${key}" and requires it under the same conditions. The requirement never takes effect: a field nobody is asked is never required. Nothing is lost — a value already typed into it is still posted and still stored — but the rule says something it does not do.`,
    );
  }

  // Satisfiability, per conjunction.
  issues.push(...analyzeSatisfiability(rule.when, index, byKey, true));

  return issues;
}

// ---------------------------------------------------------------------------
// Can these conditions ever hold at once?
// ---------------------------------------------------------------------------

/**
 * Walks the tree looking for a conjunction that no answer can satisfy.
 *
 * `fatal` is what tells an unsatisfiable *rule* from an unsatisfiable *branch*.
 * At the top of the tree, and inside every `all` beneath it, an impossible
 * conjunction means the rule can never fire — an error, because the author
 * believes they wrote a rule and did not. Inside an `any`, it means one branch
 * of an `or` is dead and the rule still works — a warning.
 */
function analyzeSatisfiability(
  node: ConditionNode,
  index: number,
  byKey: ReadonlyMap<string, SchemaField>,
  fatal: boolean,
): RuleIssue[] {
  const issues: RuleIssue[] = [];

  if (isGroup(node) && groupKind(node) === "any") {
    for (const child of groupChildren(node)) {
      issues.push(...analyzeSatisfiability(child, index, byKey, false));
    }
    return issues;
  }

  // An `all` group, or a bare condition. Everything in it has to hold at once,
  // including everything inside nested `all` groups; a nested `any` is a
  // separate question and is recursed into rather than flattened.
  const conjunction: Condition[] = [];
  const collect = (current: ConditionNode) => {
    if (!isGroup(current)) {
      conjunction.push(current);
      return;
    }
    if (groupKind(current) === "all") {
      for (const child of groupChildren(current)) collect(child);
      return;
    }
    issues.push(...analyzeSatisfiability(current, index, byKey, fatal));
  };
  collect(node);

  const contradiction = contradictionIn(conjunction, byKey);
  if (contradiction) {
    issues.push({
      ruleIndex: index,
      severity: fatal ? "error" : "warning",
      code: fatal ? "unsatisfiable" : "dead_branch",
      message: fatal
        ? `${contradiction} No submission can ever satisfy this rule, so it does nothing at all — which is worse than not having written it, because the form looks like it has the rule.`
        : `${contradiction} That branch of the "or" can never hold, so it contributes nothing; the rest of the rule still works.`,
    });
  }

  return issues;
}

/** The first provable contradiction in a conjunction, as a sentence. */
function contradictionIn(
  conjunction: readonly Condition[],
  byKey: ReadonlyMap<string, SchemaField>,
): string | null {
  const byField = new Map<string, Condition[]>();
  for (const condition of conjunction) {
    const list = byField.get(condition.field) ?? [];
    list.push(condition);
    byField.set(condition.field, list);
  }

  for (const [key, list] of byField) {
    const field = byKey.get(key);
    // A rule naming a field that is not on the form is already an error with a
    // better message; guessing at its type here would only add a second one.
    if (!field) continue;
    const said = contradictionForField(field, list);
    if (said) return said;
  }
  return null;
}

function contradictionForField(field: SchemaField, list: readonly Condition[]): string | null {
  const equals = list.filter((condition) => condition.op === "equals");
  const notEquals = list.filter((condition) => condition.op === "not_equals");
  const contains = list.filter((condition) => condition.op === "contains");
  const notContains = list.filter((condition) => condition.op === "not_contains");
  const empty = list.some((condition) => condition.op === "is_empty");
  const notEmpty = list.some((condition) => condition.op === "is_not_empty");
  const numeric = list.filter((condition) => isNumericOperator(condition.op));

  if (empty && notEmpty) {
    return `"${field.key}" is asked to be both answered and unanswered.`;
  }

  if (empty) {
    const positive = [...equals, ...contains, ...numeric].find(
      (condition) => !isValuelessOperator(condition.op),
    );
    if (positive) {
      return `"${field.key}" is asked to be unanswered and, at the same time, to hold a value (${describeConditions(positive)}).`;
    }
  }

  // A field posts one value list, and every type but `multi_select` posts at
  // most one entry in it — so two different exact values cannot both be there.
  if (field.type !== "multi_select") {
    const distinct = new Set(equals.map((condition) => norm(condition.value)));
    if (distinct.size > 1) {
      const values = [...distinct].map((value) => JSON.stringify(value)).join(" and ");
      return `"${field.key}" is asked to equal ${values} at once, and it can only hold one value.`;
    }
  }

  for (const positive of equals) {
    for (const negative of notEquals) {
      if (norm(positive.value) === norm(negative.value)) {
        return `"${field.key}" is asked to equal ${JSON.stringify(String(positive.value ?? ""))} and not to equal it.`;
      }
    }
    for (const negative of notContains) {
      if (norm(positive.value).includes(norm(negative.value))) {
        return `"${field.key}" is asked to equal ${JSON.stringify(String(positive.value ?? ""))}, which contains ${JSON.stringify(String(negative.value ?? ""))} — and also not to contain it.`;
      }
    }
    // An `equals` against a choice field whose options no longer include that
    // value. This is the one that actually happens: somebody edits an option's
    // value and the rule written against the old one goes quietly dead.
    if (field.options && field.options.length > 0 && field.type !== "multi_select") {
      const values = field.options.map((option) => norm(option.value));
      if (!values.includes(norm(positive.value))) {
        return `"${field.key}" has no option with the value ${JSON.stringify(String(positive.value ?? ""))}; its options are ${field.options.map((option) => JSON.stringify(option.value)).join(", ")}.`;
      }
    }
  }

  for (const positive of contains) {
    for (const negative of notContains) {
      if (norm(positive.value) === norm(negative.value)) {
        return `"${field.key}" is asked to contain ${JSON.stringify(String(positive.value ?? ""))} and not to contain it.`;
      }
    }
  }

  const range = numericRange(numeric);
  if (range) return `"${field.key}" ${range}`;

  return null;
}

/** An impossible numeric window, as the tail of a sentence. */
function numericRange(numeric: readonly Condition[]): string | null {
  let low: { value: number; exclusive: boolean } | null = null;
  let high: { value: number; exclusive: boolean } | null = null;

  for (const condition of numeric) {
    const value = Number(condition.value);
    if (!Number.isFinite(value)) continue;
    if (condition.op === "gt" || condition.op === "gte") {
      const candidate = { value, exclusive: condition.op === "gt" };
      if (!low || candidate.value > low.value || (candidate.value === low.value && candidate.exclusive)) {
        low = candidate;
      }
    } else {
      const candidate = { value, exclusive: condition.op === "lt" };
      if (!high || candidate.value < high.value || (candidate.value === high.value && candidate.exclusive)) {
        high = candidate;
      }
    }
  }

  if (!low || !high) return null;
  if (low.value < high.value) return null;
  if (low.value === high.value && !low.exclusive && !high.exclusive) return null;

  return `is asked to be ${low.exclusive ? "greater than" : "at least"} ${low.value} and ${
    high.exclusive ? "less than" : "at most"
  } ${high.value}, and no number is both.`;
}

function norm(value: string | number | undefined): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}
