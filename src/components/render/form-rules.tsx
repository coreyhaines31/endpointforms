"use client";

import { useEffect } from "react";

import type { JsonValue } from "@/lib/ingest/body";
import {
  FIELD_ATTRIBUTE,
  FORM_ATTRIBUTE,
  REQUIRED_MARK_ATTRIBUTE,
} from "@/lib/rules/attributes";
import { evaluateRules } from "@/lib/rules/evaluate";
import type { FormSchemaDocument } from "@/lib/schema/format";

/**
 * Conditional logic in the browser (#36).
 *
 * ## What this is allowed to be, and what it is not
 *
 * The hosted form's one non-negotiable property is that **it submits with
 * JavaScript disabled** — `form-view.tsx` argues why at length, and nothing
 * here weakens it. This component renders no markup at all. With scripting off
 * the page is byte-for-byte the page it was before: every field visible, every
 * answer postable, and the rules enforced where they are always enforced, on
 * the server. What this adds is that somebody whose scripting *is* on does not
 * have to read a question that does not apply to them.
 *
 * So it is an enhancement in the strict sense. It cannot be the only place a
 * rule runs, it cannot be required for a submission to be correct, and it is
 * not allowed to know anything the server does not — which is why it calls
 * `evaluateRules`, the same function `validate.ts` calls, rather than
 * reimplementing it. Two implementations of one rule is a rule that fires in
 * the browser and not on the server, and that is a lead quietly refused.
 *
 * ## It hides fields. It never removes values.
 *
 * Hiding is `element.hidden = true` on the row, and nothing else. The controls
 * stay in the DOM, keep their values and are still submitted — so a visitor who
 * answered a question before a later answer hid it does not lose what they
 * typed, and the server sees the identical payload it would have seen with
 * scripting off. That is what makes browser and server agree by construction
 * rather than by hope: they are given the same answers, and they run the same
 * function over them.
 *
 * The server then reports that answer as `answered_hidden_field` — stored,
 * named, never dropped. Quietly discarding the answer to a question the form
 * stopped asking is the category habit this product is positioned against.
 *
 * ## Where the DOM hooks live
 *
 * In `src/lib/rules/attributes.ts`, not here, and that module explains why: a
 * constant exported from a `"use client"` file is an opaque client reference by
 * the time a Server Component reads it, which produced a page carrying none of
 * these hooks and no error at all.
 *
 * ## The one thing it must remove
 *
 * `required` comes off a control the moment its row is hidden. A hidden
 * required input cannot be focused, so the browser refuses to submit the form
 * and cannot say why — the form simply stops working, with a console message
 * nobody sees. That is the single worst failure available on this page, and it
 * is the reason the attribute is managed here rather than left in the markup.
 */

export type FormRulesProps = {
  /** The published document, rules and all. Serialised into the RSC payload. */
  schema: FormSchemaDocument;
};

export function FormRules({ schema }: FormRulesProps) {
  useEffect(() => {
    const form = window.document.querySelector<HTMLFormElement>(`form[${FORM_ATTRIBUTE}]`);
    if (!form) return;

    const apply = () => {
      const evaluation = evaluateRules(schema, readValues(form));

      for (const field of schema.fields) {
        const outcome = evaluation.fields[field.key];
        if (!outcome) continue;

        const row = form.querySelector<HTMLElement>(
          `[${FIELD_ATTRIBUTE}="${cssEscape(field.key)}"]`,
        );
        if (!row) continue;

        // A row holding a server-side error is never hidden, whatever the rules
        // say. The visitor was sent back to correct something; hiding it would
        // leave them on a form with an error summary pointing at nothing.
        const holdsError = row.querySelector("[aria-invalid='true']") !== null;
        const visible = outcome.visible || holdsError;

        row.hidden = !visible;

        const controls = row.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >("input, select, textarea");

        // A checkbox group posts one name from several boxes, so `required` on
        // each would demand every option be ticked. `controls.ts` refuses to
        // emit it for the same reason; the server is the only place that rule
        // can live, and it does.
        const group = row.querySelectorAll("input[type='checkbox']").length > 1;
        const required = visible && outcome.required && !group;

        for (const control of controls) {
          if (control.type === "hidden") continue;
          control.required = required;
        }

        const mark = row.querySelector<HTMLElement>(`[${REQUIRED_MARK_ATTRIBUTE}]`);
        if (mark) mark.hidden = !required;
      }
    };

    apply();
    form.addEventListener("input", apply);
    form.addEventListener("change", apply);
    return () => {
      form.removeEventListener("input", apply);
      form.removeEventListener("change", apply);
    };
  }, [schema]);

  return null;
}

/**
 * The form's answers, in the shape the evaluator reads everywhere else.
 *
 * `FormData` is the browser's own account of what a submit would send, so this
 * is not an approximation of the payload — it is the payload. A repeated name
 * collapses to an array exactly as `parseBody` collapses it on the server, and
 * a file (which the schema cannot describe today) is left out rather than
 * stringified into something that would compare as an answer.
 */
function readValues(form: HTMLFormElement): Record<string, JsonValue> {
  const values: Record<string, JsonValue> = {};

  for (const [key, entry] of new FormData(form).entries()) {
    if (typeof entry !== "string") continue;
    const existing = values[key];
    if (existing === undefined) {
      values[key] = entry;
      continue;
    }
    values[key] = Array.isArray(existing) ? [...existing, entry] : [existing as string, entry];
  }

  return values;
}

/**
 * A field key, safe inside an attribute selector.
 *
 * The key is the HTML `name` verbatim, so `contact[email]` and `interests[]`
 * are ordinary and both would break a naive selector. `CSS.escape` is the
 * browser's own answer; the fallback covers the handful of environments that
 * lack it and escapes the characters a selector can actually be broken with.
 */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
