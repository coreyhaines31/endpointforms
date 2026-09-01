/**
 * Combining the signals into a score (#31).
 *
 * ## A score, not a verdict
 *
 * `docs/00-positioning-spine.md` names our enemy as "the dashboard that says
 * everything is fine while sales drowns in junk", and the reason we get to say
 * that is that every number this product shows can be taken apart. A spam score
 * a customer cannot interrogate would be the same dishonest dashboard with our
 * logo on it.
 *
 * So: every signal is recorded, including the ones that scored nothing; every
 * weight is a property of a rule in `./rules.ts`; the threshold is stored on the
 * row beside the score; and the whole column adds up to the total. If a reader
 * sums the weights and gets a different number than we printed, that is a bug.
 *
 * ## What this never does
 *
 * - It never deletes, rejects, or refuses. There is no code path from this file
 *   to a non-200 response. A flagged submission is stored, exportable, visible
 *   by default, and reversible by a person.
 * - It never writes `submissions.verdict`. That column is the downstream
 *   business outcome (#43) and the input to Yield's ranking (#44); a heuristic
 *   that could set `disqualified` would be a heuristic deciding which form
 *   variant wins.
 * - It never writes `submissions.origin`. Spam is a separate axis: a person in
 *   Chrome can send a casino advert and an agent using Manifest can send the
 *   best lead of the quarter.
 *
 * ## The threshold, and why it is 5
 *
 * The bar is set so that **no single content signal can flag a submission**.
 * The strongest content rule is worth 4; vocabulary is capped at 4; a
 * disposable address is worth 2. Something behavioural — a filled decoy, an
 * instant submit, a payload already seen from another client — has to be
 * involved, or a person on a workspace list has to have made a decision.
 *
 * The one exception is the reserved decoy at 6, which flags alone. That is a
 * field positioned off-screen, excluded from the tab order, named in a
 * namespace no autofill heuristic has heard of, and labelled "leave this field
 * empty". Something filled a form without looking at it.
 */

import { checkContent, checkEmailDomains, textFields, type TextField } from "./content.ts";
import { checkHoneypot, HONEYPOT_FIELD_KEYS } from "./honeypot.ts";
import { checkLists } from "./lists.ts";
import { checkTiming } from "./timing.ts";
import {
  DUPLICATE_WEIGHT,
  NO_VELOCITY,
  VELOCITY_BURST,
  VELOCITY_BURST_WEIGHT,
  VELOCITY_SEVERE,
  VELOCITY_SEVERE_WEIGHT,
  type VelocityObservation,
} from "./velocity.ts";
import {
  EMPTY_SPAM_LISTS,
  type SpamAssessment,
  type SpamLists,
  type SpamPolicy,
  type SpamReason,
} from "./types.ts";

/**
 * The bar. See the note above for why it sits here rather than higher or lower.
 *
 * An endpoint may raise or lower its own, and the value used is stored in the
 * reasons, so a row scored under an old threshold stays readable after someone
 * moves it.
 */
export const SPAM_THRESHOLD = 5;

export const DEFAULT_SPAM_POLICY: SpamPolicy = {
  enabled: true,
  honeypot: true,
  timing: true,
  duplicate: true,
  velocity: true,
  content: true,
  disposableEmail: true,
  threshold: SPAM_THRESHOLD,
  honeypotField: null,
};

/**
 * Plumbing that arrives in the payload beside the answers and must never be
 * scanned as content. Scoring our own reserved fields would let the shape of
 * our tooling flag a customer's lead.
 */
const PLUMBING_PREFIXES = ["_", "utm_"];
const PLUMBING_KEYS = new Set<string>([
  ...HONEYPOT_FIELD_KEYS,
  "gclid",
  "fbclid",
  "msclkid",
  "ttclid",
  "li_fat_id",
  "gbraid",
  "wbraid",
]);

export type SpamInput = {
  /** The submitted values as parsed, **before** reserved keys are stripped. */
  values: Record<string, unknown>;
  endpointPublicId: string;
  /** Already hashed, matching the format stored on the row. */
  ipHash: string | null;
  /** The client token the page echoed back, for timing. */
  token?: string | null;
  /** Field names this endpoint genuinely collects, so a decoy cannot collide. */
  realFieldNames?: readonly string[];
  velocity?: VelocityObservation;
  lists?: SpamLists;
  policy?: Partial<SpamPolicy>;
  now?: number;
};

export function assessSpam(input: SpamInput): SpamAssessment {
  const policy: SpamPolicy = { ...DEFAULT_SPAM_POLICY, ...input.policy };
  const threshold = Number.isFinite(policy.threshold) && policy.threshold > 0
    ? policy.threshold
    : SPAM_THRESHOLD;

  if (!policy.enabled) {
    return {
      state: "clear",
      score: 0,
      threshold,
      reasons: [
        {
          code: "threshold",
          rule: "policy.disabled",
          observed: "scoring off",
          weight: 0,
          note: "Spam scoring is switched off for this endpoint. The submission was stored exactly as it arrived and nothing was scored.",
        },
      ],
    };
  }

  const fields = scannableFields(input.values);
  const lists = input.lists ?? EMPTY_SPAM_LISTS;

  // Allowlists sit outside the arithmetic, the same way the self-declaring
  // User-Agent rule does in `src/lib/origin/decide.ts`. A customer's own
  // decision is not something a regex gets to overturn.
  const listOutcome = checkLists({ fields, ipHash: input.ipHash, lists });
  if (listOutcome.allowed) {
    return {
      state: "clear",
      score: 0,
      threshold,
      reasons: [
        listOutcome.allowed,
        summary(0, threshold, "clear", "allowlist"),
      ],
    };
  }

  const reasons: SpamReason[] = [];

  if (policy.honeypot) {
    reasons.push(
      checkHoneypot({
        values: input.values,
        extraField: policy.honeypotField,
        realFieldNames: input.realFieldNames,
      }),
    );
  }

  if (policy.timing) {
    reasons.push(
      checkTiming({
        token: input.token,
        endpointPublicId: input.endpointPublicId,
        now: input.now ?? Date.now(),
      }),
    );
  }

  const velocity = input.velocity ?? NO_VELOCITY;
  if (policy.duplicate) reasons.push(duplicateReason(velocity));
  if (policy.velocity) reasons.push(velocityReason(velocity));
  if (policy.content) reasons.push(...checkContent(fields));
  if (policy.disposableEmail) reasons.push(checkEmailDomains(fields));

  reasons.push(...listOutcome.blocked);

  const score = reasons.reduce((total, reason) => total + reason.weight, 0);
  const state = score >= threshold ? "flagged" : "clear";

  reasons.push(summary(score, threshold, state, null));

  return { state, score, threshold, reasons };
}

/**
 * The final entry, carrying the arithmetic.
 *
 * Stored inside `spam_reasons` rather than derived at render time so that a row
 * read next year is still scored against the bar it was actually judged by —
 * the same device `origin_reasons` uses, and for the same reason.
 */
function summary(
  score: number,
  threshold: number,
  state: "clear" | "flagged",
  decisive: "allowlist" | null,
): SpamReason {
  if (decisive === "allowlist") {
    return {
      code: "threshold",
      rule: "threshold.allowlisted",
      observed: `score=0 threshold=${threshold}`,
      weight: 0,
      note: "An allowlist entry matched, so no other signal was consulted and the submission is clear.",
    };
  }

  return {
    code: "threshold",
    rule: "threshold.scored",
    observed: `score=${score} threshold=${threshold}`,
    weight: 0,
    note:
      state === "flagged"
        ? `Scored ${score} against a bar of ${threshold}, so this is flagged. Flagged means marked, not removed — the submission is stored, exported and visible like any other, and you can mark it as not spam, which is permanent.`
        : `Scored ${score} against a bar of ${threshold}. Below the bar, so nothing is flagged.`,
  };
}

// ---------------------------------------------------------------------------

function duplicateReason(velocity: VelocityObservation): SpamReason {
  if (velocity.duplicateCount <= 1) {
    return {
      code: "duplicate",
      rule: "duplicate.first_seen",
      observed: "first time this payload has been seen",
      weight: 0,
      note: "No identical submission has arrived on this endpoint recently.",
    };
  }

  // The same payload from the same client is a double-clicked submit button,
  // and `src/lib/ingest/handler.ts` already collapses that with an idempotency
  // key. Counting it here as well would score a jammed button as spam.
  if (velocity.duplicateClients <= 1) {
    return {
      code: "duplicate",
      rule: "duplicate.same_client",
      observed: `seen ${velocity.duplicateCount} times, all from one client`,
      weight: 0,
      note: "The same payload arrived more than once from the same client, which is what a double-clicked submit button looks like. Not scored — the idempotency key already handles it.",
    };
  }

  return {
    code: "duplicate",
    rule: "duplicate.multiple_clients",
    observed: `seen ${velocity.duplicateCount} times from ${velocity.duplicateClients} clients`,
    weight: DUPLICATE_WEIGHT,
    note: "A byte-identical payload arrived from more than one client. Two people do not type the same message; a template sent through a proxy pool does. Counted in memory on this instance only, so the real count may be higher.",
  };
}

function velocityReason(velocity: VelocityObservation): SpamReason {
  if (velocity.burstCount >= VELOCITY_SEVERE) {
    return {
      code: "velocity",
      rule: "velocity.severe",
      observed: `${velocity.burstCount} submissions in the last 10 minutes`,
      weight: VELOCITY_SEVERE_WEIGHT,
      note: "This client has sent an unusual number of submissions in a short window. Scored, never refused: a tight per-address limit blocks the third person at a large company before it blocks a bot farm.",
    };
  }

  if (velocity.burstCount >= VELOCITY_BURST) {
    return {
      code: "velocity",
      rule: "velocity.burst",
      observed: `${velocity.burstCount} submissions in the last 10 minutes`,
      weight: VELOCITY_BURST_WEIGHT,
      note: "More submissions from this client in ten minutes than a person usually sends. A shared office address does produce this, which is why it is worth two points and cannot flag anything on its own.",
    };
  }

  return {
    code: "velocity",
    rule: "velocity.normal",
    observed: `${velocity.burstCount} submission${velocity.burstCount === 1 ? "" : "s"} in the last 10 minutes`,
    weight: 0,
    note: "Nothing unusual about how often this client is submitting.",
  };
}

/**
 * The customer's own fields, with our plumbing and the decoys removed.
 *
 * The decoys are excluded here because they are scored by `checkHoneypot`; a
 * bot that writes a URL into the decoy would otherwise be counted once as a
 * filled decoy and again as a link, which is one observation charged twice.
 */
function scannableFields(values: Record<string, unknown>): TextField[] {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const lower = key.toLowerCase();
    if (PLUMBING_KEYS.has(lower)) continue;
    if (PLUMBING_PREFIXES.some((prefix) => lower.startsWith(prefix))) continue;
    kept[key] = value;
  }
  return textFields(kept);
}
