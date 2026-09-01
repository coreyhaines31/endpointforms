import { VerdictError, type VerdictErrorCode } from "./errors.ts";
import { MAX_CLOCK_SKEW_MS, MAX_REFERENCE_CHARS, MAX_ROWS, MAX_VALUE } from "./limits.ts";

/**
 * Reading an outcome out of whatever a customer's CRM felt like sending.
 *
 * The premise of the outcome webhook is that it is *dumber than a CRM
 * integration* — `docs/01` Risk 3: "the lower the bar, the more accounts clear
 * it". A parser that only accepts `{"verdict":"won"}` raises that bar for no
 * gain, because the field is called `Status` in HubSpot, `StageName` in
 * Salesforce, and whatever the person building the Zap typed in a spreadsheet.
 *
 * So this module is forgiving about *shape* and strict about *meaning*:
 *
 *   - Field aliases are accepted, because `deal_value` and `amount` are the same
 *     idea and refusing one of them teaches nobody anything.
 *   - Verdict aliases are accepted from a fixed, documented list — `Closed Won`
 *     means won. Anything outside the list is refused by name rather than
 *     guessed at, because silently filing an unrecognised status as `lost` would
 *     put a wrong number in front of someone making a spending decision.
 *   - What was assumed is always reported back in `warnings`, the way a schema
 *     mismatch is on the ingest path. An assumption the caller cannot see is
 *     the thing that makes a dashboard lie.
 */

export const VERDICTS = ["won", "lost", "disqualified", "awaiting"] as const;
export type VerdictValue = (typeof VERDICTS)[number];

export type OutcomeWarningCode =
  | "currency_assumed"
  | "currency_without_value"
  | "value_ignored_for_awaiting"
  | "value_rounded"
  | "matched_by_email"
  | "ambiguous_email_match";

export type OutcomeWarning = { code: OutcomeWarningCode; message: string };

/** One outcome, normalised and ready to apply. */
export type OutcomeInput = {
  /** A submission public id or internal UUID, as sent. Null when matching by email. */
  reference: string | null;
  /** Lower-cased email, used only when there is no reference. */
  email: string | null;
  verdict: VerdictValue;
  /** Exact decimal as a string — never a float. Null when cleared or absent. */
  value: string | null;
  /**
   * False when the caller said nothing about the value, in which case whatever
   * is already on the submission stays there. See `pick`.
   */
  valueProvided: boolean;
  /** ISO-4217, upper case. */
  currency: string | null;
  occurredAt: Date | null;
  warnings: OutcomeWarning[];
};

export type ParseFailure = { code: VerdictErrorCode; message: string };
export type ParseResult =
  | { ok: true; input: OutcomeInput }
  | { ok: false; error: ParseFailure };

// ---------------------------------------------------------------------------
// Field aliases
// ---------------------------------------------------------------------------

const REFERENCE_KEYS = [
  "submission_id",
  "submissionid",
  "submission",
  "id",
  "public_id",
  "publicid",
  "endpoint_submission_id",
  "reference",
];

const EMAIL_KEYS = ["email", "email_address", "emailaddress", "e_mail", "work_email", "contact_email"];

const VERDICT_KEYS = ["verdict", "outcome", "status", "result", "disposition", "stage", "stagename"];

const VALUE_KEYS = ["value", "amount", "deal_value", "dealvalue", "revenue", "deal_amount", "total"];

const CURRENCY_KEYS = ["currency", "currency_code", "currencycode", "iso_currency_code"];

const OCCURRED_AT_KEYS = [
  "occurred_at",
  "occurredat",
  "decided_at",
  "closed_at",
  "closedate",
  "close_date",
  "timestamp",
  "date",
  "verdict_at",
];

/**
 * Verdict synonyms, as they actually arrive.
 *
 * Keys are normalised: lower case, and every run of space, hyphen or underscore
 * collapsed to a single space. Adding to this list is cheap and safe; guessing
 * at something not on it is neither.
 */
const VERDICT_ALIASES: Record<string, VerdictValue> = {
  won: "won",
  win: "won",
  wins: "won",
  "closed won": "won",
  closedwon: "won",
  "close won": "won",
  "closed won deal": "won",
  "deal won": "won",
  sold: "won",
  sale: "won",
  converted: "won",
  customer: "won",
  "closed and won": "won",

  lost: "lost",
  loss: "lost",
  "closed lost": "lost",
  closedlost: "lost",
  "close lost": "lost",
  "deal lost": "lost",
  "no sale": "lost",
  "not converted": "lost",
  "closed and lost": "lost",

  disqualified: "disqualified",
  dq: "disqualified",
  unqualified: "disqualified",
  "not qualified": "disqualified",
  "not a fit": "disqualified",
  junk: "disqualified",
  spam: "disqualified",
  bogus: "disqualified",
  invalid: "disqualified",
  "bad lead": "disqualified",
  "bad fit": "disqualified",

  awaiting: "awaiting",
  "awaiting verdict": "awaiting",
  pending: "awaiting",
  open: "awaiting",
  new: "awaiting",
  "in progress": "awaiting",
  working: "awaiting",
  undecided: "awaiting",
  reset: "awaiting",
};

/** The canonical verdict for a string a CRM sent, or null if it is not one we know. */
export function normalizeVerdict(raw: unknown): VerdictValue | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (key === "") return null;
  return VERDICT_ALIASES[key] ?? null;
}

/** Every alias we accept, for the error message and for the docs. */
export function knownVerdictAliases(): string[] {
  return Object.keys(VERDICT_ALIASES);
}

// ---------------------------------------------------------------------------
// One outcome
// ---------------------------------------------------------------------------

type Record_ = Record<string, unknown>;

/**
 * Whether a field was sent, and what it was.
 *
 * The distinction matters more than it looks. A CSV whose only columns are
 * `submission_id` and `verdict` must not wipe the deal values already recorded
 * against those submissions, so a field that is simply absent — or an empty
 * cell — means *leave it alone*. An explicit JSON `null` means *clear it*,
 * because otherwise a value entered by mistake could never be removed.
 */
type Field = { present: boolean; clear: boolean; value: unknown };

const ABSENT: Field = { present: false, clear: false, value: undefined };

function pick(record: Record_, keys: string[]): Field {
  for (const key of keys) {
    if (!(key in record)) continue;
    const value = record[key];
    if (value === null) return { present: true, clear: true, value: null };
    if (value === undefined || String(value).trim() === "") continue;
    return { present: true, clear: false, value };
  }
  return ABSENT;
}

/** Lower-cases keys and collapses separators, so `Deal Value` finds `deal_value`. */
export function normalizeKeys(record: Record_): Record_ {
  const out: Record_ = {};
  for (const [key, value] of Object.entries(record)) {
    out[key.trim().toLowerCase().replace(/[\s-]+/g, "_")] = value;
    // Also index the separator-free form, so `submissionId` matches too.
    out[key.trim().toLowerCase().replace(/[\s_-]+/g, "")] = value;
  }
  return out;
}

/**
 * Normalises one outcome.
 *
 * Returns a failure rather than throwing, because a bulk upload has to report
 * row 47 as bad and still apply rows 1 to 46. The single-outcome path turns a
 * failure into a `VerdictError` at the edge.
 */
export function parseOutcome(raw: Record_): ParseResult {
  const record = normalizeKeys(raw);
  const warnings: OutcomeWarning[] = [];

  const referenceField = pick(record, REFERENCE_KEYS);
  const emailField = pick(record, EMAIL_KEYS);

  let reference: string | null = null;
  if (referenceField.present && !referenceField.clear) {
    reference = String(referenceField.value).trim();
    if (reference.length > MAX_REFERENCE_CHARS) {
      return fail(
        "invalid_request",
        `submission_id is ${reference.length} characters; a submission id is 16 characters (or a 36-character UUID).`,
      );
    }
  }

  let email: string | null = null;
  if (emailField.present && !emailField.clear) {
    email = String(emailField.value).trim().toLowerCase();
    if (email.length > 320 || !email.includes("@")) email = null;
  }

  if (!reference && !email) {
    return fail(
      "invalid_request",
      "No submission_id. Send the submission id you were handed when the lead arrived, or an email address to match on.",
    );
  }

  const verdictField = pick(record, VERDICT_KEYS);
  const verdictRaw = verdictField.value;
  if (!verdictField.present || verdictField.clear) {
    return fail(
      "invalid_verdict",
      `No verdict. Send one of ${VERDICTS.join(", ")}.`,
    );
  }

  const verdict = normalizeVerdict(verdictRaw);
  if (!verdict) {
    return fail(
      "invalid_verdict",
      `${JSON.stringify(String(verdictRaw))} is not a verdict we recognise. Send one of ${VERDICTS.join(", ")} — common CRM wordings like "Closed Won" and "Unqualified" are accepted too.`,
    );
  }

  const valueField = pick(record, VALUE_KEYS);
  const valueResult = parseValue(valueField.clear ? null : valueField.value);
  if (!valueResult.ok) return { ok: false, error: valueResult.error };
  let value = valueResult.value;
  let valueProvided = valueField.present;
  if (valueResult.rounded) {
    warnings.push({
      code: "value_rounded",
      message: `Value was rounded to ${value} — verdict_value stores two decimal places.`,
    });
  }

  const currencyField = pick(record, CURRENCY_KEYS);
  let currency: string | null = null;
  if (currencyField.present && !currencyField.clear) {
    const code = String(currencyField.value).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      return fail(
        "invalid_currency",
        `${JSON.stringify(String(currencyField.value))} is not a three-letter ISO-4217 currency code. Send e.g. "USD", "GBP", "EUR".`,
      );
    }
    currency = code;
  }

  if (value !== null && valueProvided && currency === null) {
    // Assumed rather than refused: making a Zap fail over a missing currency
    // costs us the outcome, and the outcome is the thing we exist to collect.
    // The assumption is stated in the response so it can be corrected.
    currency = DEFAULT_CURRENCY;
    warnings.push({
      code: "currency_assumed",
      message: `No currency was sent, so this value is recorded as ${DEFAULT_CURRENCY}. Send a "currency" field to record it as something else.`,
    });
  }

  if (value === null && currency !== null) {
    warnings.push({
      code: "currency_without_value",
      message: "A currency was sent with no value, so no amount was recorded.",
    });
    currency = null;
  }

  if (verdict === "awaiting" && value !== null && valueProvided) {
    warnings.push({
      code: "value_ignored_for_awaiting",
      message:
        "Awaiting means this submission has no outcome yet, so the value and currency were cleared rather than stored.",
    });
    value = null;
    valueProvided = true;
    currency = null;
  }

  const occurredField = pick(record, OCCURRED_AT_KEYS);
  const occurredResult = parseOccurredAt(occurredField.clear ? null : occurredField.value);
  if (!occurredResult.ok) return { ok: false, error: occurredResult.error };

  return {
    ok: true,
    input: {
      reference: reference || null,
      email: reference ? null : email,
      verdict,
      value,
      valueProvided,
      currency,
      occurredAt: occurredResult.value,
      warnings,
    },
  };
}

/**
 * The currency assumed when a value arrives without one.
 *
 * A default that is wrong for a customer is visible and correctable; a refusal
 * is an outcome we never hear about. `VERDICT_DEFAULT_CURRENCY` exists so a
 * non-USD deployment is not permanently annotating its own data with a warning.
 */
const DEFAULT_CURRENCY = normalizeDefaultCurrency(process.env.VERDICT_DEFAULT_CURRENCY);

function normalizeDefaultCurrency(configured: string | undefined): string {
  if (!configured) return "USD";
  const code = configured.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    console.warn(
      `[verdict] VERDICT_DEFAULT_CURRENCY=${JSON.stringify(configured)} is not a three-letter code; using USD.`,
    );
    return "USD";
  }
  return code;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

type ValueResult =
  | { ok: true; value: string | null; rounded: boolean }
  | { ok: false; error: ParseFailure };

/**
 * A monetary amount, as an exact decimal string.
 *
 * Never routed through a float: `numeric(18, 2)` exists precisely so that
 * 18400.10 is 18400.10 and not 18400.099999999999, and parsing with `Number`
 * on the way in would throw that away before the column ever saw it. So the
 * digits are handled as text and rounded as text.
 */
export function parseValue(raw: unknown): ValueResult {
  if (raw === undefined || raw === null) return { ok: true, value: null, rounded: false };

  let text = String(raw).trim();
  if (text === "") return { ok: true, value: null, rounded: false };

  // `$18,400.00`, `18 400`, `USD 18400`, `1.8e4`. Symbols and thousands
  // separators are stripped; an exponent is refused, because a spreadsheet that
  // exported `1.8e4` has already lost precision somewhere upstream and we
  // should say so rather than quietly agree with it.
  if (/e/i.test(text) && /^[\d.,\s+-]*e/i.test(text)) {
    return {
      ok: false,
      error: {
        code: "invalid_value",
        message: `${JSON.stringify(text)} is in exponent notation. Send the amount in full, e.g. 18400.00.`,
      },
    };
  }

  text = text.replace(/[^\d.,+-]/g, "");

  text = normalizeSeparators(text);

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    return {
      ok: false,
      error: {
        code: "invalid_value",
        message: `${JSON.stringify(String(raw))} is not a number. Send the deal value as a plain amount, e.g. 18400 or 18400.00.`,
      },
    };
  }

  const [, sign, wholeRaw, fractionRaw] = match;
  if (sign === "-") {
    return {
      ok: false,
      error: {
        code: "invalid_value",
        message: "A deal value cannot be negative. Send the amount the deal was worth, or omit it.",
      },
    };
  }

  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const fraction = fractionRaw ?? "";

  if (whole.replace(/^0+/, "").length > 15) {
    return { ok: false, error: overLimit(String(raw)) };
  }

  const { value, rounded } = roundToCents(whole, fraction);

  if (Number(value) > MAX_VALUE) {
    return { ok: false, error: overLimit(String(raw)) };
  }

  return { ok: true, value, rounded };
}

/**
 * Which of `.` and `,` was the decimal point.
 *
 * `18.400,50` and `18,400.50` are the same amount written by two continents, and
 * getting this wrong scales a deal by a thousand. The rules, in order:
 *
 *   - Both separators present: the **last** one is the decimal point. This is
 *     unambiguous and needs no convention.
 *   - Repeated separators (`1.234.567`): thousands, whichever character it is.
 *   - One comma with exactly three digits after it (`18,400`): thousands. No
 *     currency in circulation has three decimal places in a deal value.
 *   - One dot: the decimal point. `0.005` is a number; reading it as a
 *     thousands separator would turn it into 5.
 *
 * The remaining ambiguity is a lone `18.400` meaning eighteen thousand four
 * hundred to a European sender. It is read as 18.40, and the response says the
 * value was rounded — so it is visible rather than silent, which is the most
 * this can honestly do without asking.
 */
function normalizeSeparators(text: string): string {
  const commas = (text.match(/,/g) ?? []).length;
  const dots = (text.match(/\./g) ?? []).length;

  if (commas > 0 && dots > 0) {
    return text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  }

  if (commas > 1) return text.replace(/,/g, "");
  if (dots > 1) return text.replace(/\./g, "");

  if (commas === 1) {
    return /,\d{3}$/.test(text) ? text.replace(",", "") : text.replace(",", ".");
  }

  return text;
}

function overLimit(raw: string): ParseFailure {
  return {
    code: "invalid_value",
    message: `${JSON.stringify(raw)} is larger than ${MAX_VALUE.toLocaleString("en-US")}. A number that big is usually a mis-read column rather than a deal.`,
  };
}

/** Half-up rounding done on the digit string, so no float is involved. */
function roundToCents(whole: string, fraction: string): { value: string; rounded: boolean } {
  if (fraction.length <= 2) {
    return { value: `${whole}.${fraction.padEnd(2, "0")}`, rounded: false };
  }

  const keep = fraction.slice(0, 2);
  const roundUp = Number(fraction[2]) >= 5;
  if (!roundUp) return { value: `${whole}.${keep}`, rounded: true };

  // BigInt, not Number: `numeric(18, 2)` holds sixteen digits before the point,
  // and the carry on a value that long is exactly where a float would start
  // inventing pennies. A product about what a lead was worth cannot round money
  // through binary floating point.
  const carried = (BigInt(whole + keep) + 1n).toString().padStart(3, "0");
  return {
    value: `${carried.slice(0, -2)}.${carried.slice(-2)}`,
    rounded: true,
  };
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

type TimeResult = { ok: true; value: Date | null } | { ok: false; error: ParseFailure };

const EARLIEST = Date.UTC(2000, 0, 1);

/**
 * When the outcome was decided, if the caller said.
 *
 * This matters more than it looks: `verdict_at` minus `submitted_at` is the
 * time-to-outcome the product uses to tell a workspace whether this loop can
 * work for them at all (`./latency.ts`). A CRM backfilling six months of
 * history with today's timestamp would make a slow funnel look instant, which
 * is exactly the lie the tool at `/tools/time-to-outcome-calculator` exists to
 * refuse. Sending the real close date is the difference.
 */
export function parseOccurredAt(raw: unknown, now: number = Date.now()): TimeResult {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { ok: true, value: null };
  }

  let ms: number;

  if (typeof raw === "number" || /^\d{9,14}$/.test(String(raw).trim())) {
    const numeric = Number(raw);
    // Seconds until about the year 5138, then milliseconds.
    ms = numeric < 100_000_000_000 ? numeric * 1000 : numeric;
  } else {
    ms = Date.parse(String(raw).trim());
  }

  if (!Number.isFinite(ms)) {
    return {
      ok: false,
      error: {
        code: "invalid_timestamp",
        message: `${JSON.stringify(String(raw))} is not a date we can read. Send an ISO-8601 timestamp, e.g. 2026-08-30T14:05:00Z.`,
      },
    };
  }

  if (ms > now + MAX_CLOCK_SKEW_MS) {
    return {
      ok: false,
      error: {
        code: "invalid_timestamp",
        message: `${new Date(ms).toISOString()} is in the future. An outcome cannot be decided before it happens; check the timezone on the sending system.`,
      },
    };
  }

  if (ms < EARLIEST) {
    return {
      ok: false,
      error: {
        code: "invalid_timestamp",
        message: `${new Date(ms).toISOString()} is before this product existed, which usually means a date field arrived empty or in a format we misread.`,
      },
    };
  }

  return { ok: true, value: new Date(ms) };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export type CsvTable = { headers: string[]; rows: Record<string, string>[] };

/**
 * RFC 4180, plus the two things spreadsheets actually do: a UTF-8 BOM from
 * Excel, and `\r\n` line endings. Semicolon-delimited exports (the European
 * Excel default) are detected from the header row, because a file where every
 * row is one column is a file that would otherwise fail with a confusing
 * message about a missing verdict.
 */
export function parseCsv(text: string): CsvTable {
  const body = text.replace(/^﻿/, "");
  if (body.trim() === "") {
    throw new VerdictError("empty_body", "The CSV is empty. Send a header row and at least one outcome.");
  }

  const delimiter = detectDelimiter(body);
  const grid = parseGrid(body, delimiter);

  const headerRow = grid.shift();
  if (!headerRow) {
    throw new VerdictError("malformed_body", "The CSV has no header row.");
  }

  const headers = headerRow.map((header) => header.trim());
  if (!headers.some((header) => header !== "")) {
    throw new VerdictError("malformed_body", "The CSV's first row is blank; it should name the columns.");
  }

  const rows: Record<string, string>[] = [];
  for (const cells of grid) {
    // A trailing newline produces one empty row; so does a blank line in the
    // middle of a file someone edited by hand. Neither is an error.
    if (cells.every((cell) => cell.trim() === "")) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header === "") return;
      row[header] = (cells[index] ?? "").trim();
    });
    rows.push(row);

    if (rows.length > MAX_ROWS) {
      throw new VerdictError(
        "too_many_rows",
        `This file has more than ${MAX_ROWS.toLocaleString("en-US")} rows. Split it and post each part; every row is a lookup and a write, and one very long transaction is how an upload times out halfway through.`,
      );
    }
  }

  if (rows.length === 0) {
    throw new VerdictError("empty_body", "The CSV has a header row and no outcomes under it.");
  }

  return { headers, rows };
}

function detectDelimiter(body: string): string {
  const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (semicolons > commas && semicolons >= tabs) return ";";
  if (tabs > commas && tabs > semicolons) return "\t";
  return ",";
}

function parseGrid(body: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];

    if (quoted) {
      if (char === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.trim() === "") {
      quoted = true;
      field = "";
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char === "\r") continue;

    field += char;
  }

  row.push(field);
  rows.push(row);

  return rows;
}

function fail(code: VerdictErrorCode, message: string): ParseResult {
  return { ok: false, error: { code, message } };
}
