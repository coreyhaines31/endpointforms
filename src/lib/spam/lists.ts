/**
 * Per-workspace blocklists and allowlists (#31).
 *
 * The one place in this module where a human decision beats the arithmetic. A
 * customer who has typed an address, a domain or a word into a list has told us
 * something about their own business that no heuristic here knows, and the
 * heuristics do not get to argue with it.
 *
 * ## The asymmetry is deliberate
 *
 * **An allowlist hit is decisive and ends the scoring.** It sits outside the
 * arithmetic entirely, in the same way that `src/lib/origin/decide.ts` puts its
 * self-declaring User-Agent rule outside the sum. If a customer says their
 * biggest client's domain is never spam, we do not then quietly flag their
 * biggest client because the message happened to contain three links.
 *
 * **A blocklist hit is a weight, not a bypass.** Eight points clears any
 * threshold a customer can set, so it always flags — but it is recorded as an
 * arithmetic entry so the column on the submission still adds up to the number
 * at the top of it. A reader who adds up the weights must reach the same total
 * we did, or the panel is lying to them.
 *
 * Neither list ever deletes anything. A blocklisted submission is stored,
 * visible, exportable, and can be marked "not spam" by a person.
 */

import { domainMatches, emailAddresses, type TextField } from "./content.ts";
import { BLOCKLIST_WEIGHT } from "./rules.ts";
import type { SpamLists, SpamReason } from "./types.ts";

export type ListInput = {
  fields: TextField[];
  /** Already hashed, matching the format stored on the row. */
  ipHash: string | null;
  lists: SpamLists;
};

export type ListOutcome = {
  /** Set when an allowlist matched. Scoring stops and the submission is clear. */
  allowed: SpamReason | null;
  /** Blocklist hits, each carrying its own weight. */
  blocked: SpamReason[];
};

export function checkLists(input: ListInput): ListOutcome {
  const { lists } = input;
  const domains = emailAddresses(input.fields);

  // --- Allowlists first. They win. -----------------------------------------

  if (input.ipHash && lists.allowedIpHashes.includes(input.ipHash)) {
    return {
      allowed: {
        code: "allowlist",
        rule: "allowlist.ip",
        observed: input.ipHash,
        weight: 0,
        note: "This address is on the workspace allowlist, so nothing else was scored. An allowlist is a decision somebody made on purpose and it beats every heuristic on this page.",
      },
      blocked: [],
    };
  }

  for (const entry of domains) {
    const listed = lists.allowedEmailDomains.find((candidate) =>
      domainMatches(entry.domain, candidate),
    );
    if (listed) {
      return {
        allowed: {
          code: "allowlist",
          rule: "allowlist.email_domain",
          observed: `${entry.domain} matches ${listed}`,
          weight: 0,
          note: `${listed} is on the workspace allowlist, so nothing else was scored.`,
          fields: [entry.name],
        },
        blocked: [],
      };
    }
  }

  // --- Blocklists. Weighted, recorded, never a delete. ----------------------

  const blocked: SpamReason[] = [];

  if (input.ipHash && lists.blockedIpHashes.includes(input.ipHash)) {
    blocked.push({
      code: "blocklist",
      rule: "blocklist.ip",
      observed: input.ipHash,
      weight: BLOCKLIST_WEIGHT,
      note: "This address is on the workspace blocklist. The submission is still stored and still visible — the list marks leads, it does not throw them away.",
    });
  }

  for (const entry of domains) {
    const listed = lists.blockedEmailDomains.find((candidate) =>
      domainMatches(entry.domain, candidate),
    );
    if (listed) {
      blocked.push({
        code: "blocklist",
        rule: "blocklist.email_domain",
        observed: `${entry.domain} matches ${listed}`,
        weight: BLOCKLIST_WEIGHT,
        note: `${listed} is on the workspace blocklist.`,
        fields: [entry.name],
      });
      break;
    }
  }

  const keyword = findKeyword(input.fields, lists.blockedKeywords);
  if (keyword) {
    blocked.push({
      code: "blocklist",
      rule: "blocklist.keyword",
      observed: `“${keyword.term}” in ${keyword.field}`,
      weight: BLOCKLIST_WEIGHT,
      note: "A word on the workspace blocklist appeared in this submission.",
      fields: [keyword.field],
    });
  }

  if (blocked.length === 0) {
    const configured =
      lists.blockedIpHashes.length +
      lists.blockedEmailDomains.length +
      lists.blockedKeywords.length;
    blocked.push({
      code: "blocklist",
      rule: "blocklist.no_match",
      observed: configured === 0 ? "no lists configured" : `${configured} entries, none matched`,
      weight: 0,
      note:
        configured === 0
          ? "This workspace has no blocklist entries. Adding an address, a domain or a word is the most precise control here — it beats every heuristic, because you know your own business."
          : "Nothing in this submission matched the workspace blocklist.",
    });
  }

  return { allowed: null, blocked };
}

function findKeyword(
  fields: TextField[],
  keywords: string[],
): { term: string; field: string } | null {
  for (const raw of keywords) {
    const term = raw.trim().toLowerCase();
    if (term === "") continue;
    for (const field of fields) {
      if (field.text.toLowerCase().includes(term)) return { term: raw.trim(), field: field.name };
    }
  }
  return null;
}
