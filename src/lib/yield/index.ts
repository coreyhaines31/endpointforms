/**
 * Yield — the quality-adjusted metric (#44).
 *
 * *"Your form isn't the endpoint. The closed deal is."* — this module is that
 * sentence as a number. Conversion rate counts submissions; Yield counts what
 * they turned out to be worth, so a form producing a hundred worthless leads
 * scores worse than one producing five good ones. Raw completion rate cannot
 * express that, which is why the category's dashboards say everything is fine.
 *
 * Four pieces:
 *
 *   - `computeYield`  — the arithmetic. Pure, no database, no clock. Read the
 *                       header of `./compute.ts` for the treatment of
 *                       unresolved submissions, which is the decision the
 *                       honesty of the whole metric rests on.
 *   - `readYield`     — the workspace-scoped read for one endpoint or a whole
 *                       workspace.
 *   - `readYieldByDimension` — the same, sliced by origin, variant, endpoint or
 *                       UTM. What Hindsight (#45) ranks on.
 *   - `./money.ts`    — `bigint` cents. No float ever touches an amount.
 *
 * **This module imports the database.** A component that needs one of these
 * shapes imports `./types.ts`, which imports nothing at runtime — same
 * arrangement as `src/lib/workspaces/types.ts`, and `eslint.config.mjs`
 * explains why.
 *
 * Nothing here renders anything. The surfaces live in
 * `src/components/app/yield-panel.tsx`.
 */

export {
  assessConfidence,
  assessMaturity,
  computeYield,
  emptyTallies,
  MIN_RESOLVED,
  wilsonInterval,
} from "./compute.ts";
export {
  centsFromNumeric,
  currencyLabel,
  divideCents,
  formatCents,
  numericFromCents,
  shareOfCents,
} from "./money.ts";
export {
  readYield,
  readYieldByDimension,
  readYieldByDimensionIn,
  readYieldIn,
  type YieldQuery,
} from "./query.ts";
export type {
  CurrencyTotal,
  Interval,
  YieldDimension,
  YieldGroup,
  YieldRate,
  YieldReport,
  YieldScope,
  YieldTallies,
  YieldTiming,
  YieldValue,
} from "./types.ts";
