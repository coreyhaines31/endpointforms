import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The unscoped database handle is off-limits to application code. Everything
 * that touches a workspace-scoped table goes through `withWorkspace()`, which
 * adds the predicate and arms the row-level security policies — see
 * `src/db/scoped.ts`. Migrations, the seed script and the auth layer are the
 * legitimate exceptions and live outside these directories.
 */
const unsafeDbPattern = {
  group: ["**/db/client", "**/db/client.ts", "@/db/client"],
  message:
    "Import { withWorkspace } from '@/db' instead. unsafeDb bypasses workspace scoping; a cross-tenant leak is the one bug that ends this product.",
};

/**
 * The workspace query modules reach `unsafeDb` legitimately — resolving which
 * workspace a session is in cannot itself be workspace-scoped. They carry no
 * `server-only` marker, because `tests/workspace-access.test.mts` loads them
 * directly and a test that exercises a copy of the boundary is not a test of the
 * boundary. This pattern replaces the marker for the case it was guarding: a
 * component pulling the database into the client bundle.
 *
 * The shapes those modules return live in `src/lib/workspaces/types.ts`, which
 * imports nothing at runtime, so a component that needs to name one still can.
 */
const serverOnlyLibPattern = {
  group: [
    "**/lib/workspaces/queries",
    "**/lib/workspaces/queries.ts",
    "@/lib/workspaces/queries",
    "**/lib/workspaces/invitations",
    "**/lib/workspaces/invitations.ts",
    "@/lib/workspaces/invitations",
  ],
  message:
    "These modules open database connections. Read the data in a Server Component and pass it down, or import the type from '@/lib/workspaces/types'.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  {
    files: ["src/app/**", "src/actions/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [unsafeDbPattern] }],
    },
  },

  // Components get both. A flat-config block replaces a rule's options rather
  // than merging them, so this list has to be complete rather than additive.
  {
    files: ["src/components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [unsafeDbPattern, serverOnlyLibPattern] },
      ],
    },
  },
]);

export default eslintConfig;
