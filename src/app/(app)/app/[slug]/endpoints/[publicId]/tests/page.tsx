import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/container";
import { HindsightList } from "@/components/app/hindsight-panel";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { listSplitTests } from "@/lib/hindsight/query";
import { getEndpointByPublicId } from "@/lib/workspaces/endpoints";
import { requireWorkspace } from "@/lib/workspaces/server";

/**
 * Hindsight tests on one endpoint (#45).
 *
 * A list, and nothing else. Deliberately no "winning" column: which arm is
 * ahead is a claim that needs a maturity gate, a corrected threshold and a
 * power check behind it, and a table cell has room for none of them. Putting a
 * leader here would be the one-glance answer the whole feature exists to refuse.
 */
export default async function SplitTestsPage({
  params,
}: {
  params: Promise<{ slug: string; publicId: string }>;
}) {
  const { slug, publicId } = await params;
  const { workspace } = await requireWorkspace(slug);

  const endpoint = await getEndpointByPublicId(workspace.id, publicId);
  if (!endpoint) notFound();

  const tests = await listSplitTests(workspace.id, endpoint.publicId);

  return (
    <Container className="max-w-[60rem] pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">
        <Link
          href={`/app/${workspace.slug}/endpoints/${endpoint.publicId}`}
          className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {endpoint.name}
        </Link>
      </p>
      <h1 className="mt-4 text-h2">Hindsight</h1>
      <p className="mt-3 max-w-[62ch] text-base text-muted-foreground">
        Split tests ranked on Yield — what the submissions turned out to be worth
        — rather than on how many of them arrived. The result is not available at
        the submit button, so a test here says what it can at every stage and
        says plainly when it cannot call one.
      </p>

      <HindsightList
        className="mt-8"
        tests={tests.map((test) => ({
          publicId: test.publicId,
          name: test.name,
          status: test.status,
          variants: test.variants.length,
          startedAt: test.startedAt,
        }))}
        href={(testPublicId) =>
          `/app/${workspace.slug}/endpoints/${endpoint.publicId}/tests/${testPublicId}`
        }
      />

      <Panel className="mt-6">
        <PanelHeader
          title="What a test costs you"
          description="Worth reading before starting one, because the answer for a lot of forms is that the report is more useful than the test."
        />
        <PanelBody>
          <ul className="flex max-w-[68ch] flex-col gap-3 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">Time, not traffic.</span> A test
              cannot conclude before your leads have had time to become outcomes.
              If a deal here takes six weeks to close, six weeks is the floor
              however much traffic the form gets.
            </li>
            <li>
              <span className="text-foreground">
                Outcome volume, which is much smaller than submission volume.
              </span>{" "}
              Closed deals are a far rarer event than fills, so the same traffic
              buys much less certainty about them. On a form producing forty
              leads a month this is a directional read, not statistics, and the
              panel will keep saying so.
            </li>
            <li>
              <span className="text-foreground">Frozen arms.</span> Changing a
              variant or its weight mid-run reassigns visitors who have already
              been counted, so a running test&rsquo;s arms cannot be edited.
              Changing them means starting again.
            </li>
          </ul>
        </PanelBody>
      </Panel>
    </Container>
  );
}
