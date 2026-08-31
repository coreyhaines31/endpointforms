"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formError, formSuccess, type FormState } from "@/actions/form-state";
import { requireMember } from "@/actions/guards";
import {
  createEndpoint,
  renameEndpointByPublicId,
  setEndpointArchived,
} from "@/lib/workspaces/endpoints";

/**
 * Endpoint mutations (#50).
 *
 * Same rule as every other action in here: the slug comes from the form, the
 * workspace id comes from a membership check, and nothing in between accepts an
 * id. The endpoint is then addressed by its **public** ID, which is the one in
 * the URL the person is looking at — and because the query scopes the UPDATE to
 * the workspace, a public ID belonging to someone else matches zero rows and
 * returns the same "no longer here" sentence as one that never existed.
 */

const nameSchema = z.string().trim().min(1).max(120);

const MESSAGES = {
  nameEmpty: "Give the endpoint a name — something you’ll recognise in the inbox.",
  nameTooLong: "That name is too long.",
  gone: "That endpoint is no longer here.",
} as const;

/**
 * Creates an endpoint and goes straight to it.
 *
 * The redirect is the point: the thing someone needs next is the snippet, and
 * leaving them on the list to hunt for the row they just made is how a two-step
 * task becomes a three-step one.
 */
export async function createEndpointAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const slug = String(formData.get("slug") ?? "");
  const access = await requireMember(slug);
  if ("error" in access) return access.error;

  const name = nameSchema.safeParse(String(formData.get("name") ?? ""));
  if (!name.success) {
    const raw = String(formData.get("name") ?? "").trim();
    return formError(raw.length === 0 ? MESSAGES.nameEmpty : MESSAGES.nameTooLong);
  }

  const created = await createEndpoint(access.workspace.id, name.data);

  revalidatePath(`/app/${access.workspace.slug}/endpoints`);
  redirect(`/app/${access.workspace.slug}/endpoints/${created.publicId}`);
}

export async function renameEndpointAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await requireMember(String(formData.get("slug") ?? ""));
  if ("error" in access) return access.error;

  const name = nameSchema.safeParse(String(formData.get("name") ?? ""));
  if (!name.success) {
    const raw = String(formData.get("name") ?? "").trim();
    return formError(raw.length === 0 ? MESSAGES.nameEmpty : MESSAGES.nameTooLong);
  }

  const publicId = String(formData.get("publicId") ?? "");
  const renamed = await renameEndpointByPublicId(access.workspace.id, publicId, name.data);
  if (!renamed) return formError(MESSAGES.gone);

  revalidatePath(`/app/${access.workspace.slug}/endpoints`);
  revalidatePath(`/app/${access.workspace.slug}/endpoints/${publicId}`);
  return formSuccess("Renamed.");
}

/**
 * Archives or restores.
 *
 * One action for both directions, driven by a form field, so the button that
 * undoes the thing cannot fall out of step with the button that did it. Nothing
 * is deleted: an archived endpoint stops accepting submissions and keeps every
 * one it has.
 */
export async function setEndpointArchivedAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await requireMember(String(formData.get("slug") ?? ""));
  if ("error" in access) return access.error;

  const archived = String(formData.get("archived") ?? "") === "true";
  const publicId = String(formData.get("publicId") ?? "");

  const changed = await setEndpointArchived(access.workspace.id, publicId, archived);
  if (!changed) return formError(MESSAGES.gone);

  revalidatePath(`/app/${access.workspace.slug}/endpoints`);
  revalidatePath(`/app/${access.workspace.slug}/endpoints/${publicId}`);

  return formSuccess(
    archived
      ? "Archived. It has stopped accepting submissions; the ones it already has are still here."
      : "Restored. It is accepting submissions again.",
  );
}
