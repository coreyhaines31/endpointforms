/**
 * Theming without custom CSS (#38).
 *
 * Three things are worth testing here and the rest is a lookup table.
 *
 *   - **The contrast maths.** Not "does it compute a number" — whether the
 *     numbers are the *same* numbers `docs/03-brand.md` publishes, because that
 *     document is the standard this feature claims to meet and a contrast
 *     function that is quietly 5% out would agree with itself forever. Every
 *     known-pair assertion below is a ratio someone wrote down in the brand doc
 *     against the hex values in `globals.css`.
 *
 *   - **That the guarantee is a guarantee.** The claim is not "we picked good
 *     defaults", it is *no accent a customer can enter produces unreadable text
 *     on the button*. That is a claim about every colour, so it is tested by
 *     sweeping the colour cube rather than by three examples — and the sweep is
 *     first shown to go red against a deliberately broken chooser, because an
 *     assertion of the form "nothing violates this" is equally consistent with
 *     "the loop ran zero times".
 *
 *   - **That a colour cannot become CSS.** The accent ends up inside a `style`
 *     attribute on a page we serve to a customer's visitors. `#fff;}</style>`
 *     and its relatives are fed in at all three layers — the strict document
 *     parse, the lenient stored read, and the resolve to custom properties —
 *     and none of them may appear in the output.
 *
 * Plus the boring one that matters most in production: **an unthemed document
 * is untouched.** Every row written before this feature existed must serialise
 * to the same bytes and render with the same empty style bag, or #38 becomes a
 * silent restyle of every form already live.
 *
 * No database, no network: `node --experimental-strip-types`.
 */

import { readFileSync } from "node:fs";

import {
  DEFAULT_THEME,
  MIN_READABLE_INK_RATIO,
  THEME_PRESETS,
  contrastRatio,
  contrastingVariant,
  describeTheme,
  isDefaultTheme,
  matchingPreset,
  normalizeHex,
  readStoredTheme,
  readTheme,
  readableInk,
  resolveTheme,
  serializeTheme,
  themeSchema,
  type StoredTheme,
} from "../src/lib/render/theme.ts";
import {
  parseSchemaDocument,
  readStoredDocument,
  serializeSchemaDocument,
} from "../src/lib/schema/format.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const okay = JSON.stringify(got) === JSON.stringify(want);
  if (okay) pass++;
  else fail++;
  console.log(`  ${okay ? "PASS" : "FAIL"}  ${name}`);
  if (!okay) {
    console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  }
};

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

/** A ratio, rounded the way the brand doc writes them. */
const ratio = (a: string, b: string) => Number(contrastRatio(a, b).toFixed(2));

// ---------------------------------------------------------------------------
// The maths, against numbers somebody else wrote down
// ---------------------------------------------------------------------------

function contrastMathTests() {
  console.log("\ncontrast — against ratios published in docs/03-brand.md");

  // The two ends of the scale. If either of these is wrong nothing else here
  // means anything, and they are the only two values WCAG fixes exactly.
  t("black on white is the maximum", ratio("#000000", "#ffffff"), 21);
  t("a colour against itself is the minimum", ratio("#4e1fbc", "#4e1fbc"), 1);
  t("order does not matter", ratio("#000000", "#ffffff"), ratio("#ffffff", "#000000"));
  // The canonical WCAG boundary colour: #767676 is the darkest grey that still
  // clears 4.5:1 on white, and is quoted at 4.54 everywhere.
  t("the canonical AA grey on white", ratio("#767676", "#ffffff"), 4.54);

  // docs/03-brand.md §"light" — every one of these was computed against the
  // hex values in globals.css rather than estimated, which is why they are
  // worth asserting rather than recomputing.
  t("foreground on background", ratio("#15140f", "#fcfcfa"), 17.95);
  t("foreground on card", ratio("#15140f", "#ffffff"), 18.44);
  t("muted-foreground on background", ratio("#6a685e", "#fcfcfa"), 5.44);
  t("subtle-foreground on background", ratio("#8c8a7f", "#fcfcfa"), 3.38);
  t("signal-foreground on signal", ratio("#14170a", "#c7f23c"), 14.0);
  t("signal-ink on background", ratio("#41590a", "#fcfcfa"), 7.69);
  t("destructive on background", ratio("#b3261e", "#fcfcfa"), 6.36);
  t("agent on background", ratio("#4e1fbc", "#fcfcfa"), 9.1);
  // The finding the brand doc is loudest about: a Signal fill is 1.26:1
  // against the page and *requires* the hairline. A customer's pale accent is
  // the identical problem, which is why `accentEdge` exists.
  t("a signal fill on the page, unaided", ratio("#c7f23c", "#fcfcfa"), 1.26);

  // docs/03-brand.md §"dark"
  t("foreground on background, dark", ratio("#f6f5f0", "#0b0b09"), 18.05);
  t("muted-foreground on background, dark", ratio("#9b998f", "#0b0b09"), 6.89);
  t("signal on background, dark", ratio("#c7f23c", "#0b0b09"), 15.19);

  t("shorthand hex reads the same as longhand", ratio("#fff", "#000"), ratio("#ffffff", "#000000"));
  t("case does not matter", ratio("#C7F23C", "#FCFCFA"), ratio("#c7f23c", "#fcfcfa"));
}

// ---------------------------------------------------------------------------
// The guarantee
// ---------------------------------------------------------------------------

/** Every colour on a 16-step-per-channel lattice. 4,096 of them. */
function* colourCube(step: number): Generator<string> {
  for (let r = 0; r < 256; r += step) {
    for (let g = 0; g < 256; g += step) {
      for (let b = 0; b < 256; b += step) {
        yield `#${[r, g, b].map((v) => Math.min(v, 255).toString(16).padStart(2, "0")).join("")}`;
      }
    }
  }
}

function inkGuaranteeTests() {
  console.log("\nreadable ink — the claim is about every colour, so sweep every colour");

  // The negative control, and it is not decoration.
  //
  // "No colour in this sweep falls below 4.58:1" is an assertion of an absence,
  // and an empty violation list is equally consistent with "the guarantee holds"
  // and "the loop never ran". So the same sweep is first pointed at a chooser
  // that is deliberately wrong — always white, which is what you get if you
  // reach for the obvious answer — and it has to find violations. Only then
  // does the real sweep finding none mean anything.
  const sweep = (choose: (hex: string) => string) => {
    let worst = Infinity;
    let worstColour = "";
    let count = 0;
    for (const colour of colourCube(17)) {
      count += 1;
      const found = contrastRatio(choose(colour), colour);
      if (found < worst) {
        worst = found;
        worstColour = colour;
      }
    }
    return { worst, worstColour, count };
  };

  const broken = sweep(() => "#ffffff");
  ok("the sweep actually visits 4,096 colours", broken.count === 4096, broken.count);
  ok(
    "and it catches a naive always-white chooser",
    broken.worst < 4.5,
    { worst: broken.worst, at: broken.worstColour },
  );

  const real = sweep(readableInk);
  ok(
    "no colour that exists gets unreadable ink",
    real.worst >= MIN_READABLE_INK_RATIO,
    { worst: real.worst, at: real.worstColour },
  );
  // Not "it happens to hold on our lattice" — the two contrast curves cross at
  // luminance 0.1791, where both are 4.58:1, so that is the floor for every
  // colour in the space and not only the ones sampled here.
  ok(
    "and the worst case sits on the theoretical floor",
    real.worst >= 4.58 && real.worst < 4.62,
    real.worst,
  );

  t("the pale-yellow case, specifically", readableInk("#f2e85c"), "#000000");
  // The colour that made this function change. With the brand's warm near-black
  // as the dark option this came back at 4.29:1 and failed AA on a submit
  // button; with pure black it is comfortably over.
  ok("and the mid-orange that used to fail AA", contrastRatio(readableInk("#cc5522"), "#cc5522") >= 4.5);
  t("and its mirror, a deep blue", readableInk("#1d4ed8"), "#ffffff");
}

function derivedColourTests() {
  console.log("\nderived colours — a brand colour that has to become text");

  // The move globals.css makes by hand for signal-ink: Signal cannot be text on
  // paper at 1.26:1, so it is darkened until it can be. This does the same
  // thing for a customer's colour, and the point is that it always arrives.
  const derived = contrastingVariant("#c7f23c", "#fcfcfa", 4.5);
  ok("a pale accent is darkened until it can be text", contrastRatio(derived, "#fcfcfa") >= 4.5);
  ok("and stays recognisably the same hue", derived !== "#000000", derived);

  const untouched = contrastingVariant("#4e1fbc", "#fcfcfa", 4.5);
  t("a colour that already clears is returned as it is", untouched, "#4e1fbc");

  // The termination claim, swept. 216 colours against both grounds and both
  // thresholds this file actually asks for.
  let worst = Infinity;
  let checked = 0;
  for (const colour of colourCube(51)) {
    for (const ground of ["#fcfcfa", "#0b0b09"]) {
      for (const target of [3, 4.5]) {
        checked += 1;
        const found = contrastRatio(contrastingVariant(colour, ground, target), ground);
        if (found - target < worst) worst = found - target;
      }
    }
  }
  ok("the sweep ran", checked === 216 * 4, checked);
  ok("every colour reaches its target against both grounds", worst >= 0, worst);
}

// ---------------------------------------------------------------------------
// A colour is not a stylesheet
// ---------------------------------------------------------------------------

/**
 * Real-shaped attempts to leave the value and write CSS of one's own, plus the
 * near-misses that a sloppier pattern would let through — an unanchored regex
 * matches `#fff` inside the first of these and passes the rest along.
 */
const HOSTILE = [
  "#fff;}</style><script>alert(1)</script><style>{",
  "#fff;} body { display: none }",
  "#ffffff; background-image: url(https://evil.example/beacon.gif)",
  "red",
  "var(--anything)",
  "url(javascript:alert(1))",
  "expression(alert(1))",
  "#ffff",
  "#gggggg",
  "ffffff",
  "#fff ",
  " #fff",
  "#fff\n",
  "rgb(255,255,255)",
  "#fff/**/;color:red",
  "\\23 fff",
];

function injectionTests() {
  console.log("\ninjection — a colour ends up in a style attribute on a page we serve");

  // The positive control. If a valid colour did not reach the output, every
  // assertion below would pass against an empty bag and prove nothing.
  const clean = resolveTheme({ accent: "#1d4ed8" });
  ok("a valid colour does reach the custom properties", clean.vars["--form-accent"] === "#1d4ed8");

  for (const attempt of HOSTILE) {
    const strict = parseSchemaDocument({ fields: [], theme: { accent: attempt } });
    ok(`the document parse refuses ${JSON.stringify(attempt)}`, !strict.ok);

    const lenient = readStoredTheme({ theme: { accent: attempt } });
    ok(`the stored read drops it: ${JSON.stringify(attempt)}`, lenient.accent === undefined);

    const rendered = JSON.stringify(resolveTheme(lenient));
    ok(
      `and nothing of it survives to CSS: ${JSON.stringify(attempt)}`,
      !rendered.includes("evil.example") &&
        !rendered.includes("script") &&
        !rendered.includes("</style") &&
        !rendered.includes("url(") &&
        !rendered.includes("expression("),
      rendered,
    );
  }

  // Every value that reaches the style attribute is either a hex literal, a
  // `light-dark()` of two of them, or a string written in theme.ts. Nothing in
  // it may carry the characters that end a declaration or an attribute.
  for (const preset of THEME_PRESETS) {
    for (const [key, value] of Object.entries(resolveTheme(preset.theme).vars)) {
      ok(
        `${preset.id}'s ${key} carries no declaration break`,
        !/[;{}<>"']/.test(value),
        value,
      );
    }
  }

  // The enums are closed on the same terms. A string that is not one of the
  // names in theme.ts cannot select anything, so it cannot reach the output.
  for (const key of ["scheme", "radius", "font", "density", "button", "buttonWidth"]) {
    const parsed = parseSchemaDocument({ fields: [], theme: { [key]: "}</style>" } });
    ok(`${key} refuses a value that is not one of its names`, !parsed.ok);
    t(
      `and the stored read falls back to the default for ${key}`,
      resolveTheme(readStoredTheme({ theme: { [key]: "}</style>" } })).vars,
      {},
    );
  }
}

// ---------------------------------------------------------------------------
// An unthemed document is untouched
// ---------------------------------------------------------------------------

function untouchedTests() {
  console.log("\nadditive — a document written before #38 must be unchanged by it");

  const before = {
    formatVersion: 1,
    name: "Contact",
    fields: [
      { key: "email", label: "Work email", type: "email", required: true },
      { key: "notes", label: "Notes", type: "textarea", required: false },
    ],
  };
  const bytes = JSON.stringify(before);

  const read = readStoredDocument(JSON.parse(bytes));
  ok("it still reads", read !== null);
  t("and re-serialises to exactly the same bytes", JSON.stringify(serializeSchemaDocument(read!)), bytes);
  ok("with no theme key anywhere in it", !JSON.stringify(read).includes("theme"));

  // The renderer's side of the same claim: no custom properties, no font
  // family, so `FormView` spreads its own defaults and nothing else — which is
  // the object it built before this feature existed.
  t("and the renderer gets the untouched default", readTheme(JSON.parse(bytes)), DEFAULT_THEME);
  t("an empty theme is the same as no theme", readTheme({ ...before, theme: {} }), DEFAULT_THEME);
  t(
    "and so is a theme whose every value is already the default",
    readTheme({
      ...before,
      theme: { scheme: "auto", radius: "soft", font: "system", density: "comfortable" },
    }),
    DEFAULT_THEME,
  );

  // The unsaved-changes fingerprint is a string comparison of serialised
  // documents. A theme that always serialised to `{}` would mark every stored
  // schema dirty the moment somebody opened it — the trap `rules` was written
  // to avoid, and the reason `serializeTheme` returns undefined.
  ok("a default theme serialises to nothing at all", serializeTheme({}) === undefined);
  ok("and so does one set entirely to defaults", isDefaultTheme({ scheme: "auto", font: "system" }));
  ok("but a real one does not", serializeTheme({ accent: "#1d4ed8" }) !== undefined);

  // Round-tripping is what a version's immutability rests on: open a published
  // schema, save it again untouched, and the bytes have to match or the history
  // records an edit nobody made.
  const themed = {
    formatVersion: 1,
    fields: [{ key: "email", label: "Email", type: "email", required: true }],
    theme: { accent: "#1d4ed8", scheme: "dark", radius: "round", font: "mono" },
  };
  t(
    "a themed document round-trips byte for byte",
    JSON.stringify(serializeSchemaDocument(readStoredDocument(themed)!)),
    JSON.stringify(themed),
  );

  t("a shorthand colour is normalised once, on the way in", normalizeHex("#FFF"), "#ffffff");
  t(
    "so two spellings of one colour are one document",
    JSON.stringify(serializeTheme({ accent: "#FFF" })),
    JSON.stringify(serializeTheme({ accent: "#ffffff" })),
  );

  // The strict path refuses what the lenient path strips. Both behaviours are
  // deliberate and they are not the same behaviour.
  ok(
    "a declared file refuses a misspelled theme property",
    !parseSchemaDocument({ fields: [], theme: { colour: "#ffffff" } }).ok,
  );
  t(
    "but a stored row survives one",
    readStoredTheme({ theme: { accent: "#1d4ed8", colour: "#ffffff" } }).accent,
    "#1d4ed8",
  );
}

// ---------------------------------------------------------------------------
// What the resolved theme actually says
// ---------------------------------------------------------------------------

function resolveTests() {
  console.log("\nresolve — light, dark, and the honest version of auto");

  const auto = resolveTheme({ accent: "#c7f23c" });
  // `auto` emits no neutrals on purpose: left alone they resolve through
  // globals.css and follow the `.dark` class the theme script sets before
  // paint, so the form follows the visitor. Literals here would freeze it.
  ok("auto sets no page colour", auto.vars["--form-page"] === undefined);
  ok("auto sets no text colour", auto.vars["--form-fg"] === undefined);
  // Not `light dark` — that re-opens the question and hands it to
  // `prefers-color-scheme`, which is not what `.dark` was set from. Left
  // undeclared, the form inherits the single value `ThemeScript` wrote on
  // `<html>` alongside the class, and the two cannot disagree.
  t("auto declares no color-scheme of its own", auto.vars.colorScheme, undefined);
  // A pale accent needs a hairline on white and does not need one on near-black,
  // and an inline style cannot hold a media query — so the two answers ride in a
  // light-dark() pair, which resolves against the inherited declaration.
  ok(
    "and pairs the values that differ by scheme",
    auto.vars["--form-accent-edge"] === "light-dark(#15140f, transparent)",
    auto.vars["--form-accent-edge"],
  );

  const midTone = resolveTheme({ accent: "#0e7688" });
  ok(
    "a value that agrees in both schemes stays a plain literal",
    !JSON.stringify(midTone.vars["--form-accent-edge"]).includes("light-dark"),
    midTone.vars["--form-accent-edge"],
  );

  const light = resolveTheme({ accent: "#c7f23c", scheme: "light" });
  t("a pinned scheme declares itself", light.vars.colorScheme, "light");
  t("and names the page", light.vars["--form-page"], "#fcfcfa");
  t("and the text on it", light.vars["--form-fg"], "#15140f");
  ok("with no light-dark() left anywhere", !JSON.stringify(light.vars).includes("light-dark"));
  // The one token the renderer reads by its global name rather than through a
  // --form-* alias. Pinning light without pinning this leaves dark mode's lime
  // ring on a white form at 1.26:1.
  ok("and pins the focus ring", light.vars["--ring"] !== undefined);
  t("a pale accent keeps its hairline on light", light.vars["--form-accent-edge"], "#15140f");

  const dark = resolveTheme({ accent: "#c7f23c", scheme: "dark" });
  t("the same accent needs no hairline on dark", dark.vars["--form-accent-edge"], "transparent");
  t("and the dark page is named", dark.vars["--form-page"], "#0b0b09");

  const outline = resolveTheme({ accent: "#c7f23c", scheme: "light", button: "outline" });
  t("an outline button has no fill", outline.vars["--form-button-bg"], "transparent");
  // Against the page rather than the surface: an outline button has no fill,
  // so its ground is the form's ground.
  ok(
    "and its label is darkened until it is readable as text",
    contrastRatio(outline.vars["--form-button-ink"], "#fcfcfa") >= 4.5,
    outline.vars["--form-button-ink"],
  );
  const outlineDark = resolveTheme({ accent: "#c7f23c", scheme: "dark", button: "outline" });
  ok(
    "and on dark it is measured against the dark page, not the lighter surface",
    contrastRatio(outlineDark.vars["--form-button-ink"], "#0b0b09") >= 4.5,
    outlineDark.vars["--form-button-ink"],
  );
  ok(
    "which is not the raw brand colour, because that would be 1.3:1",
    outline.vars["--form-button-ink"] !== "#c7f23c",
  );
  // Checkboxes and radios use --form-accent directly, so hollowing out the
  // button must not hollow them out too.
  t("while the accent itself is untouched", outline.vars["--form-accent"], "#c7f23c");

  t("full width is expressed as a minimum", resolveTheme({ buttonWidth: "full" }).vars["--form-button-min"], "100%");
  t("inline width names nothing", resolveTheme({ buttonWidth: "inline" }).vars["--form-button-min"], undefined);

  const roomy = resolveTheme({ density: "roomy" });
  ok("density moves three measurements together", Object.keys(roomy.vars).length === 3, roomy.vars);
  t("comfortable repeats the renderer's own defaults", resolveTheme({ density: "comfortable" }).vars["--form-gap"], "1.75rem");

  ok("no font choice is a webfont", !JSON.stringify(resolveTheme({ font: "geometric" })).includes("http"));
  ok("and none of them is @font-face'd here", !JSON.stringify(resolveTheme({ font: "serif" })).includes("--font-"));
}

// ---------------------------------------------------------------------------
// Presets, and the report the builder shows
// ---------------------------------------------------------------------------

function presetTests() {
  console.log("\npresets — five that a person could ship without touching anything else");

  ok("there are five", THEME_PRESETS.length === 5, THEME_PRESETS.length);

  const seen = new Set<string>();
  for (const preset of THEME_PRESETS) {
    ok(`${preset.id} has a unique id`, !seen.has(preset.id));
    seen.add(preset.id);

    // A preset is applied, not referenced, so the values it writes have to be
    // values the strict document parse accepts — otherwise clicking it produces
    // a draft that cannot be saved.
    const parsed = parseSchemaDocument({ fields: [], theme: preset.theme });
    ok(`${preset.id} is a document the format accepts`, parsed.ok);

    const report = describeTheme(preset.theme);
    ok(`${preset.id} clears every minimum`, report.ok);
    ok(`${preset.id} is described in sentences, not codes`, report.notes.length > 0);

    // Round-tripping through the panel must land back on the same preset, or
    // the button someone just clicked stops looking selected.
    t(`${preset.id} is recognised after a round trip`, matchingPreset(preset.theme)?.id, preset.id);

    ok(`${preset.id} names no webfont`, !JSON.stringify(resolveTheme(preset.theme)).includes("http"));
  }

  // Five that look the same are not five presets.
  const shapes = new Set(THEME_PRESETS.map((preset) => JSON.stringify(serializeTheme(preset.theme))));
  ok("and no two of them are the same theme", shapes.size === 5, shapes.size);

  // The pale one is the interesting case: it is the shape of the complaint in
  // the issue, and it must be reported rather than silently fixed.
  const pale: StoredTheme = { accent: "#f2e85c", scheme: "light" };
  const report = describeTheme(pale);
  ok("a pale brand colour still passes every check", report.ok);
  ok(
    "because the corrections are reported, with the numbers",
    report.checks.some((check) => check.correction?.includes(":1")),
    report.checks,
  );
  ok(
    "and the report says the page and text colours are not settings",
    report.notes.some((note) => note.includes("not settings")),
  );

  const plain = describeTheme({});
  ok("a theme with no colour is still measured", plain.checks.length > 0);
  ok("and passes", plain.ok);
}

// ---------------------------------------------------------------------------
// Drift against the renderer
// ---------------------------------------------------------------------------

/**
 * A custom property nothing reads is a control that does nothing.
 *
 * `resolveTheme` and `form-view.tsx` are two halves of one contract and neither
 * imports the other's token names, so nothing but this stops them drifting.
 * `colorScheme` is exempt because it is not a custom property — it is a real
 * declaration riding in the same bag, for the reason `FormTheme.vars` explains.
 */
function driftTests() {
  console.log("\ndrift — every token this file emits has to be one the renderer reads");

  const renderer = readFileSync(
    new URL("../src/components/render/form-view.tsx", import.meta.url),
    "utf8",
  );
  const read = new Set(renderer.match(/--form-[a-z-]+/g) ?? []);
  ok("the renderer was actually read", read.size > 5, read.size);

  const emitted = new Set<string>();
  for (const theme of [
    ...THEME_PRESETS.map((preset) => preset.theme),
    { accent: "#c7f23c", scheme: "light", button: "outline", buttonWidth: "full", density: "roomy" } as StoredTheme,
    { accent: "#c7f23c", scheme: "dark", button: "outline", buttonWidth: "full", density: "compact" } as StoredTheme,
  ]) {
    for (const key of Object.keys(resolveTheme(theme).vars)) {
      if (key.startsWith("--form-")) emitted.add(key);
    }
  }

  const unread = [...emitted].filter((key) => !read.has(key));

  // Hard, in both directions. A token emitted here that `form-view.tsx` never
  // mentions is a control in the builder that does nothing in the browser —
  // which is exactly the state density and button style were in while the
  // renderer's half of #38 was still being written, and exactly the state a
  // passing test suite would otherwise have called fine.
  ok("every token this file emits is one the renderer reads", unread.length === 0, unread);

  // The reverse direction is a hard assertion in both states: a control the
  // panel offers must reach a token, or it is a setting that does nothing.
  for (const [control, token] of [
    ["corners", "--form-radius"],
    ["brand colour", "--form-accent"],
    ["spacing", "--form-pad"],
  ] as const) {
    ok(`the ${control} control reaches a token the renderer reads`, read.has(token), token);
  }

  // Every hex the resolver can emit is six digits and lowercase. Two spellings
  // of one colour in one style attribute is how a diff lies about a change.
  for (const preset of THEME_PRESETS) {
    for (const value of Object.values(resolveTheme(preset.theme).vars)) {
      for (const hex of value.match(/#[0-9a-fA-F]+/g) ?? []) {
        ok(`${preset.id} emits ${hex} in canonical form`, /^#[0-9a-f]{6}$/.test(hex), hex);
      }
    }
  }
}

// ---------------------------------------------------------------------------

contrastMathTests();
inkGuaranteeTests();
derivedColourTests();
injectionTests();
untouchedTests();
resolveTests();
presetTests();
driftTests();

// The schema itself, in one line: everything above goes through it.
ok("the theme schema is exported for the document to embed", themeSchema.safeParse({}).success);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
