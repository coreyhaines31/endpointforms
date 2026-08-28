/** One place for the handful of URLs that appear on more than one page. */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://endpointforms.com";

export const GITHUB_REPO = "coreyhaines31/endpointforms";
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues`;
export const GITHUB_LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;

/**
 * The argument essay lives at a root slug, not under /blog.
 * Keyword research (docs/04 §8) confirmed Risk 9: the primary message has no
 * search demand, so the slug is argument-bearing rather than keyword-bearing
 * (docs/05 §11, marker 1).
 */
export const ARGUMENT_PATH = "/the-dishonest-dashboard";

/** Every route that is indexable, in nav order. Feeds sitemap-marketing.xml. */
export const MARKETING_ROUTES = [
  "/",
  ARGUMENT_PATH,
  "/open-source",
  "/about",
  "/privacy",
  "/terms",
] as const;
