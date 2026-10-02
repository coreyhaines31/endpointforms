import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { classifyStatus, classifyTransportError, transportDetail } from "./retry.ts";
import type { FailureKind } from "./types.ts";

/**
 * Google OAuth, for the Google Sheets destination (#67).
 *
 * The first destination whose credential expires. Slack and webhooks hold a
 * secret that works until somebody deletes it; this one holds a **refresh
 * token**, which Google can invalidate for reasons nobody on our side chose —
 * the customer revokes access, changes their password, or the OAuth client is
 * still in Google's "Testing" status, where every refresh token dies after
 * seven days. Each of those has to land as a `revoked` failure and the
 * `disconnected` health state, never as deliveries that quietly stop.
 *
 * ## Why an OAuth client and not a service account
 *
 * A service account ("share your sheet with sheets-bot@…") has no token to
 * expire, which is tempting. It was not chosen because it puts the step most
 * likely to be got wrong — sharing a document with a robot's email address —
 * on the base-tier customer the issue is about, and because sharing is
 * invisible from our side until the first delivery fails. OAuth asks the person
 * once, on Google's own screen, and we can check the account can open the
 * sheet before the destination exists. A self-hoster who prefers a service account has a
 * small change to make here and in `refreshAccessToken`, and nothing else in
 * the delivery engine would notice.
 *
 * ## What is stored
 *
 * The refresh token, in `destinations.config`, beside every other destination
 * secret and under the same rule: `redactConfig` never returns it, and the
 * delivery log never contains it. The access token is **not** stored. It is
 * minted at the start of each delivery and thrown away, which costs one extra
 * request per lead and buys an adapter that never has to write back to the
 * database — the delivery engine's adapters are pure functions of their
 * config, and a token cache would be the first one that was not.
 *
 * ## Scope
 *
 * `spreadsheets`, which is read/write on every sheet the person can edit.
 * Narrower is `drive.file`, which only reaches files the person picks through
 * Google's Picker widget — but the whole pitch is "keep the sheet you already
 * have", and the Picker needs a browser API key and a client-side script we do
 * not otherwise load. Changing it is the constant below plus the Picker.
 */

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
/** `email` so the screen can say which Google account a destination is connected as. */
export const GOOGLE_SCOPES = ["openid", "email", SHEETS_SCOPE] as const;

/** The path Google sends the person back to. Must be registered on the client. */
export const GOOGLE_CALLBACK_PATH = "/api/v1/integrations/google-sheets/callback";

const DEFAULT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type GoogleClient = { clientId: string; clientSecret: string };

/**
 * The deployment's OAuth client, or null when there is none.
 *
 * Its own pair of variables rather than reusing `AUTH_GOOGLE_ID`: the sign-in
 * client asks for `email` and nothing else, and adding a sensitive scope to it
 * would put Google sign-in itself behind the verification review that the
 * Sheets scope needs. Two clients in the same Google Cloud project is normal.
 */
export function googleClient(): GoogleClient | null {
  const clientId = (process.env.GOOGLE_SHEETS_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_SHEETS_CLIENT_SECRET ?? "").trim();
  if (clientId === "" || clientSecret === "") return null;
  return { clientId, clientSecret };
}

export function isGoogleSheetsConfigured(): boolean {
  return googleClient() !== null;
}

/**
 * What to say when there is no client. Written for the same two readers as
 * `MAIL_NOT_CONFIGURED` in `./mail.ts`: the fact and the consequence first, true
 * for anyone, and the self-hosting instruction in brackets.
 */
export const GOOGLE_SHEETS_NOT_CONFIGURED =
  "Google Sheets is not switched on for this deployment, so nothing was sent. The submission is still here — turn it on and redeliver from the log and nothing is lost. (Self-hosting? Set GOOGLE_SHEETS_CLIENT_ID and GOOGLE_SHEETS_CLIENT_SECRET.)";

/**
 * Where Google sends the person back to.
 *
 * Derived from the request rather than from `NEXT_PUBLIC_SITE_URL`, because that
 * names the marketing site and is wrong for a preview deployment or a laptop.
 * Trusting the request's host here is safe in a way it is not elsewhere: Google
 * refuses any redirect URI not registered on the client, so a forged host gets
 * an error page from Google rather than a code. `GOOGLE_SHEETS_REDIRECT_URI`
 * overrides it for a deployment behind a proxy that rewrites the host.
 */
export function googleRedirectUri(origin: string): string {
  const configured = (process.env.GOOGLE_SHEETS_REDIRECT_URI ?? "").trim();
  if (configured !== "") return configured;
  return new URL(GOOGLE_CALLBACK_PATH, origin).toString();
}

/**
 * The consent screen URL.
 *
 * `access_type=offline` is what gets a refresh token at all, and
 * `prompt=consent` is what gets one **every time** — without it Google only
 * issues a refresh token on the first grant, so reconnecting a destination
 * whose token was revoked would succeed and store nothing usable.
 */
export function googleAuthUrl(input: {
  client: GoogleClient;
  redirectUri: string;
  state: string;
  loginHint?: string | null;
}): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", input.client.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export type CodeExchange =
  | { ok: true; refreshToken: string; accessToken: string; email: string | null }
  | { ok: false; error: string };

/**
 * Trades the code from the callback for a refresh token.
 *
 * Refuses a grant that does not include the Sheets scope. Google's consent
 * screen lets the person untick individual scopes, and a destination created
 * from a grant without write access would fail on its first lead — the exact
 * moment this product promises is not where you find out.
 */
export async function exchangeCode(input: {
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<CodeExchange> {
  const client = googleClient();
  if (!client) return { ok: false, error: GOOGLE_SHEETS_NOT_CONFIGURED };

  const result = await tokenRequest(
    {
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    },
    input,
  );

  if (!result.ok) {
    return {
      ok: false,
      error: `Google did not accept the sign-in (${result.detail}). Nothing was saved — try connecting again.`,
    };
  }

  const json = result.json;
  const granted = typeof json.scope === "string" ? json.scope.split(" ") : [];
  if (!granted.includes(SHEETS_SCOPE)) {
    return {
      ok: false,
      error:
        "Google connected without permission to edit spreadsheets, so there is nothing we could write with. Connect again and leave the Google Sheets box ticked.",
    };
  }
  if (typeof json.refresh_token !== "string" || json.refresh_token === "") {
    return {
      ok: false,
      error:
        "Google did not hand back a long-lived token, so this connection would stop working within the hour. Nothing was saved — try connecting again.",
    };
  }
  if (typeof json.access_token !== "string") {
    return { ok: false, error: "Google's answer had no access token in it. Nothing was saved." };
  }

  return {
    ok: true,
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
    email: emailFromIdToken(json.id_token),
  };
}

export type AccessTokenResult =
  | { ok: true; accessToken: string }
  | {
      ok: false;
      failure: FailureKind;
      error: string;
      responseStatus: number | null;
      responseBody: string | null;
    };

/**
 * A fresh access token from a stored refresh token.
 *
 * The one place `revoked` is decided. Google answers `400 invalid_grant` for
 * every way a refresh token can die — revoked, expired, password changed,
 * seven-day Testing limit — and that is the answer that has to reach the screen
 * as "reconnect", not as "Google refused the payload". A `400` anything else is
 * our own client being wrong, which is a deployment problem and is said so.
 */
export async function refreshAccessToken(
  refreshToken: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<AccessTokenResult> {
  const client = googleClient();
  if (!client) {
    return {
      ok: false,
      failure: "configuration",
      error: GOOGLE_SHEETS_NOT_CONFIGURED,
      responseStatus: null,
      responseBody: null,
    };
  }

  const result = await tokenRequest(
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    },
    options,
  );

  if (result.ok && typeof result.json.access_token === "string") {
    return { ok: true, accessToken: result.json.access_token };
  }

  if (result.ok || result.status === null) {
    return {
      ok: false,
      failure: result.ok ? "unknown" : result.failure,
      error: result.ok
        ? "Google answered the token refresh without a token in it."
        : `Google could not be reached to refresh the connection (${result.detail}).`,
      responseStatus: result.ok ? 200 : null,
      responseBody: result.ok ? null : result.body,
    };
  }

  const code = typeof result.json.error === "string" ? result.json.error : "";
  if (code === "invalid_grant") {
    return {
      ok: false,
      failure: "revoked",
      error:
        "Google says the connection behind this destination is no longer valid — access was revoked, the account's password changed, or the grant expired.",
      responseStatus: result.status,
      responseBody: result.body,
    };
  }
  if (code === "invalid_client" || code === "unauthorized_client" || result.status === 401) {
    return {
      ok: false,
      failure: "configuration",
      error:
        "Google rejected this deployment's own OAuth client, so no destination using it can deliver. This is not anything you connected. (Self-hosting? Check GOOGLE_SHEETS_CLIENT_ID and GOOGLE_SHEETS_CLIENT_SECRET.)",
      responseStatus: result.status,
      responseBody: result.body,
    };
  }

  return {
    ok: false,
    failure: classifyStatus(result.status),
    error: `Google answered ${result.status} when the connection was refreshed.`,
    responseStatus: result.status,
    responseBody: result.body,
  };
}

type TokenResponse =
  | { ok: true; status: number; json: Record<string, unknown>; body: string | null }
  | {
      ok: false;
      status: number | null;
      json: Record<string, unknown>;
      body: string | null;
      failure: FailureKind;
      detail: string;
    };

/**
 * One POST to the token endpoint.
 *
 * The global `fetch`, not `deliveryFetch`: the host is a constant of ours, not
 * something a customer typed, so there is no SSRF surface to pin against.
 *
 * The body Google sends back on success contains the tokens, so `body` is only
 * kept on failure — the caller must never be handed a success body it might
 * log.
 */
async function tokenRequest(
  params: Record<string, string>,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<TokenResponse> {
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await doFetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      redirect: "manual",
      signal: controller.signal,
    });
    const text = await response.text().catch(() => "");
    const json = parseJsonObject(text);

    if (response.ok) return { ok: true, status: response.status, json, body: null };

    const code = typeof json.error === "string" ? json.error : `HTTP ${response.status}`;
    return {
      ok: false,
      status: response.status,
      json,
      body: text.slice(0, 2_000) || null,
      failure: classifyStatus(response.status),
      detail: code,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      json: {},
      body: null,
      failure: classifyTransportError(error),
      detail: transportDetail(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The `email` claim from an ID token, without verifying the signature.
 *
 * Not verifying is correct here and only here: this token came back on the
 * response to our own TLS request to Google's token endpoint, which is the case
 * Google's documentation names as safe to read directly. It is used for one
 * label on a settings screen and grants nothing.
 */
function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  const [, payload] = idToken.split(".");
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    return typeof claims.email === "string" ? claims.email : null;
  } catch {
    return null;
  }
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// The round trip through Google's consent screen
// ---------------------------------------------------------------------------

/**
 * What the person asked for before they were sent to Google, carried across the
 * redirect.
 *
 * It travels in a **signed, httpOnly cookie**, and the OAuth `state` parameter
 * carries only a random nonce that must match the one inside it. That pairing
 * is what stops the attack OAuth's `state` exists for: somebody completing a
 * Google sign-in with *their* account and getting a victim's browser to land on
 * the callback with their code, which would point the victim's leads at the
 * attacker's spreadsheet. The victim's browser does not hold the attacker's
 * cookie, so the nonce does not match and nothing is created.
 *
 * Nothing in here is trusted for access. The callback still re-checks
 * membership of `slug` against the session, and still addresses the endpoint
 * and destination through workspace-scoped queries — the signature only
 * guarantees these are the values *we* wrote, not that the person may use them.
 */
export type PendingConnection = {
  slug: string;
  endpointPublicId: string;
  /** Set when reconnecting an existing destination rather than adding one. */
  destinationId: string | null;
  name: string;
  spreadsheetId: string;
  /** Empty means "the first tab", resolved at the callback. */
  sheetName: string;
  nonce: string;
  /** Unix milliseconds. */
  expiresAt: number;
};

export const PENDING_COOKIE = "ef_google_sheets_oauth";
/** Long enough to read a consent screen, short enough that a stale tab cannot finish. */
export const PENDING_TTL_MS = 10 * 60_000;

const STATE_VERSION = "ef-gsheets-v1";
const DEV_STATE_SECRET = "endpointforms-google-sheets-dev";

/**
 * `AUTH_SECRET`, which every deployment already sets to sign anybody in. In
 * production without it, nothing is signed and the connection is refused, for
 * the same reason `src/lib/uploads/links.ts` refuses: an unsigned cookie here is
 * one an attacker could write.
 */
function stateSecret(): string | null {
  const configured = (process.env.AUTH_SECRET ?? "").trim();
  if (configured !== "") return configured;
  return process.env.NODE_ENV === "production" ? null : DEV_STATE_SECRET;
}

export function newNonce(): string {
  return randomBytes(18).toString("base64url");
}

export function sealPendingConnection(pending: PendingConnection): string | null {
  const key = stateSecret();
  if (key === null) return null;
  const body = Buffer.from(JSON.stringify(pending), "utf8").toString("base64url");
  return `${body}.${mac(body, key)}`;
}

/**
 * The pending connection, if the cookie is ours, unexpired, and its nonce is the
 * one Google handed back. Null for anything else — the caller says "start
 * again" without saying which check failed.
 */
export function openPendingConnection(
  sealed: string | null | undefined,
  state: string | null | undefined,
  now: Date = new Date(),
): PendingConnection | null {
  const key = stateSecret();
  if (key === null || !sealed || !state) return null;

  const [body, signature] = sealed.split(".");
  if (!body || !signature) return null;
  if (!constantTimeEqual(signature, mac(body, key))) return null;

  let pending: PendingConnection;
  try {
    pending = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PendingConnection;
  } catch {
    return null;
  }

  if (typeof pending.expiresAt !== "number" || pending.expiresAt < now.getTime()) return null;
  if (typeof pending.nonce !== "string" || !constantTimeEqual(pending.nonce, state)) return null;
  return pending;
}

function mac(body: string, key: string): string {
  return createHmac("sha256", key).update(`${STATE_VERSION}\n${body}`).digest("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
