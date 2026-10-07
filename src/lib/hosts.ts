/**
 * Which surface answers on which host (docs/05 §4.4).
 *
 * One deployment serves every hostname, so without this the marketing apex,
 * the app and the render domain are the same site under three names. That
 * defeats the reason the render domain exists: customer-authored form markup
 * would render on the apex, next to our ad pixels, and the signed-in app would
 * answer on the same host as customer forms.
 *
 *   site    endpointforms.com, www.   marketing + docs
 *   app     app.endpointforms.com     the signed-in app and sign-in pages
 *   render  endpointforms.app, *.     hosted forms and the embed script
 *
 * Two kinds of path answer everywhere, on purpose:
 *
 * - `/e/*` and `/api/*` render no customer markup, and a form or waitlist that
 *   already posts to one of our hosts must keep landing. Moving a POST across
 *   origins with a redirect would also change the headers provenance is scored
 *   on.
 * - Static assets, which every surface's pages need.
 *
 * A host that is none of the three — localhost, a preview deployment, a
 * self-hosted install that set none of these variables — serves everything,
 * exactly as before this existed. Routing only ever applies to a request whose
 * host we recognise.
 *
 * Pure and dependency-free, so `tests/hosts.test.mts` can exercise every branch
 * without a Next runtime.
 */

export type HostConfig = {
  /** e.g. `https://endpointforms.com` */
  siteUrl: string;
  /** e.g. `https://app.endpointforms.com` */
  appUrl: string;
  /** e.g. `endpointforms.app` — a registrable domain, no scheme */
  renderDomain: string;
};

export type HostDecision =
  | { action: "serve" }
  | { action: "redirect"; location: string; status: 307 | 308 };

type Surface = "site" | "app" | "render";
type PathClass = "form" | "app" | "anywhere" | "marketing";

const APP_PATHS = ["/app", "/login", "/signup"];

export function decideHost(
  hostHeader: string | null,
  pathname: string,
  search: string,
  config: HostConfig,
): HostDecision {
  const surface = surfaceOf(normaliseHost(hostHeader), config);
  if (!surface) return { action: "serve" };

  const path = classify(pathname);
  if (path === "anywhere") return { action: "serve" };

  const to = (base: string, target = pathname) =>
    ({ action: "redirect", location: `${origin(base)}${target}${search}`, status: 308 }) as const;

  const render = `https://${config.renderDomain}`;

  if (surface === "render") {
    if (path === "form") return { action: "serve" };
    if (path === "app") return to(config.appUrl);
    return to(config.siteUrl);
  }

  if (surface === "app") {
    if (path === "app") return { action: "serve" };
    if (pathname === "/") {
      return { action: "redirect", location: `${origin(config.appUrl)}/app${search}`, status: 307 };
    }
    if (path === "form") return to(render);
    return to(config.siteUrl);
  }

  if (path === "marketing") return { action: "serve" };
  if (path === "app") return to(config.appUrl);
  return to(render);
}

function surfaceOf(host: string | null, config: HostConfig): Surface | null {
  if (!host) return null;

  const site = hostOf(config.siteUrl);
  const app = hostOf(config.appUrl);
  const render = config.renderDomain.toLowerCase();

  // App first: `app.endpointforms.com` must not be read as the site's `www.`
  // sibling, and a render domain could in principle share a suffix with it.
  if (host === app) return "app";
  if (host === render || host.endsWith(`.${render}`)) return "render";
  if (host === site || host === `www.${site}`) return "site";
  return null;
}

function classify(pathname: string): PathClass {
  if (pathname === "/embed.js" || isUnder(pathname, "/f")) return "form";
  if (APP_PATHS.some((prefix) => isUnder(pathname, prefix))) return "app";
  if (isUnder(pathname, "/e") || isUnder(pathname, "/api") || isUnder(pathname, "/_next")) {
    return "anywhere";
  }
  // A file in `public/` or a metadata route like `/robots.txt`. Checked on the
  // last segment only, so a marketing slug with a dot in a parent cannot slip
  // through.
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (last.includes(".")) return "anywhere";
  return "marketing";
}

/** `/f` and `/f/abc`, never `/features`. */
function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Lowercased, port stripped. `Host` may carry either. */
export function normaliseHost(host: string | null): string | null {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/:\d+$/, "").replace(/\.$/, "");
}

/** `https://endpointforms.com/` and `https://endpointforms.com` alike. */
function origin(url: string): string {
  return url.replace(/\/+$/, "");
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}
