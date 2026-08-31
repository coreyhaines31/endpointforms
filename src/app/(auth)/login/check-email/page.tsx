import Link from "next/link";

/**
 * Where Auth.js sends someone after a magic link is requested.
 *
 * It deliberately does not name the address, and it does not say whether an
 * account existed — the same screen appears either way. In development the link
 * is in the server console, and saying so here is what keeps a first run from
 * being a dead end.
 */
export default function CheckEmailPage() {
  return (
    <>
      <h1 className="text-h2">Check your email</h1>
      <p className="mt-4 text-base text-muted-foreground">
        If that address belongs to an account, a sign-in link is on its way. It
        expires in 15 minutes.
      </p>

      {process.env.NODE_ENV === "production" ? null : (
        <div className="mt-8 rounded-md border border-border bg-sunken p-4">
          <p className="font-mono text-label uppercase text-muted-foreground">
            Development
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            No mail is configured yet, so the link was printed to the server
            console — look in the terminal running <code className="font-mono">npm run dev</code>.
          </p>
        </div>
      )}

      <p className="mt-8 text-sm text-muted-foreground">
        <Link
          href="/login"
          className="rounded-sm underline underline-offset-4 decoration-border-control hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Use a different address
        </Link>
      </p>
    </>
  );
}
