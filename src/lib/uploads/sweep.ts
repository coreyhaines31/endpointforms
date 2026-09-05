import { isAuthorisedSweep } from "../destinations/sweep.ts";
import { retentionDays } from "./limits.ts";
import { purgeExpiredUploads } from "./store.ts";

/**
 * The retention sweep (#66) — the thing that makes the retention rule true.
 *
 * ## Why this has to exist rather than being a filter
 *
 * `loadFile` already refuses to serve a file whose expiry has passed, so a
 * customer never gets bytes they were told were deleted. But "we will not show
 * it to you" is not the same promise as "it is gone", and only one of those is
 * worth writing in a privacy policy. Without a sweep the bytes sit in the
 * database forever and the retention rule is a display convention. This is what
 * makes it a fact.
 *
 * ## Why it reuses the deliveries sweep's authorisation
 *
 * `isAuthorisedSweep` from `../destinations/sweep.ts`, unchanged and imported
 * rather than copied. It is the same `Authorization: Bearer $CRON_SECRET` that
 * Vercel Cron sends automatically, it refuses everything when `CRON_SECRET` is
 * unset, and a second implementation of the same check is a second thing that
 * can be subtly weaker. There is nothing about deleting files that wants a
 * different door from the one that triggers outbound requests.
 *
 * ## What it does not do
 *
 * It does not touch the `submission_files` row, only the bytes in it. See
 * `purgeExpiredUploads`: the name, the size and the SHA-256 survive, so the
 * inbox can say what was deleted and when instead of showing a submission that
 * has quietly lost a field.
 */

export type UploadSweepSummary = {
  ok: true;
  /** `0` when this deployment keeps files indefinitely, in which case nothing ran. */
  retentionDays: number;
  workspaces: number;
  purged: number;
  /** True when a cap was hit, so the caller knows another pass has work to do. */
  more: boolean;
};

export async function handleUploadSweep(request: Request): Promise<Response> {
  if (!isAuthorisedSweep(request)) {
    return json(401, {
      ok: false,
      error: "unauthorized",
      message:
        "This endpoint is for the scheduled retention sweep. Send Authorization: Bearer $CRON_SECRET. With no CRON_SECRET set it refuses everything.",
    });
  }

  const days = retentionDays();
  if (days === 0) {
    // Retention is off. Reporting that plainly beats a run that purges nothing
    // and looks identical to a run that had nothing to purge.
    return json(200, { ok: true, retentionDays: 0, workspaces: 0, purged: 0, more: false });
  }

  const result = await purgeExpiredUploads();
  return json(200, {
    ok: true,
    retentionDays: days,
    workspaces: result.workspaces,
    purged: result.purged,
    more: result.more,
  } satisfies UploadSweepSummary);
}

function json(status: number, body: unknown): Response {
  return new Response(`${JSON.stringify(body)}\n`, {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
