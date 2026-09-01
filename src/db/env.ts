/**
 * Which database to connect to.
 *
 * Two targets, one schema. Nothing in `schema.ts` or in `drizzle/` is specific
 * to either — both are plain Postgres 18 reached over TCP with the same `pg`
 * wire protocol driver. Neon's serverless driver is deliberately not used in the
 * shared path: it would put a second connection implementation behind the same
 * migrations, which is how the two targets quietly drift apart.
 *
 *   DB_TARGET unset / "local"  → DATABASE_URL, defaulting to local Docker
 *   DB_TARGET=neon             → NEON_DEV_DATABASE_URL
 *
 * The `:neon` npm scripts set `DB_TARGET` for you; see docs/21-data-model.md.
 */

/**
 * The local `docker compose up -d` database. Also the default a self-hoster
 * gets before they have configured anything (#46) — "run this SQL first, and
 * also invent a connection string" is where self-hosting loses people.
 *
 * Never used in production: a missing DATABASE_URL there is a misconfiguration
 * we should shout about, not paper over.
 */
export const LOCAL_DATABASE_URL =
  "postgres://endpoint:endpoint@localhost:5433/endpointforms";

export type DbTarget = "local" | "neon";

let envFileLoaded = false;

/**
 * Loads `.env.local` when running outside Next.
 *
 * Next.js loads it already; plain `node` does not, and the db scripts and tests
 * are plain node. Done lazily inside `databaseUrl()` rather than at import time
 * so it cannot depend on the order of a caller's import statements.
 */
function ensureEnvFileLoaded(): void {
  if (envFileLoaded) return;
  envFileLoaded = true;

  // Inside Next (including the edge runtime, where this does not exist).
  if (process.env.NEXT_RUNTIME) return;

  const loadEnvFile = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;
  if (typeof loadEnvFile !== "function") return;

  try {
    loadEnvFile(".env.local");
  } catch {
    // No .env.local. Expected in CI and in a fresh self-host.
  }
}

export function dbTarget(): DbTarget {
  const target = process.env.DB_TARGET;
  if (!target || target === "local") return "local";
  if (target === "neon") return "neon";
  throw new Error(`DB_TARGET must be "local" or "neon", got ${JSON.stringify(target)}`);
}

export function databaseUrl(): string {
  ensureEnvFileLoaded();

  if (dbTarget() === "neon") {
    const url = process.env.NEON_DEV_DATABASE_URL;
    if (!url) {
      throw new Error(
        "DB_TARGET=neon but NEON_DEV_DATABASE_URL is not set. It belongs in .env.local, which is gitignored.",
      );
    }
    return url;
  }

  const url = process.env.DATABASE_URL;
  if (url) return url;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is not set. Refusing to fall back to the local development database in production.",
    );
  }

  return LOCAL_DATABASE_URL;
}

/**
 * Whether `databaseUrl()` would return rather than throw.
 *
 * Exists so the db client can tell "no URL configured" apart from "URL is
 * wrong" without catching, and so `next build` can construct the Drizzle
 * wrapper on a clean checkout with no DATABASE_URL at all.
 */
export function hasDatabaseUrl(): boolean {
  try {
    databaseUrl();
    return true;
  } catch {
    return false;
  }
}

/** Host and database only — safe to log. Never returns credentials. */
export function describeDatabase(): string {
  try {
    const { host, pathname } = new URL(databaseUrl());
    return `${dbTarget()} · ${host}${pathname}`;
  } catch {
    return dbTarget();
  }
}
