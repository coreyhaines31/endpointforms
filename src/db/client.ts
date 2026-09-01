import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { LOCAL_DATABASE_URL, databaseUrl, dbTarget, hasDatabaseUrl } from "./env.ts";
import * as schema from "./schema.ts";

type Sql = ReturnType<typeof postgres>;

/**
 * The connection, opened on first use rather than at import.
 *
 * `databaseUrl()` throws in production when DATABASE_URL is unset — a good
 * runtime guard and a bad import-time one. Next evaluates module scope while
 * collecting page data during `next build`, which runs as production, so any
 * route importing this module made a database URL a *build* requirement. That
 * broke `npm run build` on a clean checkout and would have broken the
 * one-command self-host story in #46.
 *
 * Only the client is deferred. Neither `postgres()` nor `drizzle()` opens a
 * socket, so the wrapper below can be built eagerly — and it must be: the
 * Auth.js Drizzle adapter walks the prototype chain of whatever it is handed to
 * choose its Postgres implementation, at import time. Handing it a lazy proxy
 * failed with "Unsupported database type (object)", because a proxy over a bare
 * object has no PgDatabase anywhere in its chain.
 */
let cached: Sql | null = null;

function connect(): Sql {
  if (cached) return cached;

  const url = databaseUrl();

  // Neon's pooled endpoint is PgBouncer in transaction mode, which cannot hold
  // prepared statements across a pooled connection. The direct endpoint can.
  // Detected rather than hard-coded so either endpoint works.
  const usesTransactionPooler = url.includes("-pooler.");

  cached = postgres(url, {
    // A transaction is the unit of workspace scoping, so connections must not
    // be shared mid-transaction. postgres.js handles this, but keep the pool
    // modest: serverless functions each hold their own.
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // Neon terminates TLS at the edge and refuses plaintext.
    ssl: dbTarget() === "neon" ? "require" : undefined,
    prepare: !usesTransactionPooler,
  });
  return cached;
}

/**
 * The one thing `drizzle()` reads from the client while being constructed.
 *
 * It keeps a reference to `client.options.parsers` and `.serializers` — the
 * Postgres type coders. postgres.js derives those from its `types` option,
 * which we never set, so they are identical for every connection string: the
 * placeholder below yields exactly the same coders the real client would, not
 * an approximation of them. It is only ever reached on a checkout with no
 * DATABASE_URL, which in practice means `next build` in CI.
 */
let parserDonor: Sql | null = null;

function clientOptions(): Sql["options"] {
  if (hasDatabaseUrl()) return connect().options;
  parserDonor ??= postgres(LOCAL_DATABASE_URL);
  return parserDonor.options;
}

/**
 * The raw postgres.js client, for migrations and for `set_config`.
 *
 * Callable, because postgres.js is used as a tagged template. Every access
 * other than `options` opens the connection, so a missing DATABASE_URL still
 * fails loudly in production — just at the first query rather than the first
 * import.
 */
export const sqlClient = new Proxy((() => {}) as unknown as Sql, {
  get: (_t, prop) =>
    prop === "options" ? clientOptions() : Reflect.get(connect() as object, prop),
  apply: (_t, thisArg, args) =>
    Reflect.apply(connect() as unknown as CallableFunction, thisArg, args),
});

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
export const unsafeDb = drizzle(sqlClient, { schema, casing: "snake_case" });

export type Database = typeof unsafeDb;

export { schema };
