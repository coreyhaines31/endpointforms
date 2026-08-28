import { Formula, ToolPage } from "@/components/tools/tool-page";
import { TextLink } from "@/components/text-link";
import { ARGUMENT_PATH } from "@/lib/site";
import { toolMetadata } from "@/lib/tools/metadata";
import { getTool, toolPath } from "@/lib/tools/registry";
import { SplitTestCalculator } from "./calculator";

const slug = "outcome-weighted-split-test-calculator";
export const metadata = toolMetadata(slug);

export default function Page() {
  return (
    <ToolPage
      tool={getTool(slug)}
      lead={
        <>
          Variant B completes 40% better. Before you ship it: how many of those
          completions closed? This ranks two form variants on completion rate and
          on Yield rate — closed-won per visitor — and runs a significance test on
          both. Expect it to tell you the outcome difference is not yet
          believable. That is usually the true answer.
        </>
      }
      how={
        <>
          <Formula
            label="The two rates"
            expr={
              "completion rate = completions ÷ visitors\n" +
              "Yield rate      = closed-won  ÷ visitors\n" +
              "Yield value     = closed value ÷ visitors"
            }
            note="Same denominator, different numerator. That is the whole idea: Yield rate is a conversion rate whose numerator is money rather than a submit event, so the two are directly comparable."
          />
          <Formula
            label="Significance — two-proportion z-test, two-sided"
            expr={
              "p̄ = (xA + xB) ÷ (nA + nB)\n" +
              "SE = √( p̄ × (1 − p̄) × (1/nA + 1/nB) )\n" +
              "z  = (pB − pA) ÷ SE\n" +
              "p  = 2 × (1 − Φ(|z|))"
            }
            note="Run twice: once with x = completions, once with x = closed-won deals. Φ is the standard normal cumulative distribution, computed with the Abramowitz & Stegun 7.1.26 approximation, whose error is under 1.5 × 10⁻⁷ — far below anything we print. No continuity correction."
          />
          <Formula
            label="Sample size, per variant"
            expr={
              "n = ( z₀.₉₇₅ × √(2p̄(1−p̄)) + z₀.₈ × √(pA(1−pA) + pB(1−pB)) )² ÷ (pB − pA)²\n" +
              "with z₀.₉₇₅ = 1.959964 and z₀.₈ = 0.8416212"
            }
            note="95% confidence, 80% power, computed on the observed Yield rates. When the two rates are identical the answer is infinite, and we print an em dash rather than a number."
          />
        </>
      }
      sourcing={
        <>
          <p>
            The example is built from a case worth being able to recognise: a
            challenger that lifts completions by 40% and drops closed deals
            slightly. It is not data from anyone&rsquo;s account, ours included.
          </p>
          <p>
            The statistics are textbook and deliberately so. A two-proportion
            z-test is the same test every split-testing tool in the market
            already runs; the only thing this page does differently is point it
            at closed deals as well as at completions. There is nothing
            proprietary in the maths and there should not be.
          </p>
          <p>
            One thing we do not do is compute significance on Yield value.
            Revenue per visitor is not a proportion — it is a heavily skewed
            distribution where one large deal moves the mean — and the z-test
            above would be the wrong instrument. The column is there to be read,
            not tested.
          </p>
        </>
      }
      limits={
        <>
          <p>
            It cannot tell you the test was run properly. A significance test
            assumes visitors were randomly assigned, the variants ran over the
            same period, and you decided to stop before you looked. If you have
            been checking daily and stopped when it looked good, the p-value here
            is optimistic and so is every other tool&rsquo;s.
          </p>
          <p>
            It cannot see attribution error. If your CRM credits deals to a
            variant by last touch, some of those closed-won counts belong to the
            other arm, and no amount of arithmetic downstream fixes that.
          </p>
          <p>
            And it will not tell you a result is meaningful just because it is
            significant. With enough traffic a trivial difference clears 95%
            confidence; the size of the gap in the table matters more than the
            word next to the p-value.
          </p>
          <p>
            If the answer here is &ldquo;not enough closed deals,&rdquo; the next
            question is how long it would take to get them:{" "}
            <TextLink href={toolPath("time-to-outcome-calculator")}>
              the time-to-outcome checker
            </TextLink>{" "}
            answers that, and often answers it with a no. The reasoning behind
            ranking variants this way is in{" "}
            <TextLink href={ARGUMENT_PATH}>the dishonest dashboard</TextLink>.
          </p>
        </>
      }
    >
      <SplitTestCalculator />
    </ToolPage>
  );
}
