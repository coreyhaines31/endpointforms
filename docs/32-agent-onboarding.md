# Agent onboarding — sign up, create an endpoint and get a key from inside an AI chat

**Planned and built 2026-11-02.** Issue #128. Depends on #129 (PostShiba mail).

## The goal

Someone in Claude, ChatGPT or Cursor says "I need a contact form endpoint for acme.com". A minute
later they have an account, a workspace, a live endpoint, the snippet to paste, and an API key,
and they never opened a browser tab. Or their agent did all of it for them.

That is the Formspree-style experience. What changes for us is the buyer: Endpoint is sold to
businesses, so the account an agent creates is a business account. That means a workspace named
after the company, owner-only keys with scopes and an audit trail, and no second workspace for
someone who already belongs to their company's.

## The flow

```
User:  "Set me up with an Endpoint form for acme.com, send leads to me."

Agent → start_signup({ email: "dana@acme.com" })
      ← { status: "code_sent", expires_in_seconds: 600 }
Agent: "I've sent a 6-digit code to dana@acme.com — what is it?"
User:  "418 203"
Agent → verify_signup({ email: "dana@acme.com", code: "418 203", company_name: "Acme" })
      ← { workspace: { slug: "acme", … }, api_key: "efv2.…" (shown once), scopes: [...] }
Agent → create_endpoint({ name: "Contact" })            Authorization: Bearer efv2.…
      ← { endpoint: { submit_url, manifest_url, … }, snippet: { html, curl }, notifies }
Agent: "Done. Paste this into your site: <form action=…>"
```

The only step outside the conversation is reading the code, and that same step proves the inbox
belongs to the person in the chat.

## What was built

### The account MCP server — `POST /api/mcp`

`src/lib/account/mcp.ts`, routed from `src/app/api/mcp/route.ts`. `/api/*` answers on every host
(`src/lib/hosts.ts`); the canonical address is `https://app.endpointforms.com/api/mcp`. It is
stateless JSON-RPC over HTTP, the same transport as the per-endpoint Manifest server
(`docs/25`), which lets an agent *fill in* a form; this one lets an agent *set one up*.

| Tool | Auth | Does |
|---|---|---|
| `start_signup(email)` | none | Emails a 6-digit code. The same reply for new and existing addresses |
| `verify_signup(email, code, company_name?, workspace?, client_name?)` | none | Signs in or creates the account; creates a workspace if it owns none; returns a key with every scope, once |
| `whoami` | key | The key's workspace and scopes |
| `list_endpoints` | `endpoints:read` | Endpoints with their submit URLs |
| `create_endpoint(name)` | `endpoints:write` | A new endpoint, the HTML to paste, and an owner notification |
| `get_install_snippet(endpoint_id)` | `endpoints:read` | HTML, curl test, Manifest URL |
| `create_api_key(label, scopes?)` | `keys:write` | Another key, by default `outcomes:write` only — for a CRM |

Errors are tool results with `isError: true` and a sentence the agent can repeat to the person,
not bare JSON-RPC errors. That is the same convention as Manifest.

### Keys gained scopes

The existing `efv2` keys (`verdict_api_keys`) gained `scopes`, `created_via` (`settings` or
`mcp`) and `client_name`. The column default is `{outcomes:write}`, so every key that existed
before is exactly what it was. The outcome API now requires `outcomes:write`
(`src/lib/verdict/auth.ts`), so a read-only agent key cannot record outcomes. Settings shows
agent-created keys with an **Agent** badge and lists their scopes.

A key can only mint keys with scopes it holds itself, so `keys:write` is not a ladder. Legacy
`efv1` keys are refused on the account server: they have no row to carry scopes and are being
retired.

### Sign-in codes — `src/lib/auth/email-code.ts`

These are shared by the MCP server and by `/login`, where "Email me a code" sits under the
password form. See `docs/22` for the rules. In short: an HMAC keyed on `AUTH_SECRET`, 10 minutes,
single use, five guesses, three codes an hour per address. A correct code creates the account if
there is none, and marks the address verified.

## Decisions

**Verify before anything exists.** Nothing is created until the code checks out: no user, no
workspace, no endpoint, no email to anyone but the address that asked. If unverified endpoints
could collect, anyone could make one that emails any address, which would turn our notification
mail into a harassment relay.

**A code, not a magic link.** A link opens a browser and the session lands there. A code keeps the
session where the agent is.

**Notifications go to the verified address, never to an argument.** `create_endpoint` takes no
email. Leads go to whoever minted the key, because an address in a tool argument is whatever the
agent was told.

**Members who are not owners get no key, and no second workspace.** Someone who belongs to their
company's workspace as a member is told to ask an owner. Creating them a workspace of their own is
how one company ends up with five.

**An owner of several workspaces names one.** Without a `workspace` argument, the code is spent
and the reply lists the workspaces; the agent asks a fresh code. That costs a rare user one more
email. The alternative was a continuation token with its own expiry and its own theft story.

**Personal email is allowed.** `dana@gmail.com` gets "Dana's workspace" when no company name is
given, not "Gmail". Agencies and freelancers are part of the ICP. *(The plan said to flag these
workspaces. That was not built: nothing reads the flag yet, so it would be a column waiting for a
reason.)*

**The key will sit in a chat transcript.** That comes with this experience. Scopes, the Agent
badge and per-key revocation limit the damage.

**Dropped from the plan:** a cap of five workspaces per user. `verify_signup` only ever creates a
workspace for an account that owns none, so there was nothing for a cap to limit.

## Abuse limits

| | |
|---|---|
| Codes | HMAC-stored, 10-minute expiry, single use, 5 wrong tries burns the code, a newer code retires the older |
| `start_signup` | 3 per address per hour, 20 per IP per hour |
| Whole server | 60 requests per IP per minute |
| Enumeration | Same reply for new and existing addresses, and both are sent a code |

The rate limits are in memory per server instance, like the ingest and password limits. The
attempt cap is in the database.

## Verification

`tests/account-mcp.test.mts` (`npm run test:account:db`, part of `test:db`) drives the server
with JSON-RPC and no browser, reading codes from a mail sink: 62 assertions covering the whole
flow, scopes, tenant isolation, returning accounts, members, enumeration, guessing, rate limits and
mail failure. Every "must not work" assertion has a positive control beside it. Three guards were
removed one at a time (the outcome scope check, the attempt cap, the `endpoints:write` check), and
each made exactly its own test fail.

The flow was also run against a dev server over HTTP: sign up, verify, create an endpoint, POST a
submission, then sign in to `/login` in a browser with a code as the account the agent created.

## Follow-ups

1. **Company-domain matching.** When `dana@acme.com` signs up and an `acme.com` workspace allows
   domain join, offer `request_access` instead of a new workspace.
2. **OAuth 2.1** for Claude.ai and ChatGPT connectors, which expect it. That path opens one
   consent window, so the email code stays the no-browser route.
3. **Submission and outcome tools** on the account server: `list_submissions`, `record_outcome`.
4. **Copy.** Do not claim "set it up from your AI chat" publicly until it has been run end to end
   from a real chat client against production.
