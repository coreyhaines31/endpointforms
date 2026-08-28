import { Container } from "@/components/container";

const pillars = [
  {
    capability: "Handshake + Origin",
    claim: "Know who actually filled it out.",
    body: "Every submission arrives stamped human, agent, or unverified. Not guessed from mouse movement — known, because a legitimate agent submits through a tool surface the form publishes on purpose, and anything stuffing the human form while claiming to be software has told on itself.",
    aside:
      "CAPTCHA asks whether you can solve the puzzle. A $2 service solves it in 30 seconds. We ask who you are.",
  },
  {
    capability: "Verdict + Hindsight + Yield",
    claim: "Score your forms on what the leads were worth, not how many there were.",
    body: "Every submission gets a verdict back — won, lost, disqualified, and a value — from CRM sync or a one-line webhook. Split tests rank variants on Yield, not completion rate. The variant that produces revenue wins, even when it produces fewer fills.",
    aside:
      "Awaiting verdict is a first-class state. Most submissions will sit in it, and we’d rather show you that than a confident winner from n=12.",
  },
  {
    capability: "Pricing",
    claim: "You shouldn’t pay per submission when most submissions aren’t people.",
    body: "We’re not the cheapest — Tally is, and we won’t pretend otherwise. What we won’t do is meter you by the submission in a year when the majority of submissions are automated. Exports are never paywalled and the free tier isn’t a demo.",
    aside:
      "This is the reason you can say yes. It is never the reason to start looking.",
  },
];

export function Pillars() {
  return (
    <section className="py-[clamp(4rem,9vw,7rem)]">
      <Container>
        <p className="font-mono text-label uppercase text-muted-foreground">
          What the product does
        </p>
        <h2 className="mt-5 max-w-[26ch] text-h2 sm:text-display">
          A form that never learns what happened to the lead is a spreadsheet with a submit
          button.
        </h2>

        <div className="mt-12 grid grid-cols-1 border-t border-border md:grid-cols-3">
          {pillars.map((pillar) => (
            <article
              key={pillar.capability}
              className="border-b border-border py-8 md:border-b-0 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
            >
              <p className="font-mono text-label uppercase text-muted-foreground">
                {pillar.capability}
              </p>
              <h3 className="mt-4 text-h3">{pillar.claim}</h3>
              <p className="mt-4 text-base text-muted-foreground">{pillar.body}</p>
              <p className="mt-5 border-l border-border-strong pl-4 text-sm text-foreground">
                {pillar.aside}
              </p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
