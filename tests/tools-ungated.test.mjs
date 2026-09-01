// The free calculators must never gate their result behind an email.
//
// docs/11-social-content.md §2.4 splits links into "asset links" (a jab — the
// link IS the value) and "ask links" (a hook, rationed to 3). That split only
// holds while the calculators are genuinely ungated. A post that says "no
// signup, the number is on the page" becomes a lie the moment one isn't.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
};

const GATE_PATTERNS = [
  /requireEmail/i, /gateResult/i, /unlockResult/i, /emailToUnlock/i,
  /showResult\s*&&\s*email/i, /hasSubmittedEmail/i,
];

const toolDirs = readdirSync("src/app/(site)/tools", { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name);

console.log("Free calculators must be ungated:\n");
t(`found tool pages to check (${toolDirs.length})`, toolDirs.length >= 8);

for (const dir of toolDirs) {
  const src = readFileSync(join("src/app/(site)/tools", dir, "page.tsx"), "utf8");
  const hit = GATE_PATTERNS.find((p) => p.test(src));
  t(`/tools/${dir} does not gate its result`, !hit, hit ? `matched ${hit}` : "");
}

const shell = readFileSync("src/components/tools/tool-page.tsx", "utf8");
const waitlistAt = shell.indexOf("<WaitlistForm");
const childrenAt = shell.indexOf("{children}");
t("waitlist renders after the calculator, not before it",
  waitlistAt === -1 || childrenAt === -1 || waitlistAt > childrenAt,
  `WaitlistForm at ${waitlistAt}, children at ${childrenAt}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
