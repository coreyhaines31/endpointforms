import { MockupBand, MockupFrame } from "@/components/mockup/frame";
import { MockupMeter, MockupTable, MockupTd, MockupTh } from "@/components/mockup/parts";

/**
 * /features/form-analytics — completion rate and Yield, sliced by traffic
 * source, with the denominator printed on every row.
 *
 * Deliberately not the homepage demo: that one is two variants and a toggle
 * (src/components/sections/proof.tsx). This one is the slice, and the point it
 * makes is the one only a slice can make — the source that completes best
 * yields least, and the coverage fraction is never rounded away.
 */

type SourceRow = {
  source: string;
  submissions: number;
  completion: string;
  completionRatio: number;
  yieldRate: string;
  yieldRatio: number;
  yieldValue: string;
  coverage: string;
};

const sources: SourceRow[] = [
  {
    source: "Paid search · brand",
    submissions: 118,
    completion: "46.2%",
    completionRatio: 0.84,
    yieldRate: "11.9%",
    yieldRatio: 0.8,
    yieldValue: "$9,420",
    coverage: "71 of 118",
  },
  {
    source: "Paid search · non-brand",
    submissions: 96,
    completion: "51.8%",
    completionRatio: 0.94,
    yieldRate: "3.1%",
    yieldRatio: 0.21,
    yieldValue: "$1,180",
    coverage: "55 of 96",
  },
  {
    source: "Organic",
    submissions: 74,
    completion: "38.4%",
    completionRatio: 0.7,
    yieldRate: "14.9%",
    yieldRatio: 1,
    yieldValue: "$12,600",
    coverage: "44 of 74",
  },
  {
    source: "Review-site referral",
    submissions: 52,
    completion: "44.0%",
    completionRatio: 0.8,
    yieldRate: "9.6%",
    yieldRatio: 0.64,
    yieldValue: "$7,050",
    coverage: "31 of 52",
  },
  {
    source: "Cold outbound",
    submissions: 62,
    completion: "55.1%",
    completionRatio: 1,
    yieldRate: "1.6%",
    yieldRatio: 0.11,
    yieldValue: "$240",
    coverage: "28 of 62",
  },
];

export function YieldBreakdown() {
  return (
    <MockupFrame
      title="Yield by traffic source"
      meta="Demo request form · 402 submissions"
      caption="Illustration of the Yield report. Endpoint Forms is pre-launch — every figure here is invented to show what the two numbers look like side by side, and none of it was measured."
    >
      <MockupTable
        caption="Illustrative Yield report by traffic source, showing submissions, completion rate, Yield rate, Yield value per 100 submissions, and how many submissions in each row have a verdict. Invented data."
        scrollLabel="Yield by traffic source table"
        tableClassName="min-w-[52rem]"
      >
        <thead>
          <tr>
            <MockupTh>Source</MockupTh>
            <MockupTh numeric>Submissions</MockupTh>
            <MockupTh numeric>Completion rate</MockupTh>
            <MockupTh numeric>Yield rate</MockupTh>
            <MockupTh numeric>Yield value / 100</MockupTh>
            <MockupTh numeric>Verdicts in</MockupTh>
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {sources.map((row) => (
            <tr key={row.source}>
              <MockupTd>{row.source}</MockupTd>
              <MockupTd numeric dim>
                {row.submissions}
              </MockupTd>
              <MockupTd numeric>
                {row.completion}
                <MockupMeter ratio={row.completionRatio} tone="muted" className="mt-1.5" />
              </MockupTd>
              <MockupTd numeric>
                {row.yieldRate}
                <MockupMeter ratio={row.yieldRatio} tone="ink" className="mt-1.5" />
              </MockupTd>
              <MockupTd numeric>{row.yieldValue}</MockupTd>
              <MockupTd numeric dim>
                {row.coverage}
              </MockupTd>
            </tr>
          ))}
        </tbody>
      </MockupTable>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <p className="border-l-2 border-signal-ink pl-4 text-base">
          <span className="text-foreground">
            Cold outbound completes best and yields least.
          </span>{" "}
          <span className="text-muted-foreground">
            Both numbers are true. Only one of them is the thing you are measured on.
          </span>
        </p>
      </div>

      <MockupBand>
        Yield is computed on the 229 of 402 submissions that have a verdict, and the
        fraction is printed rather than rounded away. A percentage without its denominator
        is how a dashboard lies politely.
      </MockupBand>
    </MockupFrame>
  );
}
