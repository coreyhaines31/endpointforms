import { ThemeScript } from "@/components/theme-script";
import { FORM_CSS } from "@/lib/render/form-css.generated";

/**
 * The whole document for a hosted form (#56).
 *
 * ## Why this exists rather than a root layout
 *
 * `/f` is served by a route handler, not an App Router page, so there is no
 * layout to render `<html>` and no metadata API to fill the head. Both are here
 * instead, and the trade is the entire point of the issue: an App Router route
 * ships react-dom and the router runtime whether or not a page uses them, and
 * this page uses neither. It has no Client Component beneath it, no `useState`,
 * no event handler, and it is verified to submit with scripting switched off.
 * That runtime was 134 KB of the 150 KB the form transferred — on traffic the
 * customer paid for, to render what is often four inputs.
 *
 * ## The stylesheet is inlined, not linked
 *
 * A form lives on somebody else's page and is judged on when it paints. A
 * linked stylesheet is a second round trip before first paint; inlined, the
 * whole document is one request. Compiled and minified by
 * `scripts/build-form-css.mts` from the same `forms.css` the App Router used —
 * not a scoped subset, so no class can go silently unstyled.
 *
 * ## `robots: noindex` is a header, not a tag, and both are here
 *
 * The metadata API used to emit the tag. A route handler has to say it itself,
 * and it says it twice — the meta tag for crawlers that read markup, the
 * `X-Robots-Tag` header in `route.tsx` for those that do not.
 */
export function FormDocument({
  title,
  bodyClassName,
  children,
}: {
  title: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{title}</title>
        <ThemeScript />
        {/*
          `dangerouslySetInnerHTML` because React escapes text children, and an
          escaped `>` in a selector is a stylesheet that does not apply. The
          content is our own build output, never anything a submitter sends.
        */}
        <style dangerouslySetInnerHTML={{ __html: FORM_CSS }} />
      </head>
      <body className={`min-h-full flex flex-col${bodyClassName ? ` ${bodyClassName}` : ""}`}>
        {children}
      </body>
    </html>
  );
}
