"use client";

import { useId, useMemo } from "react";

import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import {
  FONT_LABELS,
  THEME_BUTTONS,
  THEME_BUTTON_WIDTHS,
  THEME_DENSITIES,
  THEME_FONTS,
  THEME_PRESETS,
  THEME_RADII,
  THEME_SCHEMES,
  describeTheme,
  format,
  isHexColor,
  matchingPreset,
  normalizeHex,
  resolveTheme,
  type StoredTheme,
  type ThemeButton,
  type ThemeButtonWidth,
  type ThemeDensity,
  type ThemeFont,
  type ThemeRadius,
  type ThemeScheme,
} from "@/lib/render/theme";
import { cn } from "@/lib/utils";

import { EditorLabel, SelectField } from "./inputs";

/**
 * The theme controls (#38).
 *
 * ## Six controls, and no seventh
 *
 * There is no CSS box here and there is not going to be one. The complaint this
 * answers — "I had to hire someone to make it not look like a form from 2015" —
 * is not solved by handing the same person a stylesheet; that is the thing they
 * already could not do. It is solved by a small set of choices that cannot
 * produce something broken, which is why every control below is a closed set
 * and the single free-form input is a hex colour matched against an anchored
 * pattern before it is allowed anywhere near the state.
 *
 * ## Why the ratios are on screen
 *
 * `docs/03-brand.md` publishes a verified contrast ratio for every pair in our
 * own palette, and we have shipped an accessibility finding about three-state
 * colour. A builder that let someone make a 2:1 form would refute both. So the
 * measured ratio for every pair this theme produces is on the panel, in the
 * same notation the brand doc uses.
 *
 * What that panel shows is a **correction log**, not a to-do list. The pairs a
 * person could get wrong are not exposed — nobody picks the body text colour or
 * the page ground — so every check passes by construction, and the useful thing
 * to say is which ones needed a derivation and what the number was. See
 * `describeTheme`.
 *
 * ## The preview
 *
 * There isn't one in this file. `preview-pane.tsx` already renders the draft
 * through `FormView`, the same component the hosted form uses, and the theme
 * rides into it on the draft document — so the preview updates as these
 * controls move without a second renderer existing to drift from the first.
 */

export type ThemePanelProps = {
  theme: StoredTheme;
  onChange: (theme: StoredTheme) => void;
};

const SCHEME_LABELS: Record<ThemeScheme, string> = {
  auto: "Follow the visitor",
  light: "Always light",
  dark: "Always dark",
};

const RADIUS_LABELS: Record<ThemeRadius, string> = {
  square: "Square",
  soft: "Soft",
  round: "Round",
};

const DENSITY_LABELS: Record<ThemeDensity, string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  roomy: "Roomy",
};

const BUTTON_LABELS: Record<ThemeButton, string> = {
  solid: "Filled",
  outline: "Outlined",
};

const WIDTH_LABELS: Record<ThemeButtonWidth, string> = {
  inline: "Fits its label",
  full: "Full width",
};

export function ThemePanel({ theme, onChange }: ThemePanelProps) {
  const report = useMemo(() => describeTheme(theme), [theme]);
  const preset = useMemo(() => matchingPreset(theme), [theme]);
  const scheme = theme.scheme ?? "auto";

  const set = <K extends keyof StoredTheme>(key: K, value: StoredTheme[K]) =>
    onChange({ ...theme, [key]: value });

  return (
    <Panel>
      <PanelHeader
        title="How the form looks"
        description="Six settings, stored on the version you publish. There is no stylesheet to paste and no way to make the form unreadable — the colours a visitor reads are worked out from the one you pick."
      />

      <PanelBody className="grid gap-6">
        <div>
          <EditorLabel htmlFor="theme-presets">Start from</EditorLabel>
          <div id="theme-presets" className="mt-2 flex flex-wrap gap-2">
            {THEME_PRESETS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={preset?.id === entry.id}
                onClick={() => onChange(entry.theme)}
                title={entry.note}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  preset?.id === entry.id
                    ? "border-foreground bg-sunken text-foreground"
                    : "border-border-control text-muted-foreground hover:text-foreground",
                )}
              >
                <Swatch theme={entry.theme} />
                {entry.name}
              </button>
            ))}
          </div>
          <p className="mt-2 max-w-[64ch] text-sm text-muted-foreground">
            {preset
              ? preset.note
              : "A preset fills in all six settings at once. Its name is not stored — what gets published is the values, so editing a preset later never restyles a form that already went out."}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <BrandColour
            value={theme.accent}
            onChange={(accent) => onChange({ ...theme, accent })}
          />

          <SelectField
            label="Light or dark"
            value={scheme}
            onChange={(event) => set("scheme", event.target.value as ThemeScheme)}
          >
            {THEME_SCHEMES.map((value) => (
              <option key={value} value={value}>
                {SCHEME_LABELS[value]}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Corners"
            value={theme.radius ?? "soft"}
            onChange={(event) => set("radius", event.target.value as ThemeRadius)}
          >
            {THEME_RADII.map((value) => (
              <option key={value} value={value}>
                {RADIUS_LABELS[value]}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Typeface"
            value={theme.font ?? "system"}
            onChange={(event) => set("font", event.target.value as ThemeFont)}
          >
            {THEME_FONTS.map((value) => (
              <option key={value} value={value}>
                {FONT_LABELS[value]}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Spacing"
            value={theme.density ?? "comfortable"}
            onChange={(event) => set("density", event.target.value as ThemeDensity)}
          >
            {THEME_DENSITIES.map((value) => (
              <option key={value} value={value}>
                {DENSITY_LABELS[value]}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Submit button"
            value={theme.button ?? "solid"}
            onChange={(event) => set("button", event.target.value as ThemeButton)}
          >
            {THEME_BUTTONS.map((value) => (
              <option key={value} value={value}>
                {BUTTON_LABELS[value]}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Button width"
            value={theme.buttonWidth ?? "inline"}
            onChange={(event) => set("buttonWidth", event.target.value as ThemeButtonWidth)}
          >
            {THEME_BUTTON_WIDTHS.map((value) => (
              <option key={value} value={value}>
                {WIDTH_LABELS[value]}
              </option>
            ))}
          </SelectField>
        </div>

        <SchemeNote scheme={scheme} />

        {/* The typeface control is the one place a form builder normally
            smuggles in a download. Saying the number is the honest version of
            "no webfonts": the hosted form runs on the customer's paid traffic
            and this page has a 30 KB budget it is already over (#56). */}
        <p className="max-w-[70ch] text-sm text-muted-foreground">
          <span className="text-foreground">Every typeface here costs 0 KB.</span> They
          are all faces the visitor&rsquo;s device already has, so the form paints
          immediately and nothing swaps under them halfway. There is deliberately
          no webfont option — not even ours. A 60 KB font in front of a form is
          the easiest way to make the page slower than the ad that paid to reach
          it.
        </p>

        <ContrastReport report={report} />
      </PanelBody>
    </Panel>
  );
}

/**
 * The colour input.
 *
 * A native `<input type="color">` beside a text box, because the two answer
 * different people: somebody who has the brand hex in their clipboard pastes
 * it, and somebody who does not opens the swatch. Both write the same state.
 *
 * The text box accepts only what `isHexColor` accepts, and anything else leaves
 * the state alone rather than being stored and rejected later. That is the
 * injection boundary in the UI, and it is not the only one — `themeSchema`
 * refuses the same strings on the way into the document and `resolveTheme`
 * refuses them again on the way out to CSS. Three checks, because this value
 * ends up inside a `style` attribute on a page we serve.
 */
function BrandColour({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const id = useId();
  const current = value ?? "#c7f23c";

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <EditorLabel htmlFor={id}>Brand colour</EditorLabel>
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="color"
          value={current}
          aria-label="Pick a brand colour"
          onChange={(event) => onChange(normalizeHex(event.target.value))}
          className="size-9 shrink-0 cursor-pointer rounded-md border border-border-control bg-card p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <input
          id={id}
          value={value ?? ""}
          placeholder="#c7f23c"
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value.trim();
            if (next === "") return onChange(undefined);
            if (isHexColor(next)) onChange(normalizeHex(next));
          }}
          className="w-full min-w-0 rounded-md border border-border-control bg-card px-2.5 py-2 font-mono text-sm text-foreground placeholder:text-subtle-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        The only colour you set. Hex only — three digits or six.
      </p>
    </div>
  );
}

/** A preset's colour and corner, at the size of a bullet. */
function Swatch({ theme }: { theme: StoredTheme }) {
  const resolved = resolveTheme(theme);
  return (
    <span
      aria-hidden="true"
      style={
        {
          background: theme.accent,
          borderRadius: resolved.vars["--form-radius"] === "0px" ? "0px" : "3px",
          boxShadow: `inset 0 0 0 1px ${resolved.vars["--form-accent-edge"] ?? "transparent"}`,
        } as React.CSSProperties
      }
      className="size-3.5 shrink-0 border border-border"
    />
  );
}

/**
 * What each scheme actually does, said plainly.
 *
 * "Auto" is the one that needs saying. It follows the *visitor's* operating
 * system, not the site the form is embedded on, and those are routinely
 * different — a customer whose own site is dark all the time will see their
 * form go light for a visitor on a light laptop and reasonably think it is
 * broken. Naming the tradeoff here is cheaper than answering it in a ticket.
 */
function SchemeNote({ scheme }: { scheme: ThemeScheme }) {
  return (
    <p className="max-w-[70ch] text-sm text-muted-foreground">
      {scheme === "auto" ? (
        <>
          <span className="text-foreground">Follow the visitor</span> uses whichever
          of light or dark the person filling the form in has set on their own
          device. That is not necessarily what your page around it looks like. If
          your site is dark all the time, or light all the time, pin the form to
          match it — otherwise half your visitors get a form that does not agree
          with the section it sits in.
        </>
      ) : (
        <>
          <span className="text-foreground">
            Always {scheme}
          </span>{" "}
          keeps the form {scheme} whatever the visitor has set, so it stays
          matched to your page. The area around a pinned form still follows the
          visitor when the form is opened on its own URL rather than embedded.
        </>
      )}
    </p>
  );
}

/** Every pair, measured, in the notation `docs/03-brand.md` uses. */
function ContrastReport({ report }: { report: ReturnType<typeof describeTheme> }) {
  return (
    <div className="rounded-md border border-border bg-sunken px-4 py-4">
      <p className="font-mono text-label uppercase text-muted-foreground">
        Contrast — measured, not estimated
      </p>

      <ul className="mt-3 grid gap-2">
        {report.checks.map((check, index) => (
          <li key={index} className="grid gap-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-sm text-foreground">{check.label}</span>
              <span className="font-mono text-sm tabular text-muted-foreground">
                {format(check.ratio)}:1
              </span>
              <span className="text-sm text-subtle-foreground">
                needs {check.required}:1 · {check.scheme}
              </span>
              <span
                className={cn(
                  "text-sm",
                  check.pass ? "text-muted-foreground" : "text-destructive",
                )}
              >
                {check.pass ? "pass" : "FAILS"}
              </span>
            </div>
            {check.correction ? (
              <p className="text-sm text-muted-foreground">{check.correction}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {report.notes.map((note, index) => (
        <p key={index} className="mt-3 max-w-[70ch] text-sm text-muted-foreground">
          {note}
        </p>
      ))}
    </div>
  );
}
