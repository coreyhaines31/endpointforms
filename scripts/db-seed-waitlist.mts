/**
 * Provisions only the waitlist form (#33), and nothing else.
 *
 * `db:seed` runs this too, but it also tears down and rebuilds the `northwind`
 * demo workspace, which is exactly what you do not want to run against a
 * database holding real data. This is the command for production: additive,
 * idempotent, and it touches one workspace.
 *
 *   DATABASE_URL=<production> npm run db:seed:waitlist
 */
import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { describeDatabase } from "../src/db/env.ts";
import { seedWaitlistEndpoint } from "./seed-waitlist.mts";

async function main() {
  console.log(`seeding waitlist endpoint into ${describeDatabase()}`);
  await seedWaitlistEndpoint(unsafeDb);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
