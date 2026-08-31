import { eq, sql } from "drizzle-orm";

// Relative, extension-bearing imports rather than the `@/` alias, matching
// `src/lib/workspaces/queries.ts`. The alias is a bundler feature; plain `node`
// does not resolve it, and `tests/auth-password.test.mts` has to be able to load
// this module — the point of that test is that "no such user" and "wrong
// password" are indistinguishable in the real code path, not in a copy of it.
import { unsafeDb } from "../../db/client.ts";
import { newId, users } from "../../db/index.ts";
import { burnEquivalentTime, checkPassword, hashPassword, verifyPassword } from "./password.ts";
import { checkSignInRateLimit } from "./rate-limit.ts";

/**
 * Email-and-password sign-in and sign-up, against the database.
 *
 * One of the three legitimate callers of `unsafeDb` named in
 * `docs/21-data-model.md`: resolving an address to a person runs before any
 * workspace is known, so it cannot itself be workspace-scoped. It touches
 * `users` only, which carries no `workspace_id`.
 *
 * ---
 *
 * ## The rule this file exists to enforce
 *
 * **Every failed sign-in looks and costs the same.** An address with no account,
 * an address whose account has no password, and an address with the wrong
 * password all return the same value after the same work. Any one of those three
 * returning faster than the others turns this into a membership list: an
 * attacker with a list of email addresses learns which of them bank here,
 * without ever guessing a password, and that list is worth selling on its own.
 *
 * Concretely: when there is no row, or the row has no `password_hash`, we still
 * run one argon2 verification — against a decoy hash generated at boot with the
 * same parameters (`burnEquivalentTime` in `./password.ts`). The two paths then
 * differ only by one indexed lookup, which is microseconds against argon2's tens
 * of milliseconds.
 *
 * The hash never leaves this module. It is selected, compared, and dropped;
 * nothing here returns it, and `SessionUser` has no field it could travel in.
 */

/** What the caller may know about a failed attempt. Deliberately almost nothing. */
export type SignInFailure = "invalid" | "rate-limited";

export type PasswordUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

export type SignInResult =
  | { ok: true; user: PasswordUser }
  | { ok: false; reason: SignInFailure; retryAfterSeconds?: number };

/**
 * Verifies an email and password.
 *
 * `ipHash` is only ever counted against — see `./rate-limit.ts`. Null (no proxy
 * header, or a direct call in a test) simply means the per-IP windows do not
 * apply; the per-email window still does, and that is the one that stops
 * credential stuffing.
 */
export async function verifyCredentials(
  email: string,
  password: string,
  ipHash: string | null,
): Promise<SignInResult> {
  const normalised = normaliseEmail(email);

  // Counted before any database work, so a flood is refused cheaply and — more
  // to the point — so being refused reveals nothing about whether the address
  // exists. Rate limiting *after* a lookup would leak through the timing of the
  // refusal itself.
  const throttle = checkSignInRateLimit(normalised, ipHash);
  if (!throttle.allowed) {
    return { ok: false, reason: "rate-limited", retryAfterSeconds: throttle.retryAfterSeconds };
  }

  const [row] = await unsafeDb
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(sql`lower(${users.email})`, normalised))
    .limit(1);

  // The ternary is the whole point: both arms await one argon2 verification.
  // Anything that short-circuits here — an early `return`, a `&&`, a cache —
  // reintroduces the oracle.
  const correct = row?.passwordHash
    ? await verifyPassword(row.passwordHash, password)
    : await burnEquivalentTime();

  if (!correct || !row) return { ok: false, reason: "invalid" };

  return { ok: true, user: { id: row.id, email: row.email, name: row.name, image: row.image } };
}

export type SignUpResult =
  | { ok: true; user: PasswordUser }
  | { ok: false; reason: "invalid-password"; message: string }
  | { ok: false; reason: "email-taken" }
  | { ok: false; reason: "rate-limited"; retryAfterSeconds: number };

/**
 * Creates an account with a password.
 *
 * `emailVerified` is left null. A password proves nothing about the inbox, and
 * writing a verification timestamp here would mean an account created on
 * someone else's address is indistinguishable from one they created themselves.
 * The column keeps its meaning: set by a magic link or by Google, and by nothing
 * else.
 *
 * ## The enumeration this one *does* have
 *
 * `email-taken` tells the caller that an address is registered. That is a real
 * enumeration surface and it is here deliberately, because the alternative —
 * answering "check your inbox" either way — needs a mail transport, and there
 * isn't one until #41. Refusing without saying why would leave a person who
 * genuinely already has an account staring at a form that will never work.
 *
 * It is bounded rather than free: sign-up is counted against the same windows as
 * sign-in, so working through a list costs an attacker the same as guessing
 * passwords would. And it is the *lesser* surface — sign-in is the endpoint that
 * gets ground at scale, and sign-in has no oracle at all.
 *
 * TODO(#41): once a mail transport exists, replace this with a verify-by-email
 * flow — always answer "check your inbox", and send either a welcome or a
 * "someone tried to sign up with your address" depending on which case it was.
 */
export async function createUserWithPassword(
  email: string,
  password: string,
  ipHash: string | null,
): Promise<SignUpResult> {
  const normalised = normaliseEmail(email);

  const throttle = checkSignInRateLimit(normalised, ipHash);
  if (!throttle.allowed) {
    return { ok: false, reason: "rate-limited", retryAfterSeconds: throttle.retryAfterSeconds };
  }

  const check = checkPassword(password);
  if (!check.ok) return { ok: false, reason: "invalid-password", message: check.message };

  const passwordHash = await hashPassword(password);
  const id = newId();

  try {
    await unsafeDb.insert(users).values({ id, email: normalised, passwordHash });
  } catch (error) {
    // `users_email_key` is the only unique constraint on the table, so a 23505
    // here can only mean the address is taken. Caught rather than pre-checked:
    // a SELECT-then-INSERT loses the race between two simultaneous sign-ups and
    // the constraint does not.
    if (isUniqueViolation(error)) return { ok: false, reason: "email-taken" };
    throw error;
  }

  return { ok: true, user: { id, email: normalised, name: null, image: null } };
}

/**
 * Sets or replaces the password on an existing account.
 *
 * Not reachable from the UI yet — there is no "change password" screen and no
 * reset flow, because a reset needs mail (#41). It exists because sign-up and
 * a future reset must hash identically, and two call sites hashing passwords is
 * how they stop being identical.
 *
 * TODO(#41): the reset flow goes here. It needs a `password_reset_tokens` table
 * with the same hashed-token treatment `invitations` gets, and it must delete
 * every row in `auth_sessions` for the user when the password changes —
 * otherwise a stolen session survives the reset that was meant to end it.
 */
export async function setPassword(userId: string, password: string): Promise<PasswordCheckResult> {
  const check = checkPassword(password);
  if (!check.ok) return { ok: false, message: check.message };

  await unsafeDb
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, userId));

  return { ok: true };
}

export type PasswordCheckResult = { ok: true } | { ok: false; message: string };

/**
 * Lower-cased and trimmed.
 *
 * The local part of an address is case-sensitive per RFC 5321, and in practice
 * no mail provider anyone uses honours that. Treating `Alice@` and `alice@` as
 * two accounts would mean two rate-limit budgets for one account, which is a
 * hole, and two accounts for one person, which is a support ticket.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Postgres 23505. Drizzle wraps driver errors, so the code is down the cause chain. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
