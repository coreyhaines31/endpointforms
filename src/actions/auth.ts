"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CredentialsSignin } from "next-auth";
import { z } from "zod";

import { PASSWORD_PROVIDER_ID, signIn, signOut } from "@/auth";
import { formError, safeNextPath, type FormState } from "@/actions/form-state";
import { createUserWithPassword } from "@/lib/auth/account";
import { clientIpFromHeaders, hashIpForAuth } from "@/lib/auth/rate-limit";
import { MAX_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

/**
 * Sign in, sign up, sign out.
 *
 * The rule that shapes this file: **nothing here ever tells the caller whether
 * an email address has an account.** Not through the message, not through which
 * field is marked invalid, and not through how long the answer takes — the last
 * one is handled a layer down, in `src/lib/auth/account.ts`, because it is the
 * one that cannot be fixed by choosing better wording.
 *
 * The one deliberate exception is sign-up, which has to say "that address is
 * taken" or leave someone stuck on a form that will never work. Why that trade
 * is the right one, and what closes it, is written out in `account.ts`.
 *
 * A password is never logged, never put in an error, and never returned. The
 * only thing in the process that sees one is argon2.
 */

const emailSchema = z.string().trim().min(1).max(320).pipe(z.email());

const MESSAGES = {
  emailEmpty: "Enter your email address.",
  emailInvalid: "That doesn’t look like an email address.",
  passwordEmpty: "Enter your password.",
  passwordTooLong: `That password is longer than ${MAX_PASSWORD_LENGTH} characters.`,
  /**
   * One sentence for every way a sign-in can fail on the credentials
   * themselves. "No account with that address", "that account uses Google" and
   * "wrong password" are all this, and they have to be, or the wording becomes
   * the oracle the timing work exists to remove.
   */
  invalidCredentials: "That email and password don’t match an account.",
  rateLimited: "Too many sign-in attempts. Wait a few minutes and try again.",
  emailTaken: "That address already has an account. Sign in instead.",
  failed: "That didn’t go through. Try again in a moment.",
} as const;

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

/**
 * Signs in with an email and a password.
 *
 * The password is checked in `authorize()` in `src/auth.ts`, not here — that is
 * what makes a script posting straight at `/api/auth/callback/password` subject
 * to the same rate limit as this form. This action's job is to turn the outcome
 * into a sentence.
 *
 * `redirect: false` so Auth.js hands the URL back instead of throwing its own
 * redirect. Left to itself the browser lands on an internal API path, which
 * renders the right page under the wrong address — the same reason the magic
 * link below passes it.
 */
export async function signInWithPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const rawEmail = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) {
    return formError(rawEmail.trim().length === 0 ? MESSAGES.emailEmpty : MESSAGES.emailInvalid);
  }
  // Shape checks only. The length *floor* is not applied here on purpose: a
  // password set before the floor existed must still sign in, and refusing a
  // short one without hashing it would answer faster than a wrong long one.
  if (password.length === 0) return formError(MESSAGES.passwordEmpty);
  if (password.length > MAX_PASSWORD_LENGTH) return formError(MESSAGES.invalidCredentials);

  const next = safeNextPath(formData.get("next"));

  try {
    await signIn(PASSWORD_PROVIDER_ID, {
      email: email.data,
      password,
      redirectTo: next,
      redirect: false,
    });
  } catch (error) {
    if (isRedirect(error)) throw error;
    return formError(signInFailureMessage(error));
  }

  redirect(next);
}

/**
 * Creates an account with a password and signs it in.
 *
 * Lands on `/app`, which sends someone with no workspaces to `/app/new` — so
 * the first thing a new account sees is workspace creation, which is the only
 * thing it can usefully do.
 *
 * The sign-in immediately after costs a second argon2 verification. That is
 * deliberate: minting the session here instead would be a second place in the
 * codebase that creates sessions, and the two would drift.
 */
export async function signUpWithPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const rawEmail = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) {
    return formError(rawEmail.trim().length === 0 ? MESSAGES.emailEmpty : MESSAGES.emailInvalid);
  }
  if (password.length === 0) return formError(MESSAGES.passwordEmpty);
  if (password.length > MAX_PASSWORD_LENGTH) return formError(MESSAGES.passwordTooLong);

  const ipHash = hashIpForAuth(clientIpFromHeaders(await headers()));
  const created = await createUserWithPassword(email.data, password, ipHash);

  if (!created.ok) {
    if (created.reason === "invalid-password") return formError(created.message);
    if (created.reason === "rate-limited") return formError(MESSAGES.rateLimited);
    return formError(MESSAGES.emailTaken);
  }

  const next = safeNextPath(formData.get("next"));

  try {
    await signIn(PASSWORD_PROVIDER_ID, {
      email: email.data,
      password,
      redirectTo: next,
      redirect: false,
    });
  } catch (error) {
    if (isRedirect(error)) throw error;
    // The account exists; only the session did not get made. Say so plainly and
    // send them to sign in rather than implying the sign-up failed and inviting
    // them to do it again, which would now hit "that address is taken".
    return formError("Your account was created, but signing you in didn’t work. Try signing in.");
  }

  redirect(next);
}

// ---------------------------------------------------------------------------
// Magic link and Google
// ---------------------------------------------------------------------------

/**
 * Sends a magic link.
 *
 * Auth.js throws a redirect on success, which is how a Server Action navigates —
 * so this function only ever *returns* on failure. `NEXT_REDIRECT` has to be
 * rethrown rather than swallowed by the catch, or the redirect never happens and
 * the person sits on a form that looks like it did nothing.
 *
 * The response is the same whether or not the address has an account. Telling a
 * stranger which of their guesses are real users is a free membership list.
 */
export async function requestMagicLink(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? ""));

  if (!parsed.success) {
    const raw = String(formData.get("email") ?? "").trim();
    return formError(raw.length === 0 ? MESSAGES.emailEmpty : MESSAGES.emailInvalid);
  }

  const next = safeNextPath(formData.get("next"));

  try {
    // `redirect: false` so Auth.js hands the URL back instead of throwing its
    // own redirect at `/api/auth/verify-request`. Left to itself it lands the
    // browser on that API path — the right page renders, but the address bar
    // shows an internal endpoint, and anything reading the pathname (the
    // marketing chrome, for one) sees a route that is not the one on screen.
    await signIn("magic-link", { email: parsed.data, redirectTo: next, redirect: false });
  } catch (error) {
    if (isRedirect(error)) throw error;
    console.error("magic link sign-in failed", error);
    return formError(MESSAGES.failed);
  }

  redirect("/login/check-email");
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  await signIn("google", { redirectTo: safeNextPath(formData.get("next")) });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

// ---------------------------------------------------------------------------

/**
 * Turns a failed `signIn` into a sentence.
 *
 * Only the throttle is distinguishable, and only because being told to wait is
 * the difference between "try again" and "stop typing" for someone who has
 * genuinely forgotten their password. It reveals nothing: the windows in
 * `src/lib/auth/rate-limit.ts` count attempts, never outcomes.
 *
 * Nothing is logged here. Auth.js already logs the failure server-side, and an
 * extra `console.error(error)` on a path whose *inputs* are a live password is
 * how one ends up in a log aggregator by accident.
 */
function signInFailureMessage(error: unknown): string {
  if (error instanceof CredentialsSignin) {
    return error.code === "rate-limited" ? MESSAGES.rateLimited : MESSAGES.invalidCredentials;
  }
  return MESSAGES.failed;
}

/** Next signals navigation from inside a Server Action by throwing. */
function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
