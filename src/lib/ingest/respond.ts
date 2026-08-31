import type { IngestErrorCode } from "./errors.ts";

/**
 * How the endpoint answers.
 *
 * The contract in one line: **answer in the shape you were asked in.** A
 * browser that navigated here gets a redirect it can land on; a `fetch()` gets
 * JSON it can read. Everything in this file exists to make one of those two
 * true without the caller configuring anything.
 */

/**
 * CORS, permissively — and deliberately so.
 *
 * The whole premise of #50 is that a form on *someone else's* origin posts here.
 * There is no cookie, no session and no `Access-Control-Allow-Credentials` on
 * this route, so a wildcard grants an attacker nothing they could not get with
 * `curl`. Locking it to a per-endpoint origin allowlist is a real feature, but
 * it is a setting someone opts into, not a default that silently breaks the
 * first form a customer points at us.
 *
 * The origin is reflected rather than starred so that adding that allowlist
 * later is a change to one function.
 */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const requestedHeaders = request.headers.get("access-control-request-headers");

  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers":
      requestedHeaders ?? "content-type, accept, idempotency-key, x-idempotency-key",
    // So a JS client can read Retry-After off a 429 instead of guessing.
    "access-control-expose-headers": "retry-after",
    "access-control-max-age": "86400",
    // Reflecting the origin makes the response origin-dependent.
    vary: "Origin",
  };
}

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate",
} as const;

export function preflightResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: { ...corsHeaders(request) } });
}

export type SubmissionAck = {
  ok: true;
  id: string;
  endpoint: string;
  submittedAt: string;
  /** True when an existing submission was returned instead of a new one. */
  duplicate: boolean;
};

export function jsonResponse(
  request: Request,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...NO_STORE,
      ...corsHeaders(request),
      ...extraHeaders,
    },
  });
}

export function errorJson(
  request: Request,
  status: number,
  code: IngestErrorCode,
  message: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse(request, status, { ok: false, error: { code, message } }, extraHeaders);
}

/**
 * The same refusal, for a browser window.
 *
 * A visitor who hit a broken form should see a sentence, not a JSON blob. It is
 * deliberately a bare, dependency-free page: this route must keep working if
 * every other part of the app is broken.
 */
export function errorHtml(
  request: Request,
  status: number,
  code: IngestErrorCode,
  message: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>This form could not be submitted</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem;
         font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         color: #1c1c1c; background: #faf9f7; }
  main { max-width: 34rem; }
  h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
  p { margin: 0 0 0.75rem; }
  code { font-size: 0.875em; color: #6b6b6b; }
</style>
</head>
<body>
<main>
<h1>This form could not be submitted</h1>
<p>${escapeHtml(message)}</p>
<p><code>${escapeHtml(code)}</code></p>
</main>
</body>
</html>`;

  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...NO_STORE,
      ...corsHeaders(request),
      ...extraHeaders,
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 303 rather than 302, so the browser follows with GET and a refresh cannot repost. */
export function redirectResponse(request: Request, location: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location,
      ...NO_STORE,
      ...corsHeaders(request),
    },
  });
}

// ---------------------------------------------------------------------------
// Where a browser lands afterwards
// ---------------------------------------------------------------------------

/** Field names a form can use to name its own thank-you page. `_next` is Formspree's. */
export const REDIRECT_FIELD_KEYS = ["_redirect", "_next"] as const;

/**
 * Decides where to send a browser after a successful post.
 *
 * The open-redirect question, and why the rule below is the right one:
 *
 * This route only redirects on **POST**. An attacker cannot make someone POST
 * by getting them to click a link — they need a form on a page they control,
 * and a cross-origin form post carries an `Origin` header naming that page. So
 * requiring the redirect host to match `Origin` (or `Referer`) closes the
 * realistic attack while leaving the ordinary case — a form on `acme.com`
 * redirecting to `acme.com/thanks` — completely untouched.
 *
 * When neither header is present there is no browser navigation to hijack, so
 * an absolute target is allowed. Relative targets are always allowed and
 * resolve against this endpoint's own origin.
 *
 * A rejected target is not an error. The submission is already stored; sending
 * the visitor to the default page is strictly better than showing them a
 * failure for a form that in fact worked.
 */
export function resolveRedirect(request: Request, requested: string | null): string {
  const fallback = defaultThanksUrl(request);
  if (!requested) return fallback;

  // A header-splitting attempt, or a value mangled in transit.
  if (/[\r\n]/.test(requested)) return fallback;

  const trimmed = requested.trim();
  if (trimmed === "") return fallback;

  // Protocol-relative `//evil.example` would otherwise resolve to a foreign host.
  if (trimmed.startsWith("//")) return fallback;

  let target: URL;
  try {
    target = new URL(trimmed, request.url);
  } catch {
    return fallback;
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") return fallback;

  const here = safeHost(request.url);
  if (target.host === here) return target.toString();

  const claimed = safeHost(request.headers.get("origin")) ?? safeHost(request.headers.get("referer"));
  if (claimed && target.host !== claimed) return fallback;

  return target.toString();
}

function safeHost(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

/**
 * The page a visitor lands on when the form did not name one.
 *
 * `ENDPOINT_DEFAULT_THANKS_URL` overrides it, because the render domain (#26)
 * will not necessarily serve `/thanks`.
 */
export function defaultThanksUrl(request: Request): string {
  const configured = process.env.ENDPOINT_DEFAULT_THANKS_URL;
  try {
    return new URL(configured || "/thanks", request.url).toString();
  } catch {
    return new URL("/thanks", request.url).toString();
  }
}
