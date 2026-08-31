/**
 * Tenant isolation.
 *
 * A cross-tenant leak is the one bug that ends a product like this, so this file
 * is a deliverable rather than a nice-to-have. It asserts three separate things,
 * and each one fails for a different reason:
 *
 *   1. `ws.where(table)` filters to the workspace and hides soft-deleted rows.
 *      Breaking `buildWhere` in src/db/scoped.ts fails these.
 *   2. A query inside `withWorkspace` that has **no where clause at all** still
 *      cannot see another workspace's rows, because row-level security is armed
 *      for the transaction. Dropping the policies, dropping FORCE, or removing
 *      the `set_config` call fails these. This is the important set: the
 *      realistic bug is a forgotten predicate, not a mistyped one.
 *   3. The scope does not leak past the transaction, so a pooled connection
 *      never carries one tenant into the next request.
 *
 * It also asserts that every workspace-scoped table in the schema actually has
 * the policies on it, so adding a table without wiring it up fails here rather
 * than in production.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */
import { and, eq, isNull, sql } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { dbTarget, describeDatabase } from "../src/db/env.ts";
import { newEndpointPublicId, newId, newSubmissionPublicId } from "../src/db/ids.ts";
import {
  withWorkspace,
  workspaceWhere,
  workspaceWhereIncludingDeleted,
} from "../src/db/scoped.ts";
import {
  deliveryAttempts,
  destinations,
  endpoints,
  formSchemas,
  memberships,
  submissions,
  users,
  workspaces,
  workspaceScopedTableNames,
} from "../src/db/schema.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

/** Drizzle wraps driver errors, so the SQLSTATE is somewhere down the cause chain. */
function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

const SLUGS = ["isolation-test-alpha", "isolation-test-beta"];
const EMAILS = ["alpha@isolation.test", "beta@isolation.test"];

type Fixture = {
  workspaceId: string;
  userId: string;
  endpointId: string;
  schemaVersionId: string;
  submissionId: string;
  deletedSubmissionId: string;
  destinationId: string;
  deliveryAttemptId: string;
};

async function cleanup() {
  for (const slug of SLUGS) {
    await unsafeDb.delete(workspaces).where(eq(workspaces.slug, slug));
  }
  for (const email of EMAILS) {
    await unsafeDb.delete(users).where(eq(users.email, email));
  }
}

/** One workspace with a row in every workspace-scoped table. */
async function createFixture(index: number): Promise<Fixture> {
  const f: Fixture = {
    workspaceId: newId(),
    userId: newId(),
    endpointId: newId(),
    schemaVersionId: newId(),
    submissionId: newId(),
    deletedSubmissionId: newId(),
    destinationId: newId(),
    deliveryAttemptId: newId(),
  };

  await unsafeDb
    .insert(workspaces)
    .values({ id: f.workspaceId, slug: SLUGS[index], name: SLUGS[index] });
  await unsafeDb.insert(users).values({ id: f.userId, email: EMAILS[index] });
  await unsafeDb
    .insert(memberships)
    .values({ id: newId(), workspaceId: f.workspaceId, userId: f.userId, role: "owner" });
  await unsafeDb.insert(endpoints).values({
    id: f.endpointId,
    workspaceId: f.workspaceId,
    publicId: newEndpointPublicId(),
    name: `${SLUGS[index]} endpoint`,
  });
  await unsafeDb.insert(formSchemas).values({
    id: f.schemaVersionId,
    workspaceId: f.workspaceId,
    endpointId: f.endpointId,
    version: 1,
    fields: { fields: [] },
    source: "file",
  });
  await unsafeDb.insert(submissions).values([
    {
      id: f.submissionId,
      workspaceId: f.workspaceId,
      endpointId: f.endpointId,
      publicId: newSubmissionPublicId(),
      values: { secret: SLUGS[index] },
    },
    {
      // Soft-deleted, to prove `where` hides it and `whereIncludingDeleted` does not.
      id: f.deletedSubmissionId,
      workspaceId: f.workspaceId,
      endpointId: f.endpointId,
      publicId: newSubmissionPublicId(),
      values: { secret: SLUGS[index] },
      deletedAt: new Date(),
    },
  ]);
  await unsafeDb.insert(destinations).values({
    id: f.destinationId,
    workspaceId: f.workspaceId,
    endpointId: f.endpointId,
    kind: "webhook",
    name: "test",
  });
  await unsafeDb.insert(deliveryAttempts).values({
    id: f.deliveryAttemptId,
    workspaceId: f.workspaceId,
    destinationId: f.destinationId,
    submissionId: f.submissionId,
  });

  return f;
}

/**
 * Returns false if there is no database to test against.
 *
 * Skipping a security test is how a security test quietly dies, so the skip is
 * narrow and loud: it applies only when nobody has configured a database at all,
 * which means a teammate who has not run `docker compose up`. If `DATABASE_URL`
 * is set and the connection fails, that is a misconfiguration and the run fails.
 */
async function databaseIsReachable(): Promise<boolean> {
  try {
    await unsafeDb.execute(sql`select 1`);
    return true;
  } catch (error) {
    // Only the unconfigured local case is skippable. An explicit DATABASE_URL,
    // or DB_TARGET=neon, means someone chose a database and it should be there.
    if (dbTarget() !== "local" || process.env.DATABASE_URL) throw error;
    console.log("\n" + "=".repeat(72));
    console.log("SKIPPED — tenant isolation tests did not run.");
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
  console.log("\nschema — every workspace-scoped table is actually protected");
  // -------------------------------------------------------------------------
  {
    // First, because when this fails every other isolation assertion fails too
    // and the reason is not otherwise obvious. A role with BYPASSRLS ignores
    // every policy on every table while nothing errors and everything looks
    // fine. Neon's provisioned `neondb_owner` has it; the Docker superuser has
    // it implicitly. Both were caught here.
    const roleRows = await unsafeDb.execute<{
      name: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(sql`
      SELECT current_user AS name, rolsuper, rolbypassrls
      FROM pg_roles WHERE rolname = current_user
    `);
    const role = [...roleRows][0];
    t(
      `connecting role "${role?.name}" cannot bypass row-level security`,
      { superuser: role?.rolsuper, bypassrls: role?.rolbypassrls },
      { superuser: false, bypassrls: false },
    );

    const rows = await unsafeDb.execute<{ tablename: string }>(sql`
      SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
      ORDER BY 1
    `);
    const protectedTables = [...rows].map((r) => r.tablename);
    t(
      "tables with FORCE ROW LEVEL SECURITY match workspaceScopedTableNames",
      protectedTables,
      [...workspaceScopedTableNames].sort(),
    );

    const policies = await unsafeDb.execute<{ tablename: string }>(sql`
      SELECT tablename FROM pg_policies WHERE schemaname = 'public' ORDER BY 1
    `);
    t(
      "every protected table has a policy",
      [...policies].map((r) => r.tablename),
      [...workspaceScopedTableNames].sort(),
    );
  }

  // -------------------------------------------------------------------------
  console.log("\nlayer 1 — ws.where() scopes and hides soft-deleted rows");
  // -------------------------------------------------------------------------
  await withWorkspace(alpha.workspaceId, async (ws) => {
    const rows = await ws.tx
      .select({ id: endpoints.id })
      .from(endpoints)
      .where(ws.where(endpoints));
    t("endpoints: sees only its own", rows.map((r) => r.id), [alpha.endpointId]);

    const subs = await ws.tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(ws.where(submissions));
    t("submissions: soft-deleted row excluded", subs.map((r) => r.id), [alpha.submissionId]);

    const withDeleted = await ws.tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(ws.whereIncludingDeleted(submissions));
    t(
      "submissions: whereIncludingDeleted returns both",
      withDeleted.map((r) => r.id).sort(),
      [alpha.submissionId, alpha.deletedSubmissionId].sort(),
    );

    const filtered = await ws.tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(ws.where(submissions, eq(submissions.verdict, "awaiting")));
    t(
      "extra conditions are ANDed on, not replaced",
      filtered.map((r) => r.id),
      [alpha.submissionId],
    );
  });

  // -------------------------------------------------------------------------
  console.log("\nlayer 1 alone — the predicate filters with no help from RLS");
  // -------------------------------------------------------------------------
  {
    // Run against the unscoped handle, where the policies are permissive. If
    // these only ran inside `withWorkspace`, row-level security would cover for
    // a broken predicate and we would be down to one layer without noticing.
    const rows = await unsafeDb
      .select({ id: endpoints.id })
      .from(endpoints)
      .where(workspaceWhere(endpoints, alpha.workspaceId));
    t("workspaceWhere filters to the workspace on its own", rows.map((r) => r.id), [
      alpha.endpointId,
    ]);

    const subs = await unsafeDb
      .select({ id: submissions.id })
      .from(submissions)
      .where(workspaceWhere(submissions, alpha.workspaceId));
    t("workspaceWhere excludes soft-deleted rows on its own", subs.map((r) => r.id), [
      alpha.submissionId,
    ]);

    const withDeleted = await unsafeDb
      .select({ id: submissions.id })
      .from(submissions)
      .where(workspaceWhereIncludingDeleted(submissions, alpha.workspaceId));
    t(
      "workspaceWhereIncludingDeleted keeps the workspace filter",
      withDeleted.map((r) => r.id).sort(),
      [alpha.submissionId, alpha.deletedSubmissionId].sort(),
    );
  }

  // -------------------------------------------------------------------------
  console.log("\nlayer 2 — a forgotten where clause still cannot cross the boundary");
  // -------------------------------------------------------------------------
  await withWorkspace(alpha.workspaceId, async (ws) => {
    // Every one of these is the bug we are actually defending against: a query
    // written in a hurry with no workspace predicate on it at all.
    const cases: [string, () => Promise<{ id: string }[]>, string][] = [
      ["memberships", () => ws.tx.select({ id: memberships.id }).from(memberships), ""],
      ["endpoints", () => ws.tx.select({ id: endpoints.id }).from(endpoints), alpha.endpointId],
      ["form_schemas", () => ws.tx.select({ id: formSchemas.id }).from(formSchemas), alpha.schemaVersionId],
      ["destinations", () => ws.tx.select({ id: destinations.id }).from(destinations), alpha.destinationId],
      ["delivery_attempts", () => ws.tx.select({ id: deliveryAttempts.id }).from(deliveryAttempts), alpha.deliveryAttemptId],
    ];

    for (const [name, query, expectedId] of cases) {
      const ids = (await query()).map((r) => r.id);
      t(`${name}: unscoped select returns only this workspace's rows`, ids.length, 1);
      if (expectedId) t(`${name}: and it is the right row`, ids, [expectedId]);
    }

    const subs = (await ws.tx.select({ id: submissions.id }).from(submissions)).map((r) => r.id);
    t(
      "submissions: unscoped select returns only this workspace's rows",
      subs.sort(),
      [alpha.submissionId, alpha.deletedSubmissionId].sort(),
    );
  });

  // -------------------------------------------------------------------------
  console.log("\nlayer 2 — reaching for another workspace's row by id returns nothing");
  // -------------------------------------------------------------------------
  await withWorkspace(alpha.workspaceId, async (ws) => {
    const byId = await ws.tx
      .select({ id: endpoints.id })
      .from(endpoints)
      .where(eq(endpoints.id, beta.endpointId));
    t("endpoints: beta's endpoint fetched by primary key is invisible", byId, []);

    const sub = await ws.tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.id, beta.submissionId));
    t("submissions: beta's submission fetched by primary key is invisible", sub, []);

    // A join is the other classic leak: scope the parent, forget the child.
    const joined = await ws.tx
      .select({ id: submissions.id })
      .from(submissions)
      .innerJoin(endpoints, eq(submissions.endpointId, endpoints.id))
      .where(and(isNull(submissions.deletedAt)));
    t("join across two scoped tables cannot pull beta's rows in", joined.map((r) => r.id), [
      alpha.submissionId,
    ]);

    // An aggregate leaks counts even when it returns no rows.
    const [count] = await ws.tx
      .select({ n: sql<number>`count(*)::int` })
      .from(submissions);
    t("count(*) over submissions counts only this workspace", count.n, 2);
  });

  // -------------------------------------------------------------------------
  console.log("\nlayer 2 — writes cannot cross the boundary either");
  // -------------------------------------------------------------------------
  await withWorkspace(alpha.workspaceId, async (ws) => {
    await ws.tx
      .update(submissions)
      .set({ verdict: "won" })
      .where(eq(submissions.id, beta.submissionId));

    await ws.tx.delete(endpoints).where(eq(endpoints.id, beta.endpointId));
  });
  {
    const betaSub = await unsafeDb
      .select({ verdict: submissions.verdict })
      .from(submissions)
      .where(eq(submissions.id, beta.submissionId));
    // `?? "gone"` rather than a destructure: when isolation is broken the delete
    // above cascades beta's submission away, and this should read as a failed
    // assertion rather than crash the run on an undefined.
    t(
      "update aimed at beta's submission changed nothing",
      betaSub[0]?.verdict ?? "gone — the row was deleted across the tenant boundary",
      "awaiting",
    );

    const betaEndpoint = await unsafeDb
      .select({ id: endpoints.id })
      .from(endpoints)
      .where(eq(endpoints.id, beta.endpointId));
    t("delete aimed at beta's endpoint removed nothing", betaEndpoint.length, 1);
  }

  {
    // Inserting a row stamped with another workspace must be refused outright.
    // `endpoints` is used because its only foreign key is to `workspaces`, which
    // has no policies — so a rejection here can only be the WITH CHECK clause,
    // not a foreign key that happened to be invisible.
    let threw = false;
    let code: string | undefined;
    try {
      await withWorkspace(alpha.workspaceId, async (ws) => {
        await ws.tx.insert(endpoints).values({
          id: newId(),
          workspaceId: beta.workspaceId,
          publicId: newEndpointPublicId(),
          name: "smuggled",
        });
      });
    } catch (error) {
      threw = true;
      code = pgErrorCode(error);
    }
    t("insert stamped with beta's workspace id is rejected", threw, true);
    // 42501 is insufficient_privilege — "new row violates row-level security
    // policy". Asserting the code, not just that something threw, is what makes
    // this test fail for the right reason.
    t("...and the rejection is an RLS violation, not something else", code, "42501");
  }

  // -------------------------------------------------------------------------
  console.log("\nlayer 3 — scope is transaction-local and does not leak");
  // -------------------------------------------------------------------------
  {
    const all = await unsafeDb
      .select({ id: endpoints.id })
      .from(endpoints)
      .where(sql`${endpoints.workspaceId} in (${alpha.workspaceId}, ${beta.workspaceId})`);
    t("after the transaction, an unscoped read sees both workspaces again", all.length, 2);

    const [setting] = await unsafeDb.execute<{ v: string | null }>(
      sql`select current_setting('app.workspace_id', true) as v`,
    );
    t("app.workspace_id is empty outside a scoped transaction", setting.v ?? "", "");
  }

  // -------------------------------------------------------------------------
  console.log("\nguard rails");
  // -------------------------------------------------------------------------
  {
    let threw = false;
    try {
      await withWorkspace("northwind", async () => undefined);
    } catch {
      threw = true;
    }
    t("withWorkspace refuses a slug where a workspace id belongs", threw, true);

    let threwOnUndefined = false;
    try {
      await withWorkspace(undefined as unknown as string, async () => undefined);
    } catch {
      threwOnUndefined = true;
    }
    t("withWorkspace refuses undefined", threwOnUndefined, true);
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
