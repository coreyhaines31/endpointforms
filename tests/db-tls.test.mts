/**
 * TLS is decided by the connection string, never by `DB_TARGET` (#77).
 *
 * ## Why this file exists at all
 *
 * This was fixed once already. `7227a8a` made TLS URL-derived as a production
 * hotfix in August; a concurrent rewrite of `src/db/client.ts` (`b0d4a22`, the
 * lazy connection) had been branched from before that fix, and when both landed
 * the rewrite's copy of the line won. **Nothing went red, because nothing tested
 * it.** The regression stayed invisible until a migration against production
 * failed months later with a bare `28000 connection is insecure`.
 *
 * So the point of this file is not that `sslMode` is subtle. The point is that
 * a whole-file rewrite must not be able to quietly revert it a third time.
 */
import { sslMode, describeDatabase } from "../src/db/env.ts";

/**
 * Read the `ssl` option the real client is built with, for a given URL.
 *
 * **This is the assertion that would have caught the original regression.**
 * Testing `sslMode` alone proves the helper is correct; it does not prove
 * `client.ts` still calls it, and "stopped calling it" is precisely what
 * happened. `postgres()` opens no socket, and the client is lazy, so reading
 * `.options` against a made-up host costs nothing and touches no database.
 *
 * One URL per process: both the module registry and `connect()` memoise.
 */
async function sslOptionFor(url: string): Promise<unknown> {
  process.env.DATABASE_URL = url;
  const { sqlClient } = await import("../src/db/client.ts");
  return (sqlClient as unknown as { options: { ssl?: unknown } }).options.ssl;
}

let pass = 0;
let fail = 0;
const t = (name: string, got: unknown, want: unknown) => {
  const isOk = JSON.stringify(got) === JSON.stringify(want);
  if (isOk) pass++;
  else fail++;
  console.log(`  ${isOk ? "PASS" : "FAIL"}  ${name}`);
  if (!isOk) console.log(`        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
};

console.log("\nTLS is decided by the URL, not by DB_TARGET");

// The wiring, before anything else touches the environment. A hosted URL in
// DATABASE_URL and no DB_TARGET at all — the exact shape that failed against
// production with `28000 connection is insecure`.
{
  const saved = process.env.DATABASE_URL;
  const savedTarget = process.env.DB_TARGET;
  try {
    delete process.env.DB_TARGET;
    t(
      "the client asks for TLS on a hosted URL with no DB_TARGET set",
      await sslOptionFor("postgres://u:p@ep-aged-brook.aws.neon.tech/neondb"),
      "require",
    );
  } finally {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
    if (savedTarget === undefined) delete process.env.DB_TARGET;
    else process.env.DB_TARGET = savedTarget;
  }
}

// Hosted. The case the regression broke: a Neon URL in DATABASE_URL, no
// DB_TARGET anywhere.
t("a neon host requires TLS", sslMode("postgres://u:p@ep-x.aws.neon.tech/neondb"), "require");
t("any non-loopback host requires TLS", sslMode("postgres://u:p@db.example.com:5432/app"), "require");

// Loopback. The compose database, which has no TLS and must not be asked for it.
t("localhost does not", sslMode("postgres://endpoint:endpoint@localhost:5433/endpointforms"), undefined);
t("127.0.0.1 does not", sslMode("postgres://u:p@127.0.0.1:5432/app"), undefined);
t("::1 does not", sslMode("postgres://u:p@[::1]:5432/app"), undefined);
t("a .localhost subdomain does not", sslMode("postgres://u:p@db.localhost:5432/app"), undefined);

// An explicit sslmode wins over the host, because someone who wrote one meant it.
t("sslmode=require on loopback wins", sslMode("postgres://u:p@localhost:5432/app?sslmode=require"), "require");
t("sslmode=disable on a remote host wins", sslMode("postgres://u:p@db.example.com/app?sslmode=disable"), undefined);
// Passed through rather than collapsed to on/off: postgres.js implements
// libpq's modes, and `prefer` really does fall back to plaintext against a
// server with no TLS. Coercing it to `require` would break the self-hoster who
// wrote it.
t("sslmode=allow is honoured as allow", sslMode("postgres://u:p@db.example.com/app?sslmode=allow"), "allow");
t("sslmode=prefer is honoured as prefer", sslMode("postgres://u:p@db.example.com/app?sslmode=prefer"), "prefer");
t("sslmode=verify-ca asks for at least require", sslMode("postgres://u:p@db.example.com/app?sslmode=verify-ca"), "require");
t("sslmode=verify-full requires TLS", sslMode("postgres://u:p@db.example.com/app?sslmode=verify-full"), "require");

// Unparseable is treated as hostile rather than as safe.
// A value we do not recognise falls back to TLS rather than to plaintext, and
// that direction is deliberate. libpq matches `sslmode` case-sensitively and
// accepts only these lowercase spellings, so `DISABLE` is not a valid opt-out
// anywhere — treating it as one would let a typo silently drop encryption.
// Pinned here so the fallback stays a decision rather than an accident.
t("an uppercase DISABLE does not disable", sslMode("postgres://u:p@h.example.com/d?sslmode=DISABLE"), "require");
t("a miscased Prefer is not honoured either", sslMode("postgres://u:p@h.example.com/d?sslmode=Prefer"), "require");
t("an unknown sslmode falls back to TLS", sslMode("postgres://u:p@h.example.com/d?sslmode=nonsense"), "require");
t("and so does a miscased key", sslMode("postgres://u:p@h.example.com/d?SSLMODE=disable"), "require");

t("garbage requires TLS", sslMode("not a url"), "require");
t("an empty string requires TLS", sslMode(""), "require");

// DB_TARGET must not enter into it — this is the exact regression.
const saved = process.env.DB_TARGET;
try {
  delete process.env.DB_TARGET;
  const withoutTarget = sslMode("postgres://u:p@ep-x.aws.neon.tech/neondb");
  process.env.DB_TARGET = "neon";
  const withTarget = sslMode("postgres://u:p@ep-x.aws.neon.tech/neondb");
  t("the same URL decides the same way with DB_TARGET unset and set", [withoutTarget, withTarget], ["require", "require"]);

  process.env.DB_TARGET = "neon";
  t(
    "and a loopback URL stays plaintext even with DB_TARGET=neon",
    sslMode("postgres://u:p@localhost:5432/app"),
    undefined,
  );
} finally {
  if (saved === undefined) delete process.env.DB_TARGET;
  else process.env.DB_TARGET = saved;
}

// The log line that is supposed to stop you migrating the wrong database must
// not contradict itself. It said `local` next to a neon host before.
const savedUrl = process.env.DATABASE_URL;
const savedTarget = process.env.DB_TARGET;
try {
  delete process.env.DB_TARGET;
  process.env.DATABASE_URL = "postgres://u:p@ep-aged-brook.aws.neon.tech/neondb";
  const hosted = describeDatabase();
  t("a hosted database is described as hosted", hosted.startsWith("hosted · "), true);
  t("and names the host", hosted.includes("ep-aged-brook.aws.neon.tech"), true);

  process.env.DATABASE_URL = "postgres://endpoint:endpoint@localhost:5433/endpointforms";
  t("a loopback database is described as local", describeDatabase().startsWith("local · "), true);
} finally {
  if (savedUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedUrl;
  if (savedTarget === undefined) delete process.env.DB_TARGET;
  else process.env.DB_TARGET = savedTarget;
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exitCode = 1;
