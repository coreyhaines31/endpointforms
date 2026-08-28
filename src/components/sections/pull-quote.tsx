import { Container } from "@/components/container";
import { TextLink } from "@/components/text-link";
import { ARGUMENT_PATH } from "@/lib/site";

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
          <p className="mt-8 max-w-[52ch] text-base text-muted-foreground">
            That quote is the sharpest version of the whole problem, and it belongs to a
            customer rather than to us.{" "}
            <TextLink href={ARGUMENT_PATH} className="text-foreground">
              The full argument, with the receipts and the best case against it
            </TextLink>
            .
          </p>
        </figure>
      </Container>
    </section>
  );
}
