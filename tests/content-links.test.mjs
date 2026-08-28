/**
 * Link integrity for the Tier 0.5 content sets.
 *
 * These two page sets are the internal-linking backbone (docs/09 Candidate 8),
 * so a dead `[label](/path)` in a data module quietly defeats the point of
 * building them. This walks every inline link, every `related`, `pairWith` and
 * `concepts` reference, and checks it resolves to a route that exists.
 */

import { GLOSSARY, GLOSSARY_GROUPS } from "../src/lib/glossary.ts";
import { SPAM_METHODS } from "../src/lib/spam-methods.ts";
import { blockLinks } from "../src/lib/content-blocks.ts";

let pass = 0;
let fail = 0;
const t = (name, ok, detail) => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail) console.log(`        ${detail}`);
};

/** Routes that exist outside the two data modules. */
const STATIC_ROUTES = new Set([
  "/",
  "/about",
  "/open-source",
  "/privacy",
  "/terms",
  "/the-dishonest-dashboard",
  "/glossary",
  "/spam",
]);

const glossarySlugs = new Set(GLOSSARY.map((t) => t.slug));
const spamSlugs = new Set(SPAM_METHODS.map((m) => m.slug));

const resolves = (href) => {
  if (!href.startsWith("/")) return true; // external, not our problem
  if (STATIC_ROUTES.has(href)) return true;
  if (href.startsWith("/glossary/")) return glossarySlugs.has(href.slice(10));
  if (href.startsWith("/spam/")) return spamSlugs.has(href.slice(6));
  return false;
};

const allBlocks = (entry, keys) => keys.flatMap((k) => entry[k] ?? []);

console.log("SHAPE:");
t("no duplicate glossary slugs", glossarySlugs.size === GLOSSARY.length);
t("no duplicate spam slugs", spamSlugs.size === SPAM_METHODS.length);
t("25 glossary terms shipped", GLOSSARY.length === 25, `got ${GLOSSARY.length}`);
t("12 spam teardowns shipped", SPAM_METHODS.length === 12, `got ${SPAM_METHODS.length}`);
t(
  "every glossary group is a declared group",
  GLOSSARY.every((term) => GLOSSARY_GROUPS.includes(term.group)),
);

console.log("\nINLINE LINKS:");
for (const term of GLOSSARY) {
  const links = blockLinks([
    ...allBlocks(term, ["definition", "whyItMatters", "inPractice"]),
    ...term.mistake.blocks,
  ]);
  const broken = links.filter((href) => !resolves(href));
  t(`/glossary/${term.slug} — ${links.length} inline links`, broken.length === 0, broken.join(", "));
}
for (const method of SPAM_METHODS) {
  const links = blockLinks(
    allBlocks(method, ["howItWorks", "whatItStops", "howItsDefeated", "whenToUse"]),
  );
  const broken = links.filter((href) => !resolves(href));
  t(`/spam/${method.slug} — ${links.length} inline links`, broken.length === 0, broken.join(", "));
}

console.log("\nCROSS-REFERENCES:");
for (const term of GLOSSARY) {
  const badRelated = term.related.filter((s) => !glossarySlugs.has(s));
  t(`/glossary/${term.slug} related`, badRelated.length === 0, badRelated.join(", "));
  const badSpam = (term.spam ?? []).filter((s) => !spamSlugs.has(s));
  t(`/glossary/${term.slug} spam refs`, badSpam.length === 0, badSpam.join(", "));
  t(`/glossary/${term.slug} does not link to itself`, !term.related.includes(term.slug));
}
for (const method of SPAM_METHODS) {
  const badPairs = method.pairWith.filter((p) => !spamSlugs.has(p.slug));
  t(`/spam/${method.slug} pairWith`, badPairs.length === 0, badPairs.map((p) => p.slug).join(", "));
  const badConcepts = method.concepts.filter((s) => !glossarySlugs.has(s));
  t(`/spam/${method.slug} concepts`, badConcepts.length === 0, badConcepts.join(", "));
  t(
    `/spam/${method.slug} does not pair with itself`,
    !method.pairWith.some((p) => p.slug === method.slug),
  );
}

console.log("\nEDITORIAL GUARDRAILS:");
t(
  "every glossary term has a definition, why, practice and a mistake",
  GLOSSARY.every(
    (term) =>
      term.definition.length > 0 &&
      term.whyItMatters.length > 0 &&
      term.inPractice.length > 0 &&
      term.mistake.blocks.length > 0,
  ),
);
t(
  "every spam teardown has all four sections plus a pairing",
  SPAM_METHODS.every(
    (m) =>
      m.howItWorks.length > 0 &&
      m.whatItStops.length > 0 &&
      m.howItsDefeated.length > 0 &&
      m.whenToUse.length > 0 &&
      m.pairWith.length > 0,
  ),
);
t(
  "every quote carries an attribution",
  [...GLOSSARY, ...SPAM_METHODS].every((entry) =>
    Object.values(entry)
      .filter(Array.isArray)
      .flat()
      .every((b) => b?.kind !== "quote" || (b.attribution && b.attribution.length > 4)),
  ),
);
t(
  "the OTP page still concludes that it works and isn’t us",
  SPAM_METHODS.find((m) => m.slug === "otp-verification")
    ?.shortAnswer.includes("not a thing we are selling you") === true,
);
t(
  "no page says “yield optimization” (trademark collision)",
  !JSON.stringify([GLOSSARY, SPAM_METHODS]).toLowerCase().includes("yield optimization"),
);
t(
  "“Handshake” only survives as the lowercase verb",
  !JSON.stringify([GLOSSARY, SPAM_METHODS]).includes("Handshake”") ||
    JSON.stringify(GLOSSARY).includes("was called “Handshake” until August 2026"),
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
