import { z } from "zod";

const emailSchema = z.string().trim().min(1).max(320).pipe(z.email());

/** One message per failure mode. Zod's own strings must never reach the UI. */
export const WAITLIST_MESSAGES = {
  empty: "Enter an email address.",
  tooLong: "That email address is too long.",
  invalid: "That doesn’t look like an email address.",
  failed: "That didn’t go through. Try again in a moment.",
  closed: "The waitlist isn’t open yet. Check back shortly.",
} as const;

export type WaitlistDecision =
  | { kind: "invalid"; message: string }
  | { kind: "honeypot" }
  | { kind: "accept"; email: string };

/**
 * Decides what to do with a waitlist submission. Pure, so it can be tested
 * without a Next runtime.
 *
 * The honeypot is evaluated BEFORE validation and never as a schema field.
 * Modelling it as `z.string().max(0)` made any filled value a validation
 * error, so a password manager autofilling the hidden input locked a real
 * person out of the waitlist and showed them a raw Zod string.
 */
export function decideWaitlist(rawEmail: unknown, rawHoneypot: unknown): WaitlistDecision {
  const honeypot = String(rawHoneypot ?? "").trim();
  if (honeypot.length > 0) return { kind: "honeypot" };

  const email = String(rawEmail ?? "");
  const parsed = emailSchema.safeParse(email);

  if (parsed.success) return { kind: "accept", email: parsed.data };

  const trimmed = email.trim();
  const message =
    trimmed.length === 0
      ? WAITLIST_MESSAGES.empty
      : trimmed.length > 320
        ? WAITLIST_MESSAGES.tooLong
        : WAITLIST_MESSAGES.invalid;

  return { kind: "invalid", message };
}
