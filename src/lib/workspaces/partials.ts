import { desc, eq, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";

import { withWorkspace } from "../../db/index.ts";
import { endpoints, submissionPartials } from "../../db/schema.ts";
import type { OriginState } from "../origin/types.ts";
import type { SubmissionFilters } from "./types.ts";

/**
 * The unfinished ones (#37).
 *
 * ## Why this is a second query and not a wider one
 *
 * The obvious shape was one list with a "kind" column. It was rejected for the
 * same reason the table is separate: a union means every count, every filter
 * and every export in the inbox has to remember which half it is talking about,
 * and the first one that forgets publishes a submission total that quietly
 * includes people who never submitted. Yield reads `submissions` and only
 * `submissions`; nothing in this file can reach it.
 *
 * So the inbox has two lanes, the counts are never added together on screen,
 * and moving between them is a link.
 *
 * ## What "open" means
 *
 * Started and not finished. A partial whose visitor came back and submitted is
 * closed the moment the submission row commits — it is still in the table, and
 * it is not in this list, because it is not a person who never finished. It is
 * the same person as the submission two lanes over, and showing both would be
 * the double-counting this whole design exists to prevent.
 */

export const PARTIALS_PAGE_SIZE = 50;

/** Matching the submission export's cap, for the same reason: beyond it, the API. */
export const PARTIALS_EXPORT_LIMIT = 10_000;

export type PartialListItem = {
  publicId: string;
  endpointPublicId: string;
  endpointName: string;
  /** The screen they last completed, and how far through that was. */
  stepId: string | null;
  stepNumber: number | null;
  stepsTotal: number | null;
  values: Record<string, unknown>;
  origin: OriginState;
  startedAt: Date;
  /** The last time they touched it. What "went quiet three days ago" is read from. */
  updatedAt: Date;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
};

export type PartialPage = {
  rows: PartialListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Open partials, newest activity first.
 *
 * Ordered by `updated_at` rather than `started_at`: the useful question is
 * "who has gone quiet, and when", and somebody who started last week and
 * abandoned this morning is a warmer lead than somebody who abandoned last week
 * and has not been back.
 *
 * Reuses the inbox's own filters where they mean the same thing — endpoint,
 * origin, dates, a search over the answers. `verdict` is silently ignored,
 * because a partial has none; see the note on the table in `src/db/schema.ts`.
 */
export async function listPartials(
  workspaceId: string,
  filters: SubmissionFilters,
): Promise<PartialPage> {
  return withWorkspace(workspaceId, async (ws) => {
    const where = ws.where(submissionPartials, ...conditions(filters));
    const offset = (filters.page - 1) * PARTIALS_PAGE_SIZE;

    const [rows, [totals]] = await Promise.all([
      ws.tx
        .select({
          publicId: submissionPartials.publicId,
          endpointPublicId: endpoints.publicId,
          endpointName: endpoints.name,
          stepId: submissionPartials.stepId,
          stepNumber: submissionPartials.stepNumber,
          stepsTotal: submissionPartials.stepsTotal,
          values: submissionPartials.values,
          origin: submissionPartials.origin,
          startedAt: submissionPartials.startedAt,
          updatedAt: submissionPartials.updatedAt,
          utmSource: submissionPartials.utmSource,
          utmMedium: submissionPartials.utmMedium,
          utmCampaign: submissionPartials.utmCampaign,
          referrer: submissionPartials.referrer,
        })
        .from(submissionPartials)
        .innerJoin(endpoints, eq(endpoints.id, submissionPartials.endpointId))
        .where(where)
        .orderBy(desc(submissionPartials.updatedAt), desc(submissionPartials.id))
        .limit(PARTIALS_PAGE_SIZE)
        .offset(offset),

      ws.tx
        .select({ total: sql<number>`count(*)::int` })
        .from(submissionPartials)
        .innerJoin(endpoints, eq(endpoints.id, submissionPartials.endpointId))
        .where(where),
    ]);

    return {
      rows: rows.map((row) => ({
        ...row,
        values: asRecord(row.values),
      })),
      total: totals?.total ?? 0,
      page: filters.page,
      pageSize: PARTIALS_PAGE_SIZE,
    };
  });
}

/**
 * How many people are mid-form right now, under the same filters.
 *
 * Shown beside the submission count, never added to it. The wording on the
 * screen carries the same rule: two numbers, two sentences, one of which says
 * what it is not.
 */
export async function countPartialsMatching(
  workspaceId: string,
  filters: SubmissionFilters,
): Promise<number> {
  return withWorkspace(workspaceId, async (ws) => {
    const rows = await ws.tx
      .select({ total: sql<number>`count(*)::int` })
      .from(submissionPartials)
      .innerJoin(endpoints, eq(endpoints.id, submissionPartials.endpointId))
      .where(ws.where(submissionPartials, ...conditions(filters)));
    return rows[0]?.total ?? 0;
  });
}

/**
 * The predicate, deliberately built from the same filters as the inbox.
 *
 * `isNull(completedAt)` is not optional and is not a filter anyone can turn
 * off: a completed partial in this list would be the second row for a person
 * who is already in the submissions lane.
 */
function conditions(filters: SubmissionFilters): (SQL | undefined)[] {
  const list: (SQL | undefined)[] = [isNull(submissionPartials.completedAt)];

  if (filters.endpointPublicId) list.push(eq(endpoints.publicId, filters.endpointPublicId));
  if (filters.origin.length > 0) list.push(inArray(submissionPartials.origin, filters.origin));
  // Dated on last activity, matching the ordering. A partial started before the
  // window and abandoned inside it belongs to the window it went quiet in.
  if (filters.from) list.push(gte(submissionPartials.updatedAt, filters.from));
  if (filters.to) list.push(lt(submissionPartials.updatedAt, filters.to));
  if (filters.q) {
    // The same search as the inbox's, over the answers only: a partial's public
    // ID is not something anybody has in hand to paste.
    const pattern = `%${filters.q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    list.push(sql`${submissionPartials.values}::text ilike ${pattern} escape '\\'`);
  }

  return list;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Every matching open partial, for an export. Same predicate, no page.
 *
 * Exists because "export is never behind anything" (`docs/00`) is a promise
 * about the screen a person is looking at, not about one particular table. A
 * lane you can read and cannot take away with you would be exactly the
 * dashboard-shaped thing this product argues against.
 */
export async function listPartialsForExport(
  workspaceId: string,
  filters: SubmissionFilters,
): Promise<PartialListItem[]> {
  const page = await listPartials(workspaceId, { ...filters, page: 1 });
  if (page.total <= PARTIALS_PAGE_SIZE) return page.rows;

  return withWorkspace(workspaceId, async (ws) => {
    const rows = await ws.tx
      .select({
        publicId: submissionPartials.publicId,
        endpointPublicId: endpoints.publicId,
        endpointName: endpoints.name,
        stepId: submissionPartials.stepId,
        stepNumber: submissionPartials.stepNumber,
        stepsTotal: submissionPartials.stepsTotal,
        values: submissionPartials.values,
        origin: submissionPartials.origin,
        startedAt: submissionPartials.startedAt,
        updatedAt: submissionPartials.updatedAt,
        utmSource: submissionPartials.utmSource,
        utmMedium: submissionPartials.utmMedium,
        utmCampaign: submissionPartials.utmCampaign,
        referrer: submissionPartials.referrer,
      })
      .from(submissionPartials)
      .innerJoin(endpoints, eq(endpoints.id, submissionPartials.endpointId))
      .where(ws.where(submissionPartials, ...conditions(filters)))
      .orderBy(desc(submissionPartials.updatedAt), desc(submissionPartials.id))
      .limit(PARTIALS_EXPORT_LIMIT);

    return rows.map((row) => ({ ...row, values: asRecord(row.values) }));
  });
}
