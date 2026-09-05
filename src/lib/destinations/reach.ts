import type { DestinationKind } from "./types.ts";

/**
 * Whether anybody is actually being told (#65).
 *
 * An endpoint with nowhere to send a submission still accepts it, stores it,
 * de-spams it, stamps it and redirects correctly — and tells nobody. Nothing in
 * the interface used to say so. The product's own argument is that this category
 * loses leads quietly; shipping a state where **we** do that is the one failure
 * this positioning cannot survive, so it is stated on the endpoint screen, on
 * the destinations screen, and against the submissions it already happened to.
 *
 * #64 makes the state rare rather than impossible: an endpoint is created with a
 * notification, and reaching silence now takes pausing or deleting it. That is
 * the point — this warning is what makes silence a **choice** rather than an
 * accident.
 *
 * ## Three states, because there are three different true things
 *
 * - `reachable` — at least one enabled destination that this deployment can
 *   actually deliver to. Says nothing; a banner that is always there is
 *   furniture (`destinations-health.tsx` makes the same argument).
 * - `deaf` — nothing enabled at all. Submissions are stored and nobody hears.
 * - `unsendable` — something is enabled, but every enabled destination is email
 *   and this deployment has no mail transport. The consequence is identical to
 *   `deaf` and the fix is completely different, so flattening the two into one
 *   sentence would send somebody to add a destination they already have.
 *
 * `unsendable` is not a bug and must not read as one. `RESEND_API_KEY` unset is
 * a deployment fact — the hosted product supplies sending, a self-hoster brings
 * their own key — and the honest moment to say so is before the first
 * submission, not in a delivery log afterwards.
 *
 * Nothing here reads the database or the environment: both facts are passed in,
 * so this is a pure function the tests can drive through every state.
 */

export type ReachState = "reachable" | "deaf" | "unsendable";

/** The little a caller has to know about a destination for this question. */
export type ReachInput = {
  kind: DestinationKind;
  enabled: boolean;
};

export type EndpointReach = {
  state: ReachState;
  /** Enabled destinations, whatever their health. */
  enabledCount: number;
  /** The headline. Empty when `reachable`, which renders nothing. */
  title: string;
  /**
   * The fact, then the fix, in that order — the tone `MAIL_NOT_CONFIGURED`
   * already uses. The sentence a component adds a link to comes after this one.
   */
  detail: string;
};

const REACHABLE: EndpointReach = {
  state: "reachable",
  enabledCount: 0,
  title: "",
  detail: "",
};

export function endpointReach(
  destinations: readonly ReachInput[],
  options: { mailConfigured: boolean },
): EndpointReach {
  const enabled = destinations.filter((destination) => destination.enabled);

  if (enabled.length === 0) {
    return {
      state: "deaf",
      enabledCount: 0,
      title: "Nobody will be told about a submission here",
      detail:
        "This endpoint has no destination switched on. Submissions still arrive and are still stored — they will all be here — but nothing leaves and no one is notified.",
    };
  }

  if (!options.mailConfigured && enabled.every((destination) => destination.kind === "email")) {
    return {
      state: "unsendable",
      enabledCount: enabled.length,
      title: "Nobody will be told about a submission here",
      detail:
        "Every destination switched on here sends email, and email delivery is not switched on for this deployment. Submissions still arrive and are still stored — nothing is lost, and anything that arrives can be sent again from the delivery log once mail is on. (Self-hosting? Set RESEND_API_KEY, and MAIL_FROM for the sender address.)",
    };
  }

  return { ...REACHABLE, enabledCount: enabled.length };
}

/**
 * How long a submission may have no delivery attempt before that is worth saying.
 *
 * Delivery runs in `after()`, off the response path, so an attempt row appears
 * within milliseconds of the submission being stored. A minute is far outside
 * that window, and the trade it buys is the right way round: being briefly
 * silent about a row that is still in flight is much better than telling
 * somebody a lead went nowhere while it is on its way.
 *
 * Read by the SQL in `src/lib/workspaces/submissions.ts`, which is why it is a
 * number of seconds rather than an interval literal.
 */
export const NOWHERE_GRACE_SECONDS = 60;
