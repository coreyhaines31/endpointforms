/**
 * The five capability pages.
 *
 * H1s carry the brand noun; slugs carry search intent (docs/05 §3, marker 2).
 * Every claim here traces to docs/00-positioning-spine.md, docs/01-positioning.md
 * or docs/02-messaging.md. Nothing is invented — no statistics, no customers,
 * no capabilities. Quotes are verbatim from the VOC corpus with attribution.
 *
 * Naming constraints that are not negotiable:
 * - "Manifest", never "Handshake" (docs/12-trademark-screening.md).
 * - "Yield rate" / "Yield value", never "yield optimization" (Dynamic Yield).
 */

export type FeatureQuote = {
  text: string;
  attribution: string;
};

export type Feature = {
  slug: string;
  /** The brand noun. Shows as the eyebrow and in nav. */
  name: string;
  /** Sub-40-char summary for the hub grid. */
  summary: string;
  /** Page H1. */
  title: string;
  /** Deck under the H1. */
  lead: string;
  /** Metadata description. */
  description: string;
  /** One sentence, stated plainly, before anything else. */
  definition: string;
  /** Where this sits today. Every page says it. */
  status: string;
  how: { step: string; heading: string; body: string }[];
  problem: {
    heading: string;
    body: string[];
    quote: FeatureQuote;
    close: string;
  };
  limitation: { heading: string; body: string[] };
  /** Plain list of things this is not. */
  notThis: { claim: string; detail: string }[];
  related: { href: string; label: string }[];
};

export const FEATURES: Feature[] = [
  {
    slug: "submission-provenance",
    name: "Origin",
    summary: "Provenance on every submission.",
    title: "Every submission arrives knowing where it came from.",
    lead: "Origin is a field on the submission, not a score we guessed from mouse movement. Human, Agent, or Unverified — recorded at the moment it lands, exportable, filterable, and auditable in the source.",
    description:
      "Origin stamps every Endpoint Forms submission Human, Agent, or Unverified at the moment it arrives — a field on the record, not a spam score inferred from behaviour. Endpoint Forms is pre-launch.",
    definition:
      "Origin is a stamp on every submission with three values — Human, Agent, or Unverified — set by which surface the submission came through.",
    status:
      "Endpoint Forms is pre-launch. Origin is designed and specified; it is not running anywhere you can sign up for today.",
    how: [
      {
        step: "01",
        heading: "One form definition publishes two surfaces",
        body: "The form you build renders a page for people, and publishes a machine-callable tool definition for software. Same fields, same validation, same required rules. That second surface is Manifest, and it is the thing that makes Origin possible rather than probabilistic.",
      },
      {
        step: "02",
        heading: "The surface used is the stamp",
        body: "A submission through the human page, behaving like a browser session, is Human. A submission through the manifest, identifying itself as software, is Agent. Anything that submits the human form while behaving like software is Unverified — it told on itself by using the wrong door.",
      },
      {
        step: "03",
        heading: "Origin travels with the record",
        body: "It is a column in the dashboard, a field in the webhook payload, a column in the export, and a filter on every report. Not a badge in a UI you have to go look at.",
      },
      {
        step: "04",
        heading: "Unverified is quarantined, not deleted",
        body: "Suspect submissions land in a separate bucket. Not your CRM, not your conversion count, and not training your ad platform to send you more of the same. You can still read them, because sometimes we will be wrong.",
      },
    ],
    problem: {
      heading: "The problem it solves",
      body: [
        "Spam and junk leads are the angriest complaint in this category, and every defense people reach for asks the visitor to prove something rather than asking software to declare itself. CAPTCHA asks whether you can solve a puzzle. A $2 solving service answers that in about thirty seconds. Honeypots catch the naive scripts and nothing else.",
        "The people who have tried all of it say the same thing:",
      ],
      quote: {
        text: "We have recaptcha enabled, and I have a honeypot, but it didn’t stop.",
        attribution: "u/robwalte · B2B software company · r/marketing, Jun 2024",
      },
      close:
        "Origin does not raise the obstacle. It changes the question from “can you do the puzzle?” to “what are you?” — and gives the honest answer a clean way through instead of a harder maze.",
    },
    limitation: {
      heading: "The honest limitation",
      body: [
        "Unverified is a suspicion, not a verdict. That is why the value is called Unverified and not “Bot” — we report what we know, not what we assume. Real people will sometimes land there: hardened privacy browsers, aggressive extensions, corporate proxies, a person on a network we cannot read.",
        "That is the reason quarantine is a reviewable bucket rather than a delete. If you run a form where a false negative costs you a real deal, you should read the quarantine. We would rather build the feature that admits it can be wrong than the one that pretends it can’t.",
      ],
    },
    notThis: [
      {
        claim: "It is not a spam filter that promises zero spam.",
        detail:
          "Nothing promises that honestly. Origin makes the composition of your submissions visible and keeps the suspect ones out of the numbers that matter.",
      },
      {
        claim: "It does not tell you whether the person is a good fit.",
        detail:
          "A real human can still be a tire-kicker. Whether a submission was worth anything is Verdict’s job, and it can only be answered later.",
      },
      {
        claim: "It is not a behavioural risk score.",
        detail:
          "There is no 0–100 confidence number derived from typing cadence. Three values, set by which surface was used, and the rules that decide are in the open-source core so you can read them.",
      },
    ],
    related: [
      { href: "/features/agent-forms", label: "Manifest — the surface that makes Origin knowable" },
      { href: "/features/lead-outcomes", label: "Verdict — what the submission turned out to be worth" },
    ],
  },

  {
    slug: "agent-forms",
    name: "Manifest",
    summary: "The machine-callable surface every form publishes.",
    title: "Your form publishes a front door for software.",
    lead: "Real agents shake hands. Bots pick the lock. Every Endpoint Form publishes a manifest — a tool definition an agent can call directly — so software acting for a real buyer has a way in that isn’t pretending to be a browser.",
    description:
      "Manifest is the machine-callable tool surface every Endpoint Form publishes, so an agent acting for a real buyer can submit cleanly instead of driving your page. Endpoint Forms is pre-launch.",
    definition:
      "Manifest is the machine-callable surface a form publishes alongside its human page — one tool definition, generated from the same form, that an agent can call directly.",
    status:
      "Endpoint Forms is pre-launch, and this is the capability furthest from having a real user. It is a specification and a demo, not a shipped surface.",
    how: [
      {
        step: "01",
        heading: "You build one form",
        body: "You do not author a separate API contract, and there is no second place for the two to drift apart. The manifest is generated from the same definition that renders the page — the same fields, the same validation, the same required rules.",
      },
      {
        step: "02",
        heading: "The form declares itself to software",
        body: "The manifest is a tool definition in the shape agents already read (MCP, and WebMCP in the browser). An agent can discover what the form wants without scraping the DOM and inferring it from label text.",
      },
      {
        step: "03",
        heading: "The agent submits and gets a real answer",
        body: "A structured submission gets a structured response — accepted, or rejected with the specific field and reason. Not a re-rendered page with a red border the agent has to interpret.",
      },
      {
        step: "04",
        heading: "The call is stamped Agent",
        body: "Because it came through the declared surface, the submission carries an Agent origin and goes to your CRM tagged as such. There is a real buyer behind a lot of agent traffic, and the point is to let those through cleanly, not to block them.",
      },
    ],
    problem: {
      heading: "The problem it solves",
      body: [
        "Software already fills out your forms. Today it does so by driving a browser — which is exactly what a scraper does, which is why the only available defense is an obstacle course that punishes both. Legitimate automation and malicious automation are currently indistinguishable to your form, because neither one has a way to say which it is.",
        "The obstacle course, meanwhile, does not work on the party you were worried about:",
      ],
      quote: {
        text: "Captcha can easily be bypassed… using a service such as 2captcha you could bypass captcha in like max 30 seconds.",
        attribution: "u/AndyAndrei63 · r/webdev, Jan 2025",
      },
      close:
        "Publishing a manifest inverts it. The honest party has an easier path than the dishonest one for the first time, and anything still stuffing the human page while acting like software has made a choice you can now see.",
    },
    limitation: {
      heading: "The honest limitation",
      body: [
        "Agent traffic is not a large share of your form fills today, and we are not going to pretend otherwise. Google announced WebMCP at I/O 2026 and shipped an early preview in Chrome Canary in February 2026. That is a preview, in one browser channel, in 2026.",
        "The reason to build it now is that the provenance half pays for itself immediately regardless of agent volume — knowing which of last month’s submissions came from something that could not identify itself is useful today. The agent surface is the option you will want to already have, and we would rather say that than invent adoption numbers.",
      ],
    },
    notThis: [
      {
        claim: "It is not the form-building MCP the other tools ship.",
        detail:
          "Tally, Jotform and Typeform have MCP servers, and all three are build-a-form surfaces for the person authoring the form. This is a fill-a-form surface for a buyer’s agent. Different job, opposite direction.",
      },
      {
        claim: "It does not authenticate the human behind the agent.",
        detail:
          "The manifest tells you software submitted and identified itself. It cannot tell you whose software. That is what makes Verdict necessary rather than optional.",
      },
      {
        claim: "It is not a way to submit your forms for you.",
        detail:
          "We publish the surface. We do not run agents, sell agent traffic, or fill anybody’s forms.",
      },
    ],
    related: [
      { href: "/features/submission-provenance", label: "Origin — the stamp this surface makes possible" },
      { href: "/open-source", label: "Open source — read the code that decides the stamp" },
    ],
  },

  {
    slug: "lead-outcomes",
    name: "Verdict",
    summary: "The downstream outcome, written back onto the submission.",
    title: "The form finds out what happened to the lead.",
    lead: "Verdict is the outcome your CRM sends back — Won, Lost, Disqualified, or Awaiting verdict, with a value — written onto the original submission. It is the difference between a form that reports and a form that learns.",
    description:
      "Verdict syncs the downstream outcome — won, lost, disqualified, and a value — back onto the original form submission, from a CRM or a one-line webhook. Endpoint Forms is pre-launch.",
    definition:
      "Verdict is the outcome signal written back onto a submission after the fact: Won, Lost, Disqualified, or Awaiting verdict, plus a value.",
    status:
      "Endpoint Forms is pre-launch. Verdict is specified, and the integrations that would carry it are not built. There is no CRM you can connect today.",
    how: [
      {
        step: "01",
        heading: "The submission keeps an identity",
        body: "Every submission has an ID that goes downstream with the lead, so there is something to write an answer back onto later. This is the whole mechanism, and it is unglamorous on purpose.",
      },
      {
        step: "02",
        heading: "The outcome comes back from wherever the truth lives",
        body: "A CRM sync, or one webhook with four values and an amount. Not necessarily a CRM — a Slack workflow, a spreadsheet job, or a rep marking a call all qualify. We design for the messy version because the messy version is the common one.",
      },
      {
        step: "03",
        heading: "Awaiting verdict is a real state",
        body: "Most submissions sit in it, often for weeks. It is a first-class value rather than a null, because a report that quietly treats “we don’t know yet” as “no” is the same dishonesty we are complaining about.",
      },
      {
        step: "04",
        heading: "Everything downstream re-reads the submission",
        body: "Once a verdict lands, Yield and Hindsight recompute from it. The same record that was counted as a conversion at 9am can be counted as a disqualification in March, and the reporting changes accordingly.",
      },
    ],
    problem: {
      heading: "The problem it solves",
      body: [
        "The form is the last place anyone looks and the first place the information dies. Marketing is measured on cost per lead and optimises for it. Sales is measured on closed deals. The submission — the one object that both sides touched — never hears the ending.",
        "The clearest statement of it in our research:",
      ],
      quote: {
        text: "Marketing gets measured on CPL so they optimize for CPL. Sales get measured on closed deals. Nobody owns the middle.",
        attribution: "u/Common_Dependent_284 · r/DigitalMarketing, May 2026",
      },
      close:
        "Verdict is the middle. It does not reorganise anybody’s team; it just makes the submission the place the answer gets recorded, so the next question — which variant, which question, which field produced the money — becomes answerable at all.",
    },
    limitation: {
      heading: "The honest limitation",
      body: [
        "If nobody ever marks a lead’s status anywhere, Verdict has nothing to sync and this does not work for you. We would rather say that now than after you have migrated a form.",
        "The bar is lower than a clean CRM — one webhook and four values will do — but it is not zero. And the lag is real: a B2B deal that takes four months to close takes four months to produce a verdict, so early reports will be mostly Awaiting verdict, and we will show you that rather than a tidier number.",
      ],
    },
    notThis: [
      {
        claim: "It is not lead scoring.",
        detail:
          "Scoring is a prediction made at submit time from what the lead said about itself. A verdict is a record of what actually happened, made later, by someone who talked to them.",
      },
      {
        claim: "It is not enrichment or routing.",
        detail:
          "Verdict does not append firmographics or decide which rep gets the lead. Reform does qualification at capture and does it well; this is the other end of the timeline.",
      },
      {
        claim: "It is not primarily about your ad platform.",
        detail:
          "Pushing values to ad platforms may exist as a feature. It is not the point and never the headline — competent teams already run offline conversion import, and that loop teaches the platform while teaching the form nothing.",
      },
    ],
    related: [
      { href: "/features/form-analytics", label: "Yield — the metric verdicts make possible" },
      { href: "/features/form-split-testing", label: "Hindsight — split tests ranked on verdicts" },
    ],
  },

  {
    slug: "form-analytics",
    name: "Yield",
    summary: "Completion rate with the verdict applied.",
    title: "Two numbers you can show sales without flinching.",
    lead: "Yield rate is the share of submissions that reached a good verdict. Yield value is revenue per 100 submissions. Both sit next to completion rate rather than replacing it, because the gap between them is the finding.",
    description:
      "Yield rate and Yield value report submissions by what they turned out to be worth — quality-adjusted conversion rate and revenue per 100 submissions, sliceable by variant, question, field and traffic source. Endpoint Forms is pre-launch.",
    definition:
      "Yield is completion rate with the verdict applied — reported two ways: Yield rate, the share of submissions that reached a good verdict, and Yield value, revenue per 100 submissions.",
    status:
      "Endpoint Forms is pre-launch. These reports exist as a specification and a demo built on sample data, not on anyone’s account.",
    how: [
      {
        step: "01",
        heading: "Yield rate and completion rate are shown together",
        body: "Always both, never one replacing the other. A form at 41% completion and 4% Yield rate is not a form with a bad number — it is a form with two true numbers that disagree, and the disagreement is the thing worth looking at.",
      },
      {
        step: "02",
        heading: "Yield value puts money on it",
        body: "Revenue per 100 submissions, computed from the amounts on the verdicts. This is the number that survives being pasted into a deck, because it is denominated in the thing the person reading the deck is measured on.",
      },
      {
        step: "03",
        heading: "Both slice the way the form is built",
        body: "By variant, by question, by field, and by traffic source. Per-question drop-off crossed with Yield is how you find out that a required field is costing you more good leads than the bad ones it stops.",
      },
      {
        step: "04",
        heading: "The denominator is always visible",
        body: "Every Yield figure shows what it was computed from and how many submissions are still awaiting verdict. A percentage without its denominator is how a dashboard lies politely.",
      },
    ],
    problem: {
      heading: "The problem it solves",
      body: [
        "Every product in this category reports the same headline number, and that number counts a bot, a tire-kicker and a buyer identically. So the reporting can improve while the business gets worse, and nothing in the tool will mention it.",
        "The people running these campaigns already know the distinction exists. They just have nowhere to record it:",
      ],
      quote: {
        text: "Form started, contact captured, form completed, visit booked, job won. Those are not the same quality of conversion.",
        attribution: "u/kaancata · r/DigitalMarketing, May 2026",
      },
      close:
        "Yield is that sentence turned into a column. It is not a cleverer metric than completion rate — it is the same metric with the ending attached.",
    },
    limitation: {
      heading: "The honest limitation",
      body: [
        "Yield is only as good as your verdict coverage. If 8% of your submissions ever get an outcome, Yield rate is computed on 8% of your submissions, and we will print that fraction next to it rather than round it away.",
        "At low volume the number moves a lot, and it is easy to over-read. We would rather show you a wide, ugly, honest figure than a smooth one, and the report deliberately does not offer a confident headline the sample cannot support.",
      ],
    },
    notThis: [
      {
        claim: "It is not multi-touch attribution.",
        detail:
          "Yield says what happened to submissions from this form. It does not adjudicate credit across channels, and marketing attribution is a fight we are not picking.",
      },
      {
        claim: "It is not a replacement for your analytics stack.",
        detail:
          "It reports on submissions, not sessions. GA4, your ad platforms and your BI tool all keep their jobs.",
      },
      {
        claim: "It does not tell you why.",
        detail:
          "Yield shows you which variant, question or field is associated with worse outcomes. Working out the reason is still yours, and anything claiming otherwise is guessing on your behalf.",
      },
    ],
    related: [
      { href: "/features/lead-outcomes", label: "Verdict — where the outcome data comes from" },
      { href: "/features/form-split-testing", label: "Hindsight — split tests ranked on Yield" },
    ],
  },

  {
    slug: "form-split-testing",
    name: "Hindsight",
    summary: "Split tests scored on outcomes, not fills.",
    title: "Every form builder declares a winner before anyone has picked up the phone.",
    lead: "Hindsight split tests rank variants on Yield instead of completion rate. The winner cannot be known at the submit button, so we do not declare one there — we wait for the verdicts, and we say so while we are waiting.",
    description:
      "Hindsight split tests rank form variants on Yield — what the submissions turned out to be worth — instead of completion rate, and refuse to declare a winner before the outcomes are in. Endpoint Forms is pre-launch.",
    definition:
      "Hindsight is a split test that ranks variants on Yield rather than completion rate, and holds the result open until the verdicts come back.",
    status:
      "Endpoint Forms is pre-launch. Hindsight is the least-validated capability on this site, for a reason we spell out below.",
    how: [
      {
        step: "01",
        heading: "You run variants the ordinary way",
        body: "Two or more versions of a form, traffic split between them, no duplicate forms and no UTM bookkeeping. The unremarkable half, and it needs to be unremarkable.",
      },
      {
        step: "02",
        heading: "Both scoreboards stay on screen",
        body: "Completion rate and Yield, side by side, for every variant. The interesting result is when they disagree — the variant that wins on fills and loses on money is the exact mistake this feature exists to catch.",
      },
      {
        step: "03",
        heading: "The result stays open until verdicts land",
        body: "A Hindsight test does not congratulate you at n=12. Until enough submissions have outcomes, the test reports what it has and says plainly that it cannot call it yet.",
      },
      {
        step: "04",
        heading: "Nothing auto-applies before the numbers earn it",
        body: "No variant is promoted automatically on a sample that cannot support it. If your volume never gets there, the test stays a report — which is still more than you have now.",
      },
    ],
    problem: {
      heading: "The problem it solves",
      body: [
        "A split test that ranks on completion rate is optimising for the count of submit events. Run enough of them and you will systematically ship the shorter, easier, lower-friction variant — which is also the variant a bot completes fastest and a tire-kicker completes without thinking.",
        "The right test has already been named by practitioners; there has simply been no tool that runs it:",
      ],
      quote: {
        text: "I’d test form completion rate against qualified-call rate rather than guessing.",
        attribution: "u/TrafficAcademySEO · r/DigitalMarketing, Aug 2026",
      },
      close:
        "That is the test. Hindsight is what it looks like when the form runs it for you instead of you rebuilding it by hand out of duplicate forms and a spreadsheet.",
    },
    limitation: {
      heading: "The honest limitation",
      body: [
        "This is the hardest objection to the whole product and it deserves the plainest answer. Outcome volume is low. Below a few qualified leads a day, statistical significance on a Yield test is a fantasy — as one PPC practitioner put it about the adjacent idea: “Optimizing for qualified leads might help but I imagine your qualified lead volume will be too low to feed the algo enough.”",
        "There is a second problem, and it is ours to own: in the research behind this product, nobody described A/B testing their forms at all. Not badly, not by hand — not at all. Search volume for the idea is effectively zero. So this capability may be solving a problem people do not currently believe they have, and the report may end up mattering more than the test.",
      ],
    },
    notThis: [
      {
        claim: "It is not landing page testing.",
        detail:
          "Hindsight tests the form. If the traffic or the offer is the problem, this will not find it, and fixing the page first is usually cheaper.",
      },
      {
        claim: "It does not declare winners fast.",
        detail:
          "That is the feature, but it is worth stating as a cost: if you want a result by Friday, every other tool in the category will give you one, and it will be measuring fills.",
      },
      {
        claim: "It is not a bandit that quietly reallocates your traffic.",
        detail:
          "Automatic allocation on a metric that arrives weeks late would be a good way to be confidently wrong for a month.",
      },
    ],
    related: [
      { href: "/features/form-analytics", label: "Yield — the metric these tests rank on" },
      { href: "/features/lead-outcomes", label: "Verdict — what the test waits for" },
    ],
  },
];

export function getFeature(slug: string): Feature {
  const feature = FEATURES.find((item) => item.slug === slug);
  if (!feature) throw new Error(`Unknown feature slug: ${slug}`);
  return feature;
}
