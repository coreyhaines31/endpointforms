import { Container } from "@/components/container";
import {
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  RoleChip,
} from "@/components/app/panel";
import { InviteForm, RemoveMemberForm, RevokeInvitationForm } from "@/components/app/forms";
import { listPendingInvitations } from "@/lib/workspaces/invitations";
import { listMembers } from "@/lib/workspaces/queries";
import { requireWorkspace } from "@/lib/workspaces/server";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace, role, userId } = await requireWorkspace(slug);

  const [members, pending] = await Promise.all([
    listMembers(workspace.id),
    listPendingInvitations(workspace.id),
  ]);

  const isOwner = role === "owner";

  return (
    <Container className="max-w-[52rem] pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">Members</p>
      <h1 className="mt-4 text-h2">Who’s in {workspace.name}</h1>

      {isOwner ? (
        <Panel className="mt-8">
          <PanelHeader
            title="Invite someone"
            description="Owners can invite people and change who’s here. Members can see everything in the workspace."
          />
          <PanelBody>
            <InviteForm slug={workspace.slug} />
          </PanelBody>
        </Panel>
      ) : null}

      <Panel className="mt-6">
        <PanelHeader title={`Members (${members.length})`} />
        <ul className="divide-y divide-border">
          {members.map((member) => (
            <li
              key={member.membershipId}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="truncate text-base text-foreground">
                  {member.name ?? member.email}
                  {member.userId === userId ? (
                    <span className="ml-2 text-sm text-muted-foreground">(you)</span>
                  ) : null}
                </p>
                {member.name ? (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {member.email}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <RoleChip role={member.role} />
                {isOwner ? (
                  <RemoveMemberForm
                    slug={workspace.slug}
                    membershipId={member.membershipId}
                    label={member.email}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {isOwner ? (
        <Panel className="mt-6">
          <PanelHeader
            title="Pending invitations"
            description="An invitation expires after seven days."
          />
          {pending.length === 0 ? (
            <EmptyState title="Nothing pending." />
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base text-foreground">{invitation.email}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Invited{" "}
                      {invitation.invitedByEmail ? `by ${invitation.invitedByEmail}` : ""} ·
                      expires {invitation.expiresAt.toISOString().slice(0, 10)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <RoleChip role={invitation.role} />
                    <RevokeInvitationForm
                      slug={workspace.slug}
                      invitationId={invitation.id}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </Container>
  );
}
