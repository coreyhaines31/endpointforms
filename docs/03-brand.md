# Brand — voice and visual identity

Inherits every decision in `00-positioning-spine.md`. If something here appears to
contradict the spine, the spine wins and this document is wrong.

Source material: the voice-of-customer research at
`~/.config/makerskills/deep-research/archive/2026-08-28-form-builder-voice-of-customer.md`.
Every "they say" in this document is a real quote from that corpus, not a persona.

Implementation: `docs/design-tokens.css`. Logo files: `public/logo.svg`,
`public/logo-mark.svg`, `public/logo-wordmark.svg`.

---

## 1. Brand personality

Five traits. Each one is a constraint, not an adjective.

### Blunt

- **This means:** we lead with the uncomfortable thing. The first sentence names the
  problem, not the product. We use the number and the word the customer used.
- **This does not mean:** rude, sneering, or picking fights. Bluntness is about what we
  say first, not how hard we hit. We are never blunt about a *person* — only about a
  metric, a mechanism, or our own gaps.
- **Sounds like:** "Completion rate can't tell a buyer from a bot."
- **Does not sound like:** "Legacy form builders are fundamentally broken."

### Evidenced

- **This means:** claims arrive with receipts. A number gets a source. An argument gets
  a practitioner quote. When we don't have the receipt, we say we don't have it yet.
- **This does not mean:** stat-stuffing, or borrowed authority. Two verified numbers beat
  six unsourced ones. The spine already lists figures we are forbidden from citing because
  we could not verify them — that rule is the trait in action.
- **Sounds like:** "Automated requests are about 57.5% of HTML traffic. That is not a
  metaphor for your form fills; it is the traffic hitting your form."
- **Does not sound like:** "Studies show that most leads are fake."

### Technically literate

- **This means:** we write for someone who already runs offline conversion import, knows
  what a CAPI event is, and has debugged a GTM trigger at 11pm. We don't explain a webhook.
  We do explain anything genuinely new — WebMCP is new; webhooks are not.
- **This does not mean:** showing off, or gatekeeping. Literacy is what we assume about the
  reader, not what we perform at them. If a sentence exists to prove we're smart, cut it.
- **Sounds like:** "Your offline conversion import teaches Google. It teaches your form
  nothing."
- **Does not sound like:** "Leverage bi-directional outcome telemetry across the funnel."

### Plainspoken

- **This means:** the customer's vocabulary, short sentences, concrete nouns. Junk leads.
  Tire kickers. Sales hated the leads. If r/PPC wouldn't type it, we don't ship it.
- **This does not mean:** dumbed down, folksy, or slangy. Plain is a register, not a
  reading level. Precision is plainer than vagueness.
- **Sounds like:** "Sales called every one of them. Every one was junk."
- **Does not sound like:** "Optimize for qualified pipeline velocity."

### Self-implicating

- **This means:** we hold ourselves to the metric we're selling. We publish our own
  numbers, we say what we don't do yet, and we say plainly who we are not for. This is
  also the mechanism that keeps the contrarian POV from turning smug: the knife points at
  us in the same paragraph it points at the category.
- **This does not mean:** false modesty, or hedging every claim into mush. Admitting a gap
  is not apologizing for existing. State the gap once, flatly, and move on.
- **Sounds like:** "We don't have Jotform's 20,000 templates and we're not going to. If
  you need a template for a Little League registration form, use Jotform."
- **Does not sound like:** "We're just a small team doing our best, so please be patient!"

---

## 2. Voice principles

Six rules, each with the same sentence written wrong and then right.

### 2.1 Lead with the problem, not the product

The reader's attention is bought by their pain, not our architecture.

> **Before:** Endpoint Forms is an open-source form builder with provenance tracking and
> outcome-weighted split testing.
>
> **After:** Your form can't tell a buyer from a bot — and it's reporting both as
> conversions.

### 2.2 Name the mechanism, not the magic

Never let a capability read as a claim we can't show. Say how it works in one clause.

> **Before:** AI-powered spam detection keeps fake submissions out of your pipeline.
>
> **After:** One form definition publishes two surfaces — a human UI and a machine-callable
> endpoint. We know which one was used, so we can stamp every submission.

### 2.3 Use their words

> **Before:** Improve lead quality and increase qualified pipeline conversion.
>
> **After:** Stop sending sales leads they'll hate.

### 2.4 Attack the metric, never the reader

The reader chose their current tool for reasons that were good at the time.

> **Before:** If you're still optimizing for completion rate, you're doing it wrong.
>
> **After:** Every tool in this category reports completion rate. None of them can tell you
> what those completions were worth. That's not your fault; it's the metric's.

### 2.5 One number, sourced, beats three numbers, vibed

> **Before:** Bots are exploding across the web and most of your leads are probably fake.
>
> **After:** Bad bots were 40% of internet traffic in 2025, up from 37%. Automated traffic
> overall passed half the web.

### 2.6 Say who we're not for, in our own copy

Disqualification is the cheapest trust we can buy, and the research says over-qualification
in the *form* is the wrong lever — so we do it in the *copy* instead.

> **Before:** Endpoint Forms works for teams of every size, from solo founders to
> enterprise.
>
> **After:** If you need one form for an event RSVP, use Tally — it's free and it's good.
> This is for people running paid acquisition who get judged on what sales does with the
> leads.

---

## 3. Tone modulation

The five traits are fixed. Their balance shifts by context.

| Context | Dial up | Dial down | Register |
|---|---|---|---|
| **Homepage** | Blunt, Plainspoken | Technically literate | Short lines. The problem in the first six words. One number above the fold, sourced. No feature list before the reframe lands. |
| **Docs** | Technically literate, Plainspoken | Blunt | Imperative and calm. "Send a POST to /outcomes." Assume competence, never assume context. Every page opens with what the thing is for, in one sentence, before the code. |
| **Error states** | Plainspoken | Blunt, Self-implicating | Say what happened, what it means for their data, and the next action. Never blame the user, never be cute. "Your CRM sync failed 14 minutes ago. 3 submissions are queued and nothing was lost. Reconnect →" |
| **Email** | Self-implicating, Evidenced | Blunt | One idea per email. Written as one person to one person. Subject lines are literal, not clever. No "quick question." |
| **Social (X)** | Blunt, Evidenced | — | One claim, one receipt, one line. Screenshots of real numbers beat prose. Links go in the reply, never the post body. |
| **Social (LinkedIn)** | Evidenced, Self-implicating | Blunt | Show the working. What we tried, what the number was, what we changed. Links in the first comment. |
| **README** | Technically literate, Self-implicating | — | What it is, what it isn't, how to run it in one command, what's not built yet. The "not built yet" section is non-optional — the corpus is unanimous that open-source form builders are painful to deploy and oversold. |
| **Changelog** | Plainspoken, Self-implicating | — | What changed, who it affects, what breaks. Deprecations get a date and a migration path in the same entry. |
| **Bad news** (outage, price change, deprecation) | Self-implicating | Blunt | Lead with the impact on them. Give the timeline. Say what we're doing. Never bury it in a "product update." |

---

## 4. Writing rules

### Sentence and paragraph

- Average sentence under 18 words. Vary the length deliberately — a long sentence that
  carries an argument, then a short one that lands it.
- No paragraph longer than four sentences in marketing copy; three in email.
- One idea per paragraph. If a paragraph has two, it's two paragraphs.
- Front-load. The first clause carries the meaning; qualifiers go after.

### Mechanics

| Rule | Choice |
|---|---|
| Contractions | Always. "Can't," "doesn't," "we're." Formality reads as distance. |
| Person | Second person for the reader ("your form"), first-person plural for us ("we stamp"). Never "users." |
| Headings | Sentence case. Always. |
| Oxford comma | Yes. |
| Em dash | Spaced — like this. Matches the rest of `docs/`. |
| Numbers | Numerals for anything measurable, including 1–9. "3 submissions," not "three submissions." This is a product about numbers; spelling them out softens them. |
| Percent | `%`, closed up: `57.5%`. |
| Currency | `$84,200`. Always tabular numerals. |
| Dates | `Oct 2025` in prose, `2026-08-28` in docs and filenames. |
| Exclamation marks | Effectively never. One per quarter, for something genuinely worth it. |
| Emoji | None in product UI, docs, or README body. Sparingly in social if it's doing real work. |
| ALL CAPS | Only as a typographic device (mono labels, table headers), never for emphasis in prose. Use bold. |
| Links | Descriptive. Never "click here," never "learn more" as the only anchor. |

### Jargon policy

Three tiers.

1. **Use freely, no gloss** — the ICP uses these daily: CPL, CAPI, GA4, GTM, UTM, offline
   conversion import, smart bidding, CRM, webhook, MQL/SQL, ROAS.
2. **Use, gloss once, on first use per page** — genuinely new or ours: WebMCP, MCP tool
   surface, provenance stamp, outcome-weighted, quality-adjusted conversion rate.
3. **Never** — the category's fog: seamless, frictionless, revolutionary, game-changing,
   synergy, leverage (as a verb), unlock, empower, supercharge, next-generation,
   AI-powered, best-in-class, robust, cutting-edge, delightful.

Acronyms in tier 1 never get spelled out. Doing so tells the reader we think they're new,
which is the fastest way to lose an agency buyer.

### Handling the contrarian POV without smugness

We are allowed to be blunt about the category's central dishonesty because we have the
receipts. Four rules keep that from curdling:

1. **Aim at the metric, the mechanism, or the incentive — never at the reader and never at
   a vendor's competence.** "Completion rate can't distinguish a buyer from a bot" is a
   fact about the metric. "Typeform doesn't care about your pipeline" is a slur.
2. **Every criticism ships with a receipt in the same breath.** If we can't source it, we
   don't say it. Unsourced contrarianism is just attitude.
3. **Concede the strongest counter-argument out loud.** The research contains marketers who
   think qualification belongs on the landing page, not in the form — and they're right
   about the cheap fix. Say so, then say what's still unsolved.
4. **Point the knife at ourselves in the same paragraph.** We are also a form builder in a
   category drowning in form builders. Saying that first buys the right to say the rest.

If a sentence would feel good to post and bad to be quoted back at us in two years, cut it.

### How we talk about competitors

- **Name them, and recommend them when they're the right answer.** Tally for free and
  simple. Typeform for the best-looking one-question-per-screen flow. Jotform for depth and
  template volume. Gravity Forms for WordPress and developer hooks. FormAssembly for
  HIPAA and compliance procurement. Formbricks and OpnForm for open-source peers. This is
  not generosity; the spine says we differentiate on the metric, and recommending well is
  how a serious person signals they're not bluffing.
- **Never compare on a dimension the spine says we lose.** Not cheapest, not prettiest, not
  most features.
- **Never call a competitor's product bad.** Criticize a *category-wide* pattern, and let
  the reader assign it.
- **Don't adopt their coined language.** No "conversational forms," no "formless," no
  "flows" as a product noun. Using a competitor's word ratifies their positioning.
- **"X alternative" is a page title, not a self-description.** It's legitimate for SEO
  pages. It never appears in the homepage, the README, or an email.
- **Never quote a competitor's pricing without re-verifying it that day.** The spine flags
  two widely-repeated Typeform figures that their live pricing page contradicts.

### Terminology

| Use | Not | Why |
|---|---|---|
| junk leads, trash leads, tire kickers | unqualified prospects | Their words. Verbatim from the corpus. |
| what the leads turned out to be worth | qualified pipeline | Nobody outside r/PPC says "qualified pipeline." |
| provenance | attribution, verification | Attribution means ad attribution to this audience. Provenance is precise and unclaimed. |
| human / identified agent / suspected bot | verified / unverified | Three states, exactly these words, everywhere. Never abbreviate in UI. |
| suspected bot | bot | The stamp is a suspicion, not a verdict. The word "suspected" is load-bearing and legally safer. |
| outcome | conversion value | "Conversion" already means the ad-platform event. |
| endpoint | API, integration | Ours. Use it. |
| completion rate | conversion rate | Precision: the thing we're arguing against is specifically completion. |
| self-host | on-premise | Our audience is developers, not procurement. |
| form builder | forms platform, form OS | The spine forbids category invention. |
| sign up / set up / log in (verbs) | signup / setup / login (verbs) | Standard. |

---

## 5. Visual direction — the argument

**The category has exactly two looks, and customers named both.**

One is friendly pastel SaaS — rounded, soft, gently gradient. The other is 2015 admin
panel. The corpus is explicit: *"clean, modern visuals that don't look like a survey from
2015,"* *"feels like filling out a PDF online,"* *"they all kind of feel the same at this
point."*

The spine forbids us from competing on prettiness — Typeform owns that. So we don't try to
out-pretty the category. **We out-serious it.**

**The design brief in one line: it should look like an instrument, not a decoration.**

Everything follows from the product's actual claim. The claim is *discrimination* — telling
apart three things that currently look identical on a dashboard. A design that argues that
has to demonstrate it:

- **High contrast, no mush.** Body text runs 17.95:1 on light and 18.05:1 on dark. Nothing
  meaningful sits in a soft mid-grey. If two things mean different things, they look
  different.
- **One loud colour, used rarely.** Signal appears at most twice per view. A highlighter
  that highlights everything highlights nothing — which is precisely the category's problem
  with the dashboard.
- **Monospace on every number.** Numbers are the product. They get their own typeface,
  tabular figures, and never move when they update.
- **Small radii (6px), hairline rules, no drop shadows.** Instruments have edges. Soft
  corners and floating cards are the visual grammar of "don't worry about it," and worrying
  about it is the entire pitch.
- **Warm neutrals, not blue-grey.** Blue-grey is the default SaaS chassis and reads as
  stock. Warm ink on warm paper reads like a document someone is accountable for — and it
  gives the Signal lime a ground to sit on without going acid-on-acid.
- **Dark mode is first-class, specified alongside light, not derived from it.** The ICP
  lives in ad platforms and CRMs all day; a lot of them will never see the light theme.

**What we deliberately avoid:** gradients as decoration, glassmorphism, glow, illustrated
mascots, isometric hero graphics, stock photography of people at laptops, "AI shimmer"
(the spine explicitly rules out the AI lane), and pastel anything. Colour appears where it
carries information and essentially nowhere else.

---

## 6. Typography

**IBM Plex Sans** for everything that reads as prose. **IBM Plex Mono** for everything that
reads as data.

```css
--font-sans: var(--font-plex-sans), ui-sans-serif, system-ui, -apple-system,
             "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
--font-mono: var(--font-plex-mono), ui-monospace, SFMono-Regular, "SF Mono",
             Menlo, Consolas, "Liberation Mono", monospace;
```

Both are on Google Fonts and load through `next/font/google`, which self-hosts the files at
build time — no third-party request, no layout shift, and only the weights we use.

### Why this pair

1. **It is an engineering typeface with humanist warmth.** Plex was commissioned by a
   company whose business is machines that measure things. That's the register we want:
   serious and precise without tipping into corporate-navy or cold-Swiss. It reads as *an
   instrument someone built*, which is exactly what we're selling.
2. **The Sans and the Mono share skeletons and vertical metrics.** A provenance stamp, a
   variant ID, and a dollar figure set in Mono sit inside a Sans paragraph with no visual
   seam. That is not a nicety here. Our whole thesis is that *the label on the data is the
   product*, so the mono is not decoration — it's the voice of the machine, and it needs to
   live comfortably next to the voice of the person.
3. **It is not what the category uses.** Typeform, Tally, and Fillout all sit on
   neo-grotesque or geometric defaults in the Inter/Circular family. Plex is recognisably
   different at a glance without being a costume.
4. **It carries small sizes and long text equally.** The 11px mono uppercase label and the
   62-character body measure both hold up, which a display-first face would not.

**Rejected, and why.** *Inter / Geist* — correct and characterless; Geist in particular
reads as "unmodified Vercel template" on a Vercel deploy, and the scaffold already ships it.
*Space Grotesk* — excellent display face, fatiguing past two lines of body. *Any serif* —
says "editorial, trustworthy, established," when we want "instrument, current, measured."
*A geometric like Poppins/Circular* — the exact pastel-SaaS signal we're moving away from.

### Scale

Set in `docs/design-tokens.css` as Tailwind v4 text tokens.

| Token | Size | Line height | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `text-display-2xl` | 72px / 4.5rem | 1.02 | −0.035em | 600 | Homepage hero, one line only |
| `text-display-xl` | 56px / 3.5rem | 1.05 | −0.03em | 600 | Section openers |
| `text-display` | 44px / 2.75rem | 1.08 | −0.028em | 600 | Page H1 |
| `text-h2` | 32px / 2rem | 1.15 | −0.022em | 600 | |
| `text-h3` | 24px / 1.5rem | 1.25 | −0.016em | 600 | |
| `text-h4` | 20px / 1.25rem | 1.35 | −0.012em | 600 | |
| `text-lead` | 20px / 1.25rem | 1.5 | −0.008em | 400 | Deck under a headline, in `muted-foreground` |
| `text-base` | 16px / 1rem | 1.65 | 0 | 400 | Body |
| `text-sm` | 14px / 0.875rem | 1.55 | 0 | 400 | Secondary, captions |
| `text-xs` | 12px / 0.75rem | 1.4 | 0 | 400 | Dense UI |
| `text-label` | 11px / 0.6875rem | 1.2 | +0.1em | 500 | **Mono, uppercase.** Eyebrows, table headers, provenance stamps, metric captions |

### Rules

- Display and headings are **600, never 700.** Bold headlines read as shouting; the tight
  tracking supplies the density instead.
- `text-label` is the signature. It is always IBM Plex Mono, always uppercase, always
  `+0.1em`. It is what makes the page read as an instrument rather than a blog. Use it for
  eyebrows, table headers, provenance stamps, chart axis labels, and metric captions —
  and nowhere else.
- **Every number the product produces is set in Mono with tabular figures.** Submission
  counts, percentages, currency, variant IDs, form IDs, timestamps. A column of figures
  must never jitter when it updates.
- Body measure 62–70 characters. Never full-bleed paragraphs.
- Never centre a paragraph. Centre a headline only above a genuinely centred section.
- Italics for a defined term on first use only. Never for emphasis — that's bold.

---

## 7. Colour system

Full values in `docs/design-tokens.css`. Hex here for reference.

### Neutrals — warm ink on warm paper

| Role | Light | Dark |
|---|---|---|
| `background` — the page | `#FCFCFA` | `#0B0B09` |
| `card` / `popover` — raised | `#FFFFFF` | `#171714` |
| `sunken` / `muted` — recessed | `#F2F1EC` | `#050504` |
| `border` — hairlines | `#E4E2DA` | `#2A2A25` |
| `border-strong` — inputs, dividers that must be seen | `#CFCDC3` | `#3D3C36` |
| `subtle-foreground` — captions, ≥16px only | `#8C8A7F` | `#75736A` |
| `muted-foreground` — secondary text | `#6A685E` | `#9B998F` |
| `foreground` — body text | `#15140F` | `#F6F5F0` |

Note the direction flip: in light mode a card is *lighter* than the page and a sunken panel
is darker; in dark mode a card is *lighter* than the page and a sunken panel is darker
still. Elevation reads consistently in both.

### Brand — Signal

| Token | Light | Dark |
|---|---|---|
| `signal` — the brand colour, a fill | `#C7F23C` | `#C7F23C` |
| `signal-foreground` — text on a Signal fill | `#14170A` | `#14170A` |
| `signal-ink` — Signal-flavoured *text* | `#41590A` | `#C7F23C` |
| `signal-edge` — required hairline on Signal fills | `#15140F` | `transparent` |

Signal is the same value in both modes on purpose. It is the one thing on the page that
does not change when the theme does — the reading, not the instrument.

**Three hard rules.**

1. **Signal is a fill, never body text on light.** `#C7F23C` on `#FCFCFA` is 1.26:1. On
   light surfaces, Signal-coloured *text* uses `signal-ink` `#41590A` (7.69:1). On dark,
   Signal itself is the text colour (15.19:1).
2. **A Signal fill on a light background always carries a 1px `signal-edge` hairline.**
   Without it the control's boundary is 1.26:1 against the page and fails the 3:1
   non-text requirement. The `.signal-fill` utility in the tokens file does this. It is
   not styling; it is the accessibility fix. On dark, Signal is 15.19:1 against the page
   and needs no edge.
3. **At most two Signal elements per viewport.** One primary CTA and one highlight. This
   is the discipline the whole positioning rests on — a dashboard that flags everything
   flags nothing.

### Provenance — the three states

The product's core UI problem: three states that must be told apart instantly and
unambiguously.

| State | Glyph | Light text | Light surface | Light edge | Dark text | Dark surface | Dark edge |
|---|---|---|---|---|---|---|---|
| **Human** | ● circle | `#0E7688` | `#E8F6F9` | `#B9E2EA` | `#2DD4BF` | `#0F2B2A` | `#1E5C56` |
| **Identified agent** | ◆ diamond | `#4E1FBC` | `#EBE4FB` | `#CBB9F2` | `#A78BFA` | `#211C3A` | `#453A75` |
| **Suspected bot** | ▲ triangle | `#8F4A04` | `#FBF1E1` | `#EED6AE` | `#FB923C` | `#2E2113` | `#6A4419` |

**Bot is amber, not red, and that is a deliberate semantic.** Red is reserved for things
that actually failed — a broken CRM sync, a destructive action. A bot stamp is a
*suspicion* about a submission, not an error, and colouring it red would make the product
guilty of the same over-claiming we criticise. Amber says "look at this," which is the
correct instruction.

**The rules that make this actually accessible** — see §8 for why colour alone cannot
carry it:

- **Every provenance indicator carries all three channels: shape, label, colour — in that
  order of importance.** Never a bare coloured dot. Never colour as the only difference.
- The three glyphs are circle / diamond / triangle. They are distinguishable at 11px in
  pure greyscale, which is the actual accessibility guarantee.
- The full words are always present: "Human," "Agent," "Suspected bot." Never abbreviated,
  never truncated, never a tooltip-only label.
- These three colours are also `chart-2`, `chart-3` and `chart-4`, so a provenance
  breakdown chart uses the same colours as the chips beside it. `chart-1` is Signal (the
  winning variant); `chart-5` is `muted-foreground`.

### Status

| Role | Light | Dark |
|---|---|---|
| `destructive` | `#B3261E` | `#F87171` |
| `destructive-foreground` | `#FFFFFF` | `#1A0B0B` |
| `destructive-surface` | `#FDECEA` | `#2C1414` |

### Radius

`--radius: 0.375rem` (6px), with the Tailwind steps derived from it. This is deliberately
smaller than the shadcn default of 0.625rem. See §5 — instruments have edges. Nothing in
this system is a pill except, optionally, an avatar.

---

## 8. Accessibility

Every ratio below was computed against the actual hex values in `design-tokens.css`, not
estimated. WCAG 2.1: 4.5:1 for normal text, 3:1 for large text (≥18.66px bold / ≥24px) and
for non-text UI boundaries.

### Light mode

| Pair | Ratio | Required | |
|---|---|---|---|
| `foreground` on `background` | **17.95:1** | 4.5 | ✅ AAA |
| `foreground` on `card` | **18.44:1** | 4.5 | ✅ AAA |
| `foreground` on `sunken` | **16.30:1** | 4.5 | ✅ AAA |
| `muted-foreground` on `background` | **5.44:1** | 4.5 | ✅ AA |
| `muted-foreground` on `sunken` | **4.95:1** | 4.5 | ✅ AA |
| `subtle-foreground` on `background` | **3.38:1** | 3.0 (large only) | ✅ — never below 16px |
| `signal-foreground` on `signal` | **14.00:1** | 4.5 | ✅ AAA |
| `signal-ink` on `background` | **7.69:1** | 4.5 | ✅ AAA |
| `destructive` on `background` | **6.36:1** | 4.5 | ✅ AA |
| `human` on `background` | **5.16:1** | 4.5 | ✅ AA |
| `human` on `human-surface` | **4.79:1** | 4.5 | ✅ AA |
| `agent` on `background` | **9.10:1** | 4.5 | ✅ AAA |
| `agent` on `agent-surface` | **7.58:1** | 4.5 | ✅ AAA |
| `bot` on `background` | **6.49:1** | 4.5 | ✅ AA |
| `bot` on `bot-surface` | **5.96:1** | 4.5 | ✅ AA |
| `foreground` focus ring on `background` | **17.95:1** | 3.0 | ✅ |
| **`signal` fill on `background`** | **1.26:1** | 3.0 | ❌ — **requires the `signal-edge` hairline.** With the 1px `#15140F` edge, the boundary is 17.95:1. |

### Dark mode

| Pair | Ratio | Required | |
|---|---|---|---|
| `foreground` on `background` | **18.05:1** | 4.5 | ✅ AAA |
| `foreground` on `card` | **16.46:1** | 4.5 | ✅ AAA |
| `muted-foreground` on `background` | **6.89:1** | 4.5 | ✅ AA |
| `muted-foreground` on `card` | **6.28:1** | 4.5 | ✅ AA |
| `subtle-foreground` on `background` | **4.14:1** | 3.0 (large only) | ✅ — never below 16px |
| `signal` on `background` | **15.19:1** | 4.5 | ✅ AAA |
| `signal` on `card` | **13.85:1** | 4.5 | ✅ AAA |
| `signal-foreground` on `signal` | **14.00:1** | 4.5 | ✅ AAA |
| `destructive` on `background` | **7.12:1** | 4.5 | ✅ AAA |
| `human` on `background` | **10.58:1** | 4.5 | ✅ AAA |
| `human` on `human-surface` | **8.06:1** | 4.5 | ✅ AAA |
| `agent` on `background` | **7.24:1** | 4.5 | ✅ AAA |
| `agent` on `agent-surface` | **5.97:1** | 4.5 | ✅ AA |
| `bot` on `background` | **8.70:1** | 4.5 | ✅ AAA |
| `bot` on `bot-surface` | **6.91:1** | 4.5 | ✅ AAA |
| `signal` fill on `background` | **15.19:1** | 3.0 | ✅ |

### The honest limitation on the provenance triad

Colour alone cannot carry three states accessibly, and pretending otherwise would be the
same over-claiming we criticise in the category. Here is the arithmetic.

For a colour to be readable text on light `#FCFCFA` it needs relative luminance below
about 0.175. All three provenance colours must therefore live inside a narrow luminance
band, which caps how far apart they can be in greyscale:

| Pair (light mode) | Contrast *with each other* |
|---|---|
| human `#0E7688` ↔ bot `#8F4A04` | 1.26:1 |
| human `#0E7688` ↔ agent `#4E1FBC` | 1.77:1 |
| bot `#8F4A04` ↔ agent `#4E1FBC` | 1.40:1 |

Those numbers are as spread as the constraint allows, and they are still not enough to
distinguish the states by lightness alone. Under deuteranopia and protanopia — the common
forms, roughly 1 in 12 men — teal and violet converge toward similar blues.

**Therefore the glyph is not optional and the text label is not optional.** Circle,
diamond, triangle are unambiguous at 11px in greyscale, on a monochrome printout, and to
every form of colour vision. Colour is the third channel — the one that makes the states
*fast* to scan once you already know which is which. A provenance indicator that ships as
colour alone is a bug, not a style choice.

### Other requirements

- Focus ring is `foreground` on light, `signal` on dark. Never removed, never below 2px,
  never relying on colour change alone.
- Minimum touch target 44×44px, including provenance chips if they're interactive.
- `prefers-reduced-motion` is respected everywhere. Nothing in this system requires motion
  to be understood.
- Charts label their series directly. No legend-only encoding.
- Any Signal fill anywhere carries the `signal-edge` on light backgrounds. No exceptions.

---

## 9. Logo

### Files

| File | What it is | Use |
|---|---|---|
| `public/logo.svg` | Full lockup, mark + wordmark | Default. Nav, footer, README, OG images |
| `public/logo-mark.svg` | Mark alone, 24×24 viewBox | Favicon, avatar, app icon, anywhere under 120px wide |
| `public/logo-wordmark.svg` | Wordmark alone | Tight horizontal bands, co-branding lockups |

All three are hand-authored, single-path-per-element SVG. The wordmark is real outlined
IBM Plex Sans 600 at −0.02em tracking — outlines, not `<text>`, so it renders identically
everywhere with no font dependency.

Everything is `fill="currentColor"` except the mark's terminal node, which is
`fill="var(--logo-node, currentColor)"`. That means the logo inherits its colour from
context automatically, and the node picks up Signal wherever `--logo-node` is defined
(the tokens file sets it to `#15140F` on light and `#C7F23C` on dark). Where the SVG is
loaded as an `<img>` or as a favicon, the CSS variable doesn't resolve and the mark falls
back to a clean monochrome — which is correct, not a degradation.

### The mark

A capital **E**. The middle arm is the only one that leaves the letterform — it runs out
past the E and terminates in a solid node.

### Rationale — and yes, we used the endpoint metaphor, pointed the other way

The name carries a real tension. An endpoint is an API surface, which is literally what
this product publishes: one form definition, two callable surfaces. But the positioning
says the opposite thing about forms — *your form isn't the endpoint; the closed deal is.*

We use the metaphor, and we aim it at the outcome rather than the form.

- **The node is not the E.** It sits outside the letter, past its right edge, connected by
  the one arm that travels there. The form is the letterform. The endpoint is the thing
  beyond it. That's the whole argument in one glyph.
- **The arm is connected, not broken.** The gap between the submission and the outcome is
  the category's problem, and a logo shouldn't depict the problem. Ours closes it.
- **The node is the only thing that ever takes Signal.** On dark surfaces the mark is paper
  with one lime node — the single thing on the page worth optimising for. That's the
  cleanest statement of the positioning we can make without words.
- **Secondary read, not to be over-explained:** three arms, three provenance states, one
  of which carries all the way through to an outcome. Nice if someone finds it. Never
  spell it out in copy.

Against the SAD test:

- **Simple** — five straight edges and a circle. Verified legible at 96, 64, 32 and 24px,
  and still readable at 16px.
- **Appropriate** — an engineered, drawn-with-a-ruler letterform that matches the
  instrument direction and the Plex wordmark's weight.
- **Distinct** — an extended-arm E is a known device, but the terminal node past the
  letterform is specific. **No trademark screen has been run.** Do one before any filing
  or paid launch.

### Usage rules

**Clear space.** Minimum on all four sides equals the mark's own counter — the gap between
its arms, which is 25% of the mark's height. At a 24px mark that's 6px. Nothing enters that
zone: no text, no rule, no image edge, no other logo.

**Minimum sizes.**

| | Minimum | Preferred floor |
|---|---|---|
| Mark alone | 16px tall (favicon only) | 24px |
| Full lockup | 24px tall | 28px tall |
| Full lockup by width | 120px | 140px in a nav |

Below 120px wide the wordmark's counters fill in. Use `logo-mark.svg` instead — never a
shrunk lockup.

**Colour.**

- On light: mark and wordmark in `foreground` `#15140F`; node in `foreground` too. Signal
  on a light ground is 1.26:1 and turns the node into a smudge.
- On dark: mark and wordmark in `foreground` `#F6F5F0`; node in `signal` `#C7F23C`.
- On a Signal ground: everything in `signal-foreground` `#14170A`.
- On a photograph: monochrome only, `#FFFFFF` or `#15140F`, whichever clears 4.5:1.
- Any single colour is permitted for one-colour print, embroidery, and partner sheets.

**Favicon.** `logo-mark.svg` on a 6px-radius tile. Preferred tile is `#0B0B09` with a
`#F6F5F0` mark and a `#C7F23C` node — verified legible at 24px.

**Never.**

- Never recolour the mark or the wordmark to anything outside the palette.
- Never apply a gradient, shadow, outline, bevel, or glow.
- Never rotate, skew, stretch, or condense. Scale proportionally only.
- Never rebuild the wordmark in live text — the tracking and the outlines are the asset.
- Never change the spacing between the mark and the wordmark, or restack them vertically,
  without a new lockup file.
- Never set the mark and the wordmark in different colours in the same lockup (the node is
  the sole exception).
- Never place the lockup on a background that fails 4.5:1 against it.
- Never add a tagline inside the clear space.
- Never use the mark as a bullet, a list glyph, or a decorative pattern element. It appears
  once per surface.

---

## 10. Applying this

1. `docs/design-tokens.css` replaces the `@theme inline`, `:root` and `.dark` blocks in
   `src/app/globals.css`. Merge notes are at the top of that file.
2. `src/lib/fonts.ts` swaps `Geist`/`Geist_Mono` for `IBM_Plex_Sans`/`IBM_Plex_Mono` from
   `next/font/google`, exposing them as `--font-plex-sans` and `--font-plex-mono`.
   Weights needed: Sans 400, 500, 600; Mono 400, 500. The three root layouts that want
   the face — `(site)`, `(app)`, `(auth)` — put `FONT_VARIABLES` on their `<html>`.
   `(forms)` deliberately does not: a hosted form uses the system stack, and
   `globals.css` gives `--font-plex-sans` a `var()` fallback so it can.
3. Provenance components must ship glyph + label + colour together, as a single component.
   Do not build a bare `<ProvenanceDot />`.
4. Any Signal fill uses the `.signal-fill` utility, which carries the required hairline.

A QA page rendering the logo at every size, the full palette with hex labels, the
provenance stamps and the type scale — in both themes — lives at
`/private/tmp/claude-501/-Users-coreyhaines/fd6a0d18-2b1f-41a5-a57a-19a843193052/scratchpad/brand-preview.html`.
It's scratch, not a deliverable; rebuild it if it's gone.
