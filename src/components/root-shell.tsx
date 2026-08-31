import { ThemeScript } from "@/components/theme-script";

/**
 * The `<html>`/`<body>` skeleton every root layout renders.
 *
 * ## Why there is more than one root
 *
 * There are four surfaces and they want four different documents: the marketing
 * site, the authenticated app, sign-in, and `/f` — the hosted form. `/f` is the
 * reason. It ran on the marketing site's root layout, which meant every visitor
 * to a customer's enquiry form fetched IBM Plex, our 26 KB favicon, the header
 * and footer's client chunk, and our Organization schema — 249 KB in all, on a
 * 13 KB page. That page's traffic is bought: the lead filling it in was paid
 * for at a price per click, and none of that payload does anything for them.
 * The split took it to 150 KB; `src/app/(forms)/layout.tsx` has the breakdown.
 *
 * Next allows multiple root layouts once `app/layout.tsx` is gone, and requires
 * each to render its own `<html>` and `<body>`. This is where their shared
 * attributes are written down once, so a change to the base classes cannot land
 * on three roots out of four.
 *
 * ## Why the theme script is here rather than per-root
 *
 * It is ~300 bytes inline with no request of its own, and it is what applies the
 * visitor's light/dark preference before paint. `/f` needs it as much as the
 * others: a form's colours resolve from `var(--background)` and friends, which
 * are keyed to the `.dark` class this script sets. Dropping it from the forms
 * root would silently make every hosted form light-only.
 */

type RootShellProps = {
  /**
   * Extra classes for `<html>`. In practice this is `FONT_VARIABLES` — the only
   * thing the four roots deliberately disagree about, since `(forms)` does not
   * load the webfont.
   */
  htmlClassName?: string;
  children: React.ReactNode;
};

export function RootShell({ htmlClassName, children }: RootShellProps) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      // Concatenated rather than run through `cn()`: twMerge reads our custom
      // size tokens as colours and drops one when a colour class sits beside
      // it. See `src/components/prose.tsx`.
      className={`h-full antialiased${htmlClassName ? ` ${htmlClassName}` : ""}`}
    >
      {/*
        `no-head-element` is a Pages Router rule and is wrong here: an App
        Router root layout renders its own `<head>`, and Next merges the
        metadata API's tags into it rather than replacing it. Keeping the theme
        script in the head is the point — React does not hoist an inline
        `dangerouslySetInnerHTML` script the way it hoists `<link>` and
        `<style>`, so moving it to the body would run it after the body starts
        parsing and show a flash of the wrong theme. That is the bug this rule
        would cause, not prevent.
      */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
