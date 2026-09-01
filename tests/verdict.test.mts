/**
 * Verdict — downstream outcomes (#43).
 *
 * The tests are written from "how does an outcome end up on the wrong row, or
 * on no row at all?" rather than from line coverage, because those are the two
 * ways this feature does damage:
 *
 *   - A key for one workspace reaching another workspace's submission. There is
 *     an explicit test for that and it is the most important one in the file.
 *   - A retrying CRM walking `verdict_at` forward on every fire, which would
 *     quietly turn a 40-day sales cycle into a 0-day one and make the honest
 *     warning in `latency.ts` say the opposite of the truth.
 *
 * The handler is plain Web `Request`/`Response` with no Next APIs, so it is
 * called directly here — no server, no port.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */

// Read at call time by the modules under test, so setting them here is enough.
process.env.VERDICT_API_KEY_SECRET = "test-verdict-secret";
process.env.VERDICT_RATE_LIMIT_WORKSPACE_PER_MINUTE = "1000000";
process.env.VERDICT_RATE_LIMIT_IP_PER_MINUTE = "1000000";

import { eq, like } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { describeDatabase } from "../src/db/env.ts";
import { newEndpointPublicId, newId, newSubmissionPublicId } from "../src/db/ids.ts";
import { endpoints, submissions, workspaces } from "../src/db/schema.ts";
import { handleVerdict } from "../src/lib/verdict/handler.ts";
import {
  mintVerdictApiKey,
  parseVerdictApiKey,
  verifyVerdictApiKey,
} from "../src/lib/verdict/keys.ts";
import { measureTimeToOutcome } from "../src/lib/verdict/latency.ts";
import { parseValue, parseOccurredAt, normalizeVerdict, parseCsv } from "../src/lib/verdict/parse.ts";
import {
  checkVerdictRateLimit,
  resetVerdictRateLimits,
} from "../src/lib/verdict/rate-limit.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const okay = JSON.stringify(got) === JSON.stringify(want);
  if (okay) pass++;
  else fail++;
  console.log(`  ${okay ? "PASS" : "FAIL"}  ${name}`);
  if (!okay) {
    console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  }
};

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const SLUG_A = "verdict-test-a";
const SLUG_B = "verdict-test-b";
const URL_ = "https://acme.endpointforms.test/api/v1/verdict";
const DAY = 86_400_000;

type Space = {
  workspaceId: string;
  slug: string;
  endpointId: string;
  key: string;
  /** Public ids of the seeded submissions, oldest first. */
  ids: string[];
};

/** `NODE_ENV` is typed read-only; the key module reads it at call time. */
function setNodeEnv(value: string): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

/** Every fixture slug starts `verdict-test-`, so a crashed run cleans up next time. */
async function cleanup() {
  await unsafeDb.delete(workspaces).where(like(workspaces.slug, "verdict-test-%"));
}

type Seed = {
  publicId?: string;
  email?: string;
  submittedAt?: Date;
  verdict?: "won" | "lost" | "disqualified" | "awaiting";
  verdictAt?: Date | null;
};

async function createSpace(slug: string, seeds: Seed[]): Promise<Space> {
  const workspaceId = newId();
  const endpointId = newId();

  await unsafeDb.insert(workspaces).values({ id: workspaceId, slug, name: slug });
  await unsafeDb.insert(endpoints).values({
    id: endpointId,
    workspaceId,
    publicId: newEndpointPublicId(),
    name: "Contact",
  });

  const ids: string[] = [];
  for (const seed of seeds) {
    const publicId = seed.publicId ?? newSubmissionPublicId();
    ids.push(publicId);
    await unsafeDb.insert(submissions).values({
      id: newId(),
      workspaceId,
      endpointId,
      publicId,
      values: { email: seed.email ?? `lead-${publicId}@example.test`, name: "A Lead" },
      submittedAt: seed.submittedAt ?? new Date(),
      verdict: seed.verdict ?? "awaiting",
      verdictAt: seed.verdictAt ?? null,
      verdictSource: seed.verdict && seed.verdict !== "awaiting" ? "webhook" : null,
    });
  }

  const key = mintVerdictApiKey({ id: workspaceId, slug });
  if (!key) throw new Error("no key minted; VERDICT_API_KEY_SECRET is unset");

  return { workspaceId, slug, endpointId, key, ids };
}

function post(
  key: string | null,
  body: string,
  contentType = "application/json",
  method = "POST",
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": contentType };
  if (key) headers.authorization = `Bearer ${key}`;
  return handleVerdict(
    new Request(URL_, { method, headers, body: method === "POST" ? body : undefined }),
  );
}

/**
 * The response shapes this route promises, written out rather than inferred.
 *
 * Fields that are conditional at runtime are declared as present because every
 * assertion below reaches for them only where they are — a test that has to
 * optional-chain through its own API's contract is a test that has stopped
 * checking the contract.
 */
type Warning = { code: string; message: string };

type RowResult = {
  row: number;
  ok: boolean;
  submission_id?: string;
  verdict?: string;
  value?: string;
  currency?: string;
  verdict_at?: string;
  matched_by?: string;
  changed?: boolean;
  warnings: Warning[];
  error: { code: string; message: string };
};

type Body = {
  ok: boolean;
  result: RowResult;
  results: RowResult[];
  summary: { rows: number; applied: number; unchanged: number; failed: number };
  time_to_outcome?: {
    median_days: number | null;
    graded: number;
    loop: { tone: string; headline: string; detail: string };
    sales_cycle: { tone: string; headline: string; detail: string };
  };
  error: { code: string; message: string };
};

async function read(response: Response): Promise<Body> {
  return JSON.parse(await response.text()) as Body;
}

async function row(publicId: string) {
  const [found] = await unsafeDb
    .select({
      verdict: submissions.verdict,
      verdictValue: submissions.verdictValue,
      verdictCurrency: submissions.verdictCurrency,
      verdictAt: submissions.verdictAt,
      verdictSource: submissions.verdictSource,
    })
    .from(submissions)
    .where(eq(submissions.publicId, publicId))
    .limit(1);
  return found;
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nVerdict outcomes — ${describeDatabase()}\n`);
  await cleanup();

  const now = new Date();

  const a = await createSpace(SLUG_A, [
    { publicId: "vtA00000000000001", submittedAt: new Date(now.getTime() - 10 * DAY) },
    { publicId: "vtA00000000000002", submittedAt: new Date(now.getTime() - 9 * DAY) },
    { publicId: "vtA00000000000003", submittedAt: new Date(now.getTime() - 8 * DAY) },
    { publicId: "vtA00000000000004", email: "dup@example.test", submittedAt: new Date(now.getTime() - 7 * DAY) },
    { publicId: "vtA00000000000005", email: "dup@example.test", submittedAt: new Date(now.getTime() - 6 * DAY) },
    { publicId: "vtA00000000000006", email: "solo@example.test", submittedAt: new Date(now.getTime() - 5 * DAY) },
  ]);

  const b = await createSpace(SLUG_B, [
    { publicId: "vtB00000000000001", submittedAt: new Date(now.getTime() - 10 * DAY) },
  ]);

  // -------------------------------------------------------------------------
  console.log("keys");
  // -------------------------------------------------------------------------
  {
    const parsed = parseVerdictApiKey(a.key);
    ok("a minted key parses", parsed !== null);
    t("the key names its workspace", parsed?.slug, SLUG_A);
    ok(
      "verifies against its own workspace",
      parsed !== null && verifyVerdictApiKey(parsed, { id: a.workspaceId, slug: a.slug }),
    );
    ok(
      "does not verify against another workspace's id",
      parsed !== null && !verifyVerdictApiKey(parsed, { id: b.workspaceId, slug: a.slug }),
    );
    ok("minting is deterministic", mintVerdictApiKey({ id: a.workspaceId, slug: a.slug }) === a.key);

    const swapped = `${a.key.split(".")[0]}.${SLUG_B}.${a.key.split(".")[2]}`;
    const swappedParsed = parseVerdictApiKey(swapped);
    ok(
      "a key with the slug swapped does not verify",
      swappedParsed !== null && !verifyVerdictApiKey(swappedParsed, { id: b.workspaceId, slug: SLUG_B }),
    );

    // The one place this differs from the origin token, which falls back to a
    // built-in secret: a guessable key here would be a write into someone
    // else's workspace, so production refuses rather than falls back.
    const secret = process.env.VERDICT_API_KEY_SECRET;
    delete process.env.VERDICT_API_KEY_SECRET;
    setNodeEnv("production");
    t("production with no secret configured mints nothing", mintVerdictApiKey({ id: a.workspaceId, slug: a.slug }), null);
    setNodeEnv("test");
    ok("development still works, so nobody has to configure one to try this", mintVerdictApiKey({ id: a.workspaceId, slug: a.slug }) !== null);
    ok("and the development key is not the configured one", mintVerdictApiKey({ id: a.workspaceId, slug: a.slug }) !== a.key);
    process.env.VERDICT_API_KEY_SECRET = secret;

    ok("a truncated key does not parse", parseVerdictApiKey("efv1.acme") === null);
    ok("another version does not parse", parseVerdictApiKey(a.key.replace("efv1", "efv9")) === null);
    ok("an empty key does not parse", parseVerdictApiKey("") === null);
  }

  // -------------------------------------------------------------------------
  console.log("\nauthentication");
  // -------------------------------------------------------------------------
  {
    const noKey = await post(null, JSON.stringify({ submission_id: a.ids[0], verdict: "won" }));
    t("no key is 401", noKey.status, 401);
    t("and says so", (await read(noKey)).error.code, "unauthorized");

    const badKey = await post("efv1.verdict-test-a.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "{}");
    t("a forged signature is 401", badKey.status, 401);

    const unknownWorkspace = await post(
      mintVerdictApiKey({ id: newId(), slug: "no-such-workspace" }),
      "{}",
    );
    t("an unknown workspace is 401, not 404", unknownWorkspace.status, 401);
    t(
      "and is worded identically, so slugs cannot be enumerated",
      (await read(unknownWorkspace)).error.message,
      (await read(await post("efv1.verdict-test-a.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "{}")))
        .error.message,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\na valid outcome lands");
  // -------------------------------------------------------------------------
  {
    const response = await post(
      a.key,
      JSON.stringify({ submission_id: a.ids[0], verdict: "won", value: 18400, currency: "USD" }),
    );
    const body = await read(response);
    t("200", response.status, 200);
    t("ok", body.ok, true);
    t("verdict", body.result.verdict, "won");
    t("value is an exact decimal", body.result.value, "18400.00");
    t("currency", body.result.currency, "USD");
    t("matched on the id", body.result.matched_by, "submission_id");
    t("changed", body.result.changed, true);

    const stored = await row(a.ids[0]);
    t("the row says won", stored?.verdict, "won");
    t("the row carries the value", stored?.verdictValue, "18400.00");
    t("the row carries the currency", stored?.verdictCurrency, "USD");
    t("the row records how it arrived", stored?.verdictSource, "webhook");
    ok("the row has a verdict timestamp", stored?.verdictAt instanceof Date);
  }

  // -------------------------------------------------------------------------
  console.log("\nreposting the same outcome");
  // -------------------------------------------------------------------------
  {
    const before = await row(a.ids[0]);
    const response = await post(
      a.key,
      JSON.stringify({ submission_id: a.ids[0], verdict: "won", value: "18400.00", currency: "USD" }),
    );
    const body = await read(response);
    t("is not an error", response.status, 200);
    t("and reports that nothing changed", body.result.changed, false);

    const after = await row(a.ids[0]);
    t(
      "verdict_at does not move, so a retrying CRM cannot fake a fast sales cycle",
      after?.verdictAt?.toISOString(),
      before?.verdictAt?.toISOString(),
    );

    // The same amount written differently is the same amount.
    const equivalent = await post(
      a.key,
      JSON.stringify({ submission_id: a.ids[0], verdict: "won", value: "$18,400", currency: "usd" }),
    );
    t("18400 and $18,400 are the same outcome", (await read(equivalent)).result.changed, false);
  }

  // -------------------------------------------------------------------------
  console.log("\na verdict can be revised");
  // -------------------------------------------------------------------------
  {
    const lost = await post(
      a.key,
      JSON.stringify({ submission_id: a.ids[0], verdict: "Closed Lost" }),
    );
    const body = await read(lost);
    t("a CRM's wording is understood", body.result.verdict, "lost");
    t("and it changed", body.result.changed, true);
    t(
      "a revision that says nothing about the value keeps the one already recorded",
      body.result.value,
      "18400.00",
    );

    const back = await post(a.key, JSON.stringify({ submission_id: a.ids[0], verdict: "awaiting" }));
    t("awaiting is accepted", (await read(back)).result.verdict, "awaiting");

    const stored = await row(a.ids[0]);
    t("and clears the verdict", stored?.verdict, "awaiting");
    t("and the value", stored?.verdictValue, null);
    t("and the currency", stored?.verdictCurrency, null);
    t("and the timestamp", stored?.verdictAt, null);

    // A value entered by mistake has to be removable without resetting the row.
    await post(
      a.key,
      JSON.stringify({ submission_id: a.ids[0], verdict: "won", value: 77, currency: "USD" }),
    );
    const cleared = await post(
      a.key,
      JSON.stringify({ submission_id: a.ids[0], verdict: "won", value: null }),
    );
    t("an explicit null clears a value", (await read(cleared)).result.value, undefined);
    t("in the row too", (await row(a.ids[0]))?.verdictValue, null);
    t("and the verdict survives it", (await row(a.ids[0]))?.verdict, "won");
  }

  // -------------------------------------------------------------------------
  console.log("\ncross-workspace writes are refused");
  // -------------------------------------------------------------------------
  {
    const bBefore = await row(b.ids[0]);
    const response = await post(
      a.key,
      JSON.stringify({ submission_id: b.ids[0], verdict: "won", value: 99999, currency: "USD" }),
    );
    const body = await read(response);
    t("workspace A posting workspace B's submission is 404", response.status, 404);
    t("and named as not found rather than forbidden", body.error.code, "submission_not_found");

    const bAfter = await row(b.ids[0]);
    t("B's verdict is untouched", bAfter?.verdict, bBefore?.verdict);
    t("B's value is untouched", bAfter?.verdictValue, bBefore?.verdictValue);

    // The other direction, in case the scoping is asymmetric somehow.
    const reverse = await post(
      b.key,
      JSON.stringify({ submission_id: a.ids[1], verdict: "won" }),
    );
    t("and the same in reverse", reverse.status, 404);
    t("A's submission stays awaiting", (await row(a.ids[1]))?.verdict, "awaiting");

    // Email matching must not be a way around the boundary either.
    const byEmail = await post(
      b.key,
      JSON.stringify({ email: "solo@example.test", verdict: "won" }),
    );
    t("an email in another workspace does not match", byEmail.status, 404);
    t("and A's row is untouched", (await row(a.ids[5]))?.verdict, "awaiting");
  }

  // -------------------------------------------------------------------------
  console.log("\nrefusals say what to change");
  // -------------------------------------------------------------------------
  {
    const unknown = await post(
      a.key,
      JSON.stringify({ submission_id: "nosuchsubmission", verdict: "won" }),
    );
    t("an unknown submission is 404", unknown.status, 404);

    const badVerdict = await post(
      a.key,
      JSON.stringify({ submission_id: a.ids[1], verdict: "maybe" }),
    );
    const badBody = await read(badVerdict);
    t("an unrecognised verdict is 422", badVerdict.status, 422);
    t("named", badBody.error.code, "invalid_verdict");
    ok("and lists what is accepted", /won, lost, disqualified, awaiting/.test(badBody.error.message));

    const noVerdict = await post(a.key, JSON.stringify({ submission_id: a.ids[1] }));
    t("a missing verdict is 422", noVerdict.status, 422);

    const noId = await post(a.key, JSON.stringify({ verdict: "won" }));
    t("a missing submission id is 422", noId.status, 422);
    t("named", (await read(noId)).error.code, "invalid_request");

    const negative = await post(
      a.key,
      JSON.stringify({ submission_id: a.ids[1], verdict: "won", value: -5 }),
    );
    t("a negative value is 422", negative.status, 422);
    t("named", (await read(negative)).error.code, "invalid_value");

    const badCurrency = await post(
      a.key,
      JSON.stringify({ submission_id: a.ids[1], verdict: "won", value: 10, currency: "dollars" }),
    );
    t("a non-ISO currency is 422", badCurrency.status, 422);

    const future = await post(
      a.key,
      JSON.stringify({
        submission_id: a.ids[1],
        verdict: "won",
        occurred_at: new Date(Date.now() + 5 * DAY).toISOString(),
      }),
    );
    t("an outcome decided in the future is 422", future.status, 422);

    const malformed = await post(a.key, "{not json");
    t("a malformed body is 400", malformed.status, 400);

    const empty = await post(a.key, "");
    t("an empty body is 422", empty.status, 422);

    const wrongType = await post(a.key, "<xml/>", "application/xml");
    t("an unreadable content type is 415", wrongType.status, 415);

    const method = await post(a.key, "", "application/json", "GET");
    t("a GET is 405", method.status, 405);

    t("the refused rows are all still awaiting", (await row(a.ids[1]))?.verdict, "awaiting");
  }

  // -------------------------------------------------------------------------
  console.log("\nassumptions are reported, not hidden");
  // -------------------------------------------------------------------------
  {
    const noCurrency = await post(
      a.key,
      JSON.stringify({ submission_id: a.ids[1], verdict: "won", value: 900 }),
    );
    const body = await read(noCurrency);
    t("a value with no currency is accepted", noCurrency.status, 200);
    t("as USD", body.result.currency, "USD");
    t("with the assumption stated", body.result.warnings[0].code, "currency_assumed");

    const rounded = await post(
      a.key,
      JSON.stringify({ submission_id: a.ids[2], verdict: "won", value: "10.005", currency: "GBP" }),
    );
    const roundedBody = await read(rounded);
    t("a third decimal is rounded", roundedBody.result.value, "10.01");
    t("and said so", roundedBody.result.warnings[0].code, "value_rounded");

    const awaitingWithValue = await post(
      a.key,
      JSON.stringify({ submission_id: a.ids[2], verdict: "pending", value: 500, currency: "GBP" }),
    );
    const awaitingBody = await read(awaitingWithValue);
    t("awaiting drops a value it was sent", awaitingBody.result.value, undefined);
    t(
      "and says why",
      awaitingBody.result.warnings.some((w) => w.code === "value_ignored_for_awaiting"),
      true,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\nan explicit close date is honoured");
  // -------------------------------------------------------------------------
  {
    const closedAt = new Date(Date.now() - 3 * DAY);
    const response = await post(
      a.key,
      JSON.stringify({
        submission_id: a.ids[2],
        verdict: "won",
        value: 1200,
        currency: "USD",
        occurred_at: closedAt.toISOString(),
      }),
    );
    const body = await read(response);
    t(
      "verdict_at is the date the deal closed, not the date we heard",
      body.result.verdict_at,
      closedAt.toISOString(),
    );
  }

  // -------------------------------------------------------------------------
  console.log("\nemail is a documented fallback");
  // -------------------------------------------------------------------------
  {
    const solo = await post(
      a.key,
      JSON.stringify({ email: "Solo@Example.test", verdict: "won", value: 400, currency: "USD" }),
    );
    const body = await read(solo);
    t("a unique address matches", body.result.matched_by, "email");
    t("the right row", body.result.submission_id, a.ids[5]);
    t(
      "and the fallback is flagged",
      body.result.warnings.some((w) => w.code === "matched_by_email"),
      true,
    );

    const duplicate = await post(
      a.key,
      JSON.stringify({ email: "dup@example.test", verdict: "lost" }),
    );
    const dupBody = await read(duplicate);
    t("an address on two submissions takes the most recent", dupBody.result.submission_id, a.ids[4]);
    t(
      "and reports the ambiguity rather than hiding it",
      dupBody.result.warnings.some((w) => w.code === "ambiguous_email_match"),
      true,
    );
    t("the older one is left alone", (await row(a.ids[3]))?.verdict, "awaiting");
  }

  // -------------------------------------------------------------------------
  console.log("\nbulk CSV");
  // -------------------------------------------------------------------------
  {
    const csv = [
      "submission_id,verdict,value,currency,occurred_at",
      `${a.ids[3]},Closed Won,"$2,500.00",USD,2026-08-01T10:00:00Z`,
      `${a.ids[4]},unqualified,,,`,
      `nosuchid,won,100,USD,`,
      `${a.ids[5]},not-a-verdict,100,USD,`,
      `${b.ids[0]},won,100,USD,`,
      "",
    ].join("\n");

    const response = await post(a.key, csv, "text/csv");
    const body = await read(response);

    t("a file with bad rows is 207, not a failure", response.status, 207);
    t("five rows were read", body.summary.rows, 5);
    t("two applied", body.summary.applied, 2);
    t("three failed", body.summary.failed, 3);

    t("row 1 applied", body.results[0].ok, true);
    t("with the quoted amount parsed", body.results[0].value, "2500.00");
    t("row 2 applied", body.results[1].ok, true);
    t("row 2 is disqualified", body.results[1].verdict, "disqualified");
    t("row 3 is not found", body.results[2].error.code, "submission_not_found");
    t("row 4 has a bad verdict", body.results[3].error.code, "invalid_verdict");
    t("row 5 belongs to another workspace", body.results[4].error.code, "submission_not_found");
    t("and the row number points at the spreadsheet line", body.results[4].row, 5);

    t("the good row really landed", (await row(a.ids[3]))?.verdict, "won");
    t("with its value", (await row(a.ids[3]))?.verdictValue, "2500.00");
    t("recorded as a CSV upload", (await row(a.ids[3]))?.verdictSource, "csv");
    t("the other workspace's row is untouched", (await row(b.ids[0]))?.verdict, "awaiting");

    ok("a bulk upload answers with the honest time-to-outcome", body.time_to_outcome !== undefined);
    ok("including the loop assessment", typeof body.time_to_outcome?.loop?.headline === "string");

    const allGood = await post(
      a.key,
      `submission_id,verdict\n${a.ids[3]},won\n`,
      "text/csv",
    );
    t("a file with no bad rows is 200", allGood.status, 200);
    t("and reports the repeat as unchanged", (await read(allGood)).summary.unchanged, 1);

    const semicolons = await post(
      a.key,
      `submission_id;verdict\n${a.ids[3]};won\n`,
      "text/csv",
    );
    t("a semicolon-delimited export is read", semicolons.status, 200);

    const headerOnly = await post(a.key, "submission_id,verdict\n", "text/csv");
    t("a file with no rows is 422", headerOnly.status, 422);
  }

  // -------------------------------------------------------------------------
  console.log("\na JSON array is accepted too");
  // -------------------------------------------------------------------------
  {
    const response = await post(
      a.key,
      JSON.stringify({
        outcomes: [
          { submission_id: a.ids[1], verdict: "won", value: 50, currency: "USD" },
          { submission_id: "nope", verdict: "won" },
        ],
      }),
    );
    const body = await read(response);
    t("mixed rows are 207", response.status, 207);
    t("one applied", body.summary.applied, 1);
    t("one failed", body.summary.failed, 1);
  }

  // -------------------------------------------------------------------------
  console.log("\nparsing, in isolation");
  // -------------------------------------------------------------------------
  {
    t("plain integer", parseValue(18400), { ok: true, value: "18400.00", rounded: false });
    t("formatted", parseValue("$18,400.50"), { ok: true, value: "18400.50", rounded: false });
    t("european", parseValue("18.400,50"), { ok: true, value: "18400.50", rounded: false });
    t("rounds half up", parseValue("0.005"), { ok: true, value: "0.01", rounded: true });
    t("carries", parseValue("9.999"), { ok: true, value: "10.00", rounded: true });
    t("blank is no value", parseValue(""), { ok: true, value: null, rounded: false });
    ok("exponent notation is refused", parseValue("1.8e4").ok === false);
    ok("words are refused", parseValue("eighteen thousand").ok === false);

    t("won aliases", normalizeVerdict("Closed-Won"), "won");
    t("lost aliases", normalizeVerdict("CLOSED LOST"), "lost");
    t("disqualified aliases", normalizeVerdict("not_qualified"), "disqualified");
    t("awaiting aliases", normalizeVerdict("pending"), "awaiting");
    t("nothing else", normalizeVerdict("probably"), null);

    ok("epoch seconds are read", parseOccurredAt(1_756_000_000).ok === true);
    ok("nonsense is refused", parseOccurredAt("last tuesday").ok === false);

    const table = parseCsv('a,b\r\n"one, two",three\r\n');
    t("quoted commas survive", table.rows[0], { a: "one, two", b: "three" });
  }

  // -------------------------------------------------------------------------
  console.log("\nthe honest constraint");
  // -------------------------------------------------------------------------
  {
    const fast = await createSpace("verdict-test-fast", [
      ...Array.from({ length: 12 }, (_, i) => ({
        publicId: `vtF0000000000${String(i).padStart(4, "0")}`,
        submittedAt: new Date(now.getTime() - (30 - i) * DAY),
        verdict: (i % 4 === 0 ? "won" : "lost") as "won" | "lost",
        verdictAt: new Date(now.getTime() - (30 - i) * DAY + 2 * DAY),
      })),
    ]);

    const measured = await measureTimeToOutcome(fast.workspaceId, { now });
    t("every submission is graded", measured.graded, 12);
    t("the median is the two days we seeded", Math.round(measured.medianDays ?? 0), 2);
    ok(
      "a two-day cycle is called fast enough",
      measured.latency.tone === "good",
      measured.latency,
    );
    ok(
      "but twelve leads a month is honestly called too thin for a split test",
      measured.assessment.tone === "bad" || measured.assessment.tone === "warn",
      measured.assessment,
    );
    ok(
      "and still says the outcome data is worth collecting",
      /worth collecting|ledger/i.test(measured.assessment.detail),
      measured.assessment.detail,
    );

    const slow = await createSpace("verdict-test-slow", [
      ...Array.from({ length: 12 }, (_, i) => ({
        publicId: `vtS0000000000${String(i).padStart(4, "0")}`,
        submittedAt: new Date(now.getTime() - (170 - i) * DAY),
        verdict: (i % 6 === 0 ? "won" : "lost") as "won" | "lost",
        verdictAt: new Date(now.getTime() - (170 - i) * DAY + 120 * DAY),
      })),
    ]);

    const slowMeasured = await measureTimeToOutcome(slow.workspaceId, { now });
    t("a four-month disposition is measured as one", Math.round(slowMeasured.medianDays ?? 0), 120);
    ok(
      "and the product says the loop will not work",
      slowMeasured.assessment.tone === "bad" || slowMeasured.assessment.tone === "warn",
      slowMeasured.assessment,
    );
    t(
      "with the sales cycle named as the reason",
      slowMeasured.latency.headline,
      "Too slow for form-level learning",
    );

    const ungraded = await createSpace("verdict-test-ungraded", [
      ...Array.from({ length: 20 }, (_, i) => ({
        publicId: `vtU0000000000${String(i).padStart(4, "0")}`,
        submittedAt: new Date(now.getTime() - (40 - i) * DAY),
        verdict: (i < 10 ? "won" : "awaiting") as "won" | "awaiting",
        verdictAt: i < 10 ? new Date(now.getTime() - (40 - i) * DAY + DAY) : null,
      })),
    ]);
    const ungradedMeasured = await measureTimeToOutcome(ungraded.workspaceId, { now });
    t("half graded", ungradedMeasured.graded, 10);
    ok(
      "a workspace that grades half its leads still gets an answer",
      ungradedMeasured.assessment.headline.length > 0,
    );

    const hygiene = await createSpace("verdict-test-hygiene", [
      ...Array.from({ length: 60 }, (_, i) => ({
        publicId: `vtH0000000000${String(i).padStart(4, "0")}`,
        submittedAt: new Date(now.getTime() - (40 - (i % 30)) * DAY),
        verdict: (i < 9 ? "won" : "awaiting") as "won" | "awaiting",
        verdictAt: i < 9 ? new Date(now.getTime() - (40 - (i % 30)) * DAY + DAY) : null,
      })),
    ]);
    const hygieneMeasured = await measureTimeToOutcome(hygiene.workspaceId, { now });
    ok(
      "when 15% of leads ever get dispositioned, the CRM is named as the problem",
      hygieneMeasured.assessment.headline === "Most leads never get an outcome",
      hygieneMeasured.assessment,
    );

    const empty = await createSpace("verdict-test-empty", []);
    const emptyMeasured = await measureTimeToOutcome(empty.workspaceId, { now });
    t("an empty workspace is not judged", emptyMeasured.assessment.tone, "neutral");
    t("median is null rather than zero", emptyMeasured.medianDays, null);

    const thin = await createSpace("verdict-test-thin", [
      { publicId: "vtT00000000000001", submittedAt: new Date(now.getTime() - 3 * DAY), verdict: "won", verdictAt: new Date(now.getTime() - 2 * DAY) },
      { publicId: "vtT00000000000002", submittedAt: new Date(now.getTime() - 3 * DAY), verdict: "won", verdictAt: new Date(now.getTime() - 2 * DAY) },
    ]);
    const thinMeasured = await measureTimeToOutcome(thin.workspaceId, { now });
    t(
      "two outcomes is not enough to quote a median from",
      thinMeasured.assessment.headline,
      "Not enough outcomes to say yet",
    );

  }

  // -------------------------------------------------------------------------
  console.log("\nrate limiting");
  // -------------------------------------------------------------------------
  {
    resetVerdictRateLimits();
    const config = { windowMs: 60_000, workspace: 2, ip: 3 };

    t("first is allowed", checkVerdictRateLimit("w", null, config, 0).allowed, true);
    t("second is allowed", checkVerdictRateLimit("w", null, config, 0).allowed, true);
    const refused = checkVerdictRateLimit("w", null, config, 0);
    t("third is refused", refused.allowed, false);
    t("by the workspace window", refused.scope, "workspace");
    ok("with a retry hint", (refused.retryAfter ?? 0) > 0);
    t("and the window resets", checkVerdictRateLimit("w", null, config, 60_001).allowed, true);

    t("an ip is counted separately", checkVerdictRateLimit(null, "ip", config, 0).allowed, true);

    // End to end, through the handler.
    resetVerdictRateLimits();
    process.env.VERDICT_RATE_LIMIT_WORKSPACE_PER_MINUTE = "1";
    const first = await post(a.key, JSON.stringify({ submission_id: a.ids[0], verdict: "won" }));
    const second = await post(a.key, JSON.stringify({ submission_id: a.ids[0], verdict: "won" }));
    t("the first request goes through", first.status, 200);
    t("the second is 429", second.status, 429);
    ok("with Retry-After", second.headers.get("retry-after") !== null);
    process.env.VERDICT_RATE_LIMIT_WORKSPACE_PER_MINUTE = "1000000";
    resetVerdictRateLimits();
  }

  await cleanup();

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await sqlClient.end();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => {});
  await sqlClient.end().catch(() => {});
  process.exit(1);
});
