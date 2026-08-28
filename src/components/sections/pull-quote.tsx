import { Container } from "@/components/container";

export function PullQuote() {
  return (
    <section className="pb-[clamp(4rem,9vw,7rem)]">
      <Container>
        <figure className="border-l-2 border-foreground pl-6 sm:pl-8 lg:ml-[28%]">
          <p className="font-mono text-label uppercase text-muted-foreground">
            From the research
          </p>
          <blockquote className="mt-6 max-w-[26ch] text-h3 text-foreground sm:text-h2">
            &ldquo;If your form software has a submission limit, bots are using it before
            real people even get a chance.&rdquo;
          </blockquote>
          <figcaption className="mt-6 font-mono text-sm text-muted-foreground">
            u/kjdscott &middot; agency developer &middot; r/Entrepreneur, Sep 2025
          </figcaption>
        </figure>
      </Container>
    </section>
  );
}
