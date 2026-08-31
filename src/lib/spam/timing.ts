/**
 * Time-to-submit (#31).
 *
 * `/spam/time-traps` is live on our site and it is unusually specific about how
 * this must be built. Three instructions, all of them followed here:
 *
 * 1. **"Keep a lower bound of two or three seconds."** Under it, something
 *    filled the form without reading it.
 * 2. **"Drop the upper bound entirely."** The page names the person an expiry
 *    rule rejects: someone who opened the quote form, went to find last year's
 *    invoice, checked a number with a colleague and came back. "That is not a
 *    stale session. That is the most qualified person who touched your form
 *    today." A long dwell is recorded here and never weighted.
 * 3. **"Store the timing rather than only enforcing it."** Every submission
 *    carries its elapsed time in the reasons, including the ordinary ones, so
 *    the distribution is there to look at later — and so the claim in that page
 *    that fast submissions do not close becomes checkable against `verdict`
 *    rather than assertable.
 *
 * ## There is no second token, on purpose
 *
 * A signed timestamp issued with the form is exactly what `src/lib/origin/token.ts`
 * already mints: `eo1.<endpoint>.<issuedAt>.<nonce>.<sig>`, HMAC'd with a key
 * that never leaves the server, verified before the timestamp inside it is
 * believed. Minting a second one would be a second unauthenticated endpoint, a
 * second reserved field, and two clocks that can disagree about the same page
 * load. This reads the one that exists.
 *
 * ## What it is worth against someone trying
 *
 * `await sleep(3000)`. That is the whole bypass, and our own page says so in
 * those words. This signal is aimed at single-shot scripts that fetch and post
 * in the same breath, it is weighted accordingly, and it can never flag a
 * submission on its own.
 */

import { verifyOriginToken } from "../origin/token.ts";
import type { SpamReason } from "./types.ts";

/** Under this, nothing read the page. */
export const INSTANT_MS = 1_000;
/** Under this, something was quicker than a person reading a form. */
export const FAST_MS = 3_000;

export const INSTANT_WEIGHT = 3;
export const FAST_WEIGHT = 1;

export type TimingInput = {
  /** The token the page echoed back, from a reserved field or the header. */
  token: string | null | undefined;
  endpointPublicId: string;
  now: number;
};

export function checkTiming(input: TimingInput): SpamReason {
  const check = verifyOriginToken(input.token, input.endpointPublicId, input.now);

  if (check.status === "absent") {
    return {
      code: "timing",
      rule: "timing.no_token",
      observed: "not measured",
      weight: 0,
      note: "The page did not echo a token, so there is no trustworthy start time to measure against. Plenty of real people block JavaScript, and this is never held against a submission.",
    };
  }

  if (check.status !== "valid" || check.ageMs === null) {
    // Deliberately weightless. A token that is expired, foreign or fabricated
    // is already scored on the Origin axis, and counting the same observation
    // twice under two different headings would inflate a score a customer is
    // being asked to trust.
    return {
      code: "timing",
      rule: `timing.token_${check.status}`,
      observed: check.status,
      weight: 0,
      note: "The token could not be used as a start time. That observation belongs to the Origin stamp, which already accounts for it — scoring it here as well would count one fact twice.",
    };
  }

  const elapsed = check.ageMs;
  const seconds = elapsed < 10_000 ? `${elapsed}ms` : `${Math.round(elapsed / 1000)}s`;

  if (elapsed < INSTANT_MS) {
    return {
      code: "timing",
      rule: "timing.instant",
      observed: seconds,
      weight: INSTANT_WEIGHT,
      note: "The submission arrived less than a second after the page asked for its token. Nothing read the form in that time. One sleep() call defeats this check, so it counts for something and never enough on its own.",
    };
  }

  if (elapsed < FAST_MS) {
    return {
      code: "timing",
      rule: "timing.fast",
      observed: seconds,
      weight: FAST_WEIGHT,
      note: "Filled faster than someone reading the form, but not impossibly so — a returning visitor with autofill is genuinely this quick. Corroboration only.",
    };
  }

  return {
    code: "timing",
    rule: "timing.recorded",
    observed: seconds,
    weight: 0,
    note: "Time between the page loading and the form arriving, recorded for the record. There is deliberately no upper bound: someone who leaves a quote form open while they go and find a number is the most qualified person who touched it today.",
  };
}
