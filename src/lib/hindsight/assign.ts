import type { VariantDefinition } from "./types.ts";

/**
 * Which variant a visitor gets (#45).
 *
 * Three properties, and the whole file exists to hold all three at once:
 *
 * 1. **Deterministic.** The same visitor and the same test always produce the
 *    same arm. No random number, no stored assignment, no lookup — so a visitor
 *    who returns a week later on the same device sees the same form, and the
 *    submission that eventually arrives belongs to the arm that produced it.
 * 2. **Sticky without a database.** The assignment is a pure function of the
 *    test id and a visitor key, so the serving path never writes a row to
 *    remember it. The only thing that has to persist is the visitor key itself,
 *    which is a cookie.
 * 3. **Weighted.** A test can run 90/10 while a change is being watched.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HAZARD THIS FUNCTION CANNOT FIX, AND WHO HAS TO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Hashing a visitor into a bucket is stable for a *fixed* set of variants. Add
 * a third arm, or change a weight, and the bucket boundaries move: some
 * visitors who were seeing A start seeing B, having already been counted under
 * A. Their exposures sit in one arm and their submissions in another, and the
 * test is quietly corrupted in a way no number on the panel would reveal.
 *
 * There is no clever hash that avoids this — moving a boundary moves whoever
 * was standing on it. So it is fixed one level up instead: `./store.ts` refuses
 * to add, remove or reweight a variant on a test that is not a draft. A running
 * test's arms are frozen, and changing them means starting a new test. That
 * restriction is the reason this function is allowed to be as simple as it is.
 *
 * The remaining honest gap is the visitor key. A cookie is per browser, so the
 * same person on a phone and a laptop is two visitors and can see both arms.
 * That is normal for every split test ever run and it does not bias the
 * comparison — both arms get the same kind of visitor twice — but it does mean
 * "visitors" is really "browsers", and the panel says so rather than implying a
 * headcount we do not have.
 */

/** How finely traffic can be divided. 10,000 buckets is a weight of 0.01%. */
const BUCKETS = 10_000;

/**
 * FNV-1a, 32-bit.
 *
 * Not a cryptographic hash and it does not need to be: nothing here is secret,
 * and an attacker who computes their own bucket learns which form they will be
 * shown, which they can also learn by loading the page. What it does need is to
 * be *stable* — the same string must produce the same number in this process,
 * in a test, in a year, and on whatever runtime this ends up deployed to. A
 * hand-written integer hash is the only way to promise that; `crypto` would
 * work too but drags a Node import into a function that is otherwise pure and
 * runs identically everywhere.
 *
 * The mixing is poor by cryptographic standards and fine by this one. The
 * distribution is asserted in `tests/hindsight.test.mts` over ten thousand
 * synthetic visitors rather than assumed.
 */
export function hashToUnitInterval(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    // The FNV prime, as shifts, because `hash * 16777619` overflows a double
    // into imprecision and `Math.imul` is the same thing spelled longer.
    hash = Math.imul(hash, 0x01000193);
  }
  // `>>> 0` makes it unsigned; the division lands it in [0, 1).
  return (hash >>> 0) / 0x100000000;
}

/**
 * The bucket a visitor falls in for one test, 0..BUCKETS-1.
 *
 * The test id is part of the hashed string so a visitor is not correlated
 * across tests — someone who lands in the bottom 10% of one test is not
 * systematically in the bottom 10% of the next, which would turn two
 * independent experiments into one.
 */
export function bucketFor(testId: string, visitorKey: string): number {
  const unit = hashToUnitInterval(`${testId}:${visitorKey}`);
  const bucket = Math.floor(unit * BUCKETS);
  // `unit` is strictly below 1 so this cannot exceed the last bucket, but the
  // clamp costs nothing and a float that surprises us here would silently
  // assign every edge case to no variant at all.
  return Math.min(BUCKETS - 1, Math.max(0, bucket));
}

/**
 * The variant this visitor sees, or null when the test has no usable arms.
 *
 * Variants are sorted by id before the weights are laid out, so the ordering of
 * the array the caller happened to pass in cannot change who sees what. Two
 * callers reading the same rows in a different order must assign identically or
 * stickiness is a fiction.
 *
 * A weight of zero is honoured: the arm exists, is shown to nobody, and still
 * reports whatever it collected before the weight was set. Non-finite or
 * negative weights are read as zero rather than throwing, because this runs on
 * the request path for a form somebody paid for traffic to, and the worst
 * outcome here is a form that fails to render.
 */
export function assignVariant<T extends VariantDefinition>(
  testId: string,
  variants: readonly T[],
  visitorKey: string,
): T | null {
  const ordered = [...variants].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const weights = ordered.map((variant) => safeWeight(variant.weight));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  if (ordered.length === 0) return null;

  // Every weight zero, or every weight junk. Rather than showing nobody
  // anything, fall back to an even split: a test that stops rendering a form is
  // a worse failure than a test whose weights were misconfigured.
  const effective = total > 0 ? weights : ordered.map(() => 1);
  const effectiveTotal = total > 0 ? total : ordered.length;

  const bucket = bucketFor(testId, visitorKey);
  let boundary = 0;

  for (let index = 0; index < ordered.length; index++) {
    // Integer arithmetic on the boundary, so a variant's share is the same
    // number of buckets on every machine. Accumulating floats would put an
    // arm's edge a bucket to the left on one runtime and the right on another,
    // which is a stickiness bug that only appears in production.
    boundary += Math.floor((effective[index] * BUCKETS) / effectiveTotal);
    if (bucket < boundary) return ordered[index];
  }

  // Rounding down each boundary leaves up to `ordered.length - 1` buckets at
  // the top unclaimed. They go to the last arm rather than to nobody.
  return ordered[ordered.length - 1];
}

/** The share of traffic each arm should receive, 0..1, in the order given. */
export function plannedShares(variants: readonly VariantDefinition[]): number[] {
  const weights = variants.map((variant) => safeWeight(variant.weight));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return variants.map(() => (variants.length > 0 ? 1 / variants.length : 0));
  return weights.map((weight) => weight / total);
}

function safeWeight(weight: number): number {
  if (!Number.isFinite(weight) || weight < 0) return 0;
  return Math.trunc(weight);
}

/**
 * A visitor key from a cookie value, or null when there is nothing usable.
 *
 * Deliberately strict about what it accepts. The key is concatenated into a
 * hash and never into SQL or HTML, so a hostile value cannot escape anywhere —
 * but a caller that accepts anything will eventually be handed a megabyte of
 * junk by a crawler and hash all of it on the request path.
 */
export function readVisitorKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 64) return null;
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}
