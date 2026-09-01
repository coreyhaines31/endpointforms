import { and, eq, sql } from "drizzle-orm";

import { withWorkspace } from "../../db/scoped.ts";
import { endpointSpamPolicies, endpoints, spamListEntries, submissions } from "../../db/schema.ts";
import type { SpamListEffect, SpamListKind } from "../../db/schema.ts";
import { invalidateSpamConfig } from "./store.ts";
import type { SpamPolicy } from "./types.ts";

/**
 * Overruling the score, and maintaining the lists (#31).
 *
 * ## Reversibility is the requirement, not a nicety
 *
 * A heuristic that flags a real customer's lead has to be undoable by the
 * person looking at it, in one click, permanently. `markNotSpam` sets a state
 * that rescoring never overwrites — the score stays on the row so the mistake
 * stays legible, and the state says a person disagreed with it. That is the
 * whole reason `submission_spam_state` has four values instead of two.
 *
 * ## Nothing here deletes a submission
 *
 * There is no `deleteSpam`, no purge, no bulk-remove. Marking something
 * `confirmed_spam` records a judgement and changes nothing else about the row:
 * it stays in the inbox, stays in exports, stays in the count. If a customer
 * wants a submission gone they use the ordinary delete, which is a soft delete
 * like every other, and they do it deliberately rather than as a side effect of
 * agreeing with our regex.
 */

export type ReviewOutcome = "not_spam" | "confirmed_spam";

/**
 * Records that a person read a flagged submission and made a call.
 *
 * Scoped to the workspace, addressed by the submission's public ID. A public ID
 * from another workspace matches zero rows and returns `false`, which the action
 * turns into the same "no longer here" sentence as one that never existed.
 */
export async function reviewSubmissionSpam(
  workspaceId: string,
  submissionPublicId: string,
  outcome: ReviewOutcome,
  reviewedByUserId: string,
): Promise<boolean> {
  return withWorkspace(workspaceId, async (ws) => {
    const updated = await ws.tx
      .update(submissions)
      .set({
        spamState: outcome,
        spamReviewedAt: new Date(),
        spamReviewedByUserId: reviewedByUserId,
        updatedAt: new Date(),
      })
      // `spam_score` and `spam_reasons` are deliberately untouched. The score
      // that got it wrong is evidence, and overwriting it would erase the only
      // record of why a customer had to intervene.
      .where(ws.where(submissions, eq(submissions.publicId, submissionPublicId)))
      .returning({ id: submissions.id });

    return updated.length > 0;
  });
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export type SpamListRow = {
  id: string;
  kind: SpamListKind;
  effect: SpamListEffect;
  value: string;
  label: string | null;
  createdAt: Date;
};

export async function listSpamEntries(workspaceId: string): Promise<SpamListRow[]> {
  return withWorkspace(workspaceId, async (ws) => {
    return ws.tx
      .select({
        id: spamListEntries.id,
        kind: spamListEntries.kind,
        effect: spamListEntries.effect,
        value: spamListEntries.value,
        label: spamListEntries.label,
        createdAt: spamListEntries.createdAt,
      })
      .from(spamListEntries)
      .where(eq(spamListEntries.workspaceId, workspaceId))
      .orderBy(spamListEntries.createdAt);
  });
}

/**
 * Adds an entry, or does nothing if it is already there.
 *
 * `ON CONFLICT DO NOTHING` rather than an error: typing the same domain twice
 * is not a mistake anyone needs to be told about, and an error there is a
 * settings screen that argues with its user.
 */
export async function addSpamListEntry(input: {
  workspaceId: string;
  kind: SpamListKind;
  effect: SpamListEffect;
  value: string;
  label: string | null;
  createdByUserId: string;
}): Promise<void> {
  await withWorkspace(input.workspaceId, async (ws) => {
    await ws.tx
      .insert(spamListEntries)
      .values({
        workspaceId: input.workspaceId,
        kind: input.kind,
        effect: input.effect,
        value: input.value,
        label: input.label,
        createdByUserId: input.createdByUserId,
      })
      .onConflictDoNothing({
        target: [
          spamListEntries.workspaceId,
          spamListEntries.kind,
          spamListEntries.effect,
          spamListEntries.value,
        ],
      });
  });
  invalidateSpamConfig();
}

export async function removeSpamListEntry(workspaceId: string, id: string): Promise<boolean> {
  const removed = await withWorkspace(workspaceId, async (ws) => {
    return ws.tx
      .delete(spamListEntries)
      .where(and(eq(spamListEntries.workspaceId, workspaceId), eq(spamListEntries.id, id)))
      .returning({ id: spamListEntries.id });
  });
  invalidateSpamConfig();
  return removed.length > 0;
}

// ---------------------------------------------------------------------------
// Per-endpoint policy
// ---------------------------------------------------------------------------

/**
 * Writes an endpoint's policy, creating the row the first time.
 *
 * A missing row means the defaults, so this only ever exists for an endpoint
 * whose owner has changed something. `onConflictDoUpdate` on the unique
 * endpoint index makes "first change" and "later change" the same code path.
 */
export async function saveSpamPolicy(
  workspaceId: string,
  endpointPublicId: string,
  policy: SpamPolicy,
): Promise<boolean> {
  const saved = await withWorkspace(workspaceId, async (ws) => {
    const found = await ws.tx
      .select({ id: endpoints.id })
      .from(endpoints)
      .where(ws.where(endpoints, eq(endpoints.publicId, endpointPublicId)))
      .limit(1);

    const endpoint = found[0];
    if (!endpoint) return null;

    const values = {
      enabled: policy.enabled,
      honeypot: policy.honeypot,
      timing: policy.timing,
      duplicate: policy.duplicate,
      velocity: policy.velocity,
      content: policy.content,
      disposableEmail: policy.disposableEmail,
      threshold: policy.threshold,
      honeypotField: policy.honeypotField,
    };

    await ws.tx
      .insert(endpointSpamPolicies)
      .values({ workspaceId, endpointId: endpoint.id, ...values })
      .onConflictDoUpdate({
        target: endpointSpamPolicies.endpointId,
        set: { ...values, updatedAt: sql`now()` },
      });

    return endpoint.id;
  });

  if (saved) invalidateSpamConfig(saved);
  return saved !== null;
}

export async function loadSpamPolicyForEditing(
  workspaceId: string,
  endpointPublicId: string,
): Promise<SpamPolicy | null> {
  return withWorkspace(workspaceId, async (ws) => {
    const rows = await ws.tx
      .select({
        enabled: endpointSpamPolicies.enabled,
        honeypot: endpointSpamPolicies.honeypot,
        timing: endpointSpamPolicies.timing,
        duplicate: endpointSpamPolicies.duplicate,
        velocity: endpointSpamPolicies.velocity,
        content: endpointSpamPolicies.content,
        disposableEmail: endpointSpamPolicies.disposableEmail,
        threshold: endpointSpamPolicies.threshold,
        honeypotField: endpointSpamPolicies.honeypotField,
      })
      .from(endpoints)
      .leftJoin(endpointSpamPolicies, eq(endpointSpamPolicies.endpointId, endpoints.id))
      .where(ws.where(endpoints, eq(endpoints.publicId, endpointPublicId)))
      .limit(1);

    const row = rows[0];
    if (!row || row.enabled === null) return null;

    return {
      enabled: row.enabled,
      honeypot: row.honeypot ?? true,
      timing: row.timing ?? true,
      duplicate: row.duplicate ?? true,
      velocity: row.velocity ?? true,
      content: row.content ?? true,
      disposableEmail: row.disposableEmail ?? true,
      threshold: row.threshold ?? 5,
      honeypotField: row.honeypotField,
    };
  });
}
