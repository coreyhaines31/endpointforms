import Link from "next/link";

/**
 * Auth.js's error page.
 *
 * The codes it passes are internal names; each one gets a sentence that says
 * what happened and what to do. Anything unrecognised falls through to a plain
 * "try again" rather than rendering a raw enum at someone.
 */
const MESSAGES: Record<string, string> = {
  Verification:
    "That sign-in link has already been used or has expired. Links are good for one sign-in, for 15 minutes.",
  AccessDenied:
    "We couldn’t verify that account. Google sign-in needs an address Google has confirmed.",
  Configuration:
    "Sign-in isn’t configured correctly on the server. This one is ours, not yours.",
  OAuthAccountNotLinked:
    "That email address is already signed in with a different method. Use the one you started with.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    (error && MESSAGES[error]) ??
    "Something went wrong signing you in. Try again in a moment.";

  return (
    <>
      <h1 className="text-h2">Couldn’t sign you in</h1>
      <p className="mt-4 text-base text-muted-foreground">{message}</p>

      <p className="mt-8">
        <Link
          href="/login"
          className="inline-flex h-11 items-center rounded-md border border-border-control px-4 text-base font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Back to sign in
        </Link>
      </p>
    </>
  );
}
