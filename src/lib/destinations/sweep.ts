import { timingSafeEqual } from "node:crypto";

import { sweepDueRetries, type DispatchOptions } from "./dispatch.ts";
import { reapStaleAttempts, workspacesWithDeliveryWork } from "./store.ts";

/**
 * The scheduled sweep (#42) — what turns "retries happen when someone else
 * submits" into retries that actually happen.
 *
 * ## Why this exists
 *
 * There is no job queue in this stack. Without a scheduled caller, a failed
 * delivery's retry waits to be picked up by the next submission to the same
 * endpoint — which means **an endpoint that takes one lead a week and then
 * breaks does not retry for a week.** That is a real hole in a feature whose
 * entire argument is that a broken integration gets noticed, so it is closed
 * with the cheapest thing that closes it: a cron hitting one guarded route.
 *
 * ## What it does, in order
 *
 * 1. **Reaps stale attempts.** A row left `pending` because the process that
 *    opened it went away is worse than a missing row: `consecutiveFailures` does
 *    not count it, so the destination reads as healthy while a lead sits
 *    undelivered. Reaping turns it into a failure with a sentence on it, and
 *    schedules a retry under the normal policy.
 * 2. **Retries what is due.** Per workspace, bounded, through the same
 *    `sweepDueRetries` the ingest path uses — one code path, so a retry fired by
 *    cron and one fired by a submission cannot diverge.
 *
 * ## Why it cannot double-deliver
 *
 * Two independent reasons, and both matter because a cron and a submission can
 * collide:
 *
 * - `claimDueRetries` **claims a row with an update that also requires
 *   `next_retry_at` to still be set**, and counts it claimed only if that update
 *   returns it. A second sweep blocks on the row lock, re-checks the predicate
 *   against the committed version, and takes nothing.
 * - That claim also opens the attempt's `pending` row, so a delivery already in
 *   flight cannot be started again by anything except the reaper, and only after
 *   `STALE_ATTEMPT_MS` — far longer than an attempt can run (#60).
 * - The delivery id is **derived** from `(destination, submission)` rather than
 *   stored, so every attempt of the same delivery — from a sweep, from the
 *   ingest path, from the redeliver button, from a different machine three hours
 *   later — carries the identical `x-endpoint-delivery-id`. A receiver that
 *   dedupes on it cannot write the lead twice even if we do send it twice.
 *
 * ## Plain Web Request/Response, no Next APIs
 *
 * Same shape as `src/lib/verdict/handler.ts`: the route under `src/app` is glue,
 * everything real is here, and `tests/destinations-db.test.mts` exercises it by
 * calling a function rather than standing up a server.
 */

/** Caps, so one invocation cannot become a thousand outbound requests. */
export const SWEEP_WORKSPACE_LIMIT = 100;
export const SWEEP_RETRIES_PER_WORKSPACE = 25;
export const SWEEP_STALE_PER_WORKSPACE = 50;

export type SweepSummary = {
  ok: true;
  /** Workspaces that had something waiting. Not the total number of workspaces. */
  workspaces: number;
  /** Pending rows presumed abandoned and turned into honest failures. */
  reaped: number;
  delivered: number;
  failed: number;
  skipped: number;
  /** True when a cap was hit, so the caller knows another pass has work to do. */
  more: boolean;
};

/**
 * The shared secret a scheduled caller proves it holds.
 *
 * `CRON_SECRET` is the name Vercel Cron sets and sends automatically as
 * `Authorization: Bearer $CRON_SECRET`, so using that exact name means the
 * schedule needs no extra wiring and no secret of our own invention.
 */
function cronSecret(): string | null {
  const value = (process.env.CRON_SECRET ?? "").trim();
  return value === "" ? null : value;
}

/**
 * Whether a request may run the sweep.
 *
 * **Deployed with no `CRON_SECRET` set, the route refuses everything.** It does
 * not fall open, and it does not fall back to "any request from a private IP" or
 * a header a caller can forge. A sweep endpoint that anyone can hit is a way to
 * make our server issue outbound requests on demand, and an unauthenticated one
 * that quietly works is worse than one that visibly does not.
 */
export function isAuthorisedSweep(request: Request): boolean {
  const secret = cronSecret();
  if (secret === null) return false;

  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;

  const offered = Buffer.from(header.slice(prefix.length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  // Length is checked first because `timingSafeEqual` throws on a mismatch, and
  // the length of a secret is not itself the secret.
  if (offered.length !== expected.length) return false;
  return timingSafeEqual(offered, expected);
}

/**
 * Runs the sweep. Bounded, idempotent, and safe to call twice.
 *
 * Idempotent in the sense that matters for a cron whose previous run overran:
 * a second invocation finds nothing to claim, because the first one cleared
 * `next_retry_at` on everything it took.
 */
export async function runSweep(options: DispatchOptions = {}): Promise<SweepSummary> {
  const now = options.now ?? new Date();

  const workspaceIds = await workspacesWithDeliveryWork({
    now,
    limit: SWEEP_WORKSPACE_LIMIT,
  });

  const summary: SweepSummary = {
    ok: true,
    workspaces: workspaceIds.length,
    reaped: 0,
    delivered: 0,
    failed: 0,
    skipped: 0,
    more: workspaceIds.length >= SWEEP_WORKSPACE_LIMIT,
  };

  for (const workspaceId of workspaceIds) {
    // Reap first. A stale row reaped now schedules a retry that a later pass
    // picks up, rather than being retried in the same breath it was declared
    // dead — the backoff exists for a reason and skipping it for these would
    // hammer a destination that is probably still down.
    try {
      summary.reaped += await reapStaleAttempts(workspaceId, {
        now,
        limit: SWEEP_STALE_PER_WORKSPACE,
      });
    } catch (error) {
      // One workspace's failure must not stop the sweep for everyone else.
      console.error(`[destinations] reap failed for workspace ${workspaceId}`, error);
    }

    const result = await sweepDueRetries(workspaceId, {
      ...options,
      now,
      limit: SWEEP_RETRIES_PER_WORKSPACE,
    });
    summary.delivered += result.delivered;
    summary.failed += result.failed;
    summary.skipped += result.skipped;
  }

  return summary;
}

/**
 * `GET|POST /api/v1/deliveries/sweep`.
 *
 * Answers JSON either way. The 401 says what is wrong without saying whether a
 * secret is configured — an unauthenticated caller learning "this deployment has
 * no CRON_SECRET" learns that the endpoint is one env var away from being open.
 */
export async function handleSweep(
  request: Request,
  options: DispatchOptions = {},
): Promise<Response> {
  // **GET is accepted, and that is not laziness.** Vercel Cron issues a GET,
  // so refusing it would mean the schedule silently 405s forever and the whole
  // point of this route — that a broken integration gets retried — would be
  // quietly untrue. POST is accepted too, for a human or a script invoking it
  // by hand, because a sweep is a mutation and POST is what that reads like.
  if (request.method !== "POST" && request.method !== "GET") {
    return json(
      405,
      {
        ok: false,
        error: "method_not_allowed",
        message: "The delivery sweep runs on GET (what Vercel Cron sends) or POST.",
      },
      { allow: "GET, POST" },
    );
  }

  if (!isAuthorisedSweep(request)) {
    return json(
      401,
      {
        ok: false,
        error: "unauthorized",
        message:
          "This endpoint is for a scheduled caller. Send `Authorization: Bearer <CRON_SECRET>`.",
      },
      { "www-authenticate": 'Bearer realm="endpointforms-sweep", charset="UTF-8"' },
    );
  }

  try {
    return json(200, await runSweep(options));
  } catch (error) {
    // A sweep that fails must say so with a 500, so a failing cron shows up in
    // the platform's own alerting rather than logging quietly forever. This
    // whole feature is about breakage being visible.
    console.error("[destinations] sweep failed", error);
    return json(500, {
      ok: false,
      error: "sweep_failed",
      message: "The delivery sweep could not complete. Nothing was lost; the next run will retry.",
    });
  }
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // A sweep result is never cacheable and never a thing a browser should
      // hold on to.
      "cache-control": "no-store",
      ...headers,
    },
  });
}
