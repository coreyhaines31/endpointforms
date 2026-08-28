# Trademark Screening — Feature Names

**Version:** v1 · **Date:** 2026-08-28 · **Closes:** issue #16

> ## This is screening, not legal clearance.
>
> What follows is a knockout search of the USPTO wordmark database plus a scan for existing
> software products using each name. It is not a trademark clearance opinion, it does not
> cover common-law (unregistered) rights, state registrations, or non-US jurisdictions, and
> it is not a substitute for a search-and-opinion from an IP attorney. **Anything below
> marked CAUTION — and any name we decide to actually file an application on — goes to an
> IP lawyer before it appears on the marketing site.**

**Names screened:** Hindsight · Handshake · Verdict · Origin · Yield
(proposed in `02-messaging.md` §2, which flagged them as unscreened)

---

## Method

USPTO's live search SPA at `tmsearch.uspto.gov`, driven through agent-browser — `curl` and
`WebFetch` are both blocked by USPTO's AWS WAF. For each name: run a wordmark search, read
total / live / dead counts from the status facet, then re-run with the **Dead** facet
unchecked and extract every live record (mark text, status, international class, goods &
services, owner) from the results DOM. Decisive records were then opened individually in
TSDR (`tsdr.uspto.gov/statusview/sn<serial>`) for the full goods-and-services recitation and
prosecution history.

**What actually matters** (raw result counts are near-meaningless — common words return
thousands):

1. Is there a **live** exact-word registration? Dead/cancelled/abandoned marks don't block.
2. Is it in **class 9** (downloadable software) or **class 42** (SaaS)? Marks in class 25
   (clothing) or 33 (spirits) are irrelevant to us.
3. Is the **goods & services recitation** in our field, or a different one? A class-42
   registration scoped to insurance claims management does not conflict with a form builder.
4. Is there a well-known **product** using the name, registered or not? Common-law rights and
   plain market confusion both bite without a registration.

**Calibration:** the `Endpoint Forms` name itself screened at 102 results / 37 live, mostly
endpoint-security compounds, and was judged workable. That's what "workable" looks like here.

---

## Summary table

| Name | Total | Live | Live exact in cl. 9/42? | Existing product collision | npm | **Verdict** |
|---|---|---|---|---|---|---|
| **Hindsight** | 159 | 36 | 1 pending (insurance claims, different field) | DFIR forensics tool (niche) | taken, dormant | **CLEAR** |
| **Handshake** | 170 | 53 | Yes — Shopify (cl. 9, under cancellation); Handshake/Stryder (cl. 35+42, employment) | joinhandshake.com, ~$3.5B, expanding into "Handshake AI" | taken, dormant | **CAUTION** |
| **Verdict** | 173 | 54 | No | verdict.com legal-research SaaS; GlobalData's *Verdict* tech-media brand | taken, dormant | **CLEAR** |
| **Origin** | 2,281 | 966 | Yes — EA (cl. 9, broad software recitation) | EA Origin (retired 2025), OriginLab, Origin PC | taken, dormant | **CLEAR to use, never registrable** |
| **Yield** | 1,134 | 367 | No | yield.com = AdMedia SSP; **Dynamic Yield by Mastercard** (experimentation platform) | taken, dormant | **CLEAR** |

**npm note:** all five bare package names are registered but every one is a dormant hobby
package last published in 2022 (`hindsight` = Svelte prop docs, `handshake` = unshift.io
protocol helper, `verdict` = rules engine, `origin` = 0.8.6 utility, `yield` = generator
helpers). None is an active project and none is a competitor. This only matters if we ever
publish an SDK under a bare name — which we shouldn't; scope them (`@endpointforms/*`).

---

## Hindsight

**Labels:** the outcome-weighted split-testing capability, shipped as *"Hindsight split tests."*

**USPTO:** 159 total · **36 live** · 123 dead.

### Top live marks

| Mark | Class | Status | Owner | Goods & services |
|---|---|---|---|---|
| HINDSIGHT | **009, 042** | LIVE **PENDING** | Allineate Corp. (DE) | Downloadable software + SaaS for **claims management, incident and loss reporting, risk management, insurance claims tracking** (sn 50042589, filed 2026-08-10) |
| HINDSIGHT | 009 | LIVE REGISTERED | US Gov't / Sec. of the Air Force | Computer application software for mobile phones (sn 87657754) |
| HINDSIGHT | 009 | LIVE REGISTERED | HS Vision Ltd (UK) | Sunglasses, cyclists' glasses, eyewear |
| HINDSIGHT | 041 | LIVE REGISTERED | Viacom International | Continuing entertainment program |
| HINDSIGHT | 033 / 013 / 036 / 025 | LIVE | Eclipse Assets / Kris McKenna / Mark Hinds / Piege Co. | Spirits · rifle sighting mirrors · insurance brokerage · apparel |
| HINDSIGHT 20/20 | 009 | LIVE REGISTERED | Lytx, Inc. | Software for analyzing data from general-purpose vehicle event recorders |
| INSIGHT, NOT HINDSIGHT | 042 | LIVE REGISTERED | Multiview Geoservices | Pipeline/asset inspection services |

### The decisive finding

**Every historical class-9 / class-42 software registration for a bare HINDSIGHT is dead.**
Advanced Software Automation (009, cancelled), Reuters (009, abandoned), Wind River Systems
(009, cancelled), IntegriSoft (009, cancelled), Stac Electronics (009, abandoned), HindSight
Ltd (009, cancelled), Peer Inc (009, abandoned), and — most relevant — **Airscout, Inc.
(042, "providing online non-downloadable software for use in tracking…", abandoned)**. The
software lane for this word has been repeatedly claimed and repeatedly let go.

The only live exception is **Allineate Corp.'s pending application** covering class 9 + 42,
and its recitation is scoped tightly to insurance claims, incident/loss reporting, risk
management, vendor management and contract management. That is a materially different field
from form building and marketing analytics. It was filed 2026-08-10 and is still awaiting
assignment to an examiner, so it may not register at all.

**Two-word form.** No mark exists for HINDSIGHT SPLIT TEST or any close variant. The search
OR-parses the phrase (1,292 results, all noise), which itself confirms nothing near it exists.

### Product collisions

- **Hindsight** (github.com/obsidianforensics/hindsight) — a well-known open-source Chrome
  browser-history forensics tool in the DFIR community. Real recognition among security
  practitioners; zero overlap with our category and no commercial brand behind it. It does
  mean a developer audience may have heard the name before, in a forensic context — which,
  given our register, is arguably on-brand rather than confusing.
- **No analytics, CRO, or A/B-testing product uses the name.** The lane is empty.
- `hindsight.com` is parked/brokered (TLS cert points at perfectname.com), not an operating
  company.

### Verdict — **CLEAR**

The best-screening name of the five, and it's not close. Ship it as **Hindsight split
tests**, exactly as `02-messaging.md` recommends — keeping the descriptive category noun
lowers risk further, because "split tests" makes clear we're using Hindsight as a modifier
on a described service rather than as a bare product brand.

**Watch item:** Allineate serial 50042589. If it registers as a standard-character mark in
009 + 042, it becomes a citable reference against any future EF application for HINDSIGHT.
The field-of-use argument (insurance claims vs. form analytics) is straightforward, but it's
a reason to have counsel look before filing anything. Set a reminder to re-check status in
~6 months.

---

## Handshake

**Labels:** the agent-native capture capability — a form's machine-callable tool surface.

**USPTO:** 170 total · **53 live** · 117 dead.

### Top live marks

| Mark | Class | Status | Owner | Goods & services |
|---|---|---|---|---|
| **HANDSHAKE** | **009** | LIVE REGISTERED | **SHOPIFY INC.** | "Software for use in **managing personal and business contacts, business information and strategic relationships**; software development tools for the creation of mobile internet applications" (reg 3973377) — **CANCELLATION INSTITUTED 2026-04-28** |
| **HANDSHAKE** | **035, 042** | LIVE REGISTERED | **Stryder Corp.** (= joinhandshake.com) | Online searchable database re: **employment and career opportunities**; job placement, recruiting, professional networking (reg 7216392) |
| HANDSHAKE AI | 042 | LIVE REGISTERED + a second pending | Stryder Corp. | Technology advisory services related to **data sets used for AI** |
| HSP-1: HANDSHAKE PROTOCOL | 042 | LIVE PENDING | Andrew E. Freirich | Scientific study/research in the field of artificial intelligence |
| HUMAN-DIGITAL HANDSHAKE | 042 | LIVE PENDING | Avatar Buddy LLC | SaaS featuring software using [AI] |
| DIGITAL HANDSHAKE | 009 | LIVE REGISTERED | Intelligent Wellhead Systems | Downloadable software for **digital identity** |
| VIRTUAL HANDSHAKE | 042 | LIVE REGISTERED | SafePassport, Inc. | Creating an on-line virtual [community] |
| AB HANDSHAKE | 038 | LIVE REGISTERED (×2) | AB Handshake Corporation | Telecom advisory / electronic transmission — a telecom **fraud-prevention** company |
| HANDSHAKE FLEET | 009, 035 | LIVE REGISTERED | Handshake Fleet, LLC | Marketplace + mobile apps for connecting users |

### Reading it

Two live registrations sit close to us, and they cut differently:

**Shopify's class-9 registration is the legally closest one.** Its recitation — software for
managing business contacts and business information — is broad and genuinely adjacent to a
lead-capture product. Shopify is a large company with an IP budget. The mitigating facts:
Shopify shut the Handshake wholesale marketplace down in **October 2023**, and the
registration has had a **cancellation proceeding instituted against it as of 2026-04-28**
(almost certainly non-use). If that cancellation succeeds, the closest class-9 obstacle
disappears. Today it is still live. `handshake.com` still 301-redirects to a Shopify page.

**Handshake/Stryder Corp.'s class-35 + 42 registration is the closest *brand* problem, not
the closest legal one.** Its 042 recitation is explicitly scoped to employment and career
databases — a different field from ours. But Stryder Corp. is Handshake the careers
platform: ~$434M raised, most recently reported around a $3.5B valuation, 10M+ students,
750k+ employers — and it is now expanding into **Handshake AI**, an AI-training-data
business. That is the exact adjacency (software + "agent"/AI) we'd be walking into.

### Product collisions

- **joinhandshake.com** — large, well-funded, expanding into AI. In B2B SaaS, "Handshake"
  means this company to most people.
- **Handshake (HNS)** — the decentralized DNS / naming protocol, still active.
- **Shopify Handshake** — dead since Oct 2023, but the domain still points at Shopify.
- **"handshake" as a generic technical term** — TCP handshake, TLS handshake. This is the one
  fact that helps us: used lowercase as an ordinary noun, it's descriptive, and descriptive
  use of an ordinary technical term is the safest possible use. It's also why nobody can own
  it — including us.

### Verdict — **CAUTION** (rename recommended for the capitalized capability)

This is not a hard legal blocker. The infringement risk of using "handshake" lowercase, as a
technical noun, in the sentence *"every form publishes a handshake — a tool definition agents
can call directly"* is low: that's descriptive use of a term of art in networking.

The problem is the **capitalized branded capability**. As a product name, "Handshake":

1. Is unownable — three separate live registrants in classes 9, 35, and 42, one of them a
   $3.5B company actively extending the brand into AI.
2. Is search-invisible. We will never outrank joinhandshake.com for the term, which makes
   every piece of Handshake-named content we write undiscoverable.
3. Points the wrong way. A reader who half-recognizes "Handshake" thinks careers platform,
   or thinks TLS. Neither is us.
4. Carries residual exposure to Shopify's broad class-9 recitation for exactly as long as
   that registration survives its cancellation.

**Recommendation, in preference order:**

- **Best:** rename the capitalized capability (alternates below) and keep "handshake"
  lowercase as the copy word. We lose nothing — the line *"Real agents shake hands. Bots pick
  the lock."* still works, because it uses the verb, not the brand.
- **Acceptable:** keep Handshake but never file on it, never build SEO around the bare term,
  and always pair it with a qualifier in content ("the Endpoint Forms handshake").
- Either way: **do not file a trademark application for HANDSHAKE.**

### Two alternates

Both are plain, slightly forensic English nouns from the same customs/shipping register, and
both cohere with Verdict · Origin · Yield · Hindsight.

**1. Manifest** ⭐ — *"Every form publishes a manifest."* A manifest is a document that
declares what is aboard and who is carrying it, which is precisely what the agent tool
surface is. It already means "a machine-readable declaration file" in software (package
manifest, web app manifest), so it self-explains to developers in a way Handshake never did
— and `02-messaging.md` noted Handshake "doesn't self-explain the agent half without one
sentence of setup." Sayable and verb-adjacent: *"did it come through the manifest?"* Being
generic in software cuts both ways: unownable, but also unassailable. Line it earns: *"Real
agents file a manifest. Bots just show up."*

**2. Declaration** — *"The agent's declaration."* Customs register, forensic, decisive, and
uncrowded in SaaS. Slightly longer and less native to developers than Manifest, but it names
the *act* of identifying, which is the actual mechanism, and pairs beautifully with Verdict.

Both need their own screening pass before adoption — this section is a proposal, not a
clearance.

---

## Verdict

**Labels:** the outcome signal on a submission (Won · Lost · Disqualified · Awaiting verdict).

**USPTO:** 173 total · **54 live** · 119 dead.

### Top live marks

| Mark | Class | Status | Owner | Goods & services |
|---|---|---|---|---|
| VERDICT | 009 | LIVE REGISTERED | Snap-on Incorporated | Automotive diagnostic tools — a wireless scanner (hardware) |
| VERDICT | 009 | LIVE REGISTERED | Bunzl IP Holdings | Safety glasses and goggles for industrial use |
| VERDICT | 005 / 013 / 010 / 008 / 028 / 034 | LIVE REGISTERED | BASF, Gunwerks, LabCorp, Good Sportsman, Ejuice Empire | Herbicides · rifles · immunoassay test kits · knives · broadheads · vape cartridges |
| VERDICT | 035 | LIVE PENDING | WTT Consulting LLC | Marketing consulting |
| VERDICT PRO | 042 | LIVE PENDING | Verdict Pro (DE) | SaaS |
| VERDICT WEIGHT | 042 | LIVE PENDING | Andre M. Byrd | AI-as-a-service |
| LIGHTS. CAMERA. VERDICT | 042 | LIVE REGISTERED | Legal Studios LLC | Animation and computer graphics design |
| VERDICT DAY | 009 | LIVE REGISTERED | Bandai Namco | Computer game programs |

### Reading it

**There is no live registration for a bare VERDICT in class 42 (SaaS).** The two live
class-9 exact matches are both hardware — an automotive scan tool and safety goggles. The
class-42 hits are all composite marks (VERDICT PRO, VERDICT WEIGHT, LIGHTS. CAMERA. VERDICT),
and the field cluster is overwhelmingly legal, which is unsurprising and not our lane.

The word is also being used here in its **most defensible possible role**: not as a product
brand, but as a field name and a set of enum values in a data model and dashboard column.
"Verdict: Won" is the word doing its dictionary job.

### Product collisions

- **verdict.com** — an active AI-powered legal-research SaaS (court records, case law,
  attorney matching). Real, live, exact-domain product — but legal research, not martech.
- **Verdict** (verdict.co.uk) — GlobalData Plc's B2B **tech and business news brand**. This is
  the one worth caring about, not for legal reasons but for **SEO and press**: a
  well-optimized tech-media property already owns the term in a technology context.
- **Verdict Case Management** (Cott Systems) — court case-management software. Vertical
  govtech, no overlap.
- No martech, analytics, or CRO product uses the name.

### Verdict — **CLEAR**

Safe to ship as the outcome signal, the dashboard column, the webhook field, and the
`"Awaiting verdict"` empty state. The value we get from it is exactly the value
`02-messaging.md` identified — courtroom finality applied to a data field — and none of the
live marks touch that use.

Two notes, neither blocking:

- **Don't expect to own it in search.** GlobalData's Verdict and verdict.com are both
  established. Content built around the bare word "verdict" will not rank; content built
  around *"form submission verdict"* or *"awaiting verdict"* can.
- If we ever file, file it as part of the product, not standalone. A bare VERDICT
  application in 042 is *probably* available but would sit next to VERDICT PRO's pending
  application — an attorney's call, not ours.

---

## Origin

**Labels:** the provenance stamp on each submission (Human · Agent · Unverified).

**USPTO:** 2,281 total · **966 live** · 1,315 dead. This is a common English word and the
register reflects it — the highest live count of the five by an order of magnitude.

### Top live marks

| Mark | Class | Status | Owner | Goods & services |
|---|---|---|---|---|
| **ORIGIN** | **009** | LIVE REGISTERED | **Electronic Arts Inc.** | "Computer software for the management, transmission, storage…" |
| ORIGIN | 038 | LIVE REGISTERED | Minesoft Limited | Online document delivery via a global computer network |
| ORIGIN | 042 | LIVE PENDING | Origin Digital, LLC | Information technology consultation, implementation |
| ORIGIN | 005 / 025 / 028 / 033 / 001 / 003 | LIVE | Origin Life Sciences, Origin BJJ, Origin LLC, New Holland IP, others | Pharma · martial arts apparel · roller skates · spirits · fertilizer · dentifrices |
| ORIGIN AI | 009 | LIVE PENDING | Origin Wireless, Inc. | Computer hardware and recorded software for remote [sensing] |
| ORIGIN SMARTCITY | 042 | LIVE PENDING | Origin Consulting, LLC | Providing use of online [software] |
| ORIGIN SMARTOPS | 009 | LIVE PENDING | Origin SmartOps, Inc. | Wireless controllers |
| BRAINLAB ORIGIN | 009 | LIVE REGISTERED | Brainlab SE | Software for managing patient medical [data] |
| TRASE ORIGIN | 009 | LIVE PENDING | Trase Systems | Downloadable software for analyzing, storing, managing… |

### Reading it

**Electronic Arts holds a live class-9 registration for a bare ORIGIN with a broad software
recitation.** EA retired the Origin game platform on 2025-04-17 in favor of the EA app, but
they still control `origin.com` (301 → ea.com game library) and the registration is live.
That is a company with both the resources and the demonstrated willingness to defend a mark.

Separately, there are ~966 live ORIGIN-formative marks across essentially every class. This
word is not available to own by anyone, in any field.

### Product collisions

- **EA Origin** — retired April 2025, but a decade-plus of brand recall and EA still owns the
  domain and the registration.
- **OriginLab's Origin / OriginPro** — active scientific data-analysis and graphing software
  since 1992, 1M+ registered users. A real, living software product named Origin.
- **Origin PC** — custom gaming PCs, a Corsair subsidiary since 2019, still operating.
- No prominent Origin in web analytics or attribution.

### Verdict — **CLEAR to use as a data field · never registrable · never a product brand**

The split matters, so state it plainly:

- **Using "Origin" as a dashboard column header and submission field** — meaning *"where this
  submission came from"* — is descriptive use of an ordinary English word for its ordinary
  meaning. This is the lowest-risk category of use that exists, and it's what
  `02-messaging.md` proposes. **Do it.**
- **Branding "Origin" as a capability, filing a trademark on it, or building SEO around the
  bare word** — don't. 966 live marks, EA's broad class-9 registration, and two active
  software products called Origin. There is nothing to win.

Practically this means: keep Origin as the column and the field; when we need a *branded*
noun in marketing copy, say "provenance" or "the origin stamp," and let Endpoint Forms be the
brand doing the work.

---

## Yield

**Labels:** the quality-adjusted conversion metric (Yield rate, Yield value).

**USPTO:** 1,134 total · **367 live** · 767 dead.

### Top live marks

| Mark | Class | Status | Owner | Goods & services |
|---|---|---|---|---|
| YIELD | 004 | LIVE REGISTERED | NCH Corporation | Penetrating oil preparations |
| YIELD | 036 | LIVE REGISTERED | Instamint, LLC | Cryptocurrency exchange services featuring blockchain |
| YIELD | 041 | LIVE PENDING | Viacom International | Continuing entertainment program |
| YIELD | 003 / 025 / 030 | LIVE | Pattern Brands, Tira Owens, Maximum Cobb | Fragrances · apparel · instant noodles |
| YIELD EXPLORER | 009 | LIVE REGISTERED | **Synopsys, Inc.** | Software for **yield management, electronic design** (semiconductor) |
| P-YIELD | 042 | LIVE PENDING | **Tempus AI, Inc.** | Non-downloadable computer software |
| ZERO-TO-YIELD | 042 | LIVE PENDING | ZysTech LLC | Software development / publishing |
| NANO-YIELD | 042, 035, 040, 044 | LIVE REGISTERED | Aqua Yield Operations | Agricultural technology information |
| YIELD FINDER | 007 | LIVE REGISTERED | The Bradbury Co. | Software for testing yield strength of material |
| YIELD+ / YIELD[+] | 035 | LIVE REGISTERED | Encoura; Stine Seed Farm | Market research · agricultural seed information |

### Reading it

**There is no live registration for a bare YIELD in class 9 or class 42.** The exact-word live
marks are in penetrating oil, crypto exchange, TV programming, fragrance, apparel and instant
noodles — nowhere near us. Everything in the software classes is a composite (YIELD EXPLORER,
P-YIELD, ZERO-TO-YIELD, NANO-YIELD, YIELD FINDER), and the two biggest owners of those are in
semiconductors (Synopsys) and precision medicine (Tempus AI).

The heaviest concentration of YIELD-formative marks is agriculture and finance — which is
exactly the point `02-messaging.md` made in choosing it. The word already means
"quality-adjusted output" in those fields, which is why it needs no teaching, and it's why
using it as a **metric name** is descriptive rather than source-identifying. Descriptive
metric names are hard to register and easy to use safely. We want the second property.

### Product collisions

- **yield.com** → AdMedia's **Yield**, an active supply-side platform for publisher ad
  monetization. Live product on the exact domain, in ad tech — the same broad market our
  buyers work in, though a different job.
- **Dynamic Yield by Mastercard** — **the closest category collision of any name on this
  list**: an enterprise personalization and **experimentation** platform serving 400+ brands.
  We ship "Yield" *and* split tests. That's the one place two of our words land inside
  someone else's existing product category.
- **Yieldmo** — established ad-tech company, active.
- **Yieldstreet** — alt-investment fintech (reportedly rebranding to Willow Wealth).
- **Yield App** — crypto wealth platform, in insolvent liquidation since July 2024.

### Verdict — **CLEAR**

Safe to ship as the metric. No live software or SaaS registration for the bare word blocks
it, and our use is descriptive by design.

The real constraint is competitive positioning, not law: **Dynamic Yield is an experimentation
platform**, and a marketer who hears "Yield" and "split test" in the same sentence may
pattern-match to it. Two mitigations, both cheap:

- Always ship it as a *number with a unit*, not a bare noun: **"Yield rate"** and **"Yield
  value."** *"Completion rate: 41%. Yield: 4%."* reads as a metric, not a brand.
- Never write "yield optimization" — that phrase belongs to Dynamic Yield and to ad-tech SSPs.
  We say **"ranked on Yield."**

As with Verdict and Origin: don't file on it. Being descriptive is the feature.

---

## Endpoint Forms (re-check)

Searched for completeness against the earlier screen. **No live mark exists for ENDPOINT
FORMS.** The live field for the bare word ENDPOINT (173 live records on the two-word query)
is what the earlier screen described — endpoint-security and endpoint-management compounds:

| Mark | Class | Status | Owner |
|---|---|---|---|
| ENDPOINT | 042 | LIVE REGISTERED | Endpoint Clinical L.P. (clinical trial systems) |
| ENDPOINT | 009 | LIVE REGISTERED | Endpoint Technologies, LLC (title/real estate apps) |
| ENDPOINT | 042 | LIVE PENDING | Endpoint Solutions Corp. (civil engineering) |
| ILLUMIO ENDPOINT · ENDPOINT PROTECTOR · ENDPOINT RESILIENCE · ENDPOINT REHYDRATE | 009, 042 | LIVE | Illumio, Managed DLP, Absolute Software |

Adding "Forms" differentiates us in a different field from every one of them. Consistent with
the earlier judgment: **workable**. `ENDPOINT FORMS` is the mark actually worth protecting,
and it is the one to take to an attorney first.

---

## Overall recommendation

**Ship four of the five as proposed. Change one.**

1. **Hindsight — ship it.** Best-screening name here. Ship as *"Hindsight split tests."*
   Diary a status check on Allineate serial 50042589 for ~Feb 2027.
2. **Verdict — ship it.** No live class-42 conflict. Use it as the field and the enum values,
   as designed. Don't expect to rank for the bare word.
3. **Origin — ship it as the column, and only as the column.** Descriptive use is safe;
   branding or filing is not. Never build content around the bare word.
4. **Yield — ship it as "Yield rate" / "Yield value."** Avoid the phrase "yield
   optimization." Watch Dynamic Yield as a positioning adjacency, not a legal one.
5. **Handshake — demote or rename.** Keep the lowercase technical noun ("the form publishes a
   handshake") and the copy line ("Real agents shake hands. Bots pick the lock."). Replace
   the *capitalized capability name* with **Manifest** (recommended) or **Declaration**. If
   we keep Handshake anyway, then: never file on it, never build SEO around the bare word,
   and re-check the Shopify cancellation (reg 3973377) before it appears on the site.

**File nothing on the feature names.** These are internal vocabulary — dashboard columns,
webhook fields, capability labels — and descriptive use is both the safest posture and the
one that matches how they'll actually appear. The mark worth an attorney's time and a filing
budget is **ENDPOINT FORMS**.

**Before launch, take to an IP lawyer:** (a) an ENDPOINT FORMS application, (b) the Handshake
decision if we keep it, and (c) the Hindsight watch item. Everything else can proceed.

---

## Raw data

Live-record extractions and screenshots from this run:
`/private/tmp/claude-501/-Users-coreyhaines/fd6a0d18-2b1f-41a5-a57a-19a843193052/scratchpad/`
(`live-hindsight.json`, `live-handshake.json`, `live-verdict.json`, `live-origin.json`,
`live-yield.json`, `live-ef.json`, `tm-hindsight-live.png`, `tm-handshake-live.png`). These
are session-scoped and will not survive; the tables above are the durable record.

Decisive TSDR records, if anyone wants to re-verify:

- Allineate HINDSIGHT — `https://tsdr.uspto.gov/statusview/sn50042589`
- Shopify HANDSHAKE — `https://tsdr.uspto.gov/statusview/sn85124141` (reg 3973377)
- Stryder/Handshake HANDSHAKE — `https://tsdr.uspto.gov/statusview/sn97478393` (reg 7216392)
