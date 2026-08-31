import { formError, type FormState } from "@/actions/form-state";
import { requireUser } from "@/lib/auth/session";
import { getWorkspaceAccess } from "@/lib/workspaces/queries";

/**
 * The membership check every workspace mutation starts with.
 *
 * Deliberately **not** a `"use server"` module. These are helpers, not actions:
 * exporting them from one would publish a callable endpoint for each, and the
 * whole point of them is that they are the thing an action calls before it
 * trusts anything in the form data.
 *
 * The rule they exist to enforce: **no action accepts a workspace id.** They
 * take the slug someone's browser posted and re-derive the id from the session's
 * memberships. A workspace id in a hidden field is an attacker's field.
 */

export const GUARD_MESSAGES = {
  notAllowed: "You don’t have access to that workspace.",
  ownersOnly: "Only an owner can do that.",
} as const;

export type Allowed = { workspace: { id: string; slug: string; name: string } };
export type Denied = { error: FormState };

/**
 * The workspace, if the session user is a member of it.
 *
 * Returns a form error rather than throwing, so a stale tab posting to a
 * workspace someone was just removed from gets a sentence instead of a stack
 * trace. It never says whether the workspace exists.
 */
export async function requireMember(slug: string): Promise<Allowed | Denied> {
  const user = await requireUser();
  const access = await getWorkspaceAccess(slug, user.id);
  if (!access) return { error: formError(GUARD_MESSAGES.notAllowed) };
  return { workspace: access.workspace };
}

export async function requireOwner(slug: string): Promise<Allowed | Denied> {
  const user = await requireUser();
  const access = await getWorkspaceAccess(slug, user.id);
  if (!access) return { error: formError(GUARD_MESSAGES.notAllowed) };
  if (access.role !== "owner") return { error: formError(GUARD_MESSAGES.ownersOnly) };
  return { workspace: access.workspace };
}
