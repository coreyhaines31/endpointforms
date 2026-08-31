import type { Metadata } from "next";

/**
 * The hosted form surface (#28).
 *
 * ## noindex, on every page under here
 *
 * A customer's contact form is not our SEO surface. Indexing one puts their
 * enquiry page in results for their brand under our domain, competing with the
 * page they actually paid to rank, and it publishes their field names to anyone
 * scraping for forms to spam. `robots` is set on the layout rather than on the
 * page so it covers the thank-you page and anything added under here later —
 * Next inherits a metadata field a child does not name.
 *
 * ## No chrome
 *
 * `src/components/site-chrome.tsx` excludes `/f` from the marketing header and
 * footer. A visitor filling in Northwind's enquiry form should not be offered a
 * link to our waitlist; the page belongs to the customer, not to us.
 *
 * Host-based routing onto the render domain (#26) lands separately. This path
 * works on any host in the meantime.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function FormLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
