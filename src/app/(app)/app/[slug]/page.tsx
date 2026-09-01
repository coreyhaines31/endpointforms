import Link from "next/link";

import { Container } from "@/components/container";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { RelativeTime } from "@/components/app/time";
import { YieldBreakdown, YieldPanel } from "@/components/app/yield-panel";
import { listEndpointsWithStats } from "@/lib/workspaces/endpoints";
import { requireWorkspace } from "@/lib/workspaces/server";
import { RENDER_DOMAIN } from "@/lib/workspaces/slug";
import { readYield, readYieldByDimension } from "@/lib/yield/query";

/**
 * The workspace overview.
 *
 * Thin on purpose — the two screens that matter are the inbox and the endpoint
 * list, and this page's job is to hand you to whichever one you needed. It also
 * demonstrates the rule the app is built on: every workspace-scoped read goes
 * through `withWorkspace()`, on an id `requireWorkspace` just proved a
 * membership for.
 */
export default async function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace, role } = await requireWorkspace(slug);

  const endpoints = await listEndpointsWithStats(workspace.id);

  // Yield across the whole workspace, and the same metric per endpoint (#44).
  // Both reads are workspace-scoped; the components are given the results
  // rather than the query, which is what `eslint.config.mjs` requires.
  const [yieldReport, yieldByEndpoint] = await Promise.all([
    readYield(workspace.id),
    readYieldByDimension(workspace.id, "endpoint"),
  ]);
  const awaiting = endpoints.reduce((total, endpoint) => total + endpoint.awaitingCount, 0);

  return (
    <Container className="pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">Workspace</p>
      <h1 className="mt-4 text-h2">{workspace.name}</h1>
      <p className="mt-3 font-mono text-sm text-muted-foreground">
        {workspace.slug}.{RENDER_DOMAIN}
      </p>

      {endpoints.length > 0 ? (
        <p className="mt-6 max-w-[60ch] text-base text-muted-foreground">
          {awaiting.toLocaleString("en-GB")}{" "}
          {awaiting === 1 ? "submission is" : "submissions are"} awaiting a verdict.{" "}
          <Link
            href={`/app/${workspace.slug}/submissions`}
            className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Open the inbox
          </Link>
          .
        </p>
      ) : null}

      <YieldPanel
        className="mt-8"
        report={yieldReport}
        description="What this workspace's submissions turned out to be worth. Shown beside the submission count, never instead of it — the gap between the two is the point."
      />

      <YieldBreakdown
        className="mt-6"
        groups={yieldByEndpoint}
        title="Yield by endpoint"
        description="Which forms produce deals and which only produce fills. Both numbers are here, because a form can be excellent at one and useless at the other. Only endpoints that have taken a submission appear — the rest are in the list below."
        keyLabel="Endpoint"
        href={(group) => (group.key ? `/app/${workspace.slug}/endpoints/${group.key}` : null)}
      />

      <Panel className="mt-8">
        <PanelHeader
          title="Endpoints"
          description="What your forms post to. An endpoint works with no schema at all — you point an existing form at it and submissions arrive."
          action={
            <Link
              href={`/app/${workspace.slug}/endpoints`}
              className="shrink-0 rounded-md border border-border-control px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {endpoints.length === 0 ? "Create one" : "Manage endpoints"}
            </Link>
          }
        />

        {endpoints.length === 0 ? (
          <EmptyState title="Nothing is pointed here yet.">
            An endpoint is a URL your forms post to. Creating one takes a name and
            nothing else — then you change a single attribute on a form you already
            have, and the next person who submits it shows up in your inbox.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {endpoints.map((endpoint) => (
              <li
                key={endpoint.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-4"
              >
                <Link
                  href={`/app/${workspace.slug}/endpoints/${endpoint.publicId}`}
                  className="rounded-sm text-base text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {endpoint.name}
                  {endpoint.archivedAt ? " (archived)" : ""}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {endpoint.submissionCount.toLocaleString("en-GB")}{" "}
                  {endpoint.submissionCount === 1 ? "submission" : "submissions"}
                  {endpoint.lastSubmissionAt ? (
                    <>
                      {" · last received "}
                      <RelativeTime value={endpoint.lastSubmissionAt} />
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="mt-6">
        <PanelHeader title="Your access" />
        <PanelBody className="text-sm text-muted-foreground">
          You are {role === "owner" ? "an owner" : "a member"} of this workspace.
          {role === "owner"
            ? " Owners can invite people, rename the workspace and remove members."
            : " Members can see everything in the workspace but can’t change who is in it."}
        </PanelBody>
      </Panel>
    </Container>
  );
}
