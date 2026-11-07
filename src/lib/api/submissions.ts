import { z } from "zod";

import { listDestinations as listDestinationRows } from "../destinations/store.ts";
import { refreshFileRef, signDownloadUrl } from "../uploads/links.ts";
import { isStoredFileRef } from "../uploads/types.ts";
import { toCsv, toJson } from "../workspaces/export-format.ts";
import {
  deleteSubmission as deleteSubmissionRow,
  EXPORT_LIMIT,
  getSubmission as getSubmissionRow,
  listSubmissionsAfter,
  listSubmissionsForExport,
  type SubmissionCursor,
} from "../workspaces/submissions.ts";
import type {
  DeliveryAttemptRow,
  SubmissionDetail,
  SubmissionFilters,
  SubmissionListItem,
} from "../workspaces/types.ts";
import { ApiError, iso, publicIdArg, requireApiScope, type ApiContext } from "./context.ts";
import { loadEndpoint, parseInput } from "./endpoints.ts";

/**
 * Submissions, their files and their delivery history (#133).
 *
 * Submissions are end-user PII. Nothing in this module logs a value, and the
 * error messages it raises never echo one.
 */

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export type ApiSubmission = {
  id: string;
  endpoint: { id: string; name: string };
  submitted_at: string;
  origin: string;
  spam: { state: string; score: number };
  outcome: { verdict: string; value: string | null; currency: string | null };
  values: Record<string, unknown>;
  attribution: {
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    referrer: string | null;
  };
  /** True when no destination was switched on when it arrived, so it went nowhere. */
  delivered_nowhere: boolean;
};

export type ApiDelivery = {
  id: string;
  attempt: number;
  status: string;
  response_status: number | null;
  error: string | null;
  destination: { name: string | null; kind: string | null };
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  next_retry_at: string | null;
};

export type ApiSubmissionFile = {
  id: string;
  field: string;
  filename: string;
  content_type: string | null;
  size: number;
  sha256: string;
  purged: boolean;
  expires_at: string | null;
  /** A signed link, valid for a week or until the file's retention ends. Null once purged. */
  download_url: string | null;
};

export type ApiSubmissionDetail = ApiSubmission & {
  origin_reasons: unknown[];
  spam_reasons: unknown[];
  outcome: ApiSubmission["outcome"] & { decided_at: string | null; source: string | null };
  attribution: ApiSubmission["attribution"] & {
    utm_term: string | null;
    utm_content: string | null;
    click_ids: Record<string, unknown>;
  };
  user_agent: string | null;
  raw: { content_type: string | null; body: string | null };
  files: ApiSubmissionFile[];
  deliveries: ApiDelivery[];
};

/**
 * `values` with fresh links on the file references this submission really
 * owns, and every other reference left exactly as stored.
 *
 * `isStoredFileRef` is structural, so a reference in `values` proves nothing
 * about which file it names. Only ids read from this submission's own
 * `submission_files` rows are re-signed; anything else — a legacy row, a
 * forged object — keeps the link it arrived with, which simply expires.
 * Rebuilt with `defineProperty` so a field named `__proto__` stays a field.
 */
function resignOwnFiles(value: unknown, own: ReadonlyMap<string, Date | null>, now: Date): unknown {
  if (isStoredFileRef(value)) {
    if (!own.has(value.id)) return value;
    // The retention ceiling comes from the row too, not from the reference.
    const expiresAt = own.get(value.id) ?? null;
    return refreshFileRef({ ...value, expiresAt: expiresAt ? expiresAt.toISOString() : null }, "export", now);
  }
  if (Array.isArray(value)) return value.map((entry) => resignOwnFiles(entry, own, now));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      Object.defineProperty(out, key, {
        value: resignOwnFiles(entry, own, now),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  }
  return value;
}

function toApiSubmission(
  row: SubmissionListItem,
  now: Date,
  ownFileIds: ReadonlyMap<string, Date | null> = new Map(),
): ApiSubmission {
  return {
    id: row.publicId,
    endpoint: { id: row.endpointPublicId, name: row.endpointName },
    submitted_at: row.submittedAt.toISOString(),
    origin: row.origin,
    spam: { state: row.spamState, score: row.spamScore },
    outcome: { verdict: row.verdict, value: row.verdictValue, currency: row.verdictCurrency },
    // A list row carries no file rows, so its references are as stored; the
    // detail re-signs the ones it can prove belong to it.
    values: resignOwnFiles(row.values, ownFileIds, now) as Record<string, unknown>,
    attribution: {
      utm_source: row.utmSource,
      utm_medium: row.utmMedium,
      utm_campaign: row.utmCampaign,
      referrer: row.referrer,
    },
    delivered_nowhere: row.deliveredNowhere,
  };
}

function toApiDelivery(row: DeliveryAttemptRow): ApiDelivery {
  return {
    id: row.id,
    attempt: row.attempt,
    status: row.status,
    response_status: row.responseStatus,
    error: row.error,
    destination: { name: row.destinationName, kind: row.destinationKind },
    created_at: row.createdAt.toISOString(),
    started_at: iso(row.startedAt),
    completed_at: iso(row.completedAt),
    next_retry_at: iso(row.nextRetryAt),
  };
}

function toApiDetail(row: SubmissionDetail, now: Date): ApiSubmissionDetail {
  const base = toApiSubmission(
    row,
    now,
    new Map(row.files.filter((file) => !file.purgedAt).map((file) => [file.publicId, file.expiresAt])),
  );
  return {
    ...base,
    origin_reasons: row.originReasons,
    spam_reasons: row.spamReasons,
    outcome: { ...base.outcome, decided_at: iso(row.verdictAt), source: row.verdictSource },
    attribution: {
      ...base.attribution,
      utm_term: row.utmTerm,
      utm_content: row.utmContent,
      click_ids: row.clickIds,
    },
    user_agent: row.userAgent,
    raw: { content_type: row.rawContentType, body: row.rawBody },
    files: row.files.map((file) => ({
      id: file.publicId,
      field: file.fieldKey,
      filename: file.filename,
      content_type: file.detectedContentType ?? file.declaredContentType,
      size: file.size,
      sha256: file.sha256,
      purged: file.purgedAt !== null,
      expires_at: iso(file.expiresAt),
      // Minted from the `submission_files` row this workspace-scoped query
      // returned, never from a reference found in `values` — that shape can be
      // forged by whoever filled in the form.
      download_url: file.purgedAt ? null : signDownloadUrl(file.publicId, "export", file.expiresAt, now),
    })),
    deliveries: row.deliveries.map(toApiDelivery),
  };
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const instant = z
  .string()
  .trim()
  .refine((value) => DAY.test(value) || !Number.isNaN(Date.parse(value)), "must be a date (YYYY-MM-DD) or an ISO 8601 timestamp");

const list = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .union([z.array(z.enum(values)), z.string()])
    .transform((value, ctx) => {
      const entries = (Array.isArray(value) ? value : value.split(",")).map((entry) => entry.trim()).filter(Boolean);
      const bad = entries.filter((entry) => !(values as readonly string[]).includes(entry));
      if (bad.length > 0) {
        ctx.addIssue({ code: "custom", message: `must be one or more of ${values.join(", ")}` });
        return z.NEVER;
      }
      return entries as T[];
    });

const filterShape = {
  endpoint: z.string().trim().min(1).max(64).optional(),
  origin: list(["human", "agent", "unverified"]).optional(),
  verdict: list(["won", "lost", "disqualified", "awaiting"]).optional(),
  spam: list(["clear", "flagged", "not_spam", "confirmed_spam"]).optional(),
  from: instant.optional(),
  to: instant.optional(),
  q: z.string().trim().min(1).max(200).optional(),
};

const listSchema = z.strictObject({
  ...filterShape,
  cursor: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
});

const exportSchema = z.strictObject({
  ...filterShape,
  format: z.enum(["csv", "json"]).optional(),
});

/**
 * `from` is inclusive. `to` is exclusive for a timestamp; for a bare date it
 * covers that whole day (UTC), matching the inbox's date filter.
 */
function toBound(value: string | undefined, end: boolean): Date | null {
  if (!value) return null;
  if (DAY.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (end) date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }
  return new Date(value);
}

type FilterInput = {
  endpoint?: string;
  origin?: SubmissionFilters["origin"];
  verdict?: SubmissionFilters["verdict"];
  spam?: SubmissionFilters["spam"];
  from?: string;
  to?: string;
  q?: string;
};

async function toFilters(ctx: ApiContext, input: FilterInput): Promise<SubmissionFilters> {
  // An endpoint that is not this workspace's is a 404 rather than an empty
  // list, so a typo is distinguishable from "no submissions yet".
  const endpoint = input.endpoint ? await loadEndpoint(ctx, input.endpoint) : null;

  return {
    lane: "submissions",
    endpointPublicId: endpoint?.publicId ?? null,
    origin: input.origin ?? [],
    verdict: input.verdict ?? [],
    spam: input.spam ?? [],
    from: toBound(input.from, false),
    to: toBound(input.to, true),
    q: input.q ?? null,
    page: 1,
  };
}

// ---------------------------------------------------------------------------
// Cursors
// ---------------------------------------------------------------------------

const CURSOR_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opaque to the client. It narrows a query that is already scoped to the
 * caller's workspace, so a forged one can only skip rows the caller could
 * read anyway; it is still validated strictly so it can never reach SQL as
 * anything but a timestamp and a uuid.
 */
export function encodeCursor(cursor: SubmissionCursor): string {
  return Buffer.from(JSON.stringify([cursor.at, cursor.id])).toString("base64url");
}

export function decodeCursor(value: string): SubmissionCursor {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      Array.isArray(decoded) &&
      decoded.length === 2 &&
      typeof decoded[0] === "string" &&
      typeof decoded[1] === "string" &&
      CURSOR_AT.test(decoded[0]) &&
      UUID.test(decoded[1])
    ) {
      return { at: decoded[0], id: decoded[1] };
    }
  } catch {
    // Fall through to the error below.
  }
  throw new ApiError("invalid_request", "cursor is not valid. Pass back the next_cursor from the previous page unchanged.");
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export type ApiSubmissionPage = {
  data: ApiSubmission[];
  /** Pass as `cursor` for the next page. Null on the last page. */
  next_cursor: string | null;
};

/** Newest first. Filters combine with AND; a list filter matches any of its values. */
export async function listSubmissions(ctx: ApiContext, input: unknown): Promise<ApiSubmissionPage> {
  requireApiScope(ctx, "submissions:read");
  const query = parseInput(listSchema, input ?? {});
  const filters = await toFilters(ctx, query);
  const now = ctx.now ?? new Date();

  const page = await listSubmissionsAfter(ctx.caller.workspaceId, filters, {
    after: query.cursor ? decodeCursor(query.cursor) : null,
    limit: query.limit ?? DEFAULT_PAGE_LIMIT,
  });

  return {
    data: page.rows.map((row) => toApiSubmission(row, now)),
    next_cursor: page.next ? encodeCursor(page.next) : null,
  };
}

async function loadSubmission(ctx: ApiContext, id: unknown): Promise<SubmissionDetail> {
  const publicId = publicIdArg(id, "submission");
  const row = await getSubmissionRow(ctx.caller.workspaceId, publicId);
  if (!row) throw new ApiError("not_found", `No submission ${JSON.stringify(publicId)} in this workspace.`);
  return row;
}

export async function getSubmission(ctx: ApiContext, id: unknown): Promise<ApiSubmissionDetail> {
  requireApiScope(ctx, "submissions:read");
  return toApiDetail(await loadSubmission(ctx, id), ctx.now ?? new Date());
}

export async function listSubmissionDeliveries(ctx: ApiContext, id: unknown): Promise<ApiDelivery[]> {
  requireApiScope(ctx, "submissions:read");
  return (await loadSubmission(ctx, id)).deliveries.map(toApiDelivery);
}

/**
 * Soft-deletes a submission: it disappears from the inbox, every export, the
 * API and Yield. There is no undelete through the API.
 */
export async function deleteSubmission(ctx: ApiContext, id: unknown): Promise<{ id: string; deleted: true }> {
  requireApiScope(ctx, "submissions:write");
  const publicId = publicIdArg(id, "submission");
  const deleted = await deleteSubmissionRow(ctx.caller.workspaceId, publicId);
  if (!deleted) throw new ApiError("not_found", `No submission ${JSON.stringify(publicId)} in this workspace.`);
  return { id: publicId, deleted: true };
}

export type ApiExport = {
  format: "csv" | "json";
  content_type: string;
  filename: string;
  body: string;
  count: number;
  /** True when the export hit `EXPORT_LIMIT`; narrow the filters to get the rest. */
  truncated: boolean;
};

/** The same files the inbox's Export button downloads, with the same filters as `listSubmissions`. */
export async function exportSubmissions(ctx: ApiContext, input: unknown): Promise<ApiExport> {
  requireApiScope(ctx, "submissions:read");
  const query = parseInput(exportSchema, input ?? {});
  const filters = await toFilters(ctx, query);
  const format = query.format ?? "csv";

  const rows = await listSubmissionsForExport(ctx.caller.workspaceId, filters);
  const stamp = (ctx.now ?? new Date()).toISOString().slice(0, 10);

  return {
    format,
    content_type: format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
    filename: `${ctx.caller.workspaceSlug}-submissions-${stamp}.${format}`,
    body: format === "json" ? toJson(rows) : toCsv(rows),
    count: rows.length,
    truncated: rows.length >= EXPORT_LIMIT,
  };
}

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

export type ApiDestination = {
  id: string;
  kind: string;
  name: string;
  enabled: boolean;
  /** True for the email notification the endpoint was created with. */
  default_notification: boolean;
  created_at: string;
  health: {
    state: string;
    consecutive_failures: number;
    last_success_at: string | null;
    last_failure_at: string | null;
    pending_count: number;
    dead_letter_count: number;
  };
};

/**
 * Where an endpoint's submissions are delivered. Configuration is left out
 * entirely — even redacted, a webhook URL can carry a token in its query string.
 */
export async function listDestinations(ctx: ApiContext, endpointId: unknown): Promise<ApiDestination[]> {
  requireApiScope(ctx, "endpoints:read");
  const endpoint = await loadEndpoint(ctx, endpointId);
  const rows = await listDestinationRows(ctx.caller.workspaceId, endpoint.publicId);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    enabled: row.enabled,
    default_notification: row.defaultNotification,
    created_at: row.createdAt.toISOString(),
    health: {
      state: row.health.state,
      consecutive_failures: row.health.consecutiveFailures,
      last_success_at: iso(row.health.lastSuccessAt),
      last_failure_at: iso(row.health.lastFailureAt),
      pending_count: row.health.pendingCount,
      dead_letter_count: row.health.deadLetterCount,
    },
  }));
}
