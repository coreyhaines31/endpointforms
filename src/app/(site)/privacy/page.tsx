import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { TextLink } from "@/components/text-link";
import { GITHUB_URL } from "@/lib/site";

const title = "Privacy";
const description =
  "What Endpoint Forms collects right now: one email address, if you type it into the waitlist form, plus cookieless page counts on this site only. No cookies, no ad-platform audiences, and nothing at all on a form we host for a customer. Written specifically for what this site actually does.";

export const metadata: Metadata = {
  title: `${title} — Endpoint Forms`,
  description,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: `${title} — Endpoint Forms`,
    description,
    type: "website",
    url: "/privacy",
    siteName: "Endpoint Forms",
    images: ["/opengraph-image"],
  },
};

export default function PrivacyPage() {
  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <PageHeader
        eyebrow="Legal · Last updated 2026-08-28"
        title="Privacy"
        lead={
          <>
            This is short because we collect almost nothing. It describes this website as it
            is today — a pre-launch marketing site with a waitlist form on it. There is no
            product, no account, and no customer data yet.
          </>
        }
      />

      <Container className="mt-[clamp(3rem,6vw,4.5rem)]">
        <Prose>
          <h2>What we collect</h2>
          <p>
            Your email address, if you type it into the waitlist form and submit it. That is
            the only piece of personal information this site asks anyone for. No name, no
            company, no phone number, no job title.
          </p>
          <p>
            The form also contains one hidden field that your browser can see and you cannot.
            It exists to catch automated submissions. If it comes back filled in, we discard
            the whole submission and store nothing at all — including whatever was in it.
          </p>

          <h2>What we do with it</h2>
          <p>
            We store it so that we can email you when there is something to look at. That is
            the entire purpose. Realistically that is a handful of emails over the life of
            this waitlist, not a newsletter.
          </p>
          <p>
            We do not sell it, rent it, or trade it. We do not run it through an enrichment
            service to find out where you work. We do not upload it to Google, Meta or
            LinkedIn as a customer list, a custom audience or a seed for a lookalike audience.
            For a product whose entire argument is about who gets counted and how, quietly
            monetizing the people on the waitlist would be an odd way to begin.
          </p>

          <h2>Who else can see it</h2>
          <p>
            Two companies, both because they have to be involved for the thing to work: the
            email provider we use to send that email, and the hosting provider that runs this
            site (Vercel). Nobody else. If we ever add a third, this page changes before it
            does.
          </p>

          <h2>Analytics, cookies, and tracking</h2>
          <p>
            This page said “no analytics” until September 2026, and promised that if that
            changed it would change first and name the tool. It changed, so here is the tool:
            this site counts page views with{" "}
            <a href="https://usefathom.com" rel="noreferrer">Fathom Analytics</a>, loaded
            through <a href="https://tracerkit.com" rel="noreferrer">TracerKit</a>, which is
            our own tag manager. Still no Google Analytics, no Meta pixel, no session
            recording, no heatmaps.
          </p>
          <p>
            <strong>It does not run on a form we host for a customer.</strong> A hosted form is
            somebody else’s lead capture, on traffic they paid for; measuring their visitors
            would make us a third party on their page. The analytics tag is loaded by the
            marketing site alone, and a test in the repo fails the build if it ever becomes
            reachable from the form.
          </p>
          <p>
            Fathom is cookieless, and that is checkable rather than a promise we are asking you
            to take: the script it serves never touches <code>document.cookie</code>. It records
            the page you looked at, where you arrived from, and coarse device and country
            information, aggregated. It does not build a profile of you, follow you to other
            sites, or know who you are. The one thing it stores in your browser is a
            <code>blockFathomTracking</code> flag, and only if you opt out.
          </p>
          <p>
            This site sets no cookies. If you switch the theme, the word <code>light</code> or{" "}
            <code>dark</code> is saved in your browser’s local storage so the page doesn’t
            flash the wrong colours next time. That value never leaves your browser and is
            never sent to us.
          </p>
          <p>
            Our hosting provider keeps ordinary server request logs — IP address, user agent,
            the URL requested — for operational and security reasons. That is standard for any
            website and it is not something we read, analyse, or connect to your email address.
          </p>

          <h2>How long we keep it</h2>
          <p>
            Until you ask us to delete it, or until this waitlist has served its purpose and
            we have said so. If Endpoint Forms never ships, the list gets deleted rather than
            sold or repurposed.
          </p>

          <h2>Getting your address removed</h2>
          <p>
            Reply to any email we send you and say so — that is the fastest route and it goes
            to a person. If we have not emailed you yet and you want off the list already,
            get in touch through{" "}
            <TextLink href="https://corey.co" external>
              corey.co
            </TextLink>
            . Either way we delete the address itself, not just flag it as unsubscribed.
          </p>
          <p>
            If you are in the EU or UK, the rights you have under the GDPR — access,
            correction, deletion, portability, objection — apply to that one email address,
            and the same routes above are how you exercise them. There is nothing else on file
            to ask about.
          </p>

          <h2>You can check</h2>
          <p>
            The code that receives the waitlist form, validates it, and decides what to do with
            it is public. If you would rather read the handler than trust this page, it is in{" "}
            <TextLink href={GITHUB_URL} external>
              the repository
            </TextLink>
            .
          </p>

          <h2>Changes to this page</h2>
          <p>
            When this changes we will update the date at the top and say what changed rather
            than silently swapping the text. The moment there is a product, there will be a
            longer privacy policy that covers submissions, verdicts and CRM connections — and
            it will be written the same way this one was: about what the software actually
            does.
          </p>
        </Prose>
      </Container>
    </main>
  );
}
