import { GLOSSARY } from "@/lib/glossary";
import { MARKETING_ROUTES, SITE_URL } from "@/lib/site";
import { SPAM_METHODS } from "@/lib/spam-methods";

// Every indexable marketing route (docs/05 §5, rule 5).
// /thanks is deliberately absent: it is noindex.
//
// The dynamic children are derived from the same data modules that generate
// the pages, rather than hand-listed. An earlier version listed only the
// static routes, which silently left 37 of 63 pages — every glossary term and
// every spam teardown — out of the sitemap entirely.
export const dynamic = "force-static";

function urls(): string[] {
  return [
    ...MARKETING_ROUTES,
    ...GLOSSARY.map((term) => `/glossary/${term.slug}`),
    ...SPAM_METHODS.map((method) => `/spam/${method.slug}`),
  ];
}

export function GET() {
  const lastmod = new Date().toISOString();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls()
  .map((route) => {
    const loc = route === "/" ? SITE_URL : `${SITE_URL}${route}`;
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
  })
  .join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
