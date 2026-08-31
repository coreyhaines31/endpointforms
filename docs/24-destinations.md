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

### The honest part: there is no queue

This stack has no job runner, and pretending otherwise would be exactly the dishonesty #42 is
about. What actually happens:

- The **first attempt** runs in `after()` — Next's post-response hook — outside the response
  but inside the same invocation.
- A **retry** is scheduled by writing `next_retry_at` and then waits to be picked up. Two
  things pick it up: the next submission to the same endpoint sweeps a few due retries, and
  the "Send again" button runs one immediately.
- **An endpoint that takes one lead a week and then breaks will not retry on schedule** — its
  retry waits for the next lead. That is a real limitation, not a rounding error.

The fix is a cron calling `sweepDueRetries` every minute. The retry *policy* is complete and
tested either way.

## What we will not do

- **Follow redirects.** A 3xx is a failure, not a hop. Following one re-opens the SSRF hole
  the URL guard closes — a public URL that 302s to the cloud metadata service — so point the
  destination at the final URL.
- **Deliver to a private address.** Loopback, link-local, private ranges and every obfuscated
  spelling of them (`0x7f.0.0.1`, `2130706433`, `127.1`, `[::ffff:7f00:1]`) are refused, and
  the URL is re-checked on **every delivery**, not only when it was saved — a hostname that
  resolved publicly in March can resolve to `127.0.0.1` in June.
- **Deliver over plaintext http.** This carries your leads and a signing secret. A self-hoster
  posting to a service on their own network sets `ALLOW_INSECURE_DESTINATIONS=1` deliberately.
- **Accept credentials in the URL.** `https://user:pass@host/` puts a secret in every log line.
  Use a header.
- **Let a destination fail a submission.** The row is committed before anything is delivered.
  A destination that is down, misconfigured, or that throws inside our own adapter produces a
  `delivery_attempts` row and never an error the submitter sees.

## Email

The email destination sends over an HTTP mail API rather than SMTP: `RESEND_API_KEY` (and
`MAIL_FROM` for the sender address). Without it the destination **fails with a configuration
error naming the variable** — it does not queue, does not pretend, and does not report success.

Adding an unverified hand-rolled SMTP client would have failed in production, quietly, on the
one feature whose entire pitch is that it fails loudly. **A self-hoster who only has SMTP has a
real gap here**, and it is written down rather than papered over.

## Slack

An incoming webhook, not an OAuth app: nothing to refresh, no scopes, no install flow, and the
customer creates it in a minute. The trade is that **the URL is the credential**, so it is
masked in the UI, never rendered back into the edit form, never written into the delivery log,
and constrained to `hooks.slack.com` at save time.

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
