import { eq } from "drizzle-orm";

import { unsafeDb } from "../../db/client.ts";
import { workspaces } from "../../db/schema.ts";
import { VerdictError } from "./errors.ts";
import {
  parseVerdictApiKey,
  readApiKeyHeader,
  verdictKeySecrets,
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
 * lookup does not.
 *
 * Everything downstream of here runs inside `withWorkspace(workspaceId, …)`, so
 * a mistake in this function is the only way a key for one workspace could
 * reach another's rows. That is why it returns an id and nothing else: there is
 * no path from here to a query, only to a scope.
 */

export type AuthenticatedWorkspace = {
  workspaceId: string;
  slug: string;
};

export async function authenticateRequest(request: Request): Promise<AuthenticatedWorkspace> {
  return authenticateKey(readApiKeyHeader(request.headers));
}

export async function authenticateKey(raw: string | null): Promise<AuthenticatedWorkspace> {
  const secrets = verdictKeySecrets();
  if (!secrets) {
    throw new VerdictError(
      "server_not_configured",
      "This deployment has no VERDICT_API_KEY_SECRET set, so outcome keys cannot be verified. Set it and retry; nothing was recorded.",
    );
  }

  const parsed = parseVerdictApiKey(raw);
  if (!parsed) {
    throw unauthorized(
      raw
        ? "That is not a valid outcome API key. Expected a key of the form efv1.<workspace>.<signature> in the Authorization header."
        : "No API key. Send your workspace's outcome key as `Authorization: Bearer efv1.<workspace>.<signature>`.",
    );
  }

  const [workspace] = await unsafeDb
    .select({ id: workspaces.id, slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.slug, parsed.slug))
    .limit(1);

  // An unknown workspace and a bad signature answer identically. Distinguishing
  // them would let anyone enumerate which workspaces exist by watching which
  // slugs 404 and which 401.
  if (!workspace) throw unauthorized(BAD_KEY);
  if (!verifyVerdictApiKey(parsed, workspace, secrets)) throw unauthorized(BAD_KEY);

  return { workspaceId: workspace.id, slug: workspace.slug };
}

const BAD_KEY =
  "That API key is not valid for this deployment. Keys are per workspace; check you are sending the key for the workspace whose submissions you are grading.";

function unauthorized(message: string): VerdictError {
  return new VerdictError("unauthorized", message, {
    "www-authenticate": 'Bearer realm="endpointforms", charset="UTF-8"',
  });
}
