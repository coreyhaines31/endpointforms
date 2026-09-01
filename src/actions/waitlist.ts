"use server";

import { headers } from "next/headers";

import type { WaitlistState } from "@/actions/waitlist-state";
import { pathnameOf, WAITLIST_SUCCESS } from "@/lib/waitlist-endpoint";
import { decideWaitlist, WAITLIST_MESSAGES } from "@/lib/waitlist-validate";
import { saveSubscriber } from "@/lib/waitlist-store";

/**
 * The fallback path for a waitlist signup.
 *
 * With `NEXT_PUBLIC_WAITLIST_ENDPOINT_URL` set, a visitor whose browser runs
 * JavaScript never gets here: the page posts to the endpoint itself, so the
 * request carries that visitor's own headers and earns its own provenance
 * stamp. See `src/lib/waitlist-endpoint.ts` for why that matters more than the
 * convenience of forwarding from the server.
 *
 * This action still runs for the no-JavaScript submit and for a retry after a
 * failed browser post, and it is a plain progressive-enhancement fallback: same
 * validation, same sink, same refusal when nothing can store the address.
 */
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

  const result = await saveSubscriber(decision.email, {
    // The page a submit with no JavaScript came from. `window.location` is not
    // available to a form post, and the Referer is — the browser sends it for a
    // same-origin navigation, and when a privacy setting strips it the signup
    // simply arrives without the context rather than not arriving.
    page: pathnameOf((await headers()).get("referer")),
    tool: readString(formData.get("tool")),
  });

  if (result.ok) {
    return { status: "success", message: WAITLIST_SUCCESS };
  }

  return {
    status: "error",
    message:
      result.reason === "no-sink" ? WAITLIST_MESSAGES.closed : WAITLIST_MESSAGES.failed,
  };
}

function readString(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
