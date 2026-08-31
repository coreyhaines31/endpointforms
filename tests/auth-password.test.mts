/**
 * Password sign-in (#34).
 *
 * These are written from "how does an attacker get in, or get a customer list
 * out?" rather than "which lines are covered". Four things are worth a test
 * here, and the third is the one that would be easiest to break by accident and
 * hardest to notice:
 *
 *   1. A password can be hashed and checked, with argon2**id** and the
 *      parameters we chose — not whatever the library defaulted to this week.
 *   2. A wrong password is refused.
 *   3. **"No such user" and "wrong password" are indistinguishable** — same
 *      value returned, and the same time taken. This is the enumeration oracle;
 *      it is invisible in normal use and it hands over a membership list.
 *   4. The throttle actually engages, per email and per IP.
 *
 * The modules under test are loaded directly rather than through a server, so
 * there is no port and no fixtures beyond two users.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */

// Read at call time by `authRateLimitConfig()`, so setting them here is enough.
// Effectively unlimited for everything except the throttle test at the bottom,
// which sets its own and resets the counters first.
process.env.AUTH_RATE_LIMIT_EMAIL_PER_WINDOW = "1000000";
process.env.AUTH_RATE_LIMIT_IP_PER_WINDOW = "1000000";
process.env.AUTH_RATE_LIMIT_EMAIL_IP_PER_WINDOW = "1000000";

import { eq, inArray, sql } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { describeDatabase } from "../src/db/env.ts";
import { newId } from "../src/db/ids.ts";
import { users } from "../src/db/schema.ts";
import {
  createUserWithPassword,
  normaliseEmail,
  verifyCredentials,
} from "../src/lib/auth/account.ts";
import {
  checkPassword,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "../src/lib/auth/password.ts";
import {
  authRateLimitConfig,
  checkSignInRateLimit,
  hashIpForAuth,
  resetAuthRateLimits,
} from "../src/lib/auth/rate-limit.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  }
};

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/** Real, and long enough to be accepted. Never a password anyone uses. */
const PASSWORD = "correct horse battery staple";
const WITH_PASSWORD = "password-test-user@test.invalid";
/** Signed up with Google or a magic link: a real account with no password. */
const NO_PASSWORD = "password-test-oauth@test.invalid";
/** Never created. */
const ABSENT = "password-test-nobody@test.invalid";
/** Written with capitals, to prove the lookup does not care. */
const MIXED_CASE = "Password-Test-Mixed@Test.Invalid";

const FIXTURE_EMAILS = [
  WITH_PASSWORD,
  NO_PASSWORD,
  ABSENT,
  MIXED_CASE,
  "short-password@test.invalid",
].map(normaliseEmail);

async function cleanup() {
  // Compared lower-cased, because one of the fixtures is deliberately written
  // with capitals — the point of it is that the address is the same address.
  await unsafeDb.delete(users).where(inArray(sql`lower(${users.email})`, FIXTURE_EMAILS));
}

async function main() {
  console.log(`\ntesting against ${describeDatabase()}`);
  await cleanup();

  // -------------------------------------------------------------------------
  console.log("\nHASHING — round trip, and the algorithm we actually chose:");
  // -------------------------------------------------------------------------

  const hash = await hashPassword(PASSWORD);

  ok("the hash is not the password", !hash.includes(PASSWORD));
  ok("argon2id, not argon2i or argon2d", hash.startsWith("$argon2id$"), hash);
  ok("the parameters we chose, encoded in the hash", hash.includes("m=19456,t=2,p=1"), hash);
  t("the right password verifies", await verifyPassword(hash, PASSWORD), true);
  t("a wrong password does not", await verifyPassword(hash, "not the password"), false);
  t("a near-miss does not", await verifyPassword(hash, `${PASSWORD} `), false);

  // Two hashes of one password differ, which is the salt doing its job. Without
  // it, identical passwords across a leaked table are identifiable at a glance.
  const second = await hashPassword(PASSWORD);
  ok("the same password hashes to two different strings", hash !== second);
  t("and both verify", await verifyPassword(second, PASSWORD), true);

  t("a corrupt hash is a refusal, not a crash", await verifyPassword("not-a-hash", PASSWORD), false);
  t("an empty hash is a refusal, not a crash", await verifyPassword("", PASSWORD), false);

  // -------------------------------------------------------------------------
  console.log("\nPOLICY — length is the only rule, and it is enforced:");
  // -------------------------------------------------------------------------

  t("empty is refused", checkPassword("").ok, false);
  t(`${MIN_PASSWORD_LENGTH - 1} characters is refused`, checkPassword("a".repeat(11)).ok, false);
  t("11 characters of real entropy is still refused", checkPassword("Tr0ub4dor&3").ok, false);
  t(`${MIN_PASSWORD_LENGTH} characters is accepted`, checkPassword("horsebattery").ok, true);
  t("a long passphrase is accepted", checkPassword(PASSWORD).ok, true);
  t("no composition rule: all lowercase letters is fine", checkPassword("correctbattery").ok, true);
  t("longer than the cap is refused", checkPassword("a".repeat(257)).ok, false);

  t("password1234 is refused", checkPassword("password1234").ok, false);
  t("qwerty123456 is refused", checkPassword("qwerty123456").ok, false);
  t("PassWord1234 is refused too — the list is case-insensitive", checkPassword("PassWord1234").ok, false);
  t("twelve of the same character is refused", checkPassword("aaaaaaaaaaaa").ok, false);
  t("a straight run up the alphabet is refused", checkPassword("abcdefghijklm").ok, false);
  t("and back down it", checkPassword("ponmlkjihgfe").ok, false);

  // Counted in code points, not UTF-16 units. Each of these is one character to
  // the person typing it and two to `String.prototype.length`, and refusing a
  // twelve-emoji passphrase for being six characters long would be a lie.
  const TWELVE_EMOJI = "🔒🔑🦊🌍🚀🏔🐛🎲🍄🧭🔭🧲";
  const ELEVEN_EMOJI = [...TWELVE_EMOJI].slice(0, 11).join("");

  t("twelve emoji is twelve characters", checkPassword(TWELVE_EMOJI).ok, true);
  t("eleven emoji is not", checkPassword(ELEVEN_EMOJI).ok, false);
  // …and the same emoji twelve times is still twelve of one character.
  t("twelve of the same emoji is refused", checkPassword("🔒".repeat(12)).ok, false);

  // -------------------------------------------------------------------------
  console.log("\nSIGN-UP:");
  // -------------------------------------------------------------------------

  const created = await createUserWithPassword(WITH_PASSWORD, PASSWORD, null);
  ok("an account is created", created.ok, created);
  t(
    "the address is stored normalised",
    created.ok ? created.user.email : null,
    normaliseEmail(WITH_PASSWORD),
  );

  const short = await createUserWithPassword("short-password@test.invalid", "abc", null);
  t("a short password creates nothing", short.ok, false);
  t(
    "and says why",
    short.ok ? null : short.reason,
    "invalid-password",
  );
  t(
    "and really creates nothing",
    (await unsafeDb.select({ id: users.id }).from(users).where(eq(users.email, "short-password@test.invalid"))).length,
    0,
  );

  const again = await createUserWithPassword(WITH_PASSWORD, PASSWORD, null);
  t("the same address twice is refused", again.ok ? null : again.reason, "email-taken");

  // The case-insensitive unique index, not a pre-check: the row below is written
  // with capitals, and signing up with the lowercase form has to hit it.
  await unsafeDb.insert(users).values({ id: newId(), email: MIXED_CASE });
  const caseClash = await createUserWithPassword(MIXED_CASE.toLowerCase(), PASSWORD, null);
  t(
    "an address that differs only in case is the same address",
    caseClash.ok ? null : caseClash.reason,
    "email-taken",
  );

  // A Google or magic-link account. Real, signable-into, and with no password.
  await unsafeDb.insert(users).values({ id: newId(), email: normaliseEmail(NO_PASSWORD) });

  // -------------------------------------------------------------------------
  console.log("\nSIGN-IN:");
  // -------------------------------------------------------------------------

  const good = await verifyCredentials(WITH_PASSWORD, PASSWORD, null);
  ok("the right password signs in", good.ok, good);
  t("and returns the account", good.ok ? good.user.email : null, normaliseEmail(WITH_PASSWORD));

  const upperCased = await verifyCredentials(WITH_PASSWORD.toUpperCase(), PASSWORD, null);
  ok("the address is matched case-insensitively", upperCased.ok, upperCased);

  ok(
    "no password hash comes back with the account",
    !JSON.stringify(good).includes("argon2") && !JSON.stringify(good).includes("passwordHash"),
    good,
  );

  const wrong = await verifyCredentials(WITH_PASSWORD, "the wrong password", null);
  const absent = await verifyCredentials(ABSENT, "the wrong password", null);
  const noPassword = await verifyCredentials(NO_PASSWORD, "the wrong password", null);
  const emptyPassword = await verifyCredentials(WITH_PASSWORD, "", null);

  t("a wrong password is refused", wrong, { ok: false, reason: "invalid" });
  t("an address with no account is refused", absent, { ok: false, reason: "invalid" });
  t("an account with no password is refused", noPassword, { ok: false, reason: "invalid" });
  t("an empty password is refused", emptyPassword, { ok: false, reason: "invalid" });

  // The whole point. Three different situations, one indistinguishable answer.
  ok(
    "wrong password and no such user return the identical value",
    JSON.stringify(wrong) === JSON.stringify(absent),
    { wrong, absent },
  );
  ok(
    "and so does an account that has no password",
    JSON.stringify(wrong) === JSON.stringify(noPassword),
    { wrong, noPassword },
  );

  // -------------------------------------------------------------------------
  console.log("\nSIGN-IN TIMING — the part a message cannot fix:");
  // -------------------------------------------------------------------------

  await timingIsIndistinguishable();

  // -------------------------------------------------------------------------
  console.log("\nRATE LIMITING:");
  // -------------------------------------------------------------------------

  await throttling();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

/**
 * Whether an attacker can tell "no such user" from "wrong password" with a
 * stopwatch.
 *
 * Medians rather than means, and interleaved rather than run in blocks, because
 * a laptop running a browser and a database will produce outliers and will drift
 * over the course of a second. Both of those would fool a mean.
 *
 * The tolerance is wide on purpose. A real oracle is not a 20% difference — it
 * is a lookup that returns in under a millisecond against an argon2 verification
 * that takes forty, which is two orders of magnitude and would fail this by a
 * mile. A tight bound here would buy nothing and would fail on a busy machine,
 * and a test that fails at random gets deleted.
 */
async function timingIsIndistinguishable() {
  const RUNS = 15;
  const existing: number[] = [];
  const missing: number[] = [];

  // One of each, first, so neither side pays for a cold cache or a JIT warm-up.
  await verifyCredentials(WITH_PASSWORD, "warm up", null);
  await verifyCredentials(ABSENT, "warm up", null);

  for (let i = 0; i < RUNS; i++) {
    existing.push(await timed(() => verifyCredentials(WITH_PASSWORD, "the wrong password", null)));
    missing.push(await timed(() => verifyCredentials(ABSENT, "the wrong password", null)));
  }

  const wrongPassword = median(existing);
  const noSuchUser = median(missing);
  const ratio = noSuchUser / wrongPassword;

  console.log(
    `        wrong password ${wrongPassword.toFixed(1)}ms · no such user ${noSuchUser.toFixed(1)}ms · ratio ${ratio.toFixed(2)}`,
  );

  ok(
    "an address with no account costs the same as a wrong password",
    ratio > 0.5 && ratio < 2,
    { wrongPassword, noSuchUser, ratio },
  );

  // The failure this is really guarding against: a lookup that misses returning
  // immediately. Anything under a few milliseconds means no hash was computed.
  ok(
    "and it is not a fast path — both do real argon2 work",
    noSuchUser > 5 && wrongPassword > 5,
    { wrongPassword, noSuchUser },
  );
}

async function throttling() {
  process.env.AUTH_RATE_LIMIT_EMAIL_PER_WINDOW = "5";
  process.env.AUTH_RATE_LIMIT_IP_PER_WINDOW = "8";
  process.env.AUTH_RATE_LIMIT_EMAIL_IP_PER_WINDOW = "5";
  resetAuthRateLimits();

  const config = authRateLimitConfig();
  const now = Date.now();
  const ip = hashIpForAuth("203.0.113.7");

  t("the configured ceilings are read from the environment", config, {
    windowMs: 900_000,
    endpoint: 5,
    ip: 8,
    endpointIp: 5,
  });

  const attempts = [];
  for (let i = 0; i < 6; i++) {
    attempts.push(checkSignInRateLimit("throttle@test.invalid", ip, config, now).allowed);
  }
  t("five attempts on one account are allowed, the sixth is not", attempts, [
    true,
    true,
    true,
    true,
    true,
    false,
  ]);

  ok(
    "and the refusal says how long to wait",
    checkSignInRateLimit("throttle@test.invalid", ip, config, now).retryAfterSeconds > 0,
  );

  t(
    "the window reopens",
    checkSignInRateLimit("throttle@test.invalid", ip, config, now + 900_001).allowed,
    true,
  );

  // Credential stuffing rotates the address, so the per-email window never
  // fires. The per-IP one has to.
  resetAuthRateLimits();
  const perIp = [];
  for (let i = 0; i < 9; i++) {
    perIp.push(checkSignInRateLimit(`stuffing-${i}@test.invalid`, ip, config, now).allowed);
  }
  t(
    "a different address every time is still caught by the per-IP window",
    perIp,
    [true, true, true, true, true, true, true, true, false],
  );

  // The other half of it: a botnet rotates the IP, so the per-email window is
  // the only thing left standing.
  resetAuthRateLimits();
  const perEmail = [];
  for (let i = 0; i < 6; i++) {
    perEmail.push(
      checkSignInRateLimit("victim@test.invalid", hashIpForAuth(`198.51.100.${i}`), config, now)
        .allowed,
    );
  }
  t(
    "a different IP every time is still caught by the per-email window",
    perEmail,
    [true, true, true, true, true, false],
  );

  // The keyspace note in `src/lib/auth/rate-limit.ts`: auth IP hashes must not
  // land in the same window as ingest's, or a busy form would lock out sign-in.
  ok(
    "auth IP hashes are in their own keyspace",
    hashIpForAuth("203.0.113.7")?.startsWith("auth:sha256:") === true,
    hashIpForAuth("203.0.113.7"),
  );

  // And the whole path, not just the counter: `verifyCredentials` refuses with a
  // reason of its own rather than falling through to "invalid".
  resetAuthRateLimits();
  process.env.AUTH_RATE_LIMIT_EMAIL_PER_WINDOW = "2";
  process.env.AUTH_RATE_LIMIT_EMAIL_IP_PER_WINDOW = "2";
  await verifyCredentials(WITH_PASSWORD, "wrong", null);
  await verifyCredentials(WITH_PASSWORD, "wrong", null);
  const throttled = await verifyCredentials(WITH_PASSWORD, PASSWORD, null);

  t(
    "a throttled sign-in is refused even with the right password",
    throttled.ok ? null : throttled.reason,
    "rate-limited",
  );

  resetAuthRateLimits();
}

async function timed(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await sqlClient.end();
  });
