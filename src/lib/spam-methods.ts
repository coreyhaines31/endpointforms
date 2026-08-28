import type { Block } from "@/lib/content-blocks";

/**
 * Anti-spam method teardowns — docs/09 Candidate 9, URL pattern from docs/05 §Tier 0.5.
 *
 * The rule these pages are written under: every defeat is attributed to a named
 * practitioner with a venue and a month, and every method gets a fair hearing on
 * what it genuinely does. `otp-verification` concludes that the method works, that
 * you should use it, and that it isn’t us. That concession is what makes the other
 * eleven believable — do not soften it.
 */

/** How completely a method handles one class of attacker. */
export type Rating = "yes" | "partial" | "no";

export type Friction = "none" | "low" | "medium" | "high";

export type Scorecard = {
  /** Scripted mass submitters that never render your page. */
  naiveBots: Rating;
  /** Headless browsers, solver services, residential proxies — aimed at you. */
  targetedBots: Rating;
  /** Paid humans doing it by hand. */
  humanFarms: Rating;
  /** Real people who are simply bad leads. */
  tireKickers: Rating;
  /** What it costs the real buyer. */
  friction: Friction;
};

export type SpamMethod = {
  slug: string;
  name: string;
  /** Column header form — short enough for the hub scorecard. */
  shortName: string;
  family: "Challenge" | "Trap" | "Gate" | "Filter" | "Last resort";
  /** Hub one-liner. */
  summary: string;
  /** <meta name="description">. Written from the page, never templated. */
  description: string;
  /** Page deck. */
  lead: string;
  /** The honest answer, above the fold, for someone who searched a question. */
  shortAnswer: string;
  scorecard: Scorecard;
  howItWorks: Block[];
  whatItStops: Block[];
  howItsDefeated: Block[];
  whenToUse: Block[];
  /** Other methods on this site that compose with this one. */
  pairWith: { slug: string; why: string }[];
  /** Glossary slugs this page uses as vocabulary. */
  concepts: string[];
};

export const SPAM_METHODS: SpamMethod[] = [
  {
    slug: "recaptcha-v2",
    name: "reCAPTCHA v2",
    shortName: "reCAPTCHA v2",
    family: "Challenge",
    summary:
      "The “I’m not a robot” checkbox. Still the default recommendation, still the most-cited failure in our research corpus.",
    description:
      "How reCAPTCHA v2 works, what it genuinely blocks, and how solver services defeat it for fractions of a cent — with the practitioners who watched it fail quoted directly.",
    lead: "The checkbox everyone reaches for first. It is free, it is two lines of markup, and five separate people in our research described watching it fail while it was switched on.",
    shortAnswer:
      "It still removes a meaningful share of unsophisticated automated volume, which is why it hasn’t disappeared. It does not stop anything aimed at you specifically, and it is the highest-friction thing you can put in front of a real buyer for that level of protection.",
    scorecard: {
      naiveBots: "yes",
      targetedBots: "no",
      humanFarms: "no",
      tireKickers: "no",
      friction: "high",
    },
    howItWorks: [
      {
        kind: "p",
        text: "reCAPTCHA v2 does most of its work before you ever see a puzzle. When the widget loads it scores the browsing session — cookie age, Google account state, IP reputation, pointer movement, timing between events — and if the score is comfortable the checkbox simply ticks. The image grid is the fallback, shown when the session looks unfamiliar.",
      },
      {
        kind: "p",
        text: "Your server then posts the returned token to Google’s `siteverify` endpoint, which answers pass or fail. That round trip is the whole security model: you are trusting Google’s judgment about the session, delivered as a boolean.",
      },
      {
        kind: "p",
        text: "Two consequences follow that people often miss. The check happens at the moment the form is submitted, so it can only ever be a door — it has no opinion about what happens to the submission afterwards. And the visitor’s browser talks to Google on every page carrying the widget, which is a data-protection conversation in the EU whether or not you wanted to have it.",
      },
    ],
    whatItStops: [
      {
        kind: "p",
        text: "It genuinely stops the cheapest thing in the market: scripted POSTs straight at your form handler by clients that never execute JavaScript. That class of traffic is enormous, indiscriminate, and it is the reason turning reCAPTCHA on usually produces a visible drop in volume on day one.",
      },
      {
        kind: "p",
        text: "That drop is real, and it is also the trap. It looks like the problem is solved, so the site owner stops looking — and the traffic that remains is the traffic that was aimed at them.",
      },
      {
        kind: "quote",
        text: "The contact form calls a php script to send the emails using phpmailer. I tried recaptcha, honeypot with no luck. I finally figured out that they were targeting the php file directly so i changed the name of the form and the spam stopped. I checked my logs and see they are now targeting the renamed php file.",
        attribution: "u/soupisgoode · r/webdev · Jan 2025",
      },
      {
        kind: "p",
        text: "Note what that describes: the widget was on the page and the attacker was never on the page. A challenge rendered in the browser protects the browser path. If your handler accepts a bare POST, the challenge is decoration.",
      },
    ],
    howItsDefeated: [
      {
        kind: "p",
        text: "Two ways, and they are not exotic. The first is a solver service — you send the challenge, a person or a model somewhere else solves it, you get a valid token back. The price is measured in fractions of a cent.",
      },
      {
        kind: "quote",
        text: "Captcha can easily be bypassed. I had a small web scraping app and using a service such as 2captcha you could bypass captcha in like max 30 seconds using puppeteer and javascript.",
        attribution: "u/AndyAndrei63 · r/webdev · Jan 2025",
      },
      {
        kind: "quote",
        text: "A captcha won’t do much as they’re trivial to bypass. For example, the bot framework Puppeteer Extra has a captcha solver plugin which only requires one line of code. … The form submissions aren’t from people — bots are responsible for most of the internets leads. They use real people’s information, so at a casual glance everything appears legit.",
        attribution: "u/polygraph-net · click-fraud detection · r/marketing · Jun 2024",
      },
      {
        kind: "p",
        text: "The second way needs no software at all. Pay people to click it.",
      },
      {
        kind: "quote",
        text: "To be honest even with captcha my site was loaded with spam, I am assuming there are spam farms where human labor is so cheap that they just do captchas all day long and spam an insane number of websites.",
        attribution: "u/Telion-Fondrad · r/webdev · Jan 2025",
      },
      {
        kind: "quote",
        text: "It’s innane. And its with a captcha and a Javascript powered form. They have someone fill out the captcha and plaster in their stupid messages.",
        attribution: "u/starcrescendo · runs a website company · r/webdev · Jan 2025",
      },
      {
        kind: "quote",
        text: "recaptcha v2 checkbox is pretty weak these days.",
        attribution: "u/muologys · r/webdev · Jan 2025",
      },
      {
        kind: "p",
        text: "And the case that closes the argument, because both defenses were running at once:",
      },
      {
        kind: "quote",
        text: "We ended up taking down the page after 600 submissions. … the company names sometimes don’t match up to the email domain, the domains might be misspelled versions of actual companies (itterable.com). We have recaptcha enabled, and I have a honeypot, but it didn’t stop.",
        attribution:
          "u/robwalte · B2B software company, 100–200 people · r/marketing · Jun 2024",
      },
      {
        kind: "note",
        label: "The asymmetry",
        text: "A solved challenge costs the attacker a fraction of a cent. An unsolved one costs your buyer somewhere between four seconds and the whole conversion. reCAPTCHA v2 is the only defense on this site where the real user pays more than the attacker does.",
      },
    ],
    whenToUse: [
      {
        kind: "p",
        text: "When you are being hit by indiscriminate volume and you have nothing else in place, it is free and it takes ten minutes. Turn it on, and treat the drop in volume as breathing room rather than as a fix.",
      },
      {
        kind: "p",
        text: "If you are choosing a challenge today and not merely keeping the one you inherited, [Cloudflare Turnstile](/spam/cloudflare-turnstile) does the same job for a fraction of the friction. There is no protection argument for v2 over Turnstile in 2026; there is only an integration-cost argument.",
      },
      {
        kind: "p",
        text: "Whatever you keep, move the check off the browser path too. Validate the token server-side on every route that writes a submission, including the one your JavaScript doesn’t use.",
      },
    ],
    pairWith: [
      {
        slug: "honeypot-fields",
        why: "Free, invisible, and catches a different class of client — the one that renders your page but reads the DOM rather than looking at it.",
      },
      {
        slug: "ip-rate-limiting",
        why: "Caps the worst hour. A challenge that is being solved at scale is still being solved one request at a time.",
      },
      {
        slug: "email-verification",
        why: "Catches the misspelled-domain pattern robwalte describes, which passes any challenge because a human typed it.",
      },
    ],
    concepts: ["hidden-field", "cost-per-lead", "completion-rate"],
  },

  {
    slug: "recaptcha-v3",
    name: "reCAPTCHA v3",
    shortName: "reCAPTCHA v3",
    family: "Challenge",
    summary:
      "The invisible one. It returns a score, not a decision — and almost every integration throws the score away.",
    description:
      "reCAPTCHA v3 returns a 0.0–1.0 risk score rather than blocking anything. Why the default 0.5 threshold is a number nobody calibrated, and why the score is worth more as data than as a gate.",
    lead: "No checkbox, no puzzle, no friction. v3 watches the session and hands your server a number between 0.0 and 1.0. What you do with that number is entirely up to you, which is the problem.",
    shortAnswer:
      "v3 does not block anything. It scores, and then your integration decides — and the overwhelming majority of integrations compare the score to 0.5 because 0.5 is what the documentation used in the example. That threshold has never been checked against your own traffic.",
    scorecard: {
      naiveBots: "yes",
      targetedBots: "no",
      humanFarms: "no",
      tireKickers: "no",
      friction: "none",
    },
    howItWorks: [
      {
        kind: "p",
        text: "v3 runs continuously rather than at a moment. It observes interactions across the page, builds a picture of the session, and returns a score where 1.0 means “behaves like the humans we know about” and 0.0 means “behaves like the automation we know about.” There is no challenge to fail, so there is nothing for the visitor to notice.",
      },
      {
        kind: "p",
        text: "Google’s own guidance is that the score is an input to your risk logic — show a challenge, require verification, route for review. What virtually every plugin and form builder does instead is `if (score < 0.5) reject`.",
      },
      {
        kind: "p",
        text: "That single line converts a ranking signal into a binary gate, which is the wrong use of it in both directions: it discards the ordering information that made the score useful, and it commits you to a cut-off you have never measured.",
      },
    ],
    whatItStops: [
      {
        kind: "p",
        text: "At the low end of the score range it is a reasonable detector of unsophisticated automation, and unlike v2 it costs your real visitors nothing to pass. On a form where you were previously running no defense at all, wiring v3 in and rejecting the bottom of the distribution will remove volume without removing conversions.",
      },
      {
        kind: "p",
        text: "What it stops after that depends on a decision you have to make with no information: where to put the line. Google does not publish what a 0.4 means in your industry, on your traffic, at your time of day, and it cannot — the model is calibrated globally and your form is not the world.",
      },
    ],
    howItsDefeated: [
      {
        kind: "p",
        text: "Directly, by the same market that defeats v2. Solver services sell v3 tokens with a target score attached; the way you produce a high-scoring token is to solve the challenge from an aged browser profile on a [residential IP](/glossary/hidden-field) that has a plausible history. Reputation is a model input, and model inputs are purchasable.",
      },
      {
        kind: "p",
        text: "But the more common failure is quieter, and it is the reason this page exists. v3 scores *unfamiliarity*, and the humans who look most unfamiliar to Google are the ones running a VPN, blocking third-party cookies, using Firefox in strict mode, or browsing from a corporate egress that thousands of colleagues share. That is a description of a security-conscious enterprise buyer.",
      },
      {
        kind: "p",
        text: "So raising the threshold to catch more bots starts rejecting your most valuable segment, and it does it silently — a v3 rejection produces no error the visitor understands and no row you ever see. You cannot tell the difference between “the threshold is working” and “the threshold is eating deals,” because both look like a lower number of submissions.",
      },
      {
        kind: "quote",
        text: "We have captcha on all of our forms, but it seems like these are real people submitting, just bad actors.",
        attribution: "u/alexxxcazam · r/PPC · Jul 2025",
      },
      {
        kind: "p",
        text: "And when the submitter really is a person, the score is high, correctly. v3 is a good model of whether a browser is being driven by a human. It has no view whatsoever on whether that human wants to buy anything.",
      },
    ],
    whenToUse: [
      {
        kind: "p",
        text: "Use it, and use it as a field rather than a filter. Store the score on the submission. Do not reject on it.",
      },
      {
        kind: "p",
        text: "That gives you three things a gate destroys. You can look at the score distribution on your own traffic and discover where your line actually belongs. You can route rather than reject — low scores go to a review queue or trigger [email verification](/spam/email-verification) instead of vanishing. And once a submission carries an outcome, you can ask the only question that settles it: did the low-scoring submissions convert worse?",
      },
      {
        kind: "p",
        text: "That last one is worth stating plainly, because it is the closest any incumbent defense comes to what we are building. The score is a prediction. The [verdict](/glossary/verdict) is what happened. A prediction you never grade is a number you are trusting for no reason.",
      },
      {
        kind: "note",
        label: "If you keep the gate",
        text: "Log every rejection with its score and its payload. A defense you cannot audit is a defense you cannot tune, and it is also the mechanism by which a form quietly stops working and nobody notices for a quarter.",
      },
    ],
    pairWith: [
      {
        slug: "honeypot-fields",
        why: "Catches DOM-reading fillers that score perfectly well, because they are driving a real browser.",
      },
      {
        slug: "time-traps",
        why: "The other signal worth storing rather than enforcing. Together they give you two independent axes to grade against outcomes.",
      },
      {
        slug: "otp-verification",
        why: "The right escalation for a low score. Verify rather than reject, and stop guessing.",
      },
    ],
    concepts: ["lead-scoring", "verdict", "outcome-webhook", "completion-rate"],
  },

  {
    slug: "hcaptcha",
    name: "hCaptcha",
    shortName: "hCaptcha",
    family: "Challenge",
    summary:
      "The privacy-positioned alternative. The honest reason to choose it is data protection, not protection.",
    description:
      "hCaptcha versus reCAPTCHA on the two things that actually differ: who receives your visitors’ data, and how much attacker tooling is aimed at it. Efficacy is not one of them.",
    lead: "Same integration shape as reCAPTCHA, same challenge format, different company and a different data-protection story. Whether it stops more spam is a narrower question than the marketing suggests.",
    shortAnswer:
      "hCaptcha stops roughly the same class of traffic as reCAPTCHA v2, for roughly the same friction, and is defeated by the same services. Its two real advantages are that Google is not in the request path and that less commodity tooling is tuned to it — and the second one erodes as it gets more popular.",
    scorecard: {
      naiveBots: "yes",
      targetedBots: "no",
      humanFarms: "no",
      tireKickers: "no",
      friction: "high",
    },
    howItWorks: [
      {
        kind: "p",
        text: "A widget renders a challenge — usually image classification — the visitor solves it, you receive a token, and your server verifies that token against hCaptcha’s endpoint. Architecturally it is a drop-in replacement for reCAPTCHA and the migration is typically an afternoon.",
      },
      {
        kind: "p",
        text: "The differences are commercial and legal rather than technical. hCaptcha sells the labelling work its challenges perform, is positioned explicitly on not building advertising profiles from your visitors, and offers paid tiers with additional risk signals. For a European site, moving the challenge off Google’s infrastructure removes a specific and recurring argument with legal.",
      },
    ],
    whatItStops: [
      {
        kind: "p",
        text: "The same commodity automation any rendered challenge stops: clients that do not execute the widget, and clients that execute it but cannot produce a valid token.",
      },
      {
        kind: "p",
        text: "There is one genuine, and genuinely temporary, edge. Attack tooling is built against the most common target, so at any moment the less-deployed challenge has slightly worse off-the-shelf support. That is a real effect and it is worth something. It is also the security value of being unpopular, and it expires on a schedule you do not control.",
      },
    ],
    howItsDefeated: [
      {
        kind: "p",
        text: "The solver market treats hCaptcha as a first-class target and has for years — the same services, the same browser-automation plugins, the same per-solve pricing. Nothing in the corpus distinguishes practitioner outcomes between the two; the complaints about challenges being solved are written about “captcha” generically, because from the site owner’s side they behave identically.",
      },
      {
        kind: "quote",
        text: "I think that’s the problem with contact form 7, wp forms, jotform, squarespace, and all others. They all are ok to get setup, some even offering SMTP setup. But none have nailed anti-spam to a science.",
        attribution: "u/kjdscott · agency developer · r/Entrepreneur · Sep 2025",
      },
      {
        kind: "p",
        text: "The human-farm path is untouched by the choice, because a person solving a puzzle does not care whose puzzle it is. And the accessibility cost is, if anything, slightly worse: hCaptcha’s image sets have a reputation among visually impaired users for being harder, and every additional round of “select all the buses” is a round in which a real buyer decides they will just call instead.",
      },
    ],
    whenToUse: [
      {
        kind: "p",
        text: "Choose it over reCAPTCHA when the deciding factor is where your visitors’ data goes. That is a real reason and it is sufficient on its own — you do not need to also believe it blocks more.",
      },
      {
        kind: "p",
        text: "Do not choose it over [Turnstile](/spam/cloudflare-turnstile) on privacy grounds without comparing them directly, because Turnstile makes a similar argument and asks the visitor for far less. The ordering that survives scrutiny is: Turnstile first, hCaptcha when you need a challenge that is not Cloudflare’s, reCAPTCHA when it is already installed and working well enough to leave alone.",
      },
    ],
    pairWith: [
      {
        slug: "honeypot-fields",
        why: "Zero-friction, and it costs nothing to run alongside any challenge.",
      },
      {
        slug: "disposable-email-blocking",
        why: "A solved challenge tells you a browser passed. The address is still the cheapest thing on the submission to sanity-check.",
      },
    ],
    concepts: ["completion-rate", "form-abandonment"],
  },

  {
    slug: "cloudflare-turnstile",
    name: "Cloudflare Turnstile",
    shortName: "Turnstile",
    family: "Challenge",
    summary:
      "The best of the challenges, and it is not close — mostly because it asks the visitor for nothing.",
    description:
      "Turnstile validates the browser rather than quizzing the person, which is why it costs almost no conversion. What that buys, and the exact thing browser attestation cannot see.",
    lead: "If you are going to run a challenge, run this one. It is free, it usually requires zero clicks, and it swaps the question “can you solve a puzzle” for “is this a real browser behaving normally.”",
    shortAnswer:
      "Turnstile is the strongest challenge available and the cheapest in friction, which makes it the right default. It validates the browser, not the person — so a real browser driven by a paid human passes it cleanly, every time.",
    scorecard: {
      naiveBots: "yes",
      targetedBots: "partial",
      humanFarms: "no",
      tireKickers: "no",
      friction: "low",
    },
    howItWorks: [
      {
        kind: "p",
        text: "Turnstile runs a set of non-interactive probes in the browser — lightweight proof-of-work, browser-integrity checks, behavioural signals — and combines them with what Cloudflare’s network already knows about the connection. Most visitors see a box that resolves itself and never touch it.",
      },
      {
        kind: "p",
        text: "You verify the resulting token server-side, exactly as with the others. If your site is already behind Cloudflare, the same dashboard carries WAF rules and rate limiting, so the pieces compose without a second vendor.",
      },
      {
        kind: "p",
        text: "The design choice worth naming: Turnstile is not trying to prove the visitor is human. It is trying to establish that the client is a genuine browser being used in a genuine way. That is a narrower claim, and it is why it can be made without a puzzle.",
      },
    ],
    whatItStops: [
      {
        kind: "p",
        text: "Commodity automation broadly, and a good deal of headless-browser traffic that reCAPTCHA v2 waves through, because the integrity checks look at the environment rather than at whether someone can identify a crosswalk.",
      },
      {
        kind: "p",
        text: "It also stops it without charging your buyer. That matters more than it sounds. Every other challenge on this site trades conversion for protection and the trade is rarely measured; Turnstile is the only one where the trade is close to free, which means it is the only one you can leave on across an entire site without wondering what it cost you.",
      },
    ],
    howItsDefeated: [
      {
        kind: "p",
        text: "Three ways, in ascending order of how much they should worry you.",
      },
      {
        kind: "list",
        items: [
          "**Solver services added support.** Turnstile is a standard product line for the same market that sells reCAPTCHA and hCaptcha tokens. Being newer bought a delay, not an exemption.",
          "**Residential proxy pools defeat the network half.** Cloudflare’s reputation signal is strong against datacentre traffic and much weaker against a rotating pool of real consumer connections — see [IP and rate limiting](/spam/ip-rate-limiting) for why that pool is cheap.",
          "**A real browser, driven by a real person, passes.** This is not a bypass. It is the specification working as written.",
        ],
      },
      {
        kind: "p",
        text: "That third point is the one that decides whether Turnstile solves your problem, and the answer depends entirely on which problem you have. If your traffic looks like this, Turnstile helps enormously:",
      },
      {
        kind: "quote",
        text: "I got 665 form fills on one page last night in an hour and sixteen minutes.",
        attribution: "u/surfnsound · r/marketing · Jul 2023",
      },
      {
        kind: "p",
        text: "If it looks like this, Turnstile changes nothing, because there is no automation to detect:",
      },
      {
        kind: "quote",
        text: "We have captcha on all of our forms, but it seems like these are real people submitting, just bad actors.",
        attribution: "u/alexxxcazam · r/PPC · Jul 2025",
      },
    ],
    whenToUse: [
      {
        kind: "p",
        text: "As your default challenge, on every form, replacing whatever you are running now. There is no scenario in which reCAPTCHA v2 is the better choice on a form you are building today, and the migration is small.",
      },
      {
        kind: "p",
        text: "Pair it with the rate limiting in the same dashboard rather than treating them as alternatives — the challenge handles the sophisticated single request, the limit handles the unsophisticated thousand.",
      },
      {
        kind: "note",
        label: "The fair verdict",
        text: "This is the one method in this set where the honest summary is “it is good, and you should probably turn it on this afternoon.” It still cannot tell you what the submissions it accepted turned out to be, but nothing that runs at the door can.",
      },
    ],
    pairWith: [
      {
        slug: "ip-rate-limiting",
        why: "Same vendor, same dashboard, and they cover opposite ends of the attack: one clever request versus a thousand crude ones.",
      },
      {
        slug: "honeypot-fields",
        why: "Free and independent. Two mechanisms that fail differently are worth more than one that fails well.",
      },
      {
        slug: "otp-verification",
        why: "The escalation for when the traffic passing Turnstile is genuinely human and genuinely not a buyer.",
      },
    ],
    concepts: ["completion-rate", "cost-per-lead", "origin"],
  },

  {
    slug: "honeypot-fields",
    name: "Honeypot fields",
    shortName: "Honeypot",
    family: "Trap",
    summary:
      "A field the visitor cannot see and a bot fills in anyway. Free, invisible, and it fails silently in both directions.",
    description:
      "Honeypot fields cost nothing and catch a real class of automated filler. Why “hidden fields don’t work any more,” what a correct implementation looks like, and the failure mode nobody logs.",
    lead: "Put a field on the form that no human will ever fill in. Anything that fills it is not a human. The idea is twenty years old, it is free, and it is still worth running — with two caveats that are rarely stated.",
    shortAnswer:
      "Keep it. It costs nothing and it catches indiscriminate DOM-filling automation that challenges miss. But a naive honeypot is detected trivially, and — the part almost nobody handles — when it rejects a real customer it does so silently, by design.",
    scorecard: {
      naiveBots: "yes",
      targetedBots: "no",
      humanFarms: "no",
      tireKickers: "no",
      friction: "none",
    },
    howItWorks: [
      {
        kind: "p",
        text: "You add an input a real visitor will never interact with, give it a name a bot finds attractive — `email2`, `url`, `company_website` — and discard any submission that arrives with it populated. No challenge, no third party, no visible cost.",
      },
      {
        kind: "p",
        text: "The mechanism is a bet about behaviour: automated fillers parse the DOM and fill what they find, while people fill what they see. That bet was excellent in 2008. It is now roughly a coin flip, depending on what is attacking you.",
      },
    ],
    whatItStops: [
      {
        kind: "p",
        text: "Generic form-filling automation — the kind that hits ten thousand sites a day and cannot afford per-target logic. That is a large share of the internet’s background spam and it costs you nothing to remove.",
      },
      {
        kind: "p",
        text: "It also produces a useful diagnostic almost nobody uses. A honeypot that catches nothing is telling you something specific: whatever is hitting your form is looking at your form. That is the moment to stop tuning traps and start reading logs.",
      },
      {
        kind: "quote",
        text: "I do have a hidden field on the form, and none of the bots filled it out. That’s what led me believe initially that it was actual people or a person.",
        attribution: "u/robwalte · r/marketing · Jun 2024",
      },
    ],
    howItsDefeated: [
      {
        kind: "p",
        text: "By reading the same CSS the human’s browser reads. Any filler worth the name skips inputs that are `display:none`, `visibility:hidden`, `type=hidden`, zero-sized, `aria-hidden`, or positioned off-canvas — which covers essentially every honeypot tutorial published in the last decade.",
      },
      {
        kind: "quote",
        text: "Hidden fields don’t work any more. You’ll need a technically visible but humanely hidden field to catch these bots.",
        attribution: "u/hymnzzy · r/marketing · Jun 2024",
      },
      {
        kind: "p",
        text: "“Technically visible but humanely hidden” is the correct instruction and it is harder than it sounds: the field has to be renderable and reachable by the CSS engine while being invisible to a person and skipped by assistive technology. In practice that means a real element, sized and positioned so it never occupies visual space, `tabindex=-1`, `autocomplete=off`, and an `aria-hidden` label the screen reader announces as “leave this field empty.”",
      },
      {
        kind: "p",
        text: "Which brings the second failure, and it is the one this page exists to say. Password managers fill fields named `url` and `company`. Browser autofill fills fields named `address2`. Screen readers announce fields their users then complete, helpfully. Every one of those is a real customer, and every one of them is rejected without a message, without a log line, and without anyone finding out.",
      },
      {
        kind: "note",
        label: "The thing to fix today",
        text: "A honeypot is silent in both directions. It never reports that it caught nothing, and it never reports that it caught a buyer. Store the rejects instead of dropping them — a table of what your traps refused this month is ten minutes of work and it is the only way you will ever learn which of the two is happening.",
      },
    ],
    whenToUse: [
      {
        kind: "p",
        text: "Always. There is no cost, no vendor, no consent banner and no friction, and it catches a class of traffic that challenges do not. It is the highest-return line of anti-spam code you will write.",
      },
      {
        kind: "p",
        text: "Just do not let a quiet honeypot convince you the form is fine. Quiet means the attacker read your page, which is worse news than a full trap, not better.",
      },
      {
        kind: "p",
        text: "The same mechanism has a second job worth knowing about — see [hidden fields](/glossary/hidden-field) for how the invisible inputs carrying your [GCLID](/glossary/gclid) and UTMs are the ones a filler reads first.",
      },
    ],
    pairWith: [
      {
        slug: "time-traps",
        why: "The other free, invisible signal. Neither is sufficient; both are close to free, and they fail on different attackers.",
      },
      {
        slug: "cloudflare-turnstile",
        why: "Covers the fillers that read your CSS properly, which is exactly the group a honeypot cannot see.",
      },
      {
        slug: "email-verification",
        why: "Catches what gets past both, at the address rather than at the browser.",
      },
    ],
    concepts: ["hidden-field", "duplicate-leads", "origin"],
  },

  {
    slug: "time-traps",
    name: "Time-traps and submit-delay heuristics",
    shortName: "Time-traps",
    family: "Trap",
    summary:
      "Reject anything filled in faster than a human could. One line for you, one line for them.",
    description:
      "Submit-delay checks cost a bot a `sleep()` call and cost your slowest, most careful buyers the whole submission. Why time-to-submit is worth far more as stored data than as a rule.",
    lead: "Stamp the form when it renders, check the clock when it submits, and drop anything that arrived impossibly fast. It is free, it works on the laziest automation, and the version most people implement quietly punishes their best leads.",
    shortAnswer:
      "As a gate it is defeated by one line of code. As a stored signal it is one of the most useful things on the submission — time-to-submit correlates with intent, exposes which field people stall on, and costs nothing to keep.",
    scorecard: {
      naiveBots: "yes",
      targetedBots: "no",
      humanFarms: "no",
      tireKickers: "no",
      friction: "none",
    },
    howItWorks: [
      {
        kind: "p",
        text: "The form carries a signed timestamp from render. On submit, the server compares it to now. Under a threshold — two seconds, five, whatever you picked — the submission is treated as automated and discarded.",
      },
      {
        kind: "p",
        text: "Some implementations add an upper bound as well, on the theory that a form sitting open for an hour is a stale or replayed session. That second rule is where the damage is.",
      },
    ],
    whatItStops: [
      {
        kind: "p",
        text: "Single-shot scripts that fetch the page and POST in the same breath, and replay attacks that reuse a captured payload. Both are common, both are cheap to run, and both disappear under a lower bound of a few seconds.",
      },
      {
        kind: "p",
        text: "It is the second-best zero-friction defense after a [honeypot](/spam/honeypot-fields), and for the same reason: the real visitor never knows it exists.",
      },
    ],
    howItsDefeated: [
      {
        kind: "p",
        text: "`await sleep(9000)`. That is the entire bypass, and it is one line in any automation framework.",
      },
      {
        kind: "p",
        text: "The cost to the attacker is throughput, not capability — and throughput has not been the constraint for a long time. Someone submitting 665 forms in seventy-six minutes is running roughly one every seven seconds; a nine-second delay per worker and four workers in parallel puts them back where they started, on a laptop.",
      },
      {
        kind: "p",
        text: "The upper bound fails in a more expensive way. Consider who takes twenty minutes on your quote form: someone who opened it in a tab, went to find last year’s invoice, checked a number with a colleague, came back and finished. That is not a stale session. That is the most qualified person who touched your form today, and an expiry rule rejects them with a message they will read as “this site is broken.”",
      },
      {
        kind: "quote",
        text: "After reviewing plenty of user screen recordings most users scroll down to see the size of the form before starting",
        attribution: "u/Henningway18 · r/cro · Nov 2015",
      },
      {
        kind: "p",
        text: "People treat forms as a task to prepare for. Timing rules assume they treat them as a reflex.",
      },
    ],
    whenToUse: [
      {
        kind: "p",
        text: "Keep a lower bound of two or three seconds. It is free and it removes the crudest traffic. Drop the upper bound entirely, or set it in hours and log what it catches before you trust it.",
      },
      {
        kind: "p",
        text: "Then do the thing almost nobody does: store the timing rather than only enforcing it. Time-to-submit, and ideally time-per-field, is a genuinely rich signal and it is sitting there for free.",
      },
      {
        kind: "list",
        items: [
          "Per-field dwell time is a [drop-off analysis](/glossary/form-drop-off-analysis) you did not have to instrument separately — the field people stall on is visible before anyone abandons.",
          "The distribution is bimodal when you are being hit, and the shape of it tells you whether you are looking at automation or at a click farm.",
          "Once submissions carry a [verdict](/glossary/verdict), you can check whether the fast ones close. Our guess is that they do not, and that is checkable rather than assertable.",
        ],
      },
    ],
    pairWith: [
      {
        slug: "honeypot-fields",
        why: "The other free trap. Run both; they catch different mistakes.",
      },
      {
        slug: "recaptcha-v3",
        why: "Also better as a stored score than as a gate. Two independent signals you can grade against outcomes later.",
      },
    ],
    concepts: [
      "form-drop-off-analysis",
      "form-abandonment",
      "verdict",
      "partial-submission",
    ],
  },

  {
    slug: "geo-blocking",
    name: "Geo-blocking",
    shortName: "Geo-blocking",
    family: "Gate",
    summary:
      "Refuse traffic from countries you do not sell to. Blunt, effective on volume, and its false positives are your best customers.",
    description:
      "Geo-blocking removes a lot of spam volume quickly. Why form-level geo scripts are unreliable, why residential proxies make it a speed bump, and the market data the block permanently hides from you.",
    lead: "If you only sell in one country, refusing everywhere else is the fastest volume reduction available. It is also the defense that most reliably rejects the traveller, the VPN user, and the distributed team — and never tells you it did.",
    shortAnswer:
      "Done at the CDN it is a legitimate blunt instrument that cuts commodity spam volume hard. Done in a script on the form it is unreliable. Either way it stops an origin rather than an operator, and a residential proxy in your own market costs cents.",
    scorecard: {
      naiveBots: "yes",
      targetedBots: "no",
      humanFarms: "partial",
      tireKickers: "no",
      friction: "low",
    },
    howItWorks: [
      {
        kind: "p",
        text: "Map the request IP to a country or an ASN and refuse the ones you do not serve. In practice this happens in one of three places: your DNS or CDN provider, a WAF rule, or a script on the page that hides or disables the form. It is the bluntest instrument here short of [removing the form entirely](/spam/taking-the-form-down).",
      },
      {
        kind: "p",
        text: "Those three are not equivalent and the difference matters more than the policy does. The first two refuse before your application sees the request. The third asks the client to please not submit.",
      },
    ],
    whatItStops: [
      {
        kind: "p",
        text: "A large share of indiscriminate spam volume, quickly, if your buyers are concentrated in one market. The practitioner in our corpus who tried everything else landed on it as the only thing that moved the number:",
      },
      {
        kind: "quote",
        text: "Aside from using Cloudflare name servers to geo-block, there’s no real successful way to stop spam bots from just constantly submitting spam entries. Most of my clients deal with this. Captcha feels worthless. Honeypot traps don’t always work. Geoblocking scripts on just the form are buggy.",
        attribution: "u/kjdscott · web developer / agency · r/Entrepreneur · Sep 2025",
      },
      {
        kind: "p",
        text: "Read that as two findings, because it contains both. Geo-blocking at the name servers: the best of a bad set. Geo-blocking in a script on the form: buggy.",
      },
    ],
    howItsDefeated: [
      {
        kind: "p",
        text: "By moving. A residential proxy in your target country costs a few cents an hour and is indistinguishable from a customer’s home broadband, because it is a customer’s home broadband. Geo-blocking relocates the attacker; it does not remove them, and anyone running a campaign against you specifically will relocate within a day.",
      },
      {
        kind: "p",
        text: "The buggy part is worth spelling out, because it is a class of bug rather than one implementation. A form-level geo script fails open when the geo lookup is slow, when the page is served from cache, when the script is blocked, or when the visitor has JavaScript disabled — all of which describe an attacker more often than a customer. And it fails closed on stale geo data, which describes your customer more often than an attacker.",
      },
      {
        kind: "p",
        text: "Then the false positives, which are the reason this method deserves more suspicion than it gets. Blocked: the buyer travelling, the buyer on a corporate VPN that egresses through Frankfurt, the buyer whose ISP is misattributed, the agency evaluating you from a client’s office abroad, the acquisition target doing diligence. Every one of them sees a form that will not submit, not one of them writes to tell you, and the loss never appears in your [cost per lead](/glossary/cost-per-lead).",
      },
      {
        kind: "note",
        label: "The compounding cost",
        text: "A geo-block also erases the evidence that would justify lifting it. You cannot see demand from a market whose requests you refuse, so the analytics permanently agree with the decision. That is a self-sealing argument, and self-sealing arguments should make you nervous.",
      },
    ],
    whenToUse: [
      {
        kind: "p",
        text: "When your servable market is genuinely national — a trades business, a licensed practice, anything with a physical service area — and you are under active volume pressure. Then it is a reasonable trade honestly made.",
      },
      {
        kind: "list",
        items: [
          "Do it at the CDN or WAF, never in a script on the form.",
          "Block the smallest set that solves the problem. Country-level bans are crude; ASN and datacentre-range bans get most of the benefit with far fewer false positives.",
          "**Log every block.** A monthly count of what you refused, by country, is the only way the decision stays reviewable.",
          "Give blocked visitors a route through — an email address or a phone number on the error — so the traveller is inconvenienced rather than lost.",
          "Put a review date on it. Geo-blocks outlive the attack that caused them by years.",
        ],
      },
    ],
    pairWith: [
      {
        slug: "ip-rate-limiting",
        why: "Same layer, same dashboard, and rate limits catch what relocates into your allowed region.",
      },
      {
        slug: "cloudflare-turnstile",
        why: "Handles the traffic you have decided you must accept, which after a geo-block is all of it.",
      },
    ],
    concepts: ["cost-per-lead", "lead-scoring"],
  },

  {
    slug: "ip-rate-limiting",
    name: "IP reputation and rate limiting",
    shortName: "Rate limiting",
    family: "Gate",
    summary:
      "Cap submissions per address. It protects your infrastructure reliably and your CRM barely at all.",
    description:
      "Rate limits and IP blocklists cap the worst hour of an attack. Why residential proxy pools make per-IP limits close to meaningless, and why aggressive limits block the enterprise buyer first.",
    lead: "Ten submissions from one address in a minute is not ten customers. Capping it is basic hygiene and you should do it — as long as you are clear about which problem it solves.",
    shortAnswer:
      "Rate limiting reliably prevents a catastrophic hour and reliably fails to prevent a poisoned dataset. One submission per address, from a pool of millions of real consumer addresses, defeats every limit you can safely set.",
    scorecard: {
      naiveBots: "yes",
      targetedBots: "no",
      humanFarms: "no",
      tireKickers: "no",
      friction: "low",
    },
    howItWorks: [
      {
        kind: "p",
        text: "Two related things usually get discussed together. Rate limiting counts requests per address, subnet or ASN over a sliding window and refuses past a threshold. IP reputation checks the address against a blocklist — Spamhaus, Project Honey Pot, a commercial feed, or your CDN’s own scoring — and refuses known-bad ones outright.",
      },
      {
        kind: "p",
        text: "Both belong at the edge, in front of the application, where a refusal costs you nothing to serve.",
      },
    ],
    whatItStops: [
      {
        kind: "p",
        text: "Bursts from a small number of origins, which is still the most common shape of attack because it is the cheapest to run. This is the defense that would have blunted the 665-fills-in-seventy-six-minutes case, and blunting that is worth real money: your database stays usable, your notification email stays readable, your team does not spend an afternoon on cleanup.",
      },
      {
        kind: "p",
        text: "Reputation lists add a slice on top — datacentre ranges, known scanners, addresses that hit a spam trap last week. Useful, cheap, and lagging by design.",
      },
    ],
    howItsDefeated: [
      {
        kind: "p",
        text: "By distribution. Residential proxy networks resell access to millions of consumer connections, and an attacker who sends one submission per address never approaches any threshold you could set without blocking real traffic. There is no rate limit that distinguishes “one submission from a home connection in Ohio” from “one submission from a home connection in Ohio.”",
      },
      {
        kind: "p",
        text: "Reputation lists lose the same race. The pools are large, rotating, and fresh; a list that updates daily is describing last week’s addresses. The addresses that matter are the ones nobody has reported yet, because they belong to somebody’s actual router.",
      },
      {
        kind: "p",
        text: "And then the false-positive shape, which is specific enough to be worth planning around. A large company egresses hundreds or thousands of employees through a handful of addresses. A tight per-IP limit does not block a bot farm; it blocks the third person at your enterprise prospect who tried to register for the webinar that morning.",
      },
      {
        kind: "quote",
        text: "If we stay on the current trajectory, websites will have to remove contact forms in the next few years due to the sheer volume of spam bots submissions. If your form software has a submission limit, bots are using it before real people even get a chance.",
        attribution: "u/kjdscott · r/Entrepreneur · Sep 2025",
      },
      {
        kind: "p",
        text: "That second sentence is the reason rate limiting is not optional even though it is insufficient. When your form builder meters you by the submission, an unmetered attack is a bill — and, past the cap, a closed door in front of the real buyer. See [per-response pricing](/glossary/per-response-pricing).",
      },
    ],
    whenToUse: [
      {
        kind: "p",
        text: "Always, at the edge, set to catch catastrophes rather than spam. A generous limit — say twenty submissions per address per hour — costs no real user anything and removes the outcome where you wake up to four thousand rows.",
      },
      {
        kind: "list",
        items: [
          "Limit per address *and* per form, so a busy office does not inherit a limit calibrated for a contact page.",
          "Prefer challenging over refusing when you are near the threshold: escalate to [Turnstile](/spam/cloudflare-turnstile) rather than returning an error.",
          "Block datacentre ASNs before you touch consumer ranges. That is most of the cheap traffic and almost none of your buyers.",
          "Alert on the limit firing. A rate limit that engages is the earliest warning you get that something has started.",
        ],
      },
    ],
    pairWith: [
      {
        slug: "geo-blocking",
        why: "Same layer. Geography narrows the pool; rate limits cap what is left.",
      },
      {
        slug: "cloudflare-turnstile",
        why: "The right escalation at the threshold — challenge the borderline request rather than refusing it.",
      },
    ],
    concepts: ["per-response-pricing", "cost-per-lead", "duplicate-leads"],
  },

  {
    slug: "email-verification",
    name: "Email verification",
    shortName: "Email verification",
    family: "Filter",
    summary:
      "Three different things share this name. Only one of them proves a person exists — and the best of the other two is not an anti-spam tool at all.",
    description:
      "Format validation, deliverability checks and double opt-in are three separate mechanisms sold as one. What each actually proves, and why deliverability checking pays for itself on typos rather than on spam.",
    lead: "“We verify emails” can mean a regex, an SMTP probe, or a confirmation link. They differ enormously in what they prove, what they cost, and what they break.",
    shortAnswer:
      "Format checks catch typos. Deliverability checks catch typos better and catch a real slice of fake addresses. Only double opt-in proves someone controls the mailbox — and it moves your drop-off into an inbox you do not control.",
    scorecard: {
      naiveBots: "yes",
      targetedBots: "partial",
      humanFarms: "no",
      tireKickers: "no",
      friction: "medium",
    },
    howItWorks: [
      {
        kind: "p",
        text: "**Format validation** checks the string is shaped like an address. It runs client-side, costs nothing, and proves almost nothing — `asdf@asdf.com` passes every regex ever written. It is not a defense; it is a typo check, and it belongs on every form for that reason alone.",
      },
      {
        kind: "p",
        text: "**Deliverability checking** goes further: resolve the domain’s MX records, then probe the mail server to ask whether the mailbox exists. Commercial services wrap this with disposable-domain lists, role-account detection (`info@`, `sales@`) and a confidence score. It runs server-side, costs a fraction of a cent per check, and answers a real question.",
      },
      {
        kind: "p",
        text: "**Double opt-in** sends a confirmation link and only accepts the submission once it is clicked. It is the only one of the three that establishes a person had access to the mailbox at a specific moment.",
      },
    ],
    whatItStops: [
      {
        kind: "p",
        text: "Deliverability checking removes fabricated addresses at non-existent domains and mailboxes that do not exist at real ones. It also catches the pattern that made one B2B team give up on their page entirely:",
      },
      {
        kind: "quote",
        text: "the company names sometimes don’t match up to the email domain, the domains might be misspelled versions of actual companies (itterable.com)",
        attribution:
          "u/robwalte · B2B software company, 100–200 people · r/marketing · Jun 2024",
      },
      {
        kind: "p",
        text: "But the highest-value thing it does has nothing to do with spam, and it is the reason to buy it even if you have no spam problem at all. It catches `gmial.com`, `hotmial.co.uk`, and the address with a fat-fingered surname — real buyers whose lead is currently landing nowhere and being counted as a conversion. That is recovered revenue, and it is a larger number than the spam saving at most companies.",
      },
      {
        kind: "p",
        text: "Double opt-in stops essentially every fabricated address, because a fabricated address cannot click.",
      },
    ],
    howItsDefeated: [
      {
        kind: "p",
        text: "A working mailbox is free and takes forty seconds to create. Anyone spending money to fill your form has a deliverable address, so deliverability checking is a filter on carelessness, not on intent.",
      },
      {
        kind: "p",
        text: "Two technical limits erode it further. Catch-all domains accept mail for every local part, so the probe returns “valid” for `notarealperson@theircompany.com` — and catch-alls are common at exactly the mid-market companies you sell to. And the large providers increasingly refuse or throttle verification probes, which returns “unknown,” which your integration then has to treat as pass or fail, and either choice is wrong some of the time.",
      },
      {
        kind: "p",
        text: "Double opt-in is not defeated so much as paid for. The confirmation email is a second conversion step, on infrastructure you do not control, and it lands in spam often enough that people plan around it:",
      },
      {
        kind: "quote",
        text: "confirmation emails that go out to our customers/applicants often goes to spam",
        attribution: "Bonnie M. · Executive Director, Non-Profit · Capterra/Jotform · Feb 2026",
      },
      {
        kind: "quote",
        text: "the leak we kept hitting wasn’t the thank you copy, it was the reply. say when they’ll hear back and from which address, because quote form replies land in spam constantly and the lead just assumes you ignored them",
        attribution: "u/navlio · r/webdev · Aug 2026",
      },
      {
        kind: "p",
        text: "You have not removed the drop-off. You have moved it somewhere you cannot instrument — it will not appear in your [drop-off analysis](/glossary/form-drop-off-analysis), because the abandonment happens in a mail client.",
      },
    ],
    whenToUse: [
      {
        kind: "p",
        text: "Run format validation always, and deliverability checking on any form where a lead is worth more than a cent — which is every lead-gen form. Buy it for the typo recovery and treat the spam reduction as a bonus.",
      },
      {
        kind: "p",
        text: "Use double opt-in when the integrity of the list matters more than the count: newsletters, anything with a sending reputation attached, anything where a wrong address costs you deliverability. Do not use it on a demo request, where a lost confirmation click is a lost deal.",
      },
      {
        kind: "p",
        text: "And when a check comes back uncertain, flag rather than reject. A submission held for review costs you a minute. A rejected buyer costs you the account, and you never find out it happened.",
      },
    ],
    pairWith: [
      {
        slug: "disposable-email-blocking",
        why: "The neighbouring check on the same field, with a much sharper false-positive profile — read that one before switching it on.",
      },
      {
        slug: "otp-verification",
        why: "The version that actually proves a person is present, when the form can justify asking for a phone number.",
      },
      {
        slug: "honeypot-fields",
        why: "Free, and it works on the submissions that arrive with a perfectly deliverable address.",
      },
    ],
    concepts: ["duplicate-leads", "lead-scoring", "mql-vs-sql"],
  },

  {
    slug: "otp-verification",
    name: "OTP and SMS verification",
    shortName: "OTP",
    family: "Gate",
    summary:
      "The one that works. It is expensive, it costs completion, and you should probably use it.",
    description:
      "One-time-passcode verification is the only defense on this site that verifies the person rather than the browser. What it costs, where it genuinely fails, and why we are recommending something we do not sell.",
    lead: "Send a code, require it back. It is the highest-friction thing on this list and the only one that changes the economics of faking a submission by three orders of magnitude.",
    shortAnswer:
      "This one works. If spam is your problem today and a phone number is a reasonable thing to ask for, go implement OTP verification — it will fix it. It is table stakes that most form builders should have shipped years ago, and it is not a thing we are selling you.",
    scorecard: {
      naiveBots: "yes",
      targetedBots: "yes",
      humanFarms: "partial",
      tireKickers: "no",
      friction: "high",
    },
    howItWorks: [
      {
        kind: "p",
        text: "The visitor enters a phone number or email address, receives a short code, and enters it back before the submission is accepted. The submission is bound to a channel somebody has to be able to receive on.",
      },
      {
        kind: "p",
        text: "That is a different kind of check from everything else on this site. A challenge asks whether the client is a real browser. A trap asks whether the client behaves like a person. OTP asks whether a specific, rentable, chargeable resource is under the submitter’s control right now — and that is a question automation cannot answer with software alone.",
      },
    ],
    whatItStops: [
      {
        kind: "p",
        text: "Fabricated contact details, which is most of what people mean when they say spam. The cost of one fake submission moves from approximately zero to the cost of acquiring and controlling a phone number, and three or four orders of magnitude is not a hurdle — it is a different business model.",
      },
      {
        kind: "p",
        text: "This is not theoretical. It is the single documented reversal in our whole research corpus: a channel written off as irredeemable by half of r/PPC, rehabilitated by adding OTP.",
      },
      {
        kind: "quote",
        text: "I avoided instant forms for years because the lead quality was trash but the otp verification is very helpful tbh.",
        attribution: "u/Luis_Dynamo_140 · r/marketing · Dec 2025",
      },
      {
        kind: "p",
        text: "And it is being asked for, repeatedly, by people who cannot get it from the tool they are already paying for:",
      },
      {
        kind: "quote",
        text: "I have a Typeform setup that works fine, but I keep running into one issue — I need to verify the person submitting (email or OTP) before I accept the response. Is there any clean way to do this with Typeform without wiring up extra tools?",
        attribution: "OP · r/SaaS · Feb 2026",
      },
      {
        kind: "quote",
        text: "I have tried Typeform for one client for lead generation, but the main issue was that they do not have OTP verification built into their forms.",
        attribution: "u/Forsaken_Fix_1182 · r/nocode · Oct 2025",
      },
    ],
    howItsDefeated: [
      {
        kind: "p",
        text: "Where the payoff justifies the expense, and essentially nowhere else. Numbers can be rented from SMS-receiving services, and organised fraud runs SIM farms — but both cost real money per number, and that changes who bothers.",
      },
      {
        kind: "p",
        text: "Nobody operates a SIM farm to waste a B2B sales rep’s afternoon. If you are a bank, a marketplace with payouts, or anything where a verified account is itself worth something, assume OTP will be attacked and budget for velocity checks and carrier lookups. If you are running demo requests for mid-market software, this is not your threat model.",
      },
      {
        kind: "p",
        text: "The honest limit is elsewhere, and it is the one thing this page will not let itself skip. OTP proves a person was there. It does not prove the person was a buyer.",
      },
      {
        kind: "quote",
        text: "Cost per lead is amazing. Under $15 per lead. Sales are struggling with the leads. Loads of people seem to sign up and leave their details but when sales try and phone them or message on WhatsApp nothing… They leave relevant enquiries but seem to ghost off the bat.",
        attribution: "u/AfraidGuarantee5858 · B2B agency · r/PPC · Nov 2025",
      },
      {
        kind: "p",
        text: "Every one of those people could have passed an OTP check. A verified human tire-kicker is still a bad lead. That is a different problem, and OTP was never trying to solve it.",
      },
      {
        kind: "p",
        text: "Then the costs, stated plainly, because they are real. It is the most friction on this site: asking for a phone number at all costs completion, and asking someone to go and fetch a code costs more. It costs money per send, on a bill that scales with the attack. It excludes people — travellers on roaming, shared handsets, anyone who reasonably declines to hand a phone number to a company they are still evaluating. And SMS delivery is unreliable in exactly the moments you need it.",
      },
    ],
    whenToUse: [
      {
        kind: "p",
        text: "Use it when a phone number is a reasonable ask for what you are offering — a quote, a site visit, a callback, a demo where someone was going to ring them anyway. On those forms the friction is honest, because the number was the point.",
      },
      {
        kind: "p",
        text: "Do not use it to gate an ebook. You will pay per message for a list you devalued at the door.",
      },
      {
        kind: "p",
        text: "Where the ask is not natural, the sequenced version works well: accept the submission, then verify before it is routed to sales or counted as a conversion. You keep the [partial submission](/glossary/partial-submission) either way, and you stop feeding unverified conversions to the ad platform — see [offline conversion import](/glossary/offline-conversion-import).",
      },
      {
        kind: "note",
        label: "This works, use it, and it isn’t us",
        text: "We are not going to pretend a defense fails so that our thing sounds better. OTP verification is the one method in this set that genuinely closes the door, and if spam is your problem this week it is the highest-leverage afternoon you can spend. If we ship it, it will be because it is table stakes — the reason people keep asking for it in public is that the tools they already pay for never built it. What OTP still cannot tell you is what the verified humans you accepted turned out to be worth, and that is the part we are actually building.",
      },
    ],
    pairWith: [
      {
        slug: "email-verification",
        why: "The lower-friction sibling for forms where a phone number is not a fair ask.",
      },
      {
        slug: "cloudflare-turnstile",
        why: "Keeps the crude volume off the form so you are not paying per message to reject it.",
      },
      {
        slug: "ip-rate-limiting",
        why: "Specifically to cap send costs. An unlimited OTP endpoint is a metered bill somebody else controls.",
      },
    ],
    concepts: [
      "origin",
      "verdict",
      "mql-vs-sql",
      "partial-submission",
      "offline-conversion-import",
    ],
  },

  {
    slug: "disposable-email-blocking",
    name: "Disposable-email blocking",
    shortName: "Disposable email",
    family: "Filter",
    summary:
      "Block the throwaway domains. The list is always behind, and privacy relays look identical to it.",
    description:
      "Blocking mailinator and its thousands of rotating cousins is a list-maintenance race you do not win. Worse, Apple and Firefox relay addresses look the same to a naive blocklist — and the people using them are senior.",
    lead: "Refuse addresses at known throwaway domains. It is cheap, it is satisfying, and its false positives are correlated with exactly the seniority you are trying to attract.",
    shortAnswer:
      "Worth running against a maintained list, as a flag rather than a wall. The list is permanently behind the domains, and privacy relays — Apple Hide My Email, Firefox Relay, DuckDuckGo — are indistinguishable from disposables unless you deliberately allow them.",
    scorecard: {
      naiveBots: "partial",
      targetedBots: "no",
      humanFarms: "no",
      tireKickers: "partial",
      friction: "low",
    },
    howItWorks: [
      {
        kind: "p",
        text: "Extract the domain, check it against a list of throwaway mail providers, refuse or flag on a match. Free public lists exist; commercial providers maintain private ones and that maintenance is the product you are paying for.",
      },
      {
        kind: "p",
        text: "It is usually bundled with [deliverability checking](/spam/email-verification), which is where most people encounter it — a single API call returning `disposable: true` alongside `deliverable: true`.",
      },
    ],
    whatItStops: [
      {
        kind: "p",
        text: "The laziest fake addresses, and — more usefully — a genuine category of abuse that is not spam at all: free-trial cycling and gated-content leeching. If your problem is one person taking a hundred trials, this is the correct tool and it works.",
      },
      {
        kind: "p",
        text: "As a lead-quality signal it is also fair on its own terms. Somebody who reaches for a ten-minute mailbox to download your report has told you something true about their intent, and routing that submission differently is reasonable.",
      },
    ],
    howItsDefeated: [
      {
        kind: "p",
        text: "By registering a domain. Throwaway providers rotate through thousands of them, deliberately and continuously, and any list is describing the ones that were noticed. The gap between “new disposable domain in service” and “new disposable domain on your list” is where every determined abuser lives.",
      },
      {
        kind: "p",
        text: "And the cost of trying to close that gap is the reason this method needs a warning label rather than a recommendation. Privacy relays — Apple’s Hide My Email, Firefox Relay, DuckDuckGo, SimpleLogin — produce addresses at unfamiliar domains that forward to a real, permanent mailbox. To a naive blocklist they look exactly like a disposable. To your business they are a customer who reads their mail.",
      },
      {
        kind: "note",
        label: "The false positive is correlated with seniority",
        text: "Relay users skew technical, senior, privacy-aware, and iPhone-owning. Blocking them to catch mailinator is a trade nobody made deliberately — it happens because one line of a vendor’s list treats both the same way. Check what your provider does with relay domains before you switch rejection on.",
      },
      {
        kind: "p",
        text: "The aggressive cousin of this rule is worse still. Blocking free-mail domains on a B2B form — refusing `gmail.com` because “real businesses have a domain” — rejects founders, consultants, contractors, and anyone whose company email is forwarded to Gmail anyway. That is a substantial fraction of the SMB market, refused at the door by a policy someone wrote in 2014.",
      },
    ],
    whenToUse: [
      {
        kind: "p",
        text: "Use a maintained list, not a GitHub gist that was last updated in 2021. Then choose your behaviour carefully:",
      },
      {
        kind: "list",
        items: [
          "**Flag, do not reject.** A disposable address on a submission is a routing decision, not a verdict. Send it somewhere, score it lower, and keep it.",
          "**Allow relays explicitly.** Apple, Firefox, DuckDuckGo and SimpleLogin domains belong on an allowlist that overrides the block.",
          "**Never block free mail** on a form aimed at SMBs or founders.",
          "**Reject outright only on the trial-abuse case**, where the person is claiming something free and repeatable rather than asking to be contacted.",
        ],
      },
      {
        kind: "p",
        text: "And be honest about the ceiling. This filters a category of address, not a category of person. It has nothing to say about the polished, deliverable, corporate-domain submission that wastes an SDR’s week — see [lead scoring](/glossary/lead-scoring) for why the usual answer to that one does not work either.",
      },
    ],
    pairWith: [
      {
        slug: "email-verification",
        why: "Same field, same API call, and deliverability is the check that earns its keep.",
      },
      {
        slug: "honeypot-fields",
        why: "Different layer entirely, and free. Address filters cannot see how the submission was made.",
      },
    ],
    concepts: ["lead-scoring", "mql-vs-sql", "duplicate-leads"],
  },

  {
    slug: "taking-the-form-down",
    name: "Taking the form down",
    shortName: "Removing the form",
    family: "Last resort",
    summary:
      "The only defense here with a perfect score. It stops one hundred percent of spam and one hundred percent of your leads.",
    description:
      "People really do this — one B2B team removed the page after 600 fake submissions. Why the partial version (removing the conversion action) is the one that actually gets used, and what it costs.",
    lead: "Remove the form. Replace it with an email address, a phone number, or a calendar link. It is on this list because practitioners in our research actually did it, and because a category whose remedy is “delete the form” has a problem no amount of tuning fixes.",
    shortAnswer:
      "It works completely and it costs you everything the form was for. The version worth knowing about is narrower: leaving the form up while removing it as a conversion action, which stops the ad platform learning from junk without stopping the leads.",
    scorecard: {
      naiveBots: "yes",
      targetedBots: "yes",
      humanFarms: "yes",
      tireKickers: "yes",
      friction: "high",
    },
    howItWorks: [
      {
        kind: "p",
        text: "There is no mechanism to explain. You take the form off the page and put something else there: a `mailto:` link, a phone number, a booking link, or a login wall that moves the conversation behind authentication.",
      },
      {
        kind: "p",
        text: "It is the only entry in this set with three `yes` marks on the scorecard, and that is not a joke at the format’s expense. It is the shape of the whole problem: the only defense that works on every attacker is the one that also works on every customer.",
      },
    ],
    whatItStops: [
      {
        kind: "p",
        text: "Everything. And people reach for it, which is the part worth taking seriously — this is not a hypothetical, it is the last line of a real thread.",
      },
      {
        kind: "quote",
        text: "We ended up taking down the page after 600 submissions.",
        attribution:
          "u/robwalte · B2B software company, 100–200 people · r/marketing · Jun 2024",
      },
      {
        kind: "quote",
        text: "If we stay on the current trajectory, websites will have to remove contact forms in the next few years due to the sheer volume of spam bots submissions.",
        attribution: "u/kjdscott · web developer / agency · r/Entrepreneur · Sep 2025",
      },
      {
        kind: "p",
        text: "Two independent practitioners, sixteen months apart, one describing what they did and the other describing where he thinks the web is heading. Neither is a vendor and neither was selling anything.",
      },
    ],
    howItsDefeated: [
      {
        kind: "p",
        text: "It is not defeated. It is paid for, in full, by you.",
      },
      {
        kind: "p",
        text: "A published address gets harvested within days, so you have traded form spam for inbox spam — with worse filtering, no routing, no structured fields, no attribution, and no record that a lead ever existed. Every real enquiry now arrives as an unstructured email that somebody has to notice, and the [GCLID](/glossary/gclid) that told you which campaign produced it is gone, because there is no hidden field to carry it.",
      },
      {
        kind: "p",
        text: "You have also removed the measurement, which means you can no longer tell whether the decision was right. There is no baseline to come back to.",
      },
    ],
    whenToUse: [
      {
        kind: "p",
        text: "As a tourniquet: one page, during an active attack, with a date to revisit. Never as policy, and never site-wide.",
      },
      {
        kind: "p",
        text: "But there is a middle version that is much more interesting, and it is the one people actually run. Leave the form up. Remove it as a conversion action.",
      },
      {
        kind: "quote",
        text: "Since about April 2025, I’ve been getting a ridiculous amount of spam, and it seems like Google is continuing to optimize for these “cheap conversions”. I feel like I’ve tried everything. At this point, do I just remove form submit as a conversion action and keep phone calls? So frustrating :/",
        attribution: "u/alexxxcazam · r/PPC · Jul 2025",
      },
      {
        kind: "p",
        text: "That instinct is correct, and it addresses the compounding half of the damage rather than the visible half. Fake submissions are annoying once. Fake submissions reported as conversions are annoying forever, because the ad platform treats each one as an example of what to go and find more of.",
      },
      {
        kind: "quote",
        text: "all those bot submissions were training Google’s/your ad network’s machine learning algorithm to send you more bot-like traffic.",
        attribution: "u/polygraph-net · r/marketing · Jul 2023",
      },
      {
        kind: "p",
        text: "So removing the conversion action stops the loop. What it costs is the optimisation signal you were buying in the first place — you are now running paid acquisition blind, on a phone-call proxy, which works better than most people expect and is still a downgrade.",
      },
      {
        kind: "note",
        label: "The version that is not a retreat",
        text: "Keep the form, keep the conversion action, and change what gets reported as a conversion — fire it on the submissions that survived verification, or on the ones your CRM later marked as real. That is [offline conversion import](/glossary/offline-conversion-import), it is what competent PPC teams already do by hand, and it is strictly better than switching the signal off. It requires that something knows what happened to each submission, which is the thing no form builder currently tells you.",
      },
    ],
    pairWith: [
      {
        slug: "otp-verification",
        why: "The defense to try before this one. If a phone number is a fair ask, you almost certainly do not need to remove the page.",
      },
      {
        slug: "geo-blocking",
        why: "A narrower blunt instrument. Refusing one region is a smaller amputation than refusing everyone.",
      },
      {
        slug: "cloudflare-turnstile",
        why: "What to put back when you restore the page.",
      },
    ],
    concepts: [
      "offline-conversion-import",
      "gclid",
      "cost-per-lead",
      "verdict",
    ],
  },
];

export const SPAM_METHODS_BY_SLUG = new Map(
  SPAM_METHODS.map((method) => [method.slug, method]),
);

export function getSpamMethod(slug: string): SpamMethod | undefined {
  return SPAM_METHODS_BY_SLUG.get(slug);
}

export const SPAM_HUB_PATH = "/spam";

export function spamPath(slug: string): string {
  return `${SPAM_HUB_PATH}/${slug}`;
}
