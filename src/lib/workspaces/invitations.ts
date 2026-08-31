import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

// Relative imports for the same reason as `./queries.ts`: this module is loaded
// directly by `tests/workspace-access.test.mts`.
import { unsafeDb } from "../../db/client.ts";
import {
  invitations,
  memberships,
  newId,
  users,
  withWorkspace,
  workspaces,
} from "../../db/index.ts";
import type { InvitationPreview, MembershipRole, PendingInvitation } from "./types.ts";

export type { InvitationPreview, PendingInvitation };

/**
 * Invitations.
 *
 * Someone with an email address is invited to a workspace and gets a link. The
 * link carries a random token; the database stores only its SHA-256 hash, so a
 * dump of the `invitations` table cannot be redeemed. That is the same reason
 * Auth.js hashes its magic-link tokens, and for the same threat.
 *
 * Redemption is the one operation here that starts outside a workspace, because
 * the token is what names the workspace. It reads the invitation row unscoped —
 * legitimate for the same reason `listWorkspacesForUser` is — and then does
 * every write inside `withWorkspace` on the id the invitation carries.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 32 bytes, base64url. Long enough that guessing is not a threat model. */
function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Compares two hashes without leaking where they diverge.
 *
 * The lookup is by hash so the database does the matching, and this only guards
 * the re-check after the row is read. Cheap, and it means no part of the path
 * compares secrets with `===`.
 */
function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function normalizeEmail(input: unknown): string {
  return String(input ?? "")
    .trim()
    .toLowerCase();
}

export async function listPendingInvitations(
  workspaceId: string,
): Promise<PendingInvitation[]> {
  return withWorkspace(workspaceId, async (ws) => {
    const inviter = users;
    return ws.tx
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        createdAt: invitations.createdAt,
        expiresAt: invitations.expiresAt,
        invitedByEmail: inviter.email,
      })
      .from(invitations)
      .leftJoin(inviter, eq(invitations.invitedByUserId, inviter.id))
      .where(
        ws.where(
          invitations,
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .orderBy(desc(invitations.createdAt));
  });
}

export type InviteResult =
  | { ok: true; token: string; email: string }
  | { ok: false; reason: "already-a-member" | "already-invited" };

/**
 * Invites an email address to a workspace.
 *
 * Returns the raw token exactly once — the caller builds the URL from it and it
 * is never readable again. In development the caller logs it; when email
 * transport exists (#41) the caller sends it.
 */
export async function inviteToWorkspace(input: {
  workspaceId: string;
  email: string;
  role: MembershipRole;
  invitedByUserId: string;
}): Promise<InviteResult> {
  const email = normalizeEmail(input.email);
  const token = newInviteToken();

  return withWorkspace(input.workspaceId, async (ws) => {
    // Inviting someone who is already here should say so rather than sending a
    // link that resolves to "you are already a member".
    const [existing] = await ws.tx
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(ws.where(memberships, eq(users.email, email)))
      .limit(1);

    if (existing) return { ok: false, reason: "already-a-member" as const };

    try {
      await ws.tx.insert(invitations).values({
        id: newId(),
        workspaceId: input.workspaceId,
        email,
        role: input.role,
        tokenHash: hashToken(token),
        invitedByUserId: input.invitedByUserId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });
    } catch (error) {
      // The partial unique index on (workspace_id, email) where the invitation
      // is neither accepted nor revoked.
      if (isUniqueViolation(error)) return { ok: false, reason: "already-invited" as const };
      throw error;
    }

    return { ok: true, token, email };
  });
}

/** Withdraws a pending invitation. Returns false when there was nothing to withdraw. */
export async function revokeInvitation(
  workspaceId: string,
  invitationId: string,
): Promise<boolean> {
  return withWorkspace(workspaceId, async (ws) => {
    const revoked = await ws.tx
      .update(invitations)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        ws.where(
          invitations,
          and(
            eq(invitations.id, invitationId),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
          ),
        ),
      )
      .returning({ id: invitations.id });

    return revoked.length > 0;
  });
}

/**
 * Looks up an invitation by its raw token.
 *
 * Unscoped, by necessity: the token is what tells us which workspace this is.
 * Every state that is not "live" collapses to null, so a used, revoked, expired
 * or fabricated token are indistinguishable from outside — there is nothing to
 * learn by trying tokens.
 */
export async function findLiveInvitation(token: string): Promise<InvitationPreview | null> {
  const tokenHash = hashToken(token);

  const [row] = await unsafeDb
    .select({
      invitationId: invitations.id,
      workspaceId: invitations.workspaceId,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      email: invitations.email,
      role: invitations.role,
      tokenHash: invitations.tokenHash,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .innerJoin(workspaces, eq(invitations.workspaceId, workspaces.id))
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  if (!hashesMatch(row.tokenHash, tokenHash)) return null;
  if (row.acceptedAt || row.revokedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  return {
    invitationId: row.invitationId,
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    workspaceSlug: row.workspaceSlug,
    email: row.email,
    role: row.role,
  };
}

export type AcceptResult =
  | { ok: true; slug: string; alreadyMember: boolean }
  | { ok: false; reason: "invalid" };

/**
 * Redeems an invitation for the signed-in user.
 *
 * The token, not the email address, is the authorisation. The invited address
 * and the address someone signed in with often differ — an alias, a personal
 * account, a shared inbox — and refusing on that mismatch turns a working invite
 * into a support ticket. Whoever holds the link was given it deliberately.
 *
 * Re-validated inside the transaction with a conditional `UPDATE ... RETURNING`,
 * so two clicks on the same link race to one row and only one of them wins. The
 * membership is created only if that update took effect.
 */
export async function acceptInvitation(
  token: string,
  userId: string,
): Promise<AcceptResult> {
  const preview = await findLiveInvitation(token);
  if (!preview) return { ok: false, reason: "invalid" };

  return withWorkspace(preview.workspaceId, async (ws) => {
    const [existing] = await ws.tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(ws.where(memberships, eq(memberships.userId, userId)))
      .limit(1);

    const claimed = await ws.tx
      .update(invitations)
      .set({ acceptedAt: new Date(), acceptedByUserId: userId, updatedAt: new Date() })
      .where(
        ws.where(
          invitations,
          and(
            eq(invitations.id, preview.invitationId),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            sql`${invitations.expiresAt} > now()`,
          ),
        ),
      )
      .returning({ id: invitations.id });

    if (claimed.length === 0) {
      // Someone else won the race, or it was revoked between the read and here.
      // An existing member is still where they wanted to be, so say so.
      return existing
        ? { ok: true as const, slug: preview.workspaceSlug, alreadyMember: true }
        : { ok: false as const, reason: "invalid" as const };
    }

    if (!existing) {
      await ws.tx.insert(memberships).values({
        id: newId(),
        workspaceId: preview.workspaceId,
        userId,
        role: preview.role,
      });
    }

    return {
      ok: true as const,
      slug: preview.workspaceSlug,
      alreadyMember: Boolean(existing),
    };
  });
}

/** Postgres 23505, down a wrapped-error chain. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
