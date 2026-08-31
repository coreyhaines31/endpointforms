"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formError, formSuccess, type FormState } from "@/actions/form-state";
import { requireUser } from "@/lib/auth/session";
import {
  createWorkspace,
  deleteEndpoint,
  getWorkspaceAccess,
  removeMember,
  renameEndpoint,
  renameWorkspace,
} from "@/lib/workspaces/queries";
import { SLUG_MESSAGES, validateWorkspaceSlug } from "@/lib/workspaces/slug";

/**
 * Workspace mutations.
 *
 * Every one of these re-derives the workspace from the slug **and** the session
 * user, through `getWorkspaceAccess`. A workspace id posted in a form field is
 * an attacker's field, so no action here accepts one: the id it acts on is the
 * one a membership check just produced.
 */

const nameSchema = z.string().trim().min(1).max(120);

const MESSAGES = {
  nameEmpty: "Give the workspace a name.",
  nameTooLong: "That name is too long.",
  notAllowed: "You don’t have access to that workspace.",
  ownersOnly: "Only an owner can do that.",
  failed: "That didn’t go through. Try again in a moment.",
} as const;

export async function createWorkspaceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const name = nameSchema.safeParse(String(formData.get("name") ?? ""));
  if (!name.success) {
    const raw = String(formData.get("name") ?? "").trim();
    return formError(raw.length === 0 ? MESSAGES.nameEmpty : MESSAGES.nameTooLong);
  }

  const slug = validateWorkspaceSlug(formData.get("slug"));
  if (!slug.ok) return formError(slug.message);

  const created = await createWorkspace({
    slug: slug.slug,
    name: name.data,
    userId: user.id,
  });

  if (!created.ok) return formError(SLUG_MESSAGES.taken);

  // The app bar's workspace list lives in `(app)/layout.tsx`. Without this the
  // client Router Cache serves the layout it already has, and the workspace
  // someone just created is missing from the switcher they are looking at.
  revalidatePath("/app", "layout");
  redirect(`/app/${created.slug}`);
}

export async function renameWorkspaceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await requireOwner(String(formData.get("slug") ?? ""));
  if ("error" in access) return access.error;

  const name = nameSchema.safeParse(String(formData.get("name") ?? ""));
  if (!name.success) {
    const raw = String(formData.get("name") ?? "").trim();
    return formError(raw.length === 0 ? MESSAGES.nameEmpty : MESSAGES.nameTooLong);
  }

  await renameWorkspace(access.workspace.id, name.data);
  revalidatePath(`/app/${access.workspace.slug}`, "layout");

  return formSuccess("Saved.");
}

export async function removeMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await requireOwner(String(formData.get("slug") ?? ""));
  if ("error" in access) return access.error;

  const membershipId = String(formData.get("membershipId") ?? "");
  const result = await removeMember(access.workspace.id, membershipId);

  if (!result.ok) {
    return formError(
      result.reason === "last-owner"
        ? "A workspace needs at least one owner, so this one can’t be removed."
        : "That person is no longer a member.",
    );
  }

  revalidatePath(`/app/${access.workspace.slug}/members`);
  return formSuccess("Removed.");
}

export async function renameEndpointAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await requireMember(String(formData.get("slug") ?? ""));
  if ("error" in access) return access.error;

  const name = nameSchema.safeParse(String(formData.get("name") ?? ""));
  if (!name.success) return formError(MESSAGES.nameEmpty);

  const renamed = await renameEndpoint(
    access.workspace.id,
    String(formData.get("endpointId") ?? ""),
    name.data,
  );

  // `renameEndpoint` scopes the UPDATE, so another workspace's endpoint matches
  // zero rows and lands here rather than being renamed.
  if (!renamed) return formError("That endpoint is no longer here.");

  revalidatePath(`/app/${access.workspace.slug}`);
  return formSuccess("Saved.");
}

export async function deleteEndpointAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await requireMember(String(formData.get("slug") ?? ""));
  if ("error" in access) return access.error;

  const deleted = await deleteEndpoint(
    access.workspace.id,
    String(formData.get("endpointId") ?? ""),
  );

  if (!deleted) return formError("That endpoint is no longer here.");

  revalidatePath(`/app/${access.workspace.slug}`);
  return formSuccess("Deleted.");
}

// ---------------------------------------------------------------------------

type Allowed = { workspace: { id: string; slug: string; name: string } };
type Denied = { error: FormState };

/**
 * The workspace, if the session user is a member of it.
 *
 * Returns a form error rather than throwing, so a stale tab posting to a
 * workspace someone was just removed from gets a sentence instead of a stack
 * trace. It never says whether the workspace exists.
 */
async function requireMember(slug: string): Promise<Allowed | Denied> {
  const user = await requireUser();
  const access = await getWorkspaceAccess(slug, user.id);
  if (!access) return { error: formError(MESSAGES.notAllowed) };
  return { workspace: access.workspace };
}

async function requireOwner(slug: string): Promise<Allowed | Denied> {
  const user = await requireUser();
  const access = await getWorkspaceAccess(slug, user.id);
  if (!access) return { error: formError(MESSAGES.notAllowed) };
  if (access.role !== "owner") return { error: formError(MESSAGES.ownersOnly) };
  return { workspace: access.workspace };
}
