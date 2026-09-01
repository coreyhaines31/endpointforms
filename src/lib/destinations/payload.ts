import type { PayloadSource, SubmissionPayload } from "./types.ts";

/**
 * The payload, and the sample used by "Send a test".
 *
 * Built in one place because the shape is a **public contract** — somebody
 * else's integration parses it, and a field that appears only on some
 * deliveries is a field their code crashes on. So every key below is always
 * present, and a value we do not have is `null` rather than absent. `values` is
 * the only open-ended object, because it is the customer's own form.
 *
 * The test payload and the real one come out of the same function for the same
 * reason: a "send a test" that produces a different shape from the real thing is
 * a test that proves nothing, and it is the single most common way an
 * integration passes its setup and fails its first lead.
 */

export function buildPayload(
  source: PayloadSource,
  delivery: { id: string; attempt: number; sentAt: Date; test: boolean },
): SubmissionPayload {
  return {
    type: "submission.created",
    delivery: {
      id: delivery.id,
      attempt: delivery.attempt,
      sentAt: delivery.sentAt.toISOString(),
      test: delivery.test,
    },
    endpoint: {
      id: source.endpointPublicId,
      name: source.endpointName,
    },
    submission: {
      id: source.submissionPublicId,
      submittedAt: source.submittedAt.toISOString(),
      origin: source.origin,
      originReasons: source.originReasons,
      verdict: source.verdict,
      verdictValue: source.verdictValue,
      verdictCurrency: source.verdictCurrency,
      values: source.values,
      attribution: {
        utmSource: source.utmSource,
        utmMedium: source.utmMedium,
        utmCampaign: source.utmCampaign,
        utmTerm: source.utmTerm,
        utmContent: source.utmContent,
        clickIds: source.clickIds,
        referrer: source.referrer,
      },
      schemaVersionId: source.schemaVersionId,
    },
  };
}

/**
 * A realistic submission, for a delivery nobody actually filled in.
 *
 * Marked `test: true` in the payload and `id: "sub_test…"`, so a receiver that
 * wants to ignore it can, and a receiver that does not ignore it writes one
 * obviously-fake row rather than a plausible fake lead that someone then calls.
 * The origin is `unverified` on purpose: nobody proved anything about this one,
 * and stamping it `human` would be the product lying on its own demo.
 */
export function sampleSource(endpoint: {
  publicId: string;
  name: string;
}): PayloadSource {
  return {
    endpointPublicId: endpoint.publicId,
    endpointName: endpoint.name,
    submissionPublicId: "sub_test_0000000",
    submittedAt: new Date(),
    origin: "unverified",
    originReasons: [
      {
        code: "surface",
        direction: "neither",
        observed: "test delivery",
        weight: 0,
        note: "Sent by the Send a test button. Nobody submitted this form.",
      },
    ],
    verdict: "awaiting",
    verdictValue: null,
    verdictCurrency: null,
    values: {
      name: "Test Delivery",
      email: "test@endpointforms.com",
      company: "Endpoint Forms",
      note: "This is a test delivery. No one submitted this form.",
    },
    utmSource: "endpointforms",
    utmMedium: "test",
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    clickIds: {},
    referrer: null,
    schemaVersionId: null,
  };
}

/**
 * The payload as bytes, exactly once.
 *
 * The signature covers these bytes, so they must be serialised once and reused
 * — signing `JSON.stringify(payload)` and then sending a second
 * `JSON.stringify(payload)` is a signature that verifies only for as long as
 * two calls happen to agree, which is until someone adds a `Set` to the shape.
 */
export function serialisePayload(payload: SubmissionPayload): string {
  return JSON.stringify(payload);
}
