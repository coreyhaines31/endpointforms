import { trustedClientIp } from "../net/client-ip.ts";
import { createHash } from "node:crypto";

import { checkRateLimit, resetRateLimits } from "../ingest/rate-limit.ts";
import type { RateLimitConfig } from "../ingest/limits.ts";

/**
 * Throttling sign-in attempts.
 *
 * ## Why this reuses the ingest limiter
 *
 * `src/lib/ingest/rate-limit.ts` already implements exactly the shape this
 * needs: three fixed windows — a primary key, a client, and the pair — all
 * counted on every call so a blocked client cannot reset its own budget by being
 * blocked. Writing a second one would mean two implementations of the same
 * subtle counting rule, and the second would be the one nobody tested. Its
 * honest limitation is stated in that file and applies here too: the counters
 * are per-instance, so this is a blunt guard rather than a quota. #31 is where a
 * shared counter gets designed.
 *
 * The one thing that had to change is the **keyspace**. That module keys its
 * client window on `i:<ipHash>` alone, with no notion of which subsystem is
 * asking. Handed the ingest IP hash, sign-in attempts and form submissions would
 * share one budget — an office submitting forms all morning would lock its own
 * people out of the dashboard, and, far worse, a login flood would spend the
 * budget that stops a form being hammered. Leads are the thing this product
 * exists not to drop.
 *
 * So the IP hash here is prefixed `auth:` and salted separately, which puts it
 * in a disjoint keyspace from `sha256:…` no matter what either salt is set to,
 * and the primary key is prefixed `auth:` too. Two subsystems, two sets of
 * counters, one implementation.
 *
 * No `server-only` marker and no `@/` alias — see the note in `./password.ts`.
 */

/**
 * Fifteen minutes rather than the ingest module's minute.
 *
 * A form is submitted once; a sign-in is retried. The window has to be long
 * enough that ten wrong guesses actually costs an attacker something, and short
 * enough that someone who genuinely mistyped their password four times is not
 * locked out over lunch.
 */
const WINDOW_MS = 15 * 60_000;

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    console.warn(`[auth] ${name}=${JSON.stringify(raw)} is not a positive integer; using ${fallback}`);
    return fallback;
  }
  return value;
}

/**
 * Per fifteen minutes:
 *
 *   - `email` — one account being guessed at, from anywhere. This is the one
 *     that matters: credential stuffing rotates addresses through a botnet, so
 *     the per-IP ceiling never fires, but each account still only gets ten.
 *   - `ip`    — one client working through a list of addresses. Looser, because
 *     a whole office behind one NAT is a real thing on a Monday morning.
 *   - `emailIp` — the ordinary case, one person and one account.
 */
export function authRateLimitConfig(): RateLimitConfig {
  return {
    windowMs: WINDOW_MS,
    endpoint: positiveInt("AUTH_RATE_LIMIT_EMAIL_PER_WINDOW", 10),
    ip: positiveInt("AUTH_RATE_LIMIT_IP_PER_WINDOW", 50),
    endpointIp: positiveInt("AUTH_RATE_LIMIT_EMAIL_IP_PER_WINDOW", 10),
  };
}

/**
 * In header order of trust, matching `src/lib/ingest/client.ts`. Only as
 * trustworthy as the proxy in front of us, which is why this decides how often
 * someone may *try* and never whether they get in.
 */
const DEFAULT_SALT = "endpointforms-auth-ip-hash-v1";

export function clientIpFromHeaders(headers: Headers): string | null {
  return trustedClientIp(headers);
}

/**
 * `auth:sha256:<hex>` of a salted IP. The prefix is load-bearing — see the
 * keyspace note above — and the raw IP is never held, only counted against.
 */
export function hashIpForAuth(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.AUTH_IP_SALT ?? process.env.SUBMISSION_IP_SALT ?? DEFAULT_SALT;
  return `auth:sha256:${createHash("sha256").update(`${salt}:${ip}`).digest("hex")}`;
}

export type SignInThrottle = { allowed: boolean; retryAfterSeconds: number };

/**
 * Counts one sign-in attempt and says whether it may proceed.
 *
 * Called from `authorize()` in `src/auth.ts` rather than from the Server Action,
 * so a script posting straight at `/api/auth/callback/password` is counted the
 * same as the form. The email is lower-cased first, or `Alice@` and `alice@`
 * would be two budgets for one account.
 */
export function checkSignInRateLimit(
  email: string,
  ipHash: string | null,
  config: RateLimitConfig = authRateLimitConfig(),
  now: number = Date.now(),
): SignInThrottle {
  const decision = checkRateLimit(`auth:${email.trim().toLowerCase()}`, ipHash, config, now);
  return {
    allowed: decision.allowed,
    retryAfterSeconds: decision.retryAfter ?? Math.ceil(config.windowMs / 1000),
  };
}

/** Test seam. Clears the shared window map; nothing in the request path calls it. */
export { resetRateLimits as resetAuthRateLimits };
