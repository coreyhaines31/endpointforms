import { z } from "zod";

import { MAX_FIELD_NAME_CHARS } from "../ingest/limits.ts";
import {
  CONDITION_OPERATORS,
  countConditions,
  groupDepth,
  isValuelessOperator,
  MAX_ACTIONS_PER_RULE,
  MAX_CONDITION_VALUE_CHARS,
  MAX_GROUP_DEPTH,
  MAX_NODES_PER_RULE,
  MAX_RULES,
  RULE_ACTIONS,
  type ConditionNode,
} from "./algebra.ts";

/**
 * Parsing a ruleset (#36).
 *
 * The algebra itself is in `algebra.ts`, which imports nothing — see the note
 * there for why the two are separate files. This one holds the Zod schema that
 * `src/lib/schema/format.ts` folds into `FormSchemaDocument`, and it is the
 * only place a stored or declared ruleset is turned into values the rest of
 * `src/lib/rules` will trust.
 *
 * What it refuses is only what has no meaning at all: an operator carrying a
 * value it does not compare with, a comparison missing the value it needs, a
 * tree nested past the limit. Everything a person could plausibly have meant is
 * accepted here and judged in `analyze.ts`, which is where the messages worth
 * reading live.
 */

const fieldRef = z
  .string()
  .min(1, "A condition needs a field name.")
  .max(MAX_FIELD_NAME_CHARS);

const conditionSchema = z
  .strictObject({
    field: fieldRef,
    op: z.enum(CONDITION_OPERATORS),
    value: z.union([z.string().max(MAX_CONDITION_VALUE_CHARS), z.number()]).optional(),
  })
  .superRefine((condition, ctx) => {
    if (isValuelessOperator(condition.op)) {
      if (condition.value !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: `"${condition.op}" asks whether the field was answered at all, so it takes no value.`,
        });
      }
      return;
    }
    if (condition.value === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `"${condition.op}" needs a value to compare against.`,
      });
    }
  });

const conditionNodeSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(conditionNodeSchema).max(MAX_NODES_PER_RULE) }),
    z.strictObject({ any: z.array(conditionNodeSchema).max(MAX_NODES_PER_RULE) }),
    conditionSchema,
  ]),
);

const actionSchema = z.strictObject({
  action: z.enum(RULE_ACTIONS),
  field: fieldRef,
});

const ruleSchema = z
  .strictObject({
    label: z.string().max(200).optional(),
    when: conditionNodeSchema,
    then: z.array(actionSchema).max(MAX_ACTIONS_PER_RULE),
  })
  .superRefine((rule, ctx) => {
    const depth = groupDepth(rule.when);
    if (depth > MAX_GROUP_DEPTH) {
      ctx.addIssue({
        code: "custom",
        path: ["when"],
        message: `This rule nests condition groups ${depth} deep; ${MAX_GROUP_DEPTH} is the limit.`,
      });
    }
    const count = countConditions(rule.when);
    if (count > MAX_NODES_PER_RULE) {
      ctx.addIssue({
        code: "custom",
        path: ["when"],
        message: `This rule has ${count} conditions; ${MAX_NODES_PER_RULE} is the limit.`,
      });
    }
  });

export const rulesSchema = z.array(ruleSchema).max(MAX_RULES);

