/**
 * The ruleset, as data (#31).
 *
 * Every heuristic in this product lives in one of the tables below rather than
 * in a condition somewhere in the scoring code. That is not tidiness — it is
 * the thing that makes the score auditable. A customer asking "what could
 * possibly flag my form?" gets a finite, readable list, and a test can walk
 * every rule and assert that each one fires on something and stays silent on a
 * corpus of ordinary leads.
 *
 * ## Weights are here, not at the call site
 *
 * The contribution of a rule is a property of the rule. Reading this file tells
 * you the entire arithmetic; reading `assess.ts` tells you how the pieces are
 * combined. Neither file alone can surprise you.
 *
 * ## What is deliberately not here
 *
 * - **No "free mail" rule.** `/spam/disposable-email-blocking` says in public
 *   that refusing `gmail.com` on a B2B form rejects founders, consultants and
 *   contractors, and calls it "a policy someone wrote in 2014". We are not
 *   going to ship the thing we published a page against.
 * - **No country or language rule.** `/spam/geo-blocking` covers why.
 * - **No "all caps" or "no vowels in the name" rule.** Both fire on real
 *   people constantly and neither survives contact with a non-English name.
 */

import type { SpamSignalCode } from "./types.ts";

/**
 * A single content rule. `test` is a regex applied to one field's text.
 *
 * Every pattern here is anchored or bounded so it cannot backtrack
 * catastrophically: no nested quantifiers over overlapping character classes.
 * A submission body is attacker-controlled and up to 64KB per field, so a rule
 * that can be made quadratic is a denial-of-service vector on our own ingest
 * path.
 */
export type ContentRule = {
  id: string;
  code: SpamSignalCode;
  weight: number;
  test: RegExp;
  /** Shown to the customer. Says what was seen, not what we concluded. */
  note: string;
};

/**
 * The most weight any number of `phrases` rules can add between them.
 *
 * Uncapped, a single message mentioning several of these would score high
 * enough to flag on vocabulary alone, and vocabulary is the weakest thing here.
 * A genuine enquiry from an SEO agency is allowed to use the words an SEO spam
 * template uses.
 */
export const PHRASE_WEIGHT_CAP = 4;

/**
 * Known spam templates, by the vocabulary they cannot avoid.
 *
 * Sourced from the shapes named in the research corpus behind
 * `src/lib/spam-methods.ts` — unsolicited SEO and web-design pitches are by far
 * the most-reported content, followed by crypto, then adult and gambling.
 *
 * Each is worth 2: enough that two of them plus one behavioural signal clears
 * the bar, never enough to flag on its own.
 */
export const PHRASE_RULES: ContentRule[] = [
  {
    id: "phrases.seo_pitch",
    code: "phrases",
    weight: 2,
    test: /\b(?:seo|search engine optimi[sz]ation|first page of google|rank(?:ing)? (?:higher|on google|#?1)|backlinks?|guest post(?:ing)?|dofollow|domain authority)\b/i,
    note: "The text uses the vocabulary of an unsolicited SEO pitch, which is the single most-reported form-spam template in our research.",
  },
  {
    id: "phrases.web_design_pitch",
    code: "phrases",
    weight: 2,
    test: /\b(?:i (?:was |just )?(?:visited|came across|stumbled upon) your (?:website|site)|redesign your (?:website|site)|website audit|noticed (?:some )?(?:issues|errors) (?:on|with) your (?:website|site))\b/i,
    note: "The text matches the opening of a cold web-design or audit pitch template.",
  },
  {
    id: "phrases.outsourcing_pitch",
    code: "phrases",
    weight: 2,
    test: /\b(?:offshore (?:development|team)|dedicated developers?|hire (?:remote )?developers?|staff augmentation|our (?:company|team) (?:specializes|specialises) in)\b/i,
    note: "The text matches a cold outsourcing or staffing pitch template.",
  },
  {
    id: "phrases.crypto",
    code: "phrases",
    weight: 2,
    test: /\b(?:bitcoin|btc|ethereum|crypto(?:currency)?|binance|usdt|airdrop|web3 wallet|seed phrase|forex signals?)\b/i,
    note: "The text mentions cryptocurrency terms, which are common in blast templates and rare in an ordinary enquiry.",
  },
  {
    id: "phrases.gambling",
    code: "phrases",
    weight: 2,
    test: /\b(?:casino|slot(?:s| machine)|betting site|sportsbook|poker room|jackpot|gambl(?:e|ing))\b/i,
    note: "The text mentions gambling terms.",
  },
  {
    id: "phrases.adult",
    code: "phrases",
    weight: 2,
    test: /\b(?:escorts?|viagra|cialis|porn|xxx|sex cam|hookups?|adult dating)\b/i,
    note: "The text mentions adult-services terms.",
  },
  {
    id: "phrases.pharma",
    code: "phrases",
    weight: 2,
    test: /\b(?:no prescription|cheap pills|pharmacy online|buy (?:tramadol|oxycodone|xanax|adderall))\b/i,
    note: "The text matches an unlicensed-pharmacy template.",
  },
  {
    id: "phrases.urgency_blast",
    code: "phrases",
    weight: 2,
    test: /\b(?:act now|limited time offer|100% (?:free|guaranteed)|risk[- ]free|click here now|unsubscribe here|this is not spam)\b/i,
    note: "The text uses bulk-mail urgency phrasing. “This is not spam” in particular is only ever written by spam.",
  },
];

/**
 * Markup that has no business in a plain-text field.
 *
 * These are worth more than vocabulary because they are structural: a person
 * typing into a textarea does not produce BBCode, and the fillers that do are
 * aiming at forum software rather than at a lead form.
 */
export const MARKUP_RULES: ContentRule[] = [
  {
    id: "markup.bbcode",
    code: "markup",
    weight: 3,
    test: /\[(?:url|link|img|b|quote)\b[^\]]{0,200}\]/i,
    note: "The text contains BBCode markup. That is forum-spam tooling; people typing into a form do not produce it.",
  },
  {
    id: "markup.anchor_tag",
    code: "markup",
    weight: 3,
    test: /<a\s[^>]{0,300}href\s*=/i,
    note: "The text contains a raw HTML anchor tag.",
  },
  {
    id: "markup.script_tag",
    code: "markup",
    weight: 3,
    test: /<\s*(?:script|iframe|object|embed)\b/i,
    note: "The text contains a script or embed tag. Harmless to us — we store text and never render it as HTML — but nobody types this into a contact form.",
  },
];

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * A link somebody wrote on purpose: it carries a scheme or a `www.`.
 *
 * Bounded so it cannot backtrack — `[^\s<>"']` cannot re-enter the scheme, and
 * the length cap keeps a 64KB field from being one enormous match.
 */
export const EXPLICIT_URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']{2,2000}/gi;

/**
 * A bare domain, with no scheme. **Only counted inside message fields.**
 *
 * In a short field this pattern is a false-positive machine: `Booking.com` is a
 * company, `example.co` is the front of an email address, and a person typing
 * their employer's name into a company box has not sent you a link. So a name
 * or company box has to carry an explicit `http://` or `www.` before anything
 * is scored, and a message body — where a real link is written this way often
 * enough to matter — counts both.
 */
export const BARE_DOMAIN_PATTERN =
  /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|net|org|io|co|ru|cn|xyz|top|info|biz|online|site|shop|club|live|link)\b/gi;

/**
 * Email addresses, removed before any link counting.
 *
 * `priya@northwindlogistics.co.uk` contains `northwindlogistics.co`, and
 * counting the address someone gave you as a link they sent you is the kind of
 * quiet nonsense that makes a score untrustworthy. This was caught by a test
 * asserting that an ordinary lead scores zero, which is what that test is for.
 */
export const EMAIL_IN_TEXT_PATTERN = /[^\s@<>]{1,64}@[^\s@<>]{1,255}\.[a-z]{2,24}/gi;

/** Link-density tiers, in the order they are tested. First match wins. */
export const LINK_TIERS = [
  {
    id: "links.every_text_field",
    weight: 4,
    note: "Every free-text field on this submission contains a link. A person filling in a contact form does not do that; a template does.",
  },
  {
    id: "links.many_fields",
    weight: 3,
    note: "Three or more separate fields contain links.",
  },
  {
    id: "links.many_in_one_field",
    weight: 3,
    note: "One field contains four or more links.",
  },
  {
    id: "links.link_in_short_field",
    weight: 2,
    note: "A link appeared in a field too short to be a message — a name or company box with a URL in it.",
  },
] as const;

/** Below this many characters, a field is a label rather than a message. */
export const SHORT_FIELD_CHARS = 60;

// ---------------------------------------------------------------------------
// Email domains
// ---------------------------------------------------------------------------

/**
 * Privacy relays. **These override the disposable list and are never scored.**
 *
 * `/spam/disposable-email-blocking` carries a note headed "The false positive
 * is correlated with seniority": relay users skew technical, senior,
 * privacy-aware and iPhone-owning, and a naive blocklist cannot tell one from a
 * ten-minute mailbox. We published that. This list is us honouring it.
 */
export const RELAY_DOMAINS: string[] = [
  "privaterelay.appleid.com",
  "icloud.com",
  "mozmail.com",
  "relay.firefox.com",
  "duck.com",
  "simplelogin.com",
  "simplelogin.io",
  "slmail.me",
  "aleeas.com",
  "passmail.net",
  "passinbox.com",
  "anonaddy.com",
  "anonaddy.me",
  "addy.io",
  "8shield.net",
  "hidemyemail.co",
];

/**
 * A starter disposable list, and an honest label on it.
 *
 * This is not a maintained feed and it never will be from inside this file.
 * `/spam/disposable-email-blocking` says "use a maintained list, not a GitHub
 * gist that was last updated in 2021" — so this exists to make the signal work
 * out of the box, is weighted at 2 (a flag, never a wall), and the settings
 * screen tells the customer they can add their own domains.
 *
 * Weighted at 2 for a specific reason: the published page says "**Flag, do not
 * reject.** A disposable address on a submission is a routing decision, not a
 * verdict." Two points cannot flag anything by itself against a bar of five.
 */
export const DISPOSABLE_DOMAINS: string[] = [
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
  "yopmail.fr",
  "trashmail.com",
  "dispostable.com",
  "getnada.com",
  "maildrop.cc",
  "fakeinbox.com",
  "mailnesia.com",
  "mytemp.email",
  "spam4.me",
  "moakt.com",
  "emailondeck.com",
  "tempr.email",
  "discard.email",
  "mail-temporaire.fr",
  "burnermail.io",
  "einrot.com",
  "cuvox.de",
  "dayrep.com",
  "armyspy.com",
  "teleworm.us",
  "superrito.com",
  "rhyta.com",
  "jourrapide.com",
  "fleckens.hu",
  "gustr.com",
];

export const DISPOSABLE_WEIGHT = 2;

// ---------------------------------------------------------------------------
// Homoglyphs
// ---------------------------------------------------------------------------

/**
 * Unicode confusables — characters from another script that render as Latin.
 *
 * The attack is a filter bypass: `саsinо` with Cyrillic `с`, `а` and `о` reads
 * as "casino" to a person and matches no Latin keyword rule. We look for the
 * *mixture* rather than for the scripts themselves, because a word entirely in
 * Cyrillic is a Russian word written by a Russian person and there is nothing
 * suspicious about it. A word that is nine-tenths Latin with two Cyrillic
 * letters inside it was built to defeat a filter.
 */
export const CONFUSABLE_RANGES = {
  latin: /[A-Za-z]/,
  /** Cyrillic and Greek carry nearly every Latin-lookalike in practice. */
  cyrillic: /[\u0400-\u04FF\u0500-\u052F]/,
  greek: /[\u0370-\u03FF\u1F00-\u1FFF]/,
} as const;

export const HOMOGLYPH_WEIGHT = 3;

/**
 * Zero-width and formatting characters, used to break up a keyword invisibly.
 *
 * `ca​sino` renders as "casino" and matches nothing. Unlike the mixed-script
 * check this has no innocent explanation inside a form field: these characters
 * exist for ligature and bidi control in running text, and a lead form is not
 * running text.
 */
export const INVISIBLE_CHARS = /[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/;
export const INVISIBLE_WEIGHT = 3;

// ---------------------------------------------------------------------------
// Gibberish
// ---------------------------------------------------------------------------

/**
 * Keyboard mash, weighted at 1 and no more.
 *
 * This rule is the most likely on the page to be wrong about a real person.
 * Non-Latin names transliterate into consonant runs, and plenty of legitimate
 * company names are acronyms. It is worth one point as corroboration and it is
 * never allowed to matter on its own.
 */
export const GIBBERISH_WEIGHT = 1;
/** Six or more consonants in a row, in a value with no spaces. */
export const GIBBERISH_PATTERN = /[bcdfghjklmnpqrstvwxz]{6,}/i;

// ---------------------------------------------------------------------------
// The two decisive rules
// ---------------------------------------------------------------------------

/**
 * A workspace blocklist hit. Large enough to clear any threshold a customer can
 * set, and recorded as a weight rather than as a bypass so the arithmetic on
 * the submission still reads honestly end to end.
 */
export const BLOCKLIST_WEIGHT = 8;

/**
 * Field names that are conventionally free text, used to decide whether a link
 * belongs. Everything not on this list is treated as a short field.
 */
export const MESSAGE_FIELD_HINTS =
  /\b(?:message|comment|comments|enquiry|inquiry|details|description|notes?|body|question|feedback|reason|about|project|requirements?)\b/i;

/**
 * Field names whose values are expected to be a URL, and are therefore never
 * scored for containing one.
 */
export const URL_FIELD_HINTS = /\b(?:url|website|site|link|homepage|domain|portfolio|linkedin|github)\b/i;
