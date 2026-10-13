/**
 * Encryption at rest for destination secrets (#112).
 *
 * Tests the encryption module in isolation: roundtrips, backward compatibility
 * with plaintext, failure modes, and environment handling.
 *
 * Run directly: `node --experimental-strip-types tests/encrypt-secrets.test.mts`
 */

import { strict as assert } from "node:assert";
import {
  encrypt,
  decrypt,
  isEncrypted,
  isEncryptionAvailable,
  _resetKeyCache,
} from "../src/lib/crypto/encrypt.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const isOk = JSON.stringify(got) === JSON.stringify(want);
  if (isOk) pass++;
  else fail++;
  console.log(`  ${isOk ? "PASS" : "FAIL"}  ${name}`);
  if (!isOk) {
    console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  }
};

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

const throws = (name: string, fn: () => void, expectedMessage?: string) => {
  try {
    fn();
    fail++;
    console.log(`  FAIL  ${name} (did not throw)`);
  } catch (error) {
    if (
      expectedMessage &&
      error instanceof Error &&
      !error.message.includes(expectedMessage)
    ) {
      fail++;
      console.log(`  FAIL  ${name} (wrong message)`);
      console.log(`        got  ${error.message}`);
      console.log(`        want message containing ${JSON.stringify(expectedMessage)}`);
    } else {
      pass++;
      console.log(`  PASS  ${name}`);
    }
  }
};

// Save original env
const originalKey = process.env.DESTINATION_SECRETS_KEY;
const originalEnv = process.env.NODE_ENV;

// Set to test mode for the duration of tests (unless explicitly changed)
(process.env as { NODE_ENV: string }).NODE_ENV = "test";

function setEnv(key: string | undefined, env: string) {
  if (key === undefined) {
    delete process.env.DESTINATION_SECRETS_KEY;
  } else {
    process.env.DESTINATION_SECRETS_KEY = key;
  }
  (process.env as { NODE_ENV: string }).NODE_ENV = env;
  _resetKeyCache();
}

function restoreEnv() {
  if (originalKey === undefined) {
    delete process.env.DESTINATION_SECRETS_KEY;
  } else {
    process.env.DESTINATION_SECRETS_KEY = originalKey;
  }
  (process.env as { NODE_ENV: string }).NODE_ENV = originalEnv || "test";
  _resetKeyCache();
}

// ---------------------------------------------------------------------------
// Basic encryption/decryption roundtrip
// ---------------------------------------------------------------------------

console.log("\n== Basic roundtrip ==");

{
  const plaintext = "whsec_test_secret_12345";
  const encrypted = encrypt(plaintext);
  ok("encrypted value starts with version prefix", encrypted.startsWith("enc:v1:"));
  ok("encrypted value is different from plaintext", encrypted !== plaintext);
  ok("encrypted value is longer than plaintext", encrypted.length > plaintext.length);

  const decrypted = decrypt(encrypted);
  t("decrypt roundtrips correctly", decrypted, plaintext);
}

{
  const plaintext = "a";
  const encrypted = encrypt(plaintext);
  const decrypted = decrypt(encrypted);
  t("single character roundtrips", decrypted, plaintext);
}

{
  const plaintext = "x".repeat(1000);
  const encrypted = encrypt(plaintext);
  const decrypted = decrypt(encrypted);
  t("long string roundtrips", decrypted, plaintext);
}

{
  const plaintext = "emoji 🔒 and unicode ™ © test";
  const encrypted = encrypt(plaintext);
  const decrypted = decrypt(encrypted);
  t("unicode and emoji roundtrip", decrypted, plaintext);
}

// ---------------------------------------------------------------------------
// Backward compatibility with plaintext
// ---------------------------------------------------------------------------

console.log("\n== Backward compatibility ==");

{
  const plaintext = "whsec_old_plaintext_secret";
  const result = decrypt(plaintext);
  t("plaintext value passes through unchanged", result, plaintext);
}

{
  const plaintext = "any string without enc:v1: prefix";
  const result = decrypt(plaintext);
  t("arbitrary plaintext passes through", result, plaintext);
}

{
  ok("plaintext is not marked as encrypted", !isEncrypted("plaintext"));
  ok("encrypted is marked as encrypted", isEncrypted(encrypt("test")));
}

// ---------------------------------------------------------------------------
// Different plaintexts produce different ciphertexts (IV randomness)
// ---------------------------------------------------------------------------

console.log("\n== IV randomness ==");

{
  const plaintext = "same_secret";
  const encrypted1 = encrypt(plaintext);
  const encrypted2 = encrypt(plaintext);
  ok(
    "same plaintext produces different ciphertexts",
    encrypted1 !== encrypted2,
    { encrypted1, encrypted2 },
  );
  t("both decrypt to original", decrypt(encrypted1), plaintext);
  t("both decrypt to original", decrypt(encrypted2), plaintext);
}

// ---------------------------------------------------------------------------
// Tamper detection (GCM authentication)
// ---------------------------------------------------------------------------

console.log("\n== Tamper detection ==");

{
  const encrypted = encrypt("secret");
  const base64Payload = encrypted.slice("enc:v1:".length);
  const bytes = Buffer.from(base64Payload, "base64");
  
  // Flip one bit in the ciphertext (not the IV or tag)
  if (bytes.length > 20) {
    bytes[15] ^= 0x01;
    const tampered = `enc:v1:${bytes.toString("base64")}`;
    throws("tampered ciphertext is rejected", () => decrypt(tampered), "authentication failed");
  }
}

{
  const encrypted = encrypt("secret");
  const corrupted = encrypted.slice(0, -5); // Truncate
  throws("truncated ciphertext is rejected", () => decrypt(corrupted));
}

{
  const corrupted = "enc:v1:not-valid-base64!!!";
  throws("malformed base64 is rejected", () => decrypt(corrupted));
}

// ---------------------------------------------------------------------------
// Missing or invalid key
// ---------------------------------------------------------------------------

console.log("\n== Key handling ==");

{
  setEnv(undefined, "production");
  ok("encryption is not available without key in production", !isEncryptionAvailable());
  throws("encrypt throws without key in production", () => encrypt("test"), "not configured");
  // Decrypting plaintext still works (backward compat)
  t("decrypt plaintext works without key", decrypt("plaintext"), "plaintext");
  // Decrypting encrypted value throws
  const encrypted = "enc:v1:c29tZSBlbmNyeXB0ZWQgZGF0YQ=="; // fake encrypted
  throws("decrypt encrypted throws without key", () => decrypt(encrypted), "not configured");
  restoreEnv();
}

{
  setEnv(undefined, "development");
  ok("encryption is available in development without explicit key", isEncryptionAvailable());
  if (isEncryptionAvailable()) {
    const plaintext = "dev_secret";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    t("dev mode uses built-in key", decrypted, plaintext);
  }
  restoreEnv();
}

{
  setEnv(undefined, "test");
  ok("encryption is available in test without explicit key", isEncryptionAvailable());
  if (isEncryptionAvailable()) {
    const plaintext = "test_secret";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    t("test mode uses built-in key", decrypted, plaintext);
  }
  restoreEnv();
}

{
  // Key that is not 32 bytes
  const shortKey = Buffer.from("short").toString("base64");
  setEnv(shortKey, "production");
  ok("invalid key length makes encryption unavailable", !isEncryptionAvailable());
  throws("encrypt with wrong-length key throws", () => encrypt("test"), "not configured");
  setEnv(undefined, "test"); // Restore to test mode for subsequent tests
}

{
  setEnv("not-valid-base64!!!", "production");
  ok("invalid base64 key makes encryption unavailable", !isEncryptionAvailable());
  throws("encrypt with invalid base64 throws", () => encrypt("test"), "not configured");
  setEnv(undefined, "test"); // Restore to test mode for subsequent tests
}

{
  // Valid 32-byte key
  const validKey = Buffer.from("a".repeat(32)).toString("base64");
  setEnv(validKey, "production");
  ok("valid 32-byte key makes encryption available", isEncryptionAvailable());
  const plaintext = "custom_key_secret";
  const encrypted = encrypt(plaintext);
  const decrypted = decrypt(encrypted);
  t("encryption works with custom key", decrypted, plaintext);
  restoreEnv();
}

// ---------------------------------------------------------------------------
// Key independence (different keys produce different ciphertexts)
// ---------------------------------------------------------------------------

console.log("\n== Key independence ==");

{
  const plaintext = "secret";
  
  const key1 = Buffer.from("1".repeat(32)).toString("base64");
  setEnv(key1, "production");
  const encrypted1 = encrypt(plaintext);
  restoreEnv();
  
  const key2 = Buffer.from("2".repeat(32)).toString("base64");
  setEnv(key2, "production");
  const encrypted2 = encrypt(plaintext);
  
  ok("different keys produce different ciphertexts", encrypted1 !== encrypted2);
  
  // Can decrypt with the correct key
  const decrypted2 = decrypt(encrypted2);
  t("decrypts with matching key", decrypted2, plaintext);
  
  // Cannot decrypt with wrong key
  throws("cannot decrypt with wrong key", () => decrypt(encrypted1), "authentication failed");
  
  restoreEnv();
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

console.log("\n== Edge cases ==");

// Make sure we're in test mode for edge cases
setEnv(undefined, "test");

{
  const empty = "";
  const encrypted = encrypt(empty);
  const decrypted = decrypt(encrypted);
  t("empty string roundtrips", decrypted, empty);
}

{
  const withNewlines = "line1\nline2\nline3";
  const encrypted = encrypt(withNewlines);
  const decrypted = decrypt(encrypted);
  t("newlines roundtrip", decrypted, withNewlines);
}

{
  const withNulls = "before\x00after";
  const encrypted = encrypt(withNulls);
  const decrypted = decrypt(encrypted);
  t("null bytes roundtrip", decrypted, withNulls);
}

{
  const jsonLike = '{"key":"value","nested":{"data":123}}';
  const encrypted = encrypt(jsonLike);
  const decrypted = decrypt(encrypted);
  t("JSON-like string roundtrips", decrypted, jsonLike);
}

// ---------------------------------------------------------------------------

restoreEnv();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
