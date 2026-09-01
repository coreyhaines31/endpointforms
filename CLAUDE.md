# Endpoint Forms — project instructions

## What this is

An open-source form builder that optimizes for **revenue, not submissions**. Positioning line: *"Your form isn't the endpoint. The closed deal is."*

**Read `docs/00-positioning-spine.md` before writing any copy or marketing doc.** It holds
the settled decisions — category, ICP, enemy, reframe, anti-positioning, vocabulary. Treat it
as binding.

Two capabilities, in message order:

1. **Provenance on every submission** — one form definition publishes both a human UI and a
   machine-callable MCP/WebMCP tool surface, so we know which was used. Each submission is
   stamped Human / Agent / Unverified. This leads the messaging because
   spam and junk leads is the angriest complaint in the category and this is the thing our
   architecture uniquely solves.
2. **Outcome-weighted optimization** — submissions carry a downstream outcome (won/lost/
   disqualified + value) from CRM sync or an outcome webhook. Variants rank on
   quality-adjusted conversion rate. The form learns from the outcome.

**Hard constraint:** do NOT lead with "close the loop with your ad platform." Research
falsified it as a wedge — competent PPC practitioners already do this via offline conversion
import, and claiming it puts us against HubSpot/WhatConverts/CallRail. The unclaimed half is
that those loops teach the ad platform and teach the *form* nothing. That's the only half we
claim.

## Current phase — MARKETING ONLY

**Do not build product features yet.** This repo is currently the marketing site and waitlist. Phase order:

1. Repo + scaffold ✅
2. Positioning, messaging, brand ✅ — see `docs/`
3. Keyword research, site architecture, copy
4. Marketing site + waitlist
5. Product (separate phase, explicitly gated)

Tracked as GitHub issues; `ROADMAP.md` mirrors them (`npm run roadmap` to resync).

If asked to build a form builder feature, confirm the phase has changed first.

## Delivering work for review

Anything Corey reviews — positioning, brand, keyword research, site architecture,
competitive analysis, strategy docs — ships as an **HTML Artifact**, not as terminal
markdown. He demos this project on camera and terminal scrollback reads badly.

Write the durable markdown into `docs/` as the source of truth **and** publish an Artifact
as the review surface. Both, not either. Load the `artifact-design` skill first, and
screenshot-verify the page before handing over the link.

Terminal text is still right for status updates, short answers, and questions.

## Carry into Part 2

**Endpoint collects its own waitlist** (issue #24). This is the plan, not a later
nice-to-have. We are **not** wiring a third-party ESP — the waitlist form on the live site
becomes the first form the product ever handles.

Ten placements are already built and waiting: the waitlist in two spots, plus 8 calculators
whose inputs were deliberately typed and centralised so they could be swapped. `saveSubscriber()`
in `src/lib/waitlist-store.ts` is the single sink; swapping it is one function.

Until then the live site's waitlist refuses honestly rather than claiming a success it can't
deliver. That is the intended interim state, and it is lossy — every day the app doesn't exist
is signups not captured. That's the argument for building the submission path early.

That last part matters more than the demo: **Risk 1 in `docs/01-positioning.md` — that
provenance may not actually distinguish a bot from a human — is the highest-severity risk in
the whole position, and it is CONFIRMED, not hypothetical.** Plain `curl` carrying copied
Chrome headers gets stamped `human`; see `docs/23-origin-findings.md`. Four copy claims were
narrowed as a result.

The two halves of the claim are not symmetric, and any copy that treats them as equal is wrong:
- **Agent** is structural. An agent calling the MCP surface (#32) *declares itself by which
  surface it called*. That holds up, and was demonstrated end to end.
- **Human** is heuristic, and forgeable by anyone who can copy headers. Never write copy that
  promises we detect bots.

A public site with an argument essay on it will attract humans, agents and bots. Better to keep
finding out on our own form than on a customer's — which is what #24/#33 is for.

Also carried forward:
- `saveSubscriber()` in `src/lib/waitlist-store.ts` is the single sink for waitlist signups.
  **Endpoint is the only sink.** There is no third-party ESP in this path and none is to be
  added — not as a fallback, not "if configured", not behind an env var. When the Endpoint path
  fails, the form refuses honestly, which is what it already does in production today. Kit was
  removed for this reason; do not reintroduce it or any replacement.
- Forms must render on their own registrable domain, not a subdomain of the marketing site.
  `docs/05` §4 has the reasoning: our marketing site carries ad pixels, and customer form
  traffic must never share a cookie domain with our analytics vendor.

## Verifying work — do not skip this

**Run `npm run verify` before claiming anything passes.** It runs lint, typecheck, build and
tests, checks each by **exit code**, and prints a summary that cannot be misread.

Never confirm a build by grepping its output. `next build` prints **"Compiled successfully"
before it type checks and before it collects page data**, so that string appears on builds that
then fail. A broken build sat on `main` for hours because of exactly that — the app needed
`DATABASE_URL` to compile, which passed on Vercel where the var is set and failed everywhere
else. Same trap with `$?` after a pipe: it reports the last command in the pipeline, not the
one you care about.

Two independent guards now exist so this cannot recur silently:
- `npm run verify` — one command, honest exit code
- `.github/workflows/verify.yml` — runs on every push and PR, **with no secrets and no
  `DATABASE_URL` during the build step**, so it proves a stranger can clone and build the repo.
  Vercel's check only proves it builds with Vercel's env vars set.

**A test that asserts an absence proves nothing until you have shown it can be non-empty.**
An empty result set is equally consistent with "the guard works" and "the fixture wrote nothing",
and those are not the same finding. The fix is cheap — about fifteen lines: break the thing the
test depends on, confirm the assertion goes red, restore it in a `finally`. This is how the
row-level-security tests are written, and it is why their passing means anything. The same shape
applies to any assertion of the form "X does not appear": a leak test, a drift test, an
SSRF guard, a check that a placeholder never reaches an agent tool.

The general version: **when a check passes, ask what else would produce that same green.** Every
verification failure in this project has been a check measuring the wrong thing rather than a
missing check — `Compiled successfully` printed before the failing step, an SSRF test calling a
guard with a spelling the URL parser never emits, `$?` reading a pipe's last command, a
clean-clone test silently reusing an already-migrated database.

One more trap, because it produced a check that reported clean while missing a file: a
repo-wide `grep --include="*.ts" --include="*.tsx"` **does not match `.mts`**. This project runs
its seed, its migrator and its entire test suite from `.mts` files, so a TypeScript include list
silently skips all of them. When renaming or auditing across the repo, grep with no `--include`
filter and exclude `node_modules` instead.

**Browser tooling fails open — check that your check took effect.** Two separate verification
attempts in this project measured nothing and passed anyway: `agent-browser network route --abort`
on `**/*.js` did not block the scripts (React still hydrated — `__reactFiber$` was on the form),
and a dark-mode emulation silently no-opped while colours were read off it as if it had worked.
Neither errored. Both would have shipped as confident false claims in exactly the place evidence
had been asked for.

So after arming any emulation or interception, assert the state it was supposed to produce before
you trust anything downstream of it: `__reactFiber$` absent for no-JS, the computed background
actually dark for dark mode, the request actually absent from the network log for a block. For
disabling JavaScript specifically, CDP's `Emulation.setScriptExecutionDisabled` is the real switch
— it is what DevTools' "Disable JavaScript" toggles — and `curl` is stronger still where the
markup is all you need, because it cannot execute a script even if one existed.

**Never click `button[type=submit]` in an authenticated page.** The sidebar's **Sign out**
is the first submit button in the DOM on every `/app` screen, so a generic selector signs you
out and lands you on `/login`. That looks exactly like the feature being broken, and it has
already cost two separate investigations — one of them a near-miss bug report against
production auth. Select by the button's text:

```js
[...document.querySelectorAll('button[type=submit]')]
  .find(b => b.textContent.trim() === 'Create workspace').click()
```

The same applies to `form` — scope to the form containing the field you just filled, not the
first one on the page.

For **frontend-only changes**, passing checks are not enough: open it in `agent-browser`,
screenshot it, and look at the image in both themes before reporting it done. A computed style
confirms the code does what you wrote, not what was asked.

## Stack

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS v4, shadcn/ui (`src/components/ui`)
- `@/` path alias → `src/`
- Deploy: Vercel

## Conventions

- Server Components by default; Client Components only when genuinely needed
- Server Actions for mutations
- `type` over `interface`
- Validate with Zod
- Use `cn()` for conditional classes
- Mobile-first
- Run `npm run lint` after code changes

## Git

`main` (production) → `development` (working branch) → `feature/*` and `fix/*`.
Never commit directly to `main` or `development` — branch first, PR in.

## Research backing this product

Two briefs, both worth reading before writing positioning or copy:

- `~/.config/makerskills/deep-research/archive/2026-08-28-form-builder-saas-wedge.md` — category landscape, competitor map, where the whitespace is
- `~/.config/makerskills/deep-research/archive/2026-08-28-form-builder-voice-of-customer.md` — verbatim customer complaints mined from reviews; use for copy language

Key competitive context: Tally owns cheap/simple (unlimited free). Typeform owns conversational but is resented on price. Heyflow and ROASForm own paid-traffic funnels. The AI-form-builder lane is crowded and thin. Do not position against Tally on price or Typeform on beauty — position on the metric.

## License

AGPL-3.0. Core stays open and self-hostable; hosted version is the commercial offering.
