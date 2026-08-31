/**
 * Creates the `endpoint` application role on a hosted Postgres.
 *
 * This is the hosted counterpart of `docker/postgres/init.sql`, and it exists
 * for exactly the same reason: **the role the application connects as must not
 * be able to bypass row-level security.**
 *
 * On Neon the provisioned owner, `neondb_owner`, has `rolbypassrls = true`. A
 * role with that attribute ignores every policy on every table, so the tenant
 * isolation in `drizzle/0001_tenant_isolation.sql` is inert while everything
 * still looks like it works — migrations apply, queries return rows, nothing
 * errors. The isolation test is what catches it, and it did: 18 failures on Neon
 * against 0 on Docker, with an identical schema.
 *
 * Only a superuser can remove `BYPASSRLS` from a role, and `neondb_owner` is not
 * one, so it cannot strip its own. A separate role is the fix.
 *
 * The role created here mirrors the local Docker role exactly — same name, same
 * attributes, owns its own objects, runs both the migrations and the app — so
 * there is one role model to reason about rather than two.
 *
 * Idempotent. Re-running rotates the password and re-asserts the grants.
 *
 *   ENDPOINT_APP_DB_PASSWORD='...' npm run db:create-app-role:neon
 *
 * Then point `NEON_DEV_DATABASE_URL` at this role instead of `neondb_owner`.
 */
import { sql } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { databaseUrl, dbTarget, describeDatabase } from "../src/db/env.ts";

const ROLE = "endpoint";

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function main() {
  const password = process.env.ENDPOINT_APP_DB_PASSWORD;
  if (!password) {
    throw new Error(
      "ENDPOINT_APP_DB_PASSWORD is not set.\n" +
        "Choose a password, then run:\n" +
        "  ENDPOINT_APP_DB_PASSWORD='<password>' npm run db:create-app-role:neon",
    );
  }

  if (dbTarget() === "local") {
    throw new Error(
      "The local Docker database already creates this role in docker/postgres/init.sql.\n" +
        "This script is for a hosted database: DB_TARGET=neon.",
    );
  }

  const database = new URL(databaseUrl()).pathname.replace(/^\//, "");
  console.log(`creating role "${ROLE}" on ${describeDatabase()}`);

  const exists = await unsafeDb.execute<{ one: number }>(
    sql`select 1 as one from pg_roles where rolname = ${ROLE}`,
  );

  const literal = quoteLiteral(password);
  if ([...exists].length > 0) {
    console.log(`  role exists — rotating password and re-asserting attributes`);
    await unsafeDb.execute(sql.raw(`ALTER ROLE "${ROLE}" WITH LOGIN PASSWORD ${literal}`));
  } else {
    await unsafeDb.execute(sql.raw(`CREATE ROLE "${ROLE}" WITH LOGIN PASSWORD ${literal}`));
  }

  // NOSUPERUSER and NOBYPASSRLS are deliberately NOT specified: only a
  // superuser may set either attribute, even to turn it off, and the role
  // running this is not one. Both are the default for a new role, so the
  // correct move is to not ask for them and then verify the result below.
  await unsafeDb.execute(sql.raw(`ALTER ROLE "${ROLE}" NOCREATEDB NOCREATEROLE INHERIT`));

  // Enough to run migrations and own what it creates — the same footing the
  // local role has, so the two targets behave identically.
  await unsafeDb.execute(sql.raw(`GRANT CONNECT, CREATE ON DATABASE "${database}" TO "${ROLE}"`));
  await unsafeDb.execute(sql.raw(`GRANT USAGE, CREATE ON SCHEMA public TO "${ROLE}"`));

  // So the owner can still read what the app writes, and vice versa.
  await unsafeDb.execute(sql.raw(`GRANT "${ROLE}" TO CURRENT_USER`));

  const verified = await unsafeDb.execute<{ rolbypassrls: boolean; rolsuper: boolean }>(
    sql`select rolbypassrls, rolsuper from pg_roles where rolname = ${ROLE}`,
  );
  const row = [...verified][0];
  if (!row || row.rolbypassrls || row.rolsuper) {
    throw new Error(
      `Role "${ROLE}" can still bypass row-level security ` +
        `(rolsuper=${row?.rolsuper}, rolbypassrls=${row?.rolbypassrls}). ` +
        `Refusing to report success — tenant isolation would be inert.`,
    );
  }

  const url = new URL(databaseUrl());
  console.log(`\n  role "${ROLE}": rolsuper=false rolbypassrls=false ✓`);
  console.log(`\nNext: point NEON_DEV_DATABASE_URL in .env.local at this role.`);
  console.log(`Same host and database, username "${ROLE}", the password you just set:`);
  console.log(`  postgres://${ROLE}:<password>@${url.host}${url.pathname}?sslmode=require`);
  console.log(`\nThen re-run the migrations so this role owns the objects it queries:`);
  console.log(`  npm run db:migrate:neon && npm run test:db:neon`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
