/**
 * Conditional logic (#36).
 *
 * | Module | What it is |
 * | --- | --- |
 * | `algebra.ts` | The rule algebra — conditions, actions, limits, walkers. Data, never code, and no dependencies. |
 * | `format.ts` | The Zod parser for a ruleset. Kept apart so the browser never loads it. |
 * | `evaluate.ts` | The one evaluator. Pure. The browser, the ingest path and the inspector all call it. |
 * | `analyze.ts` | What is wrong with a ruleset, answered without any answers. Runs at edit time. |
 * | `describe.ts` | Rules in English, including the sentences an agent reads. |
 * | `inspect.ts` | The rules inspector: what fired, in what order, and what each one did. |
 *
 * The ruleset lives **inside** `FormSchemaDocument`, additively — see
 * `src/lib/schema/format.ts`. It is not a second artefact and there is no
 * second table: a rule is part of the definition that a form, a tool and a
 * validator are all projections of, so a published version carries the logic it
 * was published with and a submission stays readable against the exact rules it
 * arrived under.
 *
 * `docs/29-conditional-logic.md` records the decisions, including the one that
 * governs the whole design: what each of the three surfaces can honestly say
 * about a rule, given that only one of them has a browser.
 */

export {
  CONDITION_OPERATORS,
  conditions,
  countConditions,
  groupChildren,
  groupDepth,
  groupKind,
  isGroup,
  isNumericOperator,
  isValuelessOperator,
  MAX_ACTIONS_PER_RULE,
  MAX_GROUP_DEPTH,
  MAX_NODES_PER_RULE,
  MAX_RULES,
  NUMERIC_OPERATORS,
  RULE_ACTIONS,
  sourceFields,
  startsHidden,
  targetFields,
  VALUELESS_OPERATORS,
  visibilityTargets,
  type Condition,
  type ConditionGroup,
  type ConditionNode,
  type ConditionOperator,
  type Rule,
  type RuleAction,
  type RuleActionKind,
} from "./algebra.ts";

export { rulesSchema } from "./format.ts";

export {
  evaluateRules,
  evaluationOrder,
  findCycle,
  readAnswer,
  referencedButMissing,
  type ConditionResult,
  type ConditionTrace,
  type EffectTrace,
  type FieldOutcome,
  type RuleEvaluation,
  type RuleTrace,
  type StateReason,
} from "./evaluate.ts";

export {
  analyzeRules,
  ruleErrorMessages,
  type RuleAnalysis,
  type RuleIssue,
  type RuleIssueCode,
} from "./analyze.ts";

export {
  describeCondition,
  describeConditions,
  describeRule,
  summarizeFieldRules,
  toolNotesForField,
  toolRulesSentence,
  type FieldRuleSummary,
} from "./describe.ts";

export { inspectRules, type Inspection, type InspectedField, type InspectedRule } from "./inspect.ts";
