# Endpoint Forms

**An open-source form builder that optimizes for revenue, not submissions.**

> Your form isn't the endpoint. The closed deal is.

Every form builder on the market reports the same number: completion rate. But nobody is paid on completion rate. Marketers are paid on qualified pipeline — and the two regularly point in opposite directions. A form variant that converts 40% better can quietly produce worse leads, and every tool in the category will congratulate you for it.

Endpoint Forms is built on a different premise: a submission is not an outcome, and the only honest way to test a form is against what the lead was eventually worth.

## Two things that make this different

**1. Split tests scored on outcomes, not fills.**
Every submission carries an outcome — won, lost, disqualified, and a value — synced back from your CRM or posted to a simple outcome webhook. Variants are ranked by *quality-adjusted* conversion rate. The variant that produces pipeline wins, even when it produces fewer submissions. Won-deal values can be pushed back to ad platforms so bidding optimizes on revenue instead of form fills.

**2. Agent-native by default.**
Automated traffic is now the majority of the web, and browser agents increasingly act on a real person's behalf. Every Endpoint form publishes two surfaces from one definition: a human UI, and a machine-callable tool surface (MCP / WebMCP) that an agent can submit against directly — no DOM scraping, no brittle selectors. Every submission is stamped with provenance: human, identified agent, or suspected bot. The same mechanism that lets legitimate agents through is the one that keeps fake leads out.

## Status

**Pre-launch.** This repository currently contains the marketing site and waitlist. The product itself has not been built yet — that work starts after launch positioning is locked.

- [x] Repo + marketing site scaffold
- [ ] Positioning, brand, and site copy
- [ ] Marketing site + waitlist
- [ ] Product

Want to know when it ships? The waitlist will live at [endpointforms.com](https://endpointforms.com).

## Open source

Endpoint Forms is licensed under the [GNU AGPL v3](./LICENSE).

The core is, and will remain, open source and self-hostable. A managed hosted version will be offered for teams who would rather not run it themselves. The agent-facing capture spec in particular is meant to be copied — a standard is only useful if other people implement it.

## Tech stack

| | |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Hosting | Vercel |

## Local development

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

If you use [portless](https://github.com/vercel-labs/portless) to avoid port collisions:

```bash
npx portless endpointforms npm run dev
# → http://endpointforms.localhost:1355
```

## Contributing

Not yet — the foundations are still moving too fast for outside PRs to be a good use of anyone's time. Issues and ideas are very welcome in the meantime.
