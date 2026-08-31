# The data model

**Written 2026-08-31.** Issue #27. Source of truth is `src/db/schema.ts`; this
explains the reasoning behind it.

---

## Running it

```bash
docker compose up -d --wait   # or npm run db:up
npm run db:migrate
npm run db:seed
```

`npm run db:reset` does all three from a wiped volume. `npm run db:studio` opens
Drizzle Studio. Local Postgres **18** in Docker on **port 5433** — 5432 is left
free so this never collides with a Postgres already on the machine.

### Two targets, one schema

| Target | Selected by | Connection string |
|---|---|---|
| Local Docker | default | `DATABASE_URL`, defaulting to the compose database |
| Hosted Neon dev | `DB_TARGET=neon` | `NEON_DEV_DATABASE_URL` (in `.env.local`, gitignored) |

Every db script has a `:neon` twin that just sets `DB_TARGET`:
`db:migrate:neon`, `db:seed:neon`, `db:studio:neon`, `test:db:neon`.

**Nothing in `src/db/schema.ts` or in `drizzle/` is specific to either target.**
Both are Postgres 18 reached over TCP with the same `postgres.js` driver. Neon's
serverless driver is deliberately not used in the shared path — a second
connection implementation behind the same migrations is how two targets quietly
drift apart.

Local is pinned to Postgres 18 to match Neon's 18.6. A migration that applies on
one major version and fails on the other is exactly the thing that only surfaces
at deploy time.

Two small target-specific details live in `src/db/client.ts`, both detected
rather than configured: TLS is required for Neon, and prepared statements are
disabled when the host is Neon's `-pooler` endpoint, which is PgBouncer in
transaction mode and cannot hold them.

`.env.local` is loaded by `src/db/env.ts` when running outside Next, since plain
`node` does not read it. Variables already set in the shell win over the file.

### The connecting role must not be able to bypass RLS

This is the single most dangerous configuration mistake in the whole data layer,
and it bit **both** targets during this build.

A Postgres role with `BYPASSRLS` — or any superuser, implicitly — ignores every
policy on every table. Tenant isolation becomes inert while nothing errors:
migrations apply, queries return rows, the app looks healthy, and every workspace
can read every other workspace's submissions.

- **Docker.** `POSTGRES_USER` creates a *superuser*. `docker/postgres/init.sql`
  therefore keeps `postgres` as the unused bootstrap superuser and creates an
  ordinary `endpoint` role that owns the application database.
- **Neon.** The provisioned `neondb_owner` has `rolbypassrls = true`. Migrations
  applied perfectly and the isolation test still failed 18 assertions against an
  identical schema. `npm run db:create-app-role:neon` creates the same ordinary
  `endpoint` role there, so both targets have one role model rather than two.

  ```bash
  ENDPOINT_APP_DB_PASSWORD='<password>' npm run db:create-app-role:neon
  # then point NEON_DEV_DATABASE_URL at the endpoint role and re-run:
  npm run db:migrate:neon && npm run test:db:neon
  ```

  Note that `NOBYPASSRLS` cannot be *specified* by a non-superuser, even to turn
  it off. It is the default for a new role, so the script omits the attribute and
  verifies the result instead, refusing to report success if the role can still
  bypass.

The first assertion in the isolation test checks this and names the role, because
when it is wrong every other assertion fails too and the reason is not otherwise
visible.

---

## The tables

| Table | What it is |
|---|---|
| `workspaces` | The tenant boundary. `slug` becomes the render subdomain (#34), so it is public and effectively permanent. |
| `users` | People. No password column — magic link and Google only (#34). |
| `memberships` | User ↔ workspace, role `owner` or `member`. No permissions matrix. |
| `endpoints` | What a customer points a form at (#50). Workspace, public short ID, name. **Works with no schema.** |
| `form_schemas` | *Optional*, immutable, versioned field definitions (#51). |
| `submissions` | The central row. Values, provenance, verdict, source metadata. |
| `destinations` | Where data goes (#41). |
| `delivery_attempts` | Whether it got there, with both sides of the exchange retained (#42). |

---

## The decisions

### Endpoint-first: a schema is optional, and that is the whole architecture

An endpoint with `active_schema_version_id = null` is not a half-configured
endpoint. It is the product working as designed: you change one attribute on a
form you already have, and submissions arrive. Fields are discovered from the
payload.

Declaring a schema is what unlocks Manifest (#32), Hindsight (#45), server-side
validation and typed exports — the things Formspree structurally cannot build,
because it only ever sees posts and never knows what the form is.

Two things in the schema enforce #51's hard constraint that adding a schema must
never break an endpoint that worked without one:

- `submissions.schema_version_id` is **nullable**, and null is a normal, valid
  state rather than a defect to be backfilled.
- `form_schemas.mode` defaults to `warn`, not `strict`. A submission that does
  not match an declared schema is stored and annotated. `strict` — which
  rejects — is opt-in. If declaring a schema can start dropping submissions that
  used to succeed, we have built a footgun.

The seed demonstrates this directly: its endpoint ran for eight submissions with
no schema at all, then had one declared. Those eight rows are still there and
still readable.

### Schemas are immutable and versioned; the endpoint holds a pointer

A submission must always be readable against the exact definition it arrived
under. If editing a form could rewrite what "yes" meant in a dropdown three
months ago, every historical submission becomes a guess.

So `form_schemas` rows are append-only. There is deliberately **no `updated_at`
and no `deleted_at`** on that table — the absence is the invariant. Editing a
schema writes version N+1.

The live version is a pointer on the endpoint (`active_schema_version_id`) rather
than a flag on the version row. Activating a schema or rolling back to an earlier
one is then a single atomic `UPDATE`, "at most one active version" is true by
construction rather than by a partial index, and the version rows stay untouched.
It costs one circular foreign key between `endpoints` and `form_schemas`, which
is fine because the column is nullable.

### UUIDv7 primary keys, separate short public IDs

Primary keys are UUIDv7: time-ordered, so inserts land at the right-hand edge of
the index instead of scattering across it the way v4 does. On the highest-volume
table in the product that difference compounds.

Public identifiers are a **separate nanoid column**, never the primary key.
`endpoints.public_id` is 12 characters and appears in
`<form action=".../e/{publicId}">`; `submissions.public_id` is 16 and gets handed
to a customer's CRM for outcome matching (#43). Keeping them distinct means a
leaked public ID reveals nothing about row ordering or volume, and either can be
rotated without touching a foreign key.

### Money is `numeric`, not a float

`verdict_value numeric(18,2)` with a separate `verdict_currency`. Floats lose
cents, and a product whose entire wedge is "what was this lead worth" cannot be
approximately right about money. Drizzle returns `numeric` as a string, which is
the correct handling and should not be "fixed".

### Provenance stores reasons, not just a stamp

`submissions.origin` is `human | agent | unverified`, and `origin_reasons` is
jsonb holding the signals behind it. #30 requires that "why is this Unverified?"
be answerable, and a verdict with no reasons attached cannot answer it.

`unverified` states our confidence rather than accusing the visitor. Settled in
`docs/00-positioning-spine.md`; do not reintroduce "suspected bot".

### `awaiting` is a real verdict, and the default

Not null, not a missing row. A lead with no outcome yet is not a lost one, and
#43 makes `awaiting` a first-class visible state precisely so the difference
shows. The seed is mostly `awaiting` for the same reason — a seed where
everything is already won or lost would make the UI look like a problem we have
not actually solved.

`verdict_at` and `verdict_source` are stored alongside, which is what will let
#43 measure a workspace's median time-to-outcome and warn it honestly when its
sales cycle is too slow for the loop to work.

### Raw body alongside parsed values

`raw_body` and `raw_content_type` are kept as received. When a customer says "the
data is wrong" (#29), the raw body is the only thing that can settle whether we
mangled it or they sent it that way.

### Soft delete on endpoints, submissions and destinations

`deleted_at`, and `ws.where()` excludes those rows by default.
`ws.whereIncludingDeleted()` is there for a trash view, a restore, or an export
that should not quietly omit what someone deleted. "I deleted it and lost the
data" is a support disaster, and destinations are included because hard-deleting
one would cascade away the delivery history that explains what went wrong.

`form_schemas` is the exception, as above.

### Source metadata: UTMs as columns, click IDs as jsonb

The inbox filters on UTMs and #44 groups reports by them, so they are indexed
columns. Every ad network invents another click ID, so those go in a jsonb bag.
IP is stored **hashed**, never raw — enough to correlate abuse, not enough to be
a liability.

### Indexes

- `submissions(endpoint_id, created_at desc)` — every list query in the product.
- `submissions(workspace_id, created_at desc)`, plus `(endpoint_id, origin)` and
  `(endpoint_id, verdict)` for the inbox filters.
- A **GIN index on `submissions.values`**. Searching inside submitted values is
  plausible enough to pay for up front.
- A partial unique index on `(endpoint_id, idempotency_key)` where the key is not
  null, so double-submits collapse (#29) without every keyless submission
  colliding on a single NULL slot.
- Foreign keys are indexed, with one deliberate omission: where a table has a
  composite index led by `workspace_id`, the redundant single-column
  `workspace_id` index is left out rather than paying for it on every write.

### Composite foreign keys

Every workspace-scoped table carries `workspace_id` directly rather than reaching
it through a join — both the query helper and the RLS policies need to filter
without joining.

Denormalisation invites drift, so each child references its parent through a
**composite** foreign key on `(workspace_id, id)`, backed by a unique constraint
on the parent. A submission whose `workspace_id` disagrees with its endpoint's
cannot be inserted at all. The denormalised column is not trusted; it is proven.

---

## Tenant scoping

**A cross-tenant leak is the one bug that ends a product like this.** It is
defended three times over, and each layer catches a different mistake.

```ts
import { withWorkspace, submissions } from "@/db";

const rows = await withWorkspace(workspaceId, (ws) =>
  ws.tx.select().from(submissions).where(ws.where(submissions)),
);
```

**1. `ws.where(table)`** builds the predicate — workspace, and not
soft-deleted — so nobody writes it by hand. Extra conditions are ANDed on.

**2. Row-level security, armed for the transaction.** `withWorkspace` opens a
transaction and sets `app.workspace_id` (transaction-local, so a pooled
connection never carries one tenant into the next request). Every
workspace-scoped table has `FORCE ROW LEVEL SECURITY` and a policy keyed on that
setting. Inside the transaction, another workspace's rows **do not exist**: a
query that forgets its `where` clause entirely returns nothing rather than
everything, a fetch by primary key of another tenant's row returns nothing, an
`UPDATE` or `DELETE` aimed across the boundary affects zero rows, and an `INSERT`
stamped with someone else's `workspace_id` is refused outright.

This is the layer that actually saves us. The realistic bug is a hurried `select`
in a request handler with no predicate on it, and no amount of care with a
hand-written filter protects against a filter nobody wrote.

Outside a `withWorkspace` transaction the policies are permissive **by design**.
Migrations, the seed, and the auth query that asks which workspaces a user
belongs to all run before any workspace is known. A scheme that cannot express
those gets switched off wholesale by the first person who needs one, and then
protects nothing.

**3. `no-restricted-imports`.** `unsafeDb` lives in `src/db/client.ts` and is not
re-exported from `src/db`. Importing it from `src/app`, `src/actions` or
`src/components` fails `npm run lint`. Reaching for it is a visible, deliberate
act.

### The test

`npm run test:db` (also part of `npm test`) runs `tests/tenant-isolation.test.mts`
— two workspaces, a row in every scoped table, 32 assertions. `npm run
test:db:neon` runs the same file against Neon; **the isolation test is the real
portability check, not the migration.** Migrations applying proves the schema is
valid; only this proves it is enforced.

It also checks that the tables carrying `workspace_id` in the schema are exactly
the tables with policies on them, so adding a scoped table without wiring it up
fails here rather than in production.

With no `DATABASE_URL` set and no local database running, it prints a loud
SKIPPED banner and exits 0 so a teammate without Docker is not blocked. An
explicit `DATABASE_URL`, or `DB_TARGET=neon`, means someone chose a database and
an unreachable one is a failure.

Both layers were verified by deliberately breaking them:

| Break | Result |
|---|---|
| Remove the `set_config` call, disarming RLS | 18 failures, all in the RLS sections; the predicate sections still pass |
| Remove `eq(workspaceId)` from the predicate builder | 3 failures, all in the predicate section |

The second one is the reason `workspaceWhere` is exported and tested *outside* a
scoped transaction. Tested only from inside one, a broken predicate passes —
row-level security silently covers for it, and the codebase is down to one layer
without anyone knowing.

---

## Not built yet, deliberately

- **`variants`.** `submissions.variant_id` exists with no foreign key, so the
  first real submissions are stamped from day one and are not retroactively
  unreadable when Hindsight (#45) arrives.
- **Destination secrets.** `destinations.config` is plain jsonb. Encryption is
  #41's problem; putting a half-designed key-management scheme here would be
  worse than the gap.
- **Rate-limit counters, spam scores.** #29 and #31.
- ~~**Auth session tables.**~~ Built in #34 — `auth_accounts`, `auth_sessions`,
  `auth_verification_tokens` and `invitations`, in `0002`/`0003`. See
  `docs/22-auth-and-workspaces.md`. `invitations` is workspace-scoped and has the
  same policy as every other scoped table; the three `auth_*` tables carry no
  `workspace_id`, because a session belongs to a person rather than a tenant.
  Two property names on `users` were renamed to what `@auth/drizzle-adapter`
  expects (`emailVerified`, `image`); **the SQL columns are unchanged.**
