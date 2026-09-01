import type { FieldOption, FormSchemaDocument, SchemaField } from "@/lib/schema/format";
import type { IssueCode } from "@/lib/schema/validate";
import {
  autoCompleteFor,
  controlKind,
  inputMode,
  inputType,
  nativeConstraints,
} from "@/lib/render/controls";
import { summaryTitle, visitorMessage } from "@/lib/render/messages";
import { summarizeFieldRules } from "@/lib/rules/describe";
import {
  FIELD_ATTRIBUTE,
  FORM_ATTRIBUTE,
  REQUIRED_MARK_ATTRIBUTE,
} from "@/lib/rules/attributes";
import { FormRules } from "./form-rules";
import { endpointHoneypotFields, honeypotInputProps } from "@/lib/spam/honeypot";
import { DEFAULT_FONT_STACK, type FormTheme } from "@/lib/render/theme";

/**
 * The hosted form (#28).
 *
 * ## The property everything else is subordinate to
 *
 * **This page submits with JavaScript disabled.** A real `<form method="post">`,
 * real `<input>`s, real `required`, and errors that arrive as a re-rendered
 * page rather than as a state update. There is exactly one Client Component
 * beneath this file — see the note on conditional logic below — it renders no
 * markup, and nothing on the page depends on it having run. A lead-capture page that needs scripting is a
 * page that quietly loses the leads of everyone whose script did not run — a
 * blocked CDN, a corporate proxy, a flaky connection on a phone — and those
 * leads were paid for at the same price as the ones that worked.
 *
 * ## Honest markup is also the agent surface
 *
 * `<label for>`, `<fieldset>`/`<legend>`, `type`, `autocomplete`, `aria-invalid`
 * and `aria-describedby` are here for a screen reader and for a browser agent
 * reading the accessibility tree, which are much more nearly the same consumer
 * than they look. A form assembled from `div`s with click handlers is invisible
 * to both. #32 publishes a machine-callable surface from the same schema, and
 * it can only claim the two describe the same form if this one is real markup.
 *
 * ## The twMerge trap
 *
 * `cn()` runs `twMerge`, which reads our custom size tokens (`text-label`,
 * `text-h2`) as *colours* and drops one when a colour class sits beside it. See
 * `src/components/prose.tsx`. Class strings in this file are therefore written
 * out literally and never merged.
 *
 * ## Conditional logic, and the one client component below this file
 *
 * A form with rules (#36) renders `<FormRules>`, which is a Client Component
 * that draws **nothing**. It hides rows whose rules say they are not being
 * asked, and it never removes a value: the controls stay in the DOM and are
 * still submitted, so the payload the server receives is identical whether or
 * not the script ran. With scripting off the page is exactly what it always
 * was — every field visible, every answer postable — and the rules run where
 * they always run, on the server. See `form-rules.tsx`.
 *
 * The `required` attribute is emitted **only for fields that are required
 * whatever anybody answers**. A field a rule can stop asking for carries no
 * `required` in the markup, because with scripting off it is on screen and the
 * browser would demand an answer the server does not want. That same predicate
 * — `summarizeFieldRules(...).alwaysRequired` — decides whether the field
 * appears in the agent tool's `required` array, and it has to: it is one
 * question, and asking it in two places is how two surfaces drift.
 */

export type FieldError = { field: string | null; code: IssueCode };

export type FormViewProps = {
  document: FormSchemaDocument;
  title: string;
  /** Where the form posts. */
  action: string;
  /** Where a successful submission lands, as the ingest path's `_redirect`. */
  redirectTo: string;
  theme: FormTheme;
  errors: FieldError[];
  /** What the visitor typed last time, when they are seeing this again. */
  values: Record<string, string | string[]>;
  /** True when an answer was too large to carry back across the redirect. */
  truncated: boolean;
};

/**
 * Default values for every custom property the markup reads.
 *
 * Spread *before* the theme so an owner's colour wins, and expressed as
 * `var(--card)` rather than a literal so the untouched default still follows
 * the visitor's light or dark preference. A form that names its own colours has
 * named them for both.
 */
const THEME_DEFAULTS: Record<string, string> = {
  /**
   * The default face costs nothing to fetch, because it is already there.
   *
   * The root layout loads IBM Plex, which is a fair trade on a marketing page
   * and a bad one here: 60 KB of webfont on the critical path of a page whose
   * entire job is to be filled in, and *our* typeface on *someone else's*
   * enquiry form. See `theme.ts` for why no theme can ask for a webfont either.
   */
  "--form-font": DEFAULT_FONT_STACK,
  "--form-page": "var(--background)",
  "--form-bg": "var(--card)",
  "--form-fg": "var(--foreground)",
  "--form-muted": "var(--muted-foreground)",
  "--form-border": "var(--border)",
  "--form-border-control": "var(--border-control)",
  "--form-accent": "var(--signal)",
  "--form-accent-ink": "var(--signal-foreground)",
  "--form-accent-edge": "var(--signal-edge)",
  "--form-danger": "var(--destructive)",
  "--form-danger-surface": "var(--destructive-surface)",
  "--form-radius": "var(--radius)",
};

const CONTROL_CLASS =
  "w-full min-w-0 rounded-[var(--form-radius)] border border-[var(--form-border-control)] bg-[var(--form-bg)] px-3 py-2.5 text-base text-[var(--form-fg)] placeholder:text-[var(--form-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] aria-invalid:border-2 aria-invalid:border-[var(--form-danger)]";

export function FormView({
  document,
  title,
  action,
  redirectTo,
  theme,
  errors,
  values,
  truncated,
}: FormViewProps) {
  const style = {
    ...THEME_DEFAULTS,
    ...(theme.fontFamily === null ? {} : { "--form-font": theme.fontFamily }),
    ...theme.vars,
    // Set directly rather than through a utility class: Tailwind reads a
    // `font-[…]` arbitrary value as a weight, not a family, and silently drops it.
    fontFamily: "var(--form-font)",
  } as React.CSSProperties;

  // Indexed by key so a field can find its own error in one lookup, and ordered
  // by the schema so the summary reads top-to-bottom down the form rather than
  // in whatever order the validator happened to append.
  const errorByKey = new Map<string, IssueCode>();
  for (const error of errors) {
    if (error.field !== null && !errorByKey.has(error.field)) {
      errorByKey.set(error.field, error.code);
    }
  }

  const rendered = document.fields.map((field, index) => {
    const summary = summarizeFieldRules(document, field);
    return {
      field,
      index,
      id: `ef-f${index}`,
      error: errorByKey.get(field.key),
      // Required in the markup only when nothing can make it optional.
      alwaysRequired: summary.alwaysRequired,
      // Required under *some* answers: the mark exists but starts hidden, and
      // the enhancement turns it on when the rule that requires it fires.
      conditionallyRequired: !summary.alwaysRequired && (field.required || summary.requiredWhen.length > 0),
    };
  });

  // Any decoy whose name collides with a field this form really collects is
  // dropped rather than rendered: a trap that eats a customer's own data is
  // worse than no trap.
  const decoys = endpointHoneypotFields(document.fields.map((field) => field.key));

  const listed = rendered.filter((entry) => entry.error && entry.field.type !== "hidden");

  return (
    <main
      style={style}
      className="mx-auto flex w-full max-w-[34rem] flex-1 flex-col bg-[var(--form-page)] px-5 py-[clamp(2.5rem,7vw,4.5rem)] text-[var(--form-fg)]"
    >
      {/* `break-words` because the title is somebody else's string and can be a
          single unbroken token — an imported form is often named after the URL
          it came from. Without it a long one runs off the side of a phone,
          taking the page's horizontal scroll with it. */}
      <h1 className="text-h2 break-words text-balance">{title}</h1>

      {listed.length > 0 ? <ErrorSummary entries={listed} /> : null}

      {truncated ? (
        <p className="mt-4 text-sm text-[var(--form-muted)]">
          One of your longer answers was too large to carry back and has been cleared. Sorry —
          please write it again.
        </p>
      ) : null}

      <form method="post" action={action} className="mt-8" {...{ [FORM_ATTRIBUTE]: "" }}>
        {/* `_redirect` is the ingest path's own field for naming where a browser
            lands afterwards (`src/lib/ingest/respond.ts`). Setting it rather
            than relying on the fallback is what keeps a customer's hosted form
            off the marketing site's thank-you page. */}
        <input type="hidden" name="_redirect" value={redirectTo} />

        {/* The spam decoys (#31). Rendered here rather than in `src/lib/spam`
            because this is the only place that knows which field names the
            customer's own schema already uses — a decoy named `company_website`
            on a form that genuinely collects one would eat real data, so
            `endpointHoneypotFields` drops any that collide.

            Not `display:none`, not `type=hidden`, not `sr-only`. Any filler
            worth the name skips all three, and hiding it from a screen reader
            is how a real customer fills it in and is silently rejected. It is a
            laid-out element, off-canvas, out of the tab order, labelled with an
            instruction to leave it alone. See `src/lib/spam/honeypot.ts`. */}
        {decoys.map((name) => (
          <input key={name} {...honeypotInputProps(name)} />
        ))}

        <div className="grid gap-7">
          {rendered.map((entry) =>
            entry.field.type === "hidden" ? (
              <HiddenField key={entry.id} field={entry.field} values={values} />
            ) : (
              <FieldRow
                key={entry.id}
                id={entry.id}
                field={entry.field}
                error={entry.error}
                values={values}
                alwaysRequired={entry.alwaysRequired}
                conditionallyRequired={entry.conditionallyRequired}
              />
            ),
          )}
        </div>

        <button
          type="submit"
          className="mt-9 inline-flex h-12 w-full items-center justify-center rounded-[var(--form-radius)] bg-[var(--form-accent)] px-5 text-base font-medium text-[var(--form-accent-ink)] shadow-[inset_0_0_0_1px_var(--form-accent-edge)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:w-auto sm:min-w-[12rem]"
        >
          Submit
        </button>

        {/* Renders nothing. Present only when there is logic to run, so a form
            without rules ships not one byte of it. */}
        {(document.rules?.length ?? 0) > 0 ? <FormRules schema={document} /> : null}
      </form>
    </main>
  );
}

/**
 * The list of what went wrong, above the form.
 *
 * `autoFocus` renders the plain HTML `autofocus` attribute, which browsers act
 * on with scripting disabled — so focus lands here on the re-rendered page
 * without a line of JavaScript. It is on the summary rather than on the first
 * bad input deliberately: landing inside the form announces one error and hides
 * how many there are, while landing here reads the count, reads every message,
 * and offers a link straight to each field.
 */
function ErrorSummary({
  entries,
}: {
  entries: { id: string; field: SchemaField; error: IssueCode | undefined }[];
}) {
  return (
    <div
      role="alert"
      tabIndex={-1}
      autoFocus
      className="mt-6 rounded-[var(--form-radius)] border-2 border-[var(--form-danger)] bg-[var(--form-danger-surface)] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--form-danger)]"
    >
      <h2 className="text-h4 text-[var(--form-fg)]">{summaryTitle(entries.length)}</h2>
      <ul className="mt-3 grid gap-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${anchorFor(entry.id, entry.field)}`}
              className="text-base font-medium text-[var(--form-danger)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--form-danger)]"
            >
              {visitorMessage(entry.error!, entry.field)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Where a summary link points.
 *
 * A `<fieldset>` is not focusable, so a link to a checkbox group's wrapper would
 * scroll to it and leave focus behind on the link. Pointing at the group's first
 * checkbox puts the caret where the visitor has to act.
 */
function anchorFor(id: string, field: SchemaField): string {
  return controlKind(field) === "checkbox-group" ? `${id}-o0` : id;
}

function HiddenField({
  field,
  values,
}: {
  field: SchemaField;
  values: Record<string, string | string[]>;
}) {
  // The format has nowhere to declare what a hidden field should hold, so the
  // only value there can be is one the visitor's own previous post carried.
  // Still rendered rather than dropped: the owner declared the field, and a
  // form that silently stops posting a declared name is a broken integration.
  const value = first(values[field.key]) ?? "";
  // The `data-ef-field` hook goes on the input itself: a hidden input is
  // `display: none` already, so wrapping it in a row would add an empty cell to
  // the grid and a gap nobody asked for.
  return (
    <input type="hidden" name={field.key} value={value} {...{ [FIELD_ATTRIBUTE]: field.key }} />
  );
}

function FieldRow({
  id,
  field,
  error,
  values,
  alwaysRequired,
  conditionallyRequired,
}: {
  id: string;
  field: SchemaField;
  error: IssueCode | undefined;
  values: Record<string, string | string[]>;
  /** Required under every set of answers. The only case that earns the attribute. */
  alwaysRequired: boolean;
  /** Required under some answers. The mark is rendered, and starts hidden. */
  conditionallyRequired: boolean;
}) {
  const kind = controlKind(field);
  const helpId = field.help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const grouped = kind === "checkbox-group";

  // A lone checkbox is the one control whose label belongs *beside* it rather
  // than above it — "[x] Keep me updated" is one thing to read, and splitting
  // it into a heading and a box says the same words twice.
  if (kind === "checkbox") {
    return (
      <div className="min-w-0" {...{ [FIELD_ATTRIBUTE]: field.key }}>
        {error ? (
          <p id={errorId} className="mb-2 text-sm font-medium text-[var(--form-danger)]">
            <span className="sr-only">Error: </span>
            {visitorMessage(error, field)}
          </p>
        ) : null}

        <div className="flex items-start gap-2.5">
          <input
            id={id}
            name={field.key}
            type="checkbox"
            required={alwaysRequired || undefined}
            defaultChecked={list(values[field.key]).length > 0}
            aria-describedby={describedBy}
            aria-invalid={error !== undefined || undefined}
            className="mt-1 size-5 shrink-0 accent-[var(--form-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          />
          <div className="min-w-0">
            <label htmlFor={id} className="text-base text-[var(--form-fg)]">
              {field.label}
              <RequiredMark
                shown={alwaysRequired}
                conditional={conditionallyRequired}
              />
            </label>
            {field.help ? (
              <p id={helpId} className="mt-1 text-sm text-[var(--form-muted)]">
                {field.help}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const heading = grouped ? (
    <legend className="text-base font-medium text-[var(--form-fg)]">
      {field.label}
      <RequiredMark
        spoken
        shown={alwaysRequired}
        conditional={conditionallyRequired}
      />
    </legend>
  ) : (
    <label htmlFor={id} className="text-base font-medium text-[var(--form-fg)]">
      {field.label}
      <RequiredMark shown={alwaysRequired} conditional={conditionallyRequired} />
    </label>
  );

  const body = (
    <>
      {heading}

      {field.help ? (
        <p id={helpId} className="mt-1.5 text-sm text-[var(--form-muted)]">
          {field.help}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="mt-1.5 text-sm font-medium text-[var(--form-danger)]">
          <span className="sr-only">Error: </span>
          {visitorMessage(error, field)}
        </p>
      ) : null}

      <div className="mt-2.5">
        <Control
          id={id}
          field={field}
          kind={kind}
          invalid={error !== undefined}
          describedBy={describedBy}
          values={values}
          alwaysRequired={alwaysRequired}
        />
      </div>
    </>
  );

  // A group of related controls is a `<fieldset>` with a `<legend>` — the only
  // markup that tells a screen reader "these six checkboxes are one question"
  // and reads the question again before each option.
  //
  // There is deliberately no `aria-required` on it. ARIA does not allow that
  // attribute on `role="group"`, and axe rejects it — so for a required
  // checkbox group the legend's "(required)" is the *only* place the rule can
  // be stated, and it is stated as words rather than as an attribute. A browser
  // agent parsing attributes alone will read the question as optional; #32's
  // tool definition has to carry `required` itself, because the DOM cannot.
  return grouped ? (
    <fieldset className="min-w-0 border-0 p-0" {...{ [FIELD_ATTRIBUTE]: field.key }}>
      {body}
    </fieldset>
  ) : (
    <div className="min-w-0" {...{ [FIELD_ATTRIBUTE]: field.key }}>
      {body}
    </div>
  );
}

/**
 * How a field says it is required.
 *
 * Normally an asterisk, and `aria-hidden`: the `required` attribute already
 * tells assistive technology, and a screen reader reading "Work email star,
 * required" is worse than useless.
 *
 * A checkbox group is the exception, and `spoken` is why it exists. That group
 * cannot carry `required` — the attribute means *this box*, so putting it on
 * each one would demand every option be ticked (see `controls.ts`). Nothing in
 * the markup would then announce the rule, and a screen reader would read the
 * question as optional. So the legend says the word instead, out loud and on
 * screen, and it is the only honest way to state it.
 */
function RequiredMark({
  spoken = false,
  shown,
  conditional,
}: {
  spoken?: boolean;
  /** Required whatever anybody answers. Drawn plainly. */
  shown: boolean;
  /** Required only under some answers. Drawn, but hidden until a rule fires. */
  conditional: boolean;
}) {
  if (!shown && !conditional) return null;

  // A conditional mark is rendered into the HTML and starts hidden, so the
  // enhancement can turn it on without inventing markup — and so a page with
  // scripting off shows no asterisk on a field that is not, right now,
  // required of the person reading it. The server still enforces the rule and
  // still names it if the field comes back empty.
  const hidden = !shown;

  if (spoken) {
    return (
      <span
        hidden={hidden}
        {...(conditional ? { [REQUIRED_MARK_ATTRIBUTE]: "" } : {})}
        className="ml-1 text-sm font-normal text-[var(--form-danger)]"
      >
        (required)
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      hidden={hidden}
      {...(conditional ? { [REQUIRED_MARK_ATTRIBUTE]: "" } : {})}
      className="text-[var(--form-danger)]"
    >
      {" *"}
    </span>
  );
}

function Control({
  id,
  field,
  kind,
  invalid,
  describedBy,
  values,
  alwaysRequired,
}: {
  id: string;
  field: SchemaField;
  kind: ReturnType<typeof controlKind>;
  invalid: boolean;
  describedBy: string | undefined;
  values: Record<string, string | string[]>;
  alwaysRequired: boolean;
}) {
  // `nativeConstraints` decides `required` from the field alone, which is right
  // for every constraint but this one: whether an answer can be omitted is a
  // question about the *document*, because a rule can stop the field being
  // asked. So the attribute is overridden here, in the one direction that is
  // safe — off. A field only a rule can require gets it from `form-rules.tsx`
  // at the moment the rule fires, and never with scripting off, where every
  // field is on screen and the server is the only honest judge.
  const constraints = { ...nativeConstraints(field), required: alwaysRequired || undefined };
  const shared = {
    id,
    name: field.key,
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
  } as const;

  switch (kind) {
    case "textarea":
      return (
        <textarea
          {...shared}
          {...constraints}
          rows={5}
          placeholder={field.placeholder}
          defaultValue={first(values[field.key]) ?? ""}
          className={`${CONTROL_CLASS} resize-y`}
        />
      );

    case "select":
      return (
        <select
          {...shared}
          required={constraints.required}
          defaultValue={first(values[field.key]) ?? ""}
          className={`${CONTROL_CLASS} h-11`}
        >
          {/* A blank first option, always. Without one the browser pre-selects
              the first real choice, and a visitor who never touched the control
              has silently answered the question. */}
          <option value="">Choose…</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );

    case "multi-select":
      return (
        <select
          {...shared}
          multiple
          size={8}
          required={constraints.required}
          defaultValue={list(values[field.key])}
          className={`${CONTROL_CLASS} py-1`}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value} className="px-1 py-1">
              {option.label}
            </option>
          ))}
        </select>
      );

    // Handled entirely in `FieldRow`, where the label sits beside the box
    // rather than above it.
    case "checkbox":
      return null;

    case "checkbox-group":
      return (
        <CheckboxGroup
          id={id}
          field={field}
          options={field.options ?? []}
          describedBy={describedBy}
          invalid={invalid}
          selected={list(values[field.key])}
        />
      );

    case "hidden":
      return null;

    default:
      return (
        <input
          {...shared}
          {...constraints}
          type={inputType(field)}
          inputMode={inputMode(field)}
          autoComplete={autoCompleteFor(field)}
          placeholder={field.placeholder}
          defaultValue={first(values[field.key]) ?? ""}
          className={`${CONTROL_CLASS} h-11`}
        />
      );
  }
}

/**
 * One checkbox per option, all posting the same name.
 *
 * That is what makes the payload an array, which is what `multi_select`
 * declares. The group's `aria-describedby` goes on each box rather than on the
 * fieldset, because a fieldset's description is not announced consistently and
 * the error has to be read when the visitor arrives at the control.
 */
function CheckboxGroup({
  id,
  field,
  options,
  describedBy,
  invalid,
  selected,
}: {
  id: string;
  field: SchemaField;
  options: readonly FieldOption[];
  describedBy: string | undefined;
  invalid: boolean;
  selected: string[];
}) {
  const chosen = new Set(selected);

  return (
    <div className="grid gap-2.5">
      {options.map((option, index) => {
        const optionId = `${id}-o${index}`;
        return (
          <div key={option.value} className="flex items-start gap-2.5">
            <input
              id={optionId}
              type="checkbox"
              name={field.key}
              value={option.value}
              defaultChecked={chosen.has(option.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="mt-0.5 size-5 shrink-0 accent-[var(--form-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            />
            <label htmlFor={optionId} className="text-base text-[var(--form-fg)]">
              {option.label}
            </label>
          </div>
        );
      })}
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
