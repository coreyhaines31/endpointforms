/**
 * The committed form stylesheet must match what `globals.css` compiles to (#56).
 *
 * `src/lib/render/form-css.generated.ts` is checked in so that a fresh clone
 * typechecks and lints without running a build first. Checked-in build output
 * is checked-in build output, though: edit a token in `globals.css`, forget the
 * regenerate, and the hosted form keeps shipping last month's stylesheet while
 * every other surface moves on. Nothing else would notice — the app builds, the
 * types pass, and the drift is invisible until someone opens a customer's form.
 *
 * So this recompiles and compares. It is the same guard shape as the class-merge
 * meta-test: assert that the generated artefact still follows its source.
 */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const GENERATED = "src/lib/render/form-css.generated.ts";

let pass = 0;
let fail = 0;
const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${String(detail).slice(0, 400)}`);
};

console.log("\nthe committed form stylesheet matches its source");

const before = await readFile(GENERATED, "utf8");

// Regenerating in place and comparing is the whole test: if the compile output
// differs, the file on disk changes and the diff is the failure.
execFileSync(
  "node",
  [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--experimental-strip-types",
    "scripts/build-form-css.mts",
  ],
  { stdio: "pipe" },
);

const after = await readFile(GENERATED, "utf8");

ok(
  "regenerating produces the committed file — run `npm run build:form-css` and commit if this fails",
  before === after,
  before === after ? "" : `length ${before.length} -> ${after.length}`,
);

// A control. Without this the assertion above would also pass on a build where
// the compiler silently produced nothing at all, which is a different bug.
const { FORM_CSS } = await import("../src/lib/render/form-css.generated.ts");
ok("the stylesheet is not empty", FORM_CSS.length > 10_000, FORM_CSS.length);
ok("and carries the form's own tokens", FORM_CSS.includes("--color-"), FORM_CSS.slice(0, 80));

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exitCode = 1;
