import { Formula, ToolPage } from "@/components/tools/tool-page";
import { TextLink } from "@/components/text-link";
import { ARGUMENT_PATH } from "@/lib/site";
import { toolMetadata } from "@/lib/tools/metadata";
import { getTool, toolPath } from "@/lib/tools/registry";
import { SpamCostCalculator } from "./calculator";

const slug = "form-spam-cost-calculator";
export const metadata = toolMetadata(slug);

export default function Page() {
  return (
    <ToolPage
      tool={getTool(slug)}
      lead={
        <>
          Junk submissions cost you three times over: the click you paid for, the
          rep hour spent finding out, and the response fee your form tool charged
          to receive it. This adds up all three, and works out what your cost per
          lead looks like once the junk is out of the denominator.
        </>
      }
      how={
        <>
          <Formula
            label="Submissions"
            expr="submissions = monthly spend ÷ reported cost per lead"
            note="The ad platform's cost per lead already implies a submission count. We use that rather than asking you for it twice."
          />
          <Formula
            label="Junk and real"
            expr={
              "junk = submissions × junk share\n" +
              "real = submissions − junk"
            }
          />
          <Formula
            label="The three costs"
            expr={
              "wasted ad spend  = junk × reported cost per lead\n" +
              "wasted rep hours = junk × minutes per lead ÷ 60\n" +
              "wasted payroll   = wasted rep hours × hourly cost\n" +
              "per-response tax = junk × fee per response"
            }
            note="The three are additive because they are three different budgets: media, payroll, and software."
          />
          <Formula
            label="The headline"
            expr={
              "real cost per usable lead = monthly spend ÷ real\n" +
              "multiple = real cost per usable lead ÷ reported cost per lead"
            }
            note="Note what this does and does not claim. It does not say your ads got worse. It says the same spend bought fewer leads a person can sell to than the dashboard implies, and the gap is the junk rate."
          />
        </>
      }
      sourcing={
        <>
          <p>
            The example numbers are a plausible small paid-search account, not a
            benchmark. Replace all six.
          </p>
          <p>
            <strong className="font-medium text-foreground">
              The junk-rate default is a guess and we want to be clear about that.
            </strong>{" "}
            Nobody publishes reliable junk-rate data by industry, ourselves
            included — we have no customers yet, so we have no aggregate to draw
            on. 28% is a placeholder chosen to be uncomfortable rather than
            measured. Ask the person who calls your leads; they will know within
            about five percentage points, and their number is worth more than any
            benchmark.
          </p>
          <p>
            What we can source is the surrounding weather. Bad bots were 40% of
            internet traffic in 2025, up from 37%, and automated requests are
            roughly 57.5% of HTML traffic against 42.5% human. About 30% of leads
            bought from third-party vendors are outright fake. Those are
            internet-wide figures, not measurements of your form — they explain
            why the junk rate is not zero, not what yours is.
          </p>
        </>
      }
      limits={
        <>
          <p>
            It cannot tell you your junk rate. That is the input the whole result
            swings on and the one number here that has to come from a human who
            called the leads. If you have never checked, the honest use of this
            tool is to run it at 10%, 30% and 50% and notice how much the answer
            moves.
          </p>
          <p>
            It also does not model the second-order cost, which is often the
            larger one: a rep who has worked forty junk leads this month treats
            the forty-first differently, and a lead scoring model trained on
            polluted data stays polluted. Neither has a defensible number
            attached, so neither is in the arithmetic.
          </p>
          <p>
            And it assumes junk costs the same as good traffic on a per-click
            basis, which is roughly true for search and less true for display and
            social. If your junk is concentrated in one placement, the wasted
            spend figure is conservative.
          </p>
          <p>
            The argument this tool comes from, including the strongest
            counter-arguments to it, is at{" "}
            <TextLink href={ARGUMENT_PATH}>the dishonest dashboard</TextLink>. If
            you want the version of this question aimed at your billing rather
            than your media, that is{" "}
            <TextLink href={toolPath("cost-per-usable-response-calculator")}>
              cost per usable response
            </TextLink>
            .
          </p>
        </>
      }
    >
      <SpamCostCalculator />
    </ToolPage>
  );
}
