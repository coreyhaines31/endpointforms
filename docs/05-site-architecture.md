# Site architecture — Endpoint Forms

**Version:** v1 · **Date:** 2026-08-28 · **Closes:** [#5](https://github.com/coreyhaines31/endpointforms/issues/5)
**Decides for:** [#9](https://github.com/coreyhaines31/endpointforms/issues/9) (pSEO URL pattern)
**Inherits from:** [`00-positioning-spine.md`](./00-positioning-spine.md), [`01-positioning.md`](./01-positioning.md), [`02-messaging.md`](./02-messaging.md). Nothing here relitigates the spine.

> ### Reconciliation notice
> This doc was written **in parallel with** keyword research (`docs/04-keyword-research.md`) and
> deliberately did not read it. Every place where a keyword decision is required is marked
> **`[NEEDS KEYWORD VALIDATION]`** with a statement of exactly what data settles it. There are
> **11** of them, indexed in §11. Reconcile that section against `04` before any of this ships.
> Judgment calls the research doesn't cover are marked **[judgment call]**.

---

## 1. Competitive teardown

Nine sites analyzed live (sitemaps, rendered HTML, and headed-browser menu extraction). Six in
or adjacent to the category; three best-in-class open-source dev tools for the OSS pattern.
Everything below is observed, not assumed. Gaps are named at the end of the section.

### 1.1 In-category: Tally, Typeform, Fillout

| | **Tally** | **Typeform** | **Fillout** |
|---|---|---|---|
| Indexable pages | ~428 | ~4,156 | ~950 across 3 sitemaps |
| Header nav items | **1** (+3 auth/CTA) | 4 (3 mega-menus) | 5 (4 dropdowns) |
| App location | **`tally.so/dashboard`** — same domain | `admin.typeform.com` | `build.fillout.com/{workspace}/` |
| Docs | Notion+Super at `/help` (198 pp) | **Zendesk at `help.typeform.com`** | Mintlify at `/help` (281 pp) |
| API docs | `developers.tally.so` (Mintlify) | `typeform.com/developers/` | none found |
| Blog | `blog.tally.so` (Ghost) | `/blog` on-domain | `/blog` (Feather, proxied) |
| Templates | `/templates/{slug}/{formId}` — 179 | `/templates/{slug}` — **2,774** | `/templates/{slug}` — 430+ |
| Integrations | none (help articles) | `/connect/{app}` + `/connect-integration/{recipe}` | `/integrations/{app}` |
| Comparisons | 3, inside `/help/` | 2, inside `/blog/` | **17 at `/vs/{x}`** + hub |
| Trailing slashes | no | no | no |

**Tally** runs the most radical IA in the category: one content link in the entire header
(`/pricing`), and marketing + auth + the actual builder all on one Next.js app on one hostname.
`app.tally.so` does not resolve. You can build a form at `tally.so/create` with no signup at all.
Its comparison pages live *inside the help center* (`/help/tally-a-free-typeform-alternative`) —
a genuinely odd choice that treats "why we're better" as support content.

**Typeform** is a pure volume play. 67% of its entire site is template detail pages. Integrations
are split into two parallel namespaces — `/connect/{app}` (192 app pages) and
`/connect-integration/{verb-phrase}` (299 long-tail automation recipes). Notable own-goal: the hub
pages `/templates`, `/connect`, and `/use-case-gallery` all return 200, are linked from the nav,
and appear **zero times in the sitemap**. Its audience taxonomy is half-built — `/roles/{x}` has
only three pages and the Solutions menu papers over the gap by pointing at `/templates-category/`.

**Fillout** has the cleanest comparison IA in the category (17 `/vs/{competitor}` pages with a real
hub at `/form-builder-comparison` — the only comparison hub anywhere in the nine) and the worst
sitemap discipline anywhere in the nine. Its root sitemap has 126 URLs and omits the entire 430+
template library, the entire 89-post blog, and the whole 281-page help center, because Mintlify and
Feather generate their own sitemaps that `robots.txt` never declares. It also runs three
separator conventions inside one namespace: `/integrations/googlesheets`,
`/integrations/google_analytics`, `/integrations/google-forms`. And two taxonomy conventions in the
same site: `/templates/categories/{x}` (plural) alongside `/integrations/category/{x}` (singular).

### 1.2 In-category: Heyflow, Formbricks, Reform

| | **Heyflow** | **Formbricks** (OSS) | **Reform** |
|---|---|---|---|
| Indexable pages | 535 (374 EN + 161 DE) | 280 | 780 |
| App location | `app.heyflow.com` | `app.formbricks.com` | `dashboard.reform.app` |
| Docs | **Intercom at `help.heyflow.com`** | **Mintlify proxied at `/docs`** | **Help Scout at `docs.reform.app`** |
| Comparisons | `/heyflow-vs-{x}/` × 16, no hub | 5 different shapes, no hub | `/comparison/{x}` × 4, no hub |
| Templates | **zero** — links off-site to `heyflow.id` | `/survey-templates/{slug}` × 58 | `/templates/{slug}` × 13 |
| Integration pages | **zero** | zero | 8, **orphaned from nav** |
| Trailing slashes | **yes, universally** | no | no |

**Formbricks is the most instructive site in the set**, because it is the OSS competitor whose
edge we intend to take. Three things it does deliberately:

1. **There is no `/open-source` page.** "Open source" is a keyword woven into nine page
   titles (`/open-source-form-builder`, `/google-forms-alternative-open-source`) rather than a
   destination.
2. **GitHub is not in the primary nav** — it's a footer link plus a hero badge. Most OSS
   companies put a starred GitHub button in the header; Formbricks gave that slot away.
3. **It gave that slot to self-hosting instead.** One of only two right-side header elements
   sitewide is a button labeled **"Deploy Formbricks"** pointing directly at
   `formbricks.com/docs/self-hosting/overview`. The install guide is a first-class nav
   destination, co-equal with the signup CTA. Its `/pricing` carries a **Self-hosting tab** with a
   free "Community Edition" column, drawing the open-core line at SSO/RBAC/governance rather
   than at survey functionality.

Also worth stealing from Formbricks: **`formbricks.com/signup` is a vanity path that 301s to
`app.formbricks.com/auth/signup`** — clean shareable URL, real destination on the app subdomain.
And "Privacy" sits in its *primary nav*, which is positioning expressed as IA.

**Heyflow** merchandises **MCP as a top-level feature nav item** (`/features/mcp/`) — the only
in-category site doing so besides Typeform's `/mcp`. It has **zero integration pages and zero
template detail pages** (templates link off-site to `heyflow.id`), which is a large missed surface.
Roughly half of its `/features/*` and most of `/solutions/industries/*` and `/solutions/roles/*`
are orphaned from the primary nav.

**Reform** is a cautionary tale about decorative navigation. Its mega-menu shows 25 distinct
labels — 15 features, 10 integrations — and **every single one hrefs to just two URLs**
(`/features`, `/integrations`). Meanwhile `/integrations/{slug}` pages genuinely exist (8 of them,
in the sitemap) and the integrations menu does not link to any of them. 685 of its 780 pages are
blog posts. Notable positive: `/done-for-you-forms` as a top-level nav item — a productized
service in the primary nav, which is its agency parent (FunnelEnvy) showing through.

### 1.3 OSS exemplars: cal.com, PostHog, Supabase

| | **cal.com** | **posthog.com** | **supabase.com** |
|---|---|---|---|
| App location | `app.cal.com` (**forced**) | `app.posthog.com` → `us./eu.` | **`supabase.com/dashboard`** |
| Migrated? | — | `app.` is now an alias | **migrated OFF `app.`** |
| Docs | `cal.com/docs` (Mintlify + Nextra, proxied) | `posthog.com/docs` (same app) | `supabase.com/docs` (separate Next.js deploy) |
| Docs in primary nav | no (under "Developer") | yes | yes |
| GitHub stars in nav | no | no | **yes — `108.5K`** |
| Footer | 4 cols, no OSS column | **no footer at all** | 6 cols incl. **Community** |
| Self-host home | **`cal.diy` — a separate domain** | `/docs/self-host` (12 pp, discouraged) | `/docs/guides/self-hosting` (19 + ~70 ref) |
| Self-host in nav | no | no | no (`/open-source` instead) |
| Self-host on `/pricing` | no | no | one FAQ accordion |
| Comparison shape | `/calcom-vs-calendly` (root) | `/blog/posthog-vs-{x}` × 18 | `/alternatives/supabase-vs-{x}` × 3 |
| Migration shape | `/migrate-from-{x}-to-calcom` | — | `/solutions/switch-from-{x}` |
| Biggest scaled set | `/workflows/workflows-for-{niche}` × 171 | `/questions/{slug}` × 7,701 | `/features/{slug}` × 79 |
| Total URLs | 1,106 (EN) | **13,049** | 3,372 |

Three findings here that change our decisions:

**cal.com cannot use a path, and the reason is structural.** Its root path *is* the username
namespace. `cal.com/self-hosting` returns 200 with the title *"Jean Soares de Oliveira | Cal.com"*.
`cal.com/open-source` is *"Timelapse Studio | Cal.com"*. Every marketing slug at cal.com root is a
reserved word carved out of the username pool, which is why its scaled content is force-nested
under `/routing/`, `/workflows/`, `/scheduling/`. **This is the trap a form builder walks into if it
ever serves public forms from its marketing root.** See §4.

**Supabase migrated off `app.` deliberately.** `app.supabase.com` and `app.supabase.io` both
301 into `supabase.com/dashboard`. It is the one site in the nine that consciously moved from
subdomain to path, and it's worth understanding why it works for them and not for us (§4).

**Supabase's `/features/{slug}` set — 79 pages, one per atomic capability** — is the highest-quality
pSEO pattern in the nine. One page per real thing the product does, not one page per swapped noun.

### 1.4 What everyone has, what only some have, what nobody has

**All nine have** (a convention we'd be weird to skip): `/pricing` · a blog · docs or a help center ·
an about-equivalent · legal pages at root · a 4–6 column footer · a right-side header pair of
[secondary auth link] + [primary CTA] · comparison content in *some* shape · no locale prefix on
the canonical English site.

**Eight of nine have** no trailing slashes (Heyflow is the sole holdout, and uses them universally).

**Most have:** a scaled template or equivalent set (8/9 — Heyflow the exception, flagged above as a
miss) · `/integrations/{name}` (6/9) · `/customers/{slug}` (6/9) · a `status.` subdomain (7/9) ·
comparison pages linked **from the footer only** (9/9 — not one of the nine puts a competitor name
in its primary nav).

**Only some have:** a GitHub star count in the primary nav (**1/9** — Supabase) · an `/open-source`
page (**1/9** — Supabase) · a comparison **hub** page (**2/9** — Fillout's `/form-builder-comparison`
and Supabase's in-nav Compare block) · MCP merchandised in nav (2/9 — Typeform `/mcp`, Heyflow
`/features/mcp/`) · a self-host column on pricing (**1/9**, and Formbricks makes it a tab, not a
column).

**Nobody has — and this is the finding that matters most:**

> **Not one of the nine sites has a marketing page for self-hosting.**
> `supabase.com/self-hosting` → 404. `posthog.com/self-hosting` → 404. `cal.com/self-hosting` → a
> user's booking page. Self-hosting is universally buried in docs, and in two cases *actively
> discouraged*: PostHog's self-host doc says deployments are "officially unsupported" and ships a
> Mermaid flowchart titled *"What makes you interested in self-hosting PostHog?"* that routes most
> readers back to Cloud. cal.com went further and **spun self-hosting out to an entirely separate
> domain, `cal.diy`**, whose robots route is `noindex`.

That convention exists because all three monetize cloud and treat self-host as a cost center.
Their placement reflects their incentive, not a UX truth — and per `01-positioning.md §8`,
**one-command self-host is the single thing we can beat Formbricks and OpnForm on.** So the page
we most want to own is a page nobody in the reference set has built. §7 acts on this.

**Also nobody has:** a comparison hub in primary nav · a `/pricing/self-hosted` page (0/9) · an
integration page that says what data comes *back* (§6).

### 1.5 What we could not reach

- `help.typeform.com` returns 403 to non-browser clients (Zendesk bot protection). Platform and URL
  shape confirmed via the redirect chain from `www.typeform.com/help/a/...`, not by reading pages.
- Fillout's template count is a firm floor of 430, not exact — no template sitemap exists and
  category pages server-render a cap of 42 items.
- heyflow.com sits behind a Cloudflare managed challenge; required a headed browser. `/examples/`
  contents unretrieved (rate-limited).
- cal.com's six non-English sitemaps are listed in its index but all return a Next.js error page,
  so no locale URL inventory exists.
- Nobody authenticated into any product, so internal app route shapes past the dashboard are unmapped.
- Wayback was offline for the whole session; no historical IA comparison was possible.

---

## 2. Design principles for this site

Five rules the rest of the doc is derived from. Each traces to a positioning decision.

1. **The argument is the asset, not the page count.** `[W]`'s SERP finding is that this category's
   search results are "near-exclusively AI-generated comparison content from tiny form builders."
   Writing 400 pages puts us in a knife fight with bots for a low-trust click. We build the smallest
   number of pages that can each carry a real claim. **Every page in §3 has a stated job. If it
   couldn't get one, it isn't in the doc.**
2. **Every page must be able to survive being read by a skeptic.** The ICP is an agency owner who
   has been astroturfed at for two years. Thin pages don't just underperform — they actively
   confirm the thing we're differentiating against.
3. **Say who we're bad for, structurally.** Naming anti-personas is a positioning asset
   (`01 §2`). That means the comparison pages are honest three-beat pages (`02 §5`), which means
   they cannot be templated, which means they are **not** part of the pSEO program.
4. **Reserve the product's URL space before the product exists.** cal.com's root namespace is
   permanently constrained because usernames got there first. We ship Part 2 into a namespace we
   planned, or we ship a restructure.
5. **Open source is a trust asset, not a demand driver.** `[V]` found **zero** marketers asking for
   open source. It earns a nav slot for credibility in an astroturfed category — not because it
   brings traffic.

---

## 3. Full sitemap, in tiers

### Tier 0 — Launch (pre-launch waitlist site)

**Honest scope: a pre-launch waitlist site needs six pages.** It needs somewhere to make the
argument, somewhere to prove a human is behind it, a way to join, and the legal minimum to collect
an email. It does not need a pricing page for a product with no price, a blog with one post, a
template library for a builder that doesn't exist, or a `/features` section describing software
nobody can run. A funded company builds those on day one because it has people to keep busy. We
would be building furniture for an empty room.

```
Homepage (/)                                    ← waitlist capture
├── The argument essay (/{pov-slug})            ← the POV asset; the linkable thing
├── Open source (/open-source)                  ← AGPL commitment, GitHub, "your data is yours"
├── About (/about)                              ← a named human, in an astroturfed category
├── Privacy (/privacy)
├── Terms (/terms)
└── Thanks (/thanks)                            ← waitlist confirmation, noindex
```

Plus non-page infrastructure reserved from day one: `robots.txt`, `sitemap.xml` (as an index, §5),
`/.well-known/security.txt`, `humans.txt`, and the reserved-path list in §4.3.

**Deliberately not at launch, with reasons:**

| Not building | Why |
|---|---|
| `/pricing` | There is no price. Pillar 3 is a *position* ("no per-response tax"), and it belongs as a homepage section until there are numbers. Inventing tiers now means retracting them later, in a category where `[V]` shows retracted pricing is a documented switching trigger *away* from a vendor. |
| `/blog` | One essay is a thesis; one blog post is an abandoned blog. The essay goes at a root slug (§4.2). `/blog` opens when there are three posts and a cadence. |
| `/features/*` | Describing software nobody can run reads as vaporware. The capabilities are homepage sections at launch. |
| `/self-host` | The whole claim is *one command*. Until that command exists and works, the page would be a promise, not a differentiator. Ships in v1 (§7). |
| `/docs` | Path reserved and rewrite stubbed (§7). Nothing to document. |
| `/roadmap` | GitHub issues already are the roadmap. `/open-source` links to them. Cheaper and more honest than a synced page. |
| `/alternatives/*` | Comparison pages against a product that doesn't ship yet are unfalsifiable claims. This is exactly the behavior of the AI-slop vendors we're differentiating from. |
| `/templates` | We conceded template breadth to Jotform (`01 §8`). Shipping a thin library invites the comparison we already declined. |

### Tier 1 — v1 (product launch)

```
Homepage (/)
├── Features (/features)                        ← hub, indexed
│   ├── (/features/{provenance-slug})           ← Origin        [NEEDS KEYWORD VALIDATION]
│   ├── (/features/{outcome-slug})              ← Verdict       [NEEDS KEYWORD VALIDATION]
│   ├── (/features/{split-test-slug})           ← Hindsight     [NEEDS KEYWORD VALIDATION]
│   ├── (/features/{agent-slug})                ← Handshake     [NEEDS KEYWORD VALIDATION]
│   └── (/features/{analytics-slug})            ← Yield         [NEEDS KEYWORD VALIDATION]
├── Pricing (/pricing)
├── Open source (/open-source)
│   └── Self-host (/self-host)                  ← the page nobody in the nine has built
├── Docs (/docs)                                ← Mintlify, proxied onto the apex
│   └── (/docs/self-hosting/…)
├── Integrations (/integrations)                ← pSEO hub
│   ├── (/integrations/categories/{slug})       ← facet, ≥5 members only
│   └── (/integrations/{tool})                  ← THE pSEO SET (issue #9)
├── Alternatives (/alternatives)                ← comparison hub — 2/9 sites have one
│   └── (/alternatives/{competitor})            ← hand-written, ~6–10, NOT pSEO
├── The argument essay (/{pov-slug})
├── Blog (/blog)
│   └── (/blog/{slug})
├── Changelog (/changelog)
├── Security (/security)
├── About (/about)
├── Privacy (/privacy) · Terms (/terms)
└── Thanks (/thanks) [noindex]
```

### Tier 2 — Later (earn it first)

```
├── Customers (/customers) → (/customers/{slug})     ← requires customers. Not before.
├── Solutions (/solutions)
│   ├── (/solutions/agencies)                        ← Primary ICP A
│   └── (/solutions/{ppc-slug})                      ← Primary ICP B  [NEEDS KEYWORD VALIDATION]
├── Templates (/templates) → (/templates/{slug})     ← only with a Yield/Origin angle (§6.4)
├── MCP / agent forms (/{mcp-slug})                  ← 2/9 merchandise this  [NEEDS KEYWORD VALIDATION]
├── Migrate (/migrate/{from-tool})                   ← Supabase's switch-from pattern
└── Status (status.endpointforms.com)                ← 7/9 have one; needs uptime to report
```

**Rule for Tier 2:** nothing promotes from Tier 2 to shipped without either (a) a real asset behind
it — an actual customer, an actual template worth using — or (b) keyword data showing the query
exists and reaches our ICP rather than the SMB price segment we deprioritized (`01 §2`, Risk 9).

---

## 4. URL conventions

These are rules, not a list. They're enforceable in `next.config.ts` and in review.

### 4.1 Domain and origin rules

**Canonical host is the apex: `endpointforms.com`.** `www.` 301s to it, permanently.

Observed split in the nine: apex-canonical 6 (Tally, Formbricks, Heyflow, cal.com, PostHog,
Supabase), www-canonical 3 (Typeform, Fillout, Reform). **All three OSS exemplars use apex.**

The one real argument for `www` is cookie scope: a cookie set on the apex with a `Domain`
attribute is sent to every subdomain, including `app.`. We take apex anyway, mitigated by a hard
rule rather than by a hostname:

> **Cookie rule.** The marketing site sets **no** cookie carrying a `Domain` attribute, ever. The
> app sets **host-only** cookies on `app.` (no `Domain` attribute). Analytics is the single
> exception and is governed by §4.6.

### 4.2 Path rules

| Rule | Detail |
|---|---|
| **Trailing slash** | **Never.** `trailingSlash: false`, plus a 308 from `/path/` → `/path`. 8 of 9 sites agree; Heyflow is the lone holdout. |
| **Case** | Lowercase only. `/About` → 301 → `/about`. |
| **Separator** | Hyphens. Never underscores, never concatenation. Fillout runs all three in one namespace (`/integrations/googlesheets`, `/integrations/google_analytics`, `/integrations/google-forms`) — that is the failure mode. |
| **Depth** | Max **2** for marketing (`/features/agent-forms`). Max **3** for taxonomy and docs (`/integrations/categories/crm`, `/docs/self-hosting/docker`). Never 4. |
| **Plurality** | **Plural container, singular leaf.** `/features/{one-feature}` · `/integrations/{one-tool}` · `/alternatives/{one-competitor}` · `/templates/{one-template}`. Never `/feature/`, never `/integration/`. |
| **Taxonomy segment** | Always `categories`, always plural, always at depth 3 under its container: `/integrations/categories/crm`. Never `category`. Fillout ships both spellings in one site — do not repeat it. |
| **Dates** | Never in URLs. `/blog/{slug}`, not `/blog/2026/08/{slug}`. |
| **IDs** | Never in marketing URLs. Always in product URLs, where they belong (`/f/{formId}`). |
| **Locale** | None. Single locale, no `/en/` prefix. Adding one later is a 301; adding one now is permanent dead weight. Typeform killed its multi-locale setup and 301s `/es/`, `/fr/` to the English apex. |
| **Query params** | Never carry content. Facets that would produce thin pages stay params **and** `noindex`. |
| **Redirects** | Every URL that has ever shipped keeps a 301 forever. The map lives in `next.config.ts` under version control, not in a hosting dashboard. |

### 4.3 Reserved root paths — the marketing apex is a closed vocabulary

**No user-generated content is ever served from `endpointforms.com/{anything}`.** This is the
cal.com lesson: once the root is a username namespace, every marketing slug is a carve-out
forever, and the site's IA is permanently shaped by collision avoidance rather than by intent.

Reserved and never assignable to a marketing page:

```
/api        /app       /login      /signup     /logout     /dashboard
/f          /r         /embed      /_next      /.well-known
```

`/mcp` is **not** reserved — it is a marketing page about Handshake (Typeform ships `/mcp`,
Heyflow `/features/mcp/`). The machine-callable surface lives on a different host entirely (§4.4).

### 4.4 The product's URL space — decided now

A form builder does not have two URL spaces. It has **four**, and only one of them is trusted.

| Space | What lives there | Trust level |
|---|---|---|
| Marketing + docs | apex | ours, public, indexed |
| Authenticated app | builder, dashboard, settings | ours, private, `noindex` |
| **Publicly rendered forms** | customer-authored markup, customer CSS, customer redirect targets, embedded in third-party pages | **untrusted, and by our own positioning, hammered by bots** |
| **Handshake surface** | per-form MCP / WebMCP tool definition | machine-callable, per-form |

**Decision:**

```
endpointforms.com                       marketing + /docs
app.endpointforms.com                   the authenticated builder            ← SUBDOMAIN
{workspace}.<render-domain>/f/{formId}  publicly rendered forms              ← SEPARATE REGISTRABLE DOMAIN
{workspace}.<render-domain>/f/{formId}/mcp   the form's handshake
```

`<render-domain>` is a second registrable domain, not yet chosen. **[judgment call]** Run `/domain`
on it before Part 2 begins; registering it now costs one domain fee and prevents a migration that
would break every embedded form our first customers have shipped. Heyflow already does exactly this
(`heyflow.id`); Typeform does the weaker version, giving each workspace a subdomain of its own apex.

#### The argument for `app.` over `/app`

**The convention is 7–2 for a subdomain** (Typeform, Fillout, Heyflow, Formbricks, Reform, cal.com,
PostHog vs. Tally and Supabase). Convention alone isn't an argument. These four are.

**1. The untrusted-content adjacency is decisive, and it is specific to our category.** We must host
customer-authored forms. Once you accept that public forms need their own origin — and everyone
serious in the category has accepted it — the main benefit of `/app` (one origin, everything simple)
is already gone. You are splitting origins regardless. Given that, splitting the app off too costs
almost nothing and buys real isolation.

**2. Cookie isolation is load-bearing for us specifically.** `Path` is not a security boundary —
the same-origin policy ignores it, so any script on `endpointforms.com` can read cookies scoped to
`endpointforms.com/app`. Our marketing site will carry ad pixels and analytics, because we sell to
people who run paid acquisition and we will run paid acquisition. A compromised marketing tag on a
single-origin site runs same-origin with an authenticated session. Host-only cookies on `app.` are
not sent to the apex and are not readable from it.

**3. Independent deploy cadence protects the thing most likely to kill us.** `01 §9` Risk 8 —
"table stakes eat the runway," reliability is "the most boring risk on the list and the most likely
to actually kill us." Youform died on bugs and downtime. A marketing-copy deploy should be
structurally incapable of taking the builder down, and vice versa. Supabase runs docs as a
separately deployed app for the same reason and joins them at the sitemap index; we extend that to
the product.

**4. Caching posture is opposite on the two surfaces.** Marketing is static and aggressively edge-
cached. The app is dynamic, authenticated, and must never be cached. On one origin you spend the
rest of the project writing middleware exceptions and reasoning about which rule won.

#### Why Supabase's counter-example doesn't transfer

Supabase's migration from `app.supabase.com` to `supabase.com/dashboard` is a good call **for
them**, and the difference is structural: their untrusted public surface is customer API endpoints
on `*.supabase.co` — a **different registrable domain** — so their apex has no untrusted neighbor
at all. Their marketing site is not an ad-pixel surface in the way a PPC-targeted site is. Once we
put rendered forms on their own registrable domain (which we should, and are), we've matched their
isolation posture *and* we still have the deploy-cadence and caching arguments. Supabase optimized
for one auth surface across a unified product. We're optimizing for a marketing site that must
never be able to hurt the builder.

#### Analytics consequences, stated honestly

This is the strongest argument for `/app` and it deserves a straight answer rather than a dismissal.

**The cost of a subdomain is one configuration line, not a broken funnel.** Cross-*subdomain* is not
cross-*domain*. GA4 (`cookie_domain: '.endpointforms.com'`) and PostHog
(`cross_subdomain_cookie: true`) both preserve one visitor identity and one session across
`endpointforms.com` → `app.endpointforms.com` natively, with referrer intact, because it is a
same-site navigation. There is no linker parameter, no decorated URL, no session split. What it
costs is a **discipline**: both apps must ship the same analytics install with the same config, and
that must be true on day one of Part 2, not retrofitted.

There is a second-order consequence that actually strengthens the split, and it's the reason the
render domain must be a separate apex:

> If the analytics cookie is set on `.endpointforms.com` and rendered forms lived at
> `forms.endpointforms.com`, our analytics vendor would receive a cookie from **our customers'
> end users** on **our customers' lead-capture forms**. For a product whose entire pitch is
> "we know who filled out your form," quietly instrumenting the people who fill them out is the
> exact sin we accuse the category of. Putting rendered forms on a separate registrable domain
> makes that structurally impossible rather than policy-dependent.

#### What to build now, while nothing exists

- Register `app.endpointforms.com` DNS and point it at a holding 404. Claim it before anything else does.
- Add the §4.3 reserved-path list to the router now, as a build-time assertion that fails CI if a
  marketing route is added at a reserved path.
- Ship two vanity 301s from the apex — `/login` and `/signup` → the app subdomain — so shareable,
  memorable URLs exist and stay stable through Part 2. This is Formbricks' pattern and it is the one
  thing in their IA I'd copy outright.
- Decide and register `<render-domain>` before the first line of Part 2.

### 4.5 Comparison and migration namespaces

Two different intents, two different containers. Supabase is the only one of the nine that
separates them, and it's correct.

```
/alternatives                     hub  (only 2 of 9 sites have a comparison hub)
/alternatives/{competitor}        e.g. /alternatives/typeform
/migrate/{from-tool}              e.g. /migrate/typeform          [Tier 2]
```

`/alternatives/{competitor}` — the competitor's name alone, not brand-prefixed. Reading: "alternatives
to Typeform," which is the actual intent. Heyflow's `/heyflow-vs-typeform/` and Supabase's
`/alternatives/supabase-vs-firebase` are brand-prefixed because they *have* brands people search
for. We don't yet. **`[NEEDS KEYWORD VALIDATION #4]`**

### 4.6 Analytics and instrumentation rules

- One analytics install, one config, shared by the marketing site and the app; cross-subdomain
  cookie on. Set this up before the app exists so it is never retrofitted.
- **Zero analytics, zero third-party tags, on the render domain.** Non-negotiable, per §4.4.
- UTM and campaign params never appear in canonical URLs and never create indexable variants.
- The app is `noindex, nofollow` at the host level, not per-route.

---

## 5. Sitemap and crawl discipline

Fillout's broken sitemap is the single most useful cautionary finding in the teardown: its root
sitemap declares 126 URLs and silently omits 800+ real pages, because Mintlify and Feather generate
their own sitemaps that `robots.txt` never references. We are going to proxy Mintlify at `/docs`.
We will make exactly that mistake unless it is a written rule.

**Rules:**

1. `sitemap.xml` is always a **sitemap index**, from day one, even when it has one child. Adding
   children later then costs nothing.
2. Children, one per generated set: `sitemap-marketing.xml`, `sitemap-integrations.xml`,
   `sitemap-alternatives.xml`, `sitemap-blog.xml`, `sitemap-docs.xml`.
3. **Any proxied third-party surface must have its sitemap registered in our index.** A CI check
   asserts that every path prefix served by a rewrite has a corresponding child entry.
4. `robots.txt` names the index and nothing else.
5. **Hub pages go in the sitemap.** Typeform's `/templates`, `/connect`, and `/use-case-gallery` all
   return 200, are linked from the nav, and appear zero times in its sitemap. Assert hub inclusion
   in CI.
6. `noindex`: `/thanks`, all app hosts, all render-domain hosts, any taxonomy page below the
   member threshold (§6.2), all facet-param URLs.
7. Canonicals are self-referential and absolute on every indexable page.

---

## 6. The pSEO pattern — decided (issue #9)

### 6.1 What the set is, and why it isn't templates or comparisons

Issue #9 generates pages against whatever this section specifies. It specifies **integrations**, and
the reasoning matters more than the pattern.

**Not comparison pages.** `[W]`'s SERP finding is that this category's results are near-exclusively
AI-generated comparison content from a dozen tiny vendors, and `[V]` independently found Reddit
40–60% astroturfed with a confirmed paid-shill ring. More decisively: our comparison voice
(`02 §5`) is a three-beat structure that names what the competitor is genuinely great at and who
should use them instead of us. **That fairness is the differentiator, and it cannot be templated.**
`/alternatives/{competitor}` is hand-written, capped at 6–10, and is not part of the pSEO program.

**Not templates.** Typeform has 2,774 template pages — 67% of its site. Jotform has 20,000+
templates. We conceded template breadth (`01 §8`) and cannot win it. A thin library invites exactly
the comparison we declined, and template pages are the canonical doorway-farm shape.

**Integrations.** They are the honest set, for three reasons:

1. They're table stakes we already committed to: *"native integrations, not Zapier-only… fails
   loudly when a sync breaks"* is the best willingness-to-pay quote in the corpus (`01 §8`).
2. Six of nine sites run this set; the two in-category sites that don't (Heyflow, Tally) are both
   flagged as having a missed surface.
3. **Only ours can carry the wedge.** Every integration page in the category documents what data
   goes *out*. Ours documents what comes *back* — the Verdict mapping. That is the concrete,
   per-tool manifestation of the entire position, and it makes each page structurally impossible to
   generate by swapping a noun.

### 6.2 The pattern

```
/integrations                          hub, indexed, in primary nav
/integrations/categories/{slug}         facet — indexed only at ≥5 members
/integrations/{tool}                    THE pSEO LEAF
```

**Slug rules for `{tool}`:**

- Lowercase ASCII, hyphen-separated, the tool's name as the market writes it:
  `hubspot` · `google-sheets` · `pipedrive` · `go-high-level` · `close` · `salesforce`.
- Never underscores. Never concatenation (`googlesheets`). Never the vendor's marketing
  capitalization. Fillout ships all three styles in one namespace; that is the anti-pattern.
- **One page per tool. Never per tool × modifier.** No `/integrations/hubspot-for-agencies`,
  no `/integrations/hubspot-lead-scoring`. That is where a real set turns into a farm, and it's
  precisely what Typeform's 299 `/connect-integration/{verb-phrase}` pages are.
- The slug is the tool, not the relationship. Not `/integrations/endpoint-forms-hubspot`.

**Category rules:** a `/integrations/categories/{slug}` page is generated **only** when it has ≥5
member tools. Below that it is a filter param on the hub, `noindex`. Segment is always `categories`,
plural.

### 6.3 The anti-doorway bar — enforced by the generator, not by review

A generated page ships only if it can carry all four of these. **If it can't, the tool doesn't get a
page — it gets a row on the hub.** The generator refuses to emit a page it cannot fill; this is a
build failure, not a content-review note.

1. **An outbound field-mapping table** — which form fields map to which objects and properties in
   the tool. Genuinely different per tool.
2. **A Verdict-mapping table** — which field in *that tool* carries won / lost / disqualified /
   value back to the submission. **This is the section no competitor's integration page has**, and
   it is the anti-doorway guarantee: a page that must specify a real deal-stage field mapping cannot
   be produced by find-and-replace.
3. **A working setup snippet** — the actual connection steps or webhook payload for that tool.
4. **One stated limitation.** What this integration does *not* do. Per `02 §4`, conceding is our
   register, and one honest limitation per page is the cheapest possible proof that a human looked
   at it.

Two further hard rules:

- **No page for a tool we don't natively integrate with.** Typeform and Fillout both run integration
  pages for connections that are Zapier underneath. Ours claim native, so ours must be native — this
  is the same promise as the table-stakes commitment, and breaking it here breaks it everywhere.
- **Cap the v1 set at ~40.** Not 400. `[NEEDS KEYWORD VALIDATION #10]` for which 40 and in what
  order. Ordering is CRM-share-in-our-ICP first, search volume second — a page for a tool our ICP
  doesn't use is a page nobody credible will ever read.

### 6.4 If templates are ever built (Tier 2)

```
/templates
/templates/categories/{slug}
/templates/{slug}
```

Same plurality and taxonomy rules. Two additional constraints, or we don't build it: each template
must ship with (a) a stated Yield or Origin angle — what this form is trying to *learn*, not just
collect — and (b) a real conditional-logic example, since debuggable logic past five conditions is
the #1 unclaimed functional complaint in the category. A template library without those is
Jotform's game and we lose it. **`[NEEDS KEYWORD VALIDATION #5]`**

---

## 7. Docs strategy

### 7.1 Where docs live: `/docs` on the apex, separately deployed

**All three OSS exemplars put docs on the apex at `/docs`.** Two of the three still own the `docs.`
subdomain purely to 301 it inward (`docs.supabase.com` → `supabase.com/docs`;
`docs.posthog.com` is a legacy GitHub Pages stub whose entire body is a redirect script). In-category,
Formbricks proxies Mintlify to `formbricks.com/docs` and keeps its link equity on the apex, while
Typeform (Zendesk on `help.`), Heyflow (Intercom on `help.`), and Reform (Help Scout on `docs.`)
all bleed theirs to subdomains they don't control.

**Decision: Mintlify, proxied to `endpointforms.com/docs` via Next.js rewrites.**

- Link equity and E-E-A-T stay on the apex, which matters because docs are a real acquisition
  channel for OSS dev tools.
- Separately deployed, so the docs build never blocks or breaks the marketing build (Supabase's
  pattern, extended).
- Mintlify ships `llms.txt` and per-page `.md` twins for free. That matters disproportionately for
  **us**: we are selling an agent-callable product. Being legible to agents is on-message, not a
  side benefit. Formbricks, cal.com, and Fillout all get this from Mintlify; PostHog built it by
  hand.
- Register `docs.endpointforms.com` and 301 it to `/docs` on day one, before anyone links to it.

**"Docs" gets a top-level primary nav slot** in v1. Supabase and PostHog do this; cal.com buries
docs under a "Developer" dropdown and it is worse for an open-source tool.

**At launch:** `/docs` is reserved, the rewrite is stubbed, nothing is written. Adding the path
later is free; moving it later is not.

### 7.2 Where the self-host guide sits — the deliberate convention break

Per §1.4: **none of the nine has a marketing page for self-hosting.** The OSS convention is to bury
it in docs and, in two cases, actively route readers away from it. That convention encodes their
incentive — all three monetize cloud — not a user truth. Our incentive is different: `01 §8` names
one-command self-host as the one thing we can beat Formbricks and OpnForm on, and `[V]` is unanimous
that OSS form builders are painful to deploy (*"I had to pull out my hair to get the api worker to
work!"*).

**Decision: two pages, doing two different jobs.**

```
/open-source        the commitment      — top-level nav slot
/self-host          the claim           — one command, above the fold, copyable
/docs/self-hosting  the execution       — deployment targets, upgrades, config, backups
```

- **`/open-source`** carries AGPL, "your data is yours, exports are never paywalled," the GitHub
  repo with live star count, a link to the issues-as-roadmap, and the contribution path. This is
  Supporting Message 3 (`01 §10`) and Supabase's `/open-source` is the only precedent in the nine.
  It gets a **top-level nav slot** — a deliberate break from the six in-category sites, justified
  because trust is the scarce resource in an astroturfed category, not because it brings traffic.
- **`/self-host`** exists to make one claim and prove it in one screen: the install command, in a
  copyable block, above the fold, with the honest list of what it does and doesn't set up for you.
  Formbricks spends its only header CTA on a docs deeplink and has no such page; we get the same
  prominence *and* a page that can rank and be linked. This is the whitespace.
- **`/docs/self-hosting/*`** is Supabase's model: 19 guides plus a parallel self-hosted API
  reference. Two Supabase pages worth copying outright — `restore-from-platform` and
  `copy-from-platform-s3`, documented **exit ramps from cloud to self-hosted**. Publishing your own
  exit ramp is an enormous trust signal and costs almost nothing.

**On `/pricing`:** every one of the nine keeps self-host off the pricing columns (Formbricks uses a
tab, Supabase an FAQ accordion, the rest nothing). **We break this too**, and put self-host as a
peer column on `/pricing` — because for them it's a cost center and for us it's the position. Zero
of nine do it, which is the point. `[judgment call — this has commercial consequences beyond IA;
flag it to whoever owns pricing.]`

**Tier note:** `/self-host` ships in v1, not at launch, because until the command exists it's a
promise rather than a differentiator. At launch, `/open-source` states the AGPL commitment and links
to the repo, and says plainly that one-command self-host is what we're building. Claiming a working
install we haven't shipped would be the same dishonesty we're selling against.

---

## 8. Navigation design

### 8.1 Launch-tier header

Tally runs one content link in its entire header. A waitlist site should run zero.

```
[logo]                                     [★ GitHub 0]  [Join the waitlist]
```

- The **GitHub link with a live star count** is the single highest-value nav element available to a
  pre-launch open-source project, and only 1 of 9 sites uses it (Supabase). For us it is the only
  credibility artifact that exists before the product does.
- The essay is linked from the homepage body and the footer — not the header. A one-page waitlist
  site with a two-item nav is fighting itself.

### 8.2 Launch-tier footer

Three short columns. Everything in Tier 0 is reachable; no orphans.

| Product | Company | Legal |
|---|---|---|
| The argument (`/{pov-slug}`) | About (`/about`) | Privacy (`/privacy`) |
| Open source (`/open-source`) | GitHub ↗ | Terms (`/terms`) |
| | Roadmap (GitHub issues) ↗ | |

Plus one line: *AGPL-3.0. Self-hostable. Your data is yours.*

### 8.3 v1 header

```
[logo]  Product ▾   Docs   Pricing   Open source        [★ GitHub]  [Log in]  [Start free]
```

Four items — inside the 4–7 rule, and one fewer than Fillout, three fewer than Typeform.

- **Product ▾** — the five capability pages plus "All features" → `/features`.
- **Docs** — direct link, not buried in a dropdown (Supabase and PostHog pattern).
- **Pricing** — direct.
- **Open source** — direct, to `/open-source`. The deliberate break from category convention (§7.2).
  `/self-host` is linked prominently *from* that page and from the footer, so one nav slot does both
  jobs — tighter than Formbricks, which spends its only slot on a docs deeplink.

### 8.4 v1 footer

| Product | Open source | Resources | Company |
|---|---|---|---|
| Features | Open source | Docs | About |
| Pricing | **Self-host** | Blog | Changelog |
| Integrations | GitHub ↗ | The argument | Security |
| | License (AGPL) ↗ | Alternatives | Status ↗ |
| | Contributing ↗ | | Privacy · Terms |

Supabase is the only one of the nine with a dedicated **Community/Open-source footer column**; we
take that pattern.

### 8.5 What deliberately stays out of the nav

| Kept out | Why |
|---|---|
| **`/alternatives/*` and the `/alternatives` hub** | Footer only. All nine sites do this, and it's right: a competitor's name in your primary nav trains a visitor to go compare. These pages earn traffic from search, not from browse. |
| **Every pSEO leaf** | The nav links `/integrations` (the hub). Leaves are reachable from the hub, their category page, and docs. **The footer never enumerates them.** Typeform lists ~40 pSEO leaves in footer accordions — that is what a doorway farm looks like from the outside, and it's the exact impression we cannot afford. |
| **`/blog`** | Footer, not header. A blog in the primary nav promises a cadence, and our distribution bet is a small number of strong POV pieces, not volume. |
| **`/templates`** | Stays out until it exists and is good (§6.4). |
| **`/about`, `/changelog`, `/security`, `/status`** | Footer. Standard. |
| **`/self-host`** | Reached via `/open-source` and the footer. It's a destination for people already convinced, not a top-of-funnel entry. |

### 8.6 Breadcrumbs

On `/features/{x}`, `/integrations/{tool}`, `/integrations/categories/{slug}`,
`/alternatives/{competitor}`, `/blog/{slug}`, and all `/docs/*`. Not on root-level pages (there's
nowhere to go but home). Mirror the URL path exactly; emit `BreadcrumbList` schema. Breadcrumbs are
free internal links on every generated page and are the cheapest defense against orphaning.

---

## 9. Internal linking strategy

### 9.1 Three hubs

**Hub 1 — the argument essay (`/{pov-slug}`).** This is the pillar page and the linkable asset.
Every capability page links *up* to it ("why we measure it this way"); it links *down* to each
capability page as the mechanism behind each claim. After the homepage it should be the most
internally linked page on the site. It is also the piece we submit to HN, post to r/PPC, and cite
from every guest appearance — which is precisely the "contrarian POV beats saturated comparison SEO"
bet from `01 §1`.

**Hub 2 — `/integrations`.** Hub for the pSEO set. Links down to every leaf and every category page.

**Hub 3 — `/docs`.** Hub for depth. Every capability page links to its docs section; every
integration leaf links to its docs page.

Secondary hub: **`/alternatives`** — one of only two comparison hubs across the nine sites, which is
free differentiation. Links down to each comparison; each comparison links back up and sideways to
`/features/{the-capability-that-is-the-difference}`.

### 9.2 Making pSEO pages not look like a doorway farm

The question isn't "how do we link them back" — it's "what makes a generated page structurally
distinguishable from a doorway page." Five rules, all mechanically checkable:

1. **Every leaf links up to exactly two places:** `/integrations` and its one category page. Not to
   a list of 40 siblings.
2. **Every leaf links out to two pages of a *different type*:** the capability page it serves
   (`/features/{outcome-slug}`) and its own docs page (`/docs/integrations/{tool}`).
   **Cross-type outbound links are the distinguishing feature.** A doorway page links only to
   conversion pages and to its own siblings; a real page links into substance.
3. **Sibling links are capped at 4**, chosen by category relevance, never alphabetically, never
   "see all 40."
4. **The footer never enumerates leaves.** The footer links the hub. Only the hub and the category
   pages enumerate.
5. **The unique-content bar (§6.3) is a build gate.** A page that can't carry a field map, a Verdict
   map, a setup snippet, and a limitation is never generated. This is the only rule that actually
   matters; the other four are hygiene.

### 9.3 Cross-section links that must exist

| From | To | Anchor intent |
|---|---|---|
| Homepage | the argument essay | the full case, not a teaser |
| Each capability page | the argument essay | why this metric |
| Each capability page | its docs section | how it actually works |
| `/features/{outcome-slug}` | `/integrations` | where verdicts come from |
| Each integration leaf | `/features/{outcome-slug}` + its docs page | §9.2 rule 2 |
| Each `/alternatives/{x}` | the one capability page that *is* the difference | not the homepage |
| `/open-source` | `/self-host` + `/docs/self-hosting` + GitHub | the three depths of the same claim |
| `/pricing` | `/self-host` | the self-host column links to the page (§7.2) |
| Every blog post | the argument essay | the pillar |

### 9.4 Orphan policy

**Zero orphans, asserted in CI.** A build-time check walks the route manifest and fails if any
indexable route has no inbound internal link from another indexable route. This is not
theoretical — Heyflow orphans most of `/solutions/industries/*` and half its `/features/*` from
navigation, and Reform orphans its entire `/integrations/{slug}` set from a mega-menu that
advertises those very tools. Both are sites that grew past their IA. We are writing the assertion
before the growth.

Anchor text is always descriptive. Never "learn more," never "click here" — and note that this
follows from voice, not just SEO: `02 §7` bans exactly this register.

---

## 10. Page-by-page brief — launch tier

Six pages. Each has a job; if it couldn't get one it isn't here.

---

### `/` — Homepage

**Job.** Convert an agency owner or PPC specialist who arrived angry into a waitlist signup, in one
scroll, without a product to show. It must make the argument *and* prove a human made it.

**Primary keyword slot.** The category head term plus a modifier — we compete inside "form builder"
(spine), differentiated on the metric. Which modifier is a data question.
**`[NEEDS KEYWORD VALIDATION #8]`** — settled by relative volume and commercial intent across
"form builder for lead generation," "lead capture form builder," "form builder with analytics," and
whether any of them reach agencies/PPC rather than the SMB price segment we deprioritized (Risk 9).
Note the H1 is fixed by the spine — *"Your form can't tell a buyer from a bot — and it's reporting
both as conversions"* — so the keyword lives in the `<title>` and the first subhead, not the H1.

**Proof order** (fixed by `01 §10`): felt pain → the dishonest dashboard → provenance → outcome
grading → what we're not.

**CTA.** Join the waitlist. Email only. One field. Anything more is indefensible for a product that
sells "every form element is a barrier."

**Links out.** The argument essay (primary, twice — once mid-page, once at the end) · `/open-source`
· `/about` · GitHub.
**Links in.** Everything.

---

### `/{pov-slug}` — The argument

**Job.** Be the linkable asset. This is the distribution bet from `01 §1`: in a category where the
SERP is AI slop and Reddit is 40–60% astroturf, one essay with receipts outperforms twenty
comparison pages. It's what gets posted, cited, and argued with — and arguing with it is a win,
because the argument is the position.

**Content shape.** The five-premise case from `01 §4`, with the verified statistics and the verbatim
r/PPC quotes. Including the strongest counter-arguments (`01 §7`, Objections 1–3) at full strength,
answered honestly. That inclusion *is* the differentiator: nobody in this category publishes the
best case against themselves.

**Slug.** Argument-bearing, not keyword-bearing — a permanent positioning document, not a dated
post, so it lives at a root slug (cal.com and Supabase both do this for permanent argument pages)
rather than under `/blog`. **`[NEEDS KEYWORD VALIDATION #1]`** — settled by whether any head term
carries commercial intent *and* reaches our ICP. If keyword research finds volume, the slug becomes
keyword-bearing and the page absorbs it. If it finds nothing (Risk 9 confirmed), the slug should be
the argument itself and the page's job is link acquisition, not ranking.

**CTA.** Inline waitlist form at the end, plus a sticky one after the third premise.
**Links out.** Homepage · `/open-source` · sources (external, `rel="nofollow"` not needed — citing
real sources is the point).
**Links in.** Homepage (×2) · footer · every future capability page and blog post.

---

### `/open-source` — Open source

**Job.** Convert skepticism into trust, and give developers a reason to star the repo before there
is anything to run. It answers Supporting Message 3 — *your data is yours and we can't take it
away* — which `[V]` shows is aimed at a documented resentment (vendors gating exports and changing
free tiers), not an abstract principle.

**Content.** AGPL-3.0 and what it means for a user in one paragraph, not a license summary · the
GitHub repo with live star count · "exports are never paywalled" as an explicit commitment ·
issues-as-roadmap · how to contribute · and the honest statement that one-command self-host is being
built and isn't shippable yet. Per `01 §8`, this is a **trust asset, not a demand driver** — zero
marketers in the corpus asked for open source — so it reads as a commitment, not a pitch.

**Primary keyword slot.** `[NEEDS KEYWORD VALIDATION #11]` — "open source form builder" is a real
term Formbricks targets directly with `/open-source-form-builder`. Whether we contest it here or on
a separate page depends on volume and on whether that query reaches developers (who will self-host
and never pay) or buyers.

**CTA.** Star the repo (primary) · join the waitlist (secondary).
**Links out.** GitHub · GitHub issues · the argument essay · homepage.
**Links in.** Header (Tier 0: no — footer) · footer · homepage.

---

### `/about` — About

**Job.** Prove a named human is behind this. In a category `[V]` describes as *"the most astroturfed
software niche I have mined,"* with a confirmed paid-shill ring, a real person with a face and a
history is a differentiator, not a vanity page. It is also where the voice constraint (`01 §10`) —
"sounding like an actual person with a point of view is itself differentiating" — gets a home.

**Content.** Who is building this, what they did before, why this problem. Plus the anti-personas,
stated plainly: who this is not for, by name (`01 §2`). Saying that out loud here is cheap and buys
credibility.

**Primary keyword slot.** None. This page is not for search.

**CTA.** Join the waitlist.
**Links out.** Homepage · the argument essay · GitHub · personal socials.
**Links in.** Footer.

---

### `/privacy` and `/terms` — Legal

**Job.** Make it lawful to collect an email, and — for this product specifically — make the privacy
page a proof point rather than boilerplate. Formbricks puts **"Privacy" in its primary nav**; that
is positioning expressed as IA and it works because their differentiation is data residency. Ours
isn't, so these stay in the footer — but the privacy page should still say plainly what we do and
don't do with a waitlist email, in the house voice.

**Primary keyword slot.** None. `noindex` is unnecessary; these can be indexed and ignored.

**CTA.** None.
**Links in.** Footer.

---

### `/thanks` — Waitlist confirmation

**Job.** Confirm the signup, set an expectation for what arrives and when, and convert one more
step: star the repo, or read the essay if they signed up from the homepage without reading it.

**Primary keyword slot.** None. **`noindex`.**

**CTA.** Star the repo · read the argument.
**Links out.** GitHub · the argument essay.
**Links in.** The waitlist form's post-submit redirect only. Deliberately unlinked from nav —
the one intentional non-orphan exception, and it's excluded from the CI orphan check by allowlist.

---

## 11. Index of `[NEEDS KEYWORD VALIDATION]` markers

Every one of these is a decision this doc could not make without `docs/04-keyword-research.md`.
Each names the specific data that settles it.

| # | Where | The decision | What settles it |
|---|---|---|---|
| 1 | §10, `/{pov-slug}` | Essay slug: argument-bearing vs keyword-bearing | Whether any head term exists with commercial intent that reaches agencies/PPC rather than SMB price-shoppers. If nothing qualifies, Risk 9 is confirmed and the slug is the argument. |
| 2 | §3 Tier 1, `/features/*` | The five capability slugs (Origin, Verdict, Hindsight, Handshake, Yield) | Volume + intent on the descriptive alternatives: "form spam protection," "form analytics," "form a/b testing," "lead source tracking," "form conversion tracking," "ai agent form fill." Brand nouns are the H1; slugs must carry search intent. |
| 3 | §3 Tier 1 | Whether the features hub is `/features` or `/product` | Whether "form builder features" carries volume worth an indexed hub. |
| 4 | §4.5 | Comparison shape: `/alternatives/{competitor}` vs `/alternatives/endpoint-forms-vs-{competitor}` | Relative volume of "{competitor} alternative" vs "{competitor} vs {x}". Recommendation stands at the former until data says otherwise. |
| 5 | §6.4 | Whether `/templates` is worth building at all, and which ~30 slugs | Whether any "{x} form template" terms carry intent from our ICP rather than generic template intent. Default is do not build. |
| 6 | §3 Tier 1, `/alternatives/*` | Which 6–10 competitors get a page, and in what order | Volume on "{competitor} alternative" for Typeform · Jotform · Tally · Google Forms · Fillout · Heyflow · Formbricks · OpnForm · Gravity Forms. |
| 7 | §3 Tier 2 | Slug for the Handshake merchandising page — `/mcp` vs `/agent-forms` vs other | Emergent volume on "webmcp," "mcp forms," "agent form fill." 2 of 9 sites merchandise this already; it's early enough that the term may not be settled. |
| 8 | §10, `/` | The homepage `<title>` head term and modifier | Volume + commercial intent across "form builder for lead generation," "lead capture form builder," "form builder with analytics." The H1 is fixed by the spine; only the title and first subhead are in play. |
| 9 | §3 Tier 2, `/solutions/*` | Whether `/solutions/agencies` and a PPC-audience page are worth building, and the PPC slug | Volume on "form builder for agencies," "lead gen forms for agencies," and whatever the in-house PPC segment actually types. |
| 10 | §6.3 | Which ~40 integrations, in what order | "{tool} form integration" volume, cross-checked against actual CRM share among agencies and SMB B2B. Ordering is ICP-share first, volume second. |
| 11 | §10, `/open-source` | Whether to contest "open source form builder" on `/open-source` or a dedicated page | Volume on that term and whether it reaches buyers or only self-hosters who will never pay. Formbricks targets it directly at `/open-source-form-builder`. |

---

## 12. Decisions summary

| Decision | Call |
|---|---|
| Launch tier | **6 pages.** Homepage, the argument essay, `/open-source`, `/about`, `/privacy`, `/terms`, plus `/thanks` (noindex). No pricing, no blog, no features, no docs, no comparisons, no templates. |
| App URL space | **`app.endpointforms.com`** — subdomain, not `/app`. Untrusted-content adjacency, cookie isolation from marketing tags, independent deploy cadence, opposite caching posture. Analytics cost is one config line. |
| Public form rendering | **A separate registrable domain**, `{workspace}.<render-domain>/f/{formId}`. Register before Part 2. Keeps customer end-users out of our analytics by construction. |
| Handshake surface | `{workspace}.<render-domain>/f/{formId}/mcp` — co-located with the form it describes. |
| Marketing root | **Closed vocabulary.** No UGC at `endpointforms.com/{anything}`, ever. Reserved-path list asserted in CI. |
| Canonical host | Apex. `www` 301s in. No `Domain` cookies from the marketing site. |
| Trailing slashes | None. 308 enforced. |
| Docs | **Mintlify proxied to `endpointforms.com/docs`**, separately deployed. `docs.` subdomain registered and 301'd in. Top-level nav slot in v1. |
| Self-host | **Convention break, deliberate.** `/open-source` (nav slot) + `/self-host` (marketing page — 0 of 9 sites have one) + `/docs/self-hosting/*` (execution) + a self-host **column** on `/pricing` (0 of 9 do this). |
| pSEO set | **`/integrations/{tool}`**, capped at ~40 for v1, gated by a four-element content bar enforced at build time. The Verdict-mapping table is the section no competitor has and the reason the set can't be noun-swapped. |
| Not pSEO | Comparisons (hand-written, 6–10, `/alternatives/{competitor}`, hub at `/alternatives`) and templates (deferred, and conditional on carrying a Yield/Origin angle). |
| Orphans | Zero, asserted in CI. `/thanks` is the one allowlisted exception. |
| Sitemap | Index from day one. Every proxied surface registers a child. Hub inclusion asserted in CI. |

---

## 13. Open questions for the parent session

1. **Reconcile §11 against `docs/04-keyword-research.md`.** Eleven markers, each with its settling
   data named.
2. **`<render-domain>` needs choosing and registering.** Run `/domain`. This blocks nothing today
   and blocks everything the day Part 2 starts.
3. **The self-host column on `/pricing` is a commercial decision, not an IA one.** Flagged in §7.2;
   it needs whoever owns pricing to agree before it's designed.
4. **Feature naming is still unscreened** (`02 §9`). Verdict, Origin, Yield, Hindsight, Handshake
   need USPTO screening before they appear as H1s on `/features/*`. The URL slugs are descriptive,
   so a naming change would not force a URL change — that separation is deliberate.
5. **This markdown is the source of truth; the review surface is an Artifact.** Per `CLAUDE.md`,
   anything Corey reviews ships as an HTML Artifact. Publishing it should happen *after* the §11
   reconciliation so the link isn't stale on arrival.
