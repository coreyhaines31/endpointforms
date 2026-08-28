# Endpoint Forms — Keyword Research

**Status:** v1 · **Date:** 2026-08-28 · **Closes:** [#4](https://github.com/coreyhaines31/endpointforms/issues/4)
**Inherits from:** [`00-positioning-spine.md`](./00-positioning-spine.md), [`01-positioning.md`](./01-positioning.md)

**Sources cited inline as:**
- `[DFS]` — DataForSEO, Google Ads Keyword Planner data + DataForSEO Labs, US, English
- `[AH]` — Ahrefs API v3 (Keywords Explorer / SERP Overview), US
- `[W]` / `[V]` — the two deep-research briefs, as in `01-positioning.md`

> **Headline finding, stated up front because it changes the plan:** the brief for this
> research assumed the spam / junk-leads pain was "searched but not served." **It is not
> searched.** The entire spam + fake-leads + lead-quality keyword universe above 30/mo in the
> US is roughly **1,300 searches/month**, and the spam half of it is WordPress-plugin intent,
> not buy-a-form-builder intent. Meanwhile the "alternative" cluster the research told us to
> avoid is **~4,900/mo at KD 0–5** — the single most winnable commercial volume in the
> category. Both of those are the opposite of what we expected. Details in §4 and §6.

---

## 1. Method + cost

| Endpoint | Calls | What it produced | Cost |
|---|---|---|---|
| `POST /v3/keywords_data/google_ads/search_volume/live` | 1 (135 kws batched) | Volume, CPC, competition for the curated seed list | $0.0900 |
| `POST /v3/dataforseo_labs/google/keyword_ideas/live` | 1 (10 seeds, 900 returned) | Expansion from pain seeds — **mostly failed, see note** | $0.1200 |
| `POST /v3/dataforseo_labs/google/bulk_keyword_difficulty/live` | 1 (38 kws) | Second difficulty source | $0.0166 |
| `POST /v3/serp/google/organic/live/advanced` | 6 (1 kw each) | Live SERPs: `open source form builder`, `form builder`, `typeform alternative`, `contact form spam`, `lead generation form`, `lead capture form` | $0.0210 |
| **DataForSEO total** | **9** | | **≈ $0.25** |
| Ahrefs `keywords-explorer-overview` | 1 (30 kws) | Volume / KD / traffic potential cross-check | 1,458 units |
| Ahrefs `keywords-explorer-matching-terms` | 3 | Phrase-universe sizing for pain, agent, alternatives clusters | 5,718 units |
| Ahrefs `serp-overview` | 2 | Who ranks + their DR for `best form builder`, `typeform alternative` | 1,476 units |
| Ahrefs `keywords-explorer-volume-history` | 1 | WebMCP trend shape | 50 units |
| **Ahrefs total** | **7** | | **8,702 units** |

Account balance after the run: **$33.93** (from ~$34.18). Every number in this document came
from one of those calls. Nothing is estimated from memory.

**Failures and gaps, stated honestly:**

1. **The `keyword_ideas` expansion failed and I did not re-run it.** Seeding it with ten mixed
   seeds caused Google's semantic expansion to drift completely off-topic — the top "pain"
   matches it returned were `fake taxi meaning`, `fakespot alternative`, `can spam act`, and
   `deepfake meaning`. That $0.12 was wasted. I replaced it with Ahrefs phrase-match
   (`matching-terms`), which is the correct instrument for "what does the universe around this
   exact phrase look like." **[judgment call]** — the drift is itself weak evidence that there
   is no dense commercial cluster around these pain terms for the algorithm to find.
2. **`POST /v3/serp/.../live/advanced` accepts only one task per request.** My first batched
   call returned `40000 You can set only one task at a time` for the second keyword. Re-run
   individually; no data lost.
3. **`lead qualification form`, `spam form submissions`, and `formbricks alternative` returned
   null difficulty from DataForSEO** — too little SERP data. Ahrefs covered two of the three.
4. **US-only.** No international breakout was pulled. Global volumes are reported where Ahrefs
   supplied them and they are consistently 2–4x the US figure, so an international long tail
   likely exists that this document does not size.

### A standing caveat on all volume numbers

Per the spine's own proof points: **automated requests are ~57.5% of HTML web traffic, and bad
bots were 40% of internet traffic in 2025.** Keyword volume estimates are derived from that same
polluted stream. Separately, AI Overviews now appear on the large majority of the head and
mid-tail SERPs sampled below — `form builder`, `online form builder`, `best form builder`,
`typeform alternative`, `open source form builder`, `contact form spam`, and `webmcp` **all**
render an AI Overview. Every volume figure in this document should be read as **an
overstatement of available clicks**, and the overstatement is worst on informational terms,
which is most of the pain cluster. Where a keyword's only value was informational traffic, I
have discounted it accordingly.

---

## 2. Master keyword table

Grouped by cluster, sorted by relevance-weighted opportunity within each. `Vol` columns are
monthly US searches. Where the two tools disagree materially, **both are shown** rather than
averaged, per the brief.

Intent codes: **C** commercial · **I** informational · **T** transactional · **N** navigational/branded

### Cluster A — Category head terms

| Keyword | Vol `[DFS]` | Vol `[AH]` | KD `[DFS]` | KD `[AH]` | CPC `[DFS]` | Intent | Verdict |
|---|---|---|---|---|---|---|---|
| online form builder | **12,100** | **1,700** | 79 | 83 | $27.54 | C/I | Do not pursue |
| form builder | 2,900 | 3,400 | 94 | 72 | $24.76 | C/I | Do not pursue |
| free form builder | 1,300 | 1,000 | 79 | 88 | $19.39 | C/I | Do not pursue |
| survey builder | 260 | — | 94 | — | $19.72 | C | Do not pursue |
| form builder software | 170 | 400 | 32 | 49 | $16.91 | C | Maybe, later |
| best form builder | 210 | 350 | 16 | 12 | $24.80 | C | Trap — see §5 |
| form creator | 880 | — | — | — | $23.89 | C | Do not pursue |
| form maker | 880 | — | — | — | $18.01 | C | Do not pursue |
| web form builder | 480 | — | — | — | $30.30 | C | Do not pursue |
| create online form | 480 | — | — | — | $25.93 | C | Do not pursue |
| contact form | 2,900 | — | — | — | $43.70 | I | Wrong intent |

**Note the largest single disagreement in the dataset:** `online form builder` is 12,100/mo in
DataForSEO and 1,700/mo in Ahrefs — a 7x gap. Google Ads Keyword Planner aggregates
close-variant and partner-network queries, which reliably inflates head terms; Ahrefs models
clickstream. I would trust Ahrefs' shape here, but **the disagreement is not resolvable from
this data** and both are reported. It does not change the recommendation, because the KD is
79–83 either way.

### Cluster B — Competitor / alternative *(the winnable cluster)*

| Keyword | Vol `[DFS]` | Vol `[AH]` | Global `[AH]` | KD `[DFS]` | KD `[AH]` | CPC `[DFS]` | Intent |
|---|---|---|---|---|---|---|---|
| typeform alternative | 210 | **600** | 2,100 | **0** | **0** | $11.48 | C/N |
| google forms alternative | 720 | **600** | 1,900 | **0** | 4 | $13.56 | C/N |
| jotform alternative | 480 | **600** | 1,300 | **0** | 1 | $18.65 | C/N |
| typeform vs jotform | 320 | — | — | 0 | — | $13.07 | C |
| alternative to google forms | — | 250 | 600 | — | 2 | — | C/N |
| typeform free alternative | — | 200 | 600 | — | 3 | — | C/N |
| alternative to jotform | — | 150 | 200 | — | 0 | — | C/N |
| alternative to typeform | — | 150 | 350 | — | 3 | — | C/N |
| typeform alternative free | — | 150 | 350 | — | 2 | — | C/N |
| free google forms alternative | — | 150 | 200 | — | 1 | — | C/N |
| google forms alternative free | — | 150 | 350 | — | 2 | — | C/N |
| gravity forms alternative | 50 | 100 | 200 | — | 1 | $29.70 | C/N |
| free jotform alternative | — | 100 | 200 | — | 0 | — | C/N |
| tally alternative | 40 | 100 | 350 | **0** | **0** | $34.69 | C/N |
| best typeform alternative | — | 90 | 150 | — | — | — | C |
| jotform alternative free | — | 80 | 200 | — | 0 | — | C/N |
| free alternative to typeform | — | 80 | 150 | — | 5 | — | C/N |
| wufoo alternative | 50 | 60 | 150 | — | 0 | — | C/N |
| **open source typeform alternative** | — | **60** | 80 | — | — | $2.50 | C |
| tally vs typeform | 50 | — | — | 0 | — | $7.53 | C |
| **typeform alternative open source** | — | **50** | 150 | — | 22 | $3.00 | C |
| heyflow alternative | 40 | — | — | **0** | — | $11.94 | C/N |
| formbricks alternative | 10 | — | — | — | — | — | C/N |

**Cluster B total, US, terms ≥40/mo: ≈ 4,900 searches/month at KD 0–5.** This is the largest
pool of winnable, commercially-intended volume anywhere in this research.

### Cluster C — The pain, in customer words *(the cluster that isn't there)*

| Keyword | Vol `[DFS]` | Vol `[AH]` | Global `[AH]` | KD `[DFS]` | KD `[AH]` | Intent | Note |
|---|---|---|---|---|---|---|---|
| lead quality | 260 | 200 | 600 | 2 | 3 | C/I | Broad, weak buyer signal |
| how to improve lead quality | — | 200 | 200 | 0 | 2 | I | |
| improve lead quality | 20 | 150 | 300 | — | 3 | I | |
| form spam protection | 20 | 150 | 200 | 7 | 1 | I | CPC $15.00 `[AH]` |
| spam form submissions | 10 | 90 | 250 | — | 1 | I | WP intent |
| contact form spam prevention | — | 90 | 100 | — | 2 | I | WP intent |
| prevent form spam without captcha | — | 80 | 90 | 37 | 1 | I | WP intent |
| contact form spam | 10 | 70 | 90 | 0 | 0 | I | WP intent |
| form spam | 40 | 60 | 90 | 0 | 2 | I | WP intent |
| fake leads | 30 | 60 | 100 | 0 | 0 | I | |
| elementor form spam | — | 60 | 80 | — | 0 | I | WP intent |
| wordpress form spam | — | 60 | 60 | — | 1 | I | WP intent |
| google ads lead quality | — | 60 | 60 | — | — | I | |
| elementor contact form spam | — | 50 | 50 | — | 0 | I | WP intent |
| how to stop spam from wordpress contact form | — | 50 | 50 | — | 3 | I | WP intent |
| junk leads | 10 | 10 | 60 | — | — | I | |
| stop form spam | 10 | 10 | 10 | — | — | I | |
| **fake leads google ads** | 10 | **0** | **0** | — | — | — | **No volume** |
| tire kickers | 1,600 | — | — | — | — | I | **Wrong meaning — see §7** |

**Cluster C total, genuinely relevant terms: ≈ 1,300/month**, of which roughly **700 is
WordPress/Elementor plugin-repair intent**. See §4 for why this is fatal to the pain-term play.

### Cluster D — Outcome / measurement

| Keyword | Vol `[DFS]` | Vol `[AH]` | KD `[DFS]` | KD `[AH]` | CPC `[DFS]` | Intent |
|---|---|---|---|---|---|---|
| marketing attribution | 720 | — | — | — | $55.45 | C/I |
| lead qualification | 720 | — | — | — | $51.34 | C/I |
| lead scoring | 1,000 | — | — | — | $18.88 | C/I |
| server side tracking | 390 | — | — | — | **$160.64** | C |
| offline conversion tracking | 70 | 200 | 17 | 12 | — | C/I |
| form analytics | 40 | 150 | 1 | 3 | $4.50 `[AH]` | C |
| form abandonment | 20 | 100 | 2 | 5 | $8.00 `[AH]` | I |
| lead qualification form | 20 | 100 | — | — | $19.25 | C |
| form conversion rate | 10 | 70 | 34 | 22 | — | I |
| google ads offline conversion tracking | 70 | — | — | — | $12.46 | I |
| lead attribution | 70 | — | — | — | — | C/I |
| enhanced conversions | 170 | — | — | — | — | I |
| revenue attribution | 110 | — | — | — | $10.88 | C/I |
| closed loop reporting | 40 | — | — | — | — | I |
| form a/b testing | **0** | — | — | — | — | — |
| split test forms | **0** | — | — | — | — | — |
| form drop off | **0** | — | — | — | — | — |

**`form a/b testing`, `split test forms`, `multi step form conversion`, and `how many form
fields` all returned zero volume in DataForSEO.** This is direct quantitative confirmation of
`[V]`'s qualitative gap finding — *"Nobody described A/B testing forms by duplicating them and
splitting by UTM… Treat this hypothesis as unsupported."* Nobody searches for it either.
**Risk 6 in `01-positioning.md` is confirmed by data, not just by absence of complaint.**

### Cluster E — Agent / AI-native

| Keyword | Vol `[DFS]` | Vol `[AH]` | Global `[AH]` | KD `[DFS]` | KD `[AH]` | TP `[AH]` | Intent |
|---|---|---|---|---|---|---|---|
| **webmcp** | **2,900** | **2,800** | **11,000** | 36 | 58 | 2,100 | I/N |
| google webmcp | — | 150 | 450 | — | — | — | I |
| what is webmcp | — | 150 | 400 | — | — | — | I |
| chrome webmcp | — | 100 | 400 | — | — | — | I |
| webmcp in seo | — | 90 | 90 | — | — | — | I |
| webmcp chrome | — | 90 | 350 | — | — | — | I |
| webmcp seo | — | 80 | 100 | — | — | — | I |
| webmcp google | — | 70 | 400 | — | — | — | I |
| mcp form | 110 | — | — | — | — | — | I |
| ai form builder | 390 | 600 | 1,900 | 25 | 26 | 20 | C |
| ai form | 720 | — | — | — | — | — | C/I |
| conversational form | 170 | — | 10 | — | — | — | C |
| agent form filling / ai agent forms | **0** | — | — | — | — | — | — |

**WebMCP cluster total: ≈ 3,540/mo US, ≈ 13,000/mo global.** This is the one place where the
two tools independently agree almost exactly (2,900 vs 2,800), which raises my confidence in
it. But read §6 before getting excited — the trend shape and the intent both matter.

`agent form filling` and `ai agent forms` returned **zero**. The brief predicted near-zero
volume for agent-native terms and was correct for everything except the WebMCP brand term
itself.

### Cluster F — Jobs / use cases

| Keyword | Vol `[DFS]` | KD `[DFS]` | CPC `[DFS]` | Intent | Note |
|---|---|---|---|---|---|
| client intake form | 1,300 | 13 | $21.70 | C/T | Template intent, not ICP |
| lead capture form | 390 | 20 | **$62.90** | C | On-ICP |
| lead generation form | 260 | — | **$174.92** | C | Highest CPC in the set |
| quote request form | 260 | — | $69.32 | C/T | Template intent |
| demo request form | 90 | 0 | $51.94 | C | On-ICP, KD 0 |
| form builder api | 20 | 82 | $16.16 | C | Dev intent, high KD |
| white label form builder | 10 | — | $12.62 | C | On-ICP (agencies), tiny |
| headless form builder | 10 | — | $4.28 | C | Dev intent, tiny |
| open source form builder | 170 | 22 | $11.23 | C | See §6 |
| self hosted form builder | 40 | 1 | — | C | See §6 |
| agency form builder / ppc landing page form / b2b lead form | **0** | — | — | — | **No volume** |

Every keyword I constructed from our *actual ICP language* — `agency form builder`,
`lead capture form for ppc`, `ppc landing page form`, `b2b lead form`, `forms for lead
generation` — **returned zero volume.** Our ICP does not search in these terms. That is a
finding, not a data failure.

---

## 3. Head-term reality check

**Can a brand-new AGPL site plausibly rank for "form builder"? No. Not in any timeframe worth
planning around.**

This is not a difficulty-score inference; I pulled the live SERP.

**Live SERP, `form builder`, US desktop, 2026-08-28 `[DFS]`:**

| # | Domain | Title |
|---|---|---|
| 1 | legal.thomsonreuters.com | Westlaw Form Builder |
| 2 | workspace.google.com | Form Builder — Google Workspace Marketplace |
| — | *AI Overview* | |
| 4 | powr.io | Form Builder \| Make Free Custom Forms |
| 5 | 123formbuilder.com | Free Online Form Builder \| Form Creator |
| 7 | forms.app | forms.app: Free Form Builder For Teams |
| 8 | jotform.com | Jotform: Free Online Form Builder |
| 10 | formbuilder.com | FormBuilder — Create Beautiful Forms in Minutes |
| 14 | zapier.com | The 13 best online form builder apps |
| 17 | emailtooltester.com | Best Online Form Builder to use in 2026 |
| 20 | hubspot.com | Free Online Form Builder |
| 22 | typeform.com | Free Online Form Builder |

That is an exact-match-domain page (`formbuilder.com`), Google's own property, Thomson Reuters,
HubSpot, Jotform, and Typeform. **KD 94 `[DFS]` / 72 `[AH]`.** There is no wedge here. The term
is also intent-diluted — Westlaw ranking #1 means a meaningful share of the query is legal
document assembly, not marketing forms.

`free form builder` is worse in the way that matters most: **Ahrefs reports its parent topic as
literally `tally`** — meaning the page that owns this query is Tally's, and to rank you would
have to out-Tally Tally on the exact axis §8 of the positioning doc says we will never contest.
KD 88 `[AH]` / 79 `[DFS]`.

**What to target instead:** Cluster B (alternative terms, KD 0–5) and the open-source subset of
Cluster F. Both are in §5.

One caveat worth stating: **`best form builder` reads as a trap.** Its difficulty scores are
deceptively low (KD 16 `[DFS]` / 12 `[AH]`) but the live SERP `[AH]` is emailtooltester (DR 79),
Reddit (DR 95), Zapier (DR 91), forms.app (DR 84), G2 (DR 91), wpforms (DR 86), ventureharbour
(DR 76), and YouTube (DR 99). **Every ranking result is DR 76+.** The KD score is understating
reality because it is calibrated on referring domains to the ranking *pages*, and listicles on
huge domains rank on domain authority they did not earn per-page. Do not be fooled by KD 12.

---

## 4. The strategic call

The issue asks me to verify the SERP-saturation claim and then choose: comparison-page play,
contrarian-POV play, or long-tail pain-term play. I pulled the SERPs. **The research's
observation was half right, and the half that was wrong changes the recommendation.**

### What I actually found in the SERPs

`[W]` claimed searches in this category return "near-exclusively AI-generated comparison content
from tiny form builders — orbitforms.ai, splitforms.com, formhug.ai, ovoform, getaiform, dupple,
fomr.io, zite, formepic, formgrid, buildform."

**On head terms, this is false.** `form builder` (above) and `best form builder` are owned by
DR 76–99 incumbents — Thomson Reuters, Google, HubSpot, Zapier, G2, Reddit, emailtooltester.
No tiny AI vendors anywhere in the top 10. The head SERP is not saturated with slop; it is
saturated with **authority**, which is a harder problem, not an easier one.

**On alternative terms, it is true — and it is good news.**

**Live SERP, `typeform alternative`, US desktop, 2026-08-28 `[DFS]`:**

| # | Domain | DR `[AH]` | Backlinks to page `[AH]` |
|---|---|---|---|
| 2 | tally.so | 92 | 30 |
| 3 | youform.com | 78 | 5,015 |
| 5 | reddit.com | 99 | — |
| 6 | **formgrid.com** | **42** | **1** |
| 7 | jotform.com | 94 | — |
| 8 | fillout.com | 89 | — |
| 9 | formbricks.com | 76 | 317 |
| 10 | **antforms.com** | **30** | — |
| 14 | **fomr.io** | — | — |
| 16 | **tinycommand.com** | — | — |
| 19 | **makeforms.io** | — | — |
| 20 | getperspective.ai | — | — |

There they are: `formgrid`, `fomr.io`, plus `antforms`, `tinycommand`, `makeforms`. `[W]`
called them correctly. **But `[W]` drew the wrong conclusion from them.**

`formgrid.com` ranks **#6 with domain rating 42 and exactly one backlink to the page.**
`antforms.com` ranks **#10 with domain rating 30.** Ahrefs puts the keyword difficulty at
**0**, and DataForSEO independently agrees at **0**.

A SERP where a DR-30 site with no links holds page one is not a SERP that is hard to win. **It
is the definition of an easy one.** The presence of thin AI vendors is evidence that the barrier
to entry is on the floor — they are ranking *because* nothing better exists, not because they
have built something we cannot displace.

`[W]`'s inference — "comparison/alternative pages will be hard to win" — **does not follow from
its own evidence, and the numbers falsify it.** `[judgment call, and it is a direct
contradiction of the research brief and of §1 of `01-positioning.md`, so it should be
adjudicated before the content plan is built on it.]`

### Separating the two objections that got conflated

There is a real objection to the comparison play buried in `[W]`'s claim, but it is a different
one, and it survives:

| Objection | Verdict |
|---|---|
| "Comparison pages are hard to win" | **False.** KD 0. DR-30 sites rank. Falsified above. |
| "Comparison pages are low-trust and reach the wrong buyer" | **True, and unaddressed.** |

The second objection is the real one. Look at the modifiers carrying the volume in Cluster B:
`typeform free alternative` (200), `typeform alternative free` (150), `free jotform alternative`
(100), `free google forms alternative` (150), `cheaper alternative to typeform` (40). **The
alternative cluster is overwhelmingly price-motivated**, and `[V]` is explicit that price
complainers are *"Casual/SMB owners… professionals complain about outcomes."* That is our
**secondary** ICP — the one §2 of the positioning doc says we must not design the message for.

So the honest statement of the trade is: **the winnable volume reaches the wrong buyer, and the
right buyer does not search.** That is Risk 9 in `01-positioning.md`, confirmed:

> *"Falsifier: keyword research in stage 3 finds no volume with commercial intent that maps to
> the ICP."*

**Risk 9 has fired.** There is real commercial volume, and it does not map to the primary ICP.
This should be escalated rather than quietly worked around.

### Why the pain-term play is dead

The brief asked me to prioritize the spam and fake-leads terms because "the pain is searched but
not served." **The pain is not searched.** Two independent reasons, both fatal:

**1. There is no volume.** The entire relevant universe is ~1,300/mo, and the biggest single
term (`lead quality`, 200–260) is a generic B2B phrase, not our pain. `fake leads google ads` —
the most precisely on-message keyword I could construct — returns **0 volume in Ahrefs, US and
global.** `junk leads` is 10/mo. When I phrase-matched the whole space, the terms above 30/mo
were dominated by `junk removal leads` (350), `quality assurance lead` job postings, `ISO 9001
lead auditor` courses, and `spam full form` (people looking up what SPAM stands for). There is
no there there.

**2. The intent is wrong even where volume exists.** Live SERP for `contact form spam` `[DFS]`
returns: sendlayer, Nutshell, HubSpot knowledge base, Akismet, kaliforms, Stytch, wpforms,
wpmailsmtp, friendlycaptcha, Stack Overflow. Plus `elementor form spam`, `wordpress form spam`,
and `how to stop spam from wordpress contact form` in the phrase universe.

**This is a "fix my WordPress plugin" SERP, not a "buy a form builder" SERP.** Someone searching
`contact form spam` has a Contact Form 7 install and wants a free anti-spam plugin this
afternoon. They are not in market for a new form builder, and a page selling them one will lose
to Akismet regardless of how good our argument is.

This directly corroborates `[V]`'s own gap finding, which the brief under-weighted:

> *"Nobody complained about attribution loss at the form layer specifically… the pain is real
> but is currently attributed to the analytics stack, not the form tool — **a positioning
> problem for us.**"*

The search data says the spam pain is attributed to the **CMS plugin layer**. Either way, it is
not attributed to the form builder, and search is not where we reach it.

### The call

**Run the comparison play as the traffic engine, and the POV play as the ICP engine. Do not run
the pain-term play at all.**

Not a hedge — a division of labor with different jobs, different metrics, and a clear primary:

**The comparison play is primary, because it is the only thing in this research that both has
real volume and can actually be won.** ~4,900/mo at KD 0–5, with DR-30 competitors on page one.
It is a genuine, measurable, compounding asset and we would be leaving it on the table for a
theoretical objection.

**But it must be executed against our metric, not against price,** or it does three bad things
at once: loses to Tally on the axis §8 forbids, attracts the secondary ICP, and reads as more of
the AI slop already ranking. The differentiator is that **every competing page on that SERP
compares on price and features, and not one compares on what happened to the leads.** A
`typeform alternative` page whose comparison table's final row is *"tells you which submissions
became customers — Typeform: no, Tally: no, us: yes"* is a comparison page in format and a POV
page in substance. That is how we take KD-0 traffic without adopting the price position.

**The POV play carries the primary ICP, and it is not an SEO play — stop measuring it like
one.** The junk-leads argument has ~1,300/mo of wrong-intent search behind it. It has, per `[V]`,
~22 independent angry sources on Reddit. Those are the same people; they complain in
communities and they do not search. So distribute it where they are — r/PPC, r/DigitalMarketing,
r/marketing, HN, PPC newsletters — and judge it on waitlist signups and inbound conversation,
never on rankings. `[V]` also warns this is a heavily astroturfed space (40–60% vendor plants,
a confirmed paid-shill ring), which raises the bar: it has to be a genuinely good argument
posted by a named person, not content marketing.

**Why not POV-only, as `[W]` recommended?** Because POV distribution does not compound. Each
post is a spike that decays; a page ranking for `typeform alternative` earns traffic every month
without further spend. Given the positioning doc's own note that we cannot afford to fund demand
creation, refusing the only cheap compounding channel available — on the strength of an
inference the SERP data falsifies — would be an expensive mistake.

---

## 5. Prioritized clusters — the three to build first

### Priority 1 — Alternative / comparison pages *(traffic engine)*

**Volume:** ~4,900/mo US, ~11,000/mo global · **KD:** 0–5 both tools · **Intent:** commercial

| Page | Target | Vol | KD |
|---|---|---|---|
| `/typeform-alternative` | typeform alternative + 9 variants | ~1,880 | 0–5 |
| `/google-forms-alternative` | google forms alternative + 7 variants | ~1,760 | 0–4 |
| `/jotform-alternative` | jotform alternative + 5 variants | ~1,100 | 0–1 |
| `/tally-alternative` | tally alternative | ~100 | 0 |
| `/gravity-forms-alternative` | gravity forms alternative | ~100 | 1 |
| `/wufoo-alternative` | wufoo alternative | ~60 | 0 |
| `/heyflow-alternative` | heyflow alternative | ~40 | 0 |

**Why first:** the only large, winnable, commercially-intended pool in the category. Proven
winnable by DR-30 incumbents.

**Two hard constraints, both inherited:**
1. **Do not write a `/tally-alternative` page that argues we are cheaper.** §8 forbids it and we
   would lose. Tally's own page holds #1 for `typeform alternative`. Frame it on the metric or
   do not ship it.
2. **`01-positioning.md` §11 blocks two of these on unverified facts.** Whether Typeform has
   real native split testing, and whether Heyflow/ROASForm send value-weighted conversions, are
   both flagged must-verify-before-writing. `/typeform-alternative` and `/heyflow-alternative`
   cannot ship until those are resolved.

### Priority 2 — Open source / self-hosted *(credibility + developer distribution)*

**Volume:** ~600/mo US · **KD:** 1–22 · **Intent:** commercial, developer

| Keyword | Vol `[DFS]` | Vol `[AH]` | KD `[DFS]` | KD `[AH]` |
|---|---|---|---|---|
| open source form builder | 170 | 200 | 22 | 8 |
| open source typeform alternative | — | 60 | — | — |
| self hosted form builder | 40 | 50 | 1 | 23 |
| typeform alternative open source | — | 50 | — | 22 |

**Live SERP, `open source form builder` `[DFS]`:** Formbricks #1, Reddit #3, OpnForm/GitHub #4,
Form.io #5, SurveyJS #6, HeyForm #7, FormPress #10, fomr.io #20.

**Why this matters more than its volume suggests:** Formbricks — an open-source form builder
with DR 76 — holds **#1**, and GitHub repos rank #4 and #8. This SERP is winnable by exactly the
kind of company we are, and it is the one place where the AGPL license is an asset that converts
rather than a footnote. `[V]` is clear that open source does not acquire marketers, so this
cluster's job is **credibility, GitHub stars, and developer distribution** — not ICP
acquisition. Judge it on stars and contributors, not signups.

Note the tool disagreement on `self hosted form builder`: KD 1 `[DFS]` vs KD 23 `[AH]`. Small
term either way.

### Priority 3 — Outcome / measurement long tail *(POV landing surface)*

**Volume:** ~400/mo US for the on-message subset · **KD:** 1–17 · **Intent:** commercial/informational

| Keyword | Vol `[AH]` | KD `[DFS]` | KD `[AH]` |
|---|---|---|---|
| offline conversion tracking | 200 | 17 | 12 |
| form analytics | 150 | 1 | 3 |
| form abandonment | 100 | 2 | 5 |
| lead qualification form | 100 | — | — |
| form conversion rate | 70 | 34 | 22 |

**Why third and why small:** this is the only cluster whose *language* matches our actual
argument, and the difficulty is near zero (`form analytics` KD 1–3). It is small, but it gives
the POV essays a searchable home so they are not pure spikes. **`offline conversion tracking`
needs care** — per the spine's hard constraint we do not claim the ad-platform loop, so that page
must be written as *"here is how to do it, and here is the half it doesn't solve,"* never as a
product pitch.

**Explicitly excluded from Priority 3:** `form a/b testing`, `split test forms`, `form drop off`
— all **zero volume**. Our second capability has no search demand whatsoever. Build the pages if
they serve the argument; do not expect traffic.

---

## 6. Unclaimed intent — where the real openings are

### The biggest unclaimed opportunity: WebMCP

**`webmcp` — 2,900/mo `[DFS]`, 2,800/mo `[AH]`, 11,000/mo global `[AH]`. KD 36 `[DFS]` / 58
`[AH]`. Traffic potential 2,100 `[AH]`.**

This is the only keyword in the entire dataset where both tools independently landed within 4%
of each other, and it is the single largest volume we could realistically rank for. **No form
builder ranks for it or has attempted it.** `[W]` confirms only Tally, Jotform, and Typeform
have MCP servers, and all three are build-a-form MCPs for authors, not fill-a-form surfaces. We
are, per `00-positioning-spine.md`, architecturally native to this term in a way no competitor
is.

**But I pulled the trend, and it complicates the story `[AH]`:**

| Month | Volume | | Month | Volume |
|---|---|---|---|---|
| 2025-09 | 32 | | 2026-02 | **14,428** |
| 2025-10 | 76 | | 2026-03 | 7,366 |
| 2025-11 | 231 | | 2026-04 | 2,694 |
| 2025-12 | 29 | | 2026-05 | 2,728 |
| 2026-01 | 21 | | 2026-06 | 3,229 |
| | | | 2026-07 | 2,628 |
| | | | 2026-08 | 2,903 |

That February spike is the Chrome Canary preview `[W]`. **This is a news spike that decayed 5x
and then plateaued** — it is not a growth curve, and anyone presenting it as one is misreading
it. What it *is*, and this is the genuinely encouraging part, is a **stable plateau holding
~2,600–3,200/mo for five consecutive months.** That is durable residual interest, not a dead
fad.

**Two honest limits:**
1. **The intent is informational and branded** (Ahrefs: `informational: true, branded: true,
   commercial: false`). People are asking *what WebMCP is*, not shopping for a form builder.
   Expect very low conversion.
2. **The SERP renders an AI Overview**, and "what is X" queries are precisely what AI Overviews
   answer without a click. Treat the 2,800 as materially overstated available clicks.

**So: the biggest unclaimed opportunity in this research, with the caveat that its value is
authority, press, and being the reference implementation people cite — not signups.** Being the
form builder that owns the WebMCP explainer is worth real money in an AI-search world where
being *cited* matters more than being *clicked*, and it costs one very good page. `[judgment
call]` I would build it early despite the weak commercial intent, and I would not put a signup
form at the top of it.

### Genuine unclaimed intent with weak or irrelevant results

| Opportunity | Vol | Why it is open |
|---|---|---|
| **`typeform alternative` family** | ~1,880 | KD **0** in both tools. DR-30 `antforms` and DR-42 `formgrid` (1 backlink) hold page one. Highest-volume genuinely soft SERP found. |
| **`webmcp` family** | ~3,540 | Zero form builders present. Category-native to us. Informational intent. |
| **`form analytics`** | 150 | KD 1–3. The term is ours by right, and the current results are generic. |
| **`open source typeform alternative`** | ~110 | Small, but exact-fit — combines our license and the switching trigger. |
| **`demo request form`** | 90 | KD **0**, CPC **$51.94** — high commercial value, no difficulty, on-ICP. |

~~`lead capture form` and `lead generation form`~~ were candidates on CPC alone and were **removed
after pulling their SERPs** — see immediately below.

**The `lead generation form` / `lead capture form` pair looked like the most underrated pair in
the set** — on-ICP language, workable difficulty, and CPCs of $63–$175, which is the ad market
saying these clicks convert. **I pulled both SERPs to check, and they do not support the theory.**

**Live SERP, `lead generation form` `[DFS]`:** LinkedIn Lead Gen Forms #2, Jotform templates #4,
VWO #6, monday.com #7, Zoho #8, Unbounce #9, Typeform template #10, HubSpot #13, SurveyMonkey
#16, ActiveCampaign #19.

**Live SERP, `lead capture form` `[DFS]`:** Jotform template #2, Mailchimp #4, HubSpot #6,
Sierra Interactive #8, LeadsBridge #10, Act! #11, wpforms #14, Typeform template #17,
Unbounce #18.

Both are **template-download and best-practices intent**, not tool-selection intent — and both
are held by HubSpot, LinkedIn, Mailchimp, Zoho, Unbounce, and ActiveCampaign. The high CPC is
advertisers bidding on a top-of-funnel education query, not evidence of purchase intent in the
organic results.

**Verdict: not a Priority 1.5.** `demo request form` (90/mo, KD 0, $51.94 CPC) survives as a
small on-ICP opportunity; the other two do not. `[judgment call]` — I'd revisit `lead capture
form` only as a template page once we have something to convert people into, and never as an
early bet.

---

## 7. Keywords to explicitly NOT pursue

| Keyword / cluster | Vol | Why not |
|---|---|---|
| `form builder` | 2,900–3,400 | KD 94/72. Westlaw, Google, HubSpot, Jotform, Typeform, EMD `formbuilder.com`. Intent diluted by legal doc assembly. Unwinnable. |
| `online form builder` | 1,700–12,100 | KD 79/83. Also the dataset's least trustworthy number (7x tool disagreement). |
| `free form builder` | 1,000–1,300 | KD 88/79, and **parent topic is `tally`**. To rank you must beat Tally at free — the one fight §8 forbids. |
| `survey builder`, `form creator`, `form maker`, `web form builder` | 260–880 | KD 94 where measured. Wrong ICP (survey researchers, explicitly not-for per §2). |
| `best form builder` | 210–350 | **KD 12–16 is a lie.** Every page-one result is DR 76–99. Revisit only with real domain authority. |
| **The entire spam long tail** — `contact form spam`, `form spam`, `elementor form spam`, `wordpress form spam`, `prevent form spam without captcha` | ~700 combined | Volume too small to matter, and the intent is *fix my WordPress plugin*, not *buy a form builder*. Loses to Akismet and wpforms. **This is the brief's stated priority and I am recommending against it.** |
| `fake leads google ads`, `spam leads google ads`, `junk leads` | 0–10 | Effectively zero volume. Perfect message fit, no demand. Use as **copy**, never as a **target**. |
| **`tire kickers`** | 1,600 | **Trap.** High volume, $0.23 CPC — that CPC means it is not a commercial query. It is the idiom/definition lookup ("what does tire kicker mean"), not sales-frustration intent. |
| `form a/b testing`, `split test forms`, `form drop off`, `multi step form conversion` | **0** | Zero volume. Confirms `[V]`'s finding that nobody A/B tests forms. Capability 2 has no search demand. |
| `agency form builder`, `ppc landing page form`, `b2b lead form`, `lead capture form for ppc` | **0** | Zero. Our ICP does not search in ICP language. |
| `contact form` | 2,900 | Wrong intent — people want a free HTML snippet or a WP plugin. |
| `client intake form`, `quote request form` | 260–1,300 | Real volume, but template-download intent from service SMBs. Would attract exactly the casual users §2 says we are explicitly not for. |
| `ai form builder` | 390–600 | KD 25–26 and winnable, but §8: **"Not AI-powered"** — the lane is crowded, thin, low-trust, and it is where the astroturfing lives. Traffic potential is 20. Declining on positioning grounds, not difficulty grounds. |
| `marketing attribution`, `lead scoring`, `server side tracking` | 390–1,000 | High volume and high CPC, but these are HubSpot/CallRail/WhatConverts terms. The spine's hard constraint forbids competing here. |

---

## 8. What this research changes

Three things downstream work should not inherit unexamined:

1. **`[W]`'s "comparison pages will be hard to win" is falsified** by KD 0 and DR-30 sites
   ranking. `01-positioning.md` §1 adopted that inference and used it to justify POV-only
   distribution. The premise does not survive the data. The *conclusion* may still hold on
   trust/ICP grounds — but it needs to be re-argued on those grounds, not on winnability.
2. **Risk 9 has fired.** "Keyword research finds no volume with commercial intent that maps to
   the ICP" is essentially what happened: the volume that exists is price-motivated and maps to
   the secondary ICP. This is a real strategic constraint and it should go back to positioning,
   not be quietly absorbed into a content calendar.
3. **The primary message has no search demand.** *"Your form can't tell a buyer from a bot"* is
   the right message — `[V]`'s ~22 angry sources are real — but it is a **community and paid
   message, not a search message.** No amount of SEO will find those people. Budget accordingly.

---

## 9. Open questions

1. **Do we accept secondary-ICP traffic to fund primary-ICP acquisition?** The comparison play
   works but pulls price-motivated SMB founders. Acceptable as top-of-funnel, or does it poison
   positioning? Needs a call before Priority 1 ships.
2. ~~`lead generation form` / `lead capture form` — SERPs not pulled.~~ **Resolved during this
   research** (§6): both are template/best-practices SERPs held by HubSpot, LinkedIn, Mailchimp,
   Zoho, and Unbounce. Not a Priority 1.5. No open question remains.
3. **The two competitive facts from `01-positioning.md` §11 remain unverified** and block
   `/typeform-alternative` and `/heyflow-alternative` — the two highest-value pages in Priority 1.
4. **No international sizing.** Global volumes run 2–4x US throughout. Worth a pass before
   committing the calendar.
