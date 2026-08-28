import { Formula, ToolPage } from "@/components/tools/tool-page";
import { TextLink } from "@/components/text-link";
import { toolMetadata } from "@/lib/tools/metadata";
import { getTool, toolPath } from "@/lib/tools/registry";
import { FieldPaybackCalculator } from "./calculator";

const slug = "form-field-payback-calculator";
export const metadata = toolMetadata(slug);

export default function Page() {
  return (
    <ToolPage
      tool={getTool(slug)}
      lead={
        <>
          &ldquo;Every field you add costs you conversions&rdquo; is the oldest
          rule in form design and one of the least evidenced. This tool does not
          assume a number for you. You supply what you think the field will cost
          in completions, and it solves for the improvement in close rate the
          field would have to produce to be worth asking.
        </>
      }
      how={
        <>
          <Formula
            label="Completions, before and after"
            expr={
              "completions now   = visitors × completion rate\n" +
              "completions after = completions now × (1 − expected drop)\n" +
              "lost              = completions now − completions after"
            }
            note="The drop is relative, not in percentage points. An 8% drop on a 12% completion rate gives 11.04%, not 4%."
          />
          <Formula
            label="The break-even, solved rather than assumed"
            expr={
              "revenue is unchanged when\n" +
              "  completions after × new close rate = completions now × close rate\n" +
              "so\n" +
              "  new close rate = close rate × (completions now ÷ completions after)\n" +
              "  required lift  = (completions now ÷ completions after) − 1"
            }
            note="Average deal value cancels out of both sides, which is why the break-even lift does not depend on it. It only matters once you put a number on the improvement you expect."
          />
          <Formula
            label="Only if you enter a forecast lift"
            expr={
              "revenue now   = completions now   × close rate × average deal\n" +
              "revenue after = completions after × close rate × (1 + forecast lift) × average deal"
            }
            note="Left at zero by default, on purpose. The break-even is arithmetic. The forecast is a claim about the future, and it is yours rather than ours."
          />
        </>
      }
      sourcing={
        <>
          <p>
            <strong className="font-medium text-foreground">
              We do not know what a form field costs in completion, and we are not
              going to pretend otherwise.
            </strong>{" "}
            This is the argument the category has been having since roughly 2015
            with no published data on either side. Every &ldquo;each extra field
            costs you N%&rdquo; figure in circulation traces back to a small
            number of vendor studies on forms and audiences that are probably not
            yours. So the completion cost is an input here, not a constant, and
            the default of 8% is a placeholder we chose to be plausible rather
            than to be right.
          </p>
          <p>
            The direction is not even settled. A qualifying field that loses you
            people who were never going to buy improves the leads you keep and
            looks like a failure on a completion-rate dashboard. That is the
            whole reason this page solves for the required lift instead of
            forecasting a loss.
          </p>
          <p>
            The rest of the inputs — traffic, completion rate, close rate,
            average deal — are yours and are all knowable. Nothing of ours is
            mixed into them.
          </p>
        </>
      }
      limits={
        <>
          <p>
            It cannot tell you whether the field will actually improve lead
            quality. That is the number the whole decision turns on and the one
            nobody has. What it can do is tell you how big the improvement would
            have to be, which turns an argument into a testable claim.
          </p>
          <p>
            It treats the lost submissions as average. They are probably not: if
            the field puts off people who were never going to buy, the ones you
            lose close worse than your baseline and the real break-even is easier
            than this shows. If it puts off busy senior buyers, they close better
            and it is harder. The direction of that error depends entirely on
            which field you are adding.
          </p>
          <p>
            It also ignores where in the form the field goes, whether it is
            required, and whether asking it later would get you the same answer
            with none of the cost. Often it would.
          </p>
          <p>
            If you want to find out which step of the form is actually losing
            people before adding anything to it, use{" "}
            <TextLink href={toolPath("form-drop-off-calculator")}>
              the drop-off calculator
            </TextLink>
            .
          </p>
        </>
      }
    >
      <FieldPaybackCalculator />
    </ToolPage>
  );
}
