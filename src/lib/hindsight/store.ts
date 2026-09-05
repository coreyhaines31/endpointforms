import { eq, sql } from "drizzle-orm";

import { newEndpointPublicId, newId } from "../../db/ids.ts";
import { withWorkspace } from "../../db/scoped.ts";
import { endpoints, splitTestExposures, splitTestVariants, splitTests } from "../../db/schema.ts";
import type { PreRegisteredEffect, RankingBasis, SplitTestStatus } from "./types.ts";

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
    | "already_running"
    | "already_registered"
    | "invalid_effect";

  constructor(code: SplitTestStoreError["code"], message: string) {
    super(message);
    this.name = "SplitTestStoreError";
    this.code = code;
  }
}

/**
 * The effect a test commits to before it sees data (#59).
 *
 * `relativeLift` of 0.2 is "a fifth more closed deals"; `baselineRate` is the
 * Yield rate that is relative to. Both are needed and neither is derivable
 * from the other — see `PreRegisteredEffect`.
 */
export type PreRegisterInput = {
  relativeLift: number;
  baselineRate: number;
  basis: RankingBasis;
};

export type CreateSplitTestInput = {
  workspaceId: string;
  endpointPublicId: string;
  name: string;
  createdByUserId?: string | null;
  /** Optional. Absent means the observed rule, which is what every pre-#59 test uses. */
  preRegistered?: PreRegisterInput | null;
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

    const effect = input.preRegistered ? validateEffect(input.preRegistered) : null;
    const now = new Date();

    await ws.tx.insert(splitTests).values({
      id,
      workspaceId: input.workspaceId,
      endpointId: endpoint.id,
      publicId,
      name: input.name,
      status: "draft",
      createdByUserId: input.createdByUserId ?? null,
      ...(effect
        ? {
            mdeRelative: effect.relativeLift.toFixed(4),
            mdeBaselineRate: effect.baselineRate.toFixed(8),
            mdeBasis: effect.basis,
            mdeRegisteredAt: now,
          }
        : {}),
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
 * Records the effect size this test is being run to detect (#59).
 *
 * Two refusals, and both are the feature rather than defensiveness:
 *
 * 1. **Draft only.** A test that could set its target after seeing which way
 *    the numbers went would not be pre-registering anything, it would be
 *    choosing a finish line it had already crossed. The word in the column name
 *    is only true because this refuses.
 * 2. **Once.** Editing it while still a draft would be harmless in principle
 *    and impossible to distinguish afterwards from editing it for the wrong
 *    reason, since `mde_registered_at` would move with each edit and stop
 *    meaning "before the data". A draft registered by mistake can be deleted
 *    and created again; nothing is lost, because a draft has no data.
 */
export async function preRegisterSplitTestEffect(
  workspaceId: string,
  testPublicId: string,
  effect: PreRegisterInput,
  now: Date = new Date(),
): Promise<PreRegisteredEffect> {
  const valid = validateEffect(effect);

  return withWorkspace(workspaceId, async (ws) => {
    const [test] = await ws.tx
      .select({
        id: splitTests.id,
        status: splitTests.status,
        mdeRegisteredAt: splitTests.mdeRegisteredAt,
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
        `This test is ${test.status}. An effect size can only be registered while a test is still a draft — one chosen after the data arrived is not a pre-registration, it is a finish line drawn where the runner already is.`,
      );
    }
    if (test.mdeRegisteredAt !== null) {
      throw new SplitTestStoreError(
        "already_registered",
        "This test already has a registered effect size, and it cannot be changed. If it is wrong, delete this draft and create another — a draft has no data to lose.",
      );
    }

    await ws.tx
      .update(splitTests)
      .set({
        mdeRelative: valid.relativeLift.toFixed(4),
        mdeBaselineRate: valid.baselineRate.toFixed(8),
        mdeBasis: valid.basis,
        mdeRegisteredAt: now,
        updatedAt: now,
      })
      .where(ws.where(splitTests, eq(splitTests.id, test.id)));

    return { ...valid, registeredAt: now };
  });
}

/**
 * The bounds, checked here as well as by `drizzle/0008`'s `CHECK` constraints.
 *
 * Both, not either: the constraint is what makes a bad row impossible whatever
 * writes it, and this is what makes the refusal a sentence a person can read
 * instead of a Postgres error code.
 */
function validateEffect(effect: PreRegisterInput): PreRegisterInput {
  const relativeLift = Number(effect.relativeLift);
  const baselineRate = Number(effect.baselineRate);

  if (!Number.isFinite(relativeLift) || relativeLift <= 0 || relativeLift > 10) {
    throw new SplitTestStoreError(
      "invalid_effect",
      "The improvement to detect has to be a positive percentage, and below 1000%. A zero has no sample size at all — no amount of traffic detects a difference of nothing.",
    );
  }
  if (!Number.isFinite(baselineRate) || baselineRate <= 0 || baselineRate >= 1) {
    throw new SplitTestStoreError(
      "invalid_effect",
      "The baseline Yield rate has to be above 0% and below 100%. At zero there is nothing to improve on, and at 100% there is no room to.",
    );
  }

  return { relativeLift, baselineRate, basis: effect.basis };
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
