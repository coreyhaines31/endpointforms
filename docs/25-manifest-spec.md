# The Manifest specification

**The machine-callable half of an Endpoint form.**

Version 1.0.0 · Issue #48 · Implemented by `src/lib/manifest/`

Every Endpoint form publishes two surfaces from one definition. A person gets an HTML form.
An agent gets an [MCP](https://modelcontextprotocol.io) server at the same address with `/mcp`
on the end. Both write to the same table.

```
https://example.com/e/{endpointId}        the human form endpoint
https://example.com/e/{endpointId}/mcp    the Manifest surface — this document
```

This is a **public contract**. Everything below is read out of the implementation and, where
noted, pinned by an assertion in `tests/manifest-tool.test.mts` or `tests/manifest.test.mts`.
Anything not stated here is not promised. Where the current implementation is narrower than
the MCP specification, this document says so rather than implying coverage.

> Every response shape in §4, §5 and §6 was additionally checked against a running build on
> 2026-08-31 — `initialize`, version negotiation, `tools/list`, an accepted `tools/call`, a
> rejected one, idempotent collapse, `unknown_tool`, the `GET` 405, the notification `202`, the
> `method not found` at HTTP 200, and the batch refusal — rather than being transcribed from
> the source alone.

The spec is meant to be copied. A standard is only useful if other people implement it.

---

## 1. Why this exists

An agent filling in a web form has to scrape the DOM, guess at field semantics, and cope with
markup that changes underneath it. The result is brittle for the agent and unreadable for the
form's owner, who sees a submission that looks exactly like a person's and has no way to tell.

Manifest removes both problems with one move: give the agent a real tool to call, and record
which door it came through.

That second half is the part worth being precise about. **An agent submitting through Manifest
is stamped `agent` because it used Manifest.** There is nothing to forge, because using this
surface *is* the declaration. See §9 and [`docs/27-provenance.md`](./27-provenance.md) — and
read §9 before writing any copy about it, because the human half of the same feature does not
work this way.

---

## 2. Transport

| | |
|---|---|
| URL | `POST /e/{endpointId}/mcp` |
| Protocol | JSON-RPC 2.0 over HTTP |
| Content type | `application/json` (sent); `application/json; charset=utf-8` (returned) |
| Authentication | **None.** Same as the form surface — a public form is public to both halves |
| Encoding | UTF-8 |

`{endpointId}` must match `^[A-Za-z0-9_-]{1,64}$`. Anything else is a 404 before any lookup.

### Methods

| Method | Behaviour |
|---|---|
| `POST` | The JSON-RPC request. The only method that does anything. |
| `OPTIONS` | `204`, CORS preflight headers, no body |
| `GET`, `PUT`, `PATCH`, `DELETE` | `405` with `Allow: POST, OPTIONS` and a plain (non-JSON-RPC) error body explaining the endpoint |

There is **no server-initiated stream on this URL**. `GET` is a deliberate 405, not an
oversight: the current implementation has no SSE or Streamable-HTTP downstream channel.

### CORS

Every response, including the preflight, carries:

```
Access-Control-Allow-Origin:   <the request's Origin, reflected>  (or * when absent)
Access-Control-Allow-Methods:  POST, OPTIONS
Access-Control-Allow-Headers:  <Access-Control-Request-Headers, reflected>
                               (default: content-type, accept, mcp-protocol-version,
                                mcp-session-id, idempotency-key, x-agent-identity)
Access-Control-Expose-Headers: retry-after, mcp-protocol-version
Access-Control-Max-Age:        86400
Vary:                          Origin
Cache-Control:                 no-store, no-cache, must-revalidate
```

There is no `Access-Control-Allow-Credentials`. This surface never reads a cookie.

### Request headers that are read

None are required.

| Header | Used for |
|---|---|
| `X-Agent-Identity`, then `X-MCP-Client` | The caller's self-declaration. Recorded, **never trusted** — see §9 |
| `Idempotency-Key` | Collapses a retry onto the existing submission |
| `X-Vercel-Forwarded-For`, `X-Forwarded-For`, `CF-Connecting-IP`, `X-Real-IP` | Rate limiting and the stored IP hash. The raw IP is never stored |
| `Content-Length` | An early `413` before the body is read |

`Content-Type` is **not** checked on this route. `Accept` is not checked.

> **Not implemented:** `MCP-Session-Id` and `MCP-Protocol-Version` appear in the CORS
> allow/expose lists but are never read, and the server never emits `MCP-Protocol-Version` as a
> response header. There is no session management. A client that relies on MCP session
> semantics gets nothing.

---

## 3. The JSON-RPC envelope

`"jsonrpc"` must be exactly the string `"2.0"`. It is compared with `===`.

### Requests

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {} }
```

`params` may be omitted or `null`; both are read as `{}`. `params` must be an object —
positional (array) parameters are refused with `-32602`.

**`id` must be a string or a finite number.** Anything else — `null`, a boolean, an object,
`NaN` — is treated as *absent*, which makes the message a notification.

**Batching is not supported.** MCP removed JSON-RPC batching in revision `2025-06-18`. An array
payload is refused with `-32600`. Send one request per POST.

### Responses

Success:

```json
{ "jsonrpc": "2.0", "id": 1, "result": { … } }
```

Error:

```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32602, "message": "…" } }
```

`error.data` is present only where §3.2 says so.

### 3.1 Notifications

A message with no usable `id` is a notification. It receives HTTP **`202` with a completely
empty body** — not an empty JSON object.

> **Sharp edge, worth knowing:** an explicit `"id": null`, or a non-finite numeric id, is
> indistinguishable from a notification and gets the same 202 with no result. If you meant to
> make a request, send a string or a finite number.

### 3.2 Every error this server can emit

Note the asymmetry in the HTTP column, and design your client around it: **envelope errors come
back as 4xx, but everything the server actually dispatched comes back as HTTP 200** — including
`method not found` and every tool-level rejection.

| HTTP | `code` | Condition | `data` |
|---|---|---|---|
| 400 | `-32600` | The payload is a JSON array (batching) | — |
| 400 | `-32600` | The payload is not a JSON object | — |
| 400 | `-32600` | `jsonrpc` is missing or is not `"2.0"` | — |
| 400 | `-32600` | `method` is missing, not a string, or empty | — |
| 400 | `-32600` | The request had no body | — |
| 400 | `-32602` | `params` is an array or a scalar | — |
| 400 | `-32700` | The body is not valid JSON | — |
| 404 | `-32000` | `{endpointId}` fails the id pattern | — |
| 413 | `-32600` | The body exceeds 1 048 576 bytes | — |
| 429 | `-32000` | Rate limited. Also sets the `Retry-After` header | `{ "retry_after_seconds": <number> }` |
| **200** | `-32601` | Unknown method | — |
| 404 / 410 / 429 | `-32000` | The endpoint does not exist, was deleted, or the submission limit tripped | `{ "code": "<ingest error code>" }` |
| 500 | `-32603` | Anything unhandled | — |

Codes are the JSON-RPC standard set plus `-32000` for server-defined errors:
`-32700` parse error, `-32600` invalid request, `-32601` method not found, `-32602` invalid
params, `-32603` internal error, `-32000` server error.

### 3.3 Rate limits

Three fixed 60-second windows. The Manifest surface has its own endpoint namespace, so agent
traffic does not consume the form's endpoint budget — but the **per-IP window is shared** with
the form surface.

| Window | Default | Configured by |
|---|---|---|
| per endpoint | 300 / min | `INGEST_RATE_LIMIT_ENDPOINT_PER_MINUTE` |
| per IP | 60 / min | `INGEST_RATE_LIMIT_IP_PER_MINUTE` |
| per endpoint + IP | 20 / min | `INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE` |

> **Honest limitation:** counters are per-process and in-memory. On a serverless platform the
> effective ceiling is the configured limit multiplied by the number of warm instances, and the
> limiter fails open under memory pressure. A shared counter is not implemented. Treat these
> numbers as a guard against accidents, not as a security control.

---

## 4. `initialize`

### Request

```json
{ "jsonrpc": "2.0", "id": 1, "method": "initialize",
  "params": { "protocolVersion": "2025-06-18",
              "clientInfo": { "name": "acme-agent", "version": "1.0" },
              "capabilities": {} } }
```

Only `params.protocolVersion` is read. `clientInfo` and `capabilities` are accepted and
**ignored** — in particular, `clientInfo` does *not* become the agent declaration; use
`_meta` or the `X-Agent-Identity` header for that (§9).

`params` may be omitted entirely.

### Version negotiation

Real negotiation, not an echo. Supported, newest first:

```
2025-06-18   ← latest
2025-03-26
2024-11-05
```

A requested version in that list is echoed back. Anything else — including a version newer than
ours — is answered with `2025-06-18`. Both directions are asserted in the tests.

### Response

```json
{
  "protocolVersion": "2025-06-18",
  "capabilities": { "tools": {} },
  "serverInfo": {
    "name": "endpointforms",
    "title": "Endpoint Forms — Manifest",
    "version": "1.0.0"
  },
  "instructions": "This server publishes one tool, submit_demo_request, which submits the form behind endpoint abc123. …"
}
```

`capabilities.tools` is `{}` deliberately. `listChanged` is **absent**: the tool list is
derived from the live schema on every request, and this transport has no channel to push a
change down. Poll `tools/list` instead.

`initialize` resolves the endpoint, so an unknown or deleted endpoint fails here with the
404/410 `-32000` error rather than initialising successfully.

`instructions` is prose intended for a model, and its exact wording is **not** part of the
contract. Its content is: this server publishes one tool; submissions through it are recorded
with origin `agent`; call `tools/list` for the current field list, because it is generated from
the live form definition and changes when the form does.

---

## 5. `tools/list`

### Request

```json
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }
```

No parameters. **Pagination is not implemented** — `cursor` is not read and `nextCursor` is
never emitted.

### Response

```json
{
  "tools": [ { … one tool … } ],
  "_meta": {
    "endpointforms.com/endpoint":   "abc123",
    "endpointforms.com/submit_url": "https://example.com/e/abc123",
    "endpointforms.com/origin":     "agent"
  }
}
```

**There is always exactly zero or one tool.** One endpoint is one form. The array is never
longer than one element; this is asserted.

### An endpoint with no schema

An endpoint that has not declared a form schema is **not an error**. It answers `200` with an
empty array and a `_meta.endpointforms.com/notice` explaining that the endpoint still accepts a
plain `POST` at `submit_url`, and that a tool appears here as soon as a schema is declared.

Clients should handle `tools: []` as "nothing to call yet", not as a failure.

### 5.1 The tool name

Derived from the form's name, deterministically:

1. lowercase, then every run of `[^a-z0-9]` becomes `_`
2. strip leading and trailing `_`
3. truncate to 48 characters
4. prefix `submit_`; if the slug is empty, use `submit_form`
5. truncate to 64 characters, strip trailing `_`
6. if the result somehow fails `^[a-zA-Z0-9_-]{1,64}$`, fall back to `submit_form`

`"Demo request"` → `submit_demo_request`. A form with no name → `submit_form`. Both asserted.

**The tool name is not a stable identifier.** It is derived from a name the form's owner can
change. Resolve it from `tools/list` on each session rather than hard-coding it; a
`tools/call` with the wrong name is rejected with `unknown_tool` (§6.4).

### 5.2 The tool definition

All seven keys are always present.

```json
{
  "name": "submit_demo_request",
  "title": "Demo request",
  "description": "Submit the \"Demo request\" form (endpoint abc123). It declares 4 fields, of which 2 are required: email, company. A submission made through this tool is recorded with origin \"agent\": using this surface is itself the declaration, so there is nothing to gain by imitating a browser. On acceptance the result carries the submission id. On rejection it carries a reason per field, so a corrected call can be retried. The same form is posted to https://example.com/e/abc123 by a browser; this tool is the machine-callable half of that one definition.",
  "inputSchema": {
    "type": "object",
    "properties": { "…": "see §7" },
    "required": ["email", "company"]
  },
  "outputSchema": { "…": "see §5.3" },
  "annotations": {
    "title": "Demo request",
    "readOnlyHint": false,
    "destructiveHint": false,
    "idempotentHint": false,
    "openWorldHint": true
  }
}
```

- `title` — the form's own name, or `"Submit form"`.
- `description` — generated. The wording is not part of the contract; the *facts* in it are.
- `required` — **always present, even when empty.** Asserted.
- `additionalProperties` — **deliberately never set**, and asserted absent. Undeclared fields
  are accepted and stored (§7.3), so declaring the object closed would be a lie.
- `annotations.idempotentHint` is `false`. Retrying a call creates a second lead unless you
  send an `Idempotency-Key` (§8).

### 5.3 `outputSchema`

Identical for every endpoint. Every property carries a `description` in the real document;
they are elided here.

```json
{
  "type": "object",
  "description": "The outcome of the submission. Check `status` first.",
  "required": ["status"],
  "properties": {
    "status":              { "type": "string", "enum": ["accepted", "rejected"] },
    "submission_id":       { "type": "string" },
    "endpoint":            { "type": "string" },
    "submitted_at":        { "type": "string", "format": "date-time" },
    "origin":              { "type": "string", "const": "agent" },
    "duplicate":           { "type": "boolean" },
    "warnings":            { "type": "array", "items": { "…": "issue" } },
    "code":                { "type": "string" },
    "message":             { "type": "string" },
    "errors":              { "type": "array", "items": { "…": "issue" } },
    "retry_after_seconds": { "type": "number" }
  }
}
```

An issue is:

```json
{
  "type": "object",
  "properties": {
    "field":   { "type": ["string", "null"] },
    "code":    { "type": "string" },
    "message": { "type": "string" }
  },
  "required": ["field", "code", "message"]
}
```

`field` is `null` when the issue is about the submission as a whole rather than one field.

---

## 6. `tools/call`

### Request

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "submit_demo_request",
    "arguments": {
      "email": "priya@dorsetmetal.example",
      "company": "Dorset Metal",
      "seats": 25,
      "newsletter": true,
      "interests": ["fabrication", "tooling"]
    },
    "_meta": {
      "endpointforms.com/agent": { "name": "acme-agent", "version": "1.0" },
      "endpointforms.com/idempotency-key": "quote-req-8814"
    }
  }
}
```

Two `_meta` keys are read, both namespaced `endpointforms.com/`. Each accepts either a non-empty
string or `{ name, version }`.

| `_meta` key | Effect |
|---|---|
| `endpointforms.com/agent` | Recorded as the caller's declaration. **Never trusted** — §9 |
| `endpointforms.com/idempotency-key` | Applied only if no `Idempotency-Key` HTTP header was sent |

### 6.1 How arguments are coerced

Arguments are coerced to the wire shape the human form would have posted, then validated by
**the same validator the human form runs**. One definition, one set of rules, two doors.

| Declared type | Accepted | Becomes |
|---|---|---|
| `checkbox` | `true` / a non-blank string / a non-zero number | `"on"` |
| `checkbox` | `false` / `0` / `""` / `"false"` / `"off"` / `"0"` | omitted |
| `multi_select` | a string, or an array of them | an array of strings; blanks dropped; **an empty result is omitted, not sent as `[]`** |
| anything else | a string, a finite number, or a boolean | `String(value)` — so `25` is stored as `"25"` |
| anything else | a blank or whitespace-only string | omitted |
| any | an object, `NaN`, `Infinity` | a shape error, `unsupported_value` |

A key literally named `__proto__` is stored as an ordinary field. It cannot pollute a prototype.

### 6.2 The order of checks

1. resolve the endpoint → `404` / `410` if unknown or deleted
2. no active schema → `no_tool_published`
3. `name` does not match the published tool → `unknown_tool`
4. `arguments` present but not a plain object → `invalid_arguments`
5. any error-severity validation issue → `schema_validation_failed`, **nothing is stored**
6. nothing survived coercion → `empty_submission`
7. write

### 6.3 Success

HTTP `200`.

```json
{
  "content": [
    { "type": "text",
      "text": "Submitted. Submission fAlO-my_EP2XbtxN was stored on endpoint abc123 and stamped origin \"agent\"." }
  ],
  "structuredContent": {
    "status": "accepted",
    "submission_id": "fAlO-my_EP2XbtxN",
    "endpoint": "abc123",
    "submitted_at": "2026-08-31T10:04:22.117Z",
    "origin": "agent",
    "duplicate": false,
    "warnings": [
      { "field": "newsletter", "code": "unknown_field",
        "message": "\"newsletter\" was submitted but is not in the schema. …" }
    ]
  },
  "isError": false
}
```

`warnings` is present only when there is at least one. `duplicate: true` means the call
matched an existing submission and was collapsed onto it (§8) — the id and timestamp returned
are the *original* submission's.

### 6.4 Rejection

**A rejected tool call is still HTTP `200`, still a JSON-RPC `result`, and never a JSON-RPC
`error`.** This is asserted in three separate ways, and it is the shape MCP asks for: a tool
failure is something the calling model should read and act on, not a transport fault.

```json
{
  "content": [
    { "type": "text",
      "text": "Not submitted. The submission does not match the form's submit_demo_request schema and was not stored. 2 fields need correcting; send a corrected call. \"Work email\" is not an email address. \"Company\" is required and arrived empty." }
  ],
  "structuredContent": {
    "status": "rejected",
    "code": "schema_validation_failed",
    "message": "The submission does not match the form's submit_demo_request schema and was not stored. 2 fields need correcting; send a corrected call.",
    "errors": [
      { "field": "email",   "code": "invalid_email",    "message": "\"Work email\" is not an email address." },
      { "field": "company", "code": "missing_required", "message": "\"Company\" is required and arrived empty." }
    ]
  },
  "isError": true
}
```

`errors` is **always present**, possibly `[]`. `retry_after_seconds` appears only when the
server supplied one.

#### `structuredContent.code`

| `code` | Meaning | Retryable |
|---|---|---|
| `no_tool_published` | The endpoint has no readable schema. It still accepts a plain POST at `submit_url` | no |
| `unknown_tool` | `name` is not the tool this endpoint publishes. Re-read `tools/list` | after re-listing |
| `invalid_arguments` | `arguments` is not an object | no |
| `schema_validation_failed` | At least one field is wrong. `errors` says which | yes, corrected |
| `empty_submission` | No field values survived coercion | yes, with values |
| `rate_limited` | Passed through from the write path, with `retry_after_seconds` | yes, after waiting |
| `internal_error` | Our fault | yes |

Other write-path codes (`empty_body`, `payload_too_large`, …) pass through verbatim.

#### `errors[].code`

The full closed set: `missing_required`, `unknown_field`, `repeated_value`,
`unsupported_value`, `not_an_option`, `invalid_email`, `invalid_phone`, `invalid_number`,
`invalid_date`, `invalid_choice_count`, `too_short`, `too_long`, `pattern_mismatch`,
`out_of_range`.

`unknown_field` and `repeated_value` are **always warnings**, never errors.

### 6.5 Manifest is stricter than the form endpoint

Deliberately, and it is the one behavioural difference between the two doors.

| | Form endpoint | Manifest |
|---|---|---|
| A validation error | The submission is **stored**, and the error is returned as a warning¹ | The call is **rejected and nothing is stored** |

¹ unless the schema is in `strict` mode, in which case the form endpoint also refuses.

The reasoning: a person who mistypes an address is a lead you still want, and a form that
throws their work away is worse than a form that keeps a slightly wrong record. An agent can
read the errors and call again in the same second. So the human path is forgiving and the
machine path is exact.

---

## 7. Form field → JSON Schema

Ten field types. The set is closed.

| Field type | Emitted schema | Extra constraints |
|---|---|---|
| `text` | `{ "type": "string" }` | `minLength`, `maxLength`, `pattern` |
| `textarea` | `{ "type": "string" }` | `minLength`, `maxLength`, `pattern` |
| `email` | `{ "type": "string", "format": "email" }` | `minLength`, `maxLength`, `pattern` |
| `phone` | `{ "type": "string" }` | `minLength`, `maxLength`, `pattern` |
| `hidden` | `{ "type": "string" }` | `minLength`, `maxLength`, `pattern` |
| `number` | `{ "type": "number" }` | `minimum`, `maximum`, `multipleOf` |
| `date` | `{ "type": "string", "format": "date" }` | — (bounds appear in `description` only) |
| `select` | `{ "type": "string", "enum": [...] }` | — |
| `multi_select` | `{ "type": "array", "items": { "type": "string", "enum": [...] }, "uniqueItems": true }` | `minItems`, `maxItems` |
| `checkbox` | `{ "type": "boolean" }` | — |

A declared `pattern` is emitted anchored: `[A-Z]{3}-\d{4}` publishes as `^(?:[A-Z]{3}-\d{4})$`.

**Required-ness is expressed only in `inputSchema.required`**, never per field.

**`title` and `default` are never emitted on a field.**

### 7.1 `description`

Assembled, in this order, and omitted when empty:

1. the field's label, if it differs from its key
2. the field's help text
3. a type-specific note — for `phone`, `hidden`, `checkbox`, `date`, and any field with a
   `pattern`
4. for `select` and `multi_select` whose options have labels: `Options: value = Label; …`,
   capped at 12 with `; and N more`

The field's placeholder is never used.

### 7.2 Where the schema is narrower than reality

Read this section before writing a client that trusts `inputSchema` as complete. These are
documented gaps in the current implementation, not intended behaviour.

**Enforced but not declared:**

- `minLength`, `maxLength` and `pattern` declared on a `select`, `multi_select`, `number` or
  `date` field are enforced by the server but **do not appear in the published schema**. A
  value can be rejected for a rule the schema never showed you.
- `date` bounds (`min` / `max`) are enforced numerically but appear only as English prose in
  `description`.
- Phone format: must match `^[+()\-. \d /x;,ext]*$` (case-insensitive) and contain 7–20 digits.
  No `format` is emitted, deliberately — no format keyword describes real-world phone entry.
- `date` parsing is *looser* than `format: "date"` implies: a `YYYY-MM-DDTHH:MM[:SS]` or
  `YYYY-MM-DD HH:MM` prefix is also accepted. `03/14/2026` is rejected.
- `number` accepts a numeric **string**. The declared type is narrower than what is taken.

**Declared but not enforced:**

- `multipleOf` on `number`. Nothing validates it.
- `uniqueItems` on `multi_select`. Duplicates are not rejected.

**Server-side caps, in no schema anywhere:**

| Limit | Value |
|---|---|
| request body | 1 048 576 bytes |
| distinct fields | 250 |
| field name | 256 characters |
| field value | 65 536 characters — **truncated, not rejected**, with `…[truncated]` appended |
| JSON nesting depth | 12 |
| JSON node count | 5 000 |
| idempotency key | 255 characters, silently truncated |

NUL bytes are removed from every string and unpaired surrogates become `�`.

### 7.3 Undeclared arguments

Accepted, stored, and reported as an `unknown_field` **warning** — not an error, and never a
reason to reject. A blank undeclared field produces no warning at all.

This is why `additionalProperties` is left open.

### 7.4 Reserved argument names

These are stripped from the stored field values but still consumed, so an agent can pass
campaign attribution exactly the way a landing page would and it lands in the same columns
with no `unknown_field` warning:

`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, the click-id parameters
(`gclid`, `gbraid`, `wbraid`, `dclid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, `twclid`,
`rdt_cid`, `epik`, `irclickid`, `sccid`, `obclid`, `tblci`), `_redirect`, `_next`,
`_idempotency_key`, `_idempotency`, `_submission_key`, `_origin_token`, `_ef_token`.

### 7.5 Attachments

**There is no file field type and no attachment storage.** A `tools/call` cannot carry a file.
On the human form surface a multipart file part is *described* — filename, content type, size —
and the bytes are discarded.

---

## 8. Idempotency

Two mechanisms.

**Explicit.** Send an `Idempotency-Key` header (or `_meta["endpointforms.com/idempotency-key"]`).
The same key on the same endpoint returns the same submission for as long as that row exists,
regardless of what the payload says. This is the reliable one; use it for anything you might
retry.

**Automatic.** With no key, the server derives one from the endpoint, the caller's IP hash and
a canonical hash of the values, bucketed into a **60-second window**. Key order in the payload
does not affect it. Eight simultaneous identical calls produce one row and eight `200`s, each
reporting `duplicate: true` after the first.

The automatic window fails open. Do not rely on it to deduplicate a retry that crosses a minute
boundary — send a key.

---

## 9. Provenance — read this before quoting it

A submission through Manifest is stamped **`agent`**, categorically.

`surface: "manifest"` is a literal set by the route. It is never read from the body, a header,
a parameter, or `_meta`. There is no value a caller can send that changes the stamp — asserted
in both directions: a form-surface caller sending `surface=manifest`, `origin=agent` and four
matching headers is still not `agent`; and an MCP caller sending a full Chrome header set plus
`arguments: { surface: "form", origin: "human" }` is still `agent`.

**Because there is nothing to forge, there is nothing to defeat.** Calling this surface *is*
the declaration. That is the whole mechanism, and it is why the agent half of the provenance
claim is structural rather than heuristic.

**The other half is not.** The `human` stamp on the form surface is a weighted judgement from
request headers, and every one of those headers is set by the caller. Plain `curl` with nine
copied Chrome headers is stamped `human`. That is measured, reproduced, and written up in
[`docs/23-origin-findings.md`](./23-origin-findings.md). Never write, or imply, that Endpoint
detects bots.

The caller's declared identity — `_meta["endpointforms.com/agent"]`, then `X-Agent-Identity`,
then `X-MCP-Client`, then the `User-Agent` — is recorded on the submission with an explicit
weight of **zero**. It exists so a form owner can see what called their form, not as evidence.
Nothing decides anything from it.

Full model: [`docs/27-provenance.md`](./27-provenance.md).

---

## 10. A complete session

```bash
BASE=https://example.com/e/abc123/mcp

# 1. initialize
curl -sX POST "$BASE" -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"initialize",
  "params":{"protocolVersion":"2025-06-18","clientInfo":{"name":"acme-agent","version":"1.0"}}
}'

# 2. discover the tool and its fields
curl -sX POST "$BASE" -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":2,"method":"tools/list"
}'

# 3. submit
curl -sX POST "$BASE" \
  -H 'content-type: application/json' \
  -H 'x-agent-identity: acme-agent/1.0' \
  -H 'idempotency-key: quote-req-8814' -d '{
  "jsonrpc":"2.0","id":3,"method":"tools/call",
  "params":{
    "name":"submit_demo_request",
    "arguments":{"email":"priya@dorsetmetal.example","company":"Dorset Metal","seats":200}
  }
}'
```

Client checklist:

1. Call `tools/list` for the tool name and field list each session. Neither is stable across
   form edits.
2. Read `isError` on the `tools/call` result. **Do not treat HTTP 200 as success.**
3. On `isError: true`, branch on `structuredContent.code`; on `schema_validation_failed`, fix
   the fields named in `errors` and call again.
4. Send an `Idempotency-Key` on anything you might retry.
5. Honour `retry_after_seconds` and the `Retry-After` header.
6. Handle `tools: []` as "no tool yet", not as a failure.

---

## 11. What this version does not implement

Stated plainly so nobody builds against an assumption.

- **Methods.** Only `initialize`, `ping`, `tools/list` and `tools/call`. No `resources/*`,
  `prompts/*`, `completion/*` or `logging/*`.
- **No SSE or Streamable-HTTP downstream channel.** `GET` is a 405.
- **No sessions.** `MCP-Session-Id` is never read or issued.
- **No `MCP-Protocol-Version` response header**, and the request header is not enforced on
  post-initialize requests as revision `2025-06-18` expects.
- **No batching.** Removed from MCP in `2025-06-18`; refused here.
- **No `tools/list` pagination.** There is at most one tool.
- **No `notifications/*` handling.** Notifications are accepted with a `202` and dropped.
- **No authentication.** A public form is public to both surfaces.
- **No `listChanged`.** Poll `tools/list`.
- **No attachments.**
- **Rate limiting is per-process** (§3.3).

## 12. Versioning

`serverInfo.version` is `1.0.0` and tracks this document.

The compatibility promise, in the same spirit as `/api/v1/verdict`: a client written against
this document and left alone should keep working. Additive changes — a new field type, a new
`_meta` key, a new `structuredContent` property — may appear in a minor version. A change to
the shape or meaning of anything documented above gets a major version and a way to keep
asking for the old one.

Things explicitly **not** promised:

- the exact wording of any `description`, `instructions` or `message` string
- the tool name, which is derived from a name the form owner controls
- the default rate-limit numbers
