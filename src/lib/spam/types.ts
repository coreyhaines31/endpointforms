/**
 * The shapes spam scoring writes down (#31).
 *
 * Kept in their own module with no imports, for the same reason
 * `src/lib/origin/types.ts` is: a component rendering the score, a test
 * asserting on it, and the ingest path deciding it all name the same types
 * without any of them pulling in `node:crypto` or a database client.
 *
 * ## This is a different axis from Origin, deliberately
 *
 * `origin` answers *which door was used and how coherently the caller behaved
 * on it*. Spam answers *does this content and this behaviour look like abuse*.
 * They are independent and must stay independent: a person in Chrome can send
 * a casino advert, and an agent using Manifest can send the best lead of the
 * quarter. Collapsing the two would make both unreadable.
 *
 * It is also a different axis from `verdict`. `submission_verdict` is the
 * downstream business outcome — won, lost, disqualified, awaiting — reported by
 * a CRM or the outcome webhook (#43), and it is the input to Yield's ranking
 * (#44). Nothing in this module may ever write it. A regex that can set
 * `disqualified` is a regex that decides which form variant wins.
 */

/**
 * What we decided, and whether a person has since overruled it.
 *
 * Note what is absent: there is no `deleted`, no `rejected`, and no `blocked`.
 * A flagged submission is stored, exportable, and visible. `docs/23-origin-findings.md`
 * and `/spam/honeypot-fields` both commit us to that in public, and the second
 * one is rude about vendors who do otherwise.
 */
export type SpamState =
  /** Scored below the bar. The ordinary state. */
  | "clear"
  /** Scored at or above the bar. Stored, visible, marked, and reversible. */
  | "flagged"
  /** A person read it and said this was not spam. Never re-flagged by rescoring. */
  | "not_spam"
  /** A person read it and said it was. Recorded so the ruleset can be graded later. */
  | "confirmed_spam";

/** Every signal we look at, as a stable key that is safe to filter and store. */
export type SpamSignalCode =
  | "honeypot"
  | "timing"
  | "duplicate"
  | "velocity"
  | "links"
  | "markup"
  | "phrases"
  | "homoglyph"
  | "gibberish"
  | "disposable_email"
  | "relay_email"
  | "blocklist"
  | "allowlist"
  /**
   * The arithmetic itself, recorded as a final entry — the same device
   * `OriginSignalCode` uses and for the same reason. `spam_reasons` is the only
   * column the score gets, so the bar it was compared against has to live
   * inside it. A row read next year is otherwise scored against a threshold
   * that has since moved, and is quietly unreadable.
   */
  | "threshold";

/**
 * One line of the answer to "why was this flagged?".
 *
 * `note` is written for the person reading a flagged submission and deciding
 * whether their lead was eaten by a regex, so it says what was observed rather
 * than what we concluded. `weight` is included because a reader who disagrees
 * with the score should be able to see exactly how much each signal moved it.
 *
 * `observed` must never contain the raw field value verbatim beyond a short,
 * truncated excerpt — a submission body is customer data and these reasons are
 * rendered in a shared inbox.
 */
export type SpamReason = {
  code: SpamSignalCode;
  /** The specific rule inside a signal, where there is one. `links.every_field`. */
  rule: string;
  /** What was actually seen, short. */
  observed: string;
  /** Positive leans spam. Zero is recorded and counts for nothing. */
  weight: number;
  note: string;
  /** Which fields the signal fired on, so a reader can go and look at them. */
  fields?: string[];
};

export type SpamAssessment = {
  state: Extract<SpamState, "clear" | "flagged">;
  /** The sum of the weights. Higher is more spam-like. */
  score: number;
  /** The bar `score` was compared against. Stored for the same reason as `score`. */
  threshold: number;
  reasons: SpamReason[];
};

/**
 * Per-endpoint configuration. Every signal can be switched off individually,
 * because a customer whose form legitimately collects URLs should not have to
 * choose between link scoring and no scoring at all.
 */
export type SpamPolicy = {
  /** Off entirely. Nothing is scored, nothing is flagged, submissions still store. */
  enabled: boolean;
  honeypot: boolean;
  timing: boolean;
  duplicate: boolean;
  velocity: boolean;
  content: boolean;
  disposableEmail: boolean;
  /** The bar. Raising it flags less; lowering it flags more. Never zero. */
  threshold: number;
  /**
   * The extra decoy field name this endpoint renders, on top of the built-in
   * one. Null uses only the built-in.
   */
  honeypotField: string | null;
};

/**
 * A workspace's own lists. Allowlists always win over blocklists, and both win
 * over the arithmetic — a customer who has typed an address into a list has
 * made a decision, and a heuristic does not get to argue with it.
 */
export type SpamLists = {
  /** Exact IP addresses or CIDR-less prefixes, already hashed the way the row stores them. */
  blockedIpHashes: string[];
  allowedIpHashes: string[];
  /** Bare domains, lowercased. `mailinator.com`. Subdomains match. */
  blockedEmailDomains: string[];
  allowedEmailDomains: string[];
  /** Case-insensitive substrings checked against every field value. */
  blockedKeywords: string[];
};

export const EMPTY_SPAM_LISTS: SpamLists = {
  blockedIpHashes: [],
  allowedIpHashes: [],
  blockedEmailDomains: [],
  allowedEmailDomains: [],
  blockedKeywords: [],
};
