import { MARKETING_ROUTES, SITE_URL } from "@/lib/site";

// Every indexable marketing route, hubs included (docs/05 §5, rule 5).
// /thanks is deliberately absent: it is noindex.
// Rendered once at build time. A lastmod that changes on every request is
// noise, not a signal.
export const dynamic = "force-static";

export function GET() {
  const lastmod = new Date().toISOString();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${MARKETING_ROUTES.map((route) => {
  const loc = route === "/" ? SITE_URL : `${SITE_URL}${route}`;
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
}).join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
