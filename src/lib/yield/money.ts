/**
 * Money, as integer cents in a `bigint`. Never a float.
 *
 * `submissions.verdict_value` is `numeric(18, 2)` and reaches us as a string
 * for exactly this reason — the verdict work (#43) already refused to let a
 * deal value become a double, and a metric *about* what a lead was worth cannot
 * be the place that gives that up. `0.1 + 0.2` is the whole argument: a product
 * whose pitch is "the dashboard is lying to you" does not get to report
 * $70,049.999999999.
 *
 * So every amount in `src/lib/yield` is a `bigint` of cents from the moment it
 * leaves the database until the moment it is formatted for a screen, and there
 * is no `Number()` anywhere on that path. Division rounds half away from zero,
 * once, at the end.
 *
 * Cents rather than a decimal string because the arithmetic Yield needs is
 * addition and division by a count, and `bigint` does both exactly with no
 * library. Two decimal places is what the column stores, so nothing is lost:
 * this representation is exactly as precise as the source of truth and no more,
 * which is the honest amount of precision to carry.
 */

/** ISO-4217 is three letters. Anything else would make `Intl` throw. */
const CURRENCY_CODE = /^[A-Z]{3}$/;

/** What we print when a value was recorded without a currency beside it. */
const NO_CURRENCY = "unspecified currency";

/**
 * A `numeric` string from Postgres as integer cents, or null when it is not a
 * number we can read.
 *
 * Null is deliberately not zero. A value we cannot parse is a value we do not
 * know, and the callers here report the difference rather than quietly adding
 * nothing to a total — see `talliesFrom` in `./query.ts`, which turns a null
 * here into a visible note instead of a silently smaller number.
 */
export function centsFromNumeric(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return null;

  const [, sign, whole, fraction = ""] = match;
  const cents = BigInt(whole) * 100n + BigInt(padFraction(fraction));
  // `numeric(18, 2)` cannot carry a third decimal place, so this only fires for
  // a value that reached the column by some other route. Rounding it beats
  // dropping it, and beats truncating it towards zero for the same reason a
  // bank statement rounds.
  const rounded = fraction.length > 2 && Number(fraction[2]) >= 5 ? cents + 1n : cents;
  return sign === "-" ? -rounded : rounded;
}

function padFraction(fraction: string): string {
  return fraction.length >= 2 ? fraction.slice(0, 2) : fraction.padEnd(2, "0");
}

/** Cents back to the decimal string the column holds. Exact, never a float. */
export function numericFromCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/**
 * `numerator / denominator`, rounded half away from zero, in cents.
 *
 * Null when the denominator is zero — the same contract as `ratio()` in
 * `src/lib/tools/engine.ts`, and for the same reason: dividing by no
 * submissions has no answer, and inventing one is how `Infinity` reaches a
 * screen. Nothing in this file can return `NaN` or `Infinity`, because `bigint`
 * has neither.
 */
export function divideCents(numerator: bigint, denominator: bigint): bigint | null {
  if (denominator === 0n) return null;
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (2n * n + d) / (2n * d);
  return negative ? -quotient : quotient;
}

/**
 * A share of a total, as a plain number in 0..1, for a progress bar or a
 * percentage.
 *
 * The only place cents become a float, and it is safe because the answer is a
 * ratio bounded by 1 rather than an amount. Nothing derived from this is ever
 * printed as money.
 */
export function shareOfCents(part: bigint, total: bigint): number | null {
  if (total === 0n) return null;
  // Scaled integer division first, so the float only ever sees four digits.
  const scaled = divideCents(part * 10_000n, total);
  if (scaled === null) return null;
  const share = Number(scaled) / 10_000;
  return Number.isFinite(share) ? share : null;
}

/**
 * Cents as money on a screen.
 *
 * Formats from the exact decimal *string*, not from a `Number`: `Intl`'s
 * string input (ES2023) is precise past 2^53, so a total that overflows a
 * double still prints the digits the database holds.
 */
export function formatCents(
  cents: bigint | null | undefined,
  currency: string | null,
  options: { decimals?: 0 | 2 } = {},
): string {
  if (cents === null || cents === undefined) return "—";
  const decimals = options.decimals ?? 2;
  // `Intl`'s string input is what keeps this exact past 2^53. The cast is safe
  // by construction: `numericFromCents` only ever emits `-?digits.dd`, which is
  // what `StringNumericLiteral` describes — TypeScript just cannot see it.
  const amount = numericFromCents(cents) as `${number}`;

  if (currency !== null && CURRENCY_CODE.test(currency)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  }

  // No currency recorded, or something that is not a currency code. Print the
  // number and say what we do not know, rather than assuming dollars — an
  // assumed currency is a wrong number wearing a right one's clothes.
  const plain = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  return `${plain} ${currency === null ? NO_CURRENCY : currency}`;
}

/** How a currency is named in a sentence. */
export function currencyLabel(currency: string | null): string {
  return currency === null ? NO_CURRENCY : currency;
}
