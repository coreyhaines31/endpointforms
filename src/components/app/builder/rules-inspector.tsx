"use client";

import { useMemo, useState } from "react";

import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { CheckboxField, QuietButton, SelectField, TextField } from "./inputs";
import { inspectRules, type InspectedConditionLine } from "@/lib/rules/inspect";
import type { FormSchemaDocument, SchemaField } from "@/lib/schema/format";
import type { JsonValue } from "@/lib/ingest/body";
import { cn } from "@/lib/utils";

/**
 * The rules inspector (#36).
 *
 * ## The thing this actually replaces
 *
 * Without it, the way somebody debugs their own conditional logic is to open
 * their live form in a private window and fill it in over and over, changing one
 * answer at a time and guessing at what happened. Everyone in this category
 * ships conditional logic; nobody ships an answer to "why is this field
 * hidden". #36 is explicit that the debugger is the differentiator, and it is
 * the same commitment to being interrogable that puts a schema version on every
 * submission and a field name in every rejection.
 *
 * ## It cannot disagree with the form
 *
 * Everything below comes from `inspectRules`, which calls `evaluateRules` —
 * the same function the hosted page runs in the browser and the same one
 * `validate.ts` runs on the server. There is no second reading of the rules
 * here to drift from the first. If this panel says a field is hidden, the form
 * hides it; if it says a rule did nothing, the form's rule did nothing.
 *
 * ## Why the answers are typed in rather than sampled from real submissions
 *
 * A rule is usually wrong for an answer nobody has given yet — that is what
 * makes it expensive to find. Real submissions would only ever show the paths
 * that already work.
 *
 * ## The `cn()` trap
 *
 * `cn()` runs `twMerge`, which reads `text-label` as a *colour* and drops it
 * when a colour class sits beside it. Class strings pairing a size token with a
 * colour are written out literally here and never merged.
 */

export type RulesInspectorProps = {
  /** The document as the preview draws it — parsed fields, parsed rules. */
  document: FormSchemaDocument;
};

export function RulesInspector({ document }: RulesInspectorProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const inspection = useMemo(
    () => inspectRules(document, answers as Record<string, JsonValue>),
    [document, answers],
  );

  const set = (key: string, value: string | string[]) =>
    setAnswers((current) => ({ ...current, [key]: value }));

  const hasRules = (document.rules?.length ?? 0) > 0;

  return (
    <Panel>
      <PanelHeader
        title="Rules inspector"
        description="Answer the form the way somebody might, and see exactly which rules fired, in what order, and what each one did."
        action={
          Object.keys(answers).length > 0 ? (
            <QuietButton onClick={() => setAnswers({})} className="shrink-0">
              Clear answers
            </QuietButton>
          ) : null
        }
      />

      <PanelBody className="grid gap-6">
        {!hasRules ? (
          <p className="text-sm text-muted-foreground">
            This form has no rules, so there is nothing to trace. Every field is
            shown to everybody, and required only where you marked it required.
          </p>
        ) : null}

        <div>
          <p className="font-mono text-label uppercase text-muted-foreground">Sample answers</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {document.fields.map((field) => (
              <AnswerControl
                key={field.key}
                field={field}
                value={answers[field.key] ?? (field.type === "multi_select" ? [] : "")}
                onChange={(value) => set(field.key, value)}
              />
            ))}
          </div>
          {document.fields.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No fields yet.</p>
          ) : null}
        </div>

        {hasRules ? (
          <>
            <div>
              <p className="font-mono text-label uppercase text-muted-foreground">Result</p>
              <p className="mt-2 text-sm text-foreground">{inspection.summary}</p>

              {inspection.degraded ? (
                <p className="mt-2 text-sm text-destructive">{inspection.degraded}</p>
              ) : null}

              {inspection.reordered ? (
                <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
                  The rules did not run in the order they are written. A rule that
                  reads a field another rule can hide has to run after it, so they
                  are ordered by what they depend on. That order is below.
                </p>
              ) : null}

              {inspection.answeredWhileHidden.length > 0 ? (
                <p className="mt-2 max-w-[68ch] text-sm text-foreground">
                  <span className="font-medium">Kept, not asked: </span>
                  {inspection.answeredWhileHidden.map((key) => `“${key}”`).join(", ")}{" "}
                  {inspection.answeredWhileHidden.length === 1 ? "has" : "have"} an
                  answer while hidden. Nothing is discarded — the value is still
                  posted and still stored, and the submission carries a warning
                  saying the form did not ask for it.
                </p>
              ) : null}
            </div>

            <div>
              <p className="font-mono text-label uppercase text-muted-foreground">
                What ran, in order
              </p>
              <ol className="mt-3 grid gap-2.5">
                {inspection.rules.map((rule) => (
                  <li
                    key={rule.index}
                    className="min-w-0 rounded-md border border-border bg-sunken px-3.5 py-3"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-mono text-label uppercase text-muted-foreground">
                        {rule.position}. Rule {rule.index + 1}
                        {rule.label ? ` · ${rule.label}` : ""}
                      </span>
                      <StatusTag status={rule.status} />
                    </div>

                    <p className="mt-1.5 text-sm text-foreground">{rule.summary}</p>

                    {rule.skippedReason ? (
                      <p className="mt-2 text-sm text-destructive">{rule.skippedReason}</p>
                    ) : null}

                    {rule.conditions.length > 0 ? (
                      <ul className="mt-2.5 grid gap-1">
                        {rule.conditions.map((line, index) => (
                          <ConditionRow key={index} line={line} />
                        ))}
                      </ul>
                    ) : null}

                    {rule.effects.length > 0 ? (
                      <ul className="mt-2.5 grid gap-1">
                        {rule.effects.map((effect, index) => (
                          <li key={index} className="text-sm">
                            <span
                              className={
                                effect.applied
                                  ? "font-medium text-foreground"
                                  : "font-medium text-muted-foreground"
                              }
                            >
                              {effect.applied ? "Applied: " : "Did nothing: "}
                            </span>
                            <span className="font-mono text-muted-foreground">{effect.text}</span>
                            {effect.note ? (
                              <span className="text-muted-foreground"> — {effect.note}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          </>
        ) : null}

        <div>
          <p className="font-mono text-label uppercase text-muted-foreground">
            Where every field ended up
          </p>
          <ul className="mt-3 grid gap-2">
            {inspection.fields.map((field) => (
              <li
                key={field.key}
                className="min-w-0 rounded-md border border-border px-3.5 py-2.5"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-mono text-sm text-foreground">{field.key}</span>
                  <span
                    className={
                      field.visible
                        ? "font-mono text-label uppercase text-muted-foreground"
                        : "font-mono text-label uppercase text-destructive"
                    }
                  >
                    {field.visible ? "shown" : "hidden"}
                  </span>
                  <span className="font-mono text-label uppercase text-muted-foreground">
                    {field.required ? "required" : "optional"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {field.visibilityNote} {field.requirementNote}
                </p>
                {field.answeredWhileHidden ? (
                  <p className="mt-1 text-sm text-foreground">
                    Its answer — {field.answer.map((value) => `“${value}”`).join(", ")} — is
                    kept and stored anyway.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </PanelBody>
    </Panel>
  );
}

function StatusTag({ status }: { status: "matched" | "not_matched" | "skipped" }) {
  const text = status === "matched" ? "fired" : status === "skipped" ? "skipped" : "did not fire";
  return (
    <span
      className={
        status === "matched"
          ? "font-mono text-label uppercase text-foreground"
          : status === "skipped"
            ? "font-mono text-label uppercase text-destructive"
            : "font-mono text-label uppercase text-subtle-foreground"
      }
    >
      {text}
    </span>
  );
}

/**
 * One line of a rule's condition tree.
 *
 * The value read is shown beside every condition, because "`budget` is `50k+` —
 * read: nothing" is the entire explanation of most rules that did not fire, and
 * making somebody derive it from the answers above is making them do the work
 * this panel exists to do.
 */
function ConditionRow({ line }: { line: InspectedConditionLine }) {
  return (
    <li
      className="text-sm"
      style={{ paddingLeft: `${line.depth * 0.875}rem` }}
    >
      <span className={line.matched ? "text-foreground" : "text-subtle-foreground"}>
        {line.matched ? "✓" : "✕"}
      </span>{" "}
      <span className={cn("font-mono", line.matched ? "text-foreground" : "text-muted-foreground")}>
        {line.text}
      </span>
      {line.kind === "condition" ? (
        <span className="text-muted-foreground">
          {" — read: "}
          {line.read.length === 0 ? "nothing" : line.read.map((value) => `“${value}”`).join(", ")}
          {/* The note is a sentence elsewhere; inside the parentheses it is a
              clause, so the full stop comes off. */}
          {line.note ? ` (${line.note.replace(/\.$/, "")})` : ""}
        </span>
      ) : null}
    </li>
  );
}

function AnswerControl({
  field,
  value,
  onChange,
}: {
  field: SchemaField;
  value: string | string[];
  onChange: (value: string | string[]) => void;
}) {
  const label = field.label.trim() || field.key;

  if (field.type === "select") {
    return (
      <SelectField
        label={label}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">No answer</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
    );
  }

  if (field.type === "multi_select") {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="font-mono text-label uppercase text-muted-foreground">{label}</span>
        <div className="grid gap-1.5">
          {(field.options ?? []).map((option) => (
            <CheckboxField
              key={option.value}
              label={option.label}
              checked={chosen.includes(option.value)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...chosen, option.value]
                    : chosen.filter((entry) => entry !== option.value),
                )
              }
            />
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="font-mono text-label uppercase text-muted-foreground">{label}</span>
        <CheckboxField
          label="Ticked"
          checked={value === "on"}
          // "on" is what a browser posts for a ticked box with no value, so the
          // inspector is fed the same string the form would have sent.
          onChange={(event) => onChange(event.target.checked ? "on" : "")}
        />
      </div>
    );
  }

  return (
    <TextField
      label={label}
      value={typeof value === "string" ? value : ""}
      mono
      inputMode={field.type === "number" ? "decimal" : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
