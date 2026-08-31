import { Formula, ToolPage } from "@/components/tools/tool-page";
import { TextLink } from "@/components/text-link";
import { toolMetadata } from "@/lib/tools/metadata";
import { getTool, toolPath } from "@/lib/tools/registry";
import { ClosedDealCalculator } from "./calculator";

const slug = "cost-per-closed-deal-calculator";
export const metadata = toolMetadata(slug);

export default function Page() {
  return (
    <ToolPage
      tool={getTool(slug)}
      lead={
        <>
          A cost per lead of $15 against a cost per lead of $50 looks like an easy
          call. It stops being one the moment you divide by the deals that
          actually closed. Put two campaigns in and see whether the metric on your
          dashboard ranks them the same way the bank does.
        </>
      }
      how={
        <>
          <Formula
            label="Per campaign"
            expr={
              "cost per lead        = spend ÷ submissions\n" +
              "closed deals         = submissions × close rate\n" +
              "cost per closed deal = spend ÷ closed deals\n" +
              "revenue              = closed deals × average deal\n" +
              "return on ad spend   = revenue ÷ spend"
            }
            note="Closed deals is left as a decimal rather than rounded. Rounding 0.4 deals up to 1 would flatter a low-volume campaign, and rounding it down to 0 would make its cost per deal undefined."
          />
          <Formula
            label="The comparison"
            expr={
              "cost-per-lead winner        = the lower cost per lead\n" +
              "cost-per-closed-deal winner = the lower cost per closed deal\n" +
              "flip = the two winners are different campaigns"
            }
            note="The flip is the entire point of the page. When it happens, every decision made on cost per lead — bids, budgets, which campaign to pause — is being made on the metric that ranks them backwards."
          />
          <Formula
            label="The gaps"
            expr="gap = the larger figure ÷ the smaller figure"
            note="Reported as a multiple rather than a percentage, because a 3× difference in cost per deal and a 3% difference in cost per lead are the shape of the finding."
          />
        </>
      }
      sourcing={
        <>
          <p>
            The two example campaigns are constructed to show the flip, and you
            should treat them as an illustration rather than as typical. Campaign
            A buys submissions at a quarter of the price and closes them at an
            eighth of the rate.
          </p>
          <p>
            Close rate has to come from your CRM. Your form builder cannot supply
            it — it has no idea what happened after the submit event, which is
            the gap this whole site is about. If your CRM cannot attribute closed
            deals back to the campaign, that is the thing to fix before you tune
            anything else, and it is fixable with an offline conversion import
            that most PPC teams already run.
          </p>
          <p>
            Verified context, for scale: roughly 13% of marketing-qualified leads
            ever become a real opportunity. A campaign whose leads are worse than
            average is not a rounding error against that base rate.
          </p>
        </>
      }
      limits={
        <>
          <p>
            It compares two campaigns at a single moment and cannot see the time
            axis. If Campaign B closes in 14 days and Campaign A closes in 9
            months, the cash-flow difference is real, large, and completely
            absent from this arithmetic.
          </p>
          <p>
            It also treats the average deal as a fixed number. Deal sizes are
            usually skewed rather than normal — one large win can carry a
            campaign, and an average that includes it will overstate every
            future month. If you have the data, run this twice, once on the mean
            and once on the median, and take the pessimistic one seriously.
          </p>
          <p>
            Finally, it will happily compare two campaigns with too few deals to
            be meaningful. Four closed deals against three is not a finding. If
            you want to know whether a difference is big enough to believe, use{" "}
            <TextLink href={toolPath("outcome-weighted-split-test-calculator")}>
              the outcome-weighted split test calculator
            </TextLink>{" "}
            instead — it does the significance test this page deliberately does
            not.
          </p>
        </>
      }
    >
      <ClosedDealCalculator />
    </ToolPage>
  );
}
