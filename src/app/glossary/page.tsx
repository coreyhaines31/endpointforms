import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { WaitlistForm } from "@/components/waitlist-form";
import {
  GLOSSARY,
  GLOSSARY_GROUPS,
  GLOSSARY_HUB_PATH,
  glossaryPath,
  termsInGroup,
} from "@/lib/glossary";
import { SPAM_HUB_PATH } from "@/lib/spam-methods";
import { ARGUMENT_PATH, SITE_URL } from "@/lib/site";

const ours = GLOSSARY.filter((term) => term.ours);

const title = "Glossary";
const description =
  "Twenty-five concepts in form conversion, lead quality and conversion plumbing — each with a definition, why it matters, how it is actually measured, and the mistake people make. Five of them are words we coined, and they are marked as ours.";

export const metadata: Metadata = {
  title: `${title} — form conversion, lead quality and tracking — Endpoint Forms`,
  description,
  alternates: { canonical: GLOSSARY_HUB_PATH },
  openGraph: {
    title: `${title} — Endpoint Forms`,
    description,
    type: "website",
    url: GLOSSARY_HUB_PATH,
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
  "@type": "DefinedTermSet",
  name: "Endpoint Forms glossary",
  description,
  url: `${SITE_URL}${GLOSSARY_HUB_PATH}`,
  hasDefinedTerm: GLOSSARY.map((term) => ({
    "@type": "DefinedTerm",
    name: term.term,
    description: term.shortDef,
    url: `${SITE_URL}${glossaryPath(term.slug)}`,
  })),
};

const groupNotes: Partial<Record<(typeof GLOSSARY_GROUPS)[number], string>> = {
  Measurement: "The numbers a form reports, and what each one can and cannot see.",
  "Form mechanics": "How the form itself behaves, and what that behaviour costs.",
  "Lead quality": "What happens to a submission after it stops being a submission.",
  "Data plumbing":
    "How a lead gets from a browser to a CRM to an ad platform without losing the parts that matter.",
  Agents: "What changes when the thing filling in your form is not a person.",
  "Our vocabulary":
    "Five words we made up. They are not industry standards and we are not going to pretend otherwise.",
};

export default function GlossaryHubPage() {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PageHeader
        eyebrow="Glossary"
        title={<>The vocabulary of forms that are supposed to make money</>}
        lead={
          <>
            {GLOSSARY.length} concepts, each with a definition, why it matters,
            how it is actually measured, and the mistake people make. Nothing
            here is only a definition — if we had nothing to add, we left the
            term out.
          </>
        }
        meta={
          <div className="flex flex-col gap-1 border-l border-border-control pl-4">
            <p className="font-mono text-label uppercase text-muted-foreground">
              Corey Haines · San Diego · Aug 2026
            </p>
            <p className="text-sm text-muted-foreground">
              {ours.length} of these are words we coined. They are marked{" "}
              <span className="font-mono text-label uppercase">Ours</span> and
              carry a disclaimer on the page.
            </p>
          </div>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <div className="flex max-w-[68ch] flex-col gap-5 text-base text-foreground">
          <p className="text-lead">
            Most glossaries in this category are keyword pages with a paragraph
            attached. The rule for this one is that a page does not ship if all
            it does is define the term.
          </p>
          <p>
            So every entry has to carry something the first search result does
            not: a number, a quote from somebody who ran into it, or a judgment
            we are willing to be wrong about in public. Several are built on the
            research corpus behind this site — around forty threads and a
            hundred and fifty reviews — which means the page on{" "}
            <TextLink href={glossaryPath("form-abandonment")}>
              form abandonment
            </TextLink>{" "}
            can quote people describing it in their own words rather than citing
            a statistic nobody can source.
          </p>
          <p>
            Where a term is ours, the page says so at the top. Presenting our
            own vocabulary as though the industry already used it would be a
            small version of exactly the dishonesty this site is about — see{" "}
            <TextLink href={ARGUMENT_PATH}>the dishonest dashboard</TextLink>.
          </p>
        </div>
      </Container>

      {GLOSSARY_GROUPS.map((group) => {
        const terms = termsInGroup(group);
        if (terms.length === 0) return null;
        const id = group.toLowerCase().replace(/\s+/g, "-");

        return (
          <Container key={group} className="mt-[clamp(3rem,6vw,4.5rem)]">
            <section id={id} className="scroll-mt-20">
              <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
                <h2 className="text-h3 sm:text-h2">{group}</h2>
                <p className="max-w-[46ch] text-sm text-muted-foreground">
                  {groupNotes[group]}
                </p>
              </div>

              <ul className="mt-8 grid grid-cols-1 border-t border-border md:grid-cols-2 md:gap-x-12">
                {terms.map((term) => (
                  <li
                    key={term.slug}
                    className="border-b border-border py-5 md:border-t-0"
                  >
                    <h3 className="text-base">
                      <TextLink href={glossaryPath(term.slug)}>{term.term}</TextLink>
                      {term.ours ? (
                        <span className="ml-3 font-mono text-label uppercase text-muted-foreground">
                          Ours
                        </span>
                      ) : null}
                    </h3>
                    <p className="mt-2 max-w-[52ch] text-sm text-muted-foreground">
                      {term.shortDef}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </Container>
        );
      })}

      <Container className="mt-[clamp(3.5rem,7vw,5.5rem)]">
        <div className="flex max-w-[68ch] flex-col gap-5 text-base text-foreground">
          <h2 className="text-h3 sm:text-h2">Where to start</h2>
          <p>
            If you are here because your leads are junk, the practical route is
            the{" "}
            <TextLink href={SPAM_HUB_PATH}>anti-spam teardowns</TextLink> —
            twelve defenses taken apart, including the one that works and is not
            ours.
          </p>
          <p>
            If you are here because the numbers look fine and the pipeline does
            not, start with{" "}
            <TextLink href={glossaryPath("completion-rate")}>
              completion rate
            </TextLink>
            , then{" "}
            <TextLink href={glossaryPath("cost-per-lead")}>
              cost per lead
            </TextLink>{" "}
            — a metric that improves when your lead quality collapses — and then{" "}
            <TextLink href={ARGUMENT_PATH}>the argument</TextLink> those two
            pages are building toward.
          </p>
          <p>
            And if you would rather put your own numbers into it than read about
            it, the <TextLink href="/tools">calculators</TextLink> do the
            arithmetic these pages describe.
          </p>
        </div>

        <aside className="mt-[clamp(2.5rem,5vw,3.5rem)] max-w-[68ch] border border-border bg-card p-6 sm:p-8">
          <p className="font-mono text-label uppercase text-muted-foreground">
            Endpoint Forms
          </p>
          <p className="mt-4 text-base text-foreground">
            An open-source form builder for marketers: high-converting website
            forms that pipe data wherever you need it — and tell you what the
            submissions turned out to be worth. It isn’t shipped. Leave an email
            and I’ll write once, when there’s something to look at.
          </p>
          <WaitlistForm className="mt-6" />
        </aside>
      </Container>
    </main>
  );
}
