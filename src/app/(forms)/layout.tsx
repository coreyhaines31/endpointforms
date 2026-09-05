import type { Metadata } from "next";

import { RootShell } from "@/components/root-shell";
import "./forms.css";

/**
 * The hosted form surface (#28). Its own root layout, and the reason the site
 * has four.
 *
 * ## What this root does not have
 *
 * No marketing header or footer, no `next/font`, no Organization schema, no
 * Open Graph, no marketing favicon. `/f/{formId}` inherited all of it from the
 * single root at `src/app/layout.tsx` and transferred **249.2 KB across 14
 * requests** to do so. It is now **149.8 KB across 9**: IBM Plex's three
 * preloaded subsets (59.8 KB), the 25.6 KB favicon, and 7.4 KB of the document
 * itself are gone, along with the header and footer's own client chunk.
 *
 * The arithmetic is the argument: this page runs on the customer's paid
 * traffic. Every kilobyte here is spent on a lead someone bought, and none of
 * what was inherited helps that lead fill in the form. The page is verified to
 * work with JavaScript blocked entirely — filled in and submitted in a browser
 * with script execution off, not just theorised.
 *
 * ## What is left, and why it cannot go
 *
 * 134 KB of the remaining 150 KB was React and the App Router's client runtime,
 * which Next ships for every App Router route whether or not the route has a
 * single Client Component. There is no per-route opt-out, so the only way under
 * it was to stop being a route: **`/f/{formId}` is now a route handler**
 * (`route.tsx`, #56) that renders to a string and inlines its stylesheet, and
 * it transfers **13 KB in one request with no external script at all**.
 *
 * This layout no longer wraps the form. It still wraps `thanks/page.tsx`, which
 * is an ordinary page and still carries the runtime — it is seen once, after
 * the lead is already captured, so the same arithmetic does not apply to it.
 *
 * ## The type
 *
 * No webfont means no `--font-plex-sans`, and `globals.css` composes
 * `--font-sans` from it. It has a `var()` fallback there for exactly this root;
 * without one the whole `font-family` declaration would be invalid at
 * computed-value time and every hosted form would render in Times. The form
 * body already used a system stack (`DEFAULT_FONT_STACK` in
 * `src/lib/render/theme.ts`) — this makes the headings and the thank-you page
 * agree with it.
 *
 * ## The favicon
 *
 * An inline `data:` icon rather than the 26 KB `favicon.ico`. A `<link
 * rel="icon">` is also what stops the browser probing `/favicon.ico` on its
 * own, so leaving it out entirely would have cost the request anyway. Our mark
 * on a customer's form was never right; a mark that costs nothing is the
 * compromise.
 *
 * ## noindex, on every page under here
 *
 * A customer's contact form is not our SEO surface. Indexing one puts their
 * enquiry page in results for their brand under our domain, competing with the
 * page they actually paid to rank, and it publishes their field names to anyone
 * scraping for forms to spam. Set on the root so it covers the thank-you page
 * and anything added under here later — Next inherits a metadata field a child
 * does not name.
 *
 * Host-based routing onto the render domain (#26) lands separately. This path
 * works on any host in the meantime.
 */

/**
 * The mark, inline. Same geometry as `LogoMark`; ~420 bytes, zero requests.
 *
 * The `prefers-color-scheme` block is not decoration either: a tab icon is
 * drawn on the browser's own chrome, so a fixed dark mark disappears against a
 * dark tab strip. An SVG favicon is the one favicon format that can answer the
 * question itself.
 */
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cstyle%3Epath,circle%7Bfill:%2315140f%7D@media(prefers-color-scheme:dark)%7Bpath,circle%7Bfill:%23f6f5f0%7D%7D%3C/style%3E%3Cpath d='M1.6 2.4H13.2V5.6H4.8V10.4H16.4V13.6H4.8V18.4H13.2V21.6H1.6Z'/%3E%3Ccircle cx='19.4' cy='12' r='3.4'/%3E%3C/svg%3E";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  // Deliberately no metadataBase and no default description. Inheriting the
  // marketing site's meant every hosted form advertised "the open-source form
  // builder for marketers" in its share card — our copy, on someone else's
  // page, over a URL that is noindex anyway.
  title: "Form",
  icons: { icon: { url: FAVICON, type: "image/svg+xml" } },
  // `src/app/opengraph-image.tsx` is a root file convention and cascades into
  // every root layout. An empty list is how you say "not here": a customer
  // pasting their own form's URL into Slack should not get an Endpoint Forms
  // marketing card back.
  openGraph: { images: [] },
  twitter: { card: "summary", images: [] },
};

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootShell>
      <div className="flex flex-1 flex-col">{children}</div>
    </RootShell>
  );
}
