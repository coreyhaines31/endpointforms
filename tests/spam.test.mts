/**
 * Spam and abuse defenses (#31).
 *
 * Every signal is tested in isolation, then in combination, then adversarially.
 * The adversarial section matters more than the rest: this product published
 * twelve teardowns saying every existing defense is defeated, so a green suite
 * here must not be readable as a claim that ours is not.
 *
 * Two things are asserted that look like failures and are not:
 *
 *   - `SLEEP: a bot that waits three seconds defeats the timing signal`
 *   - `SKIP: a bot that reads the source and skips the decoys scores nothing`
 *
 * Both are true, both are documented in the module's own comments, and they are
 * here so that nobody later "fixes" them without understanding what they cost.
 *
 * No database and no server: `node --experimental-strip-types tests/spam.test.mts`.
 */

import {
  assessSpam,
  checkHoneypot,
  checkLists,
  checkTiming,
  clientFingerprint,
  DEFAULT_SPAM_POLICY,
  EMPTY_SPAM_LISTS,
  HONEYPOT_BAIT_FIELD,
  HONEYPOT_FIELD,
  observe,
  payloadHash,
  resetVelocity,
  SPAM_THRESHOLD,
  textFields,
  type SpamAssessment,
  type SpamReason,
} from "../src/lib/spam/index.ts";
import { checkContent, checkEmailDomains } from "../src/lib/spam/content.ts";
import { mintOriginToken } from "../src/lib/origin/index.ts";
import { PHRASE_RULES, MARKUP_RULES } from "../src/lib/spam/rules.ts";

process.env.ORIGIN_TOKEN_SECRET = "spam-test-secret";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const isOk = JSON.stringify(got) === JSON.stringify(want);
  if (isOk) pass++;
  else fail++;
  console.log(`  ${isOk ? "PASS" : "FAIL"}  ${name}`);
  if (!isOk) {
    console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  }
};

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

const ENDPOINT = "ep_spam_test";
const NOW = 1_800_000_000_000;

/** An ordinary, entirely legitimate lead. The control for everything below. */
const REAL_LEAD = {
  name: "Priya Raghunathan",
  email: "priya@northwindlogistics.co.uk",
  company: "Northwind Logistics",
  message:
    "Hi — we run about forty vehicles and we are looking at replacing our current dispatch software before the end of the quarter. Could someone give me a call this week to talk through pricing?",
};

const rule = (assessment: SpamAssessment, code: string): SpamReason | undefined =>
  assessment.reasons.find((reason) => reason.code === code && reason.weight !== 0);

const ruleIds = (reasons: SpamReason[]): string[] =>
  reasons.filter((reason) => reason.weight !== 0).map((reason) => reason.rule);

const base = (over: Partial<Parameters<typeof assessSpam>[0]> = {}) =>
  assessSpam({
    values: { ...REAL_LEAD },
    endpointPublicId: ENDPOINT,
    ipHash: "sha256:client-a",
    now: NOW,
    ...over,
  });

// ---------------------------------------------------------------------------
console.log("\nThe control: an ordinary lead");
// ---------------------------------------------------------------------------
{
  const clean = base();
  t("an ordinary lead scores zero", clean.score, 0);
  t("and is clear", clean.state, "clear");
  ok(
    "and every signal is still recorded, not just the ones that fired",
    clean.reasons.length >= 8,
    clean.reasons.map((reason) => reason.rule),
  );
  ok(
    "the reasons carry the threshold so the row stays readable later",
    clean.reasons.some(
      (reason) => reason.code === "threshold" && reason.observed.includes(`threshold=${SPAM_THRESHOLD}`),
    ),
  );

  const summed = clean.reasons.reduce((total, reason) => total + reason.weight, 0);
  t("the printed score is the sum of the column, exactly", summed, clean.score);
}

// ---------------------------------------------------------------------------
console.log("\nHoneypot");
// ---------------------------------------------------------------------------
{
  const empty = checkHoneypot({ values: REAL_LEAD });
  t("an untouched decoy scores nothing", empty.weight, 0);
  ok(
    "and still records itself, because a quiet decoy is information",
    empty.rule === "honeypot.empty" && empty.note.length > 0,
  );

  const filled = checkHoneypot({ values: { ...REAL_LEAD, [HONEYPOT_FIELD]: "http://x.example" } });
  t("the reserved decoy fires", filled.rule, "honeypot.reserved_decoy");
  ok("and alone clears the bar", filled.weight >= SPAM_THRESHOLD, filled.weight);

  const bait = checkHoneypot({ values: { ...REAL_LEAD, [HONEYPOT_BAIT_FIELD]: "acme.com" } });
  t("the attractive decoy fires more softly", bait.rule, "honeypot.bait_decoy");
  ok(
    "and cannot flag alone, because password managers fill that name",
    bait.weight < SPAM_THRESHOLD,
    bait.weight,
  );

  const whitespace = checkHoneypot({ values: { ...REAL_LEAD, [HONEYPOT_FIELD]: "   " } });
  t("whitespace in a decoy is not a fill", whitespace.weight, 0);

  const collision = checkHoneypot({
    values: { ...REAL_LEAD, [HONEYPOT_BAIT_FIELD]: "https://northwindlogistics.co.uk" },
    realFieldNames: ["name", "email", HONEYPOT_BAIT_FIELD],
  });
  t(
    "a customer who really collects company_website keeps their data and loses that decoy",
    collision.weight,
    0,
  );

  const both = checkHoneypot({
    values: { ...REAL_LEAD, [HONEYPOT_FIELD]: "a", [HONEYPOT_BAIT_FIELD]: "b" },
  });
  t("a filler that fills both is scored once, at the higher weight", both.rule, "honeypot.reserved_decoy");
}

// ---------------------------------------------------------------------------
console.log("\nTiming");
// ---------------------------------------------------------------------------
{
  const noToken = checkTiming({ token: null, endpointPublicId: ENDPOINT, now: NOW });
  t("no token is never held against a submission", noToken.weight, 0);
  t("and says so", noToken.rule, "timing.no_token");

  const instant = checkTiming({
    token: mintOriginToken(ENDPOINT, NOW - 200),
    endpointPublicId: ENDPOINT,
    now: NOW,
  });
  t("a 200ms fill is the instant tier", instant.rule, "timing.instant");
  ok("and cannot flag alone", instant.weight < SPAM_THRESHOLD, instant.weight);

  const fast = checkTiming({
    token: mintOriginToken(ENDPOINT, NOW - 2_000),
    endpointPublicId: ENDPOINT,
    now: NOW,
  });
  t("two seconds is fast, not instant", fast.rule, "timing.fast");

  const ordinary = checkTiming({
    token: mintOriginToken(ENDPOINT, NOW - 45_000),
    endpointPublicId: ENDPOINT,
    now: NOW,
  });
  t("forty-five seconds scores nothing", ordinary.weight, 0);
  ok("and the elapsed time is stored anyway", ordinary.observed.includes("45"), ordinary.observed);

  // `/spam/time-traps`: the person who leaves a quote form open to go and find
  // last year's invoice is the most qualified person who touched it today.
  const patient = checkTiming({
    token: mintOriginToken(ENDPOINT, NOW - 40 * 60 * 1000),
    endpointPublicId: ENDPOINT,
    now: NOW,
  });
  t("a form left open for forty minutes is NOT penalised — there is no upper bound", patient.weight, 0);

  const forged = checkTiming({ token: "eo1.x.y.z.notasignature", endpointPublicId: ENDPOINT, now: NOW });
  t(
    "a fabricated token is not double-counted here — Origin already scores it",
    forged.weight,
    0,
  );
}

// ---------------------------------------------------------------------------
console.log("\nContent — links");
// ---------------------------------------------------------------------------
{
  const oneLink = checkContent(
    textFields({ message: "Have a look at https://ourcase.example/study and let me know." }),
  );
  t("a single link in a message is ordinary", ruleIds(oneLink).length, 0);

  const urlField = checkContent(
    textFields({ website: "https://spam.example", name: "Dave" }),
  );
  t("a URL in a field that asks for a URL is not scored", ruleIds(urlField).length, 0);

  const shortField = checkContent(textFields({ name: "https://buy-now.example", email: "a@b.com" }));
  ok(
    "a link in a name box is scored",
    ruleIds(shortField).includes("links.link_in_short_field"),
    ruleIds(shortField),
  );

  const everywhere = checkContent(
    textFields({
      message: "Great site https://a.example — see also https://b.example for more information",
      notes: "Also worth reading https://c.example about our approach to this whole thing",
    }),
  );
  ok(
    "links in every message field is the top tier",
    ruleIds(everywhere).includes("links.every_text_field"),
    ruleIds(everywhere),
  );

  const stuffed = checkContent(
    textFields({
      message:
        "https://a.example https://b.example https://c.example https://d.example https://e.example",
    }),
  );
  ok("four or more links in one field is scored", ruleIds(stuffed).length > 0, ruleIds(stuffed));
}

// ---------------------------------------------------------------------------
console.log("\nContent — markup, phrases, unicode");
// ---------------------------------------------------------------------------
{
  const bbcode = checkContent(textFields({ message: "Nice site [url=http://x.example]click[/url]" }));
  ok("BBCode fires", ruleIds(bbcode).includes("markup.bbcode"), ruleIds(bbcode));

  const anchor = checkContent(textFields({ message: '<a href="http://x.example">hi</a>' }));
  ok("a raw anchor tag fires", ruleIds(anchor).includes("markup.anchor_tag"), ruleIds(anchor));

  ok(
    "every markup rule matches at least one thing (no dead rules)",
    MARKUP_RULES.every((markupRule) =>
      markupRule.test.test(
        markupRule.id === "markup.bbcode"
          ? "[url=http://x]y[/url]"
          : markupRule.id === "markup.anchor_tag"
            ? '<a href="x">y</a>'
            : "<script>",
      ),
    ),
  );

  const seo = checkContent(
    textFields({ message: "I can get you backlinks and improve your domain authority." }),
  );
  ok("the SEO template fires", ruleIds(seo).includes("phrases.seo_pitch"), ruleIds(seo));

  // The cap is the thing that stops vocabulary flagging on its own.
  const everyPhrase = checkContent(
    textFields({
      message:
        "SEO backlinks. I came across your website. Offshore development team. Bitcoin airdrop. Casino jackpot. Escorts. No prescription. Act now, this is not spam.",
    }),
  );
  const phraseTotal = everyPhrase
    .filter((reason) => reason.code === "phrases")
    .reduce((total, reason) => total + reason.weight, 0);
  ok(
    "every phrase rule at once is still capped below the bar",
    phraseTotal < SPAM_THRESHOLD,
    phraseTotal,
  );
  ok(
    "and the cap is shown as its own line rather than hidden",
    ruleIds(everyPhrase).includes("phrases.cap"),
    ruleIds(everyPhrase),
  );

  ok(
    "every phrase rule is a real regex with a note (no placeholders shipped)",
    PHRASE_RULES.every((phraseRule) => phraseRule.note.length > 20 && phraseRule.weight > 0),
  );

  const homoglyph = checkContent(textFields({ message: "Best сasino bonuses here" }));
  ok(
    "a Latin word with a Cyrillic letter inside it fires",
    ruleIds(homoglyph).includes("homoglyph.mixed_script"),
    ruleIds(homoglyph),
  );

  const russian = checkContent(textFields({ message: "Здравствуйте, мне нужна помощь" }));
  t("a message written entirely in Russian is NOT scored", ruleIds(russian).length, 0);

  const zeroWidth = checkContent(textFields({ message: "ca​sino bonus" }));
  ok(
    "a zero-width character inside a word fires",
    ruleIds(zeroWidth).includes("homoglyph.invisible_characters"),
    ruleIds(zeroWidth),
  );
}

// ---------------------------------------------------------------------------
console.log("\nEmail domains");
// ---------------------------------------------------------------------------
{
  const disposable = checkEmailDomains(textFields({ email: "someone@mailinator.com" }));
  t("a throwaway address is flagged", disposable.rule, "disposable_email.known_domain");
  ok(
    "at a weight that cannot reject anything on its own",
    disposable.weight < SPAM_THRESHOLD,
    disposable.weight,
  );

  const relay = checkEmailDomains(textFields({ email: "abc123@privaterelay.appleid.com" }));
  t("an Apple private relay is explicitly not scored", relay.weight, 0);
  t("and is named as a relay rather than a disposable", relay.code, "relay_email");

  const simplelogin = checkEmailDomains(textFields({ email: "x@aleeas.com" }));
  t("a SimpleLogin alias domain is a relay too", simplelogin.code, "relay_email");

  // `/spam/disposable-email-blocking` calls blocking free mail "a policy
  // somebody wrote in 2014". This asserts we did not ship it.
  const gmail = checkEmailDomains(textFields({ email: "founder@gmail.com" }));
  t("free mail is never scored", gmail.weight, 0);

  const subdomain = checkEmailDomains(textFields({ email: "x@mail.mailinator.com" }));
  t("a subdomain of a listed disposable matches", subdomain.rule, "disposable_email.known_domain");
}

// ---------------------------------------------------------------------------
console.log("\nWorkspace lists");
// ---------------------------------------------------------------------------
{
  const blockedDomain = base({
    lists: { ...EMPTY_SPAM_LISTS, blockedEmailDomains: ["northwindlogistics.co.uk"] },
  });
  t("a blocklisted domain flags", blockedDomain.state, "flagged");
  ok("as an arithmetic entry, not a bypass", (rule(blockedDomain, "blocklist")?.weight ?? 0) > 0);
  t(
    "and the column still adds up",
    blockedDomain.reasons.reduce((total, reason) => total + reason.weight, 0),
    blockedDomain.score,
  );

  const blockedIp = base({
    lists: { ...EMPTY_SPAM_LISTS, blockedIpHashes: ["sha256:client-a"] },
  });
  t("a blocklisted address flags", blockedIp.state, "flagged");

  const keyword = base({
    values: { ...REAL_LEAD, message: "we want to discuss a partnership" },
    lists: { ...EMPTY_SPAM_LISTS, blockedKeywords: ["partnership"] },
  });
  t("a blocklisted keyword flags", keyword.state, "flagged");

  // The asymmetry: the allowlist beats everything, including a filled decoy.
  const allowed = base({
    values: { ...REAL_LEAD, [HONEYPOT_FIELD]: "http://spam.example", message: "backlinks casino" },
    lists: { ...EMPTY_SPAM_LISTS, allowedEmailDomains: ["northwindlogistics.co.uk"] },
  });
  t("an allowlisted domain is clear even with a filled decoy", allowed.state, "clear");
  t("and scoring stopped rather than continuing quietly", allowed.score, 0);
  ok(
    "and the reason says why",
    allowed.reasons.some((reason) => reason.code === "allowlist"),
    ruleIds(allowed.reasons),
  );

  const allowlistWinsOverBlocklist = checkLists({
    fields: textFields({ email: "x@acme.example" }),
    ipHash: "sha256:blocked",
    lists: {
      ...EMPTY_SPAM_LISTS,
      blockedIpHashes: ["sha256:blocked"],
      allowedEmailDomains: ["acme.example"],
    },
  });
  ok("allowlist beats blocklist", allowlistWinsOverBlocklist.allowed !== null);
}

// ---------------------------------------------------------------------------
console.log("\nDuplicates and velocity");
// ---------------------------------------------------------------------------
{
  resetVelocity();

  const hash = payloadHash(REAL_LEAD);
  const fpA = clientFingerprint("endpoint-1", "sha256:a", "Chrome");
  const fpB = clientFingerprint("endpoint-1", "sha256:b", "Chrome");

  t("key order does not change the payload hash", payloadHash({ b: 1, a: 2 }), payloadHash({ a: 2, b: 1 }));
  ok("different payloads hash differently", payloadHash({ a: 1 }) !== payloadHash({ a: 2 }));

  const first = observe({
    endpointId: "endpoint-1",
    contentHash: hash,
    fingerprint: fpA,
    clientKey: "sha256:a",
    now: NOW,
  });
  t("the first sighting is a first sighting", first.duplicateCount, 1);

  const sameClient = observe({
    endpointId: "endpoint-1",
    contentHash: hash,
    fingerprint: fpA,
    clientKey: "sha256:a",
    now: NOW + 500,
  });
  const doubleClick = base({ velocity: sameClient });
  t(
    "a double-clicked submit button is not spam — idempotency already owns it",
    rule(doubleClick, "duplicate"),
    undefined,
  );

  const otherClient = observe({
    endpointId: "endpoint-1",
    contentHash: hash,
    fingerprint: fpB,
    clientKey: "sha256:b",
    now: NOW + 1_000,
  });
  ok("a second client sending the same payload is noticed", otherClient.duplicateClients >= 2);
  const blast = base({ velocity: otherClient });
  ok(
    "and is scored, but not enough to flag on its own",
    (rule(blast, "duplicate")?.weight ?? 0) > 0 && blast.state === "clear",
    { score: blast.score },
  );

  resetVelocity();
  let burst = { duplicateCount: 1, duplicateClients: 1, burstCount: 1 };
  for (let i = 0; i < 30; i++) {
    burst = observe({
      endpointId: "endpoint-2",
      contentHash: payloadHash({ n: i }),
      fingerprint: fpA,
      clientKey: "sha256:a",
      now: NOW + i,
    });
  }
  ok("a burst from one fingerprint is counted", burst.burstCount >= 25, burst);
  const bursting = base({ velocity: burst });
  ok(
    "and scored — but a busy office is never refused, only marked",
    (rule(bursting, "velocity")?.weight ?? 0) > 0 && bursting.state === "clear",
    { score: bursting.score },
  );

  resetVelocity();
  const expired = observe({
    endpointId: "endpoint-3",
    contentHash: hash,
    fingerprint: fpA,
    clientKey: "sha256:a",
    now: NOW,
  });
  t("a fresh window starts at one", expired.duplicateCount, 1);
  const laterWindow = observe({
    endpointId: "endpoint-3",
    contentHash: hash,
    fingerprint: fpA,
    clientKey: "sha256:a",
    now: NOW + 7 * 60 * 60 * 1000,
  });
  t("the same payload seven hours later is a new blast, not a duplicate", laterWindow.duplicateCount, 1);
}

// ---------------------------------------------------------------------------
console.log("\nCombination — the arithmetic");
// ---------------------------------------------------------------------------
{
  const decoy = base({ values: { ...REAL_LEAD, [HONEYPOT_FIELD]: "http://x.example" } });
  t("a filled reserved decoy flags on its own", decoy.state, "flagged");

  const instantOnly = base({ token: mintOriginToken(ENDPOINT, NOW - 100) });
  t("an instant submit alone does not flag", instantOnly.state, "clear");

  const disposableOnly = base({ values: { ...REAL_LEAD, email: "x@mailinator.com" } });
  t("a throwaway address alone does not flag", disposableOnly.state, "clear");

  const seoBlast = base({
    values: {
      name: "Alex",
      email: "alex@mailinator.com",
      message:
        "I came across your website and noticed some issues. We can get you backlinks — https://a.example https://b.example https://c.example https://d.example",
    },
    token: mintOriginToken(ENDPOINT, NOW - 300),
  });
  t("a real spam template flags", seoBlast.state, "flagged");
  ok("well clear of the bar", seoBlast.score >= SPAM_THRESHOLD + 2, seoBlast.score);

  const disabled = base({ policy: { enabled: false }, values: { ...REAL_LEAD, [HONEYPOT_FIELD]: "x" } });
  t("scoring can be switched off entirely", disabled.state, "clear");
  t("and says so on the row", disabled.reasons[0]?.rule, "policy.disabled");

  const oneSignalOff = base({
    policy: { honeypot: false },
    values: { ...REAL_LEAD, [HONEYPOT_FIELD]: "x" },
  });
  t("and one signal at a time", oneSignalOff.state, "clear");

  const raised = base({
    values: { ...REAL_LEAD, [HONEYPOT_FIELD]: "x" },
    policy: { threshold: 99 },
  });
  t("a customer can raise their own bar", raised.state, "clear");
  ok(
    "and the bar they used is stored on the row",
    raised.reasons.some((reason) => reason.observed.includes("threshold=99")),
  );
}

// ---------------------------------------------------------------------------
console.log("\nAdversarial — what still gets through");
// ---------------------------------------------------------------------------
{
  // These are not aspirational. They are what `/spam/*` already says in public,
  // asserted here so a green suite is never read as "our defenses hold".

  const slept = base({
    values: { ...REAL_LEAD },
    token: mintOriginToken(ENDPOINT, NOW - 9_000),
  });
  t("SLEEP: a bot that waits nine seconds defeats the timing signal", slept.state, "clear");

  const skipped = base({ values: { ...REAL_LEAD } });
  t("SKIP: a bot that reads the AGPL source and skips the decoys scores nothing", skipped.score, 0);

  const polished = base({
    values: {
      name: "Jonathan Meyer",
      email: "j.meyer@meyer-consulting.de",
      company: "Meyer Consulting GmbH",
      message:
        "We are evaluating options for our team of twelve and would like to arrange a call next week.",
    },
    token: mintOriginToken(ENDPOINT, NOW - 60_000),
  });
  t(
    "TIRE-KICKER: a polished, deliverable, corporate submission scores zero — content heuristics cannot see intent",
    polished.score,
    0,
  );

  const rotating = base({
    values: {
      name: "Sales",
      email: "hello@brand-new-domain-nobody-has-listed.example",
      message: "Quick question about your pricing tiers, are you able to send a quote?",
    },
  });
  t(
    "FRESH DOMAIN: a throwaway on a domain no list has caught up with scores zero",
    rotating.score,
    0,
  );

  // Weight arithmetic, not vibes. The claim `assess.ts` makes is that no
  // *single* content signal can flag, so several independent ones have to
  // agree. Asserted per signal rather than in aggregate, because the aggregate
  // claim would be false and it would be dishonest to write a test that hid it:
  // vocabulary at its cap plus a throwaway address does reach the bar, and
  // that combination is one we are content to flag.
  const heavy = base({
    values: {
      name: "аdmin",
      email: "x@mailinator.com",
      message: "casino backlinks [url=http://x]buy[/url] https://a.example https://b.example https://c.example",
    },
  });
  const perSignal = new Map<string, number>();
  for (const reason of heavy.reasons) {
    perSignal.set(reason.code, (perSignal.get(reason.code) ?? 0) + reason.weight);
  }
  const contentCodes = ["links", "markup", "phrases", "homoglyph", "gibberish", "disposable_email"];
  const overBar = contentCodes.filter((code) => (perSignal.get(code) ?? 0) >= SPAM_THRESHOLD);
  t("no single content signal can reach the bar on its own", overBar, []);
  ok(
    "but several agreeing does flag, which is the point of a score",
    heavy.state === "flagged",
    { score: heavy.score, perSignal: Object.fromEntries(perSignal) },
  );
}

// ---------------------------------------------------------------------------
console.log("\nThe hard requirement: nothing is ever lost");
// ---------------------------------------------------------------------------
{
  const worst = base({
    values: {
      [HONEYPOT_FIELD]: "http://spam.example",
      email: "x@mailinator.com",
      message: "casino backlinks [url=http://x]buy[/url] https://a.example https://b.example",
    },
    token: mintOriginToken(ENDPOINT, NOW - 10),
    lists: { ...EMPTY_SPAM_LISTS, blockedKeywords: ["casino"] },
  });
  t("the worst submission we can construct is still only flagged", worst.state, "flagged");
  ok(
    "there is no state this module can return other than clear or flagged",
    (["clear", "flagged"] as string[]).includes(worst.state),
    worst.state,
  );
  ok(
    "and its reasons explain that flagged means marked, not removed",
    worst.reasons.some((reason) => /stored/i.test(reason.note) || /not removed/i.test(reason.note)),
  );

  // The vocabulary the spine forbids must never reach a customer's screen.
  const forbidden = /suspected bot|qualified pipeline|lead velocity|frictionless|seamless/i;
  const offending = worst.reasons.filter((reason) => forbidden.test(reason.note));
  t("no reason uses vocabulary docs/00 forbids", offending.map((reason) => reason.rule), []);

  ok(
    "no reason echoes a whole field value back into the inbox",
    worst.reasons.every((reason) => reason.observed.length <= 160),
    worst.reasons.map((reason) => reason.observed.length),
  );
}

// ---------------------------------------------------------------------------
console.log("\nDefaults");
// ---------------------------------------------------------------------------
{
  t("the shipped threshold is the documented one", DEFAULT_SPAM_POLICY.threshold, SPAM_THRESHOLD);
  ok("every signal is on by default", Object.values(DEFAULT_SPAM_POLICY).every((value) => value !== false));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
