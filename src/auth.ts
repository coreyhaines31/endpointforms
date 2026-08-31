import "server-only";

import { randomBytes } from "node:crypto";

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import type { EmailConfig, Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { unsafeDb } from "@/db/client";
import { authAccounts, authSessions, authVerificationTokens, users } from "@/db/schema";
import { verifyCredentials } from "@/lib/auth/account";
import { clientIpFromHeaders, hashIpForAuth } from "@/lib/auth/rate-limit";

/**
 * Authentication (#34).
 *
 * **Email and password is the primary way in.** That reverses the decision this
 * file used to record, and `docs/20-product-plan.md` and `docs/22` used to
 * state: no passwords, magic link only. The reversal is deliberate and the
 * reason is development velocity on a product that is demoed live — a magic
 * link means a round trip through an inbox on every sign-in, and there is no
 * mail transport yet (#41), so in production the magic link cannot be delivered
 * at all. An auth method that only works in development is not an auth method.
 *
 * Three ways in, in the order the sign-in page offers them:
 *
 * - **Password.** argon2id, `src/lib/auth/password.ts`. What it costs us is
 *   spelled out there and in `src/lib/auth/account.ts`: a hashing decision, a
 *   rate limit, an enumeration surface to keep closed, and a reset flow we still
 *   owe (#41).
 * - **Google.** Google's own `email_verified` is the proof, and we check it
 *   rather than taking the sign-in at face value (see `signIn` below).
 * - **Magic link.** Possession of the inbox is the proof. Kept, demoted, and
 *   still refusing to run in production until #41 lands.
 *
 * ---
 *
 * ## Sessions are in the database, not in a JWT
 *
 * A JWT cannot be revoked. With a session row, removing someone from a
 * workspace or signing out a stolen laptop takes effect on the next request. The
 * cost is a query per request, which for an authenticated dashboard is nothing.
 *
 * Adding passwords did **not** change this, and that took one deliberate piece
 * of work — see "Credentials and database sessions" below. The easy path was to
 * switch `strategy` to `"jwt"`, because that is what Auth.js's credentials
 * provider assumes, and it would have silently traded away revocation.
 *
 * ## Cookies are host-only, and that is load-bearing
 *
 * The app will live on `app.endpointforms.com`. Customer forms render on
 * `endpointforms.app` — **a separate registrable domain**, which is the entire
 * reason that domain exists (`docs/05` §4.4). Our session cookie must never
 * travel with customer form traffic, and the marketing apex carries ad pixels
 * that must never be able to read it.
 *
 * Auth.js sets host-only cookies by default. The `cookies` block below sets no
 * `domain` **on purpose** and says so, because the failure mode of adding
 * `domain: ".endpointforms.com"` later is silent: everything keeps working, and
 * an architectural decision has been undone with nothing to show for it.
 */

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

const THIRTY_DAYS = 30 * 24 * 60 * 60;
const FIFTEEN_MINUTES = 15 * 60;

/** Verbatim, so it cannot be quietly changed while still reading as "the default". */
const HOST_ONLY = { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" } as const;

const EMAIL_FROM = process.env.AUTH_EMAIL_FROM ?? "Endpoint Forms <login@endpointforms.com>";

/** The provider id the sign-in form posts to, and the marker the encoder checks for. */
export const PASSWORD_PROVIDER_ID = "password";

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

/**
 * Refused because too many attempts have been made, rather than because the
 * password was wrong.
 *
 * `code` ends up in a query string, so it must not hint at anything sensitive.
 * "rate-limited" does not: the windows in `src/lib/auth/rate-limit.ts` count
 * attempts, never outcomes, so being throttled says nothing about whether the
 * address has an account.
 */
class RateLimitedSignin extends CredentialsSignin {
  code = "rate-limited";
}

/**
 * Email and password.
 *
 * `authorize` returns `null` for every kind of failure — no such user, no
 * password on the account, wrong password — and `src/lib/auth/account.ts` makes
 * sure all three take the same time as well as returning the same thing.
 *
 * The rate limit lives here rather than in the Server Action so that a script
 * posting straight at `/api/auth/callback/password` is counted exactly like the
 * form is. An action-level check would guard the front door and leave the back
 * one open.
 *
 * Nothing in here logs the password, and nothing puts it in an error. The only
 * thing that ever sees it is argon2.
 */
const password = Credentials({
  id: PASSWORD_PROVIDER_ID,
  name: "Email and password",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials, request) {
    const email = typeof credentials?.email === "string" ? credentials.email : "";
    const secret = typeof credentials?.password === "string" ? credentials.password : "";

    // Shape only. Length and content rules belong to sign-up: applying them at
    // sign-in would refuse an old password faster than it refuses a new one,
    // which is a timing oracle wearing a validation costume.
    if (!email.includes("@") || secret.length === 0) return null;

    const ipHash = hashIpForAuth(clientIpFromHeaders(request.headers));
    const result = await verifyCredentials(email, secret, ipHash);

    if (!result.ok) {
      if (result.reason === "rate-limited") throw new RateLimitedSignin();
      return null;
    }

    return result.user;
  },
});

// ---------------------------------------------------------------------------
// Magic link
// ---------------------------------------------------------------------------

/**
 * Magic link, with no mail dependency.
 *
 * Demoted below the password form but still registered, because it is already
 * built, it costs nothing to keep, and it is the only way into an account whose
 * password has been forgotten until password reset exists (#41).
 *
 * Auth.js's built-in email provider is `nodemailer`, which drags in an SMTP
 * client and a provider decision. Destinations (#41) is where email transport
 * gets chosen properly; picking one here to send six sign-in links a week would
 * pre-empt that with the wrong constraints.
 *
 * So the link goes to the server console in development. In production that is
 * an account-takeover primitive — anyone who can read logs can sign in as
 * anyone — so it **refuses** rather than degrading, and refuses loudly enough
 * that the person who deployed it finds out immediately instead of a user being
 * told to check an inbox nothing was sent to.
 */
const magicLink: EmailConfig = {
  id: "magic-link",
  type: "email",
  name: "Email",
  from: EMAIL_FROM,
  maxAge: FIFTEEN_MINUTES,
  options: {},
  async sendVerificationRequest({ identifier, url, expires }) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "No email transport is configured, so the magic link cannot be delivered. " +
          "Wire one up before enabling email sign-in in production (#41). " +
          "Refusing to log a sign-in link to the console: anyone who can read the logs could use it.",
      );
    }

    const minutes = Math.round((expires.getTime() - Date.now()) / 60_000);
    console.log(
      [
        "",
        "  ┌─ sign-in link ──────────────────────────────────────────────────",
        `  │  to:      ${identifier}`,
        `  │  expires: in ${minutes} minutes`,
        "  │",
        `  │  ${url}`,
        "  └─────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
  },
};

/**
 * Google is optional in development. Without it the sign-in page shows the
 * password form only, rather than a button that fails after a redirect — a dead
 * end is a worse first run than a missing option.
 */
const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const providers: Provider[] = [
  password,
  magicLink,
  ...(googleConfigured
    ? [
        Google({
          /**
           * Someone who signed in with a password and later clicks "Continue
           * with Google" is the same person, and the default behaviour —
           * `OAuthAccountNotLinked` — strands them with no way forward.
           *
           * The flag is named "dangerous" because linking on an email address a
           * provider never verified lets an attacker claim an account by
           * asserting someone else's address. The `signIn` callback below closes
           * exactly that hole: a Google profile whose `email_verified` is not
           * true is refused outright, so linking only ever happens on an address
           * Google has confirmed.
           */
          allowDangerousEmailAccountLinking: true,
        }),
      ]
    : []),
];

const adapter = DrizzleAdapter(unsafeDb, {
  usersTable: users,
  accountsTable: authAccounts,
  sessionsTable: authSessions,
  verificationTokensTable: authVerificationTokens,
});

/**
 * The marker `callbacks.jwt` sets and `jwt.encode` demands. Not a security
 * boundary — it is a tripwire. See below.
 */
const FROM_CREDENTIALS = "endpointforms.credentialsSignIn";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  adapter,

  session: {
    strategy: "database",
    maxAge: THIRTY_DAYS,
    // Only touch the session row once a day rather than on every request.
    updateAge: 24 * 60 * 60,
  },

  /**
   * ## Credentials and database sessions
   *
   * Auth.js does not support the combination. Its credentials branch
   * (`@auth/core/lib/actions/callback/index.js`) is the one sign-in path that is
   * **not** wrapped in `if (useJwtSession)`: whatever the configured strategy,
   * it calls `jwt.encode()` and puts the result in the session cookie. With
   * `strategy: "database"` that cookie is then handed to
   * `adapter.getSessionAndUser()`, which finds no row, deletes the cookie, and
   * signs the person straight back out. `assert.js` only raises
   * `UnsupportedStrategy` when the providers are credentials-*only*, so with
   * Google and magic link alongside it there is no warning at all — it simply
   * does not work.
   *
   * The two ways out were to switch to JWT sessions, or to make `encode`
   * produce something the database strategy understands. The first trades away
   * revocation, which is the reason database sessions were chosen and is worth
   * more than the convenience. So: `encode` mints a real session row through the
   * same adapter every other provider uses, and returns its opaque token. The
   * cookie ends up holding exactly what a magic-link sign-in would have put
   * there, and `auth()`, `signOut()`, expiry and `updateAge` all carry on
   * knowing nothing about any of this.
   *
   * **Why this is safe to do:** under `strategy: "database"` every other call
   * site of `jwt.encode` and every call site of `jwt.decode` in `@auth/core` is
   * behind a `sessionStrategy === "jwt"` check. The credentials branch is the
   * only one that reaches these functions, which is what makes overriding them
   * a targeted change rather than a global one.
   *
   * **And if that stops being true**, the marker below turns a silent, dangerous
   * regression — a stray `encode` call minting a session for whatever token it
   * was handed — into a loud one. `callbacks.jwt` stamps `FROM_CREDENTIALS` when
   * and only when the account being signed in is the password provider's;
   * `encode` refuses anything without it. A future Auth.js that calls `encode`
   * from somewhere new throws here instead of issuing a session.
   */
  jwt: {
    async encode({ token }) {
      if (!token || token[FROM_CREDENTIALS] !== true) {
        throw new Error(
          "jwt.encode was reached from something other than the password provider. " +
            "Sessions are database rows here (session.strategy is 'database'), so a JWT " +
            "in the session cookie would be rejected on the next request. See src/auth.ts.",
        );
      }

      const userId = typeof token.sub === "string" ? token.sub : null;
      if (!userId) throw new Error("jwt.encode: credentials sign-in produced no user id.");

      // 256 bits. Opaque, and the only thing standing between a stolen cookie
      // and an account, so it is generated the same way every other secret in
      // this codebase is rather than from anything derived.
      const sessionToken = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + THIRTY_DAYS * 1000);

      // Not `?.()`. The adapter is constructed above and always has this, but an
      // optional call that silently did nothing would hand back a token with no
      // row behind it — a cookie that signs the person straight back out, which
      // is exactly the failure this whole override exists to avoid.
      if (!adapter.createSession) {
        throw new Error("The Drizzle adapter has no createSession. See src/auth.ts.");
      }
      await adapter.createSession({ sessionToken, userId, expires });

      return sessionToken;
    },

    /**
     * Never called under `strategy: "database"` — every `jwt.decode` call site
     * in `@auth/core` is behind a JWT-strategy check. It throws rather than
     * returning null so that "this was reached" is a crash with a stack trace
     * rather than a mysterious signed-out user.
     */
    async decode() {
      throw new Error(
        "jwt.decode was called, which cannot happen while session.strategy is 'database'. " +
          "See src/auth.ts.",
      );
    },
  },

  /**
   * No `domain` on any of these. See the note at the top of the file — this is
   * the one setting in the app that must never gain a value.
   */
  cookies: {
    sessionToken: { name: `${process.env.NODE_ENV === "production" ? "__Secure-" : ""}authjs.session-token`, options: HOST_ONLY },
    callbackUrl: { name: `${process.env.NODE_ENV === "production" ? "__Secure-" : ""}authjs.callback-url`, options: HOST_ONLY },
    csrfToken: { name: `${process.env.NODE_ENV === "production" ? "__Host-" : ""}authjs.csrf-token`, options: HOST_ONLY },
  },

  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    error: "/login/error",
  },

  callbacks: {
    signIn({ account, profile }) {
      // The other half of `allowDangerousEmailAccountLinking`. Without this
      // check the flag lives up to its name.
      if (account?.provider === "google") return profile?.email_verified === true;
      return true;
    },

    jwt({ token, account }) {
      // Reached only on the credentials path under `strategy: "database"`. The
      // stamp is what `jwt.encode` above requires; see the long note there.
      if (account?.provider === PASSWORD_PROVIDER_ID) {
        return { ...token, [FROM_CREDENTIALS]: true };
      }
      return token;
    },

    session({ session, user }) {
      // Every workspace query starts from this id, so it has to be on the
      // session object rather than looked up again by email.
      session.user.id = user.id;
      return session;
    },
  },

  // Trusts the deployment's own host header. Vercel sets this implicitly; a
  // self-hoster behind a proxy (#46) needs AUTH_TRUST_HOST=true.
  trustHost: true,
});

/** Whether "Continue with Google" should be offered at all. */
export const googleSignInAvailable = googleConfigured;

/**
 * Whether the sign-in page should offer the magic link.
 *
 * False in production until #41: the provider throws rather than delivering, and
 * offering a button that always errors is worse than not offering it.
 */
export const magicLinkAvailable = process.env.NODE_ENV !== "production";
