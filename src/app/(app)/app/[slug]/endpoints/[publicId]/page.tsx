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
import { getEndpointByPublicId } from "@/lib/workspaces/endpoints";
import { requireWorkspace } from "@/lib/workspaces/server";
import { RENDER_DOMAIN } from "@/lib/workspaces/slug";
import { listSubmissions, parseSubmissionFilters } from "@/lib/workspaces/submissions";
import { summariseValues } from "@/lib/submission-values";

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
                  <Td>{summariseValues(row.values)}</Td>
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
