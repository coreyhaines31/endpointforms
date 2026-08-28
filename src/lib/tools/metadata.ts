import type { Metadata } from "next";
import { getTool, toolPath } from "./registry";

/**
 * Per-page metadata, written from the page's own content — never a fully
 * templated title string (docs/09 §5, structural rules).
 */
export function toolMetadata(slug: string): Metadata {
  const tool = getTool(slug);
  const path = toolPath(slug);
  const title = `${tool.title} — Endpoint Forms`;

  return {
    title,
    description: tool.description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description: tool.description,
      type: "website",
      url: path,
      siteName: "Endpoint Forms",
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: tool.description,
      images: ["/opengraph-image"],
    },
  };
}
