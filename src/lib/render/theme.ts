import { z } from "zod";

/**
 * Per-form theming (#38).
 *
 * ## The problem this solves, and the one it refuses to
 *
 * A hosted form is embedded on the customer's own page and has to look like it
 * belongs there. Every competitor answers that with a CSS textarea, which is
 * two bad things at once: a support burden, because the person pasting it is
 * not a designer and the form they produce is worse than the default; and an
 * injection surface, because that CSS is stored and re-served on a page we
 * host.
 *
 * So there is no CSS textarea here, and there is no free-form colour except
 * one. What a form owner may choose is a **closed set of enums plus a single
 * brand colour**, and everything a person actually reads — body text, help
 * text, the page ground, the text on the button — is derived rather than
 * picked. That is the whole design: *the controls cannot produce something
 * broken*, rather than warning someone after they already have.
 *
 * ## Why the neutrals are not a control
 *
 * The failure mode everyone hits is not "the button is the wrong green". It is
 * white text on a pale yellow fill, or 2:1 body text, and both come from
 * letting someone name a foreground and a background independently. Naming one
 * of a pair is safe; naming both is how you get a 2:1 form. So `scheme` picks
 * one of two audited palettes — the same hex values `globals.css` ships and
 * `docs/03-brand.md` has verified ratios for — and the accent's own foreground
 * is computed. See `readableInk`.
 *
 * ## Why every value is validated to a closed shape
 *
 * These end up as CSS custom properties in a `style` attribute on a page we
 * serve. A colour is a hex literal or it is not a colour — anything looser and
 * a stored string becomes a way to write arbitrary CSS onto someone else's
 * form. `#fff;}</style><script>` has to be impossible, not unlikely. Nothing
 * here interpolates a value it has not first matched against a pattern, and
 * every other property resolves through a lookup table keyed by an enum, so
 * the only strings that can reach the attribute are ones written in this file.
 */

// ---------------------------------------------------------------------------
// The stored shape
// ---------------------------------------------------------------------------

/**
 * Three characters or six, `#` required, nothing else.
 *
 * Anchored at both ends, which is the whole security property: an unanchored
 * pattern matches `#fff` inside `#fff;}</style><script>` and cheerfully passes
 * the rest through.
 */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const hexColor = z.string().regex(HEX, "A colour must be a hex value like #2563eb.");

/** Follows the visitor's own setting, or forces one. See `resolveTheme`. */
export const THEME_SCHEMES = ["auto", "light", "dark"] as const;
/** Corner rounding, as three named steps rather than a number of pixels. */
export const THEME_RADII = ["square", "soft", "round"] as const;
/** Every face is already on the device. See `FONT_STACKS`. */
export const THEME_FONTS = ["system", "geometric", "humanist", "serif", "mono"] as const;
/** How much air the fields get. */
export const THEME_DENSITIES = ["compact", "comfortable", "roomy"] as const;
/** Filled with the brand colour, or outlined in it. */
export const THEME_BUTTONS = ["solid", "outline"] as const;
export const THEME_BUTTON_WIDTHS = ["inline", "full"] as const;

export type ThemeScheme = (typeof THEME_SCHEMES)[number];
export type ThemeRadius = (typeof THEME_RADII)[number];
export type ThemeFont = (typeof THEME_FONTS)[number];
export type ThemeDensity = (typeof THEME_DENSITIES)[number];
export type ThemeButton = (typeof THEME_BUTTONS)[number];
export type ThemeButtonWidth = (typeof THEME_BUTTON_WIDTHS)[number];

/**
 * The theme as it sits on a schema document.
 *
 * Strict, because this is the half `parseSchemaDocument` reads and that path
 * refuses unknown keys rather than stripping them — a `colour: "#fff"` that is
 * silently ignored is a setting its author believes they made. Every property
 * is optional and an absent one means "the default", so `{}` and no theme at
 * all are the same form.
 *
 * `radius` is an enum rather than a number on purpose. A number invites 24, and
 * a 24px radius on a text input is a mistake somebody has to be talked out of
 * in the support inbox. Three steps cannot be wrong.
 */
export const themeSchema = z.strictObject({
  /** The one colour a form owner picks. Everything else is derived from it. */
  accent: hexColor.optional(),
  scheme: z.enum(THEME_SCHEMES).optional(),
  radius: z.enum(THEME_RADII).optional(),
  font: z.enum(THEME_FONTS).optional(),
  density: z.enum(THEME_DENSITIES).optional(),
  button: z.enum(THEME_BUTTONS).optional(),
  buttonWidth: z.enum(THEME_BUTTON_WIDTHS).optional(),
});

export type StoredTheme = z.infer<typeof themeSchema>;

/**
 * The same shape, read out of a stored row.
 *
 * Deliberately more forgiving than `themeSchema`, in the same direction and for
 * the same reason as `readStoredDocument`: unknown keys are stripped rather
 * than refused, and **a property whose value this build cannot read falls back
 * to its default instead of discarding the rest of the theme**. A row written
 * by a newer build that grew a fourth radius should still get its colour, and a
 * row carrying a poisoned `accent` should still get its font.
 */
const storedThemeSchema = z.looseObject({
  accent: hexColor.optional().catch(undefined),
  scheme: z.enum(THEME_SCHEMES).optional().catch(undefined),
  radius: z.enum(THEME_RADII).optional().catch(undefined),
  font: z.enum(THEME_FONTS).optional().catch(undefined),
  density: z.enum(THEME_DENSITIES).optional().catch(undefined),
  button: z.enum(THEME_BUTTONS).optional().catch(undefined),
  buttonWidth: z.enum(THEME_BUTTON_WIDTHS).optional().catch(undefined),
});

/** A theme with nothing set. What every form that never opened the panel has. */
export const EMPTY_THEME: StoredTheme = {};

/** True when this theme would render exactly the untouched default. */
export function isDefaultTheme(theme: StoredTheme): boolean {
  return serializeTheme(theme) === undefined;
}

/**
 * What gets written to the document, or nothing.
 *
 * Returns `undefined` for a theme that sets nothing, so `serializeSchemaDocument`
 * can omit the key entirely and a form that never touched the panel serialises
 * to exactly the bytes it did before #38. That matters twice: the builder
 * compares serialised documents to decide whether there are unsaved changes, so
 * an always-present `theme: {}` would have made every stored schema look edited
 * on first open — the same trap `rules` was written to avoid.
 *
 * Colours are normalised to lowercase six-digit form on the way in, so `#FFF`
 * and `#ffffff` are one stored value rather than two documents that differ by
 * bytes and not by pixels.
 */
export function serializeTheme(theme: StoredTheme): StoredTheme | undefined {
  const out: StoredTheme = {};
  if (theme.accent !== undefined && HEX.test(theme.accent)) out.accent = normalizeHex(theme.accent);
  if (theme.scheme !== undefined && theme.scheme !== "auto") out.scheme = theme.scheme;
  if (theme.radius !== undefined && theme.radius !== DEFAULTS.radius) out.radius = theme.radius;
  if (theme.font !== undefined && theme.font !== DEFAULTS.font) out.font = theme.font;
  if (theme.density !== undefined && theme.density !== DEFAULTS.density) out.density = theme.density;
  if (theme.button !== undefined && theme.button !== DEFAULTS.button) out.button = theme.button;
  if (theme.buttonWidth !== undefined && theme.buttonWidth !== DEFAULTS.buttonWidth) {
    out.buttonWidth = theme.buttonWidth;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

const DEFAULTS = {
  scheme: "auto",
  radius: "soft",
  font: "system",
  density: "comfortable",
  button: "solid",
  buttonWidth: "inline",
} as const satisfies Required<Omit<StoredTheme, "accent">>;

// ---------------------------------------------------------------------------
// The palettes
// ---------------------------------------------------------------------------

/**
 * One audited palette per scheme, lifted verbatim from `globals.css`.
 *
 * These are not a second copy of the design system to keep in sync — they are
 * the values a form needs when it is *pinned* to one scheme, where
 * `var(--background)` would still follow the `.dark` class on `<html>` and give
 * a forced-light form a dark-mode focus ring. In `auto` none of this is emitted
 * and the tokens resolve through `globals.css` as they always have.
 *
 * `docs/03-brand.md` carries the verified ratio for every pair below: body text
 * 17.95:1 on light and 18.05:1 on dark, help text 5.44:1 and 6.89:1, the
 * interactive boundary 3:1. Those are the ratios a form owner cannot lower,
 * because they are not exposed as a control.
 */
type Palette = {
  page: string;
  surface: string;
  fg: string;
  muted: string;
  border: string;
  borderControl: string;
  ring: string;
  danger: string;
  dangerSurface: string;
};

const LIGHT: Palette = {
  page: "#fcfcfa",
  surface: "#ffffff",
  fg: "#15140f",
  muted: "#6a685e",
  border: "#e4e2da",
  borderControl: "#8c8a7f",
  ring: "#15140f",
  danger: "#b3261e",
  dangerSurface: "#fdecea",
};

const DARK: Palette = {
  page: "#0b0b09",
  surface: "#171714",
  fg: "#f6f5f0",
  muted: "#9b998f",
  border: "#2a2a25",
  borderControl: "#6a685e",
  ring: "#f6f5f0",
  danger: "#f87171",
  dangerSurface: "#2c1414",
};

/**
 * Every face a hosted form can ask for, and every one of them is already on the
 * device.
 *
 * There is deliberately no way to name a webfont — not the app's IBM Plex and
 * not the owner's. A lead-capture page must not block its own first paint on a
 * font request: 60 KB of woff2 in front of a form is the easiest way to make
 * the page slower than the ad that paid to reach it, and the visitor who leaves
 * during a font swap was bought at the same price as the one who did not.
 * Serving someone a face they already have costs nothing and never fails.
 *
 * That is also why the list is longer than "system, serif, mono": five stacks
 * that look genuinely unlike each other, at zero bytes, is a better answer to
 * "our brand uses a geometric sans" than one webfont would be. Each stack ends
 * in a generic family, so a device with none of the named faces still lands
 * somewhere deliberate rather than in Times.
 */
const SYSTEM_SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", sans-serif';

const FONT_STACKS: Record<ThemeFont, string> = {
  system: SYSTEM_SANS,
  geometric:
    'Avenir, "Avenir Next", "Nunito Sans", Corbel, "URW Gothic", "Century Gothic", ui-sans-serif, system-ui, sans-serif',
  humanist:
    'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", "Source Sans Pro", ui-sans-serif, system-ui, sans-serif',
  serif: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, ui-serif, serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
};

/** What a form uses when its schema names nothing. */
export const DEFAULT_FONT_STACK = SYSTEM_SANS;

/** What each face is called on screen. */
export const FONT_LABELS: Record<ThemeFont, string> = {
  system: "System",
  geometric: "Geometric sans",
  humanist: "Humanist sans",
  serif: "Serif",
  mono: "Monospace",
};

const RADIUS_VALUES: Record<ThemeRadius, string> = {
  square: "0px",
  soft: "0.375rem",
  round: "0.875rem",
};

/**
 * Density, as three sets of the same three measurements.
 *
 * `comfortable` repeats the values already hardcoded in `form-view.tsx`, so
 * choosing it explicitly and never opening the panel produce the same pixels.
 */
const DENSITY_VALUES: Record<ThemeDensity, { gap: string; controlPad: string; pagePad: string }> = {
  compact: { gap: "1.125rem", controlPad: "0.5rem", pagePad: "clamp(1.75rem,5vw,3rem)" },
  comfortable: { gap: "1.75rem", controlPad: "0.625rem", pagePad: "clamp(2.5rem,7vw,4.5rem)" },
  roomy: { gap: "2.25rem", controlPad: "0.8125rem", pagePad: "clamp(3rem,8vw,5.5rem)" },
};

// ---------------------------------------------------------------------------
// Resolving
// ---------------------------------------------------------------------------

export type FormTheme = {
  /**
   * What goes on the form wrapper's `style`. Empty for the default.
   *
   * Almost every key is a `--form-*` custom property, and one is not:
   * **`colorScheme`**. Forcing light or dark needs the real `color-scheme`
   * declaration, because that is what tells the browser to draw the scrollbar,
   * the date picker and the `<select>` menu the right way round — a themed form
   * whose native controls stay in the visitor's OS colours looks broken in
   * exactly the places a screenshot does not show you. It is not a custom
   * property, so it cannot be one; it rides here because the renderer spreads
   * this object straight into a `style` prop and React hyphenates the camelCase
   * key on the way out.
   *
   * That is a contract with `src/components/render/form-view.tsx`: if this bag
   * ever gets filtered to keys beginning `--`, forced light and dark quietly
   * stop working on native controls. It would also break `light-dark()`, which
   * resolves against exactly this declaration — see `pair`.
   */
  vars: Record<string, string>;
  fontFamily: string | null;
  /** True when the stored row actually carried something we could use. */
  custom: boolean;
};

export const DEFAULT_THEME: FormTheme = { vars: {}, fontFamily: null, custom: false };

/**
 * Reads a theme off a stored schema row, or off a parsed document.
 *
 * Takes the whole object rather than the theme, because both callers have the
 * container and neither should have to know that the key is called `theme`.
 */
export function readTheme(stored: unknown): FormTheme {
  return resolveTheme(readStoredTheme(stored));
}

/** The stored theme itself, defaults filled in. For the builder to edit. */
export function readStoredTheme(stored: unknown): StoredTheme {
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) return EMPTY_THEME;

  const raw = (stored as Record<string, unknown>).theme;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_THEME;

  const parsed = storedThemeSchema.safeParse(raw);
  if (!parsed.success) return EMPTY_THEME;

  // Rebuilt key by key rather than spread, so a property `looseObject` let
  // through cannot ride along into the style attribute.
  const theme: StoredTheme = {};
  if (parsed.data.accent !== undefined) theme.accent = normalizeHex(parsed.data.accent);
  if (parsed.data.scheme !== undefined) theme.scheme = parsed.data.scheme;
  if (parsed.data.radius !== undefined) theme.radius = parsed.data.radius;
  if (parsed.data.font !== undefined) theme.font = parsed.data.font;
  if (parsed.data.density !== undefined) theme.density = parsed.data.density;
  if (parsed.data.button !== undefined) theme.button = parsed.data.button;
  if (parsed.data.buttonWidth !== undefined) theme.buttonWidth = parsed.data.buttonWidth;

  // Canonicalised on the way out, so a stored row that spells out every default
  // is the same theme as one that stores nothing — which is what makes a
  // document round-trip byte for byte, and what makes `readTheme` of an
  // all-defaults theme return `DEFAULT_THEME` rather than a bag of custom
  // properties that happen to repeat the renderer's own values.
  return serializeTheme(theme) ?? EMPTY_THEME;
}

/**
 * A stored theme, as custom properties.
 *
 * ## `auto` emits no neutrals at all
 *
 * That is the point of it, not an omission. Left alone, `--form-page` and
 * friends resolve to `var(--background)` and follow the `.dark` class that
 * `ThemeScript` sets from `prefers-color-scheme` before paint — so the form
 * follows the *visitor's* preference. Writing literal neutrals here would
 * freeze it, which is what `light` and `dark` are for.
 *
 * The honest caveat, which the builder says out loud: `auto` follows the person
 * filling the form in, not the site the form is embedded on. A customer whose
 * own site is dark all the time will see their form go light for a visitor
 * whose laptop is in light mode. If the page around it has a fixed appearance,
 * the form should be pinned to match it.
 *
 * ## Where `light-dark()` is used, and why it is safe here
 *
 * Under `auto` the accent's *derived* values still differ by scheme — a colour
 * that needs a hairline on white does not need one on near-black. Those pairs
 * are emitted as `light-dark(a, b)`, which resolves against the element's
 * computed `color-scheme`. We set `color-scheme: light dark` on the same
 * element, and `ThemeScript` sets `document.documentElement.style.colorScheme`
 * from the same value it toggles `.dark` from — so the two can never disagree,
 * including with scripting off, where neither happens and both stay light.
 */
export function resolveTheme(theme: StoredTheme): FormTheme {
  const vars: Record<string, string> = {};

  const scheme = theme.scheme ?? DEFAULTS.scheme;
  const palettes: Palette[] = scheme === "dark" ? [DARK] : scheme === "light" ? [LIGHT] : [LIGHT, DARK];

  /**
   * One value under `light`/`dark`, or a `light-dark()` pair under `auto`.
   * Collapsed when both sides agree, so the common case stays a plain literal.
   */
  const pair = (of: (palette: Palette) => string): string => {
    const values = palettes.map(of);
    if (values.length === 1 || values[0] === values[1]) return values[0];
    return `light-dark(${values[0]}, ${values[1]})`;
  };

  if (scheme !== "auto") {
    const palette = palettes[0];
    vars["--form-page"] = palette.page;
    vars["--form-bg"] = palette.surface;
    vars["--form-fg"] = palette.fg;
    vars["--form-muted"] = palette.muted;
    vars["--form-border"] = palette.border;
    vars["--form-border-control"] = palette.borderControl;
    vars["--form-danger"] = palette.danger;
    vars["--form-danger-surface"] = palette.dangerSurface;
    // `--ring` is not a `--form-*` token — the renderer reads it directly for
    // every focus outline — so pinning the scheme without pinning this leaves a
    // forced-light form with dark mode's lime ring at 1.26:1 on white.
    vars["--ring"] = palette.ring;
  }

  // Emitted **only when the scheme is pinned**, and never under `auto`.
  //
  // The tempting version of this line declared `color-scheme: light dark`
  // under `auto` too, on the theory that saying "this form does both" could
  // only help `light-dark()` resolve. It does the opposite, and a browser is
  // the only thing that will tell you: `light dark` is not a statement about
  // which one is in force, it *re-opens the question* and hands it to
  // `prefers-color-scheme`. Meanwhile the palette around it is keyed to the
  // `.dark` class, which `ThemeScript` sets from `localStorage` first and the
  // media query only as a fallback. When those two sources disagree — a
  // visitor who has chosen dark on a machine set to light — the accent's
  // hairline resolved light while the page resolved dark, and a themed form
  // wore a near-black outline on a near-black button.
  //
  // Inheriting is what keeps them in step. `ThemeScript` sets
  // `documentElement.style.colorScheme` to exactly `light` or `dark` from the
  // same value it toggles `.dark` from, so an undeclared form element inherits
  // a single-valued `color-scheme` that agrees with its own palette by
  // construction. With scripting off neither happens and both stay light.
  if (scheme !== "auto") vars.colorScheme = scheme;

  if (theme.accent !== undefined) {
    const accent = normalizeHex(theme.accent);
    vars["--form-accent"] = accent;
    // Black or white, whichever a person can actually read. Never a guess: see
    // `readableInk` for why one of the two always clears 4.5:1.
    vars["--form-accent-ink"] = readableInk(accent);
    // The hairline that makes a pale fill's boundary perceivable. `globals.css`
    // needs one for Signal on white (`.signal-fill`); a custom accent needs one
    // for exactly the same reason, or not at all.
    vars["--form-accent-edge"] = pair((palette) => accentEdge(accent, palette));
    // A focus ring is a non-text boundary and wants 3:1. The brand colour gets
    // used for it when it can carry that, and is darkened or lightened toward
    // the ground until it can when it cannot.
    vars["--ring"] = pair((palette) => contrastingVariant(accent, palette.page, 3));

    const button = theme.button ?? DEFAULTS.button;
    if (button === "outline") {
      vars["--form-button-bg"] = "transparent";
      // Measured against the *page*, not the surface. An outline button has no
      // fill, so what its label sits on is the form's ground — and on dark the
      // two differ enough to matter: `surface` is the lighter of the pair
      // there, so checking against it would clear a colour that is under 4.5:1
      // where the button actually is.
      //
      // 4.5:1 for the label, because on an outline button the brand colour *is*
      // the text; 3:1 for the outline, which is a non-text boundary.
      vars["--form-button-ink"] = pair((palette) => contrastingVariant(accent, palette.page, 4.5));
      vars["--form-button-edge"] = pair((palette) => contrastingVariant(accent, palette.page, 3));
    }
  }

  if (theme.radius !== undefined) vars["--form-radius"] = RADIUS_VALUES[theme.radius];

  if (theme.density !== undefined) {
    const density = DENSITY_VALUES[theme.density];
    vars["--form-gap"] = density.gap;
    vars["--form-control-py"] = density.controlPad;
    vars["--form-pad"] = density.pagePad;
  }

  if (theme.buttonWidth === "full") vars["--form-button-min"] = "100%";

  const fontFamily = theme.font ? FONT_STACKS[theme.font] : null;

  return { vars, fontFamily, custom: Object.keys(vars).length > 0 || fontFamily !== null };
}

/**
 * The 1px inset edge a fill needs when it is too close to the page to have a
 * visible boundary, and `transparent` when it does not.
 *
 * `docs/03-brand.md` states the rule for our own Signal fill: 1.26:1 against
 * the page fails the 3:1 non-text minimum, and the hairline is the fix rather
 * than a decoration. A customer's pale accent is the identical problem.
 */
function accentEdge(accent: string, palette: Palette): string {
  return contrastRatio(accent, palette.page) < 3 ? palette.fg : "transparent";
}

// ---------------------------------------------------------------------------
// Contrast
// ---------------------------------------------------------------------------

/**
 * Black or white text on a given fill, whichever a person can actually read.
 *
 * A form owner who sets one colour should not have to also work out what goes
 * on top of it, and the failure mode of guessing wrong — white on yellow — is
 * a submit button nobody can read on the page their ad spend lands on.
 *
 * **This cannot fail, and that is a fact about the maths rather than about our
 * palette.** Contrast against black rises as a colour lightens and contrast
 * against white falls, and the two curves cross where relative luminance is
 * 0.1791 — at which point *both* ratios are 4.58:1. So the worse of the two
 * choices is never the one taken and the better of the two is never below
 * 4.58:1, for every colour that exists. There is no accent for which this
 * returns something unreadable, and `tests/theme.test.mts` sweeps the cube to
 * show it — against a deliberately broken chooser first, so that finding no
 * violations means something.
 *
 * ## Why pure black rather than the brand's near-black
 *
 * It was `#15140f` — `foreground` from `globals.css`, which is the right ink on
 * *our* surfaces and warmer than pure black. It is the wrong ink here, and the
 * sweep is what said so: `#15140f` is not black, it carries a luminance of its
 * own, and that moves the crossover to 4.32:1. `#cc5522` — an ordinary
 * mid-orange, the sort of colour a brand actually has — came back at **4.29:1**
 * and failed AA on the one control the whole page exists to get clicked.
 *
 * On a customer's arbitrary accent the warm cast buys nothing anyone can see
 * and costs the guarantee, so the guarantee wins. Our own palette still pairs
 * `signal` with `signal-foreground` in `globals.css`; this function is only
 * ever asked about a colour we did not choose.
 */
export function readableInk(hex: string): string {
  return contrastRatio(hex, "#000000") >= contrastRatio(hex, "#ffffff") ? "#000000" : "#ffffff";
}

/**
 * The smallest contrast ratio `readableInk` can ever be forced down to.
 *
 * Not a measurement of our presets — the floor of the whole colour space, where
 * the black and white curves cross. Every accent that exists does at least this
 * well.
 */
export const MIN_READABLE_INK_RATIO = 4.58;

/**
 * The nearest version of a colour that clears `target` against a ground.
 *
 * Returns the colour untouched when it already does. When it does not, it is
 * mixed toward black on a light ground or toward white on a dark one — the
 * same move `globals.css` makes by hand for `signal-ink`, where Signal
 * `#c7f23c` becomes `#41590a` so it can be *text* on paper instead of only ever
 * a fill. Hue survives the move; the colour stays recognisably the brand.
 *
 * A binary search rather than a formula because luminance is not linear in the
 * channel values, and it always terminates with an answer: pure black clears
 * 19.5:1 on our lightest ground and pure white clears 19.4:1 on our darkest, so
 * the end of the ramp satisfies any target this file asks for.
 */
export function contrastingVariant(hex: string, ground: string, target: number): string {
  if (contrastRatio(hex, ground) >= target) return normalizeHex(hex);

  const toward = relativeLuminance(ground) > CROSSOVER_LUMINANCE ? 0 : 255;
  // `keep` is how much of the original colour survives: 1 is the colour itself
  // and 0 is pure black or white. Contrast against the ground falls as `keep`
  // rises, so this searches for the largest `keep` that still clears.
  let low = 0;
  let high = 1;
  let best = mixToward(hex, toward, 0);
  for (let i = 0; i < 24; i++) {
    const keep = (low + high) / 2;
    const candidate = mixToward(hex, toward, keep);
    if (contrastRatio(candidate, ground) >= target) {
      best = candidate;
      low = keep;
    } else {
      high = keep;
    }
  }
  return best;
}

/** Where contrast-against-black and contrast-against-white are equal. */
const CROSSOVER_LUMINANCE = 0.1791;

function mixToward(hex: string, toward: 0 | 255, keep: number): string {
  const mixed = channels(hex).map((value) => Math.round(toward + (value - toward) * keep));
  return `#${mixed.map((value) => clampByte(value).toString(16).padStart(2, "0")).join("")}`;
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

/** WCAG 2.1 relative-luminance contrast, in the range 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function channels(hex: string): [number, number, number] {
  const body = hex.slice(1);
  const full =
    body.length === 3
      ? body
          .split("")
          .map((c) => c + c)
          .join("")
      : body;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** `#ABC` and `#aabbcc` are one colour. Stored as the second. */
export function normalizeHex(hex: string): string {
  const body = hex.slice(1).toLowerCase();
  return `#${body.length === 3 ? body.split("").map((c) => c + c).join("") : body}`;
}

/** True for a string this module would accept as a colour. Nothing else. */
export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

// ---------------------------------------------------------------------------
// What the builder shows
// ---------------------------------------------------------------------------

export type ContrastCheck = {
  /** What pair this is, as a sentence fragment. */
  label: string;
  /** Which palette it was measured against, when the scheme is `auto`. */
  scheme: "light" | "dark";
  ratio: number;
  /** The WCAG 2.1 minimum for this kind of pair. */
  required: number;
  pass: boolean;
  /** Set when we changed the colour to make it pass. */
  correction?: string;
};

export type ThemeReport = {
  checks: ContrastCheck[];
  /** Everything a person should be told, in plain sentences. Never empty-ish. */
  notes: string[];
  /** True when nothing in `checks` is below its minimum. Always true today. */
  ok: boolean;
};

/**
 * Every contrast pair a theme produces, measured.
 *
 * The builder shows this beside the controls, with the actual ratios. Issue #38
 * is explicit about why: we published an accessibility finding about three-state
 * colour and a brand doc full of verified ratios, and shipping a builder that
 * lets someone create a 2:1 form would be self-refuting.
 *
 * What this reports is a *correction log*, not a list of things to go fix. The
 * pairs a form owner could break are not exposed as controls, and the one
 * colour they do choose has its foreground derived — so every check here passes
 * by construction, and the honest thing to show is which of them needed the
 * derivation, with the number.
 */
export function describeTheme(theme: StoredTheme): ThemeReport {
  const checks: ContrastCheck[] = [];
  const notes: string[] = [];

  const scheme = theme.scheme ?? DEFAULTS.scheme;
  const named: { scheme: "light" | "dark"; palette: Palette }[] =
    scheme === "dark"
      ? [{ scheme: "dark", palette: DARK }]
      : scheme === "light"
        ? [{ scheme: "light", palette: LIGHT }]
        : [
            { scheme: "light", palette: LIGHT },
            { scheme: "dark", palette: DARK },
          ];

  for (const { scheme: name, palette } of named) {
    checks.push({
      label: "Body text on the form",
      scheme: name,
      ratio: contrastRatio(palette.fg, palette.page),
      required: 4.5,
      pass: contrastRatio(palette.fg, palette.page) >= 4.5,
    });
    checks.push({
      label: "Help text on the form",
      scheme: name,
      ratio: contrastRatio(palette.muted, palette.page),
      required: 4.5,
      pass: contrastRatio(palette.muted, palette.page) >= 4.5,
    });
    checks.push({
      label: "Input borders on the form",
      scheme: name,
      ratio: contrastRatio(palette.borderControl, palette.surface),
      required: 3,
      pass: contrastRatio(palette.borderControl, palette.surface) >= 3,
    });
  }

  if (theme.accent === undefined) {
    notes.push(
      "No brand colour set, so the form uses Endpoint's own. Every ratio above comes from the audited palette in docs/03-brand.md.",
    );
    return { checks, notes, ok: checks.every((check) => check.pass) };
  }

  const accent = normalizeHex(theme.accent);
  const button = theme.button ?? DEFAULTS.button;

  const ink = readableInk(accent);
  checks.push({
    label: button === "outline" ? "Text on a filled control" : "Text on the Submit button",
    scheme: named[0].scheme,
    ratio: contrastRatio(ink, accent),
    required: 4.5,
    pass: contrastRatio(ink, accent) >= 4.5,
    correction: `${ink === "#ffffff" ? "White" : "Black"} text, chosen for you.`,
  });

  for (const { scheme: name, palette } of named) {
    const fillRatio = contrastRatio(accent, palette.page);
    checks.push({
      label: button === "outline" ? "Button outline against the form" : "The Submit button against the form",
      scheme: name,
      // With the hairline, the perceivable boundary is the hairline's own ratio.
      ratio: fillRatio < 3 ? contrastRatio(palette.fg, palette.page) : fillRatio,
      required: 3,
      pass: true,
      correction:
        fillRatio < 3
          ? `Your colour is ${format(fillRatio)}:1 against the page — too close to have a visible edge — so the button keeps a 1px outline.`
          : undefined,
    });

    if (button === "outline") {
      const derived = contrastingVariant(accent, palette.page, 4.5);
      checks.push({
        label: "Button label on an outline button",
        scheme: name,
        ratio: contrastRatio(derived, palette.page),
        required: 4.5,
        pass: contrastRatio(derived, palette.page) >= 4.5,
        correction:
          derived === accent
            ? undefined
            : `Your colour is ${format(contrastRatio(accent, palette.page))}:1 as text here, so the label is drawn in ${derived}.`,
      });
    }

    const ringRatio = contrastRatio(accent, palette.page);
    const ringColor = contrastingVariant(accent, palette.page, 3);
    checks.push({
      label: "The focus ring",
      scheme: name,
      ratio: contrastRatio(ringColor, palette.page),
      required: 3,
      pass: contrastRatio(ringColor, palette.page) >= 3,
      correction:
        ringColor === accent
          ? undefined
          : `Your colour is ${format(ringRatio)}:1 against the page, so the focus ring is drawn in ${ringColor}.`,
    });
  }

  const corrected = checks.filter((check) => check.correction !== undefined).length;
  notes.push(
    corrected === 0
      ? "Your brand colour clears every minimum on its own. Nothing was adjusted."
      : `Your brand colour is used as you chose it. ${corrected === 1 ? "One place" : `${corrected} places`} needed an adjustment to stay readable, listed above — the colour itself is not changed, only what sits on and beside it.`,
  );
  notes.push(
    "The page ground and the text colour are not settings. That is deliberate: naming both is the only way to make a form nobody can read, so a form owner names one colour and the rest is derived from it.",
  );

  return { checks, notes, ok: checks.every((check) => check.pass) };
}

/** A ratio, as it is written in `docs/03-brand.md`. */
export function format(ratio: number): string {
  return ratio.toFixed(2);
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * Five themes that already look like a decision.
 *
 * Presets beat a colour picker for the person this feature is for. Somebody who
 * knows what a 14px radius and a humanist sans do together does not need the
 * panel; somebody who has been told to "make the form match the brand" opens it
 * with one hex code and no other opinion, and a preset is how they get a form
 * that looks intentional in one click instead of six.
 *
 * **A preset is applied, not referenced.** Choosing one writes its six values
 * onto the document and the name is not stored. That is on purpose: a stored
 * `preset: "ledger"` would mean editing this file silently restyles every
 * published form that named it, and a published version is supposed to be a
 * fixed thing you can roll back to. What is stored is always the values.
 */
export type ThemePreset = {
  id: string;
  name: string;
  /** What it is for, in the panel. */
  note: string;
  theme: StoredTheme;
};

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: "signal",
    name: "Signal",
    note: "Endpoint's own. What every form looks like until you change something.",
    theme: {
      accent: "#c7f23c",
      scheme: "auto",
      radius: "soft",
      font: "system",
      density: "comfortable",
      button: "solid",
      buttonWidth: "inline",
    },
  },
  {
    id: "slate",
    name: "Slate",
    note: "Square, tight and monochrome. Disappears into almost any site.",
    theme: {
      accent: "#15140f",
      scheme: "auto",
      radius: "square",
      font: "system",
      density: "compact",
      button: "solid",
      buttonWidth: "full",
    },
  },
  {
    id: "paper",
    name: "Paper",
    note: "Serif and unhurried, pinned to light. For a long form somebody reads.",
    theme: {
      accent: "#8f4a04",
      scheme: "light",
      radius: "soft",
      font: "serif",
      density: "roomy",
      button: "outline",
      buttonWidth: "inline",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    note: "Pinned to dark, so it stays dark on a light laptop. Match it to a dark site.",
    theme: {
      accent: "#7dd3fc",
      scheme: "dark",
      radius: "round",
      font: "geometric",
      density: "comfortable",
      button: "solid",
      buttonWidth: "full",
    },
  },
  {
    id: "ledger",
    name: "Ledger",
    note: "Monospace and square. Reads as a tool rather than a marketing page.",
    theme: {
      accent: "#0e7688",
      scheme: "auto",
      radius: "square",
      font: "mono",
      density: "compact",
      button: "solid",
      buttonWidth: "inline",
    },
  },
];

/** The preset whose values a theme currently matches, if any. */
export function matchingPreset(theme: StoredTheme): ThemePreset | undefined {
  const serialized = JSON.stringify(serializeTheme(theme) ?? null);
  return THEME_PRESETS.find(
    (preset) => JSON.stringify(serializeTheme(preset.theme) ?? null) === serialized,
  );
}
