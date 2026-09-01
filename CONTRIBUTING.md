# Contributing

Endpoint Forms is AGPL-3.0. The core stays open and self-hostable; the hosted version is the
commercial offering.

## Right now

**Outside pull requests are not being merged yet.** The foundations are still moving too fast
for a PR to be a good use of your time — you would rebase more than you would build.

What is genuinely useful today:

- **Issues.** Bugs, confusing behaviour, a claim in the docs that does not match what the code
  does. The last one especially.
- **Self-hosting reports.** Follow [`docs/24-self-hosting.md`](docs/24-self-hosting.md) and tell
  us where it broke. Self-hosting is the licence's credibility, so a step that does not work is
  a real bug.
- **Manifest implementations.** [`docs/25-manifest-spec.md`](docs/25-manifest-spec.md) is meant
  to be copied. If you implement it and something in the spec is ambiguous, that is a bug in the
  spec.

## Getting set up

```bash
git clone https://github.com/coreyhaines31/endpointforms.git
cd endpointforms
bash scripts/setup.sh
npm run dev
```

Needs Node 22+ and Docker. Details, and the two traps worth knowing about, are in
[`docs/24-self-hosting.md`](docs/24-self-hosting.md).

## Before you say something passes

```bash
npm run verify
```

One command. Lint, typecheck, build and tests, each checked **by exit code**, with a summary
that cannot be misread.

**Never confirm a build by grepping its output.** `next build` prints "Compiled successfully"
*before* it type checks and *before* it collects page data, so that string appears on builds
that then fail. A broken build sat on `main` for hours because of exactly that. `$?` after a
pipe has the same problem — it reports the last command in the pipeline, not the one you care
about.

For frontend changes, passing checks are not enough. Open it, screenshot it, and look at the
image in both light and dark themes. A computed style confirms the code does what you wrote, not
what was asked.

## Two invariants

Both have already been broken once. Both fail invisibly.

**1. The build must never require a database.** `npm run build` has to work on a clean checkout
with no `DATABASE_URL` and no secrets. `.github/workflows/verify.yml` builds with neither, on
every push, specifically to keep this honest. If you add a module-scope call that resolves the
database URL, the build starts passing on Vercel and failing everywhere else. See
[`docs/24-self-hosting.md`](docs/24-self-hosting.md) §2.2.

**2. The app must never connect to Postgres as a superuser.** Tenant isolation is row-level
security, and a superuser silently ignores `FORCE ROW LEVEL SECURITY`. Connect as one and there
is no isolation at all, while every test still passes. See §2.1 of the same document, and run
`npm run test:db` — that is the check that catches it.

## Code

- Server Components by default; Client Components only when genuinely needed
- Server Actions for mutations
- `type` over `interface`
- Validate with Zod
- `cn()` for conditional classes; mobile-first
- `@/` resolves to `src/`
- Application code must not import `unsafeDb` — go through `withWorkspace()` in
  `src/db/scoped.ts`. An ESLint rule enforces this, so reaching for it is a deliberate act
  rather than an accident in a hurry.

Comments explain *why*, not *what*. The existing ones are unusually long on purpose: several of
them are the only record of a trap that cost hours. Match that when the reason is not obvious
from the code, and skip the comment entirely when it is.

## Writing about provenance

If you touch anything that describes `Human · Agent · Unverified` — code comments, docs, error
messages, copy — read [`docs/27-provenance.md`](docs/27-provenance.md) first, and
[`docs/23-origin-findings.md`](docs/23-origin-findings.md) if you are changing a claim.

The short version, because it is easy to get wrong:

- **`agent` is structural.** Calling the MCP surface *is* the declaration. Nothing to forge.
- **`human` is heuristic and forgeable.** Plain `curl` with copied Chrome headers is stamped
  `human`. Measured, reproduced, written down.
- The third value is **`Unverified`**, never "suspected bot" or anything else that asserts what
  the caller is.
- **Never write, or imply, that Endpoint detects bots.** It does not, and saying so would be a
  false claim about a security property.

## Branches and commits

`main` (production) → `development` (working branch) → `feature/*` and `fix/*`.

Never commit directly to `main` or `development`. Branch, then open a PR into `development`.
Branch names carry the issue number: `feature/123-short-description`,
`fix/456-short-description`.

Commit messages say **why**. The diff already says what.

## Security

Do not open a public issue for a vulnerability. Use GitHub's private security advisory reporting
on the repository.

One thing that is *not* a vulnerability, because it is documented behaviour: a `human` origin
stamp can be forged with one `curl` command carrying copied browser headers. That is stated in
[`docs/27-provenance.md`](docs/27-provenance.md), asserted in the test suite on purpose, and
never claimed otherwise. Origin is a provenance record, not a security control.

## Licence

By contributing you agree your contributions are licensed under the AGPL-3.0, the same as the
rest of the project.
