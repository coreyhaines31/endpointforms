import { clientFingerprint, observe, payloadHash, type VelocityObservation } from "./velocity.ts";

/**
 * One call for the ingest path (#31).
 *
 * `velocity.ts` is deliberately three small primitives so it can be tested by
 * walking a clock. This is the single call the submission handler makes, which
 * keeps the wiring in `src/lib/ingest/handler.ts` down to one line and keeps
 * the hashing decisions — what counts as the same payload, what counts as the
 * same client — in this directory rather than in the handler.
 *
 * Hashed on the **stripped** values, so our own decoys and reserved fields do
 * not enter the payload fingerprint. Otherwise a blast that filled the decoy
 * would fingerprint differently from the same blast that did not, and the
 * duplicate signal would miss exactly the traffic it is aimed at.
 */
export function observeVelocity(input: {
  endpointId: string;
  values: Record<string, unknown>;
  ipHash: string | null;
  userAgent: string | null;
  now?: number;
}): VelocityObservation {
  return observe({
    endpointId: input.endpointId,
    contentHash: payloadHash(input.values),
    fingerprint: clientFingerprint(input.endpointId, input.ipHash, input.userAgent),
    clientKey: input.ipHash,
    now: input.now,
  });
}
