import { redirect } from "next/navigation";

import { GoogleSignInForm, MagicLinkForm } from "@/components/app/forms";
import { googleSignInAvailable } from "@/auth";
import { currentUser } from "@/lib/auth/session";
import { safeNextPath } from "@/actions/form-state";

/**
 * Sign in.
 *
 * There is no separate signup: the first magic link both creates the account and
 * signs it in, which is the whole benefit of not having passwords. `/signup`
 * redirects here (`src/proxy.ts`) so the vanity URL in `docs/05` §4.4 still
 * resolves.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);

  // Already signed in — send them on rather than showing a form that would
  // sign them in as the person they already are.
  if (await currentUser()) redirect(next);

  return (
    <>
      <h1 className="text-h2">Sign in</h1>
      <p className="mt-3 text-base text-muted-foreground">
        No password. We’ll email you a link that signs you in
        {googleSignInAvailable ? ", or you can use Google" : ""}.
      </p>

      <div className="mt-8">
        <MagicLinkForm next={next} />
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

      <p className="mt-8 text-sm text-muted-foreground">
        Signing in creates an account if you don’t have one.
      </p>
    </>
  );
}
