# Competitive Verification

Closes [#17](https://github.com/coreyhaines31/endpointforms/issues/17).

**All checks performed 2026-08-28.** Primary sources only: the vendors' own live pages, help centres, changelogs, and official community answers. No comparison blogs, no competitor-written pages about other competitors.

Two of the pages below (`help.heyflow.com`, `help.typeform.com`) sit behind Cloudflare bot protection and refuse plain HTTP fetches. They were retrieved in a real headed browser. Quoted text is copied from the rendered page.

---

## Headline: one finding weakens our positioning

**Heyflow does send a conversion value to Meta, not just a lead event.** It ships native server-side CAPI with a mappable `Value` + `Currency` parameter, and it markets in-funnel lead scoring specifically so that the score becomes the conversion value on the CAPI event. Heyflow's own words: *"Meta receives a Lead event with a value of 85 (hot) or 30 (cold) — not a binary '1 conversion.'"*

The sentence "competitors send the ad platform a lead, not a lead worth $X" is **false as literally written**, and we must stop saying it in that form.

The wedge survives, but on a narrower and more defensible axis. Heyflow's value is a **score computed from the lead's own in-form answers, fixed at submit time**. It is a prediction of quality made from self-reported data at the moment of capture. It is never revised by what actually happened. That distinction is real, it is documented in Heyflow's own copy, and it is the line we should be arguing on.

---

## Claim 1 — Does Typeform have native A/B / split testing?

### Verdict: **VERIFIED FALSE** — no native split testing, on any plan, as of 2026-08-28.

Scoped honestly: there is **no publicly documented native split-testing feature**. Every public surface Typeform controls was checked and none of them mention one. I did not have a logged-in Business/Enterprise account, so this is an argument from complete absence across pricing, product, reporting, changelog, and staff answers — which is strong, but is not the same as having looked inside the paid builder.

### Evidence

**1. Pricing page — `https://www.typeform.com/pricing/`** (checked 2026-08-28)

Plans listed: Basic $28/mo, Plus $56/mo, Business $91/mo, Talent $119/mo, Growth Flow $266/mo, Enterprise (custom). Full rendered page text searched for `a/b`, `split`, `variant`, `experiment` — **zero matches**. No plan gates a split-testing feature because no plan lists one.

**2. Product page — `https://www.typeform.com/product/`** (checked 2026-08-28)

Searched for `A/B`, `split test`, `variant`, `experiment`, `optimiz` — **zero matches**.

**3. Changelog — `https://help.typeform.com/hc/en-us/articles/29035269414036-Changelog`** (checked 2026-08-28)

Covers **June 2024 through August 2026** — 27 consecutive monthly entries. Searched for `a/b`, `variant`, `experiment`, `split`, `optimi`, `drop-off`. The only two hits are unrelated:

> "🧩 Add multiple questions to a form page: Group compatible questions on the same page from within the builder."

> "📈 Track email performance in Automations: Monitor the success of your automated email journeys with real-time metrics for delivery, open, and click rates. These insights help you understand respondent engagement and optimize your communication strategy directly within the platform."

No split-testing feature shipped in the last two years and three months.

**4. Typeform staff answers in Typeform's own community**

`https://community.typeform.com/build-your-typeform-7/hi-is-there-an-a-b-testing-option-available-4177` — accepted answer from Gabi Amaral, marked "Ex–Typeformer":

> "We do not have (yet) an A/B test feature. Most of our customers don't have enough traffic for it to be a viable option so it's not too off the list, but we do plan on getting to it. What you can do on this case is create 2 different forms and AB test the forms with other tools like your marketing tools."

Follow-up in the same thread from Liz, Typeform Tech Community Advocate:

> "This isn't currently on the roadmap, but if anything changes, we'll post about it here!"

`https://community.typeform.com/build-your-typeform-7/split-test-381` — accepted answer from Mariana, "Ex–Typeformer":

> "You could certainly duplicate your form to create two different variations, but we don't have an A/B testing option within the builder itself."

These posts are 4–5 years old. On their own they would be stale. Their weight comes from the changelog above showing nothing has shipped since.

**5. The documented workaround is exactly the "duplicate and split by UTM" pattern.** A community member's top-voted workaround assigns a random hidden variable at embed time:

> `hidden: { random_var : (Math.random()>0.5) ? 1 : 0 }`

...then branches on it with logic rules. Users are hand-rolling randomisation in JavaScript, which is only necessary because the product does not do it.

### Where the confusion comes from

Typeform's reporting page (`https://www.typeform.com/reporting`, checked 2026-08-28) is heavy on optimisation language that is **not** split testing:

> "RESPONSE SUMMARY — All your data, in one place. See how your form performs and what your responses are really telling you. Built-in analytics reveal completion rates, drop-offs, and patterns in your answers, so you can spot trends, find gaps, and take action."

> "AI ANALYSIS — Let AI do the digging. Automatically detect key topics and sentiment to uncover what people are really saying without having to read every reply. Then Ask AI questions about your data to surface even deeper insights."

That is drop-off reporting plus AI analysis of response *content*. It tells you where people quit and what they said. It does not split traffic across variants, and it does not compare variants. Secondary sources that skim this page and report "Typeform has optimization" are the likely origin of the "native split testing" claim.

### What we may publish — verbatim

> As of August 2026, Typeform has no native A/B or split testing. Its own help centre changelog covers every month from June 2024 to August 2026 without shipping one, and Typeform staff have told their community that to test variations you "create 2 different forms and AB test the forms with other tools."

> Typeform's Insights reporting shows completion rates and per-question drop-off, and its AI analysis summarises what respondents said. Neither splits traffic across variants, which is what a split test is.

### What we must NOT say

- ❌ "Typeform doesn't let you test anything." It ships drop-off analytics and AI response analysis. Both are real, and both are useful.
- ❌ "Typeform has no optimization features." Too broad, and disprovable from their reporting page in one click.
- ❌ Any claim that Typeform *removed* split testing, or that it is gated behind a specific plan. There is no evidence it ever existed, and no plan lists it.
- ❌ Stating flatly "Typeform will never build this." A staff member said the opposite: *"we do plan on getting to it."*
- ❌ Recycling the unverified figures our earlier research already caught — the free tier is not 10 responses/month and CAPTCHA is not gated at $199. Do not let those back in through a comparison table.

---

## Claim 2 — Do Heyflow and ROASForm send value-weighted conversions, or just lead events?

### Heyflow verdict: **sends a conversion value — VERIFIED TRUE.** Sends an *outcome*-weighted value — **VERIFIED FALSE.**

#### Evidence that Heyflow does send a value

**`https://help.heyflow.com/en/articles/11131573-track-heyflow-events-with-meta-conversions-api-capi`** — "Track Heyflow events with Meta Conversions API (CAPI)", page-dated **July 28, 2026**, checked 2026-08-28. Gated to "Insights Bundle (incl. in Scale)" and plans "Pro, Agency, Business".

> "You can currently select from the following Meta fields: Email, Phone, First Name, Last Name, Date of Birth, Gender, City, State, ZIP, Country, External ID, **Value and Currency**. Value and Currency always have to be sent together."

> "❗ Important: The data you mapped in your integration is only appended for **submit events**."

**`https://heyflow.com/blog/score-leads-automatically/`** — "Score Leads Automatically Based on Funnel Answers", published 29/04/2026, updated 08/05/2026, checked 2026-08-28. This is Heyflow's own property and is unambiguous:

> "Step 5: Pass the score as conversion value via CAPI. This is the step most teams skip entirely. The score becomes the conversion value in your server-side event. Meta receives a Lead event with a value of 85 (hot) or 30 (cold) — not a binary '1 conversion.' Over time, the algorithm learns which audiences, placements, and creatives produce high-scoring leads, and bids accordingly."

> "Native server-side CAPI for Meta, TikTok, and Bing. The calculated lead score passes directly as the conversion value in your server-side event — no GTM server container, no Stape setup, no manual offline import."

> "Google's Target ROAS and Maximize Conversion Value bid strategies, and Meta's Value Optimization setting, both consume this signal directly."

This is a real, shipped, marketed value-based-bidding capability. We must concede it.

#### Evidence that the value is fixed at submit time and never revised

**a) The value is appended only to submit events.** Quoted above — *"only appended for submit events."* There is no documented mechanism to send a later event that revises the value of an earlier conversion.

**b) The value is derived from the lead's own answers, not from anything that happened afterwards.** From the lead-scoring page:

> "In-funnel lead scoring is the practice of automatically assigning quality scores to leads based on their answers within an interactive funnel, at the exact moment of capture — before the lead ever reaches your CRM."

**c) Heyflow positions submit-time scoring as a *replacement* for outcome feedback, not a version of it.** Their own comparison table contrasts in-funnel scoring against CRM scoring on "Data freshness for ad algorithm": **"Immediate"** vs **"Stale by at least one business cycle"**. And:

> "In-funnel scoring passes conversion values to Meta and Google via CAPI at submission, enabling value-based bidding on current data rather than stale imports."

The "stale import" they are ruling out *is* the outcome-weighted signal. They have chosen speed over truth, and they say so.

**d) For real downstream outcomes, Heyflow tells you to do it yourself.** From `https://heyflow.com/blog/google-ads-conversion-tracking/` (published 12/06/2026, updated 17/08/2026, checked 2026-08-28):

> "Form submission is not the conversion that determines campaign profitability. For most lead generation businesses, the conversion that matters is 'qualified lead,' 'appointment held,' or 'deal closed,' events that happen in your CRM days or weeks after the form is submitted."

> "The offline conversion import workflow requires three things: the GCLID stored against each lead in your CRM, a conversion action in Google Ads mapped to each CRM stage you want to import, and a regular upload cadence that stays within the conversion window. **The upload can happen via the Google Ads UI (manual CSV), the Google Ads API, or through CRM integrations** that automate the process."

Heyflow's role in that workflow is capture and hand-off, not sending:

> "Heyflow captures GCLIDs automatically, passes them through to HubSpot and Salesforce, and supports partial lead capture for cleaner conversion signals."

Heyflow does not upload the outcome. Your CRM or your ops team does.

**e) Google Ads gets no value from Heyflow at all.** From the lead-scoring page: *"For Google Ads, Heyflow integrates client-side."* And the Google Ads help article (`https://help.heyflow.com/en/articles/11829503-track-heyflow-events-with-google-ads`, page-dated July 17, 2026) lists the field-mapping options as Email, Phone, First Name, Last Name, Street Address, City, State/Region, Postal Code, Country — **no Value field**. That same page instructs:

> "💡 Typically, for lead generation purposes, you would set the value as well as the count to One. Background: in most lead generation cases, in contrast to e-commerce, each lead should have the same value and should not submit more than once."

Heyflow's own Google Ads documentation tells customers to give every lead a value of one. That is the strongest single quote we have, and it comes from the competitor.

#### Heyflow split testing — native, and not outcome-scored

`https://help.heyflow.com/en/articles/12067244-a-b-testing-and-analytics`, page-dated July 17, 2026, gated to "Agency, Business" plans:

> "Conversion Rate: Measure how effectively your flow turns visitors into leads. Drop-off Rates: Identify where users are exiting and uncover opportunities for improvement on every page. Time to Complete: Understand how quickly users interact with your flow to assess their engagement levels."

Traffic-split A/B testing is real and native. Variants are scored on conversion rate, drop-off, and time to complete. **Not** on what the lead was worth. Past test data is retained for three months.

---

### ROASForm verdict: **VERIFIED FALSE** — it sends no conversions to ad platforms at all, valued or otherwise.

**`https://roasform.com/product/analytics`** (checked 2026-08-28):

> "No pixel setup, no third-party tracking scripts, no data stitching. Analytics is native to every form you build in ROASForm."

> "Track opt-in rate, qualification rate, and booked calls in real time."

> "Track the KPIs That Actually Drive Revenue"

The pages use "revenue" and "ROAS" heavily, but every metric named is an **internal dashboard** metric — opt-in rate, qualification rate, booked calls, show rate. Full rendered page text of the analytics, split-testing, and lead-scoring pages was searched for `pixel`, `capi`, `conversions api`, `server-side`, `meta`, `google ads`, `facebook`, `offline`, `bid`. The only `pixel` hit is the disclaimer above. There is **no Conversions API, no server-side ad integration, and no conversion-value passback**.

**Lead scoring goes to the CRM, not to an ad platform.** From `https://roasform.com/product/lead-scoring`:

> "Lead scores sync to GHL as custom field values. Tags are applied based on score ranges — so your workflows, pipelines, and automations know exactly who they're dealing with."

**Click IDs are captured, not acted on.** `https://www.roasform.com/product/url-parameters` captures "UTMs, gclid, fbclid, and custom parameters". Capture is not transmission.

#### ROASForm split testing — confirms the documented claim

`https://roasform.com/product/split-testing` (checked 2026-08-28):

> "Run your Type Skin against your Messenger Skin on the same form. **Traffic is split evenly** and results are tracked automatically: completion rate, drop-off points, and booked calls."

> "Stop guessing which version works better. See clear winners based on completion rate and booked calls, not just gut feel."

> "ROASForm measures user progression, qualification behavior, appointment activity, and conversion completion using centralized analytics connected directly to every split-test variant."

> "ROASForm connects split testing directly to booked-call performance instead of limiting reporting to basic submission metrics."

> "No Google Optimize (it's gone), no separate A/B testing tool, no JavaScript snippets. Split testing is native to every ROASForm you build."

Native split testing, even traffic split, scored on funnel-step movement through to booked calls. Every plan, per their pricing claim of "Unlimited split tests included. Every plan. No extra cost."

This is the closest competitor to our split-testing story. It is still scored on a **booked call**, not on what the booked call turned into.

---

### What we may publish — verbatim

> Heyflow can send Meta a conversion value, not just a lead event. Its native Conversions API integration maps a Value and Currency field, and its in-funnel lead scoring is designed so the score becomes that value. What it cannot do is change the number afterwards: Heyflow's documentation says mapped data is "only appended for submit events," and the score is calculated from the answers the lead typed, "at the exact moment of capture."

> Heyflow's value is a guess made at submit time from what the lead said about themselves. It is never corrected by what the lead turned out to be worth.

> For outcomes that happen later — a qualified lead, an appointment held, a deal closed — Heyflow's own guide hands the job back to you: the upload "can happen via the Google Ads UI (manual CSV), the Google Ads API, or through CRM integrations." Heyflow captures the GCLID and passes it to your CRM. Somebody else uploads the outcome.

> Heyflow's Google Ads integration has no value field at all, and Heyflow's own documentation tells customers that "in most lead generation cases... each lead should have the same value."

> ROASForm sends nothing to your ad platforms. Its analytics are deliberately self-contained — "no pixel setup, no third-party tracking scripts, no data stitching" — so its revenue metrics are numbers on its own dashboard, not signals Meta or Google can bid on.

> ROASForm's split testing is real and native: traffic is split evenly and variants are scored on completion rate, drop-off points, and booked calls. It scores movement through the funnel, which is further than most form builders go, and it stops at the booking.

> Heyflow's A/B testing scores variants on conversion rate, drop-off rate, and time to complete — how many people finished, not what finishing was worth.

### What we must NOT say

- ❌ **"Competitors send the ad platform 'a lead', not 'a lead worth $X'."** Retire this sentence. Heyflow sends a value. Anywhere it appears in existing copy it needs replacing with the submit-time-versus-outcome framing.
- ❌ "Heyflow can't do value-based bidding." It can, it documents it, and it names Target ROAS, Maximize Conversion Value, and Meta Value Optimization as the consumers of the signal.
- ❌ "Heyflow has no server-side tracking." It ships native server-side CAPI for Meta, TikTok, Taboola, Outbrain, and Bing with no GTM server container required. This is genuinely good and it is a real gap on our side, not theirs.
- ❌ "Heyflow has no A/B testing." It has native traffic-split A/B testing with per-screen drop-off, on Agency and Business plans.
- ❌ "ROASForm has no split testing." It has native even-split testing on every plan, scored through to booked calls.
- ❌ "ROASForm doesn't care about revenue." Their whole positioning is revenue metrics; the accurate criticism is that those metrics never leave their dashboard.
- ❌ Any claim about what Heyflow's paid builder does that rests on a blog post rather than the help centre. Heyflow's blog is a marketing surface and overstates in places — e.g. it describes "automatic lead scoring based on funnel answers to assign conversion values" as though it were one feature, when the help centre shows it is the Calculations feature plus a CAPI field mapping the customer wires up.
- ❌ Do not describe Heyflow's Meta value as "static" without qualification. It varies per lead. It is fixed *per submission*, which is the precise word.

---

## Re-verification before any comparison page ships

These are live pages under the competitors' control. Everything above is a snapshot of **2026-08-28** and several of these pages were updated within the last six weeks.

**Recheck all of the following, and update the date stamps, before publishing any comparison page. Then recheck quarterly.**

| What to recheck | Source | Why it could move | Risk if stale |
|---|---|---|---|
| Typeform split testing | `typeform.com/pricing`, `typeform.com/product`, changelog article `29035269414036` | Staff said "we do plan on getting to it." A single changelog entry flips this claim. | **High.** Publishing "no A/B testing" the month they ship it is exactly the failure we are positioning against. |
| Heyflow Meta CAPI value fields | `help.heyflow.com/en/articles/11131573-...` | Page-dated 2026-07-28 — actively maintained. Field list has grown before. | **High.** If they add post-submission value revision, our entire wedge closes. |
| Heyflow Google Ads value support | `help.heyflow.com/en/articles/11829503-...` | Currently no Value field. Google's Data Manager API migration (June 2026) makes adding one likely. | **High.** The "each lead should have the same value" quote is our best line and would vanish. |
| Heyflow lead-scoring / CAPI claims | `heyflow.com/blog/score-leads-automatically/` | Updated 08/05/2026. Marketing page, revised often. | Medium. Verify quotes still exist verbatim before citing. |
| Heyflow A/B test scoring metrics | `help.heyflow.com/en/articles/12067244-...` | Page-dated 2026-07-17. If they add a value or revenue metric to variant scoring, our split-testing differentiation narrows. | Medium. |
| ROASForm ad-platform integrations | `roasform.com/product/analytics`, `/split-testing`, `/lead-scoring`, `/url-parameters` | Early-stage product shipping fast; already captures gclid/fbclid, so a CAPI integration is a short step. | **High.** They are one release away from sending values. |
| Typeform pricing figures | `typeform.com/pricing` | Already burned us once via secondary sources. | **High.** Never cite Typeform pricing from memory or from a blog. Re-read the page. |

**Two standing rules.**

1. Never cite a competitor pricing or feature figure that has not been read off the vendor's own live page within the last 30 days. Our earlier Typeform research caught widely-circulated figures being wrong; the same thing will happen again.
2. `help.heyflow.com` and `help.typeform.com` block plain HTTP fetches behind Cloudflare and will fail silently or return a challenge page. Retrieve them in a real headed browser. A fetch tool returning 403, or returning the words "Just a moment" or "Performing security verification", is not evidence of anything — do not let a blocked fetch be recorded as "feature not found."

---

## Open items

- **Typeform's paid builder was not inspected from inside.** The finding is "no publicly documented native split testing across pricing, product, reporting, 27 months of changelog, and staff answers." If a comparison page needs to state this more strongly than that, someone should confirm on a Business-plan account.
- **Heyflow's Calculations feature was read about, not used.** The mechanics of how a calculated total is bound to the CAPI Value field are documented across two pages (Calculations, and the CAPI field-mapping step) but not in one place. A hands-on check would confirm whether the binding is as turnkey as the blog implies.
- **No Heyflow or ROASForm account was used.** Everything here is from public documentation. Both vendors gate the relevant features behind paid plans, so their in-product behaviour is unverified.
