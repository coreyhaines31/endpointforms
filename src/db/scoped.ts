import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { unsafeDb, type Database } from "./client.ts";

/**
 * Workspace scoping.
 *
 * A cross-tenant leak is the one bug that ends a product like this, so it is
 * defended three times over and each layer catches a different mistake:
 *
 * 1. **`ws.where(table)`** builds the predicate for you. Catches the honest
 *    case of writing the filter by hand and getting it wrong.
 * 2. **Row-level security**, armed for the duration of the transaction. Every
 *    workspace-scoped table has `FORCE ROW LEVEL SECURITY` and a policy keyed on
 *    the `app.workspace_id` setting that `withWorkspace` sets. Inside this
 *    transaction another tenant's rows do not exist — a query that forgets the
 *    predicate entirely returns nothing rather than everything. That is the
 *    layer that actually saves us, because the realistic failure is a hurried
 *    `select` in a request handler, not a mistyped comparison.
 * 3. **`no-restricted-imports`**, so `unsafeDb` cannot be reached from
 *    `src/app`, `src/actions` or `src/components` without failing the lint.
 *
 * Outside a `withWorkspace` transaction the policies are permissive by design.
 * Migrations, the seed script, and the auth query that asks "which workspaces
 * does this user belong to?" all have to run before a workspace is known, and a
 * scheme that cannot express those gets switched off by the first person who
 * needs one.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A table that carries the tenant boundary directly. */
type ScopedTable = { workspaceId: AnyPgColumn };

/** A table that is soft-deleted rather than removed. */
type SoftDeletable = { deletedAt: AnyPgColumn };

export type WorkspaceScope = {
  readonly workspaceId: string;

  /**
   * The transaction handle. Full Drizzle — there is no wrapper around it and no
   * query builder of our own. Queries run through here are inside the armed
   * row-level security transaction.
   */
  readonly tx: Database;

  /**
   * The predicate for a workspace-scoped table: this workspace, and not
   * soft-deleted. Extra conditions are ANDed on.
   *
   *   const rows = await ws.tx.select().from(endpoints).where(ws.where(endpoints));
   */
  where<T extends ScopedTable>(table: T, ...conditions: (SQL | undefined)[]): SQL;

  /**
   * The same, but includes soft-deleted rows — for a trash view, a restore, or
   * an export that should not quietly omit what someone deleted.
   */
  whereIncludingDeleted<T extends ScopedTable>(
    table: T,
    ...conditions: (SQL | undefined)[]
  ): SQL;
};

/**
 * Runs `fn` inside a transaction scoped to one workspace.
 *
 * Everything that touches a workspace-scoped table should be in here. The
 * callback gets a Drizzle transaction, not an abstraction over one.
 */
export async function withWorkspace<T>(
  workspaceId: string,
  fn: (ws: WorkspaceScope) => Promise<T>,
): Promise<T> {
  if (!UUID.test(workspaceId)) {
    // Fail before opening a transaction. A non-UUID here means a caller has
    // passed a slug, a public ID, or undefined, and the policy would fail on
    // the cast anyway — with a much worse error.
    throw new Error(`withWorkspace: invalid workspace id ${JSON.stringify(workspaceId)}`);
  }

  return unsafeDb.transaction(async (tx) => {
    // `true` is is_local: the setting is reverted when this transaction ends,
    // so a pooled connection never carries one tenant's scope into the next
    // request.
    await tx.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);

    const scope: WorkspaceScope = {
      workspaceId,
      tx: tx as unknown as Database,
      where: (table, ...conditions) => workspaceWhere(table, workspaceId, ...conditions),
      whereIncludingDeleted: (table, ...conditions) =>
        workspaceWhereIncludingDeleted(table, workspaceId, ...conditions),
    };

    return fn(scope);
  });
}

/**
 * The predicate `ws.where()` builds, as a standalone function.
 *
 * Exported so the isolation test can exercise it *outside* a scoped
 * transaction, where the policies are permissive. Tested only from inside one,
 * a regression here would be invisible — row-level security would silently
 * cover for it, and we would be down to one layer without knowing.
 */
export function workspaceWhere<T extends ScopedTable>(
  table: T,
  workspaceId: string,
  ...conditions: (SQL | undefined)[]
): SQL {
  return buildWhere(table, workspaceId, true, conditions);
}

/** As `workspaceWhere`, but does not exclude soft-deleted rows. */
export function workspaceWhereIncludingDeleted<T extends ScopedTable>(
  table: T,
  workspaceId: string,
  ...conditions: (SQL | undefined)[]
): SQL {
  return buildWhere(table, workspaceId, false, conditions);
}

function buildWhere<T extends ScopedTable>(
  table: T,
  workspaceId: string,
  excludeDeleted: boolean,
  conditions: (SQL | undefined)[],
): SQL {
  const parts: (SQL | undefined)[] = [eq(table.workspaceId, workspaceId)];

  if (excludeDeleted && isSoftDeletable(table)) {
    parts.push(isNull(table.deletedAt));
  }

  parts.push(...conditions);

  // At least one condition always exists, so `and` cannot return undefined here.
  return and(...parts) as SQL;
}

function isSoftDeletable(table: ScopedTable): table is ScopedTable & SoftDeletable {
  return "deletedAt" in table && table.deletedAt !== undefined;
}
