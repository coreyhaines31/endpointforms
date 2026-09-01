import type { FormTheme } from "../render/theme.ts";
import type { EmbedMode } from "./params.ts";

/**
 * The layout an embedded form is drawn with (#39).
 *
 * ## Why this is a module and not four lines in `page.tsx`
 *
 * Because of one property that is **not** a custom property, and a contract
 * that cannot be enforced by reading the code carefully.
 *
 * `FormTheme.vars` carries `colorScheme` alongside its `--form-*` keys. It has
 * to: forcing light or dark needs the real `color-scheme` declaration, which is
 * what tells the browser how to draw the scrollbar, the date picker and the
 * `<select>` menu — and `light-dark()` resolves against exactly that
 * declaration. `theme.ts` documents this as a contract with the renderer: **if
 * that bag is ever filtered to keys beginning `--`, forced light and dark
 * quietly stop working on native controls.** Nothing errors. The form still
 * renders. It just stops doing the thing somebody chose it for, in the places a
 * screenshot does not show you.
 *
 * A contract that lives only in a comment is one edit away from being broken.
 * So the function that touches `vars` for embedding lives here, exported, and
 * `tests/embed.test.mts` asserts that a non-`--` key survives it. Move the
 * spread back inline and the guard goes with it; leave it here and a future
 * `Object.entries(vars).filter(...)` turns red instead of shipping.
 *
 * ## Two modes, opposite answers
 *
 * **Inline** sits in the flow of somebody's page and must stop looking like a
 * rectangle dropped onto it: no ground of its own, no padding in either
 * direction, no column of its own. The host's `<div>` has already decided how
 * wide this is and how much air is around it, and disagreeing with it is what
 * makes an embed look bolted on.
 *
 * **Popup** is the opposite, and the naive answer is wrong twice in ways that
 * only show up on screen. There is no host container to inherit spacing from —
 * the dialog panel *is* the container — so zero padding puts the inputs against
 * its edge. And a transparent ground means the dialog's own colour shows
 * through, which is fine until the visitor prefers dark: the form renders dark
 * text over a light panel and is unreadable. So the popup keeps its own opaque
 * ground and its own padding, and the dialog in `public/embed.js` is
 * transparent behind it. The form paints the panel, and therefore paints it in
 * whichever scheme the visitor asked for.
 */

/** The measurements an inline embed hands back to the page it is sitting on. */
const INLINE: Record<string, string> = {
  "--form-pad": "0px",
  "--form-pad-x": "0px",
  "--form-width": "none",
};

/** A dialog is its own container, so it keeps spacing — just not a page's worth. */
const POPUP: Record<string, string> = {
  "--form-pad": "1.75rem",
  "--form-pad-x": "1.5rem",
  "--form-width": "none",
};

/**
 * The ground an inline embed takes **only when the form has not named one**.
 *
 * Transparent is the right default — it is what makes the form part of the
 * page rather than a box on it. It is the wrong override: a form whose owner
 * chose a background chose it deliberately, and a themed form that forces its
 * own dark palette needs the ground that palette was built against. Dropping it
 * would leave dark text on whatever the host's page happens to be.
 *
 * So this is applied under `theme.vars`, not over it, and every layout value
 * above is applied over — because width and padding are the host's business
 * however the form is themed, and colour is not.
 */
const INLINE_GROUND: Record<string, string> = { "--form-page": "transparent" };

export function embeddedTheme(theme: FormTheme, mode: EmbedMode): FormTheme {
  return {
    ...theme,
    vars: {
      // The order is the whole argument. `INLINE_GROUND` first, so a theme's own
      // background beats it; the layout last, so it beats a theme's density.
      ...(mode === "inline" ? INLINE_GROUND : {}),
      // Spread, never filtered. `colorScheme` is in here and is not a custom
      // property — see the note at the top of this file, and the test that
      // fails if this line ever grows a predicate.
      ...theme.vars,
      ...(mode === "inline" ? INLINE : POPUP),
    },
  };
}
