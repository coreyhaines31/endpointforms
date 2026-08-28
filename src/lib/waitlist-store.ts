import "server-only";

import { appendFile } from "node:fs/promises";
import path from "node:path";

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "no-sink" | "failed" };

/**
 * Persists a waitlist signup.
 *
 * The homepage's only conversion goal is this form, so it must never report
 * "You're on the list" without something actually having been written down.
 * Three sinks, in order:
 *
 *   1. An email provider, once one is configured — TODO(#7).
 *   2. In local development, a gitignored JSONL file. Keeps the page honest
 *      and demoable before a provider exists.
 *   3. In production with no provider, refuse. A serverless filesystem is
 *      ephemeral, so writing there would drop the address and still show a
 *      success message — the precise failure this product exists to complain
 *      about.
 */
export async function saveSubscriber(email: string): Promise<SaveResult> {
  // TODO(#7): when KIT_API_KEY / KIT_FORM_ID are set, POST to the provider
  // here and return { ok: false, reason: "failed" } if the call errors.
  if (process.env.KIT_API_KEY && process.env.KIT_FORM_ID) {
    return { ok: false, reason: "no-sink" };
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
