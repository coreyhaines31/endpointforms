# Endpoint Forms — project instructions

## What this is

An open-source form builder that optimizes for **revenue, not submissions**. Positioning line: *"Your form isn't the endpoint. The closed deal is."*

**Read `docs/00-positioning-spine.md` before writing any copy or marketing doc.** It holds
the settled decisions — category, ICP, enemy, reframe, anti-positioning, vocabulary. Treat it
as binding.

Two capabilities, in message order:

1. **Provenance on every submission** — one form definition publishes both a human UI and a
   machine-callable MCP/WebMCP tool surface, so we know which was used. Each submission is
   stamped human / identified agent / suspected bot. This leads the messaging because
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
the whole position, and it is currently unfalsified.** A public site with an argument essay on
it will attract humans, agents and bots. Better to find out on our own form than a customer's.

Also carried forward:
- `saveSubscriber()` in `src/lib/waitlist-store.ts` is the single sink for waitlist signups —
  swapping Kit for Endpoint is one function.
- Forms must render on their own registrable domain, not a subdomain of the marketing site.
  `docs/05` §4 has the reasoning: our marketing site carries ad pixels, and customer form
  traffic must never share a cookie domain with our analytics vendor.

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
