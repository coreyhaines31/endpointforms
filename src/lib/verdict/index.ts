/**
 * Verdict — downstream outcomes (#43).
 *
 * The first of the three wedge capabilities, and the one the other two are
 * meaningless without: Yield (#44) has nothing to weigh and Hindsight (#45) has
 * nothing to learn from until a submission can carry what it turned out to be
 * worth.
 *
 * Four pieces:
 *
 *   - `handleVerdict`   — `POST /api/v1/verdict`, the one-line outcome webhook,
 *                         and the same URL for a bulk CSV.
 *   - `createVerdictApiKey` — a revocable per-key credential (#57); `./keys.ts`
 *                         explains why it is a stored hash and what the derived
 *                         key it replaces cost.
 *   - `applyOutcomes`   — the write, workspace-scoped and idempotent.
 *   - `measureTimeToOutcome` — the honest constraint: how long this workspace
 *                         really takes to decide, and whether the loop can work
 *                         for them at all.
 *
 * No UI. These are functions for whoever owns the app surface to call.
 */

export {
  applyOutcomes,
  type ApplyResult,
  type ApplySummary,
  type MatchedBy,
  type OutcomeOutcome,
  type PendingOutcome,
  type VerdictSource,
} from "./apply.ts";
export {
  authenticateKey,
  authenticateRequest,
  type AuthenticateOptions,
  type AuthenticatedWorkspace,
} from "./auth.ts";
export {
  createVerdictApiKey,
  listVerdictApiKeys,
  MAX_LIVE_KEYS,
  readDerivedKey,
  revokeDerivedVerdictKey,
  revokeVerdictApiKey,
  TOUCH_INTERVAL_MS,
  VerdictKeyError,
  type CreatedVerdictApiKey,
  type VerdictKeyKind,
  type VerdictKeySummary,
} from "./key-store.ts";
export { isVerdictError, VerdictError, type VerdictErrorCode } from "./errors.ts";
export {
  handleVerdict,
  handleVerdictPreflight,
  handleVerdictUnsupportedMethod,
  serializeMeasurement,
} from "./handler.ts";
export {
  hashVerdictKeySecret,
  mintDerivedVerdictApiKey,
  mintStoredVerdictApiKey,
  parseVerdictApiKey,
  readApiKeyHeader,
  verdictKeySecrets,
  verifyStoredVerdictApiKey,
  verifyVerdictApiKey,
  type MintedVerdictApiKey,
  type ParsedDerivedKey,
  type ParsedStoredKey,
  type ParsedVerdictApiKey,
  type VerdictKeySecrets,
} from "./keys.ts";
export {
  DEFAULT_WINDOW_DAYS,
  measureTimeToOutcome,
  measureTimeToOutcomeIn,
  type MeasureOptions,
  type TimeToOutcomeMeasurement,
} from "./latency.ts";
export {
  knownVerdictAliases,
  normalizeVerdict,
  parseCsv,
  parseOutcome,
  VERDICTS,
  type OutcomeInput,
  type OutcomeWarning,
  type VerdictValue,
} from "./parse.ts";
export {
  checkVerdictRateLimit,
  resetVerdictRateLimits,
  verdictRateLimitError,
} from "./rate-limit.ts";
