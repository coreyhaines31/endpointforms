"use server";

import { z } from "zod";
import type { WaitlistState } from "@/actions/waitlist-state";

const waitlistSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter an email address.")
    .max(320, "That email address is too long.")
    .pipe(z.email("That doesn’t look like an email address.")),
  // Honeypot. A real person never fills this in; anything that does told on itself.
  company: z.string().max(0).optional(),
});

export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const parsed = waitlistSchema.safeParse({
    email: formData.get("email"),
    company: formData.get("company") ?? "",
  });

  if (!parsed.success) {
    const first = parsed.error.issues.at(0);
    return {
      status: "error",
      message:
        first?.message ?? "That didn’t go through. Check the address and try again.",
    };
  }

  // The honeypot was filled. Report success to the caller and store nothing.
  if (parsed.data.company) {
    return { status: "success", message: "You’re on the list." };
  }

  // TODO(#7): send parsed.data.email to the email provider here, and return
  // { status: "error" } when that call fails. Blocked on a credential decision —
  // nothing is stored and nothing is sent yet.

  return {
    status: "success",
    message: "You’re on the list. We’ll email you when there’s something to look at.",
  };
}
