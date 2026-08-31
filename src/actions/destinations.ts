"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { DestinationState } from "@/actions/destinations-state";
import { formError, formSuccess } from "@/actions/form-state";
import { requireMember } from "@/actions/guards";
import {
  buildConfig,
  createDestination,
  deleteDestination,
  deliverSubmission,
  getDestination,
  isAvailableKind,
  rawConfig,
  sendTestDelivery,
  updateDestination,
  type DestinationKind,
} from "@/lib/destinations";
import { getEndpointByPublicId } from "@/lib/workspaces/endpoints";

/**
 * Destination mutations (#41, #42).
 *
 * Same rule as every other action in `src/actions`: the slug comes from the
 * form, the workspace id comes from a membership check, and **no action accepts
 * a workspace id**. The destination is then addressed by its own id, and because
 * every query is scoped, an id belonging to another workspace matches zero rows
 * and gets the same "no longer here" sentence as one that never existed.
 *
 * `DestinationState` and `idleDestinationState` live in
 * `./destinations-state.ts`, not here: a `"use server"` module may only export
 * async functions, and exporting a plain object from one breaks the action
 * bindings at runtime without failing the build.
 *
 * Two things specific to this file:
 *
 * 1. **A secret is returned exactly once**, in `DestinationState.secret`, at the
 *    moment it is generated. It is never read back — see `redactConfig` — so
 *    this is genuinely the only chance to show it, and the UI has to say so.
 * 2. **A test delivery returns the real response.** `DestinationState.test`
 *    carries the status code and the body verbatim. A green tick that hides a
 *    202 from a receiver that queued and dropped the message would manufacture
 *    exactly the false confidence #42 exists to attack.
 */

const nameSchema = z.string().trim().min(1).max(120);

const MESSAGES = {
  nameEmpty: "Give the destination a name — something you’ll recognise in the delivery log.",
  nameTooLong: "That name is too long.",
  gone: "That destination is no longer here.",
  endpointGone: "That endpoint is no longer here.",
  unknownKind: "That kind of destination isn’t available yet.",
} as const;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** The form fields `buildConfig` reads, whichever kind is being saved. */
function configInput(formData: FormData) {
  return {
    url: field(formData, "url"),
    to: field(formData, "to"),
    subject: field(formData, "subject"),
    webhookUrl: field(formData, "webhookUrl"),
    headers: field(formData, "headers"),
    rotateSecret: field(formData, "rotateSecret") === "true",
  };
}

// ---------------------------------------------------------------------------

/**
 * Creates a destination and stays on the list.
 *
 * Deliberately *not* a redirect to the new destination's page, unlike
 * `createEndpointAction`. A webhook generates a signing secret that can only be
 * shown once, and navigating away from the screen holding it is how someone
 * loses it thirty seconds after creating it.
 */
export async function createDestinationAction(
  _prev: DestinationState,
  formData: FormData,
): Promise<DestinationState> {
  const slug = field(formData, "slug");
  const access = await requireMember(slug);
  if ("error" in access) return access.error;

  const endpointPublicId = field(formData, "endpointPublicId");
  const kind = field(formData, "kind");
  if (!isAvailableKind(kind)) return formError(MESSAGES.unknownKind);

  const name = nameSchema.safeParse(field(formData, "name"));
  if (!name.success) {
    return formError(
      field(formData, "name").trim() === "" ? MESSAGES.nameEmpty : MESSAGES.nameTooLong,
    );
  }

  const built = buildConfig(kind as DestinationKind, configInput(formData));
  if (!built.ok) return formError(built.message);

  const created = await createDestination(access.workspace.id, endpointPublicId, {
    kind: kind as DestinationKind,
    name: name.data,
    config: built.config,
  });
  if (!created) return formError(MESSAGES.endpointGone);

  revalidatePath(`/app/${access.workspace.slug}/endpoints/${endpointPublicId}`);
  revalidatePath(`/app/${access.workspace.slug}/endpoints/${endpointPublicId}/destinations`);

  return {
    ...formSuccess(
      built.secret
        ? "Added. Copy the signing secret below — it is shown once and cannot be shown again."
        : "Added. Send a test delivery to prove it works.",
    ),
    ...(built.secret ? { secret: built.secret } : {}),
  };
}

export async function updateDestinationAction(
  _prev: DestinationState,
  formData: FormData,
): Promise<DestinationState> {
  const access = await requireMember(field(formData, "slug"));
  if ("error" in access) return access.error;

  const endpointPublicId = field(formData, "endpointPublicId");
  const destinationId = field(formData, "destinationId");

  const existing = await getDestination(access.workspace.id, endpointPublicId, destinationId);
  if (!existing) return formError(MESSAGES.gone);

  const name = nameSchema.safeParse(field(formData, "name"));
  if (!name.success) {
    return formError(
      field(formData, "name").trim() === "" ? MESSAGES.nameEmpty : MESSAGES.nameTooLong,
    );
  }

  // The previous config is read so a field the form did not re-send — a secret,
  // which is never rendered back into an input — is carried forward rather than
  // blanked. Saving a rename must not silently un-sign every future delivery.
  const previous = await rawConfig(access.workspace.id, destinationId);
  const built = buildConfig(existing.kind, configInput(formData), previous);
  if (!built.ok) return formError(built.message);

  const updated = await updateDestination(access.workspace.id, destinationId, {
    name: name.data,
    config: built.config,
  });
  if (!updated) return formError(MESSAGES.gone);

  revalidatePath(`/app/${access.workspace.slug}/endpoints/${endpointPublicId}/destinations`);
  revalidatePath(
    `/app/${access.workspace.slug}/endpoints/${endpointPublicId}/destinations/${destinationId}`,
  );

  return {
    ...formSuccess(
      built.secret
        ? "Saved, and the signing secret was rotated. Copy the new one below — deliveries signed with the old one will stop verifying."
        : "Saved.",
    ),
    ...(built.secret ? { secret: built.secret } : {}),
  };
}

/**
 * Pauses or resumes.
 *
 * One action for both directions, driven by a form field, so the button that
 * undoes the thing cannot fall out of step with the button that did it — same
 * reasoning as `setEndpointArchivedAction`.
 *
 * "Paused" rather than "disabled" in the copy, because it says what actually
 * happens: submissions still arrive and are still stored, they just do not go
 * out. Nothing is lost, and a paused destination can be redelivered to by hand.
 */
export async function setDestinationEnabledAction(
  _prev: DestinationState,
  formData: FormData,
): Promise<DestinationState> {
  const access = await requireMember(field(formData, "slug"));
  if ("error" in access) return access.error;

  const endpointPublicId = field(formData, "endpointPublicId");
  const destinationId = field(formData, "destinationId");
  const enabled = field(formData, "enabled") === "true";

  const changed = await updateDestination(access.workspace.id, destinationId, { enabled });
  if (!changed) return formError(MESSAGES.gone);

  revalidatePath(`/app/${access.workspace.slug}/endpoints/${endpointPublicId}/destinations`);
  revalidatePath(
    `/app/${access.workspace.slug}/endpoints/${endpointPublicId}/destinations/${destinationId}`,
  );

  return formSuccess(
    enabled
      ? "Resumed. New submissions will be delivered here again."
      : "Paused. Submissions still arrive and are still stored — they just stop going out.",
  );
}

/**
 * Removes a destination, and says what it kept.
 *
 * The row is soft-deleted so the delivery history that references it stays
 * readable. That is the schema's own stated reason for the column, and it is
 * the difference between "why did this lead never reach my CRM in June?" being
 * answerable and not.
 */
export async function deleteDestinationAction(
  _prev: DestinationState,
  formData: FormData,
): Promise<DestinationState> {
  const access = await requireMember(field(formData, "slug"));
  if ("error" in access) return access.error;

  const endpointPublicId = field(formData, "endpointPublicId");
  const destinationId = field(formData, "destinationId");

  const removed = await deleteDestination(access.workspace.id, destinationId);
  if (!removed) return formError(MESSAGES.gone);

  revalidatePath(`/app/${access.workspace.slug}/endpoints/${endpointPublicId}/destinations`);
  redirect(`/app/${access.workspace.slug}/endpoints/${endpointPublicId}/destinations`);
}

/**
 * Sends a sample payload and reports the real response (#42).
 *
 * This is the button that makes the claim checkable. It does not write to the
 * delivery log — the log is the record of real leads, and a row in it for a
 * submission nobody made would make the health numbers lie.
 */
export async function testDestinationAction(
  _prev: DestinationState,
  formData: FormData,
): Promise<DestinationState> {
  const access = await requireMember(field(formData, "slug"));
  if ("error" in access) return access.error;

  const endpointPublicId = field(formData, "endpointPublicId");
  const destinationId = field(formData, "destinationId");

  const destination = await getDestination(access.workspace.id, endpointPublicId, destinationId);
  if (!destination) return formError(MESSAGES.gone);

  const endpoint = await getEndpointByPublicId(access.workspace.id, endpointPublicId);
  if (!endpoint) return formError(MESSAGES.endpointGone);

  const config = await rawConfig(access.workspace.id, destinationId);
  if (!config) return formError(MESSAGES.gone);

  const result = await sendTestDelivery(
    { publicId: endpoint.publicId, name: endpoint.name },
    { id: destination.id, kind: destination.kind, name: destination.name },
    config,
  );

  return {
    status: result.ok ? "success" : "error",
    message: result.ok
      ? `${destination.name} accepted the test delivery.`
      : (result.error ?? "The test delivery failed."),
    test: {
      ok: result.ok,
      status: result.responseStatus,
      body: result.responseBody,
      error: result.error,
    },
  };
}

/**
 * Sends one submission again, now (#42's "replay").
 *
 * `force` is on, so a paused destination can be redelivered to — which is the
 * point of pausing one while you fix it. The attempt appends to the log as the
 * next attempt number and carries the same delivery id as the original, so a
 * receiver that already has the lead recognises it and drops it.
 */
export async function redeliverAction(
  _prev: DestinationState,
  formData: FormData,
): Promise<DestinationState> {
  const access = await requireMember(field(formData, "slug"));
  if ("error" in access) return access.error;

  const endpointPublicId = field(formData, "endpointPublicId");
  const destinationId = field(formData, "destinationId");
  const submissionPublicId = field(formData, "submissionPublicId");

  const destination = await getDestination(access.workspace.id, endpointPublicId, destinationId);
  if (!destination) return formError(MESSAGES.gone);

  const summary = await deliverSubmission(access.workspace.id, submissionPublicId, {
    destinationId,
    force: true,
  });

  revalidatePath(
    `/app/${access.workspace.slug}/endpoints/${endpointPublicId}/destinations/${destinationId}`,
  );

  if (summary.delivered > 0) return formSuccess("Delivered.");
  if (summary.failed > 0) {
    return formError("It failed again. The new attempt is at the top of the log, with the response.");
  }
  return formError("Nothing was sent — that submission is no longer here.");
}
