import Link from "next/link";

import { DataTable, Td, Th } from "@/components/app/table";
import { RelativeTime } from "@/components/app/time";
import { ProvenanceChip } from "@/components/provenance-chip";
import { describeSource, summariseValues } from "@/lib/submission-values";
import type { PartialListItem } from "@/lib/workspaces/partials";

/**
 * The unfinished visits (#37).
 *
 * Shaped so that nobody can mistake a row here for a submission at a glance,
 * which is the requirement rather than a preference. Three things do that work:
 * the lane it sits behind, the **Step 2 of 4** chip in the first data column,
 * and the absence of a verdict column — a partial has no verdict, and a dash in
 * a Verdict column would have read as "awaiting" rather than "not applicable".
 *
 * Rows do not link anywhere yet. A partial detail screen is worth having and is
 * not this change; a link to a page that does not exist is worse than no link,
 * and the summary column already carries what somebody needs to decide whether
 * to chase it.
 */
export function PartialsTable({
  slug,
  rows,
}: {
  slug: string;
  rows: PartialListItem[];
}) {
  return (
    <DataTable
      caption="Unfinished visits, most recent activity first: how far each got, what they had filled in, when they went quiet, where the traffic came from, and which endpoint the form belongs to. None of these is a submission."
      scrollLabel="Unfinished visits"
      tableClassName="min-w-[68rem]"
    >
      <thead>
        <tr>
          <Th>Reached</Th>
          <Th>Filled in</Th>
          <Th>Origin</Th>
          <Th>Started</Th>
          <Th>Last seen</Th>
          <Th>Source</Th>
          <Th>Endpoint</Th>
        </tr>
      </thead>
      <tbody className="[&>tr:last-child>td]:border-b-0">
        {rows.map((row) => (
          <tr key={row.publicId} className="hover:bg-sunken">
            <Td className="whitespace-nowrap">
              <StepChip number={row.stepNumber} of={row.stepsTotal} />
            </Td>
            <Td className="max-w-[24rem]">{summariseValues(row.values)}</Td>
            <Td>
              <ProvenanceChip origin={row.origin} />
            </Td>
            <Td dim className="whitespace-nowrap">
              <RelativeTime value={row.startedAt} />
            </Td>
            <Td dim className="whitespace-nowrap">
              <RelativeTime value={row.updatedAt} />
            </Td>
            <Td dim className="whitespace-nowrap">
              {describeSource(row)}
            </Td>
            <Td dim className="whitespace-nowrap">
              <Link
                href={`/app/${slug}/endpoints/${row.endpointPublicId}`}
                className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {row.endpointName}
              </Link>
            </Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/**
 * How far they got.
 *
 * A fraction rather than a bar: at a glance in a table, "3 of 5" is read
 * faster and more precisely than a partly filled rectangle, and it is the only
 * version a screen reader can say. A row whose step we never recorded — a
 * partial written by an older build, or one whose form has since lost its steps
 * — says so rather than inventing a number.
 */
function StepChip({ number, of }: { number: number | null; of: number | null }) {
  if (number === null || of === null) {
    return <span className="text-sm text-muted-foreground">Step not recorded</span>;
  }

  return (
    <span className="inline-flex items-center rounded-full border border-border-control px-2.5 py-0.5 font-mono text-sm tabular-nums text-foreground">
      Step {number} of {of}
    </span>
  );
}
