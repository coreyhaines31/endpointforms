import Link from "next/link";
import { Container } from "@/components/container";
import { LogoMark } from "@/components/logo";
import {
  ARGUMENT_PATH,
  GITHUB_ISSUES_URL,
  GITHUB_LICENSE_URL,
  GITHUB_URL,
} from "@/lib/site";

type FooterLink = { href: string; label: string; external?: boolean };

// Three short columns, per docs/05 §8.2. Everything in Tier 0 is reachable
// from here; /thanks is the one deliberate exception.
const columns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/solutions/agencies", label: "For agencies" },
      { href: "/solutions/in-house-ppc", label: "For in-house PPC" },
      { href: "/open-source", label: "Open source" },
      { href: "/#waitlist", label: "Join the waitlist" },
      { href: "/login", label: "Sign in" },
    ],
  },
  {
    heading: "Free tools",
    links: [
      { href: "/tools", label: "All calculators" },
      { href: "/tools/form-spam-cost-calculator", label: "Form spam cost" },
      { href: "/tools/cost-per-closed-deal-calculator", label: "Cost per closed deal" },
      { href: "/tools/form-drop-off-calculator", label: "Form drop-off" },
    ],
  },
  {
    heading: "Learn",
    links: [
      { href: ARGUMENT_PATH, label: "The argument" },
      { href: "/spam", label: "Stopping form spam" },
      { href: "/glossary", label: "Glossary" },
      { href: "/about", label: "About" },
      { href: GITHUB_ISSUES_URL, label: "Roadmap", external: true },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: GITHUB_URL, label: "GitHub", external: true },
      { href: GITHUB_LICENSE_URL, label: "License (AGPL-3.0)", external: true },
    ],
  },
];

const linkClass =
  "rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <Container className="flex flex-col gap-12 py-12 lg:flex-row lg:justify-between lg:gap-16">
        <div className="max-w-sm">
          <LogoMark className="h-6 w-6 text-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            The open-source form builder for marketers. High-converting website forms
            that pipe your data wherever you need it.
          </p>
          <p className="mt-4 font-mono text-label uppercase text-muted-foreground">
            AGPL-3.0 · Self-hostable · Your data is yours
          </p>
        </div>

        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:gap-12"
        >
          {columns.map((column) => (
            <div key={column.heading}>
              <h2 className="font-mono text-label uppercase text-muted-foreground">
                {column.heading}
              </h2>
              <ul className="mt-4 flex flex-col gap-2.5 text-sm">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClass}
                      >
                        {link.label}
                        <span aria-hidden="true"> ↗</span>
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : (
                      <Link href={link.href} className={linkClass}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </Container>
    </footer>
  );
}
