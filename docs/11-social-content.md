# Social content — Endpoint Forms

**Version:** v2 · **Reworked:** 2026-08-28 · **Closes:** [#11](https://github.com/coreyhaines31/endpointforms/issues/11)
**Inherits from:** [`00-positioning-spine.md`](./00-positioning-spine.md), [`02-messaging.md`](./02-messaging.md), [`03-brand.md`](./03-brand.md), [`04-keyword-research.md`](./04-keyword-research.md), [`05-site-architecture.md`](./05-site-architecture.md), [`12-trademark-screening.md`](./12-trademark-screening.md), [`13-competitive-verification.md`](./13-competitive-verification.md). Nothing here relitigates the spine.

---

## Why this was reworked on 2026-08-28

v1 of this document was written against the headline *"your form can't tell a buyer from a bot
— and it's reporting both as conversions."* That sentence is no longer the front door. The spine
was reset the same day:

> **An open-source form builder for website forms, built for marketers who want high-converting
> forms that pipe data wherever they need it.**

The old headline led with the narrowest thing the product does, which meant the first thing a
stranger learned was a competitor argument they hadn't asked to have. v1 inherited that problem
at scale: **10 of its 35 posts — 29% of the rotation — argued a thesis that is now one click in,
not the first sentence.** Those posts aren't wrong. The argument still exists and now has its own
essay at `/the-dishonest-dashboard`. It just can't be a third of what we say.

Four other things changed since v1 shipped, and each one moved posts:

1. **Handshake is now Manifest.** `12-trademark-screening.md`: three live registrants including a
   careers platform valued around $3.5B that is actively extending into AI. Not a legal blocker —
   the capitalized name is simply unownable and search-invisible. Lowercase "handshake" survives
   as the verb. *"Real agents shake hands. Bots pick the lock."* still works.
2. **Origin states are settled: Human · Agent · Unverified.** v1 §7.1 flagged this as an
   unresolved contradiction between `02` and `03`. It's resolved in the spine, our way. Post 26
   no longer carries a caveat.
3. **A competitive claim was retired as false.** `13-competitive-verification.md` found that
   Heyflow *does* send value-weighted conversions. Any post resting on "they send a lead, not a
   lead worth $X" is now false and is gone. **This became the strongest new post in the set** —
   see post 15.
4. **~63 pages now exist.** An argument essay, 8 calculators under `/tools`, 12 anti-spam
   teardowns under `/spam`, 25 glossary terms, feature and use-case pages. This is the single
   biggest change to what social can *do*. A jab that hands someone a working calculator is
   worth more than a jab that hands them an opinion, and until 2026-08-28 we had no calculators.

**What did not change and is not up for review:** the channel strategy (§1), the voice guardrails
(§5), and the never-post list (§6). Those were the strongest parts of v1 and the positioning reset
doesn't touch them.

---

**Honesty constraint, load-bearing throughout.** Endpoint Forms does not exist. There is no
product, no customer, no screenshot of a real dashboard, no measured result. Every post below is
written to be true on the day it ships. Build-in-public is not a stylistic choice here — it is the
only frame available that isn't a lie, and it happens to be the strongest one we have, because the
thing we're selling is a refusal to overclaim.

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

---

## 1. Channel strategy

*Unchanged from v1. The positioning reset does not touch any of it.*

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
| **X (personal)** | **Primary** | POV, research findings, the wrong-calls, the calculators. Where PPC people, indie devs, and the WebMCP/agent crowd overlap. Fastest feedback loop on whether an argument lands. | 5×/week |
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

**One thing the calculators change, and one thing they don't.** A free ungated calculator is a
genuinely good answer to a real question, which means the honest reply in a Reddit thread now
sometimes contains a link. That is still only allowed under the rules above: in a thread we had
a reason to be in, from Corey's named account, disclosed, and only where the calculator actually
answers what was asked. **A calculator link does not create permission to enter a thread.** If
the only reason we're in the thread is that we have something to link, we're seeding — the link
being free doesn't change that.

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
2. The Manifest spec — the agent tool surface — is published and readable, because that, not the
   form builder, is the part HN will actually argue about.
3. We are ready for the top comment to be *"this is a form builder with extra steps."* The
   answer is in `02-messaging.md` §4 and it needs to be one paragraph, not a blog post.

Until all three are true, HN gets nothing. A "Show HN: my pre-launch positioning docs" is a
real temptation and it would be the cheapest possible way to make a first impression we can't
take back. **The 63 pages make this temptation worse, not better** — "Show HN: 8 free calculators
for lead quality" is a plausible-sounding post and it would spend the one shot on marketing
collateral instead of on software.

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
form builder that explains it well is worth more in citations than in clicks. Posts 39 and 42
below are the social edge of that; the page is `04`'s job.

---

## 2. Content pillars and the jab/hook ratio

Gary Vaynerchuk's framing, and the ratio is deliberately far more jab-heavy than a normal
rotation, for one reason: **there is nothing to buy.** A hook that lands on a waitlist has a
fraction of the value of a hook that lands on a product, so hooks are rationed until they're
worth more.

### 2.1 The new ratio

| # | Pillar | Type | Target share | Drafted | v1 share |
|---|---|---|---|---|---|
| **P1** | **What it is** — the product said plainly. Built to convert not survey; the data goes where you need it; open source. | Jab | 12% | 5 | *did not exist* |
| **P2** | **The useful thing** — a calculator, a teardown, a definition. A jab that hands over a working tool. | Jab | 19% | 8 | *did not exist* |
| **P3** | **Build in public** — two lanes, below. | Jab | 36% | 15 | 40% (P2+P4) |
| | ↳ *P3a — wrong calls.* The scheduled knife. Counted separately because §5.3 is a constraint, not a preference. | | 26% | 11 | 25% |
| | ↳ *P3b — craft decisions.* Naming, contrast ratios, the license. | | 10% | 4 | 15% |
| **P4** | **The metric** — the contrarian argument. Completion rate can't tell you anything about the people who completed. | Jab | 14% | 6 | **30%** |
| **P5** | **Research receipts** — data from the VOC, keyword and verification work nobody else has published. | Jab | 12% | 5 | 20% |
| **P6** | **The ask** — waitlist, repo. | **Hook** | 7% | 3 | 10% |

**39 jabs to 3 hooks.** Roughly 13:1, slightly leaner on hooks than v1 because there are now 11
non-hook posts carrying a free link, which does part of a hook's job without spending one.

### 2.2 The argument for this ratio

**P4 halves, from 30% to 14%.** Not because the argument got worse — it didn't, and the
verification work in `13` actually sharpened it — but because it is no longer the front door. An
argument that is one click in should be roughly one post in seven, not one in three. Six posts is
enough to establish a point of view; ten was enough to become the only thing we appeared to be
about. The five best P4 posts survive intact and the two thinnest are gone (see §3.7).

**P1 and P2 are new, and together they are the growth.** They exist because two things became
true on 2026-08-28 that were not true when v1 was written:

- *The product is sayable in a sentence.* v1 could not describe Endpoint Forms without first
  arguing about measurement, so every "what is it" post was really a P1-metric post wearing a
  hat. Now there is a plain description that survives being read by someone with no interest in
  the thesis. That's worth five posts and not more — a product description doesn't need
  repetition, it needs to be unmissable once and then supported by evidence.
- *There are 45 pages of genuinely useful free content.* This is the bigger change. `09` argued
  the calculators are the build-first set precisely because **a page in that tier is useful when
  it does not rank** — and the corollary nobody wrote down is that it's also useful when it
  doesn't get *found*. A working calculator is the thing you drop into a reply, send a prospect,
  or post on a Tuesday. That is exactly what a jab-heavy rotation with nothing to sell has been
  missing. 8 posts, one per calculator or asset group, is the floor rather than the ceiling.

**P3 holds at roughly its v1 weight and its wrong-call lane grows by one post.** v1 overweighted
P2 deliberately as ballast against P1 curdling. That logic survives the reset and gets stronger,
because we now have a *third* public retraction — the best one yet, since it's about a competitor
and we caught it ourselves before it shipped (post 15). The craft lane shrinks from 5 to 4: the
naming post is better now that the trademark screen has actually happened, and "open source won't
sell this" graduates out of craft into P1, where it belongs now that open source is a stated
pillar of the positioning rather than a footnote.

**P5 shrinks from 20% to 12%** for the same reason P4 does: three of its seven posts were
keyword-research trivia, which was the most interesting thing we had in v1 and is no longer.
The two that leave are the weakest, not the loudest.

### 2.3 Pillar sequencing rules

- **No pillar twice in a row on the same platform.** Tightened from v1's P1-only rule, because
  with seven lanes the risk is now monotony rather than souring.
- **No day carries the same pillar on both platforms.**
- **P3a within 48 hours of every second P4 post.** Scheduling constraint, not a preference.
- **P6 never lands in the same week as another P6**, and the day after any P6 is a jab carrying no
  link and no ask. *(v1 phrased this as "doesn't mention the product," which was never enforceable
  — every post in the set is about the project. Carrying no link and no ask is the thing that
  actually matters and it's checkable.)*
- **P2 is the palate cleanser now**, not P3b. A free calculator resets a week that has run hot
  faster than a post about contrast ratios does.
- **Every 7-day window contains at least one P3a post.** Enforced in §5.3.

### 2.4 Link policy — changed, deliberately

v1 allowed a link on 3 of 35 posts. v2 allows one on 11 of 42. The rule that did not change:

> **No URL ever appears in a post body on either platform.** Links go in a reply (X) or the first
> comment (LinkedIn). No exceptions, ever, on either platform.

What changed is *which* posts may carry one, because there are now two kinds of link:

| | **Asset link** | **Ask link** |
|---|---|---|
| Points at | A calculator, a spam teardown, the argument essay | The waitlist, the repo |
| Costs the reader | Nothing. No email, no signup, no gate. | An email address, or attention on a thing that doesn't exist |
| Counts as | **A jab.** The link *is* the value. | **A hook.** Rationed to 3. |
| Allowed on | P2 posts, and the two P4 posts that point at the essay | P6 only |

**The constraint this places on the site, and it is load-bearing.** If any calculator ever gates
its result behind an email, every asset link in this plan silently becomes an ask and the pillar
collapses. Verified 2026-08-28 in `src/components/tools/tool-page.tsx`: the waitlist form sits
*below* the calculator and its result, not in front of it. **That has to stay true.** A gated
calculator would also make post 6's copy — "no signup, the number is on the page" — a lie, which
is the specific failure mode this whole document exists to avoid.

---

## 3. The 42 drafted posts

**Format conventions.** X drafts are written to fit 280 characters. LinkedIn bodies run 400–1,200
characters — longer than the 200–400 default in the personal voice reference, because
`03-brand.md` sets the LinkedIn register as *"show the working: what we tried, what the number
was, what we changed,"* which does not fit in 400 characters. Post 15 is the longest in the set at
~1,250 and that is deliberate: a retraction that gets compressed reads as a shrug.
**[judgment call, flagged rather than silently taken.]**

**Link placement is absolute.** No URL appears in any post body on either platform. See §2.4 for
which posts may carry one and where it goes.

Attributed quotes stay attributed, inside the post copy, every time.

---

### P1 — What it is

#### 1 — What it is, plainly
**Platform:** X · **Pillar:** P1 · **Link:** none

> An open-source form builder for the forms on your marketing site. Multi-step, fast, on brand
> without custom CSS, and the data goes wherever you need it.
>
> That's the whole description. It took scrapping a cleverer headline to be able to write it
> that plainly.

---

#### 2 — Fails loudly
**Platform:** LinkedIn · **Pillar:** P1 · **Link:** none

> The best answer in my whole research corpus to "what would you actually pay a form builder
> for" wasn't about design. It's one line from someone on r/nocode:
>
> "For me, the paid feature is dependable integrations, not prettier form fields. If a form maps
> cleanly into an ERP or CRM, handles conditional logic without weird workarounds, and fails
> loudly when a sync breaks, that's worth paying for."
> — u/SufficientFrame
>
> Fails loudly when a sync breaks.
>
> That's a product requirement hiding inside a sentence about pricing. Every form tool I've used
> will tell you the submission succeeded. None of them tell you the submission never arrived
> anywhere.
>
> A sync that fails quietly is the same sin as a dashboard that reports a bot as a conversion.
> It's a green number that isn't true.

---

#### 3 — Conditional logic
**Platform:** X · **Pillar:** P1 · **Link:** none

> "The conditional logic is always the biggest headache — it never works right for anything
> beyond super simple forms." — u/devhisaria, r/nocode
>
> That's the #1 functional complaint in the category by source count. Nobody claims to have
> fixed it.

---

#### 4 — Not a survey tool
**Platform:** X · **Pillar:** P1 · **Link:** none

> A survey wants a representative sample. A lead form wants one specific person to finish, on a
> phone, on a click you paid for.
>
> Most form builders are survey tools with a lead-gen mode bolted on. That difference is the
> entire reason to build another one.

---

#### 5 — Open source won't sell this
**Platform:** LinkedIn · **Pillar:** P1 · **Link:** none

*Moved from P4/craft in v1. Open source is now a stated pillar of the positioning, so the honest
caveat has to travel with it.*

> The core is AGPL and it will stay that way. It's also not going to win us a single marketer,
> and I'd rather say that than let anyone think it's the pitch.
>
> Zero marketers in roughly 40 threads of research asked for open source or self-hosting. Every
> single request came from developers — r/selfhosted, r/opensource, r/reactjs. Marketers asked
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

### P2 — The useful thing

#### 6 — What the junk costs
**Platform:** X · **Pillar:** P2 · **Link:** **reply** · **Asset:** `/tools/form-spam-cost-calculator`

> Built a calculator that works out what junk form submissions cost you a month: wasted ad
> spend, wasted rep hours, and the per-response fees you paid to store them.
>
> No signup. The number is on the page.

**Reply copy:** `endpointforms.com/tools/form-spam-cost-calculator — free, no email, nothing
gated.`

---

#### 7 — Cost per usable response
**Platform:** LinkedIn · **Pillar:** P2 · **Link:** **first comment** · **Asset:** `/tools/cost-per-usable-response-calculator`

*Rebuilt from v1 post 8, which made the argument and then stopped.*

> "If your form software has a submission limit, bots are using it before real people even get a
> chance." — u/kjdscott, an agency dev, on r/Entrepreneur.
>
> Automated requests are about 57.5% of HTML traffic. Per-submission pricing meters software.
>
> That's a good line and it isn't an answer, so I built the thing that answers it. Put in your
> volume, your junk rate, and up to three plans you're weighing up. It gives you cost per
> response, cost per usable response, and what share of your allowance the junk is eating.
>
> It's free, there's no email wall, and it will sometimes tell you the plan you're already on is
> fine.

**First comment copy:** `endpointforms.com/tools/cost-per-usable-response-calculator — no signup,
nothing stored.`

---

#### 8 — Use your own number
**Platform:** X · **Pillar:** P2 · **Link:** **reply** · **Asset:** `/tools/outcome-weighted-split-test-calculator`

*Replaces v1 post 3. Same argument, and the illustrative 41% is gone — the reader supplies the
number now, which removes the invented-statistic risk entirely.*

> I used to post a made-up number about a variant that converts 41% better and closes nothing.
> Now there's a calculator that makes you use your own.
>
> It tests completions and closed-won separately, and usually says the outcome gap isn't
> believable yet.

**Reply copy:** `endpointforms.com/tools/outcome-weighted-split-test-calculator`

---

#### 9 — The tool that tells you not to bother
**Platform:** LinkedIn · **Pillar:** P2 · **Link:** **first comment** · **Asset:** `/tools/time-to-outcome-calculator`

> I built a free tool whose main job is telling people not to bother.
>
> The pitch for this whole product is that you should rank form variants on what the leads turned
> out to be worth. That method needs closed deals, and closed deals arrive slowly. If you get 200
> submissions a month, close 4% of them, and a deal takes 60 days to resolve, the test does not
> conclude before the answer goes stale.
>
> So the time-to-outcome checker takes your volume, your close rate and your sales cycle and
> works out whether outcome-weighted testing can work for you at all. For a large share of the
> people who run it, the answer is going to be no.
>
> Shipping the tool that disqualifies your own buyers is a strange marketing decision. It's also
> the only version of this I'd trust if somebody else had built it.

**First comment copy:** `endpointforms.com/tools/time-to-outcome-calculator — the numbers above
are an example, put your own in.`

---

#### 10 — The calculator that refuses
**Platform:** X · **Pillar:** P2 · **Link:** **reply** · **Asset:** `/tools/lead-reconciliation-calculator`

> Wrote a calculator that refuses to give you a number when your numbers don't reconcile.
>
> Walk your leads from what the dashboard reported down to real prospects. If a stage is bigger
> than the one above it, it stops and says so instead of quietly picking one.

**Reply copy:** `endpointforms.com/tools/lead-reconciliation-calculator`

---

#### 11 — The loss wasn't on the page
**Platform:** LinkedIn · **Pillar:** P2 · **Link:** **first comment** · **Asset:** `/tools/form-drop-off-calculator`

*v1 post 27, which was a receipt with no follow-through. It has a tool attached now.*

> Two findings from the same r/MarketingAutomation thread that I haven't been able to stop
> thinking about.
>
> "We always optimized landing pages but rarely looked inside the form itself. Surprisingly, most
> loss was not on the page. It was inside the form. One required field created friction."
>
> And from a commenter on the same thread: "Paid traffic was much less tolerant of friction
> compared to organic or referral. Made us rethink which fields actually need to be mandatory vs
> just helpful." — u/Spare_Fisherman_5800
>
> Everyone optimizes the landing page. The damage is happening two fields in, and it's happening
> harder to the traffic you're paying for than to the traffic you aren't.
>
> So there's a calculator for it. Put the count at each step of your form in. It finds the worst
> transition, tells you how much worse it is than the rest of them, and prices what recovering it
> would be worth in closed deals.

**First comment copy:** `endpointforms.com/tools/form-drop-off-calculator — free, no email.`

---

#### 12 — Twelve ways to stop form spam
**Platform:** X · **Pillar:** P2 · **Link:** **reply** · **Asset:** `/spam`

*Replaces v1 post 5, which was the same idea as an aphorism.*

> "Using a service such as 2captcha you could bypass captcha in like max 30 seconds."
> — u/AndyAndrei63, r/webdev
>
> So I wrote up 12 anti-spam methods: what each stops, what it costs in completions, what it
> doesn't touch. Including taking the form down, which people really do.

**Reply copy:** `endpointforms.com/spam — twelve teardowns. None of them is us, we don't have a
product.`

---

#### 13 — What one more field has to be worth
**Platform:** LinkedIn · **Pillar:** P2 · **Link:** **first comment** · **Asset:** `/tools/form-field-payback-calculator`

> Every article about form length asserts that each extra field costs you some percentage of your
> completions. I went looking for where that number comes from and I couldn't find it.
>
> So the calculator I built doesn't assert it. You tell it what you think one more field costs you
> in completions — your assumption, your form, your traffic. It solves for the close-rate
> improvement that field would have to produce to pay for itself.
>
> Which is the question anyone asking "should I add a qualifying question" is actually asking,
> and it's answerable with arithmetic instead of a benchmark nobody can source.
>
> Building a free tool around refusing to supply a statistic is a strange choice. It's also the
> only honest one, because nobody in this category has that data. Including me.

**First comment copy:** `endpointforms.com/tools/form-field-payback-calculator`

---

### P3a — Build in public: wrong calls

#### 14 — The headline I scrapped
**Platform:** LinkedIn · **Pillar:** P3a · **Link:** none

> I built this whole thing around one sentence: your form can't tell a buyer from a bot, and it's
> reporting both as conversions.
>
> I still think that's true. I've taken it off the front page anyway.
>
> Two problems with it. It leads with the narrowest thing the product does, which means the first
> thing a stranger learns is a competitor argument they never asked to have. And my own research
> doesn't support it as the front door — the loudest complaints in the corpus are price, spam,
> conditional logic that breaks past five conditions, and integrations that fail quietly.
> Measurement philosophy is fourth at best.
>
> So the headline is the boring one now: an open-source form builder for the forms on your
> marketing site, built for marketers who want them to convert and want the data to go where they
> need it.
>
> The buyer-from-a-bot argument still exists. It's an essay now, one click in, for the people who
> want it. That's where an argument belongs — not in the first sentence somebody reads.

---

#### 15 — The third thing I've been wrong about
**Platform:** LinkedIn · **Pillar:** P3a · **Link:** none · **~1,250 chars, deliberately the longest in the set**

> Third thing I've had to retract about this product. This one was about a competitor, which
> makes it worse.
>
> I had a line I liked: competitors send the ad platform a lead, not a lead worth $X. Clean
> sentence. It was going on the site.
>
> Before it shipped I read Heyflow's own documentation instead of a blog post about it. They ship
> native server-side CAPI with a mappable Value and Currency field, and they market in-funnel lead
> scoring specifically so that the score becomes that value. Their words: "Meta receives a Lead
> event with a value of 85 (hot) or 30 (cold) — not a binary '1 conversion.'"
>
> My sentence was false as written. Struck, everywhere, before it reached a page.
>
> What survived is narrower and better. Heyflow's value is computed from what the lead typed
> about themselves, "at the exact moment of capture," and their docs say mapped data is "only
> appended for submit events." It's a prediction made at submit time and never corrected by what
> happened. That's a real difference from a verdict. It's also a distinction rather than an
> insult, which the original sentence wasn't.
>
> That's three now: the ad-platform wedge, two competitor pricing stats I couldn't verify, and a
> competitive claim that was simply wrong. If the pitch is that this category reports numbers that
> aren't true, I don't get to be the one making them up.

---

#### 16 — The name I had to kill
**Platform:** X · **Pillar:** P3a · **Link:** none

> Killed a feature name. We called the agent-facing half of a form its Handshake.
>
> Trademark screen: three live registrants, one a $3.5B careers platform now moving into AI. Not
> a legal blocker — just a name we could never own or rank for.
>
> It's a Manifest now.

---

#### 17 — The wedge that died
**Platform:** LinkedIn · **Pillar:** P3a · **Link:** none

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

#### 18 — The SERP I misread
**Platform:** X · **Pillar:** P3a · **Link:** none

> I said comparison pages were unwinnable — that SERP is all AI slop from tiny form builders.
>
> Then I pulled it live. A DR-42 site with one backlink holds #6 for 'typeform alternative.' KD
> 0 in both tools.
>
> The slop was evidence the bar is on the floor, not that it's high.

---

#### 19 — My customer doesn't search
**Platform:** LinkedIn · **Pillar:** P3a · **Link:** none

> Keyword research came back and told me the people I'm building for can't be reached the way I
> planned.
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

#### 20 — The stat I deleted
**Platform:** LinkedIn · **Pillar:** P3a · **Link:** none · **Held in reserve, see §4**

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

#### 21 — Marketing first, product second
**Platform:** LinkedIn · **Pillar:** P3a · **Link:** none · **Held in reserve, see §4**

*Rewritten. v1's version said "there isn't a landing page yet either," which is no longer true.*

> There's still no product. There is now a website with about 63 pages on it, which is a strange
> sentence to have to write.
>
> What exists: positioning, messaging, a brand system with the contrast ratios computed, keyword
> research that contradicts two of my own earlier calls, a site architecture, 8 calculators, 12
> anti-spam teardowns, 25 glossary entries and one long argument. All in a public repo, AGPL,
> written before a line of product code.
>
> I'm doing it in this order deliberately. Build first and the marketing ends up as an apology
> for whatever got built — you spend the launch explaining why the thing does what it does
> instead of why anyone should care.
>
> The risk is obvious and I'll name it before somebody else does: it is very easy to write a
> beautiful argument, and 63 pages of free tools, for a product that never ships. Ask me again in
> three months.

---

#### 22 — What we lose at
**Platform:** X · **Pillar:** P3a · **Link:** none

> Things Endpoint Forms will not be: the cheapest, the prettiest, or the one with the most
> features.
>
> Tally owns cheap and it isn't close. Typeform owns pretty. Jotform has 20,000 templates.
>
> Writing down what we lose at first made every other decision easier.

---

#### 23 — The failure mode I'm actually scared of
**Platform:** LinkedIn · **Pillar:** P3a · **Link:** none · **Held in reserve, see §4**

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

#### 24 — The objection I can't beat
**Platform:** X · **Pillar:** P3a · **Link:** none

> Hardest objection to what I'm building, and I don't have a clean answer:
>
> "your qualified lead volume will be too low to feed the algo enough" — u/dillwillhill, r/PPC
>
> So the report works at any volume. The automation waits until the numbers earn it.

---

### P3b — Build in public: craft decisions

#### 25 — Five words
**Platform:** LinkedIn · **Pillar:** P3b · **Link:** none

*Rewritten. v1's version ended on "none of the five has been through a trademark screen yet." One
now has, and one of the five died.*

> Five names I had to get right before any product code exists: Verdict, Origin, Yield,
> Hindsight, Manifest.
>
> The standard was strict on purpose. One plain English word. A real noun a person already knows.
> Sayable out loud in a sales call without a footnote. No AI-era jargon. And slightly forensic in
> register, because the whole product is about finding out what actually happened.
>
> "Outcome-weighted split testing" is an accurate description and a terrible name. Unsayable,
> unmemorable, unownable — a competitor ships it the same week.
>
> One of those five is a replacement. The agent-facing half of a form was called Handshake until
> the trademark screen came back with three live registrants, one of them a careers platform worth
> around $3.5 billion that's now moving into AI. Not a legal blocker. Just a word we could never
> own, never rank for, and that pointed a reader at the wrong industry. It's Manifest now, and the
> new name self-explains to a developer in a way the old one never did.
>
> The line that convinced me the set is right is an empty state. "142 submissions awaiting
> verdict." That single line of UI does more selling than a homepage section.

---

#### 26 — Unverified, not bot
**Platform:** X · **Pillar:** P3b · **Link:** none

> The third origin state is labeled 'Unverified,' not 'Bot.'
>
> We can prove a submission didn't identify itself. We can't prove there was no person behind
> it. Calling it a bot would be the same overconfidence we're arguing against.

---

#### 27 — Colour can't carry three states
**Platform:** LinkedIn · **Pillar:** P3b · **Link:** none

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
> So every origin stamp ships as three channels in this order: a shape, a word, then a colour.
> Circle, diamond, triangle, each with the full word beside it. Never abbreviated, never a
> tooltip, never a bare coloured dot. A stamp that ships as colour alone is a bug, not a style
> choice.
>
> Building a product about telling three things apart, and then shipping an indicator that a
> twelfth of the men reading it can't tell apart, would have been an unusually stupid way to lose
> the argument.

---

#### 28 — 1.26:1
**Platform:** X · **Pillar:** P3b · **Link:** none

> Our brand color is a lime that measures 1.26:1 against the page. As a fill it fails the 3:1
> minimum for a UI boundary.
>
> Fix: a 1px dark hairline on every fill, which takes the boundary to 17.95:1. It's baked into
> the utility class so nobody can forget it.

---

### P4 — The metric

*Six posts, down from ten. This is the argument, and it now lives one click in at
`/the-dishonest-dashboard` rather than on the front page. See §2.2.*

#### 29 — The arithmetic
**Platform:** X · **Pillar:** P4 · **Link:** none

> Completion rate can't tell you anything about the people who completed.
>
> Not a knock on one tool. It's the arithmetic — the number counts a bot and a buyer
> identically. It's also the headline metric in every form builder out there, including the one
> I'd have built by default.

---

#### 30 — Everything looks normal from a reporting standpoint
**Platform:** LinkedIn · **Pillar:** P4 · **Link:** **first comment** · **Asset:** `/the-dishonest-dashboard`

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
>
> I wrote the long version of this argument out properly. It's the one thing on the site that
> isn't a calculator.

**First comment copy:** `endpointforms.com/the-dishonest-dashboard — the full argument, no email
required.`

---

#### 31 — Nobody owns the middle
**Platform:** LinkedIn · **Pillar:** P4 · **Link:** none · **Held in reserve, see §4**

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

#### 32 — Not the same quality of conversion
**Platform:** LinkedIn · **Pillar:** P4 · **Link:** none · **Held in reserve, see §4**

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

#### 33 — The best argument against what I'm building
**Platform:** LinkedIn · **Pillar:** P4 · **Link:** none · **Pin this one**

*Moved from v1's P1 into P4 unchanged. §5.5 still applies: this is the highest-value post in the
set.*

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

#### 34 — Prediction and verdict
**Platform:** X · **Pillar:** P4 · **Link:** none

*New. This is the surviving, sharpened half of the claim retired in post 15 — stated at the level
of the category, with no vendor named.*

> A score computed from what someone typed about themselves is a prediction. It's made at the
> moment they submit and it is never corrected.
>
> A verdict is what the lead turned out to be. It arrives weeks later, which is the only reason
> the category doesn't use it.

---

### P5 — Research receipts

#### 35 — The most astroturfed niche I've mined
**Platform:** LinkedIn · **Pillar:** P5 · **Link:** none

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

#### 36 — The complaint ranking
**Platform:** X · **Pillar:** P5 · **Link:** none

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

#### 37 — The gap nobody is standing in
**Platform:** LinkedIn · **Pillar:** P5 · **Link:** none · **Held in reserve, see §4**

*Rewritten for precision after `13-competitive-verification.md`. v1's version implied nobody
computes a value at all, which is now known to be false.*

> I went through roughly 40 threads looking for one specific thing: anyone who takes what
> happened to a lead — won, lost, disqualified, what it was worth — and feeds it back into which
> form variant, which question, or which field they use.
>
> Zero. Not one person, anywhere in the corpus.
>
> Plenty of people close the outcome loop. Offline conversion import, server-side CAPI,
> value-based bidding, firing the conversion only when a lead is marked qualified. Sophisticated
> stuff, done well, recommended reflexively. And at least one form builder in this category will
> compute a quality score at submit time and pass it as the conversion value, which is further
> than I'd assumed before I went and checked.
>
> All of it teaches the ad platform who to show ads to. None of it teaches the form anything.
>
> I don't think that gap is unclaimed because it's a bad idea. I think it's unclaimed because the
> outcome data lives in the CRM and the form tool was never invited.

---

#### 38 — Nobody tests forms
**Platform:** LinkedIn · **Pillar:** P5 · **Link:** none

*Rewritten from v1 post 24, which had the search-volume half and no evidence. `13` supplied the
evidence. Note the register: the quote is a competitor being candid, not a competitor failing.
§5.1 still applies and this post is the closest thing in the set to its edge.*

> "We do not have (yet) an A/B test feature. Most of our customers don't have enough traffic for
> it to be a viable option so it's not too off the list, but we do plan on getting to it. What
> you can do on this case is create 2 different forms and AB test the forms with other tools."
> — a Typeform staff member, answering in Typeform's own community.
>
> I checked whether that had changed. Their public changelog covers every month from June 2024 to
> August 2026 and doesn't ship one.
>
> That's not a knock on them. It's a candid answer and their reason is a good one: most forms
> don't get enough traffic for a split test to conclude. It's the same reason one of the free
> tools I built spends most of its time telling people their sales cycle is too slow for the
> method I'm selling.
>
> Meanwhile "form a/b testing" does 0 searches a month. Nobody tests forms, nobody looks for a way
> to, and the biggest name in the category says out loud that most of its customers couldn't act
> on it if they had it.
>
> That's either the opening or the reason there isn't one. I genuinely don't know yet.

---

#### 39 — Reading the WebMCP trend honestly
**Platform:** LinkedIn · **Pillar:** P5 · **Link:** none

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

### P6 — The ask

#### 40 — Waitlist open
**Platform:** X · **Pillar:** P6 · **Link:** **reply**

*Rewritten. v1's version offered "the positioning, the messaging, the brand." Those are documents
about us. The site now has things that are useful to the reader.*

> Endpoint Forms is a waitlist, a public repo, and about 63 pages that are useful whether or not
> the product ships: 8 calculators, 12 anti-spam teardowns, a glossary, one long argument.
>
> None of it is behind an email. The list is for when there's software.

**Reply copy:** `endpointforms.com — waitlist and repo. Everything else on the site is open.`

---

#### 41 — Point one form at us
**Platform:** LinkedIn · **Pillar:** P6 · **Link:** **first comment**

> If you run paid acquisition and you've had the conversation where sales tells you the leads
> are trash — this is the one I'm building for you.
>
> Not a migration. When it exists, point one form at it. The one your paid traffic hits. Leave
> Jotform, Gravity Forms, whatever you've built your workflow around, exactly where it is.
>
> It's an open-source form builder for the forms on a marketing site: multi-step, fast, on brand
> without custom CSS, and the data goes wherever you need it — loudly, so you find out when a
> sync breaks instead of finding out in a QBR.
>
> Every submission comes back stamped Human, Agent or Unverified. Every submission gets a verdict
> back from your CRM — won, lost, disqualified, and what it was worth. Then your split tests rank
> on that instead of on how many people finished.
>
> If your forms are simple and nobody's calling your leads, use Tally. It's free, it's genuinely
> excellent, and I'm not going to pretend otherwise to win a signup.
>
> Waitlist is open if the other thing sounds like your Monday.

**First comment copy:** `endpointforms.com — waitlist. The calculators and the argument are open
whether or not you sign up.`

---

#### 42 — The spec is meant to be copied
**Platform:** X · **Pillar:** P6 · **Link:** **reply**

> Every Endpoint form will publish two surfaces from one definition: the human page, and a
> Manifest an agent can call directly. WebMCP shipped in Chrome Canary in February.
>
> The spec is meant to be copied. A standard nobody else implements is just an API.

**Reply copy:** `github.com/coreyhaines31/endpointforms — AGPL. Design notes and the positioning
docs are in /docs.`

---

### 3.7 Posts killed from v1, and why

Five posts from v1 do not survive the reset. All five were P1-metric or P3-research posts, and
none of them is killed for being wrong.

| v1 # | Post | Why it's gone |
|---|---|---|
| **7** | *Before the phone call* — "every form builder declares a winner before anyone has picked up the phone" | Pure aphorism with no receipt, and it makes the same point as 1 and 10. §5.2 requires a receipt in the same post; this one had attitude instead. It was survivable when P4 was the headline and needed volume. It isn't now. |
| **10** | *A spreadsheet with a submit button* — "won, lost, disqualified. Three words no form builder has ever asked your CRM for" | An absolute claim that `13` makes unsafe. ROASForm scores variants through to booked calls and syncs scores to a CRM; Heyflow computes a value from form answers. Neither is a verdict, but "no form builder has ever" is now a sentence I'd have to defend in a reply, and I'd lose. **Killed on the same principle as post 15.** |
| **14** | *1,300 searches, 700 of them WordPress* | Third keyword-trivia post in a rotation that now has 45 pages of real assets to talk about. Post 19 makes the same point better and with the emotional half attached. |
| **16** | *$0.12 for fake taxi meaning* | Charming, true, and the fourth keyword-trivia post. First thing to go when the rotation got something better to do. |
| **26** | *The tire kicker trap* — "'tire kickers' does 1,600 searches a month at $0.23 CPC" | Same. It's a good observation about keyword research and it isn't about forms, lead quality, or anything a buyer cares about. |

**Re-pointed rather than killed** — v1 post 3 became post 8 (the number is now the reader's), v1
post 5 became post 12 (aphorism → 12 teardowns), v1 post 8 became post 7 (quote → calculator), v1
post 27 became post 11 (receipt → calculator), v1 post 32 became post 5 (craft → P1), v1 post 6
became post 33 (P1 → P4), v1 post 24 became post 38 (search volume → verified evidence).

**Rewritten in place** — 21 (there's a website now), 25 (the trademark screen happened), 37
(precision after `13`), 40 (the ask has something to offer).

---

## 4. Launch-window calendar

**Days are relative, not dated.** The site is already live, so unlike v1 there is no Day-10
dependency — but the P6 posts still assume the waitlist form works. If it doesn't, Weeks 1–2 stand
alone with no ask in them. Slide the P6 posts; don't slide the jabs.

**Standing constraints applied throughout:**
- 1 post/day per platform per person target. 2/day is the hard cap, never used here.
- No day carries the same pillar on both platforms.
- No pillar runs back-to-back on the same platform.
- Never two P6 posts in one week; 8 and 7 days between the three.
- The day after every P6 is a jab carrying no link and no ask.
- No more than two P2 posts in any rolling 7-day window on the same platform (§5.9).
- X and LinkedIn never carry the same post on the same day, and never the same copy at all.

### Week 1 — say what it is, zero asks

| Day | X | LinkedIn |
|---|---|---|
| 1 (Mon) | **1** — What it is, plainly *(P1)* | — |
| 2 (Tue) | **16** — The name I had to kill *(P3a)* | **2** — Fails loudly *(P1)* |
| 3 (Wed) | **6** — What the junk costs *(P2)* · *link in reply* | — |
| 4 (Thu) | **29** — The arithmetic *(P4)* | **14** — The headline I scrapped *(P3a)* |
| 5 (Fri) | **3** — Conditional logic *(P1)* | **35** — The most astroturfed niche I've mined *(P5)* |
| 6 (Sat) | — | — |
| 7 (Sun) | — | **15** — The third thing I've been wrong about *(P3a)* |

**The shape, and it's the whole reset in one week.** v1 opened with the arithmetic — a contrarian
claim, from a stranger, about a product nobody could see. Week 1 now opens with a plain
description and the wrong call that produced it. Anyone who finds the account on Day 4 sees what
it is, what we killed to get there, a free calculator, and the argument, in that order. The
argument arrives fourth. That is the reset made visible.

Day 7 is the retraction, and it lands at the end of a week that has already been generous.

### Week 2 — the tools week, and the first ask

| Day | X | LinkedIn |
|---|---|---|
| 8 (Mon) | **34** — Prediction and verdict *(P4)* | **5** — Open source won't sell this *(P1)* |
| 9 (Tue) | **10** — The calculator that refuses *(P2)* · *link in reply* | **17** — The wedge that died *(P3a)* |
| **10 (Wed)** | **40 — WAITLIST (P6)** · *link in reply* | — |
| 11 (Thu) | **18** — The SERP I misread *(P3a)* | **33** — The best argument against what I'm building *(P4)* |
| 12 (Fri) | **36** — The complaint ranking *(P5)* | — |
| 13 (Sat) | — | — |
| 14 (Sun) | — | **9** — The tool that tells you not to bother *(P2)* · *link in first comment* |

Day 10 is the only ask this week and it's the first in the plan. Day 11 immediately returns to
jabs, and the LinkedIn slot that day is the post that concedes the strongest objection to the
entire product — four days after asking for emails, one day after. Day 14 closes the week with a
free tool whose job is disqualifying people.

Post 33 should be pinned on LinkedIn the day it goes up (§5.5).

### Week 3 — craft, receipts, second ask

| Day | X | LinkedIn |
|---|---|---|
| 15 (Mon) | **26** — Unverified, not bot *(P3b)* | **39** — Reading the WebMCP trend honestly *(P5)* |
| 16 (Tue) | **8** — Use your own number *(P2)* · *link in reply* | **27** — Colour can't carry three states *(P3b)* |
| 17 (Wed) | **22** — What we lose at *(P3a)* | — |
| **18 (Thu)** | **42 — REPO / MANIFEST (P6)** · *link in reply* | **13** — What one more field has to be worth *(P2)* · *link in first comment* |
| 19 (Fri) | **28** — 1.26:1 *(P3b)* | — |
| 20 (Sat) | — | — |
| 21 (Sun) | — | **25** — Five words *(P3b)* |

Post 42 is the developer-facing ask, and post 39 — the one that talks the WebMCP number *down* —
lands three days ahead of it. Inherited from v1 and still the right call, with one improvement:
v1 ran the caveat the day *after* the pitch. Running it first is better. If we're going to point at
the biggest opportunity in the research, the honest reading of the trend should already be on the
timeline when we do.

Day 19 is the day after the ask: a craft post, no link, no ask.

### Week 4 — the argument, closed

| Day | X | LinkedIn |
|---|---|---|
| 22 (Mon) | **24** — The objection I can't beat *(P3a)* | — |
| 23 (Tue) | **12** — Twelve ways to stop form spam *(P2)* · *link in reply* | **30** — Everything looks normal *(P4)* · *link in first comment* |
| 24 (Wed) | — | **38** — Nobody tests forms *(P5)* |
| **25 (Thu)** | — | **41 — POINT ONE FORM AT US (P6)** · *link in first comment* |
| 26 (Fri) | **4** — Not a survey tool *(P1)* | — |
| 27 (Sat) | — | — |
| 28 (Sun) | — | **11** — The loss wasn't on the page *(P2)* · *link in first comment* |

The month opens on what it is and closes on what we can't answer. Day 22 leads the final week with
the objection we have no clean response to — three days before the biggest ask of the month, which
is the sequence that makes the ask survivable.

Day 23 pairs the spam teardowns with the argument essay — the two biggest free assets, one on each
platform, on the same day. Day 25 is the only post in the month that describes what the product
does end to end, and it recommends a competitor by name inside the ask.

Day 25 carries no X post at all. That's deliberate: the month's biggest ask gets the day to itself.
Day 26 returns to a plain statement of what the thing is, with no link and nothing to click.

### Reserve — 8 posts, all LinkedIn

**7**, **19**, **20**, **21**, **23**, **31**, **32**, **37**.

This is a deeper bench than v1's four, and the reason is structural rather than accidental: the
new material — retractions, tool explanations, the plain product description — needs room, and
room means LinkedIn. 24 of the 42 drafts are LinkedIn against 16 scheduled slots in four weeks.
**Treat the reserve as weeks 5 and 6, not as spares.**

Three specific notes:

- **Post 19 (my customer doesn't search)** is the strongest post on the bench and the first to
  promote. It is only in reserve because weeks 1 and 2 already carry three P3a posts each on
  LinkedIn and a fourth would tip the rotation from candid into self-absorbed. Ship it week 5.
- **Post 20 (the stat I deleted)** is still the single best post in the set for a week that has run
  hot. Hold it for the first time a P4 post gets real pushback, and reply to that pushback with it.
- **Post 21 (marketing first, product second)** now names "63 pages of free tools for a product
  that never ships" as the risk. That sentence gets more true, and more useful, the longer the
  product doesn't exist. Hold it until roughly week 6 and it will land harder than it would now.

---

## 5. Voice guardrails — social specifically

*Unchanged from v1 except for pillar references and one addition at 5.9. This section was the
strongest part of the document and the positioning reset does not touch any of it.*

The failure mode here is smugness. We are attacking a category from a position of having shipped
nothing, and that reads as arrogance unless the knife points at us in the same breath. The last
rule is the test.

### 5.1 Aim at the metric. Never the reader, never a vendor's competence.

"Completion rate can't distinguish a buyer from a bot" is a fact about arithmetic. "Typeform
doesn't care about your pipeline" is a slur about people. The reader chose their current tool
for reasons that were good at the time, and often still are.

**Banned on social, permanently:** any post whose subject is a named competitor's failure. Any
post that implies the reader has been naive. Any screenshot of a competitor's UI used as
evidence against them.

**Post 38 is the closest thing in this set to that edge and it clears it on purpose.** It quotes a
Typeform staff member being candid, agrees with their reasoning, and implicates our own product in
the same breath. If a future post quotes a competitor's documentation, that is the register it has
to be in. Anything that reads as gotcha is a rewrite, not a judgment call.

### 5.2 Every criticism ships with its receipt, in the same post.

Unsourced contrarianism is just attitude. If the number isn't in `00-positioning-spine.md`,
`02-messaging.md`, `04-keyword-research.md` or `13-competitive-verification.md`, it doesn't go in
a post. If a quote is used, the handle and the subreddit go with it, in the body, every time —
including when it's inconvenient for the character count.

**Competitor facts have a stricter rule**, inherited from `13`: never cite a competitor pricing
or feature figure that has not been read off the vendor's own live page within the last 30 days.
This applies to replies as much as to posts. If a reply thread heads somewhere we haven't verified
this month, the answer is "I'd have to go and check that," and then we check it.

### 5.3 The knife points at us on a schedule, not when it feels convenient.

P3a is 26% of the drafted set and never more than 48 hours behind a second P4 post. This is
structural for a reason: self-implication that only appears when a post is going badly reads as
damage control. Scheduled, it reads as method.

Concretely, in every 7-day window there must be at least one of:
- a call we got wrong (14, 15, 16, 17, 18, 19, 20, 25)
- a limitation we can't fix (9, 24, 38, 39)
- a competitor recommended by name, or the strongest objection conceded (22, 33, 41)
- something we refused to do because it would have helped (13, 20, 35)

The calendar in §4 satisfies this in all 22 rolling windows. It was checked, not assumed — the
rule is worthless if it's only true on the weeks somebody remembers to look.

**Post 15 is the load-bearing one now.** Three public retractions is a pattern; two is a
coincidence. It should not be held back, softened, or moved later in the calendar to make room for
something more flattering.

### 5.4 We are also a form builder in a category drowning in form builders.

Say it first, before someone says it for us. Post 21 does this explicitly, post 22 does it as
anti-positioning, and post 18 does it implicitly. Any post that reads as if we've already escaped
the category is wrong on the facts.

**The 63 pages make this harder, not easier.** A rotation carrying eight calculators can start to
sound like a company with a product. Post 21 exists to say out loud that it isn't one — **and it
is currently in reserve rather than on the calendar, which is the one soft spot in §4.** If weeks
1–4 land and the rotation starts reading like a company, promote 21 immediately rather than waiting
for week 6.

### 5.5 Concede the strongest counter-argument out loud, in public, unhedged.

Post 33 gives away the best objection to the entire product and agrees with it. That post is not
a risk to manage — it's the highest-value post in the set, and it should be pinned.

### 5.6 The quote-back test

**If a sentence would feel good to post and bad to be quoted back at you in two years, cut it.**

This kills, specifically: any absolute claim about spam ("bot-proof," "100% spam-free,"
"CAPTCHA killer"), any prediction with a date on it, any claim about what a competitor will or
won't do, and any version of "the last form builder you'll ever need."

**v1's post 10 failed this test and that's why it's gone** (§3.7). "Three words no form builder has
ever asked your CRM for" felt great and was one verification away from being wrong. The test
works; it just needs applying before the retraction rather than after.

### 5.7 Mechanical rules inherited from `03-brand.md`

- Sentence case everywhere.
- Contractions always.
- Numerals for anything measurable, including 1–9. "3 submissions," not "three."
- `%` closed up. Spaced em dashes.
- No exclamation marks. No emoji as decoration or as section markers — the only acceptable emoji
  is one doing real semantic work, which is roughly never.
- No hashtags.
- Never "conversion rate" unqualified in our own voice. **Completion rate** (theirs) vs **Yield
  rate** / **Yield value** (ours). Keeping those separate is the entire argument.
- **Never "yield optimization."** That phrase belongs to Dynamic Yield — an enterprise
  experimentation platform, and the closest category collision of any name we own
  (`12-trademark-screening.md`). We ship "Yield" *and* split tests, so a marketer who hears both
  words in one sentence may pattern-match to them. Always ship it as a number with a unit: **Yield
  rate**, **Yield value**, **ranked on Yield**.
- Never "bot" as a label for a submission. **Unverified.**
- Tier-1 jargon is never spelled out: CPL, CAPI, GA4, GTM, UTM, CRM, ROAS, MQL/SQL. Explaining
  them tells an agency buyer we think they're new.

### 5.8 Structural rules inherited from the personal voice reference

- No URL in any post body, ever. Reply on X, first comment on LinkedIn.
- Lead with a take, not a question. Questions are needy.
- No "here's why 👇," no "thread 🧵," no "unpopular opinion," no "hot take," no "PSA."
- One idea per post. If it sprawls, it's two posts or it's cut.
- No engagement bait, no "agree?", no fake polls, no "comment X and I'll send you Y."

### 5.9 The calculator posts have their own failure mode — added in v2

Eight posts that each end in "and here's a free tool" will read as a content-marketing funnel by
about the third one, which is the exact genre `03-brand.md` forbids. Three rules:

1. **The post has to be complete without the link.** If the body is a teaser for the calculator,
   it's an ad. Every P2 draft above makes its point in the body; the tool is the follow-through,
   not the payoff.
2. **Say what the tool refuses to do.** Posts 9, 10 and 13 are built on this — a tool that tells
   you not to bother, a tool that refuses to compute, a tool that won't supply the statistic. That
   is the thing no content-marketing funnel would ever ship, and it's the reason these read as
   honest rather than as lead magnets.
3. **Never more than two P2 posts in a 7-day window on the same platform.** The calendar holds to
   this. If a week runs long, cut the P2 before you cut anything else.

---

## 6. What we never post

1. **A screenshot of a product that doesn't exist.** No mockup presented as a UI, no "here's the
   dashboard," no fake data in a real-looking chart. Illustrating a *concept* is allowed and must
   be labeled as a concept. **A screenshot of a calculator is fine** — that's a real page anyone
   can load. A screenshot of anything that looks like the form builder is not.
2. **Any implication of customers, users, revenue, or traction.** No "teams are already using
   this." No "we're hearing from agencies that…" unless a real agency really said it and is
   quotable. **Including calculator usage** — no "1,200 people ran the spam calculator this week."
3. **The two unverified competitor pricing figures.** The 10-response free tier and the $199
   CAPTCHA. Struck permanently. See post 20 — refusing them is content.
4. **"Competitors send the ad platform a lead, not a lead worth $X."** Retired 2026-08-28 as
   verified false: Heyflow ships native server-side CAPI with a mappable Value field and markets
   in-funnel scoring specifically so the score becomes that value. The surviving claim is
   submit-time prediction versus later verdict, and post 15 is the retraction. Do not let the old
   sentence back in through a reply, a comparison table, or a paraphrase.
5. **Any competitor feature or pricing fact not read off that vendor's own live page in the last
   30 days.** Including in replies. Including facts that are in `13` — `13` is a snapshot, not a
   standing truth, and several of those pages were updated within six weeks of it being written.
6. **The 41% number as a result.** It is illustrative until a real split test with real verdicts
   exists. Post 8 handles this by making the reader supply their own number instead.
7. **Any absolute claim about spam.** Nobody has solved it and everyone in the corpus knows it.
8. **Anything that reads as an attack on a named competitor.** We recommend Tally, Typeform,
   Jotform, Gravity Forms, Formbricks and FormAssembly by name when they're the right answer,
   and we criticise category-wide patterns, never a product.
9. **Reddit seeding, sockpuppets, incentivised mentions, engagement pods.** See §1.1. A free
   calculator does not create an exception.
10. **Cold DMs to anyone who complained publicly about junk leads.** It is the most obvious growth
    hack available and it's indistinguishable from what we're attacking. Sending them a calculator
    link is the same act with better manners.
11. **A launch date we can't hit.** No countdowns. No "shipping next month" until the month it
    ships.
12. **"AI-powered" in any form.** We're agent-native, which is an architecture claim, not an AI
    claim. `00-positioning-spine.md` rules the lane out.
13. **"Yield optimization."** See §5.7. Yield rate, Yield value, ranked on Yield.
14. **"Qualified pipeline," "lead velocity," "frictionless," "seamless," "game-changing,"
    "revolutionary," "unlock," "leverage" as a verb.** The full list is `02-messaging.md` §7.
15. **Comparison-listicle content of any kind.** "9 best form builders in 2026" is the genre
    we're differentiating from and posting one would end the differentiation.
16. **Any customer's data, ever** — including anonymised, including after launch, including with
    permission unless the permission is written and specific.

---

## 7. Open items this doc is blocked on or flags

### Resolved since v1

1. ~~**`Unverified` vs `suspected bot`.**~~ **Resolved.** The spine sets Origin as **Human · Agent
   · Unverified**. Post 26 stands as drafted and no longer carries a caveat.
2. ~~**The five feature names are unscreened.**~~ **Resolved.**
   `12-trademark-screening.md` cleared Hindsight, Verdict and Yield; Origin is clear to use and
   never registrable; Handshake is renamed to **Manifest**. Posts 16 and 25 are the public version
   of that, and post 25 no longer ends on "any of them could still die."
3. ~~**Two competitive facts remain unverified.**~~ **Resolved, and one of them cost us a claim.**
   `13-competitive-verification.md` confirmed Typeform has no native split testing (post 38 now
   rests on it) and falsified our value-weighted-conversions claim (post 15 retracts it).

### Open

1. **`02-messaging.md` still carries the old primary message.** Its §1 leads with *"Your form
   can't tell a buyer from a bot"* and orders the three pillars around provenance, which the spine
   reset on 2026-08-28 demoted from headline to differentiator. **This document follows the spine,
   not `02`.** If `02` is being reworked in parallel, the P1 posts here are the plainest existing
   statement of the new front door and should be checked against whatever it lands on. If `02`
   wins instead, posts 1, 4 and 41 need rewriting.
2. **The calculators must never gate their results.** §2.4. Verified in
   `src/components/tools/tool-page.tsx` on 2026-08-28: the waitlist sits below the result. Eleven
   posts in this plan describe those pages as free and ungated, and post 6 says so in the body. If
   that changes, this plan needs rewriting before the next post ships, not after.
3. **Competitor facts in this document expire on 2026-09-27.** Post 38 quotes Typeform staff and
   their changelog; post 15 quotes Heyflow's help centre and blog. `13` flags both as high-risk
   for going stale — Typeform staff said they "plan on getting to it," and Heyflow's CAPI page is
   actively maintained. **Re-verify both before those posts ship, and again before they're
   reposted.** Publishing "Typeform has no A/B testing" the month they ship it is exactly the
   failure we are positioning against.
4. **The waitlist form has not been tested end to end from a social referral.** Posts 40 and 41
   send people to it. Confirm it accepts a submission and sends whatever it promises before Day 10.
5. **63 pages is an estimate.** The three P6/P3a posts that cite it (21, 40) should use the real
   count on the day they ship. Count it, don't round it — a marketing number that's approximately
   right is the exact thing this project is about not doing.
6. **Typefully.** Nothing in this document has been drafted into Typefully. That's a separate,
   deliberate decision — the workspace is a live account and publishing is a call the user hasn't
   made.
7. **Corey's real posting history isn't reflected here.** This plan doesn't account for what else
   is in the rotation across his other properties. The 1/day/platform target is the whole budget
   for one person, so slotting Endpoint Forms at 5 X posts and 4 LinkedIn posts a week means
   something else in the portfolio gets less. Run `/jab-hook audit` before committing Week 1.
