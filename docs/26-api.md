# HTTP API

**The two surfaces a customer's own systems talk to.** Issue #48.

| | |
|---|---|
| [Submission endpoint](#1-the-submission-endpoint) | `POST /e/{endpointId}` — a lead arrives |
| [Outcome API](#2-the-outcome-api) | `POST /api/v1/verdict` — what the lead turned out to be worth |

The agent-facing surface, `POST /e/{endpointId}/mcp`, has its own specification:
[`docs/25-manifest-spec.md`](./25-manifest-spec.md).

Everything below is read out of the implementation and pinned by assertions in
`tests/ingest.test.mts`, `tests/schema-ingest.test.mts` and `tests/verdict.test.mts`. Anything
not stated here is not promised.

---

# 1. The submission endpoint

```
POST https://example.com/e/{endpointId}
```

No authentication. A public form is public. Point an HTML form's `action` at it, or post JSON
from anything.

| Method | Behaviour |
|---|---|
| `POST` | The submission |
| `OPTIONS` | `204` with CORS headers |
| `GET`, `PUT`, `PATCH`, `DELETE` | `405` with `Allow: POST, OPTIONS` |

## 1.1 Content types

| `Content-Type` | Parsing |
|---|---|
| `application/x-www-form-urlencoded` | Repeated names collapse into an array |
| `multipart/form-data` | Same, and the only encoding that can carry a file. **File parts are stored** (#66) — see §1.8. A larger body cap applies |
| `application/json` or `*/+json` | Must be a JSON **object**. `null`, an array or a scalar is `400 malformed_body` |
| anything else, or absent | Sniffed: a body starting `{` or `[` is read as JSON; a body containing `=` that parses as urlencoded is read that way; otherwise `415` |

Charset parameters are ignored. An empty or whitespace-only body is `422 empty_body`.

## 1.2 The response shape depends on who is asking

One code path, two presentations. Resolved in this order:

1. `Accept` contains `application/json` and not `text/html` → **JSON**
2. `Sec-Fetch-Mode: navigate` → **redirect**
3. `Sec-Fetch-Mode` is `cors`, `same-origin` or `no-cors` → **JSON**
4. `Accept` contains `text/html` → **redirect**
5. otherwise (curl with no headers, server-to-server) → **JSON**

So a browser form submission gets a `303` to a thank-you page and everything else gets JSON.
Sending `_redirect` from a `fetch()` call does not force a redirect.

### JSON — `200`

```json
{
  "ok": true,
  "id": "fAlO-my_EP2XbtxN",
  "endpoint": "abc123",
  "submittedAt": "2026-08-31T10:04:22.117Z",
  "duplicate": false
}
```

Exactly those five keys when the endpoint has no schema — asserted. `warnings` is added only
when a schema exists and something did not match it:

```json
{
  "ok": true,
  "id": "fAlO-my_EP2XbtxN",
  "endpoint": "abc123",
  "submittedAt": "2026-08-31T10:04:22.117Z",
  "duplicate": false,
  "warnings": [
    { "field": "phone",      "code": "missing_required", "message": "\"Phone\" is required and arrived empty." },
    { "field": "newsletter", "code": "unknown_field",    "message": "\"newsletter\" was submitted but is not in the schema. It is stored as-is; add it to the schema if it should be exported or validated." }
  ]
}
```

**The acknowledgement deliberately does not report the origin stamp.** Telling a caller whether
its forgery worked would be a free tuning loop for an adversary. This is asserted in the tests
so that nobody adds it later as a convenience.

### Redirect — `303`

Empty body, `Location`, `Cache-Control: no-store`. 303 rather than 302 so a refresh cannot
repost.

Where it points:

1. a `_redirect` or `_next` field in the payload, if present and permitted
2. otherwise `ENDPOINT_DEFAULT_THANKS_URL` (default `/thanks`), resolved against the request URL

There is **no per-endpoint thank-you setting**. The payload field and the environment variable
are the only two controls.

Open-redirect rules: relative targets always pass; same-host always passes; a cross-host target
passes only when there is no `Origin`/`Referer`, or when its host matches the `Origin`
(else `Referer`) host. Values with CR/LF, values starting `//`, and non-`http(s)` schemes are
refused. **A refused target is not an error** — the submission is already stored and the
visitor goes to the default page instead of losing their work.

The submission id is appended as `?s={id}` **only** when the resolved target is the default
thank-you URL. A `_redirect` target is left byte-for-byte as written, even if it names the same
URL.

## 1.3 Validation is descriptive, not a gate

By default a submission that does not match the endpoint's schema is **stored anyway** and the
mismatches come back as `warnings`.

This is deliberate and it is the point. A schema is a description of what a form usually
receives, declared after the fact and revised as the form changes. Refusing a lead because a
description is out of date loses a customer's money to fix our bookkeeping. `schema-ingest`
tests this directly: five payloads against a schema wrong about them in six ways produce ten
rows, not one lost.

Only a schema version explicitly set to `mode: "strict"` refuses:

```
HTTP/1.1 422
```
```json
{
  "ok": false,
  "error": {
    "code": "schema_validation_failed",
    "message": "The submission did not match this endpoint's schema, which is set to strict mode: \"Work email\" is not an email address. \"Phone\" is required and arrived empty."
  }
}
```

At most five issue messages, then ` (and N more)`. Nothing is written.

> The agent surface behaves the other way round: a validation error there is always a rejection
> and nothing is stored. See [`docs/25-manifest-spec.md` §6.5](./25-manifest-spec.md) for why
> the two doors differ on purpose.

## 1.4 Errors

Always `{"ok": false, "error": {"code": …, "message": …}}` in JSON mode, or a standalone HTML
page carrying the same message and code in redirect mode.

| `code` | HTTP | Cause |
|---|---|---|
| `endpoint_not_found` | 404 | No endpoint with that id |
| `endpoint_deleted` | 410 | The endpoint was deleted |
| `empty_body` | 422 | Nothing to store |
| `payload_too_large` | 413 | Over 1 048 576 bytes — or over 4 456 448 for a `multipart/form-data` body |
| `too_many_fields` | 413 | Over 250 fields, or over 5 000 JSON values |
| `field_name_too_long` | 422 | A field name over 256 characters |
| `unsupported_media_type` | 415 | Unrecognised body, unsniffable |
| `malformed_body` | 400 | Unparseable JSON, or JSON that is not an object, or nesting over 12 deep |
| `file_too_large` | 413 | One file over 4 MiB, or the files together over 4 MiB |
| `too_many_files` | 413 | Over 10 file parts |
| `file_type_not_allowed` | 415 | Only when the deployment sets `UPLOAD_ALLOWED_TYPES` |
| `uploads_not_configured` | 503 | This deployment cannot sign download links, so it will not take files |
| `schema_validation_failed` | 422 | Strict-mode schema only |
| `rate_limited` | 429 | See §1.5 |
| `method_not_allowed` | 405 | Not a POST |
| `internal_error` | 500 | Our fault |

## 1.5 Rate limits

Three 60-second fixed windows, all three counted on every request.

| Window | Default | Environment variable |
|---|---|---|
| per endpoint | 300 / min | `INGEST_RATE_LIMIT_ENDPOINT_PER_MINUTE` |
| per IP | 60 / min | `INGEST_RATE_LIMIT_IP_PER_MINUTE` |
| per endpoint + IP | 20 / min | `INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE` |

Refusal is narrowest-first: endpoint+IP, then IP, then endpoint. The check runs before the
database lookup.

```
HTTP/1.1 429
Retry-After: 37
Access-Control-Expose-Headers: retry-after
```
```json
{"ok":false,"error":{"code":"rate_limited","message":"Too many submissions from this client. Retry in 37 seconds."}}
```

`Retry-After` is always at least 1.

> **Honest limitation:** counters are per-process and in-memory. On a serverless platform the
> effective ceiling is the limit times the number of warm instances, and the limiter fails open
> under memory pressure. A shared counter is not implemented. This is a guard against
> accidents, not a security control.

## 1.6 Limits

| Limit | Value | On breach |
|---|---|---|
| body | 1 048 576 bytes | `413`. A `Content-Length` over the cap is refused before a byte is read |
| distinct fields | 250 | `413 too_many_fields` |
| field name | 256 characters | `422 field_name_too_long` |
| field value | 65 536 characters | **truncated**, `…[truncated]` appended; the original stays in `raw_body` |
| JSON depth | 12 | `400 malformed_body` |
| JSON values | 5 000 | `413 too_many_fields` |
| idempotency key | 255 characters | silently truncated |

## 1.7 CORS

```
Access-Control-Allow-Origin:   <Origin, reflected>  (or *)
Access-Control-Allow-Methods:  POST, OPTIONS
Access-Control-Allow-Headers:  <ACRH, reflected>
                               (default: content-type, accept, idempotency-key, x-idempotency-key)
Access-Control-Expose-Headers: retry-after
Access-Control-Max-Age:        86400
Vary:                          Origin
```

No `Access-Control-Allow-Credentials`, and no cookie is read on this route. The wildcard is
deliberate: a form must be postable from wherever the customer embedded it. A per-endpoint
origin allowlist is a future opt-in, **not** current behaviour.

## 1.8 What is recorded

| Field | Source |
|---|---|
| `ip_hash` | `sha256:<hex>` of `SUBMISSION_IP_SALT` + the IP. **The raw IP is never stored** — asserted. Read from `X-Vercel-Forwarded-For`, `X-Forwarded-For`, `CF-Connecting-IP`, `X-Real-IP`, first entry |
| `user_agent` | The header, ≤ 1024 characters |
| `referrer` | First non-blank of a `_referrer`/`referrer`/… payload field, a `_page_url` field, the `Referer` header, the `Origin` header. ≤ 2048 |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | Payload field → `_page_url` query → `Referer` query → the endpoint URL's own query. A blank never wins. ≤ 512 each |
| `click_ids` | Same resolution, for `gclid`, `gbraid`, `wbraid`, `dclid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, `twclid`, `rdt_cid`, `epik`, `irclickid`, `sccid`, `obclid`, `tblci` |
| `values` | The payload minus reserved keys |
| `raw_body` | The payload verbatim, sanitised only |
| `origin`, `origin_reasons` | `human` / `agent` / `unverified` and why — [`docs/27-provenance.md`](./27-provenance.md). Never returned to the caller |
| `verdict` | `awaiting` until the outcome API says otherwise |

Reserved keys are stripped from `values` and kept verbatim in `raw_body`: every consumed
attribution key, plus `_redirect`, `_next`, `_idempotency_key`, `_idempotency`,
`_submission_key`, `_origin_token`, `_ef_token`.

**Files are stored** (#66). A multipart file part becomes an object in `values`, in the field it
was submitted under:

```json
{
  "file": true, "stored": true,
  "id": "kQ2r8kLm4TpWvZ9a",
  "filename": "cv.pdf", "contentType": "application/pdf", "detectedType": "application/pdf",
  "size": 241305, "sha256": "9f2b…",
  "url": "https://endpointforms.com/api/v1/files/kQ2r8kLm4TpWvZ9a?e=…&s=…",
  "urlExpiresAt": "…", "expiresAt": "…"
}
```

`stored` is always `true` and has no other value. **Before #66 this object said `stored: false`
and the bytes were thrown away** — the submission looked, from the submitter's side, exactly
like one that had kept their file. That shape no longer exists. A file this endpoint cannot
keep now fails the **whole submission** with a `413`, a `415` or a `503` naming the file, which
is what a browser form post shows on its error page. Nothing is ever accepted and quietly
dropped.

`contentType` is what the client declared and is not trusted. `detectedType` is what the leading
bytes actually look like, or `null`. Neither affects how a download is served: every file leaves
as `application/octet-stream`, always as an attachment, never inline.

The caps, all configurable — `docs/24` §3.6a:

| | Default |
|---|---|
| one file | 4 MiB |
| all files in one submission | 4 MiB |
| file parts per submission | 10 |
| the whole multipart envelope | 4.25 MiB |
| retention | 90 days |

An **unfilled** `<input type="file">` — empty filename, zero bytes — is skipped rather than
stored, because otherwise every submission from a form with an optional upload would carry an
empty attachment. A zero-byte file *with* a name is stored, because somebody attached it.

`raw_body` for a multipart post is truncated at 65 536 characters with a visible
`…[truncated]` marker. Every other encoding is still kept verbatim. Megabytes of binary in a
`text` column would be unreadable and four times the cost of the submission it belongs to, and
the file bytes are kept properly instead — downloadable, and hashed so their integrity is
checkable.

### Downloading a file — `GET /api/v1/files/{id}`

The `url` on the object above, and the only way to the bytes. It carries an expiry and an HMAC
over the file id and that expiry; there is no bucket and no public URL. Links minted for a
delivery last **7 days**, links on the submission detail screen **15 minutes**, and every one of
them is **clamped to the file's retention expiry**, so no link outlives the bytes it points at.

| HTTP | When |
|---|---|
| `200` | `application/octet-stream`, `Content-Disposition: attachment`, `nosniff`, `default-src 'none'; sandbox` |
| `403` | Bad or missing signature, or an id that does not exist — **the same answer for all three**, so the route is not an oracle for which files exist |
| `403` | Expired, which *does* say so: the file is still there, the link ran out, open the submission again |
| `410` | The bytes were removed under the retention rule, naming the date |
| `503` | This deployment cannot sign links |

Every stored string has NUL bytes removed and unpaired surrogates replaced with `�`. A field
literally named `__proto__` is stored as an ordinary field.

## 1.9 Idempotency

Send `Idempotency-Key` (or `X-Idempotency-Key`, or a `_idempotency_key` / `_idempotency` /
`_submission_key` field). The same key on the same endpoint returns the same submission for as
long as that row exists, regardless of payload.

With no key, one is derived from the endpoint, the IP hash and a canonical hash of the values,
bucketed into a **60-second window**. Key order does not affect it. Eight simultaneous
identical posts produce one row and eight `200`s.

A collapsed request answers `200` with `"duplicate": true` and the **original** submission's
`id` and `submittedAt`. Deduplication is enforced in Postgres by a partial unique index, not in
application code, so it holds under concurrency.

---

# 2. The outcome API

```
POST https://example.com/api/v1/verdict
```

Where a CRM says what the lead turned out to be worth. This is the half that makes the product
what it claims to be: a submission is not an outcome, and until something posts here every
submission is `awaiting`.

## 2.1 Why it is versioned

Quoting the route file, because the reasoning is the contract:

> `/api/v1` rather than a bare path because this one is versioned on purpose: a customer's CRM
> automation is written once and never touched again, and the day we need a different shape it
> must be a second URL rather than a silent change under a live integration.

An automation written against `/api/v1/verdict` keeps working. A breaking change becomes
`/api/v2/verdict` and `v1` stays up.

## 2.2 Authentication

```
Authorization: Bearer efv2.{key-id}.{secret}
```

`X-Api-Key: efv2.…` also works. `Authorization` wins when both are sent. A bare key with no
`Bearer` scheme is accepted deliberately, because some CRM webhook builders cannot send one.

Keys are created in **workspace settings**. A workspace may hold several at once, which is how
one is rotated without an outage: create the new key, move the integration across, then revoke
the old one, with both live in between.

**A key is shown once.** Only a SHA-256 of its secret half is stored, so nothing — including
us — can display it again. If you lose one, revoke it and create another.

**Revocation is per key.** Revoking one key does not affect any other key, any other workspace,
or any other deployment. The row is kept rather than deleted, so `created_at`, `last_used_at`
and `revoked_at` remain answerable after the fact. `last_used_at` is recorded to the nearest
five minutes: writing it on every request would put a row update and a row lock on a path CRMs
retry, and "is anything still using this key?" is not a question anybody asks to the second.

### The legacy `efv1` key

```
Authorization: Bearer efv1.{workspace-slug}.{signature}
```

The original format, still accepted so that integrations already in the field keep working. It
is an HMAC over the workspace's internal id — nothing is stored, and minting and verifying are
the same computation, which is why the settings page can still display it in full and why
anything holding `VERDICT_API_KEY_SECRET` can recompute it.

Its documented costs are unchanged except for the first, which is now fixed:

1. ~~**Rotation is fleet-wide, not per-tenant.**~~ **Each workspace can now revoke its own
   legacy key** from settings, without touching `VERDICT_API_KEY_SECRET` or anybody else's key.
   Rotating the server secret is still fleet-wide, and is still the only way to invalidate
   every legacy key at once; set the old value as `VERDICT_API_KEY_SECRET_PREVIOUS` so live
   integrations keep working while you reissue.
2. **Renaming a workspace invalidates its legacy key.** Intended, not a bug: the slug is the
   render subdomain and is effectively permanent, and a key that silently followed a rename
   would be a key nobody could reason about. `efv2` keys are looked up by their own id and are
   unaffected by a rename.
3. **The audit trail is coarser than an `efv2` key's.** A last-used time is recorded for the
   workspace's legacy key, but there is only ever one of them, so several callers sharing it
   remain indistinguishable. An `efv2` key per integration is what makes them separable.

New integrations should use an `efv2` key. It needs no server secret at all, which means a
self-hosted deployment that never sets `VERDICT_API_KEY_SECRET` still has a working outcome
webhook — the 503 below applies only to `efv1`.

### 401

Status `401`, header `WWW-Authenticate: Bearer realm="endpointforms", charset="UTF-8"`, body
`{"ok": false, "error": {"code": …, "message": …}}`.

| Situation | Code | Message |
|---|---|---|
| No key at all | `unauthorized` | ``No API key. Send your workspace's outcome key as `Authorization: Bearer efv2.<id>.<secret>`.`` |
| Structurally invalid | `unauthorized` | `That is not a valid outcome API key. Expected a key of the form efv2.<id>.<secret> in the Authorization header.` |
| Unknown key **or** wrong secret | `unauthorized` | `That API key is not valid for this deployment. Keys are per workspace; check you are sending the key for the workspace whose submissions you are grading.` |
| The key was revoked | `key_revoked` | `That outcome API key has been revoked and will not be accepted again. Create a new key in workspace settings and update whatever is calling this.` |

The two middle rows are byte-identical **on purpose**, and asserted to be, so that neither
workspace slugs nor key ids can be enumerated by comparing error messages.

`key_revoked` is deliberately *not* collapsed into them. Whoever is holding a revoked key
already had the key, so naming its state tells them nothing they did not have — while an
undifferentiated 401 sends a CRM engineer looking for a signing bug that is not there.

**There is no 403 on this surface.** A key for workspace A naming workspace B's submission gets
`404 submission_not_found`, because inside the workspace-scoped transaction the row genuinely
does not exist.

If `VERDICT_API_KEY_SECRET` is unset in production, a **legacy `efv1`** key answers `503
server_not_configured` rather than being accepted unverified. An `efv2` key is unaffected: it
is a random secret checked against its own hash and is not forgeable with or without a server
secret.

## 2.3 The request

```json
{
  "submission_id": "fAlO-my_EP2XbtxN",
  "verdict": "won",
  "value": 18400,
  "currency": "USD",
  "occurred_at": "2026-08-28T09:12:00Z"
}
```

### Fields

| Field | Type | Required |
|---|---|---|
| `submission_id` | string, ≤ 128 chars | one of `submission_id` or `email` |
| `email` | string | one of `submission_id` or `email` |
| `verdict` | enum, see below | **yes** |
| `value` | number or string | no |
| `currency` | ISO-4217, `^[A-Z]{3}$` | no |
| `occurred_at` | ISO-8601, or epoch seconds/ms | no |

**Field names are matched loosely.** Keys are normalised by lowercasing and collapsing
separators, so `Deal Value`, `deal_value` and `dealValue` all resolve. Accepted aliases:

| Concept | Also accepted as |
|---|---|
| `submission_id` | `submissionid`, `submission`, `id`, `public_id`, `endpoint_submission_id`, `reference` |
| `email` | `email_address`, `e_mail`, `work_email`, `contact_email` |
| `verdict` | `outcome`, `status`, `result`, `disposition`, `stage`, `stagename` |
| `value` | `amount`, `deal_value`, `revenue`, `deal_amount`, `total` |
| `currency` | `currency_code`, `iso_currency_code` |
| `occurred_at` | `decided_at`, `closed_at`, `closedate`, `close_date`, `timestamp`, `date`, `verdict_at` |

This exists so a CRM's own column names usually work without a mapping step.

### The verdict values

```
won   ·   lost   ·   disqualified   ·   awaiting
```

Common CRM wordings are accepted and normalised — `Closed Won`, `closedwon`, `Sold`,
`Converted` → `won`; `Closed Lost`, `No Sale` → `lost`; `Unqualified`, `DQ`, `Not a Fit`,
`Junk` → `disqualified`; `Pending`, `Open`, `New`, `In Progress` → `awaiting`. Matching
lowercases and collapses runs of space, hyphen and underscore.

Anything outside the list is **refused by name**, never guessed at.

`awaiting` is a real state, not an absence. Posting it clears the value, currency and timestamp
— it is how you undo a verdict entered in error. A verdict is never final; revise it freely.

### Value

**Major currency units. Dollars, not cents.** `18400` means eighteen thousand four hundred
dollars. Stored as `numeric(18,2)` and always returned as an exact decimal *string*, never a
float: `18400` comes back as `"18400.00"`.

Accepted: `18400`, `"18400.00"`, `"$18,400.50"`, `"18.400,50"` (European), `"USD 18400"`,
`"18 400"`. Symbols and thousands separators are stripped, and the decimal separator is
disambiguated by position. **A bare `18.400` is read as `18.40`** and returns a `value_rounded`
warning.

Refused: exponent notation (`1.8e4`), negatives, non-numeric text, anything over
1 000 000 000 000.

**Presence semantics, worth reading twice:**

| Sent | Effect |
|---|---|
| omitted, or `""`, or an empty CSV cell | leave the existing value alone |
| `null` in JSON | clear it |
| a number or numeric string | set it |

### Currency

A value with no currency is **assumed** rather than refused: `VERDICT_DEFAULT_CURRENCY`
(default `USD`), with a `currency_assumed` warning. A currency with no value is dropped with a
`currency_without_value` warning.

> `VERDICT_DEFAULT_CURRENCY` is read once at process start, not per request. Changing it needs
> a restart.

### Timestamps

A number, or a 9–14 digit string, is an epoch — under 100 000 000 000 is seconds, otherwise
milliseconds. Anything else goes through standard date parsing. It must not be more than
**5 minutes** in the future, and not before 2000-01-01. Omitted on a changing outcome, the
server stamps now.

### Idempotency

**There is no idempotency key, and none is needed.** The server computes the desired state and
compares it against the row. Identical means **no write at all** — `verdict_at` and
`updated_at` are not touched. `18400` and `"$18,400"` compare equal. Replaying a CRM's whole
history is safe.

The response says which happened: `"changed": true` or `false`.

## 2.4 Matching by email

Sending `email` instead of `submission_id` searches the stored values for an email field, orders
by most recent, and takes the newest match. It always returns a `matched_by_email` warning, and
adds `ambiguous_email_match` when more than one submission carries the address — the others are
left alone.

`submission_id` is the reliable route. Email matching only finds a lead whose form had an email
field at all. If `submission_id` is present, `email` is ignored entirely.

## 2.5 Responses

### One outcome — `200`

```json
{
  "ok": true,
  "result": {
    "row": 1,
    "ok": true,
    "submission_id": "fAlO-my_EP2XbtxN",
    "verdict": "won",
    "value": "18400.00",
    "currency": "USD",
    "verdict_at": "2026-08-28T09:12:00.000Z",
    "matched_by": "submission_id",
    "changed": true,
    "warnings": []
  }
}
```

`value`, `currency`, `verdict_at` and `warnings` are omitted when empty. `matched_by` is
`"submission_id"` or `"email"`.

### Errors

| HTTP | `code` | Cause |
|---|---|---|
| 401 | `unauthorized` | §2.2 |
| 401 | `key_revoked` | §2.2 — the key existed and was revoked |
| 503 | `server_not_configured` | A legacy `efv1` key with no `VERDICT_API_KEY_SECRET` in production |
| 404 | `submission_not_found` | Unknown id, or an id belonging to another workspace |
| 422 | `invalid_request` | Neither `submission_id` nor `email`; or an over-long id |
| 422 | `invalid_verdict` | Missing, or not one of the four |
| 422 | `invalid_value` | Not a number, negative, exponent notation, or too large |
| 422 | `invalid_currency` | Not three letters |
| 422 | `invalid_timestamp` | Unreadable, in the future, or before 2000 |
| 422 | `empty_body` | No body, empty array, or a CSV with no data rows |
| 400 | `malformed_body` | Unparseable JSON, or a CSV with no header row |
| 415 | `unsupported_media_type` | A content type this route does not read |
| 413 | `payload_too_large` | Over 256 KiB, or 4096 KiB for a CSV content type |
| 413 | `too_many_rows` | Over 500 JSON rows or 5 000 CSV rows |
| 429 | `rate_limited` | §2.7 |
| 405 | `method_not_allowed` | Not a POST |
| 500 | `internal_error` | Our fault. Nothing was changed; retrying is safe |

The error object has exactly two keys, `code` and `message`. **There is no `details` field.**
Per-row context comes from the `row` number in a batch response.

### Warnings

Non-fatal, returned alongside a successful result: `currency_assumed`,
`currency_without_value`, `value_ignored_for_awaiting`, `value_rounded`, `matched_by_email`,
`ambiguous_email_match`. Each is `{code, message}`.

### CORS

**None.** This is a server-to-server route and a browser is not the client. `OPTIONS` returns
`204` with only `Allow: POST, OPTIONS`.

## 2.6 Batches and CSV

A backfill is the normal first use, so it is a first-class shape.

| Body | Content type | Cap |
|---|---|---|
| one object | `application/json`, `*/+json`, `application/x-www-form-urlencoded` | — |
| an array | `application/json` | 500 rows |
| `{ "outcomes": [...] }` — also `verdicts`, `results`, `data`, `rows` | `application/json` | 500 rows |
| CSV or TSV | `text/csv`, `application/csv`, `text/tab-separated-values`, `text/tsv` | 5 000 rows |

CSV: a header row is required; RFC 4180 quoting; `\r\n` handled; a UTF-8 BOM is stripped;
the delimiter is auto-detected from the header (`,`, `;` or tab); blank rows are skipped.

### Batch response — `200`, or `207` when any row failed

```json
{
  "ok": false,
  "summary": { "rows": 5, "applied": 2, "unchanged": 0, "failed": 3 },
  "results": [
    { "row": 1, "ok": true, "submission_id": "fAlO-my_EP2XbtxN", "verdict": "won", "changed": true },
    { "row": 3, "ok": false, "error": { "code": "submission_not_found", "message": "…" }, "warnings": [] }
  ],
  "time_to_outcome": { "…": "see §2.8" }
}
```

`ok` is `summary.failed === 0`. `row` is 1-based and counts data rows under the header, so it
points at the spreadsheet line a person can go and look at.

**A bad row never fails the file.** Good rows still apply. An unknown or cross-workspace id
appears as a per-row `submission_not_found`, not as a request-level error.

> **Gotcha.** The body size cap is chosen from the declared `Content-Type`, not from the
> content. A CSV posted as `text/plain` (or with no content type) is sniffed as CSV only
> *after* the body was already capped at **256 KiB**, so a large one gets a 413 saying
> "larger than 256 KiB". Send `Content-Type: text/csv` and you get the 4 MiB cap.

## 2.7 Rate limits

| Window | Default | Environment variable |
|---|---|---|
| per IP | 300 / min | `VERDICT_RATE_LIMIT_IP_PER_MINUTE` |
| per workspace | 600 / min | `VERDICT_RATE_LIMIT_WORKSPACE_PER_MINUTE` |

Both are 60-second windows. The IP window is checked before the key is parsed; the workspace
window after authentication.

**A bulk upload counts as one request against both windows, not one per row.** The row cap is
what bounds a bulk caller. To grade many submissions, post a CSV rather than one request per
row — the 429 message says so.

Same per-process caveat as §1.5.

## 2.8 `time_to_outcome`

Returned **only on a batch or CSV response**, never on a single outcome, and omitted entirely
if the measurement query fails — it must never make a successful upload look failed.

```json
"time_to_outcome": {
  "window_days": 180,
  "submissions": 240,
  "graded": 96,
  "awaiting": 144,
  "graded_share": 0.4,
  "median_days": 11.42,
  "p90_days": 38.9,
  "loop":        { "tone": "warn", "headline": "…", "detail": "…" },
  "sales_cycle": { "tone": "good", "headline": "…", "detail": "…" }
}
```

Measured over a fixed 180-day window, not settable from HTTP. "Graded" means the verdict is not
`awaiting`, `verdict_at` is set, and `verdict_at` is at or after `submitted_at`.

`tone` is one of `good`, `warn`, `bad`, `neutral`.

- `sales_cycle` reads the latency alone: how long an outcome takes to arrive.
- `loop` reads what it means for the product: whether enough outcomes arrive, soon enough, for a
  form to learn anything from them. Fewer than 8 graded submissions is `neutral` — not a
  judgement, an admission that there is not enough data. Under 25% graded is `bad`, and it says
  so plainly: most leads never get an outcome.

`median_days` and `p90_days` may be `null`.

The calculation corrects for censoring — submissions still awaiting that are already older than
the median are counted against the graded share rather than ignored — so the number does not
flatter itself early on.

---

## 3. Complete examples

### An HTML form

```html
<form method="POST" action="https://example.com/e/abc123">
  <input type="email" name="email" required>
  <input type="text" name="company">
  <textarea name="note"></textarea>
  <input type="hidden" name="_redirect" value="https://acme.example/thanks">
  <button>Request a quote</button>
</form>
```

No JavaScript, no library, no CORS problem. The visitor lands on your own thank-you page.

### JSON

```bash
curl -sX POST https://example.com/e/abc123 \
  -H 'content-type: application/json' \
  -H 'idempotency-key: crm-sync-8814' \
  -d '{"email":"priya@dorsetmetal.example","company":"Dorset Metal","utm_source":"google"}'
```

### One outcome

```bash
curl -sX POST https://example.com/api/v1/verdict \
  -H 'authorization: Bearer efv2.<key-id>.<secret>' \
  -H 'content-type: application/json' \
  -d '{"submission_id":"fAlO-my_EP2XbtxN","verdict":"won","value":18400,"currency":"USD"}'
```

### A backfill

```bash
curl -sX POST https://example.com/api/v1/verdict \
  -H 'authorization: Bearer efv2.<key-id>.<secret>' \
  -H 'content-type: text/csv' \
  --data-binary @outcomes.csv
```

```csv
submission_id,outcome,deal value,currency,close date
fAlO-my_EP2XbtxN,Closed Won,18400,USD,2026-08-28
Kd9x-pQ2mNv4Ltz3,Closed Lost,,,2026-08-27
Rt4b-wE7hYu1Xqa8,Unqualified,,,2026-08-26
```

Loose column names, CRM wordings, empty cells meaning "leave it alone". Safe to replay.
