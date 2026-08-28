# Messaging — Endpoint Forms

**Version:** v1 · **Date:** 2026-08-28 · **Closes:** issue #2

Inherits every decision in `00-positioning-spine.md`. Nothing here relitigates the spine.
Where this doc fills a gap the research didn't cover, it is marked **[judgment call]**.

**Honesty note on "proof."** Endpoint Forms is pre-launch. There are no customers, no case
studies, no testimonials. Every proof point below is one of four things: (a) a verbatim
customer quote from the VOC corpus, (b) a verified third-party statistic, (c) a frequency
count from the corpus (how many independent people said it), or (d) a demonstrable product
behavior we can show on video. When we have (a)–(d) we say it. When we don't, we say nothing.
The category is drowning in vendors inventing numbers; not doing that is part of the position.

---

## 1. Message hierarchy

### Primary message

> **Your form can't tell a buyer from a bot — and it's reporting both as conversions.**

Set in the spine. Everything below ladders up to it.

**Why it leads:** spam/junk leads is the angriest bucket in the research (~22 independent
sources) *and* the thing our architecture uniquely solves. The line does three jobs in
eleven words: it names a failure the reader has personally experienced, it indicts the tool
rather than the reader, and it points at a mechanism (the form *can't tell*) rather than a
feeling.

**Supporting line, whenever the primary needs a second beat:**
> Endpoint Forms knows who filled out your form, and what the lead turned out to be worth.

### The three pillars

Every pillar is: a claim, the capability that makes it true, and the proof behind it.

---

#### Pillar 1 — **Know who actually filled it out.**

*Capability: Handshake + Origin*

Every submission arrives stamped **Human**, **Agent**, or **Unverified**. Not guessed from
mouse movement — known, because a legitimate agent submits through a tool surface the form
publishes on purpose, and anything stuffing the human form while claiming to be software has
told on itself.

**Proof:**

| Proof | Source |
|---|---|
| Bad bots were 40% of internet traffic in 2025, up from 37%; automated traffic passed 50% of the web | Verified stat (spine) |
| Automated requests are ~57.5% of HTML traffic vs 42.5% human | Verified stat (spine) |
| ~30% of leads purchased from third-party vendors are outright fake | Verified stat (spine) |
| "I got 665 form fills on one page last night in an hour and sixteen minutes." | u/surfnsound, r/marketing, Jul 2023 |
| "We have recaptcha enabled, and I have a honeypot, but it didn't stop." | u/robwalte, B2B software co., r/marketing, Jun 2024 |
| "Captcha can easily be bypassed… using a service such as 2captcha you could bypass captcha in like max 30 seconds" | u/AndyAndrei63, r/webdev, Jan 2025 |
| "None have nailed anti-spam to a science." | u/kjdscott, agency dev, r/Entrepreneur, Sep 2025 |
| Spam is the #2 complaint in the corpus and the highest-intensity one | ~22 independent sources |
| Google announced WebMCP at I/O 2026; early preview shipped in Chrome Canary Feb 2026 | Verified (spine) |
| Demo: an agent submits a real lead without ever opening a browser; the dashboard shows it as Agent | Product behavior |

---

#### Pillar 2 — **Score your forms on what the leads were worth, not how many there were.**

*Capability: Verdict + Hindsight + Yield*

Every submission gets a verdict back — won, lost, disqualified, and a value — from CRM sync
or a one-line webhook. Split tests rank variants on **Yield**, not completion rate. The
variant that produces revenue wins, even when it produces fewer fills.

**Proof:**

| Proof | Source |
|---|---|
| "We had campaigns that looked amazing on paper: cheap CPLs, tons of conversions, good CTRs … meanwhile sales hated the leads." | r/DigitalMarketing, May 2026 |
| "Form started, contact captured, form completed, visit booked, job won. **Those are not the same quality of conversion.**" | u/kaancata, r/DigitalMarketing, May 2026 |
| "A $25 form lead can easily be more expensive than a $70 landing-page lead once unreachable and unqualified contacts are removed." | u/sharadvelocity, r/PPC, Aug 2026 |
| "I'd test form completion rate against qualified-call rate rather than guessing." — the right metric named, with no tool that does it | u/TrafficAcademySEO, r/DigitalMarketing, Aug 2026 |
| "Marketing gets measured on CPL so they optimize for CPL. Sales get measured on closed deals. **Nobody owns the middle.**" | u/Common_Dependent_284, r/DigitalMarketing, May 2026 |
| "Your dashboards will look amazing while pipeline quality tanks." | u/Necessary_Aspect7317, r/nocode, Jul 2026 |
| MQL → SQL converts ~13% | Verified stat (spine) |
| **Nobody in the entire research corpus feeds downstream outcomes back into which variant, question, or field they use.** The gap is unclaimed. | VOC report, hypothesis stress test |
| Demo: Variant B wins on completion rate by 41%; flip to Yield and Variant A produced all the revenue | Product behavior |

---

#### Pillar 3 — **You shouldn't pay per submission when most submissions aren't people.**

*Capability: everything on the table-stakes list, plus a pricing model that isn't a
per-response tax*

This pillar exists because pricing is the **#1 complaint in the category by a wide margin
(~45 independent sources)** — but we do not compete on being cheapest (Tally owns that and
we will not win it). We compete on the *absurdity of the meter*: charging by the submission
in a year when the majority of submissions are automated. That is a position, not a discount.

**Proof:**

| Proof | Source |
|---|---|
| "**If your form software has a submission limit, bots are using it before real people even get a chance.**" — the bridge between Pillar 1 and Pillar 3 | u/kjdscott, r/Entrepreneur, Sep 2025 |
| "$0.02 per submission can get very expensive very fast… Is it really that expensive to store 10,000 rows of data?" | u/scottydelta, HN, Aug 2022 |
| "Built it because I was tired of paying Typeform €840/year for features I didn't need." | u/Kostich02, r/Entrepreneur, Feb 2026 |
| "The conditional logic is always the biggest headache — it never works right for anything beyond super simple forms." | u/devhisaria, r/nocode, Oct 2025 (~12 sources) |
| "For me, the paid feature is dependable integrations, not prettier form fields… and **fails loudly when a sync breaks**." | u/SufficientFrame, r/nocode, Jul 2026 |
| "They don't paywall basic features like exports, which is where other tools get annoying." (Tally, praise — the bar) | u/erickrealz, r/SaaS, Dec 2025 |
| Pricing complaint frequency | ~45 independent sources |

**Guardrail:** Pillar 3 never leads. It is the reason someone *can* say yes after Pillars 1
and 2 made them want to. Leading with price puts us in the cheap-Typeform-clone bucket,
which the research shows is a graveyard.

---

## 2. Feature naming

This is the part that has to be right. "Outcome-weighted split testing" and "agent-native
capture" are accurate descriptions and terrible names — they're unsayable in a sales call,
unmemorable in a demo, and unownable in a market.

**The naming standard applied:** one plain English word, a real noun a person already knows,
sayable out loud without explanation, no AI-era jargon, and *forensic* in register — the
whole product is about finding out what really happened. That register is itself the brand.

---

### Capability 1 — outcome-weighted split testing

| Candidate | Case for | Case against |
|---|---|---|
| **Hindsight** ⭐ | Names the actual mechanism honestly: the winner *cannot* be known at submit time and only becomes knowable later. Real word, instantly sayable ("check Hindsight," "run a Hindsight test"). Quietly contrarian — every other tool declares a winner before it can possibly know. Pairs with the category noun so it stays searchable: *Hindsight split tests.* | "Hindsight bias" carries a faint whiff of second-guessing. Generic enough that other analytics products use the word somewhere. |
| **Outcome Tests** | Zero learning curve. Says exactly what it is. | Unownable — a competitor ships "outcome testing" the same week. Flat in a demo. It's the description with the sharp edges filed off. |
| **Verdict Testing** | Strong, decisive, borrows courtroom finality. | Wastes "Verdict" on the wrong object — the verdict is the *signal*, not the test. Using it twice muddies both. |

**Recommendation: Hindsight.** Ship it as **Hindsight split tests** — keep the category noun
("split test") so buyers can find it and understand it in one read, and own the modifier.
This is the Smart Bidding trick: nobody had to explain what bidding was.

The line it earns: *"Every form builder declares a winner before anyone has picked up the
phone. We wait for the phone call."*

---

### Capability 2 — agent-native capture

| Candidate | Case for | Case against |
|---|---|---|
| **Handshake** ⭐ | One word that carries both halves of the mechanism at once: the agent identifies itself, and *that identification is the filter*. Sayable and verb-able ("did it come through the handshake?"). Warm and human for a machine feature, which is the tonal correction this category needs. Works as anti-spam messaging without ever saying "AI." | Slight collision with the crypto/dev sense of "handshake protocol" — actually a plus with the developer audience. Doesn't self-explain the agent half without one sentence of setup. |
| **Front Door** | Wonderful copy metaphor: agents ring the doorbell, bots pick the lock. Immediately understood by a non-technical marketer. | Two words, poor UI label, hard to make a countable noun. Better used as a copy line than a product name. |
| **Agent Mode** | Maximum clarity, zero explanation required, matches how buyers will search in 2027. | Every tool on earth will ship an "Agent Mode" in the next twelve months. Unownable, and it makes the feature sound like a toggle rather than an architecture. |

**Recommendation: Handshake.** Capitalized as the capability ("Handshake"), lowercase as the
per-form artifact ("every form publishes a handshake — a tool definition agents can call
directly"). It communicates *trust established between two parties*, which is precisely what
we sell, and it lets us describe an anti-fraud feature without the defensive, arms-race tone
that CAPTCHA vendors are stuck with.

The line it earns: *"Real agents shake hands. Bots pick the lock."*

---

### The four concepts a user touches

These need names as badly as the capabilities do, because these are the words that end up on
dashboard columns, webhook payloads, and API docs — and once shipped they're unchangeable.

| Concept | **Name** | Runners-up | Why |
|---|---|---|---|
| The outcome signal your CRM sends back | **Verdict** | Outcome, Receipt, Callback | Courtroom finality, and it makes the empty state fantastic: *"142 submissions awaiting verdict."* That single UI string sells the entire product. Values: **Won · Lost · Disqualified · Awaiting verdict**, plus a value amount. |
| The provenance stamp on each submission | **Origin** | Passport, Provenance, Source | Literal, neutral, and works as a dashboard column with three values: **Human · Agent · Unverified**. ("Provenance" is art-world jargon; "Passport" is a great copy metaphor but a strange column header — keep it for prose, not product.) Note we say **Unverified**, not "Bot" — we report what we know, not what we assume. That restraint is credibility. |
| The quality-adjusted metric | **Yield** | Net conversion rate, Earned rate, Real conversion rate | Already means "quality-adjusted output" in finance and agriculture, so it needs no teaching. Sayable in a stand-up: *"Completion rate is 41%. Yield is 4%."* Shipped in two views: **Yield rate** (% of submissions that reached a good verdict) and **Yield value** (revenue per 100 submissions). |
| The agent tool surface | **the form's handshake** | Agent endpoint, Tool surface, Machine surface | Deliberately *not* called "the endpoint." The product is named Endpoint Forms and the tagline is "your form isn't the endpoint" — a second meaning of the word inside the product would be a self-inflicted wound. **[judgment call]** |

**Why the family works:** Verdict, Origin, Yield, Hindsight, Handshake. Five plain English
nouns, none of them AI jargon, none of them invented, all of them slightly forensic. They
sound like a product built by someone who wants to know what actually happened — which is the
entire position, encoded in the vocabulary. Buyers will repeat these words back to us; that
is the test a name has to pass.

**Trademark caveat:** none of these have been screened. Run `/domain`-style USPTO screening
before any of them appear on the marketing site. **[judgment call]**

---

## 3. Feature → benefit → proof

Ordered wedge-first, then table stakes. Table stakes are included deliberately: the research
is unambiguous that failing them kills us regardless of how good the wedge is.

### The wedge

| Feature | Benefit (what they get) | Proof |
|---|---|---|
| **Handshake** — one form definition publishes a human UI and a machine-callable tool surface (MCP / WebMCP) | Agents acting for real buyers can submit cleanly; anything faking the human form is visible as such | WebMCP announced at Google I/O 2026, Chrome Canary preview Feb 2026; only Tally/Jotform/Typeform have MCP servers and all three are *build-a-form* MCPs for authors, not *fill-a-form* surfaces for a buyer's agent |
| **Origin** — every submission stamped Human / Agent / Unverified | You can finally segment your lead list by whether a person was involved | Automated requests are ~57.5% of HTML traffic; "bots are responsible for most of the internet's leads" (u/polygraph-net, r/marketing) |
| **Unverified quarantine** — suspect submissions land in a separate bucket, not your CRM and not your conversion count | Ad platforms stop being trained on garbage; sales stops receiving it | "All those bot submissions were training Google's/your ad network's machine learning algorithm to send you more bot-like traffic." — u/polygraph-net |
| **Verdict** — outcome webhook + CRM sync writes won/lost/disqualified/value back onto the submission | The form finally learns what happened to the lead | "If the form sends data to a CRM, you can even fire the conversion only when a lead is marked as 'qualified.'" — u/Equal_Bag_1368, r/PPC — people are already doing this by hand, one layer up |
| **Hindsight split tests** — variants ranked on Yield, not completion rate | You stop shipping the variant that wins the vanity metric and loses the quarter | Nobody in the corpus feeds outcomes back into form design; the standard workaround is duplicate forms + UTM splitting, or nothing |
| **Yield reporting** — quality-adjusted conversion rate and revenue per 100 submissions, per variant / question / field | One number you can show sales without flinching | "I'd test form completion rate against qualified-call rate rather than guessing." — u/TrafficAcademySEO |
| **Per-question drop-off** — see exactly where people stop inside the form | Stop optimizing the landing page while the damage happens two fields in | "Most loss was not on the page. It was inside the form. One required field created friction." — r/MarketingAutomation, Feb 2026. "The one I'd actually pay for is drop-off reporting." — r/nocode |
| **Drop-off by traffic source** — friction tolerance broken out by paid / organic / referral | Know which fields your paid traffic won't sit through | "Paid traffic was much less tolerant of friction compared to organic or referral. Made us rethink which fields actually need to be mandatory." — u/Spare_Fisherman_5800 |
| **Email / phone / OTP verification, native** | Reject the submission before it becomes a lead, not after | "Needed to verify submissions before accepting them, and Typeform didn't have that. Ended up using Collect.chat." — u/Salty-Garden-7138. ~6 independent sources; a rising, under-served ask |
| **Value push to ad platforms** (feature, never headline) | Bid on revenue instead of fills, without the weekly spreadsheet job | Practitioners already do this manually: "uploading the offline conversions using Google sheets once a week" — u/Few_Presentation_820. We automate a job people already believe in |

### Table stakes we cannot be worse at

| Feature | Benefit | Proof |
|---|---|---|
| **A free tier that isn't a demo** — generous submission allowance, logic included, exports never paywalled | You can put it in production without a credit card conversation | #1 complaint in the corpus (~45 sources): "their free tier is basically a demo at this point." Tally set the bar and is beloved for exactly this: "they don't paywall basic features like exports" |
| **Conditional logic that holds past 5 conditions, with a readable logic view and a debugger** | Complex forms that don't silently skip questions | #1 *functional* complaint (~12 sources) and currently unclaimed: "responses skip questions they shouldn't skip and the logic view is hard to debug." Also: "budget is flexible, just needs to work" — price was never the trigger |
| **Uptime and a builder that isn't buggy** | It's still working on Monday | Three separate people abandoned a cheaper Typeform clone over bugs and downtime: "I've had a form there for 48 hours and most of the time the form is down." This is the anti-switching trigger — a flaky cheap tool loses the customer permanently |
| **Native integrations, not Zapier-only — that fail loudly when a sync breaks** | You find out about the broken pipe from us, not from sales three weeks later | "For me, the paid feature is dependable integrations, not prettier form fields… fails loudly when a sync breaks. That's worth paying for." — the best willingness-to-pay quote in the corpus |
| **Clean webhook payloads** — readable values, not opaque option UUIDs | Automations that don't need a translation layer | "The way they return multiple choice values in webhooks is annoying… `"value": ["e7bfbbc6-…"]`" — u/vulture916, about a tool he otherwise loves |
| **Two-way submission API** — search, update, and set status on submissions, not just fire-and-forget | Real workflows, not one-way notifications | "Most builders just send a flat webhook, but for a real automation you need the automation to be able to 'search' and 'update' the submissions too." — u/Calm_Weakness_2968 |
| **Good enough looking to put in front of a client without custom CSS** | Agencies can ship it under a client's brand on day one | "Limited design/branding options so we don't always have brand consistency for our clients." — agency founder, Capterra/Jotform. And: "Is it worth paying someone on Fiverr to make the form for me using custom CSS?" — the branding gap, priced |
| **Multiple seats without an enterprise contract** | Your team isn't bottlenecked behind one login | ~6 sources: "only one person has the ability to edit… creates a bottleneck in team flow" |
| **Undo** | You can delete a field without dread | 3 sources, disproportionate rage: "No UNDO button when editing / creating form!" |
| **Duplicate-submission protection** | One person is one lead, not three | "Post/redirect/get… you end up with duplicate leads that look like two different people." — u/navlio, r/webdev |
| **Open source, AGPL, genuinely one-command self-host** | No lock-in, your data is yours, and you can read the code that stamps Origin | The corpus is unanimous that OSS form builders are painful to deploy — "deploying them is much harder than signing up for their managed version." That specific gap is the one we can beat Formbricks and OpnForm on. Note: **zero marketers in the corpus asked for open source.** It's a trust and credibility asset, not a demand driver — never the headline |

---

## 4. Objection handling

The honest answer column is the deliverable. Where the objection is *correct*, we concede it
and reframe rather than argue — the research shows this audience can smell a dodge.

| Objection | The honest answer | Proof |
|---|---|---|
| **"If unqualified people are booking, the form isn't what's broken — the page is."** | They're right, and it's the cheapest fix, so do it first: put a price on the page and say who this isn't for. That solves *fit*. It does nothing about the other three: bots that never read the page, agents acting for real buyers, and the fact that after the page fix you still can't tell which version worked. We're not the qualification layer. We're the measurement layer that tells you whether your page fix worked. | The quote itself: "the cheapest fix I know is putting a price or a range on the page… that filters more than four extra fields would." We agree publicly. Then: nothing about a clearer page tells you which variant produced revenue — that's still unmeasured |
| **"Every form element is a barrier to submission."** | Correct, and we're not asking you to add fields. Adding fields is the *old* way to buy quality, and it costs you real buyers. We give you the same information after the fact instead — the verdict comes from your CRM, not from the visitor's patience. If anything, Yield reporting usually tells you to *remove* fields: it shows you which required field is costing you more good leads than the bad ones it stops. | "Most loss was not on the page. It was inside the form. One required field created friction." Per-question drop-off × Yield is exactly the tool for deleting fields with confidence |
| **"We already do offline conversion import."** | Then you're ahead of most of your peers, and we're not going to pretend we invented it. Here's the part your loop doesn't do: it teaches Google. It teaches your form nothing. The same outcome data that improves your bidding could tell you which variant, which question, and which field produced the revenue — and no tool in the category does that with it. We'll also take the weekly spreadsheet job off you. | The falsification finding, stated plainly: practitioners recommend offline conversion import reflexively — *and* "uploading the offline conversions using Google Sheets once a week" is the actual implementation below $5k/mo spend. Nobody, anywhere in the corpus, feeds outcomes back into form design |
| **"Why not just add a CAPTCHA?"** | Because the people you're worried about have already solved it, and the corpus is full of people who tried. CAPTCHA is an obstacle course — it asks "can you do the puzzle?" A handshake asks "who are you?" One of those has an answer that can't be brute-forced by a $2 solving service. Also: CAPTCHA punishes the legitimate agent traffic that's about to become a real share of your buyers. | "reCAPTCHA v2 checkbox is pretty weak these days." · "Captcha can easily be bypassed… max 30 seconds." · "We have captcha on all of our forms, but it seems like these are real people submitting, just bad actors." · "I have a honeypot, but it didn't stop." Four independent people, four failed defenses |
| **"Why would I switch from Tally when it's free?"** | Mostly you shouldn't. Tally is excellent and we'll say so on our own comparison page — if your forms are working and nobody is calling your leads, keep it. Switch when someone starts asking you *which* leads were worth money. That question has no answer in any free tool, including ours-for-free. | Tally is the most-praised product in the corpus and we don't contest it. Our switching trigger isn't price, it's the moment sales rejects the leads: "sales hated the leads" · "the leads are all trash" · "sales are struggling with the leads" |
| **"Our lead volume is too low to learn anything from outcome data."** | This is the hardest objection and the research agrees with it. Below a few qualified leads a day, statistical significance on a Yield test is a fantasy. So we ship the honest version: the *report* works at any volume — you can see that 200 fills produced 3 deals from one source and 0 from another the day you connect your CRM. Automated variant-picking waits until the numbers earn it, and we say so in the UI instead of showing you a confident winner from n=12. | "Optimizing for qualified leads might help but I imagine your qualified lead volume will be too low to feed the algo enough" — u/dillwillhill, r/PPC. Named as the hardest constraint in the VOC report. Refusing to fake significance is a differentiator in a category that fakes it |
| **"Our CRM is a mess — nobody updates lead status."** | Then the outcome loop won't work, and we'd rather tell you now. But the bar is lower than a clean CRM: one webhook, four values, fired from wherever the truth actually lives — a Slack workflow, a spreadsheet, the rep marking a call. **"Awaiting verdict"** is a first-class state precisely because most submissions will sit in it. Even partial verdicts beat completion rate. | "The biggest thing is making sure your CRM mapping is clean before you let AI loose on it — if the fields are messy it will just make a bigger mess." — u/Ok-Transition5401. We design for messy, not for ideal |
| **"Agent traffic isn't real yet — WebMCP is a Canary preview."** | True today, and we won't pretend otherwise. But the provenance half pays for itself immediately, regardless of agent volume: knowing that 300 of last month's 400 submissions came from something that couldn't identify itself is useful right now, in 2026. The agent surface is the option you'll want to already have. | WebMCP announced I/O 2026, Chrome Canary Feb 2026 — we cite the actual maturity. Meanwhile automated requests are already ~57.5% of HTML traffic |
| **"The last cheap Typeform alternative I tried was broken."** | Fair, and that specific graveyard is why we're not competing on price. Three separate people in our research abandoned a cheaper clone over bugs and downtime — that's the failure mode we're most afraid of. It's also why the core is open source: you can read it, host it, and leave with your data if we let you down. | "Incredibly buggy… doesn't reflect changes in real time." · "Tried too hard to make it work but finally gave up." · "I've had a form there for 48 hours and most of the time the form is down." The corpus taught us this lesson at someone else's expense |
| **"I've built my whole workflow around Jotform/Gravity Forms."** | Then don't rip it out. Point one form at us — the one your paid traffic hits — and leave everything else where it is. If Yield doesn't tell you something your current stack can't, you've lost a Tuesday afternoon. | "I still use Jotform since it's been reliable for me… I built my workflow around them." Inertia is real and arguing with it loses. The wedge is one form, not a migration |
| **"Isn't open source just harder to run and less secure?"** | Harder to run, historically yes — the corpus is brutal about how painful OSS form builders are to deploy, and one-command self-hosting is a promise we're making because of it. Less secure, no: you can read exactly how Origin is determined and where submissions are stored, which is more than any hosted competitor offers. Most people should use the hosted version anyway. | "Deploying them is much harder than signing up for their managed version." · "Only very technical users self-host apps." · Counterweight: "It's way easier to trust something open source in this regard" |
| **"Aren't you just Reform.app or Heyflow with extra steps?"** | They're the closest neighbors and both are good. Heyflow sends server-side conversions — but it sends "a lead," not "a lead worth $4,200," and it optimizes funnels on completion like everyone else. Reform does qualification routing and enrichment beautifully, upstream of the submit button. Neither one takes the downstream outcome and re-ranks your variants with it. That's the whole difference and it's a narrow one — we'd rather state it narrowly and be right. | Landscape research: Heyflow does CAPI but on lead events, ROASForm tracks funnel-step movement, not outcomes. Nobody scores variants on downstream value |

**Anti-personas — who we tell to go elsewhere, by name:**
casual/one-off form users (Tally, and we'll say so), survey researchers (Perspective, Typeform),
enterprise compliance buyers who need HIPAA/FedRAMP on day one (FormAssembly), and anyone
whose forms nobody follows up on. Saying this out loud is cheap and buys enormous credibility
in a category where every vendor claims every buyer.

---

## 5. Competitive comparison language

**The rule: we win on the metric, not by trashing anyone.** The corpus shows this category is
40–60% astroturf and buyers are primed to distrust vendor comparisons. Being visibly fair
about competitors is a differentiator, not a concession. Every comparison follows the same
three-beat structure: **what they're genuinely great at → who should use them → the one thing
that changes.**

### Tally

> **Say:** Tally is the best free form builder there is, and it isn't close. Unlimited forms,
> unlimited submissions, exports that aren't paywalled, and a builder as easy as typing in a
> document. If your forms are working and nobody is asking hard questions about the leads,
> use Tally. We mean that.
>
> **What changes:** the day someone asks which of those submissions turned into money. Tally
> will tell you how many people finished. It has no idea what happened next, because it was
> never built to.

**Never say:** anything about Tally's price, design, or simplicity. We lose all three and
attacking the most-loved product in the category reads as insecurity.

### Typeform

> **Say:** Typeform still makes the best-looking forms in the category and the one-question-
> at-a-time experience genuinely does lift completion. People pay for it because it works.
>
> **What changes:** completion is the thing Typeform optimizes, reports, and charges you for
> — and completion is the number that cannot tell a buyer from a bot. A prettier form that
> converts 40% better can produce worse pipeline, and nothing in Typeform will ever tell you.

**Never say:** the "free tier cut to 10 responses" or "$199 CAPTCHA" figures. Both are
unverified, contradicted by Typeform's live pricing page, and using them would hand a
sophisticated buyer a reason to distrust everything else we say. Price resentment toward
Typeform is real and well-documented; we don't need to inflate it. **(Spine constraint.)**

### Jotform

> **Say:** Nobody has more depth. 20,000+ templates, payments, calculations, PDF output,
> scoring — if you need a form to *do* something unusual, Jotform probably already does it,
> and has for years.
>
> **What changes:** depth on the form, not on the outcome. Jotform will happily build you a
> 40-field application with conditional payment logic, and then report on it the same way it
> reports a newsletter signup: how many finished.

**Fair mention:** their seat limits are a real, repeated frustration (~6 sources). Cite it
once as evidence that team-level access shouldn't be an enterprise upsell — don't dwell.

### Heyflow

> **Say:** Heyflow understood before almost anyone that paid traffic needs funnels, not
> forms. Server-side Meta CAPI, Google and TikTok conversions, SMS/phone validation — it's
> a genuinely serious paid-acquisition tool and the closest thing to a peer we have on
> tracking.
>
> **What changes:** Heyflow sends the ad platform *a lead*. It doesn't send *a lead worth
> $4,200*, and it doesn't bring the answer back to the form. Its funnels are still optimized
> on step completion, which is the same vanity metric in a nicer suit.

### Reform.app

> **Say:** Our closest philosophical neighbor. Reform is right about almost everything —
> multi-step, qualification routing, enrichment, progressive profiling, spam prevention. If
> you want to qualify *before* the submit button, they've thought about it harder than most.
>
> **What changes:** Reform qualifies at capture, using what it can infer in the moment. We
> score after the fact, using what actually happened. Those are complementary ideas, and the
> honest version is that the second one is currently unbuilt by anyone.

### The rest of the field

> The category's search results are near-exclusively AI-generated comparison content from a
> dozen near-identical tiny form builders. We don't name them, we don't write "9 Best Form
> Builders in 2026," and we don't play that game — a contrarian point of view is a better
> distribution bet than saturated comparison SEO. **[judgment call, from the wedge research]**

---

## 6. Elevator pitches

### One sentence

> **Endpoint Forms is a form builder that scores your forms on what the leads turned out to
> be worth — and tells you which submissions came from an actual human.**

Alternate, for a room that already feels the pain:

> **Every form builder reports completion rate. Completion rate can't tell a buyer from a bot.**

### 30 seconds

> Every form builder on the market reports the same number: completion rate. Nobody is paid
> on completion rate. And that number can't distinguish a buyer from a tire-kicker from a bot
> — which matters now that most web traffic is automated.
>
> Endpoint Forms does two things nothing else does. Every submission gets stamped with its
> origin: human, agent, or unverified — because the form publishes a real tool surface for
> legitimate agents, so anything faking the human form gives itself away. And every submission
> gets a verdict back from your CRM — won, lost, disqualified, and a value — so your split
> tests rank variants on revenue instead of fills.
>
> The demo is thirty seconds long: variant B wins on completion by 41%, you flip the view, and
> variant A produced all the money. It's open source, and there's a free tier that isn't a demo.

### 2 minutes

> Here's the thing about form builders. Every single one of them — Typeform, Jotform, Tally,
> all of them — reports the same headline number: completion rate. And completion rate has
> one fatal property. It cannot tell you anything about the person who completed.
>
> That used to be a rounding error. It isn't now. Bad bots were 40% of internet traffic last
> year. Automated requests are around 57% of HTML traffic. About 30% of purchased leads are
> outright fake. So the number every form builder optimizes, reports, and charges you by is a
> number that counts bots and buyers identically.
>
> If you run paid acquisition you already know how this feels. There's a thread on r/PPC that
> says it perfectly: *"At first I thought it was working great, until the leads were called.
> Every single one has been junk or spam. I'm still getting charged for the clicks, Google is
> tracking form submissions as conversions, and everything looks normal from a reporting
> standpoint — but the leads are all trash."* The dashboard says everything is fine while
> sales drowns. That's the enemy. Not any particular competitor — that specific dishonesty.
>
> Endpoint Forms fixes it in two places.
>
> First: we know who filled out the form. One form definition publishes two surfaces — the
> human page, and a machine-callable tool surface an agent can call directly. That means a
> legitimate agent buying on someone's behalf submits cleanly and gets marked as an agent, and
> anything stuffing the human form while pretending to be software has told on itself. Every
> submission carries an origin: human, agent, or unverified. Same mechanism, both problems.
> CAPTCHAs ask "can you solve the puzzle" — which a $2 service does in thirty seconds. We ask
> "who are you."
>
> Second: the form learns what happened. Every submission gets a verdict back from your CRM or
> a one-line webhook — won, lost, disqualified, with a value. Split tests then rank variants on
> yield, meaning quality-adjusted conversion rate, instead of completion. So the variant that
> produces fewer submissions and more revenue wins, which is the correct answer and the one no
> tool in this category can currently give you.
>
> To be clear about what we're not claiming: pushing outcome data back to your ad platform is
> a solved problem. Good PPC people already do offline conversion import, and we're not going
> to insult them by calling it new. But that loop teaches Google. It teaches your form nothing.
> Nobody takes downstream outcome data and uses it to decide which variant, which question,
> which field. That half is completely unclaimed, and that's the half we're building.
>
> Underneath it: conditional logic that doesn't break past five conditions, per-question
> drop-off, integrations that fail loudly when they break, a free tier that isn't a demo, and
> the whole core is AGPL and self-hostable. If your forms are simple and nobody's calling your
> leads, honestly, use Tally — it's free and it's great. Come to us when someone starts asking
> which leads were worth money.

---

## 7. Words we use / words we never use

Extends the spine's vocabulary bank with everything mined from the VOC report.

### Words we use

**For bad leads (their words, verbatim from the corpus):**
trash leads · garbage leads · junk leads · tire kickers · looky-loos · fake form submissions ·
"the leads are all trash" · "sales hated the leads" · "they ghost off the bat" ·
"flying blind after the lead form" · bull-shit demo requests · lead form junk

**For the core dishonesty:**
"everything looks normal from a reporting standpoint" · "looked amazing on paper" ·
"your dashboards will look amazing while pipeline quality tanks" · vanity metric ·
"nobody owns the middle" · "those are not the same quality of conversion" ·
counting bots and buyers identically

**For pricing:**
per-response tax · "their free tier is basically a demo" · "paying for features I didn't need" ·
"forced onto a professional plan" · "expensive fast" · "hit the paywall quickly" ·
"they don't paywall basic features" (the standard we hold ourselves to)

**For the workflow gap:**
"what happens after the submission" · "the real bottleneck is what happens after the form" ·
"dependable integrations, not prettier form fields" · "fails loudly when a sync breaks" ·
glue code · Zapier layers

**For analytics:**
drop-off per question · "the loss wasn't on the page, it was inside the form" ·
view → start → completion · which field is costing you

**Our own terms (defined, never assumed):**
Verdict · Origin · Yield · Hindsight · Handshake · Awaiting verdict · Unverified

### Words we never use

| Never say | Because |
|---|---|
| **qualified pipeline** | Nobody outside r/PPC says it. The corpus is explicit: marketers say "lead quality," "junk leads," "sales hated the leads" |
| **lead velocity, MQL, pipeline influence** | Enterprise demand-gen vocabulary. Our ICP is an agency owner and a PPC specialist, not a VP of Demand Gen at a Series C |
| **frictionless, seamless, effortless** | Empty, and "frictionless" is the exact belief that produced the junk-lead problem |
| **revolutionary, game-changing, next-generation, reimagined** | Spine constraint. Also the house style of the AI-generated competitor content we're differentiating from |
| **AI-powered, AI-first, powered by AI** | That lane is crowded, thin, and low-trust (spine anti-positioning). We happen to be agent-native; that's an architecture claim, not an AI claim |
| **synergy, holistic, leverage (as a verb), unlock** | Consultant filler |
| **"close the loop with your ad platform"** as a headline | Hard spine constraint — falsified as a wedge. May appear as a feature line, never as a promise |
| **bot** as a submission label | We say **Unverified**. We report what we know, not what we assume. Calling a submission a bot when we can't prove it is the same overconfidence we're attacking |
| **CAPTCHA-killer, bot-proof, 100% spam-free** | Nobody has solved spam and everyone in the corpus knows it. Absolute claims here read as either naive or dishonest |
| **"the last form builder you'll ever need"** | Category cliché, and untrue |
| **conversion rate** unqualified, in our own product | Always **completion rate** (theirs) vs **Yield** (ours). Keeping those words separate is the whole argument |

---

## 8. Copy fragments

Reusable lines for downstream copywriting. Tested against the voice constraint: contrarian
without smug, specific over clever, sounds like a person with receipts.

**Headlines**

1. Your form can't tell a buyer from a bot — and it's reporting both as conversions.
2. Completion rate can't tell you anything about the people who completed.
3. Two variants. One converted 41% better. It also produced zero closed deals.
4. Every form builder declares a winner before anyone has picked up the phone.
5. The dashboard says everything is fine. Sales says the leads are trash. One of them is lying.
6. Most of the internet isn't people anymore. Your form still charges you by the submission.

**Subheads**

7. Every submission gets a verdict — won, lost, disqualified, and what it was worth. Your split tests use it.
8. Real agents shake hands. Bots pick the lock. Now you can tell which one filled out your form.
9. A form that never learns what happened to the lead is a spreadsheet with a submit button.
10. Won, lost, disqualified. Three words no form builder has ever asked your CRM for.
11. Your leads have an origin. As of today, so does your dashboard.
12. We don't ask visitors to prove they're human. We ask software to say that it's software.

**CTA framings**

13. See which variant actually produced revenue →
14. Point one form at us. The one your paid traffic hits.
15. Get the verdict on your forms →
16. Find out what your last 100 submissions were actually worth →

**Utility lines** (product surface, docs, empty states)

17. 142 submissions awaiting verdict.
18. Completion rate: 41%. Yield: 4%.
19. Not enough verdicts yet to call a winner. We'll say so until there are.

**Sourced from customers — paraphrase, never quote as our own:**

20. If your form has a submission limit, bots are using it before real people get a chance.
    *(u/kjdscott, r/Entrepreneur, Sep 2025 — the single best bridge between the spam problem
    and the pricing problem. Use as an attributed pull quote, not as a headline we wrote.)*

---

## 9. Downstream notes

- **Naming is unscreened.** Verdict, Origin, Yield, Hindsight, Handshake need USPTO and
  domain/social screening before they appear publicly. **[judgment call]**
- **The 41% demo number is illustrative.** It appears in the wedge research as a hypothetical.
  Until we have a real split test with real verdicts behind it, frame it as an example
  ("a variant that converts 41% better can produce zero deals"), never as a result we measured.
- **README and CLAUDE.md were updated to match the spine while this doc was being written.**
  Both now lead with provenance and carry the ad-platform constraint correctly. Neither yet
  uses the feature names in section 2 — worth a pass once the names are approved.
- **Biggest open risk, carried forward from the research:** nobody in the corpus complained
  about attribution loss *at the form layer*. The pain is real but is currently blamed on the
  analytics stack. Our message may need an education beat before the value lands. Watch for
  this in the first customer conversations.
