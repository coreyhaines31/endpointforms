import {
  PARTIAL_KEY_FIELD,
  STEP_FROM_FIELD,
  STEP_TO_FIELD,
} from "@/lib/steps/format";
import type { StepPlan } from "@/lib/steps/plan";

/**
 * The parts of the hosted form that only a stepped form has (#37).
 *
 * Kept out of `form-view.tsx` so that a document with no steps renders through
 * a file none of this is in. Everything here is server-rendered markup with no
 * client component beneath it, which is the same promise the rest of the hosted
 * form makes: **turn scripting off and every one of these buttons still works**,
 * because each is a real submit button in a real `<form method="post">`.
 */

const BUTTON_BASE =
  "inline-flex h-12 items-center justify-center rounded-[var(--form-radius)] px-5 text-base font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

/**
 * The same three tokens the one-screen form's Submit button uses, not the
 * accent. A theme that deliberately separated its button from its accent —
 * which `THEME_DEFAULTS` in `form-view.tsx` exists to allow — would otherwise
 * get an outline Submit on screen one and a filled Continue on screen two.
 */
const PRIMARY = `${BUTTON_BASE} bg-[var(--form-button-bg)] text-[var(--form-button-ink)] shadow-[inset_0_0_0_1px_var(--form-button-edge)]`;

const SECONDARY = `${BUTTON_BASE} border border-[var(--form-border-control)] bg-[var(--form-bg)] text-[var(--form-fg)]`;

/**
 * Where the visitor is, above the questions.
 *
 * A count in words and a bar, rather than a bar alone. "Step 2 of 4" is the
 * thing a person actually wants and the only version a screen reader can read
 * out; the bar is there because a proportion is faster to glance at than a
 * fraction. `aria-hidden` on the bar so the two are not announced twice.
 */
export function StepHeader({ plan }: { plan: StepPlan }) {
  const percent = Math.round((plan.current.number / plan.total) * 100);

  return (
    <div className="mt-8">
      <p className="font-mono text-sm text-[var(--form-muted)]">
        Step {plan.current.number} of {plan.total}
      </p>
      <div
        aria-hidden
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--form-border)]"
      >
        <div
          className="h-full rounded-full bg-[var(--form-accent)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      {plan.current.title ? (
        <h2 className="mt-6 text-h3 break-words text-balance">{plan.current.title}</h2>
      ) : null}
      {plan.current.description ? (
        <p className="mt-2 text-base text-[var(--form-muted)]">{plan.current.description}</p>
      ) : null}
    </div>
  );
}

/**
 * Every answer given so far that is not on this screen, as hidden inputs.
 *
 * This is where the multi-step flow keeps its state — see the long note in
 * `src/lib/steps/plan.ts`. It is deliberately *not* a cookie and not a
 * server-side session: an embedded form is a cross-origin iframe, and a browser
 * blocking third-party cookies would otherwise strand every visitor on screen
 * one.
 *
 * Rendered through React, so an answer containing a quote or a `<` is escaped
 * into the attribute rather than able to leave it.
 */
export function StepCarry({
  keys,
  values,
}: {
  keys: readonly string[];
  values: Record<string, string | string[]>;
}) {
  return (
    <>
      {keys.flatMap((key) => {
        const value = values[key];
        if (value === undefined) return [];
        const list = Array.isArray(value) ? value : [value];
        return list.map((entry, index) => (
          <input key={`${key}:${index}`} type="hidden" name={key} value={entry} />
        ));
      })}
    </>
  );
}

/**
 * Back, and Next or Submit.
 *
 * **The primary button comes first in the DOM and is moved to the right with
 * `order`.** Pressing Enter in a text field activates the first submit button
 * in the form, and if that were Back then every visitor who submits with the
 * keyboard would be sent backwards through the form they are trying to finish.
 * This is exactly the class of thing that only shows up with scripting off, so
 * it is solved in the markup rather than with a key handler.
 *
 * The `order` classes are **`sm:` only**, and that is the second half of the
 * same problem. Once the buttons stack on a phone they are read top to bottom,
 * and a stacked pair with Back on top puts the way out above the way on. So
 * below `sm` the DOM order stands — primary first, which is both the right
 * reading order and the right Enter target — and the swap happens only once
 * they sit side by side, where Back belongs on the left.
 *
 * `_step` names the screen being left. The server does not trust it further
 * than it can check it: an unrecognised id plans to the first screen, which is
 * the safe direction — a visitor sees a question again rather than skipping it.
 */
export function StepNav({
  plan,
  partialKey,
}: {
  plan: StepPlan;
  partialKey: string | null;
}) {
  return (
    <>
      <input type="hidden" name={STEP_FROM_FIELD} value={plan.current.id} />
      {partialKey === null ? null : (
        <input type="hidden" name={PARTIAL_KEY_FIELD} value={partialKey} />
      )}

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          name={STEP_TO_FIELD}
          value="next"
          className={`${PRIMARY} w-full sm:order-2 sm:w-auto sm:min-w-[var(--form-button-min)]`}
        >
          {plan.isLast ? "Submit" : "Continue"}
        </button>

        {plan.isFirst ? null : (
          <button
            type="submit"
            name={STEP_TO_FIELD}
            value="back"
            /* `formNoValidate`, so going back is never blocked by a field the
               visitor has not filled in yet. A Back button that refuses to go
               back until you answer the question you are trying to escape is
               the single most infuriating thing a wizard can do, and with
               scripting off the browser would enforce exactly that. The server
               skips validation on a Back for the same reason. */
            formNoValidate
            className={`${SECONDARY} w-full sm:order-1 sm:w-auto`}
          >
            Back
          </button>
        )}
      </div>
    </>
  );
}

/**
 * What the visitor is told about partial capture.
 *
 * On the page, under the buttons that cause it, in the visitor's reading order
 * — not in a policy link, not behind a tooltip, and not only on the first
 * screen. `docs/05` §4 is about not surprising a customer's end users, and this
 * is the case it most directly covers: keeping what somebody typed and then
 * abandoned is unremarkable when it is said out loud and is the creepiest thing
 * in the category when it is not.
 *
 * It renders on every step rather than once, because a visitor who lands on
 * screen three from a resumed session has not read screen one.
 */
export function PartialNotice({ text }: { text: string }) {
  return (
    <p className="mt-5 text-sm text-[var(--form-muted)]">{text}</p>
  );
}
