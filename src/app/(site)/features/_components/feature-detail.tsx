import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { WaitlistForm } from "@/components/waitlist-form";
import { ARGUMENT_PATH } from "@/lib/site";
import type { Feature } from "@/app/(site)/features/_content";

export function featureMetadata(feature: Feature): Metadata {
  const path = `/features/${feature.slug}`;
  const title = `${feature.name} — Endpoint Forms`;

  return {
    title,
    description: feature.description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description: feature.description,
      type: "website",
      url: path,
      siteName: "Endpoint Forms",
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      images: ["/opengraph-image"],
      title,
      description: feature.description,
    },
  };
}

type FeatureDetailProps = {
  feature: Feature;
  /**
   * The page's product mockup. Every one is drawn, not screenshotted, and every
   * one says so in its own frame — see src/components/mockup/frame.tsx. The
   * prose above and below carries the same point, so a reader who skips the
   * mockup entirely loses nothing.
   */
  mockup?: React.ReactNode;
};

export function FeatureDetail({ feature, mockup }: FeatureDetailProps) {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <Container className="pt-8">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2 font-mono text-label uppercase text-muted-foreground">
            <li>
              <TextLink href="/features" className="no-underline hover:underline">
                Features
              </TextLink>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-foreground">
              {feature.name}
            </li>
          </ol>
        </nav>
      </Container>

      <PageHeader
        className="pt-[clamp(2rem,4vw,3rem)]"
        eyebrow={feature.name}
        title={feature.title}
        lead={feature.lead}
      />

      <Container className="mt-[clamp(2.5rem,5vw,3.5rem)]">
        <div className="grid grid-cols-1 border-t border-border md:grid-cols-2">
          <div className="border-b border-border py-6 md:border-r md:pr-8">
            <p className="font-mono text-label uppercase text-muted-foreground">
              What it is
            </p>
            <p className="mt-4 max-w-[46ch] text-base text-foreground">
              {feature.definition}
            </p>
          </div>
          <div className="border-b border-border py-6 md:pl-8">
            <p className="font-mono text-label uppercase text-muted-foreground">
              Where this stands
            </p>
            <p className="mt-4 max-w-[46ch] text-base text-muted-foreground">
              {feature.status}
            </p>
          </div>
        </div>
      </Container>

      {mockup ? (
        <Container className="mt-[clamp(2.5rem,5vw,3.5rem)]">{mockup}</Container>
      ) : null}

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <h2 className="text-h3 sm:text-h2">How it works</h2>
        <ol className="mt-10 grid grid-cols-1 border-t border-border sm:grid-cols-2">
          {feature.how.map((item) => (
            <li
              key={item.step}
              className="border-b border-border py-7 sm:odd:pr-8 sm:even:border-l sm:even:pl-8"
            >
              <p className="font-mono text-label uppercase text-muted-foreground">
                {item.step}
              </p>
              <h3 className="mt-4 max-w-[28ch] text-h4">{item.heading}</h3>
              <p className="mt-3 max-w-[52ch] text-base text-muted-foreground">
                {item.body}
              </p>
            </li>
          ))}
        </ol>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <h2 className="text-h3 sm:text-h2">{feature.problem.heading}</h2>
        <div className="mt-8 flex max-w-[68ch] flex-col gap-5 text-base text-foreground">
          {feature.problem.body.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
          <figure className="border-l-2 border-foreground pl-5 sm:pl-6">
            <blockquote className="text-base text-foreground">
              &ldquo;{feature.problem.quote.text}&rdquo;
            </blockquote>
            <figcaption className="mt-3 font-mono text-label uppercase text-muted-foreground">
              {feature.problem.quote.attribution}
            </figcaption>
          </figure>
          <p>{feature.problem.close}</p>
          <p className="text-sm text-muted-foreground">
            The full case, including the strongest arguments against it, is in{" "}
            <TextLink href={ARGUMENT_PATH}>the argument</TextLink>.
          </p>
        </div>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <div className="max-w-[68ch] border border-border bg-card p-6 sm:p-8">
          <p className="font-mono text-label uppercase text-muted-foreground">
            The catch
          </p>
          <h2 className="mt-4 text-h4">{feature.limitation.heading}</h2>
          <div className="mt-4 flex flex-col gap-4 text-base text-muted-foreground">
            {feature.limitation.body.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>
        </div>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <h2 className="text-h3 sm:text-h2">What {feature.name} doesn&rsquo;t do</h2>
        <dl className="mt-8 border-t border-border">
          {feature.notThis.map((item) => (
            <div
              key={item.claim}
              className="grid grid-cols-1 gap-2 border-b border-border py-6 md:grid-cols-[minmax(0,26rem)_1fr] md:gap-10"
            >
              <dt className="text-base text-foreground">{item.claim}</dt>
              <dd className="max-w-[58ch] text-base text-muted-foreground">
                {item.detail}
              </dd>
            </div>
          ))}
        </dl>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <p className="font-mono text-label uppercase text-muted-foreground">
              Waitlist
            </p>
            <h2 className="mt-5 max-w-[22ch] text-h3 sm:text-h2">
              Nothing on this page is running yet.
            </h2>
            <p className="mt-5 max-w-[56ch] text-base text-muted-foreground">
              Endpoint Forms is pre-launch. Leave your email and we&rsquo;ll write once, when
              there&rsquo;s something to look at &mdash; not a drip sequence about {feature.name}.
            </p>
            <WaitlistForm className="mt-8" />
          </div>

          <aside className="self-start border border-border bg-card p-6">
            <p className="font-mono text-label uppercase text-muted-foreground">
              Related
            </p>
            <ul className="mt-4 flex flex-col gap-3 text-base">
              {feature.related.map((link) => (
                <li key={link.href}>
                  <TextLink href={link.href}>{link.label}</TextLink>
                </li>
              ))}
              <li>
                <TextLink href="/features">All five capabilities</TextLink>
              </li>
            </ul>
          </aside>
        </div>
      </Container>
    </main>
  );
}
