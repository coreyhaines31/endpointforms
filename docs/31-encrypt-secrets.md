# 31 — Encrypting destination secrets at rest

**Issue #112.** Google refresh tokens and webhook signing secrets were stored in plaintext in
`destinations.config` jsonb. This document explains the encryption solution, how to configure it,
and how to migrate existing deployments.

## What is encrypted

Destination secrets are encrypted at rest in the database using AES-256-GCM:

- **Webhook destinations**: signing secrets (`config.secret`) and custom headers (may contain
  Authorization tokens)
- **Slack destinations**: incoming webhook URLs (the URL is the credential)
- **Google Sheets destinations**: OAuth refresh tokens (`config.refreshToken`)
- **Email destinations**: nothing (no secrets to encrypt)

Non-secret fields like webhook URLs, email addresses, and spreadsheet IDs remain plaintext.

## The encryption key

Encryption requires `DESTINATION_SECRETS_KEY`, a 32-byte (256-bit) base64-encoded key. Generate
one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add it to your environment:

```bash
# .env.local or deployment environment
DESTINATION_SECRETS_KEY=o/rYkyO5611mKE6w1KhlbFqeTkYfnAy7gjUeTyNAdEk=
```

### Development and test environments

In `NODE_ENV=development` or `NODE_ENV=test`, a built-in key is used when
`DESTINATION_SECRETS_KEY` is not set, so the app works without configuration. This is the same
pattern as `AUTH_SECRET` in `src/lib/destinations/google.ts`.

### Production requirement

**In production, this environment variable is required.** A deployment without it refuses to
encrypt (destination creation fails) and refuses to decrypt (delivery fails), so plaintext
storage cannot happen silently. This is deliberate: encryption exists to prevent plaintext
storage, and falling back would defeat the feature.

## Wire format

Encrypted values are stored as `enc:v2:<base64>`, where the base64 portion contains:

- 12-byte IV (initialization vector, randomized per encryption)
- Ciphertext (the encrypted secret)
- 16-byte authentication tag (GCM proves the data has not been tampered with)

The `enc:` prefix identifies encrypted values. Values without it are treated as plaintext,
which is how backward compatibility works during rollout.

### Bound to the workspace (#119)

`v2` authenticates the owning workspace's id as GCM additional data. The id is not stored in
the value; the code supplies it from the row it read. A value copied into another workspace's
row (a bad restore, a bug in a copy path, someone with write access to the table) fails
authentication there instead of being used as that workspace's credential.

`enc:v1:` values, written by the first release, carry no binding, which makes them exactly
the values that could have been moved. The app refuses them (#122): a delivery fails as a
configuration error and an edit fails, both naming the migration. The migration is the only
code that opens `v1`, and it rewrites each value as `v2`.

## Rollout and migration

### For new deployments

1. Set `DESTINATION_SECRETS_KEY` before the first deploy
2. All destination secrets are encrypted from day one
3. No migration needed

### For existing deployments

Existing plaintext secrets remain readable during and after rollout. Follow these steps:

#### 1. Deploy the encryption code

Deploy the code with `DESTINATION_SECRETS_KEY` set. At this point:

- **New destinations** are created with encrypted secrets
- **Existing destinations** still have plaintext secrets, which can be read
- **Deliveries work** for both encrypted and plaintext configs

#### 2. Run the migration

The migration script re-encrypts existing plaintext secrets in place:

```bash
# Dry run (shows what would be encrypted, makes no changes)
npm run db:migrate-encrypt-secrets

# Apply (actually encrypts the secrets)
npm run db:migrate-encrypt-secrets:apply
```

Not `npm run db:migrate-encrypt-secrets --apply`: npm takes that flag for itself and the
run stays dry.

The script:

- Reads every destination, soft-deleted ones included (their credentials are in the same
  table and in every dump of it)
- Identifies secrets that are plaintext, or `enc:v1:` and so unbound
- Seals each to the workspace that owns its row, with the configured key
- Updates the rows in place
- Safe to run multiple times (already-encrypted secrets are skipped)

For a hosted database (e.g. Neon):

```bash
DB_TARGET=neon npm run db:migrate-encrypt-secrets:apply
```

#### 3. Verify

After migration, all secrets in the database are encrypted. The code still accepts plaintext for
the case where someone restores an old backup, so there is no step 4 that drops plaintext
support.

## Key rotation

Not implemented yet. When it is needed:

1. Store `DESTINATION_SECRETS_KEY_OLD` alongside the new key
2. Try the new key first, fall back to the old one
3. Re-encrypt on read if the old key was used (lazy migration)
4. After all secrets are re-encrypted, drop the old key

The version prefix makes this possible without a schema change.

## Security properties

### What this provides

- **Secrets are encrypted in the database.** A database dump does not expose credentials in
  plaintext.
- **Secrets are encrypted in backups.** A backup restored six months from now still has encrypted
  secrets.
- **Tamper detection.** AES-256-GCM proves the ciphertext has not been modified. A flipped bit or
  forged message is detected rather than decrypted into garbage.
- **No cross-workspace reuse.** A sealed value opens only for the workspace that owns it.
- **No secret reuse.** Each encryption uses a fresh random IV, so the same plaintext produces
  different ciphertexts each time.

### What this does not provide

- **Secrets are not encrypted in memory.** The delivery engine decrypts them to call webhooks and
  Google's API.
- **Secrets are not encrypted in transit.** They travel over TLS to receivers, same as before.
- **The key is not rotatable yet.** Key rotation is planned but not implemented.
- **Secrets remain redacted in the UI.** The existing redaction layer (`redactConfig`) continues
  to work; the plaintext never reaches a page.

## Testing

The encryption module has comprehensive tests in `tests/encrypt-secrets.test.mts`:

- Roundtrip (encrypt then decrypt returns the original)
- Backward compatibility (plaintext values pass through unchanged)
- IV randomness (same plaintext produces different ciphertexts)
- Tamper detection (modified ciphertext is rejected)
- Key handling (production requires a key, dev/test use a built-in key)
- Key independence (different keys produce different ciphertexts)
- Edge cases (empty strings, unicode, null bytes)

Run them with:

```bash
npm run test:encrypt
```

## Implementation notes

### Why AES-256-GCM and not argon2?

This is encryption (two-way) not hashing (one-way). The delivery engine needs the plaintext
credential to sign webhooks and call Google's API, so the value must be recoverable. `argon2id`,
as `users.password_hash` uses, is for *hashing* — it cannot be reversed, which is correct for a
password (we verify a login by hashing the input and comparing) and wrong here.

### Why not a separate secrets table?

The config is jsonb and its shape depends on the destination kind. Extracting secrets to a
separate table would mean either:

- One polymorphic secrets table with a type discriminator, which is the same JSONB problem
- N tables (webhook_secrets, google_sheets_secrets, etc.), which fragments the model

Encrypting in place keeps the existing schema and query patterns unchanged.

### Where encryption happens

- **On write:** `buildConfig` in `src/lib/destinations/config.ts` encrypts secrets before
  returning the config to be stored. The Google OAuth callback encrypts the refresh token in
  `src/lib/destinations/connect.ts`.
- **On read:** `parseConfig` in the same file decrypts secrets before the adapter receives them.
  A config that fails to decrypt throws and lands in the delivery log as a `configuration`
  failure.

The redaction layer (`redactConfig`) never sees plaintext, because it runs before secrets are
decrypted. The UI receives only the redacted shape.

## Files changed

- `src/lib/crypto/encrypt.ts` — encryption module (new)
- `src/lib/destinations/config.ts` — encrypt on `buildConfig`, decrypt on `parseConfig`
- `src/lib/destinations/connect.ts` — encrypt Google refresh tokens from OAuth callback
- `scripts/migrate-encrypt-secrets.mts` — migration script (new)
- `tests/encrypt-secrets.test.mts` — comprehensive tests (new)
- `package.json` — added `db:migrate-encrypt-secrets`, `db:migrate-encrypt-secrets:apply` and `test:encrypt`
- `docs/31-encrypt-secrets.md` — this file

## Related issues

- **#112**: Encrypt destination secrets at rest (this issue)
- **#119**: Bind each sealed value to its workspace
- **#122**: Refuse unbound `v1` values outside the migration
- **#67**: Google Sheets destination and refresh token handling
- **#41**: Webhook signing secrets
- **#42**: Delivery log contains request/response but never secrets
