# Auth, workspaces and the tenant boundary in app code

**Written 2026-08-31.** Issue #34. `docs/21-data-model.md` covers the data layer
this is built on; this covers everything above it.

---

## The shape of it

| Piece | Where |
|---|---|
| Auth.js (NextAuth v5) config | `src/auth.ts` |
| Its endpoints | `src/app/api/auth/[...nextauth]/route.ts` |
| Session helpers | `src/lib/auth/session.ts` |
| Password hashing | `src/lib/auth/password.ts` |
| What may be a password | `src/lib/auth/password-policy.ts` (imports nothing, safe for a Client Component) |
| Sign-in / sign-up against the database | `src/lib/auth/account.ts` |
| Sign-in throttling | `src/lib/auth/rate-limit.ts` |
| Slug rules and reserved words | `src/lib/workspaces/slug.ts` |
| Workspace and membership queries | `src/lib/workspaces/queries.ts` |
| Invitations | `src/lib/workspaces/invitations.ts` |
| Request-scoped glue (`requireWorkspace`) | `src/lib/workspaces/server.ts` |
| Server Actions | `src/actions/{auth,workspaces,invitations}.ts` |
| App routes | `src/app/(app)/**` |
| Sign-in routes | `src/app/(auth)/**` |
| Optimistic route protection | `src/proxy.ts` |

### URLs

```
/login                      sign in — email + password, Google when configured,
                            magic link behind a disclosure (development only)
/login/check-email          "we sent you a link"
/login/error                Auth.js error codes, rendered as sentences
/signup                     create an account with an email and a password
/app                        resolves the default workspace
/app/new                    create a workspace
/app/{slug}                 overview
/app/{slug}/members         members and invitations
/app/{slug}/settings        rename
/app/invitations/{token}    accept an invitation
/api/auth/*                 Auth.js
```

Everything authenticated is under `/app`, which is a reserved root path in
`docs/05` §4.3. When host routing for `app.endpointforms.com` arrives it can
rewrite `app.<host>/*` → `/app/*` and this layout survives unchanged.

`/app/invitations/{token}` sits under `/app` deliberately rather than at the
root: it inherits the sign-in redirect, so an invitation clicked from a cold
inbox survives the round trip through `/login` instead of being lost.

---

## The decisions

### Email and password is the primary way in

**Reversed 2026-08-31.** This document and `docs/20-product-plan.md` used to rule
passwords out: magic link and Google, neither of which creates a credential we
have to store, rotate, reset, rate-limit or disclose a breach of.

What overturned it is that the magic link **cannot be delivered in production**
until a mail transport exists (#41), so the only auth method that works
everywhere had to be one that needs no mail. A sign-in method that works only in
development is not a sign-in method, and a product that is demoed live cannot
have a round trip through an inbox on every sign-in.

Every liability the original decision named is real. Each one has an answer, and
each answer is written out where it lives:

| Liability | Where it is answered |
|---|---|
| The hashing decision | `src/lib/auth/password.ts` — argon2id, m=19456 KiB, t=2, p=1 (OWASP), parameters written out rather than defaulted |
| Credential stuffing | `src/lib/auth/rate-limit.ts` — 10 per email and 50 per IP per 15 minutes, reusing the ingest limiter in its own keyspace |
| User enumeration | `src/lib/auth/account.ts` — "no such user", "no password on the account" and "wrong password" return the same value **after the same work**, by verifying against a decoy hash when there is no row |
| Weak passwords | `src/lib/auth/password-policy.ts` — 12 characters minimum, no composition rules, a small list of obvious ones refused |
| Reset flow | **Still owed.** Blocked on the same mail transport (#41). `setPassword()` in `account.ts` carries the `TODO`, including the part people forget: a reset must delete the account's `auth_sessions` rows, or a stolen session survives the reset that was meant to end it. The sign-in page does not offer a "forgot password" link, because there is nothing behind one. |

Magic link is kept and demoted below the password form: it costs nothing, it is
already built, and until reset exists it is the only way back into an account
whose password has been forgotten. It is hidden in production, where it throws
rather than delivering.

### Credentials and database sessions do not compose in Auth.js

Worth knowing before editing `src/auth.ts`, because it looks like a hack until
you know why it is there.

Auth.js's credentials branch is the one sign-in path **not** guarded by
`if (useJwtSession)`. Whatever `session.strategy` says, it calls `jwt.encode()`
and puts the result in the session cookie — which, under `strategy: "database"`,
is then handed to `adapter.getSessionAndUser()`, finds no row, and signs the
person straight back out. `assert.js` only raises `UnsupportedStrategy` when the
providers are credentials-*only*, so with Google and magic link registered
alongside there is no warning at all.

The two ways out were to switch to JWT sessions, or to make `encode` return
something the database strategy understands. The first trades away revocation
(see below), so `jwt.encode` mints a real session row through the same adapter
every other provider uses and returns its opaque token. Under
`strategy: "database"` every other `jwt.encode` and every `jwt.decode` call site
in `@auth/core` is behind a JWT-strategy check, which is what makes this a
targeted override rather than a global one — and a marker set in `callbacks.jwt`
makes `encode` throw if it is ever reached from anywhere else.

### Sessions live in the database

A JWT cannot be revoked. With a session row, removing someone from a workspace or
signing out a stolen laptop takes effect on the next request. The cost is one
query per request, which for an authenticated dashboard is nothing. The session
cookie holds an opaque id, not a token containing claims.

### Cookies are host-only, and that is load-bearing

The app will be `app.endpointforms.com`. Customer forms render on
`endpointforms.app`, **a separate registrable domain** — that separation is the
whole reason the render domain exists (`docs/05` §4.4), because our marketing
apex carries ad pixels and customer form traffic must never share a cookie domain
with our analytics vendor.

So `src/auth.ts` sets `domain` on **no** cookie, and says so at length. Auth.js
defaults to host-only, but the failure mode of adding `Domain=.endpointforms.com`
later is silent: everything keeps working and an architectural decision has been
undone with nothing to show for it. Verified against a running server:

```
set-cookie: authjs.session-token=…; Path=/; Expires=…; HttpOnly; SameSite=Lax
```

No `Domain` attribute on any of the three cookies.

### Google linking, and why the "dangerous" flag is safe here

Someone who signed in with a password and later clicks "Continue with Google"
is the same person, and Auth.js's default — `OAuthAccountNotLinked` — strands
them with no way forward. `allowDangerousEmailAccountLinking` fixes that, and it
is named "dangerous" because linking on an address a provider never verified lets
an attacker claim an account by asserting someone else's email.

The `signIn` callback closes exactly that hole: a Google profile whose
`email_verified` is not `true` is refused outright. Linking then only ever
happens on an address Google has confirmed. **Do not remove that callback while
leaving the flag on.**

### Magic links go to the console in development, and refuse in production

There is no mail transport yet; choosing one belongs with destinations (#41), not
with sending six sign-in links a week. So `sendVerificationRequest` prints the
link to the server console — and in production **throws** rather than degrading.

Logging a sign-in link in production is an account-takeover primitive: anyone who
can read logs can sign in as anyone. It would also tell a person to check an
inbox nothing was sent to, which is the specific dishonesty this product is named
against. `/login/check-email` says where the link actually is when
`NODE_ENV !== "production"`.

The same reasoning governs invitations: nothing is emailed, so the members page
hands the inviter the link to pass on, shown once, with a sentence saying so.

### Slugs are DNS labels, and reserved words are permanent

A slug becomes `{slug}.endpointforms.app`. It is public, it ends up inside
`<form action>` attributes on customers' websites, and changing it breaks every
form they have shipped. So:

- lowercase, alphanumeric and hyphens, no leading or trailing hyphen, 3–63
  characters — 63 being the hard limit on a DNS label;
- `xn--` prefixes refused, because a punycode label renders as something other
  than what was typed;
- a **reserved list**, deliberately generous. The first customer to claim `www`
  or `api` takes a hostname we need forever and cannot get back without breaking
  them.

The list covers `docs/05` §4.3's reserved root paths (`api app login signup
logout dashboard f r embed _next well-known`), infrastructure and mail
hostnames, RFC 2142 role addresses, our own present and planned surfaces,
environment names, and the two route segments the app itself uses (`new`,
`invitations`) so a workspace can never shadow `/app/new`. It is in
`src/lib/workspaces/slug.ts` and exercised by 51 assertions in
`tests/workspace-slug.test.mjs`.

### Owner and member, and nothing else

`docs/20` says a permissions matrix is not in the plan. Owners can invite, remove
members and rename the workspace; members can see everything else. A workspace
refuses to remove its last owner, because a workspace with no owner is a support
ticket answered by hand in the database.

### Invitations are redeemed by token, not by email address

Only the SHA-256 hash of the token is stored, so a database dump cannot be
redeemed. Redemption is authorised by the token alone: the invited address and
the address someone signs in with often differ — an alias, a personal account, a
shared inbox — and refusing on that mismatch turns a working invite into a
support ticket. Whoever holds the link was given it deliberately.

Acceptance re-validates inside the transaction with a conditional
`UPDATE … RETURNING`, so two clicks on one link race to a single row and only one
wins. Used, withdrawn, expired and fabricated tokens all resolve to the same
nothing — there is no information to gain by trying tokens.

---

## How the workspace boundary is enforced in app code

**Every workspace-scoped read and write goes through `withWorkspace()`.** The
functions in `src/lib/workspaces/` are the only place that happens, and pages and
Server Actions call them.

The chain, on every request:

1. `requireUser()` (`src/lib/auth/session.ts`) asks the database whether the
   session cookie names a live session. Memoised per request.
2. `requireWorkspace(slug)` (`src/lib/workspaces/server.ts`) resolves the slug to
   a workspace **and checks membership inside a `withWorkspace` transaction**. No
   membership, or no such workspace, both produce the same 404 — distinguishing
   them would confirm to a stranger that `acme` exists, which is a free customer
   list.
3. Only the id that membership check produced is passed to a query.

Two rules make that hold under edits:

- **No action accepts a workspace id from a form.** A posted id is an attacker's
  field. Every Server Action in `src/actions/` takes the *slug*, re-runs
  `getWorkspaceAccess` against the session user, and uses the id that comes back.
- **Every page calls `requireWorkspace` itself** rather than trusting its layout.
  A layout can be bypassed by a future parallel or intercepted route, and "the
  parent already checked" is how a hole gets opened months later by an edit that
  looks unrelated. It is memoised, so insisting costs nothing.

### The unscoped queries, and why each one has to be

`unsafeDb` is reached in exactly three places above the data layer, all listed in
`docs/21` as legitimate:

| Query | Why it cannot be scoped |
|---|---|
| `listWorkspacesForUser` | "Which tenant is this request in?" runs before a tenant is known. Filters on the session's own `user_id`. |
| slug → workspace, in `getWorkspaceAccess` | `workspaces` is the tenant, not a tenant's data. Resolving a slug to an id cannot require the id. The membership check that follows *is* scoped. |
| `findLiveInvitation` | The token is what names the workspace. Every write that follows is inside `withWorkspace` on the id the invitation carries. |

### `server-only`, and what replaced it

`queries.ts` and `invitations.ts` carry no `server-only` marker and use relative,
extension-bearing imports (`../../db/client.ts`) rather than the `@/` alias. Both
are so that `tests/workspace-access.test.mts` can load them under plain `node`:
**a test that reimplements the boundary proves the test author's version is safe
and nothing else.**

The guard that marker provided — a component pulling the database into the client
bundle — is now an ESLint rule in `eslint.config.mjs`, alongside the existing
`unsafeDb` restriction. The shapes those modules return live in
`src/lib/workspaces/types.ts`, which imports nothing at runtime, so a component
that needs to name one still can. Both rules were verified by writing a file that
violates them and watching the lint fail.

### `src/proxy.ts` is not the boundary

Next.js 16 deprecated `middleware.ts` and renamed it to `proxy.ts` — same
position in the request lifecycle, same `config.matcher`. It redirects requests
to `/app/*` that arrive with no session cookie, and sends `/signup` to `/login`.

That is a convenience, not security. A cookie's presence says nothing about
whether it names a live session and nothing at all about which workspace its
owner may read. Next's own guidance says proxy is for optimistic checks, not
session management. It is deliberately tiny for that reason: logic that looks
like security but runs before the database is the kind that gets trusted by
mistake. Host routing for the render domain belongs in this file when it arrives.

---

## The tests

| File | What it proves | Assertions |
|---|---|---|
| `tests/workspace-slug.test.mjs` | Format and reserved words, no database needed | 51 |
| `tests/workspace-access.test.mts` | A member of workspace A cannot read, update or delete workspace B's data, through the real application functions | 40 |
| `tests/tenant-isolation.test.mts` | The data layer underneath (unchanged, plus `invitations`) | 32 |

`npm test` runs all three. The access test skips loudly, like the isolation test,
when no database is configured at all.

### Verified by breaking it

Each layer was disabled in `src/db/scoped.ts` and the suites re-run.

| Break | `tenant-isolation` | `workspace-access` |
|---|---|---|
| Remove `eq(table.workspaceId, …)` from the predicate builder | **3 failures** | 40 passed |
| Remove the `set_config` call, so RLS is never armed | **18 failures** | 40 passed |
| Both at once | — | **21 failures** |

The middle column is the point: **either layer alone still holds the boundary.**
That is what defence in depth means here, and it is why the app-level test cannot
fail from a single break — with both layers intact there is no query path that
crosses a tenant. The predicate and the policies are each pinned individually by
`tenant-isolation.test.mts`, which is why that file tests `workspaceWhere`
*outside* a scoped transaction.

With both broken, the assertions that fail are exactly the ones that matter:
"A cannot resolve beta by slug", "rename of beta's endpoint from alpha's scope is
refused", "delete of beta's endpoint from alpha's scope is refused", "removing
beta's membership from alpha's scope is refused". `src/db/scoped.ts` was restored
from a copy taken before the first break and re-verified byte-for-byte.

---

## Migrations

| File | What |
|---|---|
| `0002_auth_and_invitations.sql` | `auth_accounts`, `auth_sessions`, `auth_verification_tokens`, `invitations` |
| `0003_invitations_tenant_isolation.sql` | `FORCE ROW LEVEL SECURITY` and the policy for `invitations` |

`invitations` is workspace-scoped, so it is in `workspaceScopedTables` and gets
the same policy as every other scoped table — an invitation holds an email
address someone typed into our product. The isolation test asserts that the set
of forced tables equals `workspaceScopedTableNames`, so adding a scoped table
without `0003`'s treatment fails there rather than in production.

The three `auth_*` tables carry no `workspace_id` on purpose. They are about a
person, not a tenant: one human with one session belongs to several workspaces,
and binding a session to a workspace would mean re-authenticating to switch.

### One rename in `src/db/schema.ts`

`users.emailVerifiedAt` → `emailVerified` and `users.imageUrl` → `image`. **The
SQL columns are unchanged** (`email_verified_at`, `image_url`); only the Drizzle
property names moved, because those are the names `@auth/drizzle-adapter` reads
and writes. No migration, and `npm run db:generate` produces no diff for it.

Renaming two properties bought the official, well-exercised adapter instead of a
hand-written one — an adapter bug is an authentication bug. `users.id` also
gained `$defaultFn(newId)`, which is runtime-only and emits no DDL, so rows the
adapter inserts keep the UUIDv7 convention instead of getting a v4 from
`crypto.randomUUID()`.
