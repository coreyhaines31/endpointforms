import type { Metadata } from "next";
import { GITHUB_URL, SITE_URL } from "@/lib/site";
import { FONT_VARIABLES } from "@/lib/fonts";
import "../globals.css";
import { RootShell } from "@/components/root-shell";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

/**
 * The marketing site: every indexable page, plus the sitemap, robots and OG
 * image that describe them.
 *
 * This is one of four root layouts. It carries what only the marketing site
 * needs — IBM Plex, the header and footer, `metadataBase`, the Open Graph
 * defaults and the Organization/WebSite schema — none of which used to be
 * separable from the authenticated app or from a customer's hosted form,
 * because there was a single root at `src/app/layout.tsx`. See
 * `src/components/root-shell.tsx`.
 *
 * The route group keeps every URL exactly where it was: `/about` is still
 * `/about`, not `/site/about`.
 */

export const metadata: Metadata = {
  // Without metadataBase, Next emits relative OG image URLs and every share
  // renders as a bare text card. The homepage is the only distribution surface
  // a pre-launch waitlist has, so this is load-bearing.
  metadataBase: new URL(SITE_URL),
  /*
   * `public/favicon.ico`, declared rather than dropped in `src/app/` as the
   * `favicon.ico` file convention.
   *
   * That convention only resolves at the true app root, and from there it
   * cascades into every root layout — including `(forms)`, where it put 26 KB
   * of our logo on the critical path of a customer's enquiry form and could not
   * be overridden (a root `favicon.ico` and a group's own `icons` both render,
   * and the browser fetches both). Serving the file from `public/` and naming it
   * here keeps `/favicon.ico` at exactly the same URL, keeps the link tag on
   * every surface that wants it, and lets `(forms)` declare its own.
   */
  icons: { icon: "/favicon.ico" },
  title: "Endpoint Forms — the open-source form builder for marketers",
  description:
    "Build high-converting forms for your website and pipe the data wherever you need it. Open source, AGPL, self-hostable, with integrations that fail loudly instead of quietly.",
  openGraph: {
    title: "Endpoint Forms — the open-source form builder for marketers",
    description:
      "Every form builder reports completion rate. Completion rate counts bots and buyers identically. Endpoint Forms stamps every submission with its origin and grades every form on what closed.",
    siteName: "Endpoint Forms",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Endpoint Forms — the open-source form builder for marketers",
    description:
      "Every form builder reports completion rate. Completion rate counts bots and buyers identically.",
  },
};

/*
 * Organization + WebSite, across the marketing site.
 *
 * It used to sit in the single root layout, which put our Organization schema
 * on `/f` — structured data claiming a customer's enquiry form is a page about
 * Endpoint Forms. It belongs to this surface and nothing else.
 */
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Endpoint Forms",
      url: SITE_URL,
      logo: `${SITE_URL}/logo.svg`,
      sameAs: [GITHUB_URL],
      founder: { "@type": "Person", name: "Corey Haines" },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Endpoint Forms",
      description:
        "The open-source form builder for marketers. High-converting website forms that pipe your data wherever you need it.",
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
    },
  ],
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootShell htmlClassName={FONT_VARIABLES}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SiteHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter />
    </RootShell>
  );
}
