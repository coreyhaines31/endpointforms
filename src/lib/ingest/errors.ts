/**
 * Every way a submission can be refused, with the message the customer sees.
 *
 * The rule for this file: a refusal must say what to change. "Bad request" sends
 * someone to our support inbox; "expected application/json, got text/xml" sends
 * them to their own form tag. Nothing here ever surfaces as a 500 — an
 * unhandled exception in the handler is a bug, and the handler says so.
 */

export type IngestErrorCode =
  | "endpoint_not_found"
  | "endpoint_deleted"
  | "empty_body"
  | "payload_too_large"
  | "too_many_fields"
  | "field_name_too_long"
  | "unsupported_media_type"
  | "malformed_body"
  | "schema_validation_failed"
  | "rate_limited"
  | "method_not_allowed"
  | "internal_error";

const STATUS: Record<IngestErrorCode, number> = {
  endpoint_not_found: 404,
  endpoint_deleted: 410,
  empty_body: 422,
  payload_too_large: 413,
  too_many_fields: 413,
  field_name_too_long: 422,
  unsupported_media_type: 415,
  malformed_body: 400,
  // Only reachable on an endpoint whose owner opted in to `strict`. The default
  // is `warn`, which stores the submission and never produces this at all.
  schema_validation_failed: 422,
  rate_limited: 429,
  method_not_allowed: 405,
  internal_error: 500,
};

export class IngestError extends Error {
  readonly code: IngestErrorCode;
  readonly status: number;
  /** Extra response headers, e.g. `Retry-After` on a 429. */
  readonly headers: Record<string, string>;

  constructor(code: IngestErrorCode, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.name = "IngestError";
    this.code = code;
    this.status = STATUS[code];
    this.headers = headers;
  }
}

export function isIngestError(error: unknown): error is IngestError {
  return error instanceof IngestError;
}
