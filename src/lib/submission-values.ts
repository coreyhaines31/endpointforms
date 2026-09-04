/**
 * Reading a submission's values back out.
 *
 * An endpoint accepts anything posted to it, so `values` is genuinely arbitrary
 * JSON — not a shape we defined. Everything here is written for that: a nested
 * object, an array, a number, a null and a 40kB string all have to render as
 * *something* in a table cell, and none of them may throw.
 *
 * Pure and dependency-free so a Client Component can import it without pulling
 * anything server-side into the browser bundle. `../uploads/types` is the same
 * kind of module — types and predicates, no runtime imports — so naming a file
 * reference here costs the bundle nothing.
 */

import { formatBytes, isStoredFileRef } from "./uploads/types.ts";

/** Fields worth putting first in a one-line summary, in order of preference. */
const IDENTITY_KEYS = [
  "email",
  "email_address",
  "emailaddress",
  "e-mail",
  "work_email",
  "name",
  "full_name",
  "fullname",
  "first_name",
  "company",
  "phone",
];

/**
 * Fields we never surface in a summary line.
 *
 * These are plumbing that arrives in the payload alongside the answers. Leading
 * a row with `_origin_token` would be technically accurate and completely
 * useless to the person scanning the inbox for a lead.
 */
const NOISE_KEYS = new Set([
  "_origin_token",
  "_redirect",
  "_next",
  "_subject",
  "_gotcha",
  "_honey",
]);

/**
 * One scalar, as text. Objects and arrays are JSON, because half a JSON blob is
 * a lie.
 *
 * An attached file (#66) is the one object with a shape of our own making, so
 * it gets a shape of our own writing: `cv.pdf (241 kB)`. Dumping its JSON here
 * would put a signed download URL into an inbox row, a CSV cell and a summary
 * line — a credential in three places nobody meant to put one, and a cell of
 * unreadable noise where a filename belongs.
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isStoredFileRef(value)) return `${value.filename} (${formatBytes(value.size)})`;
  if (Array.isArray(value) && value.some(isStoredFileRef)) {
    return value.map(formatValue).filter((entry) => entry !== "").join(", ");
  }
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "[unreadable]";
  }
}

/** Trims to `limit` characters on a word boundary where there is one nearby. */
export function truncate(value: string, limit: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= limit) return collapsed;

  const cut = collapsed.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  // Only respect a word boundary if it is not so early that it throws away most
  // of the excerpt — a 60-character URL with no spaces should still show 60
  // characters rather than collapsing to nothing.
  return `${space > limit * 0.6 ? cut.slice(0, space) : cut}…`;
}

/**
 * The one line that stands in for a whole submission in a table row.
 *
 * Identity fields first, then whatever else was submitted, `key: value` pairs
 * separated by a middot. It is a summary and says so by truncating — the detail
 * screen has every field, in full, plus the raw body.
 */
export function summariseValues(values: Record<string, unknown>, limit = 78): string {
  const entries = orderedEntries(values);
  if (entries.length === 0) return "no fields";

  const parts: string[] = [];
  let length = 0;

  for (const [key, value] of entries) {
    const text = truncate(formatValue(value), 40);
    if (text.length === 0) continue;

    const part = `${key}: ${text}`;
    if (length + part.length > limit && parts.length > 0) {
      parts.push(`+${entries.length - parts.length} more`);
      break;
    }
    parts.push(part);
    length += part.length + 3;
  }

  return parts.length > 0 ? parts.join(" · ") : "no values";
}

/** Every field, identity first, plumbing last, ready to render in order. */
export function orderedEntries(values: Record<string, unknown>): [string, unknown][] {
  const entries = Object.entries(values);

  const rank = (key: string): number => {
    if (NOISE_KEYS.has(key)) return 3;
    const index = IDENTITY_KEYS.indexOf(key.toLowerCase());
    if (index >= 0) return index / 100;
    return 1;
  };

  return entries.sort(([a], [b]) => rank(a) - rank(b));
}

/** True for a field that is plumbing rather than an answer. Rendered, but quietly. */
export function isNoiseKey(key: string): boolean {
  return NOISE_KEYS.has(key);
}

/** `1200.00` + `USD` → `$1,200.00`, falling back to the plain number. */
export function formatMoney(value: string | null, currency: string | null): string | null {
  if (!value) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;

  if (!currency) return amount.toLocaleString("en-GB");

  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-GB")} ${currency}`;
  }
}

/**
 * Where the submission came from, in the words someone would use out loud.
 *
 * A UTM source when there is one, otherwise the referrer's hostname, otherwise
 * "direct" — which is a real answer, not a missing one.
 */
export function describeSource(row: {
  utmSource: string | null;
  utmMedium: string | null;
  referrer: string | null;
}): string {
  if (row.utmSource) {
    return row.utmMedium ? `${row.utmSource} / ${row.utmMedium}` : row.utmSource;
  }
  if (row.referrer) {
    try {
      return new URL(row.referrer).hostname.replace(/^www\./, "");
    } catch {
      return truncate(row.referrer, 32);
    }
  }
  return "direct";
}
