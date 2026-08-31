# Origin — findings

**Issue #30. Written as an experiment, not a feature.**
Run on 2026-08-31 against the local build on `:3040` with the real Postgres.

`docs/01-positioning.md` Risk 1:

> **Provenance may not actually distinguish a bot from a human.** If a bot can call the tool
> surface as easily as it stuffs the form, Pillar 1 collapses.

## Verdict

**Risk 1 is real and confirmed. A determined bot passes as Human with one `curl` command.**

The mechanism does not fail the way the risk predicted, though, and the distinction matters:

- Nothing is wrong with the *manifest* half. An agent that identifies itself gets a clean way
  through, and that half is categorical rather than evidential — it cannot be forged, because
  there is nothing to forge. Using the tool surface **is** the declaration.
- The *form* half is where the claim was too strong. Distinguishing "a browser session" from
  "software pretending to be one" is decided entirely from request headers, and every header
  is set by the caller. There is no signal at this layer an adversary cannot copy, and the
  copying is a nine-line `curl` invocation.

**Pillar 1 does not collapse, but the sentence under it has to change.** Origin cannot claim
to know a person was present. What it can claim — and what the evidence below supports — is
narrower and still unusual in this category:

> Origin records which surface each submission used and how coherently the caller behaved on
> it, stores the reasons, and gives software a way to say what it is. It separates automation
> that did not try to look like a browser — which is most commodity form spam — from browser
> sessions. It is not an identity check, and a determined forger will be stamped Human.

That is a real product. It is not the product the phrase "we know who filled out your form"
describes, and we should never write that phrase.

---

## What was built

`src/lib/origin/` — a pure decision function, no HTTP and no database, so it is testable by
calling it.

```
decideOrigin({ surface, headers, endpointPublicId, token, agentDeclaration, now })
  → { origin: "human" | "agent" | "unverified", reasons: OriginReason[], score, threshold }
```

`surface` is supplied by the route, never read from the request — a caller that could name
its own surface could name itself an agent.

- `surface: "manifest"` → **Agent**, categorically. Weights are not consulted.
- `surface: "form"` → nine signals, each recorded with what was observed, which way it
  pointed and how much it counted. Sum against a threshold of **2**.
- One rule sits outside the arithmetic: a `User-Agent` naming an HTTP library or a
  browser-driving framework is **Unverified** regardless of score. It told on itself.

| Signal | Browser | Software |
|---|---|---|
| `user_agent` | browser-shaped `+2` | names a library `−6` (decisive) · names a driver `−4` (decisive) · absent `−3` · other `−2` |
| `fetch_metadata` | `Sec-Fetch-*` present and internally consistent `+2` | contradictory `−2` · partial or absent `−1` |
| `accept` | asks for HTML `+1` | bare `*/*` `−1` · absent `−1` |
| `accept_language` | present `+1` | absent `−1` |
| `accept_encoding` | offers `br`/`zstd` `+1` | absent `−1` |
| `origin_referer` | present and agreeing `+1` | disagreeing `−2` · neither `−1` |
| `client_token` | valid `+3` | **absent `0`** · invalid, stale or foreign `−3` |
| `dwell_time` | — | under 800 ms `−1` |

Wired into `src/lib/ingest/handler.ts`, stored on `submissions.origin` and
`submissions.origin_reasons`. The reasons array carries a final `threshold` entry so a row
read next year is still scored against the bar it was actually judged by.

`GET /e/{id}/token` mints the client token. `_origin_token` (or `X-Origin-Token`) echoes it
back. It is a reserved field: stripped from `values`, kept verbatim in `raw_body`.

**The acknowledgement deliberately does not report the stamp.** Telling a caller whether its
forgery worked is a free tuning loop, and it is asserted in the tests so nobody adds it later
as a convenience.

### Signals the scope named that turned out to be unavailable

- **Header ordering.** Browsers order headers distinctively and HTTP libraries do not, which
  makes ordering one of the better real-world signals. It is not reachable here: the Web
  `Headers` object sorts keys alphabetically before any application code sees them
  (`new Headers([["zeta","1"],["alpha","2"]])` iterates `alpha, user-agent, zeta`). Getting it
  would mean reading the raw socket, which a Next route handler and a serverless platform both
  put out of reach.
- **TLS fingerprinting (JA3/JA4).** The strongest signal in this class, and the one commercial
  bot-detection vendors actually rely on, because the ClientHello is produced by the TLS stack
  rather than by the request-building code. Also unreachable: TLS terminates at the platform
  edge. Self-hosted behind a proxy we control this becomes possible, and it is the single
  biggest available upgrade to the form-surface half.

Both absences are structural, not oversights. They are the reason the form half is as weak
as the results below show.

---

## The experiment

Every row is a real request to the running server. Score is read back out of the stored
`origin_reasons`, not recomputed.

### A — can a determined bot pass as Human?

| Case | Score | Stamp |
|---|---|---|
| A1 · `curl -d …`, nothing added | −11 | Unverified |
| A2 · `curl` + a copied Chrome `User-Agent` and nothing else | −3 | Unverified |
| A3 · `curl` + **nine copied Chrome headers** | **+8** | **Human** |
| A4 · A3, plus a token fetched from `/token` and echoed back | **+11** | **Human** |
| A5 · Python `urllib`, defaults | −10 | Unverified |

A3 is the whole finding. It is one command:

```bash
curl -X POST https://…/e/{id} -d "email=…" \
 -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' \
 -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8' \
 -H 'Accept-Language: en-US,en;q=0.9' -H 'Accept-Encoding: gzip, deflate, br, zstd' \
 -H 'Origin: https://acme.example' -H 'Referer: https://acme.example/contact' \
 -H 'Sec-Fetch-Dest: document' -H 'Sec-Fetch-Mode: navigate' -H 'Sec-Fetch-Site: cross-site'
```

Two follow-ups make it worse:

- **The token is replayable.** One token fetched once, replayed across five submissions:
  every one scored +10 and was stamped Human (C5). It is not single-use and cannot be without
  shared state on the write path, which would break a page that legitimately submits twice.
- **Tokens are free.** 50 minted from one client in 2.2 seconds against a cold dev server
  (C6). The route is unauthenticated by design — it has to be, since it runs on every page
  view of every customer form.

So the token raises the cost of a forgery from one request to two. That is the honest measure
of what it is worth against an adversary. Against commodity spam that never fetches it at all,
it is worth more.

### B — the same submissions from a real browser

Real Chrome 151, driven through the browser extension, posting cross-origin from a page served
on `:8099`.

| Case | Score | Stamp |
|---|---|---|
| B1 · real Chrome, JavaScript on, token present | **+11** | Human |
| B2 · real Chrome, no token script at all (the JS-blocked case) | **+8** | Human |
| B3 · real Chrome, `fetch()` instead of a form navigation | +8 | Human |

**Put A and B side by side and the result is not "close", it is identical.**

- A4 (curl forgery + replayed token) scores **11**. B1 (a real person in Chrome) scores **11**.
- A3 (curl forgery, no token) scores **8**. B2 (a real person with JavaScript off) scores **8**.

Not merely both above the bar — the same number, from the same reason codes, with the same
weights. There is nothing in the stored row that distinguishes them, which is exactly what it
means to say the signal is exhausted.

Worth naming explicitly: **B1–B3 were themselves scripted.** A real browser driven by an
automation harness produced a perfect Human stamp, because at the HTTP layer a driven browser
and a driving person send identical requests. "Script a real browser" is not an attack Origin
detects at all. The only reason `HeadlessChrome` and `Playwright` are caught is that they
volunteer their names in the `User-Agent`, and that is one flag away from gone.

### C — do real humans get stamped Unverified?

| Case | Score | Stamp |
|---|---|---|
| C1 · IE 11 header set (no `Sec-Fetch-*` exists in that browser) | +4 | Human |
| C2 · **Lynx**, a person in a text browser | −2 | **Unverified** |
| C3 · proxy stripping `Sec-Fetch-*`, `Origin` and `Referer` | +3 | Human |
| C4 · C3 **and** `Accept-Language` stripped | **0** | **Unverified** |

Two real false positives, and the shape of the risk is legible from the scores.

**Every mainstream browser in default configuration clears the bar with a margin of at least
6, with JavaScript disabled.** The bar is 2; Chrome with JS off scores 8. A visitor has to
lose three independent signal groups to fall under it. C3 — a middlebox stripping the entire
`Sec-Fetch` set *and* both `Origin` and `Referer` — still lands at +3. It takes a fourth loss
(C4) to quarantine them.

The at-risk population is therefore:

1. **Text and non-mainstream browsers.** Lynx, w3m, and anything whose `User-Agent` is not
   `Mozilla/5.0 …`. This is a true miss and there is no fix that does not also admit forgers,
   because "looks like a browser" is the only thing being measured.
2. **Aggressively rewriting middleboxes.** Some corporate TLS-inspecting proxies and content
   filters normalise `Accept-Language` and drop `Sec-Fetch-*`. This is the one that would show
   up in a customer's inbox as "our enterprise leads all landed in quarantine", and it is
   correlated — one misconfigured proxy quarantines an entire company's traffic at once,
   which is far worse than the same number of scattered misses.

Deliberately excluded from the disqualifying `User-Agent` list, and worth recording as
decisions: `libwww` (which is what Lynx sends — it is already caught, but caught softly rather
than decisively) and the `bot`/`crawler`/`spider` tokens (search crawlers do not POST lead
forms; matching them would only catch honest crawlers and no dishonest ones).

**Prefetch and prerender are not a concern.** Both are GET; a submission is a POST. A
speculation-rules prefetch cannot produce a form submission.

### What is not measured

**There is no false-positive rate in this document, because there is no traffic to measure
one on.** Everything above is a constructed case. What can be said structurally:

- The false-positive population is not random — it is one browser class and one network
  class, and both cluster.
- The false-negative rate against a *determined* adversary is 100%. Against an adversary who
  does not bother, it is very low. Which of those describes real form spam is an empirical
  question we cannot answer until the waitlist form on the live site is taking real traffic
  (#33), and answering it should be an explicit follow-up rather than an assumption.

---

## What this means for a customer

**Quarantine must be a reviewable bucket, never a delete, and Unverified must never be
silently dropped from a customer's own lead count.** The feature page already says this
(`/features/submission-provenance`, "Unverified is quarantined, not deleted"). The C4 result
is the reason it has to stay literally true in the product and not just in the copy.

Concretely, before this ships:

- Unverified submissions are stored, exportable, and visible by default — not behind a filter
  someone has to discover.
- The stored reasons are shown in plain sentences on the submission, not as a score. They
  already read well; the C4 row explains itself in six lines.
- A workspace whose Unverified share suddenly jumps should be told, because the likeliest
  cause is a proxy change at one of their customers, not a spam wave.

---

## Is the honest claim narrower? Yes.

The published copy is mostly already honest — `limitation` and `notThis` on the feature page
are good and should not change. Three specific things overstate it.

**1. "not a score we guessed from mouse movement"** (`_content.ts`, `lead`)

True of the manifest surface. On the form surface it *is* a score — of request shape rather
than of behaviour, which is better, but it is a weighted sum with a threshold. Suggested:

> Origin is a field on the submission, set by which surface it came through — not a spam score
> inferred from how the visitor moved their mouse.

Keeps the real contrast (surface, not behaviour) and drops the implication that no judgement
is involved.

**2. "it told on itself by using the wrong door"** (`_content.ts`, step 02)

Reads as a guarantee. It is only true of software that did not try to look like a browser.
Suggested: *"Anything that submits the human form while behaving like software is Unverified.
Software that goes to the trouble of impersonating a browser will not be — which is why
Unverified is a bucket you can read, not a bin."*

**3. `CLAUDE.md` still says "human / identified agent / suspected bot".** That contradicts
`docs/00-positioning-spine.md` and the schema, both of which settled on **Unverified**. It is
the one place "suspected bot" survives. Owner of that file should fix it.

### The claim that survives adversarial pressure

Four things are true after this experiment, and all four are worth paying for:

1. **Commodity automation is separated from browser sessions**, because commodity automation
   does not copy headers. A1, A2 and A5 are what actual form-stuffing traffic looks like.
2. **Legitimate agents get a door.** This is the half that is genuinely unforgeable and it is
   the half nobody else offers. An agent using Manifest is Agent because it used Manifest.
3. **Every stamp carries its reasons, stored and readable.** "Why is this Unverified?" is
   answerable from the row a year later. No competitor's spam score is.
4. **It never blocks and never asks the visitor for anything.** Compare the twelve teardowns
   at `/spam`: every existing defense either interrogates the visitor or silently drops. This
   does neither.

What we must not claim: that a Human stamp means a person, or that Origin stops spam. It does
neither, and A3 is a one-line proof.

### Where to go next, in order of value

1. **Ship Manifest (#32).** It is the unforgeable half and it is currently the half that does
   not exist. Origin's honest value is mostly there.
2. **Answer the empirical question on our own traffic (#33).** Publish the waitlist form, look
   at the composition after a month. If real spam turns out to forge headers routinely, claim
   (1) above weakens and the copy needs revisiting again.
3. **TLS fingerprinting on self-hosted deployments.** The only signal available that is not
   set by the caller. Not available on the hosted platform, which is worth being upfront
   about rather than quietly having a two-tier product.
4. **Do not add more header signals.** They are all forged by the same copy-paste. Adding a
   tenth one raises the score of real browsers and of forgers identically, which is the
   definition of a signal that does nothing.

---

## Tests

- `tests/origin.test.mts` — 83 assertions, no database. Real browser header sets, forgeries,
  token tampering, the JS-off case asserted on every browser set, and the reasons checked for
  the vocabulary the spine forbids.
- `tests/ingest.test.mts` — the wiring: the stamp and its reasons reach the row, the token is
  a reserved field, identical headers through the manifest surface land as Agent, and the
  acknowledgement does not leak the verdict.

Two of them assert the failure on purpose:

```
RISK 1: a verbatim replay of a real browser header set is stamped Human
RISK 1: and a fetched-then-replayed token raises its score further
```

They exist so a green suite is never read as evidence the mechanism is airtight. If someone
later "fixes" them, they should have to read this document first.

## Configuration

`ORIGIN_TOKEN_SECRET` signs the client token. Unset, it falls back to a built-in key and warns
once in production — a forgeable token is a weaker signal, and refusing the submission instead
would be a lost lead. Same trade, and same reasoning, as `SUBMISSION_IP_SALT`.
