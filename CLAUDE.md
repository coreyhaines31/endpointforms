# Endpoint Forms — project instructions

## What this is

An open-source form builder that optimizes for **revenue, not submissions**. Positioning line: *"Your form isn't the endpoint. The closed deal is."*

Two differentiators, in priority order:

1. **Outcome-weighted split testing** — every submission carries a downstream outcome (won/lost/disqualified + value) from CRM sync or an outcome webhook. Variants rank on quality-adjusted conversion rate, not completion rate. Won-deal values push back to ad platforms so bidding optimizes on revenue.
2. **Agent-native capture** — one form definition publishes both a human UI and a machine-callable MCP/WebMCP tool surface. Every submission is stamped with provenance (human / identified agent / suspected bot). This doubles as the anti-fake-lead mechanism.

Substance is #1. Hook is #2. Don't let the hook eat the substance in copy.

## Current phase — MARKETING ONLY

**Do not build product features yet.** This repo is currently the marketing site and waitlist. Phase order:

1. Repo + scaffold ✅
2. Positioning, brand, site copy — via the marketing skills
3. Marketing site + waitlist
4. Product (separate phase, explicitly gated)

If asked to build a form builder feature, confirm the phase has changed first.

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
