"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formError, formSuccess, type FormState } from "@/actions/form-state";
import { requireMember } from "@/actions/guards";
import { requireUser } from "@/lib/auth/session";
import { hashIp } from "@/lib/ingest/client";
import {
  addSpamListEntry,
  removeSpamListEntry,
  reviewSubmissionSpam,
  saveSpamPolicy,
} from "@/lib/spam/review";
import { DEFAULT_SPAM_POLICY } from "@/lib/spam/assess";

/**
 * Spam review and configuration (#31).
 *
 * Same rule as every other action here: the slug comes from the form, the
 * workspace id comes from a membership check, and nothing in between accepts an
 * id. Rows are addressed by their public ID, so one belonging to another
 * workspace matches nothing and gets the same sentence as one that never
 * existed.
 *
 * **There is no delete action in this file, and there will not be one.** The
 * binding constraint on #31 is that a submission is never lost to a heuristic.
 * "Mark as spam" records a judgement; it does not remove a row, hide it from
 * exports, or take it out of the count. Removing a submission is the ordinary
 * delete on the submission itself, done deliberately by a person who meant it.
 */

const MESSAGES = {
  gone: "That submission is no longer here.",
  endpointGone: "That endpoint is no longer here.",
  emptyValue: "Type something to add to the list.",
  badIp: "That doesn’t look like an IP address.",
  badDomain: "That doesn’t look like a domain — try something like acme.com.",
  keywordTooShort: "A keyword needs at least three characters. Anything shorter matches half your inbox.",
  badThreshold: "The threshold has to be a whole number between 1 and 50.",
} as const;

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

/**
 * The undo. One click, permanent, and it never has to be found in a settings
 * screen — it lives on the submission a person is already looking at.
 */
export async function markNotSpamAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return review(formData, "not_spam", "Unflagged. This one is no longer marked as spam.");
}

export async function markSpamAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return review(
    formData,
    "confirmed_spam",
    "Marked as spam. The submission is kept — this records your judgement, it does not delete anything.",
  );
}

async function review(
  formData: FormData,
  outcome: "not_spam" | "confirmed_spam",
  message: string,
): Promise<FormState> {
  const slug = String(formData.get("slug") ?? "");
  const access = await requireMember(slug);
  if ("error" in access) return access.error;

  const user = await requireUser();
  const publicId = String(formData.get("publicId") ?? "");

  const done = await reviewSubmissionSpam(access.workspace.id, publicId, outcome, user.id);
  if (!done) return formError(MESSAGES.gone);

  revalidatePath(`/app/${access.workspace.slug}/submissions`);
  revalidatePath(`/app/${access.workspace.slug}/submissions/${publicId}`);
  return formSuccess(message);
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/);

/** Both families, loosely. The value is only ever hashed and compared. */
const ipSchema = z
  .string()
  .trim()
  .min(3)
  .max(45)
  .regex(/^[0-9a-fA-F:.]+$/);

const keywordSchema = z.string().trim().min(3).max(120);

export async function addSpamListEntryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await requireMember(String(formData.get("slug") ?? ""));
  if ("error" in access) return access.error;

  const user = await requireUser();
  const kind = String(formData.get("kind") ?? "");
  const effect = String(formData.get("effect") ?? "");
  const raw = String(formData.get("value") ?? "").trim();

  if (raw === "") return formError(MESSAGES.emptyValue);
  if (kind !== "ip" && kind !== "email_domain" && kind !== "keyword") {
    return formError(MESSAGES.emptyValue);
  }
  if (effect !== "block" && effect !== "allow") return formError(MESSAGES.emptyValue);
  // There is no allow-keyword. "Never flag anything containing 'pricing'" has a
  // blast radius nobody can predict; the allow side stays precise.
  if (kind === "keyword" && effect === "allow") return formError(MESSAGES.emptyValue);

  if (kind === "ip") {
    if (!ipSchema.safeParse(raw).success) return formError(MESSAGES.badIp);
    // Stored as the hash, matching `submissions.ip_hash`, so a raw address is
    // never written down. `label` keeps what was typed so the list is legible.
    const hashed = hashIp(raw);
    if (!hashed) return formError(MESSAGES.badIp);
    await addSpamListEntry({
      workspaceId: access.workspace.id,
      kind,
      effect,
      value: hashed,
      label: raw,
      createdByUserId: user.id,
    });
  } else if (kind === "email_domain") {
    const domain = domainSchema.safeParse(raw.replace(/^@/, ""));
    if (!domain.success) return formError(MESSAGES.badDomain);
    await addSpamListEntry({
      workspaceId: access.workspace.id,
      kind,
      effect,
      value: domain.data,
      label: domain.data,
      createdByUserId: user.id,
    });
  } else {
    const keyword = keywordSchema.safeParse(raw);
    if (!keyword.success) return formError(MESSAGES.keywordTooShort);
    await addSpamListEntry({
      workspaceId: access.workspace.id,
      kind,
      effect,
      value: keyword.data.toLowerCase(),
      label: keyword.data,
      createdByUserId: user.id,
    });
  }

  revalidatePath(`/app/${access.workspace.slug}/settings`);
  return formSuccess(
    effect === "allow"
      ? "Added. Anything matching this is cleared without being scored."
      : "Added. Anything matching this is flagged — and still stored, exported and visible.",
  );
}

export async function removeSpamListEntryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await requireMember(String(formData.get("slug") ?? ""));
  if ("error" in access) return access.error;

  const id = String(formData.get("id") ?? "");
  const removed = await removeSpamListEntry(access.workspace.id, id);
  if (!removed) return formError("That entry is no longer here.");

  revalidatePath(`/app/${access.workspace.slug}/settings`);
  return formSuccess("Removed.");
}

// ---------------------------------------------------------------------------
// Per-endpoint policy
// ---------------------------------------------------------------------------

export async function saveSpamPolicyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await requireMember(String(formData.get("slug") ?? ""));
  if ("error" in access) return access.error;

  const threshold = Number.parseInt(
    String(formData.get("threshold") ?? DEFAULT_SPAM_POLICY.threshold),
    10,
  );
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 50) {
    return formError(MESSAGES.badThreshold);
  }

  const on = (name: string) => formData.get(name) === "on";
  const honeypotField = String(formData.get("honeypotField") ?? "").trim();

  const saved = await saveSpamPolicy(
    access.workspace.id,
    String(formData.get("publicId") ?? ""),
    {
      enabled: on("enabled"),
      honeypot: on("honeypot"),
      timing: on("timing"),
      duplicate: on("duplicate"),
      velocity: on("velocity"),
      content: on("content"),
      disposableEmail: on("disposableEmail"),
      threshold,
      honeypotField: honeypotField === "" ? null : honeypotField,
    },
  );
  if (!saved) return formError(MESSAGES.endpointGone);

  revalidatePath(`/app/${access.workspace.slug}/endpoints/${String(formData.get("publicId") ?? "")}`);
  return formSuccess("Saved. It may take up to 30 seconds to take effect on every server.");
}
