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

/** Primary nav. Four destinations, deliberately — the header is not a sitemap. */
export const PRIMARY_NAV = [
  { href: "/features", label: "Features" },
  { href: "/tools", label: "Free tools" },
  { href: "/spam", label: "Form spam" },
  { href: ARGUMENT_PATH, label: "The argument" },
] as const;

/**
 * Every static indexable route, in sitemap order. The /glossary/[term] and
 * /spam/[method] children are generated from their own data modules rather
 * than listed here, so this stays a hand-maintained list of hand-made pages.
 */
export const MARKETING_ROUTES = [
  "/",
  ARGUMENT_PATH,
  "/features",
  "/features/submission-provenance",
  "/features/agent-forms",
  "/features/lead-outcomes",
  "/features/form-analytics",
  "/features/form-split-testing",
  "/solutions",
  "/solutions/agencies",
  "/solutions/in-house-ppc",
  "/tools",
  "/tools/form-spam-cost-calculator",
  "/tools/cost-per-closed-deal-calculator",
  "/tools/cost-per-usable-response-calculator",
  "/tools/form-drop-off-calculator",
  "/tools/form-field-payback-calculator",
  "/tools/lead-reconciliation-calculator",
  "/tools/outcome-weighted-split-test-calculator",
  "/tools/time-to-outcome-calculator",
  "/spam",
  "/glossary",
  "/open-source",
  "/about",
  "/privacy",
  "/terms",
] as const;

/**
 * Appends the brand to a page title only when the result still fits the ~60
 * characters Google renders. Blindly suffixing "— Endpoint Forms" pushed 15
 * titles past the cut, which spends the truncation on our own name instead of
 * the words someone searched for.
 */
export function pageTitle(subject: string, brand = "Endpoint Forms"): string {
  const withBrand = `${subject} — ${brand}`;
  return withBrand.length <= 60 ? withBrand : subject;
}
