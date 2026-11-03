import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { unsafeDb } from "../../db/client.ts";
import { authSessions, emailCodes, newId, users } from "../../db/index.ts";
import { sendMail, type MailMessage, type MailResult } from "../destinations/mail.ts";
import { checkRateLimit } from "../ingest/rate-limit.ts";
import type { RateLimitConfig } from "../ingest/limits.ts";
import { normaliseEmail } from "./account.ts";

/**
 * Six-digit codes sent by email (#128).
 *
 * The one step of signing up from inside an AI chat that happens outside it:
 * the person reads a code from their inbox and types it back. A magic link
 * would open a browser and the session would land there, not where the agent
 * is. The same code signs someone in on `/login`, which is also how an account
 * created from a chat — which has no password — gets into the web app.
 *
 * **Anyone may ask for a code for any address**, and the answer is the same
 * whether or not an account exists. Verifying it signs in if there is an
 * account and creates one if there is not, so there is no "no such user" branch
 * to time or to read. What stops this being used to mail strangers is the rate
 * limit: three codes per address per hour.
 *
 * **Codes are stored as an HMAC, not a hash.** A million possibilities is
 * nothing to a dictionary; a SHA-256 of six digits in a leaked row is the code.
 * The HMAC key is `AUTH_SECRET`, which lives in the environment, so a database
 * dump alone does not reveal a live code.
 *
 * **Five wrong guesses burn the code.** Against a million possibilities that is
 * a 1-in-200,000 chance per code, and an attacker gets three codes an hour.
 */

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;
const CODE_DIGITS = 6;

const DEV_SECRET = "endpointforms-email-code-dev-only";

const emailSchema = z.string().trim().max(254).email();

export function emailCodeRateLimitConfig(): RateLimitConfig {
  return {
    windowMs: 60 * 60_000,
    endpoint: 3,
    ip: 20,
    endpointIp: 3,
  };
}

function hmacKey(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is not set, so email codes cannot be issued: they are stored as an HMAC keyed on it.",
    );
  }
  return DEV_SECRET;
}

function hashCode(email: string, code: string): string {
  return createHmac("sha256", hmacKey()).update(`email-code:v1:${email}:${code}`).digest("hex");
}

/** Six digits, leading zeros kept. `randomInt` is uniform; `Math.random` is not a CSPRNG. */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0");
}

/** Accepts "418 203" and "418-203" as well as "418203": people paste what the email showed. */
export function normaliseCode(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

export function codeEmail(to: string, code: string): MailMessage {
  const minutes = Math.round(CODE_TTL_MS / 60_000);
  return {
    to: [to],
    subject: `${code} is your Endpoint Forms code`,
    text: [
      `Your Endpoint Forms code is ${code}.`,
      "",
      `It expires in ${minutes} minutes and works once.`,
      "",
      "If you did not ask for it, you can ignore this email. Nobody can sign in without the code.",
    ].join("\n"),
  };
}

export type RequestCodeResult =
  | { ok: true; expiresInSeconds: number }
  | { ok: false; reason: "invalid-email" }
  | { ok: false; reason: "rate-limited"; retryAfterSeconds: number }
  | { ok: false; reason: "mail-failed"; mail: MailResult };

export type Mailer = (message: MailMessage) => Promise<MailResult>;

export async function requestEmailCode(input: {
  email: string;
  ipHash: string | null;
  send?: Mailer;
  now?: Date;
}): Promise<RequestCodeResult> {
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) return { ok: false, reason: "invalid-email" };

  const email = normaliseEmail(parsed.data);
  const now = input.now ?? new Date();

  // Per address, counted in the database: it is the limit that stops this being
  // used to fill a stranger's inbox, so it must hold across server instances and
  // survive the in-memory limiter clearing itself when it fills up.
  const config = emailCodeRateLimitConfig();
  const since = new Date(now.getTime() - config.windowMs);
  const [recent] = await unsafeDb
    .select({ count: sql<number>`count(*)::int`, oldest: sql<string | null>`min(${emailCodes.createdAt})` })
    .from(emailCodes)
    .where(and(eq(emailCodes.email, email), gt(emailCodes.createdAt, since)));
  if ((recent?.count ?? 0) >= config.endpoint) {
    const oldest = recent?.oldest ? new Date(recent.oldest).getTime() : now.getTime();
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + config.windowMs - now.getTime()) / 1000));
    return { ok: false, reason: "rate-limited", retryAfterSeconds };
  }

  // Per IP, in memory, in a keyspace of its own so asking for codes never spends
  // anyone's ingest or password sign-in budget. Best effort: per instance, and
  // skipped when the deployment cannot see a trustworthy client IP.
  const throttle = checkRateLimit(
    `email-code:${email}`,
    input.ipHash ? `email-code:${input.ipHash}` : null,
    config,
    now.getTime(),
  );
  if (!throttle.allowed) {
    return { ok: false, reason: "rate-limited", retryAfterSeconds: throttle.retryAfter ?? 3600 };
  }

  const code = generateCode();
  const id = newId();

  await unsafeDb.transaction(async (tx) => {
    // Only the newest code works. An older one sitting in the inbox would
    // otherwise double the guesses an attacker gets per hour.
    await tx
      .update(emailCodes)
      .set({ consumedAt: now })
      .where(and(eq(emailCodes.email, email), isNull(emailCodes.consumedAt)));

    await tx.insert(emailCodes).values({
      id,
      email,
      codeHash: hashCode(email, code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      createdAt: now,
    });
  });

  const mail = await (input.send ?? sendMail)(codeEmail(email, code));

  // Same rule as magic links (docs/22): with no mail transport, development
  // prints the code to the server console so the flow can be exercised, and
  // production refuses. Printing a sign-in code to production logs would let
  // anyone who can read the logs sign in as anyone.
  if (!mail.ok && mail.configuration && !input.send && process.env.NODE_ENV !== "production") {
    console.log(`\n  ┌─ sign-in code ─ ${email} ─ ${code} ─ expires in ${CODE_TTL_MS / 60_000} min\n`);
    return { ok: true, expiresInSeconds: Math.round(CODE_TTL_MS / 1000) };
  }

  if (!mail.ok) {
    // Never leave a live code behind that nobody received.
    await unsafeDb.update(emailCodes).set({ consumedAt: now }).where(eq(emailCodes.id, id));
    return { ok: false, reason: "mail-failed", mail };
  }

  return { ok: true, expiresInSeconds: Math.round(CODE_TTL_MS / 1000) };
}

/**
 * One answer for every way a code can be wrong: unknown address, no code,
 * expired, already used, burned, or simply a different six digits.
 */
export type VerifyCodeResult = { ok: true; email: string } | { ok: false };

export async function verifyEmailCode(input: {
  email: string;
  code: string;
  now?: Date;
}): Promise<VerifyCodeResult> {
  const parsed = emailSchema.safeParse(input.email);
  const code = normaliseCode(input.code);
  if (!parsed.success || !/^\d{6}$/.test(code)) return { ok: false };

  const email = normaliseEmail(parsed.data);
  const now = input.now ?? new Date();

  const [live] = await unsafeDb
    .select({ id: emailCodes.id })
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.email, email),
        isNull(emailCodes.consumedAt),
        gt(emailCodes.expiresAt, now),
      ),
    )
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);

  // **Spend the attempt before looking at the guess.** Comparing first and
  // counting afterwards lets a burst of simultaneous guesses all read the row
  // before any of them burns it, which turns five guesses into as many as fit
  // in one round trip. This UPDATE is the only way to get the hash, and
  // Postgres hands out at most `MAX_ATTEMPTS` of them per code no matter how
  // many requests arrive at once.
  const [row] = live
    ? await unsafeDb
        .update(emailCodes)
        .set({ attempts: sql`${emailCodes.attempts} + 1` })
        .where(
          and(
            eq(emailCodes.id, live.id),
            isNull(emailCodes.consumedAt),
            sql`${emailCodes.attempts} < ${MAX_ATTEMPTS}`,
          ),
        )
        .returning({ id: emailCodes.id, codeHash: emailCodes.codeHash, attempts: emailCodes.attempts })
    : [];

  const expected = Buffer.from(row?.codeHash ?? hashCode(email, "no-code"), "hex");
  const actual = Buffer.from(hashCode(email, code), "hex");
  const matches = Boolean(row) && timingSafeEqual(expected, actual);

  if (!row) return { ok: false };

  if (!matches) {
    if (row.attempts >= MAX_ATTEMPTS) {
      await unsafeDb
        .update(emailCodes)
        .set({ consumedAt: now })
        .where(and(eq(emailCodes.id, row.id), isNull(emailCodes.consumedAt)));
    }
    return { ok: false };
  }

  // Conditional on still being unused, so two simultaneous requests with the
  // right code cannot both succeed.
  const consumed = await unsafeDb
    .update(emailCodes)
    .set({ consumedAt: now })
    .where(and(eq(emailCodes.id, row.id), isNull(emailCodes.consumedAt)))
    .returning({ id: emailCodes.id });

  return consumed.length === 1 ? { ok: true, email } : { ok: false };
}

export type CodeUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  created: boolean;
};

/**
 * The account behind a verified address: the existing one, or a new one.
 *
 * A verified code is proof of the inbox, so `email_verified_at` is set — which
 * password sign-up deliberately never does. The insert races a concurrent
 * sign-up for the same address on the case-insensitive unique index; the loser
 * reads the winner's row.
 *
 * **The first proof of the inbox evicts whatever came before it.** Password
 * sign-up does not check the address, so anyone can register `dana@acme.com`
 * with a password of their choosing and wait. Without this, Dana's first code
 * would sign her into that account — and every workspace, lead and key she then
 * created would live in an account the squatter can still open. So when a code
 * verifies an address for the first time, the unverified password and every
 * existing session go. Dana can set a password of her own; the squatter keeps
 * nothing. An address that was already verified is left alone: its password was
 * set by someone who had proved the inbox too.
 */
export async function findOrCreateVerifiedUser(email: string, now: Date = new Date()): Promise<CodeUser> {
  const normalised = normaliseEmail(email);

  const existing = await selectUser(normalised);
  if (existing) {
    await unsafeDb.transaction(async (tx) => {
      const claimed = await tx
        .update(users)
        .set({ emailVerified: now, passwordHash: null, updatedAt: now })
        .where(and(eq(users.id, existing.id), isNull(users.emailVerified)))
        .returning({ id: users.id });
      if (claimed.length === 1) {
        await tx.delete(authSessions).where(eq(authSessions.userId, existing.id));
      }
    });
    return { ...existing, created: false };
  }

  const id = newId();
  const inserted = await unsafeDb
    .insert(users)
    .values({ id, email: normalised, emailVerified: now })
    .onConflictDoNothing()
    .returning({ id: users.id });

  if (inserted.length === 1) {
    return { id, email: normalised, name: null, image: null, created: true };
  }

  const winner = await selectUser(normalised);
  if (!winner) throw new Error("A user insert conflicted, but no user exists for that address.");
  return { ...winner, created: false };
}

async function selectUser(normalised: string) {
  const [row] = await unsafeDb
    .select({ id: users.id, email: users.email, name: users.name, image: users.image })
    .from(users)
    .where(eq(sql`lower(${users.email})`, normalised))
    .limit(1);
  return row ?? null;
}

/** Verify a code and return the account it proves. What both `/login` and the MCP server call. */
export async function signInWithEmailCode(input: {
  email: string;
  code: string;
  now?: Date;
}): Promise<{ ok: true; user: CodeUser } | { ok: false }> {
  const verified = await verifyEmailCode(input);
  if (!verified.ok) return { ok: false };
  return { ok: true, user: await findOrCreateVerifiedUser(verified.email, input.now) };
}
