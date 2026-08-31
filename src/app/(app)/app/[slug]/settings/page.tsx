import { Container } from "@/components/container";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { RenameWorkspaceForm } from "@/components/app/forms";
import { requireWorkspace } from "@/lib/workspaces/server";
import { RENDER_DOMAIN } from "@/lib/workspaces/slug";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace, role } = await requireWorkspace(slug);

  return (
    <Container className="max-w-[44rem] pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">Settings</p>
      <h1 className="mt-4 text-h2">Workspace settings</h1>

      <Panel className="mt-8">
        <PanelHeader
          title="Name"
          description="Shown to you and your teammates. Changing it affects nothing outside the app."
        />
        <PanelBody>
          {role === "owner" ? (
            <RenameWorkspaceForm slug={workspace.slug} name={workspace.name} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {workspace.name} — only an owner can change this.
            </p>
          )}
        </PanelBody>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Workspace URL"
          description="Public, and fixed. Your forms are served from it, so changing it would break every form already embedded on your site."
        />
        <PanelBody>
          <p className="font-mono text-base text-foreground">
            {workspace.slug}.{RENDER_DOMAIN}
          </p>
          <p className="mt-3 max-w-[60ch] text-sm text-muted-foreground">
            Forms render on their own registrable domain, not on a subdomain of
            our marketing site. Our site carries ad pixels; the people filling in
            your forms should never meet them.
          </p>
        </PanelBody>
      </Panel>
    </Container>
  );
}
