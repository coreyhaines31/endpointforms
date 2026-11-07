import { formatValue } from "../submission-values.ts";
import { refreshOwnedFileRefsIn, type OwnedFiles } from "../uploads/links.ts";
import { collectFileRefs, isStoredFileRef } from "../uploads/types.ts";
import { PARTIALS_EXPORT_LIMIT, type PartialListItem } from "./partials.ts";
import { collectValueKeys, EXPORT_LIMIT } from "./submissions.ts";
import type { SubmissionExportRow } from "./types.ts";

/**
 * The export file formats, CSV and JSON.
 *
 * Shared by the inbox's download (`/app/{slug}/submissions/export`) and the
 * agent API (#133), so a file downloaded from the screen and one fetched with
 * a key are byte-for-byte the same shape. Relative imports, so the tests and
 * the CLI-facing API can load it under plain `node`.
 */

/**
 * The partials export.
 *
 * Deliberately shaped so that nobody reading the file can mistake it for a list
 * of submissions: the id column is `partial_id`, there is a `step_reached`
 * column, and there is no verdict of any kind, because a partial has none.
 */
export function toPartialsJson(rows: PartialListItem[]): string {
  return `${JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: rows.length,
      truncated: rows.length >= PARTIALS_EXPORT_LIMIT,
      note: "These visits were never submitted. They are not counted as submissions and are not part of Yield.",
      partials: rows.map((row) => ({
        id: row.publicId,
        endpoint: { id: row.endpointPublicId, name: row.endpointName },
        startedAt: row.startedAt.toISOString(),
        lastSeenAt: row.updatedAt.toISOString(),
        stepReached: { id: row.stepId, number: row.stepNumber, of: row.stepsTotal },
        origin: row.origin,
        values: row.values,
        attribution: {
          utmSource: row.utmSource,
          utmMedium: row.utmMedium,
          utmCampaign: row.utmCampaign,
          referrer: row.referrer,
        },
      })),
    },
    null,
    2,
  )}\n`;
}

const PARTIAL_COLUMNS = [
  "partial_id",
  "started_at",
  "last_seen_at",
  "endpoint",
  "endpoint_id",
  "step_reached",
  "step_number",
  "steps_total",
  "origin",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "referrer",
] as const;

export function toPartialsCsv(rows: PartialListItem[]): string {
  const valueKeys = collectValueKeys(rows);
  const header = [...PARTIAL_COLUMNS, ...valueKeys.map((key) => `field.${key}`)];
  const lines = [header.map(csvCell).join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.publicId,
        row.startedAt.toISOString(),
        row.updatedAt.toISOString(),
        row.endpointName,
        row.endpointPublicId,
        row.stepId ?? "",
        row.stepNumber === null ? "" : String(row.stepNumber),
        row.stepsTotal === null ? "" : String(row.stepsTotal),
        row.origin,
        row.utmSource ?? "",
        row.utmMedium ?? "",
        row.utmCampaign ?? "",
        row.referrer ?? "",
        ...valueKeys.map((key) => formatValue(row.values[key])),
      ].map(csvCell).join(","),
    );
  }

  return `\ufeff${lines.join("\r\n")}\r\n`;
}

/**
 * JSON is the lossless one.
 *
 * Values stay nested, the origin reasons stay structured, and nothing is escaped
 * for a spreadsheet's benefit. When the CSV and the JSON disagree about a cell,
 * this is the one that is right.
 */
export function toJson(rows: SubmissionExportRow[]): string {
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
        // Every attached file's link is re-signed on the way out (#66), so an
        // export downloaded today is an export whose links work today. The one
        // stored on the row was signed when the submission arrived and is
        // pointed at a webhook receiver, not at the person opening this file.
        //
        // Only files this submission owns are re-signed (#133): a body posted
        // in the shape of a file reference must not be able to name another
        // workspace's file and get a working link to it out of our export.
        values: refreshOwnedFileRefsIn(row.values, row.ownedFiles, "export"),
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
export function toCsv(rows: SubmissionExportRow[]): string {
  const valueKeys = collectValueKeys(rows);
  const now = new Date();

  // Which fields ever held an attachment, across the whole export (#66). A file
  // gets **two** columns: `field.cv` reads `cv.pdf (241 kB)`, and
  // `field.cv.url` holds the signed link on its own.
  //
  // Two rather than one, because a cell containing a name and a URL is neither:
  // a spreadsheet will not turn it into a link, and a person cannot read the
  // filename past 200 characters of signature. On its own in a cell, the URL is
  // clickable in Excel and Sheets without anybody doing anything.
  //
  // The column exists at all because "exports are never paywalled" is a promise
  // about getting your data out, and a spreadsheet that names a file it cannot
  // fetch is the promise broken quietly — which is the same failure, one layer
  // up, as the one this whole issue was about.
  const fileKeys = new Set<string>();
  for (const row of rows) {
    for (const { key } of collectFileRefs(row.values)) fileKeys.add(key);
  }

  const header = [
    ...FIXED_COLUMNS,
    ...valueKeys.flatMap((key) =>
      fileKeys.has(key) ? [`field.${key}`, `field.${key}.url`] : [`field.${key}`],
    ),
  ];

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
      ...valueKeys.flatMap((key) =>
        fileKeys.has(key)
          ? [formatValue(row.values[key]), fileUrls(row.values[key], row.ownedFiles, now)]
          : [formatValue(row.values[key])],
      ),
    ];

    lines.push(cells.map(csvCell).join(","));
  }

  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * The signed links for one cell, space separated.
 *
 * Space rather than comma because the cell is already inside a CSV, and a
 * reader that splits on commas — a person, most often — should not see one link
 * become two broken ones. Re-signed here, not read off the row: see `toJson`.
 */
function fileUrls(value: unknown, owned: OwnedFiles, now: Date): string {
  const entries = Array.isArray(value) ? value : [value];
  // A reference this submission does not own gets no link at all — not even
  // the one it arrived with, which is whatever the submitter wrote (#133).
  return entries
    .filter(isStoredFileRef)
    .filter((ref) => owned.has(ref.id))
    .map((ref) => refreshOwnedFileRefsIn(ref, owned, "export", now).url)
    .join(" ");
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
export function csvCell(value: string): string {
  const text = value ?? "";

  // A plain number is exempt. Without this a negative Origin score — a column
  // this file generates itself — arrives in the spreadsheet as the text `'-11`
  // and cannot be summed, which is a real cost paid to prevent nothing: a
  // formula payload is never a bare number.
  const numeric = /^-?\d+(\.\d+)?$/.test(text);
  const guarded = !numeric && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
