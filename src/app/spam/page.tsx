import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { WaitlistForm } from "@/components/waitlist-form";
import {
  FrictionCell,
  RatingCell,
  SCORECARD_ROWS,
} from "@/components/spam-scorecard";
import { GLOSSARY_HUB_PATH } from "@/lib/glossary";
import { SPAM_HUB_PATH, SPAM_METHODS, spamPath } from "@/lib/spam-methods";
import { ARGUMENT_PATH, SITE_URL, pageTitle } from "@/lib/site";

const title = "How to stop form spam";
const description =
  "Twelve anti-spam defenses, each taken apart: how it works, what it genuinely stops, and exactly how it is defeated — with the practitioners who watched it fail quoted by name. One of them works, and it isn’t ours.";

export const metadata: Metadata = {
  title: pageTitle(`${title}: 12 defenses assessed`),
  description,
  alternates: { canonical: SPAM_HUB_PATH },
  openGraph: {
    title: `${title} — Endpoint Forms`,
    description,
    type: "website",
    url: SPAM_HUB_PATH,
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

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Anti-spam method teardowns",
  description,
  url: `${SITE_URL}${SPAM_HUB_PATH}`,
  hasPart: SPAM_METHODS.map((method) => ({
    "@type": "TechArticle",
    name: method.name,
    url: `${SITE_URL}${spamPath(method.slug)}`,
    abstract: method.summary,
  })),
};

export default function SpamHubPage() {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PageHeader
        eyebrow="Anti-spam"
        title={
          <>Twelve ways to stop form spam, and what each one actually does</>
        }
        lead={
          <>
            Every one of these is recommended somewhere as the answer. One of
            them genuinely is — and we do not sell it. The rest are worth
            running, worth understanding, and worth being honest about.
          </>
        }
        meta={
          <div className="flex flex-col gap-1 border-l border-border-control pl-4">
            <p className="font-mono text-label uppercase text-muted-foreground">
              Corey Haines · San Diego · Aug 2026
            </p>
            <p className="text-sm text-muted-foreground">
              Written from ~22 independent practitioner accounts. Bypass
              techniques change; each page carries its date.
            </p>
          </div>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <div className="flex max-w-[68ch] flex-col gap-5 text-base text-foreground">
          <p className="text-lead">
            We mined about forty threads and a hundred and fifty reviews looking
            for what people complain about in form builders. Spam was not the
            most frequent complaint. It was the angriest one — and the only
            bucket where nobody had a solution.
          </p>
          <p>
            What made it worth writing about is that the failures are described
            so specifically. People do not say “CAPTCHA didn’t work.” They say
            which service solved it, how long it took, and what was running at
            the time. That level of detail is missing from every page currently
            ranking for these terms, and it is the only reason these teardowns
            are worth reading.
          </p>
          <figure className="border-l-2 border-foreground pl-5 sm:pl-6">
            <blockquote className="text-base text-foreground">
              “I think that’s the problem with contact form 7, wp forms, jotform,
              squarespace, and all others. They all are ok to get setup, some even
              offering SMTP setup. But none have nailed anti-spam to a science.”
            </blockquote>
            <figcaption className="mt-3 font-mono text-label uppercase text-muted-foreground">
              u/kjdscott · web developer / agency · r/Entrepreneur · Sep 2025
            </figcaption>
          </figure>
          <p>
            Each page below covers how the method works, what it genuinely
            stops, how it is defeated, when it is still worth using, and what to
            pair it with. Where a method works, we say so — the{" "}
            <TextLink href={spamPath("otp-verification")}>
              OTP verification page
            </TextLink>{" "}
            concludes that you should go and implement it, and that it is not a
            thing we are selling you.
          </p>
        </div>
      </Container>

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <h2 className="text-h3 sm:text-h2">The scorecard</h2>
        <p className="mt-5 max-w-[68ch] text-base text-muted-foreground">
          Four kinds of unwanted submission, and what each defense does about
          them. The last column is what the method costs the buyer you actually
          wanted.
        </p>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <caption className="sr-only">
              Anti-spam methods compared against four classes of unwanted
              submission, plus the friction each imposes on real visitors.
            </caption>
            <thead>
              <tr className="border-y border-border">
                <th scope="col" className="py-4 pr-6 align-bottom">
                  <span className="font-mono text-label uppercase text-muted-foreground">
                    Method
                  </span>
                </th>
                {SCORECARD_ROWS.map((row) => (
                  <th key={row.key} scope="col" className="py-4 pr-6 align-bottom">
                    <span className="font-mono text-label uppercase text-muted-foreground">
                      {row.label}
                    </span>
                  </th>
                ))}
                <th scope="col" className="py-4 align-bottom">
                  <span className="font-mono text-label uppercase text-muted-foreground">
                    Buyer friction
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {SPAM_METHODS.map((method) => (
                <tr key={method.slug} className="border-b border-border">
                  <th scope="row" className="py-4 pr-6 align-top font-normal">
                    <TextLink href={spamPath(method.slug)}>
                      {method.shortName}
                    </TextLink>
                  </th>
                  {SCORECARD_ROWS.map((row) => (
                    <td key={row.key} className="py-4 pr-6 align-top">
                      <RatingCell value={method.scorecard[row.key]} />
                    </td>
                  ))}
                  <td className="py-4 align-top">
                    <FrictionCell value={method.scorecard.friction} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 max-w-[68ch] text-sm text-muted-foreground">
          Read the bottom row carefully.{" "}
          <TextLink href={spamPath("taking-the-form-down")}>
            Removing the form
          </TextLink>{" "}
          is the only method here that scores yes on every column, and it is on
          this list because practitioners in our research actually did it. The
          perfect defense costs you the entire business the form was doing.
        </p>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5.5rem)]">
        <h2 className="text-h3 sm:text-h2">The teardowns</h2>
        <ol className="mt-8 border-t border-border">
          {SPAM_METHODS.map((method) => (
            <li key={method.slug} className="border-b border-border py-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:gap-8">
                <p className="font-mono text-label uppercase text-muted-foreground sm:w-28 sm:shrink-0">
                  {method.family}
                </p>
                <div className="max-w-[62ch]">
                  <h3 className="text-h4">
                    <TextLink href={spamPath(method.slug)}>{method.name}</TextLink>
                  </h3>
                  <p className="mt-2 text-base text-muted-foreground">
                    {method.summary}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5.5rem)]">
        <div className="flex max-w-[68ch] flex-col gap-5 text-base text-foreground">
          <h2 className="text-h3 sm:text-h2">
            What none of them can tell you
          </h2>
          <p>
            Every method on this page works at the door. CAPTCHAs, honeypots,
            timing rules, geo-blocks, rate limits, address checks, one-time
            codes — all of them are attempts to decide whether to <em>accept</em>{" "}
            a submission.
          </p>
          <p>
            Not one of them tells you what the submissions you accepted turned
            out to be. Whether they were called. Whether the number was real.
            Whether anybody bought anything. You can win the entire defensive
            war and still be unable to answer which of your forms made money,
            because that question is asked at a different time and no form
            builder is listening when the answer arrives.
          </p>
          <figure className="border-l-2 border-foreground pl-5 sm:pl-6">
            <blockquote className="text-base text-foreground">
              “Cost per lead is amazing. Under $15 per lead. Sales are struggling
              with the leads.”
            </blockquote>
            <figcaption className="mt-3 font-mono text-label uppercase text-muted-foreground">
              u/AfraidGuarantee5858 · B2B agency · r/PPC · Nov 2025
            </figcaption>
          </figure>
          <p>
            Every one of those people could have passed a CAPTCHA. Several of
            them would have passed an OTP check. Spam defense and lead quality
            are adjacent problems that get talked about as one, and conflating
            them is how a team ends up tuning a challenge for six months while
            the actual problem sits downstream, unmeasured.
          </p>
          <p>
            That argument, in full and with the counter-arguments at their
            strongest, is{" "}
            <TextLink href={ARGUMENT_PATH}>the dishonest dashboard</TextLink>.
            The vocabulary is in the{" "}
            <TextLink href={GLOSSARY_HUB_PATH}>glossary</TextLink>, and if you
            want to put a number on what the junk is costing you, the{" "}
            <TextLink href="/tools">calculators</TextLink> will do it.
          </p>
        </div>

        <aside className="mt-[clamp(2.5rem,5vw,3.5rem)] max-w-[68ch] border border-border bg-card p-6 sm:p-8">
          <p className="font-mono text-label uppercase text-muted-foreground">
            Endpoint Forms
          </p>
          <p className="mt-4 text-base text-foreground">
            An open-source form builder where every submission is stamped with
            where it came from and carries what your CRM said happened to it.
            It isn’t shipped. Leave an email and I’ll write once, when there’s
            something to look at.
          </p>
          <WaitlistForm className="mt-6" />
        </aside>
      </Container>
    </main>
  );
}
