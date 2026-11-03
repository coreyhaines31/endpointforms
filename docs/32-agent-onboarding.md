# Agent onboarding — sign up, create an endpoint and get a key from inside an AI chat

**Written 2026-11-02.** Issue #128. Status: **plan, not built.**

## The goal

Someone in Claude, ChatGPT or Cursor says "I need a contact form endpoint for acme.com". Ninety
seconds later they have an account, a workspace, a live endpoint, the snippet to paste, and an API
key, and they never opened a browser tab. Or their agent did all of it for them.

That is the Formspree-style experience. What changes for us is the buyer: Endpoint is sold to
businesses, so the account an agent creates has to be a business account. That means a work email,
a company workspace that teammates can join, scoped keys with an audit trail, and no dead-end
personal accounts that someone has to merge later.

## Where we are today

| Capability | State | From an AI chat? |
|---|---|---|
| Submit to a form | Built — `POST /e/{id}/mcp` (#32) | Yes, stamped `agent` |
| Create an account | `/signup`, email + password, browser | No |
| Create a workspace / endpoint | Server Actions behind a session cookie | No |
| API keys | `efv2.*`, outcome API only, minted in settings UI | No |
| Management API, CLI, account-level MCP | Do not exist | — |

Agents can fill in a form. They cannot set one up.

## The prerequisite: mail

**`RESEND_API_KEY` is not set in production** (checked with `vercel env ls production`, 2026-11-02).
`src/lib/destinations/mail.ts` already sends through Resend and refuses honestly when it is
unconfigured, but with no key nothing can be delivered. That blocks the whole flow, because the
only way to verify a person without sending them to a browser is a code they read out of their
inbox and type back into the chat.

It also blocks password reset, which doc 22 still lists as owed for the same reason. Setting the
key and verifying the `MAIL_FROM` domain is step zero, and it is worth doing on its own.

## The flow

```
User:  "Set me up with an Endpoint form for acme.com, send leads to me."

Agent → start_signup({ work_email: "dana@acme.com", company_name: "Acme" })
      ← { status: "code_sent", expires_in: 600 }
Agent: "I've sent a 6-digit code to dana@acme.com — what is it?"
User:  "418 203"
Agent → verify_signup({ email: "dana@acme.com", code: "418203" })
      ← { workspace: "acme", api_key: "efv2.…" (shown once), scopes: [...] }
Agent → create_endpoint({ name: "Contact", notify: ["dana@acme.com"] })
      ← { endpoint_url, html_snippet, manifest_url }
Agent: "Done. Paste this into your site: <form action=…>"
```

The code is the only time the person has to do anything outside the conversation, and it is the
same step a human signing up by hand would take.

## v1 scope

### 1. An account-level MCP server at `/api/mcp`

`/api/*` already answers on every host (`src/lib/hosts.ts`), so this needs no routing change. The
canonical URL is `https://app.endpointforms.com/api/mcp`. It reuses the JSON-RPC handling from the
per-endpoint Manifest server (`src/lib/manifest/handler.ts`) and is a different server with
different tools.

| Tool | Auth | Does |
|---|---|---|
| `start_signup(work_email, company_name?)` | none | Sends a 6-digit code. The same response whether or not the address already has an account (no enumeration). |
| `verify_signup(email, code)` | none | Creates the user + workspace, or signs into the existing account. Returns a scoped API key, once. |
| `whoami` | key | User, workspace, the key's scopes |
| `create_endpoint(name, notify?, schema?)` | key | Creates an endpoint with owner notification on by default (#64) |
| `get_install_snippet(endpoint_id, style?)` | key | HTML `<form>`, `fetch` example, Manifest URL |
| `list_endpoints` | key | |
| `create_api_key(label, scopes)` | key | Mints another key; cannot grant scopes the caller lacks |

Signing in through an existing account works the same way: `start_signup` with an address that
already has an account sends a code that signs in, and the key it returns is for that user's
workspace.

### 2. Keys gain scopes

Agent-minted keys use the existing `efv2` format and storage (SHA-256 of a 256-bit secret, shown
once, per-key revocation). The table gains a `scopes` column. Existing outcome keys are backfilled
to `["outcomes:write"]`, so nothing in the wild changes behaviour. v1 scopes:
`endpoints:read`, `endpoints:write`, `keys:write`, `outcomes:write`.

Every key records **how it was created** (`settings` or `mcp`) and the MCP client's
self-reported name. Settings lists agent-created keys under a separate heading with one-click
revoke. This is the same idea as provenance: the surface you came in through is the declaration.

### 3. Email-code sign-in on `/login`

`start_signup`/`verify_signup` and a "Email me a code" option on `/login` share one implementation.
An account created from chat has no password, and this is how its owner gets into the web app. It
also gives us password reset almost for free.

## Decisions

**Verify before anything exists.** Nothing is created until the code is verified: no endpoint, no
notification email, no pending workspace. An endpoint that collects before verification would feel
faster, but it would let anyone create an endpoint that emails any address, which turns our
notification mail into a harassment relay. The code costs the user one message.

**A code, not a magic link.** A link opens a browser and the session ends up there, not in the
chat. A code stays where the agent is.

**The key will sit in a chat transcript.** That is inherent to this experience and we accept it.
The mitigations are the scopes, the "created via MCP" label, and revocation that is one click and
per key.

**Personal email is allowed and flagged.** We do not refuse gmail.com. We name the workspace after
the company if one is given, and flag the workspace as having no company domain. Refusing would
lose small agencies and freelancers, who are part of the ICP.

## Abuse limits

- Codes: 6 digits, stored hashed, 10-minute expiry, single use, 5 wrong attempts burn the code.
- `start_signup`: 3 per email per hour, 20 per IP per hour, reusing the ingest limiter in its own
  keyspace, as `src/lib/auth/rate-limit.ts` does.
- Same response and timing for existing and new addresses.
- Workspace creation per verified user is capped (5) so verified accounts cannot mint workspaces in
  bulk.

## Follow-ups (not v1)

1. **Company-domain matching.** When `dana@acme.com` signs up and an `acme.com` workspace exists
   with domain-join enabled, return `workspace_exists` with a `request_access` tool instead of
   creating a duplicate. Admins approve, reusing invitations. This is the most "for businesses"
   feature on the list and the first follow-up.
2. **OAuth 2.1 for remote connectors.** Claude.ai and ChatGPT connectors expect OAuth. That path
   opens one consent window, so the email code stays the zero-browser route.
3. **Submissions and outcomes tools** on the account MCP: `list_submissions`, `record_outcome`.
4. **Marketing copy.** Do not claim "agent signup" publicly until the flow is live and has been
   demonstrated end to end from a real chat client.

## How we will know it works

An e2e test drives the MCP server with no browser: `start_signup`, read the code from the test mail
sink, `verify_signup`, `create_endpoint`, POST to the endpoint, then assert the submission exists.
Per the project rules, the absence assertions (no enumeration, no unverified creation) must each
be shown to go red when the guard is removed.
