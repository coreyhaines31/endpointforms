import { defineConfig } from "drizzle-kit";

import { databaseUrl } from "./src/db/env.ts";

// One config for both targets. `DB_TARGET=neon` points it at the hosted dev
// database; unset or `local` points it at Docker. Nothing generated from this
// config is specific to either.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url: databaseUrl() },
});
