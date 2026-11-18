"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The header's "Join the waitlist". Everywhere else it goes to the waitlist
 * section at the bottom of the homepage. On the homepage itself the hero form
 * is already in the first screen, so it goes there instead of scrolling
 * 6,000px past it, and puts the cursor in the email field.
 */
export function WaitlistLink({ className }: { className?: string }) {
  const home = usePathname() === "/";

  return (
    <Link
      href={home ? "#hero-waitlist" : "/#waitlist"}
      onClick={() => {
        if (!home) return;
        document.querySelector<HTMLInputElement>("#hero-waitlist input[type=email]")?.focus({
          preventScroll: true,
        });
      }}
      className={className}
    >
      Join the waitlist
    </Link>
  );
}
