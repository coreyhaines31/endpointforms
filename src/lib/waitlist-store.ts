import "server-only";

import { appendFile } from "node:fs/promises";
import path from "node:path";

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "no-sink" | "failed" };

const KIT_ENDPOINT = "https://api.kit.com/v4";

/**
 * Persists a waitlist signup.
 *
 * The homepage's only conversion goal is this form, so it must never report
 * "You're on the list" without something actually having been written down.
 * Three sinks, in order:
 *
 *   1. Kit, when KIT_API_KEY and KIT_FORM_ID are set.
 *   2. In local development, a gitignored JSONL file. Keeps the page honest
 *      and demoable before credentials exist.
 *   3. In production with no provider, refuse. A serverless filesystem is
 *      ephemeral, so writing there would drop the address and still show a
 *      success message — the precise failure this product exists to complain
 *      about.
 */
export async function saveSubscriber(email: string): Promise<SaveResult> {
  const apiKey = process.env.KIT_API_KEY;
  const formId = process.env.KIT_FORM_ID;

  if (apiKey && formId) {
    return saveToKit(email, apiKey, formId);
  }

  if (process.env.NODE_ENV === "production") {
    return { ok: false, reason: "no-sink" };
  }

  try {
    const line = JSON.stringify({ email, at: new Date().toISOString() });
    await appendFile(path.join(process.cwd(), ".waitlist.jsonl"), `${line}\n`, "utf8");
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

async function saveToKit(
  email: string,
  apiKey: string,
  formId: string,
): Promise<SaveResult> {
  try {
    const response = await fetch(`${KIT_ENDPOINT}/forms/${formId}/subscribers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Kit-Api-Key": apiKey,
      },
      body: JSON.stringify({ email_address: email }),
      // A waitlist signup that hangs is worse than one that fails: the person
      // is watching a spinner. Fail fast and let them retry.
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) return { ok: true };

    // Kit returns 422 when the address is already subscribed. From the
    // visitor's side that is success — they are on the list — and telling them
    // otherwise invites a pointless second attempt.
    if (response.status === 422) return { ok: true };

    console.error(
      `[waitlist] Kit responded ${response.status} for a signup. Address not stored.`,
    );
    return { ok: false, reason: "failed" };
  } catch (error) {
    // Never swallow this silently. Our own positioning is that a sync which
    // breaks quietly is the category's cardinal sin; if ours breaks, it says so.
    console.error("[waitlist] Kit request failed. Address not stored.", error);
    return { ok: false, reason: "failed" };
  }
}
