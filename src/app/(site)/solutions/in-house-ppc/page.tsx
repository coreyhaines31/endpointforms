import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { WaitlistForm } from "@/components/waitlist-form";
import { ARGUMENT_PATH } from "@/lib/site";

const title = "For in-house PPC and demand gen";
const description =
  "You are measured on cost per lead. Sales is measured on closed deals. Endpoint Forms is a form builder for the middle nobody owns — provenance on every submission, and the outcome written back onto it. Pre-launch.";

export const metadata: Metadata = {
  title: `${title} — Endpoint Forms`,
  description,
  alternates: { canonical: "/solutions/in-house-ppc" },
  openGraph: {
    title: `${title} — Endpoint Forms`,
    description,
    type: "website",
    url: "/solutions/in-house-ppc",
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

const gaps = [
  {
    gap: "It is a spreadsheet job at your spend level",
    detail:
      "Below roughly $5k a month the working implementation is uploading offline conversions from Google Sheets once a week. It works. It is also a recurring manual task owned by the person with the least time.",
  },
  {
    gap: "It is gated on volume you may not have",
    detail:
      "The usual advice starts at three qualified leads a day. Under that, the algorithm has nothing to learn from and the loop is decorative.",
  },
  {
    gap: "It is gated on CRM hygiene",
    detail:
      "If the fields are messy, importing them makes a bigger mess. Everybody in this discipline knows it and most CRMs are messy anyway.",
  },
  {
    gap: "It is slow",
    detail:
      "Feedback that takes longer than a day or two hurts the loop it is meant to help, and B2B outcomes rarely arrive in a day or two.",
  },
  {
    gap: "It teaches the platform and teaches the form nothing",
    detail:
      "This is the one that matters. The same outcome data that improves your bidding could tell you which variant, which question and which field produced the revenue — and no tool in the category does anything with it.",
  },
];

const changes = [
  {
    href: "/features/submission-provenance",
    name: "Origin",
    body: "A field on every submission — Human, Agent, Unverified — so “our demo requests are through the roof” becomes a composition you can show rather than a suspicion you have. Unverified submissions are quarantined out of the conversion count, which is also the thing training your ad platform.",
  },
  {
    href: "/features/lead-outcomes",
    name: "Verdict",
    body: "The outcome comes back onto the submission itself, not just into the ad platform. Awaiting verdict is a first-class state because in a four-month sales cycle most submissions genuinely are awaiting one, and a report that hides that is lying politely.",
  },
  {
    href: "/features/form-split-testing",
    name: "Hindsight",
    body: "Split tests ranked on what closed instead of what completed — and honest about significance, so you are not handed a confident winner from twelve outcomes. If your volume never supports a call, it stays a report, and the report is still new information.",
  },
];

export default function InHousePpcPage() {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <PageHeader
        eyebrow="For in-house PPC and demand gen"
        title="You sit between a platform that rewards volume and a sales team that punishes it."
        lead={
          <>
            Nobody owns the middle. Endpoint Forms is a form builder that puts the outcome back
            onto the submission &mdash; so the object both teams touched is the one place the
            answer gets recorded.
          </>
        }
        meta={
          <p className="max-w-[62ch] border-l border-border-control pl-4 text-sm text-muted-foreground">
            Endpoint Forms is pre-launch. No customers, no case studies, nothing to trial. This
            page is about the job, and about what is specified to do it.
          </p>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <div className="flex max-w-[68ch] flex-col gap-5 text-base text-foreground">
          <h2 className="text-h3 sm:text-h2">The structural version of your problem</h2>
          <p>
            You own spend across Google, Meta and often LinkedIn. There is a reasonable chance
            you are the only person doing this job at your company. And the number on your
            scorecard and the number on the sales team&rsquo;s scorecard are not the same
            number, which turns an operational question into an argument roughly once a
            quarter.
          </p>

          <figure className="border-l-2 border-foreground pl-5 sm:pl-6">
            <blockquote className="text-base text-foreground">
              &ldquo;The root problem usually is structural. Marketing gets measured on CPL so
              they optimize for CPL. Sales get measured on closed deals. Nobody owns the middle.
              The moment you start optimizing for pipeline quality over volume everything looks
              more expensive on paper and better in reality. That&rsquo;s a tough sell to
              stakeholders addicted to low CPLs.&rdquo;
            </blockquote>
            <figcaption className="mt-3 font-mono text-label uppercase text-muted-foreground">
              u/Common_Dependent_284 &middot; r/DigitalMarketing, May 2026
            </figcaption>
          </figure>

          <p>
            The last sentence is the hard part and no product fixes it for you. What a product
            can do is stop making the tough sell harder. Right now the tool sitting at the
            handover point &mdash; the form &mdash; reports the volume metric, exclusively, and
            has no field at all for what the submission turned out to be.
          </p>
          <p>
            That is not a small omission. It means the campaign that looked best on paper can
            be the one sales resented, and the artefact both teams share has no memory of which
            was which.
          </p>
        </div>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <h2 className="text-h3 sm:text-h2">You already run offline conversion import</h2>
        <div className="mt-6 flex max-w-[68ch] flex-col gap-5 text-base text-foreground">
          <p>
            If you have enhanced conversions, offline conversion import or server-side CAPI
            wired up, you are ahead of most of your peers and we are not going to pretend we
            invented the idea. It is the first thing practitioners recommend to each other, and
            it is correct.
          </p>
          <p>
            It has five known failure modes, and only the last one is ours to solve.
          </p>
        </div>
        <dl className="mt-10 border-t border-border">
          {gaps.map((item, index) => (
            <div
              key={item.gap}
              className="grid grid-cols-1 gap-2 border-b border-border py-6 md:grid-cols-[minmax(0,24rem)_1fr] md:gap-10"
            >
              <dt className="text-base text-foreground">
                <span className="font-mono text-label uppercase text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="mt-2 block">{item.gap}</span>
              </dt>
              <dd className="max-w-[58ch] text-base text-muted-foreground">{item.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 max-w-[68ch] text-base text-muted-foreground">
          We are not claiming the loop to your ad platform. That fight belongs to HubSpot,
          CallRail and WhatConverts and they are good at it. The unclaimed half is that the
          outcome never comes back to the form, and in our research nobody &mdash; not one
          person &mdash; described feeding downstream outcomes into which variant, question or
          field they use.
        </p>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <h2 className="text-h3 sm:text-h2">What changes</h2>
        <ul className="mt-10 grid grid-cols-1 border-t border-border md:grid-cols-3">
          {changes.map((item) => (
            <li
              key={item.href}
              className="border-b border-border py-7 md:border-b-0 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
            >
              <h3 className="text-h4">
                <TextLink href={item.href}>
                  {item.name}
                </TextLink>
              </h3>
              <p className="mt-3 text-base text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <div className="max-w-[68ch] border border-border bg-card p-6 sm:p-8">
          <p className="font-mono text-label uppercase text-muted-foreground">
            What this doesn&rsquo;t fix
          </p>
          <div className="mt-4 flex flex-col gap-4 text-base text-muted-foreground">
            <p>
              It does not resolve the incentive problem. If your leadership is graded on cost
              per lead, showing them a lower, truer number is still a political act, and this
              gives you evidence rather than cover.
            </p>
            <p>
              It does not work without an outcome from somewhere. A CRM sync is the easy path;
              a webhook from a Slack workflow or a rep marking a call will do. Nothing at all
              will not.
            </p>
            <p>
              And your lead volume is probably lower than the volume a split test needs to
              declare a winner honestly. We will show you the report and refuse to show you a
              winner &mdash; which is the correct behaviour and also, genuinely, less than you
              might want.
            </p>
          </div>
        </div>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <p className="font-mono text-label uppercase text-muted-foreground">
              Where you would start
            </p>
            <h2 className="mt-5 max-w-[24ch] text-h3 sm:text-h2">
              The demo request form. Nothing else.
            </h2>
            <p className="mt-5 max-w-[56ch] text-base text-muted-foreground">
              One form, the one your paid traffic hits, with the rest of your stack untouched.
              Endpoint Forms is pre-launch, so this is a waitlist rather than a trial &mdash;
              one email, when there is something to look at.
            </p>
            <WaitlistForm className="mt-8" />
          </div>

          <aside className="self-start border border-border bg-card p-6">
            <p className="font-mono text-label uppercase text-muted-foreground">
              Read first
            </p>
            <p className="mt-4 text-base text-foreground">
              This product rests on one argument, and the argument has real objections. They
              are on the page, in full, including the one about lead volume.
            </p>
            <ul className="mt-5 flex flex-col gap-3 text-base">
              <li>
                <TextLink href={ARGUMENT_PATH}>The dishonest dashboard</TextLink>
              </li>
              <li>
                <TextLink href="/features">The five capabilities</TextLink>
              </li>
              <li>
                <TextLink href="/solutions/agencies">
                  Running client accounts instead?
                </TextLink>
              </li>
            </ul>
          </aside>
        </div>
      </Container>
    </main>
  );
}
