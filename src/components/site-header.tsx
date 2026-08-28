import Link from "next/link";
import { Container } from "@/components/container";
import { LogoLockup } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const nav = [
  { href: "#proof", label: "The demo" },
  { href: "#provenance", label: "Provenance" },
  { href: "#open-source", label: "Open source" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-sm">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link
          href="/"
          className="shrink-0 rounded-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <LogoLockup className="h-6 w-auto" />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <ThemeToggle />
          <a
            href="#waitlist"
            className="inline-flex h-9 items-center rounded-md border border-border-control px-3 text-sm font-medium text-foreground transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Join the waitlist
          </a>
        </div>
      </Container>
    </header>
  );
}
