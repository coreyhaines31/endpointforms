"use server";

import { revalidatePath } from "next/cache";

import { requireMember } from "@/actions/guards";
import type {
  ImportActionState,
  ImportCandidate,
  SchemaActionState,
} from "@/components/app/builder/state";
import { requireUser } from "@/lib/auth/session";
import { parseSchemaJson } from "@/lib/schema/format";
import { importSchemaFromHtml } from "@/lib/schema/import-html";
import { HtmlFetchError, importSchemaFromUrl } from "@/lib/schema/import-url";
import {
  activateSchemaVersion,
  clearActiveSchema,
  proposeSchemaFromSubmissions,
  publishSchemaVersion,
  SchemaStoreError,
} from "@/lib/schema/store";
import { getEndpointByPublicId } from "@/lib/workspaces/endpoints";

/**
 * Schema mutations for the builder (#35).
 *
 * ## The builder is a producer, not an owner
 *
 * `src/lib/schema/index.ts` puts it plainly: the builder "hands `store.ts` a
 * document like every other producer does — it is a convenience on top of this
 * format, not the thing the rest of it is built on". So there is no
 * builder-shaped write path here. Every action below parses a
 * `FormSchemaDocument` and calls the same `store.ts` functions the CLI and the
 * importer call, with `source: "builder"` as the only thing that distinguishes
 * them afterwards.
 *
 * ## Draft and published, without a second table
 *
 * `form_schemas` is append-only and the live version is a pointer on the
 * endpoint (`docs/21` §"Editing a schema"), which already contains everything
 * draft/publish needs:
 *
 *   - **Saving a draft** writes version N+1 with `activate: false`. The row
 *     exists, nothing points at it, and the live form is untouched.
 *   - **Publishing** writes version N+1 *and* moves the pointer, in one call.
 *   - **A draft exists** exactly when the highest version is not the active
 *     one. No flag, no state machine, nothing that can disagree with itself.
 *   - **Rolling back** points at an older row. Same operation as activating.
 *
 * The consequence that matters: editing in the builder cannot change the form a
 * campaign is currently pointing at. You have to publish, and publishing says
 * so.
 *
 * ## The same rules as every other action in this directory
 *
 * The slug comes from the form, the workspace id from a membership check, and
 * the endpoint is addressed by the **public** id in the URL the person is
 * looking at. Nothing here accepts a workspace id or an endpoint id.
 */

const MESSAGES = {
  gone: "That endpoint is no longer here.",
  archived:
    "That endpoint is archived, so it is not accepting submissions. Restore it before changing its form.",
  noJson: "Nothing was submitted to save.",
} as const;

type Resolved = {
  workspace: { id: string; slug: string; name: string };
  endpoint: { id: string; publicId: string; archived: boolean };
};

async function resolve(
  formData: FormData,
): Promise<Resolved | { error: SchemaActionState }> {
  const access = await requireMember(String(formData.get("slug") ?? ""));
  if ("error" in access) {
    return { error: { status: "error", message: access.error.message } };
  }

  const publicId = String(formData.get("publicId") ?? "");
  const endpoint = await getEndpointByPublicId(access.workspace.id, publicId);
  if (!endpoint) return { error: { status: "error", message: MESSAGES.gone } };

  return {
    workspace: access.workspace,
    endpoint: {
      id: endpoint.id,
      publicId: endpoint.publicId,
      archived: endpoint.archivedAt !== null,
    },
  };
}

function refresh(slug: string, publicId: string): void {
  revalidatePath(`/app/${slug}/endpoints`);
  revalidatePath(`/app/${slug}/endpoints/${publicId}`);
  revalidatePath(`/app/${slug}/endpoints/${publicId}/builder`);
  // The hosted form reads the active version on every request, so this only
  // matters for the App Router's own cache — but a published change that takes
  // a reload to appear reads as a publish that did not work.
  revalidatePath(`/f/${publicId}`);
}

/**
 * Writes a version.
 *
 * One function for save-as-draft and publish, because they differ by exactly
 * one boolean and two code paths that "both write a schema" is how the draft
 * quietly starts serialising differently from the live one.
 */
async function writeVersion(
  formData: FormData,
  activate: boolean,
): Promise<SchemaActionState> {
  const resolved = await resolve(formData);
  if ("error" in resolved) return resolved.error;

  if (activate && resolved.endpoint.archived) {
    return { status: "error", message: MESSAGES.archived };
  }

  const json = String(formData.get("document") ?? "");
  if (json.trim() === "") return { status: "error", message: MESSAGES.noJson };

  const parsed = parseSchemaJson(json);
  if (!parsed.ok) {
    return {
      status: "error",
      // The client will not normally get here — it blocks the button while the
      // draft has errors — so this is the honest belt-and-braces message rather
      // than the primary way anyone reads a validation failure.
      message: `That schema could not be saved: ${parsed.errors[0]}`,
    };
  }

  const mode = String(formData.get("mode") ?? "warn") === "strict" ? "strict" : "warn";
  const user = await requireUser();

  try {
    const published = await publishSchemaVersion({
      workspaceId: resolved.workspace.id,
      endpointId: resolved.endpoint.id,
      document: parsed.document,
      source: "builder",
      mode,
      createdByUserId: user.id,
      activate,
    });

    refresh(resolved.workspace.slug, resolved.endpoint.publicId);

    return {
      status: "success",
      version: published.version,
      // The exact bytes that were stored, for the editor to compare itself
      // against. See the note on `SchemaActionState.saved`.
      saved: `${mode}|${json}`,
      message: activate
        ? `Published version ${published.version}. It is live now — every form pointed at this endpoint is using it.`
        : `Saved as version ${published.version}. The live form has not changed.`,
    };
  } catch (error) {
    return { status: "error", message: storeMessage(error) };
  }
}

/**
 * Save, or save and publish.
 *
 * One action with two submit buttons rather than two actions, because the two
 * differ by a single boolean and by nothing else. Two entry points would mean
 * two places that parse the document, two places that check the membership,
 * and two chances for the draft to start being serialised differently from the
 * thing that goes live. `intent` arrives from the clicked button's own
 * `name`/`value`, so a form submitted by pressing Enter — where no button was
 * clicked — falls through to the safe half and saves without publishing.
 */
export async function saveSchemaAction(
  _prev: SchemaActionState,
  formData: FormData,
): Promise<SchemaActionState> {
  return writeVersion(formData, String(formData.get("intent") ?? "") === "publish");
}

/**
 * Points the endpoint at a version it already has — publishing a saved draft,
 * or rolling back.
 *
 * Deliberately the same action for both directions. A rollback is not an
 * exceptional path; it is this one, aimed at an older row.
 */
export async function activateVersionAction(
  _prev: SchemaActionState,
  formData: FormData,
): Promise<SchemaActionState> {
  const resolved = await resolve(formData);
  if ("error" in resolved) return resolved.error;

  if (resolved.endpoint.archived) {
    return { status: "error", message: MESSAGES.archived };
  }

  const versionId = String(formData.get("versionId") ?? "");
  const versionNumber = String(formData.get("versionNumber") ?? "");

  try {
    await activateSchemaVersion(resolved.workspace.id, resolved.endpoint.id, versionId);
  } catch (error) {
    return { status: "error", message: storeMessage(error) };
  }

  refresh(resolved.workspace.slug, resolved.endpoint.publicId);
  return {
    status: "success",
    message: `Version ${versionNumber} is live. Every form pointed at this endpoint is using it now.`,
  };
}

/**
 * Takes the schema off the endpoint.
 *
 * Not a delete, and the message has to say so: every version row stays, every
 * submission keeps the version it arrived under, and the endpoint goes back to
 * accepting anything posted to it — which is #50's behaviour and a perfectly
 * good state to be in rather than a broken one.
 */
export async function clearSchemaAction(
  _prev: SchemaActionState,
  formData: FormData,
): Promise<SchemaActionState> {
  const resolved = await resolve(formData);
  if ("error" in resolved) return resolved.error;

  await clearActiveSchema(resolved.workspace.id, resolved.endpoint.id);
  refresh(resolved.workspace.slug, resolved.endpoint.publicId);

  return {
    status: "success",
    message:
      "The schema is off. The endpoint still accepts everything posted to it, and every version you saved is still here.",
  };
}

// ---------------------------------------------------------------------------
// Getting a schema from somewhere else
// ---------------------------------------------------------------------------

/**
 * Import from pasted markup.
 *
 * Nothing is written. The candidates go back to the browser, somebody picks
 * one, and it lands in the editor as an unsaved draft — because an import is a
 * reading of somebody's markup, and a reading that publishes itself is how an
 * endpoint starts validating against a guess.
 */
export async function importHtmlAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const access = await requireMember(String(formData.get("slug") ?? ""));
  if ("error" in access) return failedImport(access.error.message);

  const html = String(formData.get("html") ?? "");
  if (html.trim() === "") {
    return failedImport("Paste the markup for your form first.");
  }

  const result = importSchemaFromHtml(html);
  return describeImport(result.forms, result.notes.map((note) => note.message), null);
}

/**
 * Import from a URL.
 *
 * This one fetches, so it runs on the server and only on the server —
 * `assertFetchable` in `import-url.ts` is the guard that keeps our machine from
 * being used to probe a private network, and it cannot do its job from a
 * browser.
 */
export async function importUrlAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const access = await requireMember(String(formData.get("slug") ?? ""));
  if ("error" in access) return failedImport(access.error.message);

  const url = String(formData.get("url") ?? "").trim();
  if (url === "") return failedImport("Give us the address of the page your form is on.");

  try {
    const result = await importSchemaFromUrl(url);
    return describeImport(
      result.forms,
      result.notes.map((note) => note.message),
      result.resolvedUrl,
    );
  } catch (error) {
    if (error instanceof HtmlFetchError) return failedImport(error.message);
    if (error instanceof TypeError) {
      return failedImport(
        "That page could not be fetched. Check the address, or paste the markup instead.",
      );
    }
    throw error;
  }
}

/**
 * Propose a schema from what this endpoint has already received.
 *
 * The third producer in `src/lib/schema/index.ts`, and the one with the
 * strongest claim on an endpoint that has been running without a schema: it
 * describes the traffic that actually arrived rather than the markup somebody
 * believes is on the page.
 *
 * It proposes and stops. `publishSchemaVersion` refuses an `inferred` source
 * without a user id for exactly this reason, and what the builder does with the
 * proposal is put it in the editor for a person to read.
 */
export async function proposeFromSubmissionsAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const access = await requireMember(String(formData.get("slug") ?? ""));
  if ("error" in access) return failedImport(access.error.message);

  const publicId = String(formData.get("publicId") ?? "");
  const endpoint = await getEndpointByPublicId(access.workspace.id, publicId);
  if (!endpoint) return failedImport(MESSAGES.gone);

  const result = await proposeSchemaFromSubmissions(access.workspace.id, endpoint.id);

  const seen = plural(result.observed, "submission");

  if (result.document.fields.length === 0) {
    return failedImport(
      `Nothing could be proposed from ${seen}. Import your markup or start from scratch instead.`,
    );
  }

  // `ready: false` means there were fewer submissions than inference will
  // stand behind. The proposal is still shown — it is the best evidence this
  // endpoint has — but the sentence has to say how thin it is, because the
  // person reading it is about to decide what their form *is*.
  const caveat = result.ready
    ? "Read it before you publish it: it describes what arrived, not what you meant."
    : `Only ${seen} — fewer than the ${result.minimum} this needs to be confident. Treat it as a starting point and check every field.`;

  return {
    status: "success",
    message: `Proposed ${plural(result.document.fields.length, "field")} from ${seen}. ${caveat}`,
    notes: result.notes,
    candidates: [
      {
        id: "inferred",
        label: "Proposed from submissions",
        action: null,
        fieldCount: result.document.fields.length,
        document: result.document,
        notes: [],
      },
    ],
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function failedImport(message: string): ImportActionState {
  return { status: "error", message, candidates: [], notes: [] };
}

function describeImport(
  forms: {
    action: string | null;
    id: string | null;
    name: string | null;
    document: { fields: unknown[] };
    notes: { message: string }[];
  }[],
  notes: string[],
  resolvedUrl: string | null,
): ImportActionState {
  if (forms.length === 0) {
    return {
      status: "error",
      message:
        "No submittable fields were found. If the form is drawn by JavaScript, copy the markup out of the browser's element inspector rather than from the page source.",
      candidates: [],
      notes,
    };
  }

  const candidates: ImportCandidate[] = forms.map((form, index) => ({
    id: `import-${index}`,
    label: form.id ?? form.name ?? form.action ?? `Form ${index + 1}`,
    action: form.action,
    fieldCount: form.document.fields.length,
    document: form.document as ImportCandidate["document"],
    notes: form.notes.map((note) => note.message),
  }));

  const found =
    forms.length === 1
      ? `Found one form with ${candidates[0].fieldCount} field${candidates[0].fieldCount === 1 ? "" : "s"}.`
      : `Found ${forms.length} forms. Pick the one whose action matches this endpoint.`;

  return {
    status: "success",
    message: resolvedUrl === null ? found : `${found} Read from ${resolvedUrl}.`,
    candidates,
    notes,
  };
}

function storeMessage(error: unknown): string {
  if (error instanceof SchemaStoreError) {
    if (error.code === "endpoint_not_found") return MESSAGES.gone;
    if (error.code === "version_not_found") {
      return "That version does not belong to this endpoint.";
    }
    return error.message;
  }
  throw error;
}
