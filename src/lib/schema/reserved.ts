import { ATTRIBUTION_FIELD_KEYS } from "../ingest/attribution.ts";
import { IDEMPOTENCY_FIELD_KEYS } from "../ingest/limits.ts";
import { REDIRECT_FIELD_KEYS } from "../ingest/respond.ts";
import { STEP_FIELD_KEYS } from "../steps/format.ts";

/**
 * Field names the endpoint consumes before `values` is written.
 *
 * These are not fields of the customer's form in any sense a schema should
 * describe. A hidden `gclid` input lands in `click_ids`; `_next` becomes a
 * redirect. Either would look permanently *missing* to a validator reading
 * `values`, so importing one into a schema would manufacture a warning on every
 * single submission.
 *
 * The lists live with the code that consumes them, so this stays a view rather
 * than a second copy that drifts — and each is matched exactly the way its own
 * consumer matches it. Attribution is case- and separator-insensitive
 * (`utmSource` and `utm_source` are one field); the underscore-prefixed control
 * fields are matched literally, so a customer's own `redirect` field is theirs.
 */
const EXACT = new Set<string>([
  ...IDEMPOTENCY_FIELD_KEYS,
  ...REDIRECT_FIELD_KEYS,
  // The multi-step flow's navigation fields (#37). Here for the same reason the
  // redirect fields are: the ingest path strips them, so a schema that declared
  // one would describe a field the validator can only ever see as missing.
  ...STEP_FIELD_KEYS,
]);

/** Mirrors `normalizeKey` in `attribution.ts`. */
function normalize(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, "");
}

const NORMALIZED_ATTRIBUTION = new Set(ATTRIBUTION_FIELD_KEYS.map(normalize));

export function isReservedFieldName(name: string): boolean {
  return EXACT.has(name) || NORMALIZED_ATTRIBUTION.has(normalize(name));
}

export const RESERVED_FIELD_NAMES: readonly string[] = [
  ...EXACT,
  ...ATTRIBUTION_FIELD_KEYS,
];
