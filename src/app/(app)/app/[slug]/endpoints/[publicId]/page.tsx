import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/container";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { ArchiveEndpointForm, RenameEndpointForm } from "@/components/app/endpoint-forms";
import { EndpointSnippet } from "@/components/app/endpoint-snippet";
import { ProvenanceChip } from "@/components/provenance-chip";
import { DataTable, Td, Th } from "@/components/app/table";
import { RelativeTime } from "@/components/app/time";
import { VerdictChip } from "@/components/app/verdict-chip";
import { YieldPanel } from "@/components/app/yield-panel";
import { DeliveryAlert, HealthChip } from "@/components/app/destinations-health";
import { NowhereChip, ReachAlert } from "@/components/app/reach-alert";
import { isMailConfigured } from "@/lib/destinations/mail";
import { DEFAULT_NOTIFICATION_BLURB } from "@/lib/destinations/notify";
import { endpointReach } from "@/lib/destinations/reach";
import { listDestinations } from "@/lib/destinations/store";
import { getEndpointByPublicId } from "@/lib/workspaces/endpoints";
import { requireWorkspace } from "@/lib/workspaces/server";
import { RENDER_DOMAIN } from "@/lib/workspaces/slug";
import { listSubmissions, parseSubmissionFilters } from "@/lib/workspaces/submissions";
import { summariseValues } from "@/lib/submission-values";
import { listSplitTests } from "@/lib/hindsight/query";
import { readYield } from "@/lib/yield/query";

/**
 * One endpoint.
 *
 * The snippet is the first thing on the page and stays the first thing on the
 * page, whether this endpoint has taken one submission or ten thousand. Setup
 * instructions that disappear once you have succeeded are the ones you cannot
 * find when you are setting up the second site.
 */
export default async function EndpointDetailPage({
  params,
}: {
  params: Promise<{ slug: string; publicId: string }>;
}) {
  const { slug, publicId } = await params;
  const { workspace } = await requireWorkspace(slug);

  const endpoint = await getEndpointByPublicId(workspace.id, publicId);
  if (!endpoint) notFound();

  const recent = await listSubmissions(
    workspace.id,
    parseSubmissionFilters({ endpoint: endpoint.publicId }),
  );
  const rows = recent.rows.slice(0, 8);
  const destinationRows = await listDestinations(workspace.id, endpoint.publicId);

  // Is anybody being told? (#65) Read here rather than in the component: the
  // second half of the answer is a deployment fact — whether this build has a
  // mail transport at all — and `process.env` belongs on the server.
  const reach = endpointReach(destinationRows, { mailConfigured: isMailConfigured() });
  const defaultNotification = destinationRows.find((row) => row.defaultNotification) ?? null;

  // Yield for this endpoint (#44). Read here rather than in the component:
  // `src/lib/yield/query.ts` opens a database connection, and the eslint rule
  // in `eslint.config.mjs` exists to keep that out of `src/components`.
  const yieldReport = await readYield(workspace.id, { endpointPublicId: endpoint.publicId });

  // Definitions only — no tallies. Reading a full Hindsight report per test
  // here would put a handful of aggregate queries on a page that is already
  // showing three other panels, for a summary line that names the tests and
  // deliberately does not say which is winning.
  const splitTests = await listSplitTests(workspace.id, endpoint.publicId);

  return (
    <Container className="max-w-[60rem] pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">
        <Link
          href={`/app/${workspace.slug}/endpoints`}
          className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Endpoints
        </Link>
      </p>
      <h1 className="mt-4 text-h2">{endpoint.name}</h1>
      <p className="mt-3 font-mono text-sm text-muted-foreground">
        {endpoint.publicId}
        {endpoint.archivedAt ? " · archived" : null}
      </p>

      {/* First on the page when it applies, above even the snippet (#65). An
          endpoint that tells nobody is the one fact that changes what every
          other panel here means, and a customer who reads no further than the
          heading still has to see it. */}
      <ReachAlert
        className="mt-6"
        reach={reach}
        href={`/app/${workspace.slug}/endpoints/${endpoint.publicId}/destinations`}
      />

      <Panel className="mt-8">
        <PanelHeader
          title="Point a form at it"
          description="One attribute on a form you already have. Nothing else changes, and nothing has to be declared in advance."
        />
        <PanelBody>
          <EndpointSnippet
            slug={workspace.slug}
            renderDomain={RENDER_DOMAIN}
            publicId={endpoint.publicId}
            archived={endpoint.archivedAt !== null}
          />
        </PanelBody>
      </Panel>

      {/* The schema, and the way in to the builder (#35). Second on the page and
          not first: the snippet above is what makes the endpoint work, and this
          is the optional upgrade on top of it. The description says so in both
          states rather than implying a missing schema is a missing step. */}
      <Panel className="mt-6">
        <PanelHeader
          title="Form"
          description={
            endpoint.hasSchema
              ? "A schema is declared, so this endpoint renders its own form, publishes an agent-callable tool, and checks what arrives against a definition."
              : "No schema declared. The endpoint works exactly as it is — declaring one is what adds a form we host, an agent-callable tool and server-side validation."
          }
          action={
            <Link
              href={`/app/${workspace.slug}/endpoints/${endpoint.publicId}/builder`}
              className="shrink-0 rounded-md border border-border-control px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {endpoint.hasSchema ? "Edit the form" : "Build a form"}
            </Link>
          }
        />
      </Panel>

      <YieldPanel className="mt-6" report={yieldReport} />

      {/* Hindsight (#45). Under Yield and not beside it: a split test compares
          Yield rates, so the number above has to make sense before the
          comparison does. The description says what the tests are for without
          claiming any of them has an answer — which most of the time none of
          them does, and that is the feature rather than an omission. */}
      <Panel className="mt-6">
        <PanelHeader
          title="Hindsight"
          description={
            splitTests.length > 0
              ? `${splitTests.length} split ${splitTests.length === 1 ? "test" : "tests"} on this endpoint, ranked on Yield rather than on completion rate. A test here will not name a winner until the outcomes have landed.`
              : "Split tests that rank variants on what their submissions turned out to be worth, instead of on how many of them arrived. No tests on this endpoint yet."
          }
          action={
            <Link
              href={`/app/${workspace.slug}/endpoints/${endpoint.publicId}/tests`}
              className="shrink-0 rounded-md border border-border-control px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {splitTests.length > 0 ? "Open Hindsight" : "About Hindsight"}
            </Link>
          }
        />
        {splitTests.length > 0 ? (
          <PanelBody className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {splitTests.map((test) => (
              <Link
                key={test.publicId}
                href={`/app/${workspace.slug}/endpoints/${endpoint.publicId}/tests/${test.publicId}`}
                className="rounded-sm underline decoration-border-control underline-offset-4 hover:text-foreground hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {test.name}
                <span className="ml-2 font-mono text-label uppercase">{test.status}</span>
              </Link>
            ))}
          </PanelBody>
        ) : null}
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Submissions"
          description={
            endpoint.submissionCount > 0
              ? `${endpoint.submissionCount.toLocaleString("en-GB")} received, ${endpoint.awaitingCount.toLocaleString("en-GB")} awaiting verdict.`
              : undefined
          }
          action={
            endpoint.submissionCount > 0 ? (
              <Link
                href={`/app/${workspace.slug}/submissions?endpoint=${endpoint.publicId}`}
                className="shrink-0 rounded-md border border-border-control px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Open in the inbox
              </Link>
            ) : null
          }
        />

        {rows.length === 0 ? (
          <EmptyState title="Nothing has arrived here yet.">
            Copy the snippet above into your page, or fire the curl command at it
            from a terminal. The first submission shows up here within seconds of
            landing — stamped Human, Agent or Unverified, with the reasons
            attached.
          </EmptyState>
        ) : (
          <DataTable
            caption="The most recent submissions to this endpoint, with what was submitted, the Origin stamp and the downstream verdict."
            scrollLabel="Recent submissions"
            tableClassName="min-w-[44rem]"
          >
            <thead>
              <tr>
                <Th>Received</Th>
                <Th>Submitted</Th>
                <Th>Origin</Th>
                <Th>Verdict</Th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {rows.map((row) => (
                <tr key={row.publicId}>
                  <Td dim>
                    <Link
                      href={`/app/${workspace.slug}/submissions/${row.publicId}`}
                      className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <RelativeTime value={row.submittedAt} />
                    </Link>
                  </Td>
                  <Td>
                    {summariseValues(row.values)}
                    {row.deliveredNowhere ? (
                      <span className="mt-1.5 block">
                        <NowhereChip />
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <ProvenanceChip origin={row.origin} />
                  </Td>
                  <Td>
                    <VerdictChip verdict={row.verdict} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {/* Destinations (#41), and their health (#42). The alert above the panel
          is absent when nothing is wrong — the point of it is that it appears
          here, on the page someone opened for another reason, rather than only
          on the destinations screen that they would have to already suspect a
          problem to visit. */}
      <div className="mt-6 grid gap-6">
        <DeliveryAlert
          failing={destinationRows.filter((row) => row.health.state === "failing")}
          degraded={destinationRows.filter((row) => row.health.state === "degraded")}
          href={`/app/${workspace.slug}/endpoints/${endpoint.publicId}/destinations`}
        />
        <Panel>
          <PanelHeader
            title="Destinations"
            description={
              destinationRows.length > 0
                ? // "delivering" counts the ones that are actually working, not
                  // the ones that are switched on. Calling a failing destination
                  // "delivering" because `enabled` is true is the dashboard this
                  // product is named against, in miniature.
                  `${destinationRows.length} ${destinationRows.length === 1 ? "destination" : "destinations"}, ${destinationRows.filter((row) => row.health.state === "healthy").length} delivering. Every submission is stored first and delivered second, so a destination that breaks costs a delivery and never a lead.`
                : "Nothing leaves this endpoint yet. Submissions are still being stored, and they will still be here whenever you add somewhere for them to go."
            }
            action={
              <Link
                href={`/app/${workspace.slug}/endpoints/${endpoint.publicId}/destinations`}
                className="shrink-0 rounded-md border border-border-control px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {destinationRows.length > 0 ? "Manage destinations" : "Add a destination"}
              </Link>
            }
          />
          {destinationRows.length > 0 ? (
            <PanelBody>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {destinationRows.map((row) => (
                  <span key={row.id} className="inline-flex items-center gap-2">
                    <HealthChip state={row.health.state} />
                    <span className="text-sm text-muted-foreground">{row.name}</span>
                  </span>
                ))}
              </div>
              {/* #64. A destination the customer never added needs a sentence
                  saying where it came from — on the screen they are most likely
                  to first notice it on. */}
              {defaultNotification ? (
                <p className="mt-4 max-w-[64ch] text-sm text-muted-foreground">
                  <span className="text-foreground">{defaultNotification.name}</span> —{" "}
                  {DEFAULT_NOTIFICATION_BLURB}
                </p>
              ) : null}
            </PanelBody>
          ) : null}
        </Panel>
      </div>

      <Panel className="mt-6">
        <PanelHeader
          title="Name"
          description="Yours alone. Renaming changes nothing about the URL, so every form already pointed here keeps working."
        />
        <PanelBody>
          <RenameEndpointForm
            slug={workspace.slug}
            publicId={endpoint.publicId}
            name={endpoint.name}
          />
        </PanelBody>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title={endpoint.archivedAt ? "Restore" : "Archive"}
          description={
            endpoint.archivedAt
              ? "Start accepting submissions at this URL again. The forms pointed at it will work the moment you do."
              : "Stops new submissions with a clear 410 rather than a silent failure, and keeps every submission it already took. Nothing is deleted."
          }
        />
        <PanelBody>
          <ArchiveEndpointForm
            slug={workspace.slug}
            publicId={endpoint.publicId}
            archived={endpoint.archivedAt !== null}
          />
        </PanelBody>
      </Panel>
    </Container>
  );
}
