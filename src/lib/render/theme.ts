import { z } from "zod";

/**
 * Per-form theming.
 *
 * ## The state of this, honestly
 *
 * `src/lib/schema/format.ts` describes fields and nothing else: its document is
 * a `strictObject`, so a `theme` key is *refused* by `parseSchemaDocument` and
 * *stripped* by `readStoredDocument`. There is therefore no supported way for a
 * schema to carry theme tokens today, and the renderer's real behaviour is the
 * default below.
 *
 * This module is written against the stored `form_schemas.fields` JSON directly
 * rather than against the parsed document, so the day the format grows a place
 * to put these, forms start honouring them without a second change here. Until
 * then it reads nothing and returns the default, which is the point: the
 * fallback has to look deliberate, not like a theme that failed to load.
 *
 * ## Why every value is validated to a closed shape
 *
 * These end up as CSS custom properties in a `style` attribute on a page we
 * serve. A colour is a hex literal or it is not a colour — anything looser and
 * a stored string becomes a way to write arbitrary CSS onto someone else's form.
 * Nothing here interpolates a value it has not first matched against a pattern.
 */

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const hexColor = z.string().regex(HEX);

const themeSchema = z
  .object({
    /** The submit button's fill, and the focus ring. */
    accent: hexColor.optional(),
    /** Text on the accent fill. Derived from `accent` when absent. */
    accentInk: hexColor.optional(),
    /** The page's ground. */
    background: hexColor.optional(),
    /** What an input is filled with. Falls back to `background`. */
    surface: hexColor.optional(),
    foreground: hexColor.optional(),
    /** Help text, hints, the legal line under the button. */
    muted: hexColor.optional(),
    /** Input and card boundaries. */
    border: hexColor.optional(),
    /** Corner radius in pixels. Capped: a 40px radius on an input is a mistake. */
    radius: z.number().min(0).max(24).optional(),
    /** All three resolve to fonts already on the device. See `FONT_STACKS`. */
    font: z.enum(["system", "serif", "mono"]).optional(),
  })
  .loose();

export type FormTheme = {
  /** Custom properties to put on the form's wrapper. Empty for the default. */
  vars: Record<string, string>;
  fontFamily: string | null;
  /** True when the stored row actually carried something we could use. */
  custom: boolean;
};

export const DEFAULT_THEME: FormTheme = { vars: {}, fontFamily: null, custom: false };

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
 */
const SYSTEM_SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", sans-serif';

const FONT_STACKS: Record<"system" | "serif" | "mono", string> = {
  system: SYSTEM_SANS,
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
};

/** What a form uses when its schema names nothing. */
export const DEFAULT_FONT_STACK = SYSTEM_SANS;

export function readTheme(stored: unknown): FormTheme {
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) {
    return DEFAULT_THEME;
  }

  const raw = (stored as Record<string, unknown>).theme;
  if (raw === null || typeof raw !== "object") return DEFAULT_THEME;

  const parsed = themeSchema.safeParse(raw);
  if (!parsed.success) return DEFAULT_THEME;

  const theme = parsed.data;
  const vars: Record<string, string> = {};

  if (theme.accent) {
    vars["--form-accent"] = theme.accent;
    vars["--form-accent-ink"] = theme.accentInk ?? readableInk(theme.accent);
    // The hairline that makes a pale fill's boundary perceivable. The default
    // palette needs one for Signal on white (globals.css `.signal-fill`); a
    // custom accent needs one for exactly the same reason, or not at all.
    vars["--form-accent-edge"] = contrastRatio(theme.accent, "#ffffff") < 3 ? "#15140f" : "transparent";
  }
  if (theme.background) vars["--form-page"] = theme.background;
  // An owner who names one colour has named the page, and controls sitting on
  // the same ground with a border is what most real forms look like. Naming
  // `surface` separately is how you get a card instead.
  const surface = theme.surface ?? theme.background;
  if (surface) vars["--form-bg"] = surface;
  if (theme.foreground) vars["--form-fg"] = theme.foreground;
  if (theme.muted) vars["--form-muted"] = theme.muted;
  if (theme.border) vars["--form-border"] = theme.border;
  if (theme.radius !== undefined) vars["--form-radius"] = `${theme.radius}px`;

  const fontFamily = theme.font ? FONT_STACKS[theme.font] : null;

  return {
    vars,
    fontFamily,
    custom: Object.keys(vars).length > 0 || fontFamily !== null,
  };
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
 */
export function readableInk(hex: string): string {
  return contrastRatio(hex, "#15140f") >= contrastRatio(hex, "#ffffff") ? "#15140f" : "#ffffff";
}

function contrastRatio(a: string, b: string): number {
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
