import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { Blocks } from "@/components/content-blocks";
import { MethodScorecard } from "@/components/spam-scorecard";
import { WaitlistForm } from "@/components/waitlist-form";
import { getTerm, glossaryPath } from "@/lib/glossary";
import {
  SPAM_HUB_PATH,
  SPAM_METHODS,
  getSpamMethod,
  spamPath,
} from "@/lib/spam-methods";
import { ARGUMENT_PATH, SITE_URL, pageTitle } from "@/lib/site";

type PageProps = { params: Promise<{ method: string }> };

export function generateStaticParams() {
  return SPAM_METHODS.map((method) => ({ method: method.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { method: slug } = await params;
  const method = getSpamMethod(slug);
  if (!method) return {};

  const title = `Does ${method.name} stop form spam?`;
  const url = spamPath(method.slug);

  return {
    title: pageTitle(title),
    description: method.description,
    alternates: { canonical: url },
    openGraph: {
      title: pageTitle(title),
      description: method.description,
      type: "article",
      url,
      siteName: "Endpoint Forms",
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      images: ["/opengraph-image"],
      title: pageTitle(title),
      description: method.description,
    },
  };
}

const sections = [
  { id: "how-it-works", label: "How it works" },
  { id: "what-it-stops", label: "What it actually stops" },
  { id: "how-its-defeated", label: "How it’s defeated" },
  { id: "when-to-use", label: "When it’s still worth using" },
] as const;

export default async function SpamMethodPage({ params }: PageProps) {
  const { method: slug } = await params;
  const method = getSpamMethod(slug);
  if (!method) notFound();

  const index = SPAM_METHODS.findIndex((m) => m.slug === method.slug);
  const next = SPAM_METHODS[(index + 1) % SPAM_METHODS.length];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `${method.name}: what it stops and how it’s defeated`,
    description: method.description,
    url: `${SITE_URL}${spamPath(method.slug)}`,
    isPartOf: {
      "@type": "CollectionPage",
      name: "Anti-spam method teardowns",
      url: `${SITE_URL}${SPAM_HUB_PATH}`,
    },
    author: { "@type": "Person", name: "Corey Haines" },
    publisher: { "@type": "Organization", name: "Endpoint Forms" },
  };

  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PageHeader
        eyebrow={`Anti-spam teardown · ${method.family}`}
        title={method.name}
        lead={method.lead}
        meta={
          <div className="flex flex-col gap-1 border-l border-border-control pl-4">
            <p className="font-mono text-label uppercase text-muted-foreground">
              Corey Haines · San Diego · Aug 2026
            </p>
            <p className="text-sm text-muted-foreground">
              One of{" "}
              <TextLink href={SPAM_HUB_PATH}>
                {SPAM_METHODS.length} anti-spam teardowns
              </TextLink>
              . Bypass techniques change; this page states its date so you can
              judge how stale it is.
            </p>
          </div>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <div className="grid grid-cols-1 gap-y-12 lg:grid-cols-[minmax(0,68ch)_minmax(0,1fr)] lg:gap-x-16">
          <div className="lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:self-start">
            <nav aria-labelledby="on-this-page" className="border-t border-border pt-5">
              <h2
                id="on-this-page"
                className="font-mono text-label uppercase text-muted-foreground"
              >
                On this page
              </h2>
              <ol className="mt-4 grid grid-cols-1 gap-x-10 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {section.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="mt-10 border-t border-border pt-5">
              <h2 className="font-mono text-label uppercase text-muted-foreground">
                The short answer
              </h2>
              <p className="mt-4 text-base text-foreground">{method.shortAnswer}</p>
            </div>
          </div>

          <div className="lg:col-start-1 lg:row-start-1">
            <MethodScorecard scorecard={method.scorecard} />

            <Section id="how-it-works" heading="How it works">
              <Blocks blocks={method.howItWorks} />
            </Section>

            <Section id="what-it-stops" heading="What it actually stops">
              <Blocks blocks={method.whatItStops} />
            </Section>

            <Section id="how-its-defeated" heading="How it’s defeated">
              <Blocks blocks={method.howItsDefeated} />
            </Section>

            <Section id="when-to-use" heading="When it’s still worth using">
              <Blocks blocks={method.whenToUse} />
            </Section>

            <section className="mt-[clamp(3rem,6vw,4.5rem)] border-t border-border pt-[clamp(2rem,4vw,3rem)]">
              <h2 className="text-h3 sm:text-h2">What to pair it with</h2>
              <p className="mt-5 max-w-[68ch] text-base text-muted-foreground">
                No single method on this site is sufficient. These are the ones
                that fail differently enough to be worth running alongside it.
              </p>
              <dl className="mt-8 border-t border-border">
                {method.pairWith.map((pair) => {
                  const partner = getSpamMethod(pair.slug);
                  if (!partner) return null;
                  return (
                    <div key={pair.slug} className="border-b border-border py-5">
                      <dt className="text-base text-foreground">
                        <TextLink href={spamPath(partner.slug)}>
                          {partner.name}
                        </TextLink>
                      </dt>
                      <dd className="mt-2 max-w-[62ch] text-sm text-muted-foreground">
                        {pair.why}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>

            {method.concepts.length > 0 ? (
              <section className="mt-[clamp(2.5rem,5vw,3.5rem)]">
                <h2 className="font-mono text-label uppercase text-muted-foreground">
                  Concepts on this page
                </h2>
                <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  {method.concepts.map((conceptSlug) => {
                    const term = getTerm(conceptSlug);
                    if (!term) return null;
                    return (
                      <li key={conceptSlug}>
                        <TextLink href={glossaryPath(term.slug)}>{term.term}</TextLink>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <aside className="mt-[clamp(3rem,6vw,4.5rem)] border border-border bg-card p-6 sm:p-8">
              <p className="font-mono text-label uppercase text-muted-foreground">
                The thing every method here has in common
              </p>
              <p className="mt-4 text-base text-foreground">
                Each of these works at the door. Not one of them tells you what
                the submissions you <em>accepted</em> turned out to be — whether
                they were called, whether they were real, whether they closed.
                You can win the entire defensive war and still be unable to say
                which of your forms made money. That gap is what we are building
                for, and it is argued in full in{" "}
                <TextLink href={ARGUMENT_PATH}>the dishonest dashboard</TextLink>.
              </p>
              <WaitlistForm className="mt-6" />
            </aside>

            <nav
              aria-label="More teardowns"
              className="mt-[clamp(2.5rem,5vw,3.5rem)] flex flex-wrap items-baseline justify-between gap-4 border-t border-border pt-5 text-sm"
            >
              <TextLink href={SPAM_HUB_PATH}>All {SPAM_METHODS.length} teardowns</TextLink>
              <span className="text-muted-foreground">
                Next: <TextLink href={spamPath(next.slug)}>{next.name}</TextLink>
              </span>
            </nav>
          </div>
        </div>
      </Container>
    </main>
  );
}

function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="mt-[clamp(3rem,6vw,4.5rem)] scroll-mt-20 border-t border-border pt-[clamp(2rem,4vw,3rem)]"
    >
      <h2 className="text-h3 sm:text-h2">{heading}</h2>
      <div className="mt-7">{children}</div>
    </section>
  );
}
