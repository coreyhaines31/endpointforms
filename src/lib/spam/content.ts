/**
 * Content heuristics (#31).
 *
 * Every rule this file applies lives in `./rules.ts` as data. This file decides
 * *how* the rules are applied — which fields count as free text, how link
 * density is tiered, how the phrase cap works — and nothing about *what* they
 * match. That split is what makes the ruleset auditable: a customer asking
 * "what could flag my form?" can be handed one file.
 *
 * ## The ceiling on all of this, stated once
 *
 * Content heuristics read the message, not the sender. They catch templates.
 * They have nothing whatever to say about the polished, deliverable,
 * corporate-domain submission that wastes an SDR's week — `/spam/disposable-email-blocking`
 * says exactly that at the bottom of the page, and it is why no combination of
 * rules here can flag on vocabulary alone.
 */

import {
  DISPOSABLE_DOMAINS,
  DISPOSABLE_WEIGHT,
  GIBBERISH_PATTERN,
  GIBBERISH_WEIGHT,
  HOMOGLYPH_WEIGHT,
  INVISIBLE_CHARS,
  INVISIBLE_WEIGHT,
  LINK_TIERS,
  MARKUP_RULES,
  MESSAGE_FIELD_HINTS,
  PHRASE_RULES,
  PHRASE_WEIGHT_CAP,
  RELAY_DOMAINS,
  SHORT_FIELD_CHARS,
  URL_FIELD_HINTS,
  EXPLICIT_URL_PATTERN,
  BARE_DOMAIN_PATTERN,
  EMAIL_IN_TEXT_PATTERN,
  CONFUSABLE_RANGES,
} from "./rules.ts";
import type { SpamReason } from "./types.ts";

/** One field, flattened to the text a rule can be run against. */
export type TextField = {
  name: string;
  text: string;
  /** True when the name suggests free text, or the value is long enough to be. */
  isMessage: boolean;
  /** True when the name says a URL is the expected value. */
  expectsUrl: boolean;
};

/**
 * Flattens submitted values into scannable text.
 *
 * Nested objects and arrays are walked, because a JSON body can hide a payload
 * one level down and a heuristic that only reads the top level is one `{"a":{}}`
 * away from useless. Field names are joined with a dot so the reason can point
 * at `details.message` rather than at `details`.
 */
export function textFields(values: Record<string, unknown>): TextField[] {
  const out: TextField[] = [];

  const walk = (value: unknown, path: string, depth: number): void => {
    if (depth > 8) return;

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const text = String(value);
      if (text.trim() === "") return;
      const leaf = path.split(".").pop() ?? path;
      out.push({
        name: path,
        text,
        isMessage: MESSAGE_FIELD_HINTS.test(leaf) || text.length > SHORT_FIELD_CHARS,
        expectsUrl: URL_FIELD_HINTS.test(leaf),
      });
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`, depth + 1));
      return;
    }

    if (value && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        walk(entry, path === "" ? key : `${path}.${key}`, depth + 1);
      }
    }
  };

  for (const [key, value] of Object.entries(values)) walk(value, key, 0);
  return out;
}

/**
 * Every content reason for a submission, including the ones that scored zero.
 *
 * Zero-weight reasons are kept because the panel that renders them is answering
 * "why was this flagged?", and a reader who cannot see what was checked and
 * found clean cannot tell the difference between a rule that passed and a rule
 * that does not exist.
 */
export function checkContent(fields: TextField[]): SpamReason[] {
  return [
    linkReason(fields),
    ...ruleReasons(fields, MARKUP_RULES, "markup"),
    ...phraseReasons(fields),
    homoglyphReason(fields),
    gibberishReason(fields),
  ];
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * Links in one field.
 *
 * Email addresses are removed first — an address is not a link somebody sent
 * you, and `priya@northwindlogistics.co.uk` contains a match for the bare-domain
 * pattern. Bare domains are only counted inside message fields; see
 * `BARE_DOMAIN_PATTERN` for why a company box must carry an explicit scheme.
 */
function countLinks(field: TextField): number {
  const text = field.text.replace(reset(EMAIL_IN_TEXT_PATTERN), " ");

  const explicit = text.match(reset(EXPLICIT_URL_PATTERN))?.length ?? 0;
  if (!field.isMessage) return explicit;

  const bare = text.match(reset(BARE_DOMAIN_PATTERN))?.length ?? 0;
  // A bare domain inside an explicit URL is already counted, so the larger of
  // the two is closer to the truth than their sum.
  return Math.max(explicit, bare);
}

/**
 * These are module-level global regexes, so `lastIndex` must be cleared before
 * every use. Sharing one compiled `/g/` regex across calls without this is the
 * classic bug where every second call silently misses.
 */
function reset(pattern: RegExp): RegExp {
  pattern.lastIndex = 0;
  return pattern;
}

function linkReason(fields: TextField[]): SpamReason {
  // A field that asks for a website is not evidence of anything when it holds
  // one. Excluded before any counting, not subtracted afterwards.
  const scored = fields.filter((field) => !field.expectsUrl);
  const withLinks = scored
    .map((field) => ({ field, count: countLinks(field) }))
    .filter((entry) => entry.count > 0);

  if (withLinks.length === 0) {
    return {
      code: "links",
      rule: "links.none",
      observed: "no links outside fields that ask for one",
      weight: 0,
      note: "No links were found in fields that were not asking for a URL.",
    };
  }

  const names = withLinks.map((entry) => entry.field.name);
  const total = withLinks.reduce((sum, entry) => sum + entry.count, 0);
  const observed = `${total} link${total === 1 ? "" : "s"} across ${names.length} field${names.length === 1 ? "" : "s"}`;

  const messageFields = scored.filter((field) => field.isMessage);
  const everyMessageField =
    messageFields.length >= 2 &&
    messageFields.every((field) => withLinks.some((entry) => entry.field === field));

  const tier = everyMessageField
    ? LINK_TIERS[0]
    : names.length >= 3
      ? LINK_TIERS[1]
      : withLinks.some((entry) => entry.count >= 4)
        ? LINK_TIERS[2]
        : withLinks.some((entry) => !entry.field.isMessage)
          ? LINK_TIERS[3]
          : null;

  if (!tier) {
    return {
      code: "links",
      rule: "links.expected",
      observed,
      weight: 0,
      note: "Links appeared only in fields long enough to be a message. That is an ordinary thing for someone to send, so it is recorded rather than scored.",
      fields: names,
    };
  }

  return { code: "links", rule: tier.id, observed, weight: tier.weight, note: tier.note, fields: names };
}

// ---------------------------------------------------------------------------
// Rule tables
// ---------------------------------------------------------------------------

function ruleReasons(
  fields: TextField[],
  rules: readonly { id: string; weight: number; test: RegExp; note: string }[],
  code: "markup",
): SpamReason[] {
  const hits: SpamReason[] = [];

  for (const rule of rules) {
    const matched = fields.filter((field) => rule.test.test(field.text));
    if (matched.length === 0) continue;
    hits.push({
      code,
      rule: rule.id,
      observed: matched.map((field) => field.name).join(", "),
      weight: rule.weight,
      note: rule.note,
      fields: matched.map((field) => field.name),
    });
  }

  if (hits.length > 0) return hits;

  return [
    {
      code,
      rule: `${code}.none`,
      observed: `${rules.length} rules, none matched`,
      weight: 0,
      note: "No markup rules matched this submission.",
    },
  ];
}

/**
 * Vocabulary, capped.
 *
 * Every matching rule is listed with its own weight so the reader sees what
 * fired, and then the total is trimmed to `PHRASE_WEIGHT_CAP` by a final
 * negative entry rather than by quietly shrinking the individual weights. A
 * reader adding up the column has to arrive at the same number we did.
 */
function phraseReasons(fields: TextField[]): SpamReason[] {
  const hits: SpamReason[] = [];

  for (const rule of PHRASE_RULES) {
    const matched = fields.filter((field) => rule.test.test(field.text));
    if (matched.length === 0) continue;
    hits.push({
      code: "phrases",
      rule: rule.id,
      observed: matched.map((field) => field.name).join(", "),
      weight: rule.weight,
      note: rule.note,
      fields: matched.map((field) => field.name),
    });
  }

  if (hits.length === 0) {
    return [
      {
        code: "phrases",
        rule: "phrases.none",
        observed: `${PHRASE_RULES.length} rules, none matched`,
        weight: 0,
        note: "None of the known spam-template phrasings appeared in this submission.",
      },
    ];
  }

  const total = hits.reduce((sum, hit) => sum + hit.weight, 0);
  if (total <= PHRASE_WEIGHT_CAP) return hits;

  hits.push({
    code: "phrases",
    rule: "phrases.cap",
    observed: `${total} capped to ${PHRASE_WEIGHT_CAP}`,
    weight: PHRASE_WEIGHT_CAP - total,
    note: `Vocabulary alone is capped at ${PHRASE_WEIGHT_CAP} points, which is below the flagging bar. A real enquiry from an SEO agency is allowed to use the words an SEO spam template uses.`,
  });
  return hits;
}

// ---------------------------------------------------------------------------
// Unicode tricks
// ---------------------------------------------------------------------------

/**
 * A word that mixes Latin with a lookalike script.
 *
 * The mixture is the signal, not the script. A word written entirely in
 * Cyrillic is a Russian word and there is nothing to say about it; `саsinо`
 * with three Cyrillic letters inside a Latin word was built to walk past a
 * keyword filter.
 */
function mixedScriptWords(text: string): string[] {
  const out: string[] = [];
  for (const word of text.split(/\s+/)) {
    if (word.length < 3 || !CONFUSABLE_RANGES.latin.test(word)) continue;
    if (CONFUSABLE_RANGES.cyrillic.test(word) || CONFUSABLE_RANGES.greek.test(word)) {
      out.push(word);
    }
  }
  return out;
}

function homoglyphReason(fields: TextField[]): SpamReason {
  const mixed: { name: string; words: string[] }[] = [];
  const invisible: string[] = [];

  for (const field of fields) {
    const words = mixedScriptWords(field.text);
    if (words.length > 0) mixed.push({ name: field.name, words });
    if (INVISIBLE_CHARS.test(field.text)) invisible.push(field.name);
  }

  if (invisible.length > 0) {
    return {
      code: "homoglyph",
      rule: "homoglyph.invisible_characters",
      observed: invisible.join(", "),
      weight: INVISIBLE_WEIGHT,
      note: "The text contains zero-width or formatting characters that render as nothing. They exist to break a word up so a keyword filter cannot see it, and there is no reason for one to be in a form field.",
      fields: invisible,
    };
  }

  if (mixed.length > 0) {
    const sample = mixed[0];
    return {
      code: "homoglyph",
      rule: "homoglyph.mixed_script",
      observed: `${sample?.name}: ${sample?.words.slice(0, 2).join(" ")}`,
      weight: HOMOGLYPH_WEIGHT,
      note: "A word mixes Latin letters with Cyrillic or Greek lookalikes. It reads normally to a person and matches no keyword rule, which is the entire purpose of writing it that way. A word written wholly in another script is not scored — only the mixture is.",
      fields: mixed.map((entry) => entry.name),
    };
  }

  return {
    code: "homoglyph",
    rule: "homoglyph.none",
    observed: "no mixed-script words",
    weight: 0,
    note: "No confusable characters or invisible separators were found.",
  };
}

/**
 * Keyboard mash, worth exactly one point.
 *
 * This is the rule on this page most likely to be wrong about a real person.
 * Transliterated names produce consonant runs and plenty of real company names
 * are acronyms, so it is corroboration and never a cause.
 */
function gibberishReason(fields: TextField[]): SpamReason {
  const hits = fields
    .filter((field) => !field.isMessage && !/\s/.test(field.text.trim()))
    .filter((field) => GIBBERISH_PATTERN.test(field.text));

  if (hits.length === 0) {
    return {
      code: "gibberish",
      rule: "gibberish.none",
      observed: "nothing unpronounceable",
      weight: 0,
      note: "No short field held an unbroken run of consonants.",
    };
  }

  return {
    code: "gibberish",
    rule: "gibberish.consonant_run",
    observed: hits.map((field) => field.name).join(", "),
    weight: GIBBERISH_WEIGHT,
    note: "A short field holds six or more consonants in a row with no spaces. Weighted at one point and no more: transliterated names do this, and so do plenty of real acronyms.",
    fields: hits.map((field) => field.name),
  };
}

// ---------------------------------------------------------------------------
// Email domains
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]{1,64}@([^\s@]{1,255})$/;

/** Every email address in the submission, with the field it came from. */
export function emailAddresses(fields: TextField[]): { name: string; domain: string }[] {
  const out: { name: string; domain: string }[] = [];
  for (const field of fields) {
    const match = EMAIL_PATTERN.exec(field.text.trim());
    const domain = match?.[1]?.toLowerCase();
    if (domain) out.push({ name: field.name, domain });
  }
  return out;
}

/** True when `domain` is `listed` or a subdomain of it. */
export function domainMatches(domain: string, listed: string): boolean {
  const needle = listed.trim().toLowerCase().replace(/^\./, "");
  if (needle === "") return false;
  return domain === needle || domain.endsWith(`.${needle}`);
}

/**
 * Disposable addresses — **flagged, never rejected, and never on their own.**
 *
 * `/spam/disposable-email-blocking` commits us to three things in public and
 * all three are implemented here: flag rather than reject (weight 2, against a
 * bar of 5), allow privacy relays explicitly, and never touch free mail.
 */
export function checkEmailDomains(fields: TextField[]): SpamReason {
  const found = emailAddresses(fields);

  if (found.length === 0) {
    return {
      code: "disposable_email",
      rule: "disposable_email.no_address",
      observed: "no email address in the submission",
      weight: 0,
      note: "There was no address to check.",
    };
  }

  const relay = found.find((entry) =>
    RELAY_DOMAINS.some((listed) => domainMatches(entry.domain, listed)),
  );
  if (relay) {
    return {
      code: "relay_email",
      rule: "relay_email.privacy_relay",
      observed: relay.domain,
      weight: 0,
      note: "This is a privacy relay — Apple Hide My Email, Firefox Relay, DuckDuckGo or SimpleLogin — which forwards to a real, permanent mailbox. A naive blocklist cannot tell one from a throwaway, and the people using them skew senior. Explicitly not scored.",
      fields: [relay.name],
    };
  }

  const disposable = found.find((entry) =>
    DISPOSABLE_DOMAINS.some((listed) => domainMatches(entry.domain, listed)),
  );
  if (disposable) {
    return {
      code: "disposable_email",
      rule: "disposable_email.known_domain",
      observed: disposable.domain,
      weight: DISPOSABLE_WEIGHT,
      note: "The address is at a known throwaway mail provider. Worth two points and no more — our own guidance is to flag rather than reject, because the list is permanently behind the domains and someone using a ten-minute mailbox has told you about their intent, not disqualified themselves.",
      fields: [disposable.name],
    };
  }

  return {
    code: "disposable_email",
    rule: "disposable_email.not_listed",
    observed: found[0]?.domain ?? "",
    weight: 0,
    note: "The address is not on the built-in throwaway list. That list is a starter, not a maintained feed — add your own domains in the workspace settings if you are seeing a provider it misses.",
  };
}
