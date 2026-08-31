import Link from "next/link";
import type { Metadata } from "next";

import { LogoLockup } from "@/components/logo";

/**
 * Sign-in.
 *
 * Its own shell rather than the marketing chrome: a header offering "Join the
 * waitlist" above a sign-in form is the site arguing with itself. The logo still
 * links home, because someone who landed here by accident needs a way out.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center px-[5%] py-[clamp(3rem,9vw,6rem)]">
      <Link
        href="/"
        aria-label="Endpoint Forms — home"
        className="rounded-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <LogoLockup className="h-6 w-auto" />
      </Link>

      <div className="mt-12 w-full max-w-[26rem]">{children}</div>
    </div>
  );
}
