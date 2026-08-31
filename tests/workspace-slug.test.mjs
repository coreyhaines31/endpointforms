/**
 * Workspace slugs (#34).
 *
 * A slug becomes the render subdomain, so a bad one is not a validation
 * annoyance — it is a public hostname we cannot take back without breaking every
 * form a customer has embedded. This file is where that rule is actually
 * enforced; the form component only displays what it decides.
 */
import {
  RESERVED_SLUGS,
  SLUG_MESSAGES,
  suggestSlug,
  validateWorkspaceSlug,
} from "../src/lib/workspaces/slug.ts";

let pass = 0,
  fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok)
    console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

const ok = (slug) => ({ ok: true, slug });
const no = (message) => ({ ok: false, message });

console.log("\nRESERVED — hostnames we must keep, and hostnames nobody should hold:");
// docs/05 §4.3's reserved root paths, as hostnames. Handing any of these to a
// customer costs us a hostname we need and cannot reclaim.
for (const slug of [
  "api",
  "app",
  "login",
  "signup",
  "logout",
  "dashboard",
  "embed",
  "www",
  "mail",
  "status",
  "docs",
  "blog",
  "help",
  "support",
  "cdn",
  "static",
  "assets",
]) {
  t(`"${slug}" is reserved`, validateWorkspaceSlug(slug), no(SLUG_MESSAGES.reserved));
}

// Single letters from §4.3 fail the 3-character floor first, which is a
// different message but the same outcome. Asserted so a future change to the
// minimum length cannot silently free them up.
t('"f" is refused', validateWorkspaceSlug("f"), no(SLUG_MESSAGES.tooShort));
t('"r" is refused', validateWorkspaceSlug("r"), no(SLUG_MESSAGES.tooShort));
t('"e" is refused', validateWorkspaceSlug("e"), no(SLUG_MESSAGES.tooShort));
t('"f" is on the reserved list too', RESERVED_SLUGS.has("f"), true);
t('"r" is on the reserved list too', RESERVED_SLUGS.has("r"), true);
t('"e" is on the reserved list too', RESERVED_SLUGS.has("e"), true);

// The route segments the app itself uses. If either became claimable, a
// workspace could shadow /app/new or /app/invitations/[token].
t('"new" is reserved', validateWorkspaceSlug("new"), no(SLUG_MESSAGES.reserved));
t('"invitations" is reserved', validateWorkspaceSlug("invitations"), no(SLUG_MESSAGES.reserved));

console.log("\nFORMAT — a DNS label, not a URL slug:");
t("lowercases what was typed", validateWorkspaceSlug("Northwind"), ok("northwind"));
t("trims surrounding space", validateWorkspaceSlug("  northwind  "), ok("northwind"));
t("hyphens inside are fine", validateWorkspaceSlug("north-wind-co"), ok("north-wind-co"));
t("digits are fine", validateWorkspaceSlug("acme2026"), ok("acme2026"));

t("empty", validateWorkspaceSlug(""), no(SLUG_MESSAGES.empty));
t("null", validateWorkspaceSlug(null), no(SLUG_MESSAGES.empty));
t("undefined", validateWorkspaceSlug(undefined), no(SLUG_MESSAGES.empty));
t("two characters", validateWorkspaceSlug("ab"), no(SLUG_MESSAGES.tooShort));
t("64 characters", validateWorkspaceSlug("a".repeat(64)), no(SLUG_MESSAGES.tooLong));
t("63 characters is the DNS label limit and is allowed", validateWorkspaceSlug("a".repeat(63)), ok("a".repeat(63)));

t("leading hyphen", validateWorkspaceSlug("-acme"), no(SLUG_MESSAGES.format));
t("trailing hyphen", validateWorkspaceSlug("acme-"), no(SLUG_MESSAGES.format));
t("underscore", validateWorkspaceSlug("acme_co"), no(SLUG_MESSAGES.format));
t("space inside", validateWorkspaceSlug("acme co"), no(SLUG_MESSAGES.format));
t("dot — that would be another label", validateWorkspaceSlug("acme.co"), no(SLUG_MESSAGES.format));
t("slash", validateWorkspaceSlug("acme/co"), no(SLUG_MESSAGES.format));
t("non-ascii", validateWorkspaceSlug("acmé"), no(SLUG_MESSAGES.format));

// "xn--" is the punycode marker. Browsers and TLS tooling would render such a
// hostname as something other than what was typed — a ready-made homograph.
t("punycode prefix", validateWorkspaceSlug("xn--acme"), no(SLUG_MESSAGES.punycode));
t("XN-- uppercase is caught after lowercasing", validateWorkspaceSlug("XN--acme"), no(SLUG_MESSAGES.punycode));

console.log("\nSUGGESTIONS — best effort, never a serial number:");
t("from a plain name", suggestSlug("Northwind"), "northwind");
t("spaces become hyphens", suggestSlug("Northwind Trading"), "northwind-trading");
t("punctuation is dropped", suggestSlug("Acme, Inc."), "acme-inc");
t("accents are folded", suggestSlug("Café Ltd"), "cafe-ltd");
t("a reserved suggestion is withheld rather than offered", suggestSlug("API"), "");
t("nothing usable returns empty rather than inventing one", suggestSlug("&&&"), "");
t("every suggestion it does make is valid", suggestSlug("Northwind Trading Co."), "northwind-trading-co");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
