import { MockupBand, MockupFrame } from "@/components/mockup/frame";

/**
 * /features/lead-outcomes — where 90 submissions ended up.
 *
 * Awaiting verdict is deliberately the fullest lane and the first one, because
 * it is the honest majority state and the thing every other dashboard hides.
 */

type Lane = {
  name: string;
  count: number;
  total: string;
  note: string;
  records: { id: string; detail: string }[];
};

const lanes: Lane[] = [
  {
    name: "Awaiting verdict",
    count: 61,
    total: "—",
    note: "No outcome yet. Not a no.",
    records: [
      { id: "sub_8f21", detail: "day 34 · in pipeline" },
      { id: "sub_8e07", detail: "day 21 · in pipeline" },
      { id: "sub_8d55", detail: "day 12 · call booked" },
      { id: "+ 58 more", detail: "" },
    ],
  },
  {
    name: "Won",
    count: 9,
    total: "$128,400",
    note: "Closed. Value written back.",
    records: [
      { id: "sub_7c14", detail: "$42,000" },
      { id: "sub_7a90", detail: "$18,400" },
      { id: "+ 7 more", detail: "" },
    ],
  },
  {
    name: "Lost",
    count: 14,
    total: "$0",
    note: "Real lead, no deal.",
    records: [
      { id: "sub_7b33", detail: "chose incumbent" },
      { id: "sub_79f2", detail: "no decision" },
      { id: "+ 12 more", detail: "" },
    ],
  },
  {
    name: "Disqualified",
    count: 6,
    total: "$0",
    note: "Never should have counted.",
    records: [
      { id: "sub_7ae1", detail: "student research" },
      { id: "sub_78c4", detail: "out of region" },
      { id: "+ 4 more", detail: "" },
    ],
  },
];

export function VerdictLanes() {
  return (
    <MockupFrame
      title="Verdicts"
      meta="Demo request form · 90 submissions"
      caption="Illustration of the four verdict states and how submissions distribute across them. Endpoint Forms is pre-launch — the counts and amounts are invented to show the shape of a real month, not measured from one."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {lanes.map((lane) => (
          <section
            key={lane.name}
            className="border-b border-border p-4 last:border-b-0 sm:[&:nth-child(2n)]:border-l sm:[&:nth-child(n+3)]:border-b-0 lg:border-b-0 lg:border-l lg:first:border-l-0 sm:p-5"
          >
            <h3 className="font-mono text-label uppercase text-foreground">{lane.name}</h3>
            <p className="mt-3 font-mono tabular text-h3">
              <span className="text-foreground">{lane.count}</span>
            </p>
            <p className="mt-1 font-mono text-sm tabular text-muted-foreground">
              {lane.total}
            </p>
            <ul className="mt-4 border-t border-border">
              {lane.records.map((record) => (
                <li
                  key={record.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border py-2 last:border-b-0"
                >
                  <span className="font-mono text-sm text-foreground">{record.id}</span>
                  {record.detail ? (
                    <span className="font-mono text-xs tabular text-muted-foreground">
                      {record.detail}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">{lane.note}</p>
          </section>
        ))}
      </div>
      <MockupBand>
        61 of these 90 submissions have no verdict yet, and the report says so rather than
        counting them as zero. A four-month sales cycle takes four months to produce an
        answer &mdash; the number that hides that is the dishonest one.
      </MockupBand>
    </MockupFrame>
  );
}
