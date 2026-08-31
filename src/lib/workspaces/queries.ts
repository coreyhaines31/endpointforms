import { and, asc, eq, isNull, sql } from "drizzle-orm";

// Relative, extension-bearing imports rather than the `@/` alias, matching
// `src/db/`. The alias is a bundler feature; plain `node` does not resolve it,
// and `tests/workspace-access.test.mts` has to be able to load this module —
// the point of that test is to exercise the real thing rather than a copy of it.
import { unsafeDb } from "../../db/client.ts";
import {
  endpoints,
  memberships,
  newId,
  users,
  withWorkspace,
  workspaces,
} from "../../db/index.ts";
import type {
  EndpointSummary,
  Member,
  WorkspaceAccess,
  WorkspaceSummary,
} from "./types.ts";

export type { EndpointSummary, Member, WorkspaceAccess, WorkspaceSummary };

/**
 * Reading and writing the tenant boundary.
 *
 * The rule this file exists to enforce: **anything that touches a
 * workspace-scoped table goes through `withWorkspace()`.** Not "usually" — the
 * one exception is the query that decides which workspace you are in, which by
 * definition cannot already be scoped to one, and it is `listWorkspacesForUser`
 * below.
 *
 * `workspaces` itself is deliberately not a workspace-scoped table: it *is* the
 * tenant, it holds no customer data, and a policy on it would make resolving a
 * slug into an id impossible without first knowing the id. Membership — which is
 * the actual authorisation decision — is checked inside a scoped transaction
 * every time.
 */

/**
 * Every workspace this user belongs to.
 *
 * Unscoped by necessity: "which tenant is this request in?" is the question that
 * runs before a tenant is known. `docs/21-data-model.md` names this as one of
 * the three legitimate callers of `unsafeDb`, alongside migrations and the seed.
 * The filter is on `user_id`, which is the session's, so it can only ever return
 * this person's own memberships.
 */
export async function listWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]> {
  return unsafeDb
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(workspaces.name));
}

/**
 * Resolves a slug to a workspace **this user is a member of**, or null.
 *
 * Null covers both "no such workspace" and "not yours", and callers turn both
 * into the same 404. Distinguishing them would confirm to a stranger that
 * `acme` exists, which is a free customer list.
 *
 * The membership lookup runs inside `withWorkspace`, so it is protected twice:
 * the predicate filters on the workspace, and row-level security makes any other
 * workspace's membership rows invisible for the duration.
 */
export async function getWorkspaceAccess(
  slug: string,
  userId: string,
): Promise<WorkspaceAccess | null> {
  const [workspace] = await unsafeDb
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (!workspace) return null;

  const role = await withWorkspace(workspace.id, async (ws) => {
    const [membership] = await ws.tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(ws.where(memberships, eq(memberships.userId, userId)))
      .limit(1);
    return membership?.role ?? null;
  });

  if (!role) return null;

  return { workspace, role };
}

export type CreateWorkspaceResult =
  | { ok: true; slug: string }
  | { ok: false; reason: "slug-taken" };

/**
 * Creates a workspace and makes the creator its owner.
 *
 * The whole thing runs inside one `withWorkspace` transaction on the id we are
 * about to use. That reads oddly at first — scoping to a workspace that does not
 * exist yet — but it is the strongest version available: `workspaces` has no
 * policy so the insert is allowed, and the membership insert is then checked by
 * the policy's `WITH CHECK` clause against the same id. A typo that stamped the
 * membership with a different workspace would be rejected by Postgres rather
 * than creating a membership in someone else's tenant.
 */
export async function createWorkspace(input: {
  slug: string;
  name: string;
  userId: string;
}): Promise<CreateWorkspaceResult> {
  const workspaceId = newId();

  try {
    await withWorkspace(workspaceId, async (ws) => {
      await ws.tx.insert(workspaces).values({
        id: workspaceId,
        slug: input.slug,
        name: input.name,
      });

      await ws.tx.insert(memberships).values({
        id: newId(),
        workspaceId,
        userId: input.userId,
        role: "owner",
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "slug-taken" };
    throw error;
  }

  return { ok: true, slug: input.slug };
}

/** Renames a workspace. The slug is not renameable — see `./slug.ts` for why. */
export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  await withWorkspace(workspaceId, async (ws) => {
    await ws.tx
      .update(workspaces)
      .set({ name, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));
  });
}

export async function listMembers(workspaceId: string): Promise<Member[]> {
  return withWorkspace(workspaceId, async (ws) =>
    ws.tx
      .select({
        membershipId: memberships.id,
        userId: users.id,
        email: users.email,
        name: users.name,
        role: memberships.role,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(ws.where(memberships))
      .orderBy(asc(memberships.createdAt)),
  );
}

export type RemoveMemberResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "last-owner" };

/**
 * Removes someone from a workspace.
 *
 * Refuses to remove the last owner. A workspace with no owner cannot invite,
 * rename or be deleted by anyone, and recovering one is a support ticket that
 * has to be answered by hand in the database.
 */
export async function removeMember(
  workspaceId: string,
  membershipId: string,
): Promise<RemoveMemberResult> {
  return withWorkspace(workspaceId, async (ws) => {
    const [target] = await ws.tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(ws.where(memberships, eq(memberships.id, membershipId)))
      .limit(1);

    if (!target) return { ok: false, reason: "not-found" };

    if (target.role === "owner") {
      const [owners] = await ws.tx
        .select({ n: sql<number>`count(*)::int` })
        .from(memberships)
        .where(ws.where(memberships, eq(memberships.role, "owner")));

      if (owners.n <= 1) return { ok: false, reason: "last-owner" };
    }

    await ws.tx.delete(memberships).where(ws.where(memberships, eq(memberships.id, membershipId)));

    return { ok: true };
  });
}

/**
 * The workspace's endpoints.
 *
 * Endpoint management itself is #50 and belongs to someone else; this read
 * exists so the workspace page has something real on it and so
 * `tests/workspace-access.test.mts` has a workspace-scoped table to prove the
 * boundary against.
 */
export async function listEndpoints(workspaceId: string): Promise<EndpointSummary[]> {
  return withWorkspace(workspaceId, async (ws) =>
    ws.tx
      .select({
        id: endpoints.id,
        publicId: endpoints.publicId,
        name: endpoints.name,
        createdAt: endpoints.createdAt,
      })
      .from(endpoints)
      .where(ws.where(endpoints))
      .orderBy(asc(endpoints.createdAt)),
  );
}

/** Renames one endpoint. Returns false when it is not this workspace's to rename. */
export async function renameEndpoint(
  workspaceId: string,
  endpointId: string,
  name: string,
): Promise<boolean> {
  return withWorkspace(workspaceId, async (ws) => {
    const updated = await ws.tx
      .update(endpoints)
      .set({ name, updatedAt: new Date() })
      .where(ws.where(endpoints, eq(endpoints.id, endpointId)))
      .returning({ id: endpoints.id });

    return updated.length > 0;
  });
}

/** Soft-deletes one endpoint. Returns false when it is not this workspace's. */
export async function deleteEndpoint(
  workspaceId: string,
  endpointId: string,
): Promise<boolean> {
  return withWorkspace(workspaceId, async (ws) => {
    const deleted = await ws.tx
      .update(endpoints)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        ws.where(endpoints, and(eq(endpoints.id, endpointId), isNull(endpoints.deletedAt))),
      )
      .returning({ id: endpoints.id });

    return deleted.length > 0;
  });
}

/** Postgres 23505. Drizzle wraps driver errors, so the code is down the cause chain. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
