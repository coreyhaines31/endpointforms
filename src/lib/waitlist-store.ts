import "server-only";

import { appendFile } from "node:fs/promises";
import path from "node:path";

import {
  acknowledged,
  buildWaitlistBody,
  type WaitlistContext,
} from "@/lib/waitlist-endpoint";

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "no-sink" | "failed" };

/**
 * Persists a waitlist signup.
 *
 * The homepage's only conversion goal is this form, so it must never report
 * "You're on the list" without something actually having been written down.
 * In production there are exactly two outcomes and nothing between them:
 *
 *   1. Endpoint Forms itself (#33), when WAITLIST_ENDPOINT_URL (or its
 *      NEXT_PUBLIC_ twin) names a form endpoint. We are the first customer.
 *   2. Otherwise, refuse out loud — which is what the live form already does
 *      today, so a broken or absent endpoint can only ever return the site to
 *      where it started, never to a false success.
 *
 * Local development with no endpoint configured is the one exception: it
 * appends to a gitignored JSONL file so the page stays demoable offline. That
 * branch is deliberately unreachable in production, because a serverless
 * filesystem is ephemeral and writing there would drop the address while still
 * showing a success message — the precise failure this product exists to
 * complain about.
 *
 * There is deliberately **no third-party ESP** in this list, and none is to be
 * added — not as a fallback, not "if configured", not behind an env var. The
 * waitlist is the first form the product handles, and a mail provider quietly
 * catching the signups it drops would make that claim untrue while looking
 * like it worked. See CLAUDE.md.
 *
 * **This function is the fallback, not the main path.** With the endpoint
 * configured, a visitor whose browser runs JavaScript posts to it directly —
 * see `src/lib/waitlist-endpoint.ts` for why that distinction is the entire
 * reason #33 exists. What reaches here is the no-JavaScript submit and the
 * retry after a failed browser post, and both are stamped honestly for what
 * they are: an HTTP request made by our server.
 */
export async function saveSubscriber(
  email: string,
  context: WaitlistContext = {},
): Promise<SaveResult> {
  const endpointUrl = waitlistEndpointUrl();

  if (endpointUrl) {
    const stored = await saveToEndpoint(endpointUrl, email, context);
    if (stored.ok) return stored;

    // Configured, and the attempt failed. `failed` rather than `no-sink` on
    // purpose: the waitlist *is* open, this one request did not land, and "try
    // again in a moment" is the true thing to say. Telling someone the list is
    // closed would send them away from a form that works.
    if (process.env.NODE_ENV === "production") return stored;
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

/**
 * The endpoint this instance posts to.
 *
 * `NEXT_PUBLIC_WAITLIST_ENDPOINT_URL` is the one the browser uses and the one
 * that normally carries the traffic; the non-public name exists so a deployment
 * can point the server half somewhere else without changing what is baked into
 * the client bundle.
 */
function waitlistEndpointUrl(): string | null {
  const configured =
    process.env.WAITLIST_ENDPOINT_URL ?? process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT_URL;
  const trimmed = configured?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Identifies this request for what it is: our server, forwarding on behalf of
 * somebody whose browser could not post for itself.
 *
 * Chosen so it does *not* look like a browser. `decideOrigin` will score it
 * Unverified — no `Sec-Fetch-*`, no `Accept-Language`, no `Origin`, no token —
 * and that is the correct answer, not a bug to work around. A human filled the
 * form, but nothing in the request that reached the endpoint can corroborate a
 * browser session, and saying otherwise would be forging our own provenance on
 * the one form we own.
 */
const SERVER_FORWARD_USER_AGENT =
  "EndpointForms-Waitlist/1.0 (server-forwarded; +https://endpointforms.com/)";

/**
 * The no-JavaScript path. Posts the same fields to the same public endpoint a
 * customer's form would use — no private route, no shared secret, no header
 * that says "trust me, I'm a browser."
 */
async function saveToEndpoint(
  endpointUrl: string,
  email: string,
  context: WaitlistContext,
): Promise<SaveResult> {
  const body = buildWaitlistBody({ email, channel: "server-forward", context });

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        accept: "application/json",
        "user-agent": SERVER_FORWARD_USER_AGENT,
      },
      body: body.toString(),
      // A signup that hangs is worse than one that fails: somebody is
      // watching a spinner. Fail fast and let them retry.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      // Never swallow this. Our own positioning is that a sync which breaks
      // quietly is the category's cardinal sin — and with nothing behind this
      // sink, these logs are the only warning anyone gets that signups are
      // being turned away.
      console.error(
        `[waitlist] endpoint responded ${response.status} for a signup. Address not stored.`,
      );
      return { ok: false, reason: "failed" };
    }

    // A 200 whose body does not say `ok: true` is not a stored submission.
    // Reading it is the difference between "we wrote it down" and "we posted
    // somewhere and hoped".
    const payload: unknown = await response.json().catch(() => null);
    if (acknowledged(payload)) return { ok: true };

    console.error(
      "[waitlist] endpoint answered 200 without an acknowledgement. Address not stored.",
    );
    return { ok: false, reason: "failed" };
  } catch (error) {
    console.error("[waitlist] endpoint request failed. Address not stored.", error);
    return { ok: false, reason: "failed" };
  }
}
