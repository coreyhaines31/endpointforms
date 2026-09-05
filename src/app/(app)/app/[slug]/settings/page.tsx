import { Container } from "@/components/container";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { RenameWorkspaceForm } from "@/components/app/forms";
import { SpamListsForm } from "@/components/app/spam-lists";
import { listSpamEntries } from "@/lib/spam/review";
import { VerdictKeysPanel } from "@/components/app/verdict-keys";
import { listVerdictApiKeys } from "@/lib/verdict/key-store";
import { requireWorkspace } from "@/lib/workspaces/server";
import { RENDER_DOMAIN } from "@/lib/workspaces/slug";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace, role } = await requireWorkspace(slug);
  const spamEntries = await listSpamEntries(workspace.id);
  const verdictKeys = await listVerdictApiKeys(workspace.id);
  const now = new Date();

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
      <Panel className="mt-6">
        <PanelHeader
          title="Outcome API keys"
          description="They authenticate the outcome webhook — how a closed deal gets back to the form that produced it. A key is shown once, can be revoked on its own, and records when it was last used."
        />
        <VerdictKeysPanel
          slug={workspace.slug}
          keys={verdictKeys}
          canManage={role === "owner"}
          now={now}
        />
        <PanelBody className="border-t border-border">
          <p className="max-w-[62ch] text-sm text-muted-foreground">
            Send a key as an <code className="font-mono">Authorization: Bearer</code> header
            to <code className="font-mono">/api/v1/verdict</code>. Revoking one takes effect on
            the next request — there is no cache in front of this check, because a revocation
            that took thirty seconds to land is a revocation nobody can rely on in the minute
            they need it.
            {role === "owner"
              ? null
              : " Only an owner can create or revoke keys."}
          </p>
        </PanelBody>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Spam lists"
          description="The one control here that is not a heuristic. “Never flag” ends scoring outright for anything that matches — nothing else is even consulted. “Always flag” marks a submission; it never deletes, hides or withholds one."
        />
        <SpamListsForm slug={workspace.slug} entries={spamEntries} />
        <PanelBody className="border-t border-border">
          <p className="max-w-[60ch] text-sm text-muted-foreground">
            Changes take up to 30 seconds to reach every server. We cache these
            on the submission path so reading them does not cost your visitors a
            database round trip.
          </p>
        </PanelBody>
      </Panel>
    </Container>
  );
}
