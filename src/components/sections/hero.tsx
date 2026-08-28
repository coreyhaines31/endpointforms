import { Container } from "@/components/container";
import { RecordJourney } from "@/components/mockup/record-journey";
import { WaitlistForm } from "@/components/waitlist-form";

const figures = [
  {
    value: "AGPL",
    label: "open source",
    detail: "Self-host it, or let us run it.",
  },
  {
    value: "No caps",
    label: "on responses",
    detail: "You shouldn't pay a tax per submission.",
  },
  {
    value: "Loudly",
    label: "is how syncs fail",
    detail: "A broken integration tells you.",
  },
];

export function Hero() {
  return (
    <section className="pt-[clamp(3.5rem,9vw,7rem)] pb-[clamp(3rem,6vw,4.5rem)]">
      <Container>
        <p className="font-mono text-label uppercase text-muted-foreground">
          Form builder · Pre-launch
        </p>

        <h1 className="mt-6 max-w-[19ch] text-display sm:text-display-xl lg:max-w-[22ch]">
          The open-source form builder for marketers.
        </h1>

        <p className="mt-7 max-w-[60ch] text-lead text-muted-foreground">
          Build high-converting forms for your website, and pipe the data wherever you
          need it &mdash; your CRM, your warehouse, a webhook. Open source, self-hostable,
          and it tells you when a sync breaks instead of failing quietly.
        </p>

        <WaitlistForm className="mt-10" note="Waitlist" />
      </Container>

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <RecordJourney />
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5.5rem)]">
        <dl className="grid grid-cols-1 border-t border-border sm:grid-cols-3">
          {figures.map((figure) => (
            <div
              key={figure.value}
              className="border-b border-border py-6 sm:border-b-0 sm:border-r sm:px-8 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0"
            >
              <dt className="font-mono text-h2 tabular text-foreground">{figure.value}</dt>
              <dd className="mt-2 max-w-[28ch] text-sm text-muted-foreground">
                <span className="text-foreground">{figure.label}</span> {figure.detail}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 max-w-[68ch] text-sm text-muted-foreground">
          The three things people actually complain about in every form-builder thread we
          read: price, broken integrations, and being locked in.
        </p>
      </Container>
    </section>
  );
}
