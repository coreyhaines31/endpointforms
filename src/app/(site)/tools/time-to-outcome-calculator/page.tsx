import { Formula, ToolPage } from "@/components/tools/tool-page";
import { TextLink } from "@/components/text-link";
import { toolMetadata } from "@/lib/tools/metadata";
import { getTool, toolPath } from "@/lib/tools/registry";
import { TimeToOutcomeCalculator } from "./calculator";

const slug = "time-to-outcome-calculator";
export const metadata = toolMetadata(slug);

export default function Page() {
  return (
    <ToolPage
      tool={getTool(slug)}
      lead={
        <>
          Ranking form variants on what closed instead of what completed is a
          better idea than it is a practical one, and whether it works for you is
          an arithmetic question rather than a philosophical one. Volume, close
          rate and cycle length decide it. For a lot of funnels the honest answer
          is no, and this will say so.
        </>
      }
      how={
        <>
          <Formula
            label="How fast outcomes arrive"
            expr={
              "gradeable per month  = submissions × gradeable share\n" +
              "per variant per month = gradeable per month ÷ variants"
            }
            note="Submissions that never get a disposition cannot be part of a test, however real they were. A CRM full of leads nobody ever marked won or lost has a gradeable share near zero."
          />
          <Formula
            label="How many you need"
            expr={
              "pA = close rate\n" +
              "pB = close rate × (1 + lift)\n" +
              "n  = ( z₀.₉₇₅ × √(2p̄(1−p̄)) + z₀.₈ × √(pA(1−pA) + pB(1−pB)) )² ÷ (pB − pA)²"
            }
            note="The standard two-proportion sample size at 95% confidence and 80% power. Note how it scales: halving the lift you want to detect roughly quadruples the sample."
          />
          <Formula
            label="How long that takes"
            expr={
              "months accumulating = n ÷ per variant per month\n" +
              "months of lag       = median days to disposition ÷ 30.44\n" +
              "total               = months accumulating + months of lag"
            }
            note="The lag is added once rather than per submission. Submissions resolve while later ones are still arriving, so only the tail of the sample is still open when collection ends — adding one median cycle at the end is the reasonable approximation, and it is an approximation."
          />
        </>
      }
      sourcing={
        <>
          <p>
            The defaults describe a small B2B funnel: 600 submissions a month, a
            3% close rate, a month to disposition, and 70% of leads eventually
            getting marked one way or the other. Nothing about it is a benchmark
            — it exists so the page does something before you touch it.
          </p>
          <p>
            The 20% default lift is the smallest improvement most people would
            bother shipping a form change for. Try lowering it to 10% and watch
            what happens to the sample size; that behaviour is the most useful
            thing on this page and it is a property of the statistics, not of
            our opinion.
          </p>
          <p>
            The verdict bands — under six weeks, under four months, under a year
            — are our judgment about what a marketing team can actually wait for,
            not a finding. Someone with a different testing cadence would draw
            them elsewhere, and the number above them is the part that matters.
          </p>
        </>
      }
      limits={
        <>
          <p>
            It assumes your traffic, offer and sales team hold still for the
            duration. Over a test measured in quarters they will not, and every
            change is a confound. This is the main reason a long answer here
            should be read as &ldquo;no&rdquo; rather than as &ldquo;yes, but be
            patient.&rdquo;
          </p>
          <p>
            It also treats disposition lag as a single median. Real
            time-to-outcome distributions have long tails, and a median of 30
            days often hides deals that take six months. If your distribution is
            skewed, the answer here is optimistic.
          </p>
          <p>
            And it says nothing about whether outcome data is worth collecting —
            only whether it can adjudicate a split test. Those are different
            questions with different answers. Knowing which of your traffic
            sources produce leads that close is useful at any volume, including
            volumes far too low to test on. If the answer here is a flat no, that
            is the version to build.
          </p>
          <p>
            Once you do have two variants with outcomes attached,{" "}
            <TextLink href={toolPath("outcome-weighted-split-test-calculator")}>
              the outcome-weighted split test calculator
            </TextLink>{" "}
            is where you find out whether the difference holds up.
          </p>
        </>
      }
    >
      <TimeToOutcomeCalculator />
    </ToolPage>
  );
}
