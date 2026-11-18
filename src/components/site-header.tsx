import Link from "next/link";
import { Container } from "@/components/container";
import { GithubLink } from "@/components/github-link";
import { LogoLockup, LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavLink } from "@/components/nav-link";
import { WaitlistLink } from "@/components/waitlist-link";
import { PRIMARY_NAV } from "@/lib/site";

/**
 * docs/05 §8.1 specified a header with zero content links, which was right for
 * a six-page waitlist site. There are now ~60 pages, so the header carries the
 * four section entry points.
 *
 * On small screens the links move to a second scrollable row rather than a
 * disclosure menu: four items don't justify a JS toggle, a focus trap, and an
 * aria-expanded state, and a row that scrolls is reachable by keyboard and
 * screen reader with none of that machinery. That row sits outside the sticky
 * header, so it scrolls away with the page instead of permanently taking 13% of
 * a phone screen. Below 380px the top row has no room for Sign in, so the
 * compact row carries it instead.
 *
 * The bottom rule appears once the page scrolls (`.site-header` in
 * globals.css), on a solid background rather than a blur: the brand rules out
 * glass, and the rule alone is enough to separate the header from content.
 */
export function SiteHeader() {
  return (
    <>
      <header className="site-header sticky top-0 z-50 border-b border-border bg-background">
        <Container className="flex h-16 items-center justify-between gap-3 sm:gap-6">
          <div className="flex min-w-0 items-center gap-6 lg:gap-8">
            <Link
              href="/"
              aria-label="Endpoint Forms home"
              className="press shrink-0 rounded-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <LogoLockup className="hidden h-6 w-auto sm:block" />
              <LogoMark className="h-6 w-6 sm:hidden" />
            </Link>

            <nav aria-label="Primary" className="hidden md:block">
              <ul className="flex items-center gap-6 lg:gap-7">
                {PRIMARY_NAV.map((item) => (
                  <li key={item.href}>
                    <NavLink href={item.href}>{item.label}</NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Sign in leads the cluster as a plain link. Sitting between two
                bordered controls it read as debris; ahead of them it reads as
                the quiet option next to the loud one, which is what it is. */}
            <Link
              href="/login"
              className="relative hidden shrink-0 items-center rounded-sm px-1 text-sm text-muted-foreground transition-colors after:absolute after:-inset-x-1 after:-inset-y-3 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring min-[380px]:inline-flex sm:px-2"
            >
              Sign in
            </Link>
            <ThemeToggle />
            <GithubLink compact />
            <WaitlistLink className="press relative inline-flex h-9 shrink-0 items-center rounded-md border border-border-control px-3 text-sm font-medium text-foreground after:absolute after:inset-x-0 after:-inset-y-1 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
          </div>
        </Container>
      </header>

      <nav aria-label="Primary, compact" className="border-b border-border md:hidden">
        <Container>
          <ul className="-mx-1 flex items-center gap-5 overflow-x-auto">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href} className="first:pl-1">
                {/* py-3 makes each link a 44px target; the row was 20px. */}
                <NavLink href={item.href} className="inline-block py-3 text-[0.8125rem] after:bottom-2">
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li className="ml-auto pr-1 min-[380px]:hidden">
              <NavLink href="/login" className="inline-block py-3 text-[0.8125rem] after:bottom-2">
                Sign in
              </NavLink>
            </li>
          </ul>
        </Container>
      </nav>
    </>
  );
}
