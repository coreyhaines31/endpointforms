# Destinations — the delivery contract

The public contract for #41. Someone else's integration parses this, so **fields are added,
never renamed or removed.** `src/lib/destinations/types.ts` is the code this describes;
if the two ever disagree, the code is right and this file is a bug.

Companion to #42: everything here is designed so that when a delivery fails, the failure is
visible, classified, and recoverable. The pillar is *"your data goes wherever you need it —
and says so when it doesn't"* (`docs/00-positioning-spine.md`).

## What is built, and what is not

| Kind | Status |
|---|---|
| `webhook` | **Works.** Signed JSON POST to any https URL. |
| `email` | **Works**, when a mail transport is configured. See "Email" below. |
| `slack` | **Works.** Incoming webhook, Block Kit message. |
| `google_sheets` | Not available. Needs OAuth and token refresh. |
| `hubspot` | Not available. Needs property mapping first. |
| `salesforce` | Not available. Send a webhook — Flow can receive one. |

The three unbuilt kinds appear in the UI **labelled as unavailable** rather than being hidden
or, much worse, offered as a working option that would accept a lead and drop it. That failure
mode is the enemy in the positioning spine wearing our own logo.

## The payload

`POST`, `content-type: application/json`.

```json
{
  "type": "submission.created",
  "delivery": {
    "id": "dlv_XnQ2r8kLm4TpWvZ9",
    "attempt": 1,
    "sentAt": "2026-08-31T12:00:00.000Z",
    "test": false
  },
  "endpoint": { "id": "ep_a1B2c3D4e5F6", "name": "Contact form" },
  "submission": {
    "id": "sub_9Kd2mQ7rT4vX1nZa",
    "submittedAt": "2026-08-31T11:59:58.412Z",
    "origin": "human",
    "originReasons": [
      { "code": "surface", "direction": "browser", "observed": "human_page", "weight": 2, "note": "…" }
    ],
    "verdict": "awaiting",
    "verdictValue": null,
    "verdictCurrency": null,
    "values": { "name": "Priya Raman", "email": "priya@dorsetmetal.example" },
    "attribution": {
      "utmSource": "google", "utmMedium": "cpc", "utmCampaign": "brand-exact",
      "utmTerm": null, "utmContent": null,
      "clickIds": { "gclid": "Cj0KCQjw-brand-01" },
      "referrer": "https://www.google.com/"
    },
    "schemaVersionId": null
  }
}
```

**Every key is always present.** A value we do not have is `null`, never absent, so your
parser never has to handle a field that appears on some deliveries and not others.
`submission.values` is the only open-ended object — it is your form's own fields, exactly as
stored.

Two fields make this payload ours rather than every other form builder's webhook:

- **`origin`** — `human` · `agent` · `unverified` (#30). Your CRM gets to route on it.
  `originReasons` carries the signals behind the stamp, so you can disagree with it.
  **Read the caveat in `CLAUDE.md`: `agent` is structural and reliable; `human` is heuristic
  and forgeable by anyone who can copy browser headers.** Do not build a security control on it.
- **`verdict`** — `won` · `lost` · `disqualified` · `awaiting` (#43). Almost always `awaiting`
  at delivery time, because an outcome lands days after the lead does. `verdictValue` is a
  **decimal string**, never a float — it is money.

### Attached files are linked, never attached (#66)

A file somebody uploaded appears **inside `submission.values`**, in the field it was submitted
under, as an object:

```json
"values": {
  "name": "Priya Raman",
  "cv": {
    "file": true,
    "stored": true,
    "id": "kQ2r8kLm4TpWvZ9a",
    "filename": "priya-raman-cv.pdf",
    "contentType": "application/pdf",
    "detectedType": "application/pdf",
    "size": 241305,
    "sha256": "9f2b…",
    "url": "https://endpointforms.com/api/v1/files/kQ2r8kLm4TpWvZ9a?e=…&s=…",
    "urlExpiresAt": "2026-09-07T11:59:58.412Z",
    "expiresAt": "2026-11-29T11:59:58.412Z"
  }
}
```

**A link rather than the bytes**, for the obvious reason: a receiver expecting a 2 kB JSON body
does not want four megabytes of base64, and the ones that would fall over are the low-code
inboxes least able to tell you why. It also means one slow receiver cannot make a large upload
into a slow submission.

Four things about that URL are load-bearing:

- **It is signed and it expires.** `urlExpiresAt` says when — seven days by default, which is
  the number a queue that sits over a long weekend needs. It is not a permanent object URL and
  there is no bucket behind it; the bytes are in our database and this route is the only way to
  them.
- **It never outlives the retention rule.** `expiresAt` is when the file itself is deleted, and
  the link's expiry is clamped to it. If a deployment keeps files for 30 days, a 7-day link
  minted on day 28 lasts two days, not seven. **Fetch the file if you need to keep it** — this
  is a link to our copy, not a promise about your archive.
- **`stored` is always `true`.** There is no other value. Before #66 a file part produced a
  reference saying `stored: false` while the bytes were discarded; that shape no longer exists,
  and a file we cannot keep now fails the submission instead of being described in one.
- **`sha256` is over the bytes**, so a receiver that downloads and archives can prove later that
  what it holds is what was sent.

If a link has expired, ask again: the same file re-signed appears in the export
(`GET /app/{slug}/submissions/export`), and every export mints fresh links.

Two things this payload deliberately does not carry: a `files` array parallel to `values`
(the file is where the submitter put it, and a second listing is a second thing to keep in
sync), and the bytes under any flag.

## Headers

| Header | Value |
|---|---|
| `x-endpoint-event` | `submission.created` |
| `x-endpoint-delivery-id` | `dlv_…` — **stable across retries** |
| `x-endpoint-attempt` | `1`, `2`, `3` … — increments; the delivery id does not |
| `x-endpoint-timestamp` | Unix seconds, decimal string |
| `x-endpoint-signature` | `v1=<hex>` |

### Idempotency

`x-endpoint-delivery-id` identifies **one submission going to one destination**. Every retry
of that delivery carries the same id; `x-endpoint-attempt` is what changes. Dedupe on the
delivery id and you cannot create the same lead twice, however many times we retry.

It is derived from the pair it identifies rather than stored, so a retry computed on a
different machine three hours later produces the same string — and it is hashed, so it does
not leak our internal row ids to you.

### Verifying the signature

The signed message is `${timestamp}.${rawBody}` — the timestamp is **inside** the MAC, not
merely beside it, so an attacker cannot replay yesterday's body under today's clock.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

// 1. The RAW body. Parsing and re-serialising changes the bytes and the MAC.
const raw = await readRawBody(req);
const ts = req.headers["x-endpoint-timestamp"];
const sent = req.headers["x-endpoint-signature"];      // "v1=abc123…"

// 2. Reject a stale timestamp before doing anything else. We allow 300 seconds.
if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return reject();

// 3. Recompute with the secret shown when you created the destination.
const expected = "v1=" + createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");

// 4. Compare in constant time. `===` on a MAC leaks it a byte at a time.
const a = Buffer.from(expected), b = Buffer.from(sent ?? "");
if (a.length !== b.length || !timingSafeEqual(a, b)) return reject();
```

`v1=` is a version prefix so a future scheme can be added without every receiver breaking on
the day we add it.

**The secret is shown once**, when the destination is created or the secret is rotated. There
is no reveal button: a secret we can re-display is a secret a database export hands to whoever
reads it. Rotating shows a new one once, and deliveries signed with the old one stop verifying
the moment you save — so update your receiver first.

## Retries

| After attempt | Wait |
|---|---|
| 1 | 30s |
| 2 | 2 min |
| 3 | 10 min |
| 4 | 1 hour |

Five attempts including the first, ±20% jitter so a receiver that fell over under load does
not get every retry back in the same millisecond.

**Not everything is retried.** A 401 will be a 401 in an hour; retrying it four times turns
one alert into five and delays the moment you find out your token expired.

| Classification | Retried? | Cause |
|---|---|---|
| `auth` | no | 401, 403 |
| `rejected` | no | 400, 422 — reachable, authenticated, refused the payload |
| `missing` | no | 404, 410 |
| `configuration` | no | the destination's own settings, or a blocked URL |
| `throttled` | yes | 429 |
| `target_down` | yes | 5xx |
| `network` | yes | DNS, TLS, refused connection, timeout |

**Every attempt appends a row** to `delivery_attempts`; retries never overwrite the failed
attempt. That is what lets the delivery log say "it was failing for two days and then started
working" rather than only "it works now".

A delivery that exhausts its attempts stops with `next_retry_at` null. That is the dead-letter
queue — it is a query, not a second table — and **nothing is thrown away**: the submission is
still in the inbox and "Send again" in the delivery log replays it, with the same delivery id.

### How a retry actually gets run

There is no job queue in this stack, so the triggers are named rather than implied:

- The **first attempt** runs in `after()` — Next's post-response hook — outside the response
  but inside the same invocation.
- A **retry** is scheduled by writing `next_retry_at`, then picked up by any of three things:
  1. the next submission to the same endpoint, which sweeps a few due retries;
  2. the **"Send again"** button in the delivery log, immediately;
  3. **`GET /api/v1/deliveries/sweep`**, a scheduled sweep across all workspaces.

The third is what makes the other two sufficient. Without it, an endpoint that takes one lead
a week and then breaks would not retry for a week — the customers least able to notice on
their own would be the ones least likely to be told.

### The sweep endpoint

```
GET  /api/v1/deliveries/sweep       (what Vercel Cron sends)
POST /api/v1/deliveries/sweep       (by hand)
Authorization: Bearer $CRON_SECRET
```

**With no `CRON_SECRET` set the route refuses everything.** It does not fall open. An
unguarded sweep is a free way for a stranger to make this server issue outbound requests, so
the failure mode of a misconfiguration is "nothing runs", never "anyone can run it". The
comparison is constant-time and the 401 does not reveal whether a secret is configured.

Bounded per invocation (100 workspaces, 25 retries and 50 stale rows each) and safe to run
twice: a sweep claims a row with an update that also requires `next_retry_at` to still be set,
so a second sweep — or a cron whose previous run overran — finds nothing to take.
`more: true` in the response says a cap was hit and another pass has work.

### Attempt rows are written before the request, not after

An attempt row is opened `pending` with `started_at` set **before** the outbound request, and
settled to `succeeded`/`failed` when it returns. This is not bookkeeping — it is what stops the
delivery log developing silent holes. A delivery whose process is torn down mid-flight (a
serverless function frozen once the response is flushed, a connection dropped under load) has
already left its row on disk.

A `pending` row older than five minutes means the process that opened it went away. The sweep
**reaps** it: marks it failed with a sentence saying exactly that, and schedules a retry under
the normal policy. Left alone it would be worse than a missing row, because
`consecutiveFailures` does not count a pending row — the destination would read as healthy
while a lead sat undelivered.

### A claimed retry opens its row at claim time (#60)

Claiming a retry and attempting it are two different moments. The claim commits, and the
attempts then run one after another — up to five per submission-triggered sweep, at up to ten
seconds each. **A process that dies in that gap used to lose the redelivery entirely:** the row
was left `failed` with `next_retry_at` null and no attempt row anywhere, which matches neither
branch of the discovery query, so nothing ever came back for it. The lead was still stored and
still visible, but the destinations screen said "gave up" about a delivery that had never been
tried once.

So **the claim opens the `pending` row itself**, in the same transaction that clears the
schedule. An abandoned claim then looks exactly like the case already handled above — a
`pending` row nobody finished — and the reaper covers it with no new machinery.

The obvious alternative, leaving a short lease in `next_retry_at` so the row simply becomes due
again, was rejected: it lets a **slow but alive** attempt be re-claimed and delivered a second
time. The delivery id is stable across retries, so a receiver that dedupes is safe, but one
that does not gets the lead twice, and trading silent loss for silent duplication is not an
improvement. The five-minute stale window is the lease instead, and it is far longer than the
ten-second adapter timeout any attempt can run for.

What this costs: a crashed claim now waits up to five minutes to be noticed rather than being
recovered instantly, and the destination shows one extra `pending` delivery for that window.
The remaining hole is a process that is frozen for longer than five minutes and then resumes —
the reaper will already have rescheduled its delivery, and both copies can arrive. That window
is not new; it is the one the reaper has always had.

A delivery with an attempt still open is **not** counted as dead-lettered. Between a claim and
its settle there is no schedule to see, so without that rule every retry in flight would be
reported as a lead that gave up — the same misreport in a smaller window.

## What we will not do

- **Follow redirects.** A 3xx is a failure, not a hop. Following one re-opens the SSRF hole
  the URL guard closes — a public URL that 302s to the cloud metadata service — so point the
  destination at the final URL.
- **Deliver to a private address.** Loopback, link-local, private ranges and every obfuscated
  spelling of them (`0x7f.0.0.1`, `2130706433`, `127.1`, `[::ffff:7f00:1]`) are refused, and
  the URL is re-checked on **every delivery**, not only when it was saved — a hostname that
  resolved publicly in March can resolve to `127.0.0.1` in June.
- **Resolve a name twice.** Checking a hostname and then handing that hostname to `fetch` lets
  the second lookup answer differently from the first, which is DNS rebinding and it defeats a
  hostname check outright. A delivery resolves the name once, requires **every** address the
  answer contains to pass, and then connects to those addresses — the `Host` header and TLS
  certificate still belong to the name, so virtual-hosted receivers are unaffected. Between the
  check and the socket there is no second lookup to poison.
- **Deliver over plaintext http.** This carries your leads and a signing secret. A self-hoster
  posting to a service on their own network sets `ALLOW_INSECURE_DESTINATIONS=1` deliberately.
- **Accept credentials in the URL.** `https://user:pass@host/` puts a secret in every log line.
  Use a header.
- **Let a destination fail a submission.** The row is committed before anything is delivered.
  A destination that is down, misconfigured, or that throws inside our own adapter produces a
  `delivery_attempts` row and never an error the submitter sees.
- **Attach uploaded files to a delivery.** They are linked (above). A receiver that wants the
  bytes fetches them; one that does not is not made to carry them.

## Email

The email destination sends over an HTTP mail API rather than SMTP: `RESEND_API_KEY` (and
`MAIL_FROM` for the sender address). Without it the destination **fails with a configuration
error** — it does not queue, does not pretend, and does not report success.

The failure message is written for two readers. A self-hoster is told which variables to set;
a customer of the hosted product, who cannot set an environment variable on our deployment, is
told that email delivery is not switched on and — the part that matters to both — that **the
submission is still here** and can be redelivered from the log once it is.

Adding an unverified hand-rolled SMTP client would have failed in production, quietly, on the
one feature whose entire pitch is that it fails loudly. **A self-hoster who only has SMTP has a
real gap here**, and it is written down rather than papered over.

## The notification an endpoint is created with (#64)

Creating an endpoint creates an **email destination to whoever created it**, switched on, with
nothing to configure and no provider to connect. It is flagged `default_notification` on the
row and nothing else about it is special: same dispatch, same retries, same delivery log, same
health, same test button, same redeliver.

That flag is the whole difference between this and a `notify` column on `endpoints`. The
column would have meant the one thing every base-tier customer depends on was the only part of
the product with no delivery log and no health — "we cannot tell you whether your notification
arrived", which is the enemy this document is written against. The cost of the row is that a
destination appears the customer did not add; the flag pays it, by letting the screens say
where the row came from in a way that survives a rename.

It is switchable off — pause it or delete it like any other destination — and switching it off
is a deliberate act. Doing so is what #65 exists to notice.

**Sending is a deployment fact.** The hosted product supplies the transport. A self-hoster
brings their own `RESEND_API_KEY`, and where there is none the endpoint screen says so *before*
the first submission rather than leaving it to be discovered in a delivery log.

## Nobody is being told (#65)

`endpointReach()` answers one question — will anybody hear about a submission to this endpoint?
— from the destination rows plus whether this deployment has a mail transport.

| State | Meaning |
|---|---|
| `reachable` | At least one enabled destination this deployment can deliver to. Says nothing. |
| `deaf` | Nothing enabled at all. Submissions are stored and nobody hears. |
| `unsendable` | Something is enabled, but every enabled destination is email and there is no mail transport. |

`unsendable` is separated from `deaf` because the consequence is identical and the fix is not:
flattening them would send somebody to add a destination they already have.

It is stated on the endpoint screen, above the snippet, and on the destinations screen. It is
amber rather than red: nothing is broken, nothing has been lost, and one click ends it — red is
reserved for a destination that has actually stopped delivering.

Individual submissions carry the historical version of the same fact. A row in the inbox is
marked **went nowhere** when no delivery attempt was ever made for it and it is older than the
in-flight grace window (`NOWHERE_GRACE_SECONDS`). It stays marked after a destination is added
later, because it is a fact about that lead rather than a reading of the endpoint.

## Slack

An incoming webhook, not an OAuth app: nothing to refresh, no scopes, no install flow, and the
customer creates it in a minute. The trade is that **the URL is the credential**, so it is
masked in the UI, never rendered back into the edit form, never written into the delivery log,
and constrained to `hooks.slack.com` at save time.

## Environment

| Variable | What it does |
|---|---|
| `CRON_SECRET` | Bearer token for the sweep endpoint — and for the file retention sweep at `/api/v1/files/sweep` (#66), which reuses this check rather than inventing a second one. **Unset means both sweeps refuse everything.** Vercel Cron sets and sends this automatically. |
| `RESEND_API_KEY` | Mail transport for the email destination. Unset means an email destination fails with a `configuration` error naming this variable — it does not queue and does not report success — and an endpoint whose only destinations are email is reported `unsendable` before anything is submitted. |
| `MAIL_FROM` | Sender address for notifications. Defaults to `Endpoint Forms <notifications@endpointforms.com>`. |
| `ALLOW_INSECURE_DESTINATIONS=1` | Permits `http://` destinations. For a self-hoster delivering inside their own network. Off everywhere else. |
| `ALLOW_PRIVATE_DESTINATIONS=1` | Permits loopback and private addresses. **Set only by the test suite.** Never in a deployment. |
| `UPLOAD_LINK_SECRET` | Signs the file links in a payload, falling back to `AUTH_SECRET`. With neither, a production instance refuses uploads outright rather than delivering a link nobody can use. `docs/24` §3.6a. |

## Health

Per destination: consecutive failures **since the last success**, last success time, last
failure time, and a dead-letter count.

| State | Meaning |
|---|---|
| `untested` | Nothing has ever been delivered. Not healthy — unproven. |
| `healthy` | The last delivery succeeded. |
| `degraded` | 1–2 failures since the last success. |
| `failing` | 3 or more. Said in red, with a banner. |
| `paused` | Turned off deliberately. Submissions still arrive and are still stored. |

`untested` is its own state on purpose. A green tick that is green because nothing has been
checked is the dashboard the positioning spine names as the enemy. "Send a test delivery"
exists so the answer can be found out before a real lead is the thing that finds it out — and
it reports the **real status code and response body**, not a tick.

One failure is not red. `degraded` exists so a single 502 during somebody's deploy does not
paint the screen red, because a banner that is red every week is a banner nobody reads.
