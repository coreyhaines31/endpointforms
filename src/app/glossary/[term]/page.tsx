import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { Blocks } from "@/components/content-blocks";
import {
  GLOSSARY,
  GLOSSARY_HUB_PATH,
  getTerm,
  glossaryPath,
} from "@/lib/glossary";
import { SPAM_HUB_PATH, getSpamMethod, spamPath } from "@/lib/spam-methods";
import { SITE_URL, pageTitle } from "@/lib/site";

type PageProps = { params: Promise<{ term: string }> };

export function generateStaticParams() {
  return GLOSSARY.map((entry) => ({ term: entry.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { term: slug } = await params;
  const entry = getTerm(slug);
  if (!entry) return {};

  const url = glossaryPath(entry.slug);

  return {
    title: pageTitle(entry.term, "Endpoint Forms glossary"),
    description: entry.description,
    alternates: { canonical: url },
    openGraph: {
      title: pageTitle(entry.term, "Endpoint Forms glossary"),
      description: entry.description,
      type: "article",
      url,
      siteName: "Endpoint Forms",
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      images: ["/opengraph-image"],
      title: pageTitle(entry.term, "Endpoint Forms glossary"),
      description: entry.description,
    },
  };
}

export default async function GlossaryTermPage({ params }: PageProps) {
  const { term: slug } = await params;
  const entry = getTerm(slug);
  if (!entry) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: entry.term,
    description: entry.shortDef,
    url: `${SITE_URL}${glossaryPath(entry.slug)}`,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "Endpoint Forms glossary",
      url: `${SITE_URL}${GLOSSARY_HUB_PATH}`,
    },
  };

  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PageHeader
        eyebrow={`Glossary · ${entry.group}`}
        title={entry.term}
        lead={entry.shortDef}
        meta={
          <div className="flex flex-col gap-1 border-l border-border-control pl-4">
            {entry.aka ? (
              <p className="font-mono text-label uppercase text-muted-foreground">
                Also: {entry.aka}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {entry.ours ? (
                <>
                  A term we coined, not an industry standard.{" "}
                  <TextLink href={GLOSSARY_HUB_PATH}>
                    See the whole glossary
                  </TextLink>
                  .
                </>
              ) : (
                <>
                  One of {GLOSSARY.length} entries in the{" "}
                  <TextLink href={GLOSSARY_HUB_PATH}>Endpoint Forms glossary</TextLink>
                  .
                </>
              )}
            </p>
          </div>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <div className="max-w-[68ch]">
          <Section heading="Definition" first>
            <Blocks blocks={entry.definition} />
          </Section>

          <Section heading="Why it matters">
            <Blocks blocks={entry.whyItMatters} />
          </Section>

          <Section heading="In practice">
            <Blocks blocks={entry.inPractice} />
          </Section>

          <Section heading="The common mistake">
            <p className="-mt-2 mb-7 text-lead text-foreground">
              {entry.mistake.heading}.
            </p>
            <Blocks blocks={entry.mistake.blocks} />
          </Section>

          <section className="mt-[clamp(3rem,6vw,4.5rem)] border-t border-border pt-[clamp(2rem,4vw,3rem)]">
            <h2 className="font-mono text-label uppercase text-muted-foreground">
              Related terms
            </h2>
            <dl className="mt-6 border-t border-border">
              {entry.related.map((relatedSlug) => {
                const related = getTerm(relatedSlug);
                if (!related) return null;
                return (
                  <div key={relatedSlug} className="border-b border-border py-4">
                    <dt className="text-base text-foreground">
                      <TextLink href={glossaryPath(related.slug)}>
                        {related.term}
                      </TextLink>
                      {related.ours ? (
                        <span className="ml-3 font-mono text-label uppercase text-muted-foreground">
                          Ours
                        </span>
                      ) : null}
                    </dt>
                    <dd className="mt-2 max-w-[62ch] text-sm text-muted-foreground">
                      {related.shortDef}
                    </dd>
                  </div>
                );
              })}
            </dl>

            {entry.spam && entry.spam.length > 0 ? (
              <div className="mt-8">
                <h2 className="font-mono text-label uppercase text-muted-foreground">
                  Read alongside
                </h2>
                <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  {entry.spam.map((methodSlug) => {
                    const method = getSpamMethod(methodSlug);
                    if (!method) return null;
                    return (
                      <li key={methodSlug}>
                        <TextLink href={spamPath(method.slug)}>
                          {method.name}
                        </TextLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>

          <nav
            aria-label="Glossary"
            className="mt-[clamp(2.5rem,5vw,3.5rem)] flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-border pt-5 text-sm"
          >
            <TextLink href={GLOSSARY_HUB_PATH}>All {GLOSSARY.length} terms</TextLink>
            <TextLink href={SPAM_HUB_PATH}>Anti-spam teardowns</TextLink>
          </nav>
        </div>
      </Container>
    </main>
  );
}

function Section({
  heading,
  children,
  first,
}: {
  heading: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section
      className={
        first
          ? ""
          : "mt-[clamp(3rem,6vw,4.5rem)] border-t border-border pt-[clamp(2rem,4vw,3rem)]"
      }
    >
      <h2 className="text-h3 sm:text-h2">{heading}</h2>
      <div className="mt-7">{children}</div>
    </section>
  );
}
