import { emailConfigSchema } from "./config.ts";

/**
 * The notification an endpoint is created with (#64).
 *
 * ## Why this is a destination row and not a flag on the endpoint
 *
 * The base tier of this product is "somewhere to send a form". At that tier
 * notification is not a feature sitting on top of the product — it *is* the
 * product, and the alternative a customer is leaving behind is an email their
 * old form sent them. So an endpoint that tells nobody is not a configuration
 * gap; it is the thing we said we were better than.
 *
 * There were two shapes available and the trade is genuine, so it is written
 * down here rather than left to be re-litigated:
 *
 * - **A first-class `notify` concept on the endpoint** — two columns, no row in
 *   a list the customer never asked for. It also means the notification does
 *   not appear in the delivery log, has no health, no retries, no dead-letter
 *   count, no test button and no redeliver. The one part of the product every
 *   base-tier customer depends on would have been the *least* observable part
 *   of it, and "we cannot tell you whether your notification arrived" is the
 *   sentence `docs/00-positioning-spine.md` names as the enemy.
 * - **An ordinary `email` destination, flagged** — everything above is reused
 *   as it stands, `deliverSubmission` needs no second path, and #65's question
 *   ("is anybody being told?") stays a single query over destinations rather
 *   than two facts that can disagree.
 *
 * The second wins on every axis except the one real cost: a destination appears
 * that the customer did not create. `default_notification` is what pays that
 * cost — the screens can say where the row came from, and say it in a way that
 * survives a rename.
 *
 * ## Sending is a deployment fact, and it is stated rather than hidden
 *
 * The hosted product supplies the sending. A self-hoster brings their own key,
 * and when there is none `isMailConfigured()` is false, the adapter refuses with
 * `MAIL_NOT_CONFIGURED` and the submission is still stored. That is honest at
 * the moment of failure, but a first-run customer should not have to *discover*
 * it by losing a notification — so `src/lib/destinations/reach.ts` reads the
 * same flag and the endpoint screen states it up front.
 *
 * Nothing in this module reads the database or the environment; it is the shape
 * and the words, so a component may import it.
 */

/** The address the notification goes to: whoever created the endpoint. */
export type NotifyTarget = { email: string };

/**
 * What the destination is called.
 *
 * The address is in the name because the name is what the delivery log, the
 * health line and the destinations table all show, and "Email notification" in
 * a workspace with three members answers none of the questions somebody has
 * when they find a row they do not remember making.
 */
export function defaultNotificationName(email: string): string {
  return `Email to ${email}`;
}

/**
 * The stored config, validated by the same schema the delivery path parses with.
 *
 * Built through `emailConfigSchema` rather than as a literal so that a
 * notification created here cannot be a shape `parseConfig` would later reject —
 * that failure would land in the delivery log as `configuration`, on the one
 * destination the customer never touched.
 */
export function defaultNotificationConfig(target: NotifyTarget): Record<string, unknown> {
  return emailConfigSchema.parse({ to: [target.email.trim()] });
}

/** Null when the address is not one we could send to, so creation carries on without it. */
export function buildDefaultNotification(
  email: string | null | undefined,
): { name: string; config: Record<string, unknown> } | null {
  const address = (email ?? "").trim();
  if (address === "") return null;

  const parsed = emailConfigSchema.safeParse({ to: [address] });
  if (!parsed.success) return null;

  return { name: defaultNotificationName(address), config: parsed.data };
}

/**
 * What the screens say about a row nobody remembers creating.
 *
 * One string, used on the endpoint screen and on the destination's own page, so
 * the two cannot describe the same row differently.
 */
export const DEFAULT_NOTIFICATION_BLURB =
  "Created with the endpoint, so the first submission reaches somebody. It is an ordinary email destination — rename it, point it somewhere else, pause it or remove it.";

/** Said wherever a default notification is offered but the deployment cannot send mail. */
export const DEFAULT_NOTIFICATION_UNSENDABLE =
  "Email delivery is not switched on for this deployment, so this notification cannot send. Submissions are still stored and nothing is lost — add a destination that can deliver, or redeliver from the log once mail is on. (Self-hosting? Set RESEND_API_KEY, and MAIL_FROM for the sender address.)";
