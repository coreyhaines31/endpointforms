# Endpoint Forms

**An open-source form builder that optimizes for revenue, not submissions.**

> Your form isn't the endpoint. The closed deal is.

Every form builder on the market reports the same number: completion rate. But nobody is paid on completion rate. You get paid on deals that close — and the two regularly point in opposite directions. A form variant that converts 40% better can quietly produce worse leads, and every tool in the category will congratulate you for it.

Worse, completion rate cannot tell a buyer from a bot. Both submit. Both get counted. Both look like success right up until sales starts calling.

Endpoint Forms is built on a different premise: a submission is not an outcome, and the only honest way to judge a form is by what its submissions turned out to be worth.

## Two things that make this different

**1. Your form knows which door was used.**
Every Endpoint form publishes two surfaces from one definition: a human UI, and a machine-callable tool surface (MCP / WebMCP) an agent can submit against directly — no DOM scraping, no brittle selectors. Because we know which surface was used, every submission is stamped with provenance: **Human, Agent, or Unverified**. The mechanism that lets legitimate agents through is the same one that records that they came through it.

**The two halves of that are not symmetric, and we are precise about it.** `Agent` is structural — calling the tool surface *is* the declaration, so there is nothing to forge. `Human` is a judgement from request headers, and headers are set by the caller: plain `curl` with copied Chrome headers is stamped Human. We have measured this, written it down, and asserted the failure in the test suite on purpose.

**Endpoint does not detect bots and we never claim it does.** What it does is separate automation that did not try to look like a browser — which is most commodity form spam — from browser sessions, give real agents a real door, and store its reasons so the judgement is auditable a year later. The full model, with the numbers: [`docs/27-provenance.md`](docs/27-provenance.md).

This matters more every month. Automated requests are now roughly 57% of HTML traffic, bad bots were 40% of internet traffic in 2025, and around 30% of leads bought from third-party vendors are outright fake — all of it arriving in your dashboard labeled "conversion."

**2. The form learns from what happened next.**
Submissions carry a downstream outcome — won, lost, disqualified, and a value — synced from your CRM or posted to an outcome webhook. Variants rank on *quality-adjusted* conversion rate, so the variant that produces pipeline wins even when it produces fewer submissions.

Plenty of good marketers already pipe outcomes back to their ad platform. That loop teaches the ad platform who to target and teaches the form nothing. Endpoint closes the other half: which variant, which question, which field.

## Status

**Pre-launch.** The marketing site is built; the product is being built now. Positioning and brand are settled and live in [`docs/`](docs/).

## Run it yourself

Needs **Node 22+** and **Docker**. Nothing else.

```bash
git clone https://github.com/coreyhaines31/endpointforms.git
cd endpointforms
bash scripts/setup.sh
npm run dev
```

Then open <http://localhost:3000> and sign up at `/signup`.

`scripts/setup.sh` installs dependencies, generates the four secrets, starts Postgres, applies the migrations, seeds a sample workspace, and verifies that the database role the app connects as **cannot bypass row-level security** — which is the one mistake that switches off tenant isolation while every test still passes.

It is idempotent. `--no-seed` for an empty database, `--dev` to start the server when it finishes, `--help` for the rest.

If you run several projects at once, [portless](https://github.com/vercel-labs/portless) avoids port collisions:

```bash
npx portless endpointforms npm run dev
# → http://endpointforms.localhost:1355
```

Full guide, including a hosted Postgres, production notes, and an honest account of what self-hosting does not give you: [`docs/24-self-hosting.md`](docs/24-self-hosting.md).

## Documentation

| | |
|---|---|
| [Self-hosting](docs/24-self-hosting.md) | Run your own instance |
| [The Manifest specification](docs/25-manifest-spec.md) | The MCP surface every form publishes — the public protocol |
| [HTTP API](docs/26-api.md) | The submission endpoint and `POST /api/v1/verdict` |
| [Provenance](docs/27-provenance.md) | What Human · Agent · Unverified means, and what it does not |
| [Origin findings](docs/23-origin-findings.md) | The adversarial write-up behind that model |
| [Contributing](CONTRIBUTING.md) | |

## Open source

Endpoint Forms is licensed under the [GNU AGPL v3](./LICENSE).

The core is, and will remain, open source and self-hostable. A managed hosted version will be offered for teams who would rather not run it themselves. The agent-facing capture spec in particular is meant to be copied — a standard is only useful if other people implement it.

## Tech stack

| | |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | Postgres, Drizzle ORM, row-level security for tenant isolation |
| Auth | Auth.js — email and password, Google, magic link |
| Hosting | Vercel (hosted), anywhere that runs Node and Postgres (self-hosted) |

## Checks

```bash
npm run verify
```

One command: lint, typecheck, build and tests, each judged **by exit code**, with a summary that cannot be misread. `next build` prints "Compiled successfully" before it type checks, so grepping its output reports a passing build for one that fails — this exists because that cost us hours.

CI runs the same checks on every push, and **builds with no `DATABASE_URL` and no secrets**, so a green run proves a stranger can clone the repo and build it. Vercel's check only proves it builds with Vercel's environment variables set.

## Contributing

Outside pull requests are not being merged yet — the foundations are moving too fast for that to be a good use of your time. Issues, self-hosting reports, and Manifest implementations are very welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
