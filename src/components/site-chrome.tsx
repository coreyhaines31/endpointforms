"use client";

import { usePathname } from "next/navigation";

/**
 * The marketing header and footer, hidden on the authenticated app.
 *
 * `src/app/layout.tsx` is the only root layout, so `/app/*` and `/login` inherit
 * it. Next.js supports a second root layout only if the top-level one is
 * removed, which would mean relocating every marketing page — a much larger
 * change than this, and one that touches files other agents are working in.
 *
 * The header and footer are passed in as already-rendered server components, so
 * marking this boundary "use client" does not pull the marketing chrome into the
 * client bundle. `usePathname` resolves during the server render too, so an app
 * page never ships the header and then removes it.
 */

/**
 * Path prefixes that get the app's own chrome instead.
 *
 * `/api/auth` is here because Auth.js can render its own built-in sign-in and
 * error pages at those paths — reached directly, or when a provider bounces
 * back before our own page has been resolved. Wrapping one of those in a
 * marketing header offering "Join the waitlist" is not the moment for it.
 *
 * `/f` is the hosted form renderer (#28). Those pages belong to the customer
 * whose form it is, not to us: our nav above someone's enquiry form would send
 * their paid traffic to our waitlist.
 */
const APP_PREFIXES = ["/app", "/login", "/signup", "/api/auth", "/f"];

type SiteChromeProps = {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
};

export function SiteChrome({ header, footer, children }: SiteChromeProps) {
  const pathname = usePathname();
  const isAppSurface = APP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  return (
    <>
      {isAppSurface ? null : header}
      <div className="flex flex-1 flex-col">{children}</div>
      {isAppSurface ? null : footer}
    </>
  );
}
