import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption at rest for destination secrets (#112).
 *
 * Google refresh tokens and webhook signing secrets are stored in
 * `destinations.config` jsonb. Before this module existed, they sat in plaintext,
 * so a database dump exposed every credential. This encrypts them with a key
 * held outside the database, using AES-256-GCM.
 *
 * ## What is and is not encrypted
 *
 * **Encrypted:**
 * - Webhook signing secrets (`destinations.config.secret`)
 * - Google OAuth refresh tokens (`destinations.config.refreshToken`)
 * - Slack incoming webhook URLs (the URL *is* the credential)
 * - Custom HTTP headers (may contain Authorization tokens)
 *
 * **Not encrypted:**
 * - Webhook URLs (not secrets; receivers are expected to be public)
 * - Email addresses
 * - Spreadsheet IDs (not credentials; still need Google account with access)
 * - Everything in `RedactedConfig` (already safe for UI)
 *
 * ## The encryption key
 *
 * Read from `DESTINATION_SECRETS_KEY`, which must be a 32-byte (256-bit)
 * base64-encoded key. Generate one with:
 *
 *     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * **In production, this environment variable is required.** A deployment without
 * it refuses to encrypt (writes fail) and refuses to decrypt (reads fail), so
 * destination secrets cannot be stored or loaded. That is deliberate: plaintext
 * storage is the thing this module exists to prevent, and silently falling back
 * to it would make the module a checkbox someone ticked while the risk remained.
 *
 * In development and test, a built-in key is used when the variable is unset,
 * so a laptop and the test suite work without configuration. The key is named
 * explicitly and is not secret — same rule as `DEV_STATE_SECRET` in
 * `src/lib/destinations/google.ts` and `DEV_UPLOAD_SECRET` in
 * `src/lib/uploads/links.ts`.
 *
 * ## Wire format
 *
 * Encrypted values are stored as `enc:v2:<base64>`, where the base64 portion
 * contains:
 * - 12-byte IV (initialization vector)
 * - ciphertext
 * - 16-byte authentication tag
 *
 * The prefix lets `decrypt()` distinguish an encrypted value from a plaintext
 * one, which is how backward compatibility works: during rollout, secrets
 * written before this module shipped are still plaintext, and those written
 * after are encrypted. Both can be read. A value without a prefix is treated as
 * plaintext and returned as-is.
 *
 * ## Bound to a workspace (#119)
 *
 * `v2` authenticates the owning workspace's id as GCM additional data. The id
 * is not stored in the value; the caller supplies it from the row it read. A
 * value copied into another workspace's row — a bad restore, a bug in a copy
 * path, someone with write access to the table — fails authentication there
 * instead of being used as that workspace's credential.
 *
 * `v1` values (the first release, no binding) still decrypt, so nothing
 * written by it is stranded. They carry no binding, so an edit and the
 * migration script both rewrite them as `v2`; `needsSealing()` is the test.
 *
 * ## Rollout and migration
 *
 * 1. Deploy this code with `DESTINATION_SECRETS_KEY` set. New secrets are
 *    encrypted; existing plaintext secrets can still be read.
 * 2. Run the migration script (see `scripts/migrate-encrypt-secrets.mts`) to
 *    re-encrypt all existing plaintext values in place.
 * 3. After migration, all secrets in the database are encrypted, but the code
 *    still accepts plaintext for the case where someone restored an old backup.
 *
 * There is no step 4 that drops plaintext support. A backup restored six months
 * from now will contain plaintext secrets that were current when it was taken,
 * and the decryptor must still open them.
 *
 * ## Why AES-256-GCM and not argon2
 *
 * This is encryption (two-way) not hashing (one-way). The delivery engine needs
 * the plaintext credential to sign webhooks and call Google's API, so the value
 * must be recoverable. `argon2id`, as `users.password_hash` uses, is for
 * *hashing* — it cannot be reversed, which is correct for a password (we verify
 * a login by hashing the input and comparing) and wrong here.
 *
 * GCM (Galois/Counter Mode) provides authenticated encryption: it proves the
 * ciphertext has not been tampered with, so a flipped bit or a forged message
 * is detected rather than decrypted into garbage.
 *
 * ## What about key rotation?
 *
 * Not implemented yet. When it is needed:
 * - Store `DESTINATION_SECRETS_KEY_OLD` alongside the new key
 * - Try the new key first, fall back to the old one
 * - Re-encrypt on read if the old key was used (lazy migration)
 * - After all secrets are re-encrypted, drop the old key
 *
 * The version prefix makes this possible: the prefix names the format, and
 * which key decrypted it is internal to the decryptor.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits (recommended for GCM)
const TAG_LENGTH = 16; // 128 bits

const V1_PREFIX = "enc:v1:";
const V2_PREFIX = "enc:v2:";

/** The additional authenticated data for a workspace's credentials. */
function bindingFor(workspaceId: string): Buffer {
  if (workspaceId === "") throw new Error("Cannot bind a credential to an empty workspace id.");
  return Buffer.from(`endpointforms:destination-credential:workspace:${workspaceId}`, "utf8");
}

/**
 * The built-in key for development and test environments.
 *
 * Named explicitly, lives in the source, and is not secret. It exists so a
 * laptop checkout and the test suite work without setting an environment
 * variable. Same reasoning as other dev keys in this codebase.
 *
 * **Never used in production.** A production deployment without
 * `DESTINATION_SECRETS_KEY` set fails loudly rather than falling back.
 */
const DEV_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; // base64, exactly 32 bytes of 'A'

let encryptionKey: Buffer | null = null;
let keyLoadAttempted = false;
let warnedAboutMissingKey = false;

/**
 * Loads the encryption key from the environment, once.
 *
 * Returns null if the key is not configured. In production, this means
 * encryption operations will fail. In development/test, the built-in key is
 * used as a fallback.
 */
function getEncryptionKey(): Buffer | null {
  if (keyLoadAttempted) return encryptionKey;
  keyLoadAttempted = true;

  const keyEnv = (process.env.DESTINATION_SECRETS_KEY ?? "").trim();

  if (keyEnv === "") {
    const env = process.env.NODE_ENV;
    if (env === "development" || env === "test") {
      // Development/test: use the built-in key and don't warn
      encryptionKey = Buffer.from(DEV_ENCRYPTION_KEY, "base64");
      return encryptionKey;
    }

    // Production without a key: return null, which causes operations to fail
    if (!warnedAboutMissingKey) {
      warnedAboutMissingKey = true;
      console.error(
        "[crypto] DESTINATION_SECRETS_KEY is not set. Destination secrets cannot be encrypted or decrypted. " +
          "Generate a key with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      );
    }
    return null;
  }

  try {
    const decoded = Buffer.from(keyEnv, "base64");
    if (decoded.length !== KEY_LENGTH) {
      console.error(
        `[crypto] DESTINATION_SECRETS_KEY must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 8} bits) when base64-decoded. ` +
          `Got ${decoded.length} bytes. Generate a correct key with: ` +
          `node -e "console.log(require('crypto').randomBytes(${KEY_LENGTH}).toString('base64'))"`,
      );
      return null;
    }
    encryptionKey = decoded;
    return encryptionKey;
  } catch (error) {
    console.error(
      `[crypto] DESTINATION_SECRETS_KEY is not valid base64: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Encrypts a plaintext secret for one workspace and returns the wire format.
 *
 * Returns `enc:v2:<base64(iv + ciphertext + tag)>`, authenticated against
 * `workspaceId`. Only `decrypt` with the same id opens it.
 *
 * Throws if the encryption key is not configured. This is deliberate: a
 * deployment without a key must fail loudly rather than silently storing
 * plaintext.
 */
export function encrypt(plaintext: string, workspaceId: string): string {
  const key = getEncryptionKey();
  if (key === null) {
    throw new Error(
      "Cannot encrypt: DESTINATION_SECRETS_KEY is not configured. " +
        "Set it to a 32-byte base64-encoded key. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(bindingFor(workspaceId));

  let ciphertext = cipher.update(plaintext, "utf8");
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);

  const tag = cipher.getAuthTag();

  // Wire format: IV + ciphertext + tag, then base64
  const combined = Buffer.concat([iv, ciphertext, tag]);
  return `${V2_PREFIX}${combined.toString("base64")}`;
}

/**
 * Decrypts a value that may be encrypted or plaintext.
 *
 * - `enc:v2:` is decrypted against `workspaceId`, and fails for any other id.
 * - `enc:v1:` (unbound, from the first release) is decrypted without a binding.
 * - Anything else is treated as plaintext and returned as-is.
 *
 * This backward compatibility is how the rollout works: secrets written before
 * this module existed are still plaintext, and those written after are
 * encrypted. Both can be read.
 *
 * Throws if:
 * - The value is encrypted and the key is not configured
 * - The value is encrypted and the ciphertext is malformed
 * - The value is encrypted and the authentication tag does not match (tampered
 *   data, a different key, or a `v2` value from another workspace)
 */
export function decrypt(value: string, workspaceId: string): string {
  const prefix = value.startsWith(V2_PREFIX) ? V2_PREFIX : value.startsWith(V1_PREFIX) ? V1_PREFIX : null;
  if (prefix === null) {
    // Not encrypted — treat as plaintext
    return value;
  }

  const key = getEncryptionKey();
  if (key === null) {
    throw new Error(
      "Cannot decrypt: DESTINATION_SECRETS_KEY is not configured. " +
        "This value was encrypted, but the key needed to decrypt it is missing.",
    );
  }

  const base64Payload = value.slice(prefix.length);
  let combined: Buffer;
  try {
    combined = Buffer.from(base64Payload, "base64");
  } catch (error) {
    throw new Error(
      `Cannot decrypt: the encrypted value is not valid base64. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (combined.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error(
      `Cannot decrypt: the encrypted value is too short (expected at least ${IV_LENGTH + TAG_LENGTH} bytes, got ${combined.length})`,
    );
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(combined.length - TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  if (prefix === V2_PREFIX) decipher.setAAD(bindingFor(workspaceId));

  let plaintext: Buffer;
  try {
    plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);
  } catch (error) {
    throw new Error(
      `Cannot decrypt: authentication failed (wrong key, wrong workspace, or tampered data). ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return plaintext.toString("utf8");
}

/** Returns true if a value is encrypted, in either format. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(V2_PREFIX) || value.startsWith(V1_PREFIX);
}

/**
 * True for a stored value that should be rewritten: plaintext, or `v1`, which
 * carries no workspace binding. Used by edits and the migration script.
 */
export function needsSealing(value: string): boolean {
  return !value.startsWith(V2_PREFIX);
}

/**
 * Returns true if encryption is configured and ready to use.
 *
 * Used by callers that need to know whether they can encrypt values.
 */
export function isEncryptionAvailable(): boolean {
  return getEncryptionKey() !== null;
}

/**
 * For testing: clears the cached key so it can be reloaded with a different
 * environment variable value.
 *
 * Test-only. Nothing outside `tests/` should call it.
 */
export function _resetKeyCache(): void {
  encryptionKey = null;
  keyLoadAttempted = false;
  warnedAboutMissingKey = false;
}
