import type { FormSchemaDocument, SchemaField } from "../schema/format.ts";
import {
  groupChildren,
  groupKind,
  isGroup,
  isValuelessOperator,
  startsHidden,
  type Condition,
  type ConditionNode,
  type ConditionOperator,
  type Rule,
} from "./algebra.ts";

/**
 * Rules, in English (#36).
 *
 * ## Why prose is a first-class output and not a nicety
 *
 * A rule reaches three audiences and only one of them can read the data
 * structure. The builder shows a person what they just wrote; the inspector
 * explains what happened; and `manifest/tool.ts` has to tell an agent that a
 * field is required only sometimes, because **JSON Schema cannot say it** in
 * the subset we publish. `docs/29-conditional-logic.md` §3 argues that decision
 * at length; this module is the sentence it settles on.
 *
 * Every sentence here names fields by their **key**, not their label. The key
 * is what an agent sends and what a browser posts; a description that said
 * "Work email" would name something the caller cannot address.
 */

const OPERATOR_PHRASES: Record<ConditionOperator, string> = {
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  not_contains: "does not contain",
  is_empty: "is not answered",
  is_not_empty: "is answered",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
};

export function describeCondition(condition: Condition): string {
  const phrase = OPERATOR_PHRASES[condition.op];
  if (isValuelessOperator(condition.op)) return `"${condition.field}" ${phrase}`;
  return `"${condition.field}" ${phrase} ${JSON.stringify(String(condition.value ?? ""))}`;
}

/**
 * A whole condition tree as one clause.
 *
 * Nested groups are parenthesised rather than flattened. "a and b or c" is
 * ambiguous in English and the whole point of the sentence is that somebody can
 * check it against what they meant.
 */
export function describeConditions(node: ConditionNode): string {
  if (!isGroup(node)) return describeCondition(node);

  const join = groupKind(node) === "all" ? " and " : " or ";
  const children = groupChildren(node);
  if (children.length === 0) return groupKind(node) === "all" ? "always" : "never";
  if (children.length === 1) return describeConditions(children[0]);

  return children
    .map((child) => (isGroup(child) ? `(${describeConditions(child)})` : describeConditions(child)))
    .join(join);
}

/** What a rule does, as one sentence. Used in the builder and the inspector. */
export function describeRule(rule: Rule): string {
  const effects = rule.then.map((action) => {
    switch (action.action) {
      case "show":
        return `show "${action.field}"`;
      case "hide":
        return `hide "${action.field}"`;
      case "require":
        return `require "${action.field}"`;
    }
  });
  const what = effects.length === 0 ? "do nothing" : joinList(effects);
  return `When ${describeConditions(rule.when)}, ${what}.`;
}

export function joinList(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// ---------------------------------------------------------------------------
// What a field's rules mean, for a caller that cannot read the ruleset
// ---------------------------------------------------------------------------

export type FieldRuleSummary = {
  /** True when no set of answers can leave this field unasked. */
  alwaysAsked: boolean;
  /** True when the field is required whatever anybody answers. */
  alwaysRequired: boolean;
  /** Conditions under which the field is asked, when it is not always asked. */
  askedWhen: string[];
  /** Conditions under which the field is required, beyond its own `required`. */
  requiredWhen: string[];
};

/**
 * Everything the rules say about one field.
 *
 * `alwaysRequired` is the predicate that governs **two** surfaces at once: it
 * decides whether the field goes in the agent tool's `required` array, and
 * whether the hosted page emits the HTML `required` attribute. They are the
 * same question — "can this field be missing from a submission we accept?" —
 * and answering it in two places is how the two surfaces would drift.
 */
export function summarizeFieldRules(
  document: FormSchemaDocument,
  field: SchemaField,
): FieldRuleSummary {
  const rules = document.rules ?? [];
  const askedWhen: string[] = [];
  const requiredWhen: string[] = [];
  let hideable = startsHidden(rules, field.key);

  for (const rule of rules) {
    for (const action of rule.then) {
      if (action.field !== field.key) continue;
      if (action.action === "hide") {
        hideable = true;
        continue;
      }
      if (action.action === "show") {
        askedWhen.push(describeConditions(rule.when));
        continue;
      }
      requiredWhen.push(describeConditions(rule.when));
    }
  }

  return {
    alwaysAsked: !hideable,
    alwaysRequired: field.required && !hideable,
    askedWhen,
    requiredWhen,
  };
}

/**
 * The sentences appended to a field's `description` in the agent tool.
 *
 * Returns an empty list when the rules say nothing about this field, so a form
 * without conditional logic produces a tool definition byte-for-byte identical
 * to the one it produced before #36 existed.
 */
export function toolNotesForField(
  document: FormSchemaDocument,
  field: SchemaField,
): string[] {
  const rules = document.rules ?? [];
  if (rules.length === 0) return [];

  const summary = summarizeFieldRules(document, field);
  const notes: string[] = [];

  if (!summary.alwaysAsked) {
    const when =
      summary.askedWhen.length > 0
        ? ` It is asked when ${joinList(summary.askedWhen.map((clause) => `(${clause})`))}.`
        : "";
    notes.push(
      `Conditional: the form does not always ask for this field.${when} A value sent when the form would not have asked is stored, and reported back as a warning rather than refused.`,
    );
  }

  if (summary.requiredWhen.length > 0) {
    notes.push(
      `Required when ${joinList(summary.requiredWhen.map((clause) => `(${clause})`))}. This is checked when the submission is read, not by this schema — JSON Schema cannot express a conditional requirement in the subset published here, and declaring it unconditionally would be a rule that does not exist.`,
    );
  } else if (field.required && !summary.alwaysRequired) {
    notes.push(
      "Required, except when the form does not ask for it at all — in which case it may be omitted.",
    );
  }

  return notes;
}

/** The sentence the tool's own description carries when a form has rules. */
export function toolRulesSentence(document: FormSchemaDocument): string | null {
  const rules = document.rules ?? [];
  if (rules.length === 0) return null;

  const conditional = document.fields.filter(
    (field) => !summarizeFieldRules(document, field).alwaysAsked,
  ).length;
  const conditionallyRequired = document.fields.filter(
    (field) => summarizeFieldRules(document, field).requiredWhen.length > 0,
  ).length;

  const parts: string[] = [];
  if (conditional > 0) {
    parts.push(
      `${conditional} field${conditional === 1 ? " is" : "s are"} only asked for under some answers`,
    );
  }
  if (conditionallyRequired > 0) {
    parts.push(
      `${conditionallyRequired} field${conditionallyRequired === 1 ? " is" : "s are"} required only under some answers`,
    );
  }
  if (parts.length === 0) return null;

  return `This form has conditional logic: ${joinList(parts)}. Each such field says so in its own description; the conditions are enforced when the submission is read, and the required list below names only fields that are required whatever else you send.`;
}
