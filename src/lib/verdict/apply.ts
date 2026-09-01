import { desc, eq, or, sql, type SQL } from "drizzle-orm";

import { withWorkspace, type WorkspaceScope } from "../../db/scoped.ts";
import { submissions } from "../../db/schema.ts";
import type { OutcomeInput, OutcomeWarning, ParseFailure, VerdictValue } from "./parse.ts";

/**
 * Writing an outcome onto a submission (#43).
 *
 * Three properties this file exists to guarantee, in the order they matter:
 *
 * 1. **An outcome cannot cross a workspace boundary.** Everything here runs
 *    inside `withWorkspace`, so the row-level security policies are armed and
 *    `ws.where()` adds the predicate. A key for workspace A that posts
 *    workspace B's submission id does not get a permission error — it gets a
 *    404, because inside that transaction the row genuinely does not exist.
 *    That is the correct answer in both senses: it is true, and it does not
 *    confirm that the id is real.
 *
 * 2. **Posting the same outcome twice is not an error.** A CRM that fires its
 *    webhook on every save, a Zap that retries on a timeout, and a CSV uploaded
 *    twice all end at the same row with the same values, and the second one
 *    reports `changed: false` and moves nothing — including `verdict_at`, which
 *    would otherwise drift forward on every retry and quietly corrupt the
 *    time-to-outcome measurement in `./latency.ts`.
 *
 * 3. **A verdict is not final.** A deal marked lost that later closes, or one
 *    disqualified by mistake, can be posted again with a different verdict, and
 *    `awaiting` puts a submission back to having no outcome at all. Refusing to
 *    revise would make the first mistake permanent, and people would work
 *    around it by not sending anything.
 */

/** How the outcome reached us. Written to `submissions.verdict_source`. */
export type VerdictSource = "webhook" | "csv" | "crm" | "manual";

export type MatchedBy = "submission_id" | "email";

export type OutcomeOutcome = {
  /** 1-based position in the request, so a CSV row can be found in a spreadsheet. */
  row: number;
  ok: boolean;
  /** The submission's public id — the one the customer's CRM holds. */
  submissionId?: string;
  verdict?: VerdictValue;
  value?: string | null;
  currency?: string | null;
  verdictAt?: string | null;
  matchedBy?: MatchedBy;
  /** False when the submission already carried exactly this outcome. */
  changed?: boolean;
  warnings: OutcomeWarning[];
  error?: ParseFailure;
};

export type ApplySummary = {
  rows: number;
  /** Rows that changed something. */
  applied: number;
  /** Rows that were already exactly this outcome. */
  unchanged: number;
  failed: number;
};

export type ApplyResult = {
  summary: ApplySummary;
  results: OutcomeOutcome[];
};

/** Row entering the writer: either a parsed outcome or a parse failure to report. */
export type PendingOutcome =
  | { row: number; ok: true; input: OutcomeInput }
  | { row: number; ok: false; error: ParseFailure };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Field names an email fallback will look in.
 *
 * Kept deliberately short. Every name added here is another way for two
 * different people's submissions to collide on one address, and the failure
 * mode of a wrong match is worse than the failure mode of no match: an outcome
 * filed against the wrong lead is a number in a report that nobody can trace
 * back to a mistake.
 */
const EMAIL_VALUE_KEYS = ["email", "Email", "email_address", "e-mail", "work_email", "EMAIL"];

/**
 * Applies a batch of outcomes in one workspace-scoped transaction.
 *
 * Parse failures are carried through as results rather than thrown, so a CSV
 * with one bad row still applies the good ones. Nothing in the per-row path can
 * raise a database error that would poison the transaction: the only queries are
 * a bounded `select` and an `update` by primary key, and every value written has
 * already been range-checked against the column it is going into.
 */
export async function applyOutcomes(
  workspaceId: string,
  pending: PendingOutcome[],
  source: VerdictSource,
  now: Date = new Date(),
): Promise<ApplyResult> {
  const results = await withWorkspace(workspaceId, async (ws) => {
    const out: OutcomeOutcome[] = [];
    for (const item of pending) {
      if (!item.ok) {
        out.push({ row: item.row, ok: false, warnings: [], error: item.error });
        continue;
      }
      out.push(await applyOne(ws, item.row, item.input, source, now));
    }
    return out;
  });

  const summary: ApplySummary = {
    rows: results.length,
    applied: results.filter((result) => result.ok && result.changed).length,
    unchanged: results.filter((result) => result.ok && !result.changed).length,
    failed: results.filter((result) => !result.ok).length,
  };

  return { summary, results };
}

async function applyOne(
  ws: WorkspaceScope,
  row: number,
  input: OutcomeInput,
  source: VerdictSource,
  now: Date,
): Promise<OutcomeOutcome> {
  const warnings = [...input.warnings];
  const match = await findSubmission(ws, input);

  if (!match) {
    return {
      row,
      ok: false,
      warnings,
      error: {
        code: "submission_not_found",
        message: input.reference
          ? `No submission ${JSON.stringify(input.reference)} in this workspace. Check the id was the one returned when the lead was submitted, and that the key you are using belongs to the same workspace as the form.`
          : `No submission from ${JSON.stringify(input.email ?? "")} in this workspace. Matching on email only finds a lead whose form had an email field; the submission id is the reliable route.`,
      },
    };
  }

  warnings.push(...match.warnings);

  const current = match.submission;
  const desired = desiredState(input, current, now);

  const unchanged =
    current.verdict === desired.verdict &&
    normalizeAmount(current.verdictValue) === desired.value &&
    (current.verdictCurrency ?? null) === desired.currency;

  if (unchanged) {
    // Deliberately does not touch `verdict_at` or `updated_at`. A CRM firing on
    // every record save would otherwise walk the timestamp forward all quarter.
    return {
      row,
      ok: true,
      submissionId: current.publicId,
      verdict: current.verdict as VerdictValue,
      value: normalizeAmount(current.verdictValue),
      currency: current.verdictCurrency ?? null,
      verdictAt: current.verdictAt ? current.verdictAt.toISOString() : null,
      matchedBy: match.matchedBy,
      changed: false,
      warnings,
    };
  }

  await ws.tx
    .update(submissions)
    .set({
      verdict: desired.verdict,
      verdictValue: desired.value,
      verdictCurrency: desired.currency,
      verdictAt: desired.verdictAt,
      verdictSource: source,
      updatedAt: now,
    })
    .where(ws.where(submissions, eq(submissions.id, current.id)));

  return {
    row,
    ok: true,
    submissionId: current.publicId,
    verdict: desired.verdict,
    value: desired.value,
    currency: desired.currency,
    verdictAt: desired.verdictAt ? desired.verdictAt.toISOString() : null,
    matchedBy: match.matchedBy,
    changed: true,
    warnings,
  };
}

type DesiredState = {
  verdict: VerdictValue;
  value: string | null;
  currency: string | null;
  verdictAt: Date | null;
};

/**
 * What the row should look like afterwards.
 *
 * Two rules, both about not destroying data the caller did not mention:
 *
 * **A field nobody sent is a field nobody changed.** A CSV whose columns are
 * `submission_id, verdict` is a very ordinary thing for someone to upload, and
 * it must not silently wipe the deal values already recorded against those
 * submissions. So the value and currency carry forward unless the caller sent
 * one — or sent an explicit `null`, which clears it.
 *
 * **`awaiting` is a real state, not the absence of one**, and it means this
 * submission has no outcome — so it does clear the value, the currency and the
 * timestamp. Leaving a won deal's amount sitting on a row the inbox is showing
 * as ungraded is exactly the kind of stale number this product exists to argue
 * against.
 */
function desiredState(input: OutcomeInput, current: Match["submission"], now: Date): DesiredState {
  if (input.verdict === "awaiting") {
    return { verdict: "awaiting", value: null, currency: null, verdictAt: null };
  }

  const value = input.valueProvided ? input.value : normalizeAmount(current.verdictValue);
  const currency = input.valueProvided ? input.currency : (current.verdictCurrency ?? null);

  return {
    verdict: input.verdict,
    value,
    currency,
    // An outcome that changes keeps the caller's date if they sent one, and
    // otherwise is stamped now. A repeat post never reaches here at all.
    verdictAt: input.occurredAt ?? now,
  };
}

/** `numeric` comes back as a string; `18400` and `18400.00` are the same amount. */
function normalizeAmount(value: string | null): string | null {
  if (value === null || value === undefined) return null;
  const [whole, fraction = ""] = String(value).split(".");
  return `${whole}.${fraction.slice(0, 2).padEnd(2, "0")}`;
}

type Match = {
  submission: {
    id: string;
    publicId: string;
    verdict: string;
    verdictValue: string | null;
    verdictCurrency: string | null;
    verdictAt: Date | null;
  };
  matchedBy: MatchedBy;
  warnings: OutcomeWarning[];
};

const COLUMNS = {
  id: submissions.id,
  publicId: submissions.publicId,
  verdict: submissions.verdict,
  verdictValue: submissions.verdictValue,
  verdictCurrency: submissions.verdictCurrency,
  verdictAt: submissions.verdictAt,
};

/**
 * Finds the submission an outcome is about.
 *
 * Both routes are scoped by `ws.where()` *and* by row-level security, so a
 * reference belonging to another workspace simply matches nothing. The public
 * id is globally unique, which means this is also the point at which a key for
 * workspace A posting workspace B's id is turned into a 404 rather than a write.
 */
async function findSubmission(ws: WorkspaceScope, input: OutcomeInput): Promise<Match | null> {
  if (input.reference) {
    const predicate: SQL = UUID.test(input.reference)
      ? eq(submissions.id, input.reference)
      : eq(submissions.publicId, input.reference);

    const [found] = await ws.tx
      .select(COLUMNS)
      .from(submissions)
      .where(ws.where(submissions, predicate))
      .limit(1);

    return found ? { submission: found, matchedBy: "submission_id", warnings: [] } : null;
  }

  if (!input.email) return null;

  // The documented fallback, with its failure mode reported rather than hidden:
  // an address that appears on several submissions gets the most recent one, and
  // the response says so. Silently picking one of them is how an outcome ends up
  // on last year's enquiry from the same person.
  const emailPredicate = or(
    ...EMAIL_VALUE_KEYS.map((key) => sql`lower(${submissions.values}->>${key}) = ${input.email}`),
  );

  const found = await ws.tx
    .select(COLUMNS)
    .from(submissions)
    .where(ws.where(submissions, emailPredicate))
    .orderBy(desc(submissions.submittedAt))
    .limit(2);

  if (found.length === 0) return null;

  const warnings: OutcomeWarning[] = [
    {
      code: "matched_by_email",
      message: `Matched on email rather than submission id. Pass the submission id through your form and back from your CRM to make this exact.`,
    },
  ];

  if (found.length > 1) {
    warnings.push({
      code: "ambiguous_email_match",
      message: `More than one submission in this workspace carries ${JSON.stringify(input.email)}. The most recent one was graded; the others were left alone.`,
    });
  }

  return { submission: found[0], matchedBy: "email", warnings };
}
