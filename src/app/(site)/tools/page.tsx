import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { WaitlistForm } from "@/components/waitlist-form";
import { ARGUMENT_PATH } from "@/lib/site";
import { TOOLS, TOOL_GROUPS, TOOLS_PATH, toolPath } from "@/lib/tools/registry";

const title = "Free calculators for people who buy leads";
const description =
  "Eight working calculators for marketers running paid acquisition: what junk submissions cost you, what a lead is really worth once it closes, and whether your split test has enough closed deals to believe. No signup, no email, nothing sent anywhere.";

export const metadata: Metadata = {
  title: `Free tools — Endpoint Forms`,
  description,
  alternates: { canonical: TOOLS_PATH },
  openGraph: {
    title: `Free tools — Endpoint Forms`,
    description,
    type: "website",
    url: TOOLS_PATH,
    siteName: "Endpoint Forms",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: `Free tools — Endpoint Forms`,
    description,
    images: ["/opengraph-image"],
  },
};

const groupNotes: Record<string, string> = {
  "What it costs": "Money already spent, counted properly.",
  "What it's worth": "A change you are considering, priced before you make it.",
  "What to believe": "Whether the number in front of you is strong enough to act on.",
};

export default function ToolsHubPage() {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <PageHeader
        eyebrow="Free tools"
        title={title}
        lead={
          <>
            Your form builder reports how many people submitted. These work out
            what those submissions cost, what they were worth, and whether the
            difference you are looking at is real. Everything runs in your
            browser — no signup, no email, nothing sent anywhere.
          </>
        }
      />

      <Container className="mt-[clamp(2.5rem,6vw,4rem)]">
        {TOOL_GROUPS.map((group) => {
          const tools = TOOLS.filter((tool) => tool.group === group);
          if (tools.length === 0) return null;
          return (
            <section
              key={group}
              className="border-t border-border-control pt-6 [&+&]:mt-[clamp(2.5rem,5vw,3.5rem)]"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <h2 className="font-mono text-label uppercase text-muted-foreground">
                  {group}
                </h2>
                <p className="text-sm text-muted-foreground">{groupNotes[group]}</p>
              </div>

              <ul className="mt-6 grid grid-cols-1 gap-px bg-border md:grid-cols-2">
                {tools.map((tool) => (
                  <li key={tool.slug} className="bg-background">
                    <Link
                      href={toolPath(tool.slug)}
                      className="group flex h-full flex-col p-6 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      <h3 className="text-h4">{tool.name}</h3>
                      <p className="mt-3 max-w-[44ch] text-base text-muted-foreground">
                        {tool.question}
                      </p>
                      <p className="mt-4 max-w-[48ch] text-sm text-muted-foreground">
                        {tool.unique}
                      </p>
                      <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        Open the calculator
                        <ArrowRight
                          className="size-4 transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </Container>

      <Container className="mt-[clamp(4rem,8vw,6rem)]">
        <div className="grid grid-cols-1 gap-x-16 gap-y-10 border-t border-border pt-[clamp(2rem,4vw,3rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <h2 className="text-h3">Why eight, and not two hundred</h2>
            <div className="mt-6 flex max-w-[62ch] flex-col gap-5 text-base text-muted-foreground">
              <p>
                There is an obvious version of this page with two hundred
                calculators on it, generated from a template, one per keyword.
                We are not going to build that, and the reason is not taste.
              </p>
              <p>
                The rule we hold ourselves to is that{" "}
                <strong className="font-medium text-foreground">
                  a page ships only if it is useful when it does not rank
                </strong>
                . A calculator passes that test — it is still the thing you drop
                into a reply, still the thing you open on a call, whether or not
                anyone ever searched for it. A page that only pays off if Google
                sends traffic is a page we have no business making.
              </p>
              <p>
                So each of these is a real modelling job rather than a swapped
                noun, each shows its own arithmetic, and each one says what it
                cannot tell you. If we ever get to two hundred, something has
                gone wrong.
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-h3">About the numbers in them</h2>
            <div className="mt-6 flex max-w-[62ch] flex-col gap-5 text-base text-muted-foreground">
              <p>
                Every calculator ships with defaults so it is useful before you
                touch it. Those defaults are examples, not benchmarks. Where a
                default stands in for something nobody has published data on —
                your junk rate, what a form field costs in completion — the page
                says so on the field itself rather than quietly implying we
                measured it.
              </p>
              <p>
                We do not ship competitors&rsquo; prices inside these tools
                either. Third-party pricing claims about this category are
                frequently wrong; we found two widely repeated figures that
                contradict the vendor&rsquo;s own live pricing page. You enter
                the numbers from the page you are looking at, and they stay in
                your browser.
              </p>
              <p>
                The argument behind all of this is written out in full at{" "}
                <TextLink href={ARGUMENT_PATH}>the dishonest dashboard</TextLink>
                , including the best cases against it.
              </p>
            </div>
          </div>
        </div>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <div className="border-t border-border pt-[clamp(2.5rem,5vw,3.5rem)]">
          <h2 className="max-w-[26ch] text-h3 sm:text-h2">
            These are the numbers a form builder should have been giving you.
          </h2>
          <p className="mt-6 max-w-[62ch] text-base text-foreground">
            Endpoint Forms is an open-source form builder for marketers — built
            to convert, piping data wherever you need it, and carrying what each
            submission turned out to be worth back to the form that captured it.
            Pre-launch, built in the open.
          </p>
          <WaitlistForm className="mt-8" note="Waitlist" />
        </div>
      </Container>
    </main>
  );
}
