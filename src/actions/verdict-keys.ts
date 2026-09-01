"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formError, formSuccess, type VerdictKeyState } from "@/actions/form-state";
import { requireOwner } from "@/actions/guards";
import { requireUser } from "@/lib/auth/session";
import {
  createVerdictApiKey,
  revokeDerivedVerdictKey,
  revokeVerdictApiKey,
  VerdictKeyError,
} from "@/lib/verdict/key-store";

/**
 * Outcome API keys (#57).
 *
 * Same rule as every other action here: the slug comes from the form, the
 * workspace id comes from a membership check, and nothing in between accepts an
 * id. A key id belonging to another workspace matches nothing under the scoped
 * update and gets the sentence a nonexistent one gets.
 *
 * **Creating and revoking are owner-only.** Both the ordinary spam and
 * destination actions settle for membership, and this one does not, because
 * these two buttons are the ones that change who can write into the outcome
 * ledger — the column Yield ranks on and Hindsight decides a form from. A
 * member who can be invited in an afternoon should not be able to hand out a
 * long-lived credential to it, nor to break a live CRM integration by killing
 * one.
 *
 * The created key's plaintext travels back in the action's state and is
 * rendered once. It is the same shape `InviteState` uses for an invitation
 * link, and for the same reason: only a hash is stored, so a screen that
 * implied the value could be fetched again later would be lying about what the
 * database contains.
 */

const createSchema = z.object({
  slug: z.string().min(1),
  label: z
    .string()
    .trim()
    .min(1, "Give the key a name — “Salesforce webhook”, “Zapier”, something you will recognise in six months.")
    .max(80, "Keep the name under 80 characters."),
});

const revokeSchema = z.object({
  slug: z.string().min(1),
  /** Absent for the legacy derived key, which has no row. */
  keyId: z.string().uuid().optional(),
});

export async function createVerdictKeyAction(
  _prev: VerdictKeyState,
  formData: FormData,
): Promise<VerdictKeyState> {
  const parsed = createSchema.safeParse({
    slug: formData.get("slug"),
    label: formData.get("label"),
  });

  if (!parsed.success) {
    return formError(parsed.error.issues[0]?.message ?? "That name will not work.");
  }

  const access = await requireOwner(parsed.data.slug);
  if ("error" in access) return access.error;

  const user = await requireUser();

  try {
    const created = await createVerdictApiKey({
      workspaceId: access.workspace.id,
      label: parsed.data.label,
      createdByUserId: user.id,
    });

    revalidatePath(`/app/${parsed.data.slug}/settings`);

    return {
      status: "success",
      message:
        "Key created. Copy it now — it is stored only as a hash, so this is the only time it can be shown.",
      apiKey: created.key,
    };
  } catch (error) {
    if (error instanceof VerdictKeyError) return formError(error.message);
    throw error;
  }
}

export async function revokeVerdictKeyAction(
  _prev: VerdictKeyState,
  formData: FormData,
): Promise<VerdictKeyState> {
  const parsed = revokeSchema.safeParse({
    slug: formData.get("slug"),
    keyId: formData.get("keyId") || undefined,
  });

  if (!parsed.success) return formError("That key could not be identified.");

  const access = await requireOwner(parsed.data.slug);
  if ("error" in access) return access.error;

  try {
    if (parsed.data.keyId) {
      await revokeVerdictApiKey(access.workspace.id, parsed.data.keyId);
    } else {
      await revokeDerivedVerdictKey(access.workspace.id);
    }

    revalidatePath(`/app/${parsed.data.slug}/settings`);

    return formSuccess(
      "Revoked. Anything still sending outcomes with that key now gets a 401 saying so.",
    );
  } catch (error) {
    if (error instanceof VerdictKeyError) return formError(error.message);
    throw error;
  }
}
