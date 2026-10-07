import { parseConfig } from "../config.ts";
import { refreshAccessToken } from "../google.ts";
import { classifyStatus, classifyTransportError, describeFailure, transportDetail } from "../retry.ts";
import type {
  Adapter,
  AdapterContext,
  AdapterResult,
  FailureKind,
  SubmissionPayload,
} from "../types.ts";
import { SITE_URL } from "../../site.ts";
import { isStoredFileRef } from "../../uploads/types.ts";
import { readCapped } from "./webhook.ts";

/**
 * Google Sheets — one row per submission, in a sheet somebody already uses (#67).
 *
 * The base-tier customer is leaving a form that fills a spreadsheet, and the
 * colleague who reads that spreadsheet is usually happy with it. "Keep your
 * sheet, we will keep it filled" turns a migration into an addition, which is
 * why this exists at all.
 *
 * ## Columns are matched by header, every time
 *
 * The first row of the tab is the header. Each delivery reads it, finds the
 * column for each value **by name** (trimmed, case-insensitive), and writes the
 * row in whatever order the header is in today. So:
 *
 * - **Reordering columns corrupts nothing.** The order is read at delivery
 *   time, never remembered.
 * - **A field the header does not have gets a new column**, added at the right
 *   of the header before the row is written. A form that grows a field fills a
 *   sheet that grows a column, which is the behaviour a person would do by hand.
 * - **Columns we do not write stay empty** on our rows, so a colleague's own
 *   "Called back?" column next to ours is left alone.
 * - **An empty tab** gets the header written for it on the first delivery.
 *
 * Renaming a header is the one thing that changes the mapping: the next
 * delivery finds no column with the old name and adds one. That is the
 * honest outcome — we cannot know two names mean the same thing — and the new
 * column is visible rather than silently swallowing values.
 *
 * ## The stamp cannot be forged by a field name
 *
 * `Submitted at`, `Origin` and `Submission ID` are ours. A form field whose
 * name matches one of them — and on an open endpoint the submitter chooses the
 * field names — is written to its own column with ` (field)` after the name.
 * Otherwise posting `Origin=Human` would overwrite the stamp in the one place a
 * person reads it.
 *
 * ## Values are written RAW
 *
 * `valueInputOption=RAW` stores exactly the text submitted. The alternative,
 * `USER_ENTERED`, parses each cell as if typed into the sheet, which turns a
 * submitted `=IMPORTXML(…)` into a formula running with the sheet owner's
 * access. A form that writes untrusted input into a spreadsheet as live
 * formulas is a well-known way to exfiltrate the spreadsheet. The cost is that
 * dates arrive as ISO text, which sorts correctly and formats in one click.
 *
 * ## Retries do not duplicate rows
 *
 * A retry can follow an append that landed and whose response was lost. From
 * attempt 2 on, the `Submission ID` column is read first and the row is not
 * appended again if it is already there. The first attempt skips that read,
 * because nothing can have been written before it.
 *
 * ## Only ever Google
 *
 * Every request goes to `oauth2.googleapis.com` or `sheets.googleapis.com`,
 * hosts that are constants here — the customer supplies a spreadsheet id, which
 * `googleSheetsConfigSchema` restricts to the characters an id can contain,
 * never a URL. That is why this uses the global `fetch` rather than the pinned
 * `deliveryFetch` the webhook needs: there is no customer-chosen host to pin.
 */

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DEFAULT_TIMEOUT_MS = 10_000;
/** Google's own per-cell limit. A longer value is cut and says so. */
const MAX_CELL_CHARS = 50_000;

export const SUBMITTED_AT = "Submitted at";
export const ORIGIN = "Origin";
export const SUBMISSION_ID = "Submission ID";
/** Where values go that may not have a column of their own. See `planRow`. */
export const OTHER_FIELDS = "Other fields";
const RESERVED = [SUBMITTED_AT, ORIGIN, SUBMISSION_ID, OTHER_FIELDS];

/** The widest header a schema-less endpoint may grow a sheet to. */
export const MAX_HEADER_COLUMNS = 100;
/** How many times a header write may be lost to a concurrent one before giving up. */
const HEADER_WRITE_ROUNDS = 3;
/** A header cell longer than this is cut. */
export const MAX_HEADER_NAME_CHARS = 100;

const ORIGIN_LABEL = {
  human: "Human",
  agent: "Agent",
  unverified: "Unverified",
} as const;

export const googleSheetsAdapter: Adapter = {
  kind: "google_sheets",
  available: true,
  label: "Google Sheets",
  blurb:
    "Adds a row to a sheet you already use, matched to its header row, stamped Human, Agent or Unverified.",
  deliver: deliverGoogleSheets,
};

type Cell = string | number | boolean;

export async function deliverGoogleSheets(context: AdapterContext): Promise<AdapterResult> {
  const doFetch = context.fetchImpl ?? fetch;
  const timeoutMs = context.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let config;
  try {
    config = parseConfig("google_sheets", context.config);
  } catch (error) {
    return failed({ failure: "configuration", error: messageOf(error) });
  }

  // What the log shows instead of an Authorization header. The access token is
  // minted below and lives exactly as long as this function.
  const requestHeaders = {
    "content-type": "application/json",
    spreadsheet: config.spreadsheetId,
    sheet: config.sheetName,
    authorization: "[redacted]",
  };

  const token = await refreshAccessToken(config.refreshToken, {
    fetchImpl: context.fetchImpl,
    timeoutMs,
  });
  if (!token.ok) {
    return failed({
      failure: token.failure,
      error:
        token.failure === "revoked"
          ? `${token.error} Reconnect it from this destination's settings, then send what was missed again from this log.`
          : token.error,
      requestHeaders,
      responseStatus: token.responseStatus,
      responseBody: token.responseBody,
    });
  }

  const call = (method: string, range: string, suffix = "", body?: unknown) =>
    sheetsRequest(doFetch, token.accessToken, timeoutMs, {
      method,
      url: `${SHEETS_API}/${config.spreadsheetId}/values/${encodeURIComponent(range)}${suffix}`,
      body,
    });

  const tab = quoteSheetName(config.sheetName);

  const declaredFields = context.declaredFields ?? null;
  const entries = sheetRow(context.payload, { declaredFields });
  const readHeader = async () => {
    const read = await call("GET", `${tab}!1:1`, "?majorDimension=ROWS");
    return read.ok ? { ok: true as const, header: firstRow(read.json) } : { ok: false as const, read };
  };

  // 1. The header, as it is right now.
  const first = await readHeader();
  if (!first.ok) return sheetsFailure(first.read, context, config.sheetName, requestHeaders);
  let header = first.header;

  // 2. Columns the header does not have yet, written to the right of it — and
  //    then checked (security review M2).
  //
  //    Two deliveries that both need a new column read the same header, both
  //    write at the same position, and the second overwrites the first. The
  //    loser's value would then be appended under the winner's column name. So
  //    the header is read back after writing: if our columns are not there as
  //    we wrote them, nothing is appended — the row is planned again against
  //    the header as it now is. Bounded; if the header keeps moving, the
  //    delivery fails as retryable rather than guessing.
  //
  //    What remains is the gap between that read-back and the append. Sheets
  //    has no lock to close it with; the window is one request wide rather
  //    than a whole delivery wide.
  let plan: RowPlan | null = null;
  for (let round = 1; round <= HEADER_WRITE_ROUNDS; round++) {
    const candidate = planRow(header, entries, { hasSchema: declaredFields !== null });
    if (candidate.added.length === 0) {
      plan = candidate;
      break;
    }

    const start = `${columnLetter(header.length)}1`;
    const written = await call("PUT", `${tab}!${start}`, "?valueInputOption=RAW", {
      values: [candidate.added],
    });
    if (!written.ok) return sheetsFailure(written, context, config.sheetName, requestHeaders);

    const check = await readHeader();
    if (!check.ok) return sheetsFailure(check.read, context, config.sheetName, requestHeaders);
    const expected = [...header, ...candidate.added];
    if (expected.every((name, position) => check.header[position] === name)) {
      plan = candidate;
      break;
    }
    header = check.header;
  }

  if (plan === null) {
    return failed({
      // Retryable on purpose: this is contention, and the next attempt meets a
      // header that has settled.
      failure: "unknown",
      error: `The header row of "${config.sheetName}" kept changing while ${context.destinationName} was adding columns to it — another delivery, or someone editing it. Nothing was appended, so nothing landed under the wrong column.`,
      requestHeaders,
    });
  }

  // 3. On a retry, the row may already be there.
  if (context.payload.delivery.attempt > 1) {
    const column = columnLetter(plan.idColumn);
    const existing = await call("GET", `${tab}!${column}:${column}`, "?majorDimension=COLUMNS");
    if (!existing.ok) return sheetsFailure(existing, context, config.sheetName, requestHeaders);
    const ids = firstRow(existing.json);
    if (ids.includes(context.payload.submission.id)) {
      return {
        ok: true,
        requestBody: null,
        requestHeaders,
        responseStatus: existing.status,
        responseBody: `Already in the sheet: an earlier attempt wrote ${context.payload.submission.id} and its response was lost. Nothing was appended twice.`,
        error: null,
        failure: null,
      };
    }
  }

  // 4. The row.
  const appendBody = { values: [plan.row] };
  const appended = await call(
    "POST",
    `${tab}!A1`,
    ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
    appendBody,
  );
  const requestBody = JSON.stringify(appendBody);
  if (!appended.ok) {
    return { ...sheetsFailure(appended, context, config.sheetName, requestHeaders), requestBody };
  }

  return {
    ok: true,
    requestBody,
    requestHeaders,
    responseStatus: appended.status,
    responseBody: appended.text,
    error: null,
    failure: null,
  };
}

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

/**
 * One value bound for the sheet.
 *
 * `field` entries are the form's own values; everything else is ours. `key`
 * is the field's key exactly as submitted, kept for the `Other fields` JSON
 * when the value does not get a column of its own.
 */
export type RowEntry = {
  name: string;
  value: Cell;
  source: "ours" | "field";
  key: string;
  /** True when the endpoint's active schema declares this key. */
  declared: boolean;
};

export type RowOptions = {
  /** The active schema's field keys, or null for an endpoint without one. */
  declaredFields?: readonly string[] | null;
};

/**
 * A submission as an ordered list of entries, ours first.
 *
 * A list rather than an object, so a field literally called `__proto__` is a
 * column name and not a prototype — the same trap `src/lib/ingest/body.ts`
 * guards against.
 */
export function sheetRow(payload: SubmissionPayload, options: RowOptions = {}): RowEntry[] {
  const { submission } = payload;
  const declared = new Set(options.declaredFields ?? []);
  const ours = (name: string, value: Cell): RowEntry => ({
    name,
    value,
    source: "ours",
    key: name,
    declared: false,
  });
  const entries: RowEntry[] = [
    ours(SUBMITTED_AT, submission.submittedAt),
    ours(ORIGIN, ORIGIN_LABEL[submission.origin]),
    ours(SUBMISSION_ID, submission.id),
  ];
  // Attribution is a column only once there is something in it, so a form that
  // never sees a UTM does not grow five empty columns. Its names are reserved
  // before the form's fields are read, for the same reason ours are: a field
  // called `utm_source` must not take the column the real attribution goes in.
  const attribution = submission.attribution;
  const utm = (
    [
      ["utm_source", attribution.utmSource],
      ["utm_medium", attribution.utmMedium],
      ["utm_campaign", attribution.utmCampaign],
      ["utm_term", attribution.utmTerm],
      ["utm_content", attribution.utmContent],
    ] as [string, string | null][]
  ).filter((pair): pair is [string, string] => pair[1] !== null && pair[1] !== "");

  const taken = new Set([...RESERVED, ...utm.map(([name]) => name)].map(normalise));

  for (const [key, value] of Object.entries(submission.values)) {
    // Compared after `normalise`, so `Origin` followed by a zero-width space,
    // or written in fullwidth letters, is still a field called Origin.
    const base = neutraliseFormula(headerName(key));
    let column = base;
    if (taken.has(normalise(column))) column = `${base} (field)`;
    // Two fields that only differ by case are still two fields.
    let suffix = 2;
    while (taken.has(normalise(column))) column = `${base} (field ${suffix++})`;
    taken.add(normalise(column));
    entries.push({
      name: column,
      value: cellValue(value),
      source: "field",
      key,
      declared: declared.has(key),
    });
  }

  for (const [name, value] of utm) entries.push(ours(name, value));

  return entries;
}

export type RowPlan = {
  /** Column names to add to the right of the existing header, in order. */
  added: string[];
  /** The row, aligned to the header after `added` is appended to it. */
  row: Cell[];
  /** 0-based index of the `Submission ID` column. */
  idColumn: number;
};

/**
 * Lines a row up with a header.
 *
 * The first header cell matching a name wins, so a sheet with a duplicated
 * column still gets each value once. A blank header cell is never matched — it
 * is somebody's gap, not a column of ours.
 *
 * ## Who may add a column (security review M3)
 *
 * On an open endpoint the submitter chooses the field names, so "a field with
 * no column gets one" would let one POST with two thousand invented keys widen
 * a customer's sheet by two thousand columns. So:
 *
 * - **With an active schema**, only declared fields get new columns. Anything
 *   else goes into one `Other fields` column, as JSON.
 * - **Without one**, the header is capped at `MAX_HEADER_COLUMNS` in total;
 *   fields past the cap go into `Other fields` the same way. That column is
 *   always allowed — it is the one place the overflow can go, and refusing it
 *   would drop values from the sheet.
 *
 * Nothing is lost either way: the submission itself, with every field, is in
 * Endpoint and in every other destination.
 */
export function planRow(
  header: string[],
  entries: RowEntry[],
  options: { hasSchema: boolean } = { hasSchema: false },
): RowPlan {
  const index = new Map<string, number>();
  header.forEach((name, position) => {
    const key = normalise(name);
    if (key !== "" && !index.has(key)) index.set(key, position);
  });

  const added: string[] = [];
  const placed: [number, Cell][] = [];
  const overflow: [string, Cell][] = [];

  const place = (name: string, value: Cell) => {
    const key = normalise(name);
    let position = index.get(key);
    if (position === undefined) {
      position = header.length + added.length;
      index.set(key, position);
      added.push(name);
    }
    placed.push([position, typeof value === "string" ? neutraliseFormula(value) : value]);
  };

  for (const entry of entries) {
    if (entry.source === "ours") {
      place(entry.name, entry.value);
      continue;
    }
    // Security review M4: with a schema, only a declared field may write into
    // a column that already exists. Otherwise a submitter who guesses the name
    // of a colleague's "Approved" column can fill it on every row they send.
    if (options.hasSchema && !entry.declared) {
      overflow.push([entry.key, entry.value]);
      continue;
    }
    if (index.has(normalise(entry.name))) {
      place(entry.name, entry.value);
      continue;
    }
    const mayCreate = options.hasSchema
      ? entry.declared
      : // One slot is kept for `Other fields`, so the header stays at the cap.
        header.length + added.length < MAX_HEADER_COLUMNS - 1;
    if (mayCreate) place(entry.name, entry.value);
    else overflow.push([entry.key, entry.value]);
  }

  if (overflow.length > 0) {
    // `Object.fromEntries` defines own properties, so a key named `__proto__`
    // is data here rather than a prototype.
    place(OTHER_FIELDS, capCell(JSON.stringify(Object.fromEntries(overflow))));
  }

  const width = header.length + added.length;
  const row: Cell[] = Array.from({ length: width }, () => "");
  for (const [position, value] of placed) row[position] = value;

  return { added, row, idColumn: index.get(normalise(SUBMISSION_ID)) ?? 0 };
}

/**
 * A string that would start a formula in a spreadsheet, made inert with a
 * leading apostrophe (security review M5).
 *
 * `RAW` already stops Google Sheets evaluating it. This is for what happens
 * **next**: someone downloads the sheet as CSV or `.xlsx` and opens it in Excel
 * or LibreOffice, which do evaluate `=HYPERLINK(…)`, `+cmd|…`, `-1+1` and
 * `@SUM(…)` — CSV injection. A leading tab or carriage return is treated the
 * same way, because some importers strip it and leave the formula behind.
 *
 * **The trade-off is a visible quote.** With `RAW` input Google does not treat
 * the apostrophe as its own hidden text prefix, so a submitted `-5` or `@acme`
 * shows as `'-5` and `'@acme` in the sheet. That is the cost of a cell that is
 * safe in every program it is later opened in, and it is documented in
 * docs/28. Numbers typed as numbers are not strings and are left alone.
 */
export function neutraliseFormula(value: string): string {
  if (/^[\t\r]/.test(value) || /^\s*[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

/** A field key as a header cell: capped, so a 10 kB key is not a 10 kB header. */
function headerName(key: string): string {
  return key.length <= MAX_HEADER_NAME_CHARS ? key : key.slice(0, MAX_HEADER_NAME_CHARS);
}

/** A value as one cell. Strings stay strings; nothing is ever evaluated. */
export function cellValue(value: unknown): Cell {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return capCell(value);
  if (Array.isArray(value)) return capCell(value.map((item) => String(cellValue(item))).join(", "));
  if (typeof value === "object") {
    // An uploaded file (#66): its name, and the link while the link lasts. The
    // link expires — see `urlExpiresAt` in the webhook payload — which is why the
    // name comes first and is still useful after it does.
    //
    // Only for a value that is a whole stored reference **and** whose link is
    // our own download route for that id. The "filename — link" form reads as
    // a file we hold, and a submitter can post JSON in that shape naming any
    // URL — `{file: true, filename: "Invoice.pdf", url: "https://evil…/login"}`
    // would otherwise sit in the sheet looking like an attachment. The shape
    // check alone is not enough (CLAUDE.md: a structural guard is not a trust
    // boundary), so the link must also be one we would have minted. Anything
    // else is written as the JSON it is.
    if (isStoredFileRef(value) && isOurDownloadUrl(value.url, value.id)) {
      return capCell(`${value.filename} — ${value.url}`);
    }
    return capCell(JSON.stringify(value));
  }
  return capCell(String(value));
}

/** `{SITE_URL}/api/v1/files/{id}?…` — the only link `signDownloadUrl` mints. */
function isOurDownloadUrl(url: string, id: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === new URL(SITE_URL).origin &&
      parsed.pathname === `/api/v1/files/${encodeURIComponent(id)}`
    );
  } catch {
    return false;
  }
}

function capCell(value: string): string {
  if (value.length <= MAX_CELL_CHARS) return value;
  const note = " … truncated";
  return `${value.slice(0, MAX_CELL_CHARS - note.length)}${note}`;
}

/**
 * A column name as it is compared — for matching a header, and for the
 * reserved-name check (security review M4).
 *
 * NFKC folds compatibility forms (fullwidth `Ｏｒｉｇｉｎ`, ligatures) onto the
 * letters they look like, and `\p{Cf}` removes format characters — a zero-width
 * space or joiner after `Origin` renders identically in a sheet and would
 * otherwise be a different name. What this does **not** fold is a cross-script
 * homoglyph: a Cyrillic `О` in `Оrigin` is a different letter to Unicode, not a
 * compatibility form of a Latin one, and no normalisation maps it. That field
 * gets a column that looks like ours; it cannot write into ours.
 */
export function normalise(name: string): string {
  return name.normalize("NFKC").replace(/\p{Cf}/gu, "").trim().toLowerCase();
}

/** `'Leads'`, with an apostrophe in the name doubled, as A1 notation requires. */
export function quoteSheetName(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

/** 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** The first row (or column) of a values response, as strings. Empty when absent. */
function firstRow(json: Record<string, unknown>): string[] {
  const values = json.values;
  if (!Array.isArray(values) || !Array.isArray(values[0])) return [];
  return (values[0] as unknown[]).map((cell) => (cell === null || cell === undefined ? "" : String(cell)));
}

// ---------------------------------------------------------------------------
// Checking a spreadsheet before a destination points at it
// ---------------------------------------------------------------------------

export type SpreadsheetCheck =
  | { ok: true; title: string; sheetName: string }
  | { ok: false; reason: "forbidden" | "missing" | "no_tab" | "unreachable"; detail: string };

/**
 * Whether the connected account can open this spreadsheet, and which tab to use.
 *
 * Run once, at connection time, so the common mistakes — a link to a sheet the
 * account cannot see, a tab name with a typo — are said on the screen where
 * they were made rather than in a delivery log after the first lead. An empty
 * tab name means the first tab, resolved here and stored by name.
 *
 * What it does **not** prove is write access: reading the metadata succeeds for
 * a view-only collaborator. "Send a test delivery" is what proves a row can be
 * written, and a view-only grant fails its first delivery as `auth` with a
 * sentence saying so.
 */
export async function inspectSpreadsheet(input: {
  accessToken: string;
  spreadsheetId: string;
  sheetName: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<SpreadsheetCheck> {
  const response = await sheetsRequest(
    input.fetchImpl ?? fetch,
    input.accessToken,
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    {
      method: "GET",
      url: `${SHEETS_API}/${input.spreadsheetId}?fields=${encodeURIComponent("properties.title,sheets.properties.title")}`,
    },
  );

  if (!response.ok) {
    if (response.status === 403) {
      return { ok: false, reason: "forbidden", detail: response.text ?? "" };
    }
    if (response.status === 404) return { ok: false, reason: "missing", detail: response.text ?? "" };
    return {
      ok: false,
      reason: "unreachable",
      detail:
        response.status === null
          ? transportDetail(response.transport)
          : `Google Sheets answered ${response.status}`,
    };
  }

  const properties = (response.json.properties ?? {}) as Record<string, unknown>;
  const title = typeof properties.title === "string" ? properties.title : "";
  const tabs = (Array.isArray(response.json.sheets) ? response.json.sheets : [])
    .map((sheet) => ((sheet as { properties?: { title?: unknown } }).properties?.title))
    .filter((name): name is string => typeof name === "string");

  const wanted = input.sheetName.trim();
  if (wanted === "") {
    return tabs[0]
      ? { ok: true, title, sheetName: tabs[0] }
      : { ok: false, reason: "no_tab", detail: "The spreadsheet has no tabs." };
  }
  // Exact first, then ignoring case — "leads" for a tab called "Leads" is a
  // typo, not a different tab, and the stored name is Google's spelling.
  const match =
    tabs.find((name) => name === wanted) ??
    tabs.find((name) => name.toLowerCase() === wanted.toLowerCase());
  return match
    ? { ok: true, title, sheetName: match }
    : { ok: false, reason: "no_tab", detail: `Tabs: ${tabs.join(", ")}` };
}

// ---------------------------------------------------------------------------
// Talking to the Sheets API
// ---------------------------------------------------------------------------

type SheetsResponse =
  | { ok: true; status: number; text: string | null; json: Record<string, unknown> }
  | {
      ok: false;
      status: number | null;
      text: string | null;
      json: Record<string, unknown>;
      transport?: unknown;
    };

async function sheetsRequest(
  doFetch: typeof fetch,
  accessToken: string,
  timeoutMs: number,
  request: { method: string; url: string; body?: unknown },
): Promise<SheetsResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(request.url, {
      method: request.method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      redirect: "manual",
      signal: controller.signal,
    });
    const text = await readCapped(response);
    let json: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(text ?? "");
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        json = parsed as Record<string, unknown>;
      }
    } catch {
      // A body that is not JSON is kept as text for the log.
    }
    return response.ok
      ? { ok: true, status: response.status, text, json }
      : { ok: false, status: response.status, text, json };
  } catch (error) {
    return { ok: false, status: null, text: null, json: {}, transport: error };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * A Sheets API failure, in the words of whoever has to fix it.
 *
 * Google's generic status codes each have one cause worth naming here, and the
 * cause decides who acts: a tab that was renamed is the customer's to rename
 * back; a sheet that was unshared is the customer's to share again; the Sheets
 * API switched off in the Cloud project is the deployment's. Google's own
 * message is kept in the response body either way.
 */
function sheetsFailure(
  response: Extract<SheetsResponse, { ok: false }>,
  context: AdapterContext,
  sheetName: string,
  requestHeaders: Record<string, string>,
): AdapterResult {
  const name = context.destinationName;

  if (response.status === null) {
    const failure = classifyTransportError(response.transport);
    return failed({
      failure,
      error: `${describeFailure(failure, name)} (${transportDetail(response.transport)})`,
      requestHeaders,
    });
  }

  const error = (response.json.error ?? {}) as Record<string, unknown>;
  const message = typeof error.message === "string" ? error.message : "";
  const base = {
    requestHeaders,
    responseStatus: response.status,
    responseBody: response.text,
  };

  if (response.status === 400 && /unable to parse range/i.test(message)) {
    return failed({
      ...base,
      failure: "configuration",
      error: `There is no tab called "${sheetName}" in that spreadsheet any more. Rename it back, or change the tab in this destination's settings, then send what was missed again from this log.`,
    });
  }

  if (response.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(response.text ?? "")) {
    return failed({
      ...base,
      failure: "configuration",
      error:
        "The Google Sheets API is switched off for this deployment's Google project, so nothing can be written. This is not anything you connected. (Self-hosting? Enable the Google Sheets API in the Cloud project that owns GOOGLE_SHEETS_CLIENT_ID.)",
    });
  }

  if (response.status === 403) {
    return failed({
      ...base,
      failure: "auth",
      error: `The Google account ${name} is connected as can no longer edit that spreadsheet — it was unshared, or made read-only. Share it back with edit access, or reconnect as an account that can edit it.`,
    });
  }

  if (response.status === 404) {
    return failed({
      ...base,
      failure: "missing",
      error: `That spreadsheet is gone — deleted, or moved somewhere the connected account cannot see. Reconnect ${name} to a spreadsheet that exists.`,
    });
  }

  const failure = classifyStatus(response.status);
  return failed({
    ...base,
    failure,
    error: message
      ? `Google Sheets answered ${response.status}: ${message.slice(0, 200)}`
      : describeFailure(failure, name),
  });
}

function failed(input: {
  failure: FailureKind;
  error: string;
  requestHeaders?: Record<string, string> | null;
  responseStatus?: number | null;
  responseBody?: string | null;
}): AdapterResult {
  return {
    ok: false,
    requestBody: null,
    requestHeaders: input.requestHeaders ?? null,
    responseStatus: input.responseStatus ?? null,
    responseBody: input.responseBody ?? null,
    error: input.error,
    failure: input.failure,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
