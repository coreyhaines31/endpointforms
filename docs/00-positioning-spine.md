# Positioning spine — decided

The shared, non-negotiable decisions every downstream doc inherits. Settled by the
research in `~/.config/makerskills/deep-research/archive/2026-08-28-*`. If a
downstream doc wants to contradict something here, flag it rather than silently diverge.

## Category

**Form builder.** We do not invent a new category. People search "form builder";
inventing a category forfeits that and forces us to teach demand we can't afford to create.
We differentiate *inside* the category, on the metric.

Category modifier when needed: *the form builder for teams who get paid on pipeline.*

## ICP

**Primary — agencies and freelancers running paid acquisition for clients.**
~20% of the complaint corpus, and by a wide margin the most specific, most quantified,
most emotional. They feel it across many accounts at once, so the pain compounds. They
also buy fast and recommend loudly.

**Primary — in-house PPC / demand-gen specialists** at B2B SMB and mid-market.
~12% of the corpus. Same pain, single account, more budget authority.

**Secondary — SMB founders running their own ads.** ~20% of the corpus but they mostly
complain about price, not outcomes. Do not design the message for them.

**Explicitly not for:** casual/one-off form users, survey researchers, enterprise
compliance buyers. Tally, Perspective, and FormAssembly serve those better and we
should say so.

## The enemy

Not Typeform. Not Tally. Not Jotform.

**The enemy is the dashboard that says everything is fine while sales drowns in junk.**

The category's core dishonesty is that every tool reports completion rate, and completion
rate cannot distinguish a buyer from a bot from a tire-kicker. The tool is congratulating
you for the exact thing that's hurting you.

Anchor quote (r/PPC, Oct 2025):
> "At first I thought it was working great… until the leads were called. Every single one
> has been junk or spam. I'm still getting charged for the clicks, Google is tracking form
> submissions as conversions, and everything looks normal from a reporting standpoint —
> but the leads are all trash."

## The reframe

| | |
|---|---|
| **Before** | A form is measured by how many people complete it. |
| **After** | A form is measured by what those completions turned out to be worth — and it should change based on the answer. |

## Primary message

**Your form can't tell a buyer from a bot — and it's reporting both as conversions.**

This leads because spam/junk leads is the angriest bucket in the research (~22 independent
sources) *and* it is the thing our architecture uniquely solves. The learning loop is the
more interesting idea, but anger converts better than insight.

## The two capabilities

**1. Provenance on every submission.** Each submission is stamped human, identified agent,
or suspected bot — because one form definition publishes both a human UI and a
machine-callable tool surface (MCP / WebMCP), we know which one was used. The mechanism
that lets legitimate agents through is the same one that keeps fakes out.

**2. Outcome-weighted optimization.** Submissions carry a downstream outcome (won / lost /
disqualified / value) from CRM sync or an outcome webhook. Variants rank on
quality-adjusted conversion rate. **The form learns from the outcome** — which variant,
which question, which field.

## Hard constraint — what we do NOT claim

**Do not lead with "close the loop with your ad platform."** Research falsified this as a
wedge. Competent PPC practitioners already do it via offline conversion import / server-side
CAPI, and they offer it as first-line advice. Claiming it puts us against HubSpot,
WhatConverts, and CallRail on their own turf, and sophisticated buyers will roll their eyes.

The unclaimed half — and the only half we claim — is that **existing loops teach the ad
platform and teach the form nothing.** Nobody in the entire research corpus feeds downstream
outcomes back into which variant, question, or field they use.

Ad-platform push may exist as a *feature*. It is never the headline.

## Anti-positioning

- **Not the cheapest.** Tally owns that with an unlimited free tier and we will not win it.
- **Not the prettiest.** Typeform owns that.
- **Not the most features.** Jotform owns that with 20,000+ templates.
- **Not "AI-powered."** That lane is crowded, thin, and low-trust.

## Table stakes we cannot be worse at

From the "what people love" research bucket. Failing any of these kills us regardless of
how good the wedge is:

- A genuinely generous free tier. Tally set the bar: unlimited forms and submissions,
  exports never paywalled.
- **Uptime and a non-buggy builder.** Three separate people in the corpus abandoned Youform
  over bugs and downtime. Cheap Typeform clones die here.
- Native integrations, not Zapier-only.
- **Conditional logic that holds past 5 conditions** — the #1 functional complaint in the
  category (~12 sources) and currently unclaimed.
- Good enough looking to put in front of a client without custom CSS.

## Voice constraint

The category is saturated with AI-generated comparison content from tiny vendors. Sounding
like an actual person with a point of view is itself differentiating. Contrarian without
being smug; specific over clever. We are allowed to be blunt about the category's
dishonesty because we have the receipts.

## Vocabulary

Use what customers actually say. Nobody outside r/PPC says "qualified pipeline."

**They say:** trash leads · garbage leads · junk leads · tire kickers · "sales hated the
leads" · "flying blind after the lead form" · "the leads are all trash"

**Avoid:** qualified pipeline · lead velocity · synergy · frictionless · seamless ·
revolutionary · game-changing

## Proof points (verified)

- Bad bots were 40% of internet traffic in 2025, up from 37%; automated traffic overall
  passed 50% of the web.
- Automated requests are now ~57.5% of HTML traffic vs 42.5% human.
- ~30% of leads purchased from third-party vendors are outright fake.
- MQL → SQL converts ~13%.
- Google announced WebMCP at I/O 2026; early preview shipped in Chrome Canary Feb 2026.

**Do not cite** the "Typeform cut its free tier to 10 responses" or "$199 CAPTCHA" figures.
Secondary sources claim both; Typeform's live pricing contradicts both. Unverified.
