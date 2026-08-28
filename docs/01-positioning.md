# Endpoint Forms — Positioning

**Status:** v1, locked pending review · **Date:** 2026-08-28 · **Closes:** [#1](https://github.com/coreyhaines31/endpointforms/issues/1)
**Depth:** Revolution — new product, no legacy position to protect, pivotal category stance.
**Inherits from:** [`00-positioning-spine.md`](./00-positioning-spine.md). Every decision in the spine is settled here, not relitigated.

**Sources cited inline as:**
- `[W]` — `~/.config/makerskills/deep-research/archive/2026-08-28-form-builder-saas-wedge.md`
- `[V]` — `~/.config/makerskills/deep-research/archive/2026-08-28-form-builder-voice-of-customer.md`

Every quote below is verbatim from `[V]`. Quotes drawn from sources `[V]` flagged
`[LOW-CONFIDENCE SOURCE]` are marked as such and are never used as evidence of frequency —
only, occasionally, as language.

---

## 1. Market category

**We are a form builder.** Not a "lead quality platform," not a "revenue capture layer,"
not a new category with a new noun.

**Why we compete inside the category rather than invent one:**

**a) The demand already exists and is already searched.** People type "form builder,"
"Typeform alternative," "best form builder for lead gen." Inventing a category forfeits
that demand and forces us to fund the education. We cannot afford to create demand; we can
afford to redirect it.

**b) The switching trigger is category-native.** Buyers in `[V]`'s switching-trigger bucket
never say "I need a new kind of tool." They say the current one broke:

> "I wouldn't build 'a better Typeform' unless you can **name the workflow where the current
> form breaks.** Cheap/free is crowded, prettier is crowded, and people expect a pile of
> features."
> — u/SeparateAd3425, r/SaaS, May 22 2026 `[V]`

That is a category-internal test, and we can pass it. We can name the workflow: *you ran ads,
the form filled up, the dashboard said you won, and sales threw the leads away.*

**c) Category-adjacent products that repositioned out of the noun went upmarket and left the
buyer behind.** Perspective AI moved into "conversational research" and stopped competing on
forms `[W]`. Heyflow says "forms collect responses, funnels convert traffic" — and still gets
bought as a form tool. The noun holds.

**What we differentiate on is not the noun — it's the metric.** Every product in this
category reports completion rate. We report what the completion turned out to be worth.

**Category modifier, when one is needed:** *the form builder for teams who get paid on
pipeline.* Internal shorthand only. In customer-facing copy this becomes *"for teams whose
sales reps have to call the leads."* Nobody outside r/PPC says "qualified pipeline" `[V]`.

**One thing we take from the category and one thing we reject.** We take the noun. We reject
the category's distribution playbook. `[W]`'s SERP analysis found that searches in this space
return "near-exclusively AI-generated comparison content from tiny form builders" —
orbitforms.ai, splitforms.com, formhug.ai, ovoform, getaiform, dupple, fomr.io, zite,
formepic, formgrid, buildform. `[V]` independently found the same on Reddit: "the most
astroturfed software niche I have mined," 40–60% vendor plants, a confirmed paid-shill ring.
Writing "9 Best Form Builders in 2026" puts us in a knife fight with bots for a low-trust
click. **A contrarian POV is the better distribution bet, and it is also cheaper.**
`[judgment call — this is a GTM implication of the positioning, and it constrains the
keyword/content work in stage 3.]`

---

## 2. ICP

### Primary A — Agencies and freelancers running paid acquisition for clients

**~20% of the complaint corpus** `[V, Bucket 9]`. The largest professional segment, and by a
wide margin the most specific, most quantified, and most emotional. `[V]` states it flatly:
"the loudest, most specific, most emotional complaints come from **agencies and PPC
specialists** — people who feel the pain repeatedly across many accounts and can quantify the
cost."

**What their day looks like.** They run 5–25 client ad accounts simultaneously. They build the
landing page and the form for each one, usually in whatever tool the client already pays for.
They spend real money — *"I spend about 15,000 per week for local business's in my area"*
(u/Gavin-hill1, r/PPC, Mar 2026). They hold a weekly or monthly call where they present a
dashboard. And they field the call from the client's sales team saying the leads are garbage.

**What they're measured on.** Cost per lead in the deck; client retention in reality. CPL is
the number on the slide, but the account renews or churns based on whether the client's sales
team believes the leads are real. Those two things routinely disagree — and the agency finds
out about the disagreement *from the client*, which is the worst possible way to find out.

**Where the pain shows up.**

> "Cost per lead is amazing. Under $15 per lead. Sales are struggling with the leads. Loads of
> people seem to sign up and leave their details but when sales try and phone them or message
> on WhatsApp nothing... **They leave relevant enquiries but seem to ghost off the bat.**"
> — u/AfraidGuarantee5858, B2B web design/social agency, r/PPC, Nov 10 2025 `[V]`

> "Aside from using Cloudflare name servers to geo-block, there's no real successful way to
> stop spam bots from just constantly submitting spam entries. **Most of my clients deal with
> this.** Captcha feels worthless. Honeypot traps don't always work. Geoblocking scripts on
> just the form are buggy."
> — u/kjdscott, web developer / agency, r/Entrepreneur, Sep 03 2025 `[V]`

> "I run my own website company, and I can't tell you the amount very obvious copy/paste spam
> shit that comes through my contact forms"
> — u/starcrescendo, r/webdev, Jan 29 2025 `[V]`

The pain compounds because it arrives *n* times, once per client. A single in-house marketer
has one bad month. An agency has the same bad month twenty times and has to explain it twenty
times.

They also carry two secondary pains the in-house segment doesn't:

> "limited design/branding options so we don't always have brand consistency for our clients"
> — Cathy L., Founder/CEO, Marketing & Advertising agency, Capterra/Jotform, Feb 19 2026 `[V]`

> "limits organizations and creates a bottleneck in team flow, **as only one person has the
> ability to edit**"
> — Sandra R., Founder, Marketing & Advertising agency, Capterra/Jotform, Sep 11 2025 `[V]`

**What they've already tried, and why it failed.**

| Tried | Why it failed | Source |
|---|---|---|
| reCAPTCHA | "recaptcha v2 checkbox is pretty weak these days" · "Captcha can easily be bypassed… using a service such as 2captcha you could bypass captcha in like max 30 seconds" | u/muologys, u/AndyAndrei63, r/webdev `[V]` |
| Honeypot / hidden fields | "I do have a hidden field on the form, and none of the bots filled it out. That's what led me believe initially that it was actual people" → "Hidden fields don't work any more." | u/robwalte → u/hymnzzy, r/marketing `[V]` |
| Geo-blocking at Cloudflare | "Geoblocking scripts on just the form are buggy." | u/kjdscott `[V]` |
| Paid anti-spam APIs | "You can pay for OOP-Spam AI API to weed out Spam entries, but small businesses I work with **do not have the budget** for all these extra subscriptions." | u/kjdscott `[V]` |
| Taking the page down entirely | "We ended up taking down the page after 600 submissions." | u/robwalte `[V]` |
| Removing form-submit as a conversion action | "At this point, do I just remove form submit as a conversion action and keep phone calls? So frustrating :/" | u/alexxxcazam, r/PPC `[V]` |

Note what every one of these has in common: **they are all attempts to block bad submissions
at the door.** None of them tells you what the submissions you accepted turned out to be. The
whole defensive stack can succeed completely and you still can't answer "which of my forms
made money."

**Why they buy fast:** they can attribute a dollar figure to the problem within one client
call, they have budget authority under ~$100/mo without asking anyone, and they recommend
loudly in the exact communities where this category's word of mouth happens.

### Primary B — In-house PPC / demand-gen specialists at B2B SMB and mid-market

**~12% of the corpus** `[V, Bucket 9]`. Same pain, one account, more budget authority, slower
purchase, larger contract.

**What their day looks like.** They own spend across Google, Meta, and often LinkedIn. They
sit between an ad platform that rewards volume and a sales team that punishes it. They are
frequently the only person doing this job — *"I'm the single MOPs person for our company and
this would have been a fire that I would hate to have"* (u/Ownfir, r/marketing `[V]`).

**What they're measured on — and this is the whole problem.**

> "The root problem usually is structural. **Marketing gets measured on CPL so they optimize
> for CPL. Sales get measured on closed deals. Nobody owns the middle.** … The moment you
> start optimizing for pipeline quality over volume everything looks more expensive on paper
> and better in reality. That's a tough sell to stakeholders addicted to low CPLs."
> — u/Common_Dependent_284, r/DigitalMarketing, May 13 2026 `[V]` — *the best articulation of
> the problem found anywhere in the corpus*

The measurement shift is real and documented: B2B demand gen has moved off MQL volume toward
sourced revenue, 37.7% of marketers report pressure to deliver MQLs regardless of quality, and
leaders estimate ~25% of budget goes to campaigns that look good in dashboards but don't drive
revenue `[W, §1]`.

**Where the pain shows up.**

> "Honestly one of the biggest mistakes I still see is **companies optimizing campaigns for
> form fills instead of actual qualified leads.** We had campaigns that looked amazing on
> paper: cheap CPLs, tons of conversions, good CTRs … **meanwhile sales hated the leads.** …
> a lot of accounts are still basically **flying blind after the lead form.**"
> — OP, r/DigitalMarketing, May 13 2026 `[V]`

> "We are having a very hard time keeping bots from filling out our request a demo forms. …
> our demo requests have been through the roof with bull shit."
> — u/poopinion, r/marketing, Oct 31 2025 `[V]`

And the mechanism that turns a nuisance into a spiral:

> "all those bot submissions were **training Google's/your ad network's machine learning
> algorithm to send you more bot-like traffic.**"
> — u/polygraph-net, r/marketing, Jul 26 2023 `[V]` — *the doom loop, stated plainly*

**What they've already tried, and why it failed.** This segment is more sophisticated than
Segment A, and the honest answer is that **the thing they tried mostly works** — see
Objection 3. They run offline conversion import / enhanced conversions / server-side CAPI, and
they recommend it to each other reflexively. Its failure modes are narrow and specific:

1. **It's a manual spreadsheet job at SMB spend.** *"If you are spending less than $5k month,
   uploading the offline conversions using Google sheets once a week works pretty well."*
   (u/Few_Presentation_820, r/PPC `[V]`)
2. **It's gated on volume most accounts don't have.** *"Once you have at least 3 qualified
   leads per day…"* and *"Optimizing for qualified leads might help but I imagine your
   qualified lead volume will be too low to feed the algo enough"* (u/dillwillhill, r/PPC
   `[V]`).
3. **It's gated on CRM hygiene.** *"the biggest thing is making sure your crm mapping is clean
   before you let ai loose on it, if the fields are messy it will just make bigger mess"* `[V]`.
4. **It's slow.** *"if it's not immediate, like 1-2 days, that will also hurt the feedback
   loop"* (u/ernosem, r/PPC `[V]`).
5. **It teaches the ad platform and teaches the form nothing.** `[V]` searched for this
   specifically and found zero instances in the entire corpus of anyone feeding downstream
   outcome data back into which form variant, question, or field they use.

Point 5 is the entire opening.

### Secondary — SMB founders running their own ads

~20% of complainers `[V, Bucket 9]`, and they are loud. But their complaint is price, not
outcomes: *"Typeform is way too expensive for a startup like ours,"* *"expensive for a small
business,"* *"their free tier is basically a demo."* `[V]` draws the line for us: **"Casual/SMB
owners complain about price; professionals complain about outcomes."**

They are welcome. We will serve them well on the free tier because table stakes demand it. We
do not design the message for them, because a message aimed at price loses to Tally by
definition (see §7).

### Explicitly not for

- **Casual and one-off form users** — event RSVPs, contact forms, internal requests. Tally is
  better and free. Say so.
- **Survey researchers** — Perspective AI and the research tools are better. Our whole model
  assumes a submission has a commercial outcome. Research responses don't.
- **Enterprise compliance buyers** — HIPAA, FedRAMP, procurement, DPAs. FormAssembly and
  Formstack exist for this. *"handling stuff like HIPAA/FedRAMP compliance is overlooked or
  not very built out with general-purpose builders"* `[V]`. Correct, and we will be one of the
  general-purpose builders that overlooks it, on purpose, for now.

Saying these out loud is a positioning asset, not a concession. In a category where every
vendor claims every use case, naming three we're bad at is a trust signal — and `[V]` shows
this is a category where trust is the scarce resource.

---

## 3. Competitive frame

### The map

**X axis — what the tool optimizes for:** *form completions* → *downstream outcomes*
**Y axis — who it's built for:** *general-purpose* → *paid acquisition and lead gen*

```
                    BUILT FOR PAID ACQUISITION
                              ▲
                              │
              Heyflow ●       │
         (funnel conversion,  │              ◆ ENDPOINT FORMS
          server-side CAPI)   │            (provenance + outcome-
                              │             weighted optimization)
            ROASForm ●        │
      (split tests scored on  │
        funnel-step movement) │
                              │
                  Reform.app ●│
            (pre-submit       │
             qualification,   │
             routing,         │
             enrichment)      │
                              │
  ────────────────────────────┼────────────────────────────────▶
  OPTIMIZES FOR COMPLETIONS   │           OPTIMIZES FOR OUTCOMES
                              │
      Typeform ●              │
   (completion rate is        │
    literally the brand)      │
                              │
  Fillout ●   ● Jotform       │
                              │
      Tally ●                 │
                              │
   Orbit / Deformity /        │
   Buildform ●                │
   ("DeepOptimize" =          │
    always-on AI              │
    completion optimization)  │
                              │
                    GENERAL-PURPOSE
```

**Everything meaningful about this map is on the right-hand side, which is empty.**

### Position by position

| Product | Where it sits | What it actually optimizes | Why it isn't us |
|---|---|---|---|
| **Tally** | Bottom-left, and owns it | Completions, at zero marginal cost | Unlimited free responses, 150K customers, 34 people, ~$4–5M ARR bootstrapped `[W]`. Users love it precisely because it doesn't paywall basics. It reports submissions and stops. Fighting Tally on price is suicide; fighting it on the metric is a different conversation. |
| **Typeform** | Bottom-left, premium | Completion rate — it *is* the brand | "conversion rates on multi-step forms tend to be higher than traditional layouts" `[V]`. Analytics stop at drop-off. Widely resented on price ($28 Basic/100 responses, $56/1,000, $91/10,000, verified live `[V]`). Whether it has real native split testing is **unresolved** `[W, contradictions]` — verify before writing any comparison page. |
| **Jotform** | Bottom-left, deep | Features and templates (35M users, 20,000+ templates) | Analytics explicitly weak: *"the analytics seem weak, and the builder feels a bit clunky"* `[V]`. Not a fight worth picking on breadth. |
| **Fillout** | Bottom-left, value | Completions, with better logic on the free tier | Aggressively undercutting on features (1,000 free responses, hidden fields + conditional logic free) `[W]`. Same metric. |
| **Heyflow** | Upper-left | Funnel conversion; fires server-side Meta CAPI / Google / TikTok | **The closest competitor on infrastructure.** It sends the ad platform *"a lead" — not "a lead worth $X"* `[W, §2]`. Its optimization loop is still completion-shaped. Also: *"heyflow is brutal on price"* `[V]`. |
| **ROASForm** | Upper-left | Funnel-step movement; native split testing, agency/GHL niche | The only mainstream product with real native form split testing `[W, §3]` — **and it scores those tests on funnel-step conversion, not on what closed.** They built the machine and pointed it at the wrong number. |
| **Reform.app** | Middle-upper-left | Qualification *before* submission — routing, enrichment, progressive profiling | **Our closest philosophical neighbor** `[W]`. The difference is directional: Reform tries to qualify the lead on the way in, using data it can guess. We grade the lead on the way out, using what actually happened. Reform's model is a filter; ours is a feedback loop. If Reform shipped outcome sync, they'd be the real fight. |
| **Orbit / Deformity / Buildform** | Bottom-middle | Completion rate, with AI | "Crowded, thin, undifferentiated" `[W]`. Buildform's "DeepOptimize" is always-on AI optimization — **of completion rate.** This lane is the purest expression of the enemy: more machine learning aimed at the wrong metric. |

### The axis we own, and why it's empty

The X axis is empty on the right for a structural reason, not an oversight one: **completion
is an event the form can observe by itself, and outcome is not.** Every product on the left
optimizes what it can see. Moving right requires the form to accept data from outside its own
boundary — from a CRM, from a sales rep marking a deal, from an outcome webhook — and then
change its own behavior based on it. That is an architectural commitment, not a feature.

The one adjacent practice that *does* live on the right — offline conversion import — moves
the **ad platform** right while leaving the **form** on the left. That is the precise shape of
the gap:

```
  Who learns from the closed deal?

  Nobody                    The ad platform              The form
  ──────────────────        ─────────────────────        ────────────────
  Tally, Typeform,          Offline conversion           ← nobody, anywhere
  Jotform, Fillout,         import / enhanced            in the corpus
  Orbit, Deformity,         conversions / CAPI
  Buildform                 (HubSpot, WhatConverts,
                            CallRail, Heyflow,
                            competent PPC teams)
                                                          ◆ Endpoint Forms
```

We do not claim the middle column. Competent practitioners already own it and offer it as
first-line advice — *"Use offline conversion tracking to report qualified leads only"* was an
entire r/PPC reply, posted as assumed knowledge `[V]`. Claiming it puts us against HubSpot and
CallRail on their turf and gets us laughed at by the exact buyers we want.

We claim the third column, which is unoccupied and which `[V]` searched for specifically and
found empty:

> **"Nobody, anywhere in this corpus, describes feeding downstream outcome data back into
> *which form variant / which question / which field* they use. The offline-conversion pattern
> teaches Google who to show ads to. It teaches the form nothing."** `[V, Hypothesis stress
> test, Part B, point 5]`

### The second axis nobody is on: provenance

There is a second empty space, and it's the one that gets us in the door.

Only Tally, Jotform, and Typeform have MCP servers — and all three are **build-a-form** MCPs
for authors, not **fill-a-form** surfaces for a buyer's agent `[W, §4]`. Nobody has shipped
dual-surface forms, per-submission agent-vs-human provenance, or agent-specific field logic.

Meanwhile automated requests are 57.5% of HTML web traffic vs 42.5% human `[W, §4]`, bad bots
were 40% of internet traffic in 2025 up from 37% `[W, §5]`, and Google announced WebMCP at
I/O 2026 with a Chrome Canary preview in Feb 2026 `[W, §4]`.

The elegance is that **it is one mechanism covering two pains.** `[W]` names it: "A provenance
layer that says 'this submission came from Claude acting for a named human' vs 'this is a
residential-IP bot' solves both." The thing that lets legitimate agents through is the same
thing that identifies the fakes. That is why it leads.

---

## 4. The enemy, and the reframe

### The enemy is not a competitor

It is **the dashboard that says everything is fine while sales drowns in junk.**

Naming Typeform as the enemy would be a category error. Typeform's crime is being expensive,
and price is a fight we've already declined. Naming Tally would be worse — Tally is genuinely
loved, and attacking a beloved bootstrapper is a reputational loss even when you win.

The enemy is a *measurement convention* that all of them share and none of them chose
maliciously: **completion rate.**

### The argument, properly

**Premise 1 — completion rate cannot distinguish a buyer from a bot from a tire-kicker.** It
is a count of submit events. It has no access to who submitted or what happened next.
Definitionally, a bot fill and a $50K deal are the same row.

**Premise 2 — in 2026, a majority of the traffic hitting that form is not human.** Automated
requests are 57.5% of HTML traffic `[W]`. Bad bots alone are 40% of internet traffic, up from
37% `[W]`. ~30% of leads purchased from third-party vendors are outright fake `[W]`.

**Premise 3 — the defensive tools that were supposed to handle premise 2 are defeated, and
practitioners know it.** This is the angriest bucket in `[V]` — ~22 independent sources, and
the resolution is uniformly: nothing works.

> "I think that's the problem with contact form 7, wp forms, jotform, squarespace, and all
> others. They all are ok to get setup, some even offering SMTP setup. **But none have nailed
> anti-spam to a science.**"
> — u/kjdscott `[V]`

> "We have captcha on all of our forms, but it seems like these are **real people submitting,
> just bad actors.**"
> — u/alexxxcazam, r/PPC `[V]`

**Premise 4 — because the metric can't see the difference, the report is not merely
incomplete. It is actively wrong, and it is wrong in the flattering direction.**

> "The moment I uploaded and enabled everything, I started getting contact form submissions
> back to back. **At first I thought it was working great**… until the leads were called.
> Every single one has been junk or spam — fake info, not real customers. The odd thing is,
> I'm still getting charged for the clicks, **Google is tracking form submissions as
> conversions, and everything looks normal from a reporting standpoint — but the leads are
> all trash.**"
> — OP, r/PPC, Oct 10 2025 `[V]`

**Premise 5 — and the error compounds, because the wrong number is fed to a machine that acts
on it.** *"all those bot submissions were training Google's/your ad network's machine learning
algorithm to send you more bot-like traffic"* `[V]`. *"your dashboards will look amazing while
pipeline quality tanks"* (u/Necessary_Aspect7317 `[V]`).

**Conclusion.** The tool is not neutral about your failure. **It is congratulating you for the
exact thing that is hurting you, and then telling the ad platform to do more of it.** That is
the enemy. It is a design decision every product in the category made, and it made sense in
2015, and it does not survive a web where most of the traffic isn't human.

There is one further point that makes this a *category* indictment rather than a complaint:
because response caps are metered per submission, **you are billed for the bots.**

> "If we stay on the current trajectory, websites will have to remove contact forms in the
> next few years due to the sheer volume of spam bots submissions. **If your form software has
> a submission limit, bots are using it before real people even get a chance.**"
> — u/kjdscott `[V]`

Spam × response caps = you pay per-response for traffic that will never buy anything. That is
the sharpest single formulation of the category's dishonesty, and it's a customer's, not ours.

### The reframe

| | |
|---|---|
| **Before** | A form is measured by how many people complete it. |
| **After** | A form is measured by what those completions turned out to be worth — and it should change based on the answer. |

Both halves matter. "Measure outcomes" alone is a report. **"And it should change based on the
answer"** is the product. The first half is the argument we win; the second half is the thing
nobody else is doing.

---

## 5. Value proposition

### One paragraph

Endpoint Forms is a form builder for teams running paid acquisition, built on one premise:
a submission is not an outcome. Every submission arrives stamped with its provenance — human,
identified agent, or suspected bot — because one form definition publishes both a human UI and
a machine-callable tool surface, so we know which one was used. Then every submission carries
what happened next: won, lost, disqualified, and what it was worth, synced from your CRM or
posted to an outcome webhook. Your split tests rank on that. The variant that produces closed
deals wins, even when it produces fewer submissions — and the form changes based on the answer,
which no other tool in the category does. You stop finding out from your client's sales team
that the leads were trash.

### One sentence

**Endpoint Forms stamps every submission human, agent, or bot on arrival, and grades every
form on the deals it closed instead of the boxes it filled.**

### One phrase

**Forms graded on what closed.**

**Launch headline** (from the spine — the hook, not the value prop; anger converts better
than insight):

> **Your form can't tell a buyer from a bot — and it's reporting both as conversions.**

---

## 6. Proof points

Five, each sourced. Nothing here rests on our own claim.

**1. Most of the traffic hitting your form is not a person.**
Automated requests are **57.5% of HTML web traffic vs 42.5% human** `[W, §4, source 18]`. Bad
bots specifically were **40% of internet traffic in 2025, up from 37%** `[W, §5, source 21]`.
*Use for: the provenance argument. This is the premise the whole lead message rests on.*

**2. The defenses everyone is using are known-broken, by the people using them.**
~22 independent sources in `[V]` report defeated CAPTCHA and honeypots. The most technically
specific: *"Captcha can easily be bypassed. I had a small web scraping app and using a service
such as 2captcha you could bypass captcha in like max 30 seconds using puppeteer and
javascript"* (u/AndyAndrei63, r/webdev, Jan 30 2025 `[V]`). And the volume: *"I got 665 form
fills on one page last night in an hour and sixteen minutes"* (u/surfnsound, r/marketing
`[V]`).
*Use for: why "just add CAPTCHA" is not an answer.*

**3. ~30% of leads purchased from third-party vendors are outright fake, and global ad fraud
losses are projected past $100B in 2026.** `[W, §5, source 21]`
*Use for: sizing the cost. This is the number that turns a nuisance into a budget line.*

**4. MQL → SQL converts at ~13%.** `[W, §1, source 16]`
*Use for: the outcome-weighting argument. If 87% of what your form reports as a conversion
never becomes a real opportunity, ranking variants on completions is ranking them on noise.*

**5. The form-side loop is provably unclaimed.** `[V]` mined ~40 Reddit threads, ~150 Capterra
reviews, and ~20 HN comments, searching specifically for it, and found **zero** instances of
anyone feeding downstream outcome data back into which form variant, question, or field they
use `[V, Hypothesis stress test, Part B, point 5]`. Meanwhile the ad-platform version of the
loop is so well known it gets posted as a one-line reply.
*Use for: the "why hasn't anyone done this" question. It's negative evidence, which is weaker
than positive — but it's a systematic search, not an assumption.*

**Supporting, for the agent-native story:** Google announced WebMCP at I/O 2026 with an early
preview in Chrome Canary (Feb 2026); it makes HTML forms agent-callable and is ~89–90% more
token-efficient than screenshot-based agent interaction `[W, §4, source 19]`. Only Tally,
Jotform, and Typeform have MCP servers, and all three are build-a-form MCPs for authors, not
fill-a-form surfaces `[W, §4, source 20]`.

**Do not cite** (per spine, and confirmed in `[V, Gaps]`): the "Typeform cut its free tier to
10 responses in Feb 2026" claim or the "$199 CAPTCHA" claim. Typeform's live pricing page
fetched 2026-08-28 contradicts both. Also do not cite the conversational-lift figures ("2–4x
completion," "2.5x vs standard forms") — they come almost entirely from vendors selling
conversational forms `[W]`.

---

## 7. Objection handling

These are the strongest arguments against us, stated at full strength, from practitioners who
know what they're talking about. Weakening them here would only mean losing to them later.

### Objection 1 — "If unqualified people are booking, the form isn't broken, the page is."

> "juzdeau's second question is the one to answer first. **If unqualified people are booking,
> the form is not the thing that is broken, the page is.** It has not told them who this is
> not for. Cheapest fix I know is putting a price or a range on the page… **That filters more
> than four extra fields would.**"
> — u/Conscious-Market8982, r/DigitalMarketing, Aug 20 2026 `[V]` — flagged by the researcher
> as "the most damaging single counter-quote"

**They're right, and we should say so first.** A price on the page is a better qualification
lever than four extra form fields, it costs nothing, and it works. We are not going to argue
that a form can fix a page that hasn't said who it's for.

**Three things it doesn't do.**

*First, it doesn't work on bots.* A price range disqualifies a human who reads it. Bots don't
read, and roughly 57.5% of the requests hitting the page are automated `[W]`. The page fix and
the provenance problem are orthogonal — u/robwalte took down a page after 600 submissions
`[V]`; a price range would not have prevented one of them.

*Second, it's a one-time act of judgment with no feedback.* You put the price on the page.
Then what? You have a hypothesis and no instrument. u/Conscious-Market8982 is prescribing a
change and has no way to know whether it worked beyond a vibe check on next month's calls —
which is exactly the situation `[V]`'s CRO bucket describes: *"I honestly think this is one of
those 'nevermind the best practices, test it out yourself'"* (u/AhmedF, r/cro `[V]`), from a
thread where nobody has ever tested it.

*Third, it doesn't scale across accounts.* An agency running 20 clients can't hand-tune 20
pages on intuition every month. What it can do is instrument all 20 and let the outcome data
say which ones need the intervention.

**So the honest answer: we don't compete with the page fix. We are how you find out the page
fix worked.** That reframe is stronger than an argument, because it converts the most
knowledgeable skeptic in the corpus into a user with a measurement problem.

### Objection 2 — "Every form element is a barrier to submission. That's a messaging problem."

> "As little as possible. **Every form element is a barrier to submission.** My question is,
> why are those that are poor fit even trying to submit? It seems as though you're trying a
> catch all approach rather than speaking to your ideal customer."
> — u/juzdeau, r/DigitalMarketing, Aug 20 2026 `[V]`

> "If you get low quality leads from **not making your users jump through unnecessary hoops,
> that's a messaging problem - not a conversion flow problem.**"
> — u/jbankz80, r/marketing, Jan 01 2024 `[V]`

And the principled version, which is the one that should worry us most:

> "It's always struck me as amusing how much money B2B companies spend on marketing to drive
> enough interest that somebody might want to speak to sales, and then **do everything they
> can to keep people away from sales.** … If your form discounts me and I don't get to speak
> to anybody, I don't find out if I like your product… So when I do have a brief and a budget,
> I'm not coming to you."
> — u/Mike-Nicholson, r/DigitalMarketing, Aug 20 2026 `[V]`

**We agree with all of it, and it is not an objection to us — it's an objection to a product
we deliberately aren't building.** We do not sell friction. We are not a qualification-gate
tool. "Add three more fields to filter people out" is a pitch we will never make, and §8 makes
that a formal commitment.

**Then the substantive part:** this objection and the category's default behavior are *both*
unevidenced, and they point in opposite directions. Completion-rate optimization pushes you to
strip fields. The lead-quality instinct pushes you to add them. Nobody in `[V]` has data on
which is right for their account — the researcher flagged it explicitly as an unresolved
contradiction:

> "**Multi-step vs. single-step form conversion.** Current consensus says multi-step wins; a
> r/cro veteran with real data says the opposite. Nobody in the corpus has run a clean test
> recently. **This is an opportunity: the category's central design belief is unevidenced.**"
> — `[V, Gaps, contradiction 2]`

Outcome-weighted testing is **agnostic on the direction.** If the shorter form produces more
closed deals — and it very often will, because u/Mike-Nicholson is right — our system says so
in outcome data and tells you to cut fields. The tool that currently pushes toward more fields
is the sales team's anecdote, and the tool that pushes toward fewer is completion rate. Both
are guesses. We replace both with a number.

**That's the reframe: this objection is an argument for an instrument, made by someone who
doesn't have one.**

### Objection 3 — "Cheaper substitutes already work: OTP, one open question, quiz funnels."

The strongest version, with numbers:

- **OTP / phone verification.** *"~30% reduction in cost per lead"* with quality *"on par with
  landing page traffic"* (r/marketing, Dec 2025 `[V]`). *"I avoided instant forms for years
  because the lead quality was trash but the otp verification is very helpful tbh"*
  (u/Luis_Dynamo_140 `[V]`). *"Auto verification and bidding to that data point always
  performs better than bidding to forms or calls alone"* (u/ppcbetter_says, r/PPC `[V]`).
- **One open-ended question.** *"Researchers write one line. Someone with an actual problem
  writes three paragraphs and hands you most of the discovery call for free"*
  (u/Conscious-Market8982 `[V]`).
- **Quiz funnels.** Multiple agencies in `[V]` report better lead quality.

**Concede the first one completely — and ship it.** OTP works, it's cheap, and it is a
documented switching trigger away from tools that lack it: *"needed to verify submissions
before accepting them, **and Typeform didn't have that.** Ended up using Collect.chat"*
(u/Salty-Garden-7138 `[V]`); *"the main issue was that they do not have OTP verification built
into their forms"* (u/Forsaken_Fix_1182 `[V]`). Arguing against OTP would be arguing against a
feature our own ICP is switching tools to get. **OTP is table stakes for us, not a
competitor.** `[judgment call — this promotes OTP/verification from "substitute" to
"required v1 feature," which is a product implication the spine's table-stakes list doesn't
name yet.]`

**Then the limits, honestly.**

*OTP proves a phone number is reachable. It does not prove the lead is worth anything.* The
r/PPC corpus is split down the middle on whether OTP fixed Meta Instant Forms — *"Meta ads
Instant Forms are worse for everyone and in ever situation"* (u/fathom53, Mar 2026) versus the
30%-CPL-reduction camp — and `[V]` concluded both camps are experienced practitioners and the
truth is likely vertical-dependent `[V, Gaps, contradiction 3]`. A reachable tire-kicker is
still a tire-kicker.

*The other two are qualification tactics, and every one of them is an untested change to the
form.* "One open question" and "quiz funnel" are exactly the kind of intervention that our
instrument exists to grade. They're not substitutes for measurement — they're the population of
things you'd want to measure.

**And the concession that matters:** for a solo operator running one form on one account, a
price on the page plus OTP probably *is* enough, and they should do that and not buy anything.
That is precisely why the ICP is agencies and PPC specialists with repeat exposure across
accounts, and why SMB founders are secondary. The value of an instrument scales with the number
of decisions you have to make with it.

### Objection 4 — "Offline conversion import already does this."

> "**Better data.** Use server side tracking to reduce data loss to ad blockers and privacy
> settings. **Port qualified lead data, vs all leads, back to meta.** Once you have at least 3
> qualified leads per day reporting back to the platform, **bid to qualified leads instead of
> form fills.**"
> — u/ppcbetter_says, r/PPC, Jun 25 2026 `[V]` — the researcher's note: *"this is our
> hypothesis, already solved, by a practitioner, in three sentences"*

**Fully conceded. This is why the spine forbids leading with it.** The ad-platform loop is
solved, commoditized, and known. Claiming it is how we get dismissed by the smartest person in
the room.

**The residual is exact and small enough to be honest about:** the loop teaches Google who to
show ads to and teaches the form nothing (§3). The variant, the question, and the field are
untouched by it. `[V]` searched for a counterexample and found none.

If someone says "I already do offline conversion import," the correct reply is *"good — which
of your form variants produced those closed deals?"* Nobody can answer that today.

### Objection 5 — "I built my workflow around my current tool."

> "I still use Jotform since its been reliable for me. They keep coming out with new tools and
> **I built my workflow around them** so everything works seamlessly."
> — u/stevenbellomy, r/nocode, Apr 22 2026 `[V]`

Real, and mostly unanswerable — which is why the message targets the moment the workflow
*breaks*, not the steady state. `[V]`'s switching-trigger bucket says triggers are events, not
arguments: hit the response cap mid-campaign, needed verification and it wasn't there, logic
broke past five conditions, **sales rejected the leads.** The last one is ours. We should not
try to convince a happy Jotform user; we should be the obvious thing to search for in the week
after a client says the leads were garbage.

### Objection 6 — "Nobody thinks this is the form's problem."

The hardest structural objection, and it comes from `[V]`'s own gap analysis:

> "**Nobody complained about attribution loss at the form layer specifically.** The tracking
> complaints are all one layer up (GA4/GTM/pixel/CAPI). This means the pain is real but is
> currently *attributed to the analytics stack, not the form tool* — **a positioning problem
> for us, and a reason our message may not land without education.**" `[V, Gaps]`

And: *"Nobody described A/B testing forms by duplicating them and splitting by UTM. Either
it's rare, or it happens silently. Treat this hypothesis as unsupported until validated."*

**This is the real risk and it's handled by message sequencing, not by argument.** We lead with
the pain people already locate in the form — junk submissions arriving through it, ~22
independent angry sources — and we *arrive* at outcome-weighted testing as the consequence.
That ordering is exactly what the spine's primary message encodes. If we led with "your form
should be A/B tested against closed deals," we'd be selling a solution to a problem nobody
currently files under "form." See §9, Risk 6.

---

## 8. What we deliberately give up

Each of these is a lane owned by someone who will beat us in it. Conceding them out loud is
cheaper than losing them quietly.

**Not the cheapest.** Tally owns it — unlimited free forms and responses, exports never
paywalled, ~$4–5M ARR on 34 people `[W]`. *"tally is literally a cheat code"* `[V]`. We will
have a genuinely generous free tier because it's table stakes (below), but we will never be the
price answer, and we will never write a page arguing we're cheaper than Tally.

**Not the prettiest.** Typeform owns it — *"Forms look stunning though"* `[V]`, and that
reputation survives near-universal hatred of its pricing. We need to be good enough to put in
front of a client without a Fiverr CSS job. We do not need to win a design award.

**Not the most features.** Jotform owns it — 35M users, 20,000+ templates, payments, PDFs,
calculations `[W]`. *"the feature depth is solid"* `[V]`. Breadth is a ten-year war and we
would lose it.

**Not "AI-powered."** The lane is crowded, thin, and low-trust `[W]`, and it is where the
astroturfing lives. We will use models where they're the right tool and we will not put "AI" in
the headline.

**Not a friction/qualification tool.** `[judgment call, follows from Objection 2.]` We will
not sell "add fields to filter people out." The strongest skeptics in the corpus are right that
friction is usually a messaging failure, and adopting the opposite pitch would make us their
enemy for no gain.

**Not the ad-platform loop.** Per the spine's hard constraint: outcome push to ad platforms may
exist as a feature; it is never the headline. HubSpot, WhatConverts, and CallRail own that
ground and competent practitioners already run it themselves.

**Not open-source-first as a marketing message.** `[V]` is unambiguous: **zero marketers in the
entire corpus asked for open source or self-hosting.** Every such request came from developers,
r/selfhosted, r/opensource, or r/reactjs. Open source is a trust, no-lock-in, and
developer-distribution asset — *"its way easier to trust something Open source in this
regards"* `[V]` — and there is real quotable resentment about vendors gating exports and
changing free tiers, which our license answers. But it does not acquire marketers. Position it
as *your data is yours and we can't take it away*, and price and market the hosted product.

### Table stakes we cannot be worse at

Failing any of these kills us regardless of how good the wedge is `[V, Bucket 8]`.

1. **A free tier that isn't a demo.** Tally set the bar: unlimited forms and submissions,
   exports never paywalled.
2. **Uptime and a builder that isn't buggy.** Three separate people abandoned Youform over
   this — *"incredibly buggy,"* *"They need to test it properly,"* *"I've had a form there for
   48 hours and most of the time the form is down."* `[V]` This is how cheap Typeform clones
   die, and it is the single most likely way we die.
3. **Conditional logic that holds past five conditions and is debuggable.** The #1 *functional*
   complaint in the category (~12 sources) and currently unclaimed by anyone. *"The conditional
   logic is always the biggest headache it never works right for anything beyond super simple
   forms."* `[V]`
4. **Native integrations, not Zapier-only.** *"For me, the paid feature is dependable
   integrations, not prettier form fields… and **fails loudly when a sync breaks**"* `[V]` —
   the best "what would you pay for" quote in the corpus. Note "fails loudly": our outcome sync
   must announce its own breakage, or the whole product silently lies. That is the same sin we
   accuse the category of.
5. **Good enough looking to put in front of a client without custom CSS.**
6. **One-command self-host.** `[V]` is unanimous that OSS form builders are painful to deploy
   — *"deploying them is much harder than signing up for their managed version,"* *"I had to
   pull out my hair to get the api worker to work!"* That specific gap is the one thing we
   could beat Formbricks and OpnForm on.

---

## 9. Risks to this position

Written as falsifiers. Each one names what would have to be true for the position to be wrong,
and how we'd find out.

**Risk 1 — Provenance may not actually distinguish a bot from a human. `[highest severity]`**
The mechanism cleanly identifies a *cooperating agent*: something that calls the MCP/WebMCP
tool surface announces itself by doing so. It does not obviously identify a hostile bot at the
human UI, and the corpus is explicit that the hard case is human-shaped: *"it seems like these
are **real people submitting, just bad actors**"* `[V]`, plus residential-IP bots that mimic
mouse movement and scroll depth `[W, §5]`. If our "suspected bot" classification is no better
than reCAPTCHA in practice, the headline message — *your form can't tell a buyer from a bot* —
collapses, because ours can't either.
*Falsifier:* on real traffic, our provenance stamp fails to beat reCAPTCHA + honeypot on
precision/recall against sales-verified junk.
*What we owe ourselves:* be precise in copy about what provenance proves. "This submission came
from a named agent" is defensible. "This is a bot" is a claim we have to earn, and we should
under-promise it until we have data.

**Risk 2 — Outcome volume floor.** Outcome-weighted split testing needs statistical power on a
rarer event than completion. `[V]` flags this as "the hardest constraint on the thesis":
*"Optimizing for qualified leads might help but I imagine your qualified lead volume will be
too low to feed the algo enough"* (u/dillwillhill `[V]`); the practitioner threshold is *"at
least 3 qualified leads per day."* Most SMB accounts never get there.
*Falsifier:* in pilot accounts, fewer than half accumulate enough outcome events in 8 weeks to
call a variant.
*Mitigation `[judgment call]`:* at low volume the product's value has to shift from "picks the
winner" to "shows you the provenance and outcome of every single lead" — a ledger, not a test.
The ledger is useful at n=12; the test isn't. We should build and message the ledger first and
treat split testing as the thing that turns on when volume arrives. Never declare a winner
without power; say "not enough data yet" and mean it. Doing otherwise makes us the same kind of
lying dashboard we're attacking.

**Risk 3 — CRM hygiene dependency.** Our output is a function of someone else's lead-status
discipline. *"the biggest thing is making sure your crm mapping is clean before you let ai
loose on it, if the fields are messy it will just make bigger mess"* `[V]`. If reps don't mark
deals, we have nothing.
*Falsifier:* pilot accounts can't or won't maintain outcome data, and the outcome webhook goes
unused.
*Partial mitigation:* the outcome webhook is deliberately dumber than a CRM integration — one
POST with an ID, a status, and a value. The lower the bar, the more accounts clear it.

**Risk 4 — Outcome latency.** *"you need to consider how fast you or your client can qualify
the leads, because if it's not immediate, like 1-2 days, that will also hurt the feedback
loop"* `[V]`. A 90-day sales cycle makes form-level learning nearly useless.
*Falsifier:* the median time-to-outcome in our ICP exceeds the useful lifetime of a form
variant.
*Note:* this pushes us toward ICPs with fast disposition — local services, high-velocity SMB
B2B, agencies whose clients call leads within 48 hours — and away from enterprise B2B. That may
mean the ICP needs a velocity qualifier the spine doesn't currently have.

**Risk 5 — WebMCP may not arrive.** Chrome Canary preview only as of Feb 2026 `[W]`. Real
agent form-fill traffic today is likely near zero. If it stays near zero through 2027, half the
differentiator is a great demo attached to no demand.
*Falsifier:* WebMCP stalls or is superseded, and measured agent traffic on live customer forms
stays under ~1% into 2027.
*Hedge:* the provenance value must stand on the bot-detection half alone. The agent half is
upside and narrative, not the load-bearing wall.

**Risk 6 — Buyers don't locate this problem in the form.** `[V, Gaps]`: nobody complained about
attribution loss at the form layer; the complaints all land one layer up on GA4/GTM/pixel.
Nobody described A/B testing forms at all. We may be answering a question no one is asking of
this product category.
*Falsifier:* landing page tests show the outcome-weighting message underperforms the junk-leads
message by a wide margin, and even the junk-leads message doesn't convert to waitlist.
*Mitigation:* it's already handled in the message hierarchy — lead with the felt pain, arrive
at the insight. But if even the junk-leads framing doesn't pull, the problem is the category,
not the copy.

**Risk 7 — Fast-follow by Heyflow or ROASForm.** ROASForm already has native split testing and
UTM plumbing; Heyflow already has server-side CAPI. Either could add value-weighted outcomes in
a quarter. Reform.app is philosophically closest and would be the real fight.
*Falsifier:* any of the three ships outcome-weighted variant ranking before we launch.
*What actually defends us:* not the technology. Being first with the *argument*, plus the
agent-capture spec being open enough that other people implement it. A standard we wrote is a
better moat than a feature we shipped.

**Risk 8 — Table stakes eat the runway.** We must be as generous as Tally, as reliable as
Gravity Forms, and better than everyone at conditional logic *before* the wedge gets a chance
to matter. Youform had the wedge story and died on bugs `[V]`.
*Falsifier:* first cohort churns citing reliability or missing basics, never having engaged
with outcome data at all.
*This is the most boring risk on the list and the most likely to actually kill us.*

**Risk 9 — Category SEO may not reach the ICP.** The people searching "form builder" skew
toward the casual/SMB segment we explicitly deprioritized, and the SERP is saturated with
AI-generated vendor content `[W]`. Our ICP may be reachable only through POV distribution and
communities — which is slower and doesn't compound the same way.
*Falsifier:* keyword research in stage 3 finds no volume with commercial intent that maps to
the ICP.

---

## 10. Messaging framework

### Hierarchy

**Primary message** (the hook — leads because it's the angriest bucket in the research *and*
the thing our architecture uniquely solves):

> **Your form can't tell a buyer from a bot — and it's reporting both as conversions.**

**Supporting message 1 — provenance.** Every submission is stamped human, identified agent, or
suspected bot, because one form definition publishes both a human UI and a machine-callable
tool surface. The mechanism that lets legitimate agents through is the same one that flags the
fakes.

**Supporting message 2 — outcome-weighted optimization.** Every submission carries what
happened next. Variants rank on quality-adjusted conversion rate. **The form learns from the
outcome** — which variant, which question, which field. Nobody else does this.

**Supporting message 3 — your data is yours.** AGPL, self-hostable in one command, exports
never paywalled. Aimed at developers and at the specific resentment in `[V]` about vendors
gating exports and changing free tiers without warning.

**Proof order in a page:** felt pain → the dishonest dashboard → provenance → outcome grading →
what we're not.

### Vocabulary

**Say:** trash leads · garbage leads · junk leads · tire kickers · looky-loos · sales hated the
leads · flying blind after the lead form · the leads are all trash · they ghost off the bat ·
what happens after the submission · fails loudly when a sync breaks · those are not the same
quality of conversion · your dashboards will look amazing while pipeline quality tanks · a
survey from 2015 · just another submission box · per-response tax

**Never say:** qualified pipeline (nobody outside r/PPC says it) · lead velocity · synergy ·
frictionless · seamless · revolutionary · game-changing · AI-powered (in a headline) ·
"close the loop with your ad platform" (as a headline)

### Voice

The category is saturated with AI-generated comparison content from tiny vendors and, on
Reddit, with paid shills. **Sounding like an actual person with a point of view is itself
differentiating.** Contrarian without being smug. Specific over clever. We are allowed to be
blunt about the category's dishonesty because we have the receipts — and we are obligated to be
equally blunt about the three things we're bad at, or the bluntness reads as marketing.

---

## 11. Open questions

Not disagreements with the spine — gaps the spine doesn't resolve that downstream work needs
answered.

1. **Does the ICP need a sales-velocity qualifier?** Risk 4 suggests outcome-weighted learning
   only works where leads are dispositioned in days, not quarters. That would narrow Primary B
   from "B2B SMB and mid-market" to "B2B SMB and mid-market with a sub-two-week qualification
   cycle." Needs a call before copy is written.
2. **Is the ledger or the split test the v1 product?** Risk 2's mitigation implies the ledger
   ships first and the test turns on at volume. That changes the demo, and the demo is the
   launch asset. `[judgment call made above; flagging it because it has product consequences
   the spine doesn't cover.]`
3. **OTP/verification promoted to table stakes.** Objection 3 argues it belongs on the
   cannot-be-worse-at list. The spine's table-stakes list doesn't include it.
4. **Two unverified competitive claims block comparison content.** Does Typeform have real
   native split testing? Do Heyflow/ROASForm send value-weighted conversions or just lead
   events? `[W]` flags both as must-verify-before-writing. Neither is resolved.
5. **Google Ads API access for offline conversion push.** `[W]` calls this a real gate for a
   small product and recommends a two-hour spike. Not blocking — it's a feature, never the
   headline — but it shouldn't appear on a homepage until it's checked.
