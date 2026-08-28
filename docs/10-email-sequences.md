# Email sequences — Endpoint Forms

**Version:** v1 · **Date:** 2026-08-28 · **Closes:** issue #10

Inherits every decision in `00-positioning-spine.md`, the voice rules in `03-brand.md` §2–4,
and the vocabulary in `02-messaging.md` §7. Where this doc fills a gap the research didn't
cover, it is marked **[judgment call]**.

---

## 0. The constraint everything else follows from

**The product does not exist.** There is a waitlist and a repository. No beta, no trial, no
early access, no ship date. Every email below is written for that reality rather than around
it, because the alternative — implied progress, manufactured scarcity, a "coming soon" that
means nothing — is the exact behaviour that makes this category untrustworthy, and we are
positioned as the honest one.

The second constraint is strategic, from `04-keyword-research.md` §4. **Risk 9 has fired.**
The people with this problem do not search for it in commercial terms. `fake leads google ads`
returns 0 volume in Ahrefs, US and global. `junk leads` is 10/mo. The entire on-message
keyword universe is roughly 1,300/mo and most of it is people looking up what SPAM stands for.
The winnable volume — the `typeform alternative` cluster at KD 0 — is price-motivated, which
reaches the secondary ICP we were told not to design for.

So email and community are not supporting channels. They are two of the two channels we have.
That changes the standard: **every email has to be worth opening on its own merits, because
there is no compounding search asset carrying us in the meantime.**

The third constraint is the honest job of a pre-launch list. It is not to convert. It is that
**they still care in three months.** Every decision below optimizes for that and against
short-term list growth.

---

## 1. Subject-line principles for this brand

`03-brand.md` §3 sets the register for email: *"One idea per email. Written as one person to
one person. Subject lines are literal, not clever. No 'quick question.'"* These ten rules
implement it.

1. **Literal over clever.** The subject says what the email is. If the email is a colour
   decision, the subject says so. Curiosity gaps are a loan against trust and this list is
   built entirely on trust.
2. **Front-load the meaning into the first 4 words.** Mobile truncates around 35 characters.
   "I was wrong about the wedge" survives truncation. "Some thoughts on why we changed our
   mind about the wedge" does not.
3. **Numerals, always, including 1–9.** House rule from `03-brand.md` §4. "45 people
   complained about price" — not "forty-five." This is a product about numbers.
4. **Sentence case.** Never title case. Never ALL CAPS for emphasis.
5. **No emoji. No exclamation marks.** House rule: effectively never, one a quarter, and a
   subject line is not the place to spend it.
6. **Never ask a question the email doesn't answer.**
7. **Banned openers:** "Quick question," "Just checking in," "Re:" or "Fwd:" on a message
   that is neither, "[First name]?", "Don't miss out," "You're missing out," "Last chance,"
   "Only X spots left," "Big news," anything with a countdown in it.
8. **Blunt at the metric, the mechanism, or us. Never at the reader.** "Completion rate can't
   tell a buyer from a bot" is a subject line. "You're measuring the wrong thing" is an
   accusation.
9. **The two-year test.** If you'd be embarrassed to have it quoted back at you in 2028, cut
   it. This is the same rule `03-brand.md` §4 applies to the contrarian POV, and subject lines
   are where smugness leaks first.
10. **Never oversell the email.** A subject line that promises more than the body delivers is
    the same dishonesty we're selling against, at a smaller scale.

**Two alternates are provided for every email below.** They exist as options, not as an A/B
test — see §14 on why we can't run a subject-line open-rate test and don't want to.

---

## 2. Sending cadence

| Sequence | Emails | Window | Send days |
|---|---|---|---|
| Waitlist welcome | 5 | Day 0, 2, 5, 9, 14 | Any day for Day 0 (it's transactional); Tue–Thu for the rest |
| Nurture until launch | Ongoing, 8 written | Every 10–14 days | Tue–Thu, 9–11am recipient local |
| Launch | 3 | Day −7, Day 0, Day +7 | Tue or Wed for launch day |

**Hard ceiling: 3 emails in any 30-day window outside a launch.** State it in the first email
and hold to it. Our ICP is an agency owner running 5–25 client accounts (`01-positioning.md`
§2) whose inbox is already a hostile environment.

**Skip rather than fill.** If a nurture slot arrives and there's nothing real to say, send
nothing. A build log with nothing built is a newsletter about itself. The cadence serves the
reader; it does not serve a content calendar.

**Never send on the weekend, and never send twice in a week.** B2B, and the audience is
already getting five "9 Best Form Builders in 2026" newsletters they didn't ask for.

**Resends to non-openers are out** — partly because we don't track opens (§3), and partly
because the practice is a subject-line lottery dressed as a service. If an email was worth
sending twice, it was worth writing better once.

---

## 3. Unsubscribe philosophy

We're selling a product whose thesis is that **a metric which counts non-humans is a lie
you're paying for.** A subscriber list padded with people who don't read it is that same lie,
told about ourselves. So the list gets held to the standard the product argues for.

**Mechanics**

- Unsubscribe link in the footer at **body-text size and body-text contrast.** Not 8pt, not
  light grey, not hidden under three lines of address boilerplate.
- **One click.** No confirmation page, no "are you sure," no exit survey, no guilt copy, no
  animated sad face. It is done the moment they click it.
- A **genuine downgrade** offered beside it, not instead of it: *"Just tell me when it
  launches"* — one email at launch, then nothing. A preferences centre is never a substitute
  for an unsubscribe link; both are always present.
- **Referenced in the body, early, in the emails that warrant it.** Welcome email 1 and welcome
  email 4 both point at it in plain language. Telling someone to leave is the cheapest
  credibility available and this list can afford it.

**Pruning**

- **We prune annually.** Anyone with zero clicks and zero replies in 12 months gets one email
  saying exactly that, and then removal. The email says why, in one sentence, and does not
  beg.
- **We never re-add.** An unsubscribe is permanent. No "you were on a list from 2026," no
  re-import, no fresh-start campaign.
- **We never import a list we didn't earn.** GitHub stargazers are not subscribers. Conference
  badge scans are not subscribers. Anyone who filed an issue is not a subscriber. A repo star
  is not consent and treating it as one would be indefensible for a company built on the claim
  that we can tell who actually opted in.
- **We never rent, sell, or sponsor-swap the list.**

**No open-tracking pixel. [judgment call]**

This is the strongest available proof of the position and it costs us something real, which is
why it counts.

Apple Mail Privacy Protection pre-fetches images, which means our open rate cannot distinguish
a reader from a proxy — the *exact* failure we accuse completion rate of. Publishing an open
rate we know is inflated, in a company whose entire argument is that inflated engagement
numbers are the problem, is not a defensible position.

So: **no open pixel.** We track link clicks, because a click is an action a person took. We
disclose that on `/privacy` in one plain sentence. We prune on clicks and replies.

**What it costs us:** engagement-based segmentation, open-rate subject-line tests, and the
industry's most-quoted vanity metric. That is a genuine cost. It is worth paying because this
is the one place we can demonstrate the position on ourselves rather than argue it. **This is
also a decision that will be questioned by anyone who has run email before, and it should be
made deliberately rather than inherited from this doc.**

---

## 4. Segmentation

**Capture at signup: email. One field. Nothing else.**

`05-site-architecture.md` §10 already settled this and it's right: *"Email only. One field.
Anything more is indefensible for a product that sells 'every form element is a barrier.'"*

A waitlist that asks five questions is a waitlist people don't join. Worse, for this company,
it would be the exact behaviour `01-positioning.md` §8 says we refuse to sell — adding fields
to buy quality. We can't run that play on our own signup form and then criticise it in the
copy.

**What we capture anyway, at zero friction:**

| Signal | How | What it's worth |
|---|---|---|
| **Source page** — `/`, `/{pov-slug}`, `/open-source`, `/about` | Hidden field on the form, set server-side | The only segmentation that matters right now. Per `01-positioning.md` §8, **zero marketers in the entire research corpus asked for open source** — every such request came from developers. So `/open-source` and GitHub arrivals are a different audience from essay and homepage arrivals, and they should not get the same emails about CPL. |
| **Referrer** | Standard | Tells us which community post or thread worked, which is the POV play's only real metric (`04-keyword-research.md` §4: judge it on waitlist signups and inbound conversation, never on rankings). |
| **Signup date** | Standard | Cohort behaviour, and it gates who gets which nurture emails at launch. |

**What we capture later, by click and by reply:**

- **Welcome email 5** offers three links — agency / in-house / technical — one tag each. A
  click, not a form. Ignorable, and most will ignore it, which is fine.
- **Welcome email 2 and 5 both ask for a reply.** Unstructured replies are the highest-value
  data in this entire system at this stage, and structuring them prematurely would destroy
  what makes them useful.

**What we deliberately do not ask, ever, at signup:** role, company size, monthly ad spend,
number of client accounts, current form tool, "how did you hear about us." Every one is a real
conversion cost for data we can either get later or don't need.

**The discipline: if a segment doesn't change an email, don't build it.** Today exactly one
segment changes anything — technical-source subscribers skip the nurture emails pitched at
CPL and get the mechanism ones. That's the whole segmentation strategy and it should stay that
small until there's a product generating behaviour worth segmenting on.

---

## 5. Sequence 1 — Waitlist welcome

```
Sequence name:  Waitlist welcome
Trigger:        Waitlist form submission on /, /{pov-slug}, /open-source, or /about
Goal:           They still care in three months
Length:         5 emails
Timing:         Day 0, 2, 5, 9, 14
Exit:           Completion (rolls into Nurture) · unsubscribe · reply (flag for human follow-up)
```

**The strategy.** There is no product to activate them into, so the sequence does the only
three things available: it tells the truth about what exists, it hands over something useful
they can act on today, and it disqualifies hard enough that whoever stays actually wants to be
here. The research corpus is the asset — we know things about this category nobody has written
down — so we give it away rather than gate it.

---

### Email 1 — Confirm, and say what doesn't exist

**Send:** Immediately on signup.

**Subject:** You're on the list. There's nothing to log into yet.
**Alt A:** You're on the waitlist for Endpoint Forms
**Alt B:** No product, no ship date, no countdown

**Preview:** What exists, what doesn't, and roughly how often you'll hear from me.

**Body:**

> You're on the waitlist for Endpoint Forms. Two honest things before anything else.
>
> **There is no product.** No beta, no trial, no early-access link waiting in a queue. There's
> a repository, a pile of research, and an argument. If you were expecting a login, this is
> the part where you unsubscribe — the link's at the bottom and it works in one click.
>
> **I don't know the ship date**, so I'm not going to invent one.
>
> Here's what does exist.
>
> Every form builder reports completion rate. Nobody gets paid on completion rate. And
> completion rate has one fatal property: it can't tell you anything about the person who
> completed.
>
> That used to be a rounding error. Bad bots were 40% of internet traffic in 2025, up from
> 37%. Automated requests are now around 57.5% of HTML traffic. So the number every form
> builder optimizes, reports, and bills you by counts bots and buyers identically.
>
> Endpoint Forms is being built around two ideas. Every submission gets stamped with where it
> came from. And every submission eventually gets a verdict back from your CRM — won, lost,
> disqualified, and what it was worth.
>
> What you'll get from me, roughly every 10 days, and never more than 3 emails in a month:
>
> - Findings from the research. I read every complaint about form builders I could find on
>   Reddit, Capterra, G2, and HN, and counted how many independent people made each one. Most
>   of it has never been written down anywhere.
> - Decisions, with the reasoning — including the two I've already got wrong in public.
> - What I'm choosing not to build.
> - Eventually, a working product.
>
> No launch countdown. No spots remaining. If this turns into something you skim and delete,
> unsubscribe — I'd rather this list be small and read than large and ignored.
>
> If you want the whole argument now, it's here.
>
> — Corey

**CTA:** Read the argument → `/{pov-slug}`

**Job:** Confirm the signup, state the absence of a product before they discover it themselves,
and set a cadence with an exit attached — so the relationship starts on terms they chose.

---

### Email 2 — The verdict audit

**Send:** Day 2.

**Subject:** Run this on your last 100 submissions. It takes an afternoon.
**Alt A:** The audit that tells you what your form was actually worth
**Alt B:** You don't need our product to answer this question

**Preview:** Four columns in a spreadsheet. No tool required, including ours.

**Body:**

> The product doesn't exist, so here's the version you can do by hand this week.
>
> It answers the exact question Endpoint Forms is being built to answer automatically, and you
> can get most of the way there in an afternoon. Call it a verdict audit.
>
> **1. Export your last 100 form submissions.** Any tool, any form. Pick the one your paid
> traffic hits.
>
> **2. Add four columns: Origin, Verdict, Value, Variant.**
>
> **3. Origin.** For each row, mark whether a person plausibly filled this out. A company name
> that doesn't match the email domain. A misspelled version of a real domain — `itterable.com`
> is a real example from the research. Three submissions from one person 40 seconds apart.
> Submitted at 3am from a country you don't sell to. Mark those **suspect**. Everything else,
> **human**.
>
> **4. Verdict.** Go to your CRM, or your sales team, or the rep's notebook, and mark each row
> **won**, **lost**, **disqualified**, or **no answer yet**. Most will be "no answer yet."
> That's fine, and it's informative on its own.
>
> **5. Value.** Put a dollar figure on the won ones.
>
> **6. Variant.** If you ran more than one version of the form or the page, note which.
>
> Now you have three numbers instead of one.
>
> **Completion rate** — the number your tool reports.
> **Yield rate** — how many of those 100 reached a good verdict.
> **Yield value** — the revenue those 100 submissions produced.
>
> The gap between the first number and the other two is the entire reason this company exists.
> No tool in the category reports it, and I couldn't find anyone in the research doing it on
> purpose.
>
> Two things usually fall out.
>
> The first is the origin split, and it's normally worse than people expect. It's also sitting
> inside your conversion count right now. One person in the research gave up entirely:
> *"We ended up taking down the page after 600 submissions… We have recaptcha enabled, and I
> have a honeypot, but it didn't stop."* — u/robwalte, r/marketing, Jun 2024
>
> The second is the variant split, if you have one. A variant can win on fills and produce
> nothing. That's the demo I want to be able to show you eventually.
>
> If you run this, I'd like to see the three numbers. Just reply — it comes to me.
>
> — Corey

**CTA:** Reply with your three numbers. (No link. The reply is the conversion.)

**Job:** Hand over something genuinely useful that requires no product — and teach the core
mechanic by making them perform it manually, which is the education beat `02-messaging.md` §9
flags as the biggest open risk in the whole position.

**[judgment call]** Ship a Google Sheets template alongside this with the four columns and the
three formulas pre-built. It costs an hour and roughly doubles the number of people who
actually do it. Do not gate it behind a second email capture — they're already subscribers,
and gating it would be absurd.

---

### Email 3 — Everything you've already tried, and why it failed

**Send:** Day 5.

**Subject:** Every anti-spam defense you've tried, and the receipt for why it failed
**Alt A:** reCAPTCHA, honeypots, geo-blocking: the scoreboard
**Alt B:** Nobody has solved form spam. Here's the evidence.

**Preview:** Six defenses, and six practitioners describing exactly how each one broke.

**Body:**

> This one's worth having even if you never use anything I build.
>
> I went looking for what actually stops form spam. The answer, from people who do this for a
> living, is that nothing does — and the specific way each defense fails is worth knowing
> before you spend another week on it.
>
> **reCAPTCHA.** *"recaptcha v2 checkbox is pretty weak these days."* — u/muologys, r/webdev,
> Jan 2025. More concretely: *"Captcha can easily be bypassed. I had a small web scraping app
> and using a service such as 2captcha you could bypass captcha in like max 30 seconds using
> puppeteer and javascript."* — u/AndyAndrei63, r/webdev, Jan 2025
>
> **Honeypots and hidden fields.** *"I do have a hidden field on the form, and none of the bots
> filled it out. That's what led me believe initially that it was actual people."* —
> u/robwalte, r/marketing, Jun 2024. The reply he got: *"Hidden fields don't work any more."*
> — u/hymnzzy, r/marketing, Jun 2024
>
> **Geo-blocking at Cloudflare.** *"Geoblocking scripts on just the form are buggy."* —
> u/kjdscott, r/Entrepreneur, Sep 2025
>
> **Paid anti-spam APIs.** *"You can pay for OOP-Spam AI API to weed out Spam entries, but
> small businesses I work with do not have the budget for all these extra subscriptions."* —
> u/kjdscott, same thread
>
> **Renaming the endpoint.** *"I finally figured out that they were targeting the php file
> directly so i changed the name of the form and the spam stopped. I checked my logs and see
> they are now targeting the renamed php file."* — u/soupisgoode, r/webdev, Jan 2025
>
> **Cheap human labour.** *"To be honest even with captcha my site was loaded with spam, I am
> assuming there are spam farms where human labor is so cheap that they just do captchas all
> day long."* — u/Telion-Fondrad, r/webdev, Jan 2025
>
> Notice what all six have in common. They're attempts to block a bad submission at the door.
>
> Every one of them can succeed completely and you still can't answer the question your client
> asks on the next call: **which of these leads was worth money.**
>
> There's a second-order cost too, and it's the one that actually spirals: *"all those bot
> submissions were training Google's/your ad network's machine learning algorithm to send you
> more bot-like traffic."* — u/polygraph-net, r/marketing, Jul 2023
>
> I'm not going to tell you we've solved spam. Nobody has, and the people in those threads
> would spot the claim in a second. What I'll say is that the mechanism we're building asks a
> different question. CAPTCHA asks *"can you solve the puzzle"* — a $2 service answers that in
> 30 seconds. We ask software to identify itself, and give it a real reason to.
>
> More on how that works next time.
>
> — Corey

**CTA:** None. This email's job is credibility, not clicks.

**Job:** Prove the research is real and reframe the reader from "block it at the door" to "know
what you accepted" — which is the move the whole product depends on.

---

### Email 4 — Who this isn't for

**Send:** Day 9.

**Subject:** If your forms are working, use Tally
**Alt A:** Who Endpoint Forms is not for
**Alt B:** Four kinds of people should stop reading here

**Preview:** Disqualification is the cheapest trust I can buy, so here it is early.

**Body:**

> Most waitlists spend the first two weeks explaining why you should want the thing. Here's
> the other half of that.
>
> **If you need one form for an event RSVP or a contact page, use Tally.** It's free, it's
> genuinely good, and it's the most-praised product in every research thread I read. Unlimited
> forms, unlimited submissions, exports that aren't paywalled. One reviewer put the standard
> plainly: *"They don't paywall basic features like exports, which is where other tools get
> annoying."* — u/erickrealz, r/SaaS, Dec 2025. We will not be cheaper than Tally and I'm not
> going to write a page pretending otherwise.
>
> **If you're running surveys or research, we're the wrong shape.** The entire model assumes a
> submission has a commercial outcome. A research response doesn't. Typeform and Perspective
> are better at this and it isn't close.
>
> **If you need HIPAA or FedRAMP on day one, we don't have it and won't soon.** FormAssembly
> and Formstack exist for that, and they're not embarrassed about procurement the way we would
> be.
>
> **If nobody follows up on your form submissions, none of this helps.** The whole product
> depends on someone, eventually, knowing whether a lead was any good. If that person doesn't
> exist at your company, we'd be selling you a report with an empty column.
>
> Here's who it is for. You run paid acquisition. You get judged on what sales does with the
> leads. And you've had the conversation where cost per lead looked great and the sales team
> said the leads were garbage.
>
> Someone in the research described it exactly: *"Cost per lead is amazing. Under $15 per
> lead. Sales are struggling with the leads. Loads of people seem to sign up and leave their
> details but when sales try and phone them or message on WhatsApp nothing… They leave
> relevant enquiries but seem to ghost off the bat."* — u/AfraidGuarantee5858, r/PPC, Nov 2025
>
> If that's not you, unsubscribing now costs you nothing and costs me nothing. One click,
> bottom of the email, done immediately.
>
> — Corey

**CTA:** Secondary only — read the argument → `/{pov-slug}`. The unsubscribe link is the
honest primary and it's fine for it to be.

**Job:** Disqualify hard and early. Trades list size for list quality, and buys credibility in
a category where every vendor claims every buyer (`03-brand.md` §2.6).

---

### Email 5 — What would make this a bad idea

**Send:** Day 14.

**Subject:** What would have to be true for this to be a bad idea
**Alt A:** The three strongest arguments against what I'm building
**Alt B:** One question, three links, no form

**Preview:** The best case against this, plus one question that changes what I send you.

**Body:**

> Two weeks in, so here's the best case against this before someone else makes it.
>
> **1. "The form isn't what's broken — the landing page is."** The strongest objection, and
> it's partly right. If unqualified people are booking, the cheapest fix is putting a price or
> a range on the page. Do that first. It filters more than four extra form fields would.
>
> But it does nothing about bots that never read the page, nothing about agents acting for
> real buyers, and nothing about telling you whether the page fix actually worked. We're not
> the qualification layer. We're the measurement layer.
>
> **2. "Our lead volume is too low to learn anything."** Also right, and it's the hardest one.
> Below a few qualified leads a day, statistical significance on an outcome-weighted test is a
> fantasy: *"Optimizing for qualified leads might help but I imagine your qualified lead
> volume will be too low to feed the algo enough."* — u/dillwillhill, r/PPC
>
> So the report has to work at any volume even when automated variant-picking can't. If we
> ever show you a confident winner off 12 submissions, we've become the thing we're arguing
> against.
>
> **3. "Nobody thinks this is the form's problem."** This is the one that keeps me up. Across
> all the research, the junk-lead pain is real and loud — and people blame their analytics
> stack, or their ad platform, or their WordPress plugin. Almost nobody blames the form tool.
>
> Which means the argument needs an education beat before the value lands, and education is
> slow and expensive.
>
> That's the honest risk register. If you think I'm wrong about any of it, reply — those
> replies are worth more to me right now than signups are.
>
> And one question, because it changes what I send you. Which is closest?
>
> → **I run paid acquisition for clients**
> → **I run paid acquisition in-house**
> → **I'm here for the open-source and technical side**
>
> One click, no form, and you can ignore it.
>
> — Corey

**CTA:** Three tagged links (agency / in-house / technical), plus reply.

**Job:** Concede the strongest counter-arguments in public — and capture the only segmentation
worth having, with a click instead of a form field.

---

## 6. Sequence 2 — Nurture until launch

```
Sequence name:  Build in public
Trigger:        Completion of the waitlist welcome sequence (Day 14)
Goal:           They still care in three months, and they argue with us in public
Length:         8 written; ongoing thereafter
Timing:         Every 10-14 days, Tue-Thu. Skip the slot rather than fill it.
Exit:           Launch sequence begins · unsubscribe · downgrade to "launch only"
```

**The strategy.** Each email is a finding, a decision, or a mistake — never a status update.
The self-implicating trait does the heavy lifting: two of the eight are about things we got
wrong, and one is about what we're refusing to build. This is the only cadence that stays
interesting for a product that doesn't exist yet, and it doubles as the POV distribution the
keyword research says has to carry the ICP.

**Ordering note.** N2 and N3 (the two public wrongs) are deliberately early. Establishing that
we correct ourselves in writing, before we've asked for anything, is what makes the rest of
the list credible.

---

### N1 — The naming decisions

**Send:** Day 24 (10 days after welcome ends).

**Subject:** Hindsight, Handshake, Verdict, Origin, Yield
**Alt A:** Why the feature isn't called "Agent Mode"
**Alt B:** Five product names, and the rule that killed the rest

**Preview:** The naming standard, and the perfectly reasonable names it rejected.

**Body:**

> Naming is where a lot of good products quietly get worse, so here's mine in the open.
>
> The two things this product does had working titles: "outcome-weighted split testing" and
> "agent-native capture." Both accurate. Both terrible — unsayable in a sales call, unmemorable
> in a demo, unownable in a market.
>
> The standard I settled on: **one plain English word, a real noun the reader already knows,
> sayable out loud without explanation, no AI-era jargon, and slightly forensic in register.**
> The whole product is about finding out what really happened, so the vocabulary should sound
> like it.
>
> Five names came out of it.
>
> **Hindsight** — the split test. It names the mechanism honestly: the winner *cannot* be known
> at submit time and only becomes knowable later. Every other tool declares a winner before it
> could possibly know. We ship it as "Hindsight split tests," keeping the category noun so
> people can find it.
>
> Rejected: **Outcome Tests** (zero learning curve, and a competitor ships it the same week)
> and **Verdict Testing** (wastes the word "Verdict" on the wrong object).
>
> **Handshake** — the tool surface an agent submits against. One word carrying both halves of
> the mechanism: the agent identifies itself, and that identification *is* the filter. It also
> lets us describe an anti-fraud feature without the defensive arms-race tone every CAPTCHA
> vendor is stuck in.
>
> Rejected: **Front Door** (wonderful copy metaphor, bad UI label) and **Agent Mode** (every
> tool on earth ships one within a year, and it makes an architecture sound like a toggle).
>
> **Verdict** — what your CRM sends back. Won, lost, disqualified, awaiting verdict, plus a
> value. It earns the best empty state I've ever written: *"142 submissions awaiting verdict."*
>
> **Origin** — the provenance stamp on each submission. A dashboard column, three values.
>
> **Yield** — the quality-adjusted metric. It already means "quality-adjusted output" in
> finance and agriculture, so nobody has to be taught it. Sayable in a stand-up:
> *"Completion rate is 41%. Yield is 4%."*
>
> The test a name has to pass is whether a buyer repeats it back to you. I'll find out if
> these do.
>
> One thing I haven't done yet and should say out loud: **none of these have been
> trademark-screened.** That happens before they appear anywhere on the site, and if one of
> them turns out to be taken, you'll hear about the rename here first.
>
> — Corey

**CTA:** None, or reply with a better name.

**Job:** Show the reasoning behind decisions most companies present as fixed — and hand the
reader a reusable naming standard, which makes the email useful outside our context.

---

### N2 — The first thing I got wrong

**Send:** Day 36.

**Subject:** I was wrong about the wedge
**Alt A:** The feature I was going to lead with, and why I cut it
**Alt B:** Your offline conversion import teaches Google. It teaches your form nothing.

**Preview:** The best-sounding claim I had, killed by my own research.

**Body:**

> The original pitch for this product led with "close the loop with your ad platform." Send
> real outcomes back to Google and Meta, bid on revenue instead of fills.
>
> It sounded great. The research killed it, and it deserved to die.
>
> Here's what I found. Competent PPC people **already do this.** Offline conversion import,
> enhanced conversions, server-side CAPI — it's the first thing they recommend to each other
> in every thread. Claiming it as an innovation puts us against HubSpot, WhatConverts, and
> CallRail on their own ground, and anyone sophisticated enough to be our customer would roll
> their eyes at the pitch.
>
> The version they actually run is less glamorous and more instructive: *"If you are spending
> less than $5k month, uploading the offline conversions using Google sheets once a week works
> pretty well."* — u/Few_Presentation_820, r/PPC
>
> So I cut it as a headline. It may exist as a feature. It will never be the promise.
>
> But cutting it clarified the half that isn't claimed by anyone, and that half is better.
>
> **Your offline conversion import teaches Google. It teaches your form nothing.**
>
> The same outcome data that improves your bidding could tell you which variant, which
> question, and which field produced the revenue. I went looking specifically for anyone doing
> that. Across the entire research corpus — Reddit, review sites, HN — **zero instances.**
> Nobody feeds downstream outcomes back into form design. Not with a workaround, not manually,
> not badly.
>
> That's a strange and useful thing to find. An unclaimed idea in a category with several
> hundred products in it usually means it's a bad idea. Sometimes it means everyone's
> measuring the wrong end.
>
> I think it's the second one. I could be wrong about that too, and you'd hear about it here.
>
> — Corey

**CTA:** None.

**Job:** Model the self-implicating trait by killing our own best-sounding claim in public —
and land the real claim on the credibility that earns.

---

### N3 — The second thing I got wrong, and the worse answer underneath it

**Send:** Day 48.

**Subject:** I got the SEO call wrong, and the correct answer is worse
**Alt A:** A site with domain rating 30 is on page one for "typeform alternative"
**Alt B:** Why you're getting this email instead of finding us on Google

**Preview:** Keyword difficulty 0, and a finding that changes the whole plan.

**Body:**

> Second correction, and this one changed the strategy rather than just the copy.
>
> My research said the comparison SERPs in this category are saturated with AI-generated
> content from tiny form builders, and concluded that comparison pages would therefore be hard
> to win.
>
> Half right. The slop is real. But the conclusion doesn't follow from it, and the numbers say
> the opposite.
>
> I pulled the live SERP for `typeform alternative`. **formgrid.com ranks #6 with a domain
> rating of 42 and exactly 1 backlink to that page.** antforms.com is at #10 with domain rating
> 30. Ahrefs puts the keyword difficulty at **0**, and DataForSEO independently agrees at 0.
>
> A search result where a DR-30 site with no links holds page one is not a hard SERP. It's the
> definition of an easy one. Those thin vendors are ranking *because nothing better exists*,
> not because they built something you can't displace.
>
> So I was wrong, and I'd been about to skip a channel that's sitting wide open.
>
> Then the correction made things worse, which is the part actually worth your time.
>
> **The volume that's winnable reaches the wrong person.** Look at what carries it:
> `typeform free alternative`, `cheaper alternative to typeform`, `free jotform alternative`.
> That cluster is price-motivated, and price complainers are a different audience from outcome
> complainers. The research is blunt about the split: casual and SMB owners complain about
> price; professionals complain about outcomes.
>
> **And the on-message terms have no volume at all.** `fake leads google ads` — the most
> precisely on-message keyword I could construct — returns **0 searches in Ahrefs, US and
> global.** `junk leads` is 10 a month. The entire relevant universe is about 1,300 a month,
> and when I phrase-matched the whole space it was dominated by `junk removal leads`, ISO 9001
> lead auditor courses, and people looking up what SPAM stands for.
>
> The people with this problem do not search for it. They complain about it in communities, at
> length, angrily — and then they go back to work.
>
> Which means this list is not a nice-to-have. It's one of the two channels this company
> actually has. That's also why I'm not going to waste it on product updates nobody asked for.
>
> — Corey

**CTA:** None.

**Job:** Show the working on a strategic reversal, and tell subscribers honestly why they
matter — which is the most flattering thing you can tell someone without flattering them.

---

### N4 — Why "suspected bot" is amber and not red

**Send:** Day 60.

**Subject:** Why "suspected bot" is amber and not red
**Alt A:** The accessibility math that broke our colour system
**Alt B:** Three states, and why colour can't carry them

**Preview:** A small design decision that turned out to be the whole product argument.

**Body:**

> A small one this time, which turned out not to be small.
>
> Every submission in Endpoint Forms carries one of three states: **human**, **identified
> agent**, or **suspected bot**. Three states that have to be told apart instantly, which is
> the hardest problem in the interface.
>
> First decision: **suspected bot is amber, not red.**
>
> Red is reserved for things that actually failed — a broken CRM sync, a destructive action. A
> bot stamp is a *suspicion about a submission*, not an error. Colouring it red would make the
> product guilty of exactly the over-claiming I spend my time criticising. Amber says "look at
> this," which is the correct instruction.
>
> Same reason the word is "suspected." We report what we know, not what we assume.
>
> Second decision, and this is the one I got wrong first: **colour cannot carry three states.**
>
> Here's the arithmetic. For a colour to be readable as text on our light background, it has
> to sit below a certain luminance. All three states therefore live inside a narrow band, and
> that caps how far apart they can be in greyscale. Their contrast *with each other*:
>
> - human ↔ suspected bot: **1.26:1**
> - human ↔ identified agent: **1.77:1**
> - suspected bot ↔ identified agent: **1.40:1**
>
> Those are as far apart as the constraint allows, and they are nowhere near enough to
> distinguish by lightness alone. Under deuteranopia and protanopia — the common forms, roughly
> 1 in 12 men — the teal and the violet converge toward similar blues.
>
> So the rule is: **every provenance indicator carries three channels, in this order of
> importance — shape, label, colour.** Circle, diamond, triangle. Unambiguous at 11px in
> greyscale, on a monochrome printout, and to every form of colour vision. The full words are
> always present, never abbreviated, never tooltip-only.
>
> A provenance chip that ships as a bare coloured dot is a bug, not a style choice.
>
> Which is the same argument as everything else here, applied to a design token: **a signal you
> can't verify isn't a signal.** It just looks like one, and looking like one is the problem.
>
> — Corey

**CTA:** None.

**Job:** Demonstrate craft, and show the brand's central principle operating at the smallest
possible scale — which is more persuasive than asserting it at the largest.

---

### N5 — The list of things we're not building

**Send:** Day 72.

**Subject:** The list of things we're not building
**Alt A:** Seven decisions to build nothing
**Alt B:** What's deliberately missing, and why

**Preview:** Every lane we're conceding, named, with who owns it.

**Body:**

> A product is mostly defined by what it refuses to do, and refusing things quietly is how you
> end up doing all of them badly. So here's the list.
>
> **Not the cheapest.** Tally owns it — unlimited free forms and responses, exports never
> paywalled, and roughly $4–5M in revenue on 34 people. We'll have a generous free tier because
> it's table stakes. We will never be the price answer.
>
> **Not the prettiest.** Typeform owns it, and that reputation survives near-universal hatred
> of its pricing. We need to be good enough to put in front of a client without a Fiverr CSS
> job. We don't need a design award.
>
> **Not the most features.** Jotform owns it — 35 million users, 20,000+ templates, payments,
> PDFs, calculations. Breadth is a ten-year war and we'd lose it.
>
> **Not "AI-powered."** That lane is crowded, thin, and low-trust, and it's where the
> astroturfing lives. We'll use models where they're the right tool and we won't put it in a
> headline.
>
> **Not a qualification tool.** We will not sell you "add fields to filter people out." The
> strongest skeptics in my research are right that friction is usually a messaging failure, and
> the entire point is to get you the same information *after* the fact, from your CRM, instead
> of from the visitor's patience.
>
> **Not the ad-platform loop as a headline.** Covered in an earlier email. It may be a feature.
> It is never the promise.
>
> **Not open-source-first as a marketing message.** This one surprised me. **Zero marketers in
> the entire research corpus asked for open source or self-hosting.** Every single such request
> came from developers, r/selfhosted, or r/opensource. So the AGPL license is real and
> permanent, and it is a trust and no-lock-in asset — *your data is yours and we can't take it
> away* — not a demand driver. Pretending otherwise would be marketing to myself.
>
> And on the site itself, four things a funded company would have built by now:
>
> **No pricing page**, because there's no price, and inventing tiers you later retract is a
> documented reason people leave a vendor. **No blog**, because one post is an abandoned blog.
> **No features section**, because describing software nobody can run is vaporware. **No
> comparison pages**, because a comparison page for a product that doesn't ship yet is an
> unfalsifiable claim — which is precisely what the thin vendors on that SERP are doing, and
> the reason I can tell you not to trust them.
>
> — Corey

**CTA:** None.

**Job:** Sharpen the position by subtraction, pre-empt "why doesn't it do X," and demonstrate
that we apply our own standard to our own marketing site.

---

### N6 — The biggest complaint in this category isn't the one I'm solving

**Send:** Day 84.

**Subject:** 45 people complained about price. 22 complained about spam.
**Alt A:** The biggest complaint in this category isn't the one I'm solving
**Alt B:** Why there's no per-response tax

**Preview:** The complaint rankings, and the one I'm deliberately ignoring.

**Body:**

> I counted. Here's what people actually complain about in this category, ranked by how many
> *independent* people said it — distinct threads and distinct reviewers, not raw mentions.
>
> **1. Response caps and paywalled basics — around 45 sources.** By a distance the most
> universal complaint, and the language is remarkably consistent across every product:
> "expensive fast," "hit the paywall quickly," "their free tier is basically a demo," "paying
> for features I didn't need."
>
> **2. Spam and junk submissions — around 22 sources.** Fewer people, but by far the angriest.
> Multiple people reporting hundreds of fake submissions in a night.
>
> **3. Conditional logic breaking past about 5 conditions — around 12 sources.** The #1
> *functional* complaint in the category, and nobody claims it.
>
> **4. "The form isn't the problem, what happens after is" — around 11 sources.** Routing, CRM
> sync, partial data. Multiple people arriving at that exact phrasing independently.
>
> I am not solving #1. Tally already did, and I'm not going to win a price war against
> unlimited free.
>
> But there's a version of the pricing complaint that isn't about price at all, and it's the
> bridge between #1 and #2. It came from an agency developer:
>
> *"If we stay on the current trajectory, websites will have to remove contact forms in the
> next few years due to the sheer volume of spam bot submissions. **If your form software has
> a submission limit, bots are using it before real people even get a chance.**"*
> — u/kjdscott, r/Entrepreneur, Sep 2025
>
> Charging by the submission in a year when most requests to the web are automated isn't
> expensive. It's **incoherent.** You're paying a meter that bots run up on your behalf, and
> then paying again in sales time.
>
> That's a position, not a discount. It's also the only thing I have to say about pricing, and
> I'd rather say one true thing than run a comparison table.
>
> One more, quietly: **#3 is the one I'm most focused on** and it's not glamorous at all. It's
> the #1 functional complaint in the category and literally nobody has claimed it. *"The
> conditional logic is always the biggest headache — it never works right for anything beyond
> super simple forms."* — u/devhisaria, r/nocode, Oct 2025. Somebody else's version of the same
> complaint ended with: *"Budget is flexible, just needs to work."*
>
> Price was never the trigger. It never is.
>
> — Corey

**CTA:** None.

**Job:** Handle the pricing objection before it arrives, and reframe from "cheap" to
"coherent" — a position we can hold, versus one Tally already owns.

---

### N7 — The number we refuse to fake

**Send:** Day 96.

**Subject:** We won't show you a winner we can't prove
**Alt A:** "Not enough verdicts yet to call a winner"
**Alt B:** The UI string I'm most sure about

**Preview:** The hardest objection to this product, and the error message it produced.

**Body:**

> The hardest objection to this entire product is a volume problem, and it's correct.
>
> Below a few qualified leads a day, statistical significance on an outcome-weighted test is
> fiction. You cannot rank two variants by revenue when one of them has produced 3 deals and
> the other has produced 1. Someone put it plainly in r/PPC: *"Optimizing for qualified leads
> might help but I imagine your qualified lead volume will be too low to feed the algo
> enough."* — u/dillwillhill
>
> Every optimization tool in the world handles this the same way: it shows you a confident
> winner anyway, with a percentage next to it.
>
> So one of the first strings I wrote for this product is an error message.
>
> > **Not enough verdicts yet to call a winner. We'll say so until there are.**
>
> And its sibling, the empty state:
>
> > **142 submissions awaiting verdict.**
>
> "Awaiting verdict" is a first-class state, not an edge case, because most submissions will
> sit in it for a long time and some will sit in it forever. Most CRMs are a mess. *"The
> biggest thing is making sure your CRM mapping is clean before you let AI loose on it — if the
> fields are messy it will just make a bigger mess."* — u/Ok-Transition5401
>
> We design for messy, not for ideal. Partial verdicts still beat completion rate, because
> completion rate contains no information about outcome at all.
>
> A tool that refuses to tell you something it can't know is the entire product in one
> sentence. If we ever ship a confident winner off 12 submissions, hold this email up.
>
> — Corey

**CTA:** None.

**Job:** Convert the hardest objection into a proof point, and demonstrate product judgment
before there's a product to judge.

---

### N8 — Build log [recurring template]

**Send:** Whenever there is something real. Roughly every 6 weeks once code exists.

**Subject:** Build log — [month]
**Alt A:** [month]: what shipped, what broke, what's late
**Alt B:** [the single most interesting thing that happened], stated plainly

**Preview:** What actually happened, including the parts that didn't work.

**Body template:**

> **Shipped.** [What works now. Concrete. If someone could use it, say how.]
>
> **Broke, or got cut.** [Non-optional section. Something always does. This is the section
> that makes the email worth opening.]
>
> **Late.** [What slipped, and by how much. No new date unless it's a real one.]
>
> **One number.** [A real measurement from the work. Never an estimate dressed as a result.]
>
> **Next.** [The one thing, not the roadmap.]
>
> **An open question.** [Something genuinely undecided, where a reply would change the answer.
> Ask it properly or leave it out.]
>
> — Corey

**Job:** Keep the cadence honest once there's code, without the email becoming a changelog
nobody reads.

**Rule: if a month has nothing real in it, skip the email.** A build log with nothing built is
a newsletter about itself, and there are already enough of those.

---

## 7. Sequence 3 — Launch

```
Sequence name:  Launch
Trigger:        Manual, on a confirmed ship date
Goal:           One form pointed at us. Not a migration.
Length:         3 emails
Timing:         Day -7, Day 0, Day +7
Exit:           Signup · unsubscribe
```

**The strategy.** There is no discount, no expiring bonus, and no founding-member tier that
disappears at midnight — because we spent three months telling this list we don't do that, and
one countdown timer would retroactively cost us all of it. The urgency has to come from the
product being worth using, which is the only kind that survives.

**The ask is deliberately tiny.** Not "switch." Not "migrate." Point one form at us — the one
your paid traffic hits — and leave everything else where it is. Inertia is the real competitor
(*"I still use Jotform since it's been reliable for me… I built my workflow around them"* —
u/stevenbellomy, r/nocode, Apr 2026) and arguing with inertia loses.

---

### L1 — Pre-launch heads-up

**Send:** 7 days before launch.

**Subject:** Endpoint Forms opens in 7 days. Here's what it does and doesn't do.
**Alt A:** What ships next [day], and what doesn't
**Alt B:** 7 days out: the honest feature list

**Preview:** The full list, including the missing parts, so launch day can be short.

**Body:**

> Endpoint Forms opens on [date]. Here's everything, including the parts that aren't finished,
> so that nothing on launch day is a surprise.
>
> **What works on day one**
>
> [Slot: the actual working capability list. Every line must be demonstrable on video, per the
> proof standard in `02-messaging.md`. No aspirational entries.]
>
> **What doesn't work on day one**
>
> [Slot: named specifically, not softened. If one-command self-host isn't ready, say so here.
> If there are 3 native integrations and not 30, say which 3. This section is longer than
> people expect and that is the point — it's the section that makes the other one believable.]
>
> **What it costs**
>
> [Slot: the actual numbers. Plus the two permanent commitments: a free tier that isn't a demo,
> and exports that are never paywalled. Say both in the terms, not just in the email.]
>
> **The license**
>
> AGPL-3.0. The core is open and self-hostable. Your data is yours and we can't take it away —
> which is a commitment, not a feature, and I've said before it isn't the reason to use this.
>
> **What I'm not doing**
>
> No countdown. No founding-member price that expires. No bonus that disappears at midnight.
> If it's a good product on Tuesday it'll still be a good product on Thursday, and if it isn't,
> a discount wouldn't have fixed that.
>
> One ask, now rather than later: **if something in the "doesn't work yet" list is a dealbreaker
> for you, reply and tell me.** Better I know a week before than a month after.
>
> — Corey

**CTA:** Reply if something's missing. No signup link — there's nothing to sign up for yet, and
a dead link on the pre-launch email would be a bad first impression of a product about honest
reporting.

**Job:** Eliminate every possible surprise before launch day, so the launch email can be three
paragraphs long.

---

### L2 — Launch day

**Send:** Day 0, Tuesday or Wednesday morning.

**Subject:** It's live
**Alt A:** Endpoint Forms is live
**Alt B:** Point one form at us — the one your paid traffic hits

**Preview:** Don't migrate anything. Point one form at it and see what comes back.

**Body:**

> Endpoint Forms is live: [url]
>
> **Don't migrate anything.** Point one form at us — the one your paid traffic hits — and leave
> the rest of your stack exactly where it is. If it doesn't tell you something your current
> tools can't, you've lost a Tuesday afternoon.
>
> What you'll see, in the order you'll see it:
>
> **Every submission carries an Origin** — human, identified agent, or suspected bot. Not
> guessed from mouse movement. Known, because the form publishes a real tool surface for
> legitimate agents, so anything stuffing the human form while pretending to be software has
> told on itself.
>
> **Every submission gets a Verdict** — won, lost, disqualified, or awaiting verdict, plus a
> value. From a CRM sync or a one-line webhook fired from wherever the truth actually lives.
> Most will say "awaiting verdict" for a while. That's the honest state and we made it a
> first-class one.
>
> **Your split tests rank on Yield instead of fills.** A variant that converts better and
> produces nothing loses, which is the correct answer and the one no tool in this category can
> currently give you.
>
> **What's already broken:** [Slot — there will be something within the first hours. Naming it
> yourself on day one is worth more than a clean launch post, and this list has been told for
> three months that we'd do exactly this.]
>
> If you'd rather read the whole argument before touching anything, it's still here:
> [the argument →]
>
> — Corey

**CTA:** Start with one form → [url]

**Job:** Convert on the smallest possible commitment, and make the day-one failure disclosure a
feature of the launch rather than a risk to it.

---

### L3 — Last call, honestly

**Send:** Day +7.

**Subject:** Last email about the launch
**Alt A:** Week one: what broke
**Alt B:** Closing this out

**Preview:** What the first week actually looked like, and then I'll stop.

**Body:**

> This is the last email about the launch. Nothing expires, there's no deadline, and I'm not
> going to invent one — so instead, here's what the first week actually looked like.
>
> **The numbers.** [Slot: real ones, including the unflattering ones. Signups, forms created,
> and — if the sample is large enough to mean anything — the Origin split across submissions
> that came through. If it isn't large enough, say so and give the number anyway with that
> caveat. This is the email where the whole "we don't fake significance" position gets tested
> in public.]
>
> **What broke.** [Slot. Specific. What it affected, what we did, whether it's fixed.]
>
> **What people asked for most.** [Slot: the top 2 or 3 requests, and honestly which of them
> we're going to do.]
>
> **What surprised me.** [Slot: one genuine thing. If nothing surprised you, cut the section
> rather than manufacture one.]
>
> If you want to try it, it's here: [url]. Start with one form.
>
> If you don't, that's a real answer and I'd rather have it than a maybe. The unsubscribe link
> still works in one click, and there's no hard feeling attached to it.
>
> And if you did try it and it wasn't good — **reply and tell me why.** That reply is worth
> more to me than the signup was.
>
> — Corey

**CTA:** Start with one form → [url]. Secondary: reply with what went wrong.

**Job:** Close the sequence without manufactured scarcity, publish week-one reality including
the failures, and convert a non-buyer into a source of information instead of a dead address.

---

## 8. What we will never send

Each of these would be individually survivable. Together they're the category's house style,
and the whole position is that we're not that.

**Manufactured urgency**
- Countdown timers, "X spots remaining," "price goes up at midnight," expiring founder tiers.
- A launch date we're not certain of. Slipping a date we announced costs more than never
  announcing one.
- "Last chance" on anything that isn't literally last. We say "last email about X" instead,
  which is true.

**Invented evidence**
- A statistic without a source we can name.
- A case study, testimonial, or logo wall. There are no customers. There will be nothing here
  until there are, and then it will be attributed.
- The 41% figure presented as something we measured. It is illustrative — *"a variant that
  converts 41% better can produce zero deals"* — and it stays framed that way until a real
  split test with real verdicts exists (`02-messaging.md` §9).
- The two widely-repeated Typeform figures (the "free tier cut to 10 responses" claim and the
  "$199 CAPTCHA" claim). Both are contradicted by Typeform's live pricing and citing either
  would hand a sophisticated reader a reason to distrust everything else. **Hard spine
  constraint.**

**Fake intimacy**
- "Quick question," "just circling back," "did you see my last email," a fake `Re:` prefix.
- A plain-text email designed to look like a personal message that is obviously a broadcast.
  Ours are broadcasts written by one person; that's different and it should read as different.
- Guilt-framed unsubscribe copy of any kind.
- A first name in the subject line as a pattern-interrupt.

**Category fog** (`03-brand.md` §4, tier 3)
- seamless, frictionless, effortless, revolutionary, game-changing, next-generation,
  reimagined, AI-powered, best-in-class, robust, cutting-edge, delightful, unlock, empower,
  supercharge, leverage as a verb.
- "qualified pipeline," "lead velocity," "pipeline influence." Our reader says "junk leads."
- "The last form builder you'll ever need."
- "Close the loop with your ad platform" as a promise. Feature line only, never a headline.

**Overclaiming about the product**
- "Bot-proof," "CAPTCHA-killer," "100% spam-free." Nobody has solved spam and every person on
  this list knows it.
- "Bot" as a submission label. It's **suspected bot**, and the qualifier is load-bearing.
- Any claim about agent traffic volume. WebMCP was announced at Google I/O 2026 and shipped an
  early preview in Chrome Canary in Feb 2026 — we cite the actual maturity and let people draw
  their own conclusion.

**Attacking people**
- A competitor called bad by name. We criticise a category-wide pattern and let the reader
  assign it (`03-brand.md` §4).
- Anything blunt aimed at the reader rather than at a metric, a mechanism, or us.

**List behaviour**
- Emails to anyone who didn't sign up: bought lists, badge scans, GitHub stargazers, issue
  filers, people who emailed us once about something else.
- Re-adding an unsubscriber, for any reason, ever.
- Renting, selling, or sponsor-swapping the list.
- Resending to non-openers with a fresh subject line.
- An open-tracking pixel (§3).

---

## 9. Metrics

We can't measure opens by choice (§3), which removes the industry's favourite number and
forces the honest ones.

| Metric | Why it's the one | Target |
|---|---|---|
| **Reply rate** | The real signal on a pre-launch list. Welcome emails 2 and 5 both ask for one. A reply is a person; nothing else in email is. | No benchmark exists for this. Measure against ourselves and publish it in a build log. |
| **Click rate per email** | A click is an action a person took. It's the only engagement number here that isn't inferred. | Same. |
| **Unsubscribe rate per email** | Expected to spike on welcome email 4 (the disqualification email) — **and that spike is the email working, not failing.** A high unsubscribe on E4 and a low one everywhere else is exactly the shape we want. | Judge E4 by what happens to click and reply rates *after* it, not by the unsubscribe on it. |
| **Signups by source page** | The only segmentation we have, and the POV play's only real metric — the keyword research says judge community distribution on waitlist signups and inbound conversation, never on rankings. | Track per community post. |
| **Three-month retention of attention** | The actual goal. Proxy: click or reply rate on nurture emails sent 90+ days after signup, compared to the same cohort's first month. | If it's collapsing, the cadence or the content is wrong. Cut frequency before cutting quality. |
| **Waitlist → signup, at launch** | The only conversion number in the whole system. | Measured once, published in L3 whatever it says. |

---

## 10. Open questions and conflicts to settle before any of this ships

1. **Terminology conflict — must be settled before L2.** `00-positioning-spine.md`,
   `README.md`, and `03-brand.md` §4 all specify the three Origin states as **human /
   identified agent / suspected bot**. `02-messaging.md` §2 specifies **Human / Agent /
   Unverified** and explicitly forbids "bot" as a submission label. These are incompatible and
   both appear in shipped copy. **This doc follows the spine** (human / identified agent /
   suspected bot) on the rule that the spine wins, but the messaging doc's reasoning about
   "Unverified" is good and deserves adjudication rather than a default. N4 and L2 both depend
   on the answer. **[judgment call]**
2. **Feature names are unscreened.** Verdict, Origin, Yield, Hindsight, Handshake need USPTO
   and domain screening before N1 goes out — N1 is the email that puts all five in a subject
   line. Carried forward from `02-messaging.md` §9.
3. **The essay slug is undecided** (`05-site-architecture.md` §10, `[NEEDS KEYWORD VALIDATION
   #1]`). Welcome emails 1 and 4 both link to it. Given that `04-keyword-research.md` confirms
   Risk 9 fired, the slug is probably argument-bearing rather than keyword-bearing — but that's
   not this doc's call.
4. **From-name and sign-off.** Written throughout as one person to one person, signed
   "— Corey," per `05-site-architecture.md` §10's reasoning that a named human is a
   differentiator in an astroturfed category. From-name should probably be a person, not
   "Endpoint Forms." **[judgment call]**
5. **The no-open-pixel decision (§3)** is the most contestable thing in this document. It's the
   right call for this brand and it has a real cost. Make it deliberately.
6. **ESP not chosen.** Nothing here has been created in any email tool. This is copy in a
   markdown file, and publishing it is a separate decision.
7. **Slot-filled emails.** L1, L2, L3, and N8 contain `[Slot: …]` markers that can only be
   filled by facts that don't exist yet. They are structurally complete and factually empty on
   purpose — writing speculative feature lists for an unbuilt product is the exact thing §8
   forbids.
