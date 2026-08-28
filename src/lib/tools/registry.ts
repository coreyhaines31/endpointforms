/**
 * The /tools index. One entry per calculator.
 *
 * The governing rule from docs/05-site-architecture.md §Tier 0.5: a page ships
 * only if it is useful when it does not rank. Everything in this list has to
 * survive that test, which is why there are eight of them and not eighty.
 *
 * Nav and sitemaps are wired centrally elsewhere; this module is the one source
 * of truth for what exists, so importing `TOOLS` is enough to pick them all up.
 */

export type ToolEntry = {
  slug: string;
  /** Card and nav name. Short. */
  name: string;
  /** The question a person actually types. Used as the card's deck. */
  question: string;
  /** <title> and <h1> support. */
  title: string;
  description: string;
  /** Grouping on the hub. */
  group: "What it costs" | "What it's worth" | "What to believe";
  /** One line naming the thing this page has that no other page does. */
  unique: string;
};

export const TOOLS: ToolEntry[] = [
  {
    slug: "form-spam-cost-calculator",
    name: "Form spam cost calculator",
    question: "What are junk form submissions actually costing me?",
    title: "Form spam cost calculator",
    description:
      "Work out what junk form submissions cost you each month in wasted ad spend, wasted rep hours and per-response fees — and what your cost per lead really is once you take the junk out.",
    group: "What it costs",
    unique:
      "Separates your reported cost per lead from your cost per lead a rep can actually work.",
  },
  {
    slug: "cost-per-closed-deal-calculator",
    name: "Cost per closed deal calculator",
    question: "My cost per lead is lower. Is the campaign actually cheaper?",
    title: "Cost per closed deal calculator",
    description:
      "Compare two campaigns on cost per lead and on cost per closed deal at the same time, and see whether the cheaper one on the dashboard is the more expensive one in the bank.",
    group: "What it costs",
    unique: "Shows the rank flip between the two metrics explicitly, rather than one at a time.",
  },
  {
    slug: "cost-per-usable-response-calculator",
    name: "Cost per usable response",
    question: "What am I really paying per lead I can sell to?",
    title: "Cost per usable response calculator",
    description:
      "Price up to three form-builder plans on your own volume and junk rate. Shows cost per response, cost per usable response, and how much of your allowance the junk eats.",
    group: "What it costs",
    unique:
      "Prices the allowance against the junk rate, so you can see the share of the bill spent on submissions nobody can sell to.",
  },
  {
    slug: "outcome-weighted-split-test-calculator",
    name: "Outcome-weighted split test calculator",
    question: "Variant B converts better. Do I have enough closed deals to believe it?",
    title: "Outcome-weighted split test calculator",
    description:
      "Rank two form variants on completion rate and on Yield rate — closed-won per visitor — and test both for significance. It will usually tell you the outcome difference is not yet believable.",
    group: "What to believe",
    unique:
      "Runs the significance test on closed deals as well as completions, and reports when the two metrics pick different winners.",
  },
  {
    slug: "time-to-outcome-calculator",
    name: "Time-to-outcome checker",
    question: "Is my sales cycle fast enough for form-level outcome testing to work at all?",
    title: "Time-to-outcome checker",
    description:
      "Given your submission volume, close rate and how long a deal takes to resolve, work out how long an outcome-weighted split test would need to run — and whether it can conclude before it goes stale.",
    group: "What to believe",
    unique:
      "Adds the disposition lag to the accumulation time, and tells a large share of visitors that this method will not work for them.",
  },
  {
    slug: "lead-reconciliation-calculator",
    name: "Lead reconciliation",
    question: "How many of my reported conversions were real people?",
    title: "Lead reconciliation calculator",
    description:
      "Walk your leads from the number your dashboard reports down to the ones that turned out to be real prospects, find the biggest leak, and see how far the headline number runs ahead of reality.",
    group: "What it costs",
    unique:
      "Prints the overstatement ratio — reported conversions per real prospect — and refuses to compute stages that cannot reconcile.",
  },
  {
    slug: "form-field-payback-calculator",
    name: "Form field payback calculator",
    question: "What does one more field cost me, and what would it have to be worth?",
    title: "Form field payback calculator",
    description:
      "Solve for the close-rate improvement an extra form field would have to produce to pay for the completions it costs you. Your assumption about the completion cost, our arithmetic on the break-even.",
    group: "What it's worth",
    unique:
      "Solves for the required lift rather than asserting a drop, because nobody in this category has data on what a field costs.",
  },
  {
    slug: "form-drop-off-calculator",
    name: "Form drop-off calculator",
    question: "Which step of my multi-step form is losing people?",
    title: "Multi-step form drop-off calculator",
    description:
      "Enter the count at each step of a multi-step form to find where people leave, how much worse that step is than the others, and what recovering it would be worth in closed deals.",
    group: "What it's worth",
    unique:
      "Prices the worst step against the median of the others, so the fix has a number attached rather than a feeling.",
  },
];

export const TOOLS_PATH = "/tools";

export function toolPath(slug: string): string {
  return `${TOOLS_PATH}/${slug}`;
}

export function getTool(slug: string): ToolEntry {
  const tool = TOOLS.find((entry) => entry.slug === slug);
  if (!tool) throw new Error(`Unknown tool slug: ${slug}`);
  return tool;
}

/** Every indexable /tools route, hub first. For whoever owns the sitemap. */
export const TOOL_ROUTES = [TOOLS_PATH, ...TOOLS.map((tool) => toolPath(tool.slug))];

export const TOOL_GROUPS = [
  "What it costs",
  "What it's worth",
  "What to believe",
] as const;
