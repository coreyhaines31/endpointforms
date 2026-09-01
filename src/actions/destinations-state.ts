import type { FormState } from "@/actions/form-state";

/**
 * The form state the destination actions return.
 *
 * Kept out of `./destinations.ts` for the reason `./form-state.ts` states at the
 * top of itself: **a `"use server"` module may only export async functions.**
 * Exporting a plain object from one does not fail the typecheck or the build —
 * it fails at runtime, silently, by breaking the action bindings, so the form
 * submits and nothing happens. That is exactly how this file came to exist: the
 * "Send a test delivery" button did nothing, with no error in the console and no
 * request on the wire.
 */
export type DestinationState = FormState & {
  /**
   * A signing secret, shown once, immediately after it is generated or rotated.
   * Never read back — see `redactConfig` — so this really is the only chance.
   */
  secret?: string;
  /**
   * The real response from a test delivery: the status code and the body,
   * verbatim. A green tick that hid a 202 from a receiver that queued and
   * dropped the message would manufacture the false confidence #42 attacks.
   */
  test?: {
    ok: boolean;
    status: number | null;
    body: string | null;
    error: string | null;
  };
};

export const idleDestinationState: DestinationState = { status: "idle", message: "" };
