import { randomBytes } from "node:crypto";

import { hash, verify } from "@node-rs/argon2";

/**
 * Hashing a password, and checking one against a hash.
 *
 * The rules about what may *be* a password live in `./password-policy.ts`, which
 * imports nothing — a Client Component can read `MIN_PASSWORD_LENGTH` from there
 * without pulling argon2's native binary into the browser bundle.
 *
 * No `server-only` marker and no `@/` alias, matching `src/lib/workspaces/queries.ts`
 * — `tests/auth-password.test.mts` loads this module directly under plain `node`,
 * and a test that exercises a copy of the hashing is not a test of the hashing.
 * `eslint.config.mjs` keeps components out of it instead.
 *
 * ---
 *
 * ## Why argon2id
 *
 * Memory-hard, which is the property that matters: bcrypt's cost is CPU only, so
 * a GPU or an FPGA farm gets a large constant-factor advantage over the ordinary
 * server that wrote the hash. argon2id needs 19 MiB per guess, which is
 * expensive to parallelise in silicon, and is why OWASP names it first.
 *
 * The parameters below are OWASP's second listed configuration (m=19456 KiB,
 * t=2, p=1). They are written out rather than left to the library's defaults so
 * that a dependency bump cannot quietly change the cost of every hash we write.
 * They are also encoded into each hash string, so raising the cost later is a
 * per-user upgrade on next sign-in rather than a flag day — existing hashes keep
 * verifying at whatever they were written with.
 *
 * `@node-rs/argon2` is the Rust implementation with prebuilt binaries for every
 * platform we deploy to (see the platform packages in the lockfile), so there is
 * no node-gyp step in a Vercel build.
 */
const PARAMS = {
  /**
   * `Algorithm.Argon2id`, written as its value.
   *
   * `@node-rs/argon2` declares `Algorithm` as an ambient `const enum`, and this
   * project compiles with `isolatedModules`, under which reading one is an
   * error — the compiler cannot inline a value it is not allowed to look up.
   * `2` is `Argon2id`; the two neighbours are `Argon2d` (0) and `Argon2i` (1),
   * and picking either by accident would be the difference between the hybrid
   * OWASP recommends and one half of it. `tests/auth-password.test.mts` asserts
   * that a hash produced here says `$argon2id$`, so a wrong number fails a test
   * rather than shipping.
   */
  algorithm: 2,
  /** KiB. 19 MiB per guess. */
  memoryCost: 19_456,
  /** Passes. */
  timeCost: 2,
  /** Lanes. */
  parallelism: 1,
} as const;

export {
  checkPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_MESSAGES,
  type PasswordCheck,
} from "./password-policy.ts";

/**
 * Hashes a password. The salt is generated per call by the library and is
 * carried inside the returned string, along with the parameters used.
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password, PARAMS);
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns `false` rather than throwing on a malformed or truncated hash. A row
 * whose hash cannot be parsed is a corrupt row, and the only safe reading of one
 * is "this password is not correct" — throwing would turn it into a 500 that
 * says, unmistakably, that this address has an account.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

/**
 * A hash of a password nobody knows, used to burn the same CPU for an address
 * that has no account as for one that does.
 *
 * Without this, "no such user" returns in about a millisecond and "wrong
 * password" takes the tens of milliseconds argon2 costs, and the difference is a
 * free membership list: an attacker with a list of addresses learns which of
 * them bank here without ever guessing a password. Verifying against this decoy
 * makes the two paths do the same work.
 *
 * Generated at module load from random bytes rather than hard-coded, so the
 * decoy is always hashed with exactly the parameters above — a constant checked
 * into the file would silently stop matching the real cost the first time
 * `PARAMS` changed, which is the one moment nobody would think to look at it.
 *
 * The promise is created eagerly and awaited on first use, so the cost lands
 * during boot rather than on the first sign-in against a cold instance.
 */
const decoyHash: Promise<string> = hashPassword(randomBytes(32).toString("hex"));

/** Keeps an early crash from also being an unhandled rejection. */
decoyHash.catch(() => {});

/**
 * Spends the same time verifying as a real check would, and reports failure.
 *
 * Always returns `false`. The return value exists so a caller reads as one
 * expression — `row?.passwordHash ? verifyPassword(…) : burnEquivalentTime()` —
 * rather than as an `await` whose result is thrown away, which is the kind of
 * line a later reader deletes as dead code.
 */
export async function burnEquivalentTime(): Promise<false> {
  await verifyPassword(await decoyHash, "not the password");
  return false;
}
