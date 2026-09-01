import { eq, sql } from "drizzle-orm";

import { newEndpointPublicId, newId } from "../../db/ids.ts";
import { withWorkspace } from "../../db/scoped.ts";
import { endpoints, splitTestExposures, splitTestVariants, splitTests } from "../../db/schema.ts";
import type { SplitTestStatus } from "./types.ts";

/**
 * Writing split tests down (#45).
 *
 * Two invariants are enforced here rather than merely described, and both exist
 * because breaking either produces a test that looks fine and is not:
 *
 * 1. **A running test's arms are frozen.** Adding, removing or reweighting a
 *    variant moves the bucket boundaries that `./assign.ts` hashes visitors
 *    into, so some visitors silently change arms mid-run — their views counted
 *    under one variant and their submissions landing under another. No hash
 *    avoids this; the only defence is refusing the edit, and this file is where
 *    the refusal lives. Changing the arms means starting a new test.
 * 2. **Exactly one control.** Enforced twice over: the partial unique index
 *    `split_test_variants_one_control` makes a second one impossible, and
 *    `startSplitTest` refuses a test with none. Without a control, "B beat A"
 *    and "A beat B" are the same sentence read from opposite ends.
 *
 * A test is never hard-deleted and neither is a variant. Every submission
 * carries the variant id it was served under, and a deleted arm would orphan
 * those rows with no way to say afterwards which leads belonged where.
 */

export class SplitTestStoreError extends Error {
  readonly code:
    | "endpoint_not_found"
    | "test_not_found"
    | "test_not_draft"
    | "needs_two_variants"
    | "needs_a_control"
    | "already_running";

  constructor(code: SplitTestStoreError["code"], message: string) {
    super(message);
    this.name = "SplitTestStoreError";
    this.code = code;
  }
}

export type CreateSplitTestInput = {
  workspaceId: string;
  endpointPublicId: string;
  name: string;
  createdByUserId?: string | null;
  /**
   * The arms. Exactly one must be the control; a `schemaVersionId` of null
   * means "whatever the endpoint's active schema is", which is the ordinary
   * shape of an arm that changes nothing.
   */
  variants: {
    name: string;
    isControl?: boolean;
    weight?: number;
    schemaVersionId?: string | null;
  }[];
};

export type CreatedSplitTest = {
  id: string;
  publicId: string;
  variants: { id: string; name: string; isControl: boolean }[];
};

/** Creates a draft. Nothing is split until `startSplitTest`. */
export async function createSplitTest(
  input: CreateSplitTestInput,
): Promise<CreatedSplitTest> {
  if (input.variants.length < 2) {
    throw new SplitTestStoreError(
      "needs_two_variants",
      "A split test needs at least two variants. One variant is a form, not a test.",
    );
  }
  if (input.variants.filter((variant) => variant.isControl).length !== 1) {
    throw new SplitTestStoreError(
      "needs_a_control",
      "Exactly one variant has to be the control — the arm the others are measured against.",
    );
  }

  return withWorkspace(input.workspaceId, async (ws) => {
    const [endpoint] = await ws.tx
      .select({ id: endpoints.id })
      .from(endpoints)
      .where(ws.where(endpoints, eq(endpoints.publicId, input.endpointPublicId)))
      .limit(1);

    if (!endpoint) {
      throw new SplitTestStoreError(
        "endpoint_not_found",
        "That endpoint does not exist in this workspace.",
      );
    }

    const id = newId();
    // The same generator endpoints use. These appear in an app URL, not in a
    // form action, but there is no reason for a second alphabet.
    const publicId = newEndpointPublicId();

    await ws.tx.insert(splitTests).values({
      id,
      workspaceId: input.workspaceId,
      endpointId: endpoint.id,
      publicId,
      name: input.name,
      status: "draft",
      createdByUserId: input.createdByUserId ?? null,
    });

    const variants = input.variants.map((variant) => ({
      id: newId(),
      workspaceId: input.workspaceId,
      testId: id,
      name: variant.name,
      isControl: variant.isControl ?? false,
      weight: variant.weight ?? 1,
      schemaVersionId: variant.schemaVersionId ?? null,
    }));

    await ws.tx.insert(splitTestVariants).values(variants);

    return {
      id,
      publicId,
      variants: variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        isControl: variant.isControl,
      })),
    };
  });
}

/**
 * Starts splitting traffic.
 *
 * Refuses when another test is already running on the same endpoint. Two
 * concurrent tests on one form is not two experiments, it is one experiment
 * with four arms that nobody configured and whose interaction nothing accounts
 * for — and the submissions would carry only one variant id, so it could not
 * even be untangled afterwards.
 */
export async function startSplitTest(
  workspaceId: string,
  testPublicId: string,
  now: Date = new Date(),
): Promise<void> {
  await withWorkspace(workspaceId, async (ws) => {
    const [test] = await ws.tx
      .select({
        id: splitTests.id,
        endpointId: splitTests.endpointId,
        status: splitTests.status,
      })
      .from(splitTests)
      .where(ws.where(splitTests, eq(splitTests.publicId, testPublicId)))
      .limit(1);

    if (!test) {
      throw new SplitTestStoreError("test_not_found", "That split test does not exist.");
    }
    if (test.status !== "draft") {
      throw new SplitTestStoreError(
        "test_not_draft",
        `This test is ${test.status}. A test can only be started from a draft — starting a stopped one again would mix two populations under one set of numbers.`,
      );
    }

    const [running] = await ws.tx
      .select({ id: splitTests.id })
      .from(splitTests)
      .where(
        ws.where(
          splitTests,
          eq(splitTests.endpointId, test.endpointId),
          eq(splitTests.status, "running"),
        ),
      )
      .limit(1);

    if (running) {
      throw new SplitTestStoreError(
        "already_running",
        "Another test is already running on this endpoint. Stop it first — two tests on one form is one test with arms nobody configured.",
      );
    }

    const variants = await ws.tx
      .select({ id: splitTestVariants.id, isControl: splitTestVariants.isControl })
      .from(splitTestVariants)
      .where(ws.where(splitTestVariants, eq(splitTestVariants.testId, test.id)));

    if (variants.length < 2) {
      throw new SplitTestStoreError(
        "needs_two_variants",
        "A split test needs at least two variants before it can start.",
      );
    }
    if (!variants.some((variant) => variant.isControl)) {
      throw new SplitTestStoreError(
        "needs_a_control",
        "This test has no control, so there is nothing for the other arms to be measured against.",
      );
    }

    await ws.tx
      .update(splitTests)
      .set({ status: "running", startedAt: now, updatedAt: now })
      .where(ws.where(splitTests, eq(splitTests.id, test.id)));
  });
}

/**
 * Stops splitting traffic. The report keeps working; it stops moving.
 *
 * Deliberately not "declare the winner". Whether to ship an arm is a decision a
 * person makes, and a button that both ends the test and promotes the leader
 * would make stopping the test the same gesture as acting on it — which is the
 * peeking problem with a UI attached.
 */
export async function stopSplitTest(
  workspaceId: string,
  testPublicId: string,
  now: Date = new Date(),
): Promise<void> {
  await withWorkspace(workspaceId, async (ws) => {
    const updated = await ws.tx
      .update(splitTests)
      .set({ status: "stopped", stoppedAt: now, updatedAt: now })
      .where(
        ws.where(
          splitTests,
          eq(splitTests.publicId, testPublicId),
          eq(splitTests.status, "running"),
        ),
      )
      .returning({ id: splitTests.id });

    if (updated.length === 0) {
      throw new SplitTestStoreError(
        "test_not_found",
        "No running test with that ID in this workspace.",
      );
    }
  });
}

/**
 * Records that an arm was rendered.
 *
 * One upsert against `split_test_exposures_variant_day_key`, on the hottest
 * read path in the product. `ON CONFLICT DO UPDATE` rather than a read followed
 * by a write, because two simultaneous renders would both read the same count
 * and both write the same increment, losing one — and an exposure count that
 * quietly undercounts under load is a completion rate that quietly overstates.
 *
 * The caller does not await this on the critical path; see the note in the form
 * page. A dropped exposure costs a small amount of accuracy in a denominator. A
 * form that took an extra round-trip to render costs a lead.
 */
export async function recordExposure(
  workspaceId: string,
  testId: string,
  variantId: string,
  now: Date = new Date(),
): Promise<void> {
  const day = now.toISOString().slice(0, 10);

  await withWorkspace(workspaceId, async (ws) => {
    await ws.tx
      .insert(splitTestExposures)
      .values({ id: newId(), workspaceId, testId, variantId, day, count: 1 })
      .onConflictDoUpdate({
        target: [splitTestExposures.variantId, splitTestExposures.day],
        set: { count: sql`${splitTestExposures.count} + 1` },
      });
  });
}

/** The status of one test, without loading its arms. */
export async function readSplitTestStatus(
  workspaceId: string,
  testPublicId: string,
): Promise<SplitTestStatus | null> {
  return withWorkspace(workspaceId, async (ws) => {
    const [row] = await ws.tx
      .select({ status: splitTests.status })
      .from(splitTests)
      .where(ws.where(splitTests, eq(splitTests.publicId, testPublicId)))
      .limit(1);
    return row?.status ?? null;
  });
}
