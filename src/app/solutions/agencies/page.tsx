import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { WaitlistForm } from "@/components/waitlist-form";
import { ARGUMENT_PATH } from "@/lib/site";

const title = "For agencies and freelancers";
const description =
  "You run the ads, build the form, present the dashboard — and then the client’s sales team tells you the leads are garbage. What Endpoint Forms changes for agencies running paid acquisition, and what it doesn’t. Pre-launch.";

export const metadata: Metadata = {
  title: `${title} — Endpoint Forms`,
  description,
  alternates: { canonical: "/solutions/agencies" },
  openGraph: {
    title: `${title} — Endpoint Forms`,
    description,
    type: "website",
    url: "/solutions/agencies",
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

const tried = [
  {
    approach: "reCAPTCHA on every client form",
    outcome:
      "“recaptcha v2 checkbox is pretty weak these days,” and a solving service clears it for about two dollars. It also taxes every real visitor you paid for.",
  },
  {
    approach: "Honeypot fields",
    outcome:
      "Catches the naive scripts. “I have a honeypot, but it didn’t stop” is the common ending, and it is not a defense you can promise a client.",
  },
  {
    approach: "Geo-blocking at the name server",
    outcome:
      "Works until the client sells to that region, and “geoblocking scripts on just the form are buggy.” You maintain it per account, forever.",
  },
  {
    approach: "Adding qualifying fields",
    outcome:
      "Buys quality by costing you real buyers. It also raises cost per lead, which is the number in the deck you are about to present.",
  },
  {
    approach: "Duplicate forms split by UTM",
    outcome:
      "The only way anyone currently A/B tests a form, and it still ranks the winner on fills — the number that cannot tell a buyer from a bot.",
  },
];

const changes = [
  {
    href: "/features/submission-provenance",
    name: "Origin",
    body: "Every submission carries Human, Agent or Unverified as a field. On the monthly call you can say what share of last month’s submissions came from something that could not identify itself — a sentence that changes the meeting, because it is about the account rather than about your work.",
  },
  {
    href: "/features/lead-outcomes",
    name: "Verdict",
    body: "The client’s CRM writes the outcome back onto the submission — or one webhook does, if their CRM is a spreadsheet and a rep’s memory. You stop finding out that the leads were bad from the client, three weeks after they knew.",
  },
  {
    href: "/features/form-analytics",
    name: "Yield",
    body: "Cost per lead is the number on the slide. Yield value — revenue per 100 submissions — is the number the renewal actually turns on. Having both in the same report is the difference between defending a campaign and explaining one.",
  },
];

export default function AgenciesPage() {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <PageHeader
        eyebrow="For agencies"
        title="You find out the leads were garbage on the client call."
        lead={
          <>
            You built the page, you built the form, you bought the traffic, and the dashboard
            said it worked. Then the client&rsquo;s sales team called the list. Endpoint Forms
            is a form builder for the part of that job nobody sells a tool for.
          </>
        }
        meta={
          <p className="max-w-[62ch] border-l border-border-control pl-4 text-sm text-muted-foreground">
            Endpoint Forms is pre-launch. There is no account to open and no agency using this
            today &mdash; this page describes what it is for, not what it has done.
          </p>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <div className="flex max-w-[68ch] flex-col gap-5 text-base text-foreground">
          <h2 className="text-h3 sm:text-h2">The shape of the month</h2>
          <p>
            You are running somewhere between five and twenty-five accounts at once. For most
            of them you own the landing page and the form as well as the media, usually built
            in whatever tool the client already pays for, which is a different tool for each
            client. Every month there is a call with a dashboard in it.
          </p>
          <p>
            The dashboard is fine. Cost per lead is down. Volume is up. And then somebody from
            the client&rsquo;s side says the leads are junk, and you are arguing about
            something you have no instrumentation for.
          </p>

          <figure className="border-l-2 border-foreground pl-5 sm:pl-6">
            <blockquote className="text-base text-foreground">
              &ldquo;Cost per lead is amazing. Under $15 per lead. Sales are struggling with
              the leads. Loads of people seem to sign up and leave their details but when sales
              try and phone them or message on WhatsApp nothing. They leave relevant enquiries
              but seem to ghost off the bat.&rdquo;
            </blockquote>
            <figcaption className="mt-3 font-mono text-label uppercase text-muted-foreground">
              u/AfraidGuarantee5858 &middot; B2B agency &middot; r/PPC, Nov 2025
            </figcaption>
          </figure>

          <p>
            The specific cruelty of this job is that the pain arrives once per client. An
            in-house marketer has one bad month. You have the same bad month across a portfolio
            and have to explain it a dozen separate times, to a dozen people who each think it
            is happening only to them.
          </p>
          <p>
            And you are not being paid on cost per lead. You are being paid on renewal, and the
            account renews or churns on whether the client&rsquo;s sales team believes the
            leads are real. Those two numbers routinely disagree, and you currently find out
            about the disagreement from the client &mdash; which is the worst possible way to
            find out.
          </p>
        </div>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <h2 className="text-h3 sm:text-h2">What you have already tried</h2>
        <p className="mt-4 max-w-[62ch] text-base text-muted-foreground">
          All of this is from people doing your job, in public. None of it is a strawman, and
          most of it is worth keeping.
        </p>
        <dl className="mt-10 border-t border-border">
          {tried.map((item) => (
            <div
              key={item.approach}
              className="grid grid-cols-1 gap-2 border-b border-border py-6 md:grid-cols-[minmax(0,22rem)_1fr] md:gap-10"
            >
              <dt className="text-base text-foreground">{item.approach}</dt>
              <dd className="max-w-[58ch] text-base text-muted-foreground">{item.outcome}</dd>
            </div>
          ))}
        </dl>
        <figure className="mt-8 max-w-[68ch] border-l-2 border-foreground pl-5 sm:pl-6">
          <blockquote className="text-base text-foreground">
            &ldquo;Aside from using Cloudflare name servers to geo-block, there&rsquo;s no real
            successful way to stop spam bots from just constantly submitting spam entries. Most
            of my clients deal with this. Captcha feels worthless. Honeypot traps don&rsquo;t
            always work.&rdquo;
          </blockquote>
          <figcaption className="mt-3 font-mono text-label uppercase text-muted-foreground">
            u/kjdscott &middot; agency developer &middot; r/Entrepreneur, Sep 2025
          </figcaption>
        </figure>
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
        <p className="mt-8 max-w-[68ch] text-base text-muted-foreground">
          Two smaller things that came up repeatedly from people running client work: forms
          that look right under a client&rsquo;s brand without a Fiverr CSS job, and more than
          one person able to edit them without an enterprise contract. Neither is clever. Both
          are on the list because agencies keep saying they are the reason a tool gets dropped.
        </p>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <div className="max-w-[68ch] border border-border bg-card p-6 sm:p-8">
          <p className="font-mono text-label uppercase text-muted-foreground">
            What this doesn&rsquo;t fix
          </p>
          <div className="mt-4 flex flex-col gap-4 text-base text-muted-foreground">
            <p>
              If the offer is wrong or the page is vague, the leads will be a poor fit and no
              amount of measurement will change that. Putting a price range on the page filters
              more than four extra form fields do, it is free, and you should do it first.
            </p>
            <p>
              If a client&rsquo;s sales team never records what happened to a lead, there is no
              verdict to sync and the outcome half of this does nothing for that account. The
              bar is lower than a tidy CRM &mdash; one webhook, four values &mdash; but it is
              not zero.
            </p>
            <p>
              And on a small account, outcome volume is thin. You will get a report worth
              reading long before you get a split test that can honestly declare a winner. We
              would rather you knew which of those you are buying.
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
              One form. The one your paid traffic hits.
            </h2>
            <p className="mt-5 max-w-[56ch] text-base text-muted-foreground">
              Not a migration, and not every client. Point the highest-spend form at us, leave
              the rest of the stack alone, and see whether the composition of those submissions
              tells you something the current dashboard can&rsquo;t. Endpoint Forms is
              pre-launch &mdash; this is the waitlist, not a trial.
            </p>
            <WaitlistForm className="mt-8" />
          </div>

          <aside className="self-start border border-border bg-card p-6">
            <p className="font-mono text-label uppercase text-muted-foreground">
              Before you bother
            </p>
            <p className="mt-4 text-base text-foreground">
              If your clients&rsquo; forms are working and nobody is asking which leads were
              worth money, use Tally. It is free, it is good, and nothing here beats it for
              that.
            </p>
            <ul className="mt-5 flex flex-col gap-3 text-base">
              <li>
                <TextLink href={ARGUMENT_PATH}>
                  The argument this is built on, and the case against it
                </TextLink>
              </li>
              <li>
                <TextLink href="/features">The five capabilities</TextLink>
              </li>
              <li>
                <TextLink href="/solutions/in-house-ppc">
                  Running one account in-house instead?
                </TextLink>
              </li>
            </ul>
          </aside>
        </div>
      </Container>
    </main>
  );
}
