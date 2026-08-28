# Endpoint Forms

**An open-source form builder that optimizes for revenue, not submissions.**

> Your form isn't the endpoint. The closed deal is.

Every form builder on the market reports the same number: completion rate. But nobody is paid on completion rate. You get paid on deals that close — and the two regularly point in opposite directions. A form variant that converts 40% better can quietly produce worse leads, and every tool in the category will congratulate you for it.

Worse, completion rate cannot tell a buyer from a bot. Both submit. Both get counted. Both look like success right up until sales starts calling.

Endpoint Forms is built on a different premise: a submission is not an outcome, and the only honest way to judge a form is by what its submissions turned out to be worth.

## Two things that make this different

**1. Your form knows who submitted it.**
Every Endpoint form publishes two surfaces from one definition: a human UI, and a machine-callable tool surface (MCP / WebMCP) an agent can submit against directly — no DOM scraping, no brittle selectors. Because we know which surface was used, every submission is stamped with provenance: human, identified agent, or suspected bot. The mechanism that lets legitimate agents through is the same one that keeps fakes out.

This matters more every month. Automated requests are now roughly 57% of HTML traffic, bad bots were 40% of internet traffic in 2025, and around 30% of leads bought from third-party vendors are outright fake — all of it arriving in your dashboard labeled "conversion."

**2. The form learns from what happened next.**
Submissions carry a downstream outcome — won, lost, disqualified, and a value — synced from your CRM or posted to an outcome webhook. Variants rank on *quality-adjusted* conversion rate, so the variant that produces pipeline wins even when it produces fewer submissions.

Plenty of good marketers already pipe outcomes back to their ad platform. That loop teaches the ad platform who to target and teaches the form nothing. Endpoint closes the other half: which variant, which question, which field.

## Status

**Pre-launch.** This repository currently contains the marketing site and waitlist. The product itself has not been built yet — that work starts after launch positioning is locked.

- [x] Repo + marketing site scaffold
- [x] Positioning, brand, and messaging
- [ ] Site copy, keyword research, architecture
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
