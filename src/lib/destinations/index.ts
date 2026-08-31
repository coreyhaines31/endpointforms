/**
 * Destinations — where the data goes (#41), and how you find out when it stops
 * (#42).
 *
 * The public surface of the delivery engine. Plain modules: no Next APIs, no
 * React, no `server-only` marker, so `tests/destinations.test.mts` and
 * `tests/destinations-db.test.mts` load them directly under `node`.
 *
 * The one thing deliberately **not** re-exported is `parseConfig`, which returns
 * a config with its secrets in it. `redactConfig` is what a page gets. Reaching
 * the unredacted one means importing `./config.ts` by name, which is visible in
 * a diff.
 */

export { ADAPTERS, ADAPTER_OPTIONS, ADAPTER_ORDER, AVAILABLE_KINDS, adapterFor, isAvailableKind } from "./adapters/index.ts";
export type { AdapterOption } from "./adapters/index.ts";

export {
  buildConfig,
  DestinationConfigError,
  maskSecret,
  redactConfig,
  type RedactedConfig,
} from "./config.ts";

export {
  deliverSubmission,
  dispatchSubmission,
  drainDispatch,
  sendTestDelivery,
  sweepDueRetries,
  type DispatchSummary,
  type TestDeliveryResult,
} from "./dispatch.ts";

export { buildPayload, sampleSource, serialisePayload } from "./payload.ts";

export {
  backoffMs,
  classifyStatus,
  classifyTransportError,
  decideRetry,
  describeFailure,
  MAX_ATTEMPTS,
  RETRY_SCHEDULE_MS,
  transportDetail,
} from "./retry.ts";

export {
  deliveryIdFor,
  HEADER_ATTEMPT,
  HEADER_DELIVERY_ID,
  HEADER_EVENT,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  newDestinationSecret,
  signPayload,
  SIGNATURE_TOLERANCE_SECONDS,
  verifySignature,
} from "./signature.ts";

export {
  createDestination,
  deleteDestination,
  getDestination,
  isUuid,
  listDeliveryAttempts,
  listDestinations,
  rawConfig,
  updateDestination,
  type DeliveryLogRow,
  type DestinationHealth,
  type DestinationListItem,
} from "./store.ts";

export {
  assertDeliverableUrl,
  DestinationUrlError,
  isDeliverableUrl,
} from "./url-guard.ts";

export type {
  Adapter,
  AdapterResult,
  DeliveryStatus,
  DestinationKind,
  FailureKind,
  PayloadSource,
  SubmissionPayload,
} from "./types.ts";
