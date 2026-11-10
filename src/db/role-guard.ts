/**
 * Refuse to run workspace-scoped queries as a role that ignores row-level
 * security (#140).
 *
 * A superuser or a `BYPASSRLS` role skips every policy, so the layer in
 * `scoped.ts` that turns a forgotten predicate into "no rows" goes inert, and
 * nothing errors. Neon's default `neondb_owner` is such a role. The app must
 * connect as the `endpoint` role from `scripts/db-create-app-role.mts`.
 */

export type RoleAttributes = {
  role: string;
  superuser: boolean;
  bypassRls: boolean;
};

/** Why this role can't enforce row-level security, or null when it can. */
export function roleViolation(attrs: RoleAttributes): string | null {
  const reasons: string[] = [];
  if (attrs.superuser) reasons.push("is a superuser");
  if (attrs.bypassRls) reasons.push("has BYPASSRLS");
  if (reasons.length === 0) return null;

  return (
    `Database role "${attrs.role}" ${reasons.join(" and ")}, so row-level security ` +
    "is not enforced and workspace isolation rests on query predicates alone. " +
    "Connect as the application role instead: see scripts/db-create-app-role.mts " +
    "and docs/24-self-hosting.md."
  );
}

/**
 * What to do about a violation: throw in production, warn once elsewhere so a
 * development target connected as an owner role still runs.
 */
export function enforceRole(
  attrs: RoleAttributes,
  env: { production: boolean; warn: (message: string) => void },
): void {
  const violation = roleViolation(attrs);
  if (!violation) return;
  if (env.production) throw new Error(violation);
  env.warn(`[db] ${violation}`);
}

type Query = () => Promise<RoleAttributes>;

/**
 * Checks the connected role once per process. A failed lookup (the database
 * was unreachable) is not cached, so the next scoped query tries again. A
 * violation in production is cached, so every scoped query keeps failing.
 */
export function createRoleGuard(query: Query, env: Parameters<typeof enforceRole>[1]) {
  let checked: Promise<void> | null = null;

  return function ensureRlsEnforced(): Promise<void> {
    checked ??= query().then(
      (attrs) => enforceRole(attrs, env),
      (error: unknown) => {
        checked = null;
        throw error;
      },
    );
    return checked;
  };
}
