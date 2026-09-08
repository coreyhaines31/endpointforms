/**
 * Analytics reaches the marketing site and nothing else.
 *
 * `docs/05` §4 is the constraint: **customer form traffic must never share a
 * cookie domain with our analytics vendor.** A hosted form is somebody else's
 * lead capture, running on traffic they paid for; our measurement has no
 * business on it. The rule is easy to keep today and easy to break by accident
 * later — one import moved into `RootShell`, which four roots share, and every
 * hosted form starts reporting to us.
 *
 * So this walks the import graph the way `browser-weight.test.mts` does, and
 * asserts the loader is reachable from the marketing root and from no other.
 * The reachability assertions come with their inverse, because "not reachable"
 * and "the walker found nothing at all" are the same green otherwise.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SRC = resolve(import.meta.dirname, "../src");
const LOADER = resolve(SRC, "components/tracerkit.tsx");

let pass = 0;
let fail = 0;
const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

function localImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of source.matchAll(/from\s+["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]!);
  return out;
}

function resolveLocal(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = resolve(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (existsSync(candidate) && !candidate.endsWith("/")) {
      try {
        if (readFileSync(candidate, "utf8")) return candidate;
      } catch {
        /* a directory — keep looking */
      }
    }
  }
  return null;
}

/** Every local file reachable from an entry point, following imports. */
function reaches(entry: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [resolve(SRC, entry)];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    if (file === target) return true;
    for (const spec of localImports(file)) {
      const local = resolveLocal(file, spec);
      if (local && !seen.has(local)) stack.push(local);
    }
  }
  return false;
}

console.log("\nanalytics is on the marketing site and nowhere else");

// The control. Without this, every assertion below would also pass on a build
// where the loader had been deleted, or where the walker silently resolved
// nothing — which is a different bug and a worse one.
ok("the marketing root reaches the loader", reaches("app/(site)/layout.tsx", LOADER));

// The constraint itself.
ok(
  "the hosted form's root does not",
  !reaches("app/(forms)/layout.tsx", LOADER),
  "a customer's lead capture would be reporting to our analytics vendor",
);
ok(
  "nor does the form route itself",
  !reaches("app/(forms)/f/[formId]/route.tsx", LOADER),
);
ok(
  "nor does the document the form builds",
  !reaches("components/render/form-document.tsx", LOADER),
);
ok("nor does the signed-in app", !reaches("app/(app)/layout.tsx", LOADER));
ok("nor does the auth root", !reaches("app/(auth)/layout.tsx", LOADER));

// The shared shell is the way this breaks by accident: four roots import it.
ok(
  "and the shell four roots share does not reach it either",
  !reaches("components/root-shell.tsx", LOADER),
  "RootShell is shared by every root — analytics there is analytics everywhere",
);

// No key, no request: a fork must not report to us.
const source = readFileSync(LOADER, "utf8");
ok("the loader renders nothing without a key", /if\s*\(!key\)\s*return null/.test(source));

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exitCode = 1;
