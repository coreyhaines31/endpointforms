import Link from "next/link";
import { Container } from "@/components/container";
import { GithubLink } from "@/components/github-link";
import { LogoLockup, LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { PRIMARY_NAV } from "@/lib/site";
import { cn } from "@/lib/utils";

const navLinkClass =
  "rounded-sm whitespace-nowrap text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

/**
 * docs/05 §8.1 specified a header with zero content links, which was right for
 * a six-page waitlist site. There are now ~60 pages, so the header carries the
 * four section entry points.
 *
 * On small screens the links move to a second scrollable row rather than a
 * disclosure menu: four items don't justify a JS toggle, a focus trap, and an
 * aria-expanded state, and a row that scrolls is reachable by keyboard and
 * screen reader with none of that machinery.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-sm">
      <Container className="flex h-16 items-center justify-between gap-3 sm:gap-6">
        <div className="flex min-w-0 items-center gap-6 lg:gap-8">
          <Link
            href="/"
            aria-label="Endpoint Forms — home"
            className="shrink-0 rounded-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <LogoLockup className="hidden h-6 w-auto sm:block" />
            <LogoMark className="h-6 w-6 sm:hidden" />
          </Link>

          <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex items-center gap-6 lg:gap-7">
              {PRIMARY_NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={navLinkClass}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <GithubLink compact />
          <Link
            href="/#waitlist"
            className="inline-flex h-9 shrink-0 items-center rounded-md border border-border-control px-3 text-sm font-medium text-foreground transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Join the waitlist
          </Link>
        </div>
      </Container>

      <nav
        aria-label="Primary, compact"
        className="border-t border-border md:hidden"
      >
        <Container>
          <ul className="-mx-1 flex items-center gap-5 overflow-x-auto py-2.5">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href} className="first:pl-1 last:pr-1">
                <Link href={item.href} className={cn(navLinkClass, "text-[0.8125rem]")}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </nav>
    </header>
  );
}
