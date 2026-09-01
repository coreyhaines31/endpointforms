import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The per-workspace API key that authenticates an outcome (#43).
 *
 * ## Why the key is derived rather than stored
 *
 * `workspaces` has no key column, and #43 is explicit that the data model is
 * not to grow one for this. So the key is not a secret we generate and keep —
 * it is a **message authentication code over the workspace id**, computed on
 * demand from one server-side secret:
 *
 *     efv1.<workspace-slug>.<mac>
 *     mac = base64url(HMAC-SHA256(VERDICT_API_KEY_SECRET, "efv1:" + workspaceId))
 *
 * Minting and verifying are the same computation. Nothing is written down, so
 * there is no table to leak, nothing to migrate, and no hash to compare against.
 * The slug rides along in the clear purely as a lookup handle: it says which
 * workspace to fetch the id of, and the MAC — which is over the **id**, not the
 * slug — is what proves the holder was issued a key for that workspace. A key
 * cannot be pointed at another workspace by editing the slug in it, because the
 * MAC would then be checked against a different id and fail.
 *
 * ## What this costs, stated plainly
 *
 * 1. **Rotation is all-or-nothing.** Revoking one workspace's key means
 *    changing `VERDICT_API_KEY_SECRET`, which invalidates every workspace's key
 *    at once. `VERDICT_API_KEY_SECRET_PREVIOUS` makes that survivable — both are
 *    accepted on verify, only the current one is minted from — but it is a
 *    fleet-wide rotation, not a per-tenant one. A stored key with its own
 *    `revoked_at` is the real answer and it needs the column that #43 rules out.
 * 2. **Renaming a workspace invalidates its key**, because the slug no longer
 *    resolves. That is the honest behaviour rather than a bug: the slug is
 *    documented as effectively permanent (it is the render subdomain), and a
 *    key that silently followed a rename would be a key nobody could reason
 *    about.
 * 3. **There is no per-key audit trail.** Every caller holding a workspace's key
 *    is indistinguishable from every other. `verdict_source` records that an
 *    outcome came in by webhook, not who sent it.
 *
 * ## Why a missing secret is fatal here
 *
 * `src/lib/origin/token.ts` falls back to a built-in secret when its env var is
 * unset, and is right to: a forgeable origin token is a weaker *signal*, and
 * refusing the submission would lose a lead. This key grants **write access to
 * another company's data**. A built-in fallback would mean anyone who read this
 * file could mint a key for any workspace on any deployment that forgot to set
 * the variable. So outside development the route refuses to authenticate at all
 * (503, `server_not_configured`) rather than accepting a guessable key.
 */

const VERSION = "efv1";

/** Development and test only — never reachable in production; see `secrets()`. */
const DEV_SECRET = "endpointforms-verdict-key-dev-only";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;
const MAC = /^[A-Za-z0-9_-]{43}$/;

export type VerdictKeySecrets = {
  /** Keys are minted from this one. */
  current: string;
  /** Still accepted on verify, so a rotation does not break live integrations. */
  previous: string | null;
};

/**
 * The secrets in force, or null when this deployment has none configured.
 *
 * Null is not an error here — it is the caller's job to turn it into the 503,
 * so that a test can exercise the unconfigured case without setting env vars
 * and every other caller gets the same refusal.
 */
export function verdictKeySecrets(): VerdictKeySecrets | null {
  const current = process.env.VERDICT_API_KEY_SECRET;
  const previous = process.env.VERDICT_API_KEY_SECRET_PREVIOUS || null;

  if (current) return { current, previous };

  // `next build` and `next dev` both set NODE_ENV; plain node running the tests
  // sets nothing, which is the development case too.
  if (process.env.NODE_ENV === "production") return null;

  return { current: DEV_SECRET, previous };
}

function mac(workspaceId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${VERSION}:${workspaceId}`).digest("base64url");
}

/**
 * The key for one workspace.
 *
 * Deterministic: calling this twice returns the same string, which is what
 * makes "show me my key" a computation rather than a stored secret.
 */
export function mintVerdictApiKey(
  workspace: { id: string; slug: string },
  secrets: VerdictKeySecrets | null = verdictKeySecrets(),
): string | null {
  if (!secrets) return null;
  return `${VERSION}.${workspace.slug}.${mac(workspace.id, secrets.current)}`;
}

export type ParsedVerdictApiKey = { slug: string; mac: string };

/**
 * Splits a key into its parts without checking anything cryptographic.
 *
 * Separate from verification because resolving the slug needs a database round
 * trip, and there is no reason to open a connection for a string that is not
 * even shaped like a key.
 */
export function parseVerdictApiKey(raw: string | null | undefined): ParsedVerdictApiKey | null {
  if (!raw) return null;

  const token = raw.trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [version, slug, signature] = parts;
  if (version !== VERSION) return null;
  if (!slug || !SLUG.test(slug)) return null;
  if (!signature || !MAC.test(signature)) return null;

  return { slug, mac: signature };
}

/**
 * Whether this key was issued for this workspace.
 *
 * Constant-time, and tries the previous secret only after the current one has
 * failed, so an in-flight rotation costs one extra HMAC and nothing else.
 */
export function verifyVerdictApiKey(
  parsed: ParsedVerdictApiKey,
  workspace: { id: string; slug: string },
  secrets: VerdictKeySecrets | null = verdictKeySecrets(),
): boolean {
  if (!secrets) return false;
  // The caller looked the workspace up *by* the slug in the key, so this can
  // only differ if that lookup was case-insensitive or fuzzy. Refuse rather
  // than assume.
  if (parsed.slug !== workspace.slug) return false;

  if (equals(parsed.mac, mac(workspace.id, secrets.current))) return true;
  if (secrets.previous && equals(parsed.mac, mac(workspace.id, secrets.previous))) return true;
  return false;
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // `timingSafeEqual` throws on a length mismatch, which would itself leak the
  // length. Both sides are fixed-width base64url here, so an unequal length is
  // already a malformed key rather than a near miss.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * The key out of an `Authorization: Bearer …` header, or the `X-Api-Key` header.
 *
 * Both are supported because the two clients this has to serve do not overlap:
 * a CRM's webhook builder usually offers a free-form header, while Zapier's
 * generic webhook action makes `Authorization` the path of least resistance.
 * Neither should be a support ticket.
 */
export function readApiKeyHeader(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (authorization) {
    const match = /^bearer\s+(.+)$/i.exec(authorization.trim());
    if (match) return match[1].trim();
    // A bare key in `Authorization` with no scheme is a common enough mistake
    // that guessing right is kinder than a 401 the sender cannot explain.
    return authorization.trim();
  }

  const apiKey = headers.get("x-api-key");
  if (apiKey) return apiKey.trim();

  return null;
}
