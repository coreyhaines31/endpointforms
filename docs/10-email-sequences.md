# Email sequences — Endpoint Forms

**Version:** v2 · **Date:** 2026-08-28 · **Closes:** issue #10
**v1 written 2026-08-28 · reworked the same day, before anything shipped.**

## Why this doc was reworked

v1 was written against a headline that no longer exists: *"your form can't tell a buyer from a
bot — and it's reporting both as conversions."* Corey's call, recorded in
`00-positioning-spine.md` under *Primary message — reset 2026-08-28*: that line was leading with
a narrow wedge and pulling every page into a competitor argument the buyer hadn't asked to have.
The loudest complaints in the research corpus are price, spam, broken conditional logic and
unreliable integrations — not measurement philosophy.

The headline is now:

> **An open-source form builder for website forms, built for marketers who want high-converting
> forms that pipe data wherever they need it.**

Four other things changed under this doc between v1 and v2:

1. **Handshake is now Manifest.** `12-trademark-screening.md` found three live registrants
   including a $3.5B careers platform. Lowercase "handshake" survives as a verb only.
2. **The Origin states are settled: Human · Agent · Unverified.** v1 §10.1 flagged the
   spine/messaging conflict as unresolved and followed the spine's older wording. It is resolved
   now, in favour of `02-messaging.md`: we report what we know, not what we assume.
3. **A competitive claim was retired as false.** `13-competitive-verification.md`: Heyflow *does*
   send value-weighted conversions. "Competitors send a lead, not a lead worth $X" is wrong and
   must never appear. The surviving distinction is that Heyflow's value is a submit-time guess
   from the lead's own answers, never revised by the outcome.
4. **The site now exists** — roughly 63 pages, including 8 working calculators, 12 anti-spam
   teardowns, and 25 glossary terms. v1 was written for a site that was a waitlist and an essay.
   Several of these are better CTAs than a bare waitlist link.

**What survived unchanged:** the build-in-public frame, the honesty constraints, the
"what we will never send" list, the subject-line principles, the verdict audit, and both
wrong-calls emails. Those were right and the reset didn't touch them.

**What changed:** every email whose spine was *the metric is a lie* got re-pointed at the three
pillars. The metric argument still exists. It lives at `/the-dishonest-dashboard` and gets
**linked**, not restated in every email.

Inherits every decision in `00-positioning-spine.md`, the voice rules in `03-brand.md` §2–4,
and the vocabulary in `02-messaging.md` §7. Where this doc fills a gap the research didn't
cover, it is marked **[judgment call]**.

---


> **Check resolved 2026-08-28.** The N5 email describes the false Heyflow claim as having been
> in draft copy but never published. Verified against the full git history of the repo: the
> phrase never appeared in `src/` or `README.md` in any commit, and no competitor has ever been
> named in shipped copy. **"Nearly" is accurate and the email is safe to send as written.** If
> that ever changes, this note is the thing to re-check.


## 0. The constraints everything else follows from

**The product does not exist.** There is a waitlist, a repository, and a marketing site. No
beta, no trial, no early access, no ship date. Every email below is written for that reality
rather than around it, because the alternative — implied progress, manufactured scarcity, a
"coming soon" that means nothing — is the exact behaviour that makes this category
untrustworthy, and we are positioned as the honest one.

**The search channel is thin, and that hasn't changed.** From `04-keyword-research.md` §4:
`fake leads google ads` returns 0 volume in Ahrefs, US and global. `junk leads` is 10/mo. The
on-message keyword universe is roughly 1,300/mo and most of it is people looking up what SPAM
stands for. The winnable volume — the `typeform alternative` cluster at KD 0 — is
price-motivated, which reaches the secondary ICP we were told not to design for.

**What is new since v1:** we now have a link-earning asset set that doesn't depend on ranking.
8 calculators at `/tools`, 12 anti-spam teardowns at `/spam`, 25 glossary terms. The rule that
tier shipped under (`05-site-architecture.md` Tier 0.5) is *a page ships only if it is useful
when it does not rank* — and that rule makes them email assets as much as SEO assets. **A
working calculator is the thing you drop into a reply.** It is also the thing you can send a
pre-launch list without pretending you have a product.

So email is no longer one of only two channels. It is still the channel where the argument
gets made in full, and the standard holds: **every email has to be worth opening on its own
merits.**

**The honest job of a pre-launch list** is not to convert. It is that **they still care in
three months.** Every decision below optimizes for that and against short-term list growth.

---

## 1. Subject-line principles for this brand

`03-brand.md` §3 sets the register for email: *"One idea per email. Written as one person to
one person. Subject lines are literal, not clever. No 'quick question.'"* These ten rules
implement it. **Unchanged from v1** — the reset didn't touch them.

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
8. **Blunt at the metric, the mechanism, or us. Never at the reader.** "Every anti-spam
   defense you've tried, and why it failed" is a subject line. "You're measuring the wrong
   thing" is an accusation.
9. **The two-year test.** If you'd be embarrassed to have it quoted back at you in 2028, cut
   it. This is the same rule `03-brand.md` §4 applies to the contrarian POV, and subject lines
   are where smugness leaks first.
10. **Never oversell the email.** A subject line that promises more than the body delivers is
    the same dishonesty we're selling against, at a smaller scale.

**Two alternates are provided for every email below.** They exist as options, not as an A/B
test — see §10 on why we can't run a subject-line open-rate test and don't want to.

---

## 2. Sending cadence

| Sequence | Emails | Window | Send days |
|---|---|---|---|
| Waitlist welcome | 5 | Day 0, 2, 5, 9, 14 | Any day for Day 0 (it's transactional); Tue–Thu for the rest |
| Build in public | Ongoing, 11 written | Every 10–14 days | Tue–Thu, 9–11am recipient local |
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

Pillar 2 is *your data goes wherever you need it — and says so when it doesn't.* The product
requirement hiding inside it is **fail loudly**: a sync that breaks silently is the same sin we
accuse the category of. A subscriber list padded with people who don't read it is a silent
failure we're reporting as a number. So the list gets held to the standard the product argues
for.

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
  is not consent, and the calculators at `/tools` do not capture an email — anyone who used one
  and didn't join is not a subscriber either.
- **We never rent, sell, or sponsor-swap the list.**

**No open-tracking pixel. [judgment call]**

This is the strongest available proof of the position and it costs us something real, which is
why it counts.

Apple Mail Privacy Protection pre-fetches images, which means our open rate cannot distinguish
a reader from a proxy. Publishing an open rate we know is inflated, in a company whose whole
argument is that a number you can't verify isn't a number, is not a defensible position.

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
| **Source page** — `/`, `/the-dishonest-dashboard`, `/tools/{slug}`, `/spam/{method}`, `/solutions/{icp}`, `/open-source`, `/about` | Hidden field on the form, set server-side | The only segmentation that matters right now, and the new page set made it sharper. A `/tools/form-spam-cost-calculator` arrival has a spam problem. A `/solutions/agencies` arrival is our primary ICP. A `/open-source` or GitHub arrival is a different audience entirely — per `01-positioning.md` §8, **zero marketers in the research corpus asked for open source**; every such request came from developers. They should not get the same emails about CPL. |
| **Referrer** | Standard | Tells us which community post or thread worked, which is the POV play's only real metric (`04-keyword-research.md` §4: judge it on waitlist signups and inbound conversation, never on rankings). |
| **Signup date** | Standard | Cohort behaviour, and it gates who gets which nurture emails at launch. |

**What we capture later, by click and by reply:**

- **Welcome email 5** offers three links — agency / in-house / technical — one tag each. A
  click, not a form. Ignorable, and most will ignore it, which is fine.
- **Welcome email 2 and 5 both ask for a reply.** Unstructured replies are the highest-value
  data in this entire system at this stage, and structuring them prematurely would destroy
  what makes them useful.
- **Calculator clicks out of N2.** Which of the 8 someone opens is a free read on what they
  think their problem is. Worth logging, not yet worth acting on.

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
Trigger:        Waitlist form submission on any page
Goal:           They still care in three months
Length:         5 emails
Timing:         Day 0, 2, 5, 9, 14
Exit:           Completion (rolls into Build in public) · unsubscribe · reply (flag for human)
```

**The strategy.** There is no product to activate them into, so the sequence does the only
four things available: it says plainly what this is, it tells the truth about what doesn't
exist, it hands over things they can use today, and it disqualifies hard enough that whoever
stays actually wants to be here. The research corpus and the tool set are the assets — we know
things about this category nobody has written down, and we built 8 calculators that work with
no product — so we give them away rather than gate them.

**What changed in v2.** W1 no longer opens with the metric argument; it opens with what the
product is and links the argument. W2 and W3 now point at `/tools` and `/spam`, which didn't
exist when v1 was written. W4 and W5 are essentially unchanged.

---

### W1 — Confirm, and say what doesn't exist

**Send:** Immediately on signup.

**Subject:** You're on the list. There's nothing to log into yet.
**Alt A:** You're on the waitlist for Endpoint Forms
**Alt B:** No product, no ship date, no countdown

**Preview:** What this is, what doesn't exist yet, and how often you'll hear from me.

**Body:**

> You're on the waitlist for Endpoint Forms. Two honest things before anything else.
>
> **There is no product.** No beta, no trial, no early-access link waiting in a queue. There's
> a repository, a pile of research, a site, and an argument. If you were expecting a login,
> this is the part where you unsubscribe — the link's at the bottom and it works in one click.
>
> **I don't know the ship date**, so I'm not going to invent one.
>
> Here's what it is, in one sentence.
>
> **An open-source form builder for website forms, built for marketers who want
> high-converting forms that pipe their data wherever they need it.**
>
> Three things it's being built around.
>
> **1. Built to convert, not to survey.** These are forms that sit on a marketing site and
> carry paid traffic. Multi-step, mobile-first, fast, and good enough looking to put in front
> of a client without a Fiverr CSS job. Most of the category is a survey tool with a lead-gen
> mode bolted on, and it shows.
>
> **2. Your data goes wherever you need it — and it says so when it doesn't.** The best
> answer to "what would you actually pay for" in my entire research pile:
> *"For me, the paid feature is dependable integrations, not prettier form fields. If a form
> maps cleanly into an ERP or CRM, handles conditional logic without weird workarounds, and
> fails loudly when a sync breaks, that's worth paying for."* — u/SufficientFrame, r/nocode,
> Jul 2026. **Fails loudly** is the requirement hiding in that sentence, and it's the one I
> care most about getting right.
>
> **3. Open source. Your forms, your data, your server.** AGPL-3.0, a self-host story that's
> actually one command, exports never paywalled, no per-response tax. I'll be blunt about this
> one: in all my research, **zero marketers asked for open source.** Every such request came
> from developers. So it's a commitment, not a sales pitch.
>
> There's also an argument underneath all of it, which is that the number every form builder
> reports — completion rate — can't tell you anything about who filled the form in or what it
> turned out to be worth. That's a longer read, it's the reason this exists, and it's here if
> you want it. It isn't required.
>
> What you'll get from me, roughly every 10 days, and never more than 3 emails in a month:
>
> - Findings from the research. I read every complaint about form builders I could find on
>   Reddit, Capterra, G2, and HN, and counted how many independent people made each one. Most
>   of it has never been written down anywhere.
> - Decisions, with the reasoning — including the ones I've already got wrong in public. There
>   are four so far.
> - What I'm choosing not to build.
> - Eventually, a working product.
>
> No launch countdown. No spots remaining. If this turns into something you skim and delete,
> unsubscribe — I'd rather this list be small and read than large and ignored.
>
> — Corey

**CTA:** Read the argument → `/the-dishonest-dashboard`

**Job:** Say what this is in the first screen, state the absence of a product before they
discover it themselves, and set a cadence with an exit attached — so the relationship starts on
terms they chose.

**Re-pointed in v2.** v1 opened with three paragraphs of the completion-rate argument and never
said what the product was. Under the reset that ordering is backwards: the pillars are the
thesis, the metric argument is the reason behind the thesis, and a reason belongs on a page you
can choose to read.

---

### W2 — The verdict audit

**Send:** Day 2. **Kept from v1.** The single best idea in the original doc; the repositioning
doesn't touch it. Updated only for the settled Origin states and the calculators.

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
> Submitted at 3am from a country you don't sell to. Mark those **Unverified**. Everything else,
> **Human**.
>
> There's a third value, **Agent** — a real piece of software acting for a real buyer. In a
> manual audit today it will be empty, and that's the honest state of it. It's the column I
> think fills up over the next two years, and it's why the third state is called Unverified
> rather than Bot. We report what we know, not what we assume.
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
> The first is the Origin split, and it's normally worse than people expect. It's also sitting
> inside your conversion count right now. One person in the research gave up entirely:
> *"We ended up taking down the page after 600 submissions… We have recaptcha enabled, and I
> have a honeypot, but it didn't stop."* — u/robwalte, r/marketing, Jun 2024
>
> The second is the variant split, if you have one. A variant can win on fills and produce
> nothing. That's the demo I want to be able to show you eventually.
>
> **Two calculators to do the arithmetic**, both free, neither asks for an email — you're
> already here:
>
> - **Lead reconciliation** walks your leads from the number your dashboard reports down to the
>   ones that turned out to be real prospects, and prints the overstatement ratio.
> - **Outcome-weighted split test** ranks two variants on completion rate and on Yield rate,
>   and runs the significance test on both. Fair warning: it will usually tell you the outcome
>   difference isn't believable yet. That's the correct answer and most tools won't give it to
>   you.
>
> If you run the audit, I'd like to see the three numbers. Just reply — it comes to me.
>
> — Corey

**CTA:** Primary — Lead reconciliation calculator → `/tools/lead-reconciliation-calculator`.
Secondary — reply with your three numbers.

**Job:** Hand over something genuinely useful that requires no product, and teach the core
mechanic by making them perform it manually — the education beat `02-messaging.md` §9 flags as
the biggest open risk in the whole position.

**[judgment call]** v1 proposed a Google Sheets template with the four columns and three
formulas pre-built. The calculators now do most of that work, so the sheet is downgraded from
"ship this" to "ship it if someone asks." The 100 rows still have to live somewhere and a sheet
is still where. Do not gate it behind a second email capture — they're already subscribers, and
gating it would be absurd.

---

### W3 — Everything you've already tried, and why it failed

**Send:** Day 5. **Kept from v1**, with a new destination: the 12 teardowns at `/spam` now
exist, so this email stops being the only place the evidence lives and starts being the door to
it.

**Subject:** Every anti-spam defense you've tried, and the receipt for why it failed
**Alt A:** reCAPTCHA, honeypots, geo-blocking: the scoreboard
**Alt B:** 12 defenses, scored against 4 kinds of attacker

**Preview:** Six defenses, six practitioners describing exactly how each one broke.

**Body:**

> This one's worth having even if you never use anything I build.
>
> I went looking for what actually stops form spam. The answer, from people who do this for a
> living, is that nothing does on its own — and the specific way each defense fails is worth
> knowing before you spend another week on it.
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
> Notice what all six have in common. They're attempts to block a bad submission at the door,
> and each one is scored against a single kind of attacker while three other kinds walk past.
>
> So I wrote all 12 up properly. Each method gets a fair hearing on what it genuinely stops,
> then a scorecard against four different attackers — scripted bots, bots aimed specifically at
> you, paid humans doing it by hand, and real people who are simply bad leads — plus what it
> costs a real buyer in friction. Every defeat is attributed to a named practitioner, with a
> venue and a month.
>
> One of the 12 concludes that the method works, that you should use it, and that it isn't us.
> That page is the reason to trust the other 11.
>
> No email gate. You're already here.
>
> I'm not going to tell you we've solved spam. Nobody has, and the people in those threads
> would spot the claim in a second.
>
> — Corey

**CTA:** The 12 teardowns → `/spam`

**Job:** Prove the research is real, hand over the single most useful thing on the site for this
audience, and make the concession page (`/spam/otp-verification`) do the credibility work
instead of a claim.

**Re-pointed in v2.** v1 ended by pivoting to *"you still can't answer which of these leads was
worth money"* and then teasing the mechanism. Under the reset that's the essay's job, not this
email's. The email is now complete on its own and the pivot is gone.

---

### W4 — Who this isn't for

**Send:** Day 9. **Kept from v1, essentially unchanged.** Disqualification survives every
repositioning.

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
> **If you're running surveys or research, we're the wrong shape.** These are forms built to
> convert on a marketing site, not to collect responses for analysis. Typeform and Perspective
> are better at surveys and it isn't close.
>
> **If you need HIPAA or FedRAMP on day one, we don't have it and won't soon.** FormAssembly
> and Formstack exist for that, and they're not embarrassed about procurement the way we would
> be.
>
> **If nobody follows up on your form submissions, half of this doesn't help.** The outcome
> half of the product depends on someone, eventually, knowing whether a lead was any good. If
> that person doesn't exist at your company, we'd be selling you a report with an empty column.
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

**CTA:** Secondary only — `/solutions/agencies` or `/solutions/in-house-ppc`, whichever matches
their signup source. The unsubscribe link is the honest primary and it's fine for it to be.

**Job:** Disqualify hard and early. Trades list size for list quality, and buys credibility in
a category where every vendor claims every buyer (`03-brand.md` §2.6).

---

### W5 — What would make this a bad idea

**Send:** Day 14. **Kept from v1**, with objection 1 rewritten — under the reset we're not
purely "the measurement layer" any more, we're a form builder, and the honest answer changed
with it.

**Subject:** What would have to be true for this to be a bad idea
**Alt A:** The three strongest arguments against what I'm building
**Alt B:** One question, three links, no form

**Preview:** The best case against this, plus one question that changes what I send you.

**Body:**

> Two weeks in, so here's the best case against this before someone else makes it.
>
> **1. "There are already 200 form builders. What's one more?"** Fair, and mostly true. Most
> of them are a survey tool with a lead-gen mode bolted on, or a Typeform clone competing on
> price, and neither of those is a reason for me to build another one.
>
> The reason I think there's room: the four loudest complaints in my research are price,
> spam, conditional logic that breaks past about 5 conditions, and integrations that fail
> quietly. Not one of those is a design problem. They're all the same problem — the tools were
> built to collect responses, and then asked to carry paid traffic. If that's wrong, this
> company shouldn't exist, and I'd rather find out now.
>
> **2. "Our lead volume is too low to learn anything."** Right, and it's the hardest one.
> Below a few qualified leads a day, statistical significance on an outcome-weighted test is a
> fantasy: *"Optimizing for qualified leads might help but I imagine your qualified lead
> volume will be too low to feed the algo enough."* — u/dillwillhill, r/PPC
>
> There's a calculator on the site that tells you whether this applies to you, and it tells a
> large share of the people who use it that the method won't work for them. It's the
> time-to-outcome checker. I'd rather it said so than have you find out in month four.
>
> **3. "Nobody thinks this is the form's problem."** This is the one that keeps me up. Across
> all the research, the junk-lead pain is real and loud — and people blame their analytics
> stack, or their ad platform, or their WordPress plugin. Almost nobody blames the form tool.
>
> Which means the argument needs an education beat before the value lands, and education is
> slow and expensive. It's also most of why you're getting this email.
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

**CTA:** Three tagged links (agency / in-house / technical), plus reply. Objection 2 links
`/tools/time-to-outcome-calculator`.

**Job:** Concede the strongest counter-arguments in public — and capture the only segmentation
worth having, with a click instead of a form field.

---

## 6. Sequence 2 — Build in public

```
Sequence name:  Build in public
Trigger:        Completion of the waitlist welcome sequence (Day 14)
Goal:           They still care in three months, and they argue with us in public
Length:         11 written; ongoing thereafter
Timing:         Every 10-14 days, Tue-Thu. Skip the slot rather than fill it.
Exit:           Launch sequence begins · unsubscribe · downgrade to "launch only"
```

**The strategy.** Each email is a finding, a decision, or a mistake — never a status update.
The self-implicating trait does the heavy lifting: **4 of the 11 are about things we got
wrong**, one is a giveaway, and one is about what we're refusing to build. This is the only
cadence that stays interesting for a product that doesn't exist yet.

**Ordering note.** The corrections are early and deliberately interleaved with something
useful, so the sequence reads as a company that checks its own work rather than one that gets
everything wrong. N1 leads with the biggest correction — the positioning itself — because
establishing that we change our mind in writing, before we've asked for anything, is what makes
the rest of the list credible.

**What changed in v2.** N1 and N2 are new. The old N1 (five naming decisions) became N4, which
is now a rename story with a receipt instead of a list of picks. The old N4 ("why suspected bot
is amber") became N7 and changed its subject, because the state is now called Unverified. N5 is
new. Everything else survived with edits.

---

### N1 — The sentence I was leading with was wrong

**Send:** Day 24 (10 days after welcome ends). **New in v2.**

**Subject:** I was leading with the wrong sentence
**Alt A:** The headline I cut, and the 3 sentences that replaced it
**Alt B:** Correction 1 of 4

**Preview:** The line was true. It was still the wrong thing to open with.

**Body:**

> Correction, and it's the biggest one so far because it's the whole pitch.
>
> Until recently this is what I opened with:
>
> > **Your form can't tell a buyer from a bot — and it's reporting both as conversions.**
>
> I still think that sentence is true. I have the receipts for every clause of it. I cut it as
> the headline anyway, and here's the reasoning in case it's useful for something you're
> working on.
>
> **It was a wedge doing a headline's job.** It's a narrow, specific, second-order claim about
> measurement. Opening with it meant every page I wrote turned into an argument about a metric
> — an argument the reader hadn't asked to have, with competitors they hadn't mentioned. I was
> answering a question nobody had asked me yet.
>
> **And my own research said so.** I counted complaints in this category by how many
> independent people made each one. The top four are price, spam, conditional logic that breaks
> past about 5 conditions, and integrations that fail quietly. **Measurement philosophy is not
> on the list.** Nobody is lying awake about the epistemology of completion rate. They're lying
> awake because the CRM sync dropped 40 leads and nothing told them.
>
> So here's what replaced it.
>
> > An open-source form builder for website forms, built for marketers who want high-converting
> > forms that pipe their data wherever they need it.
>
> And underneath it, three things rather than one:
>
> **Built to convert, not to survey.** Multi-step, mobile-first, fast, and presentable to a
> client without custom CSS. Most of this category is a survey tool with a lead-gen mode bolted
> on.
>
> **Your data goes wherever you need it, and it says so when it doesn't.** Native integrations,
> conditional logic that holds past 5 conditions, and a sync that fails loudly. A sync that
> breaks silently is the same sin I spend my time accusing this category of.
>
> **Open source. Your forms, your data, your server.** AGPL, one-command self-host, exports
> never paywalled.
>
> The old line isn't deleted. It's the argument, it's the reason the product is shaped the way
> it is, and it now lives on its own page where someone can choose to read it. That's the right
> place for a claim that takes 2,000 words to defend.
>
> What I got wrong wasn't the analysis. It was thinking that the most interesting thing I knew
> was the same as the most useful thing to say first. Those are different, and I've watched
> other people make the same mistake without noticing I was making it.
>
> — Corey

**CTA:** The argument, in its new home → `/the-dishonest-dashboard`

**Job:** Make the repositioning legible instead of silent, model the self-implicating trait at
the largest possible scale, and hand the reader a transferable lesson — *the most interesting
thing you know is not the same as the most useful thing to say first* — which makes the email
worth forwarding.

---

### N2 — 8 calculators. No email required.

**Send:** Day 36. **New in v2.** The strongest pre-launch asset we have.

**Subject:** 8 calculators. No email required. No product required either.
**Alt A:** I built 8 calculators instead of a feature list
**Alt B:** The one that tells most people this won't work for them

**Preview:** They're free, they're ungated, and one of them argues against us.

**Body:**

> A product that doesn't exist can't be demoed, so I built the arithmetic instead.
>
> 8 calculators, all live, all free, none of them behind an email gate — you're already on the
> list and asking twice would be absurd. Each one answers a question I heard someone ask in the
> research, in their own words.
>
> **What it costs**
>
> - **What are junk form submissions actually costing me?** Wasted spend, wasted rep hours,
>   per-response fees, and your real cost per lead once the junk comes out.
> - **My cost per lead is lower. Is the campaign actually cheaper?** Two campaigns side by
>   side on cost per lead and cost per closed deal, so you can see the rank flip when it
>   happens.
> - **What am I really paying per lead I can sell to?** Prices up to 3 form-builder plans
>   against your own volume and junk rate, and shows what share of your allowance the junk eats.
> - **How many of my reported conversions were real people?** Walks the number from what your
>   dashboard says down to real prospects and prints the overstatement ratio.
>
> **What to believe**
>
> - **Variant B converts better. Do I have enough closed deals to believe it?** Runs the
>   significance test on completions and on closed-won, and tells you when the two metrics pick
>   different winners.
> - **Is my sales cycle fast enough for this to work at all?** This is the one I want to point
>   at. It adds your disposition lag to your accumulation time and works out whether an
>   outcome-weighted test could conclude before it goes stale. **It tells a large share of the
>   people who use it that the method won't work for them** — which means it argues against my
>   own product, in public, on my own site. That was deliberate. A calculator that always says
>   yes is a lead magnet, not a calculator.
>
> **What it's worth**
>
> - **What does one more field cost me, and what would it have to be worth?** It solves for the
>   close-rate improvement the extra field would have to produce to pay for itself, rather than
>   asserting a drop — because nobody in this category actually has data on what a field costs,
>   including me.
> - **Which step of my multi-step form is losing people?** Prices the worst step against the
>   median of the others, so the fix arrives with a number attached instead of a feeling.
>
> Two things worth saying about them.
>
> They're all built on the form engine I'm building, which means when one of them breaks, it's
> my form builder that broke and you'll see it. That's the point.
>
> And they're useful whether or not you ever hear from me again. That was the bar for building
> them at all: **it ships only if it's useful when nobody finds it.**
>
> If one of them gives you a number that surprises you, reply with it. Those replies are how I
> find out which of these problems is the real one.
>
> — Corey

**CTA:** All 8 → `/tools`. Deep link on the two named ones.

**Job:** Give the list something with immediate standalone value, demonstrate the product's
judgment before the product exists, and make the self-defeating calculator the proof rather
than a claim about honesty.

---

### N3 — I was wrong about the wedge

**Send:** Day 48. **Kept from v1 (was N2).** Still correct, still the cleanest correction we
have.

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

**CTA:** None. **[judgment call]** A link to `/glossary/offline-conversion-import` is available
if this email needs one, but the email is better without.

**Job:** Model the self-implicating trait by killing our own best-sounding claim in public —
and land the real claim on the credibility that earns.

---

### N4 — Handshake is now Manifest

**Send:** Day 60. **Re-pointed from v1's N1** (which listed five naming decisions). It's now a
rename with a receipt, which is a better email than a list of picks.

**Subject:** Handshake is now Manifest. Here's the screening that killed it.
**Alt A:** I named a feature after a $3.5B company
**Alt B:** Correction 3 of 4, and the cheapest one to fix

**Preview:** 170 marks, 53 live, and a name I couldn't have owned.

**Body:**

> I renamed a feature, and the reason is more useful than the name.
>
> The thing being renamed: one form definition publishes two surfaces — the human UI you'd
> expect, and a machine-callable declaration that software can read and submit against on
> purpose. Because a legitimate agent goes through that declaration, anything stuffing the
> human form while claiming to be software has told on itself. That's how a submission gets
> stamped **Human**, **Agent**, or **Unverified**.
>
> I was calling it **Handshake**. It's now **Manifest**.
>
> Here's the screening. I ran all five product names through USPTO before any of them went on
> the site — a rule I'd written down and, if I'm honest, half expected to be a formality.
>
> "Handshake" returned **170 marks, 53 of them live.** Three live registrants matter: a Shopify
> mark in class 9, and a class 35 and 42 registration held by the company behind
> joinhandshake.com — a careers platform valued at roughly $3.5 billion that is actively
> extending into AI.
>
> **That isn't mainly a legal problem, and I want to be precise about it.** Using "handshake"
> as a lowercase technical noun is what the word is for. TCP handshake, TLS handshake. Nobody
> owns that.
>
> The problem is the other two:
>
> **It's unownable as a capitalized capability.** In B2B SaaS, "Handshake" is already a
> company. Every conversation about our feature would spend its first ten seconds not being
> about our feature.
>
> **It's search-invisible.** I am never going to outrank a $3.5B careers platform for that
> word. Which means the one word a buyer might repeat back to us leads them somewhere else.
>
> Then the replacement turned out to be better than the original, which is the part I didn't
> expect. **A manifest is a document that declares what's in the shipment.** It has meant
> exactly that to developers for decades. The old name described the *ceremony* — two parties
> greeting each other — and never explained what was actually exchanged. The new one names the
> artifact. It fixed something the old name had been quietly failing at for months.
>
> Lowercase "handshake" survives as the verb, because it's the right verb:
>
> > **Real agents shake hands. Bots pick the lock.**
>
> The naming standard the whole set was picked against, in case it's useful: **one plain English
> word, a real noun the reader already knows, sayable out loud without explanation, no AI-era
> jargon, and slightly forensic in register.** The product is about finding out what really
> happened, so the vocabulary should sound like it. That's how we ended up with Verdict, Origin,
> Yield, Hindsight and Manifest rather than "Agent Mode" and "outcome-weighted split testing."
>
> The other four cleared. One of them came with a note: **Yield** ships only as a number with a
> unit — Yield rate, Yield value — never as a bare noun, because there is a large
> experimentation platform with that word in its name and I'd rather not borrow its outline.
>
> The test a name has to pass is whether a buyer repeats it back to you. I'll find out if these
> do.
>
> — Corey

**CTA:** None, or reply with a better name.

**Job:** Show the reasoning behind a decision most companies present as fixed, hand over a
reusable process (screen names before they ship, and screen them for *ownability*, not just for
legal risk), and demonstrate that a stated rule got followed when it was inconvenient.

**Hard constraint carried into this email:** never write "yield optimization" anywhere. That
phrase belongs to Dynamic Yield and to ad-tech SSPs. We say **"ranked on Yield."**

---

### N5 — I nearly shipped a false claim about a competitor

**Send:** Day 72. **New in v2.**

**Subject:** I nearly shipped a false claim about a competitor
**Alt A:** The sentence I had to retire, and what Heyflow actually does
**Alt B:** Correction 4 of 4, and the one that cost me the best line I had

**Preview:** I checked a competitor claim I'd been making for weeks. It was wrong.

**Body:**

> Here's a line that was in my draft copy for weeks:
>
> > *Competitors send the ad platform a lead. Not a lead worth $X.*
>
> It's a great line. It's also false, and I found that out by going and checking rather than by
> someone correcting me in public — which is the only reason I get to tell it this way.
>
> **Heyflow sends a conversion value.** Not a binary "1 conversion" — an actual number. Their
> native server-side Conversions API integration maps a Value and Currency field, and their
> in-funnel lead scoring is built specifically so the score becomes that value. Their words,
> from their own blog: *"Meta receives a Lead event with a value of 85 (hot) or 30 (cold) — not
> a binary '1 conversion.'"* That's a real, shipped, documented value-based-bidding capability
> and it's genuinely good. It's also a gap on my side, not theirs.
>
> So the sentence is retired. It will not appear on the site, in a comparison, or in an ad.
>
> Now the part that survived, because a claim being wrong as written doesn't mean the idea
> underneath it was.
>
> **Heyflow's value is a guess made at submit time, from what the lead typed about themselves.**
> Their documentation is explicit that mapped data is *"only appended for submit events."* There
> is no documented way to send a later event that revises the number. The score is computed from
> the answers in the funnel, at the moment of capture, and it is never corrected by what the
> lead turned out to be worth.
>
> And they're not hiding this — they argue for it. Their own comparison table rates in-funnel
> scoring against CRM scoring on data freshness: **"Immediate"** versus **"Stale by at least one
> business cycle."** They've chosen speed over truth, deliberately, and they say so. That's a
> real position and reasonable people take it.
>
> Two more things I found while checking, both in their documentation rather than mine:
>
> For outcomes that happen later — a qualified lead, an appointment held, a deal closed —
> Heyflow's own guide hands the job back to you. They capture the GCLID and pass it to your CRM.
> Somebody else uploads the outcome.
>
> And their Google Ads integration has no value field at all. Their help page tells customers
> that *"in most lead generation cases… each lead should have the same value."*
>
> **That last quote is the strongest thing I have, and it came from a competitor's help centre
> rather than from my own copy.** Which is roughly the lesson.
>
> The corrected version of my claim is narrower and I like it more: everyone in this category
> who scores a lead is scoring it from what the lead said about itself, at the moment it said
> it. Nobody goes back and changes the number when the deal closes. That's the thing I want to
> build, and now I can say it without anyone being able to catch me overstating it.
>
> If I've got something wrong about a tool you use, reply and tell me. I'd rather be corrected
> by you than by a comment section.
>
> — Corey

**CTA:** None. Reply invited.

**Job:** Turn a killed claim into the single strongest credibility asset on the list — a company
that audits its own competitive copy, concedes a competitor's strength by name, and quotes the
competitor accurately. Also permanently vaccinates the reader against the version of the claim
they may have seen in earlier drafts.

**[judgment call] — check before sending.** This email is written as *"in my draft copy for
weeks"* and *"nearly."* That is accurate as of 2026-08-28: the line was retired in
`13-competitive-verification.md` before it appeared on a public page. **If the sentence did ship
anywhere public — a social post, an early homepage revision, a Reddit comment — this email must
say "published" and must name where.** Softening a published error into a near-miss would be
the exact dishonesty the email is about, and it would be the worst possible email to be caught
on.

**Hard constraint for all downstream copy:** the retired sentence never appears again, in any
form. The publishable competitive language is in `13-competitive-verification.md` §"What we may
publish — verbatim." Use those sentences or none.

---

### N6 — I got the SEO call wrong, and the correct answer is worse

**Send:** Day 84. **Kept from v1 (was N3)**, with a new ending: v1 concluded "this list is one of
two channels." Since then we built the thing that answers the problem, so the email now ends
with what we did about it.

**Subject:** I got the SEO call wrong, and the correct answer is worse
**Alt A:** A site with domain rating 30 is on page one for "typeform alternative"
**Alt B:** Why you're getting this email instead of finding us on Google

**Preview:** Keyword difficulty 0, and a finding that changed the whole plan.

**Body:**

> Another correction, and this one changed the plan rather than just the copy.
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
> So here's what I did about it, because a finding you don't act on is a blog post.
>
> I stopped trying to rank for the problem and built things that are useful to someone who
> already knows they have it. 8 calculators. 12 anti-spam teardowns, each scored against 4
> different kinds of attacker. 25 glossary entries for the vocabulary this job actually uses.
> The rule every one of them shipped under: **it goes live only if it's useful when it doesn't
> rank.**
>
> That's a slower plan than ranking for a keyword. It's the honest one available, and it has
> the pleasant property that if the SEO never works, the pages were still worth building.
>
> — Corey

**CTA:** The 12 teardowns → `/spam`. Secondary: `/tools`.

**Job:** Show the working on a strategic reversal, tell subscribers honestly why they matter,
and demonstrate that a finding produced an action rather than an opinion.

---

### N7 — Why the third state is called Unverified

**Send:** Day 96. **Re-pointed from v1's N4** ("Why 'suspected bot' is amber and not red"). The
state names were settled after v1 was written; the craft argument underneath is unchanged and
is one of the strongest emails in the sequence.

**Subject:** Why the third state is called Unverified and not Bot
**Alt A:** The accessibility math that broke our colour system
**Alt B:** 1.26:1, and why colour can't carry three states

**Preview:** A small design decision that turned out to be the whole product argument.

**Body:**

> A small one this time, which turned out not to be small.
>
> Every submission in Endpoint Forms carries one of three states: **Human**, **Agent**, or
> **Unverified**. Three states that have to be told apart instantly, which is the hardest
> problem in the interface.
>
> **First decision: the third state is called Unverified, not Bot.**
>
> This one I changed. It was "suspected bot" for months, and "suspected" was doing real work —
> we report what we know, not what we assume. But the noun was still an accusation with a
> hedge in front of it, and the hedge is the first thing that falls off when someone quotes you.
>
> **Unverified** is the accurate word. It doesn't say the submission is a bot. It says we
> couldn't establish that it wasn't. Those are genuinely different claims and the second one is
> the only one I can defend. A form that told you "this is a bot" would be doing exactly what I
> criticise the category for — reporting a confidence it hasn't got.
>
> **Second decision: Unverified is amber, not red.**
>
> Red is reserved for things that actually failed — a broken CRM sync, a destructive action.
> An unverified stamp is an absence of evidence, not an error. Amber says "look at this," which
> is the correct instruction.
>
> **Third decision, and this is the one I got wrong first: colour cannot carry three states.**
>
> Here's the arithmetic. For a colour to be readable as text on our light background, it has to
> sit below a certain luminance. All three states therefore live inside a narrow band, and that
> caps how far apart they can be in greyscale. Their contrast *with each other*:
>
> - Human ↔ Unverified: **1.26:1**
> - Human ↔ Agent: **1.77:1**
> - Unverified ↔ Agent: **1.40:1**
>
> Those are as far apart as the constraint allows, and they are nowhere near enough to
> distinguish by lightness alone. Under deuteranopia and protanopia — the common forms, roughly
> 1 in 12 men — the teal and the violet converge toward similar blues.
>
> So the rule is: **every Origin indicator carries three channels, in this order of importance —
> shape, label, colour.** Circle, diamond, triangle. Unambiguous at 11px in greyscale, on a
> monochrome printout, and to every form of colour vision. The full words are always present,
> never abbreviated, never tooltip-only.
>
> An Origin chip that ships as a bare coloured dot is a bug, not a style choice.
>
> Which is the same argument as everything else here, applied to a design token: **a signal you
> can't verify isn't a signal.** It just looks like one, and looking like one is the problem.
>
> — Corey

**CTA:** None. **[judgment call]** `/glossary/origin` is a reasonable link once that page carries
the settled state names.

**Job:** Demonstrate craft, and show the brand's central principle operating at the smallest
possible scale — which is more persuasive than asserting it at the largest.

**Downstream note, not this doc's to fix:** `03-brand.md` §7 still labels the three states
"Human / Identified agent / Suspected bot" in the colour table. The spine settled on
**Human · Agent · Unverified**. The colours, glyphs and contrast figures are unaffected; only
the labels need updating, and that's the brand doc's edit to make.

---

### N8 — 45 people complained about price. 22 complained about spam.

**Send:** Day 108. **Kept from v1 (was N6).** More on-message after the reset, not less — these
rankings are the evidence the reset was made on.

**Subject:** 45 people complained about price. 22 complained about spam.
**Alt A:** The 4 loudest complaints in this category, counted
**Alt B:** Why there's no per-response tax

**Preview:** The complaint rankings, and the one I'm deliberately ignoring.

**Body:**

> I counted. Here's what people actually complain about in this category, ranked by how many
> *independent* people said it — distinct threads and distinct reviewers, not raw mentions.
> This count is the reason the pitch says what it says, so it's worth showing you.
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
> I'd rather say one true thing than run a comparison table. There's a calculator on the site
> that prices your junk rate against a plan's allowance, if you want the number for your own
> account rather than mine.
>
> One more, quietly: **#3 and #4 are what I'm most focused on**, and neither is glamorous.
> Conditional logic that holds is the #1 functional complaint in the category and literally
> nobody has claimed it. *"The conditional logic is always the biggest headache — it never works
> right for anything beyond super simple forms."* — u/devhisaria, r/nocode, Oct 2025. Somebody
> else's version of the same complaint ended with: *"Budget is flexible, just needs to work."*
>
> Price was never the trigger. It never is.
>
> — Corey

**CTA:** Cost per usable response → `/tools/cost-per-usable-response-calculator`

**Job:** Handle the pricing objection before it arrives, reframe from "cheap" to "coherent," and
show the reader the exact evidence the positioning was built on.

---

### N9 — The list of things we're not building

**Send:** Day 120. **Kept from v1 (was N5)**, with the site section rewritten — v1 said "no
features section" and there are now 5 feature pages, so leaving it as written would have been a
small lie in an email about honesty.

**Subject:** The list of things we're not building
**Alt A:** 7 decisions to build nothing
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
> the point is to get you the same information *after* the fact, from your CRM, instead of from
> the visitor's patience. There's a calculator that makes this concrete: it solves for how much
> better your close rate would have to get for one extra field to pay for itself. The number is
> usually uncomfortable.
>
> **Not the ad-platform loop as a headline.** Covered in an earlier email. It may be a feature.
> It is never the promise.
>
> **Not open source as the sales pitch.** This one surprised me and I've said it before:
> **zero marketers in my entire research corpus asked for open source or self-hosting.** Every
> such request came from developers, r/selfhosted, or r/opensource. The AGPL license is real and
> permanent, and one-command self-host is a genuine bar the incumbents fail — self-hosting the
> existing open-source form builders is miserable and everyone who's tried says so. It is a
> trust commitment and a no-lock-in guarantee. It was never going to be the reason a marketer
> shows up, and pretending otherwise would be marketing to myself.
>
> And on the site itself, three things a funded company would have built by now:
>
> **No pricing page**, because there's no price, and inventing tiers you later retract is a
> documented reason people leave a vendor. **No blog**, because one post is an abandoned blog —
> the essay lives at its own URL and the tools and teardowns live at theirs, and none of them
> pretend to be a publishing cadence. **No comparison pages**, because a comparison page for a
> product that doesn't ship yet is an unfalsifiable claim — which is precisely what the thin
> vendors on that SERP are doing, and the reason I can tell you not to trust them.
>
> There *are* feature pages now, which is a change from what I said earlier in this list, so
> I'll be exact about the rule they had to pass: a feature page describes a mechanism and what
> it can't do. It doesn't claim the software is available. The day one of them implies you can
> use it today, it comes down.
>
> — Corey

**CTA:** Form field payback calculator → `/tools/form-field-payback-calculator`

**Job:** Sharpen the position by subtraction, pre-empt "why doesn't it do X," and demonstrate
that we apply our own standard to our own marketing site — including correcting a claim we made
in an earlier email in this same sequence.

---

### N10 — The number we refuse to fake

**Send:** Day 132. **Kept from v1 (was N7).** Now with a calculator behind it that implements the
claim, which is better than asserting it.

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
> Two of the calculators already behave this way, before there's a product to hold to it. The
> split-test one runs the significance test on closed deals and will usually tell you the
> difference isn't believable yet. The time-to-outcome one tells a large share of people that
> the method won't work for them at all. Both were easy to build the dishonest way. Both would
> have converted better.
>
> A tool that refuses to tell you something it can't know is the entire product in one
> sentence. If we ever ship a confident winner off 12 submissions, hold this email up.
>
> — Corey

**CTA:** Outcome-weighted split test calculator → `/tools/outcome-weighted-split-test-calculator`

**Job:** Convert the hardest objection into a proof point, and demonstrate product judgment with
something already shipped rather than a promise about something that isn't.

---

### N11 — Build log [recurring template]

**Send:** Whenever there is something real. Roughly every 6 weeks once code exists. **Kept from
v1 (was N8), unchanged.**

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
disappears at midnight — because we spent months telling this list we don't do that, and one
countdown timer would retroactively cost us all of it. The urgency has to come from the
product being worth using, which is the only kind that survives.

**The ask is deliberately tiny.** Not "switch." Not "migrate." Point one form at us — the one
your paid traffic hits — and leave everything else where it is. Inertia is the real competitor
(*"I still use Jotform since it's been reliable for me… I built my workflow around them"* —
u/stevenbellomy, r/nocode, Apr 2026) and arguing with inertia loses.

**What changed in v2.** L2 was ordered differentiators-first (Origin, Verdict, Yield). It's now
ordered pillars-first, with the differentiators as the second half — the reset's ordering, not
the wedge's. The competitive claim in L2 was rewritten against
`13-competitive-verification.md`.

---

### L1 — Pre-launch heads-up

**Send:** 7 days before launch. **Kept from v1, unchanged.**

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
> [Slot: the actual working capability list, ordered by pillar — building and shipping forms
> first, integrations second, self-host third. Every line must be demonstrable on video, per the
> proof standard in `02-messaging.md`. No aspirational entries.]
>
> **What doesn't work on day one**
>
> [Slot: named specifically, not softened. If one-command self-host isn't ready, say so here.
> If there are 3 native integrations and not 30, say which 3. If conditional logic has a
> ceiling, name the number. This section is longer than people expect and that is the point —
> it's the section that makes the other one believable.]
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

**Send:** Day 0, Tuesday or Wednesday morning. **Re-pointed in v2.**

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
> What it is, in the order you'll meet it:
>
> **A form builder that's built to convert.** Multi-step, mobile-first, fast, and presentable
> to a client without custom CSS. Conditional logic that holds past 5 conditions, because that's
> the #1 functional complaint in this category and nobody has claimed it.
>
> **Your data goes where you need it, and it tells you when it doesn't.** [Slot: the actual
> native integrations, named, with a number.] Plus the part I care most about: when a sync
> breaks, you get told. Loudly, immediately, with the count of what's queued and the confirmation
> that nothing was lost. A silent sync failure is the same sin I've spent this whole list
> accusing the category of.
>
> **Open source, and the self-host actually works.** AGPL-3.0, [slot: the one command].
> Exports are never paywalled. No per-response tax.
>
> Then the part that's ours:
>
> **Every submission carries an Origin** — Human, Agent, or Unverified. Not guessed from mouse
> movement. One form definition publishes both a human UI and a machine-callable Manifest, so a
> legitimate agent goes through the front door and anything stuffing the human form while
> claiming to be software has told on itself. "Unverified" means we couldn't establish it was a
> person. It doesn't mean we caught a bot, and we won't say we did.
>
> **Every submission gets a Verdict** — won, lost, disqualified, or awaiting verdict, plus a
> value. From a CRM sync or a one-line webhook fired from wherever the truth actually lives.
> Most will say "awaiting verdict" for a while. That's the honest state and we made it a
> first-class one.
>
> **Your split tests rank on Yield rate, not on fills.** Every split test I could find in this
> category ranks variants on what happened inside the form — completions, drop-off, time to
> complete, at best a booked call. All of that is scored at submit time or shortly after. None
> of them go back and change the answer when the deal closes. That's the one we do.
>
> **What's already broken:** [Slot — there will be something within the first hours. Naming it
> yourself on day one is worth more than a clean launch post, and this list has been told for
> months that we'd do exactly this.]
>
> If you'd rather read the whole argument before touching anything, it's still here:
> [the argument →]
>
> — Corey

**CTA:** Start with one form → [url]

**Job:** Convert on the smallest possible commitment, lead with the three pillars so the launch
matches the positioning the list has been reading for months, and make the day-one failure
disclosure a feature of the launch rather than a risk to it.

**Verification constraint on the Yield paragraph.** Written against
`13-competitive-verification.md` as of 2026-08-28. It claims only that competitors score at or
near submit time and never revise — which their own documentation supports. **Recheck the
Heyflow, ROASForm and Typeform sources before this email sends**; they are live pages under
competitors' control and several were updated within six weeks of that verification. Do not
restore any version of "competitors send a lead, not a lead worth $X."

---

### L3 — Last call, honestly

**Send:** Day +7. **Kept from v1, unchanged.**

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
and the whole position is that we're not that. **Kept from v1, with four additions marked.**

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

**False or retired competitive claims — NEW in v2**
- ❌ **"Competitors send the ad platform a lead, not a lead worth $X."** Retired as false.
  Heyflow sends a mappable Value and Currency on its server-side CAPI events and markets
  in-funnel scoring specifically so the score becomes that value. The surviving, verified
  distinction: **Heyflow's value is a guess made at submit time from the lead's own answers, and
  is never revised by the outcome.** N5 is the email that makes this correction in public;
  nothing else may reintroduce the error.
- ❌ "Heyflow can't do value-based bidding," "Heyflow has no server-side tracking," "Heyflow has
  no A/B testing," "ROASForm has no split testing," "Typeform will never build this." All
  disprovable in one click. Full list in `13-competitive-verification.md`.
- ❌ Any competitive claim older than a quarter without a recheck. These are live pages under
  someone else's control.

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
- **"Yield optimization" — NEW in v2.** Never, in any context. The phrase belongs to Dynamic
  Yield and to ad-tech SSPs, and Dynamic Yield is an experimentation platform, which is the one
  place two of our words land inside somebody else's product category. We write **"Yield rate,"
  "Yield value," "ranked on Yield."** Always a number with a unit, never a bare noun.

**Overclaiming about the product**
- "Bot-proof," "CAPTCHA-killer," "100% spam-free." Nobody has solved spam and every person on
  this list knows it.
- **"Bot" or "suspected bot" as a submission label — UPDATED in v2.** The third Origin state is
  **Unverified**, full stop. It means we could not establish that a person filled the form in.
  It does not mean we identified a bot, and the difference is the whole credibility of the
  feature.
- **"Handshake" as a capitalized capability name — NEW in v2.** The capability is **Manifest**.
  Lowercase "handshake" survives only as a verb, and only alongside Manifest: *"Real agents
  shake hands. Bots pick the lock."*
- Any claim about agent traffic volume. WebMCP was announced at Google I/O 2026 and shipped an
  early preview in Chrome Canary in Feb 2026 — we cite the actual maturity and let people draw
  their own conclusion.

**Attacking people**
- A competitor called bad by name. We criticise a category-wide pattern and let the reader
  assign it (`03-brand.md` §4). Where we name a competitor, we name what they're genuinely good
  at first — N5 is the template.
- Anything blunt aimed at the reader rather than at a metric, a mechanism, or us.

**List behaviour**
- Emails to anyone who didn't sign up: bought lists, badge scans, GitHub stargazers, issue
  filers, people who emailed us once about something else, **anyone who used a calculator at
  `/tools` without joining**.
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
| **Reply rate** | The real signal on a pre-launch list. W2, W5, N2 and N5 all ask for one. A reply is a person; nothing else in email is. | No benchmark exists for this. Measure against ourselves and publish it in a build log. |
| **Click rate per email** | A click is an action a person took. It's the only engagement number here that isn't inferred. | Same. |
| **Tool completion, not tool click — new in v2** | The calculators are Endpoint forms, so we can see whether someone who clicked through from N2 actually finished one. A click is interest; a completed calculation is the closest thing to product usage that exists before the product does. | Track per calculator. It's also the first honest read on which of the 4 complaints our list actually has. |
| **Unsubscribe rate per email** | Expected to spike on W4 (the disqualification email) — **and that spike is the email working, not failing.** A high unsubscribe on W4 and a low one everywhere else is exactly the shape we want. | Judge W4 by what happens to click and reply rates *after* it, not by the unsubscribe on it. |
| **Signups by source page** | The only segmentation we have, and now a much sharper one — `/tools/{slug}` and `/spam/{method}` arrivals tell us which problem brought them. | Track per page and per community post. |
| **Three-month retention of attention** | The actual goal. Proxy: click or reply rate on nurture emails sent 90+ days after signup, compared to the same cohort's first month. | If it's collapsing, the cadence or the content is wrong. Cut frequency before cutting quality. |
| **Waitlist → signup, at launch** | The only conversion number in the whole system. | Measured once, published in L3 whatever it says. |

---

## 10. Open questions and conflicts

**Resolved since v1** — recorded here so the change is legible rather than silent:

1. ~~**Terminology conflict — Origin states.**~~ **Settled.** The three states are
   **Human · Agent · Unverified**, per `02-messaging.md` §2 and the spine's differentiator
   section. v1 followed the spine's older "human / identified agent / suspected bot" wording on
   the rule that the spine wins; the spine has since adopted the messaging doc's reasoning. N7
   and L2 are written against the settled names. `03-brand.md` §7's colour table still carries
   the old labels and needs a one-line edit that is not this doc's to make.
2. ~~**Feature names are unscreened.**~~ **Settled.** `12-trademark-screening.md` cleared
   Hindsight, Verdict, Origin and Yield, and flagged Handshake as CAUTION. Handshake was renamed
   to **Manifest**. Yield ships only as "Yield rate" / "Yield value," never as
   "yield optimization." N4 is the email that publishes the rename.
3. ~~**The essay slug is undecided.**~~ **Settled.** The argument lives at
   `/the-dishonest-dashboard`. W1, N1 and L2 link it.

**Still open:**

4. **From-name and sign-off.** Written throughout as one person to one person, signed
   "— Corey," per `05-site-architecture.md` §10's reasoning that a named human is a
   differentiator in an astroturfed category. From-name should probably be a person, not
   "Endpoint Forms." **[judgment call]**
5. **The no-open-pixel decision (§3)** is the most contestable thing in this document. It's the
   right call for this brand and it has a real cost. Make it deliberately.
6. **Did the retired competitive sentence ever ship publicly?** N5 is written as a near-miss.
   If it appeared on a public page, a social post, or a comment, the email must say "published"
   and name where. **Check before sending.** This is the one factual claim in the sequence that
   could turn the credibility email into the opposite.
7. **Recheck the competitive facts before L2.** `13-competitive-verification.md` is a snapshot
   of 2026-08-28 against live pages under competitors' control, several updated within six
   weeks of it. Its own instruction is to recheck before any comparison ships and quarterly
   after.
8. **ESP not chosen.** Nothing here has been created in any email tool. This is copy in a
   markdown file, and publishing it is a separate decision.
9. **Slot-filled emails.** L1, L2, L3, and N11 contain `[Slot: …]` markers that can only be
   filled by facts that don't exist yet. They are structurally complete and factually empty on
   purpose — writing speculative feature lists for an unbuilt product is the exact thing §8
   forbids.
10. **Whether N2's calculator email should also go to the technical segment.** It's pitched at
    a marketer's problems. A `/open-source` or GitHub arrival may find it beside the point.
    **[judgment call]** — send it to everyone for now; there isn't enough volume to justify a
    second version, and the self-defeating calculator lands with a developer too.

---

## 11. Change log against v1

| v1 | v2 | What happened |
|---|---|---|
| §0 "two of the two channels" | §0 rewritten | Still true about search volume; no longer true that email and community are the only assets. The Tier 0.5 page set changed it. |
| §1 subject-line principles | Kept | Only the example in rule 8 changed, because the old example was the retired headline. |
| §2 cadence | Kept | Nurture length 8 → 11. |
| §3 unsubscribe philosophy | Kept, re-justified | Same mechanics. The justification now runs off pillar 2 ("fails loudly") instead of the retired metric thesis. |
| §4 segmentation | Kept, extended | Source-page signal got sharper with 63 pages; calculator clicks added. |
| W1 confirm | **Re-pointed** | Opened with the metric argument and never said what the product was. Now opens with the one-liner and the three pillars; the argument is a link. |
| W2 verdict audit | **Kept** | Best idea in the doc. Updated for Human/Agent/Unverified and the two calculators. Sheets template downgraded. |
| W3 anti-spam defenses | **Kept, re-pointed** | Same six quotes. Ending no longer pivots to the metric argument; CTA is now `/spam`. |
| W4 who this isn't for | **Kept** | Survey paragraph reworded to match pillar 1. Otherwise unchanged. |
| W5 what would make this a bad idea | **Kept** | Objection 1 rewritten — "the landing page is what's broken / we're the measurement layer" was a wedge-era answer. Now it's "there are already 200 form builders." |
| N1 five naming decisions | **Became N4** | Rewritten as the Handshake → Manifest rename, with the screening as the receipt. Better email, real news. |
| N2 wrong about the wedge | **Kept as N3** | Unchanged. Still correct. |
| N3 wrong about SEO | **Kept as N6** | New ending: what we built because of the finding. |
| N4 "suspected bot is amber" | **Became N7** | Same accessibility argument and the same contrast figures. New first section on why the state is Unverified, not Bot. |
| N5 not building | **Became N9** | "No features section" was no longer true; rewritten with the rule feature pages had to pass. Open-source paragraph reconciled with pillar 3. |
| N6 complaint rankings | **Kept as N8** | Now framed as the evidence the reset was made on. |
| N7 number we refuse to fake | **Kept as N10** | Now cites two shipped calculators that behave this way. |
| N8 build log | **Kept as N11** | Unchanged. |
| — | **N1 new** | The positioning reset itself, as correction 1 of 4. |
| — | **N2 new** | The 8 calculators. The strongest asset a pre-launch list can be given. |
| — | **N5 new** | The retired competitive claim. Correction 4 of 4. |
| L1 pre-launch | Kept | Slot guidance now ordered by pillar. |
| L2 launch day | **Re-pointed** | Pillars first, differentiators second. Split-test claim rewritten against `13-competitive-verification.md`. |
| L3 last call | Kept | Unchanged. |
| §8 never send | Kept, extended | Added the retired competitive claim, "yield optimization," "suspected bot," capitalized "Handshake," and calculator users as non-subscribers. |
| §9 metrics | Kept, extended | Added tool completion. |
| §10 open questions | Rewritten | 3 resolved, 2 new. |
