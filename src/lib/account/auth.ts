import { findVerdictApiKeyByPublicId, touchVerdictApiKey } from "../verdict/key-store.ts";
import { parseVerdictApiKey, readApiKeyHeader, verifyStoredVerdictApiKey } from "../verdict/keys.ts";

export { readApiKeyHeader };
import { hasScope, type Scope } from "./scopes.ts";

/**
 * Authenticating a key on the account MCP server (#128).
 *
 * Same keys as the outcome API — `efv2.<id>.<secret>`, one table, one hash,
 * one revocation — read for a different question: not "which workspace are
 * these outcomes for?" but "which workspace may this caller manage, and how?".
 *
 * The legacy `efv1` key is refused here. It is derived from a server secret,
 * has no row to carry scopes on, and was only ever an outcome key; extending it
 * to manage endpoints would hand a new power to a key format that is being
 * retired.
 */

export type AccountCaller = {
  keyId: string;
  workspaceId: string;
  workspaceSlug: string;
  scopes: string[];
  /** Who minted the key — used as the default notification address. */
  createdByUserId: string | null;
};

export class AccountAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountAuthError";
  }
}

const NO_KEY =
  "This tool needs an API key. Call start_signup and verify_signup to get one, then send it as `Authorization: Bearer efv2.<id>.<secret>`.";
const BAD_KEY = "That API key is not valid for this deployment. Check you are sending the whole key, efv2.<id>.<secret>.";
const LEGACY_KEY =
  "Legacy efv1 keys can only record outcomes. Use an efv2 key — verify_signup returns one, or create one in workspace settings.";
const REVOKED =
  "That API key has been revoked and will not be accepted again. Get a new one with start_signup and verify_signup, or in workspace settings.";

export async function authenticateAccountKey(
  raw: string | null,
  options: { ip?: string | null; now?: Date } = {},
): Promise<AccountCaller> {
  if (!raw) throw new AccountAuthError(NO_KEY);

  const parsed = parseVerdictApiKey(raw);
  if (!parsed) throw new AccountAuthError(BAD_KEY);
  if (parsed.kind === "derived") throw new AccountAuthError(LEGACY_KEY);

  const row = await findVerdictApiKeyByPublicId(parsed.publicId);
  if (!row || !verifyStoredVerdictApiKey(parsed, row.secretHash)) {
    throw new AccountAuthError(BAD_KEY);
  }
  if (row.revokedAt) throw new AccountAuthError(REVOKED);

  await touchVerdictApiKey(row.id, options.ip ?? null, options.now).catch(() => {});

  return {
    keyId: row.id,
    workspaceId: row.workspaceId,
    workspaceSlug: row.workspaceSlug,
    scopes: row.scopes,
    createdByUserId: row.createdByUserId,
  };
}

export function requireScope(caller: AccountCaller, scope: Scope): void {
  if (!hasScope(caller.scopes, scope)) {
    throw new AccountAuthError(
      `This key does not have the ${scope} scope. Its scopes are: ${caller.scopes.join(", ") || "none"}.`,
    );
  }
}
