import { requireUser } from "@/lib/auth/session";
import { formatValue } from "@/lib/submission-values";
import { getWorkspaceAccess } from "@/lib/workspaces/queries";
import {
  collectValueKeys,
  EXPORT_LIMIT,
  listSubmissionsForExport,
  parseSubmissionFilters,
} from "@/lib/workspaces/submissions";
import type { SubmissionExportRow } from "@/lib/workspaces/types";

/**
 * `GET /app/{slug}/submissions/export` — your data, out.
 *
 * **Never paywalled, on any plan.** `docs/00-positioning-spine.md` makes getting
 * your data out a table stake, and a product whose pitch is that other people's
 * dashboards lie to you cannot then hold the raw rows hostage. There is no plan
 * check in this file and there should never be one.
 *
 * It takes the same query string the inbox does and runs it through the same
 * `parseSubmissionFilters` and the same predicate, so the file matches the screen
 * by construction rather than by two implementations agreeing.
 *
 * A route handler rather than a page, so it re-derives the workspace itself:
 * `requireUser` for the session, `getWorkspaceAccess` for the membership, and a
 * plain 404 for either failure — the same answer for "no such workspace" and
 * "not yours", because distinguishing them hands out a customer list.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;

  const user = await requireUser();
  const access = await getWorkspaceAccess(slug, user.id);
  if (!access) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const filters = parseSubmissionFilters(Object.fromEntries(url.searchParams));
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";

  const rows = await listSubmissionsForExport(access.workspace.id, filters);

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${access.workspace.slug}-submissions-${stamp}.${format}`;

  const body = format === "json" ? toJson(rows) : toCsv(rows);

  return new Response(body, {
    status: 200,
    headers: {
      "content-type":
        format === "json"
          ? "application/json; charset=utf-8"
          : "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      // One tenant's rows behind one person's session.
      "cache-control": "no-store",
      // Says out loud when the export was capped, rather than letting someone
      // discover it by counting rows in a spreadsheet.
      "x-export-row-count": String(rows.length),
      ...(rows.length >= EXPORT_LIMIT ? { "x-export-truncated": "true" } : {}),
    },
  });
}

/**
 * JSON is the lossless one.
 *
 * Values stay nested, the origin reasons stay structured, and nothing is escaped
 * for a spreadsheet's benefit. When the CSV and the JSON disagree about a cell,
 * this is the one that is right.
 */
function toJson(rows: SubmissionExportRow[]): string {
  return `${JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: rows.length,
      truncated: rows.length >= EXPORT_LIMIT,
      submissions: rows.map((row) => ({
        id: row.publicId,
        endpoint: { id: row.endpointPublicId, name: row.endpointName },
        submittedAt: row.submittedAt.toISOString(),
        origin: row.origin,
        originReasons: row.originReasons,
        verdict: row.verdict,
        verdictValue: row.verdictValue,
        verdictCurrency: row.verdictCurrency,
        verdictAt: row.verdictAt ? row.verdictAt.toISOString() : null,
        verdictSource: row.verdictSource,
        values: row.values,
        attribution: {
          utmSource: row.utmSource,
          utmMedium: row.utmMedium,
          utmCampaign: row.utmCampaign,
          utmTerm: row.utmTerm,
          utmContent: row.utmContent,
          clickIds: row.clickIds,
          referrer: row.referrer,
        },
        userAgent: row.userAgent,
        raw: { contentType: row.rawContentType, body: row.rawBody },
      })),
    },
    null,
    2,
  )}\n`;
}

const FIXED_COLUMNS = [
  "submission_id",
  "received_at",
  "endpoint",
  "endpoint_id",
  "origin",
  "origin_score",
  "verdict",
  "verdict_value",
  "verdict_currency",
  "verdict_at",
  "verdict_source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "click_ids",
  "referrer",
  "user_agent",
  "raw_content_type",
] as const;

/**
 * CSV, per RFC 4180, with a byte-order mark and CRLF line endings.
 *
 * The BOM is not decoration: without it Excel reads a UTF-8 file as the local
 * code page and every non-ASCII name in the export arrives mangled.
 *
 * Submitted fields become `field.<name>` columns, from the union of keys across
 * the exported rows — an endpoint with no schema genuinely has no fixed column
 * set, so the file's shape has to be discovered from the data rather than
 * declared.
 */
function toCsv(rows: SubmissionExportRow[]): string {
  const valueKeys = collectValueKeys(rows);
  const header = [...FIXED_COLUMNS, ...valueKeys.map((key) => `field.${key}`)];

  const lines = [header.map(csvCell).join(",")];

  for (const row of rows) {
    const cells: string[] = [
      row.publicId,
      row.submittedAt.toISOString(),
      row.endpointName,
      row.endpointPublicId,
      row.origin,
      String(originScore(row)),
      row.verdict,
      row.verdictValue ?? "",
      row.verdictCurrency ?? "",
      row.verdictAt ? row.verdictAt.toISOString() : "",
      row.verdictSource ?? "",
      row.utmSource ?? "",
      row.utmMedium ?? "",
      row.utmCampaign ?? "",
      row.utmTerm ?? "",
      row.utmContent ?? "",
      Object.keys(row.clickIds).length > 0 ? JSON.stringify(row.clickIds) : "",
      row.referrer ?? "",
      row.userAgent ?? "",
      row.rawContentType ?? "",
      ...valueKeys.map((key) => formatValue(row.values[key])),
    ];

    lines.push(cells.map(csvCell).join(","));
  }

  return `﻿${lines.join("\r\n")}\r\n`;
}

/** The sum of the signal weights — the arithmetic behind the stamp, in a column. */
function originScore(row: SubmissionExportRow): number {
  return row.originReasons
    .filter((reason) => reason.code !== "threshold")
    .reduce((total, reason) => total + (Number(reason.weight) || 0), 0);
}

/**
 * One cell.
 *
 * Quoting is RFC 4180. The leading apostrophe is not: a cell beginning `=`, `+`,
 * `-` or `@` is executed as a formula by Excel and Sheets, and these cells hold
 * text that strangers typed into a form on the open internet. Neutralising it is
 * the difference between an export and a payload. The JSON export carries the
 * same values unaltered, so nothing is actually lost.
 */
function csvCell(value: string): string {
  const text = value ?? "";

  // A plain number is exempt. Without this a negative Origin score — a column
  // this file generates itself — arrives in the spreadsheet as the text `'-11`
  // and cannot be summed, which is a real cost paid to prevent nothing: a
  // formula payload is never a bare number.
  const numeric = /^-?\d+(\.\d+)?$/.test(text);
  const guarded = !numeric && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
