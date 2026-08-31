import type { Metadata } from "next";
import { ArrowRight, Star } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { ARGUMENT_PATH, GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "You’re on the list — Endpoint Forms",
  description:
    "Confirmation that you’ve joined the Endpoint Forms waitlist, and what happens next.",
  // Confirmation pages have no business in an index. docs/05 §5, rule 6.
  robots: { index: false, follow: true },
};

export default function ThanksPage() {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <PageHeader
        eyebrow="Waitlist · Confirmed"
        title="You’re on the list."
        lead={
          <>
            One email, from a person, when there is something worth looking at — most likely a
            demo of a split test where the variant that lost on completion rate produced all
            the revenue. Not a newsletter, not a drip sequence, and not a launch countdown.
          </>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <div className="max-w-[68ch]">
          <p className="text-base text-foreground">
            Endpoint Forms is pre-launch, so there is nothing to log into. Two things are
            worth doing in the meantime, in the order they’re useful.
          </p>

          <ol className="mt-10 grid grid-cols-1 border-t border-border">
            <li className="border-b border-border py-7">
              <p className="font-mono text-label uppercase text-muted-foreground">01</p>
              <h2 className="mt-3 text-h3">Star the repo</h2>
              <p className="mt-3 max-w-[56ch] text-base text-muted-foreground">
                The core is AGPL-3.0 and public from before there was much in it. A star is
                how the next person decides this is real, and it is the only useful thing
                anyone can do with a pre-launch repository.
              </p>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="signal-fill mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-base font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Star className="size-4" aria-hidden="true" />
                Star the repo
                <span className="sr-only">on GitHub (opens in a new tab)</span>
              </a>
            </li>

            <li className="border-b border-border py-7">
              <p className="font-mono text-label uppercase text-muted-foreground">02</p>
              <h2 className="mt-3 text-h3">Read the argument</h2>
              <p className="mt-3 max-w-[56ch] text-base text-muted-foreground">
                If you signed up off the homepage without reading it: five premises, the
                receipts behind each one, and the three strongest arguments against the whole
                thing, answered rather than ducked.
              </p>
              <Link
                href={ARGUMENT_PATH}
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border-control px-4 text-base font-medium text-foreground transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                The dishonest dashboard
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </li>
          </ol>

          <p className="mt-8 text-sm text-muted-foreground">
            Wrong address, or changed your mind? Reply to the first email and say so — we
            delete the address rather than flagging it.
          </p>
        </div>
      </Container>
    </main>
  );
}
