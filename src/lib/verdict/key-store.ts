import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

import { unsafeDb } from "../../db/client.ts";
import { newId } from "../../db/ids.ts";
import { withWorkspace } from "../../db/scoped.ts";
import { verdictApiKeys, workspaces } from "../../db/schema.ts";
import { mintDerivedVerdictApiKey, mintStoredVerdictApiKey, verdictKeySecrets } from "./keys.ts";

/**
 * The outcome API keys a workspace holds, and what may be done to them (#57).
 *
 * `./keys.ts` decides what a key *is*; this file is the only thing that writes
 * one down or reads one back. The split is deliberate: the module that mints
 * secrets has no database import, so it cannot grow the ability to look a
 * plaintext key up, and this module never sees a plaintext except in the single
 * function that creates one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO KINDS OF KEY, ONE LIST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A workspace can hold any number of stored `efv2` keys — that is what makes
 * rotation survivable, since the new key and the old one are both live while a
 * CRM is moved across — plus at most one **derived** `efv1` key, which has no
 * row anywhere. `listVerdictApiKeys` returns both as the same shape, with the
 * derived one synthesised from two columns on `workspaces`.
 *
 * Presenting them uniformly is not cosmetic. The question a customer has after
 * a suspected leak is "what can reach my data, and when did each of those last
 * do so" — and an answer that omitted the one key format they have actually
 * been using for a year would be worse than no answer, because it would read
 * like a complete one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `last_used_at` IS DELIBERATELY BLUNT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every accepted request could write this column. On the outcome webhook — a
 * route a CRM retries, and which a bulk CSV import hits once per batch — that
 * is an unconditional row update on the hot path, and worse than the write
 * itself is the lock: every caller sharing one key would queue behind the same
 * row, turning a read-mostly authentication into a serialisation point.
 *
 * So the update carries its own predicate:
 *
 *     UPDATE … SET last_used_at = now()
 *      WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < $2)
 *
 * Under load all but one request per interval match no row. Postgres still
 * takes the index lookup, but takes no row lock, writes no tuple and produces
 * no dead tuple for autovacuum — the cost collapses to roughly that of the
 * lookup that authenticated the request in the first place. The column is
 * therefore accurate to within `TOUCH_INTERVAL_MS` and never fresher, which is
 * enough for every question it exists to answer: "is anything still using this
 * key?" is not asked to the second, and nobody revokes a key on the strength of
 * a five-minute-old timestamp being five minutes old.
 *
 * The authentication path awaits it and swallows its failure — see the note on
 * `touch` in `./auth.ts` for why both halves of that are deliberate, and what
 * the un-awaited version silently costs.
 */

/** How stale `last_used_at` is allowed to get before another write is worth it. */
export const TOUCH_INTERVAL_MS = 5 * 60_000;

/**
 * Live stored keys per workspace.
 *
 * A ceiling rather than a policy: rotation needs two at once and an unusually
 * careful customer might run one per integration, so ten is far above real use.
 * It exists because this is a table an authenticated user can insert into from
 * a form, and a table like that with no bound is a table that eventually has a
 * million rows in it for reasons nobody remembers.
 */
export const MAX_LIVE_KEYS = 10;

export type VerdictKeyKind = "derived" | "stored";

/**
 * One key as the settings page shows it. Never contains a secret or a hash.
 *
 * `id` is null for the derived key, which is the marker that it has no row —
 * revoking it goes through `revokeDerivedVerdictKey` and writes a column on
 * `workspaces` instead.
 */
export type VerdictKeySummary = {
  id: string | null;
  kind: VerdictKeyKind;
  label: string;
  /**
   * The visible half of a stored key, or the whole derived key.
   *
   * The derived key is safe to print in full because it is recomputable from
   * the workspace at any time, which is the property #57 exists to end. The
   * stored key is not, so only its public half is ever shown again.
   */
  publicId: string | null;
  /** The full derived key, for the one format that can still be displayed. */
  fullKey: string | null;
  createdAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  revokedAt: Date | null;
};

export class VerdictKeyError extends Error {
  readonly code: "too_many_keys" | "not_found" | "already_revoked" | "no_derived_key";

  constructor(code: VerdictKeyError["code"], message: string) {
    super(message);
    this.name = "VerdictKeyError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Every key this workspace holds: the derived one first, then newest stored. */
export async function listVerdictApiKeys(workspaceId: string): Promise<VerdictKeySummary[]> {
  return withWorkspace(workspaceId, async (ws) => {
    const rows = await ws.tx
      .select()
      .from(verdictApiKeys)
      .where(ws.where(verdictApiKeys))
      .orderBy(desc(verdictApiKeys.createdAt));

    const stored: VerdictKeySummary[] = rows.map((row) => ({
      id: row.id,
      kind: "stored",
      label: row.label,
      publicId: row.publicId,
      fullKey: null,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      lastUsedIp: row.lastUsedIp,
      revokedAt: row.revokedAt,
    }));

    const derived = await readDerivedKey(workspaceId);
    return derived === null ? stored : [derived, ...stored];
  });
}

/**
 * The derived key as a summary row, or null when this deployment has none.
 *
 * Null when `VERDICT_API_KEY_SECRET` is unset, because then no derived key was
 * ever mintable and showing a revoke control for a key that does not exist
 * would be inventing a thing to worry about.
 *
 * `workspaces` carries no row-level security and is read here through the
 * unscoped handle for the same reason the authentication path does: it is the
 * table that *defines* the tenant rather than one scoped by it.
 */
export async function readDerivedKey(workspaceId: string): Promise<VerdictKeySummary | null> {
  const secrets = verdictKeySecrets();
  if (!secrets) return null;

  const [workspace] = await unsafeDb
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      revokedAt: workspaces.derivedKeyRevokedAt,
      lastUsedAt: workspaces.derivedKeyLastUsedAt,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) return null;

  return {
    id: null,
    kind: "derived",
    label: "Workspace key (legacy)",
    publicId: null,
    fullKey: mintDerivedVerdictApiKey(workspace, secrets),
    // The derived key has existed for as long as the workspace has: it is a
    // computation over the workspace id, so there is no moment at which it was
    // issued and pretending otherwise with a made-up date would be worse than
    // borrowing the only true one.
    createdAt: workspace.createdAt,
    lastUsedAt: workspace.lastUsedAt,
    lastUsedIp: null,
    revokedAt: workspace.revokedAt,
  };
}

/**
 * A stored key by its public handle, for authentication. Unscoped by necessity.
 *
 * Returns the workspace alongside it, because the caller's whole question is
 * "which workspace is this?" and asking it from inside a scope keyed on the
 * answer is impossible. Everything downstream runs inside `withWorkspace`.
 *
 * The hash comes back rather than a boolean: comparing it is `./keys.ts`'s job,
 * and it does so in constant time. A `where secret_hash = $1` here would be a
 * plain b-tree equality on a value derived from the caller's input, which is
 * both an unindexed scan and a comparison with no timing guarantee.
 */
export async function findVerdictApiKeyByPublicId(publicId: string): Promise<{
  id: string;
  workspaceId: string;
  workspaceSlug: string;
  secretHash: string;
  revokedAt: Date | null;
} | null> {
  const [row] = await unsafeDb
    .select({
      id: verdictApiKeys.id,
      workspaceId: verdictApiKeys.workspaceId,
      workspaceSlug: workspaces.slug,
      secretHash: verdictApiKeys.secretHash,
      revokedAt: verdictApiKeys.revokedAt,
    })
    .from(verdictApiKeys)
    .innerJoin(workspaces, eq(workspaces.id, verdictApiKeys.workspaceId))
    .where(eq(verdictApiKeys.publicId, publicId))
    .limit(1);

  return row ?? null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type CreatedVerdictApiKey = {
  /** The plaintext, for this one response. It is never obtainable again. */
  key: string;
  summary: VerdictKeySummary;
};

/**
 * Mints a key and writes its hash down.
 *
 * The plaintext exists in the returned object and nowhere else — not in a log
 * line, not in the row, not in any function this module can call twice.
 */
export async function createVerdictApiKey(input: {
  workspaceId: string;
  label: string;
  createdByUserId?: string | null;
  now?: Date;
}): Promise<CreatedVerdictApiKey> {
  const label = input.label.trim() || "Outcome key";
  const now = input.now ?? new Date();

  return withWorkspace(input.workspaceId, async (ws) => {
    const [live] = await ws.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(verdictApiKeys)
      .where(ws.where(verdictApiKeys, isNull(verdictApiKeys.revokedAt)));

    if ((live?.count ?? 0) >= MAX_LIVE_KEYS) {
      throw new VerdictKeyError(
        "too_many_keys",
        `This workspace already has ${MAX_LIVE_KEYS} live outcome keys, which is the limit. Revoke one you are no longer using — revoked keys stay listed, so you do not lose the record of what existed.`,
      );
    }

    const minted = mintStoredVerdictApiKey();
    const id = newId();

    await ws.tx.insert(verdictApiKeys).values({
      id,
      workspaceId: input.workspaceId,
      publicId: minted.publicId,
      secretHash: minted.secretHash,
      label,
      createdAt: now,
      createdByUserId: input.createdByUserId ?? null,
    });

    return {
      key: minted.key,
      summary: {
        id,
        kind: "stored",
        label,
        publicId: minted.publicId,
        fullKey: null,
        createdAt: now,
        lastUsedAt: null,
        lastUsedIp: null,
        revokedAt: null,
      },
    };
  });
}

/**
 * Kills one stored key. The row stays.
 *
 * Not undoable, and that is the point: an un-revoke would mean a key somebody
 * decided had leaked coming back to life on a click. Mint a new one instead.
 */
export async function revokeVerdictApiKey(
  workspaceId: string,
  keyId: string,
  revokedByUserId?: string | null,
  now: Date = new Date(),
): Promise<void> {
  await withWorkspace(workspaceId, async (ws) => {
    const updated = await ws.tx
      .update(verdictApiKeys)
      .set({ revokedAt: now, revokedByUserId: revokedByUserId ?? null })
      .where(ws.where(verdictApiKeys, eq(verdictApiKeys.id, keyId), isNull(verdictApiKeys.revokedAt)))
      .returning({ id: verdictApiKeys.id });

    if (updated.length === 0) {
      // One message for "no such key" and for "already revoked", because from
      // the caller's side both mean the same thing: that key cannot be used.
      throw new VerdictKeyError(
        "not_found",
        "No live key with that ID in this workspace. It may already have been revoked.",
      );
    }
  });
}

/**
 * Kills this workspace's derived key, and only this workspace's.
 *
 * The entire point of #57: the same outcome previously required rotating
 * `VERDICT_API_KEY_SECRET`, which invalidated every other customer's key to fix
 * one customer's mistake.
 */
export async function revokeDerivedVerdictKey(
  workspaceId: string,
  now: Date = new Date(),
): Promise<void> {
  const updated = await unsafeDb
    .update(workspaces)
    .set({ derivedKeyRevokedAt: now, updatedAt: now })
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.derivedKeyRevokedAt)))
    .returning({ id: workspaces.id });

  if (updated.length === 0) {
    throw new VerdictKeyError(
      "already_revoked",
      "This workspace's legacy key is already revoked, or the workspace does not exist.",
    );
  }
}

// ---------------------------------------------------------------------------
// Bookkeeping
// ---------------------------------------------------------------------------

/**
 * Records that a stored key was just accepted, at most once per interval.
 *
 * See the header for why the predicate is on the UPDATE rather than around it:
 * the cheap case has to be cheap under concurrency, not merely on average.
 */
export async function touchVerdictApiKey(
  keyId: string,
  ip: string | null,
  now: Date = new Date(),
): Promise<void> {
  const stale = new Date(now.getTime() - TOUCH_INTERVAL_MS);

  await unsafeDb
    .update(verdictApiKeys)
    .set({ lastUsedAt: now, lastUsedIp: ip })
    .where(
      and(
        eq(verdictApiKeys.id, keyId),
        // `or(isNull, lt)` rather than a raw `sql` template on purpose. The raw
        // form binds a JavaScript `Date` the driver cannot serialise, and it
        // fails at bind time — which the caller's `catch` swallows, leaving a
        // column that is silently never written. Drizzle's comparison knows the
        // column's type and encodes the value for it.
        or(isNull(verdictApiKeys.lastUsedAt), lt(verdictApiKeys.lastUsedAt, stale)),
      ),
    );
}

/** The same, for the derived key's column on `workspaces`. */
export async function touchDerivedVerdictKey(
  workspaceId: string,
  now: Date = new Date(),
): Promise<void> {
  const stale = new Date(now.getTime() - TOUCH_INTERVAL_MS);

  await unsafeDb
    .update(workspaces)
    .set({ derivedKeyLastUsedAt: now })
    .where(
      and(
        eq(workspaces.id, workspaceId),
        or(isNull(workspaces.derivedKeyLastUsedAt), lt(workspaces.derivedKeyLastUsedAt, stale)),
      ),
    );
}
