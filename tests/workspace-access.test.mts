/**
 * The workspace boundary, as the application code actually enforces it (#34).
 *
 * `tenant-isolation.test.mts` proves the *data layer* holds: `ws.where()`
 * filters, and row-level security makes another tenant's rows invisible even to
 * a query with no predicate. This file proves the layer above it — the functions
 * pages and Server Actions call — never gets a chance to hand one workspace's
 * data to a member of another.
 *
 * It imports the real modules from `src/lib/workspaces/` rather than
 * reimplementing their queries. A test that rewrites the code it is testing
 * proves the test author's version is safe and nothing else, which is why those
 * modules use relative imports and carry no `server-only` marker (the guard that
 * marker provided is now an ESLint rule — see `eslint.config.mjs`).
 *
 * Two workspaces, two people, one endpoint each:
 *
 *   alpha  ← owned by user A
 *   beta   ← owned by user B
 *
 * Every assertion is "A tries something against beta".
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */
import { eq, sql } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { dbTarget, describeDatabase } from "../src/db/env.ts";
import { newEndpointPublicId, newId } from "../src/db/ids.ts";
import { endpoints, invitations, memberships, users, workspaces } from "../src/db/schema.ts";
import {
  acceptInvitation,
  findLiveInvitation,
  inviteToWorkspace,
  listPendingInvitations,
  revokeInvitation,
} from "../src/lib/workspaces/invitations.ts";
import {
  createWorkspace,
  deleteEndpoint,
  getWorkspaceAccess,
  listEndpoints,
  listMembers,
  listWorkspacesForUser,
  removeMember,
  renameEndpoint,
} from "../src/lib/workspaces/queries.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok)
    console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

const SLUGS = ["access-test-alpha", "access-test-beta", "access-test-created"];
const EMAILS = [
  "a@access.test",
  "b@access.test",
  "c@access.test",
  "invitee@access.test",
];

type Fixture = {
  workspaceId: string;
  slug: string;
  userId: string;
  membershipId: string;
  endpointId: string;
};

async function cleanup() {
  for (const slug of SLUGS) {
    await unsafeDb.delete(workspaces).where(eq(workspaces.slug, slug));
  }
  for (const email of EMAILS) {
    await unsafeDb.delete(users).where(eq(users.email, email));
  }
}

async function createFixture(index: number): Promise<Fixture> {
  const f: Fixture = {
    workspaceId: newId(),
    slug: SLUGS[index],
    userId: newId(),
    membershipId: newId(),
    endpointId: newId(),
  };

  await unsafeDb
    .insert(workspaces)
    .values({ id: f.workspaceId, slug: f.slug, name: f.slug });
  await unsafeDb.insert(users).values({ id: f.userId, email: EMAILS[index] });
  await unsafeDb.insert(memberships).values({
    id: f.membershipId,
    workspaceId: f.workspaceId,
    userId: f.userId,
    role: "owner",
  });
  await unsafeDb.insert(endpoints).values({
    id: f.endpointId,
    workspaceId: f.workspaceId,
    publicId: newEndpointPublicId(),
    name: `${f.slug} endpoint`,
  });

  return f;
}

/** Same skip rule as the isolation test: only when nobody configured a database. */
async function databaseIsReachable(): Promise<boolean> {
  try {
    await unsafeDb.execute(sql`select 1`);
    return true;
  } catch (error) {
    if (dbTarget() !== "local" || process.env.DATABASE_URL) throw error;
    console.log("\n" + "=".repeat(72));
    console.log("SKIPPED — workspace access tests did not run.");
    console.log("No DATABASE_URL is set and the local database is not reachable.");
    console.log("Start it with:  npm run db:up && npm run db:migrate");
    console.log("=".repeat(72) + "\n");
    return false;
  }
}

async function main() {
  if (!(await databaseIsReachable())) return;

  console.log(`\ntesting against ${describeDatabase()}`);

  await cleanup();
  const alpha = await createFixture(0);
  const beta = await createFixture(1);

  // -------------------------------------------------------------------------
  console.log("\nresolving a workspace — membership is the whole authorisation");
  // -------------------------------------------------------------------------
  {
    const own = await getWorkspaceAccess(alpha.slug, alpha.userId);
    t("A resolves their own workspace", own?.workspace.id, alpha.workspaceId);
    t("...as its owner", own?.role, "owner");

    // The bug this is guarding against: resolving the slug from the URL and
    // trusting it, because the workspace obviously exists.
    const theirs = await getWorkspaceAccess(beta.slug, alpha.userId);
    t("A cannot resolve beta by slug", theirs, null);

    const missing = await getWorkspaceAccess("no-such-workspace", alpha.userId);
    t(
      "a workspace that does not exist is indistinguishable from one that isn't yours",
      missing,
      theirs,
    );

    const mine = await listWorkspacesForUser(alpha.userId);
    t("A's workspace list holds only A's workspaces", mine.map((w) => w.slug), [alpha.slug]);
  }

  // -------------------------------------------------------------------------
  console.log("\nreading — A cannot see beta's endpoints");
  // -------------------------------------------------------------------------
  {
    const own = await listEndpoints(alpha.workspaceId);
    t("alpha's endpoints are alpha's", own.map((e) => e.id), [alpha.endpointId]);

    // The dangerous case is not "A calls listEndpoints(beta)" — A cannot get
    // beta's id through any supported path. It is a workspace id that reached
    // the call from somewhere it should not have. Even then, the endpoint list
    // is the *other* workspace's rows only, never a mixture, and A's page will
    // never have been given that id: `getWorkspaceAccess` above returned null.
    const forced = await listEndpoints(beta.workspaceId);
    t(
      "a forced id returns only that workspace's rows, never a mixture",
      forced.map((e) => e.id),
      [beta.endpointId],
    );

    const members = await listMembers(alpha.workspaceId);
    t("alpha's member list holds only alpha's members", members.map((m) => m.email), [
      EMAILS[0],
    ]);
  }

  // -------------------------------------------------------------------------
  console.log("\nwriting — A's workspace scope cannot reach beta's endpoint");
  // -------------------------------------------------------------------------
  {
    // This is the realistic attack: A is signed in, A's workspace id is correct,
    // and the endpoint id in the form was swapped for one belonging to beta.
    const renamed = await renameEndpoint(alpha.workspaceId, beta.endpointId, "owned");
    t("rename of beta's endpoint from alpha's scope is refused", renamed, false);

    const [betaEndpoint] = await unsafeDb
      .select({ name: endpoints.name, deletedAt: endpoints.deletedAt })
      .from(endpoints)
      .where(eq(endpoints.id, beta.endpointId));
    t("...and beta's endpoint is untouched", betaEndpoint?.name, `${beta.slug} endpoint`);

    const deleted = await deleteEndpoint(alpha.workspaceId, beta.endpointId);
    t("delete of beta's endpoint from alpha's scope is refused", deleted, false);

    const [stillThere] = await unsafeDb
      .select({ deletedAt: endpoints.deletedAt })
      .from(endpoints)
      .where(eq(endpoints.id, beta.endpointId));
    t("...and beta's endpoint is still not deleted", stillThere?.deletedAt, null);

    // The same operations against A's own endpoint must work, or the assertions
    // above would pass for a function that simply never does anything.
    t(
      "the same rename against alpha's own endpoint succeeds",
      await renameEndpoint(alpha.workspaceId, alpha.endpointId, "renamed"),
      true,
    );
    t(
      "the same delete against alpha's own endpoint succeeds",
      await deleteEndpoint(alpha.workspaceId, alpha.endpointId),
      true,
    );
    const afterDelete = await listEndpoints(alpha.workspaceId);
    t("a soft-deleted endpoint drops out of the list", afterDelete.length, 0);
  }

  // -------------------------------------------------------------------------
  console.log("\nmembership — A cannot remove beta's owner");
  // -------------------------------------------------------------------------
  {
    const removed = await removeMember(alpha.workspaceId, beta.membershipId);
    t("removing beta's membership from alpha's scope is refused", removed, {
      ok: false,
      reason: "not-found",
    });

    const [stillMember] = await unsafeDb
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.id, beta.membershipId));
    t("...and B is still a member of beta", Boolean(stillMember), true);

    const lastOwner = await removeMember(alpha.workspaceId, alpha.membershipId);
    t("a workspace refuses to lose its last owner", lastOwner, {
      ok: false,
      reason: "last-owner",
    });
  }

  // -------------------------------------------------------------------------
  console.log("\ncreating a workspace — the creator becomes its owner, atomically");
  // -------------------------------------------------------------------------
  {
    const created = await createWorkspace({
      slug: SLUGS[2],
      name: "Created",
      userId: alpha.userId,
    });
    t("created", created, { ok: true, slug: SLUGS[2] });

    const access = await getWorkspaceAccess(SLUGS[2], alpha.userId);
    t("the creator is an owner of it", access?.role, "owner");
    t("and B is not", await getWorkspaceAccess(SLUGS[2], beta.userId), null);

    const taken = await createWorkspace({
      slug: SLUGS[2],
      name: "Duplicate",
      userId: beta.userId,
    });
    t("a taken slug is refused rather than throwing", taken, {
      ok: false,
      reason: "slug-taken",
    });
  }

  // -------------------------------------------------------------------------
  console.log("\ninvitations — a token joins exactly one workspace, exactly once");
  // -------------------------------------------------------------------------
  {
    const invitee = { id: newId(), email: EMAILS[3] };
    await unsafeDb.insert(users).values(invitee);

    const invite = await inviteToWorkspace({
      workspaceId: alpha.workspaceId,
      email: invitee.email,
      role: "member",
      invitedByUserId: alpha.userId,
    });
    t("an owner can invite", invite.ok, true);
    if (!invite.ok) throw new Error("invitation was not created");

    // Only the hash is stored. A database dump must not be redeemable.
    const [row] = await unsafeDb
      .select({ tokenHash: invitations.tokenHash })
      .from(invitations)
      .where(eq(invitations.workspaceId, alpha.workspaceId));
    t("the raw token is not in the database", row.tokenHash === invite.token, false);
    t("what is stored is a sha256 hex digest", /^[0-9a-f]{64}$/.test(row.tokenHash), true);

    // beta's owner must not be able to see or withdraw alpha's invitation.
    t(
      "alpha's pending invitation is invisible from beta's scope",
      (await listPendingInvitations(beta.workspaceId)).length,
      0,
    );
    t(
      "and cannot be withdrawn from beta's scope",
      await revokeInvitation(beta.workspaceId, (await listPendingInvitations(alpha.workspaceId))[0].id),
      false,
    );

    const preview = await findLiveInvitation(invite.token);
    t("the token names alpha and only alpha", preview?.workspaceId, alpha.workspaceId);
    t("a fabricated token resolves to nothing", await findLiveInvitation("not-a-token"), null);

    const accepted = await acceptInvitation(invite.token, invitee.id);
    t("accepting joins the workspace", accepted, {
      ok: true,
      slug: alpha.slug,
      alreadyMember: false,
    });
    t(
      "the invitee is now a member of alpha",
      (await getWorkspaceAccess(alpha.slug, invitee.id))?.role,
      "member",
    );
    t("...and of nothing else", await getWorkspaceAccess(beta.slug, invitee.id), null);

    // A link that has already been redeemed is spent. Replaying it must not
    // create a second membership or resurrect the invitation.
    const replay = await acceptInvitation(invite.token, beta.userId);
    t("replaying a spent token is refused", replay, { ok: false, reason: "invalid" });
    t(
      "...and did not add B to alpha",
      await getWorkspaceAccess(alpha.slug, beta.userId),
      null,
    );

    const membershipCount = await unsafeDb
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.workspaceId, alpha.workspaceId));
    t("alpha has exactly two memberships", membershipCount.length, 2);

    // Re-inviting someone who is already in is a message, not a dead link.
    const again = await inviteToWorkspace({
      workspaceId: alpha.workspaceId,
      email: invitee.email,
      role: "member",
      invitedByUserId: alpha.userId,
    });
    t("re-inviting an existing member is refused", again, {
      ok: false,
      reason: "already-a-member",
    });

    // A withdrawn invitation is dead even though its row still exists.
    const second = await inviteToWorkspace({
      workspaceId: alpha.workspaceId,
      email: "someone-else@access.test",
      role: "member",
      invitedByUserId: alpha.userId,
    });
    if (!second.ok) throw new Error("second invitation was not created");
    const pending = await listPendingInvitations(alpha.workspaceId);
    t("it shows as pending", pending.map((p) => p.email), ["someone-else@access.test"]);
    t("an owner can withdraw it", await revokeInvitation(alpha.workspaceId, pending[0].id), true);
    t("a withdrawn token no longer resolves", await findLiveInvitation(second.token), null);
    t(
      "and cannot be accepted",
      await acceptInvitation(second.token, beta.userId),
      { ok: false, reason: "invalid" },
    );

    await unsafeDb.delete(users).where(eq(users.email, "someone-else@access.test"));
  }

  await cleanup();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
