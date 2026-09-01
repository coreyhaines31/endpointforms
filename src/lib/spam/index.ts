/**
 * Spam and abuse defenses (#31).
 *
 * Layered, scored, and never destructive. Read `./assess.ts` for the arithmetic
 * and `./rules.ts` for every rule that feeds it — between them they are the
 * whole of what can flag a submission.
 *
 * The one rule that governs everything under this directory: **a submission is
 * never lost.** Nothing here returns an error, nothing deletes a row, and
 * nothing hides one from the inbox. Flagging marks a lead and is reversible by
 * a person. "Where did my lead go" is a worse failure than spam, and it is the
 * failure we spent twelve published teardowns accusing the category of.
 */

export { assessSpam, DEFAULT_SPAM_POLICY, SPAM_THRESHOLD, type SpamInput } from "./assess.ts";
export {
  checkContent,
  checkEmailDomains,
  domainMatches,
  emailAddresses,
  textFields,
  type TextField,
} from "./content.ts";
export {
  checkHoneypot,
  endpointHoneypotFields,
  HONEYPOT_BAIT_FIELD,
  HONEYPOT_BAIT_WEIGHT,
  HONEYPOT_FIELD,
  HONEYPOT_FIELD_KEYS,
  HONEYPOT_LABEL,
  HONEYPOT_STYLE,
  HONEYPOT_WEIGHT,
  honeypotInputProps,
} from "./honeypot.ts";
export { checkLists, type ListOutcome } from "./lists.ts";
export { checkTiming, FAST_MS, INSTANT_MS } from "./timing.ts";
export {
  clientFingerprint,
  DUPLICATE_WINDOW_MS,
  NO_VELOCITY,
  observe,
  payloadHash,
  resetVelocity,
  VELOCITY_BURST,
  VELOCITY_SEVERE,
  VELOCITY_WINDOW_MS,
  type VelocityObservation,
} from "./velocity.ts";
export {
  EMPTY_SPAM_LISTS,
  type SpamAssessment,
  type SpamLists,
  type SpamPolicy,
  type SpamReason,
  type SpamSignalCode,
  type SpamState,
} from "./types.ts";

export * as spamRules from "./rules.ts";
