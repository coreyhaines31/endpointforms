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
 *   - `mintVerdictApiKey` — the per-workspace key, derived rather than stored;
 *                         `./keys.ts` explains why and what it costs.
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
export { authenticateKey, authenticateRequest, type AuthenticatedWorkspace } from "./auth.ts";
export { isVerdictError, VerdictError, type VerdictErrorCode } from "./errors.ts";
export {
  handleVerdict,
  handleVerdictPreflight,
  handleVerdictUnsupportedMethod,
  serializeMeasurement,
} from "./handler.ts";
export {
  mintVerdictApiKey,
  parseVerdictApiKey,
  readApiKeyHeader,
  verdictKeySecrets,
  verifyVerdictApiKey,
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
