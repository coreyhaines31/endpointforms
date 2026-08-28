"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  defaultsFor,
  formatNumber,
  readInputs,
  type FieldSpec,
  type Inputs,
} from "@/lib/tools/engine";
import { cn } from "@/lib/utils";

/**
 * Holds one calculator's inputs.
 *
 * Raw values stay strings so an empty box stays empty instead of snapping to
 * zero under the cursor. Coercion, clamping and every guard against NaN live in
 * `readInputs`, which is pure and tested.
 *
 * SEAM: when Endpoint exists, this hook is what the form runtime replaces. The
 * `FieldSpec[]` it takes is already the shape of a form definition, and the
 * compute functions downstream never see React at all.
 */
export function useToolInputs(fields: FieldSpec[]) {
  const initial = useMemo(() => defaultsFor(fields), [fields]);
  const [raw, setRaw] = useState<Record<string, string>>(initial);

  const set = useCallback((key: string, value: string) => {
    setRaw((current) => ({ ...current, [key]: value }));
  }, []);

  const reset = useCallback(() => setRaw(initial), [initial]);

  const { values, clamped } = useMemo(() => readInputs(fields, raw), [fields, raw]);

  const pristine = useMemo(
    () => fields.every((field) => raw[field.key] === initial[field.key]),
    [fields, raw, initial],
  );

  return { raw, values: values as Inputs, clamped, set, reset, pristine };
}

const unitPrefix: Record<FieldSpec["unit"], string | null> = {
  currency: "$",
  percent: null,
  count: null,
  minutes: null,
  days: null,
};

const unitSuffix: Record<FieldSpec["unit"], string | null> = {
  currency: null,
  percent: "%",
  count: null,
  minutes: "min",
  days: "days",
};

type FieldProps = {
  spec: FieldSpec;
  value: string;
  clamped: boolean;
  onChange: (key: string, value: string) => void;
};

export function Field({ spec, value, clamped, onChange }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const prefix = unitPrefix[spec.unit];
  const suffix = unitSuffix[spec.unit];
  const describedBy = spec.help || clamped ? helpId : undefined;

  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {spec.label}
      </label>

      <div
        className={cn(
          "mt-2 flex h-11 items-center rounded-md border bg-card focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
          clamped ? "border-destructive" : "border-border-control",
        )}
      >
        {prefix ? (
          <span
            aria-hidden="true"
            className="pl-3 font-mono text-sm text-muted-foreground"
          >
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          value={value}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={describedBy}
          onChange={(event) => onChange(spec.key, event.target.value)}
          className="tabular h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-base text-foreground outline-none"
        />
        {suffix ? (
          <span
            aria-hidden="true"
            className="pr-3 font-mono text-sm text-muted-foreground"
          >
            {suffix}
          </span>
        ) : null}
      </div>

      {describedBy ? (
        <p id={helpId} className="mt-2 text-sm text-muted-foreground">
          {clamped ? (
            <span className="text-destructive">
              This box only takes numbers between {formatNumber(spec.min)} and{" "}
              {formatNumber(spec.max)}, so that is what the result is using.{" "}
            </span>
          ) : null}
          {spec.help}
        </p>
      ) : null}
    </div>
  );
}

type FieldsetProps = {
  legend: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
};

export function Fieldset({ legend, hint, children, className }: FieldsetProps) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="font-mono text-label uppercase text-muted-foreground">
        {legend}
      </legend>
      {hint ? <p className="mt-3 text-sm text-muted-foreground">{hint}</p> : null}
      <div className="mt-5 grid grid-cols-1 gap-6">{children}</div>
    </fieldset>
  );
}

export function ResetButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-md border border-border-control px-3 py-2 text-sm text-foreground transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
    >
      <RotateCcw className="size-3.5" aria-hidden="true" />
      Reset to the example
    </button>
  );
}

/**
 * The calculator frame. Inputs on the left, live result on the right, and a
 * single live region so a screen reader hears the answer change rather than
 * having to go looking for it.
 */
export function CalculatorFrame({
  inputs,
  result,
  onReset,
  pristine,
}: {
  inputs: React.ReactNode;
  result: React.ReactNode;
  onReset: () => void;
  pristine: boolean;
}) {
  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-8">
        {inputs}
        <div>
          <ResetButton onClick={onReset} disabled={pristine} />
        </div>
      </div>

      <output
        aria-live="polite"
        className="block min-w-0 border-t border-border pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0"
      >
        {result}
      </output>
    </form>
  );
}

export type ToolForm = ReturnType<typeof useToolInputs>;

/** A labelled group of fields, picked out of a tool's schema by key. */
export function FieldGroup({
  legend,
  hint,
  specs,
  keys,
  form,
}: {
  legend: string;
  hint?: string;
  specs: FieldSpec[];
  keys: string[];
  form: ToolForm;
}) {
  const chosen = keys
    .map((key) => specs.find((spec) => spec.key === key))
    .filter((spec): spec is FieldSpec => Boolean(spec));

  return (
    <Fieldset legend={legend} hint={hint}>
      {chosen.map((spec) => (
        <Field
          key={spec.key}
          spec={spec}
          value={form.raw[spec.key] ?? ""}
          clamped={form.clamped.includes(spec.key)}
          onChange={form.set}
        />
      ))}
    </Fieldset>
  );
}
