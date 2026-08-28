import { decideWaitlist } from "../src/lib/waitlist-validate.ts";
let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; } else { fail++; }
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

console.log("REGRESSION — the bug the review caught:");
t("autofilled honeypot + real email -> silently accepted, NOT a validation error",
  decideWaitlist("real.person@agency.com", "Acme Corp"), { kind: "honeypot" });
t("honeypot whitespace only -> treated as empty, real signup proceeds",
  decideWaitlist("a@b.com", "   "), { kind: "accept", email: "a@b.com" });

console.log("\nNULL HANDLING — the second review finding:");
t("missing email field -> friendly copy, not a raw Zod string",
  decideWaitlist(null, null), { kind: "invalid", message: "Enter an email address." });
t("undefined email -> friendly copy",
  decideWaitlist(undefined, undefined), { kind: "invalid", message: "Enter an email address." });

console.log("\nORDINARY CASES:");
t("valid email", decideWaitlist("me@corey.co", ""), { kind: "accept", email: "me@corey.co" });
t("trims surrounding space", decideWaitlist("  me@corey.co  ", ""), { kind: "accept", email: "me@corey.co" });
t("empty string", decideWaitlist("", ""), { kind: "invalid", message: "Enter an email address." });
t("not an email", decideWaitlist("nope", ""), { kind: "invalid", message: "That doesn’t look like an email address." });
t("over 320 chars", decideWaitlist("a".repeat(315) + "@b.com", ""), { kind: "invalid", message: "That email address is too long." });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
