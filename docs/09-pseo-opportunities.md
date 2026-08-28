# Programmatic SEO — opportunities, evaluated

**Version:** v1 · **Date:** 2026-08-28 · **Informs:** [#9](https://github.com/coreyhaines31/endpointforms/issues/9)
**Inherits:** [`00-positioning-spine.md`](./00-positioning-spine.md), [`01-positioning.md`](./01-positioning.md), [`02-messaging.md`](./02-messaging.md). Nothing here relitigates the spine.
**Depends on:** `04-keyword-research.md` and `05-site-architecture.md`, both in flight. Anything blocked on them is marked `[NEEDS KEYWORD DATA]` or `[NEEDS URL PATTERN]`. Every URL below is a **proposal**, not a decision.

**Sources:** `[W]` = `2026-08-28-form-builder-saas-wedge.md` · `[V]` = `2026-08-28-form-builder-voice-of-customer.md`

---

## 0. The three facts that constrain everything below

Before evaluating a single idea, three conditions decide which pSEO plays are even available to us. Most of the obvious ones fail on at least one.

### Fact 1 — We are a brand-new domain with no authority and no links

pSEO's economics assume the pages eventually rank. At DR 0 against Jotform, Typeform, HubSpot, and WPForms — all DR 90-ish with a decade of links — a new page set targeting commercial terms does not rank in year one. It doesn't matter how many pages we make.

**The consequence is a sequencing rule, not a veto:** the first page set we build must be one that *earns links*, because authority is the precondition for every other set on this list. A page set that only pays off if it ranks is a page set we cannot afford to build first.

### Fact 2 — The SERP for this category is saturated with AI-generated vendor content, and the community is astroturfed

`[W]`'s SERP finding is unambiguous: searches in this space return "near-exclusively AI-generated comparison content from tiny form builders" — orbitforms.ai, splitforms.com, formhug.ai, ovoform, getaiform, dupple, fomr.io, zite, formepic, formgrid, buildform. `[V]` independently found the same on Reddit: "the most astroturfed software niche I have mined," 40–60% vendor plants, a confirmed paid-shill ring.

This does two things to our options. It makes comparison-shaped SERPs expensive to win, and — more importantly — it makes comparison-shaped *content* a brand liability. Our entire position is that this category lies to you and we don't. Publishing 200 templated comparison pages makes us visually indistinguishable from the eleven products we just described as slop. **That is not a soft cost. It is self-refuting.**

### Fact 3 — AI search has repriced exactly the query types pSEO usually targets

The queries pSEO is best at — "best X," "X alternatives," "X vs Y," "what is X" — are the queries an AI Overview or a chat assistant answers without a click. Meanwhile queries that resolve to a **tool** still require the click, because the answer depends on numbers the user has and the model doesn't. Nobody's assistant can run our calculator on their spend, their close rate, their junk-lead percentage.

So the shift favors: tools over prose, data over opinion, and being *cited* over being *clicked*.

**Everything below is scored against these three facts.** The pattern that survives all three is: **page sets that are tool-shaped or data-shaped, not prose-shaped.** Prose at scale is indistinguishable from what the category is already drowning in. Tools and proprietary data at scale are the two things the AI slop factories cannot produce.

---

## 1. Scorecard

Detail follows in §2. `Vol` = search demand, `ICP` = does the searcher match §2 of the positioning doc, `Ceiling` = honest quality ceiling of an individual page, `Diff` = competitive difficulty, `Data` = do we actually have what populates it.

| # | Page set | Pages (launch → ceiling) | Vol | ICP | Ceiling | Diff | Data | Verdict |
|---|---|---|---|---|---|---|---|---|
| 6 | **Free tools / calculators** | 8 → 14 | Low | **High** | **High** | Low | Have | **Build first** |
| 9 | **Anti-spam method teardowns** | 12 → 20 | Med | **High** | **High** | Med | Have | **Build first** |
| 8 | **Concept / glossary pages** | 25 → 45 | Low-med | Med | Med-high | Low-med | Have | **Build first** |
| 4 | Integration pages | 0 → 60 | Med | High | Med | **Blocked on product** | Build later |
| 10 | Field-level outcome evidence | 0 → 40 | Low | **High** | **Highest** | **None** | Build later |
| 11 | Industry lead-quality benchmarks | 0 → 25 | Med | High | **Highest** | **None** | Build later |
| 3 | Form templates by use case | 0 → 60 | **High** | Low-med | Low-med | Med-high | Have | Build later (narrow) |
| 12 | Form-builder limits & pricing database | 1 → 45 | **High** | Med | High | Med-high | Buildable | Build later |
| 7 | Agent-readable / WebMCP directory | 1 → ? | **~0** | Med | High | **None** | Build later (1 page now) |
| 1 | Programmatic alternatives pages | — | High | Med | **Low** | **Very high** | Partial | **Do not build** |
| 2 | Head-to-head `x-vs-y` matrix | — | High | Med | **Lowest** | **Very high** | Partial | **Do not build** |
| 5 | Industry / role persona pages | — | Med | Low | **Lowest** | Med | None | **Do not build** |

All volume estimates are directional judgment. `[NEEDS KEYWORD DATA]` — every one of these should be replaced with real numbers from `04-keyword-research.md` before anything ships, and two of the verdicts (3 and 12) could legitimately move on the data.

---

## 2. The candidates

### Candidate 1 — Alternatives pages · `/[competitor]-alternative`

**Template shape.** One page per competitor. Varies: competitor name, their pricing table, what they're genuinely good at, the switching trigger that brings someone here, our counter-position, a migration note.

**Data source.** Competitor pricing, feature matrices, and review sentiment. We have `[V]`'s quote corpus, which is genuinely better raw material than anyone else in the category has. But we do **not** have verified feature data — `[W]` flags two claims as must-verify-before-writing and both are still open (does Typeform have real native split testing? do Heyflow/ROASForm send value-weighted conversions or just lead events?). Everything else would be scraped from vendor pages that change monthly.

**Page count.** 12 at launch, ~35 ceiling if we include the AI-slop tier.

**Intent and fit.** Genuinely high commercial intent, and the searcher is often our ICP mid-switching-trigger. This is the strongest argument for building them and it is a real argument.

**Quality ceiling — and this is where it dies.** Our messaging doc commits to a three-beat comparison structure: *what they're genuinely great at → who should use them → the one thing that changes.* Applied honestly to Tally, the page reads: "Tally is the best free form builder there is and it isn't close. If nobody is asking hard questions about your leads, use Tally. We mean that." **That is the correct page and it is a terrible converting page.** An honest alternatives page recommends the competitor to most of its readers, because most of its readers are the casual/SMB segment we explicitly deprioritized. We would be spending our scarcest resource — credibility — to send traffic to Tally.

**Competitive difficulty.** Worst on the list. Every one of the eleven AI form builders `[W]` named is already publishing these, at volume, with no cost discipline. Incumbents have DR 90. AI Overviews answer "Typeform alternatives" directly. We would be the twelfth-cheapest voice in a SERP where the reader's prior is that everyone is lying.

**Effort.** High to build honestly (each page needs verified feature data), permanent to maintain (competitor pricing changes and a stale price is a credibility hit for the brand whose whole thing is not making things up).

**Verdict: do not build as a page set.** See §4 for the nuance — 3–5 hand-written pages for the competitors that actually appear in real switching moments is fine, and is sales collateral rather than pSEO.

---

### Candidate 2 — Head-to-head · `/[x]-vs-[y]`

**Template shape.** One page per competitor pair. Varies: the two products, feature table, pricing table, "pick X if / pick Y if," and a footer where we insert ourselves.

**Data source.** Same as Candidate 1, squared. We would be maintaining accurate, current, verified data about a dozen products we don't sell, forever.

**Page count.** 12 competitors → 66 pairs. 20 → 190. The n² scaling is the whole appeal and the whole problem.

**Intent and fit.** Real buyers do search these. And there's a genuine argument that gets made for this play: we rank for matchups where neither vendor will write the page, and we intercept in-market buyers who haven't considered us. That's true. It is why everyone does it.

**Quality ceiling — the lowest on the list.** On a `typeform-vs-tally` page, **we are not one of the two options.** The reader came for a comparison that does not include us. Either the page is honest and we're a footer ad, or the page is rigged and it's the exact dishonesty we built the brand against. There is no third option. The format structurally cannot carry our position.

**Competitive difficulty.** Highest. This is the single most recognizable AI-slop pattern in the category, it's the pattern `[W]` specifically named, and CTR on comparison SERPs is where AI Overviews have bitten hardest.

**Effort.** Highest maintenance burden of anything here — 66 pages of third-party facts that decay. `[V]` found that *third-party pricing claims about this category are frequently wrong* (the Typeform "10 responses / $199 CAPTCHA" claims are contradicted by Typeform's live pricing page and are still circulating). Adopting a format that requires us to restate other people's facts at scale is adopting their error rate.

**Verdict: do not build.** Note that Candidate 12 captures most of the legitimate value here — the buyer's real question is usually "who caps responses and at what price" — as a maintained dataset instead of 66 essays.

---

### Candidate 3 — Form templates by use case · `/templates/[use-case]`

**Template shape.** One page per form type. Varies: the form itself (live, fillable, cloneable), the fields and why each one is there, the logic, what it's for, what it costs you.

**Data source.** We make them. Fully within our control, which is rare on this list.

**Page count.** 30–60 realistic, thousands theoretically. Jotform has 20,000+.

**Intent and fit.** The highest-volume conventional play in this category by a wide margin, and that's the trap. "Contact form template," "job application form template," and "event registration form template" are enormous, and **the people searching them are the casual/one-off segment `01-positioning.md` §2 explicitly says we are not for.** We would win traffic that we've already decided not to serve, then measure ourselves on it.

**Is it winnable?** Not head-on. Jotform has 20,000 templates and DR 91; Tally, Typeform, and HubSpot all have template galleries. There is no version of us out-breadthing them, and §8 of the positioning doc already concedes feature breadth to Jotform. Chasing templates is quietly reversing that decision.

There is a narrow slice that is winnable, and it's the one nobody else can build: **templates that ship instrumented.** Not "lead capture form template" but a lead-qualification form that arrives with provenance stamping on, an outcome webhook stubbed, and a written explanation of which fields we expect to move outcome and why. That's a template that only makes sense coming from us, and it's ~40 pages, not 2,000.

**Quality ceiling.** Low-to-medium for the generic version (a fillable form and 200 words is thin by construction). Medium-high for the instrumented version.

**Effort.** Low per page to build, low to maintain. This is the cheapest set here, which is exactly why it's tempting and why the discipline has to be external.

**Verdict: build later, narrow.** Post-product, ~30–60 instrumented templates, aimed at lead-gen use cases only. Never a gallery. If we ever find ourselves adding "wedding RSVP form template," the strategy has failed.

---

### Candidate 4 — Integration pages · `/integrations/[tool]`

**Template shape.** One page per integration. Varies: the tool, what data flows which way, setup steps, the specific thing our integration does that a Zapier hop doesn't, and — the part that makes it ours — **what outcome data that specific tool can send back.**

**Data source.** Our own integration catalog. Which does not exist yet.

**Page count.** 0 at launch. 40–60 ceiling, split across CRMs (the outcome sources — HubSpot, Pipedrive, Close, GoHighLevel, Salesforce), destinations (Slack, Sheets, Notion, webhooks), and ad platforms.

**Intent and fit.** Good on both. "[Tool] form integration" is mid-tail, commercially warm, and searched by someone with a stack — which is our ICP, not the casual segment. Agencies searching "GoHighLevel form" are precisely Primary A.

**Quality ceiling — genuinely high, and for a reason specific to us.** Most integration pages are thin because there's nothing to say beyond "connect A to B." Ours has a real second half: *what outcome signal does this CRM give back, how fast, and is that fast enough to grade a form variant?* Risk 4 in the positioning doc (outcome latency) makes that a live question per-CRM, and answering it honestly per page — including "Salesforce can do this but your median time-to-outcome is 60 days, so expect the ledger to be useful and the split test not to be" — is a page nobody else in the category can write.

**Competitive difficulty.** Medium. Zapier and the incumbents own the generic terms; the tool-specific long tail is reachable once we have any authority.

**Effort.** Low per page once the integration exists. Maintenance is tied to the integration's own lifecycle, which is the right coupling.

**Verdict: build later.** Hard-blocked on Phase 5. Writing these before the integrations ship would be the textbook doorway page and would be lying, which is worse. `[NEEDS URL PATTERN]`

---

### Candidate 5 — Industry / role pages · `/for/[industry]`

**Template shape.** One page per vertical or job title. Varies: industry name, a stock pain paragraph, a template link, testimonial slot.

**Data source.** None. That's the finding.

**Page count.** 25–200, trivially.

**Intent and fit.** "Form builder for dentists" has some volume, and it is overwhelmingly local SMB — the segment we deprioritized, chasing the price complaint we declined to compete on.

**Quality ceiling — the lowest here, and it's structural.** Swap "dentists" for "plumbers" and reread the page. If it's still 95% true, it should not be a separate page. For a general-purpose form builder, it is always still true. This is the canonical doorway-page pattern and it is the exact thing Google's thin-content enforcement is aimed at.

**The exception worth naming.** The persona page becomes legitimate the moment it carries data that is actually specific to that vertical. "Form builder for home services" is a doorway page. "Median time-from-submission-to-disposition in home services is 4 hours, which makes it one of the few verticals where outcome-weighted form testing works" is a real page — and it's Candidate 11, not this one. **The persona page earns its existence only by becoming a benchmark page.**

**Effort.** Trivially cheap, which is the danger.

**Verdict: do not build.** Two or three hand-written ICP pages (`/for/agencies`, `/for/ppc-teams`) are worth having as positioning pages. They are not pSEO and they should not be templated.

---

### Candidate 6 — Free tools and calculators · `/tools/[tool]` **← top recommendation**

**Template shape.** Not one template with swapped variables — a small set of individually designed interactive tools sharing a chassis: input form → computed result → an interpretation of the result written by a human → a specific next action. The shared chassis is the pSEO part; the logic and the interpretation are bespoke per tool.

**Candidate tools, all drawn from documented pain:**

| Tool | The question it answers | Rooted in |
|---|---|---|
| Form spam cost calculator | "What are junk submissions actually costing me?" — spend, CPL, junk %, sales-hours-per-lead → wasted spend + wasted rep hours + the per-response tax | Bucket 2, ~22 sources `[V]`; "billed for the bots" `[01, §4]` |
| Lead quality / CPL-vs-closed-won calculator | "My CPL is $15 and my cost per closed deal is $2,100. Which campaign is actually cheaper?" | "Cost per lead is amazing… Sales are struggling with the leads" `[V]` |
| Outcome-weighted A/B significance calculator | "Variant B converts 40% better. Do I have enough closed deals to believe it?" — and it will usually answer *no* | Risk 2, the outcome volume floor |
| Time-to-outcome checker | "Is my sales cycle fast enough for form-level learning to work at all?" — and it will honestly tell some people no | Risk 4, outcome latency |
| Agent-readability checker | Paste a URL → does this form expose an agent-callable surface, and what would an agent see? | `[W, §4]`; nobody has this |
| Form field cost estimator | "What does each additional field cost me?" — with the honest caveat that the direction is unevidenced | Objection 2; `[V]` contradiction 2 |
| Response-cap / per-response tax calculator | "At my volume, what am I actually paying per usable lead across the tools I'm considering?" | Complaint #1, ~45 sources `[V]` |
| Bot traffic share estimator | Rough share of form traffic that is likely automated | `[W, §5]` |

**Data source. We have everything.** The math is ours, the benchmark constants come from `[W]`'s verified statistics, and the user supplies their own numbers — which is the point. There is nothing to buy, scrape, or license. On this list that is close to unique.

**Page count.** 8 at launch, ~14 ceiling. **This is the smallest set here and that is a feature.** It sidesteps thin-content risk entirely: you cannot accidentally build a doorway page when the page contains a working instrument.

**Intent and fit.** Search volume for any individual tool is low — "form spam cost calculator" is not a term with a thousand searches a month, and I'd rather say that plainly than pretend otherwise `[NEEDS KEYWORD DATA]`. But the searcher for "how much is form spam costing me" is *exactly* Primary A or B, mid-crisis, with budget authority. Intent quality is inverted from volume here.

**Quality ceiling — the highest available to us today.** Each page is independently, obviously useful whether or not it ranks, whether or not anyone links to it, whether or not Google exists.

**Competitive difficulty — low, and this is the second half of the argument.** No form builder has built these. The AI-slop factories won't, because a calculator requires working logic and a defensible model, not a prompt. And an AI Overview cannot substitute for a calculator, because the answer depends on numbers the model doesn't have.

**Effort.** Medium to build (each tool is a real design and modeling job — a week each, not an afternoon), low to maintain (the math doesn't decay; the benchmark constants get re-verified annually).

**Verdict: build first.** Full argument in §3.

---

### Candidate 7 — Agent-readable / WebMCP directory · `/agent-ready/[entity]`

**Template shape.** One page per site or tool: does it expose an agent-callable form surface, what does the tool definition look like, when did it appear, how complete is it.

**Data source.** We'd have to build it — crawl for WebMCP declarations and MCP manifests. That's a real scraper plus a real refresh cadence.

**Page count.** 1 useful page today. Ceiling unbounded but currently theoretical.

**Intent and fit — and here is the honest problem.** Search volume today is approximately zero. WebMCP was announced at I/O 2026 with a Chrome Canary preview in Feb 2026, and Risk 5 in the positioning doc already says real agent form-fill traffic is likely near zero. Building a 500-page directory for a query pattern nobody types yet is building an asset for a demand curve that may not arrive — and the positioning doc explicitly hedges that the agent half is "upside and narrative, not the load-bearing wall."

**But the space is genuinely unowned and we are natively credible in it.** That's real and it shouldn't be thrown away.

**The resolution — and this is the non-obvious call.** The value here is *citation and PR*, not organic traffic. Those are best served by **one canonical, well-maintained index page** plus **the agent-readability checker in Candidate 6**, not by a page set. One authoritative page gets cited by assistants, quoted in coverage, and linked. Five hundred stub pages for domains nobody searches get us a thin-content problem in exchange for nothing.

**Verdict: build later — and start with one page, not a set.** Ship the index and the checker now (the checker lives in Candidate 6). Revisit exploding it into per-entity pages only when measured agent traffic on live forms crosses ~1%, which is the same threshold Risk 5 already uses.

---

### Candidate 8 — Concept / glossary pages · `/[concept]`

**Template shape.** One page per concept. Varies: the term, a plain definition, why the standard definition is incomplete, what it looks like in practice, and — the part that makes it ours — what we think and why. Structured for citation: definition first, receipts second.

**Candidate terms:** form abandonment · quality-adjusted conversion rate · submission provenance · offline conversion import · outcome webhook · lead scoring · MQL vs SQL · form drop-off analysis · honeypot field · residential-IP bot · WebMCP · agent-callable form · per-response pricing · partial submission · GCLID · server-side CAPI · conditional logic · progressive profiling · multi-step vs single-step · completion rate · time-to-disposition.

**Data source.** Our own POV plus the two research briefs. `[V]` gives us ~150 verbatim quotes and frequency counts nobody else has — meaning our "form abandonment" page can cite *eleven independent people describing it in their own words* while every competing page cites a made-up statistic. That asymmetry is the entire opportunity.

**Page count.** 25–40. Ceiling ~45. **Capped deliberately** — we should only define terms we have something real to say about. A 300-term glossary is padding, and padding is the failure mode of this playbook.

**Intent and fit.** Informational, top-of-funnel, and the searcher is only sometimes our ICP. Volume is modest and the AI-Overview tax on "what is X" is heavy `[NEEDS KEYWORD DATA]`.

**So why build it anyway — three reasons.** (1) **Citation.** These are the pages assistants quote, and being the source an assistant cites for "quality-adjusted conversion rate" is worth more than ranking fourth for it. (2) **Some of these terms are unowned.** Nobody owns "submission provenance" or "outcome-weighted optimization" because we're inventing them; if the concept catches, we own the definition. (3) **Structural.** This is the internal-linking backbone. Every tool, teardown, template, and integration page needs somewhere to link the concepts it uses, and without it the rest of the site is a pile of orphans. `[NEEDS URL PATTERN]`

**Quality ceiling.** Medium-high — but only under a hard rule: **no page ships that merely defines the term.** If we can't say something the first search result doesn't, we don't publish that term.

**Effort.** Low-medium to build, low to maintain.

**Verdict: build first**, third priority, capped at 40.

---

### Candidate 9 — Anti-spam method teardowns · `/stop-form-spam/[method]`

**Template shape.** One page per defense: how it works, what it actually stops, how it's defeated (specifically, with the bypass named), what practitioners report, when you should still use it, and what it cannot ever tell you.

**Methods:** reCAPTCHA v2 · reCAPTCHA v3 · hCaptcha · Cloudflare Turnstile · honeypot fields · time-on-form / submit-delay heuristics · geo-blocking · IP reputation and blocklists · email verification · phone/OTP verification · rate limiting · disposable-email detection · paid anti-spam APIs · WAF rules · taking the form down.

**Data source. This is the strongest data position on the list and we already have it.** `[V]`'s Bucket 2 is ~22 independent sources, the angriest in the corpus, with the defeats named specifically: *"using a service such as 2captcha you could bypass captcha in like max 30 seconds using puppeteer and javascript"* · *"I do have a hidden field on the form, and none of the bots filled it out"* → *"Hidden fields don't work any more"* · *"Geoblocking scripts on just the form are buggy"* · *"I got 665 form fills on one page last night in an hour and sixteen minutes"* · *"We ended up taking down the page after 600 submissions."* Every competing page on these terms is generic advice. Ours quotes named practitioners describing the failure, with dates.

**Page count.** 12 at launch, ~20 ceiling. Small, finite, and each one is a real piece of writing.

**Intent and fit — the best on the list.** "How to stop spam form submissions," "recaptcha not stopping bots," "honeypot not working," "fake form submissions google ads" are high-intensity informational queries typed by someone actively angry. That is our ICP at the exact moment `01-positioning.md` §7 (Objection 5) identifies as the only moment a happy incumbent user is reachable: *the week the workflow breaks.* This set also lands directly on the primary message rather than a step away from it.

**Quality ceiling — high, and honesty is the mechanism.** The correct OTP page concludes *"this one works, use it, and it isn't us"* — which the positioning doc already concedes (Objection 3: OTP is table stakes, not a competitor). Being the only page in the SERP that admits a defense works is what makes the pages where we say *"and none of these can tell you what the submissions you accepted turned out to be"* believable.

**Competitive difficulty.** Medium. WordPress plugin blogs and security vendors hold these terms, and they're beatable on specificity because none of them have a quote corpus.

**Effort.** Medium to build — real writing, one to two days each, and this set must not be model-generated. Low to maintain, except that bypass techniques change and each page needs an annual re-verification stamp.

**Verdict: build first**, second priority.

---

### Candidate 10 — Field-level outcome evidence · `/fields/[field]`

**Template shape.** One page per form field. Varies: the field, what asking for it costs in completion, what it's worth in outcome, and the honest answer for whom. *"Asking for phone number: −18% completion, +2.4× close rate on the leads you keep. Worth it above $X deal size, not below."*

**Data source. We have none of it today, and it is the most valuable data on this list.** It comes from our own aggregated, anonymized outcome data once the product runs — the one dataset that is architecturally impossible for a competitor to produce without building outcome-weighting first.

**Page count.** 0 now. 40 ceiling.

**Intent and fit.** Volume is low. Fit is perfect — this is the question `01-positioning.md` §7 Objection 2 says the entire category argues about with **no data on either side**. `[V]` flagged it as an unresolved contradiction: *"the category's central design belief is unevidenced."*

**Quality ceiling — the highest of anything on this page.** These pages would settle an argument the category has been having since 2015. They are also the most linkable asset we will ever own, because journalists and practitioners cite numbers nobody else has.

**Competitive difficulty.** None. Not "low" — none. Nobody can build these.

**Effort.** Low to publish once the data exists. The real work is a schema decision made now: **instrument for this from the first submission**, so the corpus is accumulating for eighteen months before the pages ship.

**Verdict: build later — but make the data decision today.** This is the long-term moat; the only thing that would waste it is discovering in 2028 that we didn't store what we needed.

---

### Candidate 11 — Industry lead-quality benchmarks · `/benchmarks/[industry]`

**Template shape.** One page per vertical: median junk-lead rate, median time-to-disposition, typical CPL-to-closed-won multiple, share of automated traffic. Plus the honest verdict on whether outcome-weighted testing is viable in that vertical at all.

**Data source.** Same as Candidate 10 — our own aggregate. Public benchmark data in this category is vendor-published and mostly unreliable.

**Page count.** 0 now, ~25 ceiling, and each one needs a real sample size before it publishes.

**Intent and fit.** "[Industry] lead quality benchmarks" and "average cost per lead [industry]" are searched by exactly our buyer, usually while building a client deck — which is a linking context.

**Quality ceiling.** Highest tier, alongside Candidate 10. And critically, **this is the legitimate form of Candidate 5.** The persona page is thin because it has nothing vertical-specific to say; the benchmark page is the same URL slot with actual data in it.

**Competitive difficulty.** None, for the same reason.

**Effort.** Low once the data exists. Requires a published minimum-sample rule (see §5) and a visible "n =" on every page — including refusing to publish verticals where n is too small. **Publishing a benchmark from twelve accounts and calling it an industry median would make us the lying dashboard we're attacking.**

**Verdict: build later.** Gated on volume, not on time.

---

### Candidate 12 — Form-builder limits & pricing database · `/limits/[vendor]` + index

**Template shape.** A maintained dataset, presented as one sortable index plus one page per vendor. Per vendor: free-tier response cap, paid tiers, what's paywalled that shouldn't be (exports, logic, CAPTCHA, seats, partial submissions), effective cost per response at 100/1,000/10,000, verification date, and a source link for every number.

**Data source.** Buildable, from vendors' live pricing pages, verified by hand. Not licensed, not scraped-and-trusted.

**Page count.** 1 index at launch (the index is the asset), ~45 vendor pages at ceiling.

**Intent and fit.** High volume — complaint #1 in `[V]` at ~45 independent sources, more than double the next. "Typeform pricing," "form builder free tier limits," "cheapest form builder." Fit is mixed: much of that volume is the price-sensitive SMB segment we deprioritized.

**The tension, stated plainly.** §8 of the positioning doc says *"we will never write a page arguing we're cheaper than Tally."* This set is adjacent to that line and could cross it. The version that stays on the right side doesn't argue we're cheaper — it argues that **the per-response tax means you're billed for the bots**, which is the sharpest formulation of the category's dishonesty and it came from a customer, not us: *"If your form software has a submission limit, bots are using it before real people even get a chance"* `[V]`. The dataset is the receipt for that argument. If it ever becomes a price-comparison page, it has failed and should be deleted.

**Quality ceiling.** High, and for a specific reason: **every pricing claim about this category currently in circulation is unreliable.** `[V]` caught secondary sources asserting Typeform cut its free tier to 10 responses and gated CAPTCHA behind $199/mo — both contradicted by Typeform's live pricing page. Being the one source in the category with verified, dated, sourced numbers is a real position, and it is the honest cousin of the comparison content we're refusing to write.

**Competitive difficulty.** Medium-high on head terms. Reachable on the long tail once we have authority — and the index is highly linkable, which helps get it.

**Effort.** Medium to build. **Permanent to maintain, and that's the real cost** — a stale price on a page whose entire value is accuracy is worse than no page. Needs an owner and a quarterly cadence, or it should not be started.

**Verdict: build later.** Strong candidate; sequenced after the first three because it commits us to permanent maintenance before we know whether the domain can rank at all. `[NEEDS KEYWORD DATA]` — if the research shows the volume concentrating on "response limits" rather than "cheapest," this moves up.

---

## 3. The recommendation, argued

### Build first
1. **Free tools and calculators** (8 pages)
2. **Anti-spam method teardowns** (12 pages)
3. **Concept / glossary pages** (25 pages, capped at 40)

That's ~45 pages. Deliberately small.

### Build later
4. Integration pages — hard-gated on Phase 5
5. Field-level outcome evidence — gated on data; **make the instrumentation decision now**
6. Industry lead-quality benchmarks — gated on data volume
7. Form templates, narrow and instrumented — post-product
8. Form-builder limits & pricing database — strong, but commits us to permanent maintenance
9. Agent-readable index — **one page now**, page set only if demand materializes

### Do not build
10. Programmatic alternatives pages
11. Head-to-head `x-vs-y` matrix
12. Industry / role persona pages

---

### Why free tools is first

The obvious objection is that it has the lowest search volume of any candidate here, and I'd rather concede that up front than bury it. "Form spam cost calculator" is not a high-volume term and probably never will be `[NEEDS KEYWORD DATA]`.

**The case does not rest on volume. It rests on four things, and the fourth is decisive.**

**It is the only set whose pages have value if they never rank.** Every other candidate on this list is worthless without rankings. A comparison page nobody finds is dead weight; a template gallery nobody finds is dead weight. A calculator that nobody finds through Google is still the thing you link in a Reddit reply, still the thing you send a prospect on a call, still the thing you post to LinkedIn, still a working answer to a real question. Given Fact 1 — we will not rank for anything meaningful in year one — that asymmetry is not a minor advantage. **It is the difference between an asset that starts earning immediately and an asset that starts earning in twelve months, if ever.**

**It is the link engine, and links are the precondition for everything else on this list.** Tools get linked; templated pages do not. Nobody has ever linked to `/typeform-vs-tally` from a Reddit thread, but people link calculators constantly, because a calculator is a complete answer to someone else's question. At DR 0, the correct first move is the one that buys authority — and then Candidates 4, 8, 9, and 12 all become viable *because* of it. Free tools isn't competing with those sets. It's the thing that unlocks them.

**It is structurally immune to the failure mode that would hurt us most.** Fact 2 says the reputational cost of shipping slop is higher for us than for anyone else in this category, because our position is that the category lies. You cannot accidentally ship a doorway page when the page contains working logic. Eight tools cannot become four hundred stubs through drift. The format enforces the guardrails in §5 whether or not we have the discipline to.

**And it is the only set that is itself the product.** Every calculator is an Endpoint form. Not a mock, not a screenshot — a live form on real traffic, doing the thing we claim, in public. That is the fourth argument and it is the one that makes this a strategy rather than a content plan. See §6.

**The strongest counter-argument**, which I'll state at full strength: templates (Candidate 3) have 50–100× the search volume, cost a fraction per page, and are what every successful form builder actually did. That's true. My answer is that the volume is concentrated in a segment we've already decided not to serve, that winning it means reversing the concession we made to Jotform on breadth, and that we cannot win it at DR 0 anyway. **Templates are the right *second-year* play once the product exists and the instrumented version is possible. They are the wrong first play because they'd have us competing for the casual segment's attention with the eleven products we just called slop.**

### Why anti-spam teardowns is second

Highest intent-to-ICP match on the list, lands on the primary message rather than one step away from it, and it's the one place where our research corpus is a straightforward competitive advantage — every competing page on these terms is generic advice with no receipts, and ours quotes named practitioners with dates. It also reaches the buyer at the exact moment Objection 5 says they're reachable: the week the workflow breaks. Twelve pages, real writing, no model generation.

### Why glossary is third and not higher

It's cheap, it's the internal-linking backbone the other sets need, and it's the most citation-shaped format we have. But it's informational, the AI-Overview tax on "what is X" is heavy, and its conversion contribution is indirect. It earns its place as infrastructure, not as a traffic play — and it must stay capped at 40.

### What I'd flag as most likely to change

Two verdicts are genuinely close and should be revisited against `04-keyword-research.md`. If templates show a large, defensible cluster around *lead-gen* form types specifically (rather than the generic contact/RSVP mass), Candidate 3 moves up. If the pricing/limits volume concentrates on "response limits" rather than "cheapest," Candidate 12 moves up. Neither would displace free tools.

---

## 4. On the comparison pages, precisely

Recommending against comparison pages *as a page set* is not the same as saying we never mention competitors.

**What we should build:** 3–5 hand-written pages for the competitors that appear in real switching moments — Typeform, Jotform, Tally, Heyflow, Reform. Each one written by a person, following the three-beat structure `02-messaging.md` §5 already specifies, each one willing to recommend the competitor to readers who aren't us.

**Why that is not pSEO:** there's no template, no data pipeline, no scaling, and no ambition to reach page thirty. It's sales collateral that happens to live at a URL. It's five pages, not fifty, and each is worth writing by hand.

**Two blockers apply even to those five.** `[W]` flags two claims as must-verify-before-writing and both are still open: does Typeform have real native split testing, and do Heyflow/ROASForm send value-weighted conversions or just lead events? `01-positioning.md` §11 lists both as unresolved. **No comparison page ships until both are verified.** Getting a competitor's capability wrong is the one error our brand cannot absorb.

---

## 5. Quality guardrails

These matter as much as the ideas. In a category where 40–60% of the community discussion is astroturf and the SERP is AI-generated vendor content, **shipping 400 thin pages would refute our positioning more effectively than any competitor could.** These are the rules that prevent it.

### The five tests every page passes before it ships

**1. The no-Google test.** Would we publish this page if search engines did not exist? If the only reason it exists is to catch a query, it's a doorway page. Delete it.

**2. The one-unique-thing test.** Every page contains at least one fact, number, quote, or judgment that appears nowhere else on our site and — ideally — nowhere else on the web. Not a rearrangement. Something new. If we can't name that thing in a sentence, the page doesn't ship.

**3. The variable-swap test.** Swap the page's variable — competitor, industry, field, tool — and reread. If the page is still ~90% true, it should not be a separate page. Merge it into a table on a parent page.

**4. The recommend-against test.** Any page that compares us to something must be willing to conclude *"use the other one."* At least one shipped page in every comparative set must actually reach that conclusion. This is already a messaging commitment (`02-messaging.md` §5, and the OTP concession in Objection 3); the guardrail is that we verify it empirically rather than assume it.

**5. The named-editor test.** Every page has a human editor of record. No page is generated end-to-end by a model and published. This is not a philosophical position — it's the specific thing that distinguishes us from orbitforms.ai, formhug.ai, and the nine others, and it is unverifiable to a reader except through the writing itself, which means the writing has to carry it.

### Publishing discipline

- **Cohorts of 25 maximum.** Ship, wait 60 days, measure indexation and engagement, then decide whether the next cohort ships. Never launch a full set on day one. If cohort one doesn't index or doesn't hold attention, cohorts two through six were going to fail too.
- **No page for a combination with no demand.** If the keyword research shows zero volume and no strategic reason, the page does not exist. Completeness is not a virtue.
- **Noindex thin tiers by default.** Calculator *result* pages, filtered directory views, and paginated states are `noindex` unless one specifically earns promotion. Index what's earned, not what's generated.
- **Kill criteria, decided in advance.** Any page with negligible impressions, zero links, and no conversions after six months gets merged or deleted — not left to rot. A site accumulating dead pages is exactly what the algorithm is looking for. Set the threshold before launch so it isn't negotiated later.

### Accuracy contract

- **Every third-party fact is dated and sourced.** Any page containing a competitor's pricing, limits, or capability carries a visible "verified [date]" and a link. `[V]` caught the whole category circulating false Typeform pricing; we are the ones who noticed. That has to be visible on the page.
- **Nothing unverified ships, ever.** The spine's prohibitions (the "10 responses" and "$199 CAPTCHA" claims, the conversational-lift numbers) apply to programmatic pages identically. Templated content is exactly where an unverified number gets replicated 200 times.
- **Stale is worse than absent.** A page whose value is accuracy and which has decayed is a liability. If a set can't be maintained on a stated cadence with a named owner, don't start it.
- **Say what we don't know.** "We don't have data on this yet" printed on a page is a credibility gain, not a loss — in this category especially. Any benchmark page publishes its `n`, and refuses to publish below the minimum sample. **Publishing a median from twelve accounts would make us the lying dashboard we're attacking.**

### Structural

- Every programmatic page is reachable in ≤2 clicks from the homepage and links to at least one non-programmatic page. No orphans.
- Each page set gets its own sitemap, so indexation can be measured per set rather than in aggregate.
- Unique title and meta per page, written from the page's actual content — never a fully templated title string.
- Schema markup appropriate to the type (`SoftwareApplication` for tools, `DefinedTerm` for glossary, `Dataset` for benchmarks).

---

## 6. Dogfooding — the marketing site as the demo

**Every calculator in Candidate 6 is an Endpoint form.** Not a screenshot, not a sandbox: a live form, on real traffic, doing in public the exact thing we sell. This is the single best dogfooding opportunity on the list and it's the reason free tools ranks first rather than second.

**The specific play — the Form Spam Cost Calculator:**

- The calculator **is** a multi-step Endpoint form. The inputs are fields; the result is computed output.
- It publishes both surfaces from one definition — the human UI, and a WebMCP/MCP tool definition an agent can call. Both are live and public.
- The results page shows the visitor **their own provenance stamp**: *"You completed this as a human. Here's what that looks like in the ledger."* The abstract claim from the homepage becomes a thing that just happened to them, twelve seconds ago.
- A public counter on the page shows the split — human / identified agent / suspected bot — **on our own marketing site, on real traffic.** That's the proof we cannot otherwise have pre-launch, because §Honesty-note in `02-messaging.md` says we have no customers and no case studies. This is category (d): a demonstrable product behavior we can show. And unlike a demo video, the visitor is generating the data.
- The demo `[W]` describes — *"watch Claude fill out my lead form without ever opening a browser"* — is not a staged recording. It's an agent calling our live calculator and appearing in the public ledger seconds later.

**The second-order benefit, which may matter more.** Waitlist signups originating from these tools carry an outcome: did this person become a customer? That gives us our first real outcome-weighted dataset, on our own funnel, before we have a single customer's. **We would be grading our own marketing forms on the thing we sell** — which variant of the spam calculator produced signups that converted, not which produced the most completions. If the product's central claim is true, that experiment will surface a variant that completes worse and converts better, and that result is the launch story. If it doesn't, we learn Risk 6 is real while it's still cheap to learn.

**Wider applications:** the waitlist form itself, obviously. The agent-readability checker (Candidate 6) is a form whose *subject* is agent-readability — self-referential in a way that is genuinely useful rather than cute. And a permanently public provenance dashboard for endpointforms.com, showing what our own traffic actually is. **A form builder that publishes its own junk-submission rate is a position no competitor can copy without first building the product.**

---

## 7. Open questions for reconciliation

1. **Volume, everywhere.** Every estimate in §1 is judgment. `04-keyword-research.md` replaces them, and Candidates 3 and 12 could legitimately move on the data.
2. **URL patterns.** Every URL here is a proposal. `05-site-architecture.md` decides. Two specific questions: do glossary pages sit at root (`/form-abandonment`) or under a folder (`/learn/form-abandonment`), and do the anti-spam teardowns live under `/stop-form-spam/` or fold into the glossary?
3. **What does the site architecture doc say about hub pages?** Each set needs a hub. If the architecture already assigns those slots, these sets should attach rather than invent parallel structure.
4. **Instrumentation decision, needed now.** Candidates 10 and 11 are our long-term moat and both require that the product store field-level and vertical-level outcome data from submission one. That is a Phase 5 schema decision that should be made in Phase 3, while it's free.
5. **Does Candidate 12 cross the line in §8?** The pricing/limits database is defensible as *"you're billed for the bots"* and indefensible as *"we're cheaper."* Someone should own that call before it's built.
6. **Who owns maintenance?** Candidates 9 and 12 both decay. If there's no named owner and no cadence, the honest answer is not to start them.
