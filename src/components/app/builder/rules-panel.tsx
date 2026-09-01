"use client";

import { Plus, Trash2 } from "lucide-react";

import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { IconButton, IssueLine, QuietButton, SelectField, TextField } from "./inputs";
import {
  newDraftAction,
  newDraftCondition,
  newDraftRule,
  summarizeDraftRule,
  type DraftAction,
  type DraftCondition,
  type DraftRule,
} from "./rules-state";
import type { BuilderIssue, DraftField } from "./state";
import { describeConditions } from "@/lib/rules/describe";
import {
  CONDITION_OPERATORS,
  isValuelessOperator,
  RULE_ACTIONS,
  type ConditionOperator,
  type RuleActionKind,
} from "@/lib/rules/algebra";
import { cn } from "@/lib/utils";

/**
 * Editing conditional logic (#36).
 *
 * ## Why the rules are a list of their own and not a box on each field
 *
 * A rule is a relation between fields — it reads two and changes a third — so
 * putting it on a field would mean either storing it twice or picking one of
 * the fields to be its owner. Both are ways for the same rule to end up
 * disagreeing with itself. What each rule *reads* as, though, is per-field, and
 * that is what the summary sentence on the card is for: "When `budget` is
 * `50k+`, show `procurement_contact`" is a rule anybody can check against what
 * they meant without learning a data model.
 *
 * ## Errors block Publish; warnings never do
 *
 * The same rule the field editor follows, and for the same reason. An error
 * here is a ruleset with no meaning: a circle, a rule naming a field nobody
 * collects, a rule no answer could ever satisfy. A warning is a rule that means
 * something slightly different from what its author probably intended, and
 * overruling somebody on that is how a builder gets worked around.
 *
 * ## The `cn()` trap
 *
 * `cn()` runs `twMerge`, which reads `text-label` as a *colour* and drops one
 * when a colour class sits beside it. Every class string here that pairs a size
 * token with a colour is written out literally and never merged.
 */

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
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

const ACTION_LABELS: Record<RuleActionKind, string> = {
  show: "Show",
  hide: "Hide",
  require: "Require",
};

export type RulesPanelProps = {
  rules: DraftRule[];
  fields: DraftField[];
  issues: BuilderIssue[];
  onChange: (next: DraftRule[]) => void;
  /** Ids are minted by the builder so they stay unique across the whole draft. */
  mintId: () => string;
};

export function RulesPanel({ rules, fields, issues, onChange, mintId }: RulesPanelProps) {
  const named = fields.filter((field) => field.key.trim() !== "");
  const documentIssues = issues.filter((issue) => issue.ruleId === null);

  const patch = (id: string, next: Partial<DraftRule>) =>
    onChange(rules.map((rule) => (rule.id === id ? { ...rule, ...next } : rule)));

  const addRule = () =>
    onChange([
      ...rules,
      newDraftRule(mintId(), {
        // A rule with nothing in it is an error until it says something, so it
        // opens with one of each rather than with two empty lists and a red
        // card. See `analyze.ts` on why an empty condition list cannot ship.
        conditions: [newDraftCondition(mintId())],
        actions: [newDraftAction(mintId())],
      }),
    ]);

  return (
    <Panel>
      <PanelHeader
        title="Rules"
        description="Show, hide or require a field based on what somebody has already answered. Every rule runs in the browser and again on the server, so a rule cannot be skipped by posting straight to the endpoint."
        action={
          <QuietButton onClick={addRule} className="shrink-0" disabled={named.length === 0}>
            <Plus aria-hidden="true" className="size-4" />
            Add rule
          </QuietButton>
        }
      />

      <PanelBody>
        {named.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Add a field with a name first. A rule reads and changes fields, so
            there is nothing for one to point at yet.
          </p>
        ) : rules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-5 py-8 text-center">
            <p className="text-sm font-medium text-foreground">No rules.</p>
            <p className="mx-auto mt-2 max-w-[56ch] text-sm text-muted-foreground">
              Every field is shown to everybody and required only if you marked
              it required. That is a perfectly good form; add a rule when one
              question only makes sense after another has been answered.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {rules.map((rule, index) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                index={index}
                fields={named}
                issues={issues.filter((issue) => issue.ruleId === rule.id)}
                onChange={(next) => patch(rule.id, next)}
                onRemove={() => onChange(rules.filter((entry) => entry.id !== rule.id))}
                mintId={mintId}
              />
            ))}
          </ul>
        )}

        {documentIssues.length > 0 ? (
          <div className="mt-4 grid gap-1.5 rounded-md border border-border bg-sunken px-3.5 py-3">
            {documentIssues.map((issue, index) => (
              <IssueLine key={index} severity={issue.severity}>
                {issue.message}
              </IssueLine>
            ))}
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

function RuleCard({
  rule,
  index,
  fields,
  issues,
  onChange,
  onRemove,
  mintId,
}: {
  rule: DraftRule;
  index: number;
  fields: DraftField[];
  issues: BuilderIssue[];
  onChange: (patch: Partial<DraftRule>) => void;
  onRemove: () => void;
  mintId: () => string;
}) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  const patchCondition = (id: string, next: Partial<DraftCondition>) =>
    onChange({
      conditions: rule.conditions.map((condition) =>
        condition.id === id ? { ...condition, ...next } : condition,
      ),
    });

  const patchAction = (id: string, next: Partial<DraftAction>) =>
    onChange({
      actions: rule.actions.map((action) => (action.id === id ? { ...action, ...next } : action)),
    });

  return (
    <li
      className={cn(
        "min-w-0 rounded-lg border bg-card",
        errors.length > 0 ? "border-destructive" : "border-border",
      )}
    >
      <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-label uppercase text-muted-foreground">
            Rule {index + 1}
          </p>
          <p className="mt-1 text-sm text-foreground">{summarizeDraftRule(rule)}</p>
        </div>
        <IconButton
          label={`Remove rule ${index + 1}`}
          onClick={onRemove}
          className="hover:border-destructive hover:text-destructive"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      </div>

      <div className="grid gap-4 px-3 py-4">
        <TextField
          label="Name (optional)"
          value={rule.label}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder="Qualification"
          hint="Only ever shown to you — in this list, and in the inspector when this rule fires."
        />

        {rule.raw !== null ? (
          <div className="rounded-md border border-border bg-sunken px-3.5 py-3">
            <p className="font-mono text-label uppercase text-muted-foreground">When</p>
            <p className="mt-1.5 text-sm text-foreground">{describeConditions(rule.raw)}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              This rule nests condition groups more deeply than this editor
              draws, so it is shown as written rather than flattened — flattening
              it would change what it means. It still runs, it is still checked,
              and publishing leaves it exactly as it is. Edit it in the schema
              JSON, or delete it and rebuild it here.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-label uppercase text-muted-foreground">When</span>
              <select
                aria-label={`How rule ${index + 1} joins its conditions`}
                value={rule.join}
                onChange={(event) =>
                  onChange({ join: event.target.value === "any" ? "any" : "all" })
                }
                className="rounded-md border border-border-control bg-card px-2 py-1 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <option value="all">all of these are true</option>
                <option value="any">any of these are true</option>
              </select>
            </div>

            <ul className="mt-3 grid gap-2">
              {rule.conditions.map((condition, position) => (
                <li
                  key={condition.id}
                  className="grid gap-2 rounded-md border border-border px-2.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                >
                  <SelectField
                    label="Field"
                    value={condition.field}
                    onChange={(event) => patchCondition(condition.id, { field: event.target.value })}
                  >
                    <option value="">Choose…</option>
                    {fields.map((field) => (
                      <option key={field.id} value={field.key}>
                        {field.label.trim() || field.key}
                      </option>
                    ))}
                  </SelectField>

                  <SelectField
                    label="Comparison"
                    value={condition.op}
                    onChange={(event) =>
                      patchCondition(condition.id, {
                        op: event.target.value as ConditionOperator,
                      })
                    }
                  >
                    {CONDITION_OPERATORS.map((op) => (
                      <option key={op} value={op}>
                        {OPERATOR_LABELS[op]}
                      </option>
                    ))}
                  </SelectField>

                  {isValuelessOperator(condition.op) ? (
                    <p className="self-center text-sm text-muted-foreground sm:pb-2">
                      No value needed.
                    </p>
                  ) : (
                    <ValueField
                      condition={condition}
                      fields={fields}
                      onChange={(value) => patchCondition(condition.id, { value })}
                    />
                  )}

                  <IconButton
                    label={`Remove condition ${position + 1} from rule ${index + 1}`}
                    onClick={() =>
                      onChange({
                        conditions: rule.conditions.filter((entry) => entry.id !== condition.id),
                      })
                    }
                    className="justify-self-end hover:border-destructive hover:text-destructive"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>

            <QuietButton
              className="mt-2"
              onClick={() =>
                onChange({ conditions: [...rule.conditions, newDraftCondition(mintId())] })
              }
            >
              <Plus aria-hidden="true" className="size-4" />
              Add condition
            </QuietButton>
          </div>
        )}

        <div>
          <span className="font-mono text-label uppercase text-muted-foreground">Then</span>

          <ul className="mt-3 grid gap-2">
            {rule.actions.map((action, position) => (
              <li
                key={action.id}
                className="grid gap-2 rounded-md border border-border px-2.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end"
              >
                <SelectField
                  label="Do"
                  value={action.action}
                  onChange={(event) =>
                    patchAction(action.id, { action: event.target.value as RuleActionKind })
                  }
                >
                  {RULE_ACTIONS.map((kind) => (
                    <option key={kind} value={kind}>
                      {ACTION_LABELS[kind]}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  label="Field"
                  value={action.field}
                  onChange={(event) => patchAction(action.id, { field: event.target.value })}
                >
                  <option value="">Choose…</option>
                  {fields.map((field) => (
                    <option key={field.id} value={field.key}>
                      {field.label.trim() || field.key}
                    </option>
                  ))}
                </SelectField>

                <IconButton
                  label={`Remove action ${position + 1} from rule ${index + 1}`}
                  onClick={() =>
                    onChange({ actions: rule.actions.filter((entry) => entry.id !== action.id) })
                  }
                  className="justify-self-end hover:border-destructive hover:text-destructive"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>

          <QuietButton
            className="mt-2"
            onClick={() => onChange({ actions: [...rule.actions, newDraftAction(mintId())] })}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add action
          </QuietButton>

          {rule.actions.some((action) => action.action === "show") ? (
            <p className="mt-2.5 max-w-[64ch] text-sm text-muted-foreground">
              A field that any rule shows{" "}
              <span className="text-foreground">starts hidden</span>, because
              showing something already on the page would mean nothing. Everything
              else starts visible.
            </p>
          ) : null}
        </div>

        {errors.length + warnings.length > 0 ? (
          <div className="grid gap-1.5 rounded-md border border-border bg-sunken px-3.5 py-3">
            {[...errors, ...warnings].map((issue, position) => (
              <IssueLine key={position} severity={issue.severity}>
                {issue.message}
              </IssueLine>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The value box, typed to the field it compares against.
 *
 * A `select` gets its own options rather than a free-text box, because the
 * single most common way conditional logic goes quietly dead is a rule written
 * against an option value that was later edited. Offering the values that exist
 * makes that mistake harder to make; `analyze.ts` catches it when it is made
 * anyway.
 */
function ValueField({
  condition,
  fields,
  onChange,
}: {
  condition: DraftCondition;
  fields: DraftField[];
  onChange: (value: string) => void;
}) {
  const field = fields.find((entry) => entry.key === condition.field);
  const options = field && field.options.length > 0 ? field.options : null;

  if (options && (condition.op === "equals" || condition.op === "not_equals")) {
    return (
      <SelectField label="Value" value={condition.value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose…</option>
        {options.map((option) => (
          <option key={option.id} value={option.value}>
            {option.label.trim() || option.value}
          </option>
        ))}
        {/* A value that is no longer one of the options is still shown, so the
            rule does not silently change meaning the moment this list renders.
            The analyser says, in words, that it can never match. */}
        {condition.value !== "" &&
        !options.some((option) => option.value === condition.value) ? (
          <option value={condition.value}>{condition.value} — no longer an option</option>
        ) : null}
      </SelectField>
    );
  }

  return (
    <TextField
      label="Value"
      value={condition.value}
      mono
      inputMode={field?.type === "number" ? "decimal" : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
