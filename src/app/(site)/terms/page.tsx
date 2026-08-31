import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { TextLink } from "@/components/text-link";
import { GITHUB_LICENSE_URL } from "@/lib/site";

const title = "Terms";
const description =
  "The terms for endpointforms.com as it exists today: a pre-launch marketing site with a waitlist. No product, no account, no payment — and joining the waitlist is not a promise of access or a price.";

export const metadata: Metadata = {
  title: `${title} — Endpoint Forms`,
  description,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: `${title} — Endpoint Forms`,
    description,
    type: "website",
    url: "/terms",
    siteName: "Endpoint Forms",
    images: ["/opengraph-image"],
  },
};

export default function TermsPage() {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <PageHeader
        eyebrow="Legal · Last updated 2026-08-28"
        title="Terms"
        lead={
          <>
            These cover this website only. There is no product to buy, no account to open and
            nothing to pay for yet, so most of what usually fills a terms page genuinely does
            not apply and has been left out rather than pasted in.
          </>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <Prose>
          <h2>What this site is</h2>
          <p>
            endpointforms.com is a marketing site for a form builder that has not shipped. It
            is operated by Corey Haines. Using the site means these terms apply to you, which
            is the usual arrangement and the only sentence in here that reads like a template.
          </p>

          <h2>The waitlist</h2>
          <p>
            Joining the waitlist means we will email you when there is something to see. It is
            not a contract, a pre-order, or a reservation. It does not guarantee access, a
            launch date, a price, a free tier, or that the product ever ships at all. If we
            abandon this, we will email the list and say so.
          </p>
          <p>
            When there is a product, it will have its own terms covering accounts, data
            processing, uptime and payment. Those will be a separate document you agree to
            separately. Nothing on this page commits you to them in advance.
          </p>

          <h2>What we say on this site</h2>
          <p>
            The statistics quoted here are third-party published figures and the quotes are
            verbatim from public forum threads, attributed to the handle that wrote them. The
            product numbers in the homepage demo are illustrative — they show what the product
            reports, not a result any customer got, and they are labelled that way where they
            appear.
          </p>
          <p>
            Nothing on this site is legal, financial or marketing advice, and none of it is a
            performance guarantee. If you find a factual error, tell us and we will correct it
            in public.
          </p>

          <h2>The software is licensed separately</h2>
          <p>
            The Endpoint Forms source code is licensed under AGPL-3.0. Your rights to use,
            modify and redistribute the code come from{" "}
            <TextLink href={GITHUB_LICENSE_URL} external>
              that license
            </TextLink>{" "}
            and nothing on this page adds to or subtracts from them. These terms cover the
            website; the license covers the software.
          </p>
          <p>
            The site’s written content, the Endpoint Forms name, and the logo are ours. Quote
            the writing, argue with it, and link to it freely — that is the point of publishing
            it. Please don’t republish it wholesale as your own or use the name and mark in a
            way that suggests we endorse something we don’t.
          </p>

          <h2>Using the form reasonably</h2>
          <p>
            Submit your own email address, not someone else’s. Don’t automate the form, script
            it, load-test it, or use it to send anything to anyone. We drop submissions that
            look automated without telling the sender, which is the polite version of a spam
            filter and is exactly what we would want a form to do.
          </p>

          <h2>No warranty, and the limit of what we owe you</h2>
          <p>
            This site is provided as-is. We do not promise it will be available, accurate or
            uninterrupted, and we may change or take down any part of it at any time,
            including this waitlist. To the extent the law allows, we are not liable for
            indirect or consequential losses arising from your use of the site. Since nothing
            here is sold, our total liability for anything connected to this site is capped at
            zero dollars — which is what you have paid — and none of this limits liability
            that cannot legally be limited.
          </p>

          <h2>Changes, and which law applies</h2>
          <p>
            When these terms change we will update the date at the top. They are governed by
            the laws of the State of California, and any dispute belongs in the state or
            federal courts in San Diego County, California.
          </p>
        </Prose>
      </Container>
    </main>
  );
}
