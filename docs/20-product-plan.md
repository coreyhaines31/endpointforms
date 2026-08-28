# Part 2 — The product: plan and order of operations

**Written 2026-08-28.** 23 issues, #26–#48, milestone *Part 2 — The product*.

---

## The one decision that shapes everything: submission path before builder

The instinct is to build the builder first. It is the visible thing, it demos well, and it is
what people picture when they hear "form builder." That instinct is wrong here, for three
reasons.

**1. A form is data. You do not need a builder to have a form.**
The form definition is a versioned row. We can seed one, render it, and collect against it
before any authoring UI exists. Building the builder first means writing an editor for a
pipeline that has never carried a real submission.

**2. The waitlist is live and losing signups right now.**
`endpointforms.com` is public with 63 pages and an argument essay, and its only conversion
goal refuses honestly rather than claiming a success it cannot deliver. Every day without the
submission path is signups not captured. The builder does not fix that. The submission path
does, in #33.

**3. The riskiest claim in the whole position is only testable with real traffic.**
`docs/01-positioning.md` Risk 1 — *provenance may not actually distinguish a bot from a human*
— is the highest-severity risk we logged and it is still unfalsified. If it does not hold,
Pillar 1 collapses and the positioning needs rework. That is a thing to discover in week two
on our own form, not in month five on a customer's.

So: **P1 ends with our own waitlist running on Endpoint Forms.** That is the milestone that
proves the pipeline, closes the signup leak, and puts Risk 1 in front of real traffic.

---

## Phases

### P0 — Foundations (#26, #27, #34)
Render domain, database, auth and tenant isolation.

`#26` goes first and alone, because the renderer cannot be built until the domain exists, and
`docs/05` §4 requires forms to live on a **separate registrable domain** — our marketing site
carries ad pixels, and customer form traffic must never share a cookie domain with our
analytics vendor. `#34` carries the single most dangerous bug in a product like this: a
cross-tenant leak. It gets a test that fails if any workspace-scoped query skips the helper.

### P1 — The submission path (#28, #29, #30, #31, #32, #33)
Renderer, ingest, Origin, spam, Manifest, then our own waitlist.

`#30` (Origin) and `#32` (Manifest) are two halves of one idea and should be built together:
the agent identifies itself, and *that identification is the filter*. `#30` is written as an
experiment rather than a feature — its deliverable includes an honest write-up of whether the
mechanism actually works, including if it doesn't.

`#31` is held to a higher standard than a normal vendor would be, because we published 12
teardowns at `/spam` saying every existing defense is defeated — including one concluding that
OTP works and isn't us. Shipping OTP as a paid upsell would make that page a lie.

### P2 — The builder (#35, #36, #37, #38, #39)
Authoring UI, conditional logic, multi-step, theming, embeds.

`#36` is the highest-leverage issue in this phase and possibly the plan. Conditional logic
breaking past five conditions is the **#1 functional complaint in the category (~12 independent
sources) and currently unclaimed by anyone.** The differentiator is not the logic — everyone
ships logic. It is the **rules inspector**: given a set of answers, show which rules fired and
what each one did. Nobody ships a way to see *why* a field is hidden.

The bar for this whole phase comes from the research: three separate people abandoned a
competitor over a buggy builder, and `docs/00` names that the single most likely way we die.
**Fewer field types that work perfectly beats more that are flaky.**

### P3 — Getting data out (#40, #41, #42)
Inbox, destinations, and failing loudly.

`#42` is deliberately separate from `#41` because it is the part that gets skipped. Our own
words in `docs/01` §8: *"our outcome sync must announce its own breakage, or the whole product
silently lies. That is the same sin we accuse the category of."* This is pillar 2's actual
differentiator — everyone has integrations; almost nobody tells you when one breaks.

### P4 — The wedge (#43, #44, #45)
Verdict, Yield, Hindsight.

Last, and necessarily so: there is nothing to attach an outcome to until real submissions
exist. Each of these carries an honesty constraint that is as important as the feature —
`#43` must warn a workspace whose sales cycle is too slow for the loop to work, `#44` must
refuse to imply precision it doesn't have, and `#45` must decline to declare a winner without
statistical power. **Refusing to call a test is a feature.**

### P5 — Ship (#46, #47, #48)
Self-host, billing, docs.

`#46` makes an already-published claim true. `/open-source` says self-hosting is one command;
until that is real, the page is a promise. The test is a stranger, a cold machine, and a
stopwatch — **if it takes more than ten minutes, the page should change until it's true.**

`#47` is the most dangerous surface in the plan. Pricing is the #1 complaint in the category
at ~45 independent sources, and the free tier must be genuinely usable forever with exports
never paywalled.

---

## Dependency order

```
#26 render domain ─┐
#27 database ──────┼─→ #28 renderer ─→ #29 ingest ─┬─→ #30 Origin ─┐
#34 auth ──────────┘                               ├─→ #32 Manifest┤
                                                   └─→ #31 spam ───┴─→ #33 waitlist ✦
                                                                          │
                        ┌─────────────────────────────────────────────────┘
                        ├─→ #35 builder ─→ #36 logic ─→ #37 steps ─→ #38 theme ─→ #39 embed
                        └─→ #40 inbox ──→ #41 destinations ─→ #42 fail loudly
                                                                  │
                                            #43 Verdict ─→ #44 Yield ─→ #45 Hindsight
                                                                  │
                                            #46 self-host · #47 billing · #48 docs
```

`✦` = the milestone worth optimising for. Everything before it is infrastructure; everything
after it is built on a pipeline that has carried a real lead.

## What is deliberately not in this plan

- **A template library.** We conceded breadth to Jotform in `docs/01` §8.
- **AI form generation.** `docs/00` rules out the "AI-powered" lane as crowded, thin and low-trust.
- **A permissions matrix.** Owner and member is enough until someone asks.
- **Password auth.** A liability we don't need for a B2B tool.
- **Programmatic alternatives pages.** `docs/09` argued against them and `#17` proved why —
  we had a competitive claim that was simply false.
