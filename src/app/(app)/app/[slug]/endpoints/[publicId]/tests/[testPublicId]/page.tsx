import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/container";
import { HindsightPanel } from "@/components/app/hindsight-panel";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { readSplitTest } from "@/lib/hindsight/query";
import { getEndpointByPublicId } from "@/lib/workspaces/endpoints";
import { requireWorkspace } from "@/lib/workspaces/server";

/**
 * One Hindsight test (#45).
 *
 * The report is read here rather than in the component: `src/lib/hindsight/query.ts`
 * opens a database connection, and the rule in `eslint.config.mjs` exists to
 * keep that out of `src/components`.
 *
 * Nothing on this page promotes a variant. Stopping a test and acting on it are
 * deliberately separate gestures — a button that did both would make "the
 * p-value went green this morning" and "ship it" the same click, which is the
 * peeking problem with a UI attached.
 */
export default async function SplitTestPage({
  params,
}: {
  params: Promise<{ slug: string; publicId: string; testPublicId: string }>;
}) {
  const { slug, publicId, testPublicId } = await params;
  const { workspace } = await requireWorkspace(slug);

  const endpoint = await getEndpointByPublicId(workspace.id, publicId);
  if (!endpoint) notFound();

  const report = await readSplitTest(workspace.id, testPublicId);
  if (report === null || report.test.endpointPublicId !== endpoint.publicId) notFound();

  return (
    <Container className="max-w-[60rem] pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">
        <Link
          href={`/app/${workspace.slug}/endpoints/${endpoint.publicId}/tests`}
          className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Hindsight
        </Link>
        {" · "}
        <Link
          href={`/app/${workspace.slug}/endpoints/${endpoint.publicId}`}
          className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {endpoint.name}
        </Link>
      </p>

      <HindsightPanel className="mt-6" report={report} />

      <Panel className="mt-6">
        <PanelHeader
          title="Reading this honestly"
          description="The three things most likely to make a split test lie to you, and what this one does about each."
        />
        <PanelBody>
          <dl className="flex max-w-[68ch] flex-col gap-5 text-sm">
            <div>
              <dt className="text-foreground">A window shorter than your sales cycle</dt>
              <dd className="mt-1.5 text-muted-foreground">
                The leads that resolve first are the ones that resolve fast — the
                small deals and the quick disqualifications — so an immature test
                reports the rate of that fast tail as though it were the rate of
                the whole cohort. This test refuses to call a winner until it has
                run for at least one median time-to-verdict and every arm is at
                least half decided.
              </dd>
            </div>
            <div>
              <dt className="text-foreground">Looking until it agrees with you</dt>
              <dd className="mt-1.5 text-muted-foreground">
                Every number here recomputes when the page loads. A 95% test read
                once is wrong one time in twenty; the same test read every morning
                until it goes green is wrong far more often than that. So a
                significant difference is necessary and not sufficient — both arms
                also have to reach the sample that difference actually requires.
              </dd>
            </div>
            <div>
              <dt className="text-foreground">
                Mistaking &ldquo;we cannot tell&rdquo; for &ldquo;they are the same&rdquo;
              </dt>
              <dd className="mt-1.5 text-muted-foreground">
                Declaring two variants equivalent on a sample that could never
                have separated them is the same error as declaring a winner,
                pointed the other way. This test only says there is no difference
                once the arms are large enough that a 20% improvement would have
                been visible.
              </dd>
            </div>
          </dl>
        </PanelBody>
      </Panel>
    </Container>
  );
}
