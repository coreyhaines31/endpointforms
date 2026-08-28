import { SITE_URL } from "@/lib/site";

/**
 * sitemap.xml is a sitemap INDEX from day one, even with one child
 * (docs/05 §5, rule 1). Fillout's root sitemap silently omits 800+ real pages
 * because its proxied surfaces generate their own sitemaps that nothing
 * references; adding children here later now costs nothing.
 */
const children = ["sitemap-marketing.xml"];

// Rendered once at build time. A lastmod that changes on every request is
// noise, not a signal.
export const dynamic = "force-static";

export function GET() {
  const lastmod = new Date().toISOString();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${children
  .map(
    (child) =>
      `  <sitemap>\n    <loc>${SITE_URL}/${child}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`,
  )
  .join("\n")}
</sitemapindex>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
