/**
 * Hindsight — split tests scored on outcomes (#45).
 *
 * *"Your form isn't the endpoint. The closed deal is."* Every other form
 * builder's A/B test ranks variants on the submit event, because the submit
 * event is the last thing it can observe. The variant that collects more
 * submissions wins, even when those submissions are junk. This module ranks
 * variants on Yield — what the submissions turned out to be worth — which means
 * the answer is not available at the moment the test would like to give it.
 *
 * Four pieces:
 *
 *   - `./assign.ts`  — which arm a visitor sees. Pure, deterministic, sticky
 *                      without a database. Read the header for the hazard it
 *                      cannot fix and who does.
 *   - `./compare.ts` — the decision. Pure, no database, no clock beyond the
 *                      `now` it is handed. **Read this one.** Four of its six
 *                      states decline to name a winner, and the reasoning for
 *                      each is the feature.
 *   - `./query.ts`   — the workspace-scoped read that turns rows into the
 *                      shape `computeHindsight` takes.
 *   - `./store.ts`   — creating, starting and stopping a test, and counting an
 *                      exposure. Holds the invariant that a running test's arms
 *                      cannot be edited.
 *   - `./serve.ts`   — which arm a visitor gets, for the form page and the
 *                      submit route. The submit path re-derives the arm rather
 *                      than being told it, so it cannot be forged.
 *   - `./visitor.ts` — the sticky key, and why it is a random cookie rather
 *                      than a fingerprint.
 *
 * **`./query.ts` and `./store.ts` import the database.** A component that needs
 * one of these shapes imports `./types.ts`, which imports nothing at runtime —
 * same arrangement as `src/lib/yield/`, and `eslint.config.mjs` explains why.
 *
 * Nothing here renders anything. The surfaces live in
 * `src/components/app/hindsight-panel.tsx`.
 */

export {
  assignVariant,
  bucketFor,
  hashToUnitInterval,
  plannedShares,
  readVisitorKey,
} from "./assign.ts";
export {
  computeHindsight,
  decideState,
  MIN_DETECTABLE_LIFT,
  MIN_RESOLVED_SHARE,
  rankingRate,
  rankingTrials,
  sampleRatioCheck,
} from "./compare.ts";
export {
  listSplitTests,
  readRunningTest,
  readSplitTest,
  readSplitTestIn,
  type HindsightQuery,
} from "./query.ts";
export { resolveVariant, type ServedVariant } from "./serve.ts";
export {
  newVisitorKey,
  VISITOR_COOKIE,
  VISITOR_COOKIE_MAX_AGE_SECONDS,
  visitorCookieOptions,
} from "./visitor.ts";
export {
  createSplitTest,
  readSplitTestStatus,
  recordExposure,
  SplitTestStoreError,
  startSplitTest,
  stopSplitTest,
  type CreatedSplitTest,
  type CreateSplitTestInput,
} from "./store.ts";
export type {
  Comparison,
  HindsightInput,
  HindsightReport,
  HindsightState,
  HindsightTiming,
  RankingBasis,
  Requirement,
  SplitTestDefinition,
  SplitTestStatus,
  VariantArm,
  VariantDefinition,
  VariantExposure,
} from "./types.ts";
