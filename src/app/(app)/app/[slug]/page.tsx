import { Container } from "@/components/container";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { listEndpoints } from "@/lib/workspaces/queries";
import { requireWorkspace } from "@/lib/workspaces/server";
import { RENDER_DOMAIN } from "@/lib/workspaces/slug";

/**
 * The workspace overview.
 *
 * Thin on purpose. Endpoints (#50) are someone else's issue; what this page has
 * to demonstrate now is that a workspace's data is reachable only through
 * `withWorkspace()`, and it does — `listEndpoints` takes the id that
 * `requireWorkspace` just proved a membership for.
 */
export default async function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace, role } = await requireWorkspace(slug);

  const endpoints = await listEndpoints(workspace.id);

  return (
    <Container className="pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">Workspace</p>
      <h1 className="mt-4 text-h2">{workspace.name}</h1>
      <p className="mt-3 font-mono text-sm text-muted-foreground">
        {workspace.slug}.{RENDER_DOMAIN}
      </p>

      <Panel className="mt-8">
        <PanelHeader
          title="Endpoints"
          description="What your forms post to. An endpoint works with no schema at all — you point an existing form at it and submissions arrive."
        />

        {endpoints.length === 0 ? (
          <EmptyState title="No endpoints yet.">
            Creating them arrives with the submission path. Everything on this page
            already reads through the workspace boundary, so it will show up here
            for this workspace and no other.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {endpoints.map((endpoint) => (
              <li
                key={endpoint.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-4"
              >
                <span className="text-base text-foreground">{endpoint.name}</span>
                <code className="font-mono text-sm text-muted-foreground">
                  /e/{endpoint.publicId}
                </code>
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
