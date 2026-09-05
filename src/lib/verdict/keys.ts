import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { newVerdictKeyPublicId } from "../../db/ids.ts";

/**
 * The API keys that authenticate an outcome (#43, #57).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO FORMATS, AND WHY BOTH ARE STILL HERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `efv2.<public-id>.<secret>` — **the current one.** 256 bits of randomness,
 * stored as a SHA-256 hash in `verdict_api_keys`, with a row that carries a
 * label, a creation time, a last-used time and a `revoked_at` that verification
 * checks. A workspace may hold several at once, which is what makes rotating
 * one a thing a customer can do without an outage: mint the new key, move the
 * CRM over, revoke the old one, in that order, with both live in between.
 *
 * `efv1.<slug>.<mac>` — **the derived one, kept alive for keys already in the
 * wild.** Everything below the fold describes it. It is no longer minted for
 * anything new and the settings page presents it as legacy, but a customer who
 * wired it into a CRM eighteen months ago is exactly the customer this product
 * is for, and silently 401ing them to tidy up an implementation is not a
 * trade this feature is allowed to make. It gained the one thing #57 says it
 * must have — a kill switch that is not fleet-wide — through
 * `workspaces.derived_key_revoked_at`, checked on every verification.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE NEW ONE IS STORED RATHER THAN DERIVED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The derived scheme's selling point was that nothing is written down, so there
 * is no key table to leak. That was true and it is worth being clear about what
 * it bought, because revocation costs it: a per-key `revoked_at` requires a
 * per-key row, so a row exists either way and the only question is what goes in
 * it. Once a row is being written, storing a one-way hash of a random secret
 * instead of a key id costs nothing and removes the derived scheme's real
 * weakness — that anything holding `VERDICT_API_KEY_SECRET` can recompute every
 * live key for every workspace, at any time, including ones it was never shown.
 * Under `efv2` the plaintext exists exactly once, in the response that created
 * it, and nothing in this system can produce it a second time.
 *
 * The customer pays for that in a way worth stating plainly: a key that cannot
 * be re-derived cannot be shown twice. `mintVerdictApiKey` used to make "show me
 * my key" a computation; for `efv2` it is a one-time event.
 *
 * The hash is SHA-256, not argon2 like `users.password_hash`, and that is a
 * decision rather than an oversight. Argon2 exists to make *guessing* expensive,
 * which is what a 30-bit human-chosen password needs. This input is 32 bytes
 * from `randomBytes`; guessing it is already out of reach, the only property
 * still required is one-wayness, and an argon2 verification would land on every
 * call of an endpoint that CRMs retry.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DERIVED KEY (`efv1`), AS ORIGINALLY WRITTEN
 * ─────────────────────────────────────────────────────────────────────────────
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

/** The derived key. Legacy: verified, never minted for anything new. */
const VERSION = "efv1";

/** The stored key. `efv2.<public-id>.<secret>`. */
const STORED_VERSION = "efv2";

/** Development and test only — never reachable in production; see `secrets()`. */
const DEV_SECRET = "endpointforms-verdict-key-dev-only";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;
const MAC = /^[A-Za-z0-9_-]{43}$/;

/** `newVerdictKeyPublicId`'s output: 12 characters of nanoid's URL-safe alphabet. */
const PUBLIC_ID = /^[A-Za-z0-9_-]{12}$/;

/** 32 random bytes as base64url. Same width as a MAC, a different version tag. */
const SECRET = /^[A-Za-z0-9_-]{43}$/;

/** Bytes of randomness in a stored key's secret half. */
const SECRET_BYTES = 32;

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
 * The **derived** key for one workspace — the legacy format.
 *
 * Deterministic: calling this twice returns the same string, which is what made
 * "show me my key" a computation rather than a stored secret. Nothing new
 * should be minted from here; `mintStoredVerdictApiKey` is the current one.
 * This survives so a workspace that already has an `efv1` key wired into a CRM
 * can still be shown the key it is using, and told what it is.
 */
export function mintDerivedVerdictApiKey(
  workspace: { id: string; slug: string },
  secrets: VerdictKeySecrets | null = verdictKeySecrets(),
): string | null {
  if (!secrets) return null;
  return `${VERSION}.${workspace.slug}.${mac(workspace.id, secrets.current)}`;
}

/** A legacy `efv1` key: a slug to look the workspace up by, and a MAC over its id. */
export type ParsedDerivedKey = { kind: "derived"; slug: string; mac: string };

/** An `efv2` key: a row to look up, and the secret whose hash that row holds. */
export type ParsedStoredKey = { kind: "stored"; publicId: string; secret: string };

export type ParsedVerdictApiKey = ParsedDerivedKey | ParsedStoredKey;

/**
 * Splits a key into its parts without checking anything cryptographic.
 *
 * Separate from verification because resolving either handle needs a database
 * round trip, and there is no reason to open a connection for a string that is
 * not even shaped like a key.
 *
 * The two formats are told apart by their version tag and nothing else. Their
 * second and third fields happen to overlap in shape — a 12-character public id
 * is also a legal slug, and a 43-character secret is the same width as a MAC —
 * so a key is never "tried as both". A mistyped version is a parse failure, not
 * a fallback, because falling back would mean an `efv1` key that failed its MAC
 * getting a second chance as a row lookup.
 */
export function parseVerdictApiKey(raw: string | null | undefined): ParsedVerdictApiKey | null {
  if (!raw) return null;

  const token = raw.trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [version, handle, tail] = parts;

  if (version === STORED_VERSION) {
    if (!handle || !PUBLIC_ID.test(handle)) return null;
    if (!tail || !SECRET.test(tail)) return null;
    return { kind: "stored", publicId: handle, secret: tail };
  }

  if (version === VERSION) {
    if (!handle || !SLUG.test(handle)) return null;
    if (!tail || !MAC.test(tail)) return null;
    return { kind: "derived", slug: handle, mac: tail };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Stored keys (`efv2`) — #57
// ---------------------------------------------------------------------------

/** A freshly minted key: the plaintext, and the two halves the row needs. */
export type MintedVerdictApiKey = {
  /**
   * The whole token, `efv2.<public-id>.<secret>`.
   *
   * The only time this string ever exists. It is shown to the person who
   * created it and then thrown away — nothing stores it and nothing can
   * reproduce it, which is the property the hash below is for.
   */
  key: string;
  publicId: string;
  /** SHA-256 of the secret half, hex. This is what goes in the database. */
  secretHash: string;
};

/**
 * Generates a stored key.
 *
 * Pure and database-free on purpose: the row is written by
 * `src/lib/verdict/key-store.ts`, so the code that decides what a key *is* can
 * be tested without a database and cannot accidentally acquire the ability to
 * read one back out.
 */
export function mintStoredVerdictApiKey(): MintedVerdictApiKey {
  const publicId = newVerdictKeyPublicId();
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  return {
    key: `${STORED_VERSION}.${publicId}.${secret}`,
    publicId,
    secretHash: hashVerdictKeySecret(secret),
  };
}

/** SHA-256 of a secret half, hex. See the header for why this is not argon2. */
export function hashVerdictKeySecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/**
 * Whether this secret is the one that row was created from.
 *
 * Constant-time against the stored hash. The comparison is on hex digests
 * rather than on the secrets themselves, so both sides are always the same
 * fixed width and an early length exit cannot leak anything about the secret.
 */
export function verifyStoredVerdictApiKey(parsed: ParsedStoredKey, secretHash: string): boolean {
  return equals(hashVerdictKeySecret(parsed.secret), secretHash);
}

/**
 * Whether this key was issued for this workspace.
 *
 * Constant-time, and tries the previous secret only after the current one has
 * failed, so an in-flight rotation costs one extra HMAC and nothing else.
 */
export function verifyVerdictApiKey(
  parsed: ParsedDerivedKey,
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
