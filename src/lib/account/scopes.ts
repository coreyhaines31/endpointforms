/**
 * What an API key may do (#128).
 *
 * Every key that existed before scopes was an outcome key, and the column
 * default is `outcomes:write`, so those keep doing exactly what they did. A key
 * minted by an agent through the account MCP server gets all four, because the
 * person who verified the code is the workspace's owner and an agent setting up
 * a form needs the whole loop: create an endpoint, mint a key for the CRM, grade
 * the outcomes.
 *
 * `submissions:read` and `submissions:write` (#133) are separate from the
 * endpoint scopes because submissions are end-user PII: a key that can set up
 * a form should not, by that fact alone, be able to read every lead it ever
 * received. A key minted before they existed does not get them retroactively;
 * a new `verify_signup` does.
 */
export const SCOPES = [
  "endpoints:read",
  "endpoints:write",
  "keys:write",
  "outcomes:write",
  "submissions:read",
  "submissions:write",
] as const;

export type Scope = (typeof SCOPES)[number];

export const OUTCOME_SCOPES: readonly Scope[] = ["outcomes:write"];

export const ALL_SCOPES: readonly Scope[] = SCOPES;

export function isScope(value: unknown): value is Scope {
  return typeof value === "string" && (SCOPES as readonly string[]).includes(value);
}

export function hasScope(granted: readonly string[], needed: Scope): boolean {
  return granted.includes(needed);
}

/**
 * The scopes a key may hand to a key it mints: only ones it holds itself.
 * Otherwise `keys:write` would be a ladder to every other scope.
 */
export function grantableScopes(
  requested: readonly Scope[],
  granted: readonly string[],
): { ok: true; scopes: Scope[] } | { ok: false; missing: Scope[] } {
  const missing = requested.filter((scope) => !granted.includes(scope));
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, scopes: [...new Set(requested)] };
}
