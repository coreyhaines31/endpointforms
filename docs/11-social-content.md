# Social content — Endpoint Forms

**Version:** v1 · **Date:** 2026-08-28 · **Closes:** [#11](https://github.com/coreyhaines31/endpointforms/issues/11)
**Inherits from:** [`00-positioning-spine.md`](./00-positioning-spine.md), [`02-messaging.md`](./02-messaging.md), [`03-brand.md`](./03-brand.md), [`04-keyword-research.md`](./04-keyword-research.md). Nothing here relitigates the spine.

> **Why this document carries more weight than a social plan usually does.**
> `04-keyword-research.md` found that the primary ICP is not reachable by search. Every
> keyword built from actual ICP language — `agency form builder`, `ppc landing page form`,
> `b2b lead form`, `lead capture form for ppc` — returned **zero volume**. `fake leads
> google ads` returns **0 in Ahrefs, US and global**. The junk-leads pain has ~22
> independent angry sources in the VOC corpus and roughly 1,300 searches/month behind it,
> ~700 of which is WordPress-plugin repair intent. Those are the same people. **They
> complain in communities and they do not search.**
>
> Comparison pages will carry traffic. They will not carry the ICP. Organic social and
> community are the only channels that reach an agency owner or a PPC specialist at the
> moment they feel this. That makes these drafts the primary acquisition asset for the
> primary buyer, not a supporting one.

**Honesty constraint, load-bearing throughout.** Endpoint Forms does not exist. There is no
product, no customer, no screenshot of a real dashboard, no measured result. Every post below
is written to be true on the day it ships. Build-in-public is not a stylistic choice here —
it is the only frame available that isn't a lie, and it happens to be the strongest one we
have, because the thing we're selling is a refusal to overclaim.

---

## 1. Channel strategy

### The posture question, first

**Everything ships from Corey's personal accounts, not a brand account.**

The VOC research is blunt about why: this is *"the most astroturfed software niche I have
mined,"* 40–60% vendor plants on "best form builder" threads, with a confirmed pay-to-recommend
ring. In a category where the reader's default assumption is that they're being marketed at by
a sockpuppet, a zero-follower brand account posting contrarian takes about lead quality reads
as exactly what it is. A named person with a track record reads as a point of view.

`04` says the same thing from the other direction: the POV play *"has to be a genuinely good
argument posted by a named person, not content marketing."*

**Create `@endpointforms` on X and a LinkedIn company page anyway** — namespace defence, plus a
place to put changelog entries and release notes after launch. Do not post POV content from
them. Do not build an audience there. They are receipts, not a channel.

### Where we post

| Channel | Verdict | Job | Cadence |
|---|---|---|---|
| **X (personal)** | **Primary** | POV, research findings, the wrong-calls. Where PPC people, indie devs, and the WebMCP/agent crowd overlap. Fastest feedback loop on whether an argument lands. | 5×/week |
| **LinkedIn (personal)** | **Primary** | Agency owners and in-house demand-gen. ~20% of the complaint corpus is agencies/freelancers and ~12% is PPC specialists; the agency half lives here. "Show the working" register. | 4×/week |
| **Waitlist email / build log** | **Primary, owned** | The only surface where a link is not a penalty and the full argument fits. The waitlist *is* the newsletter. | Weekly, once there's a list |
| **Reddit** | **Participate, never seed** | See §1.1. Honest replies as a named person, no vendor plants, no plan. | Opportunistic, ungated |
| **Hacker News** | **Later, once** | A Show HN when there is running code someone can `docker compose up`. Not before. | Once, at product launch |
| **YouTube (Corey's channel)** | **Repurpose only** | The 30-second demo (variant B wins on completion, flip to Yield, variant A produced all the revenue) is the single best asset this product will ever have — and it cannot be filmed until the product renders it. | Deferred |

### 1.1 Reddit — participate, never seed. Stated explicitly.

There is an obvious playbook here and we are not running it. It would work, and running it
would end the argument we're making.

The VOC research documented a named pay-to-recommend ring in this exact category — 14
near-identical plugs for one vendor across 5 threads, called out in the open by a commenter:
*"don't believe the guys how write 'woorise' they just have a giveaway running, where you have
to recommend woorise here and show them proof. shady practice!"* (u/djsoundmusicx,
r/EcommerceWebsite, Jun 2026). It also flagged six probable AI-generated SEO subreddits.

**Our entire pitch is that this category reports numbers that aren't true.** A seeding plan
makes us the thing we're attacking, and it is discoverable — that commenter found it in one
thread, from the outside, for free.

**What is allowed:**
- Replying under Corey's real, named account, disclosed, when someone asks a question he can
  actually answer — including answers that recommend a competitor.
- Answering *"has anyone solved form spam"* threads with the honest answer, which is no.
- Linking to the public research or the repo **only when directly asked**, and never in a
  thread we didn't already have a reason to be in.

**What is banned:** alt accounts, "I found this tool and it's great" posts, asking anyone to
post on our behalf, incentivised mentions, posting the same comment in more than one thread,
and DMing anyone who complained about junk leads. All of it, permanently, including after
launch.

### 1.2 Where we deliberately are not

- **Instagram, TikTok, Facebook** — the buyer is an agency owner debugging a GTM trigger at
  11pm. The production cost is real and the ICP density is near zero.
- **Threads and Bluesky** — the dev/OSS slice is partly there; the agency and PPC slice is not.
  Revisit only if the repo earns enough stars that the OSS audience becomes a channel on its
  own. Not worth the rewrite tax now.
- **Product Hunt** — a launch surface for a product. We don't have one. Launching a waitlist
  there burns the one shot.
- **Indie Hackers / founder communities** — wrong audience. They'd enjoy the build-in-public
  posts and none of them buy this. If BIP posts get cross-posted there it should be because
  someone else did it.
- **Discord/Slack communities as a vendor** — same objection as Reddit seeding, smaller
  audience, worse optics.
- **Comparison-content SEO on social** ("9 best form builders in 2026") — `03-brand.md` §"How
  we talk about competitors" forbids it and it is the exact genre we're differentiating from.

### 1.3 Hacker News — the one shot, and when to spend it

HN is the single highest-leverage surface available to this project and it can only be used
once well. The conditions to spend it:

1. There is a repo someone can run in one command. The corpus is unanimous that OSS form
   builders are painful to deploy; shipping an unrunnable repo to HN converts our best
   credibility asset into our worst first impression.
2. The Manifest / agent tool-surface spec is published and readable, because that — not the
   form builder — is the part HN will actually argue about.
3. We are ready for the top comment to be *"this is a form builder with extra steps."* The
   answer is in `02-messaging.md` §4 and it needs to be one paragraph, not a blog post.

Until all three are true, HN gets nothing. A "Show HN: my pre-launch positioning docs" is a
real temptation and it would be the cheapest possible way to make a first impression we can't
take back.

### 1.4 YouTube — deferred on purpose, with one exception

Corey has a channel and the instinct to use it is right eventually. Two problems now: the ICP
overlap with an AI-marketing channel is partial, and the asset that would actually sell this —
the 30-second Yield flip — requires a product that renders it.

**The exception worth considering:** a single video on the research itself, framed as
methodology rather than product ("I spent $0.25 and a week of API calls finding out my customer
doesn't search"). That is genuinely interesting to the channel's existing audience, is honest,
and costs nothing in credibility if the product never ships. Treat it as optional, not planned.

### 1.5 The WebMCP note

`webmcp` is 2,900/mo US and ~11,000/mo global, the two tools agree within 4%, and **no form
builder ranks for it or has attempted it.** That is a search play, owned by `04`, not a social
play. But it has a social half: the people asking what WebMCP is are on X and HN, and being the
form builder that explains it well is worth more in citations than in clicks. Posts 25 and 35
below are the social edge of that; the page is `04`'s job.

---

## 2. Content pillars and the jab/hook ratio

Gary Vaynerchuk's framing, and the ratio is deliberately far more jab-heavy than a normal
rotation, for one reason: **there is nothing to buy.** A hook that lands on a waitlist has a
fraction of the value of a hook that lands on a product, so hooks are rationed until they're
worth more.

| # | Pillar | Type | Target share | Drafted |
|---|---|---|---|---|
| **P1** | **The metric** — the contrarian POV. Completion rate can't tell you anything about the people who completed. | Jab | 30% | 10 |
| **P2** | **Wrong calls and build-in-public** — including, especially, the things we got publicly wrong. | Jab | 25% | 10 |
| **P3** | **Research receipts** — data from the VOC and keyword work that nobody else has published. | Jab | 20% | 7 |
| **P4** | **Craft decisions** — naming, accessibility, colour, the license. Showing the instrument being built. | Jab | 15% | 5 |
| **P5** | **The ask** — waitlist, repo. | **Hook** | 10% | 3 |

**32 jabs to 3 hooks.** Roughly 9:1.

**Note the deliberate overweight on P2.** Drafted at 10 posts against a 25% target that would
have given it 9. That extra post is not an accident and it isn't padding — P2 is the ballast
that keeps P1 from curdling. Every post where we're right about the category is one post
closer to needing a post where we were wrong about ourselves. See §5.

**Pillar sequencing rules:**
- Never two P1 posts in a row on the same platform. The POV is the strongest thing we have and
  the fastest to sour.
- P2 within 48 hours of every second P1 post. This is a scheduling constraint, not a preference.
- P5 never lands in the same week as another P5, and the day after any P5 is a jab that doesn't
  mention the product.
- P4 is the palate cleanser. Use it when a week has run hot.

---

## 3. The 35 drafted posts

**Format conventions.** X drafts are written to fit 280 characters unless flagged. LinkedIn
bodies run 400–900 characters — deliberately longer than the 200–400 default in the personal
voice reference, because `03-brand.md` sets the LinkedIn register as *"show the working: what we
tried, what the number was, what we changed,"* which does not fit in 400 characters. **[judgment
call, flagged rather than silently taken.]**

**Link placement is absolute.** No URL appears in any post body on either platform. Links go in
a reply (X) or the first comment (LinkedIn), and only on the three P5 posts.

Attributed quotes stay attributed, inside the post copy, every time.

---

### P1 — The metric

#### 1 — The arithmetic
**Platform:** X · **Pillar:** P1 · **Link:** none

> Completion rate can't tell you anything about the people who completed.
>
> Not a knock on one tool. It's the arithmetic — the number counts a bot and a buyer
> identically. It's also the headline metric in every form builder out there, including the one
> I'd have built by default.

---

#### 2 — Everything looks normal from a reporting standpoint
**Platform:** LinkedIn · **Pillar:** P1 · **Link:** none

> Someone on r/PPC last October described the failure this whole category has quietly agreed
> not to name:
>
> "At first I thought it was working great… until the leads were called. Every single one has
> been junk or spam. I'm still getting charged for the clicks, Google is tracking form
> submissions as conversions, and everything looks normal from a reporting standpoint — but the
> leads are all trash."
>
> Everything looks normal from a reporting standpoint.
>
> The dashboard isn't lying, exactly. It's answering the only question it was built to answer:
> how many people finished. Nobody in that thread is paid on how many people finished.

---

#### 3 — The 41% variant
**Platform:** X · **Pillar:** P1 · **Link:** none

> A form variant that converts 41% better can produce zero closed deals.
>
> Every builder in the category would call it the winner, and every one of them would be
> reporting accurately. They measure completion. Nobody is paid on completion.

*Note: 41% is illustrative and must stay conditional — "can produce," never "produced." See
`02-messaging.md` §9.*

---

#### 4 — Nobody owns the middle
**Platform:** LinkedIn · **Pillar:** P1 · **Link:** none

> The best explanation of the junk-leads problem I've found wasn't from a vendor. It was
> u/Common_Dependent_284 on r/DigitalMarketing in May:
>
> "The root problem usually is structural. Marketing gets measured on CPL so they optimize for
> CPL. Sales get measured on closed deals. Nobody owns the middle. … The moment you start
> optimizing for pipeline quality over volume everything looks more expensive on paper and
> better in reality. That's a tough sell to stakeholders addicted to low CPLs."
>
> Nobody owns the middle — and every tool in the middle reports the metric that belongs to one
> end of it.

---

#### 5 — The wrong question
**Platform:** X · **Pillar:** P1 · **Link:** none

> A CAPTCHA asks: can you solve the puzzle. A $2 solving service answers that in about 30
> seconds.
>
> The useful question is: who are you. The only software that can answer it is software willing
> to say that it's software.

---

#### 6 — The best argument against what I'm building
**Platform:** LinkedIn · **Pillar:** P1 · **Link:** none

> The strongest counter-argument to this whole project came from a marketer on
> r/DigitalMarketing, and he's right:
>
> "If unqualified people are booking, the form is not the thing that is broken, the page is. It
> has not told them who this is not for. Cheapest fix I know is putting a price or a range on
> the page… That filters more than four extra fields would."
> — u/Conscious-Market8982
>
> Do that first. It's free, it takes an afternoon, and it will out-perform four extra form
> fields.
>
> It does nothing about three other things: bots that never read the page, agents acting for
> real buyers, and the fact that after you fix the page you still can't tell whether the fix
> worked. A clearer page doesn't tell you which version produced revenue.
>
> We're not the qualification layer. We're the part that tells you whether your qualification
> worked.

---

#### 7 — Before the phone call
**Platform:** X · **Pillar:** P1 · **Link:** none

> Every form builder declares a winner before anyone has picked up the phone.
>
> The phone call is the only place the answer lives.

---

#### 8 — The submission limit
**Platform:** X · **Pillar:** P1 · **Link:** none

> Best sentence I found in the research — u/kjdscott, an agency dev on r/Entrepreneur:
>
> "If your form software has a submission limit, bots are using it before real people even get
> a chance."
>
> Automated requests are ~57.5% of HTML traffic. Per-submission pricing meters software.

---

#### 9 — Not the same quality of conversion
**Platform:** LinkedIn · **Pillar:** P1 · **Link:** none

> A marketer on r/DigitalMarketing designed the model I want to sell, for free, in one line:
>
> "Form started, contact captured, form completed, visit booked, job won. Those are not the
> same quality of conversion."
> — u/kaancata
>
> He's describing five different events. Your form builder reports one number for all of them
> and calls it conversion rate.
>
> The gap between "form completed" and "job won" is where the entire argument lives, and it's
> the one stretch of that sequence no form tool has ever looked at.

---

#### 10 — A spreadsheet with a submit button
**Platform:** X · **Pillar:** P1 · **Link:** none

> A form that never finds out what happened to the lead is a spreadsheet with a submit button.
>
> Won, lost, disqualified. Three words no form builder has ever asked your CRM for.

---

### P2 — Wrong calls and build-in-public

#### 11 — The wedge that died
**Platform:** LinkedIn · **Pillar:** P2 · **Link:** none

> I spent a week building a pitch around closing the loop between your CRM and your ad
> platform. Then the research killed it, and I'm glad it did it before the homepage existed
> rather than after.
>
> Competent PPC people already do this. It's called offline conversion import, and in the
> threads I mined it isn't presented as clever — it's first-line advice. One reply to a
> lead-quality question, in full: "Use offline conversion tracking to report qualified leads
> only." That's the whole comment. Assumed knowledge.
>
> If I'd led with it I'd have been selling a solved problem to the people most likely to know it
> was solved, against HubSpot, WhatConverts and CallRail.
>
> Here's the half that survived, and it's narrower and better: that loop teaches Google. It
> teaches your form nothing. Across roughly 40 threads, not one person feeds a downstream
> outcome back into which variant, which question, or which field they use.
>
> Losing the big claim got me a true one.

---

#### 12 — The SERP I misread
**Platform:** X · **Pillar:** P2 · **Link:** none

> I said comparison pages were unwinnable — that SERP is all AI slop from tiny form builders.
>
> Then I pulled it live. A DR-42 site with one backlink holds #6 for 'typeform alternative.' KD
> 0 in both tools.
>
> The slop was evidence the bar is on the floor, not that it's high.

---

#### 13 — My customer doesn't search
**Platform:** LinkedIn · **Pillar:** P2 · **Link:** none

> Keyword research came back this week and told me the people I'm building for can't be reached
> the way I planned.
>
> Every term I built out of actual customer language returned zero. "agency form builder": 0.
> "ppc landing page form": 0. "b2b lead form": 0. "fake leads google ads": 0 in the US and 0
> globally. "junk leads": 10 searches a month.
>
> Meanwhile there are ~22 independent people in my research corpus who are genuinely furious
> about junk leads, quoting numbers, naming the cost.
>
> Same people. They complain in communities and they don't search.
>
> That's a real constraint, not a rounding error. It means search will bring the wrong buyer —
> price-motivated, not outcome-motivated — and the right buyer has to be reached somewhere
> else. Better to find that out for $0.25 in API calls than after a quarter of content.

---

#### 14 — 1,300 searches, 700 of them WordPress
**Platform:** X · **Pillar:** P2 · **Link:** none

> The whole spam-and-fake-leads keyword universe above 30 searches a month is about 1,300/mo in
> the US. Roughly 700 of that is people trying to fix a WordPress plugin this afternoon.
>
> I had a content plan built on that cluster. Glad I checked before writing any of it.

---

#### 15 — The stat I deleted
**Platform:** LinkedIn · **Pillar:** P2 · **Link:** none

> I found a statistic that would have made my argument much stronger, and I'm not going to use
> it.
>
> Several sources claim a competitor cut its free tier to 10 responses a month and put CAPTCHA
> behind a $199+ plan. That is a gift if you're building a case about per-response pricing.
>
> I pulled their live pricing page. Free is 100 responses. The entry plan is $28. reCAPTCHA is
> available from $56. All three of the numbers that would have helped me are contradicted by the
> vendor's own page.
>
> So they're struck from every document, permanently, including the ones nobody will read.
>
> The resentment about form-builder pricing is real and extremely well documented — ~45
> independent people in my corpus, the single most common complaint in the category. I don't
> need to inflate it. And in a market this full of invented numbers, one bad stat costs you
> every other one you'll ever cite.

---

#### 16 — $0.12 for fake taxi meaning
**Platform:** X · **Pillar:** P2 · **Link:** none

> Spent $0.12 asking a keyword tool to expand ten seed terms about fake leads.
>
> It returned 'fake taxi meaning,' 'fakespot alternative,' 'can spam act,' and 'deepfake
> meaning.'
>
> Wasted money, useful signal: there's no dense commercial cluster here for the algorithm to
> find.

---

#### 17 — Marketing first, product second
**Platform:** LinkedIn · **Pillar:** P2 · **Link:** none

> There's no product. There isn't a landing page yet either.
>
> What exists: a positioning doc, a messaging doc with the objections and the honest answers, a
> brand system with the contrast ratios computed, keyword research that contradicts two of my
> own earlier calls, and a site architecture. All in a public repo, AGPL, written before a line
> of product code.
>
> I'm doing it in this order on purpose. Build first and the marketing ends up as an apology for
> whatever got built — you spend the launch explaining why the thing does what it does instead
> of why anyone should care.
>
> The risk of this order is obvious and I'll name it before someone else does: it is very easy
> to write a beautiful argument for a product that never ships. Ask me again in three months.

---

#### 18 — What we lose at
**Platform:** X · **Pillar:** P2 · **Link:** none

> Things Endpoint Forms will not be: the cheapest, the prettiest, or the one with the most
> features.
>
> Tally owns cheap and it isn't close. Typeform owns pretty. Jotform has 20,000 templates.
>
> Writing down what we lose at first made every other decision easier.

---

#### 19 — The failure mode I'm actually scared of
**Platform:** LinkedIn · **Pillar:** P2 · **Link:** none

> The thing I'm most worried about isn't a competitor out-building us. It's being the flaky
> cheap alternative.
>
> Three separate people in my research abandoned a cheaper Typeform clone over bugs and
> downtime. One of them: "It's crap. I've had a form there for 48 hours and most of the time the
> form is down. Moving to another option." Another: "Tried too hard to make it work but finally
> gave up."
>
> None of them went back. And they didn't just distrust that product — they got warier about the
> whole category of alternatives, which is the category we're about to join.
>
> A clever metric doesn't survive an unreliable builder. It's the reason we're not competing on
> price, and the reason uptime is the boring thing I'll be most annoying about.

---

#### 20 — The objection I can't beat
**Platform:** X · **Pillar:** P2 · **Link:** none

> Hardest objection to what I'm building, and I don't have a clean answer:
>
> "your qualified lead volume will be too low to feed the algo enough" — u/dillwillhill, r/PPC
>
> So the report works at any volume. The automation waits until the numbers earn it.

---

### P3 — Research receipts

#### 21 — The most astroturfed niche I've mined
**Platform:** LinkedIn · **Pillar:** P3 · **Link:** none

> I mined about 40 Reddit threads and 150 review-site reviews to research this category. The
> most useful finding wasn't a complaint.
>
> Roughly 40–60% of the comments on "best form builder" threads are vendors, employees, or paid
> plants. One giveaway ring got called out in the open by a bystander: "don't believe the guys
> how write 'woorise' they just have a giveaway running, where you have to recommend woorise
> here and show them proof. shady practice!" I counted 14 near-identical plugs across 5 threads.
>
> Which settles something I'd been sitting on. There's an obvious playbook where you seed a few
> threads before launch. We're not running it — not now, not after launch.
>
> If the pitch is that this category reports numbers that aren't true, we don't get to
> manufacture comments that aren't true. And it's discoverable. That commenter found the ring
> from the outside, in one thread, for free.

---

#### 22 — The complaint ranking
**Platform:** X · **Pillar:** P3 · **Link:** none

> Form builder complaints, by number of independent sources:
>
> 1. Pricing (~45)
> 2. Spam and junk leads (~22)
> 3. Conditional logic breaking past 5 conditions (~12)
> 4. What happens after the submission (~11)
> 5. How the form looks (~11)
>
> The category competes almost entirely on #5.

---

#### 23 — The gap nobody is standing in
**Platform:** LinkedIn · **Pillar:** P3 · **Link:** none

> I went through roughly 40 threads looking for one specific thing: anyone who takes what
> happened to a lead — won, lost, disqualified, what it was worth — and feeds it back into which
> form variant, which question, or which field they use.
>
> Zero. Not one person, anywhere in the corpus.
>
> Plenty of people close the outcome loop. Offline conversion import, server-side CAPI,
> value-based bidding, firing the conversion only when a lead is marked qualified. Sophisticated
> stuff, done well, recommended reflexively.
>
> All of it teaches the ad platform who to show ads to. None of it teaches the form anything.
>
> I don't think that gap is unclaimed because it's a bad idea. I think it's unclaimed because
> the outcome data lives in the CRM and the form tool was never invited.

---

#### 24 — Nobody tests forms
**Platform:** X · **Pillar:** P3 · **Link:** none

> 'form a/b testing': 0 searches a month. 'split test forms': 0. 'form drop off': 0.
>
> I went hunting for the workaround too — duplicate the form, split by UTM. Nobody describes
> doing it.
>
> Nobody tests forms. That's either the opening or the reason there isn't one.

---

#### 25 — Reading the WebMCP trend honestly
**Platform:** LinkedIn · **Pillar:** P3 · **Link:** none

> "webmcp" does about 2,900 searches a month in the US and 11,000 globally. Two keyword tools
> that normally disagree by multiples landed within 4% of each other, which almost never
> happens. No form builder ranks for it or has tried.
>
> Before anyone gets excited, including me: I pulled the trend.
>
> February was 14,428 — that's the Chrome Canary preview landing. It fell more than 5x by April.
> Anyone showing you that chart as a growth curve is misreading it.
>
> What it actually is: five consecutive months holding between 2,600 and 3,200. That's a
> plateau, not a fad and not a rocket. Durable residual interest in a standard that shipped as a
> preview six months ago.
>
> The unglamorous read is the useful one. A plateau you can plan around beats a spike you can't.

---

#### 26 — The tire kicker trap
**Platform:** X · **Pillar:** P3 · **Link:** none

> 'tire kickers' does 1,600 searches a month at a $0.23 CPC.
>
> That CPC is the ad market telling you it isn't a commercial query. It's people looking up what
> the idiom means.
>
> Half of keyword research is finding out the good number is a definition lookup.

---

#### 27 — The loss wasn't on the page
**Platform:** LinkedIn · **Pillar:** P3 · **Link:** none

> Two findings from the same r/MarketingAutomation thread that I haven't been able to stop
> thinking about.
>
> "We always optimized landing pages but rarely looked inside the form itself. Surprisingly,
> most loss was not on the page. It was inside the form. One required field created friction."
>
> And from a commenter on the same thread: "Paid traffic was much less tolerant of friction
> compared to organic or referral. Made us rethink which fields actually need to be mandatory vs
> just helpful." — u/Spare_Fisherman_5800
>
> Everyone optimizes the landing page. The damage is happening two fields in — and it's
> happening differently to the traffic you're paying for than to the traffic you aren't.
>
> Almost nobody can see either of those things in the tool they're already using.

---

### P4 — Craft decisions

#### 28 — Five words
**Platform:** LinkedIn · **Pillar:** P4 · **Link:** none

> Five names I had to get right before any product code gets written: Verdict, Origin, Yield,
> Hindsight, Manifest.
>
> The standard was strict on purpose. One plain English word. A real noun a person already
> knows. Sayable out loud in a sales call without a footnote. No AI-era jargon. And slightly
> forensic in register, because the whole product is about finding out what actually happened.
>
> "Outcome-weighted split testing" is an accurate description and a terrible name. It's
> unsayable, unmemorable, and unownable — a competitor ships it the same week.
>
> The one that convinced me the set was right is an empty state. "142 submissions awaiting
> verdict." That single line of UI does more selling than a homepage section.
>
> None of the five has been through a trademark screen yet, so any of them could still die.

---

#### 29 — Unverified, not bot
**Platform:** X · **Pillar:** P4 · **Link:** none

> The third provenance state is labeled 'Unverified,' not 'Bot.'
>
> We can prove a submission didn't identify itself. We can't prove there was no person behind
> it. Calling it a bot would be the same overconfidence we're arguing against.

---

#### 30 — Colour can't carry three states
**Platform:** LinkedIn · **Pillar:** P4 · **Link:** none

> The product's core UI job is telling three things apart at a glance: human, agent, unverified.
> I wanted colour to do it. Colour can't, and the arithmetic is worth sharing because it isn't
> obvious.
>
> For a colour to be readable text on a light background it has to sit below a certain
> luminance. That forces all three into a narrow band. Measured against each other, the best
> spread I could get was 1.26:1, 1.40:1 and 1.77:1. That is nowhere near enough to tell apart by
> lightness alone — and under deuteranopia and protanopia, roughly 1 in 12 men, the teal and the
> violet converge toward the same blue.
>
> So every provenance stamp ships as three channels in this order: a shape, a word, then a
> colour. Circle, diamond, triangle, each with the full word beside it. Never abbreviated, never
> a tooltip, never a bare coloured dot. A stamp that ships as colour alone is a bug, not a style
> choice.
>
> Building a product about telling three things apart, and then shipping an indicator that a
> twelfth of the men reading it can't tell apart, would have been an unusually stupid way to
> lose the argument.

---

#### 31 — 1.26:1
**Platform:** X · **Pillar:** P4 · **Link:** none

> Our brand color is a lime that measures 1.26:1 against the page. As a fill it fails the 3:1
> minimum for a UI boundary.
>
> Fix: a 1px dark hairline on every fill, which takes the boundary to 17.95:1. It's baked into
> the utility class so nobody can forget it.

---

#### 32 — Open source won't sell this
**Platform:** LinkedIn · **Pillar:** P4 · **Link:** none

> The core is AGPL and it will stay that way. It's also not going to win us a single marketer,
> and I'd rather say that than let anyone think it's the pitch.
>
> Zero marketers in roughly 40 threads of research asked for open source or self-hosting. Every
> single request came from developers, r/selfhosted, r/opensource, r/reactjs. Marketers asked
> about spam, branding, analytics and CRM sync.
>
> So open source is a trust asset, not a demand driver, and it will never be the headline.
>
> What it does buy: you can read exactly how a submission gets stamped, where it's stored, and
> leave with your data if we let you down. And it sets a bar we have to clear — the corpus is
> unanimous that OSS form builders are miserable to deploy. "Deploying them is much harder than
> signing up for their managed version." — u/BohdanPetryshyn, r/opensource.
>
> One command, or the license is just a badge.

---

### P5 — The ask

#### 33 — Waitlist open
**Platform:** X · **Pillar:** P5 · **Link:** **reply**

> Endpoint Forms is live as a waitlist and a public repo. No product yet, and I won't pretend
> otherwise.
>
> What's there: the positioning, the messaging, the brand, the keyword research, and the
> argument — all readable before you hand over an email.
>
> List's open.

**Reply copy:** `endpointforms.com — waitlist and repo. The docs are in the repo if you'd
rather read the argument than join a list.`

---

#### 34 — Point one form at us
**Platform:** LinkedIn · **Pillar:** P5 · **Link:** **first comment**

> If you run paid acquisition and you've had the conversation where sales tells you the leads
> are trash — this is the one I'm building for you.
>
> Not a migration. When it exists, point one form at it. The one your paid traffic hits. Leave
> Jotform, Gravity Forms, whatever you've built your workflow around, exactly where it is.
>
> Every submission comes back stamped with where it came from, and every submission gets a
> verdict back from your CRM — won, lost, disqualified, and what it was worth. Then your split
> tests rank on that instead of on how many people finished.
>
> If your forms are simple and nobody's calling your leads, use Tally. It's free, it's genuinely
> excellent, and I'm not going to pretend otherwise to win a signup.
>
> Waitlist is open if the other thing sounds like your Monday.

**First comment copy:** `Waitlist and the full positioning docs: endpointforms.com — the docs
are public whether or not you sign up.`

---

#### 35 — The spec is meant to be copied
**Platform:** X · **Pillar:** P5 · **Link:** **reply**

> Every Endpoint form will publish two surfaces from one definition: the human page, and a tool
> surface an agent can call directly. WebMCP shipped in Chrome Canary in February.
>
> The spec is meant to be copied. A standard nobody else implements is just an API.
>
> Repo's public.

**Reply copy:** `github.com/coreyhaines31/endpointforms — AGPL. Design notes and the positioning
docs are in /docs.`

---

## 4. Launch-window calendar

**Days are relative, not dated.** The site going live is Day 10 in this plan. If it slips, Weeks
1–2 stand alone with no ask in them — which is the entire reason the jabs are front-loaded. Slide
the P5 posts; don't slide the jabs.

**Standing constraints applied throughout:**
- 1 post/day per platform per person target. 2/day is the hard cap, never used here.
- No day carries two posts from the same pillar.
- Never two P5 posts in one week; 8 and 7 days between the three.
- The day after every P5 is a jab that doesn't mention the product.
- X and LinkedIn never carry the same post on the same day, and never the same copy at all.

### Week 1 — establish the POV, zero asks

| Day | X | LinkedIn |
|---|---|---|
| 1 (Mon) | **1** — The arithmetic | — |
| 2 (Tue) | — | **2** — Everything looks normal from a reporting standpoint |
| 3 (Wed) | **12** — The SERP I misread | — |
| 4 (Thu) | — | **11** — The wedge that died |
| 5 (Fri) | **7** — Before the phone call | — |
| 6 (Sat) | — | — |
| 7 (Sun) | — | **17** — Marketing first, product second |

Week 1 is P1 → P2 → P1 → P2 deliberately. Anyone who finds the account on day 3 sees a strong
claim and a retraction in the same scroll. That's the whole positioning in miniature.

### Week 2 — the research week, and the first ask

| Day | X | LinkedIn |
|---|---|---|
| 8 (Mon) | **8** — The submission limit | — |
| 9 (Tue) | **22** — The complaint ranking | **13** — My customer doesn't search |
| **10 (Wed)** | **33 — WAITLIST (P5)** *link in reply* | — |
| 11 (Thu) | **16** — $0.12 for fake taxi meaning | **21** — The most astroturfed niche I've mined |
| 12 (Fri) | **3** — The 41% variant | — |
| 13 (Sat) | — | — |
| 14 (Sun) | — | **6** — The best argument against what I'm building |

Day 10 is the only ask this week and Day 11 immediately returns to jabs, one of which is
explicitly about refusing a growth tactic. Day 14 concedes the strongest counter-argument in
public, four days after asking for emails. That sequence is intentional.

### Week 3 — craft and receipts, second ask

| Day | X | LinkedIn |
|---|---|---|
| 15 (Mon) | **29** — Unverified, not bot | — |
| 16 (Tue) | — | **30** — Colour can't carry three states |
| 17 (Wed) | **24** — Nobody tests forms | **23** — The gap nobody is standing in |
| **18 (Thu)** | **35 — REPO / WEBMCP (P5)** *link in reply* | — |
| 19 (Fri) | **31** — 1.26:1 | **25** — Reading the WebMCP trend honestly |
| 20 (Sat) | — | — |
| 21 (Sun) | — | **28** — Five words |

Post 35 is the developer-facing ask and it lands the day after two research posts, next to a
post that talks the WebMCP number *down*. If we're going to point at the biggest opportunity in
the research, the honest reading of the trend has to be in the same week.

### Week 4 — the argument, closed

| Day | X | LinkedIn |
|---|---|---|
| 22 (Mon) | **10** — A spreadsheet with a submit button | — |
| 23 (Tue) | **26** — The tire kicker trap | **27** — The loss wasn't on the page |
| 24 (Wed) | **18** — What we lose at | **32** — Open source won't sell this |
| **25 (Thu)** | — | **34 — POINT ONE FORM AT US (P5)** *link in first comment* |
| 26 (Fri) | **5** — The wrong question | — |
| 27 (Sat) | — | — |
| 28 (Sun) | **20** — The objection I can't beat | **4** — Nobody owns the middle |

Day 25 is the only post in the entire month that describes what the product does, and it
recommends a competitor by name inside the ask. Day 28 closes the month on an objection we
can't answer.

**Unscheduled, held in reserve:** posts **9**, **14**, **15**, **19**. Post 15 (the stat I
deleted) is the single best post in the set for a week that has run hot — hold it for the first
time a P1 post gets pushback, and reply to that pushback with it.

---

## 5. Voice guardrails — social specifically

The failure mode here is smugness. We are attacking a category from a position of having shipped
nothing, and that reads as arrogance unless the knife points at us in the same breath. Six rules,
and the last one is the test.

### 5.1 Aim at the metric. Never the reader, never a vendor's competence.

"Completion rate can't distinguish a buyer from a bot" is a fact about arithmetic. "Typeform
doesn't care about your pipeline" is a slur about people. The reader chose their current tool
for reasons that were good at the time, and often still are.

**Banned on social, permanently:** any post whose subject is a named competitor's failure. Any
post that implies the reader has been naive. Any screenshot of a competitor's UI used as
evidence against them.

### 5.2 Every criticism ships with its receipt, in the same post.

Unsourced contrarianism is just attitude. If the number isn't in `00-positioning-spine.md`,
`02-messaging.md` or `04-keyword-research.md`, it doesn't go in a post. If a quote is used, the
handle and the subreddit go with it, in the body, every time — including when it's inconvenient
for the character count.

### 5.3 The knife points at us on a schedule, not when it feels convenient.

P2 is 29% of the drafted set and never more than 48 hours behind a second P1 post. This is
structural for a reason: self-implication that only appears when a post is going badly reads as
damage control. Scheduled, it reads as method.

Concretely, in every 7-day window there must be at least one of:
- a call we got wrong (11, 12, 13, 14, 16)
- a limitation we can't fix (20, 25, 32)
- a competitor recommended by name (18, 34, 6)
- something we refused to do because it would have helped (15, 21)

### 5.4 We are also a form builder in a category drowning in form builders.

Say it first, before someone says it for us. Post 17 does this explicitly and post 12 does it
implicitly. Any post that reads as if we've already escaped the category is wrong on the facts.

### 5.5 Concede the strongest counter-argument out loud, in public, unhedged.

Post 6 gives away the best objection to the entire product and agrees with it. That post is not
a risk to manage — it's the highest-value post in the set, and it should be pinned.

### 5.6 The quote-back test

**If a sentence would feel good to post and bad to be quoted back at you in two years, cut it.**

This kills, specifically: any absolute claim about spam ("bot-proof," "100% spam-free,"
"CAPTCHA killer"), any prediction with a date on it, any claim about what a competitor will or
won't do, and any version of "the last form builder you'll ever need."

### 5.7 Mechanical rules inherited from `03-brand.md`

- Sentence case everywhere.
- Contractions always.
- Numerals for anything measurable, including 1–9. "3 submissions," not "three."
- `%` closed up. Spaced em dashes.
- No exclamation marks. No emoji as decoration or as section markers — the only acceptable emoji
  is one doing real semantic work, which is roughly never.
- No hashtags.
- Never "conversion rate" unqualified in our own voice. **Completion rate** (theirs) vs **Yield**
  (ours). Keeping those two words separate is the entire argument.
- Never "bot" as a label for a submission. **Unverified.**
- Tier-1 jargon is never spelled out: CPL, CAPI, GA4, GTM, UTM, CRM, ROAS, MQL/SQL. Explaining
  them tells an agency buyer we think they're new.

### 5.8 Structural rules inherited from the personal voice reference

- No URL in any post body, ever. Reply on X, first comment on LinkedIn.
- Lead with a take, not a question. Questions are needy.
- No "here's why 👇," no "thread 🧵," no "unpopular opinion," no "hot take," no "PSA."
- One idea per post. If it sprawls, it's two posts or it's cut.
- No engagement bait, no "agree?", no fake polls, no "comment X and I'll send you Y."

---

## 6. What we never post

1. **A screenshot of a product that doesn't exist.** No mockup presented as a UI, no "here's the
   dashboard," no fake data in a real-looking chart. Illustrating a *concept* is allowed and must
   be labeled as a concept.
2. **Any implication of customers, users, revenue, or traction.** No "teams are already using
   this." No "we're hearing from agencies that…" unless a real agency really said it and is
   quotable.
3. **The two unverified competitor pricing figures.** The 10-response free tier and the $199
   CAPTCHA. Struck permanently. See post 15 — refusing them is content.
4. **The 41% number as a result.** It is illustrative until a real split test with real verdicts
   exists. Always "can produce," never "produced."
5. **Any absolute claim about spam.** Nobody has solved it and everyone in the corpus knows it.
6. **Anything that reads as an attack on a named competitor.** We recommend Tally, Typeform,
   Jotform, Gravity Forms, Formbricks and FormAssembly by name when they're the right answer,
   and we criticise category-wide patterns, never a product.
7. **Reddit seeding, sockpuppets, incentivised mentions, engagement pods.** See §1.1.
8. **Cold DMs to anyone who complained publicly about junk leads.** It is the most obvious growth
   hack available and it's indistinguishable from what we're attacking.
9. **A launch date we can't hit.** No countdowns. No "shipping next month" until the month it
   ships.
10. **"AI-powered" in any form.** We're agent-native, which is an architecture claim, not an AI
    claim. `00-positioning-spine.md` rules the lane out.
11. **"Qualified pipeline," "lead velocity," "frictionless," "seamless," "game-changing,"
    "revolutionary," "unlock," "leverage" as a verb.** The full list is `02-messaging.md` §7.
12. **Comparison-listicle content of any kind.** "9 best form builders in 2026" is the genre
    we're differentiating from and posting one would end the differentiation.
13. **Any customer's data, ever** — including anonymised, including after launch, including with
    permission unless the permission is written and specific.

---

## 7. Open items this doc is blocked on or flags

1. **`Unverified` vs `suspected bot` is an unresolved contradiction between docs.**
   `02-messaging.md` §2 sets the Origin column values as **Human · Agent · Unverified** and §7
   bans "bot" as a submission label. `03-brand.md` §4 sets them as **human / identified agent /
   suspected bot** and calls "suspected" load-bearing. Both are dated 2026-08-28. **Every post in
   this doc uses "Unverified"** and post 29 is built entirely on that choice. If the brand doc
   wins, post 29 needs rewriting and the argument gets weaker, not stronger. Needs adjudication
   before Day 15.
2. **The five feature names are unscreened.** Verdict, Origin, Yield, Hindsight, Manifest have
   had no USPTO or domain screening. Posts 28 and 34 put them in public. Post 28 says so out
   loud, which is the honest mitigation, but a screen before Day 21 is cheap insurance.
3. **Two competitive facts remain unverified** and are flagged in `04-keyword-research.md` §9 —
   whether Typeform has native split testing, and whether Heyflow/ROASForm send value-weighted
   conversions. **No post in this document depends on either.** Keep it that way; if a reply
   thread heads toward those claims, the answer is "I haven't verified that."
4. **The waitlist URL and repo URL in the P5 link copy assume `endpointforms.com` and
   `github.com/coreyhaines31/endpointforms`.** Confirm both resolve before Day 10.
5. **Typefully.** Nothing in this document has been drafted into Typefully. That's a separate,
   deliberate decision — the workspace is a live account and publishing is a call the user hasn't
   made.
6. **Corey's real posting history isn't reflected here.** This plan doesn't account for what else
   is in the rotation across his other properties. The 1/day/platform target is the whole budget
   for one person, so slotting Endpoint Forms at 5 X posts and 4 LinkedIn posts a week means
   something else in the portfolio gets less. Run `/jab-hook audit` before committing Week 1.
