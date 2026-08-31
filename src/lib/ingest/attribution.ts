import type { JsonValue } from "./body.ts";
import { sanitizeString } from "./body.ts";

/**
 * Where a lead came from.
 *
 * The research behind #50 found that the most common attribution failure is not
 * a missing integration — it is a **hidden click-ID field that posts an empty
 * string**. Someone adds `<input type="hidden" name="gclid">`, the script that
 * was supposed to populate it never runs on that page, and every lead arrives
 * with `gclid=""`. Nothing errors. The attribution is simply gone.
 *
 * So this module never treats "the field exists" as "the field is populated",
 * and it reads from four independent places, in order:
 *
 *   1. The payload's own fields, in any casing or separator style.
 *   2. The query string of a `_page_url` field, when the form sends one.
 *   3. The query string of the `Referer` header.
 *   4. The query string of the endpoint URL itself, so
 *      `action=".../e/abc?utm_source=newsletter"` works with no hidden fields.
 *
 * A blank value at any level falls through to the next. Getting a click ID from
 * a broken hidden field and a working referrer is the whole point.
 *
 * Note on (3): browsers send a full `Referer` for same-origin posts, but the
 * default `strict-origin-when-cross-origin` policy trims it to the bare origin
 * cross-origin. It is a genuine rescue for a form on the same site as the
 * landing page, and not one otherwise — which is why the snippet we hand people
 * should include `_page_url`.
 */

export type Attribution = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  clickIds: Record<string, string>;
  referrer: string | null;
  userAgent: string | null;
  /**
   * Payload keys that were lifted into the columns above and should not also be
   * repeated in `values`. Nothing is lost: every one of them has a dedicated
   * home on the row, and `raw_body` still holds the payload verbatim.
   */
  consumedKeys: string[];
};

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

/**
 * Click IDs we recognise by name.
 *
 * The list is generous on purpose. An unrecognised one is not lost — it stays
 * an ordinary field in `values` — but a recognised one lands in `click_ids`
 * where the inbox and #44 can find it without knowing the customer's form.
 */
const CLICK_ID_KEYS = [
  "gclid", // Google Ads
  "gbraid", // Google, web-to-app
  "wbraid", // Google, app-to-web
  "dclid", // Google Display
  "fbclid", // Meta
  "msclkid", // Microsoft Advertising
  "ttclid", // TikTok
  "li_fat_id", // LinkedIn
  "twclid", // X
  "rdt_cid", // Reddit
  "epik", // Pinterest
  "irclickid", // Impact
  "sccid", // Snapchat
  "obclid", // Outbrain
  "tblci", // Taboola
] as const;

/** The page the form was on, when the form bothers to tell us. */
const PAGE_URL_KEYS = ["_page_url", "_url", "page_url", "pageurl"] as const;

/** An explicit referrer field, which we consume only when it is underscore-prefixed. */
const REFERRER_KEYS = ["_referrer", "_referer", "referrer", "referer"] as const;

/**
 * Every payload key the endpoint lifts onto a column of its own.
 *
 * Exported for #51's HTML import: a hidden `<input name="gclid">` is real and
 * useful markup, but it is not a field of the form in any sense a schema should
 * describe — it lands in `click_ids`, never in `values`, so a schema field for
 * it would describe something that is never there.
 */
export const ATTRIBUTION_FIELD_KEYS = [
  ...UTM_KEYS,
  ...CLICK_ID_KEYS,
  ...PAGE_URL_KEYS,
  ...REFERRER_KEYS,
] as const;

const MAX_PARAM_CHARS = 512;
const MAX_URL_CHARS = 2048;
const MAX_USER_AGENT_CHARS = 1024;

/** `UTM-Source` and `utmSource` and `utm_source` are the same field. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, "");
}

/**
 * A case- and separator-insensitive view over the payload, built once.
 *
 * Exact matches win over normalised ones, so a form that posts both
 * `utm_source` and `utmSource` gets the one it literally named.
 */
class FieldIndex {
  private readonly exact = new Map<string, JsonValue>();
  private readonly normalized = new Map<string, { key: string; value: JsonValue }>();

  constructor(values: Record<string, JsonValue>) {
    for (const key of Object.keys(values)) {
      const value = values[key];
      this.exact.set(key, value);
      const normal = normalizeKey(key);
      // First writer wins, so a later `UTM_SOURCE` cannot displace `utm_source`.
      if (!this.normalized.has(normal)) this.normalized.set(normal, { key, value });
    }
  }

  /**
   * The field, if the payload has one under any spelling of this name.
   *
   * `value` is null when the field exists but is blank — the broken-hidden-field
   * case. That distinction matters twice: a blank must not beat a working
   * fallback, and the key must still be treated as ours so an empty `gclid=`
   * does not show up in the inbox as one of the customer's fields.
   */
  lookup(name: string): { key: string; value: string | null } | null {
    const direct = this.exact.get(name);
    const found =
      direct !== undefined ? { key: name, value: direct } : this.normalized.get(normalizeKey(name));
    if (!found) return null;
    return { key: found.key, value: scalarToString(found.value) };
  }
}

/**
 * Attribution values are scalars. An array (a repeated hidden field) takes its
 * first non-blank entry; an object is not an attribution value at all.
 */
function scalarToString(value: JsonValue): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = scalarToString(entry);
      if (found !== null) return found;
    }
  }
  return null;
}

function clamp(value: string | null, max: number): string | null {
  if (value === null) return null;
  const cleaned = sanitizeString(value).trim();
  if (cleaned === "") return null;
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

/** Parses a URL only if it is one; a hidden field full of junk yields nothing. */
function queryOf(candidate: string | null): URLSearchParams | null {
  if (!candidate) return null;
  try {
    return new URL(candidate).searchParams;
  } catch {
    return null;
  }
}

export type AttributionInput = {
  values: Record<string, JsonValue>;
  /** The request headers, for `Referer`, `Origin` and `User-Agent`. */
  headers: Headers;
  /** The endpoint URL as posted to, including its own query string. */
  requestUrl: string;
};

export function extractAttribution({ values, headers, requestUrl }: AttributionInput): Attribution {
  const fields = new FieldIndex(values);
  const consumed = new Set<string>();

  /**
   * The payload field's value, or null if it is missing or blank.
   *
   * A field that exists is consumed either way. An empty `gclid=` is still our
   * field — it belongs in `click_ids` or nowhere, not in the inbox as a blank
   * column the customer has to explain.
   */
  const fromPayload = (name: string): string | null => {
    const found = fields.lookup(name);
    if (!found) return null;
    consumed.add(found.key);
    return found.value;
  };

  // The page the form was on, from the form's own hint. Consumed: it is
  // metadata we asked for, not one of the customer's fields.
  let pageUrl: string | null = null;
  for (const key of PAGE_URL_KEYS) {
    pageUrl = pageUrl ?? fromPayload(key);
  }

  const refererHeader = clamp(headers.get("referer"), MAX_URL_CHARS);

  const queries = [
    queryOf(pageUrl),
    queryOf(refererHeader),
    queryOf(requestUrl),
  ].filter((q): q is URLSearchParams => q !== null);

  /** Payload first, then each query string in turn. Blank never wins. */
  const resolve = (name: string): string | null => {
    const payload = fromPayload(name);
    if (payload) return payload;
    for (const query of queries) {
      for (const [key, value] of query) {
        if (normalizeKey(key) !== normalizeKey(name)) continue;
        const trimmed = value.trim();
        if (trimmed !== "") return trimmed;
      }
    }
    return null;
  };

  const utm: Record<string, string | null> = {};
  for (const key of UTM_KEYS) {
    utm[key] = clamp(resolve(key), MAX_PARAM_CHARS);
  }

  const clickIds: Record<string, string> = {};
  for (const key of CLICK_ID_KEYS) {
    const value = clamp(resolve(key), MAX_PARAM_CHARS);
    if (value) clickIds[key] = value;
  }

  // Referrer. An underscore-prefixed field is ours and is consumed; a bare
  // `referrer` field is the customer's own and is read without being removed,
  // because deleting a field someone deliberately named would surprise them.
  let referrer: string | null = null;
  for (const key of REFERRER_KEYS) {
    if (referrer) break;
    const found = fields.lookup(key);
    if (!found) continue;
    if (key.startsWith("_")) consumed.add(found.key);
    referrer = found.value;
  }
  referrer = referrer ?? pageUrl ?? refererHeader ?? clamp(headers.get("origin"), MAX_URL_CHARS);

  return {
    utmSource: utm.utm_source ?? null,
    utmMedium: utm.utm_medium ?? null,
    utmCampaign: utm.utm_campaign ?? null,
    utmTerm: utm.utm_term ?? null,
    utmContent: utm.utm_content ?? null,
    clickIds,
    referrer: clamp(referrer, MAX_URL_CHARS),
    userAgent: clamp(headers.get("user-agent"), MAX_USER_AGENT_CHARS),
    consumedKeys: [...consumed],
  };
}
