/**
 * Seeds two Hindsight split tests (#45), because one of them is not enough.
 *
 * ## The two screens this exists to make reachable
 *
 * **A stopped, mature test where the raw winner is the Yield loser.** Three
 * fields collect half again as many submissions as seven and close a quarter as
 * many deals. Every other form builder in the category would have shipped the
 * three-field form, because the submit event is the only thing it can see. This
 * is the most persuasive screen the product has, and it has to exist in a fresh
 * clone or it cannot be shown to anybody.
 *
 * **A running test nine days old that refuses to say anything.** This is the
 * state a real customer is in almost all of the time, and it is the harder
 * screen to get right. A demo where every test has already concluded would sell
 * a product that does not exist — and worse, it would hide the feature, because
 * the refusal *is* the feature.
 *
 * ## The numbers are chosen, and here is the arithmetic
 *
 * The mature test has to clear every gate in `src/lib/hindsight/compare.ts`, so
 * the counts are picked to do that rather than picked to look plausible:
 *
 *   Seven fields  800 views → 80 submissions (10.0%), 24 won → Yield 3.00%
 *   Three fields  800 views → 120 submissions (15.0%), 6 won → Yield 0.75%
 *
 * Completion says three fields, by half again. Yield says seven fields, by
 * four times. Significance on 24/800 against 6/800 is z ≈ 3.3, p ≈ 0.0009, and
 * `requiredSamplePerArm` for that difference is about 570 — under the 800 each
 * arm has, so it is powered as well as significant and the peeking gate opens.
 * Both arms are fully decided and the test ran for a hundred days against a
 * workspace median of roughly a fortnight, so the maturity gates open too.
 *
 * The young test is the mirror image: nine days old, about a third decided, so
 * `still_maturing` fires on the clock before anything else is even consulted.
 *
 * ## Deterministic, not random
 *
 * Every count, name and amount below is derived from a fixed pattern rather
 * than a random draw, so two people running the seed are looking at the same
 * screen when they talk about it — the same reason the main seed hand-lists its
 * twenty-one submissions instead of generating them.
 */
import { eq } from "drizzle-orm";

import { newEndpointPublicId, newId, newSubmissionPublicId } from "../src/db/ids.ts";
import {
  endpoints,
  formSchemas,
  splitTestExposures,
  splitTestVariants,
  splitTests,
  submissions,
} from "../src/db/schema.ts";
import type { unsafeDb } from "../src/db/client.ts";

type Db = typeof unsafeDb;

const DAY = 24 * 60 * 60 * 1000;

/** Seven fields. The control: what this business was already running. */
const SEVEN_FIELDS = {
  fields: [
    { key: "name", label: "Your name", type: "text", required: true },
    { key: "email", label: "Work email", type: "email", required: true },
    { key: "company", label: "Company", type: "text", required: true },
    { key: "role", label: "Your role", type: "text", required: true },
    { key: "size", label: "How many people work there?", type: "text", required: true },
    { key: "budget", label: "Approximate budget", type: "text", required: false },
    { key: "note", label: "What are you trying to do?", type: "textarea", required: false },
  ],
};

/** Three fields. The challenger, and the one every best-practice article recommends. */
const THREE_FIELDS = {
  fields: [
    { key: "name", label: "Your name", type: "text", required: true },
    { key: "email", label: "Work email", type: "email", required: true },
    { key: "note", label: "What are you trying to do?", type: "textarea", required: false },
  ],
};

/** A short intro above the form. The young test changes only this. */
const SHORT_INTRO = {
  fields: [
    { key: "name", label: "Your name", type: "text", required: true },
    { key: "email", label: "Work email", type: "email", required: true },
    { key: "company", label: "Company", type: "text", required: true },
    { key: "note", label: "What are you trying to do?", type: "textarea", required: false },
  ],
};

type ArmPlan = {
  name: string;
  isControl: boolean;
  fields: unknown;
  /** Total server renders, spread evenly across the run. */
  exposures: number;
  submissions: number;
  won: number;
  lost: number;
  disqualified: number;
  /** Cents, spread across the won deals. Undefined means no amounts recorded. */
  totalCents?: number;
};

type TestPlan = {
  name: string;
  status: "running" | "stopped";
  /** Days before now that the test started splitting traffic. */
  startedDaysAgo: number;
  /** Days before now that it stopped. Null while it is still running. */
  stoppedDaysAgo: number | null;
  /** Days from submission to verdict, cycled through so the median is stable. */
  verdictLagDays: number[];
  arms: ArmPlan[];
};

const PLANS: TestPlan[] = [
  {
    name: "Three fields against seven",
    status: "stopped",
    startedDaysAgo: 110,
    stoppedDaysAgo: 10,
    // Median lands on 14, p90 on 26. A spread rather than a constant, so the
    // long tail the panel warns about is actually present in the data.
    verdictLagDays: [9, 11, 12, 13, 14, 14, 15, 16, 18, 26],
    arms: [
      {
        name: "Seven fields",
        isControl: true,
        fields: SEVEN_FIELDS,
        exposures: 800,
        submissions: 80,
        won: 24,
        lost: 34,
        disqualified: 22,
        totalCents: 41_200_00,
      },
      {
        name: "Three fields",
        isControl: false,
        fields: THREE_FIELDS,
        exposures: 800,
        submissions: 120,
        won: 6,
        lost: 30,
        disqualified: 84,
        totalCents: 5_400_00,
      },
    ],
  },
  {
    name: "Shorter intro above the form",
    status: "running",
    startedDaysAgo: 9,
    stoppedDaysAgo: null,
    // Everything decided here resolved fast, which is exactly the fast tail the
    // maturity gate exists to distrust.
    verdictLagDays: [2, 3, 3, 4, 5],
    arms: [
      {
        name: "Long intro",
        isControl: true,
        fields: SEVEN_FIELDS,
        exposures: 300,
        submissions: 30,
        won: 2,
        lost: 3,
        disqualified: 4,
        totalCents: 9_800_00,
      },
      {
        name: "Short intro",
        isControl: false,
        fields: SHORT_INTRO,
        exposures: 300,
        submissions: 42,
        won: 1,
        lost: 2,
        disqualified: 5,
        totalCents: 3_100_00,
      },
    ],
  },
];

/** Fixed pools, so the same run produces the same names in the same order. */
const COMPANIES = [
  "Halstead Group", "Ardley Systems", "Peniston Works", "Norbury Supply",
  "Kelsall Partners", "Ingham Foundry", "Ravenscar Ltd", "Thackley Mills",
  "Brindle & Co", "Oakmere Plant", "Farndale Tooling", "Wetherby Cast",
];
const SURNAMES = [
  "Aldridge", "Bramall", "Coyne", "Delaney", "Ferris", "Gaskell",
  "Haworth", "Iveson", "Jarrold", "Kirkbride", "Lonsdale", "Mowbray",
];
const FORENAMES = [
  "Amara", "Bilal", "Cerys", "Dov", "Esther", "Farid",
  "Greta", "Hana", "Idris", "Jonah", "Kemi", "Lucas",
];

/**
 * Adds both tests to an existing endpoint's workspace.
 *
 * Creates its own endpoint rather than reusing "Request a quote": that endpoint
 * has twenty-one submissions and a hand-written history, and dropping two
 * hundred generated rows into it would destroy the thing it was built to show.
 */
export async function seedHindsightTests(
  db: Db,
  input: { workspaceId: string; userId: string; now: number },
): Promise<{ endpointPublicId: string; tests: { name: string; publicId: string }[] }> {
  const { workspaceId, userId, now } = input;
  const daysAgo = (n: number) => new Date(now - n * DAY);

  const endpointId = newId();
  const endpointPublicId = newEndpointPublicId();

  await db.insert(endpoints).values({
    id: endpointId,
    workspaceId,
    publicId: endpointPublicId,
    name: "Book a demo",
    createdAt: daysAgo(130),
  });

  const created: { name: string; publicId: string }[] = [];
  const submissionRows: (typeof submissions.$inferInsert)[] = [];
  const exposureRows: (typeof splitTestExposures.$inferInsert)[] = [];
  let schemaVersion = 0;
  let sequence = 0;

  // The control arm of whichever test is still running becomes the endpoint's
  // live schema. Without this the endpoint has no active schema at all, and
  // `/f/{id}` renders the "no schema declared" notice rather than a form — so
  // the serving path this feature depends on could not be exercised by hand on
  // a fresh clone. It is also the realistic order of events: you publish a
  // form, then start testing variants of it.
  let liveSchemaVersionId: string | null = null;

  for (const plan of PLANS) {
    const testId = newId();
    const testPublicId = newEndpointPublicId();
    const startedAt = daysAgo(plan.startedDaysAgo);
    const stoppedAt = plan.stoppedDaysAgo === null ? null : daysAgo(plan.stoppedDaysAgo);
    const runDays = plan.startedDaysAgo - (plan.stoppedDaysAgo ?? 0);

    await db.insert(splitTests).values({
      id: testId,
      workspaceId,
      endpointId,
      publicId: testPublicId,
      name: plan.name,
      status: plan.status,
      startedAt,
      stoppedAt,
      createdByUserId: userId,
      createdAt: daysAgo(plan.startedDaysAgo + 1),
    });
    created.push({ name: plan.name, publicId: testPublicId });

    for (const armPlan of plan.arms) {
      schemaVersion += 1;
      const schemaVersionId = newId();

      // Each arm points at a real, immutable `form_schemas` row. A variant does
      // not carry its own copy of a form — see the note on
      // `split_test_variants.schema_version_id`.
      await db.insert(formSchemas).values({
        id: schemaVersionId,
        workspaceId,
        endpointId,
        version: schemaVersion,
        fields: armPlan.fields as Record<string, unknown>,
        mode: "warn",
        source: "builder",
        createdByUserId: userId,
        createdAt: daysAgo(plan.startedDaysAgo + 1),
      });

      if (plan.status === "running" && armPlan.isControl) liveSchemaVersionId = schemaVersionId;

      const variantId = newId();
      await db.insert(splitTestVariants).values({
        id: variantId,
        workspaceId,
        testId,
        schemaVersionId,
        name: armPlan.name,
        isControl: armPlan.isControl,
        weight: 1,
        createdAt: daysAgo(plan.startedDaysAgo + 1),
      });

      // Exposures, spread evenly over the run with the remainder on the first
      // day. Evenly rather than realistically: a weekday curve would make the
      // totals harder to check by hand against the arithmetic in this file's
      // header, and nothing in the product reads the daily shape yet.
      const perDay = Math.floor(armPlan.exposures / runDays);
      const remainder = armPlan.exposures - perDay * runDays;
      for (let offset = 0; offset < runDays; offset++) {
        const count = perDay + (offset === 0 ? remainder : 0);
        if (count <= 0) continue;
        exposureRows.push({
          id: newId(),
          workspaceId,
          testId,
          variantId,
          day: daysAgo(plan.startedDaysAgo - offset).toISOString().slice(0, 10),
          count,
        });
      }

      // Verdicts, in a fixed order: won first, then lost, then disqualified,
      // then whatever is left over as awaiting. Ordered rather than shuffled so
      // the counts in the header are readable straight off the loop.
      const awaiting =
        armPlan.submissions - armPlan.won - armPlan.lost - armPlan.disqualified;
      if (awaiting < 0) {
        throw new Error(`seed-hindsight: ${armPlan.name} has more outcomes than submissions`);
      }

      const perWonCents =
        armPlan.totalCents === undefined || armPlan.won === 0
          ? null
          : Math.round(armPlan.totalCents / armPlan.won);

      for (let index = 0; index < armPlan.submissions; index++) {
        sequence += 1;
        const verdict =
          index < armPlan.won
            ? "won"
            : index < armPlan.won + armPlan.lost
              ? "lost"
              : index < armPlan.won + armPlan.lost + armPlan.disqualified
                ? "disqualified"
                : "awaiting";

        // Submissions land evenly across the run, oldest first, so every one of
        // them is old enough for the verdict lag below to be in the past.
        const submittedDaysAgo =
          plan.startedDaysAgo - Math.floor((index / armPlan.submissions) * runDays);
        const submittedAt = daysAgo(submittedDaysAgo);
        const lag = plan.verdictLagDays[index % plan.verdictLagDays.length];
        const verdictAt =
          verdict === "awaiting" ? null : daysAgo(Math.max(0, submittedDaysAgo - lag));

        // One won deal in each arm has no amount recorded. Yield counts it
        // fully towards the rate and not at all towards the value, and both
        // panels say so — a deal with no amount is not a deal worth nothing.
        const recordValue = verdict === "won" && perWonCents !== null && index > 0;

        const forename = FORENAMES[sequence % FORENAMES.length];
        const surname = SURNAMES[(sequence * 5) % SURNAMES.length];
        const company = COMPANIES[(sequence * 7) % COMPANIES.length];

        submissionRows.push({
          id: newId(),
          workspaceId,
          endpointId,
          publicId: newSubmissionPublicId(),
          schemaVersionId,
          variantId,
          values: {
            name: `${forename} ${surname}`,
            email: `${forename.toLowerCase()}@${company.toLowerCase().replace(/[^a-z]/g, "")}.example`,
            company,
            note:
              verdict === "disqualified"
                ? "Just looking for pricing."
                : "Looking at replacing our current setup this quarter.",
          },
          rawContentType: "application/x-www-form-urlencoded",
          origin: index % 11 === 0 ? "unverified" : "human",
          verdict,
          verdictValue: recordValue ? (perWonCents! / 100).toFixed(2) : null,
          verdictCurrency: recordValue ? "USD" : null,
          verdictAt,
          verdictSource: verdict === "awaiting" ? null : "webhook",
          submittedAt,
          createdAt: submittedAt,
          updatedAt: submittedAt,
          utmSource: index % 3 === 0 ? "google" : null,
          utmMedium: index % 3 === 0 ? "cpc" : null,
          utmCampaign: index % 3 === 0 ? "demo-request" : null,
        });
      }
    }
  }

  await db.insert(submissions).values(submissionRows);
  await db.insert(splitTestExposures).values(exposureRows);

  if (liveSchemaVersionId) {
    await db
      .update(endpoints)
      .set({ activeSchemaVersionId: liveSchemaVersionId })
      .where(eq(endpoints.id, endpointId));
  }

  return { endpointPublicId, tests: created };
}

/** Removes anything a previous run of this seeder left behind. */
export async function clearHindsightTests(db: Db, workspaceId: string): Promise<void> {
  // Everything below cascades from the endpoint, which cascades from the
  // workspace. The main seed deletes the workspace outright before calling
  // this, so it is here only for a targeted re-run.
  await db.delete(endpoints).where(eq(endpoints.workspaceId, workspaceId));
}
