import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { WaitlistForm } from "@/components/waitlist-form";
import { ARGUMENT_PATH } from "@/lib/site";
import { FEATURES } from "@/app/(site)/features/_content";

const title = "Features";
const description =
  "Endpoint Forms is an open-source form builder for marketers: forms built to convert on paid traffic, data that goes where you need it, and five capabilities no other form builder has. Pre-launch — nothing here is running yet.";

export const metadata: Metadata = {
  title: `${title} — Endpoint Forms`,
  description,
  alternates: { canonical: "/features" },
  openGraph: {
    title: `${title} — Endpoint Forms`,
    description,
    type: "website",
    url: "/features",
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

const foundations = [
  {
    label: "Built to convert",
    body: "Multi-step, mobile-first, fast, and good enough looking to put in front of a client without writing custom CSS. These are forms that carry paid traffic, not a survey tool with a lead-gen mode bolted on.",
  },
  {
    label: "Logic that holds",
    body: "Conditional logic that still behaves past five conditions, with a readable logic view. It is the most common functional complaint in this category and nobody has claimed it.",
  },
  {
    label: "Data goes where you need it",
    body: "Native integrations rather than Zapier-only, clean webhook payloads with readable values, and a sync that fails loudly instead of quietly. A pipe that breaks silently is the same sin we accuse the category of.",
  },
  {
    label: "Yours to keep",
    body: "AGPL core, exports never paywalled on any plan including the free one, and no per-response tax. More on that on the open source page.",
  },
];

export default function FeaturesPage() {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <PageHeader
        eyebrow="Features"
        title="An open-source form builder for marketers."
        lead={
          <>
            High-converting website forms that pipe data wherever you need it &mdash; and five
            capabilities that exist because a form should be able to tell you who filled it out
            and what it turned out to be worth.
          </>
        }
        meta={
          <p className="max-w-[62ch] border-l border-border-control pl-4 text-sm text-muted-foreground">
            Endpoint Forms is pre-launch. Everything on these pages is specified and
            demonstrable, and none of it is running in an account you can sign up for. Each
            page says where that particular capability stands.
          </p>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <h2 className="text-h3 sm:text-h2">The five that are different</h2>
        <p className="mt-4 max-w-[62ch] text-base text-muted-foreground">
          Five plain nouns, none of them invented. They are what makes this better than the
          form builder you already have &mdash; not what it is.
        </p>

        <ul className="mt-10 grid grid-cols-1 border-y border-border md:grid-cols-2">
          {FEATURES.map((feature, index) => (
            <li
              key={feature.slug}
              className="border-b border-border py-7 last:border-b-0 md:odd:pr-8 md:even:border-l md:even:pl-8"
            >
              <p className="font-mono text-label uppercase text-muted-foreground">
                {String(index + 1).padStart(2, "0")} &middot; {feature.summary}
              </p>
              <h3 className="mt-4 text-h3">
                <TextLink
                  href={`/features/${feature.slug}`}
                >
                  {feature.name}
                </TextLink>
              </h3>
              <p className="mt-3 max-w-[52ch] text-base text-muted-foreground">
                {feature.definition}
              </p>
            </li>
          ))}
        </ul>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <h2 className="text-h3 sm:text-h2">The unglamorous half</h2>
        <p className="mt-4 max-w-[62ch] text-base text-muted-foreground">
          None of the five matters if the ordinary things are worse than what you use now. This
          is the part of the product that has to be boringly good, and the part we are least
          interested in writing a page about.
        </p>

        <dl className="mt-10 grid grid-cols-1 border-t border-border sm:grid-cols-2 lg:grid-cols-4">
          {foundations.map((item) => (
            <div
              key={item.label}
              className="border-b border-border py-6 sm:px-6 sm:first:pl-0 lg:border-r lg:last:border-r-0 lg:last:pr-0"
            >
              <dt className="font-mono text-label uppercase text-muted-foreground">
                {item.label}
              </dt>
              <dd className="mt-4 max-w-[34ch] text-base text-muted-foreground">
                {item.body}
              </dd>
            </div>
          ))}
        </dl>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <p className="font-mono text-label uppercase text-muted-foreground">Waitlist</p>
            <h2 className="mt-5 max-w-[22ch] text-h3 sm:text-h2">
              None of this is running yet.
            </h2>
            <p className="mt-5 max-w-[56ch] text-base text-muted-foreground">
              One email, when there is something to look at. If you would rather read the
              reasoning than the feature list, start with{" "}
              <TextLink href={ARGUMENT_PATH}>the argument</TextLink> &mdash; it includes the
              strongest objections to it.
            </p>
            <WaitlistForm className="mt-8" />
          </div>

          <aside className="self-start border border-border bg-card p-6">
            <p className="font-mono text-label uppercase text-muted-foreground">
              Who this is for
            </p>
            <p className="mt-4 text-base text-foreground">
              People running paid acquisition who get judged on what sales does with the leads.
            </p>
            <ul className="mt-4 flex flex-col gap-3 text-base">
              <li>
                <TextLink href="/solutions/agencies">
                  Agencies and freelancers running client accounts
                </TextLink>
              </li>
              <li>
                <TextLink href="/solutions/in-house-ppc">
                  In-house PPC and demand gen
                </TextLink>
              </li>
            </ul>
          </aside>
        </div>
      </Container>
    </main>
  );
}
