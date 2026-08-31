import { Container } from "@/components/container";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { CreateWorkspaceForm } from "@/components/app/forms";
import { requireUser } from "@/lib/auth/session";
import { RENDER_DOMAIN } from "@/lib/workspaces/slug";
import { listWorkspacesForUser } from "@/lib/workspaces/queries";

export default async function NewWorkspacePage() {
  const user = await requireUser();
  const workspaces = await listWorkspacesForUser(user.id);
  const first = workspaces.length === 0;

  return (
    <Container className="max-w-[40rem] pt-12">
      <p className="font-mono text-label uppercase text-muted-foreground">
        {first ? "One more step" : "New workspace"}
      </p>
      <h1 className="mt-4 text-h2">
        {first ? "Create your workspace" : "Create a workspace"}
      </h1>
      <p className="mt-4 text-base text-muted-foreground">
        A workspace holds your endpoints, submissions and teammates. Everything in
        the product is scoped to one.
      </p>

      <Panel className="mt-8">
        <PanelHeader
          title="Workspace details"
          description="The name is for you and can change. The URL is public and can’t."
        />
        <PanelBody>
          <CreateWorkspaceForm renderDomain={RENDER_DOMAIN} />
        </PanelBody>
      </Panel>
    </Container>
  );
}
