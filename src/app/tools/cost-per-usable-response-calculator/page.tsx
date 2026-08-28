import { Formula, ToolPage } from "@/components/tools/tool-page";
import { TextLink } from "@/components/text-link";
import { toolMetadata } from "@/lib/tools/metadata";
import { getTool, toolPath } from "@/lib/tools/registry";
import { ResponseCostCalculator } from "./calculator";

const slug = "cost-per-usable-response-calculator";
export const metadata = toolMetadata(slug);

export default function Page() {
  return (
    <ToolPage
      tool={getTool(slug)}
      lead={
        <>
          Form builders bill per response. Bots do not know that, and they arrive
          first. Price up to three plans on your own volume and your own junk
          rate, and see the number the pricing page does not show you: what you
          pay per response you can actually sell to.
        </>
      }
      how={
        <>
          <Formula
            label="Per plan"
            expr={
              "overage responses = max(0, submissions − included)\n" +
              "monthly bill      = plan price + overage responses × overage rate\n" +
              "per response      = monthly bill ÷ submissions\n" +
              "usable            = submissions × (1 − junk share)\n" +
              "per usable        = monthly bill ÷ usable"
            }
            note="The two cost figures share a numerator and differ only in the denominator. The gap between them is the junk rate, expressed in dollars."
          />
          <Formula
            label="What the junk costs you"
            expr={
              "spent on junk          = monthly bill × (junk ÷ submissions)\n" +
              "allowance eaten by junk = min(included, junk)"
            }
            note="The second line is the one that stings on a capped plan. An allowance is consumed in arrival order, and a bot filling a form at 3am consumes it exactly as a buyer would."
          />
          <Formula
            label="The comparison"
            expr={
              "cheapest bill       = the lowest monthly bill\n" +
              "cheapest per usable = the lowest cost per usable response\n" +
              "flip = those are different plans"
            }
          />
        </>
      }
      sourcing={
        <>
          <p>
            <strong className="font-medium text-foreground">
              There are no vendor prices in this tool, deliberately.
            </strong>{" "}
            Third-party claims about pricing in this category are frequently
            wrong. We found two widely circulated figures about a major
            form builder&rsquo;s free tier and its spam protection that are
            contradicted by that company&rsquo;s own live pricing page, and both
            are still being repeated. Rather than join in, we ask you to type in
            the numbers from the page you are looking at. Note the date you did
            it; these change.
          </p>
          <p>
            The example plans — $29 for 1,000 responses, $99 for 10,000 — are
            shaped like plans that exist, and are not any particular
            vendor&rsquo;s. The 30% junk default is a placeholder, not a
            benchmark; see the note on{" "}
            <TextLink href={toolPath("form-spam-cost-calculator")}>
              the spam cost calculator
            </TextLink>{" "}
            for why we do not publish a number there.
          </p>
          <p>
            Verified context for why the junk share is not zero: bad bots were
            40% of internet traffic in 2025, up from 37%, and automated requests
            are around 57.5% of HTML traffic. That is the web your form sits on,
            not a measurement of your form.
          </p>
        </>
      }
      limits={
        <>
          <p>
            It prices one month at one volume. Allowances create step changes
            rather than a smooth curve, so the ranking can flip on a single busy
            month and flip back. If your traffic is seasonal, run it at your peak
            as well as at your average.
          </p>
          <p>
            It does not model what happens when you hit a hard cap. Some plans
            bill overage; others simply stop accepting submissions, which does
            not cost you money — it costs you the leads, which is worse and is
            not a number this tool can produce.
          </p>
          <p>
            And it deliberately ignores everything else about the plans. Seats,
            logic limits, whether exports are paywalled, and whether the sync to
            your CRM fails loudly or silently all matter more than a few dollars
            a month. This page prices one axis; it is not a buying decision.
          </p>
          <p>
            For what the junk costs you outside the software bill — the media
            spend and the rep hours — see{" "}
            <TextLink href={toolPath("form-spam-cost-calculator")}>
              the form spam cost calculator
            </TextLink>
            .
          </p>
        </>
      }
    >
      <ResponseCostCalculator />
    </ToolPage>
  );
}
