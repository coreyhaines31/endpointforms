import type { AccountCaller } from "../account/auth.ts";
import { hasScope, type Scope } from "../account/scopes.ts";

/**
 * The agent API core (#133): what every surface shares.
 *
 * REST (`/api/v1`), the account MCP server (`/api/mcp`) and the `endpointforms`
 * CLI (which calls REST) all reach endpoints, forms and submissions through the
 * functions in this directory, and only through them. Each takes an
 * `ApiContext` whose `caller` is an authenticated key, and **the workspace id
 * is read from that caller and nowhere else** — no function here accepts a
 * workspace id, a slug or an internal row id as an argument. Objects are named
 * by their public ids, and each lookup runs inside `withWorkspace()`, so another
 * workspace's id is the same `not_found` as an id that never existed.
 *
 * Scopes are checked here too, not in the surfaces, so a new surface cannot
 * forget them.
 *
 * Plain functions, no Next APIs and relative imports, so the tests drive the
 * real thing under `node`.
 */

export type ApiContext = {
  caller: AccountCaller;
  /** e.g. `endpointforms.app`. */
  renderDomain?: string;
  /** e.g. `https://app.endpointforms.com`. */
  appUrl?: string;
  now?: Date;
};

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "rate_limited";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  conflict: 409,
  rate_limited: 429,
};

/**
 * An error a caller can act on. `message` always says what to change, and is
 * safe to show: it never carries submitted values.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: ApiErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function requireApiScope(ctx: ApiContext, scope: Scope): void {
  if (!hasScope(ctx.caller.scopes, scope)) {
    throw new ApiError(
      "forbidden",
      `This key does not have the ${scope} scope. Its scopes are: ${ctx.caller.scopes.join(", ") || "none"}.`,
      { required_scope: scope },
    );
  }
}

export function renderDomainOf(ctx: ApiContext): string {
  return ctx.renderDomain ?? process.env.NEXT_PUBLIC_RENDER_DOMAIN ?? "endpointforms.app";
}

export function appUrlOf(ctx: ApiContext): string {
  return ctx.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://app.endpointforms.com";
}

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** Public ids are nanoid-shaped. Anything else cannot match a row, so it is a 404 early. */
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function publicIdArg(value: unknown, what: "endpoint" | "submission"): string {
  if (typeof value !== "string" || !PUBLIC_ID.test(value.trim())) {
    throw new ApiError("not_found", `No ${what} with that id in this workspace.`);
  }
  return value.trim();
}
