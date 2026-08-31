"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { formError, safeNextPath, type FormState } from "@/actions/form-state";

const emailSchema = z.string().trim().min(1).max(320).pipe(z.email());

const MESSAGES = {
  empty: "Enter your email address.",
  invalid: "That doesn’t look like an email address.",
  failed: "That didn’t go through. Try again in a moment.",
} as const;

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
    return formError(raw.length === 0 ? MESSAGES.empty : MESSAGES.invalid);
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
