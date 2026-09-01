"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { IconButton, IssueLine, QuietButton, TextAreaField, TextField } from "./inputs";
import type { DraftField } from "./state";
import {
  DEFAULT_PARTIAL_NOTICE,
  MAX_NOTICE_CHARS,
  MAX_STEPS,
  type FormStep,
} from "@/lib/steps/format";

/**
 * Splitting a form into screens (#37).
 *
 * ## The panel says what the feature costs, at the top, before anything else
 *
 * Turning a form into four screens is not only a layout choice: it means the
 * answers on screens one to three are kept and shown to you even when nobody
 * reaches screen four, and it means every visitor is told so. There is no
 * switch for the second half — see `src/lib/steps/format.ts` for why a switch
 * would have been a lie — so the honest thing is to put the consequence in
 * front of the person choosing, not in a help article behind it.
 *
 * The wording of what the visitor reads is editable right here rather than in a
 * settings screen, for the same reason: the sentence is a consequence of the
 * control above it and belongs next to it.
 *
 * ## Fields are assigned, not moved
 *
 * A step names field keys; the fields themselves stay in one list, in one
 * order, edited in one place. So this panel never moves a field — it only says
 * which screen asks for it, and a field it says nothing about still gets asked,
 * on the last screen. That is deliberate: the likeliest mistake here is
 * forgetting to assign something, and the cost of that has to be a question in
 * a slightly odd place rather than a question that silently stopped being
 * asked.
 *
 * ## The `cn()` trap
 *
 * `cn()` runs `twMerge`, which reads `text-label` as a colour and drops one
 * when a colour class sits beside it. Class strings here are written out
 * literally and never merged.
 */

export function StepsPanel({
  steps,
  fields,
  notice,
  onChange,
  onNoticeChange,
}: {
  steps: FormStep[];
  fields: DraftField[];
  notice: string;
  onChange: (steps: FormStep[]) => void;
  onNoticeChange: (notice: string) => void;
}) {
  // Hidden fields are not questions and never appear on a screen, so they are
  // not offered for assignment. `planSteps` carries them from the first screen
  // regardless of what is said here.
  const askable = fields.filter((field) => field.type !== "hidden" && field.key.trim() !== "");
  const assigned = new Map<string, string>();
  for (const step of steps) {
    for (const key of step.fields) {
      if (!assigned.has(key)) assigned.set(key, step.id);
    }
  }

  // What a screen is called when another screen mentions it. The heading if it
  // has one, its position otherwise — never the raw id, which is an internal
  // handle that means nothing to the person reading it.
  const nameOf = new Map(
    steps.map((step, index) => [
      step.id,
      (step.title ?? "").trim() || `screen ${index + 1}`,
    ]),
  );

  const unassigned = askable.filter((field) => !assigned.has(field.key));
  const lastAsking = [...steps].reverse().find((step) => step.fields.length > 0) ?? steps[steps.length - 1];

  const update = (index: number, next: FormStep) =>
    onChange(steps.map((step, i) => (i === index ? next : step)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    const [held] = next.splice(index, 1);
    next.splice(target, 0, held!);
    onChange(next);
  };

  const add = () => {
    if (steps.length >= MAX_STEPS) return;
    onChange([...steps, { id: mintStepId(steps), title: "", description: "", fields: [] }]);
  };

  return (
    <Panel>
      <PanelHeader
        title="Screens"
        description="One screen, or several. A form with no screens below is a single page, which is what every form here is by default."
        action={
          <QuietButton onClick={add} disabled={steps.length >= MAX_STEPS}>
            <Plus className="size-4" aria-hidden />
            Add a screen
          </QuietButton>
        }
      />

      <PanelBody className="grid gap-5">
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Split this form into screens and it starts keeping what people fill in
            before they finish — the ones who answer two screens and leave become
            rows you can see, under{" "}
            <span className="text-foreground">Unfinished</span> in the inbox. That
            is the trade, and it runs both ways: every visitor is told their
            answers are saved as they go, on every screen, and that notice cannot
            be switched off.
          </p>
        ) : (
          <>
            {/* Said once, at the top, where somebody is deciding — not at the
                bottom where it reads as a disclaimer. */}
            <div className="rounded-md border border-border bg-sunken px-3.5 py-3">
              <p className="text-sm text-foreground">
                This form keeps unfinished answers.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Somebody who completes a screen and leaves becomes a row under
                Unfinished in your inbox. They are never counted as a submission
                and never reach Yield. Every visitor reads the sentence below,
                on every screen.
              </p>
            </div>

            {steps.map((step, index) => (
              <StepCard
                key={step.id}
                step={step}
                index={index}
                total={steps.length}
                fields={askable}
                assigned={assigned}
                nameOf={nameOf}
                inheritsUnassigned={
                  lastAsking?.id === step.id && unassigned.length > 0
                }
                unassigned={unassigned.map((field) => field.label || field.key)}
                onChange={(next) => update(index, next)}
                onRemove={() => onChange(steps.filter((_, i) => i !== index))}
                onMove={(delta) => move(index, delta)}
              />
            ))}

            <TextAreaField
              label="What visitors are told"
              rows={4}
              maxLength={MAX_NOTICE_CHARS}
              value={notice}
              placeholder={DEFAULT_PARTIAL_NOTICE}
              onChange={(event) => onNoticeChange(event.target.value)}
              hint={
                notice.trim() === "" ? (
                  <>
                    Shown under the buttons on every screen. Left empty, visitors
                    read the greyed-out sentence here — the notice can be
                    reworded and cannot be removed.
                  </>
                ) : (
                  <>Shown under the buttons on every screen, in your words.</>
                )
              }
            />
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

function StepCard({
  step,
  index,
  total,
  fields,
  assigned,
  nameOf,
  inheritsUnassigned,
  unassigned,
  onChange,
  onRemove,
  onMove,
}: {
  step: FormStep;
  index: number;
  total: number;
  fields: DraftField[];
  assigned: Map<string, string>;
  nameOf: Map<string, string>;
  inheritsUnassigned: boolean;
  unassigned: string[];
  onChange: (step: FormStep) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const toggle = (key: string, on: boolean) =>
    onChange({
      ...step,
      fields: on ? [...step.fields, key] : step.fields.filter((entry) => entry !== key),
    });

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-start justify-between gap-3 border-b border-border px-3.5 py-3">
        <p className="font-mono text-label uppercase text-muted-foreground">
          Screen {index + 1} of {total}
        </p>
        <div className="flex gap-1">
          <IconButton label="Move up" onClick={() => onMove(-1)} disabled={index === 0}>
            <ArrowUp className="size-4" aria-hidden />
          </IconButton>
          <IconButton
            label="Move down"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
          >
            <ArrowDown className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Remove this screen" onClick={onRemove}>
            <Trash2 className="size-4" aria-hidden />
          </IconButton>
        </div>
      </div>

      <div className="grid gap-4 px-3.5 py-4">
        <TextField
          label="Heading"
          value={step.title ?? ""}
          placeholder="Optional"
          onChange={(event) => onChange({ ...step, title: event.target.value })}
        />
        <TextField
          label="Sentence under the heading"
          value={step.description ?? ""}
          placeholder="Optional"
          onChange={(event) => onChange({ ...step, description: event.target.value })}
        />

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-foreground">Asks for</legend>
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This form has no questions yet.
            </p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {fields.map((field) => {
                const owner = assigned.get(field.key);
                const mine = owner === step.id;
                const taken = owner !== undefined && !mine;
                return (
                  <label
                    key={field.id}
                    className={`flex items-center gap-2 text-sm ${
                      taken ? "text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={mine}
                      disabled={taken}
                      onChange={(event) => toggle(field.key, event.target.checked)}
                      className="size-4 accent-signal"
                    />
                    <span className="truncate">{field.label || field.key}</span>
                    {/* Says where it went rather than only greying out. A
                        disabled checkbox with no reason beside it is the thing
                        somebody files a bug about. */}
                    {taken ? (
                      <span className="shrink-0 text-muted-foreground">
                        · on {nameOf.get(owner!) ?? owner}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        {inheritsUnassigned ? (
          <IssueLine severity="warning">
            {unassigned.length === 1
              ? `${unassigned[0]} is on no screen, so it is asked here, last.`
              : `${unassigned.length} questions are on no screen, so they are asked here, last: ${unassigned.join(", ")}.`}
          </IssueLine>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A new screen's id.
 *
 * Stable and never reused, because a stored partial records the screen it
 * reached *by id*: reusing `s2` for a different screen would make an old row
 * claim a visitor answered questions they never saw. So the counter walks past
 * anything already taken rather than filling a gap left by a deletion.
 */
function mintStepId(steps: readonly FormStep[]): string {
  const taken = new Set(steps.map((step) => step.id));
  let n = steps.length + 1;
  while (taken.has(`s${n}`)) n += 1;
  return `s${n}`;
}
