"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  formError,
  formSuccess,
  type FormState,
  type InviteState,
} from "@/actions/form-state";
import { requireUser } from "@/lib/auth/session";
import {
  acceptInvitation,
  inviteToWorkspace,
  revokeInvitation,
} from "@/lib/workspaces/invitations";
import { getWorkspaceAccess } from "@/lib/workspaces/queries";

const emailSchema = z.string().trim().min(1).max(320).pipe(z.email());

export async function inviteMemberAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");

  const access = await getWorkspaceAccess(slug, user.id);
  if (!access) return formError("You don’t have access to that workspace.");
  if (access.role !== "owner") return formError("Only an owner can invite people.");

  const email = emailSchema.safeParse(String(formData.get("email") ?? ""));
  if (!email.success) {
    const raw = String(formData.get("email") ?? "").trim();
    return formError(
      raw.length === 0 ? "Enter an email address." : "That doesn’t look like an email address.",
    );
  }

  const role = formData.get("role") === "owner" ? "owner" : "member";

  const result = await inviteToWorkspace({
    workspaceId: access.workspace.id,
    email: email.data,
    role,
    invitedByUserId: user.id,
  });

  if (!result.ok) {
    return formError(
      result.reason === "already-a-member"
        ? "They’re already in this workspace."
        : "They already have an invitation waiting. Withdraw it first to send a new one.",
    );
  }

  const url = await inviteUrl(result.token);

  // Also on the server console, so a link is recoverable from the terminal
  // during development without re-inviting.
  console.log(`\n  invitation for ${result.email} → ${url}\n`);

  revalidatePath(`/app/${access.workspace.slug}/members`);

  return {
    status: "success",
    message: `Invitation created for ${result.email}.`,
    inviteUrl: url,
  };
}

export async function revokeInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");

  const access = await getWorkspaceAccess(slug, user.id);
  if (!access) return formError("You don’t have access to that workspace.");
  if (access.role !== "owner") return formError("Only an owner can withdraw an invitation.");

  const revoked = await revokeInvitation(
    access.workspace.id,
    String(formData.get("invitationId") ?? ""),
  );

  if (!revoked) return formError("That invitation is no longer pending.");

  revalidatePath(`/app/${access.workspace.slug}/members`);
  return formSuccess("Withdrawn.");
}

/**
 * Redeems an invitation for the signed-in user.
 *
 * The token comes from the URL, not from a hidden field the page rendered, so
 * there is nothing here for a stale tab to replay into the wrong workspace.
 */
export async function acceptInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const user = await requireUser(`/app/invitations/${encodeURIComponent(token)}`);

  const result = await acceptInvitation(token, user.id);

  if (!result.ok) {
    return formError("This invitation has already been used, withdrawn, or has expired.");
  }

  // Joining changes the workspace list in the app bar's layout — same reason as
  // `createWorkspaceAction`.
  revalidatePath("/app", "layout");
  redirect(`/app/${result.slug}`);
}

/**
 * The absolute URL for an invitation.
 *
 * Built from the request's own host rather than a configured base URL, so a
 * preview deployment produces a link that works on the preview deployment.
 */
async function inviteUrl(token: string): Promise<string> {
  const head = await headers();
  const host = head.get("host") ?? "localhost:3000";
  const proto = head.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/app/invitations/${encodeURIComponent(token)}`;
}
