import { Formula, ToolPage } from "@/components/tools/tool-page";
import { TextLink } from "@/components/text-link";
import { ARGUMENT_PATH } from "@/lib/site";
import { toolMetadata } from "@/lib/tools/metadata";
import { getTool, toolPath } from "@/lib/tools/registry";
import { ReconciliationCalculator } from "./calculator";

const slug = "lead-reconciliation-calculator";
export const metadata = toolMetadata(slug);

export default function Page() {
  return (
    <ToolPage
      tool={getTool(slug)}
      lead={
        <>
          The number your form tool reports and the number your sales team
          experiences are two different numbers, and nobody owns the gap between
          them. Walk your leads down from one to the other, find where they
          disappear, and put a ratio on how far ahead the headline figure is
          running.
        </>
      }
      how={
        <>
          <Formula
            label="Per stage"
            expr={
              "kept from previous  = this stage ÷ the stage above it\n" +
              "lost at this stage  = the stage above it − this stage\n" +
              "share of reported   = this stage ÷ reported conversions"
            }
            note="Every stage is measured twice: against the one above it, which tells you where the leak is, and against the headline number, which tells you how much of it survives."
          />
          <Formula
            label="The headline"
            expr={
              "junk rate     = 1 − (real prospects ÷ reported conversions)\n" +
              "overstatement = reported conversions ÷ real prospects"
            }
            note="Overstatement is expressed as a multiple rather than a percentage because that is the shape people find it in — 3.6 reported conversions per real person is a sentence you can take to a meeting."
          />
          <Formula
            label="The check that refuses to compute"
            expr="if this stage > the stage above it → flag it, and compute nothing for that transition"
            note="A funnel cannot gain people. Rather than printing a retention above 100% and letting you draw a conclusion from it, the tool stops and says the numbers do not reconcile — which is itself a finding about your instrumentation."
          />
        </>
      }
      sourcing={
        <>
          <p>
            Everything here is your data. There are no constants, no benchmarks
            and no weightings in this tool at all — it is arithmetic on six
            numbers you supply, which is why it is the one calculator on the site
            with nothing of ours mixed into the result.
          </p>
          <p>
            The example numbers are shaped like a small paid-search funnel with a
            real junk problem. They exist so the bars have something to draw.
          </p>
          <p>
            Where to find the six: reported conversions from your ad platform or
            form tool, CRM records from your CRM, and the last four from whoever
            works the leads. The last one — how many turned out to be real
            prospects — usually is not in any system. Ask; do not estimate. The
            gap between what a rep will tell you and what the CRM says is often
            the most interesting number of the six.
          </p>
        </>
      }
      limits={
        <>
          <p>
            It cannot tell you which stage is at fault for a loss. A big drop
            between &ldquo;contact attempted&rdquo; and &ldquo;actually
            reached&rdquo; might be bad phone numbers, or it might be a team
            calling once at 4pm on a Friday. The arithmetic locates the leak; it
            does not diagnose it.
          </p>
          <p>
            It assumes all six figures cover the same period and the same
            traffic. In practice they rarely do — the ad platform counts
            conversions on the click date, the CRM counts records on the created
            date, and a lead that arrives on the 31st is counted in different
            months by different systems. Small mismatches are normal. Large ones
            usually mean you are comparing two different populations, and the
            anomaly flag will catch the worst of it.
          </p>
          <p>
            And &ldquo;real prospect&rdquo; is a judgment made by a person, not a
            measurement. Two reps will grade the same list differently. That is a
            genuine weakness of this tool and it is still a better input than
            pretending the question does not exist.
          </p>
          <p>
            For what the junk in that gap costs in money rather than in counts,
            see{" "}
            <TextLink href={toolPath("form-spam-cost-calculator")}>
              the form spam cost calculator
            </TextLink>
            . For why we think this gap is the category&rsquo;s central problem,{" "}
            <TextLink href={ARGUMENT_PATH}>the dishonest dashboard</TextLink>.
          </p>
        </>
      }
    >
      <ReconciliationCalculator />
    </ToolPage>
  );
}
