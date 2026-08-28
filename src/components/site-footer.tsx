import { Container } from "@/components/container";
import { LogoMark } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <Container className="flex flex-col gap-8 py-12 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-sm">
          <LogoMark className="h-6 w-6 text-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            A form builder that stamps every submission with its origin and grades every
            form on what closed.
          </p>
          <p className="mt-4 font-mono text-label uppercase text-muted-foreground">
            Pre-launch · AGPL-3.0
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-col gap-2 text-sm sm:text-right">
          <a
            href="#proof"
            className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            The demo
          </a>
          <a
            href="#provenance"
            className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Provenance
          </a>
          <a
            href="#open-source"
            className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Open source
          </a>
          <a
            href="#waitlist"
            className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Join the waitlist
          </a>
        </nav>
      </Container>
    </footer>
  );
}
