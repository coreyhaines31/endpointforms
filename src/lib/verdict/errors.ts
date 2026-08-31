/**
 * Every way an outcome can be refused, with the message the caller sees.
 *
 * Same rule as `src/lib/ingest/errors.ts`: a refusal must say what to change.
 * The person reading these is a developer with a half-written Zap or a CRM
 * automation that fired once and failed, and they are reading the response body
 * in a log line. "Bad request" costs them an afternoon; "verdict must be one of
 * won, lost, disqualified, awaiting — got \"Closed Won\"" costs them a minute.
 *
 * Two codes here have no equivalent on the ingest side, and both are about the
 * key rather than the payload. They are deliberately kept apart from each other
 * in the code and deliberately collapsed in what they reveal: an unknown
 * workspace and a bad signature both answer `unauthorized`, because telling an
 * anonymous caller which slugs exist is a free enumeration oracle.
 */

export type VerdictErrorCode =
  | "unauthorized"
  | "server_not_configured"
  | "submission_not_found"
  | "invalid_request"
  | "invalid_verdict"
  | "invalid_value"
  | "invalid_currency"
  | "invalid_timestamp"
  | "empty_body"
  | "malformed_body"
  | "unsupported_media_type"
  | "payload_too_large"
  | "too_many_rows"
  | "rate_limited"
  | "method_not_allowed"
  | "internal_error";

const STATUS: Record<VerdictErrorCode, number> = {
  unauthorized: 401,
  // 503, not 500: the request was fine and retrying after the operator sets the
  // secret will work. A 500 says "we broke"; this says "we are not ready".
  server_not_configured: 503,
  submission_not_found: 404,
  invalid_request: 422,
  invalid_verdict: 422,
  invalid_value: 422,
  invalid_currency: 422,
  invalid_timestamp: 422,
  empty_body: 422,
  malformed_body: 400,
  unsupported_media_type: 415,
  payload_too_large: 413,
  too_many_rows: 413,
  rate_limited: 429,
  method_not_allowed: 405,
  internal_error: 500,
};

export class VerdictError extends Error {
  readonly code: VerdictErrorCode;
  readonly status: number;
  /** Extra response headers, e.g. `Retry-After` on a 429. */
  readonly headers: Record<string, string>;

  constructor(
    code: VerdictErrorCode,
    message: string,
    headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "VerdictError";
    this.code = code;
    this.status = STATUS[code];
    this.headers = headers;
  }
}

export function isVerdictError(error: unknown): error is VerdictError {
  return error instanceof VerdictError;
}

export function verdictErrorStatus(code: VerdictErrorCode): number {
  return STATUS[code];
}
