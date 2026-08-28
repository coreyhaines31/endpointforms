import type { Block } from "@/lib/content-blocks";

/**
 * Concept pages — docs/09 Candidate 8, URL pattern from docs/05 §Tier 0.5.
 *
 * The hard rule this module is written under: **no entry ships that merely
 * defines the term.** Every one carries a definition, why it matters, how it is
 * actually measured or done, a specific mistake, and links onward. If a term
 * could not clear that bar it was cut rather than padded — docs/09 §5.
 *
 * Five of these are words we coined. They are flagged `ours: true` and rendered
 * with an explicit disclaimer, because presenting our own vocabulary as
 * industry-standard is precisely the dishonesty this site is about.
 */

export type GlossaryGroup =
  | "Measurement"
  | "Lead quality"
  | "Form mechanics"
  | "Data plumbing"
  | "Agents"
  | "Our vocabulary";

export type GlossaryTerm = {
  slug: string;
  term: string;
  /** Other names the same idea travels under. */
  aka?: string;
  /** A word we made up. Rendered with a disclaimer. */
  ours?: boolean;
  group: GlossaryGroup;
  /** One sentence. Feeds the hub listing and the DefinedTerm schema. */
  shortDef: string;
  /** <meta name="description">, written from this page. */
  description: string;
  definition: Block[];
  whyItMatters: Block[];
  /** How it is actually measured, or actually built. */
  inPractice: Block[];
  mistake: { heading: string; blocks: Block[] };
  related: string[];
  /** Anti-spam teardowns worth reading alongside. */
  spam?: string[];
};

export const GLOSSARY: GlossaryTerm[] = [
  {
    slug: "completion-rate",
    term: "Completion rate",
    aka: "Form conversion rate, finish rate",
    group: "Measurement",
    shortDef:
      "Submissions divided by the people who could have submitted — and the denominator is the half nobody agrees on.",
    description:
      "Completion rate is the category’s headline number. Why two tools report different rates for the same form, and why comparing it across traffic sources compares audiences rather than forms.",
    definition: [
      {
        kind: "p",
        text: "Completed submissions divided by some population that could have completed one. That second half is where the trouble is: the denominator might be page views, form impressions, form *starts*, or sessions — and every tool picks a different one without telling you which.",
      },
      {
        kind: "p",
        text: "A form at 22% by page views is at 61% by starts. Neither number is wrong. They answer different questions and they are routinely compared as if they were the same number.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "It is the number every form builder puts at the top of the dashboard, the number your split tests rank on, and — in most of the category — the number you are metered by. It is also, definitionally, a count of submit events. It has no access to who submitted or to what happened next.",
      },
      {
        kind: "p",
        text: "That is not a flaw in anyone’s implementation. It is what the metric is. The problem starts when it becomes the only metric, which is the argument the rest of this site is about: [the dishonest dashboard](/the-dishonest-dashboard).",
      },
    ],
    inPractice: [
      {
        kind: "p",
        text: "Report the funnel in two halves and stop compressing it into one ratio.",
      },
      {
        kind: "list",
        items: [
          "**View → start.** Did anyone engage at all? This is a page and offer problem.",
          "**Start → complete.** Did the people who engaged get through? This is a form problem, and it is where [drop-off analysis](/glossary/form-drop-off-analysis) lives.",
        ],
      },
      {
        kind: "p",
        text: "Fix the definition of “start” once — first field focus is the usual choice — write it down, and never change it, because changing it re-bases every historical comparison you own.",
      },
    ],
    mistake: {
      heading: "Comparing it across traffic sources",
      blocks: [
        {
          kind: "p",
          text: "A form carrying paid traffic will show a structurally lower completion rate than the same form carrying organic traffic, and no amount of design work closes the gap, because the gap is the audience.",
        },
        {
          kind: "quote",
          text: "The highest drop-off was not at the start, it was mid-form on a single required field. … We did notice source differences as well. Paid traffic was much less tolerant of friction compared to organic or referral. Made us rethink which fields actually need to be mandatory vs just helpful.",
          attribution: "u/Spare_Fisherman_5800 · r/MarketingAutomation · Feb 2026",
        },
        {
          kind: "p",
          text: "Segment by source before you conclude anything about the form. Otherwise the paid-heavy form loses every comparison it is entered into and the team redesigns something that was working.",
        },
      ],
    },
    related: [
      "form-abandonment",
      "form-drop-off-analysis",
      "multi-step-form",
      "yield",
      "per-response-pricing",
    ],
  },

  {
    slug: "form-abandonment",
    term: "Form abandonment",
    group: "Measurement",
    shortDef:
      "Someone started your form and left — the only funnel metric most teams infer rather than observe.",
    description:
      "Form abandonment is a field-level event reported as a form-level number. Why most teams cannot actually see it, and what the research says about where the loss really happens.",
    definition: [
      {
        kind: "p",
        text: "A visitor engaged with the form and did not finish. Counted crudely it is starts minus completions; counted usefully it is a specific person leaving at a specific field, which is a different and much more actionable fact.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "It is the largest single loss in most lead-gen funnels and the least examined, because attention goes to the page the form sits on rather than the form itself.",
      },
      {
        kind: "quote",
        text: "We always optimized landing pages but rarely looked inside the form itself. … Surprisingly, most loss was not on the page. It was inside the form. One required field created friction.",
        attribution: "OP · r/MarketingAutomation · Feb 2026",
      },
      {
        kind: "p",
        text: "Abandonment also has a property the rest of the funnel does not: these are people who were, moments ago, actively trying to give you their details. Nothing else in acquisition is that close to converting and that cheap to recover.",
      },
    ],
    inPractice: [
      {
        kind: "p",
        text: "Observing abandonment properly requires storing what was typed before someone left — see [partial submission](/glossary/partial-submission). Without that you can subtract completions from starts and get a number, but you cannot answer *where*, which is the only version that changes anything.",
      },
      {
        kind: "list",
        items: [
          "Record field-level focus, blur and first-change events, plus step transitions on multi-step forms.",
          "Store time-per-field. It shows hesitation before it becomes abandonment — the field people stall on is visible long before anyone leaves.",
          "Segment by traffic source and by device. Mobile abandonment on a long form is a different problem from desktop abandonment on a confusing one.",
        ],
      },
    ],
    mistake: {
      heading: "Treating it as one number about the form",
      blocks: [
        {
          kind: "p",
          text: "“Our form has 38% abandonment” is a fact you cannot act on. Abandonment happens at a field, and it is usually one field — a phone number, a company size, a required detail somebody does not have to hand.",
        },
        {
          kind: "quote",
          text: "We had very low “finish rate”, even when we played around with questions",
          attribution:
            "Lisa P. · Marketing Content Writer, Retail · Capterra/Typeform · Nov 2025",
        },
        {
          kind: "p",
          text: "That is the symptom without the diagnostic, described by someone paying for the tool. Playing around with questions is what you do when you cannot see which question is the problem.",
        },
      ],
    },
    related: [
      "form-drop-off-analysis",
      "partial-submission",
      "completion-rate",
      "multi-step-form",
      "progressive-profiling",
    ],
  },

  {
    slug: "form-drop-off-analysis",
    term: "Form drop-off analysis",
    aka: "Per-question drop-off, field-level analytics",
    group: "Measurement",
    shortDef:
      "Seeing exactly which question people stop at — the feature even competing vendors name as the one worth paying for.",
    description:
      "Per-question drop-off turns abandonment from a number into a decision. How to instrument it, why aggregate reporting hides the finding, and why almost every tool gates it.",
    definition: [
      {
        kind: "p",
        text: "Measuring, for every field or step, how many people reached it and how many continued past it. The output is a curve down the form, and the cliff in that curve is the thing you fix.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "It converts an argument into an observation. Without it, deciding whether to drop the phone-number field is a debate about best practice; with it, it is a number.",
      },
      {
        kind: "quote",
        text: "A lot of people spend tons of time optimizing the landing page and almost none looking at what happens inside the form. … Tracking drop-off per question is super valuable because it stops the guesswork. Instead of debating what might be the issue, you can see exactly where people hesitate.",
        attribution:
          "u/tolga-kizilkaya · forms.app cofounder, disclosed vendor · Mar 2026",
      },
      {
        kind: "p",
        text: "The corroboration worth more than the endorsement is that this is what vendors themselves name when asked what buyers would pay for:",
      },
      {
        kind: "quote",
        text: "The one I’d actually pay for is drop-off reporting. Not just seeing how many people completed the form, but being able to see exactly where people stopped along the way.",
        attribution: "u/Last-Ninja · Opinion Stage employee, disclosed · r/nocode · Aug 2026",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "The unit is the field, not the form. A step-level curve on a multi-step form is a start; a field-level one inside each step is the answer.",
          "You need [partial submissions](/glossary/partial-submission) stored server-side. Client-side events alone lose the sessions that closed the tab.",
          "Segment by traffic source before reading it, or the paid and organic curves average into a shape neither audience has.",
          "Watch time-per-field alongside exit rate. A field people sit on for forty seconds and then complete is costing you conversions further down.",
        ],
      },
      {
        kind: "p",
        text: "Conditional logic complicates the arithmetic and it is worth getting right: a question only 30% of respondents ever see has a denominator of its own. Compare like with like — see [conditional logic](/glossary/conditional-logic).",
      },
    ],
    mistake: {
      heading: "Reading it in aggregate",
      blocks: [
        {
          kind: "p",
          text: "The single most common way this analysis fails is being averaged across everyone. The finding in the corpus was not “people drop off” — it was that *paid* traffic would not tolerate a field that organic traffic sat through without complaint.",
        },
        {
          kind: "p",
          text: "Averaged together, that field looks acceptable. Split by source, it is an obvious change to make on the paid landing variant and no change at all elsewhere. Aggregate reporting does not just weaken the finding; it deletes it.",
        },
      ],
    },
    related: [
      "form-abandonment",
      "partial-submission",
      "completion-rate",
      "conditional-logic",
      "hindsight",
    ],
    spam: ["time-traps"],
  },

  {
    slug: "partial-submission",
    term: "Partial submission",
    aka: "Partial response, incomplete submission",
    group: "Form mechanics",
    shortDef:
      "What someone typed before they left. Both a recoverable lead and the raw material for every drop-off report you will ever run.",
    description:
      "Partial submissions are the prerequisite for drop-off analysis and a lead source in their own right — and in most form builders they are the upsell.",
    definition: [
      {
        kind: "p",
        text: "The data captured from a form that was never submitted. Usually written on field blur or step transition, so a visitor who fills three fields and closes the tab still leaves three fields behind.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Two reasons, and they are usually confused with each other. The first is commercial: an email address typed into field two is a lead you had. The second is diagnostic: without partials you cannot see [where people leave](/glossary/form-drop-off-analysis), because the only rows in your database are the successes.",
      },
      {
        kind: "p",
        text: "And this is where the category’s pricing gets its own paragraph, because the pattern is consistent enough to be a design decision rather than an accident:",
      },
      {
        kind: "quote",
        text: "Partial submissions only visible on paid plans. (Youform) / Advanced features like partial submissions or branding removal require paid plans. (Tally)",
        attribution: "r/nocode pain-point teardown · Oct 2025",
      },
      {
        kind: "quote",
        text: "No per-question progress saving, impacting analytics accuracy.",
        attribution: "Typeform pain point · r/nocode · Oct 2025",
      },
      {
        kind: "p",
        text: "The diagnostic for your biggest loss is the upgrade prompt. That is worth naming plainly rather than working around.",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "Write server-side on blur or step change, not only on unload — `beforeunload` is unreliable on mobile and fires late or never.",
          "Key partials to a session id so a returning visitor updates the same row instead of creating a second one. See [duplicate leads](/glossary/duplicate-leads).",
          "Decide the consent and retention story before you switch it on. You are storing data somebody chose not to submit, and “we captured it as you typed” is a sentence you have to be comfortable saying out loud.",
          "Keep partials out of your conversion counts and out of your CRM’s lead volume, or you have improved your numbers without improving anything.",
        ],
      },
    ],
    mistake: {
      heading: "Emailing partials as if they were enquiries",
      blocks: [
        {
          kind: "p",
          text: "The abandoned-cart instinct transfers badly. Contacting somebody who deliberately did not press submit, using an address they typed on the way to not pressing submit, reads as surveillance rather than service — and in several jurisdictions it is a consent problem as well as a taste problem.",
        },
        {
          kind: "p",
          text: "The defensible version is narrow: a single message that says where the details came from and offers to finish or delete. The indefensible version is the one that pretends they enquired.",
        },
        {
          kind: "p",
          text: "There is also a quieter use worth knowing. Automated fillers rarely abandon — they complete, because completing is the point. A form with plenty of partials and no completions is a usability problem; a form with completions and almost no partials is worth a second look.",
        },
      ],
    },
    related: [
      "form-abandonment",
      "form-drop-off-analysis",
      "progressive-profiling",
      "duplicate-leads",
      "per-response-pricing",
    ],
    spam: ["honeypot-fields"],
  },

  {
    slug: "cost-per-lead",
    term: "Cost per lead",
    aka: "CPL",
    group: "Lead quality",
    shortDef:
      "Spend divided by leads — a metric that improves when your lead quality collapses.",
    description:
      "Under bot pressure, CPL is inversely correlated with lead quality: fake submissions are free to produce, so they always push the number down. Why a CPL target is an instruction to find cheaper junk.",
    definition: [
      {
        kind: "p",
        text: "Media spend divided by the number of leads it produced. Simple, universal, and the number most paid acquisition is judged on.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Because of the direction it moves when things go wrong. Real leads cost money to acquire. Fake ones cost approximately nothing to produce. So any contamination of the denominator pushes CPL *down*, and a spam wave presents as the best month the campaign has ever had.",
      },
      {
        kind: "quote",
        text: "Cost per lead is amazing. Under $15 per lead. Sales are struggling with the leads. Loads of people seem to sign up and leave their details but when sales try and phone them or message on WhatsApp nothing… They leave relevant enquiries but seem to ghost off the bat.",
        attribution: "u/AfraidGuarantee5858 · B2B agency · r/PPC · Nov 2025",
      },
      {
        kind: "p",
        text: "Two sentences, in that order. The metric improved and the business got worse, and the metric had no way to say so.",
      },
    ],
    inPractice: [
      {
        kind: "p",
        text: "Never report CPL alone. Report it next to something the junk cannot fake:",
      },
      {
        kind: "list",
        items: [
          "**Cost per qualified lead**, using whatever your sales team already means by qualified — see [MQL vs SQL](/glossary/mql-vs-sql).",
          "**[MQL→SQL rate](/glossary/mql-vs-sql) by campaign.** If CPL falls and this falls with it, you did not get cheaper. You got worse.",
          "**Cost per closed deal**, on the cohort that has had time to close — which depends on your [time to disposition](/glossary/time-to-disposition).",
        ],
      },
      {
        kind: "p",
        text: "The pair is the point. CPL alone cannot distinguish a better campaign from a contaminated one, and the two look identical on the chart.",
      },
    ],
    mistake: {
      heading: "Setting a CPL target and handing it to the platform",
      blocks: [
        {
          kind: "p",
          text: "A target CPA or CPL instructs an ad platform to find you more conversions at a lower price. The cheapest conversions available are the ones that cost nobody anything to produce, so the optimiser finds them, reliably, because you asked.",
        },
        {
          kind: "quote",
          text: "Since about April 2025, I’ve been getting a ridiculous amount of spam, and it seems like Google is continuing to optimize for these “cheap conversions”.",
          attribution: "u/alexxxcazam · r/PPC · Jul 2025",
        },
        {
          kind: "p",
          text: "The fix is not to abandon the target. It is to change what counts as a conversion, so the cheap thing stops qualifying — [offline conversion import](/glossary/offline-conversion-import) is the standard route, and it is what competent teams already do.",
        },
      ],
    },
    related: [
      "mql-vs-sql",
      "lead-scoring",
      "offline-conversion-import",
      "yield",
      "verdict",
    ],
    spam: ["taking-the-form-down", "otp-verification"],
  },

  {
    slug: "lead-scoring",
    term: "Lead scoring",
    group: "Lead quality",
    shortDef:
      "Ranking leads by attributes and behaviour — usually by scoring what the submitter told you about themselves.",
    description:
      "Most lead scores are built on self-reported firmographics collected at submit time, which means a fabricated submission can outscore a real buyer. How to score on verified data and how to grade the model.",
    definition: [
      {
        kind: "p",
        text: "Assigning each lead a number from what you know about them — company size, job title, industry, budget, plus behavioural signals like pages viewed or emails opened — and routing or prioritising on the result.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "It is the main mechanism most teams have for handling more leads than sales can call, which makes it the thing standing between a spam wave and a wasted quarter of SDR time.",
      },
      {
        kind: "p",
        text: "And it is built, almost universally, on fields the submitter filled in themselves. That is fine when the submitter is a person with no reason to lie. It is the entire problem when they are not.",
      },
      {
        kind: "p",
        text: "A fabricated submission claiming *VP of Engineering, 500–1000 employees, budget approved* outscores a real founder who honestly answered *1–10 employees, just looking*. The score does what it was built to do and gets it exactly backwards.",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "**Weight verified attributes above declared ones.** An enriched company record from the email domain is evidence. A dropdown selection is a claim.",
          "**Score the request, not just the requester.** Which page, which campaign, what time, how long they spent, how they arrived — none of it is self-reported.",
          "**Back-test against closed-won.** Take last year’s leads, apply the current model, and check whether the high scores actually closed. Most models have never been through this.",
          "**Recalibrate on a schedule.** A score inherited from a template built for someone else’s business is a horoscope with arithmetic.",
        ],
      },
    ],
    mistake: {
      heading: "Never grading the score",
      blocks: [
        {
          kind: "p",
          text: "A lead score is a prediction. Predictions are worth exactly what their track record says they are worth, and almost nobody keeps the track record — the model is set up during implementation, tuned once by someone who has since left, and trusted indefinitely.",
        },
        {
          kind: "p",
          text: "Grading it is not hard. It requires that each submission eventually carries what happened to it, which is the same requirement as everything else on this site and the same thing no form builder currently provides. See [verdict](/glossary/verdict) and [outcome webhook](/glossary/outcome-webhook).",
        },
      ],
    },
    related: [
      "mql-vs-sql",
      "verdict",
      "outcome-webhook",
      "cost-per-lead",
      "hindsight",
    ],
    spam: ["disposable-email-blocking", "recaptcha-v3"],
  },

  {
    slug: "mql-vs-sql",
    term: "MQL vs SQL",
    aka: "Marketing qualified lead, sales qualified lead",
    group: "Lead quality",
    shortDef:
      "The handoff between marketing and sales, and the cheapest lead-quality instrument most companies already own and never use.",
    description:
      "MQL→SQL conversion runs around 13%. Most teams already compute it and almost none route it back to the form, the variant, or the field that produced the lead.",
    definition: [
      {
        kind: "p",
        text: "An MQL is a lead marketing considers worth passing on. An SQL is one sales has accepted as worth working. The gap between them is the only place in the funnel where two departments have to agree about the same record.",
      },
      {
        kind: "p",
        text: "Across B2B, MQL to SQL converts at roughly 13%. Nine in ten leads marketing hands over do not survive the handshake.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Because that conversion rate is a lead-quality measurement you already have. It is computed, it lives in your CRM, and it is the closest thing to ground truth that exists before revenue.",
      },
      {
        kind: "p",
        text: "And it goes nowhere. It gets reported upward in a board deck and it never travels back to the form, the variant, the campaign, or the field that produced the lead — which is the exact shape of the problem one practitioner described better than any vendor has:",
      },
      {
        kind: "quote",
        text: "Marketing gets measured on CPL so they optimize for CPL. Sales get measured on closed deals. Nobody owns the middle.",
        attribution: "u/Common_Dependent_284 · r/DigitalMarketing · May 2026",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "Compute the rate **per source, per campaign, and per form**, not company-wide. The company-wide number is a vanity metric; the per-form number is a decision.",
          "Use SQL acceptance as your interim outcome when deals take too long to wait for — see [time to disposition](/glossary/time-to-disposition).",
          "Write the disposition back onto the submission record, not just into the CRM report. That is what makes it usable by anything upstream.",
          "Track the *rejection reasons*, not just the rate. “Not a real person”, “wrong company size” and “bad timing” are three different problems with three different fixes, and only one of them is a spam problem.",
        ],
      },
    ],
    mistake: {
      heading: "Arguing about the definition instead of measuring the rate",
      blocks: [
        {
          kind: "p",
          text: "Enormous amounts of time go into agreeing what an MQL is. Almost none goes into asking whether the rate differs between the form on the pricing page and the form on the blog — which it does, usually by a lot, and which is immediately actionable in a way the definitional argument never becomes.",
        },
        {
          kind: "p",
          text: "The definition only has to be stable. It does not have to be right. A consistently applied imperfect definition, measured per form, tells you more in a month than a perfect definition applied to a company-wide average tells you in a year.",
        },
      ],
    },
    related: [
      "cost-per-lead",
      "lead-scoring",
      "time-to-disposition",
      "verdict",
      "yield",
    ],
  },

  {
    slug: "time-to-disposition",
    term: "Time to disposition",
    group: "Measurement",
    shortDef:
      "How long from submission until you know what the lead was worth — the number that decides whether outcome-based testing is possible for you at all.",
    description:
      "Time to disposition is the lag between a form submission and a final answer. Measure it before designing any test that depends on outcomes, and pick an interim proxy if it is long.",
    definition: [
      {
        kind: "p",
        text: "The elapsed time between a submission arriving and that submission reaching a settled state — won, lost, disqualified, or gone quiet long enough to count as lost.",
      },
      {
        kind: "p",
        text: "It is not your sales cycle. Sales cycle usually means the deals that closed. Time to disposition includes the ones that were disqualified in four minutes, which is most of them, and that makes the distribution wildly asymmetric.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Every idea on this site that involves grading a form by outcomes has this number as its precondition. If a lead reaches a [verdict](/glossary/verdict) in three days, you can rank form variants on what they produced. If it takes nine months, you cannot — you will be comparing this quarter’s completions with last year’s deals and calling it an experiment.",
      },
      {
        kind: "p",
        text: "It also determines when a report is safe to read. Any outcome-weighted number computed over a window shorter than the median lag is biased toward whatever closes fastest, which is usually the small, cheap, and least interesting business.",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "Measure the **median and the 90th percentile**, separately for disqualified and for closed. The mean is meaningless on a distribution this skewed.",
          "If the lag is long, adopt an interim proxy that arrives early and correlates: SQL acceptance, meeting held, first reply. Grade against the proxy now and audit the proxy against revenue later.",
          "Set a timeout. A lead with no disposition after your p90 is a disposition — record it as one instead of leaving it open forever.",
          "Publish the number next to any outcome report so the reader knows how much of the cohort has actually resolved.",
        ],
      },
      {
        kind: "quote",
        text: "Tracking-wise, I’d also separate the stages. Form started, contact captured, form completed, visit booked, job won. Those are not the same quality of conversion.",
        attribution: "u/kaancata · r/DigitalMarketing · May 2026",
      },
    ],
    mistake: {
      heading: "Assuming you need the final outcome",
      blocks: [
        {
          kind: "p",
          text: "Teams with long cycles conclude that outcome-based measurement is not for them, and stay on completion rate by default. That is the wrong conclusion from a correct observation.",
        },
        {
          kind: "p",
          text: "You need the earliest signal that reliably orders your leads, not the last one. “Sales accepted it” at day four is enormously more informative than “someone submitted” at minute zero, and it arrives in time to act on — see [MQL vs SQL](/glossary/mql-vs-sql) for the signal most teams already compute.",
        },
      ],
    },
    related: ["verdict", "yield", "hindsight", "mql-vs-sql", "outcome-webhook"],
  },

  {
    slug: "conditional-logic",
    term: "Conditional logic",
    aka: "Branching, skip logic, display rules",
    group: "Form mechanics",
    shortDef:
      "Showing, hiding, skipping or routing based on answers — the category’s number one functional complaint, and the missing piece is a debugger.",
    description:
      "Conditional logic breaks past about five conditions in tool after tool. The failure is not the rules engine; it is that no builder can tell you why a given respondent saw a given question.",
    definition: [
      {
        kind: "p",
        text: "Rules that change the form as it is being filled: show this field if that answer, skip to step four, route to a different owner, require something conditionally.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "It is the most-complained-about *functional* capability in the whole category — twelve independent sources in our research, second only to pricing, and unlike pricing it is unclaimed. Everyone has it; nobody has made it hold.",
      },
      {
        kind: "quote",
        text: "The conditional logic is always the biggest headache it never works right for anything beyond super simple forms.",
        attribution: "u/devhisaria · r/nocode · Oct 2025",
      },
      {
        kind: "quote",
        text: "Conditional settings would erase whenever possible answers in the drop-down list",
        attribution:
          "Mim H. · Technical Product Owner, Computer Software · Capterra/Formstack · Oct 2020",
      },
      {
        kind: "quote",
        text: "I’d pay for a form builder that handles conditional logic well and stays simple to manage without making every small change feel complicated.",
        attribution: "u/thinking_byte · r/nocode · Jul 2026",
      },
    ],
    inPractice: [
      {
        kind: "p",
        text: "The complaints cluster at four or five conditions, and the reason is structural rather than a bug in any one product. Rules are *authored* as a flat list and *executed* as a graph. Past a handful of rules the graph has paths the author never pictured, and every builder shows you the list.",
      },
      {
        kind: "list",
        items: [
          "**Attach rules to the field they govern**, not to a central rules screen, so the rule is visible where its effect is.",
          "**Test paths, not rules.** Enumerate the realistic answer combinations and walk them. The bug is almost never in one rule; it is in two rules interacting.",
          "**Watch rules-per-form as a health metric.** Past about eight, the form is a decision tree wearing a form’s clothes, and it needs a different tool or a split.",
          "**Never depend on rule order.** If reordering the list changes the outcome, you have written a program, and you are maintaining it in a UI with no version control.",
        ],
      },
    ],
    mistake: {
      heading: "Forgetting that logic changes your denominators",
      blocks: [
        {
          kind: "p",
          text: "A question shown to 30% of respondents cannot be compared with one shown to everyone, and yet both appear in the same drop-off report with the same-looking percentages. Branching quietly makes every field-level metric conditional on a path.",
        },
        {
          kind: "p",
          text: "Report per-field rates against the population that actually reached the field. If your tool does not do that — most do not — the cliff in your [drop-off curve](/glossary/form-drop-off-analysis) may be a branch rather than a problem.",
        },
      ],
    },
    related: [
      "form-drop-off-analysis",
      "multi-step-form",
      "progressive-profiling",
      "completion-rate",
      "outcome-webhook",
    ],
  },

  {
    slug: "progressive-profiling",
    term: "Progressive profiling",
    group: "Form mechanics",
    shortDef:
      "Ask three fields now and three more next time — a trade of completion for enrichment that almost nobody measures.",
    description:
      "Progressive profiling moves friction into a later session, which is why it looks free. It depends entirely on identity stitching, and when stitching fails you get duplicates instead of enrichment.",
    definition: [
      {
        kind: "p",
        text: "Shortening the form by asking only for what you do not already know, and collecting the rest across subsequent visits. A first-time visitor gives you an email; a returning one is asked for company size instead of being asked for their email again.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "It is the standard answer to the oldest argument in lead generation — more fields means better leads and fewer of them — and it appears to dissolve the trade rather than make it. That appearance is the thing to be careful about.",
      },
      {
        kind: "p",
        text: "The cost has not gone away. It has moved to a session where it is much harder to see, because the friction you added lands on a returning visitor and the abandonment it causes is attributed to a different form on a different day.",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "You need a known-visitor store and a way to recognise people: a first-party cookie, an identified email link, or an authenticated session. Cookie lifetimes are short now, so plan for the recognition failing routinely rather than rarely.",
          "Order the fields by what actually changes routing or scoring. Most profiling questionnaires collect data nobody has ever queried.",
          "Define what happens when recognition fails — usually, fall back to the full short form rather than showing a stranger a question that assumes context.",
          "Cap it. Three visits of two questions is profiling; eight visits is an interrogation with a memory.",
        ],
      },
    ],
    mistake: {
      heading: "Not planning for the stitch to fail",
      blocks: [
        {
          kind: "p",
          text: "When identity resolution misses — cleared cookies, a different device, a privacy browser — progressive profiling does not degrade to a normal form. It creates a second record for a person you already had, with a different subset of fields filled in.",
        },
        {
          kind: "p",
          text: "Do that at volume and your CRM fills with half-complete near-duplicates that no merge rule can confidently join, which is a more expensive problem than the long form you were avoiding. See [duplicate leads](/glossary/duplicate-leads).",
        },
      ],
    },
    related: [
      "duplicate-leads",
      "hidden-field",
      "form-abandonment",
      "conditional-logic",
      "multi-step-form",
    ],
  },

  {
    slug: "multi-step-form",
    term: "Multi-step form",
    aka: "Multi-page form, form funnel",
    group: "Form mechanics",
    shortDef:
      "Splitting one form across several screens — the category’s most confident best practice, and one of its least evidenced.",
    description:
      "“Multi-step converts better” is repeated everywhere and tested almost nowhere. The one practitioner in our research with real data found the opposite, and the disagreement has stood unresolved since 2015.",
    definition: [
      {
        kind: "p",
        text: "Breaking a form into sequential screens, usually with a progress indicator, so the visitor sees a few fields at a time instead of all of them at once.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Because it is asserted as settled and is not. Two mechanisms are in play and they point in opposite directions. Commitment and reduced visual weight help: a short first screen is easier to start, and having started, people continue. Page transitions hurt: each one is a load, a re-render, and a moment to reconsider.",
      },
      {
        kind: "p",
        text: "Which effect dominates is an empirical question about your traffic, your offer, and your form length. The category answered it by consensus instead.",
      },
      {
        kind: "quote",
        text: "When I was a web dev for a company with a huge web presence we found that for every new page (or form) load using a multi-step form lost us more and more users (significantly). Yes, each site is different but think long and hard about the multi-step option.",
        attribution: "deleted account · r/cro · Jan 2016",
      },
      {
        kind: "quote",
        text: "I honestly think this is one of those “nevermind the best practices, test it out yourself”",
        attribution: "u/AhmedF · r/cro · Nov 2015",
      },
      {
        kind: "p",
        text: "That advice is a decade old and still correct, which is itself the finding: ten years on, testing it yourself is still awkward enough that most people repeat the consensus instead.",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "Put the low-friction, high-commitment question first. What goes on screen one determines the start rate, and the start rate determines everything after it.",
          "Save each step server-side as a [partial submission](/glossary/partial-submission). A multi-step form without partials discards exactly the data that would tell you whether it was working.",
          "Do not add a step to shorten a screen. Add a step when the questions genuinely belong to different phases of the same decision.",
          "Keep transitions instant. If a step change costs a network round trip, you are paying the documented cost of multi-step for none of its benefit.",
        ],
      },
    ],
    mistake: {
      heading: "Judging it with completion rate",
      blocks: [
        {
          kind: "p",
          text: "Multi-step forms game completion rate by construction. Most implementations count a “start” once the first screen is submitted, which moves the start line past the hardest question — so the same population produces a much better-looking ratio and nothing has changed.",
        },
        {
          kind: "p",
          text: "Compare on submissions per *visitor to the page*, not per form start, and compare the leads that resulted rather than the fills. The single-step form that produces fewer, better-informed submissions can lose a completion-rate test and win the quarter. See [completion rate](/glossary/completion-rate) and [Yield](/glossary/yield).",
        },
      ],
    },
    related: [
      "completion-rate",
      "form-abandonment",
      "partial-submission",
      "hindsight",
      "yield",
    ],
  },

  {
    slug: "hidden-field",
    term: "Hidden field",
    group: "Data plumbing",
    shortDef:
      "An input the visitor never sees, carrying your attribution into the submission — and the first thing an automated filler reads.",
    description:
      "Hidden fields carry GCLID, UTMs, referrer and session context into every lead you capture. Why they break silently, why they must be populated at landing rather than at submit, and their defensive cousin.",
    definition: [
      {
        kind: "p",
        text: "A form input the visitor does not fill in, populated by script or by your server, and submitted with everything else. This is how a lead record ends up knowing which ad produced it, which page it came from, and what the session looked like.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Every piece of attribution you have at the lead level arrives through this mechanism. If the hidden field is empty, the [GCLID](/glossary/gclid) is gone, the campaign is unknown, and no amount of downstream analysis recovers it — the click identifier existed for one page load and was not written down.",
      },
      {
        kind: "p",
        text: "The same mechanism has a second, opposite job. A [honeypot](/spam/honeypot-fields) is a hidden field used defensively: one nobody should fill, whose population is evidence of automation. Attribution fields are hidden fields used descriptively. An automated filler that fills everything it finds fills both, which is why the honeypot works at all — and why a filler smart enough to skip your honeypot is also reading your attribution.",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "**Capture at landing, persist in a first-party cookie or server session, and write into the field at render.** Not at submit.",
          "Carry the whole set: click ids, UTM parameters, landing page path, referrer, and a session id you can join on later.",
          "Test them on the paths that break: cached pages served by a CDN, forms embedded in an iframe on another domain, and any journey that crosses domains.",
          "Alert when a field that is normally populated goes empty. A silently broken attribution field looks exactly like a change in traffic mix, and it can run for a quarter.",
        ],
      },
    ],
    mistake: {
      heading: "Reading the URL at submit time",
      blocks: [
        {
          kind: "p",
          text: "The single most common attribution bug in lead generation. The script reads `window.location.search` when the form is submitted rather than when the visitor landed.",
        },
        {
          kind: "p",
          text: "Your best-behaved buyer clicks the ad, reads three pages, checks the pricing, and then submits from a URL with no parameters on it. The tracking parameters were on the *first* page. The submission is recorded as direct, the campaign gets no credit, and the report concludes that direct traffic converts unusually well.",
        },
      ],
    },
    related: [
      "gclid",
      "duplicate-leads",
      "server-side-tracking",
      "offline-conversion-import",
      "progressive-profiling",
    ],
    spam: ["honeypot-fields"],
  },

  {
    slug: "duplicate-leads",
    term: "Duplicate leads",
    aka: "Lead deduplication, double submission",
    group: "Data plumbing",
    shortDef:
      "The same person, twice — inflating your conversion count and, through it, the signal you send back to the ad platform.",
    description:
      "Duplicates are usually treated as CRM hygiene. They are an attribution problem first: every double-counted conversion is a training example you paid for and did not receive.",
    definition: [
      {
        kind: "p",
        text: "Two or more records representing one submission or one person. They arrive three ways: the same submission processed twice, the same person submitting twice, and the same person recognised as two people because the join key differed.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "They corrupt the count before they corrupt the CRM. A duplicated conversion fires a duplicated event, and the ad platform treats every event as evidence about what to go and find more of.",
      },
      {
        kind: "quote",
        text: "the redirect has a boring upside nobody’s said yet: post/redirect/get. swapping state on the same url means back and refresh can re-fire the submit, so you end up with duplicate leads that look like two different people",
        attribution: "u/navlio · r/webdev · Aug 2026",
      },
      {
        kind: "quote",
        text: "we had a quote form where the endpoint took ~4s and one user made three identical rows before the button ever disabled",
        attribution: "u/navlio · r/webdev · Aug 2026",
      },
      {
        kind: "p",
        text: "Three rows, one buyer, one intention. Your CPL improved, your conversion volume improved, and your sales team called the same person three times.",
      },
    ],
    inPractice: [
      {
        kind: "p",
        text: "Three layers, because each fails differently and none is sufficient alone.",
      },
      {
        kind: "list",
        items: [
          "**Client:** disable the button on submit and generate an idempotency key per form render. Slow endpoints produce duplicates from impatience, not from malice.",
          "**Server:** a unique constraint on that idempotency key, and post/redirect/get so a refresh cannot resubmit.",
          "**CRM:** a merge rule for the same human arriving through different forms weeks apart, which no request-level mechanism can catch.",
        ],
      },
      {
        kind: "p",
        text: "Send a stable `event_id` with every conversion so the ad platform can deduplicate too — see [conversions API](/glossary/conversions-api).",
      },
    ],
    mistake: {
      heading: "Deduplicating on email alone, after the conversion fired",
      blocks: [
        {
          kind: "p",
          text: "Email is a weak key. The same person uses a work address on the demo form and a personal one on the newsletter; two colleagues share an `info@` mailbox; a relay address rotates. Deduplicate on a combination — email, phone, domain plus name — and accept that you will merge some things wrongly and miss others.",
        },
        {
          kind: "p",
          text: "The bigger error is the timing. Most deduplication runs nightly in the CRM, long after the conversion event has already gone to the ad platform. The record gets tidy and the training data stays wrong.",
        },
      ],
    },
    related: [
      "hidden-field",
      "gclid",
      "conversions-api",
      "partial-submission",
      "progressive-profiling",
    ],
    spam: ["ip-rate-limiting"],
  },

  {
    slug: "gclid",
    term: "GCLID",
    aka: "Google Click Identifier; see also GBRAID, WBRAID, FBCLID",
    group: "Data plumbing",
    shortDef:
      "The click id Google appends to your landing page URL — the join key between your CRM and your ad account, and it is discarded by default.",
    description:
      "GCLID is what makes offline conversion import possible. It exists for one page load unless you capture it, it expires, and teams routinely discover they needed it after they needed it.",
    definition: [
      {
        kind: "p",
        text: "A unique identifier Google Ads appends to the destination URL of a click. It identifies that click — not the person and not the campaign directly — and it is the token you hand back to Google later to say what became of it.",
      },
      {
        kind: "p",
        text: "The family matters as much as the term. GBRAID and WBRAID cover iOS journeys where GCLID is unavailable; Meta uses FBCLID, stored as `_fbc`, alongside the `_fbp` browser id. Whatever the platform, the pattern is identical: an opaque click token that must survive from the landing page to your database.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Without it stored on the lead record, [offline conversion import](/glossary/offline-conversion-import) is impossible. You can know a deal closed, know which form produced it, and still have no way to tell Google — because the thing that connects the deal to the click was thrown away when the visitor clicked to the second page.",
      },
      {
        kind: "p",
        text: "It is also the failure with the worst timing. Nobody discovers a missing click id until they try to feed outcomes back, which is months after the leads arrived, and the fix does not apply retroactively.",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "Read it **on landing**, write it to a first-party cookie with a sensible lifetime, and populate a [hidden field](/glossary/hidden-field) at form render.",
          "Store it on the CRM record, not only on the form submission, so it survives the handoff into sales tooling.",
          "Watch the expiry window. Google’s import has a limit on how old a click can be — long cycles need the value uploaded at an interim milestone rather than at close.",
          "Capture the siblings too. A funnel that only handles GCLID silently loses its iOS traffic.",
        ],
      },
    ],
    mistake: {
      heading: "Capturing it at submit instead of at landing",
      blocks: [
        {
          kind: "p",
          text: "Exactly the same bug described under [hidden fields](/glossary/hidden-field), and it is worth stating twice because this is where it costs money. Reading the click id from the URL at submission time works perfectly in testing, where you land on the form and submit immediately.",
        },
        {
          kind: "p",
          text: "It fails in production for every visitor who behaves like a considered buyer — landing, reading, navigating, returning, submitting. The click id is captured for the impulsive and lost for the deliberate, which biases everything you subsequently feed back to the platform.",
        },
      ],
    },
    related: [
      "hidden-field",
      "offline-conversion-import",
      "conversions-api",
      "server-side-tracking",
      "duplicate-leads",
    ],
  },

  {
    slug: "offline-conversion-import",
    term: "Offline conversion import",
    aka: "Offline conversion tracking, OCI",
    group: "Data plumbing",
    shortDef:
      "Uploading what happened downstream back to the ad platform against the click id — a standard practice, and one that teaches the platform while teaching the form nothing.",
    description:
      "Offline conversion import is what competent PPC teams already do about junk leads. What it fixes, what it costs to run, and the half of the loop that stays open.",
    definition: [
      {
        kind: "p",
        text: "Taking the outcome your CRM eventually recorded — qualified, meeting held, closed-won, and a value — and uploading it to the ad platform against the [click id](/glossary/gclid) that produced it, so the optimiser learns from the outcome rather than from the form fill.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Because a form-fill conversion action is an instruction, and the platform follows instructions well:",
      },
      {
        kind: "quote",
        text: "all those bot submissions were training Google’s/your ad network’s machine learning algorithm to send you more bot-like traffic.",
        attribution: "u/polygraph-net · r/marketing · Jul 2023",
      },
      {
        kind: "p",
        text: "Importing real outcomes changes what the optimiser is chasing. It is the correct response to junk leads, it works, and it is already first-line advice among experienced practitioners — we are not claiming to have discovered it and you should be suspicious of anyone who does.",
      },
      {
        kind: "note",
        label: "What it does not do",
        text: "The loop teaches the ad platform. It does not teach the form. The outcome data flows from your CRM to Google and stops; nothing writes it back onto the submission, so no question, field, or variant ever learns which of them produced the deal. That open half is the part nobody in our research corpus had closed — see [Hindsight](/glossary/hindsight).",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "Requires the click id stored on the lead record. Everything else is scheduling.",
          "Upload by API on a schedule, or via scheduled sheet imports if the volume is small — plenty of teams still run it weekly by hand.",
          "Use a small, stable set of conversion names. Renaming a conversion action resets what the optimiser has learned.",
          "Send a value, not just an event, wherever you can defend the number. Value-based bidding is the reason to do this at all.",
          "Respect the click-age window, and upload at an interim milestone if your cycle is longer than it — see [time to disposition](/glossary/time-to-disposition).",
        ],
      },
    ],
    mistake: {
      heading: "Leaving the raw form-submit conversion switched on alongside it",
      blocks: [
        {
          kind: "p",
          text: "The most common way this fails is not a broken upload. It is importing a clean “qualified lead” conversion while the old “form submitted” conversion is still active and still counted.",
        },
        {
          kind: "p",
          text: "The platform now has two objectives, one of which is enormously cheaper to satisfy, and it will pursue the cheap one because that is what optimisation means. Demote the fill to a secondary, non-bidding action the day the outcome import goes live.",
        },
      ],
    },
    related: [
      "gclid",
      "conversions-api",
      "server-side-tracking",
      "verdict",
      "cost-per-lead",
    ],
    spam: ["taking-the-form-down"],
  },

  {
    slug: "server-side-tracking",
    term: "Server-side tracking",
    group: "Data plumbing",
    shortDef:
      "Sending conversion events from your server rather than the visitor’s browser — more reliable measurement of a dataset that may be worse.",
    description:
      "Server-side tracking recovers conversions lost to ad blockers and browser restrictions. It also reports bot submissions more faithfully than a browser pixel ever did, which is not an improvement.",
    definition: [
      {
        kind: "p",
        text: "Emitting analytics and conversion events from your own infrastructure — a server-side tag container or a direct API call — instead of relying on a script in the visitor’s browser.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Browser-side pixels lose events, systematically and unevenly: blockers, tracking prevention, short cookie lifetimes, and people who navigate away before the tag fires. The loss is not random, which is worse than the loss being large.",
      },
      {
        kind: "quote",
        text: "People don’t switch forms because of price. They switch because their tracking is broken. Typeform doesn’t fire server side pixels. If you run paid acquisition, half your conversions disappear into iOS 14 and ad blockers. … The real moat isn’t the builder. It’s the integrations. Server side Meta CAPI, TikTok CAPI, Google Ads, GA4. That’s what marketers pay $99/mo for.",
        attribution:
          "OP, eighteen months building a Typeform alternative · r/SaaS · 2026 (self-promotional; treat as an operator’s claim, not a measurement)",
      },
      {
        kind: "note",
        label: "The part nobody says",
        text: "Server-side tracking fires reliably for *everything* that reaches your server, including the automated submission a browser pixel would have missed because it never ran any JavaScript. You have improved the fidelity of your measurement without improving what is being measured — and the number goes up, which reads as success.",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "Send a shared `event_id` from both the browser and the server so the platform deduplicates rather than double-counting. See [duplicate leads](/glossary/duplicate-leads).",
          "Pass hashed identifiers — email, phone, click id — as match keys. Match quality is the metric that determines whether any of this worked.",
          "Carry consent state to the server explicitly. Moving the call server-side does not move the legal basis with it.",
          "Fire on a validated submission, not on a request. Otherwise you have built a very reliable pipe for reporting spam.",
        ],
      },
    ],
    mistake: {
      heading: "Treating it as a way around consent",
      blocks: [
        {
          kind: "p",
          text: "It is sold, sometimes explicitly, as the answer to blockers and privacy controls. It is not a legal mechanism. It is a reliability mechanism, and the same rules about what you may collect and why apply to a request originating from your data centre.",
        },
        {
          kind: "p",
          text: "The measurement version of the same error: judging the migration by event volume. Volume goes up by construction, because you stopped losing events. That tells you the pipe works. It tells you nothing about whether the events are worth having.",
        },
      ],
    },
    related: [
      "conversions-api",
      "gclid",
      "offline-conversion-import",
      "duplicate-leads",
      "hidden-field",
    ],
  },

  {
    slug: "conversions-api",
    term: "Conversions API",
    aka: "CAPI, Events API, enhanced conversions",
    group: "Data plumbing",
    shortDef:
      "The server-to-server endpoint each ad platform provides for conversion events. A transport, not a truth.",
    description:
      "Meta’s CAPI and its equivalents send conversions more reliably. What match quality actually measures, why event volume is a misleading success metric, and what CAPI cannot fix.",
    definition: [
      {
        kind: "p",
        text: "The server-side endpoint an ad platform exposes for receiving conversion events directly: Meta’s Conversions API, TikTok’s Events API, Google’s enhanced conversions and Ads API uploads. Same idea, different names and payloads.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "It is the practical implementation of [server-side tracking](/glossary/server-side-tracking) for paid social, and it is genuinely what closes the measurement gap that opened with iOS tracking restrictions. Teams that run it well recover a real and material share of attributed conversions.",
      },
      {
        kind: "p",
        text: "The framing worth holding on to: CAPI is a pipe. It delivers whatever you put in it, more reliably than the browser did. If what you put in it is “form submitted,” you have become more effective at teaching the platform to find people who submit forms — which is the correct outcome only if form submissions are the thing you want.",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "**Deduplicate with the pixel.** Same `event_id` and `event_name` from both paths, or every conversion counts twice.",
          "**Match keys decide everything.** Hashed email, phone, click id, external id, IP and user agent. Meta’s event match quality score is mostly a report on how many of those you sent.",
          "**A low match score is usually missing fields, not broken code.** Check what you are sending before you debug the integration.",
          "**Send the value.** An event without a value trains the optimiser on volume, which is where this whole problem started.",
        ],
      },
    ],
    mistake: {
      heading: "Judging it by event volume",
      blocks: [
        {
          kind: "p",
          text: "The dashboard shows more conversions after the migration, which is exactly what you were told to expect, so the project is declared a success and nobody looks again.",
        },
        {
          kind: "p",
          text: "But volume rising is the mechanical consequence of losing fewer events; it is not evidence that the campaign improved. The measurements that would tell you are downstream — [MQL→SQL rate](/glossary/mql-vs-sql) and cost per closed deal — and they are the ones nobody re-checks after a tracking migration.",
        },
      ],
    },
    related: [
      "server-side-tracking",
      "gclid",
      "offline-conversion-import",
      "duplicate-leads",
      "cost-per-lead",
    ],
  },

  {
    slug: "outcome-webhook",
    term: "Outcome webhook",
    group: "Data plumbing",
    shortDef:
      "A callback that tells the form what happened to a submission — the direction webhooks in this category almost never run.",
    description:
      "Form webhooks push data out and nothing comes back. What an inbound outcome callback needs to carry, why reconciliation matters more than delivery, and why failing loudly is the requirement.",
    definition: [
      {
        kind: "p",
        text: "An HTTP callback in the inbound direction: your CRM, ops tool, or a manual action tells the form what a given submission turned out to be — accepted, disqualified, closed, and worth this much.",
      },
      {
        kind: "p",
        text: "It is unusual only in its direction. Every form builder has outbound webhooks. Almost none accept anything back, so a submission is a fact that is true at the moment it is created and never updated again.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "It is the smallest possible mechanism for closing the loop. It does not require a CRM integration, a data warehouse, or a project — one `POST` carrying a submission id and an outcome is enough to make everything downstream of it possible.",
      },
      {
        kind: "quote",
        text: "Most builders just send a flat webhook, but for a real automation, you need the automation to be able to “search” and “update” the submissions too. Another missing link is internal action on the form itself, like setting status, priority etc.",
        attribution: "u/Calm_Weakness_2968 · r/ProductivityApps · Apr 2026",
      },
      {
        kind: "p",
        text: "And the requirement that came out of the research more clearly than any feature request:",
      },
      {
        kind: "quote",
        text: "For me, the paid feature is dependable integrations, not prettier form fields. If a form maps cleanly into an ERP or CRM, handles conditional logic without weird workarounds, and fails loudly when a sync breaks, that’s worth paying for.",
        attribution: "u/SufficientFrame · r/nocode · Jul 2026",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "Carry a **submission id, an outcome, a value, a currency and a timestamp**. Anything else is optional; the id is not.",
          "Make it **idempotent**. The same outcome delivered three times must not become three outcomes, and retries are how delivery actually works.",
          "Allow **restatement**. Deals reopen and get requalified; the final answer is the last one, not the first.",
          "**Reconcile on a schedule.** Webhooks are lost — a nightly sweep for submissions past their [expected disposition window](/glossary/time-to-disposition) with no outcome is what turns a best-effort feed into a dataset.",
          "**Fail loudly.** A sync that breaks silently is the same failure as a dashboard that reports fine while the pipeline is empty.",
        ],
      },
    ],
    mistake: {
      heading: "Trusting delivery instead of reconciling",
      blocks: [
        {
          kind: "p",
          text: "Webhook integrations are built assuming delivery and then quietly stop. The endpoint changes, a certificate expires, a retry budget runs out — and because nothing was expecting a particular volume, nothing notices.",
        },
        {
          kind: "quote",
          text: "platform integration can break without warning",
          attribution:
            "Damon B. · Founder, Telecommunications · Capterra/Typeform · May 2025",
        },
        {
          kind: "p",
          text: "The result is a dataset with a hole in it whose shape correlates with when the integration was broken — which is the worst possible bias, because the missing outcomes are not missing at random.",
        },
      ],
    },
    related: ["verdict", "yield", "time-to-disposition", "hindsight", "lead-scoring"],
  },

  {
    slug: "per-response-pricing",
    term: "Per-response pricing",
    aka: "Submission caps, response limits",
    group: "Measurement",
    shortDef:
      "Being billed by the submission — which makes spam a line item and turns a bot wave into a closed door for real buyers.",
    description:
      "Response caps are the most-complained-about thing in the form category. Combined with spam they produce a specific failure: you pay for the bots, then the cap locks out the customers.",
    definition: [
      {
        kind: "p",
        text: "A pricing model metered on submissions received per month, usually with a hard cap on the plan and a step up to the next tier when you exceed it.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Response caps and paywalled basics are the single most universal complaint in our research — roughly forty-five independent sources, cutting across every major vendor. That alone would make it worth a page.",
      },
      {
        kind: "p",
        text: "But the interesting part is what happens when metered pricing meets a spam problem, which one practitioner put together in a single sentence:",
      },
      {
        kind: "quote",
        text: "If we stay on the current trajectory, websites will have to remove contact forms in the next few years due to the sheer volume of spam bots submissions. If your form software has a submission limit, bots are using it before real people even get a chance.",
        attribution: "u/kjdscott · web developer / agency · r/Entrepreneur · Sep 2025",
      },
      {
        kind: "p",
        text: "Two costs, not one. You are billed for the junk, and then the cap converts an attack into an outage for the people you were trying to reach.",
      },
      {
        kind: "p",
        text: "And the same practitioner names the second-order effect, which is that defending yourself becomes another subscription:",
      },
      {
        kind: "quote",
        text: "You can pay for OOP-Spam AI API to weed out Spam entries, but small businesses I work with do not have the budget for all these extra subscriptions.",
        attribution: "u/kjdscott · r/Entrepreneur · Sep 2025",
      },
    ],
    inPractice: [
      {
        kind: "p",
        text: "Four questions to ask any vendor before you choose a plan, none of which are usually answered on the pricing page:",
      },
      {
        kind: "list",
        items: [
          "**Do rejected submissions count?** Most tools meter what arrives, not what you keep — so the spam you successfully filtered is still on the bill.",
          "**Do [partials](/glossary/partial-submission) count?** If yes, switching on drop-off analysis raises your bill.",
          "**What happens at the cap?** A hard stop is an outage. Overage is a bill. Only one of those loses you customers, and it is rarely the one people fear.",
          "**Are exports gated?** Data you cannot get out is data you do not own.",
        ],
      },
    ],
    mistake: {
      heading: "Sizing the plan on expected real volume",
      blocks: [
        {
          kind: "p",
          text: "You budget for four hundred enquiries a month and buy the five-hundred plan. Then a single afternoon delivers six hundred and sixty-five submissions and both the budget and the cap are gone before anyone has looked at the inbox.",
        },
        {
          kind: "p",
          text: "Size on your worst hour, not your average month, and put [rate limiting](/spam/ip-rate-limiting) in front of a metered form — not because it stops the attack, but because it caps what the attack costs you.",
        },
      ],
    },
    related: [
      "cost-per-lead",
      "partial-submission",
      "completion-rate",
      "duplicate-leads",
    ],
    spam: ["ip-rate-limiting", "taking-the-form-down"],
  },

  {
    slug: "webmcp",
    term: "WebMCP",
    aka: "Agent-callable web, browser tool surface",
    group: "Agents",
    shortDef:
      "A proposed browser standard letting a page offer tools an agent can call, instead of an agent pretending to be a person with a mouse.",
    description:
      "WebMCP was announced at Google I/O 2026 with an early preview in Chrome Canary. Why a callable surface is the only thing that separates an agent from a bot, and what it does not solve.",
    definition: [
      {
        kind: "p",
        text: "A way for a web page to declare structured actions an AI agent can invoke directly, rather than the agent inferring intent from the DOM and simulating clicks and keystrokes. Google announced WebMCP at I/O 2026, and an early preview shipped in Chrome Canary in February 2026.",
      },
      {
        kind: "p",
        text: "It is early. There is nothing to deploy in production yet, and the specification will change.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Because of what it makes observable. Today an agent filling in your form on behalf of a real buyer and a script filling in your form to waste your time are the same event: a browser, driving a form, submitting values. Nothing in the request distinguishes them, which is why every defense in the [anti-spam set](/spam) is reduced to guessing from behaviour.",
      },
      {
        kind: "p",
        text: "A callable surface separates them — not because agents are honest, but because the declared path is easier than the simulated one. An agent that can call a tool has no reason to drive a form, and something driving your form while a tool sits there unused has told you something without being asked.",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "Nothing production-ready today. Watch the specification rather than building against it.",
          "The preparation that is not wasted either way: know which of your forms are the ones an assistant would reasonably be asked to fill in, and decide now whether you want that traffic.",
          "Record how each submission arrived, whatever the surface. If the distinction becomes measurable in 2027, the accounts that instrumented it in 2026 have a year of history and everyone else has none.",
        ],
      },
    ],
    mistake: {
      heading: "Assuming agent traffic will identify itself out of politeness",
      blocks: [
        {
          kind: "p",
          text: "It will not, any more than crawlers reliably honour `robots.txt`. Identification happens when it is the path of least resistance, which means the design question is not “will agents behave” but “is the honest route cheaper than the dishonest one on my site.”",
        },
        {
          kind: "p",
          text: "Build for that and good actors take the marked door for their own convenience. Build a marked door that is slower or more restricted than the form and nobody uses it, including the agents you wanted.",
        },
      ],
    },
    related: ["manifest", "origin", "hidden-field"],
    spam: ["cloudflare-turnstile", "recaptcha-v3"],
  },

  {
    slug: "origin",
    term: "Origin",
    ours: true,
    group: "Our vocabulary",
    shortDef:
      "Our name for the provenance stamp on every submission: Human, Agent, or Unverified.",
    description:
      "Origin is Endpoint Forms’ term for how a submission arrived — human, identified agent, or unverified. What it describes, why the third value is not called “Bot,” and what it deliberately does not do.",
    definition: [
      {
        kind: "p",
        text: "A single field on every submission recording how it arrived, with three values: **Human**, **Agent**, **Unverified**. It is a dashboard column, an API field, and a filter.",
      },
      {
        kind: "note",
        label: "This is our word",
        text: "“Origin” as a submission field is our vocabulary, not an industry standard. Nobody else uses it and you should not expect to find it elsewhere. The underlying idea — provenance on a record — is old and general; this specific naming is ours.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Because “how did this arrive” is currently not a question a lead list can answer. You can filter by campaign, by page, by form and by date. You cannot filter by whether a person was involved, and in a web where most requests are automated that is the filter that decides what the rest of the list means.",
      },
      {
        kind: "p",
        text: "The third value is deliberately **Unverified** rather than **Bot**. We do not know it was a bot. We know we did not establish it was a person, which is a different and smaller claim — and stating the smaller claim is the whole difference between a tool you can trust and a dashboard that flatters you.",
      },
    ],
    inPractice: [
      {
        kind: "p",
        text: "Origin is derived, not declared. One form definition publishes two surfaces — the human interface and a [Manifest](/glossary/manifest) an agent can call — so which surface a submission came through is a fact about the request rather than an inference about the submitter. Everything that arrives by neither identified path is Unverified.",
      },
      {
        kind: "note",
        label: "Not shipped",
        text: "Endpoint Forms is pre-launch. This page describes what we are building and how we intend it to work, not a feature you can currently switch on. If that changes and this page does not, the fault is ours.",
      },
    ],
    mistake: {
      heading: "Expecting a stamp to be a filter",
      blocks: [
        {
          kind: "p",
          text: "Origin describes. It does not block. Nothing on a submission that arrives after the fact can prevent that submission, which is true of every classifier and not a limitation specific to ours.",
        },
        {
          kind: "p",
          text: "If your problem is volume hitting the door, the tools for it are in the [anti-spam set](/spam) and the honest recommendation there is [Turnstile](/spam/cloudflare-turnstile) and [OTP verification](/spam/otp-verification), neither of which is us. Origin is for the question that comes after: of the submissions you accepted, which ones involved a person.",
        },
        {
          kind: "p",
          text: "The second error is reading Unverified as an accusation. Some of it is your most privacy-conscious customer. Route it, do not delete it.",
        },
      ],
    },
    related: ["manifest", "verdict", "webmcp", "lead-scoring"],
    spam: ["cloudflare-turnstile", "otp-verification", "honeypot-fields"],
  },

  {
    slug: "verdict",
    term: "Verdict",
    ours: true,
    group: "Our vocabulary",
    shortDef:
      "Our name for the outcome written back onto a submission: Won, Lost, Disqualified, or Awaiting verdict — plus a value.",
    description:
      "Verdict is Endpoint Forms’ term for what a submission turned out to be. Why the empty state is the interesting part, and why it needs an outcome webhook rather than a CRM integration.",
    definition: [
      {
        kind: "p",
        text: "A field on each submission carrying what happened to it downstream: **Won**, **Lost**, **Disqualified**, or **Awaiting verdict**, together with a value amount. It arrives from a CRM sync or a one-line [outcome webhook](/glossary/outcome-webhook).",
      },
      {
        kind: "note",
        label: "This is our word",
        text: "“Verdict” as the name for an outcome field on a form submission is our vocabulary. The concept — closed-loop reporting — is standard practice in revenue operations. The word, applied here, is ours.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Because it is the missing column. A form builder today knows a submission happened and nothing else; the fact that the lead was disqualified in ninety seconds exists in a CRM that never talks back.",
      },
      {
        kind: "p",
        text: "The empty state is the part worth arguing about: **142 submissions awaiting verdict.** That is a sentence no form builder can currently print, and printing it changes what a submissions list is — from a record of things that happened into a list of open questions.",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "You do not need a CRM integration to start. A submission id and an outcome, posted from wherever the decision is actually made, is the whole mechanism.",
          "**Disqualified is a distinct value from Lost**, and conflating them destroys the analysis. Lost means you competed. Disqualified means they should never have been in the list, which is a form problem rather than a sales one.",
          "Values need a currency and a definition — booked, invoiced, or collected — recorded once and not changed.",
          "Reconcile. Missing verdicts are not missing at random; see [outcome webhook](/glossary/outcome-webhook).",
        ],
      },
      {
        kind: "note",
        label: "Not shipped",
        text: "Endpoint Forms is pre-launch. This describes the design, not a shipped feature.",
      },
    ],
    mistake: {
      heading: "Reading verdicts before the cohort has resolved",
      blocks: [
        {
          kind: "p",
          text: "Verdicts arrive over time, and the fast ones are not representative. Disqualifications land in minutes, wins land in weeks or months — so any report run early is dominated by rejections and looks alarming for reasons that have nothing to do with the form.",
        },
        {
          kind: "p",
          text: "Always show what share of the cohort is still awaiting a verdict alongside the result, and never compare two cohorts of different ages. Your [time to disposition](/glossary/time-to-disposition) tells you how long to wait.",
        },
      ],
    },
    related: ["yield", "hindsight", "outcome-webhook", "time-to-disposition", "origin"],
  },

  {
    slug: "yield",
    term: "Yield",
    ours: true,
    group: "Our vocabulary",
    shortDef:
      "Our name for the quality-adjusted metric: Yield rate is the share of submissions that reached a good verdict; Yield value is revenue per hundred submissions.",
    description:
      "Yield is completion rate with the outcome attached. Two views, how to compute them honestly, and why Yield and completion rate move independently.",
    definition: [
      {
        kind: "p",
        text: "Two related numbers, both computed from [verdicts](/glossary/verdict) rather than from submissions.",
      },
      {
        kind: "list",
        items: [
          "**Yield rate** — the share of submissions that reached a good verdict. Sayable in a stand-up: *“Completion rate is 41%. Yield is 4%.”*",
          "**Yield value** — revenue per hundred submissions, which is the version finance recognises.",
        ],
      },
      {
        kind: "note",
        label: "This is our word",
        text: "“Yield” already means quality-adjusted output in finance and agriculture, which is why we borrowed it; applied to form submissions it is our vocabulary and not an industry standard.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Because the two numbers move independently, and once you can see both, the disagreements that used to be arguments become observations.",
      },
      {
        kind: "p",
        text: "A shorter form completes better and converts worse. A qualifying question costs completion and raises Yield. Every one of those trades is currently made on instinct, defended with best practice, and never measured — because only one side of the trade is visible.",
      },
      {
        kind: "quote",
        text: "I’d test form completion rate against qualified-call rate rather than guessing.",
        attribution: "u/TrafficAcademySEO · r/DigitalMarketing · Aug 2026",
      },
      {
        kind: "p",
        text: "That is the right instinct, described by someone with no tool that does it.",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "Compute over a **fixed cohort window** longer than your [time to disposition](/glossary/time-to-disposition), and publish the resolution share next to the number.",
          "Report Yield rate and Yield value together. Rate alone hides deal-size effects; value alone is hostage to one large deal.",
          "Segment by traffic source before drawing conclusions, for the same reason [completion rate](/glossary/completion-rate) has to be.",
          "Keep completion rate on the dashboard. It is still the right diagnostic for whether the form works as a form — it is just not the number that says whether it worked.",
        ],
      },
      {
        kind: "note",
        label: "Not shipped",
        text: "Endpoint Forms is pre-launch. This is the design, not a report you can run today.",
      },
    ],
    mistake: {
      heading: "Comparing Yield across windows shorter than your disposition lag",
      blocks: [
        {
          kind: "p",
          text: "This is the way a good metric produces bad decisions. Read Yield too early and the cohort is dominated by whatever resolves fastest — small deals, quick disqualifications — so a window that has not matured systematically understates the variants that attract considered buyers.",
        },
        {
          kind: "p",
          text: "The consequence is precise and expensive: you would kill the variant that produces slower, larger deals, using a metric you adopted specifically to avoid that mistake.",
        },
      ],
    },
    related: ["verdict", "hindsight", "completion-rate", "time-to-disposition", "cost-per-lead"],
  },

  {
    slug: "hindsight",
    term: "Hindsight split tests",
    ours: true,
    group: "Our vocabulary",
    shortDef:
      "Our name for split tests ranked on Yield rather than completion rate — where the winner cannot be known at submit time, so the test waits.",
    description:
      "Every form A/B test declares a winner at the moment of conversion, because that is the only event it can see. Hindsight ranks variants on what the submissions turned out to be worth.",
    definition: [
      {
        kind: "p",
        text: "A split test whose ranking metric is [Yield](/glossary/yield) rather than [completion rate](/glossary/completion-rate). Variants are compared on what their submissions turned out to be, which means the result is not available at the moment of conversion — it arrives when the [verdicts](/glossary/verdict) do.",
      },
      {
        kind: "note",
        label: "This is our word",
        text: "“Hindsight split tests” is our name for the idea. Outcome-based experimentation exists elsewhere in marketing; naming it and putting it in a form builder is what is ours here.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Because every existing form A/B tool declares a winner at the submit event — not out of carelessness but out of necessity, since the submit event is the last thing it can observe. The winner is announced before anybody has picked up a phone.",
      },
      {
        kind: "p",
        text: "The research is also unusually clear about how rare form-level testing is in the first place. Marketers split-test ads, landing pages and creative. When forms come up, the test is a one-off before-and-after or nothing at all — and the workaround people are advised to use is their landing-page tool’s page-level test.",
      },
      {
        kind: "quote",
        text: "I’d track completion rate by step and booked-visit rate, not just total form submissions. That’ll tell you whether the automation is helping or just moving the phone call friction onto the page.",
        attribution: "u/TheChandrianX · r/DigitalMarketing · May 2026",
      },
      {
        kind: "p",
        text: "Practitioners keep describing the right experiment. Nobody in our whole research corpus was running it, because no tool ranks variants on anything but fills.",
      },
    ],
    inPractice: [
      {
        kind: "list",
        items: [
          "**Measure [time to disposition](/glossary/time-to-disposition) first.** It sets the minimum length of every test you can run, and if it is very long you need an interim outcome instead.",
          "Pick the ranking metric before the test starts, and record how much of each cohort has resolved when you read it.",
          "Expect the two metrics to disagree. A test where Yield and completion agree taught you nothing you could not have learned for free.",
          "Keep the losing variant’s data. The interesting result is usually *which field* caused the divergence, not which variant won.",
        ],
      },
      {
        kind: "note",
        label: "Not shipped, and one honest caveat",
        text: "Endpoint Forms is pre-launch. There is also a real risk here worth stating: outcome-weighted tests need enough submissions *per verdict class* to be significant, which many forms will never have. On a form producing forty leads a month, this is a directional read, not statistics — and we would rather say that now than sell it as certainty.",
      },
    ],
    mistake: {
      heading: "Running one when you cannot wait for the outcome",
      blocks: [
        {
          kind: "p",
          text: "The failure mode is not calling the test wrongly. It is calling it early — waiting three weeks, running out of patience, and reading a completion-rate result off a test that was designed to measure something else.",
        },
        {
          kind: "p",
          text: "If you cannot wait, do not run a shortened version. Change the ranking metric to the earliest signal you *can* wait for — sales accepted, meeting held — and be explicit that this is what you are measuring.",
        },
      ],
    },
    related: ["yield", "verdict", "time-to-disposition", "multi-step-form", "form-drop-off-analysis"],
  },

  {
    slug: "manifest",
    term: "Manifest",
    ours: true,
    group: "Our vocabulary",
    shortDef:
      "Our name for the machine-callable declaration a form publishes alongside its human interface — one definition, two surfaces.",
    description:
      "Manifest is the agent-callable surface every Endpoint form publishes from the same definition as its human UI. What it is for, why it is not an anti-bot feature, and why it used to be called something else.",
    definition: [
      {
        kind: "p",
        text: "A machine-readable declaration of a form — its fields, types, requirements and validation — published from the same definition that renders the human interface, and callable by an agent directly.",
      },
      {
        kind: "p",
        text: "Lowercase, “handshake” survives as the verb: *did it come through the handshake?* The capability is Manifest; the thing an agent does with it is shake hands.",
      },
      {
        kind: "note",
        label: "This is our word, and it is our second one",
        text: "This capability was called “Handshake” until August 2026. Trademark screening found three live registrants across the relevant classes, one of them a large careers platform actively extending into AI — which made the capitalised name unownable and, just as importantly, unsearchable. “Manifest” already means a machine-readable declaration to developers, which fixes something the old name never explained. Either way it is our vocabulary, not an industry term.",
      },
    ],
    whyItMatters: [
      {
        kind: "p",
        text: "Because publishing from one definition is what makes [Origin](/glossary/origin) possible. If the human form and the machine surface were built separately, the agent path would be a second integration nobody maintains, and the distinction between them would be an inference. From one definition it is a fact about which door the submission came through.",
      },
      {
        kind: "p",
        text: "It also fixes the thing that makes agent traffic indistinguishable today. An agent that can call a tool has no reason to drive a form — see [WebMCP](/glossary/webmcp) for where the standards work is going.",
      },
    ],
    inPractice: [
      {
        kind: "p",
        text: "The design commitment is that the two surfaces cannot drift, because there is only one of them. A field added to the form appears in the Manifest; validation is the same validation; a required field is required on both paths. Any architecture where the machine surface is generated separately reintroduces the drift it was meant to remove.",
      },
      {
        kind: "note",
        label: "Not shipped",
        text: "Endpoint Forms is pre-launch. This describes the intended architecture, not something you can call today.",
      },
    ],
    mistake: {
      heading: "Reading it as an anti-bot feature",
      blocks: [
        {
          kind: "p",
          text: "It does not block anything and it is not a defense. Publishing a callable surface does not stop a script driving your form; it makes the difference between the two observable, which is a different and smaller claim.",
        },
        {
          kind: "p",
          text: "If your problem is volume arriving at the door, the honest answers are in the [anti-spam set](/spam), and the two that work best are not ours. Manifest matters after that, when the traffic you accepted contains both people and agents and you would like to know which is which.",
        },
      ],
    },
    related: ["origin", "webmcp", "verdict"],
    spam: ["cloudflare-turnstile", "otp-verification"],
  },
];

export const GLOSSARY_BY_SLUG = new Map(GLOSSARY.map((term) => [term.slug, term]));

export function getTerm(slug: string): GlossaryTerm | undefined {
  return GLOSSARY_BY_SLUG.get(slug);
}

export const GLOSSARY_HUB_PATH = "/glossary";

export function glossaryPath(slug: string): string {
  return `${GLOSSARY_HUB_PATH}/${slug}`;
}

/** Hub ordering. Our own vocabulary goes last — it is the smallest claim on the page. */
export const GLOSSARY_GROUPS: GlossaryGroup[] = [
  "Measurement",
  "Form mechanics",
  "Lead quality",
  "Data plumbing",
  "Agents",
  "Our vocabulary",
];

export function termsInGroup(group: GlossaryGroup): GlossaryTerm[] {
  return GLOSSARY.filter((term) => term.group === group);
}
