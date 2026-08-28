"use server";

import type { WaitlistState } from "@/actions/waitlist-state";
import { decideWaitlist, WAITLIST_MESSAGES } from "@/lib/waitlist-validate";
import { saveSubscriber } from "@/lib/waitlist-store";

export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const decision = decideWaitlist(formData.get("email"), formData.get("company"));

  if (decision.kind === "invalid") {
    return { status: "error", message: decision.message };
  }

  // Silently accept and discard. The bot sees what a person sees.
  if (decision.kind === "honeypot") {
    return { status: "success", message: "You’re on the list." };
  }

  const result = await saveSubscriber(decision.email);

  if (result.ok) {
    return {
      status: "success",
      message: "You’re on the list. We’ll email you when there’s something to look at.",
    };
  }

  return {
    status: "error",
    message:
      result.reason === "no-sink" ? WAITLIST_MESSAGES.closed : WAITLIST_MESSAGES.failed,
  };
}
