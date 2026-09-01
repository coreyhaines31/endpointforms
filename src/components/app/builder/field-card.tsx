"use client";

import { ArrowDown, ArrowUp, ChevronRight, Plus, Trash2 } from "lucide-react";

import {
  CheckboxField,
  IconButton,
  IssueLine,
  QuietButton,
  SelectField,
  TextField,
} from "./inputs";
import {
  FIELD_TYPE_LABELS,
  FIELD_TYPE_ORDER,
  newDraftOption,
  suggestKey,
  type BuilderIssue,
  type DraftField,
  type DraftOption,
} from "./state";
import { isChoiceType, type FieldType } from "@/lib/schema/format";
import { cn } from "@/lib/utils";

/**
 * One field, open for editing (#35).
 *
 * ## Which controls appear is decided by the format, not by taste
 *
 * A `select` gets an options editor and no pattern box. A `number` gets min,
 * max and step and no minLength. A `date` gets min and max as dates. That is
 * not a design preference — it is `nativeConstraints()` in
 * `src/lib/render/controls.ts` read back to front. That function decides which
 * constraints a browser will actually enforce for a given type and drops the
 * rest, so a box the builder shows for a constraint the renderer will discard
 * is a rule the person believes they wrote and does not have. Every constraint
 * offered here is one that survives to the page and to the tool definition.
 *
 * ## The key gets the loudest treatment on the card
 *
 * It is the HTML `name` attribute, the column in an export, and the argument
 * name in the agent-callable tool. Every other property on this card is a
 * caption; this one is the contract. So it is monospaced, it is first, and
 * changing it after publication says out loud what that breaks.
 */

export type FieldCardProps = {
  field: DraftField;
  index: number;
  total: number;
  issues: BuilderIssue[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<DraftField>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  /** Ids are minted by the builder so they stay unique across the whole draft. */
  mintId: () => string;
};

export function FieldCard({
  field,
  index,
  total,
  issues,
  expanded,
  onToggle,
  onChange,
  onMove,
  onRemove,
  mintId,
}: FieldCardProps) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  // A card with an error is always open. Collapsing the thing somebody has to
  // fix, and then reporting the count somewhere else, is how a form builder
  // gets a reputation for hiding its own mistakes.
  const open = expanded || errors.length > 0;
  const bodyId = `${field.id}-body`;

  return (
    <li
      className={cn(
        // `min-w-0` is load-bearing, not tidiness. A grid item's default
        // `min-width: auto` refuses to shrink below its own min-content, so
        // without it the widest card's header sets the width of the whole list
        // and the page scrolls sideways on a phone.
        "min-w-0 rounded-lg border bg-card",
        errors.length > 0 ? "border-destructive" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {field.label.trim() || field.key.trim() || "Untitled field"}
          </span>
          <span className="shrink-0 font-mono text-label uppercase text-subtle-foreground">
            {FIELD_TYPE_LABELS[field.type]}
          </span>
          {/* Dropped on a narrow screen. Both chips are `shrink-0`, so on a
              phone they were spending 62px of a 174px row to say "required"
              and truncating "Your name" to "You…" to afford it. The label is
              the only thing on this row somebody is scanning for; the rule is
              still stated inside the card and as an asterisk in the preview. */}
          {field.required ? (
            <span className="hidden shrink-0 font-mono text-label uppercase text-muted-foreground sm:inline">
              required
            </span>
          ) : null}
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            label={`Move "${describe(field)}" up`}
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </IconButton>
          <IconButton
            label={`Move "${describe(field)}" down`}
            disabled={index === total - 1}
            onClick={() => onMove(index + 1)}
          >
            <ArrowDown aria-hidden="true" className="size-4" />
          </IconButton>
          <IconButton
            label={`Remove "${describe(field)}"`}
            onClick={onRemove}
            className="hover:border-destructive hover:text-destructive"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </IconButton>
        </div>
      </div>

      <div id={bodyId} hidden={!open} className="border-t border-border px-3 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Field name"
            value={field.key}
            mono
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            invalid={errors.length > 0}
            onChange={(event) => onChange({ key: event.target.value })}
            hint={
              <>
                The HTML <code className="font-mono">name</code>, the export column,
                and the tool&rsquo;s argument.
              </>
            }
          />

          <TextField
            label="Label"
            value={field.label}
            onChange={(event) => {
              const label = event.target.value;
              // Fills an empty name from the label and never touches one that
              // has been typed. The key is the contract with somebody's
              // existing markup; quietly rewriting it is the one thing this
              // screen must not do.
              onChange(
                field.key.trim() === ""
                  ? { label, key: suggestKey(label) }
                  : { label },
              );
            }}
            hint="What a person reads above the control."
          />

          <SelectField
            label="Type"
            value={field.type}
            onChange={(event) => onChange(retype(field, event.target.value as FieldType))}
          >
            {FIELD_TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {FIELD_TYPE_LABELS[type]}
              </option>
            ))}
          </SelectField>

          {field.type === "hidden" ? null : (
            <TextField
              label="Placeholder"
              value={field.placeholder}
              onChange={(event) => onChange({ placeholder: event.target.value })}
              hint="Disappears as soon as somebody types. Anything they need to keep reading belongs in the help text."
            />
          )}

          <div className="sm:col-span-2">
            <TextField
              label="Help text"
              value={field.help}
              onChange={(event) => onChange({ help: event.target.value })}
              hint="Stays on screen once the field is filled in."
            />
          </div>

          <div className="sm:col-span-2">
            <CheckboxField
              label="Required"
              checked={field.required}
              onChange={(event) => onChange({ required: event.target.checked })}
              hint={
                field.type === "multi_select"
                  ? "Enforced on the server. A group of checkboxes cannot carry the browser's own required attribute — it would demand every box be ticked."
                  : "Enforced by the browser and again on the server."
              }
            />
          </div>
        </div>

        {isChoiceType(field.type) ? (
          <OptionsEditor
            field={field}
            onChange={onChange}
            mintId={mintId}
            invalid={errors.length > 0}
          />
        ) : null}

        <Constraints field={field} onChange={onChange} />

        {errors.length > 0 || warnings.length > 0 ? (
          <div className="mt-4 grid gap-1.5 border-t border-border pt-3">
            {errors.map((issue, i) => (
              <IssueLine key={`e${i}`} severity="error">
                {issue.message}
              </IssueLine>
            ))}
            {warnings.map((issue, i) => (
              <IssueLine key={`w${i}`} severity="warning">
                {issue.message}
              </IssueLine>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function describe(field: DraftField): string {
  return field.label.trim() || field.key.trim() || "this field";
}

/**
 * Switching a field's type.
 *
 * Options are kept when moving between the two choice types and cleared when
 * moving away from them, because the format refuses options on a type that
 * does not take them — and a field that silently will not save, with the
 * offending data invisible because its editor is no longer shown, is the worst
 * kind of stuck. A choice type arriving with nothing gets two empty rows, since
 * "needs at least one option" is more useful as two boxes than as a sentence.
 */
function retype(field: DraftField, type: FieldType): Partial<DraftField> {
  if (type === field.type) return {};

  if (!isChoiceType(type)) return { type, options: [] };

  if (field.options.length > 0) return { type, options: field.options };

  return {
    type,
    options: [
      newDraftOption(`${field.id}-o-a`),
      newDraftOption(`${field.id}-o-b`),
    ],
  };
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

function OptionsEditor({
  field,
  onChange,
  mintId,
  invalid,
}: {
  field: DraftField;
  onChange: (patch: Partial<DraftField>) => void;
  mintId: () => string;
  invalid: boolean;
}) {
  const update = (id: string, patch: Partial<DraftOption>) =>
    onChange({
      options: field.options.map((option) =>
        option.id === id ? { ...option, ...patch } : option,
      ),
    });

  return (
    <fieldset className="mt-5 min-w-0 border-0 p-0">
      <legend className="font-mono text-label uppercase text-muted-foreground">
        Options
      </legend>
      <p className="mt-1.5 text-sm text-muted-foreground">
        The value is what gets posted and stored. The label is what a person picks.
        Leave the label blank and the value stands in for it.
      </p>

      <ul className="mt-3 grid gap-2">
        {field.options.map((option, index) => (
          <li key={option.id} className="flex items-end gap-2">
            <TextField
              label={`Value ${index + 1}`}
              value={option.value}
              mono
              spellCheck={false}
              invalid={invalid && option.value.trim() === ""}
              onChange={(event) => update(option.id, { value: event.target.value })}
              className="flex-1"
            />
            <TextField
              label={`Label ${index + 1}`}
              value={option.label}
              onChange={(event) => update(option.id, { label: event.target.value })}
              className="flex-1"
            />
            <IconButton
              label={`Remove option ${index + 1}`}
              onClick={() =>
                onChange({
                  options: field.options.filter((entry) => entry.id !== option.id),
                })
              }
              className="mb-0.5 hover:border-destructive hover:text-destructive"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>

      <QuietButton
        className="mt-3"
        onClick={() => onChange({ options: [...field.options, newDraftOption(mintId())] })}
      >
        <Plus aria-hidden="true" className="size-4" />
        Add option
      </QuietButton>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

/**
 * The per-type constraints, and only the ones that survive to the page.
 *
 * `pattern` appears for text, email and phone and nowhere else, because
 * `controls.ts` only ever puts it on those: on a `<textarea>` or a
 * `type="number"` the attribute is not merely ignored, it is invalid, and
 * emitting it would put a rule in the DOM that nothing enforces.
 */
function Constraints({
  field,
  onChange,
}: {
  field: DraftField;
  onChange: (patch: Partial<DraftField>) => void;
}) {
  const rows: React.ReactNode[] = [];

  if (TEXTUAL.has(field.type)) {
    rows.push(
      <TextField
        key="minLength"
        label="Min length"
        value={field.minLength}
        inputMode="numeric"
        placeholder="—"
        onChange={(event) => onChange({ minLength: event.target.value })}
      />,
      <TextField
        key="maxLength"
        label="Max length"
        value={field.maxLength}
        inputMode="numeric"
        placeholder="—"
        onChange={(event) => onChange({ maxLength: event.target.value })}
      />,
    );
  }

  if (PATTERNABLE.has(field.type)) {
    rows.push(
      <div key="pattern" className="sm:col-span-2">
        <TextField
          label="Pattern"
          value={field.pattern}
          mono
          spellCheck={false}
          placeholder="[A-Z]{2}[0-9]{4}"
          onChange={(event) => onChange({ pattern: event.target.value })}
          hint="A regular expression, anchored at both ends the way the browser anchors one."
        />
      </div>,
    );
  }

  if (field.type === "number") {
    rows.push(
      <TextField
        key="min"
        label="Minimum"
        value={field.min}
        inputMode="decimal"
        placeholder="—"
        onChange={(event) => onChange({ min: event.target.value })}
      />,
      <TextField
        key="max"
        label="Maximum"
        value={field.max}
        inputMode="decimal"
        placeholder="—"
        onChange={(event) => onChange({ max: event.target.value })}
      />,
      <TextField
        key="step"
        label="Step"
        value={field.step}
        inputMode="decimal"
        placeholder="—"
        onChange={(event) => onChange({ step: event.target.value })}
        hint="A whole-number step also tells a phone to open its number pad without a decimal point."
      />,
    );
  }

  if (field.type === "date") {
    rows.push(
      <TextField
        key="min"
        label="Earliest"
        type="date"
        value={field.min}
        onChange={(event) => onChange({ min: event.target.value })}
      />,
      <TextField
        key="max"
        label="Latest"
        type="date"
        value={field.max}
        onChange={(event) => onChange({ max: event.target.value })}
      />,
    );
  }

  if (field.type === "multi_select") {
    rows.push(
      <TextField
        key="minSelected"
        label="Pick at least"
        value={field.minSelected}
        inputMode="numeric"
        placeholder="—"
        onChange={(event) => onChange({ minSelected: event.target.value })}
      />,
      <TextField
        key="maxSelected"
        label="Pick at most"
        value={field.maxSelected}
        inputMode="numeric"
        placeholder="—"
        onChange={(event) => onChange({ maxSelected: event.target.value })}
      />,
    );
  }

  if (rows.length === 0) return null;

  return (
    <fieldset className="mt-5 min-w-0 border-0 p-0">
      <legend className="font-mono text-label uppercase text-muted-foreground">
        Rules
      </legend>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Left blank, nothing is enforced. Whatever is set here is checked by the
        browser, checked again on the server, and published in the agent tool.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{rows}</div>
    </fieldset>
  );
}

/** Mirrors the `takesLength` branch of `nativeConstraints()`. */
const TEXTUAL = new Set<FieldType>(["text", "textarea", "email", "phone"]);

/** Mirrors `PATTERNABLE` in `src/lib/render/controls.ts`. */
const PATTERNABLE = new Set<FieldType>(["text", "email", "phone"]);
