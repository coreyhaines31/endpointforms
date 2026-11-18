"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A primary nav link that knows which section you are in. The current one
 * gets `aria-current="page"` and a hairline underline; hovering any other
 * draws the same line from the left, so the indicator and the hover are one
 * idea rather than two.
 */
export function NavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "relative rounded-sm whitespace-nowrap text-sm text-muted-foreground transition-colors duration-(--dur-quick) hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring aria-[current=page]:text-foreground",
        "after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-(--dur-base) after:ease-enter hover:after:scale-x-100 aria-[current=page]:after:scale-x-100",
        className,
      )}
    >
      {children}
    </Link>
  );
}
