import { eq } from "drizzle-orm";

import { unsafeDb } from "../../db/client.ts";
import { workspaces } from "../../db/schema.ts";
import { clientIp } from "../ingest/client.ts";
import { VerdictError } from "./errors.ts";
import {
  findVerdictApiKeyByPublicId,
  touchDerivedVerdictKey,
  touchVerdictApiKey,
} from "./key-store.ts";
import {
  parseVerdictApiKey,
  readApiKeyHeader,
  verdictKeySecrets,
  verifyStoredVerdictApiKey,
  verifyVerdictApiKey,
} from "./keys.ts";

/**
 * Turning a request into a workspace, or into a 401.
 *
 * This is the only place in the outcome path that touches the database outside
 * a `withWorkspace` transaction, and it is the legitimate case for it: the
 * question "which workspace is this?" cannot itself be asked inside a scope
 * keyed on the answer. `workspaces` is not a workspace-scoped table and carries
 * no row-level security policy, exactly as the auth layer's own membership
 * lookup does not. `verdict_api_keys` does carry one, and its permissive
 * `app_current_workspace_id() IS NULL` branch is what lets this single read
 * happen before a scope exists — see the policy in `drizzle/0008`.
 *
 * Everything downstream of here runs inside `withWorkspace(workspaceId, …)`, so
 * a mistake in this function is the only way a key for one workspace could
 * reach another's rows. That is why it returns an id and nothing else: there is
 * no path from here to a query, only to a scope.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REVOCATION (#57)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Both key formats are checked for revocation, and the check is here rather
 * than in `./keys.ts` for a reason worth stating: revocation is not a property
 * of a key, it is a fact about a row. A verification function that returned
 * true for a mathematically valid key and left the caller to remember the
 * second lookup is a function that will eventually be called by somebody who
 * forgets. So the only exported way to authenticate a request does both, and
 * `verifyVerdictApiKey` cannot on its own admit anyone.
 */

export type AuthenticatedWorkspace = {
  workspaceId: string;
  slug: string;
};

export type AuthenticateOptions = {
  /** The caller's address, recorded against the key. Read from headers when omitted. */
  ip?: string | null;
  now?: Date;
};

export async function authenticateRequest(
  request: Request,
  options: AuthenticateOptions = {},
): Promise<AuthenticatedWorkspace> {
  return authenticateKey(readApiKeyHeader(request.headers), {
    ip: options.ip ?? clientIp(request.headers),
    now: options.now,
  });
}

export async function authenticateKey(
  raw: string | null,
  options: AuthenticateOptions = {},
): Promise<AuthenticatedWorkspace> {
  const parsed = parseVerdictApiKey(raw);
  if (!parsed) {
    throw unauthorized(
      raw
        ? "That is not a valid outcome API key. Expected a key of the form efv2.<id>.<secret> in the Authorization header."
        : "No API key. Send your workspace's outcome key as `Authorization: Bearer efv2.<id>.<secret>`.",
    );
  }

  return parsed.kind === "stored"
    ? authenticateStored(parsed, options)
    : authenticateDerived(parsed, options);
}

/**
 * A stored `efv2` key.
 *
 * Notice what is *not* consulted: `VERDICT_API_KEY_SECRET`. A stored key is a
 * random secret checked against its own hash, so it is not forgeable whether or
 * not the deployment ever set that variable — which means a self-hosted install
 * that never configures one still has a working outcome webhook. The 503 below
 * belongs to the derived key alone, because it is the derived key that would be
 * *guessable* without a secret, and that was always the reason for it.
 */
async function authenticateStored(
  parsed: Extract<ReturnType<typeof parseVerdictApiKey>, { kind: "stored" }>,
  options: AuthenticateOptions,
): Promise<AuthenticatedWorkspace> {
  const row = await findVerdictApiKeyByPublicId(parsed.publicId);

  // An unknown handle and a wrong secret answer identically, for the same
  // reason an unknown slug and a bad MAC always have.
  if (!row) throw unauthorized(BAD_KEY);
  if (!verifyStoredVerdictApiKey(parsed, row.secretHash)) throw unauthorized(BAD_KEY);

  // Said plainly, and deliberately not folded into the generic refusal. The
  // holder of a revoked key already had the key, so naming its state reveals
  // nothing they did not have; what it does is turn a mystifying 401 in a CRM's
  // log into a sentence that names the cause and the fix. Guessing a live
  // handle to learn "that one is revoked" would take 12 characters of a
  // 64-symbol alphabet, and would learn a fact worth nothing.
  if (row.revokedAt) throw revoked(REVOKED_STORED);

  await touch(touchVerdictApiKey(row.id, options.ip ?? null, options.now));

  return { workspaceId: row.workspaceId, slug: row.workspaceSlug };
}

/** A legacy `efv1` key: HMAC over the workspace id, plus the per-tenant kill switch. */
async function authenticateDerived(
  parsed: Extract<ReturnType<typeof parseVerdictApiKey>, { kind: "derived" }>,
  options: AuthenticateOptions,
): Promise<AuthenticatedWorkspace> {
  const secrets = verdictKeySecrets();
  if (!secrets) {
    throw new VerdictError(
      "server_not_configured",
      "This deployment has no VERDICT_API_KEY_SECRET set, so legacy efv1 keys cannot be verified. Set it, or create an efv2 key in workspace settings — those need no server secret. Nothing was recorded.",
    );
  }

  const [workspace] = await unsafeDb
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      derivedKeyRevokedAt: workspaces.derivedKeyRevokedAt,
    })
    .from(workspaces)
    .where(eq(workspaces.slug, parsed.slug))
    .limit(1);

  // An unknown workspace and a bad signature answer identically. Distinguishing
  // them would let anyone enumerate which workspaces exist by watching which
  // slugs 404 and which 401.
  if (!workspace) throw unauthorized(BAD_KEY);
  if (!verifyVerdictApiKey(parsed, workspace, secrets)) throw unauthorized(BAD_KEY);
  if (workspace.derivedKeyRevokedAt) throw revoked(REVOKED_DERIVED);

  await touch(touchDerivedVerdictKey(workspace.id, options.now));

  return { workspaceId: workspace.id, slug: workspace.slug };
}

/**
 * Bookkeeping that must never cost an accepted outcome.
 *
 * **Awaited, and its failure swallowed.** The tempting version fires this
 * without awaiting, on the grounds that an accepted request should not wait for
 * its own audit trail — and it is wrong twice. On a serverless runtime a
 * promise still pending when the response is returned may simply be killed, so
 * "fire and forget" quietly becomes "forget", and the column that #57 exists to
 * populate would be empty for most of the traffic it is meant to describe. It
 * also makes the behaviour untestable: an assertion about a write that races
 * the assertion is an assertion about timing.
 *
 * Awaiting costs one indexed statement — the same order as the lookup that
 * authenticated the request, and on all but one request per
 * `TOUCH_INTERVAL_MS` it matches no row, so it writes nothing and locks
 * nothing. The `catch` is what keeps the original promise: an outcome that was
 * accepted is never lost to record-keeping about the thing that reported it.
 */
async function touch(work: Promise<unknown>): Promise<void> {
  await work.catch(() => {});
}

const BAD_KEY =
  "That API key is not valid for this deployment. Keys are per workspace; check you are sending the key for the workspace whose submissions you are grading.";

const REVOKED_STORED =
  "That outcome API key has been revoked and will not be accepted again. Create a new key in workspace settings and update whatever is calling this.";

const REVOKED_DERIVED =
  "This workspace's legacy outcome key has been revoked. Create a key in workspace settings — the new format can be revoked on its own, so you will not have to do this again.";

function unauthorized(message: string): VerdictError {
  return new VerdictError("unauthorized", message, {
    "www-authenticate": 'Bearer realm="endpointforms", charset="UTF-8"',
  });
}

function revoked(message: string): VerdictError {
  return new VerdictError("key_revoked", message, {
    "www-authenticate": 'Bearer realm="endpointforms", charset="UTF-8", error="invalid_token"',
  });
}
