# 30 — Licensing: AGPL + commercial

Issue #90. Status: **draft for the owner's decision.** The CLA half is implemented; the
commercial offer below is a proposal, not a policy. Nothing here goes on the marketing site,
and no price in this repository is a published price.

**Not legal advice.** Nothing in this document, `CLA.md` included, has been reviewed by a
lawyer. Lawyer review is an open question below, not a formality.

---

## 1. Where we are

- **Licence:** AGPL-3.0 on everything in the repository.
- **Copyright:** every commit on `development` (143 at the time of writing) is authored by
  Corey Haines, under one of two addresses that both resolve to `coreyhaines31`. There is no
  outside contribution to clear, which is the cleanest position a project can be in to adopt
  dual licensing — and the position one merged outside PR without a CLA would end.
- **CLA:** now required on every pull request (`CLA.md`, `.github/workflows/cla.yml`). It
  grants the maintainer the right to relicense contributions, including commercially, and in
  return commits that every contribution stays available under the AGPL or another
  OSI-approved licence.
- **Commercial side:** none. No billing (#47 is deprioritised), no commercial licence, no paid
  features. The README says the hosted version is the commercial offering.

The binding constraint from `00-positioning-spine.md`, pillar 3: **"AGPL core, genuinely
one-command self-host, exports never paywalled, no per-response tax."** Every option below is
measured against that sentence. An option that breaks it is not an option, however much it
earns.

---

## 2. What the AGPL already asks of people

Most people who would ask "do I need a commercial licence?" do not. Being precise about this
is the honest version of the offer, and it keeps the offer from reading as a shakedown.

| Situation | AGPL obligation | Needs a commercial licence? |
|---|---|---|
| Self-host Endpoint, unmodified, for your own forms | None beyond keeping the licence notices | No |
| Self-host a **modified** Endpoint that users reach over a network | §13: offer those users the modified source | Only if you will not publish the changes |
| Use the hosted version | None — you are not distributing anything | No |
| Implement the Manifest spec in your own product | None — a spec is not the code | No |
| Agency runs a **modified, white-labelled** Endpoint for clients | §13 applies; clients are network users | Yes, if the modifications must stay private |
| Embed Endpoint (or part of it) in a **closed-source product** you sell or host | Copyleft: the combined work becomes AGPL | Yes |
| Company with a policy that bans AGPL software outright | Policy, not licence | Yes — this is the common case in practice |

Two things in that table matter more than the rest:

- **The agency row is our ICP.** Agencies running paid acquisition for clients are the primary
  buyer in the spine. A white-labelled, customised form stack across many client accounts is
  exactly the shape that triggers §13. The commercial licence is not only an enterprise
  product; it is an agency product.
- **The AGPL-ban row is most of the market for exceptions.** Several large companies forbid
  AGPL code internally regardless of whether they would modify it — Google publishes such a
  policy. For them the licence is a procurement unblock, not a feature.

---

## 3. What stays AGPL, whichever option is chosen

Proposed as fixed, because pillar 3 makes them fixed:

- Everything that is in the repository today: the endpoint, ingest, Origin, Manifest, Verdict
  and Yield, Hindsight split tests, conditional logic and the rules inspector, destinations,
  spam defences, the builder, file uploads, self-host tooling.
- **Exports**, in every form. Never moved behind a licence key.
- **Anything metered per submission.** No licence, open or commercial, introduces a
  per-response charge.
- **The Manifest specification** (`docs/25`). It is meant to be copied. If anything it should
  be *more* permissive than the code — see open question Q9.

---

## 4. What a commercial licence would grant

The same code, under terms that replace the AGPL's obligations for the licensee:

1. **No copyleft.** Use, modify and embed Endpoint in a proprietary product without the
   combined work becoming AGPL.
2. **No §13 source offer.** Run a modified version for network users without publishing the
   modifications.
3. **White-label / OEM distribution** — ship Endpoint inside another product, under another
   name, to that product's customers. (Trademark is separate: §7.)
4. Optionally, the things procurement asks for and the AGPL disclaims: a **warranty**, an
   **IP indemnity**, and a **support** commitment. These are where most of the value — and
   most of the risk — of a commercial licence lives. Whether to offer them is Q5.

It would **not** grant any right to the "Endpoint Forms" name or marks.

---

## 5. Options

### Option A — Pure dual licence: AGPL or buy an exception

One codebase, all AGPL. A company that cannot or will not comply buys a commercial licence to
the same code. Nothing is withheld from the open version.

Precedent: MySQL and Qt, both GPL-family code also sold under a commercial licence.

**Pricing shape.** Annual subscription, priced **per production deployment** (or per
licensee organisation), flat — not per seat and never per submission. A separate OEM tier for
redistribution inside another product, quoted per deal. Start as "contact us" with no public
number: there is no data yet on willingness to pay, and a first quote is a pricing experiment.

**For:** honours pillar 3 completely — the open version *is* the product. No licence-key
infrastructure, no second licence in the repo, no feature triage. The CLA that just shipped is
all it needs. Easy to explain in one sentence.

**Against:** the market for exceptions is narrow — mostly AGPL-banned companies and OEMs.
Revenue is lumpy, sales-led, and arrives late. Enforcement depends on companies noticing they
need it, which most do through legal review rather than goodwill.

### Option B — Open core with an `ee/` directory

Most code stays AGPL. Specific paid features live in `ee/` under a source-available commercial
licence and are unlocked on self-hosted installs by a signed licence key. The hosted version
includes them by plan.

Precedent: GitLab, Cal.com, PostHog (`ee/` alongside an MIT core). This is also the model
issue #90 cites from Inbox Zero.

**Pricing shape.** Self-hosted licence key priced per workspace or per instance, annually,
with tiers by feature set. Hosted plans bundle the same features. Again never per submission.

**Candidate `ee/` features** — only things the ICP would not experience as a paywalled table
stake: SSO/SAML and SCIM, audit log export, an agency **multi-client console** (many client
workspaces, one login, per-client white-label), granular roles, data-residency controls.

**For:** recurring revenue from self-hosters, which Option A barely touches. A familiar model
investors and buyers already understand.

**Against:** this is where pillar 3 gets tested, every release, forever. Each new feature
becomes a "which side of the line?" argument, and the category's #1 complaint is pricing.
Requires licence-key signing and verification code, a second licence file, and contributor
guidance about which directory a PR may touch. The CLA still matters — contributors to `ee/`
need it most.

### Option C — Hosted-first, AGPL only; commercial licence on request

Sell the hosted version. Keep the codebase 100% AGPL. Do not publish a commercial licence
offer; keep the option open (the CLA preserves it) and answer the first serious request with
a bespoke Option-A licence drafted by a lawyer for that deal.

Precedent: Plausible Analytics (AGPL, revenue from the hosted product).

**Pricing shape.** Hosted plans, decided under #47. Commercial licences quoted individually
until there are enough requests to price them.

**For:** zero overhead now, in a phase where billing is explicitly deprioritised and the
product is not launched. No commitment is made that would be awkward to walk back. The AGPL
itself discourages a competitor from hosting a closed fork.

**Against:** leaves AGPL-averse money on the table until someone asks, and some buyers will
not ask — they will read "AGPL" and leave. Says nothing about how the hosted version is priced,
which is the real revenue question.

### What not to do

- **Do not add a "companies with N+ users must pay" rider to the AGPL.** AGPL §7 lets a
  recipient remove any "further restriction" attached to an AGPL work, so the rider is likely
  unenforceable — and it makes the licence look like a trap, which is worse.
- **If a size threshold is genuinely wanted**, it needs a different licence designed for it —
  Fair Core License, BUSL, or PolyForm — chosen with a lawyer. None of those is an
  OSI-approved open-source licence, so adopting one means the site can no longer say "open
  source" about the affected code. That is a positioning change, not a licensing detail, and
  it contradicts pillar 3.

---

## 6. Recommendation

**Option C now, written so it graduates to Option A — and not Option B unless a specific
feature earns it.**

1. **Now (pre-launch):** keep everything AGPL. CLA in place (done). Add a short README
   "Licensing" section that says what is free, that a commercial licence exists for companies
   that cannot use the AGPL, and how to ask — **no price**. Get a lawyer to review `CLA.md`
   and draft one commercial licence template.
2. **On the first two or three requests:** quote Option-A licences individually — flat
   annual, per deployment or organisation, with an OEM variant. Record what was asked for and
   what was paid. That is the pricing research.
3. **Only later, and only for a named feature:** consider `ee/` for things that are
   enterprise-only by nature (SSO, audit log, the agency multi-client console). Decide each
   one against pillar 3 in writing, the same way `docs/` records every other decision.

Why: the product's credibility with this audience rests on "open source, exports never
paywalled, no per-response tax". Option A is the only commercial model that leaves that
sentence untouched. Option C is Option A without committing to anything before there is
evidence. Option B earns more from self-hosters, but it spends the trust pillar 3 exists to
build, and nothing about the current phase needs that money yet.

The agency angle is the one to watch. If agencies turn out to want white-label and a
multi-client console, that is both the strongest commercial-licence case (Option A) and the
strongest `ee/` candidate (Option B) — and it is the ICP. The first agency conversation about
it should inform which way step 3 goes.

---

## 7. Trademark

Licensing the code and protecting the name are separate. The AGPL grants no trademark rights,
so a fork can use the code but not call itself Endpoint Forms — **if** the mark is protected
and a trademark policy says so.

`docs/12-trademark-screening.md` found no live mark for ENDPOINT FORMS and called it the mark
worth filing on first. That is still the recommendation. A short trademark policy (what forks
and hosting providers may and may not call themselves) should ship alongside the README
licensing section.

---

## 8. Open questions for the owner

Every one of these is a decision this document does not make.

- **Q1. Which option?** A, B, C, or C-graduating-to-A as recommended.
- **Q2. Who is the licensor?** Corey Haines personally, or a company? The CLA names Corey and
  includes an assignment clause so a future company can take it over, but the commercial
  licence should be issued by whichever entity will carry the liability.
- **Q3. Governing law.** `CLA.md` §10 says "the State of **[TO BE CONFIRMED]**". Which state?
  This should be filled in before the first outside pull request is merged.
- **Q4. Pricing unit and number** for any commercial licence: per deployment, per
  organisation, per workspace, or per-deal OEM — and the amount. Nothing here is researched;
  do not publish a number until it is.
- **Q5. Warranty, indemnity and support.** Offer them in the commercial licence or not? They
  are what enterprise procurement buys, and they are real liability.
- **Q6. AI-assisted code and copyright.** Most commits carry a `Co-Authored-By: Claude`
  trailer. US Copyright Office guidance holds that material generated without sufficient human
  authorship is not copyrightable. That could affect how much of the codebase is licensable
  — under the AGPL *or* a commercial licence. A question for the lawyer, not a reason to stop.
- **Q7. Lawyer review.** Of `CLA.md`, of a commercial licence template, and of the README
  licensing text. Budget and who?
- **Q8. Corporate CLA.** `CLA.md` references one in §4 but none exists. Needed when a
  company's employees contribute on its behalf. Add it now, or when the first one asks?
- **Q9. A more permissive licence for the Manifest spec?** It is meant to be copied. A
  separate licence for `docs/25` (for example CC BY 4.0) would make that explicit. AGPL on a
  spec document is an odd fit.
- **Q10. README "Licensing" section** — wording and timing. Proposed for step 1 of the
  recommendation; not written yet, because its content depends on Q1.
- **Q11. File ENDPOINT FORMS** as a trademark, and adopt a trademark policy?

## 9. Setup the CLA still needs

Repository state the workflow cannot create for itself, deliberately not done in code:

1. Create a `cla-signatures` branch. The action commits signatures there and cannot create
   the branch; it is kept off `main` and `development` so the bot never commits to a branch
   people work from.
2. Mark the `CLAAssistant` check as **required** on `development` and `main`. Until then it
   reports on pull requests but does not block a merge.
3. `CLA.md`'s link in the workflow points at `main`, so the bot's link resolves once this
   reaches a release.
