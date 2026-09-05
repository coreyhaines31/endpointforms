import { ATTRIBUTION_FIELD_KEYS } from "../ingest/attribution.ts";
import { ERROR_FLAG } from "../render/flash.ts";

/**
 * The query vocabulary an embedded form speaks (#39).
 *
 * ## The constraint the whole feature is shaped by
 *
 * **An iframe cannot read its parent's URL.** Not "does not by default" —
 * cannot, at all, cross-origin, and deliberately so. `document.referrer` is
 * trimmed to a bare origin by the default `strict-origin-when-cross-origin`
 * policy, so it does not carry a query string either. Every UTM and every click
 * ID that reaches a submission from an embedded form got there because the
 * snippet on the customer's page **read them and appended them**, in script, on
 * the parent's own origin, where reading `location.search` is legal.
 *
 * Nothing about that is magic and the generated snippet says so in a comment.
 * The failure mode this protects against is the one the research behind #50
 * found: a hidden `gclid` field that posts an empty string forever because the
 * script that was supposed to fill it never ran. Here the script *is* the
 * mechanism, so if it does not run there is no field to be silently empty —
 * the form still submits, and the submission is honestly unattributed.
 *
 * ## Two namespaces, and why they can never collide
 *
 * Parameters this module owns are `ef_`-prefixed and are consumed by the page.
 * Everything else on the URL is a candidate for prefill (`./prefill.ts`) or for
 * attribution, and neither can ever set an `ef_` parameter, because those names
 * are refused as prefill targets before a field is even looked up.
 */

/** `inline` or `popup`. Present means "this page is inside somebody's site". */
export const EMBED_PARAM = "ef_embed";

/**
 * The parent page's origin, so the resize handshake has a `targetOrigin`.
 *
 * The child cannot discover this on its own — that is the whole point of the
 * origin boundary — so the snippet passes it. Passing a *wrong* one is not a
 * hole: `postMessage` refuses to deliver when the target origin does not match
 * the actual parent, so a lie costs the liar the message. The value that would
 * be a hole is `*`, and it is not accepted here or emitted anywhere.
 */
export const ORIGIN_PARAM = "ef_o";

/**
 * The parent page's full URL, which becomes the `_page_url` field on the post.
 *
 * `attribution.ts` already reads a query string out of `_page_url`, so this one
 * parameter carries every UTM and click ID the landing page had, in the form
 * they were actually in, without us re-encoding a list we would then have to
 * keep in step with theirs.
 */
export const PAGE_PARAM = "ef_page";

/**
 * Which embed on the page this frame is, so one host can carry two forms and a
 * resize message can only ever move the frame it came from.
 */
export const INSTANCE_PARAM = "ef_i";

export const EMBED_PARAMS: readonly string[] = [
  EMBED_PARAM,
  ORIGIN_PARAM,
  PAGE_PARAM,
  INSTANCE_PARAM,
];

export const EMBED_MODES = ["inline", "popup"] as const;
export type EmbedMode = (typeof EMBED_MODES)[number];

/** How long a URL we will echo into a hidden field or a `postMessage`. */
const MAX_URL_CHARS = 2048;
const MAX_ORIGIN_CHARS = 255;

/** Instance ids are minted by our own script; anything else is not one. */
const INSTANCE_ID = /^[A-Za-z0-9_-]{1,32}$/;

export type EmbedContext = {
  /** Null when this is the hosted page being viewed directly. */
  mode: EmbedMode | null;
  /** A validated `scheme://host[:port]`, or null. Never `*`, never `null`. */
  parentOrigin: string | null;
  /** The embedding page, for `_page_url`. `http`/`https` only. */
  pageUrl: string | null;
  instanceId: string | null;
};

export const NOT_EMBEDDED: EmbedContext = {
  mode: null,
  parentOrigin: null,
  pageUrl: null,
  instanceId: null,
};

/** Next hands a page `string | string[] | undefined`; only a lone string counts. */
export type Query = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  // A repeated `ef_o` is not a parameter with two values, it is somebody
  // testing what happens. Neither is used.
  return null;
}

/**
 * An origin, and *only* an origin.
 *
 * `new URL(x).origin` would happily turn `https://evil.example/path?q` into a
 * clean origin string, which is exactly the kind of helpfulness that launders a
 * malformed input into a valid-looking one. So the round trip has to be exact:
 * the string we were given must already be the origin its own parser derives.
 * `javascript:` and `data:` have an origin of `"null"` and are refused by the
 * scheme check before that ever matters.
 */
export function readOrigin(raw: string | null): string | null {
  if (!raw || raw.length > MAX_ORIGIN_CHARS) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "*" || trimmed === "null") return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.origin === trimmed ? trimmed : null;
}

/** A page URL we are willing to repeat back. Absolute, and `http`/`https`. */
export function readPageUrl(raw: string | null): string | null {
  if (!raw || raw.length > MAX_URL_CHARS) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return trimmed;
}

export function readEmbedContext(query: Query): EmbedContext {
  const rawMode = one(query[EMBED_PARAM]);
  const mode = EMBED_MODES.find((candidate) => candidate === rawMode) ?? null;
  // Nothing else is read when the page is not embedded. A parent origin on a
  // form somebody opened in a tab has no frame to talk to, and treating it as
  // meaningful would be inventing a second, weaker way to reach the same code.
  if (mode === null) return NOT_EMBEDDED;

  const instance = one(query[INSTANCE_PARAM]);

  return {
    mode,
    parentOrigin: readOrigin(one(query[ORIGIN_PARAM])),
    pageUrl: readPageUrl(one(query[PAGE_PARAM])),
    instanceId: instance !== null && INSTANCE_ID.test(instance) ? instance : null,
  };
}

// ---------------------------------------------------------------------------
// What survives the round trip
// ---------------------------------------------------------------------------

/** `UTM-Source`, `utmSource` and `utm_source` are one name. Mirrors `attribution.ts`. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, "");
}

/**
 * The attribution names worth copying onto a URL.
 *
 * Derived from `attribution.ts` rather than copied, so a click ID added there
 * starts being carried here with no second edit. The underscore-prefixed
 * control fields are dropped: `_page_url` has its own parameter and its own
 * hidden field, and putting it on a query string too would be two spellings of
 * one fact.
 */
const CARRIED_ATTRIBUTION = new Set(
  ATTRIBUTION_FIELD_KEYS.filter((key) => !key.startsWith("_")).map(normalizeKey),
);

export function isAttributionParam(name: string): boolean {
  return CARRIED_ATTRIBUTION.has(normalizeKey(name));
}

export function isEmbedParam(name: string): boolean {
  return EMBED_PARAMS.includes(name);
}

/**
 * A parameter nothing may prefill: ours, or the retry flag.
 *
 * `ERROR_FLAG` is one character (`e`), so a form with a field genuinely named
 * `e` would otherwise be prefilled by its own error redirect. That is a real
 * collision rather than a theoretical one — `flash.ts` chose a short name to
 * keep the redirect tidy — and it is cheaper to exclude it than to rename it.
 */
export function isControlParam(name: string): boolean {
  return isEmbedParam(name) || name === ERROR_FLAG;
}

const MAX_CARRIED = 25;
const MAX_CARRIED_VALUE_CHARS = 512;

/**
 * The parameters that must survive `form → submit → back to the form`.
 *
 * Two things ride along, for two different reasons:
 *
 *   - **The embed parameters**, because a validation error redirects the frame
 *     back to the form and a frame that came back un-embedded would repaint the
 *     marketing chrome inside somebody's page and stop resizing.
 *   - **The attribution parameters**, because they are the fourth source
 *     `extractAttribution` reads (the endpoint URL's own query string). Putting
 *     them on the `action` means a submission is attributed even when the
 *     hidden `_page_url` field is stripped by something in between.
 *
 * Prefill values are deliberately *not* carried. They are already in the posted
 * body as the visitor's answers by then, and re-appending them would let a
 * stale URL argue with what somebody typed.
 */
export function carriedParams(source: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  let count = 0;

  for (const [key, value] of source) {
    if (count >= MAX_CARRIED) break;
    if (!isEmbedParam(key) && !isAttributionParam(key)) continue;
    if (value === "" || value.length > MAX_CARRIED_VALUE_CHARS) continue;
    // First spelling wins, matching `FieldIndex` in `attribution.ts`.
    if (out.has(key)) continue;
    out.append(key, value);
    count++;
  }

  return out;
}

/**
 * Next's `searchParams` shape as something `URLSearchParams` will take.
 *
 * Next hands a page `Record<string, string | string[] | undefined>`, and
 * `URLSearchParams` wants pairs. A repeated parameter becomes repeated pairs
 * rather than one comma-joined value, because `?tag=a&tag=b` is two answers.
 */
export function queryEntries(query: Query): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") out.push([key, value]);
    else if (Array.isArray(value)) for (const entry of value) out.push([key, entry]);
  }
  return out;
}

/** `path` with `extra` appended, and no stray `?` when there is nothing to add. */
export function withQuery(path: string, extra: URLSearchParams): string {
  const query = extra.toString();
  return query === "" ? path : `${path}?${query}`;
}
