import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { databaseUrl, dbTarget } from "./env.ts";
import * as schema from "./schema.ts";

/**
 * The unscoped database handle.
 *
 * **Application code must not import this.** Anything that reads a
 * workspace-scoped table goes through `withWorkspace()` in `./scoped`, which
 * both adds the predicate and closes the row-level security policies around the
 * transaction. An ESLint rule (`no-restricted-imports` in `eslint.config.mjs`)
 * fails the lint if `src/app`, `src/actions` or `src/components` import this
 * module, so reaching for it is a visible, deliberate act rather than an
 * accident in a hurry.
 *
 * Legitimate callers: migrations, the seed script, and the auth layer resolving
 * a session's user and their memberships — the queries that exist precisely to
 * decide which workspace you are in, and so cannot already be scoped to one.
 *
 * One driver for both targets. `postgres.js` speaks the ordinary Postgres wire
 * protocol, which Neon serves over TCP, so local Docker and hosted Neon run the
 * same code against the same migrations. Neon's serverless driver is not used:
 * a second connection implementation behind the same schema is how two targets
 * quietly drift apart.
 */
/**
 * Created on first use, not at import.
 *
 * `databaseUrl()` throws in production when DATABASE_URL is unset — a good
 * runtime guard, and a bad import-time one. Next evaluates module scope while
 * collecting page data during `next build`, which runs as production, so any
 * route that imported this module made a database URL a *build* requirement.
 * That broke `npm run build` on a clean checkout and would have broken the
 * one-command self-host story in #46. Deferring the connection keeps the guard
 * where it belongs: the first query, not the first import.
 */
let cached: { client: Sql; db: DrizzleDb } | null = null;

function connect() {
  if (cached) return cached;

  const url = databaseUrl();

  // Neon's pooled endpoint is PgBouncer in transaction mode, which cannot hold
  // prepared statements across a pooled connection. The direct endpoint can.
  // Detected rather than hard-coded so either endpoint works.
  const usesTransactionPooler = url.includes("-pooler.");

  const client = postgres(url, {
    // A transaction is the unit of workspace scoping, so connections must not
    // be shared mid-transaction. postgres.js handles this, but keep the pool
    // modest: serverless functions each hold their own.
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // Neon terminates TLS at the edge and refuses plaintext.
    ssl: dbTarget() === "neon" ? "require" : undefined,
    prepare: !usesTransactionPooler,
  });

  cached = { client, db: drizzle(client, { schema, casing: "snake_case" }) };
  return cached;
}

type Sql = ReturnType<typeof postgres>;
type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * A proxy so `unsafeDb.query...` and `sqlClient\`...\`` keep working unchanged
 * at every call site while the connection itself stays lazy.
 */
export const unsafeDb = new Proxy({} as DrizzleDb, {
  get: (_t, prop) => Reflect.get(connect().db as object, prop),
  apply: (_t, thisArg, args) =>
    Reflect.apply(connect().db as unknown as CallableFunction, thisArg, args),
});

export type Database = DrizzleDb;

/** The raw postgres.js client, for migrations and for `set_config`. */
export const sqlClient = new Proxy((() => {}) as unknown as Sql, {
  get: (_t, prop) => Reflect.get(connect().client as object, prop),
  apply: (_t, thisArg, args) =>
    Reflect.apply(connect().client as unknown as CallableFunction, thisArg, args),
});

export { schema };
