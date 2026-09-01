/**
 * The DOM hooks the hosted form's rules enhancement reads (#36).
 *
 * ## Why these constants are in their own module and not beside the component
 *
 * They were, and it was silently wrong. `form-rules.tsx` is a `"use client"`
 * module, and **every** export of a client module is replaced by an opaque
 * client reference when a Server Component imports it — not only the
 * components. So `import { FORM_ATTRIBUTE } from "./form-rules"` inside
 * `form-view.tsx` handed the server a proxy where a string was expected, the
 * spread `{...{ [FORM_ATTRIBUTE]: "" }}` produced an attribute name nobody
 * would ever query, and the rendered page came out looking correct while
 * carrying none of the hooks. Nothing failed. Nothing warned. The rules simply
 * did not run in the browser, which is the exact class of silent breakage this
 * product exists to argue against.
 *
 * A plain module both sides may import is the fix, and the rule generalises:
 * **a value shared between a Server Component and a Client Component belongs to
 * neither of them.**
 *
 * ## Why hooks at all, rather than ids
 *
 * The key is the HTML `name` attribute verbatim — `contact[email]` and
 * `interests[]` are legal — so it cannot be an `id`, and the renderer's own ids
 * are positional (`ef-f3`) and would change the moment a field moved. The key
 * is the one stable name both surfaces already agree on.
 */

/** On the one `<form>` the page renders. */
export const FORM_ATTRIBUTE = "data-ef-form";

/** On each field's row, carrying that field's key. */
export const FIELD_ATTRIBUTE = "data-ef-field";

/** On the "required" mark a rule can turn on, inside a field's row. */
export const REQUIRED_MARK_ATTRIBUTE = "data-ef-required-mark";
