#!/usr/bin/env node --experimental-strip-types
/**
 * Migrates existing plaintext destination secrets to encrypted format (#112).
 *
 * Reads all destinations and seals every credential that is plaintext, or is
 * `enc:v1:` from the first release and so carries no workspace binding (#119).
 * Each is sealed to the workspace that owns its row.
 * Soft-deleted rows are included: their credentials sit in the same table and
 * in every dump of it. Safe to run multiple times — already-encrypted secrets
 * are skipped.
 *
 * Usage:
 *   npm run db:migrate-encrypt-secrets         # Dry run (shows what would be encrypted)
 *   npm run db:migrate-encrypt-secrets:apply   # Actually encrypts the secrets
 *
 * Not `npm run db:migrate-encrypt-secrets --apply`: npm takes that flag for
 * itself and the run stays dry.
 *
 * Requires DESTINATION_SECRETS_KEY to be set.
 */

import { eq } from "drizzle-orm";
import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { destinations } from "../src/db/schema.ts";
import { decrypt, encrypt, isEncryptionAvailable, needsSealing, openUnboundV1 } from "../src/lib/crypto/encrypt.ts";

const DRY_RUN = !process.argv.includes("--apply");

async function main() {
  console.log("Destination secrets encryption migration\n");

  if (!isEncryptionAvailable()) {
    console.error("ERROR: DESTINATION_SECRETS_KEY is not configured.");
    console.error("Set it to a 32-byte base64-encoded key before running this migration.");
    console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("DRY RUN mode. No changes will be made.");
    console.log("Run db:migrate-encrypt-secrets:apply to actually encrypt secrets.\n");
  } else {
    console.log("APPLY mode. Secrets will be encrypted.\n");
  }

  const rows = await unsafeDb
    .select({
      id: destinations.id,
      workspaceId: destinations.workspaceId,
      kind: destinations.kind,
      name: destinations.name,
      config: destinations.config,
    })
    .from(destinations);

  console.log(`Found ${rows.length} destinations.\n`);

  let encryptedCount = 0;
  let plaintextCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    const config = (row.config ?? {}) as Record<string, unknown>;
    // Opened first: a v1 value is ciphertext, and encrypting it again would
    // double it. The app refuses v1 (#122), so it is opened through the one
    // door kept for this script. Plaintext passes through `decrypt` unchanged.
    const seal = (value: string) =>
      encrypt(
        value.startsWith("enc:v1:") ? openUnboundV1(value) : decrypt(value, row.workspaceId),
        row.workspaceId,
      );
    let needsUpdate = false;
    const updates: Record<string, string> = {};

    try {
      switch (row.kind) {
        case "webhook": {
          // Check secret
          if (typeof config.secret === "string" && needsSealing(config.secret)) {
            console.log(`  ${row.name} (${row.kind}): sealing webhook secret`);
            updates.secret = seal(config.secret);
            needsUpdate = true;
          }

          // Check headers (may contain Authorization tokens)
          if (typeof config.headers === "object" && config.headers !== null) {
            const headers = config.headers as Record<string, unknown>;
            for (const [key, value] of Object.entries(headers)) {
              if (typeof value === "string" && needsSealing(value)) {
                console.log(`  ${row.name} (${row.kind}): sealing header ${key}`);
                if (!updates.headers) {
                  updates.headers = JSON.stringify({ ...headers });
                }
                const headersObj = JSON.parse(updates.headers) as Record<string, string>;
                headersObj[key] = seal(value);
                updates.headers = JSON.stringify(headersObj);
                needsUpdate = true;
              }
            }
          }
          break;
        }

        case "slack": {
          // Check webhook URL (the URL is the credential)
          if (typeof config.webhookUrl === "string" && needsSealing(config.webhookUrl)) {
            console.log(`  ${row.name} (${row.kind}): sealing webhook URL`);
            updates.webhookUrl = seal(config.webhookUrl);
            needsUpdate = true;
          }
          break;
        }

        case "google_sheets": {
          // Check refresh token
          if (typeof config.refreshToken === "string" && needsSealing(config.refreshToken)) {
            console.log(`  ${row.name} (${row.kind}): sealing refresh token`);
            updates.refreshToken = seal(config.refreshToken);
            needsUpdate = true;
          }
          break;
        }

        case "email":
          // Email destinations have no secrets to encrypt
          break;

        default:
          console.log(`  ${row.name}: unknown kind ${row.kind}, skipping`);
          break;
      }

      if (needsUpdate) {
        plaintextCount++;

        if (!DRY_RUN) {
          // Apply the updates
          let newConfig: Record<string, unknown>;
          if (updates.headers) {
            newConfig = { ...config, ...updates, headers: JSON.parse(updates.headers) };
          } else {
            newConfig = { ...config, ...updates };
          }

          await unsafeDb
            .update(destinations)
            .set({ config: newConfig })
            .where(eq(destinations.id, row.id));

          encryptedCount++;
        }
      }
    } catch (error) {
      errorCount++;
      console.error(`  ERROR processing ${row.name} (${row.kind}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("\nSummary:");
  console.log(`  Total destinations: ${rows.length}`);
  console.log(`  Unsealed secrets found (plaintext or v1): ${plaintextCount}`);
  if (DRY_RUN) {
    console.log(`  Would encrypt: ${plaintextCount}`);
    console.log("\nRun db:migrate-encrypt-secrets:apply to actually encrypt these secrets.");
  } else {
    console.log(`  Encrypted: ${encryptedCount}`);
    console.log(`  Errors: ${errorCount}`);
  }

  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
