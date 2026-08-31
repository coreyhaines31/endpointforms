import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * The 404, on every surface.
 *
 * ## Why it is one file and not one per root
 *
 * A `notFound()` thrown from a page renders here *inside that page's root
 * layout* — a bad glossary term keeps the marketing header, a bad form ID keeps
 * the bare forms shell. A URL that matches no segment at all has no root to
 * render in, so Next supplies a minimal document of its own and puts this
 * inside that. One file therefore covers all three and gets the right shell in
 * each without having to know which one it is in. Group-level `not-found.tsx`
 * files were tried first and render *in addition* to this one rather than
 * instead of it, which is worse than useless.
 *
 * ## Why nothing is imported
 *
 * This file is in the module graph of every route, so what it imports, every
 * route pays for. Measured, on a *valid* `/f` page: `import "./globals.css"`
 * put the marketing stylesheet and IBM Plex's `@font-face` block back on the
 * hosted form, and a single `next/link` added 3.9 KB of client bundle. Both are
 * exactly the costs `src/app/(forms)/layout.tsx` exists to remove. So: an
 * inline `<style>` element, which only renders when a 404 actually does, and a
 * plain `<a>` — leaving a 404 crosses into another root layout anyway, which is
 * a full document load either way.
 *
 * ## What the theme can and cannot do here
 *
 * A 404 in production renders inside Next's own `<html id="__next_error__">`
 * element, and Next owns it: the root layout's `<html>` attributes are dropped,
 * the pre-paint theme script with them, and re-rendering that script from here
 * does not help — React reconciles the class straight back off an element it
 * did not mark `suppressHydrationWarning`. So a 404 is light for anyone whose
 * shell loaded a stylesheet, whatever they prefer. That is Next's behaviour and
 * it predates the roots being split; it is written down here so the next person
 * to notice it does not go looking for the bug.
 *
 * `prefers-color-scheme` is the one lever left, and it is enough for the case
 * that needed it: an address matching no root at all, where no stylesheet
 * loaded and the tokens are undefined. Hence `var(--token, literal)` on every
 * colour — the token when a shell supplied one, the literal when nothing did.
 */

/*
 * `metadataBase` is normally the marketing root's, but a URL that matched no
 * segment has no root layout to inherit one from — and Next warns at build time
 * when it has to resolve the root `opengraph-image` against nothing. Naming it
 * here settles the one route that is outside every root.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  robots: { index: false, follow: false },
};

const styles = `
:root{color-scheme:light dark}
body{margin:0;background:var(--background,#fcfcfa);color:var(--foreground,#15140f)}
.ef-404{margin:0 auto;display:flex;min-height:60vh;width:100%;max-width:40rem;flex-direction:column;justify-content:center;padding:clamp(3rem,9vw,6rem) 1.25rem;font-family:var(--font-sans,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif)}
.ef-404-eyebrow{margin:0;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:.6875rem;line-height:1.2;letter-spacing:.1em;font-weight:500;text-transform:uppercase;color:var(--muted-foreground,#6a685e)}
.ef-404-heading{margin:1rem 0 0;font-size:2rem;line-height:1.15;letter-spacing:-.022em;font-weight:600;text-wrap:balance}
.ef-404-body{margin:1rem 0 0;max-width:52ch;font-size:1rem;line-height:1.65;color:var(--muted-foreground,#6a685e)}
.ef-404-more{margin:2rem 0 0;font-size:.875rem}
.ef-404-link{color:var(--foreground,#15140f);text-decoration:underline;text-underline-offset:4px}
@media (prefers-color-scheme:dark){
body{background:var(--background,#0b0b09);color:var(--foreground,#f6f5f0)}
.ef-404-eyebrow,.ef-404-body{color:var(--muted-foreground,#9b998f)}
.ef-404-link{color:var(--foreground,#f6f5f0)}
}
`;

export default function NotFound() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <main className="ef-404">
        <p className="ef-404-eyebrow">404</p>
        <h1 className="ef-404-heading">This page isn’t here.</h1>
        <p className="ef-404-body">
          The address is wrong, or the page has moved. Nothing is broken on your side.
        </p>
        <p className="ef-404-more">
          {/*
            `next/link`, which this rule wants, is a Client Component, and
            `not-found.tsx` is in the module graph of every route — importing it
            measured 3.9 KB of extra client bundle on `/f`, a page that ships no
            client components at all and exists to be cheap. Leaving a 404 also
            crosses from one root layout into another, which the router cannot
            soft-navigate anyway: this is a full document load either way, so
            the anchor is not even losing anything.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="ef-404-link">
            Go to the homepage
          </a>
        </p>
      </main>
    </>
  );
}
