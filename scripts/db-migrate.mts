/**
 * Applies pending migrations.
 *
 * #46 requires migrations to run automatically on boot — "run this SQL first" is
 * where self-hosting loses people — so this is a plain script with no
 * interactive step, callable from `npm run db:migrate` or from a container
 * entrypoint.
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { describeDatabase } from "../src/db/env.ts";

async function main() {
  // Says which database, so nobody discovers after the fact that they migrated
  // the wrong one. Host and database only — never the credentials.
  console.log(`migrating ${describeDatabase()}`);
  await migrate(unsafeDb, { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
