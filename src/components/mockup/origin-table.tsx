import { MockupBand, MockupFrame } from "@/components/mockup/frame";
import { MockupTable, MockupTd, MockupTh } from "@/components/mockup/parts";
import { ProvenanceChip, type Origin } from "@/components/provenance-chip";

/**
 * /features/submission-provenance — the submissions table, with the stamp on
 * every row and the surface that produced it in the column beside it.
 */

type Row = {
  time: string;
  identity: string;
  surface: string;
  origin: Origin;
  routed: string;
};

const rows: Row[] = [
  {
    time: "14:22",
    identity: "dana@northgate.io",
    surface: "Human page",
    origin: "human",
    routed: "CRM · new lead",
  },
  {
    time: "14:19",
    identity: "procurement agent · Acme Foods",
    surface: "Manifest",
    origin: "agent",
    routed: "CRM · tagged Agent",
  },
  {
    time: "14:11",
    identity: "no email captured",
    surface: "Human page",
    origin: "unverified",
    routed: "Quarantine",
  },
  {
    time: "13:58",
    identity: "m.okonjo@setterfield.co",
    surface: "Human page",
    origin: "human",
    routed: "CRM · new lead",
  },
  {
    time: "13:51",
    identity: "buying assistant · unnamed",
    surface: "Manifest",
    origin: "agent",
    routed: "CRM · tagged Agent",
  },
  {
    time: "13:44",
    identity: "qwtn@mailinator.com",
    surface: "Human page",
    origin: "unverified",
    routed: "Quarantine",
  },
];

export function OriginTable() {
  return (
    <MockupFrame
      title="Submissions"
      meta="Demo request form"
      caption="Illustration of the submissions table. Endpoint Forms is pre-launch — these rows are invented to show where the stamp sits and what it decides, not a record of anyone's traffic."
    >
      <MockupTable
        caption="Illustrative submissions, showing the time received, who or what submitted, which surface it came through, its Origin stamp, and where it was routed. Invented data."
        scrollLabel="Submissions table"
        tableClassName="min-w-[44rem]"
      >
        <thead>
          <tr>
            <MockupTh>Received</MockupTh>
            <MockupTh>Submitted by</MockupTh>
            <MockupTh>Surface used</MockupTh>
            <MockupTh>Origin</MockupTh>
            <MockupTh>Routed to</MockupTh>
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {rows.map((row) => (
            <tr key={row.time}>
              <MockupTd numeric className="text-left">
                {row.time}
              </MockupTd>
              <MockupTd>{row.identity}</MockupTd>
              <MockupTd dim>{row.surface}</MockupTd>
              <MockupTd>
                <ProvenanceChip origin={row.origin} />
              </MockupTd>
              <MockupTd dim>{row.routed}</MockupTd>
            </tr>
          ))}
        </tbody>
      </MockupTable>
      <MockupBand>
        The stamp is not inferred from behaviour. It is the answer to which door was used
        &mdash; which is why Unverified means &ldquo;submitted the human page while acting
        like software&rdquo; and not &ldquo;scored 82 on a risk model&rdquo;.
      </MockupBand>
    </MockupFrame>
  );
}
