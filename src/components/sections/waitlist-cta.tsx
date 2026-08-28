import { Container } from "@/components/container";
import { WaitlistForm } from "@/components/waitlist-form";

export function WaitlistCta() {
  return (
    <section id="waitlist" className="scroll-mt-20 py-[clamp(4rem,9vw,7rem)]">
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <div>
          <p className="font-mono text-label uppercase text-muted-foreground">Waitlist</p>
          <h2 className="mt-5 max-w-[20ch] text-h2 sm:text-display">
            Find out what your last 100 submissions were actually worth.
          </h2>
          <p className="mt-6 max-w-[56ch] text-lead text-muted-foreground">
            Endpoint Forms is pre-launch. Leave your email and we&rsquo;ll write once, when
            there&rsquo;s something to look at. Point one form at us &mdash; the one your paid
            traffic hits.
          </p>
          <WaitlistForm className="mt-9" />
        </div>

        <aside className="self-start border border-border bg-card p-6">
          <p className="font-mono text-label uppercase text-muted-foreground">
            Not for everyone
          </p>
          <p className="mt-4 text-base text-foreground">
            If you need one form for an event RSVP, use Tally &mdash; it&rsquo;s free and
            it&rsquo;s good. If you&rsquo;re running a survey, use Typeform. If procurement
            needs HIPAA on day one, use FormAssembly.
          </p>
          <p className="mt-4 text-base text-muted-foreground">
            This is for people running paid acquisition who get judged on what sales does with
            the leads. Come to us when someone starts asking which leads were worth money.
          </p>
        </aside>
      </Container>
    </section>
  );
}
