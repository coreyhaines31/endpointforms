import { Container } from "@/components/container";
import { WaitlistForm } from "@/components/waitlist-form";

const figures = [
  {
    value: "57.5%",
    label: "of HTML requests",
    detail: "are automated, not human.",
  },
  {
    value: "40%",
    label: "of internet traffic",
    detail: "was bad bots in 2025, up from 37%.",
  },
  {
    value: "13%",
    label: "of MQLs",
    detail: "ever become a real opportunity.",
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
          Your form can&rsquo;t tell a buyer from a bot &mdash; and it&rsquo;s reporting
          both as conversions.
        </h1>

        <p className="mt-7 max-w-[60ch] text-lead text-muted-foreground">
          Endpoint Forms knows who filled out your form, and what the lead turned out to be
          worth. Every submission arrives stamped human, agent, or unverified. Every
          submission gets a verdict back from your CRM. Your split tests rank on that.
        </p>

        <WaitlistForm className="mt-10" note="Waitlist" />
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
          Verified figures, 2025&ndash;2026. Completion rate counts all of it the same way
          it counts a buyer.
        </p>
      </Container>
    </section>
  );
}
