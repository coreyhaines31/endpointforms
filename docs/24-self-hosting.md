# Self-hosting

**Issue #46.** The long version. The short version is in [`README.md`](../README.md).

Endpoint Forms is AGPL-3.0. The core is open and self-hostable, and the hosted version is the
commercial offering. That makes self-hosting the product's credibility rather than a footnote:
if a stranger cannot clone this repository and run it, the licence is a claim we do not honour.

Everything below has been executed on a clean checkout. Commands that were not run are marked.

---

## 1. Quick start

Prerequisites: **Node 22+** and **Docker**. Nothing else.

```bash
git clone https://github.com/coreyhaines31/endpointforms.git
cd endpointforms
bash scripts/setup.sh
npm run dev
```

Open <http://localhost:3000> and sign up at `/signup`.

`scripts/setup.sh` is one command that does six things:

1. checks Node ≥ 22 and that Docker is installed and running
2. `npm ci`
3. writes `.env.local` with four generated secrets
4. starts Postgres and **verifies the app role cannot bypass row-level security**
5. applies the migrations
6. seeds a sample workspace

It is idempotent — re-running is safe and never overwrites an existing `.env.local`.

```bash
bash scripts/setup.sh --no-seed    # empty database
bash scripts/setup.sh --dev        # run `npm run dev` when it finishes
bash scripts/setup.sh --help
```

### Verified

Run on 2026-08-31 against a clean tree in a temporary directory — no `node_modules`, no
`.next`, no `.env.local`, no `.git`, and no relevant variables in the shell environment.

| Step | Result |
|---|---|
| `bash scripts/setup.sh` (first run: `npm ci` from nothing, secrets generated, container started, migrations, seed) | exit 0 |
| `bash scripts/setup.sh` again, and again with `--no-seed` | exit 0 — idempotent, `.env.local` untouched |
| `npm run build` with **no** `.env.local` and no environment variables at all | **exit 0** — no import-time environment requirement remains |
| `npm run dev`, then sign up at `/signup`, create a workspace, land on the dashboard | worked |
| `npm run verify` | lint, typecheck and build passed |

### What is honestly not one command

`npm run dev` is a second command, deliberately: a setup script that leaves a foreground server
running is a setup script you cannot put in a Makefile. `bash scripts/setup.sh --dev` collapses
the two if you want that.

`git clone` is a third, and Docker has to already be installed. Neither is something a script in
this repository can do for you.

---

## 2. The two traps

Both of these have already bitten this project. They are documented here because the failure
mode in each case is **invisible** — everything looks like it is working.

### 2.1 The app must not connect to Postgres as a superuser

Tenant isolation in Endpoint is enforced by Postgres row-level security, with
`FORCE ROW LEVEL SECURITY` on every workspace-scoped table.

**A Postgres superuser bypasses row-level security unconditionally.** `FORCE ROW LEVEL SECURITY`
does not apply to it. So an instance that connects as `postgres` has *no tenant isolation at
all* — every workspace can read every other workspace's submissions — while migrations apply,
queries return rows, nothing errors, and the entire test suite passes.

The same is true of any role with the `BYPASSRLS` attribute, which is not the same thing as
being a superuser. On Neon, the provisioned owner `neondb_owner` has `rolbypassrls = true`. That
was caught by the isolation test: 18 failures on Neon against 0 on Docker, with an identical
schema.

So:

- **Locally**, `docker/postgres/init.sql` creates an ordinary role called `endpoint` with
  `NOSUPERUSER NOBYPASSRLS`. `postgres` remains the bootstrap superuser and is never what the
  app connects as. `scripts/setup.sh` reads `pg_roles` and **refuses to continue** unless
  `endpoint` really is `rolsuper = false, rolbypassrls = false`. It checks rather than assumes,
  because `init.sql` only runs on an empty data volume — an older volume would silently skip it.
- **On a hosted Postgres**, run `npm run db:create-app-role:neon` (see §4).

If you bring your own Postgres, this is the one thing you must get right:

```sql
CREATE ROLE endpoint LOGIN PASSWORD '…' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE DATABASE endpointforms OWNER endpoint;
```

Owning the database is enough to run the migrations — DDL ignores RLS — while still being
subject to the policies on the tables it owns.

Verify it, do not assume it:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'endpoint';
-- endpoint | f | f
```

Then confirm the isolation actually holds:

```bash
npm run test:db
```

### 2.2 The build must never require a database

`npm run build` must work on a clean checkout with **no `DATABASE_URL` and no secrets**.

This was broken once. A module-scope call resolved the database URL while Next was collecting
page data during `next build`, which runs as production. It passed on Vercel, where the variable
is set, and failed on every clean checkout — so the one-command self-host story was broken and
invisible for hours.

Two guards exist so it cannot recur silently:

- `src/db/client.ts` opens the connection on first use, not at import.
- `.github/workflows/verify.yml` runs the build **with no `DATABASE_URL` and no secrets** on
  every push and pull request. Vercel's own check only proves the app builds with Vercel's
  environment variables set; this proves a stranger can build it.

**Verified on 2026-08-31:** a clean tree with no `.env.local` and no relevant variables in the
shell environment ran `npm run build` to **exit code 0**. There is no remaining import-time
environment requirement.

> Never confirm a build by grepping its output. `next build` prints "Compiled successfully"
> *before* it type checks and *before* it collects page data, so that string appears on builds
> that then fail. Use `npm run verify`, which checks every step by exit code.

---

## 3. Configuration — the complete environment contract

This is the authoritative list. It was derived by grepping `process.env` across `src/` and
`scripts/`, not from memory, and it stands on its own — you do not need any other file to
configure an instance.

`scripts/setup.sh` writes a working `.env.local` for you, so in the common case you never touch
any of this. Read on if you are deploying rather than developing.

**Nothing here is required to run `npm run build`.** The build must work on a clean checkout with
none of it set, and CI proves that on every push (§2.2).

### 3.1 The four secrets

Generated by the setup script. To generate one yourself:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

| Variable | What it protects | If unset |
|---|---|---|
| `AUTH_SECRET` | Session cookies and Auth.js tokens. Read by Auth.js itself, not by our code | **Auth.js throws in production.** Required |
| `SUBMISSION_IP_SALT` | Salts the SHA-256 hash of submitter IPs. The raw IP is never stored, only this hash | Falls back to the built-in constant `endpointforms-ip-hash-v1` and warns once in production. Hashes become guessable, and identical across every deployment that forgot it |
| `ORIGIN_TOKEN_SECRET` | Signs the client token minted at `GET /e/{id}/token`, one of nine form-surface origin signals | Falls back to a built-in key and warns once in production. A forgeable token is a weaker signal — but refusing the submission would be a lost lead |
| `VERDICT_API_KEY_SECRET` | Signs and verifies the **legacy** `efv1` outcome keys. Current `efv2` keys do not use it | **A legacy `efv1` key gets `503 server_not_configured` in production; `efv2` keys keep working.** Outside production it falls back to a fixed dev secret so you can try the legacy format without configuring anything |

**The asymmetry is deliberate and worth understanding before you decide which to skip.** The two
that guard *a signal* degrade rather than refuse, because losing a lead is worse than a weakened
signal. `VERDICT_API_KEY_SECRET` guards **write access to another company's data**, so a
built-in fallback would mean anyone who read the source could mint a legacy key for any
workspace on any deployment that forgot to set it. That one refuses.

**A new deployment does not need it at all.** Current outcome keys are random secrets stored as
hashes, so they are unforgeable whether or not this variable is set. Leave it unset and the
outcome webhook still works; only the legacy `efv1` format needs it.

#### Outcome API keys, current and legacy

**Current keys (`efv2`) are stored hashes.** A workspace creates them in settings and can hold
several at once, which is what makes rotation survivable — create the new key, move the
integration across, revoke the old one, with both live in between.

```
efv2.<key-id>.<secret>          secret = 32 random bytes, base64url
stored:  sha256(secret), hex    the plaintext is shown once and never again
```

SHA-256 rather than argon2, and the reason is not laziness: argon2 exists to make *guessing*
expensive, which is what a human-chosen password needs. A 256-bit random secret is already
beyond guessing, the only property still required is one-wayness, and an argon2 verification
would land on every call of an endpoint that CRMs retry.

Each key carries `created_at`, `last_used_at` (to the nearest five minutes), `last_used_ip`,
`revoked_at` and a label. Revoking one affects that key and nothing else. Rows are never
deleted, because "which key was this, and when did we kill it" is precisely what a revocation
exists to be able to answer later.

**Legacy keys (`efv1`) are derived, not stored**, and are still accepted so that integrations
already in the field keep working:

```
efv1.<workspace-slug>.<mac>
mac = base64url(HMAC-SHA256(VERDICT_API_KEY_SECRET, "efv1:" + workspaceId))
```

Minting and verifying are the same computation, so there is no key table to leak — and equally,
anything holding `VERDICT_API_KEY_SECRET` can recompute every workspace's legacy key on demand,
which is the weakness `efv2` removes. The slug rides in the clear purely as a lookup handle; the
MAC is over the workspace **id**, so a key cannot be repointed at another workspace by editing
the slug in it.

Two costs of that design remain, and the third is fixed:

1. ~~**Rotation is fleet-wide, not per-tenant.**~~ **Each workspace can now revoke its own
   legacy key** from settings, leaving every other workspace's untouched. Rotating
   `VERDICT_API_KEY_SECRET` is still fleet-wide and is still how you invalidate all of them at
   once; set the old value as `VERDICT_API_KEY_SECRET_PREVIOUS` — both are accepted on verify,
   only the current one is minted from — so live integrations survive while you reissue.
2. **Renaming a workspace invalidates its legacy key**, because the slug no longer resolves.
   Intended rather than a bug: the slug is the render subdomain and is documented as effectively
   permanent. `efv2` keys are looked up by their own id and survive a rename.
3. **The legacy key's audit trail is coarser.** There is only ever one per workspace, so several
   callers sharing it stay indistinguishable. One `efv2` key per integration is what separates
   them.

If you are standing up a new deployment with no legacy integrations, leave
`VERDICT_API_KEY_SECRET` unset and use `efv2` keys only. Every workspace's legacy key is then
unmintable and unverifiable, which is the strongest position available.

### 3.2 Database

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | the local Docker database, in development only | **The role in it must not be a superuser and must not have `BYPASSRLS`** — §2.1. In production, unset means the app refuses to start rather than falling back to a dev database |
| `DB_TARGET` | `local` | `local` reads `DATABASE_URL`; `neon` reads `NEON_DEV_DATABASE_URL`. The `:neon` npm scripts set it for you |
| `NEON_DEV_DATABASE_URL` | — | Only read when `DB_TARGET=neon` |
| `DATABASE_POOL_MAX` | `10` | Connection pool ceiling per process |
| `ENDPOINT_APP_DB_PASSWORD` | — | Read only by `scripts/db-create-app-role.mts`. Never read by the app |

### 3.3 Public URLs

Both are **baked into the client bundle at build time**, so set them before you build, not
before you start.

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://endpointforms.com` | Canonical origin for absolute links, canonicals and the sitemap |
| `NEXT_PUBLIC_RENDER_DOMAIN` | `endpointforms.app` | The registrable domain customer forms are served from. Deliberately not a subdomain of the marketing site — `docs/05` §4.4 |

### 3.4 Sign-in providers — all optional

Email and password works with none of these set, and is the primary way in.

| Variable | Notes |
|---|---|
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Both must be set for the Google button to appear |
| `AUTH_EMAIL_FROM` | Sender on the magic-link email. Default `Endpoint Forms <login@endpointforms.com>` |
| `AUTH_IP_SALT` | Salts the sign-in rate limiter's IP hash. Falls back to `SUBMISSION_IP_SALT`, then to a built-in constant |

### 3.5 Outbound email — optional

| Variable | Notes |
|---|---|
| `RESEND_API_KEY` | Without it the email destination fails with a `configuration` error naming the variable. It does not queue, it does not pretend, and it does not report success |
| `MAIL_FROM` | Sender on submission notifications. Default `Endpoint Forms <notifications@endpointforms.com>` |

There is no SMTP transport. §7.

### 3.6 Submission handling

| Variable | Default | Notes |
|---|---|---|
| `ENDPOINT_DEFAULT_THANKS_URL` | `/thanks` | Where a browser form post lands when the form names no `_redirect`/`_next`. Resolved against the request URL, so a relative path works |
| `VERDICT_DEFAULT_CURRENCY` | `USD` | Assumed when an outcome carries a value but no currency code. **Read once at process start**, so changing it needs a restart |
| `ALLOW_INSECURE_DESTINATIONS` | off | Set to `1` to permit `http://` destination URLs. Off by default because a delivery carries leads and a signing secret. This is the flag for delivering to a service on your own network |
| `ALLOW_PRIVATE_DESTINATIONS` | off | Set to `1` to permit loopback and private-range destination hosts. Used by the test suite; set it in a self-host only if you deliberately deliver to a private address |

### 3.6a File uploads — on by default, no configuration

Attachments are stored **in Postgres**, in the same transaction as the submission
they belong to. There is no bucket, no object-storage credential and no fourth
service: a self-hosted instance takes files with nothing set. `docs/21` §"Uploaded
bytes live in Postgres" explains why that was chosen over a bucket and what it
costs.

| Variable | Default | Notes |
|---|---|---|
| `UPLOAD_LINK_SECRET` | falls back to `AUTH_SECRET` | Signs download links. **With neither set, a production instance refuses file uploads rather than accepting bytes it cannot hand back.** Outside production a fixed dev key is used |
| `UPLOAD_MAX_FILE_BYTES` | `4194304` (4 MiB) | One file |
| `UPLOAD_MAX_TOTAL_BYTES` | `4194304` (4 MiB) | Every file in one submission, added up |
| `UPLOAD_MAX_FILES` | `10` | File parts per submission |
| `INGEST_MAX_MULTIPART_BODY_BYTES` | `4456448` (4.25 MiB) | The whole multipart envelope. Larger than the file caps so the part headers and the ordinary text fields fit |
| `UPLOAD_ALLOWED_TYPES` | unset — everything accepted | Comma-separated MIME types; `image/*` matches a family. See below |
| `UPLOAD_RETENTION_DAYS` | `90` | `0` keeps files indefinitely |

**The defaults are pinned to Vercel, and a self-host can raise them.** A Vercel
function refuses a request body over 4,500,000 bytes before any of our code runs,
so the envelope sits just under it — past that number the submitter would see a
platform error page instead of our sentence explaining what to do. Behind your
own proxy there is no such ceiling. Two things to know before you raise them: the
body is buffered whole in memory, so the cap multiplies the memory a burst of
concurrent uploads costs; and `MAX_BODY_BYTES` (1 MiB) still governs urlencoded
and JSON posts, deliberately, so an ordinary submission does not pay for a
feature it is not using.

**`UPLOAD_ALLOWED_TYPES` is unset on purpose.** Refusing by declared MIME type
stops approximately no attacker — the type is a string the client chooses — and
does reliably stop real people, because browsers disagree about what a `.heic`
or a `.pages` is and a form that rejects a customer's actual file is a lost lead.
What makes a hostile upload harmless is how it is served: every download leaves
as `application/octet-stream`, always as an attachment, never inline, with
`nosniff` and a `default-src 'none'; sandbox` CSP. The variable exists for the
deployment with a compliance reason to take only PDFs.

**Retention needs a scheduler to be true.** `loadFile` refuses to serve a file
whose expiry has passed, so nothing is served after the date either way — but the
bytes only actually go when something calls `GET /api/v1/files/sweep` with
`Authorization: Bearer $CRON_SECRET`. `vercel.json` schedules it daily. On your
own box, a cron entry hitting that URL is the whole requirement. **Without it,
"deleted after 90 days" means "hidden after 90 days"**, which is not the same
promise.

**Refusals are refusals, never silent trims.** A file over a cap, or of a type
this deployment refuses, fails the **whole submission** with a `413` or a `415`
naming the file. That is deliberate: a browser form post is answered with a
redirect to a thank-you page, which has nowhere to carry "we kept your message
and binned your CV". A refusal the submitter can read and act on beats a success
that lied.

### 3.7 Rate limits

All are optional and all take a positive integer; a bad value logs a warning and uses the
default. Windows are 60 seconds except the auth ones, which are 15 minutes.

| Variable | Default |
|---|---|
| `INGEST_RATE_LIMIT_ENDPOINT_PER_MINUTE` | `300` |
| `INGEST_RATE_LIMIT_IP_PER_MINUTE` | `60` |
| `INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE` | `20` |
| `VERDICT_RATE_LIMIT_WORKSPACE_PER_MINUTE` | `600` |
| `VERDICT_RATE_LIMIT_IP_PER_MINUTE` | `300` |
| `AUTH_RATE_LIMIT_EMAIL_PER_WINDOW` | `10` per 15 min |
| `AUTH_RATE_LIMIT_IP_PER_WINDOW` | `50` per 15 min |
| `AUTH_RATE_LIMIT_EMAIL_IP_PER_WINDOW` | `10` per 15 min |

Counters are **per-process and in-memory**. Behind more than one instance the effective ceiling
is the limit times the instance count, and the limiter fails open under memory pressure. Put a
real rate limiter in front of a public deployment.

### 3.8 This deployment's own waitlist

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_WAITLIST_ENDPOINT_URL` | The form endpoint the browser posts waitlist signups to |
| `WAITLIST_ENDPOINT_URL` | Lets the server half post somewhere other than what is baked into the client bundle. Falls back to the public one |

With neither set, a development instance appends to a gitignored `.waitlist.jsonl`, and a
production instance refuses the signup honestly rather than claiming a success it cannot deliver.

### 3.9 What runs with nothing but the four secrets

Email and password sign-in, forms, submissions, the Manifest surface, the outcome API, and the
whole marketing site. Google sign-in, magic links and email delivery are each opt-in, and each
says so plainly when it is not configured.

> **A note on `.env.example`.** A committed `.env.example` mirroring this section is intended and
> is not in the tree yet. Nothing above depends on it — the tables here are the source of truth,
> and `scripts/setup.sh` writes a working `.env.local` without reading any template.

---

## 4. A hosted Postgres instead of Docker

```bash
# 1. Point DB_TARGET at the hosted database
#    NEON_DEV_DATABASE_URL=postgres://…   (in .env.local)

# 2. Create a non-superuser app role. This is not optional — read §2.1.
ENDPOINT_APP_DB_PASSWORD='…' npm run db:create-app-role:neon

# 3. Repoint NEON_DEV_DATABASE_URL at the new role, then:
npm run db:migrate:neon
npm run test:db:neon
```

`scripts/db-create-app-role.mts` verifies the result and **refuses to report success** if the
new role can still bypass row-level security. Do not skip step 3's `test:db:neon` — it is the
check that would have caught the Neon problem the first time.

> `NOSUPERUSER` and `NOBYPASSRLS` are deliberately not passed to `CREATE ROLE` there: only a
> superuser may set either attribute, even to turn it off, and the provisioned owner is not one.
> Both are the default for a new role, so the script asks for neither and verifies the result
> instead.

Only `postgres.js` over the ordinary Postgres wire protocol is used — never a
provider-specific serverless driver. One driver behind one set of migrations is how local and
hosted stay the same thing.

**Not verified by this document:** the hosted path above has not been executed on a fresh Neon
project as part of this write-up. The local Docker path has.

---

## 5. Everyday commands

| | |
|---|---|
| `npm run dev` | Development server on :3000 |
| `npm run verify` | lint, typecheck, build and tests — **one honest exit code** |
| `npm run db:up` / `db:down` | Start / stop Postgres |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Rebuild the sample workspace |
| `npm run db:reset` | Wipe the volume and rebuild from scratch |
| `npm run db:studio` | Browse the database |
| `npm run db:generate` | Generate a migration from a schema change |

`npm run verify` is the one that matters. It checks each step by exit code and prints a summary
that cannot be misread.

---

## 6. Production notes

These are notes, not a deployment guide, and none of them have been executed against a
production self-host as part of this document.

- Set all four secrets. In production the app refuses to fall back to the local development
  database if `DATABASE_URL` is unset, rather than papering over a misconfiguration.
- Set `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_RENDER_DOMAIN` before building — both are baked
  into the client bundle at build time.
- **Serve customer forms from a different registrable domain than the app.** Not a subdomain: a
  separate domain. The session cookie is host-only by design, and a marketing site carrying ad
  pixels must never share a cookie domain with customer form traffic. See `docs/05` §4.4.
- Rate-limit counters are per-process and in-memory. Behind more than one instance the effective
  ceiling is the limit times the instance count, and the limiter fails open under memory
  pressure. Put a real rate limiter in front of a public deployment.
- Run the migrations on deploy. `npm run db:migrate` is a plain script with no interactive step,
  callable from a container entrypoint.

---

## 7. What self-hosting does not give you

An honest limits section is worth more than an omission.

| | Self-hosted | Hosted |
|---|---|---|
| Forms, submissions, provenance, outcomes, destinations | ✅ | ✅ |
| The Manifest (MCP) surface | ✅ | ✅ |
| The outcome API | ✅ | ✅ |
| Multi-workspace tenancy with RLS isolation | ✅ | ✅ |
| **TLS fingerprinting for the form-surface origin signal** | **possible — see below** | ❌ not available |
| Email delivery | needs a Resend API key | included |
| **File uploads** | ✅ no configuration | ✅ |
| Backups, upgrades, uptime | yours | ours |
| Support | GitHub issues | included |

Two of those deserve more than a table cell.

**TLS fingerprinting is the one thing self-hosting can do that hosted cannot.** JA3/JA4 is the
strongest available signal for separating a browser from software imitating one, because the
ClientHello is produced by the TLS stack rather than by the request-building code. It is
unreachable on a hosted deployment because TLS terminates at the platform edge. Behind a proxy
you control, it becomes possible. It is not implemented yet in either case — it is named here
as the honest upgrade path, not as a feature. See
[`docs/27-provenance.md`](./27-provenance.md).

**There is no SMTP transport.** Outbound email goes through Resend's HTTP API. Without
`RESEND_API_KEY` the email destination fails with a `configuration` error naming the variable —
it does not queue, it does not pretend, and it does not report success. A self-hoster who needs
SMTP has a real gap, and it is written down rather than papered over.

### Also missing, in both

- ~~**No file uploads.**~~ Built in #66. Attachments are stored in Postgres in the same
  transaction as the submission, downloaded through a signed expiring link, and swept on a
  retention schedule. §3.6a. **A self-hoster gets the whole feature with nothing configured** —
  the one thing to add is a cron on `/api/v1/files/sweep`, without which retention hides files
  rather than deleting them.
- **No password reset flow yet.**
- **Rate limiting is per-process**, as above.
- **Outcome API keys cannot be revoked per workspace**, and there is no per-key audit trail.
  Rotating `VERDICT_API_KEY_SECRET` invalidates every workspace's key at once, and renaming a
  workspace invalidates its key.

---

## 8. Troubleshooting

**`Postgres did not become healthy`** — usually port 5433 is already taken. `docker compose logs
postgres` says. The compose file deliberately uses 5433 rather than 5432 so it does not collide
with a Postgres already running on the host.

**`The endpoint role does not exist in this Postgres`** — `docker/postgres/init.sql` only runs
on an empty data volume, so this means the volume predates that file:

```bash
docker compose down -v && bash scripts/setup.sh
```

**`The endpoint role can bypass row-level security`** — the setup script is refusing to continue,
and it is right to. Read §2.1, then `docker compose down -v && bash scripts/setup.sh`.

**`tables with FORCE ROW LEVEL SECURITY match workspaceScopedTableNames` fails** — your database
is behind the schema. The test compares the tables the code declares as workspace-scoped against
the tables actually protected in the database, so a new table that has not had its migration
applied shows up here as a diff. Run `npm run db:migrate` and re-run. Worth knowing that this is
the assertion doing its job: a workspace-scoped table that reaches production without RLS is
readable across tenants.

**Tests pass but tenant isolation seems wrong** — check `rolsuper` and `rolbypassrls` on the role
in your `DATABASE_URL`. This is the failure mode where everything looks fine. §2.1.

**`npm run build` fails asking for `DATABASE_URL`** — that is a regression of the bug in §2.2.
It should never happen; please open an issue.

**Signing in as the seeded user** — you cannot. `avery@northwind.example` has no password. The
seed exists to give the database a realistic shape, not a login. Sign up at `/signup` and create
your own workspace.

---

## 9. Licence

AGPL-3.0 ([`LICENSE`](../LICENSE)). Run it, modify it, host it. If you offer it to others over a
network, the AGPL requires you to make your modified source available to those users.

The [Manifest specification](./25-manifest-spec.md) in particular is meant to be copied. A
standard is only useful if other people implement it.
