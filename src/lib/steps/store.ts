import { eq, isNull, sql } from "drizzle-orm";

import { newId, newPartialPublicId } from "../../db/ids.ts";
import { withWorkspace } from "../../db/scoped.ts";
import { submissionPartials } from "../../db/schema.ts";
import type { JsonValue } from "../ingest/body.ts";
import type { ResolvedEndpoint } from "../ingest/store.ts";
import type { OriginReason, OriginState } from "../origin/types.ts";
import { PARTIAL_KEY_PATTERN } from "./format.ts";

/**
 * Writing a partial down, and marking it finished (#37).
 *
 * ## Nothing in this file may ever answer with an error
 *
 * Every function here fails quietly and logs. Not because failure is
 * unimportant — this table is where the flow keeps its state, so a failed write
 * does cost the visitor the answers they had typed — but because there is no
 * failure here whose *correct* response is to show somebody a 500 on a form
 * they are halfway through. The recovery is one level up, in the page: no
 * readable partial means the whole form on one screen, which the visitor can
 * fill in and submit. Every path through this file degrades to that.
 *
 * ## One row per visit, not one per screen
 *
 * `ON CONFLICT … DO UPDATE` against the unique index on
 * `(endpoint_id, partial_key)`, so the fourth screen updates the row the first
 * screen created. The alternative — a row per step, reduced at read time — was
 * rejected: the inbox would have had to work out which of five rows *is* the
 * person, and it would have got it wrong the first time somebody used two tabs.
 *
 * ## This table is also the flow's state, and that is not a contradiction
 *
 * A 303 turns a POST into a GET, so the answers cannot travel in the request
 * from one screen to the next; they are read back from here. `./plan.ts`
 * explains the trade in full. What matters at this end is the consequence:
 * `readPartial` failing must degrade to *the whole form on one screen*, never
 * to a visitor who cannot continue. That fallback lives in the page, and it is
 * the reason `readPartial` returns null rather than throwing.
 *
 * ## Why the completed ones are kept
 *
 * `completePartial` sets `completed_at` rather than deleting the row. The whole
 * claim of this feature is that you can see what happened before the submit,
 * and "they stopped on the pricing screen for six minutes and then finished" is
 * exactly that. A completed partial is excluded from every open-partial count
 * and every open-partial list, so it can never be the second row for one
 * person — but it is still there.
 */

/**
 * How long an unfinished visit can be resumed for.
 *
 * A partial older than this is still in the table and still in the inbox — it
 * is a lead, and leads do not expire on a timer. What expires is the ability to
 * *continue* it from the link: a fortnight-old key handed to somebody else's
 * browser should not reopen a stranger's half-filled form. Past the window the
 * visitor gets a fresh, empty form.
 */
export const RESUME_WINDOW_MS = 14 * 24 * 60 * 60 * 1_000;

/** Beyond this many open partials from one address on one endpoint, stop writing. */
const MAX_OPEN_PER_IP = 25;

export type PartialRecord = {
  /** The opaque token this visit carries. Server-generated; see `newPartialKey`. */
  partialKey: string;
  schemaVersionId: string | null;
  variantId: string | null;
  /** The step that was just completed. */
  stepId: string | null;
  stepNumber: number | null;
  stepsTotal: number | null;
  values: Record<string, JsonValue>;
  origin: OriginState;
  originReasons: OriginReason[];
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  clickIds: Record<string, string>;
  referrer: string | null;
  userAgent: string | null;
  ipHash: string | null;
  now: Date;
};

/**
 * Records a visit that has completed a screen and not finished the form.
 *
 * Returns nothing. Callers must not branch on it, and there is deliberately no
 * error to catch: see the note at the top of this file.
 */
export async function capturePartial(
  endpoint: ResolvedEndpoint,
  record: PartialRecord,
): Promise<void> {
  try {
    await withWorkspace(endpoint.workspaceId, async (ws) => {
      // The flood guard, checked before the insert rather than enforced by a
      // constraint, because the correct response to hitting it is to write
      // nothing and carry on — not to fail a request the visitor is waiting on.
      //
      // Scoped to open partials from one address on one endpoint. A genuine
      // visitor has one; somebody generating fresh tokens has as many as they
      // have posted. Updates to an existing row are never blocked by it, so a
      // real visitor already past the cap on a shared corporate NAT still
      // advances and still has their answers kept.
      const existing = await ws.tx
        .select({ id: submissionPartials.id })
        .from(submissionPartials)
        .where(
          ws.where(
            submissionPartials,
            eq(submissionPartials.endpointId, endpoint.id),
            eq(submissionPartials.partialKey, record.partialKey),
          ),
        )
        .limit(1);

      if (existing.length === 0 && record.ipHash !== null) {
        const open = await ws.tx
          .select({ count: sql<number>`count(*)::int` })
          .from(submissionPartials)
          .where(
            ws.where(
              submissionPartials,
              eq(submissionPartials.endpointId, endpoint.id),
              eq(submissionPartials.ipHash, record.ipHash),
              isNull(submissionPartials.completedAt),
            ),
          );
        if ((open[0]?.count ?? 0) >= MAX_OPEN_PER_IP) return;
      }

      await ws.tx
        .insert(submissionPartials)
        .values({
          id: newId(),
          workspaceId: endpoint.workspaceId,
          endpointId: endpoint.id,
          publicId: newPartialPublicId(),
          partialKey: record.partialKey,
          schemaVersionId: record.schemaVersionId,
          variantId: record.variantId,
          stepId: record.stepId,
          stepNumber: record.stepNumber,
          stepsTotal: record.stepsTotal,
          values: record.values,
          origin: record.origin,
          originReasons: record.originReasons,
          utmSource: record.utmSource,
          utmMedium: record.utmMedium,
          utmCampaign: record.utmCampaign,
          utmTerm: record.utmTerm,
          utmContent: record.utmContent,
          clickIds: record.clickIds,
          referrer: record.referrer,
          userAgent: record.userAgent,
          ipHash: record.ipHash,
          startedAt: record.now,
          updatedAt: record.now,
        })
        .onConflictDoUpdate({
          target: [submissionPartials.endpointId, submissionPartials.partialKey],
          set: {
            stepId: record.stepId,
            stepNumber: record.stepNumber,
            stepsTotal: record.stepsTotal,
            values: record.values,
            origin: record.origin,
            originReasons: record.originReasons,
            updatedAt: record.now,
          },
          // A partial that already finished is not reopened by a late or
          // replayed step post. Without this, a visitor pressing Back on the
          // thank-you page and resubmitting a screen would resurrect their own
          // completed capture and appear in the inbox twice — once as the lead
          // and once as somebody who never finished.
          setWhere: isNull(submissionPartials.completedAt),
        });
    });
  } catch (error) {
    // Logged with the endpoint and nothing from the payload. A partial is
    // customer data in exactly the way a submission is.
    console.error(
      `[steps] partial not captured for endpoint ${JSON.stringify(endpoint.publicId)}`,
      error,
    );
  }
}

/**
 * Marks the partial this submission grew out of as finished.
 *
 * Called from the ingest path *after* the submission row is committed, in the
 * region where nothing can cost the lead any more. It fails silently for the
 * same reason everything else here does; the cost of failure is one row in the
 * inbox showing as still open, which is a great deal cheaper than a 500 on a
 * submission that has already been stored.
 */
export async function completePartial(
  workspaceId: string,
  endpointId: string,
  partialKey: string,
  submissionId: string | null,
  now: Date = new Date(),
): Promise<void> {
  try {
    await withWorkspace(workspaceId, async (ws) => {
      await ws.tx
        .update(submissionPartials)
        .set({ completedAt: now, submissionId, updatedAt: now })
        .where(
          ws.where(
            submissionPartials,
            eq(submissionPartials.endpointId, endpointId),
            eq(submissionPartials.partialKey, partialKey),
            isNull(submissionPartials.completedAt),
          ),
        );
    });
  } catch (error) {
    console.error(`[steps] partial not marked complete on endpoint ${endpointId}`, error);
  }
}

/**
 * How many visits to an endpoint are open — started, not finished.
 *
 * Used by the inbox header. Deliberately not exposed anywhere near Yield: this
 * number is not a submission count and must never be added to one.
 */
export async function countOpenPartials(
  workspaceId: string,
  endpointId?: string,
): Promise<number> {
  return withWorkspace(workspaceId, async (ws) => {
    const rows = await ws.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(submissionPartials)
      .where(
        ws.where(
          submissionPartials,
          isNull(submissionPartials.completedAt),
          endpointId === undefined
            ? undefined
            : eq(submissionPartials.endpointId, endpointId),
        ),
      );
    return rows[0]?.count ?? 0;
  });
}


export type StoredPartial = {
  publicId: string;
  partialKey: string;
  stepId: string | null;
  values: Record<string, JsonValue>;
  updatedAt: Date;
};

/**
 * The visit a key names, or null.
 *
 * Null for every reason there is: no such key, a key belonging to another
 * endpoint, a visit that already finished, one older than the resume window,
 * or a database we could not reach. **Every one of those has to produce the
 * same safe outcome at the call site** — the whole form on one screen, which
 * the visitor can fill in and submit — so they are deliberately not
 * distinguished here. A caller that could tell them apart would be tempted to
 * treat one of them as an error page.
 *
 * A finished visit returning null is what stops the thank-you page's Back
 * button dropping somebody back into a form they already submitted.
 */
export async function readPartial(
  workspaceId: string,
  endpointId: string,
  partialKey: string,
  now: Date = new Date(),
): Promise<StoredPartial | null> {
  if (!PARTIAL_KEY_PATTERN.test(partialKey)) return null;

  try {
    return await withWorkspace(workspaceId, async (ws) => {
      const rows = await ws.tx
        .select({
          publicId: submissionPartials.publicId,
          partialKey: submissionPartials.partialKey,
          stepId: submissionPartials.stepId,
          values: submissionPartials.values,
          updatedAt: submissionPartials.updatedAt,
          completedAt: submissionPartials.completedAt,
        })
        .from(submissionPartials)
        .where(
          ws.where(
            submissionPartials,
            eq(submissionPartials.endpointId, endpointId),
            eq(submissionPartials.partialKey, partialKey),
          ),
        )
        .limit(1);

      const row = rows[0];
      if (!row) return null;
      if (row.completedAt !== null) return null;
      if (now.getTime() - row.updatedAt.getTime() > RESUME_WINDOW_MS) return null;

      const values = row.values;
      return {
        publicId: row.publicId,
        partialKey: row.partialKey,
        stepId: row.stepId,
        values:
          values !== null && typeof values === "object" && !Array.isArray(values)
            ? (values as Record<string, JsonValue>)
            : {},
        updatedAt: row.updatedAt,
      };
    });
  } catch (error) {
    console.error(`[steps] partial not readable on endpoint ${endpointId}`, error);
    return null;
  }
}
