import type { Metadata } from "next";
import { Star } from "lucide-react";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { TextLink } from "@/components/text-link";
import {
  ARGUMENT_PATH,
  GITHUB_ISSUES_URL,
  GITHUB_LICENSE_URL,
  GITHUB_URL,
} from "@/lib/site";

const title = "Open source";
const description =
  "The core of Endpoint Forms is AGPL-3.0. Exports are never paywalled, the issues are the roadmap, and one-command self-hosting is the thing we intend to get right — honestly, it isn’t shipped yet.";

export const metadata: Metadata = {
  title: `${title} — Endpoint Forms`,
  description,
  alternates: { canonical: "/open-source" },
  openGraph: {
    title: `${title} — Endpoint Forms`,
    description,
    type: "website",
    url: "/open-source",
    siteName: "Endpoint Forms",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/opengraph-image"],
    title: `${title} — Endpoint Forms`,
    description,
  },
};

const commitments = [
  {
    label: "License",
    value: "AGPL-3.0",
    detail: "The core, not a crippled community edition.",
  },
  {
    label: "Exports",
    value: "Never paywalled",
    detail: "Every submission, every verdict, every field. Free tier included.",
  },
  {
    label: "Self-host",
    value: "One command — not yet",
    detail: "The target. It does not work today and we won’t say otherwise.",
  },
  {
    label: "Roadmap",
    value: "GitHub issues",
    detail: "There is no second, prettier roadmap that says something else.",
  },
];

export default function OpenSourcePage() {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <PageHeader
        eyebrow="Open source"
        title="The core is AGPL-3.0. Your data is yours, and we can’t take it away."
        lead={
          <>
            Zero marketers asked us for open source — we checked. This page exists because
            trust is the scarce resource in this category, not because the license is a
            feature.
          </>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <dl className="grid grid-cols-1 border-t border-border sm:grid-cols-2 lg:grid-cols-4">
          {commitments.map((item) => (
            <div
              key={item.label}
              className="border-b border-border py-6 sm:px-6 sm:first:pl-0 lg:border-r lg:last:border-r-0 lg:last:pr-0"
            >
              <dt className="font-mono text-label uppercase text-muted-foreground">
                {item.label}
              </dt>
              <dd className="mt-3 font-mono text-base text-foreground">{item.value}</dd>
              <dd className="mt-2 max-w-[30ch] text-sm text-muted-foreground">
                {item.detail}
              </dd>
            </div>
          ))}
        </dl>
      </Container>

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <Prose>
          <h2>What the license actually means for you</h2>
          <p>
            AGPL-3.0 means you can run Endpoint Forms yourself, read every line of it, change
            it, and keep running your changed copy for as long as you like. If you take that
            copy and offer it to other people as a hosted service, you have to publish your
            changes under the same license. That is the whole trade, and it is aimed at
            companies who would resell the thing, not at you running your own forms.
          </p>
          <p>
            The practical version: nothing we ship later can lock your data behind a plan
            change. If we raise prices, gut a tier, or get acquired by somebody with different
            ideas, the code that stamps every submission and stores every verdict is already
            on your disk under a license we can’t revoke. The{" "}
            <TextLink href={GITHUB_LICENSE_URL} external>
              full license text
            </TextLink>{" "}
            is in the repo.
          </p>

          <h2>Exports are never paywalled. That’s a commitment, not a tier.</h2>
          <p>
            Every submission, every Origin stamp, every Verdict, every field — exportable in a
            plain format, on every plan, including the free one, forever. Tally set this bar
            and gets loved for it. Gating the export of data a customer already gave you is the
            most common quiet cruelty in this category, and we are ruling it out in public so
            it costs us something to change our minds.
          </p>

          <h2>Why you can check our work, specifically</h2>
          <p>
            The product’s central claim is that we can tell you where a submission came from.
            That claim is only worth as much as your ability to audit it. So the code that
            decides whether something is stamped human, agent or unverified is open — you can
            read the rules, disagree with them, and open an issue arguing we got one wrong.
            No hosted competitor offers that, and for a claim this consequential it should be
            the minimum. The reasoning behind the stamp is in{" "}
            <TextLink href={ARGUMENT_PATH}>the argument</TextLink>.
          </p>

          <h2>The honest part about self-hosting</h2>
          <p>
            Open-source form builders have been miserable to deploy. That is not a slur; it is
            the unanimous verdict of the people who tried. “Deploying them is much harder than
            signing up for their managed version” is the consensus, and one developer put it
            more plainly: “I had to pull out my hair to get the api worker to work!”
          </p>
          <p>
            One-command self-host is the single thing we think we can beat Formbricks and
            OpnForm on, and it is the reason this page exists at all. It is also not shippable
            today. There is no install command here because there is nothing to install yet.
            When there is, it will get its own page, with the honest list of what it does and
            does not set up for you.
          </p>
          <p>
            And the part most open-source companies leave out: most people should use the
            hosted version. It is what pays for the open one. Self-hosting is there so that
            leaving is always possible, not because we think you should spend your Saturday on
            it.
          </p>

          <h2>The issues are the roadmap</h2>
          <p>
            There is no synced roadmap page, because a synced roadmap page is a second source
            of truth that quietly drifts from the first one. What is planned, what is
            argued about, and what is stuck are all in{" "}
            <TextLink href={GITHUB_ISSUES_URL} external>
              the issue tracker
            </TextLink>
            . If you want to contribute, that is the front door too: open an issue before a
            pull request so nobody spends a weekend on something we were about to design
            differently.
          </p>
        </Prose>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <div className="max-w-[68ch] border border-border bg-card p-6 sm:p-8">
          <p className="font-mono text-label uppercase text-muted-foreground">
            Before there is anything to run
          </p>
          <p className="mt-4 text-base text-foreground">
            A star is the only useful thing you can do with a pre-launch repo, and it is how
            the next person decides whether this is real.
          </p>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="signal-fill inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-base font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Star className="size-4" aria-hidden="true" />
              Star the repo
              <span className="sr-only">on GitHub (opens in a new tab)</span>
            </a>
            <p className="text-sm text-muted-foreground">
              Or <TextLink href="/#waitlist">join the waitlist</TextLink> — one email, when
              there’s something to look at.
            </p>
          </div>
        </div>
      </Container>
    </main>
  );
}
