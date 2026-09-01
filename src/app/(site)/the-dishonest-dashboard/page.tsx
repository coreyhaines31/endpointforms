import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { WaitlistForm } from "@/components/waitlist-form";
import { ARGUMENT_PATH, GITHUB_URL } from "@/lib/site";

const title = "The dishonest dashboard";
const description =
  "Every form builder reports completion rate. Completion rate is a count of submit events — it cannot tell a buyer from a bot, and in 2026 most of the traffic hitting your form is not a person. The argument, with the receipts, and the best counter-arguments against it.";

export const metadata: Metadata = {
  title: `${title} — Endpoint Forms`,
  description,
  alternates: { canonical: ARGUMENT_PATH },
  openGraph: {
    title: `${title} — Endpoint Forms`,
    description,
    type: "article",
    url: ARGUMENT_PATH,
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

const contents = [
  { id: "premise-1", label: "1 · What completion rate can see" },
  { id: "premise-2", label: "2 · Most of it isn’t a person" },
  { id: "premise-3", label: "3 · The defenses are defeated" },
  { id: "premise-4", label: "4 · Wrong in the flattering direction" },
  { id: "premise-5", label: "5 · The error compounds" },
  { id: "the-meter", label: "You are billed for the bots" },
  { id: "the-reframe", label: "The reframe" },
  { id: "objections", label: "The best arguments against this" },
  { id: "wrong", label: "What would prove me wrong" },
  { id: "numbers", label: "About these numbers" },
];

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
  { value: "30%", label: "of purchased leads", detail: "are outright fake." },
  { value: "13%", label: "of MQLs", detail: "ever become a real opportunity." },
];

export default function ArgumentPage() {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <PageHeader
        eyebrow="The argument"
        title={
          <>
            The dashboard says everything is fine. Sales says the leads are
            trash. One of them is lying.
          </>
        }
        lead={
          <>
            Every form builder on the market reports the same headline number.
            That number cannot tell you anything about the person who filled out
            the form — and in 2026 that is no longer a rounding error.
          </>
        }
        meta={
          <div className="flex flex-col gap-1 border-l border-border-control pl-4">
            <p className="font-mono text-label uppercase text-muted-foreground">
              Corey Haines · San Diego · Aug 2026
            </p>
            <p className="text-sm text-muted-foreground">
              Endpoint Forms is pre-launch and built in the open.{" "}
              <TextLink href="/about">Who is writing this</TextLink>.
            </p>
          </div>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <div className="grid grid-cols-1 gap-y-10 lg:grid-cols-[minmax(0,68ch)_minmax(0,1fr)] lg:gap-x-16">
          <nav
            aria-labelledby="contents-heading"
            className="border-t border-border pt-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:self-start"
          >
            <h2
              id="contents-heading"
              className="font-mono text-label uppercase text-muted-foreground"
            >
              Contents
            </h2>
            <ol className="mt-4 grid grid-cols-1 gap-x-10 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-1">
              {contents.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="lg:col-start-1 lg:row-start-1">
            <Body>
              <p className="text-lead text-foreground">
                Here is a thread I keep going back to. Someone had just switched
                on a new campaign.
              </p>

              <Quote
                attribution="OP · r/PPC · Oct 2025"
                text="The moment I uploaded and enabled everything, I started getting contact form submissions back to back. At first I thought it was working great… until the leads were called. Every single one has been junk or spam — fake info, not real customers. The odd thing is, I’m still getting charged for the clicks, Google is tracking form submissions as conversions, and everything looks normal from a reporting standpoint — but the leads are all trash."
              />

              <p>
                Read that second-to-last clause again.{" "}
                <em>Everything looks normal from a reporting standpoint.</em>{" "}
                The account was on fire and the dashboard was calm. Not broken —
                calm. It reported precisely what it was built to report, and
                what it was built to report turned out to be worthless.
              </p>

              <p>
                That gap has a cause, and the cause is not incompetence at
                Typeform or Tally or Jotform. It is a measurement convention the
                whole category inherited, one that made sense in 2015 and does
                not survive a web where most of the traffic isn’t human. The
                argument is five steps long. I have put the strongest objections
                to it further down, at full strength, because the best of them
                come from people who run more ad spend than I do.
              </p>
            </Body>

            <Premise
              id="premise-1"
              step="Premise 1 of 5"
              heading="Completion rate cannot tell a buyer from a bot"
            >
              <p>
                Completion rate is submit events divided by views. That is the
                entire definition. It has no access to who submitted and no
                access to what happened next. Definitionally, a bot fill and a
                $50,000 deal are the same row in the same table.
              </p>
              <p>
                This is not a bug in anyone’s implementation. The metric is
                doing exactly what it says on the tin. The problem is that it is
                also the number the category reports, optimizes, and — this is
                the part that stings — meters you by.
              </p>
              <p>
                One practitioner drew the distinction better than any vendor
                has:
              </p>
              <Quote
                attribution="u/kaancata · r/DigitalMarketing · May 2026"
                text="Form started, contact captured, form completed, visit booked, job won. Those are not the same quality of conversion."
              />
              <p>
                Five events. Your form builder can see the first three and
                stops. The two that decide whether the month was any good happen
                somewhere it has never looked.
              </p>
            </Premise>

            <Premise
              id="premise-2"
              step="Premise 2 of 5"
              heading="In 2026, most of what hits that form isn’t a person"
            >
              <p>
                Four numbers. These are the only ones I am going to use, and
                each one is a published third-party figure from 2025 or 2026,
                not a measurement of your account and not a measurement of mine.
              </p>

              <dl className="mt-8 grid grid-cols-1 border-t border-border sm:grid-cols-2">
                {figures.map((figure) => (
                  <div
                    key={figure.value}
                    className="border-b border-border py-5 sm:px-8 sm:odd:border-r sm:odd:pl-0 sm:even:pr-0"
                  >
                    <dt className="font-mono text-h3 tabular text-foreground">
                      {figure.value}
                    </dt>
                    <dd className="mt-2 max-w-[28ch] text-sm text-muted-foreground">
                      <span className="text-foreground">{figure.label}</span>{" "}
                      {figure.detail}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-8 flex flex-col gap-5">
                <p>
                  Automated requests are about 57.5% of HTML traffic against
                  42.5% human. Bad bots specifically were 40% of internet
                  traffic in 2025, up from 37%. Roughly 30% of leads bought from
                  third-party vendors are outright fake. And of the leads that
                  are real people, MQL to SQL converts at about 13%.
                </p>
                <p>
                  Stack those up and a raw form-fill count is in trouble before
                  anybody picks up a phone. The honest caveat: those are
                  internet-wide figures, not a reading off your form. I have no
                  idea what your split is. Neither does your form builder — and
                  that is the actual point. Nobody has been counting.
                </p>
              </div>
            </Premise>

            <Premise
              id="premise-3"
              step="Premise 3 of 5"
              heading="The defenses everyone recommends are already defeated"
            >
              <p>
                This is the angriest thing in the research, and the resolution
                is uniform: none of it works any more. Not according to me —
                according to the people running it.
              </p>
              <Quote
                attribution="u/AndyAndrei63 · r/webdev · Jan 2025"
                text="Captcha can easily be bypassed. I had a small web scraping app and using a service such as 2captcha you could bypass captcha in like max 30 seconds using puppeteer and javascript."
              />
              <Quote
                attribution="u/robwalte · r/marketing · Jun 2024"
                text="We have recaptcha enabled, and I have a honeypot, but it didn’t stop."
              />
              <Quote
                attribution="u/alexxxcazam · r/PPC"
                text="We have captcha on all of our forms, but it seems like these are real people submitting, just bad actors."
              />
              <Quote
                attribution="u/surfnsound · r/marketing · Jul 2023"
                text="I got 665 form fills on one page last night in an hour and sixteen minutes."
              />
              <Quote
                attribution="u/kjdscott · agency developer · r/Entrepreneur · Sep 2025"
                text="I think that’s the problem with contact form 7, wp forms, jotform, squarespace, and all others. They all are ok to get setup, some even offering SMTP setup. But none have nailed anti-spam to a science."
              />
              <p>
                One of them ended it the only way left:{" "}
                <em>
                  “We ended up taking down the page after 600 submissions.”
                </em>
              </p>
              <p>
                Now notice what every item on that list has in common. CAPTCHA,
                honeypots, hidden fields, geo-blocking at Cloudflare, paid
                anti-spam APIs — they are all attempts to block bad submissions{" "}
                <strong>at the door</strong>. Not one of them tells you what the
                submissions you accepted turned out to be. You can win the
                entire defensive war and still have no way to answer which of
                your forms made money.
              </p>
            </Premise>

            <aside className="mt-[clamp(3rem,6vw,4.5rem)] border border-border bg-card p-6 sm:p-8">
              <p className="font-mono text-label uppercase text-muted-foreground">
                Two premises to go
              </p>
              <p className="mt-4 text-base text-foreground">
                I am building the form builder this argument implies: every
                submission stamped with where it came from, and every submission
                carrying what your CRM said happened to it. It isn’t shipped.
                Leave an email and I’ll write once, when there’s something to
                look at.
              </p>
              <WaitlistForm className="mt-6" />
            </aside>

            <Premise
              id="premise-4"
              step="Premise 4 of 5"
              heading="So the report isn’t incomplete. It’s wrong, in the flattering direction."
            >
              <p>
                An incomplete report tells you less than you wanted to know.
                This one tells you something false and pleasant. Cost per lead
                is down. Conversions are up. The line on the chart goes the
                right way.
              </p>
              <Quote
                attribution="u/AfraidGuarantee5858 · B2B agency · r/PPC · Nov 2025"
                text="Cost per lead is amazing. Under $15 per lead. Sales are struggling with the leads. Loads of people seem to sign up and leave their details but when sales try and phone them or message on WhatsApp nothing… They leave relevant enquiries but seem to ghost off the bat."
              />
              <p>
                And the structural version of the same thing, which is the best
                sentence anyone in this research wrote:
              </p>
              <Quote
                attribution="u/Common_Dependent_284 · r/DigitalMarketing · May 2026"
                text="Marketing gets measured on CPL so they optimize for CPL. Sales get measured on closed deals. Nobody owns the middle."
              />
              <p>
                The tool is not neutral about that gap. It is congratulating you
                for the exact thing that is hurting you. That is the enemy in
                this essay — not a competitor, a convention. Every product in
                the category made the same design decision, and it was a
                reasonable one at the time.
              </p>
            </Premise>

            <Premise
              id="premise-5"
              step="Premise 5 of 5"
              heading="And then the wrong number gets handed to a machine that acts on it"
            >
              <Quote
                attribution="u/polygraph-net · r/marketing · Jul 2023"
                text="All those bot submissions were training Google’s/your ad network’s machine learning algorithm to send you more bot-like traffic."
              />
              <p>
                Once your conversion action is <em>form submitted</em>, every
                junk fill becomes a training example. You are paying an
                optimization engine to go and find more of the traffic that just
                wasted your sales team’s morning. The dishonest number does not
                sit still. It compounds, and it compounds on your card.
              </p>
            </Premise>

            <Premise
              id="the-meter"
              step="The part that makes it structural"
              heading="You are also billed for the bots"
            >
              <p>
                Every response cap in this category meters the one thing nobody
                can control: how many things submitted the form. A customer put
                it more sharply than I would have.
              </p>
              <Quote
                attribution="u/kjdscott · r/Entrepreneur · Sep 2025"
                text="If we stay on the current trajectory, websites will have to remove contact forms in the next few years due to the sheer volume of spam bots submissions. If your form software has a submission limit, bots are using it before real people even get a chance."
              />
              <p>
                Spam times response caps means you pay per response for traffic
                that will never buy anything, and then you pay again in sales
                time. That formulation is a customer’s, not mine, and it is the
                sharpest statement of the problem I have found anywhere.
              </p>
            </Premise>

            <Premise
              id="the-reframe"
              step="The conclusion"
              heading="The reframe"
            >
              <div className="mt-8 grid grid-cols-1 border-t border-border md:grid-cols-2">
                <div className="border-b border-border py-6 md:border-b-0 md:border-r md:pr-8">
                  <p className="font-mono text-label uppercase text-muted-foreground">
                    Before
                  </p>
                  <p className="mt-4 text-h4 text-foreground">
                    A form is measured by how many people complete it.
                  </p>
                </div>
                <div className="border-b border-border py-6 md:border-b-0 md:pl-8">
                  <p className="font-mono text-label uppercase text-muted-foreground">
                    After
                  </p>
                  <p className="mt-4 text-h4 text-foreground">
                    A form is measured by what those completions turned out to
                    be worth — and it should change based on the answer.
                  </p>
                </div>
              </div>
              <div className="mt-8 flex flex-col gap-5">
                <p>
                  Both halves matter, and the second one is the whole product.
                  “Measure outcomes” on its own is a report, and reports don’t
                  change anything.{" "}
                  <strong>“And it should change based on the answer”</strong> is
                  the part that, as far as I can find, nobody has built. The
                  research behind this went looking specifically for someone
                  feeding downstream outcome data back into which form variant,
                  which question, or which field they use, across roughly 40
                  Reddit threads, 150 software reviews and 20 Hacker News
                  comments. It found nobody doing it.
                </p>
                <p>
                  That is negative evidence, which is weaker than positive
                  evidence. It was a systematic search, not an assumption — but
                  if you are doing this today, I would genuinely like to hear
                  about it.
                </p>
              </div>
            </Premise>

            <Premise
              id="objections"
              step="Steelman"
              heading="The three best arguments against everything above"
            >
              <p>
                These come from practitioners, and I think all three are partly
                right. Weakening them here would only mean losing to them later.
              </p>

              <h3>
                1. “If unqualified people are booking, the form isn’t what’s
                broken. The page is.”
              </h3>
              <Quote
                attribution="u/Conscious-Market8982 · r/DigitalMarketing · Aug 2026"
                text="If unqualified people are booking, the form is not the thing that is broken, the page is. It has not told them who this is not for. Cheapest fix I know is putting a price or a range on the page… That filters more than four extra fields would."
              />
              <p>
                They are right, and it should be the first thing you do. A price
                on the page costs nothing, it works, and it filters better than
                four more required fields. I am not going to argue that a form
                can fix a page that never said who it was for.
              </p>
              <p>Three things it doesn’t do.</p>
              <p>
                <strong>It doesn’t work on bots.</strong> A price range
                disqualifies a human who reads it. Bots don’t read, and about
                57.5% of the requests hitting the page are automated. Nobody who
                took a page down after 600 submissions was going to be saved by
                a price range.
              </p>
              <p>
                <strong>It is one act of judgment with no feedback.</strong> You
                put the price on the page. Then what? You have a hypothesis and
                no instrument — and next month’s vibe check on the sales calls
                is not an instrument.
              </p>
              <p>
                <strong>It doesn’t scale across accounts.</strong> An agency
                running 20 clients can’t hand-tune 20 pages on intuition every
                month. It can instrument all 20 and let the outcome data say
                which ones need the intervention.
              </p>
              <p>
                So I am not competing with the page fix. I am how you find out
                the page fix worked.
              </p>

              <h3>2. “Every form element is a barrier to submission.”</h3>
              <Quote
                attribution="u/juzdeau · r/DigitalMarketing · Aug 2026"
                text="As little as possible. Every form element is a barrier to submission. My question is, why are those that are poor fit even trying to submit?"
              />
              <Quote
                attribution="u/Mike-Nicholson · r/DigitalMarketing · Aug 2026"
                text="It’s always struck me as amusing how much money B2B companies spend on marketing to drive enough interest that somebody might want to speak to sales, and then do everything they can to keep people away from sales."
              />
              <p>
                I agree with all of it, and it isn’t an objection to this — it’s
                an objection to a product I am deliberately not building. “Add
                three more fields to filter people out” is a pitch I will never
                make.
              </p>
              <p>
                Here is the substantive part. This objection and the category’s
                default behaviour are <em>both</em> unevidenced, and they point
                in opposite directions. Completion-rate optimization pushes you
                to strip fields. The lead-quality instinct pushes you to add
                them. Nobody in the research had data on which was right for
                their own account; the researcher flagged the
                multi-step-versus-single-step question as an open contradiction
                with no clean recent test behind it. The category’s central
                design belief is a guess.
              </p>
              <p>
                Outcome-weighted measurement is agnostic about the direction. If
                the shorter form produces more closed deals — and it very often
                will, because Mike is right — the outcome data says so and tells
                you to cut fields. This objection is an argument for an
                instrument, made by someone who doesn’t have one.
              </p>

              <h3>3. “Offline conversion import already does this.”</h3>
              <Quote
                attribution="u/ppcbetter_says · r/PPC · Jun 2026"
                text="Port qualified lead data, vs all leads, back to meta. Once you have at least 3 qualified leads per day reporting back to the platform, bid to qualified leads instead of form fills."
              />
              <p>
                Fully conceded. The ad-platform loop is solved, commoditized,
                and posted on r/PPC as assumed knowledge in a one-line reply.
                Anyone claiming to have invented it should be ignored, and that
                is exactly why this product does not lead with closing the loop
                to your ad platform.
              </p>
              <p>
                The residual is small and exact:{" "}
                <strong>
                  that loop teaches Google, and it teaches your form nothing.
                </strong>{" "}
                The variant, the question and the field are untouched by it. So
                if you already run offline conversion import — good, you’re
                ahead of most — here is the question it can’t answer: which of
                your form variants produced those closed deals?
              </p>
            </Premise>

            <Premise
              id="wrong"
              step="Self-implicating"
              heading="What would have to be true for me to be wrong"
            >
              <p>
                I am a form builder in a category drowning in form builders,
                writing about how the category is dishonest. That deserves some
                symmetry, so here are the three things most likely to sink this,
                written down before launch rather than after.
              </p>
              <p>
                <strong>Provenance may not beat a CAPTCHA in practice.</strong>{" "}
                The mechanism cleanly identifies a <em>cooperating</em> agent:
                software that calls the form’s tool surface announces itself by
                doing so. It does not obviously catch a residential-IP bot
                filling in the human page while mimicking mouse movement. If our
                stamp turns out to be no better than reCAPTCHA plus a honeypot
                against sales-verified junk, the headline collapses — because
                then ours can’t tell either. We say <em>unverified</em>, not{" "}
                <em>bot</em>, for exactly this reason. It is a suspicion, not a
                verdict.
              </p>
              <p>
                <strong>Outcome data may be too thin to test on.</strong> Closed
                deals are a much rarer event than form fills, and split testing
                on a rare event needs volume most accounts don’t have.
              </p>
              <Quote
                attribution="u/dillwillhill · r/PPC"
                text="Optimizing for qualified leads might help but I imagine your qualified lead volume will be too low to feed the algo enough."
              />
              <p>
                He’s right, and the honest answer is that at low volume the
                useful product is a ledger, not a test. Seeing that 200 fills
                produced 3 deals from one source and 0 from another is useful at
                any n. Declaring a winner from n=12 is the same lying dashboard
                in a different font, so we won’t.
              </p>
              <p>
                <strong>People may not file this under “form”.</strong> The
                tracking complaints in the research all land one layer up — GA4,
                GTM, the pixel, the CAPI event — not on the form tool. The pain
                is real. Whether anyone currently locates it in the form is an
                open question, and if the answer is no, then this essay is the
                education bill and I am paying it.
              </p>
            </Premise>

            <Premise
              id="numbers"
              step="Provenance"
              heading="About these numbers"
            >
              <p>
                Every quote here is verbatim from a public thread, with the
                handle and the month attached. I have not paraphrased anyone
                into agreeing with me, and where a quote cuts against the
                argument it is in the section where it cuts.
              </p>
              <p>
                Two widely-repeated figures about a competitor’s pricing are
                missing on purpose. I could not reconcile either against that
                company’s live pricing page, so they are not in here — which is
                a shame, because both would have helped. If a number in this
                essay is wrong, tell me and I’ll correct it in public. The whole
                argument is that reporting should be honest even when it’s
                unflattering; it would be strange to exempt my own.
              </p>
              <p>
                One more, for completeness: the agent half of this rests on
                WebMCP, which Google announced at I/O 2026 with an early preview
                in Chrome Canary in February 2026. Real agent traffic on your
                forms today is probably close to zero. The provenance argument
                has to stand on the bot half alone, and it does.
              </p>
            </Premise>

            <div className="mt-[clamp(4rem,9vw,6rem)] border-t border-border pt-[clamp(2.5rem,5vw,3.5rem)]">
              <p className="font-mono text-label uppercase text-muted-foreground">
                What I’m building
              </p>
              <h2 className="mt-5 text-h2">
                Every submission stamped with where it came from. Every
                submission carrying what happened to it.
              </h2>
              <p className="mt-6 text-base text-foreground">
                Endpoint Forms is a form builder for people running paid
                acquisition. One form definition publishes both a human page and
                a machine-callable tool surface, so every submission arrives
                stamped human, agent or unverified. Then every submission gets a
                verdict back from your CRM or a one-line webhook — won, lost,
                disqualified, and what it was worth — and your split tests rank
                on that instead of on completion rate.
              </p>
              <p className="mt-5 text-base text-foreground">
                It is not shipped. The core is AGPL-3.0 and you can{" "}
                <TextLink href={GITHUB_URL} external>
                  read the code
                </TextLink>{" "}
                as it gets written, or read{" "}
                <TextLink href="/open-source">
                  what open source means here
                </TextLink>
                . If your forms are working and nobody is asking hard questions
                about the leads, use Tally. It’s free and it’s good.
              </p>
              <WaitlistForm className="mt-9" note="Waitlist" />
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 text-base text-foreground">
      {children}
    </div>
  );
}

function Premise({
  id,
  step,
  heading,
  children,
}: {
  id: string;
  step: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="mt-[clamp(3rem,6vw,4.5rem)] scroll-mt-20 border-t border-border pt-[clamp(2rem,4vw,3rem)]"
    >
      <p className="font-mono text-label uppercase text-muted-foreground">
        {step}
      </p>
      <h2 className="mt-5 text-h3 sm:text-h2">{heading}</h2>
      <div className="mt-7 flex flex-col gap-5 text-base text-foreground [&_h3]:mt-6 [&_h3]:text-h4">
        {children}
      </div>
    </section>
  );
}

function Quote({ text, attribution }: { text: string; attribution: string }) {
  return (
    <figure className="border-l-2 border-foreground pl-5 sm:pl-6">
      <blockquote className="text-base text-foreground">“{text}”</blockquote>
      <figcaption className="mt-3 font-mono text-label uppercase text-muted-foreground">
        {attribution}
      </figcaption>
    </figure>
  );
}
