import Link from "next/link";

import { Container } from "@/components/container";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { AcceptInvitationForm } from "@/components/app/forms";
import { requireUser } from "@/lib/auth/session";
import { findLiveInvitation } from "@/lib/workspaces/invitations";

/**
 * Accepting an invitation.
 *
 * Lives under `/app` so `src/proxy.ts` bounces a signed-out visitor to sign-in
 * with this URL in `next`, and they land back here afterwards. An invitation
 * arrives cold from someone's inbox; losing it to a sign-in redirect means
 * asking the inviter to send another one.
 *
 * A dead token — used, withdrawn, expired or invented — produces one message. It
 * does not say which, because the difference is only useful to someone trying
 * tokens.
 */
export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  await requireUser(`/app/invitations/${encodeURIComponent(token)}`);

  const invitation = await findLiveInvitation(token);

  if (!invitation) {
    return (
      <Container className="max-w-[36rem] pt-16">
        <p className="font-mono text-label uppercase text-muted-foreground">Invitation</p>
        <h1 className="mt-4 text-h2">This invitation isn’t valid</h1>
        <p className="mt-4 text-base text-muted-foreground">
          It may have been used already, withdrawn, or expired. Ask whoever
          invited you to send a new one.
        </p>
        <p className="mt-6">
          <Link
            href="/app"
            className="rounded-sm underline underline-offset-4 decoration-border-control hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Go to your workspaces
          </Link>
        </p>
      </Container>
    );
  }

  return (
    <Container className="max-w-[36rem] pt-16">
      <p className="font-mono text-label uppercase text-muted-foreground">Invitation</p>
      <h1 className="mt-4 text-h2">Join {invitation.workspaceName}</h1>

      <Panel className="mt-8">
        <PanelHeader
          title="You’ve been invited"
          description={`As ${invitation.role === "owner" ? "an owner" : "a member"} of ${invitation.workspaceName}.`}
        />
        <PanelBody>
          <p className="mb-5 text-sm text-muted-foreground">
            The invitation was addressed to {invitation.email}. Accepting adds the
            account you’re signed in with — if that isn’t the one you want, sign
            out first.
          </p>
          <AcceptInvitationForm token={token} />
        </PanelBody>
      </Panel>
    </Container>
  );
}
