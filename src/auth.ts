import "server-only";

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import type { EmailConfig, Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";

import { unsafeDb } from "@/db/client";
import { authAccounts, authSessions, authVerificationTokens, users } from "@/db/schema";

/**
 * Authentication (#34).
 *
 * Two ways in, both of which prove control of an email address, and neither of
 * which is a password:
 *
 * - **Magic link.** Possession of the inbox is the proof.
 * - **Google.** Google's own `email_verified` is the proof, and we check it
 *   rather than taking the sign-in at face value (see `signIn` below).
 *
 * `docs/20-product-plan.md` rules password auth out explicitly: it is a
 * liability — breach disclosure, reset flows, credential stuffing, a hashing
 * decision to get wrong — that a v1 B2B tool has no reason to take on.
 *
 * ---
 *
 * ## Sessions are in the database, not in a JWT
 *
 * A JWT cannot be revoked. With a session row, removing someone from a
 * workspace or signing out a stolen laptop takes effect on the next request. The
 * cost is a query per request, which for an authenticated dashboard is nothing.
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

/**
 * Magic link, with no mail dependency.
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
 * Google is optional in development. Without it the sign-in page shows the magic
 * link only, rather than a button that fails after a redirect — a dead end is a
 * worse first run than a missing option.
 */
const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const providers: Provider[] = [
  magicLink,
  ...(googleConfigured
    ? [
        Google({
          /**
           * Someone who signed in with a magic link and later clicks "Continue
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,

  adapter: DrizzleAdapter(unsafeDb, {
    usersTable: users,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  }),

  session: {
    strategy: "database",
    maxAge: THIRTY_DAYS,
    // Only touch the session row once a day rather than on every request.
    updateAge: 24 * 60 * 60,
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
