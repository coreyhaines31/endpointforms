import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { TextLink } from "@/components/text-link";
import { WaitlistForm } from "@/components/waitlist-form";
import { ARGUMENT_PATH, GITHUB_ISSUES_URL, GITHUB_URL } from "@/lib/site";

const title = "About";
const description =
  "Endpoint Forms is built by Corey Haines in San Diego, in the open. Who is behind it, why this problem, and who this product is deliberately not for.";

export const metadata: Metadata = {
  title: `${title} — Endpoint Forms`,
  description,
  alternates: { canonical: "/about" },
  openGraph: {
    title: `${title} — Endpoint Forms`,
    description,
    type: "profile",
    url: "/about",
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

const notFor = [
  {
    who: "One-off and casual forms",
    instead: "Use Tally. Event RSVPs, contact forms, internal requests — it’s free, it’s good, and nothing here beats it for that.",
  },
  {
    who: "Survey research",
    instead: "Use Typeform or a research tool. This whole product assumes a submission has a commercial outcome. Research responses don’t.",
  },
  {
    who: "Compliance procurement",
    instead: "Use FormAssembly or Formstack. If you need HIPAA or FedRAMP on day one, we are a general-purpose builder that overlooks it, on purpose, for now.",
  },
  {
    who: "Forms nobody follows up on",
    instead: "Nothing here works if no one ever calls the leads. The verdict has to come from somewhere.",
  },
];

export default function AboutPage() {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <PageHeader
        eyebrow="About"
        title="A named person is building this, in the open."
        lead={
          <>
            This is the most astroturfed corner of software I have ever worked in — 40–60%
            vendor plants on Reddit and a confirmed paid-shill ring. So: my name on it, a
            real person on the other end of the email, and a public repo.
          </>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <Prose>
          <h2>Who</h2>
          <p>
            I’m Corey Haines. I live in San Diego. I run{" "}
            <TextLink href="https://conversionfactory.co" external>
              Conversion Factory
            </TextLink>
            , a marketing agency, and{" "}
            <TextLink href="https://www.swipefiles.com" external>
              Swipe Files
            </TextLink>
            . Most of what I do professionally is look closely at other people’s funnels, and
            the rest of it is{" "}
            <TextLink href="https://corey.co" external>
              writing about marketing
            </TextLink>
            .
          </p>

          <h2>Why this</h2>
          <p>
            An agency is the customer in this story. You build the landing page and the form,
            you spend the money, you present the dashboard, and then someone on the client’s
            sales team tells you the leads are garbage. The number in your deck and the truth
            in their CRM disagree, and you find out about the disagreement from the client —
            which is the worst possible way to find out.
          </p>
          <p>
            When I went looking for who had solved that, the answer was nobody. Every form
            builder reports how many people finished. Not one of them knows what happened
            next, because knowing what happened next means accepting data from outside the
            form’s own boundary, and that is an architectural decision rather than a feature.
            The full case, with the receipts and the best arguments against it, is in{" "}
            <TextLink href={ARGUMENT_PATH}>the argument</TextLink>.
          </p>

          <h2>In the open</h2>
          <p>
            The core is AGPL-3.0 and the{" "}
            <TextLink href={GITHUB_URL} external>
              repository
            </TextLink>{" "}
            is public from before there was anything in it. The{" "}
            <TextLink href={GITHUB_ISSUES_URL} external>
              issues
            </TextLink>{" "}
            are the roadmap, including the ones where I’m wrong. If you think a premise here
            is bad, the argument is a better place to have it than a review site.
          </p>
        </Prose>
      </Container>

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <section className="border-t border-border pt-[clamp(2rem,4vw,3rem)]">
          <p className="font-mono text-label uppercase text-muted-foreground">
            Not for everyone
          </p>
          <h2 className="mt-5 max-w-[26ch] text-h3 sm:text-h2">
            Four kinds of buyer I’d rather send somewhere else than disappoint.
          </h2>

          <dl className="mt-10 grid grid-cols-1 border-t border-border md:grid-cols-2">
            {notFor.map((item) => (
              <div
                key={item.who}
                className="border-b border-border py-6 md:px-8 md:odd:pl-0 md:odd:border-r md:even:pr-0"
              >
                <dt className="text-h4 text-foreground">{item.who}</dt>
                <dd className="mt-3 max-w-[46ch] text-base text-muted-foreground">
                  {item.instead}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-8 max-w-[68ch] text-base text-foreground">
            Saying that out loud is cheap and it buys the right to be believed about the rest.
            Endpoint Forms is for people running paid acquisition who get judged on what sales
            does with the leads.
          </p>
        </section>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <div className="max-w-[68ch]">
          <p className="font-mono text-label uppercase text-muted-foreground">Waitlist</p>
          <h2 className="mt-5 max-w-[22ch] text-h3 sm:text-h2">
            One email, from me, when there’s something to look at.
          </h2>
          <WaitlistForm className="mt-8" />
        </div>
      </Container>
    </main>
  );
}
