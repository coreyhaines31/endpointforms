"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * The builder's own controls.
 *
 * Small and deliberately dull. `src/components/app/forms.tsx` already owns the
 * app's form vocabulary, but every control in it is sized for a page with four
 * fields on it — an 11-unit-tall input with a 20px gap under its label. The
 * builder puts eight controls inside one card and then repeats that card once
 * per field, so it needs the same tokens at a denser rhythm. These are that,
 * and nothing else: same border, same focus ring, same disabled treatment.
 *
 * ## The `cn()` trap, again
 *
 * `cn()` runs `twMerge`, which reads our custom size tokens (`text-label`,
 * `text-h4`) as *colours* and silently drops one when a colour class sits
 * beside it. It has cost this codebase four bugs. Every class string here that
 * pairs a size token with a colour is written out literally and never passed
 * through `cn()`; `cn()` is used only where the classes being merged are
 * genuinely colours or layout.
 */

const FIELD_CLASS =
  "w-full min-w-0 rounded-md border border-border-control bg-card px-2.5 py-2 text-sm text-foreground placeholder:text-subtle-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60";

/** The mono uppercase caption the app uses for a field's name. docs/03 §6. */
export function EditorLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="font-mono text-label uppercase text-muted-foreground"
    >
      {children}
    </label>
  );
}

export function TextField({
  label,
  hint,
  invalid,
  mono,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: React.ReactNode;
  invalid?: boolean;
  mono?: boolean;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <EditorLabel htmlFor={id}>{label}</EditorLabel>
      <input
        id={id}
        aria-describedby={hintId}
        aria-invalid={invalid || undefined}
        {...props}
        className={cn(
          FIELD_CLASS,
          mono && "font-mono",
          invalid && "border-destructive",
        )}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <EditorLabel htmlFor={id}>{label}</EditorLabel>
      <textarea
        id={id}
        aria-describedby={hintId}
        {...props}
        className={cn(FIELD_CLASS, "resize-y font-mono")}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A select with our own chevron.
 *
 * `appearance-none` then a drawn arrow, for the reason `forms.tsx` gives: the
 * browser pins the native arrow a fixed distance from the border, so padding
 * cannot make room beside it. The chevron is decorative and pointer-transparent;
 * the `<select>` keeps every bit of its keyboard behaviour.
 */
export function SelectField({
  label,
  children,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
}) {
  const id = useId();

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <EditorLabel htmlFor={id}>{label}</EditorLabel>
      <div className="relative">
        <select
          id={id}
          {...props}
          className={cn(FIELD_CLASS, "appearance-none pr-9")}
        >
          {children}
        </select>
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
        >
          <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}

export function CheckboxField({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        aria-describedby={hintId}
        {...props}
        className="mt-0.5 size-4 shrink-0 accent-signal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm text-foreground">
          {label}
        </label>
        {hint ? (
          <p id={hintId} className="mt-0.5 text-sm text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A small square button carrying an icon and nothing else.
 *
 * `label` is required rather than optional because it is the only name this
 * button has. An icon button with no accessible name is a button a screen
 * reader announces as "button", and the row it sits in has six of them.
 */
export function IconButton({
  label,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-border-control hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A quiet, text-weight button. The app's second-tier action everywhere. */
export function QuietButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border-control px-3 text-sm font-medium text-foreground transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * An error or a warning about one field, said in a sentence.
 *
 * The distinction is load-bearing and the colour alone must not carry it: an
 * error blocks publishing, a warning does not, and somebody who cannot tell
 * red from amber has to be able to read which is which. So each one names
 * itself in words as well.
 */
export function IssueLine({
  severity,
  children,
}: {
  severity: "error" | "warning";
  children: React.ReactNode;
}) {
  return (
    <p
      className={
        severity === "error"
          ? "text-sm text-destructive"
          : "text-sm text-muted-foreground"
      }
    >
      <span
        className={
          severity === "error"
            ? "font-medium text-destructive"
            : "font-medium text-foreground"
        }
      >
        {severity === "error" ? "Error: " : "Heads up: "}
      </span>
      {children}
    </p>
  );
}
