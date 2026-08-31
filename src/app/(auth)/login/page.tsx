import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleSignInForm, MagicLinkForm, PasswordSignInForm } from "@/components/app/forms";
import { googleSignInAvailable, magicLinkAvailable } from "@/auth";
import { currentUser } from "@/lib/auth/session";
import { safeNextPath } from "@/actions/form-state";

/**
 * Sign in.
 *
 * Email and password is the form on the page. Google is a button under it. The
 * magic link is behind a disclosure, because it is a real option and a small
 * one: two visible email fields on one screen is a page asking someone to work
 * out which one they meant.
 *
 * There is **no "forgot password" link**, because there is nothing behind one —
 * a reset needs a mail transport (#41). A link to a dead end is worse than the
 * plain sentence below, which at least says what the situation is.
 */
/**
 * Auth.js bounces a failed credentials sign-in back here with `?error=` rather
 * than to `/login/error`, because a `CredentialsSignin` is `kind: "signIn"`.
 * The form's own message covers the ordinary case; this covers arriving here by
 * redirect — a direct POST, or a stale form — where otherwise the page would
 * render as if nothing had happened.
 *
 * `code=credentials` deliberately says no more than the form does. See the note
 * at the top of `src/actions/auth.ts`.
 */
function redirectedError(error?: string, code?: string): string | null {
  if (!error) return null;
  if (error === "CredentialsSignin") {
    return code === "rate-limited"
      ? "Too many sign-in attempts. Wait a few minutes and try again."
      : "That email and password don’t match an account.";
  }
  if (error === "MissingCSRF") {
    return "That sign-in form had gone stale. Try again.";
  }
  return "Something went wrong signing you in. Try again.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; code?: string }>;
}) {
  const { next: rawNext, error, code } = await searchParams;
  const next = safeNextPath(rawNext);
  const redirected = redirectedError(error, code);

  // Already signed in — send them on rather than showing a form that would
  // sign them in as the person they already are.
  if (await currentUser()) redirect(next);

  const signupHref = rawNext ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  return (
    <>
      <h1 className="text-h2">Sign in</h1>
      <p className="mt-3 text-base text-muted-foreground">
        No account yet?{" "}
        <Link
          href={signupHref}
          className="rounded-sm text-foreground underline underline-offset-4 decoration-border-control hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Create one
        </Link>
        .
      </p>

      {redirected ? (
        <p
          role="status"
          className="mt-6 rounded-md border border-destructive bg-destructive-surface px-4 py-3 text-sm text-destructive"
        >
          {redirected}
        </p>
      ) : null}

      <div className="mt-8">
        <PasswordSignInForm next={next} />
      </div>

      {googleSignInAvailable ? (
        <>
          <div className="my-7 flex items-center gap-4">
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono text-label uppercase text-subtle-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <GoogleSignInForm next={next} />
        </>
      ) : null}

      {magicLinkAvailable ? (
        <details className="group mt-8 border-t border-border pt-6">
          <summary className="cursor-pointer list-none rounded-sm text-sm text-muted-foreground underline underline-offset-4 decoration-border-control hover:text-foreground hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Email me a sign-in link instead
          </summary>
          <div className="mt-5">
            <MagicLinkForm next={next} />
          </div>
        </details>
      ) : null}

      <p className="mt-8 text-sm text-muted-foreground">
        There’s no password reset yet. It needs email, and email isn’t set up.
      </p>
    </>
  );
}
