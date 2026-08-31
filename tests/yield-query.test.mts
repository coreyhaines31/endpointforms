/**
 * Yield against a real database (#44).
 *
 * `tests/yield.test.mts` proves the arithmetic; this proves the SQL that feeds
 * it, which is where a different set of things go wrong:
 *
 *   - **A revenue report crossing a tenant boundary.** The most important test
 *     in the file, and the reason none of these reads exist outside
 *     `withWorkspace`.
 *   - **`sum()` on a `numeric` column arriving as something JavaScript rounds.**
 *     The fixture uses amounts whose total is wrong by a cent if anything on
 *     the path touches a float.
 *   - **Currencies being added together.** Two currencies in one workspace must
 *     come back as two totals, never one.
 *   - **A soft-deleted submission still counting**, which would move a revenue
 *     number for a housekeeping reason.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */

import { eq, like } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { describeDatabase } from "../src/db/env.ts";
import { newEndpointPublicId, newId, newSubmissionPublicId } from "../src/db/ids.ts";
import { endpoints, submissions, workspaces } from "../src/db/schema.ts";
import { readYield, readYieldByDimension } from "../src/lib/yield/query.ts";

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

type Seed = {
  verdict: "won" | "lost" | "disqualified" | "awaiting";
  value?: string | null;
  currency?: string | null;
  day: number;
  /** Days after submission that the verdict landed. */
  decidedAfter?: number;
  origin?: "human" | "agent" | "unverified";
  utmSource?: string | null;
  deleted?: boolean;
};

type Space = {
  workspaceId: string;
  endpointPublicId: string;
  otherEndpointPublicId: string;
};

/** Every fixture slug starts `yield-test-`, so a crashed run cleans up next time. */
async function cleanup() {
  await unsafeDb.delete(workspaces).where(like(workspaces.slug, "yield-test-%"));
}

async function createSpace(slug: string, seeds: Seed[], otherSeeds: Seed[] = []): Promise<Space> {
  const workspaceId = newId();
  const endpointId = newId();
  const otherEndpointId = newId();
  const endpointPublicId = newEndpointPublicId();
  const otherEndpointPublicId = newEndpointPublicId();

  await unsafeDb.insert(workspaces).values({ id: workspaceId, slug, name: slug });
  await unsafeDb.insert(endpoints).values([
    { id: endpointId, workspaceId, publicId: endpointPublicId, name: "Contact" },
    { id: otherEndpointId, workspaceId, publicId: otherEndpointPublicId, name: "Demo request" },
  ]);

  const rows = [
    ...seeds.map((seed) => row(workspaceId, endpointId, seed)),
    ...otherSeeds.map((seed) => row(workspaceId, otherEndpointId, seed)),
  ];
  if (rows.length > 0) await unsafeDb.insert(submissions).values(rows);

  return { workspaceId, endpointPublicId, otherEndpointPublicId };
}

function row(workspaceId: string, endpointId: string, seed: Seed) {
  const submittedAt = daysAgo(seed.day);
  const decided = seed.verdict !== "awaiting";
  return {
    id: newId(),
    workspaceId,
    endpointId,
    publicId: newSubmissionPublicId(),
    values: { email: `lead-${Math.random().toString(36).slice(2, 8)}@example.test` },
    origin: seed.origin ?? "human",
    utmSource: seed.utmSource ?? null,
    verdict: seed.verdict,
    verdictValue: seed.value ?? null,
    verdictCurrency: seed.value ? (seed.currency ?? "USD") : null,
    verdictAt: decided ? daysAgo(Math.max(0, seed.day - (seed.decidedAfter ?? 5))) : null,
    verdictSource: decided ? "webhook" : null,
    submittedAt,
    createdAt: submittedAt,
    deletedAt: seed.deleted ? new Date() : null,
  };
}

async function main() {
  console.log(`yield query tests against ${describeDatabase()}`);
  await cleanup();

  // -------------------------------------------------------------------------
  section("a realistic window");

  // Nine cents across three deals: 18,400.33 + 6,200.33 + 31,500.34 = 56,101.00
  // exactly. Anything that touches a float on the way here loses that cent.
  const space = await createSpace(
    "yield-test-main",
    [
      { verdict: "won", value: "18400.33", day: 44, utmSource: "google" },
      { verdict: "won", value: "6200.33", day: 38, utmSource: "google" },
      { verdict: "won", value: "31500.34", day: 32, utmSource: "linkedin" },
      { verdict: "won", value: null, day: 27, utmSource: "google" },
      { verdict: "lost", day: 40, utmSource: "google" },
      { verdict: "lost", day: 30, utmSource: "bing" },
      { verdict: "disqualified", day: 42, origin: "unverified", utmSource: null },
      { verdict: "disqualified", day: 36, origin: "unverified", utmSource: null },
      { verdict: "awaiting", day: 34, utmSource: "linkedin" },
      { verdict: "awaiting", day: 6, utmSource: "google" },
      { verdict: "awaiting", day: 3, utmSource: null },
      { verdict: "awaiting", day: 1, utmSource: "google" },
      // Soft-deleted, and must not appear anywhere.
      { verdict: "won", value: "999999.99", day: 20, deleted: true },
    ],
    [{ verdict: "awaiting", day: 5 }, { verdict: "disqualified", day: 9 }],
  );

  const report = await readYield(space.workspaceId);
  t("every live submission in the workspace is counted", report.submissions, 14);
  t("the soft-deleted one is not", report.won, 4);
  t("lost", report.lost, 2);
  t("disqualified", report.disqualified, 3);
  t("awaiting", report.open, 5);
  t("the floor is wins over everything", report.rate.floor, 4 / 14);
  t("the ceiling adds the open ones", report.rate.ceiling, 9 / 14);

  t("one currency", report.value.length, 1);
  t("summed exactly, to the cent", report.value[0].totalCents, 5_610_100n);
  t("the deleted deal's money is gone with it", report.value[0].wonWithValue, 3);
  t("the largest deal is found", report.value[0].largestCents, 3_150_034n);
  t("and the won deal with no value is reported", report.inputs.wonWithoutValue, 1);
  t(
    "the soft-deleted submission is counted as an exclusion, not forgotten",
    report.inputs.excluded,
    { deleted: 1, outsideWindow: 0 },
  );
  ok(
    "and named in a caveat, because deleting submissions raises the rate",
    report.caveats.some((line) => line.includes("1 deleted submission is not counted here")),
    report.caveats,
  );
  ok(
    "which is stated as a caveat rather than left to be discovered",
    report.caveats.some((line) => line.includes("no value recorded")),
    report.caveats,
  );

  ok(
    "the median time to a verdict is measured",
    report.inputs.timing.medianDaysToVerdict !== null &&
      Math.abs(report.inputs.timing.medianDaysToVerdict - 5) < 0.1,
    report.inputs.timing,
  );
  ok(
    "and the open submissions older than that median are counted",
    report.inputs.timing.awaitingOlderThanMedian === 3,
    report.inputs.timing,
  );

  // -------------------------------------------------------------------------
  section("scoped to one endpoint");

  const scoped = await readYield(space.workspaceId, {
    endpointPublicId: space.endpointPublicId,
  });
  t("only that endpoint's submissions", scoped.submissions, 12);
  t(
    "and the deleted one is attributed to the endpoint it belonged to",
    scoped.inputs.excluded,
    { deleted: 1, outsideWindow: 0 },
  );
  t("and the scope names it", scoped.scope.endpointName, "Contact");

  const other = await readYield(space.workspaceId, {
    endpointPublicId: space.otherEndpointPublicId,
  });
  t("the second endpoint has its own, smaller window", other.submissions, 2);
  t("with no wins", other.rate.floor, 0);
  t("and no money", other.value.length, 0);

  const missing = await readYield(space.workspaceId, { endpointPublicId: "does-not-exist" });
  t("an unknown endpoint is an empty report, not an error", missing.submissions, 0);
  t("and its rate is null rather than zero", missing.rate.floor, null);

  // -------------------------------------------------------------------------
  section("date window");

  // The last ten days: four still open, one disqualified, nothing won. The
  // shape of every young window in the product.
  const recent = await readYield(space.workspaceId, { from: daysAgo(10) });
  t("only submissions inside the window", recent.submissions, 5);
  t("none of which have closed", recent.won, 0);
  t("so the floor is zero", recent.rate.floor, 0);
  t("but the ceiling is not — four are still open", recent.rate.ceiling, 0.8);
  ok(
    "and the report leads with how little is decided",
    recent.maturity.headline === "80% of this window is still open",
    recent.maturity,
  );
  ok(
    "rather than reporting a confident 0%",
    recent.maturity.detail.includes("somewhere between 0.0% and 80.0%"),
    recent.maturity.detail,
  );

  // Days 44, 42, 40, 38, 36, 34 and 32 — the 31-day bound excludes nothing
  // newer only because it is exclusive at the boundary.
  // The deleted submission is 20 days old, so it is outside this window and
  // belongs in neither bucket: it was never in this denominator to be removed
  // from. Deletions are counted where they could actually move the number.
  t(
    "narrowing the window is an exclusion too, and is counted",
    recent.inputs.excluded,
    { deleted: 0, outsideWindow: 9 },
  );

  const bounded = await readYield(space.workspaceId, { from: daysAgo(45), to: daysAgo(31) });
  t("an upper bound is exclusive, like the inbox filter", bounded.submissions, 7);
  t("and the endpoint outside the window contributes nothing", bounded.open, 1);

  // -------------------------------------------------------------------------
  section("slicing");

  const bySource = await readYieldByDimension(space.workspaceId, "utm_source");
  const google = bySource.find((group) => group.key === "google");
  const linkedin = bySource.find((group) => group.key === "linkedin");
  const notSet = bySource.find((group) => group.key === null);

  t("every source is a group, including the absence of one", bySource.length, 4);
  t("google's submissions", google?.report.submissions, 6);
  t("google's wins", google?.report.won, 3);
  t("google's money, exactly", google?.report.value[0].totalCents, 2_460_066n);
  t("linkedin has one win of its own", linkedin?.report.won, 1);
  ok(
    "traffic with no source is named rather than hidden",
    notSet?.label === "Not set" && (notSet?.report.submissions ?? 0) > 0,
    bySource.map((group) => [group.label, group.report.submissions]),
  );
  ok(
    "groups are ranked by Yield rate, best first",
    bySource.every((group, index) =>
      index === 0
        ? true
        : (bySource[index - 1].report.rate.floor ?? -1) >= (group.report.rate.floor ?? -1),
    ),
    bySource.map((group) => [group.label, group.report.rate.floor]),
  );
  ok(
    "and every group refuses to be ranked on, at this size",
    bySource.every((group) => group.report.confidence.tone !== "good"),
    bySource.map((group) => [group.label, group.report.confidence.headline]),
  );

  const byEndpoint = await readYieldByDimension(space.workspaceId, "endpoint");
  t("both endpoints appear", byEndpoint.length, 2);
  ok(
    "labelled by name rather than by id",
    byEndpoint.some((group) => group.label === "Demo request"),
    byEndpoint.map((group) => group.label),
  );

  const byOrigin = await readYieldByDimension(space.workspaceId, "origin");
  const unverified = byOrigin.find((group) => group.key === "unverified");
  t("the unverified submissions are all disqualified", unverified?.report.disqualified, 2);
  t("and produced nothing", unverified?.report.rate.ceiling, 0);

  ok(
    "a slice says exclusions were not measured rather than claiming none",
    bySource.every((group) => group.report.inputs.excluded === null),
    bySource.map((group) => [group.label, group.report.inputs.excluded]),
  );

  const byVariant = await readYieldByDimension(space.workspaceId, "variant");
  t("no variants yet is one group, not a crash", byVariant.length, 1);
  t("named honestly", byVariant[0].label, "No variant");

  // -------------------------------------------------------------------------
  section("two currencies are never added together");

  const mixed = await createSpace("yield-test-currencies", [
    { verdict: "won", value: "1000.00", currency: "USD", day: 20 },
    { verdict: "won", value: "2000.00", currency: "EUR", day: 18 },
    { verdict: "won", value: "500.00", currency: "EUR", day: 16 },
    { verdict: "lost", day: 14 },
    { verdict: "awaiting", day: 2 },
  ]);

  const mixedReport = await readYield(mixed.workspaceId);
  t("two totals", mixedReport.value.length, 2);
  t("the larger currency leads", mixedReport.value[0].currency, "EUR");
  t("EUR total", mixedReport.value[0].totalCents, 250_000n);
  t("USD total", mixedReport.value[1].totalCents, 100_000n);
  ok(
    "and the report says they are not comparable",
    mixedReport.caveats.some((line) => line.includes("never added together")),
    mixedReport.caveats,
  );

  // -------------------------------------------------------------------------
  section("the tenant boundary");

  const neighbour = await createSpace("yield-test-neighbour", [
    { verdict: "won", value: "1000000.00", day: 10 },
    { verdict: "won", value: "1000000.00", day: 9 },
  ]);

  const ours = await readYield(space.workspaceId);
  ok(
    "a neighbour's revenue is invisible",
    ours.value[0].totalCents === 5_610_100n && ours.submissions === 14,
    { total: ours.value[0].totalCents, submissions: ours.submissions },
  );

  const theirs = await readYield(neighbour.workspaceId);
  t("and their own report only sees theirs", theirs.value[0].totalCents, 200_000_000n);
  t("with none of ours", theirs.submissions, 2);

  const crossEndpoint = await readYield(neighbour.workspaceId, {
    endpointPublicId: space.endpointPublicId,
  });
  t(
    "asking for another workspace's endpoint by id returns nothing, not their numbers",
    crossEndpoint.submissions,
    0,
  );
  t("and does not confirm the endpoint exists", crossEndpoint.scope.endpointName, null);

  const crossSlice = await readYieldByDimension(neighbour.workspaceId, "endpoint");
  t("a slice cannot reach across either", crossSlice.length, 1);

  // -------------------------------------------------------------------------
  section("an empty workspace");

  const empty = await createSpace("yield-test-empty", []);
  const emptyReport = await readYield(empty.workspaceId);
  t("no submissions", emptyReport.submissions, 0);
  t("no rate rather than zero", emptyReport.rate.floor, null);
  t("no value", emptyReport.value.length, 0);
  t("and nothing to divide by", emptyReport.resolvedShare, null);
  t("slicing an empty workspace is an empty list", (await readYieldByDimension(empty.workspaceId, "utm_source")).length, 0);

  // -------------------------------------------------------------------------
  section("archiving an endpoint does not move the number");

  await unsafeDb
    .update(endpoints)
    .set({ deletedAt: new Date() })
    .where(eq(endpoints.publicId, space.otherEndpointPublicId));

  const afterArchive = await readYield(space.workspaceId);
  t("the same submissions are counted", afterArchive.submissions, 14);
  t("and the same money", afterArchive.value[0].totalCents, 5_610_100n);

  await cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
