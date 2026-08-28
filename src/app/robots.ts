import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// robots.txt names the sitemap index and nothing else (docs/05 §5, rule 4).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
