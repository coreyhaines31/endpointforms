# Agent access — REST API, MCP tools and CLI

**Issue #133.** Endpoints, form schemas and submissions are now reachable from three surfaces:

| Surface | Address | For |
|---|---|---|
| REST | `https://app.endpointforms.com/api/v1` — described at [`/api/v1/openapi.json`](#the-openapi-document) | Scripts, servers and integrations |
| MCP | `POST https://app.endpointforms.com/api/mcp` | An AI agent working in a chat |
| CLI | `npx endpointforms` | A terminal, CI, or an agent with a shell |

All three reach endpoints, form schemas and submissions through **one typed core** in `src/lib/api/`. REST and MCP call it directly, and the CLI calls REST. That core decides which workspace, which rows and which scopes apply. Authenticating the key happens one step earlier, in `src/lib/account/auth.ts`: it checks the key is valid and not revoked, and that its creator is still an owner. Signing up and minting keys (`start_signup`, `verify_signup`, `create_api_key`) stay MCP-only and live in `src/lib/account/`.

Everything here was read from the implementation and is pinned by tests. `tests/api-core.test.mts` covers the core, `tests/api-rest.test.mts` and `tests/api-openapi.test.mts` cover REST, `tests/account-mcp.test.mts` covers MCP, and `tests/cli.test.mts` runs the CLI end to end against the real REST and MCP handlers.

---

## Authentication and scopes

Every surface uses the same workspace API key, `efv2.<id>.<secret>`. Send it as `Authorization: Bearer <key>`, or as `X-Api-Key`.

There are three ways to get a key:

- **`npx endpointforms login`.** This emails you a 6-digit code and saves a key with every scope.
- **`start_signup` then `verify_signup` on the account MCP server.** This is the same flow, run from a chat ([`docs/32`](./32-agent-onboarding.md)).
- **`create_api_key` with an existing key.** The new key can only receive scopes the existing key already holds.

Keys made on the settings page are outcome keys (`outcomes:write`). They authenticate, so `GET /me` works, but they cannot touch endpoints, forms or submissions.

A key is accepted only while all three of these hold:

- it has not been revoked
- the person who created it is still an **owner** of the workspace
- it has the scope for the call

| Scope | Allows |
|---|---|
| `endpoints:read` | Listing and reading endpoints, their form schema, and their destinations |
| `endpoints:write` | Creating, renaming, archiving and restoring endpoints, and publishing form schemas |
| `submissions:read` | Listing, reading and exporting submissions, and reading their deliveries |
| `submissions:write` | Deleting submissions |
| `keys:write` | Minting keys (MCP only) |
| `outcomes:write` | `POST /api/v1/verdict` ([`docs/26`](./26-api.md) §2) |

The `submissions:*` scopes are separate from the endpoint scopes because submissions are end-user personal data. **Keys minted before #133 do not have them.** To get them, run `verify_signup` again (or `endpointforms login`).

### Workspace scoping

**A key reads and writes its own workspace and nothing else.** The core takes the workspace from the authenticated key and accepts no workspace id, slug or internal row id from the caller. Objects are named by their public ids. Every query on a workspace-scoped table runs inside `withWorkspace()`, which applies both the predicate and row-level security ([`docs/21`](./21-data-model.md)). Two lookups are not workspace-scoped tables and run outside it: the workspace's own name (`whoami`) and the key creator's email address (`createEndpoint`). Both are keyed by ids read from the key. Another workspace's id therefore gets exactly the answer an id that never existed gets: `404 not_found`.

---

## REST — `/api/v1`

| Method | Path | Scope | Returns |
|---|---|---|---|
| `GET` | `/me` | any | The key's workspace and scopes |
| `GET` | `/endpoints` | `endpoints:read` | Every endpoint, archived ones included and marked |
| `POST` | `/endpoints` `{"name"}` | `endpoints:write` | `201` and the new endpoint |
| `GET` | `/endpoints/{id}` | `endpoints:read` | One endpoint |
| `PATCH` | `/endpoints/{id}` `{"name"?, "archived"?}` | `endpoints:write` | Renamed, archived or restored |
| `DELETE` | `/endpoints/{id}` | `endpoints:write` | Archives it (see below) |
| `GET` | `/endpoints/{id}/form` | `endpoints:read` | The live form schema, or `null` |
| `PUT` | `/endpoints/{id}/form` `{"document", "mode"?, "activate"?}` | `endpoints:write` | A new schema version |
| `GET` | `/endpoints/{id}/destinations` | `endpoints:read` | Destinations, with their health |
| `GET` | `/submissions` | `submissions:read` | A page of submissions, newest first |
| `GET` | `/submissions/export` | `submissions:read` | A CSV or JSON file |
| `GET` | `/submissions/{id}` | `submissions:read` | One submission, with its files and deliveries |
| `DELETE` | `/submissions/{id}` | `submissions:write` | Deletes it |
| `GET` | `/submissions/{id}/deliveries` | `submissions:read` | Every delivery attempt |

```sh
curl "https://app.endpointforms.com/api/v1/submissions?verdict=awaiting&limit=20" \
  -H "Authorization: Bearer $ENDPOINTFORMS_API_KEY"
```

**Responses.** A success is `{"ok": true, "data": …}`, and a list adds `next_cursor`. An error is `{"ok": false, "error": {"code", "message"}}`. The status is one of 400 `invalid_request`, 401 `unauthorized`, 403 `forbidden`, 404 `not_found`, 409 `conflict` or 429 `rate_limited`. The message always says what to change. Unknown fields in a JSON body are a 400, and so are unknown query parameters on `/submissions` and `/submissions/export`. The other routes take no query parameters and ignore any that are sent. Every response is `Cache-Control: no-store`.

**No CORS.** This is a server-to-server API, and a key that can read every lead does not belong in a browser.

**Rate limits.** 300 requests a minute per IP, counted before the key is checked, then 600 a minute per key. A `429` carries `Retry-After`.

### Endpoints

`DELETE` **archives** an endpoint, which is the only delete the data model has. An archived endpoint refuses new submissions with a `410` and keeps every submission it has. `PATCH {"archived": false}` restores it. The rename and archive settings are the endpoint's only settings. Spam policy and destinations are managed in the app.

`POST` sends the new endpoint's notifications to the email of **the person who created the key**. That address is read from the key, never from the request.

### Form schema

`PUT` writes a new version through the same store the builder uses, so earlier versions are kept and every submission stays readable against the version it arrived under ([`docs/21`](./21-data-model.md)). `document` is the schema format from #51: `{"formatVersion": 1, "fields": [{"key", "label", "type", "required", "options"}]}`, sent as an object or as JSON text. `mode` is `warn` (the default), which stores mismatching submissions and flags them, or `strict`, which rejects them. `"activate": false` saves a draft without changing the live form. An invalid document is a `400` whose `error.errors` lists every problem. A schema cannot be written to an archived endpoint (`409`); restore the endpoint first.

### Submissions

| Filter | Values |
|---|---|
| `endpoint` | An endpoint id. Another workspace's endpoint is a `404`, so a typo is distinguishable from an empty result |
| `origin` | `human`, `agent`, `unverified` |
| `verdict` | `won`, `lost`, `disqualified`, `awaiting` |
| `spam` | `clear`, `flagged`, `not_spam`, `confirmed_spam` |
| `from` | On or after. Either `YYYY-MM-DD` (UTC) or an ISO 8601 timestamp |
| `to` | Before a timestamp, or through the end of a date |
| `q` | Case-insensitive search over the submitted values and the submission id. `%` and `_` are literal |

A list filter accepts several values, comma separated (`verdict=won,lost`) or repeated (`verdict=won&verdict=lost`). Filters combine with AND.

**Pagination is by cursor.** `limit` defaults to 50 and is at most 200. Pass `next_cursor` back as `cursor` to get the next page; it is `null` on the last page. The cursor holds the last row's timestamp, at microsecond precision, and its id. A walk therefore moves steadily into older rows and never repeats or skips one that existed when it started, including rows that share a timestamp. A submission that arrives during the walk is newer than the cursor, so it does not appear; start again from the first page to see it. The inbox in the app still pages by number.

**Export** produces the same file the inbox's Export button downloads, and the CSV and JSON formats share one implementation (`src/lib/workspaces/export-format.ts`). `format` is `csv` (the default) or `json`, and the filters are the ones above. The export is capped at 10,000 rows. `X-Export-Row-Count` gives the number of rows, and `X-Export-Truncated: true` appears when the cap was hit.

**Files.** `GET /submissions/{id}` lists the submission's attachments. Each entry has a signed `download_url`, valid for a week or until the file's retention ends. Only files recorded against that submission are ever signed. A file-shaped object inside the submitted values is just data, and is never treated as proof of a file.

**Delete** is a soft delete. The submission disappears from the inbox, every export, this API and Yield. Outcome posts stop matching it, and links to its attachments stop working. The API has no undelete.

### Destinations and deliveries

`GET /endpoints/{id}/destinations` lists where an endpoint delivers its submissions, along with each destination's health. **Configuration is never returned**, not even redacted, because a webhook URL can carry a token. Use `GET /submissions/{id}/deliveries`, or the `deliveries` field of a submission, for one lead's delivery history.

### The OpenAPI document

`GET /api/v1/openapi.json` is public and is an OpenAPI 3.1 document. Each operation carries `x-required-scope`. `tests/api-openapi.test.mts` fails if an operation is missing from the document, if the document names one that does not exist, or if a documented path has no route file.

---

## MCP — the account server

The account server ([`docs/32`](./32-agent-onboarding.md)) gained these tools, all backed by the same core:

| Tool | Scope | Notes |
|---|---|---|
| `get_endpoint(endpoint_id)` | `endpoints:read` | |
| `update_endpoint(endpoint_id, name?, archived?, confirm?)` | `endpoints:write` | Archiving needs `confirm: true` |
| `delete_endpoint(endpoint_id, confirm?)` | `endpoints:write` | Archives; needs `confirm: true` |
| `get_form_schema(endpoint_id)` | `endpoints:read` | |
| `update_form_schema(endpoint_id, document, mode?, activate?, confirm?)` | `endpoints:write` | Publishing in `strict` mode needs `confirm: true` |
| `list_submissions(filters…, cursor?, limit?)` | `submissions:read` | Same filters as REST, with `endpoint_id` |
| `get_submission(submission_id)` | `submissions:read` | |
| `export_submissions(filters…, format?)` | `submissions:read` | Inline; refused above 1 MB of text (`export_too_large`) |

**Destructive tools ask first.** Called without `"confirm": true`, these tools change nothing. They return `confirmation_required` with a sentence saying exactly what would happen, which the agent relays to the person. Only `confirm === true` goes ahead; `"yes"` does not count. The preview needs the same write scope as the change.

Error codes keep the names they had in #128: a missing scope is `unauthorized`, and bad input is `invalid_arguments`.

---

## CLI — `endpointforms`

The package lives in `packages/cli`. It has no runtime dependencies and needs Node 20 or later. Full usage is in [`packages/cli/README.md`](../packages/cli/README.md).

```sh
npx endpointforms login                       # code by email, or --key efv2…
npx endpointforms endpoints ls
npx endpointforms submissions ls --verdict awaiting --all --json
npx endpointforms submissions export --format csv --output leads.csv
npx endpointforms form get <endpoint-id> > schema.json
npx endpointforms form set <endpoint-id> schema.json --draft
```

- **`--json` works on every command.** With it, usage, API and file errors also go to stderr as one JSON line, `{"ok":false,"error":{"code","message"}}`.
- **Exit codes:** `0` for ok, `2` for a usage mistake, and `1` for anything else: the API refused, the network failed, a file could not be read or written, or an unexpected error.
- **Text from submissions is shown, not obeyed.** Control characters in values and in error messages are escaped on the terminal, so a submitted escape sequence cannot act on it. A piped export is passed through byte for byte.
- **Key storage:** the key is saved to `~/.config/endpointforms/config.json` with mode 0600. `ENDPOINTFORMS_API_KEY` overrides it.
- **Transport:** the key is sent over https only. Plain http is allowed for localhost alone.
- **Self-hosted installs:** pass `--api-url`, or set `ENDPOINTFORMS_API_URL`.

---

## Decisions made while building it

- **No new key system.** These surfaces use the `efv2` keys and the owner rule from #128.
- **Endpoint "delete" archives.** The data model has no other delete, and "I deleted the endpoint and lost the leads" is the support disaster the soft delete exists to prevent.
- **Submission delete is soft.** That matches every other delete in the schema. A hard-delete or erasure path, for data-subject requests, is a possible follow-up.
- **Form writes are recorded with `source: "file"`.** That is the producer `src/lib/schema/store.ts` already named for a CLI.
- **The CLI's `login` uses the email-code flow** rather than asking for a key from settings, because settings keys are outcome-only.
