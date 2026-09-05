import Link from "next/link";

import { Container } from "@/components/container";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { CreateEndpointForm } from "@/components/app/endpoint-forms";
import { DataTable, Td, Th } from "@/components/app/table";
import { RelativeTime } from "@/components/app/time";
import { listEndpointsWithStats } from "@/lib/workspaces/endpoints";
import { requireWorkspace } from "@/lib/workspaces/server";
import { RENDER_DOMAIN } from "@/lib/workspaces/slug";

/**
 * The endpoints in a workspace (#50).
 *
 * `requireWorkspace` is called here rather than trusted from the layout — see
 * the note in `src/lib/workspaces/server.ts`. It is memoised per request, so
 * insisting on it costs one function call.
 */
export default async function EndpointsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);

  const endpoints = await listEndpointsWithStats(workspace.id);
  const live = endpoints.filter((endpoint) => endpoint.archivedAt === null);
  const archived = endpoints.filter((endpoint) => endpoint.archivedAt !== null);

  return (
    <Container className="pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">Endpoints</p>
      <h1 className="mt-4 text-h2">What your forms post to</h1>
      <p className="mt-3 max-w-[60ch] text-base text-muted-foreground">
        An endpoint is a URL. Point an existing form at it and submissions start
        arriving — there is no schema to declare first, and nothing to build.
      </p>

      <Panel className="mt-8">
        <PanelHeader title="New endpoint" />
        <PanelBody>
          <CreateEndpointForm slug={workspace.slug} />
        </PanelBody>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title={live.length === 1 ? "1 endpoint" : `${live.length} endpoints`}
          description={
            live.length > 0
              ? `Each one is served from ${workspace.slug}.${RENDER_DOMAIN}.`
              : undefined
          }
        />

        {live.length === 0 ? (
          <EmptyState title="Nothing is pointed here yet.">
            Create an endpoint above, change one attribute on a form you already
            have, and the next person who submits it shows up in the inbox —
            stamped, timestamped, and yours to export. It emails you about each
            one from the moment it exists, and the endpoint will offer to read
            the page your form is already on.
          </EmptyState>
        ) : (
          <EndpointTable slug={workspace.slug} endpoints={live} />
        )}
      </Panel>

      {archived.length > 0 ? (
        <Panel className="mt-6">
          <PanelHeader
            title="Archived"
            description="Refusing new submissions, keeping every one they already took. Nothing here has been deleted."
          />
          <EndpointTable slug={workspace.slug} endpoints={archived} />
        </Panel>
      ) : null}
    </Container>
  );
}

function EndpointTable({
  slug,
  endpoints,
}: {
  slug: string;
  endpoints: Awaited<ReturnType<typeof listEndpointsWithStats>>;
}) {
  return (
    <DataTable
      caption="Endpoints in this workspace, with the number of submissions each has received, how many are still awaiting a verdict, and when the last one arrived."
      scrollLabel="Endpoints"
      tableClassName="min-w-[46rem]"
    >
      <thead>
        <tr>
          <Th>Name</Th>
          <Th>Endpoint ID</Th>
          <Th numeric>Submissions</Th>
          <Th numeric>Awaiting</Th>
          <Th>Last received</Th>
        </tr>
      </thead>
      <tbody className="[&>tr:last-child>td]:border-b-0">
        {endpoints.map((endpoint) => (
          <tr key={endpoint.id}>
            <Td>
              <Link
                href={`/app/${slug}/endpoints/${endpoint.publicId}`}
                className="rounded-sm font-medium text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {endpoint.name}
              </Link>
              {endpoint.hasSchema ? (
                <span className="ml-2 font-mono text-label uppercase text-muted-foreground">
                  schema
                </span>
              ) : null}
            </Td>
            <Td dim className="font-mono">
              {endpoint.publicId}
            </Td>
            <Td numeric>{endpoint.submissionCount.toLocaleString("en-GB")}</Td>
            <Td numeric dim={endpoint.awaitingCount === 0}>
              {endpoint.awaitingCount.toLocaleString("en-GB")}
            </Td>
            <Td dim>
              {endpoint.lastSubmissionAt ? (
                <RelativeTime value={endpoint.lastSubmissionAt} />
              ) : (
                "nothing yet"
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
