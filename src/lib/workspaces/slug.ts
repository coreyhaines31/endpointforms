/**
 * Workspace slugs.
 *
 * A slug is not a display name that happens to be URL-safe. It becomes the
 * render subdomain — `acme.<render-domain>` (docs/05 §4.4) — which means it is
 * public, it ends up inside `<form action>` attributes on our customers'
 * websites, and changing it breaks every embedded form they have shipped. Treat
 * it as permanent.
 *
 * Two things follow from that, and both are enforced here rather than in a form
 * component, so they hold for a server action, a CLI, and a seed alike:
 *
 * 1. **The format is a DNS label**, not a URL slug. Lowercase letters, digits
 *    and hyphens; no leading or trailing hyphen; 3–63 characters. 63 is the
 *    hard limit on a single DNS label, so anything longer cannot be a subdomain
 *    at all.
 * 2. **A reserved list**, because the first customer to claim `www` or `api`
 *    takes a hostname we need forever and cannot get back without breaking them.
 *
 * Pure and dependency-free, so `tests/workspace-slug.test.mjs` can exercise every
 * branch without a database or a Next runtime.
 */

/**
 * The registrable domain a workspace's forms are served from (docs/05 §4.4).
 *
 * Deliberately **not** a subdomain of the marketing site: our apex carries ad
 * pixels, and customer form traffic must never share a cookie domain with our
 * analytics vendor. Overridable so a preview deployment can show its own.
 */
export const RENDER_DOMAIN = process.env.NEXT_PUBLIC_RENDER_DOMAIN ?? "endpointforms.app";

/** DNS label rules, plus a 3-character floor so slugs stay recognisable. */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 63;

/**
 * Hostnames we must be able to use, and hostnames that would be confusing or
 * dangerous in a customer's hands. Cheap to add to now, impossible to reclaim
 * later — so this list is deliberately generous.
 *
 * The first group is `docs/05-site-architecture.md` §4.3's reserved root paths.
 * `.well-known` and `_next` cannot pass the format check anyway; they are listed
 * so that a reader comparing this against §4.3 finds the whole list rather than
 * wondering what was dropped.
 */
const RESERVED = [
  // docs/05 §4.3 — the reserved root paths, as hostnames.
  "api",
  "app",
  "login",
  "signup",
  "logout",
  "dashboard",
  "f",
  "r",
  "embed",
  "next",
  "_next",
  "well-known",

  // Infrastructure hostnames. Handing any of these out breaks mail, TLS
  // issuance or DNS for the render domain itself.
  "www",
  "mail",
  "smtp",
  "imap",
  "pop",
  "mx",
  "ns",
  "ns1",
  "ns2",
  "dns",
  "ftp",
  "cdn",
  "static",
  "assets",
  "img",
  "images",
  "media",
  "files",
  "autoconfig",
  "autodiscover",
  "localhost",

  // Addresses a person or a certificate authority may reasonably expect to
  // reach us at. RFC 2142 plus the usual suspects.
  "admin",
  "administrator",
  "root",
  "postmaster",
  "hostmaster",
  "webmaster",
  "abuse",
  "security",
  "noc",
  "support",
  "help",
  "helpdesk",
  "contact",
  "sales",
  "billing",
  "legal",
  "privacy",
  "terms",

  // Our own surfaces, present and planned. A customer workspace answering on
  // `status` or `docs` is a support incident and possibly a phishing vector.
  "status",
  "docs",
  "doc",
  "blog",
  "news",
  "press",
  "about",
  "careers",
  "jobs",
  "partners",
  "affiliates",
  "community",
  "forum",
  "account",
  "accounts",
  "auth",
  "oauth",
  "sso",
  "identity",
  "id",
  "me",
  "my",
  "console",
  "portal",
  "panel",
  "internal",
  "metrics",
  "analytics",
  "webhook",
  "webhooks",
  "graphql",
  "mcp",
  "manifest",
  "e",
  "go",
  "link",
  "download",
  "downloads",

  // Environments. These get pointed at things by whoever is deploying, and a
  // customer workspace sitting on one is a live-traffic accident waiting.
  "dev",
  "test",
  "testing",
  "stage",
  "staging",
  "preview",
  "prod",
  "production",
  "demo",
  "sandbox",
  "beta",
  "alpha",

  // Words that read as an error rather than a tenant.
  "null",
  "undefined",
  "none",
  "true",
  "false",
  "new",
  "edit",
  "delete",
  "settings",
  "invitations",
  "endpointforms",
  "endpoint",
  "endpoints",
] as const;

export const RESERVED_SLUGS: ReadonlySet<string> = new Set(RESERVED);

/** One message per failure mode. These are shown to people, so no regex leaks out. */
export const SLUG_MESSAGES = {
  empty: "Choose a workspace URL.",
  tooShort: `Workspace URLs are at least ${SLUG_MIN_LENGTH} characters.`,
  tooLong: `Workspace URLs are at most ${SLUG_MAX_LENGTH} characters.`,
  format:
    "Use lowercase letters, numbers and hyphens only, starting and ending with a letter or number.",
  punycode: "Workspace URLs can’t start with “xn--”.",
  reserved: "That one is reserved. Try another.",
  taken: "That workspace URL is already taken.",
} as const;

export type SlugDecision =
  | { ok: true; slug: string }
  | { ok: false; message: string };

/**
 * Validates a slug someone typed.
 *
 * Trims and lowercases first — a pasted "Acme " should become `acme` rather than
 * an error, because rejecting it teaches nothing. Everything after that is a
 * real problem and gets a specific message.
 */
export function validateWorkspaceSlug(input: unknown): SlugDecision {
  const slug = String(input ?? "")
    .trim()
    .toLowerCase();

  if (slug.length === 0) return { ok: false, message: SLUG_MESSAGES.empty };
  if (slug.length < SLUG_MIN_LENGTH) return { ok: false, message: SLUG_MESSAGES.tooShort };
  if (slug.length > SLUG_MAX_LENGTH) return { ok: false, message: SLUG_MESSAGES.tooLong };
  if (!SLUG_PATTERN.test(slug)) return { ok: false, message: SLUG_MESSAGES.format };

  // `xn--` marks an internationalised domain label. A slug starting with it
  // would be resolved as punycode by browsers and TLS tooling and render as
  // something other than what was typed — a ready-made homograph.
  if (slug.startsWith("xn--")) return { ok: false, message: SLUG_MESSAGES.punycode };

  if (RESERVED_SLUGS.has(slug)) return { ok: false, message: SLUG_MESSAGES.reserved };

  return { ok: true, slug };
}

/**
 * A first suggestion from a workspace name, for the create form.
 *
 * Best-effort only: the result still goes through `validateWorkspaceSlug`, and
 * a name like "A&B" legitimately produces nothing usable. Returning "" and
 * letting the person type is better than inventing `workspace-7f3a` and having
 * them discover their permanent public hostname is a serial number.
 */
export function suggestSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");

  return validateWorkspaceSlug(slug).ok ? slug : "";
}
