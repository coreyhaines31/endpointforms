import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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

  // The unscoped database handle is off-limits to application code. Everything
  // that touches a workspace-scoped table goes through `withWorkspace()`, which
  // adds the predicate and arms the row-level security policies — see
  // `src/db/scoped.ts`. Migrations, the seed script and the auth layer are the
  // legitimate exceptions and live outside these directories.
  {
    files: ["src/app/**", "src/actions/**", "src/components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/db/client", "**/db/client.ts", "@/db/client"],
              message:
                "Import { withWorkspace } from '@/db' instead. unsafeDb bypasses workspace scoping; a cross-tenant leak is the one bug that ends this product.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
