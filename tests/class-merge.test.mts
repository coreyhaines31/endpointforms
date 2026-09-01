/**
 * `cn()` must not eat the project's font-size tokens.
 *
 * tailwind-merge resolves conflicts from a built-in table of class groups. It
 * has never heard of `text-label` or `text-h3`, and its fallback for an unknown
 * `text-*` class is to treat it as a **text colour** — so a size token sitting
 * beside a real colour in the same `cn()` call was silently deleted:
 *
 *   cn("font-mono text-label uppercase", "text-muted-foreground")
 *     -> "font-mono uppercase text-muted-foreground"
 *
 * The element still rendered, one size too big, at runtime only, and only when
 * the two classes met. It was found and locally worked around **five** separate
 * times — `prose`, `readout`, `ProvenanceChip`, `Th`, `StatusChip` — before
 * anyone fixed the cause, because each instance looked like a one-off.
 *
 * These assertions are the reason it cannot come back. If someone adds a
 * `--text-*` token to `globals.css` and forgets `FONT_SIZE_TOKENS`, the last
 * test here fails and says so.
 */

import { readFileSync } from "node:fs";

import { cn, FONT_SIZE_TOKENS } from "../src/lib/utils.ts";

let pass = 0;
let fail = 0;

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
};

console.log("\nSIZE TOKENS SURVIVE A COLOUR IN THE SAME CALL\n");

const COLOURS = [
  "text-foreground",
  "text-muted-foreground",
  "text-signal-ink",
  "text-background",
];

for (const token of FONT_SIZE_TOKENS) {
  const size = `text-${token}`;
  for (const colour of COLOURS) {
    const merged = cn(`font-mono ${size} uppercase`, colour);
    ok(`${size} survives ${colour}`, merged.includes(size), merged);
  }
}

console.log("\nTHE REAL CONFLICTS STILL RESOLVE\n");

// Two sizes genuinely conflict, and the later one must win.
ok("text-h3 then text-label -> text-label", cn("text-h3", "text-label") === "text-label");
ok("text-label then text-h3 -> text-h3", cn("text-label", "text-h3") === "text-h3");

// Tailwind's own sizes must still conflict with ours, in both directions.
ok("text-sm then text-label -> text-label", cn("text-sm", "text-label") === "text-label");
ok("text-label then text-sm -> text-sm", cn("text-label", "text-sm") === "text-sm");

// Colours must still conflict with each other and not with sizes.
ok(
  "two colours still collapse",
  cn("text-foreground", "text-muted-foreground") === "text-muted-foreground",
);

console.log("\nTHE TOKEN LIST MATCHES THE STYLESHEET\n");

// The failure this guards against is additive: someone defines --text-caption
// in globals.css, uses text-caption beside a colour, and it silently vanishes
// exactly as text-label used to.
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const declared = new Set(
  [...css.matchAll(/^\s*--text-([a-z0-9]+)\s*:/gm)].map((m) => m[1]),
);

// Tailwind ships these itself, so they are not ours to register.
const BUILT_IN = new Set(["xs", "sm", "base", "lg", "xl"]);

const unregistered = [...declared].filter(
  (name) => !BUILT_IN.has(name) && !(FONT_SIZE_TOKENS as readonly string[]).includes(name),
);

ok(
  "every custom --text-* token is registered in FONT_SIZE_TOKENS",
  unregistered.length === 0,
  { unregistered, hint: "add these to FONT_SIZE_TOKENS in src/lib/utils.ts" },
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
