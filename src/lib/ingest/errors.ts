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
  | "file_too_large"
  | "too_many_files"
  | "file_type_not_allowed"
  | "uploads_not_configured"
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
  // The three upload refusals (#66). Every one of them refuses the *whole*
  // submission rather than dropping the file and keeping the rest, and that is
  // deliberate: a browser form post is answered with a redirect to a thank-you
  // page, which has nowhere to carry "we kept your message but binned your CV".
  // A refusal the submitter can read and act on beats a success that lied.
  file_too_large: 413,
  too_many_files: 413,
  file_type_not_allowed: 415,
  // 503, not 500: nothing is broken, this deployment has not switched uploads
  // on. `Retry-After` is deliberately absent — retrying will not help.
  uploads_not_configured: 503,
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
