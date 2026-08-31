import { Formula, ToolPage } from "@/components/tools/tool-page";
import { TextLink } from "@/components/text-link";
import { toolMetadata } from "@/lib/tools/metadata";
import { getTool, toolPath } from "@/lib/tools/registry";
import { DropOffCalculator } from "./calculator";

const slug = "form-drop-off-calculator";
export const metadata = toolMetadata(slug);

export default function Page() {
  return (
    <ToolPage
      tool={getTool(slug)}
      lead={
        <>
          A completion rate tells you people left. It does not tell you where. Put
          the count at each step of a multi-step form in and this finds the
          steepest loss, compares it against a typical step on your own form
          rather than against someone else&rsquo;s benchmark, and prices what
          fixing it would be worth.
        </>
      }
      how={
        <>
          <Formula
            label="Per transition"
            expr={
              "kept    = people who reached this step ÷ people who reached the one before\n" +
              "dropped = the one before − this step\n" +
              "completion rate = submissions ÷ people who saw step 1"
            }
            note="The form is read left to right and ends at the first step you set to zero, so a three-step form and a five-step form use the same inputs."
          />
          <Formula
            label="The benchmark is your own form"
            expr={
              "worst  = the transition with the lowest kept\n" +
              "median = the median kept across every other transition"
            }
            note="Comparing a step against an industry benchmark tells you nothing you can act on, because the benchmark was measured on somebody else's traffic and offer. Comparing it against the other steps of the same form, seen by the same people, is a comparison that holds something constant."
          />
          <Formula
            label="Pricing the fix"
            expr={
              "recovered  = submissions × (median ÷ worst) − submissions\n" +
              "deals      = recovered × close rate\n" +
              "value      = deals × average deal"
            }
            note="This assumes every step after the fixed one keeps behaving as it does today, which is why it is a ceiling rather than a forecast. It also assumes the recovered submissions close at your current rate — see the limits below, because that is the assumption most likely to be wrong."
          />
        </>
      }
      sourcing={
        <>
          <p>
            All eight inputs are yours. There are no benchmark constants in this
            tool — the comparison is between your own steps, which is the only
            comparison available that holds traffic, offer and audience constant.
          </p>
          <p>
            The example is a four-step form with a bad third step, which is the
            most common shape we saw described in the research corpus: the step
            where the phone number or the budget question lives.
          </p>
          <p>
            The step counts come from whatever renders your form — most
            multi-step builders report per-step views, and if yours does not,
            page-view events on each step in your analytics tool will do. Close
            rate has to come from your CRM.
          </p>
        </>
      }
      limits={
        <>
          <p>
            <strong className="font-medium text-foreground">
              A steep step is not automatically a broken step.
            </strong>{" "}
            If step 3 asks for budget and loses half the people who reach it, some
            of those people were never going to buy, and removing the question
            would recover submissions that a rep then throws away. This tool
            measures completion, so it will always call that step a problem. It
            cannot see the qualifying work the step is doing, and the whole
            reason we are building a form product is that nothing else can see it
            either.
          </p>
          <p>
            The recovered-value figure inherits that error directly: it assumes
            the people you win back close at your current rate. They almost
            certainly close worse. Read it as an upper bound.
          </p>
          <p>
            It also cannot distinguish abandonment from interruption. Someone who
            leaves step 2 and comes back tomorrow on a different device is two
            visitors here and one person in reality.
          </p>
          <p>
            If you are weighing whether to remove the field that is causing the
            drop, the arithmetic for that trade is at{" "}
            <TextLink href={toolPath("form-field-payback-calculator")}>
              the form field payback calculator
            </TextLink>
            .
          </p>
        </>
      }
    >
      <DropOffCalculator />
    </ToolPage>
  );
}
