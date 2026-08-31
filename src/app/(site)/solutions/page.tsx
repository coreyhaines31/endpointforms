import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { ARGUMENT_PATH } from "@/lib/site";

const title = "Who this is for";
const description =
  "Endpoint Forms is built for two jobs: agencies and freelancers running paid acquisition for clients, and in-house PPC and demand gen at B2B companies. And three it is deliberately bad at.";

export const metadata: Metadata = {
  title: `${title} — Endpoint Forms`,
  description,
  alternates: { canonical: "/solutions" },
  openGraph: {
    title: `${title} — Endpoint Forms`,
    description,
    type: "website",
    url: "/solutions",
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

const audiences = [
  {
    href: "/solutions/agencies",
    label: "Agencies and freelancers",
    body: "Five to twenty-five client accounts, you own the page and the form as well as the media, and the leads get judged by somebody else’s sales team on a call you are on.",
  },
  {
    href: "/solutions/in-house-ppc",
    label: "In-house PPC and demand gen",
    body: "One account, more budget authority, and a scorecard that measures cost per lead while the sales team next to you is measured on closed deals.",
  },
];

const notFor = [
  {
    who: "One-off and casual forms",
    instead: "Use Tally. It is free, it is genuinely good, and nothing here beats it for an RSVP or a contact form.",
  },
  {
    who: "Survey research",
    instead: "Use Typeform or a research tool. This product assumes a submission has a commercial outcome; a survey response doesn’t.",
  },
  {
    who: "Compliance procurement",
    instead: "Use FormAssembly or Formstack. If you need HIPAA or FedRAMP on day one, we are a general-purpose builder that overlooks it, on purpose, for now.",
  },
];

export default function SolutionsPage() {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <PageHeader
        eyebrow="Who this is for"
        title="Two jobs, described properly. And three we are bad at."
        lead={
          <>
            Endpoint Forms is for people running paid acquisition who get judged on what sales
            does with the leads. That is a narrower audience than &ldquo;anyone with a
            form,&rdquo; and saying so is cheaper than finding out later.
          </>
        }
        meta={
          <p className="max-w-[62ch] border-l border-border-control pl-4 text-sm text-muted-foreground">
            Endpoint Forms is pre-launch. These pages describe the job, not a customer.
          </p>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <ul className="grid grid-cols-1 border-t border-border md:grid-cols-2">
          {audiences.map((item) => (
            <li
              key={item.href}
              className="border-b border-border py-7 md:first:pr-8 md:last:border-l md:last:pl-8"
            >
              <h2 className="text-h3">
                <TextLink href={item.href}>
                  {item.label}
                </TextLink>
              </h2>
              <p className="mt-3 max-w-[46ch] text-base text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <h2 className="text-h3 sm:text-h2">Who should use something else</h2>
        <dl className="mt-8 border-t border-border">
          {notFor.map((item) => (
            <div
              key={item.who}
              className="grid grid-cols-1 gap-2 border-b border-border py-6 md:grid-cols-[minmax(0,22rem)_1fr] md:gap-10"
            >
              <dt className="text-base text-foreground">{item.who}</dt>
              <dd className="max-w-[58ch] text-base text-muted-foreground">{item.instead}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 max-w-[68ch] text-base text-muted-foreground">
          The reasoning behind all of it is in{" "}
          <TextLink href={ARGUMENT_PATH}>the argument</TextLink>, and the mechanisms are on{" "}
          <TextLink href="/features">the feature pages</TextLink>.
        </p>
      </Container>
    </main>
  );
}
