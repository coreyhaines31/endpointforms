import { randomBytes } from "node:crypto";

import { signInWithEmailCode, type CodeUser } from "../auth/email-code.ts";
import { createVerdictApiKey, VerdictKeyError } from "../verdict/key-store.ts";
import { createWorkspace, listWorkspacesForUser } from "../workspaces/queries.ts";
import { suggestSlug, validateWorkspaceSlug } from "../workspaces/slug.ts";
import { ALL_SCOPES, type Scope } from "./scopes.ts";

/**
 * Turning a verified code into something an agent can work with (#128):
 * an account, a workspace, and a key — in one call, with no browser.
 *
 * **Which workspace.** A new account gets a new workspace, named after the
 * company if the agent passed one and after the email's domain if not. An
 * existing account that owns exactly one workspace gets a key for that one. An
 * account that owns several must say which; the code has been spent by then,
 * so the answer lists them and the agent asks for a fresh code. That costs an
 * owner of several workspaces one extra email, which is cheaper than a
 * continuation token with its own expiry and its own way to be stolen.
 *
 * **Members who are not owners get no key.** Keys are an owner's to mint in
 * the web app, and a chat is not a way round that.
 */

/** Domains that say nothing about which company someone works for. */
const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "fastmail.com",
  "hey.com",
  "gmx.com",
  "zoho.com",
]);

export function isPersonalEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return PERSONAL_DOMAINS.has(domain);
}

/**
 * A workspace name when the agent did not give one. `dana@acme.co.uk` →
 * "Acme"; `dana@gmail.com` → "Dana's workspace", because "Gmail" would be a
 * strange thing to call somebody's business.
 */
export function defaultWorkspaceName(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!isPersonalEmail(email) && domain) {
    const label = domain.split(".")[0] ?? "";
    if (label) return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const person = local.split(/[.+_-]/)[0] ?? "";
  return person ? `${person.charAt(0).toUpperCase()}${person.slice(1)}'s workspace` : "My workspace";
}

function slugCandidates(name: string): string[] {
  const base = suggestSlug(name) || "workspace";
  const suffix = () => randomBytes(3).toString("hex");
  return [base, `${base}-${suffix()}`, `${base}-${suffix()}`, `workspace-${suffix()}${suffix()}`]
    .map((slug) => slug.slice(0, 63).replace(/-+$/, ""))
    .filter((slug) => validateWorkspaceSlug(slug).ok);
}

async function createWorkspaceFor(userId: string, name: string): Promise<{ slug: string; name: string }> {
  for (const slug of slugCandidates(name)) {
    const created = await createWorkspace({ slug, name, userId });
    if (created.ok) return { slug: created.slug, name };
  }
  throw new Error("Could not find a free workspace slug after several attempts.");
}

export type CompleteSignupResult =
  | {
      ok: true;
      user: { email: string; created: boolean };
      workspace: { slug: string; name: string; created: boolean };
      apiKey: string;
      scopes: Scope[];
    }
  | { ok: false; reason: "invalid-code" }
  | { ok: false; reason: "choose-workspace"; workspaces: { slug: string; name: string }[] }
  | { ok: false; reason: "not-a-member"; workspace: string }
  | { ok: false; reason: "not-owner"; workspace: string }
  | { ok: false; reason: "too-many-keys"; message: string };

export async function completeSignup(input: {
  email: string;
  code: string;
  workspace?: string | null;
  companyName?: string | null;
  clientName?: string | null;
  now?: Date;
}): Promise<CompleteSignupResult> {
  const signedIn = await signInWithEmailCode({ email: input.email, code: input.code, now: input.now });
  if (!signedIn.ok) return { ok: false, reason: "invalid-code" };

  const target = await chooseWorkspace(signedIn.user, input);
  if (!target.ok) return target;

  try {
    const key = await createVerdictApiKey({
      workspaceId: target.workspaceId,
      label: input.clientName?.trim() ? `Agent key (${input.clientName.trim().slice(0, 60)})` : "Agent key",
      createdByUserId: signedIn.user.id,
      scopes: ALL_SCOPES,
      createdVia: "mcp",
      clientName: input.clientName ?? null,
      now: input.now,
    });

    return {
      ok: true,
      user: { email: signedIn.user.email, created: signedIn.user.created },
      workspace: { slug: target.slug, name: target.name, created: target.created },
      apiKey: key.key,
      scopes: [...ALL_SCOPES],
    };
  } catch (error) {
    if (error instanceof VerdictKeyError && error.code === "too_many_keys") {
      return { ok: false, reason: "too-many-keys", message: error.message };
    }
    throw error;
  }
}

type ChosenWorkspace =
  | { ok: true; workspaceId: string; slug: string; name: string; created: boolean }
  | Extract<CompleteSignupResult, { ok: false }>;

async function chooseWorkspace(
  user: CodeUser,
  input: { workspace?: string | null; companyName?: string | null },
): Promise<ChosenWorkspace> {
  const memberships = await listWorkspacesForUser(user.id);
  const requested = input.workspace?.trim().toLowerCase() || null;

  if (requested) {
    const match = memberships.find((m) => m.slug === requested);
    // "Not a member" covers "does not exist" too, so a code holder cannot use
    // this to find out which slugs are taken.
    if (!match) return { ok: false, reason: "not-a-member", workspace: requested };
    if (match.role !== "owner") return { ok: false, reason: "not-owner", workspace: requested };
    return { ok: true, workspaceId: match.id, slug: match.slug, name: match.name, created: false };
  }

  const owned = memberships.filter((m) => m.role === "owner");
  if (owned.length === 1) {
    const only = owned[0];
    return { ok: true, workspaceId: only.id, slug: only.slug, name: only.name, created: false };
  }
  if (owned.length > 1) {
    return {
      ok: false,
      reason: "choose-workspace",
      workspaces: owned.map((m) => ({ slug: m.slug, name: m.name })),
    };
  }
  if (memberships.length > 0) {
    // A member of their company's workspace but an owner of nothing. Creating
    // them a second workspace is how a company ends up with five.
    return { ok: false, reason: "not-owner", workspace: memberships[0].slug };
  }

  const name = input.companyName?.trim().slice(0, 120) || defaultWorkspaceName(user.email);
  const created = await createWorkspaceFor(user.id, name);
  const [fresh] = (await listWorkspacesForUser(user.id)).filter((m) => m.slug === created.slug);
  if (!fresh) throw new Error("A workspace was created but is not listed for its owner.");
  return { ok: true, workspaceId: fresh.id, slug: created.slug, name: created.name, created: true };
}
