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

## 3. Configuration

`.env.example` lists every variable the code actually reads — derived by grepping `process.env`
across `src/` and `scripts/`, not from memory — each with a one-line comment saying what happens
if you leave it out.

`scripts/setup.sh` writes a working `.env.local` for you. Copy the example by hand only if you
want to fill it in yourself.

### The four secrets

Generated by the setup script. To generate one yourself:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

| Variable | What it protects | Unset |
|---|---|---|
| `AUTH_SECRET` | Session cookies. Read by Auth.js, not by our code | **Auth.js throws in production** |
| `SUBMISSION_IP_SALT` | The SHA-256 hash of submitter IPs. The raw IP is never stored | Falls back to a built-in constant, warns once in production. Hashes become guessable across deployments |
| `ORIGIN_TOKEN_SECRET` | The client token, one of the nine form-surface origin signals | Falls back to a built-in key, warns once in production. A forgeable token is a weaker signal, but refusing the submission would be a lost lead |
| `VERDICT_API_KEY_SECRET` | The outcome API keys | `POST /api/v1/verdict` answers `503` in production rather than accepting keys it cannot verify |

Note the asymmetry, which is deliberate: the two that guard *a lead* degrade rather than refuse,
because losing a lead is worse than a weakened signal. The two that guard *access* refuse.

### What runs with nothing else set

Email and password sign-in, forms, submissions, the Manifest surface, the outcome API, and the
whole marketing site. Google sign-in, magic links and email delivery are each opt-in and each
say so when they are not configured.

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

- **No file uploads.** A multipart file part is described — filename, type, size — and the bytes
  are discarded. There is no attachment storage.
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
