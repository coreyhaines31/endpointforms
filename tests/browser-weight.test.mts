/**
 * What the hosted form is allowed to drag onto a customer's page.
 *
 * `src/lib/rules/evaluate.ts` ships to the browser on every hosted form that
 * has conditional logic. It imports `FormSchemaDocument` from
 * `src/lib/schema/format.ts`, and that module's first line is
 * `import { z } from "zod"`.
 *
 * The only thing keeping Zod off a lead-capture page is that the import is
 * written `import type`, which TypeScript erases. Delete four characters and
 * the page still renders, every test still passes, and a validation library
 * ships to every visitor of every customer's form. Nothing would say so.
 *
 * `algebra.ts` and `format.ts` are split for the same reason, and the split
 * looks exactly like something worth tidying up. This test is why it survives.
 *
 * So: walk the *runtime* import graph from each browser entry point — following
 * only imports TypeScript does not erase — and fail if it reaches a banned
 * package. A regex over one file would miss the case where a new intermediate
 * module is added between them, which is the likely shape of the regression.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

/**
 * Entry points that reach a visitor's browser, and what must never follow them.
 * `zod` is the one that motivated this; the rest are here because they are the
 * other easy ways to make a form page fat by accident.
 */
const ENTRY_POINTS = [
  "lib/rules/evaluate.ts",
  "lib/rules/algebra.ts",
  "lib/rules/attributes.ts",
];

const BANNED = ["zod", "drizzle-orm", "postgres", "@node-rs/argon2", "next-auth"];

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

/**
 * Every module specifier this file pulls in **at runtime**.
 *
 * `import type { X }` and `export type { X }` are erased by the compiler and so
 * cost the browser nothing. An inline `import { type X, y }` still loads the
 * module for `y`, so it counts.
 */
function runtimeImports(source: string): string[] {
  const out: string[] = [];
  const pattern = /(?:^|\n)\s*(import|export)(\s+type)?\b([\s\S]*?)from\s*["']([^"']+)["']/g;

  for (const match of source.matchAll(pattern)) {
    const typeKeyword = match[2];
    const clause = match[3] ?? "";
    const specifier = match[4];

    // `import type … from` / `export type … from` — erased entirely.
    if (typeKeyword) continue;

    // `import { type A, type B } from` with nothing else is also fully erased.
    const named = clause.match(/\{([\s\S]*)\}/);
    if (named) {
      const bindings = named[1]
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);
      const hasValue = bindings.some((b) => !b.startsWith("type "));
      const hasDefaultOrNamespace = /^[\s]*[A-Za-z_$][\w$]*\s*,/.test(clause) || clause.includes("*");
      if (bindings.length > 0 && !hasValue && !hasDefaultOrNamespace) continue;
    }

    out.push(specifier);
  }

  // Bare side-effect imports (`import "server-only"`) carry no `from`.
  for (const match of source.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) {
    out.push(match[1]);
  }

  return out;
}

function resolveLocal(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return resolve(SRC, specifier.slice(2));
  if (specifier.startsWith(".")) return resolve(dirname(fromFile), specifier);
  return null;
}

/** Follows runtime imports from an entry point and returns every package reached. */
function packagesReachedFrom(entry: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const seen = new Set<string>();

  const walk = (file: string, trail: string[]) => {
    if (seen.has(file)) return;
    seen.add(file);

    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      return;
    }

    for (const specifier of runtimeImports(source)) {
      const local = resolveLocal(file, specifier);
      if (local) {
        walk(local, [...trail, specifier]);
        continue;
      }
      if (specifier.startsWith("node:")) continue;
      const pkg = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      if (!found.has(pkg)) found.set(pkg, [...trail, specifier]);
    }
  };

  walk(resolve(SRC, entry), [entry]);
  return found;
}

console.log("\nBROWSER ENTRY POINTS DO NOT REACH SERVER-ONLY PACKAGES\n");

for (const entry of ENTRY_POINTS) {
  const reached = packagesReachedFrom(entry);
  for (const banned of BANNED) {
    const trail = reached.get(banned);
    ok(`${entry} does not reach ${banned}`, trail === undefined, trail && { via: trail });
  }
}

console.log("\nALGEBRA STAYS DEPENDENCY-FREE\n");

const algebra = readFileSync(resolve(SRC, "lib/rules/algebra.ts"), "utf8");
ok(
  "algebra.ts imports nothing at runtime",
  runtimeImports(algebra).length === 0,
  runtimeImports(algebra),
);

console.log("\nTHE GUARD ITSELF WORKS\n");

// If runtimeImports() ever stops seeing a plain import, every assertion above
// passes for the wrong reason. These pin the parser rather than the codebase.
ok(
  "a plain import is counted",
  runtimeImports('import { z } from "zod";').includes("zod"),
);
ok(
  "an `import type` is not counted",
  !runtimeImports('import type { A } from "zod";').includes("zod"),
);
ok(
  "an all-inline-type import is not counted",
  !runtimeImports('import { type A, type B } from "zod";').includes("zod"),
);
ok(
  "a mixed inline-type import IS counted",
  runtimeImports('import { type A, b } from "zod";').includes("zod"),
);
ok(
  "a side-effect import is counted",
  runtimeImports('import "zod";').includes("zod"),
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
