#!/usr/bin/env node --experimental-strip-types
/**
 * Migrates existing plaintext destination secrets to encrypted format (#112).
 *
 * Reads all destinations, identifies plaintext secrets, encrypts them in place.
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
import { encrypt, isEncrypted, isEncryptionAvailable } from "../src/lib/crypto/encrypt.ts";

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
    let needsUpdate = false;
    const updates: Record<string, string> = {};

    try {
      switch (row.kind) {
        case "webhook": {
          // Check secret
          if (typeof config.secret === "string" && !isEncrypted(config.secret)) {
            console.log(`  ${row.name} (${row.kind}): encrypting webhook secret`);
            updates.secret = encrypt(config.secret);
            needsUpdate = true;
          }

          // Check headers (may contain Authorization tokens)
          if (typeof config.headers === "object" && config.headers !== null) {
            const headers = config.headers as Record<string, unknown>;
            for (const [key, value] of Object.entries(headers)) {
              if (typeof value === "string" && !isEncrypted(value)) {
                console.log(`  ${row.name} (${row.kind}): encrypting header ${key}`);
                if (!updates.headers) {
                  updates.headers = JSON.stringify({ ...headers });
                }
                const headersObj = JSON.parse(updates.headers) as Record<string, string>;
                headersObj[key] = encrypt(value);
                updates.headers = JSON.stringify(headersObj);
                needsUpdate = true;
              }
            }
          }
          break;
        }

        case "slack": {
          // Check webhook URL (the URL is the credential)
          if (typeof config.webhookUrl === "string" && !isEncrypted(config.webhookUrl)) {
            console.log(`  ${row.name} (${row.kind}): encrypting webhook URL`);
            updates.webhookUrl = encrypt(config.webhookUrl);
            needsUpdate = true;
          }
          break;
        }

        case "google_sheets": {
          // Check refresh token
          if (typeof config.refreshToken === "string" && !isEncrypted(config.refreshToken)) {
            console.log(`  ${row.name} (${row.kind}): encrypting refresh token`);
            updates.refreshToken = encrypt(config.refreshToken);
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
  console.log(`  Plaintext secrets found: ${plaintextCount}`);
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
