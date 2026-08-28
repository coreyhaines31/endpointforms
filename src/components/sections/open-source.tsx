import { Container } from "@/components/container";

const facts = [
  { label: "License", value: "AGPL-3.0" },
  { label: "Self-host", value: "One command" },
  { label: "Your data", value: "Exportable, always" },
  { label: "Status", value: "Not shipped yet" },
];

export function OpenSource() {
  return (
    <section id="open-source" className="scroll-mt-20 bg-sunken py-[clamp(4rem,9vw,7rem)]">
      <Container className="grid grid-cols-1 gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <div>
          <p className="font-mono text-label uppercase text-muted-foreground">Open source</p>
          <h2 className="mt-5 max-w-[22ch] text-h2 sm:text-display">
            The core is AGPL. Self-hosting is one command.
          </h2>
          <p className="mt-6 max-w-[58ch] text-lead text-muted-foreground">
            You can read the code that decides whether a submission is stamped human, agent
            or unverified. That&rsquo;s more than any hosted competitor offers, and it&rsquo;s
            the reason to trust a stamp at all.
          </p>
          <p className="mt-5 max-w-[58ch] text-base text-muted-foreground">
            The honest version: open-source form builders have historically been miserable to
            deploy &mdash; &ldquo;deploying them is much harder than signing up for their
            managed version&rdquo; is the consensus in our research. That specific gap is the
            one we intend to beat Formbricks and OpnForm on. Most people should still use the
            hosted version, which is what pays for the open one.
          </p>
        </div>

        <dl className="self-start border-t border-border">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex items-baseline justify-between gap-6 border-b border-border py-4"
            >
              <dt className="font-mono text-label uppercase text-muted-foreground">
                {fact.label}
              </dt>
              <dd className="font-mono text-base tabular text-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
