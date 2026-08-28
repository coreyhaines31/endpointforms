import { Container } from "@/components/container";
import { ProvenanceChip, type Origin } from "@/components/provenance-chip";

const states: { origin: Origin; means: string; then: string }[] = [
  {
    origin: "human",
    means: "A person filled out the page.",
    then: "Goes to your CRM and counts as a conversion.",
  },
  {
    origin: "agent",
    means:
      "Software submitted through the form’s handshake — the tool surface we publish on purpose — and identified itself.",
    then: "Goes to your CRM, tagged, because a real buyer may well be behind it.",
  },
  {
    origin: "unverified",
    means:
      "Something submitted the human form and couldn’t say what it was. We report what we know, not what we assume — this is a suspicion, not a verdict.",
    then: "Quarantined. Not your CRM, not your conversion count, not training your ad platform.",
  },
];

export function Provenance() {
  return (
    <section id="provenance" className="scroll-mt-20 pb-[clamp(4rem,9vw,7rem)]">
      <Container>
        <div className="border-t border-border pt-[clamp(3rem,6vw,5rem)]">
          <p className="font-mono text-label uppercase text-muted-foreground">Origin</p>
          <h2 className="mt-5 max-w-[24ch] text-h2 sm:text-display">
            We don&rsquo;t ask visitors to prove they&rsquo;re human. We ask software to say
            that it&rsquo;s software.
          </h2>
          <p className="mt-6 max-w-[62ch] text-lead text-muted-foreground">
            Real agents shake hands. Bots pick the lock. One form definition publishes both a
            human page and a machine-callable tool surface, so we know which one was used.
          </p>

          <dl className="mt-12">
            <div aria-hidden="true" className="hidden grid-cols-[13rem_1fr_1fr] gap-8 border-b border-border pb-3 md:grid">
              <span className="font-mono text-label uppercase text-muted-foreground">
                Origin
              </span>
              <span className="font-mono text-label uppercase text-muted-foreground">
                What it means
              </span>
              <span className="font-mono text-label uppercase text-muted-foreground">
                What happens to it
              </span>
            </div>

            {states.map((state) => (
              <div
                key={state.origin}
                className="grid grid-cols-1 gap-3 border-b border-border py-6 md:grid-cols-[13rem_1fr_1fr] md:gap-8"
              >
                <dt>
                  <ProvenanceChip origin={state.origin} />
                </dt>
                <dd className="text-base text-foreground">{state.means}</dd>
                <dd className="text-base text-muted-foreground">{state.then}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 max-w-[68ch] text-sm text-muted-foreground">
            The stamp is shape, label and colour together, in that order of importance. Colour
            alone can&rsquo;t tell three states apart for everyone reading, so it never has to.
          </p>
        </div>
      </Container>
    </section>
  );
}
