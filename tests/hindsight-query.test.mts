/**
 * Hindsight against a real database (#45).
 *
 * `tests/hindsight.test.mts` proves the decision rule; this proves the SQL that
 * feeds it, which is where a different set of things go wrong:
 *
 *   - **A split test crossing a tenant boundary.** A test is a revenue report
 *     with more columns, and it leaking would be worse than the inbox doing it.
 *   - **The median coming from the test instead of the workspace.** The bug
 *     this file exists to catch. A median measured over a test's own decided
 *     submissions is bounded by the test's age, so the maturity gate could
 *     never fire — a five-day-old test in a business with a six-week cycle
 *     would report itself mature. The fixture is built to fail loudly if that
 *     ever regresses: a young test inside a slow workspace must be refused.
 *   - **A missing exposure row becoming a zero.** "Shown nought times" and "we
 *     were not watching" produce different rankings, and only one of them is
 *     ever true.
 *   - **The store's invariants.** A running test whose arms could still be
 *     edited is a test whose visitors get silently reassigned mid-run.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */

import { eq, inArray, like, sql } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { withWorkspace } from "../src/db/scoped.ts";
import { newEndpointPublicId, newId, newSubmissionPublicId } from "../src/db/ids.ts";
import {
  endpoints,
  splitTestExposures,
  splitTestVariants,
  splitTests,
  submissions,
  workspaces,
} from "../src/db/schema.ts";
import { listSplitTests, readRunningTest, readSplitTest } from "../src/lib/hindsight/query.ts";
import { resolveVariant } from "../src/lib/hindsight/serve.ts";
import {
  createSplitTest,
  preRegisterSplitTestEffect,
  recordExposure,
  SplitTestStoreError,
  startSplitTest,
  stopSplitTest,
} from "../src/lib/hindsight/store.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const okay = show(got) === show(want);
  if (okay) pass++;
  else fail++;
  console.log(`  ${okay ? "PASS" : "FAIL"}  ${name}`);
  if (!okay) console.log(`        got  ${show(got)}\n        want ${show(want)}`);
};

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${show(detail)}`);
};

function show(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => (typeof entry === "bigint" ? `${entry}n` : entry));
}

const section = (name: string) => console.log(`\n${name}`);

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const now = Date.now();
const daysAgo = (days: number) => new Date(now - days * DAY);

type ArmSeed = {
  name: string;
  isControl?: boolean;
  weight?: number;
  /** Total exposures, written as a single day's rollup row. Omit for none. */
  exposures?: number;
  won?: number;
  lost?: number;
  disqualified?: number;
  awaiting?: number;
  /** Cents per won deal. Omit to record no amounts. */
  centsPerWon?: number;
};

type TestSeed = {
  name: string;
  status: "draft" | "running" | "stopped";
  startedDaysAgo: number | null;
  stoppedDaysAgo?: number | null;
  /** Days from submission to verdict inside this test. */
  lagDays: number;
  /** Days ago the oldest submission arrived. */
  oldestDaysAgo: number;
  arms: ArmSeed[];
};

type Space = {
  workspaceId: string;
  endpointId: string;
  endpointPublicId: string;
  tests: Map<string, { publicId: string; variantIds: string[] }>;
};

/** Every fixture slug starts `hindsight-test-`, so a crashed run cleans up next time. */
async function cleanup() {
  await unsafeDb.delete(workspaces).where(like(workspaces.slug, "hindsight-test-%"));
}

/**
 * Extra submissions on the endpoint but outside any test.
 *
 * This is what sets the workspace's disposition lag, and it is the whole point
 * of the fixture: the maturity gate has to read *this* number rather than one
 * measured inside the test.
 */
type BackgroundSeed = { count: number; lagDays: number; oldestDaysAgo: number };

async function createSpace(
  slug: string,
  tests: TestSeed[],
  background?: BackgroundSeed,
): Promise<Space> {
  const workspaceId = newId();
  const endpointId = newId();
  const endpointPublicId = newEndpointPublicId();

  await unsafeDb.insert(workspaces).values({ id: workspaceId, slug, name: slug });
  await unsafeDb
    .insert(endpoints)
    .values({ id: endpointId, workspaceId, publicId: endpointPublicId, name: "Book a demo" });

  const rows: (typeof submissions.$inferInsert)[] = [];
  const exposures: (typeof splitTestExposures.$inferInsert)[] = [];
  const made = new Map<string, { publicId: string; variantIds: string[] }>();

  for (const seed of tests) {
    const testId = newId();
    const testPublicId = newEndpointPublicId();
    await unsafeDb.insert(splitTests).values({
      id: testId,
      workspaceId,
      endpointId,
      publicId: testPublicId,
      name: seed.name,
      status: seed.status,
      startedAt: seed.startedDaysAgo === null ? null : daysAgo(seed.startedDaysAgo),
      stoppedAt: seed.stoppedDaysAgo ? daysAgo(seed.stoppedDaysAgo) : null,
    });

    const variantIds: string[] = [];
    for (const arm of seed.arms) {
      const variantId = newId();
      variantIds.push(variantId);
      await unsafeDb.insert(splitTestVariants).values({
        id: variantId,
        workspaceId,
        testId,
        name: arm.name,
        isControl: arm.isControl ?? false,
        weight: arm.weight ?? 1,
      });

      if (arm.exposures !== undefined) {
        exposures.push({
          id: newId(),
          workspaceId,
          testId,
          variantId,
          day: daysAgo(seed.oldestDaysAgo).toISOString().slice(0, 10),
          count: arm.exposures,
        });
      }

      const plan: ("won" | "lost" | "disqualified" | "awaiting")[] = [
        ...Array<"won">(arm.won ?? 0).fill("won"),
        ...Array<"lost">(arm.lost ?? 0).fill("lost"),
        ...Array<"disqualified">(arm.disqualified ?? 0).fill("disqualified"),
        ...Array<"awaiting">(arm.awaiting ?? 0).fill("awaiting"),
      ];

      plan.forEach((verdict, index) => {
        const submittedDaysAgo = Math.max(
          seed.lagDays,
          seed.oldestDaysAgo - Math.floor((index / Math.max(1, plan.length)) * 2),
        );
        const submittedAt = daysAgo(submittedDaysAgo);
        rows.push({
          id: newId(),
          workspaceId,
          endpointId,
          publicId: newSubmissionPublicId(),
          variantId,
          values: { email: `lead-${index}@example.test` },
          verdict,
          verdictValue:
            verdict === "won" && arm.centsPerWon !== undefined
              ? (arm.centsPerWon / 100).toFixed(2)
              : null,
          verdictCurrency:
            verdict === "won" && arm.centsPerWon !== undefined ? "USD" : null,
          verdictAt:
            verdict === "awaiting" ? null : daysAgo(submittedDaysAgo - seed.lagDays),
          submittedAt,
          createdAt: submittedAt,
        });
      });
    }

    made.set(seed.name, { publicId: testPublicId, variantIds });
  }

  if (background) {
    for (let index = 0; index < background.count; index++) {
      const submittedAt = daysAgo(background.oldestDaysAgo);
      rows.push({
        id: newId(),
        workspaceId,
        endpointId,
        publicId: newSubmissionPublicId(),
        values: { email: `background-${index}@example.test` },
        verdict: index % 3 === 0 ? "won" : "lost",
        verdictAt: daysAgo(background.oldestDaysAgo - background.lagDays),
        submittedAt,
        createdAt: submittedAt,
      });
    }
  }

  if (rows.length > 0) await unsafeDb.insert(submissions).values(rows);
  if (exposures.length > 0) await unsafeDb.insert(splitTestExposures).values(exposures);

  return { workspaceId, endpointId, endpointPublicId, tests: made };
}

// ---------------------------------------------------------------------------

async function main() {
  await cleanup();

  // -------------------------------------------------------------------------
  section("the median is the workspace's, not the test's");

  {
    // A test five days old, inside a business that takes forty days to decide a
    // lead. Everything inside the test resolved in a day, because a day is all
    // it has had. A median measured from the test would say "one day, mature,
    // go ahead"; the workspace's own disposition lag says forty, and the test
    // has to be refused.
    const space = await createSpace(
      "hindsight-test-young",
      [
        {
          name: "young",
          status: "running",
          startedDaysAgo: 5,
          lagDays: 1,
          oldestDaysAgo: 5,
          arms: [
            { name: "A", isControl: true, exposures: 4_000, won: 30, lost: 20, disqualified: 10 },
            { name: "B", exposures: 4_000, won: 4, lost: 30, disqualified: 30 },
          ],
        },
      ],
      // Forty submissions elsewhere in the workspace, each taking forty days.
      { count: 40, lagDays: 40, oldestDaysAgo: 90 },
    );

    const report = await readSplitTest(space.workspaceId, space.tests.get("young")!.publicId);
    ok("the test is found", report !== null);
    ok(
      "the median is the workspace's forty days, not the test's one",
      (report!.timing.medianDaysToVerdict ?? 0) > 20,
      report!.timing.medianDaysToVerdict,
    );
    t("so the test is still maturing", report!.state, "still_maturing");
    ok(
      "and the headline says the test is younger than the sales cycle",
      /younger than your sales cycle/i.test(report!.decision.headline),
      report!.decision.headline,
    );
    ok(
      "no winner, despite a fully-decided arm with 7x the Yield",
      report!.state !== "winner",
    );
  }

  // -------------------------------------------------------------------------
  section("a mature test with a real disagreement");

  {
    const space = await createSpace(
      "hindsight-test-mature",
      [
        {
          name: "mature",
          status: "stopped",
          startedDaysAgo: 110,
          stoppedDaysAgo: 10,
          lagDays: 14,
          oldestDaysAgo: 100,
          arms: [
            {
              name: "Seven fields",
              isControl: true,
              exposures: 800,
              won: 24,
              lost: 34,
              disqualified: 22,
              centsPerWon: 171_666,
            },
            {
              name: "Three fields",
              exposures: 800,
              won: 6,
              lost: 30,
              disqualified: 84,
              centsPerWon: 90_000,
            },
          ],
        },
      ],
      { count: 20, lagDays: 14, oldestDaysAgo: 120 },
    );

    const report = await readSplitTest(space.workspaceId, space.tests.get("mature")!.publicId);
    t("both arms come back", report!.arms.length, 2);
    t("ranked per exposure", report!.basis, "exposure");

    const control = report!.arms.find((arm) => arm.variant.name === "Seven fields")!;
    const challenger = report!.arms.find((arm) => arm.variant.name === "Three fields")!;

    t("the control's submissions", control.report.submissions, 80);
    t("the challenger's submissions", challenger.report.submissions, 120);
    t("the control's exposures", control.exposures, 800);
    ok(
      "the challenger wins on completion rate",
      (challenger.completionRate ?? 0) > (control.completionRate ?? 0),
      { challenger: challenger.completionRate, control: control.completionRate },
    );
    ok(
      "and loses on Yield",
      (control.yieldRatePerExposure ?? 0) > (challenger.yieldRatePerExposure ?? 0),
    );
    t("the report says they disagree", report!.disagree, true);
    t("a winner is declared", report!.state, "winner");
    t("and it is the control", report!.yieldLeader, control.variant.id);

    // Money survived Postgres as exact cents rather than through a float.
    t(
      "the control's recorded value is exact",
      control.report.value[0]?.totalCents,
      BigInt(171_666 * 24),
    );
  }

  // -------------------------------------------------------------------------
  section("a missing exposure row is not a zero");

  {
    const space = await createSpace("hindsight-test-noviews", [
      {
        name: "noviews",
        status: "running",
        startedDaysAgo: 100,
        lagDays: 10,
        oldestDaysAgo: 90,
        arms: [
          // No `exposures` key at all on either arm.
          { name: "A", isControl: true, won: 20, lost: 30, disqualified: 30 },
          { name: "B", won: 4, lost: 40, disqualified: 40 },
        ],
      },
    ]);

    const report = await readSplitTest(space.workspaceId, space.tests.get("noviews")!.publicId);
    t("exposures come back as null", report!.arms[0].exposures, null);
    t("not as zero", report!.arms[0].completionRate, null);
    t("so the ranking falls back to per submission", report!.basis, "submission");
    ok(
      "and the panel says why there is no completion rate",
      report!.caveats.some((caveat) => /No view count exists/.test(caveat)),
    );
  }

  {
    // A recorded zero is different, and must survive as one.
    const space = await createSpace("hindsight-test-zeroviews", [
      {
        name: "zero",
        status: "running",
        startedDaysAgo: 100,
        lagDays: 10,
        oldestDaysAgo: 90,
        arms: [
          { name: "A", isControl: true, exposures: 0, won: 20, lost: 30, disqualified: 30 },
          { name: "B", exposures: 500, won: 4, lost: 40, disqualified: 40 },
        ],
      },
    ]);

    const report = await readSplitTest(space.workspaceId, space.tests.get("zero")!.publicId);
    const armA = report!.arms.find((arm) => arm.variant.name === "A")!;
    t("a recorded zero stays a zero", armA.exposures, 0);
    t("and the ranking refuses the exposure basis", report!.basis, "submission");
  }

  // -------------------------------------------------------------------------
  section("deleting submissions from one arm cannot happen quietly");

  {
    // The lever this check exists for. A Yield rate is wins over everything
    // that arrived, so removing an arm's worst submissions raises it — and in a
    // comparison that can flip which variant the panel says to ship. Deletion
    // stays allowed; what it cannot be is invisible.
    const space = await createSpace("hindsight-test-deleted", [
      {
        name: "deleted",
        status: "running",
        startedDaysAgo: 100,
        lagDays: 10,
        oldestDaysAgo: 90,
        arms: [
          { name: "A", isControl: true, exposures: 900, won: 20, lost: 30, disqualified: 40 },
          { name: "B", exposures: 900, won: 8, lost: 30, disqualified: 60 },
        ],
      },
    ]);

    const before = await readSplitTest(space.workspaceId, space.tests.get("deleted")!.publicId);
    const armB = before!.arms.find((arm) => arm.variant.name === "B")!;
    t("B starts with 98 submissions", armB.report.submissions, 98);
    ok(
      "and nothing is claimed to be excluded",
      before!.caveats.every((caveat) => !/deleted/i.test(caveat)),
    );

    // Soft-delete thirty of B's disqualified leads — the tidy-up that doubles
    // as a way to make an arm look better.
    const junk = await unsafeDb
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.variantId, space.tests.get("deleted")!.variantIds[1]))
      .limit(30);
    await unsafeDb
      .update(submissions)
      .set({ deletedAt: new Date() })
      .where(inArray(submissions.id, junk.map((row) => row.id)));

    const after = await readSplitTest(space.workspaceId, space.tests.get("deleted")!.publicId);
    const armBAfter = after!.arms.find((arm) => arm.variant.name === "B")!;
    t("thirty rows leave the denominator", armBAfter.report.submissions, 68);
    ok(
      "and the panel says so, naming the arm",
      after!.caveats.some((caveat) => /^B: 30 deleted/.test(caveat)),
      after!.caveats,
    );
  }

  // -------------------------------------------------------------------------
  section("tenant isolation");

  {
    const mine = await createSpace("hindsight-test-mine", [
      {
        name: "mine",
        status: "running",
        startedDaysAgo: 100,
        lagDays: 10,
        oldestDaysAgo: 90,
        arms: [
          { name: "A", isControl: true, exposures: 900, won: 30, lost: 30, disqualified: 20 },
          { name: "B", exposures: 900, won: 5, lost: 40, disqualified: 40 },
        ],
      },
    ]);
    const neighbour = await createSpace("hindsight-test-neighbour", []);

    const stolen = await readSplitTest(
      neighbour.workspaceId,
      mine.tests.get("mine")!.publicId,
    );
    t("a neighbour cannot read the test at all", stolen, null);

    const listed = await listSplitTests(neighbour.workspaceId, mine.endpointPublicId);
    t("nor list it through someone else's endpoint id", listed.length, 0);

    const running = await readRunningTest(neighbour.workspaceId, mine.endpointId);
    t("nor reach it by internal endpoint id", running, null);

    // ---------------------------------------------------------------------
    // The three assertions above all go through loaders that carry their own
    // `eq(workspace_id)`, so they would pass with the policies switched off
    // entirely — they test the predicate, not the policy. These do not: no
    // `where` clause at all, inside another workspace's scoped transaction.
    // If row-level security is doing its job the tables are empty from here;
    // if it is not, this is a cross-tenant leak of a revenue report.
    const unfiltered = await withWorkspace(neighbour.workspaceId, async (ws) => ({
      tests: await ws.tx.select({ id: splitTests.id }).from(splitTests),
      variants: await ws.tx.select({ id: splitTestVariants.id }).from(splitTestVariants),
      exposures: await ws.tx.select({ id: splitTestExposures.id }).from(splitTestExposures),
    }));

    t("an unfiltered read of split_tests sees nothing", unfiltered.tests.length, 0);
    t("nor split_test_variants", unfiltered.variants.length, 0);
    t("nor split_test_exposures", unfiltered.exposures.length, 0);

    // And the control for that control. The application connects as the table
    // owner, and an owner is exempt from its own policies unless they are
    // FORCEd — so dropping FORCE should make the very same reads return the
    // neighbour's rows. Without this, "saw nothing" could just as easily mean
    // the fixture never wrote anything, and the three assertions above would be
    // passing for the wrong reason forever.
    let leaked = { tests: 0, variants: 0, exposures: 0 };
    try {
      await unsafeDb.execute(sql`ALTER TABLE split_tests NO FORCE ROW LEVEL SECURITY`);
      await unsafeDb.execute(sql`ALTER TABLE split_test_variants NO FORCE ROW LEVEL SECURITY`);
      await unsafeDb.execute(sql`ALTER TABLE split_test_exposures NO FORCE ROW LEVEL SECURITY`);

      leaked = await withWorkspace(neighbour.workspaceId, async (ws) => ({
        tests: (await ws.tx.select({ id: splitTests.id }).from(splitTests)).length,
        variants: (await ws.tx.select({ id: splitTestVariants.id }).from(splitTestVariants)).length,
        exposures: (await ws.tx.select({ id: splitTestExposures.id }).from(splitTestExposures))
          .length,
      }));
    } finally {
      // Restored whatever happened above. A test that leaves FORCE off would
      // disarm tenant isolation for every subsequent suite in the same run.
      await unsafeDb.execute(sql`ALTER TABLE split_tests FORCE ROW LEVEL SECURITY`);
      await unsafeDb.execute(sql`ALTER TABLE split_test_variants FORCE ROW LEVEL SECURITY`);
      await unsafeDb.execute(sql`ALTER TABLE split_test_exposures FORCE ROW LEVEL SECURITY`);
    }

    ok(
      "with FORCE removed the same reads DO leak — so the policy is what stopped them",
      leaked.tests > 0 && leaked.variants > 0 && leaked.exposures > 0,
      leaked,
    );

    const restored = await withWorkspace(neighbour.workspaceId, async (ws) =>
      (await ws.tx.select({ id: splitTests.id }).from(splitTests)).length,
    );
    t("and FORCE is back on afterwards", restored, 0);
  }

  // -------------------------------------------------------------------------
  section("the store's invariants");

  {
    const space = await createSpace("hindsight-test-store", []);

    let refused: string | null = null;
    try {
      await createSplitTest({
        workspaceId: space.workspaceId,
        endpointPublicId: space.endpointPublicId,
        name: "One arm",
        variants: [{ name: "A", isControl: true }],
      });
    } catch (error) {
      refused = error instanceof SplitTestStoreError ? error.code : "wrong error";
    }
    t("one variant is refused", refused, "needs_two_variants");

    refused = null;
    try {
      await createSplitTest({
        workspaceId: space.workspaceId,
        endpointPublicId: space.endpointPublicId,
        name: "No control",
        variants: [{ name: "A" }, { name: "B" }],
      });
    } catch (error) {
      refused = error instanceof SplitTestStoreError ? error.code : "wrong error";
    }
    t("no control is refused", refused, "needs_a_control");

    refused = null;
    try {
      await createSplitTest({
        workspaceId: space.workspaceId,
        endpointPublicId: space.endpointPublicId,
        name: "Two controls",
        variants: [{ name: "A", isControl: true }, { name: "B", isControl: true }],
      });
    } catch (error) {
      refused = error instanceof SplitTestStoreError ? error.code : "wrong error";
    }
    t("two controls are refused", refused, "needs_a_control");

    const created = await createSplitTest({
      workspaceId: space.workspaceId,
      endpointPublicId: space.endpointPublicId,
      name: "A real test",
      variants: [{ name: "A", isControl: true }, { name: "B", weight: 3 }],
    });
    t("a valid test is created as a draft", await status(space.workspaceId, created.publicId), "draft");

    await startSplitTest(space.workspaceId, created.publicId);
    t("and starts", await status(space.workspaceId, created.publicId), "running");

    const second = await createSplitTest({
      workspaceId: space.workspaceId,
      endpointPublicId: space.endpointPublicId,
      name: "A second test",
      variants: [{ name: "A", isControl: true }, { name: "B" }],
    });

    refused = null;
    try {
      await startSplitTest(space.workspaceId, second.publicId);
    } catch (error) {
      refused = error instanceof SplitTestStoreError ? error.code : "wrong error";
    }
    t("a second concurrent test on one endpoint is refused", refused, "already_running");

    await stopSplitTest(space.workspaceId, created.publicId);
    t("stopping works", await status(space.workspaceId, created.publicId), "stopped");

    refused = null;
    try {
      await startSplitTest(space.workspaceId, created.publicId);
    } catch (error) {
      refused = error instanceof SplitTestStoreError ? error.code : "wrong error";
    }
    t("and a stopped test cannot be restarted", refused, "test_not_draft");

    // Now the second one can run, because the first is stopped.
    await startSplitTest(space.workspaceId, second.publicId);
    t("the queued test starts once the first stops", await status(space.workspaceId, second.publicId), "running");

    const running = await readRunningTest(space.workspaceId, space.endpointId);
    t("and is the one the serving path finds", running?.publicId, second.publicId);
    t("with its arms, control first", running?.variants[0]?.isControl, true);
  }

  // -------------------------------------------------------------------------
  section("recording an exposure");

  {
    const space = await createSpace("hindsight-test-exposure", []);
    const created = await createSplitTest({
      workspaceId: space.workspaceId,
      endpointPublicId: space.endpointPublicId,
      name: "Counting",
      variants: [{ name: "A", isControl: true }, { name: "B" }],
    });
    await startSplitTest(space.workspaceId, created.publicId);

    const variantId = created.variants[0].id;
    const testId = (await readRunningTest(space.workspaceId, space.endpointId))!.id;

    for (let index = 0; index < 5; index++) {
      await recordExposure(space.workspaceId, testId, variantId);
    }

    const report = await readSplitTest(space.workspaceId, created.publicId);
    const arm = report!.arms.find((entry) => entry.variant.id === variantId)!;
    t("five renders become a count of five, not five rows", arm.exposures, 5);

    const other = report!.arms.find((entry) => entry.variant.id !== variantId)!;
    t("and the arm nothing was recorded for stays null", other.exposures, null);
  }

  // -------------------------------------------------------------------------
  section("serving a variant");

  {
    const space = await createSpace("hindsight-test-serve", []);
    const created = await createSplitTest({
      workspaceId: space.workspaceId,
      endpointPublicId: space.endpointPublicId,
      name: "Serving",
      variants: [{ name: "A", isControl: true }, { name: "B" }],
    });

    // A draft splits nothing. Until somebody starts the test, every visitor
    // gets the endpoint's ordinary form and no submission is stamped.
    t(
      "a draft test serves nobody a variant",
      await resolveVariant(space.endpointPublicId, "visitor-one"),
      null,
    );

    await startSplitTest(space.workspaceId, created.publicId);

    const first = await resolveVariant(space.endpointPublicId, "visitor-one");
    ok("a running test serves an arm", first !== null, first);

    const again = await resolveVariant(space.endpointPublicId, "visitor-one");
    t("and the same visitor gets the same arm on a second request", again?.variantId, first?.variantId);

    // The property the submit path depends on: it re-derives the arm from the
    // cookie rather than trusting anything the browser posted, which only works
    // because two independent calls agree.
    t("which is what makes the submit path's re-derivation safe", again?.variantName, first?.variantName);

    t(
      "a visitor with no cookie is not enrolled rather than fingerprinted into one",
      await resolveVariant(space.endpointPublicId, null),
      null,
    );
    t(
      "and an endpoint that does not exist serves nothing",
      await resolveVariant("nosuchendpoint", "visitor-one"),
      null,
    );

    // Both arms are reachable — a splitter that always returns the same arm
    // would pass every assertion above and still be broken.
    const seen = new Set<string>();
    for (let index = 0; index < 200; index++) {
      const served = await resolveVariant(space.endpointPublicId, `visitor-${index}`);
      if (served) seen.add(served.variantName);
    }
    t("and traffic actually reaches both arms", [...seen].sort(), ["A", "B"]);

    await stopSplitTest(space.workspaceId, created.publicId);
    t(
      "a stopped test stops splitting, so later leads are simply not in it",
      await resolveVariant(space.endpointPublicId, "visitor-one"),
      null,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\npre-registering an effect, and refusing to un-register it (#59)");
  // -------------------------------------------------------------------------
  //
  // The value of a pre-registration is entirely in what it refuses. A number
  // that could be set after the data arrived, or revised once it did, would be
  // a finish line drawn where the runner already is — so "it can be written
  // once, while the test is still a draft" is the feature and not a guard rail
  // around it. Each refusal below is bracketed by the write that succeeds, so a
  // fixture that silently created nothing cannot pass this section.
  {
    const space = await createSpace("hindsight-test-prereg", []);

    const created = await createSplitTest({
      workspaceId: space.workspaceId,
      endpointPublicId: space.endpointPublicId,
      name: "Registered at creation",
      variants: [{ name: "A", isControl: true }, { name: "B" }],
      preRegistered: { relativeLift: 0.25, baselineRate: 0.08, basis: "submission" },
    });

    const atCreation = await readSplitTest(space.workspaceId, created.publicId);
    t("an effect given at creation is stored", atCreation?.test.preRegistered?.relativeLift, 0.25);
    t("…with its baseline", atCreation?.test.preRegistered?.baselineRate, 0.08);
    t("…and its denominator", atCreation?.test.preRegistered?.basis, "submission");
    ok(
      "…and a requirement exists with no submissions anywhere",
      (atCreation?.requirement.perArm ?? 0) > 0,
    );
    t("…from the pre-registration", atCreation?.requirement.source, "pre_registered");

    // A test created without one, then registered afterwards while still a draft.
    const later = await createSplitTest({
      workspaceId: space.workspaceId,
      endpointPublicId: space.endpointPublicId,
      name: "Registered later",
      variants: [{ name: "A", isControl: true }, { name: "B" }],
    });

    const before = await readSplitTest(space.workspaceId, later.publicId);
    t("a test created without one has none", before?.test.preRegistered, null);
    t("and falls back to the observed rule", before?.requirement.source, "observed");

    await preRegisterSplitTestEffect(space.workspaceId, later.publicId, {
      relativeLift: 0.2,
      baselineRate: 0.05,
      basis: "submission",
    });
    const after = await readSplitTest(space.workspaceId, later.publicId);
    t("registering it on a draft works", after?.test.preRegistered?.relativeLift, 0.2);
    ok("and it is dated", after?.test.preRegistered?.registeredAt instanceof Date);

    // Once, and only once.
    let refused: string | null = null;
    try {
      await preRegisterSplitTestEffect(space.workspaceId, later.publicId, {
        relativeLift: 0.9,
        baselineRate: 0.05,
        basis: "submission",
      });
    } catch (error) {
      refused = error instanceof SplitTestStoreError ? error.code : "wrong error";
    }
    t("a second registration is refused", refused, "already_registered");
    t(
      "and the original number is untouched",
      (await readSplitTest(space.workspaceId, later.publicId))?.test.preRegistered?.relativeLift,
      0.2,
    );

    // Not once it is running. This is the refusal the word "pre-registered"
    // rests on, so it is asserted against a test that was started for real.
    const running = await createSplitTest({
      workspaceId: space.workspaceId,
      endpointPublicId: space.endpointPublicId,
      name: "Started without one",
      variants: [{ name: "A", isControl: true }, { name: "B" }],
    });
    await startSplitTest(space.workspaceId, running.publicId);

    refused = null;
    try {
      await preRegisterSplitTestEffect(space.workspaceId, running.publicId, {
        relativeLift: 0.2,
        baselineRate: 0.05,
        basis: "submission",
      });
    } catch (error) {
      refused = error instanceof SplitTestStoreError ? error.code : "wrong error";
    }
    t("registering an effect on a running test is refused", refused, "test_not_draft");
    t(
      "and it still has none",
      (await readSplitTest(space.workspaceId, running.publicId))?.test.preRegistered,
      null,
    );

    // Values that cannot produce a sample size are refused rather than stored
    // and silently ignored later.
    for (const [label, effect] of [
      ["a zero lift", { relativeLift: 0, baselineRate: 0.05, basis: "submission" as const }],
      ["a negative lift", { relativeLift: -0.2, baselineRate: 0.05, basis: "submission" as const }],
      ["a zero baseline", { relativeLift: 0.2, baselineRate: 0, basis: "submission" as const }],
      ["a baseline of one", { relativeLift: 0.2, baselineRate: 1, basis: "submission" as const }],
    ] as const) {
      const fresh = await createSplitTest({
        workspaceId: space.workspaceId,
        endpointPublicId: space.endpointPublicId,
        name: `Invalid — ${label}`,
        variants: [{ name: "A", isControl: true }, { name: "B" }],
      });
      let code: string | null = null;
      try {
        await preRegisterSplitTestEffect(space.workspaceId, fresh.publicId, effect);
      } catch (error) {
        code = error instanceof SplitTestStoreError ? error.code : "wrong error";
      }
      t(`${label} is refused`, code, "invalid_effect");
    }

    // A test in another workspace is not reachable by public id.
    const other = await createSpace("hindsight-test-prereg-other", []);
    refused = null;
    try {
      await preRegisterSplitTestEffect(other.workspaceId, later.publicId, {
        relativeLift: 0.2,
        baselineRate: 0.05,
        basis: "submission",
      });
    } catch (error) {
      refused = error instanceof SplitTestStoreError ? error.code : "wrong error";
    }
    t("another workspace cannot register an effect on this test", refused, "test_not_found");
  }

  await cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

async function status(workspaceId: string, testPublicId: string): Promise<string | null> {
  const { readSplitTestStatus } = await import("../src/lib/hindsight/store.ts");
  return readSplitTestStatus(workspaceId, testPublicId);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
