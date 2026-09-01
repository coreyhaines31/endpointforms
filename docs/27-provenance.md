# The provenance model

**What `Human · Agent · Unverified` means, what it does not mean, and which half of it you can
rely on.** Issue #48. Implemented by `src/lib/origin/`.

This is the public version of [`docs/23-origin-findings.md`](./23-origin-findings.md), which is
the adversarial write-up. Read that one before changing anything here.

---

## The one-paragraph version

Every Endpoint form publishes two surfaces from one definition: an HTML form for people, and an
MCP tool surface for agents. Every submission records **which surface it came through**, and
why, in a field called `origin`.

**The two halves of that field are not symmetric, and the difference is the whole point.**

- **`agent` is structural.** An agent is stamped `agent` because it called the agent surface.
  Using that door *is* the declaration. There is nothing to forge and therefore nothing to
  defeat.
- **`human` is heuristic, and forgeable.** It is a weighted judgement from request headers, and
  every one of those headers is set by the caller. Plain `curl` with nine copied Chrome headers
  is stamped `human`. We have measured this.

**Endpoint does not detect bots, and no Endpoint documentation should ever say or imply that it
does.** What it does is separate automation that did not try to look like a browser — which is
most commodity form spam — from browser sessions, give legitimate agents a real door, and record
its reasons so the judgement is auditable a year later.

---

## 1. The three values

| Value | Meaning |
|---|---|
| `human` | The submission arrived through the form surface and the request looked like a browser session. |
| `agent` | The submission arrived through the Manifest (MCP) surface. |
| `unverified` | The submission arrived through the form surface and the request did not look like a browser session. |

There is no fourth value, and no numeric score is exposed on the submission.

### The vocabulary is fixed

The third value is **`Unverified`**. It is never "suspected bot", "likely bot", "spam",
"suspicious", or anything else that asserts what the caller *is*.

This is not a style preference. `unverified` states a fact about what we could establish; every
alternative states a conclusion we cannot support. A `curl` request with copied headers is
stamped `human`, so a stamp of `unverified` genuinely means "the evidence for a browser session
was not there", not "this is a bot". Naming it "suspected bot" would be a false claim about a
security property, and it would license a product behaviour — deleting these — that the
evidence does not support.

**`Unverified` is a bucket you can read, not a bin.** Unverified submissions are stored,
exportable, and visible by default. They are never deleted, never hidden behind a filter someone
has to discover, and never dropped from a customer's own lead count.

---

## 2. `agent` — the structural half

An MCP `tools/call` writes `origin = "agent"`, categorically.

The mechanism is one line: the route passes `surface: "manifest"` as a literal constant. It is
**never read from the request** — not from the body, not from a header, not from `_meta`, not
from a parameter. There is no value a caller can send that changes the stamp.

This is asserted in both directions:

- A caller on the **form** surface sending `surface=manifest`, `_surface=manifest`,
  `origin=agent`, `_origin=agent` as fields, plus `X-Origin-Surface`, `X-Surface`, `X-Origin`
  and `X-Agent-Identity` as headers, is **not** stamped `agent`.
- A caller on the **Manifest** surface sending the full nine-header Chrome set, arguments of
  `{ surface: "form", origin: "human" }`, and a declared agent name of `"definitely a person"`,
  is still stamped `agent`.

For the `agent` stamp, header-based scoring is not run at all. There is nothing to score.

**Why this half holds:** an agent cannot get itself stamped `human` by calling the agent
surface, and it cannot get a `human` stamp by calling the form surface either — but if it calls
the form surface it is no longer using the tool interface, and it is back to scraping the DOM
of a form that changes underneath it. The incentive runs the right way. Manifest is easier, more
reliable, and does not break when the form is edited. Agents use it because it is better, not
because we made them.

That is the part of this product that is genuinely unusual: **the mechanism that lets legitimate
agents through is the same one that records that they came through it.**

### The declared identity is recorded and untrusted

A caller may name itself, in this order of precedence:

1. `_meta["endpointforms.com/agent"]` on the `tools/call`
2. the `X-Agent-Identity` header
3. the `X-MCP-Client` header
4. the `User-Agent`

It is stored on the submission with an explicit **weight of zero** and changes no decision. It
exists so that a form's owner can see what called their form. It is a name badge, not a
credential — anyone can write anything on it.

---

## 3. `human` and `unverified` — the heuristic half

On the form surface there is no declaration to read, so the decision is made from the request.
Nine signals, each recorded with what was observed, which way it pointed, and how much it
counted. They are summed against a threshold of **2**.

| Signal | Points toward a browser | Points toward software |
|---|---|---|
| `user_agent` | browser-shaped `+2` | names an HTTP library `−6` (decisive) · names a browser-driving framework `−4` (decisive) · absent `−3` · anything else `−2` |
| `fetch_metadata` | `Sec-Fetch-*` present and internally consistent `+2` | contradictory `−2` · partial or absent `−1` |
| `accept` | asks for HTML `+1` | bare `*/*` `−1` · absent `−1` |
| `accept_language` | present `+1` | absent `−1` |
| `accept_encoding` | offers `br` or `zstd` `+1` | absent `−1` |
| `origin_referer` | present and agreeing `+1` | disagreeing `−2` · neither `−1` |
| `client_token` | valid `+3` | **absent `0`** · invalid, stale or foreign `−3` |
| `dwell_time` | — | under 800 ms `−1` |

One rule sits outside the arithmetic: a `User-Agent` naming an HTTP library or a browser-driving
framework is `unverified` regardless of score. It told on itself.

Note `client_token: absent = 0`, not a penalty. A visitor with JavaScript disabled must not be
punished for it.

### The reasons are stored, and that is the useful part

Every stamp carries its reason list on the submission, including the threshold it was judged
against — so a row read next year is still scored against the bar it was actually judged by, not
whatever the bar has become.

"Why is this Unverified?" is answerable from the row itself, in plain sentences rather than as a
score. No spam-scoring product in this category can do that.

---

## 4. What we measured, and what it means

Every row below is a real request against a running server. The score is read back out of the
stored reasons, not recomputed. Full method in [`docs/23-origin-findings.md`](./23-origin-findings.md).

> **Reproduced on the current build, 2026-08-31.** Three submissions to the same endpoint on a
> local instance: an MCP `tools/call` → `agent`; a single `curl -d` carrying nine copied Chrome
> headers → **`human`**; a bare `curl -d` with no headers → `unverified`. Read back out of the
> `submissions.origin` column, not recomputed. The forgery still works.

### A determined forger passes

| Case | Score | Stamp |
|---|---|---|
| `curl -d …`, nothing added | −11 | Unverified |
| `curl` + a copied Chrome `User-Agent` only | −3 | Unverified |
| **`curl` + nine copied Chrome headers** | **+8** | **Human** |
| the same, plus a client token fetched and echoed back | **+11** | **Human** |
| Python `urllib`, defaults | −10 | Unverified |

### A real person in a real browser

| Case | Score | Stamp |
|---|---|---|
| real Chrome, JavaScript on, token present | **+11** | Human |
| real Chrome, no token script at all (JavaScript off) | **+8** | Human |
| real Chrome, `fetch()` rather than a form navigation | +8 | Human |

**Put the two tables side by side and the result is not "close", it is identical.** The forgery
with a token scores 11; a real person in Chrome scores 11. The forgery without one scores 8; a
real person with JavaScript off scores 8. Same numbers, same reason codes, same weights. There
is nothing in the stored row that distinguishes them.

That is what it means to say a signal is exhausted, and it is why the honest claim is narrow.

Two further findings worth stating plainly:

- **The client token is replayable and free.** One token fetched once, replayed across five
  submissions, scored Human every time. Fifty were minted from one client in 2.2 seconds. The
  minting route is unauthenticated by design — it runs on every page view of every form. The
  token raises the cost of a forgery from one request to two. That is its honest value against
  an adversary; against commodity spam that never fetches it, it is worth more.
- **Scripting a real browser is not detected at all.** At the HTTP layer, a driven browser and a
  driving person send identical requests. `HeadlessChrome` and `Playwright` are caught only
  because they volunteer their names in the `User-Agent`, and that is one flag away from gone.

### Do real people get stamped Unverified?

| Case | Score | Stamp |
|---|---|---|
| IE 11 headers (no `Sec-Fetch-*` exists in that browser) | +4 | Human |
| **Lynx** — a person in a text browser | −2 | **Unverified** |
| a proxy stripping `Sec-Fetch-*`, `Origin` and `Referer` | +3 | Human |
| **the same, and `Accept-Language` stripped too** | **0** | **Unverified** |

Every mainstream browser in a default configuration clears the bar by at least 6, **with
JavaScript disabled**. A visitor has to lose three independent signal groups to fall under it,
and four to be quarantined.

The at-risk population is two specific groups, and neither is random:

1. **Text and non-mainstream browsers.** Lynx, w3m, anything whose `User-Agent` is not
   `Mozilla/5.0 …`. A true miss, with no fix that does not also admit forgers — "looks like a
   browser" is the only thing being measured.
2. **Aggressively rewriting middleboxes.** Some corporate TLS-inspecting proxies normalise
   `Accept-Language` and drop `Sec-Fetch-*`. This one is **correlated**: a single misconfigured
   proxy quarantines an entire company's traffic at once, which is far worse than the same
   number of scattered misses.

**There is no false-positive rate in this document because there is no traffic to measure one
on.** Every case above is constructed. Against a determined adversary the false-negative rate is
100%; against an adversary who does not bother it is very low. Which of those describes real
form spam is an empirical question that will be answered on live traffic and is not answered
yet.

### Signals we cannot reach

Two of the strongest signals in this class are structurally unavailable, and they are the reason
the form half is as weak as the numbers show.

- **Header ordering.** Browsers order headers distinctively; HTTP libraries do not. The Web
  `Headers` object sorts keys alphabetically before any application code sees them. Getting this
  would mean reading the raw socket.
- **TLS fingerprinting (JA3/JA4).** The signal commercial bot-detection vendors actually rely
  on, because the ClientHello is produced by the TLS stack rather than by the request-building
  code. TLS terminates at the platform edge.

Neither is an oversight. **On a self-hosted deployment behind a proxy you control, TLS
fingerprinting becomes possible, and it is the single biggest available upgrade to the form
half.** It is not available on a hosted deployment, and that is worth saying out loud rather
than quietly shipping a two-tier product.

---

## 5. What is true, and what to say

### Claim these

1. **Commodity automation is separated from browser sessions**, because commodity automation
   does not copy headers. Bare `curl` and default Python are what actual form-stuffing traffic
   looks like, and they score −11 and −10.
2. **Legitimate agents get a door.** This is the genuinely unforgeable half, and it is the half
   nobody else offers. An agent using Manifest is `agent` because it used Manifest.
3. **Every stamp carries its reasons, stored and readable.** Answerable from the row a year
   later. No competitor's spam score is.
4. **It never blocks and never asks the visitor for anything.** No CAPTCHA, no challenge, no
   silent drop.

### Never claim these

- That a `human` stamp means a person was present. It does not. One `curl` command is the
  proof.
- That Endpoint detects, catches, blocks or stops bots. It does none of those things.
- That Origin is a security control. It is a **provenance record**. Do not put it in front of
  anything that needs to be defended.
- "Suspected bot", or any wording that asserts what the caller is.
- That a submission "told on itself by using the wrong door" as a guarantee. That is only true
  of software that did not try to look like a browser.

### The sentence that survives adversarial pressure

> Origin records which surface each submission used and how coherently the caller behaved on it,
> stores the reasons, and gives software a way to say what it is. It separates automation that
> did not try to look like a browser — which is most commodity form spam — from browser
> sessions. It is not an identity check, and a determined forger will be stamped Human.

---

## 6. What this means if you are running Endpoint

- **Treat `agent` as reliable.** It is a fact about which interface was called.
- **Treat `human` as "probably a browser session", not as "a person".**
- **Treat `unverified` as a review queue, not a rubbish bin.** Read the stored reasons; they
  explain themselves in a few lines.
- **Watch the Unverified share, not individual rows.** A sudden jump is far more likely to be a
  proxy change at one of your customers than a spam wave. Investigate before filtering.
- **Do not build automated deletion on this field.** The false-positive population is
  correlated: one bad middlebox can quarantine one company's entire traffic at once.
- **If you self-host behind a proxy you control**, TLS fingerprinting is available to you and is
  not available on the hosted product. That is the real upgrade path for the form half.

## 7. Configuration

`ORIGIN_TOKEN_SECRET` signs the client token minted at `GET /e/{id}/token`. Unset, it falls back
to a built-in key and warns once in production: a forgeable token is a weaker signal, but
refusing the submission instead would be a lost lead. Same trade, and the same reasoning, as
`SUBMISSION_IP_SALT`.

The acknowledgement returned to a submitter **deliberately does not report the stamp**. Telling
a caller whether its forgery worked is a free tuning loop. This is asserted in the tests so that
nobody adds it later as a convenience.

## 8. Where this is implemented

| | |
|---|---|
| The decision function | `src/lib/origin/decide.ts` — pure, no HTTP, no database |
| The client token | `src/lib/origin/token.ts`, `GET /e/{id}/token` |
| Wiring and storage | `src/lib/ingest/handler.ts` → `submissions.origin`, `submissions.origin_reasons` |
| The agent surface | `src/lib/manifest/handler.ts`, spec at [`docs/25-manifest-spec.md`](./25-manifest-spec.md) |
| Tests | `tests/origin.test.mts` (83 assertions, no database), `tests/ingest.test.mts` |

Two tests assert the *failure* on purpose:

```
RISK 1: a verbatim replay of a real browser header set is stamped Human
RISK 1: and a fetched-then-replayed token raises its score further
```

They exist so that a green suite is never read as evidence the mechanism is airtight. If someone
later "fixes" them, they should have to read
[`docs/23-origin-findings.md`](./23-origin-findings.md) first.
