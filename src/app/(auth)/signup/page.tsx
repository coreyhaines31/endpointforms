import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleSignInForm, SignUpForm } from "@/components/app/forms";
import { googleSignInAvailable } from "@/auth";
import { currentUser } from "@/lib/auth/session";
import { safeNextPath } from "@/actions/form-state";

/**
 * Create an account.
 *
 * A real page now. `/signup` used to 308 to `/login`, because the first magic
 * link both created the account and signed it in and there was nothing for a
 * separate page to do. A password has to be chosen, and choosing one is not the
 * same screen as typing one you already have.
 *
 * It lands on `/app`, which sends an account with no workspaces to `/app/new` —
 * so the next thing a new account sees is workspace creation, which is the only
 * thing it can usefully do.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);

  if (await currentUser()) redirect(next);

  const loginHref = rawNext ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <>
      <h1 className="text-h2">Create your account</h1>
      <p className="mt-3 text-base text-muted-foreground">
        Already have one?{" "}
        <Link
          href={loginHref}
          className="rounded-sm text-foreground underline underline-offset-4 decoration-border-control hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Sign in
        </Link>
        .
      </p>

      <div className="mt-8">
        <SignUpForm next={next} />
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
    </>
  );
}
