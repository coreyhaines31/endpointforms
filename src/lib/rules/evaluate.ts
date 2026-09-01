import type { JsonValue } from "../ingest/body.ts";
import type { FormSchemaDocument } from "../schema/format.ts";
import {
  conditions,
  groupChildren,
  groupKind,
  isGroup,
  isNumericOperator,
  isValuelessOperator,
  sourceFields,
  startsHidden,
  visibilityTargets,
  type Condition,
  type ConditionNode,
  type Rule,
  type RuleAction,
} from "./algebra.ts";

/**
 * The evaluator (#36).
 *
 * ## One implementation, three callers
 *
 * The hosted page's browser enhancement, the ingest path's validator and the
 * builder's inspector all call this function and nothing else. A second
 * implementation — a little bit of `if` in the renderer, a rewrite of the same
 * logic in a client script — would be a rule that fires in the browser and not
 * on the server, which is a lead quietly refused or quietly required. So this
 * module is pure: no DOM, no database, no clock, no configuration. Given the
 * same document and the same answers it returns the same object everywhere,
 * and `tests/rules.test.mts` asserts exactly that against the payload a browser
 * would post and the payload an agent would send.
 *
 * ## The three decisions that make it well-defined
 *
 * **1. A hidden field is not an input.** If a rule hides `vat_number`, then
 * every other rule reads `vat_number` as unanswered — even though the value the
 * visitor typed before it was hidden is still there, still posted and still
 * stored. Anything else produces forms that ask for the country of a VAT number
 * you cannot see. This is the decision that makes a cycle possible, and
 * therefore the decision that makes cycle detection necessary rather than
 * decorative.
 *
 * **2. Evaluation runs in dependency order, not document order.** A rule whose
 * conditions read `country` is evaluated after every rule that can hide
 * `country`. That order is a topological sort of the show/hide graph, it is
 * reported in the trace, and it exists rather than a fixed-point loop because a
 * loop needs an iteration cap and an iteration cap is a rule that silently
 * stops being true on a large form. `analyze.ts` refuses to publish a ruleset
 * whose graph has a cycle, so the order always exists.
 *
 * **3. A hidden field is never required.** Requiredness is computed last,
 * against final visibility. This is the property a raw POST depends on: a field
 * required only under a condition must not refuse a submission whose condition
 * is false, and there is no browser out there to have hidden it.
 *
 * ## Nothing here deletes anything
 *
 * There is no branch in this file that removes a value. Hiding is a fact about
 * a field, reported; the answers passed in are returned untouched. What a rule
 * hid that nevertheless carries an answer comes back as `answeredWhileHidden`,
 * which `validate.ts` turns into a warning on the submission and the inspector
 * prints in words. The category's habit of quietly dropping the answer to a
 * question it stopped asking is the specific thing this is built not to do.
 */

export type ConditionResult = {
  condition: Condition;
  matched: boolean;
  /** What the field actually held, as the comparison saw it. */
  read: string[];
  /** Why it did not match, when the reason is not simply "the values differ". */
  note: string | null;
};

export type ConditionTrace =
  | ({ kind: "condition" } & ConditionResult)
  | { kind: "group"; join: "all" | "any"; matched: boolean; children: ConditionTrace[] };

export type EffectTrace = {
  action: RuleAction;
  /** False when a later rule overrode it, or when it could not apply. */
  applied: boolean;
  note: string | null;
};

export type RuleTrace = {
  /** The rule's index in `document.rules`. Its only identity. */
  index: number;
  label: string | null;
  status: "matched" | "not_matched" | "skipped";
  /** Set when `status` is `skipped`. */
  skippedReason: string | null;
  conditions: ConditionTrace | null;
  effects: EffectTrace[];
};

export type StateReason = {
  /** The rule that decided this, or null when nothing did. */
  ruleIndex: number | null;
  note: string;
};

export type FieldOutcome = {
  key: string;
  visible: boolean;
  required: boolean;
  visibility: StateReason;
  requirement: StateReason;
  /** True when this field is hidden and an answer for it arrived anyway. */
  answeredWhileHidden: boolean;
};

export type RuleEvaluation = {
  /** Keyed by field key, in document order. */
  fields: Record<string, FieldOutcome>;
  /** In the order they ran, which is dependency order and not document order. */
  trace: RuleTrace[];
  /** Rule indices, in the order they ran. */
  order: number[];
  /** Field keys the rules hid that carry an answer regardless. Never dropped. */
  answeredWhileHidden: string[];
  /**
   * Set when the whole ruleset was ignored, with the reason.
   *
   * Reachable only from a stored document that this build cannot evaluate — a
   * cycle that `analyze.ts` would refuse to publish today but an older build
   * may have written. Ignoring the ruleset is the safe degradation in every
   * direction at once: every field is shown, nothing is conditionally required,
   * nothing is refused and nothing is marked hidden. The form behaves exactly
   * as it did before rules existed.
   */
  degraded: string | null;
};

/**
 * The state of every field, given a set of answers.
 *
 * `values` is the submission payload in the shape `parseBody` produces, which
 * is also the shape an agent's coerced arguments take and the shape a browser's
 * `FormData` reduces to. One reader, so the three surfaces cannot disagree
 * about what "answered" means.
 */
export function evaluateRules(
  document: FormSchemaDocument,
  values: Record<string, JsonValue>,
): RuleEvaluation {
  const rules = document.rules ?? [];
  const keys = document.fields.map((field) => field.key);
  const known = new Set(keys);

  const fields: Record<string, FieldOutcome> = {};
  for (const field of document.fields) {
    fields[field.key] = {
      key: field.key,
      visible: true,
      required: field.required,
      visibility: { ruleIndex: null, note: "Shown by default; no rule hides it." },
      requirement: {
        ruleIndex: null,
        note: field.required ? "Required by the field itself." : "Optional.",
      },
      answeredWhileHidden: false,
    };
  }

  if (rules.length === 0) {
    return { fields, trace: [], order: [], answeredWhileHidden: [], degraded: null };
  }

  const order = evaluationOrder(rules, keys);
  if (order === null) {
    return {
      fields,
      trace: [],
      order: [],
      answeredWhileHidden: [],
      degraded:
        "These rules depend on each other in a circle, so there is no order in which they can be read. They have been ignored: every field is shown and nothing is conditionally required.",
    };
  }

  // The baseline. A field any rule shows starts hidden; see `startsHidden`.
  for (const key of keys) {
    if (!startsHidden(rules, key)) continue;
    fields[key].visible = false;
    fields[key].visibility = {
      ruleIndex: null,
      note: "Hidden until a rule shows it, because a rule shows it and nothing shows it by default.",
    };
  }

  const trace: RuleTrace[] = [];
  const matched = new Map<number, boolean>();

  // Pass one: visibility, in dependency order.
  for (const index of order) {
    const rule = rules[index];
    const missing = referencedButMissing(rule, known);
    if (missing.length > 0) {
      matched.set(index, false);
      trace.push({
        index,
        label: rule.label ?? null,
        status: "skipped",
        skippedReason: skipSentence(missing),
        conditions: null,
        effects: rule.then.map((action) => ({
          action,
          applied: false,
          note: "Not applied: the rule was skipped.",
        })),
      });
      continue;
    }

    const conditionTrace = evaluateNode(rule.when, fields, values);
    matched.set(index, conditionTrace.matched);

    const effects: EffectTrace[] = [];
    for (const action of rule.then) {
      if (action.action === "require") {
        // Requiredness is pass two. Recorded here so the rule's entry lists
        // every action it declares rather than only the visible half.
        effects.push({
          action,
          applied: false,
          note: conditionTrace.matched
            ? "Applied after visibility is settled; see the field below."
            : "Not applied: the conditions did not hold.",
        });
        continue;
      }
      if (!conditionTrace.matched) {
        effects.push({ action, applied: false, note: "The conditions did not hold." });
        continue;
      }
      const outcome = fields[action.field];
      const visible = action.action === "show";
      outcome.visible = visible;
      outcome.visibility = {
        ruleIndex: index,
        note: `${visible ? "Shown" : "Hidden"} by rule ${index + 1}${
          rule.label ? ` (${rule.label})` : ""
        }.`,
      };
      effects.push({ action, applied: true, note: null });
    }

    trace.push({
      index,
      label: rule.label ?? null,
      status: conditionTrace.matched ? "matched" : "not_matched",
      skippedReason: null,
      conditions: conditionTrace,
      effects,
    });
  }

  // Pass two: requiredness, against settled visibility. A `require` action is
  // additive — nothing in the format can argue a declared `required: true`
  // back down — so this only ever turns requiredness on.
  const traceByIndex = new Map(trace.map((entry) => [entry.index, entry]));
  for (const index of order) {
    if (matched.get(index) !== true) continue;
    const rule = rules[index];
    const entry = traceByIndex.get(index);
    for (let i = 0; i < rule.then.length; i++) {
      const action = rule.then[i];
      if (action.action !== "require") continue;
      const outcome = fields[action.field];
      const effect = entry?.effects[i];
      if (!outcome.visible) {
        // Not a contradiction to refuse — the field simply is not being asked,
        // and requiring an answer to a question nobody was shown is how a
        // conditional form starts refusing submissions it never explained.
        if (effect) {
          effect.applied = false;
          effect.note = `Not applied: "${action.field}" is hidden, and a field nobody is asked is never required.`;
        }
        continue;
      }
      outcome.required = true;
      outcome.requirement = {
        ruleIndex: index,
        note: `Required by rule ${index + 1}${rule.label ? ` (${rule.label})` : ""}.`,
      };
      if (effect) {
        effect.applied = true;
        effect.note = null;
      }
    }
  }

  // Last: a hidden field is never required, whatever it declared.
  const answeredWhileHidden: string[] = [];
  for (const key of keys) {
    const outcome = fields[key];
    if (outcome.visible) continue;
    if (outcome.required) {
      outcome.required = false;
      outcome.requirement = {
        ruleIndex: outcome.visibility.ruleIndex,
        note: "Not required: the rules do not ask this field, so it cannot be missing.",
      };
    }
    if (readAnswer(values, key).length > 0) {
      outcome.answeredWhileHidden = true;
      answeredWhileHidden.push(key);
    }
  }

  return { fields, trace, order, answeredWhileHidden, degraded: null };
}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

/**
 * The order rules run in, or null when they depend on each other in a circle.
 *
 * A rule is placed at the earliest point at which everything it reads has
 * settled. Concretely: fields are sorted topologically over the show/hide graph
 * (an edge from every field a rule reads to every field that rule shows or
 * hides), and each rule takes the position of its earliest target. A rule that
 * only requires things reads nothing that can still change, so it goes last, in
 * document order.
 *
 * Ties break on document order throughout, so two rules that could run in
 * either order always run in the order they are written.
 */
export function evaluationOrder(rules: readonly Rule[], keys: readonly string[]): number[] | null {
  const rank = topologicalRank(rules, keys);
  if (rank === null) return null;

  const positioned = rules.map((rule, index) => {
    const targets = visibilityTargets(rule);
    let earliest = Number.POSITIVE_INFINITY;
    for (const target of targets) {
      const at = rank.get(target);
      if (at !== undefined && at < earliest) earliest = at;
    }
    return { index, earliest };
  });

  // Written out rather than as a subtraction because two rules that read
  // nothing settleable both score `Infinity`, and `Infinity - Infinity` is
  // `NaN` — which `sort` reads as "equal" only by accident.
  positioned.sort((a, b) => {
    if (a.earliest !== b.earliest) return a.earliest < b.earliest ? -1 : 1;
    return a.index - b.index;
  });
  return positioned.map((entry) => entry.index);
}

/**
 * A rank per field over the show/hide graph, or null when it has a cycle.
 *
 * Kahn's algorithm with the ready set kept in document order, so the rank of an
 * unconstrained field is its position in the schema rather than whatever order
 * a `Set` happened to iterate in. A deterministic order is not a nicety here:
 * it is what makes the inspector's account of what ran reproducible.
 */
function topologicalRank(
  rules: readonly Rule[],
  keys: readonly string[],
): Map<string, number> | null {
  const position = new Map(keys.map((key, index) => [key, index]));
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, number>(keys.map((key) => [key, 0]));

  for (const rule of rules) {
    const targets = visibilityTargets(rule);
    if (targets.length === 0) continue;
    for (const source of sourceFields(rule)) {
      if (!position.has(source)) continue;
      for (const target of targets) {
        if (!position.has(target)) continue;
        const edges = outgoing.get(source) ?? new Set<string>();
        if (edges.has(target)) continue;
        edges.add(target);
        outgoing.set(source, edges);
        incoming.set(target, (incoming.get(target) ?? 0) + 1);
      }
    }
  }

  const ready = keys.filter((key) => (incoming.get(key) ?? 0) === 0);
  const rank = new Map<string, number>();
  let next = 0;

  while (ready.length > 0) {
    // Smallest schema position first, so the order is the document's own.
    let pick = 0;
    for (let i = 1; i < ready.length; i++) {
      if ((position.get(ready[i]) ?? 0) < (position.get(ready[pick]) ?? 0)) pick = i;
    }
    const key = ready.splice(pick, 1)[0];
    rank.set(key, next++);

    for (const target of outgoing.get(key) ?? []) {
      const remaining = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, remaining);
      if (remaining === 0) ready.push(target);
    }
  }

  return rank.size === keys.length ? rank : null;
}

/**
 * The fields caught in a circle, for the message `analyze.ts` prints.
 *
 * Returns one cycle, not all of them: an author fixes one at a time, and a
 * message listing four overlapping cycles is a message nobody reads.
 */
export function findCycle(rules: readonly Rule[], keys: readonly string[]): string[] | null {
  const known = new Set(keys);
  const edges = new Map<string, string[]>();
  for (const rule of rules) {
    const targets = visibilityTargets(rule).filter((key) => known.has(key));
    if (targets.length === 0) continue;
    for (const source of sourceFields(rule)) {
      if (!known.has(source)) continue;
      const list = edges.get(source) ?? [];
      for (const target of targets) if (!list.includes(target)) list.push(target);
      edges.set(source, list);
    }
  }

  const state = new Map<string, "open" | "done">();
  const stack: string[] = [];

  const walk = (key: string): string[] | null => {
    const seen = state.get(key);
    if (seen === "done") return null;
    if (seen === "open") return [...stack.slice(stack.indexOf(key)), key];

    state.set(key, "open");
    stack.push(key);
    for (const next of edges.get(key) ?? []) {
      const cycle = walk(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(key, "done");
    return null;
  };

  for (const key of keys) {
    const cycle = walk(key);
    if (cycle) return cycle;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

function evaluateNode(
  node: ConditionNode,
  fields: Record<string, FieldOutcome>,
  values: Record<string, JsonValue>,
): ConditionTrace {
  if (isGroup(node)) {
    const join = groupKind(node);
    const children = groupChildren(node).map((child) => evaluateNode(child, fields, values));
    // An empty `all` is vacuously true and an empty `any` is vacuously false.
    // Neither is ever publishable — `analyze.ts` refuses a rule with no
    // conditions — so this is the reading for a stored document only, and it is
    // the one JavaScript's own `every`/`some` would give.
    const matched =
      join === "all" ? children.every((child) => child.matched) : children.some((child) => child.matched);
    return { kind: "group", join, matched, children };
  }
  return { kind: "condition", ...evaluateCondition(node, fields, values) };
}

/**
 * One condition, against one field's answer.
 *
 * ## Comparison is case-insensitive and trimmed
 *
 * "Yes" and "yes" are the same answer to anybody filling in a form, and a
 * conditional form that disagrees is the exact complaint #36 opens with. The
 * values of a `select` are exact strings we generated, so nothing is lost
 * there; what is gained is that a rule written against a hand-typed option, or
 * against a text field, does what its author plainly meant.
 *
 * ## An unanswered field answers nothing
 *
 * `equals` is false, `not_equals` is true, `contains` is false. That follows
 * from reading the operators as questions about the answer that is there, and
 * the inspector prints "no answer" beside the condition so it is never a
 * mystery which of those happened.
 */
function evaluateCondition(
  condition: Condition,
  fields: Record<string, FieldOutcome>,
  values: Record<string, JsonValue>,
): ConditionResult {
  const outcome = fields[condition.field];

  if (outcome === undefined) {
    // Unreachable through `evaluateRules`, which skips a rule naming a field
    // the document does not have. Kept because this function is exported to
    // the inspector, which is handed whatever is on screen.
    return {
      condition,
      matched: false,
      read: [],
      note: `There is no field named "${condition.field}".`,
    };
  }

  const hidden = !outcome.visible;
  const read = hidden ? [] : readAnswer(values, condition.field);
  const note = hidden
    ? `"${condition.field}" is hidden, so it counts as unanswered.`
    : read.length === 0
      ? "No answer."
      : null;

  if (isValuelessOperator(condition.op)) {
    const empty = read.length === 0;
    return {
      condition,
      matched: condition.op === "is_empty" ? empty : !empty,
      read,
      note,
    };
  }

  if (isNumericOperator(condition.op)) {
    const bound = asNumber(condition.value);
    if (bound === null) {
      return {
        condition,
        matched: false,
        read,
        note: `${JSON.stringify(condition.value)} is not a number, so this comparison can never hold.`,
      };
    }
    const numbers = read.map(asNumber).filter((value): value is number => value !== null);
    if (numbers.length === 0) {
      return {
        condition,
        matched: false,
        read,
        note: read.length === 0 ? note : "The answer is not a number.",
      };
    }
    const matched = numbers.some((value) => compare(condition.op, value, bound));
    return { condition, matched, read, note: matched ? null : note };
  }

  const wanted = normalize(String(condition.value ?? ""));
  const seen = read.map(normalize);

  switch (condition.op) {
    case "equals":
      return { condition, matched: seen.includes(wanted), read, note };
    case "not_equals":
      return { condition, matched: !seen.includes(wanted), read, note };
    case "contains":
      return {
        condition,
        matched: seen.some((value) => value.includes(wanted)),
        read,
        note,
      };
    case "not_contains":
      return {
        condition,
        matched: !seen.some((value) => value.includes(wanted)),
        read,
        note,
      };
    default:
      return { condition, matched: false, read, note: "Unknown operator." };
  }
}

function compare(op: Condition["op"], value: number, bound: number): boolean {
  switch (op) {
    case "gt":
      return value > bound;
    case "gte":
      return value >= bound;
    case "lt":
      return value < bound;
    case "lte":
      return value <= bound;
    default:
      return false;
  }
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function asNumber(value: string | number | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A field's answer, as a list of non-blank strings.
 *
 * Deliberately the same normalisation `validate.ts` performs before it checks
 * anything: an array collapses, a number or a boolean becomes its text, and a
 * whitespace-only string is a field nobody filled in. If these two ever
 * disagreed, a rule would fire on an answer the validator called empty.
 */
export function readAnswer(values: Record<string, JsonValue>, key: string): string[] {
  const raw = values[key];
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const out: string[] = [];
  for (const entry of list) {
    if (entry === null || entry === undefined) continue;
    if (typeof entry === "string") {
      if (entry.trim() === "") continue;
      out.push(entry);
      continue;
    }
    if (typeof entry === "number" || typeof entry === "boolean") out.push(String(entry));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rules that name fields the document does not have
// ---------------------------------------------------------------------------

/**
 * The field names a rule mentions that are not in the document.
 *
 * A rule like this is *skipped whole* rather than partially applied. The
 * alternative — treating the missing field as unanswered — is worse in the
 * exact way that matters: `is_empty` would be true, the rule would fire, and
 * deleting a field would silently start hiding a different one. `analyze.ts`
 * refuses to publish this, so at runtime it can only be a document written
 * before the field was deleted.
 */
export function referencedButMissing(rule: Rule, known: ReadonlySet<string>): string[] {
  const missing = new Set<string>();
  for (const condition of conditions(rule.when)) {
    if (!known.has(condition.field)) missing.add(condition.field);
  }
  for (const action of rule.then) {
    if (!known.has(action.field)) missing.add(action.field);
  }
  return [...missing];
}

function skipSentence(missing: readonly string[]): string {
  const names = missing.map((key) => `"${key}"`).join(", ");
  return missing.length === 1
    ? `Skipped: there is no field named ${names}. The rule does nothing at all rather than guessing what it meant.`
    : `Skipped: there are no fields named ${names}. The rule does nothing at all rather than guessing what it meant.`;
}
