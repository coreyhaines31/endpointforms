import Link from "next/link";
import { Container } from "@/components/container";
import { GithubLink } from "@/components/github-link";
import { LogoLockup, LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Launch-tier header, per docs/05 §8.1: zero content links. Tally runs one
 * content link in its entire header; a waitlist site should run none. The
 * essay is reached from the homepage body and the footer.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-sm">
      <Container className="flex h-16 items-center justify-between gap-3 sm:gap-6">
        <Link
          href="/"
          aria-label="Endpoint Forms — home"
          className="shrink-0 rounded-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <LogoLockup className="hidden h-6 w-auto sm:block" />
          <LogoMark className="h-6 w-6 sm:hidden" />
        </Link>

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
    </header>
  );
}
