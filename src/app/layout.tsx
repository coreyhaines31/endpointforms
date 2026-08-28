import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ThemeScript } from "@/components/theme-script";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://endpointforms.com";

export const metadata: Metadata = {
  // Without metadataBase, Next emits relative OG image URLs and every share
  // renders as a bare text card. The homepage is the only distribution surface
  // a pre-launch waitlist has, so this is load-bearing.
  metadataBase: new URL(SITE_URL),
  title: "Endpoint Forms — the open-source form builder for marketers",
  description:
    "Build high-converting forms for your website and pipe the data wherever you need it. Open source, AGPL, self-hostable, with integrations that fail loudly instead of quietly.",
  openGraph: {
    title: "Endpoint Forms — the open-source form builder for marketers",
    description:
      "Every form builder reports completion rate. Completion rate counts bots and buyers identically. Endpoint Forms stamps every submission with its origin and grades every form on what closed.",
    siteName: "Endpoint Forms",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Endpoint Forms — the open-source form builder for marketers",
    description:
      "Every form builder reports completion rate. Completion rate counts bots and buyers identically.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
