# Part 2 — The product: plan and order of operations

**Written 2026-08-28.** 23 issues, #26–#48, milestone *Part 2 — The product*.

---

## Revised 2026-08-31 — endpoint-first

The plan below originally assumed we render every form. Corey raised Formspree: maybe we don't
need a builder at all, just a wrapper around form code. That reframing is right, and it is now
the architecture.

**The product is an endpoint.** You point an existing form at a URL and it works — no builder,
no migration, one attribute changed. That is #50, and it is the fastest path to something that
actually collects a submission.

### Why we are not simply Formspree

Two reasons, one commercial and one structural.

Formspree meters purely per submission: free 50/mo, $10 for 200, $20 for 2K, $60 for 20K. That
is exactly the meter pillar 3 exists to attack. Ours stays genuinely usable free, exports never
paywalled. *(Billing is deprioritized — #47 — but the constraints stay binding.)*

The structural reason matters more. **Formspree only ever sees posts. It never knows what the
form is.** So it cannot build Manifest — you cannot generate an agent-callable tool definition
from a payload you have never seen a shape for — and it cannot build Hindsight, because you
cannot serve variants of a form you do not render.

### The schema is the hinge

That gap is #51. An endpoint works with **no schema**. Declaring one is **optional** and unlocks
Manifest, Hindsight, server-side validation and typed exports.

Four ways to produce a schema, only one of which is a builder:

1. **Import from HTML** — paste a form or point us at a URL. The bridge between the two paths.
2. **Declare it in a file** — JSON, committed, applied by CLI. Developer-native.
3. **Infer and confirm** — propose one from observed submissions.
4. **The builder** (#35) — a convenience that generates the schema, not the foundation.

Corey's point about the audience resolves the objection I raised: because of AI, developers do
marketing and marketers ship code. The two paths are not two products for two buyers — they are
two entry points for the same person on different days.

### The hard constraint on all of it

**Both paths must be demoable by the end.** Backend-first is a build order, not a scope cut. The
builder still gets built properly; it just isn't what everything else depends on.

And adding a schema must never break an endpoint that worked without one. Strictly additive,
warn-not-reject by default. If declaring a schema can start rejecting submissions that used to
succeed, we have built a footgun.

---

## The original ordering call: submission path before builder

*Still correct, and endpoint-first strengthens it.*

## Phases

### P0 — Foundations (#26, #27, #34)
Render domain, database, auth and tenant isolation.

`#26` goes first and alone, because the renderer cannot be built until the domain exists, and
`docs/05` §4 requires forms to live on a **separate registrable domain** — our marketing site
carries ad pixels, and customer form traffic must never share a cookie domain with our
analytics vendor. `#34` carries the single most dangerous bug in a product like this: a
cross-tenant leak. It gets a test that fails if any workspace-scoped query skips the helper.

### P1 — The submission path (#50, #29, #30, #31, #51, #32, #33)
Endpoint, ingest, Origin, spam, the optional schema, Manifest, then our own waitlist.

`#50` comes first: an endpoint any existing form can post to, with no schema and no rendering.
`#51` follows, because Manifest cannot exist without it.

`#30` (Origin) and `#32` (Manifest) are two halves of one idea and should be built together:
the agent identifies itself, and *that identification is the filter*. `#30` is written as an
experiment rather than a feature — its deliverable includes an honest write-up of whether the
mechanism actually works, including if it doesn't.

`#31` is held to a higher standard than a normal vendor would be, because we published 12
teardowns at `/spam` saying every existing defense is defeated — including one concluding that
OTP works and isn't us. Shipping OTP as a paid upsell would make that page a lie.

### P2 — The builder and hosted forms (#28, #35, #36, #37, #38, #39)
Hosted renderer, authoring UI, conditional logic, multi-step, theming, embeds.

**Optional architecturally, required for the deliverable.** Corey needs both paths demoable by the
end, so this gets built properly — it simply is not what everything else depends on. `#28` moved
here from P1 when the product became endpoint-first.

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

**Both are now landed.** `#46` is `scripts/setup.sh` plus `.env.example`, written up in
[`24-self-hosting.md`](./24-self-hosting.md) and verified on a clean tree: `bash
scripts/setup.sh` then `npm run dev`, with a build that needs no `DATABASE_URL` and a role check
that refuses to continue if the app could bypass row-level security. `#48` is three documents —
the public Manifest protocol spec ([`25`](./25-manifest-spec.md)), the HTTP API
([`26`](./26-api.md)), and the provenance model ([`27`](./27-provenance.md)) — plus
`CONTRIBUTING.md`. `27` is the one to read before writing copy: it is the honest, asymmetric
version of the claim, and `23` is the evidence behind it.

`#47` is the most dangerous surface in the plan. Pricing is the #1 complaint in the category
at ~45 independent sources, and the free tier must be genuinely usable forever with exports
never paywalled.

---

## Dependency order

```
#26 render domain ─┐
#27 database ──────┼─→ #50 endpoint ─→ #29 ingest ─┬─→ #30 Origin ──┐
#34 auth ──────────┘   (no schema needed)          └─→ #31 spam ────┤
                                                                     ├─→ #33 waitlist ✦
                            #51 schema (optional) ─→ #32 Manifest ───┘
                                    │
        ┌───────────────────────────┴─────────────────────────────────┐
        │                                                             │
        ├─→ #28 hosted renderer ─→ #35 builder ─→ #36 logic ─→ #37 ─→ #38 ─→ #39
        └─→ #40 inbox ──→ #41 destinations ─→ #42 fail loudly
                                                    │
                            #43 Verdict ─→ #44 Yield ─→ #45 Hindsight
                                                    │
                            #46 self-host · #48 docs · (#47 billing, deprioritized)
```

`✦` = the milestone worth optimising for. Everything before it is infrastructure; everything
after it is built on a pipeline that has carried a real lead.

## What is deliberately not in this plan

- **A template library.** We conceded breadth to Jotform in `docs/01` §8.
- **AI form generation.** `docs/00` rules out the "AI-powered" lane as crowded, thin and low-trust.
- **A permissions matrix.** Owner and member is enough until someone asks.
- ~~**Password auth.** A liability we don't need for a B2B tool.~~ **Reversed 2026-08-31.**
  Email and password is now the primary way in. The liabilities the original entry named are
  real and each one is answered in `src/lib/auth/`: argon2id for the hashing decision, a
  per-email and per-IP throttle for credential stuffing, and an enumeration-free sign-in.
  What overturned it: there is no mail transport until #41, so the magic link cannot be
  delivered in production at all, and a sign-in method that only works in development is not
  a sign-in method. Password **reset** is still owed and is blocked on the same issue —
  `docs/22` names where it goes.
- **Programmatic alternatives pages.** `docs/09` argued against them and `#17` proved why —
  we had a competitive claim that was simply false.
