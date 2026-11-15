import { Container } from "@/components/container";
import { cn } from "@/lib/utils";

/**
 * Placeholder shapes for a page that is still loading. They take the same
 * room as the content they stand in for, so nothing jumps when it arrives.
 * The pulse is opacity only and stops under reduced motion (globals.css).
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-sm bg-muted", className)} />;
}

/**
 * The shape every workspace page shares: eyebrow, title, a line of context,
 * then a panel of rows. Fades in after 150ms, so a fast navigation shows the
 * old page straight to the new one with no grey flash in between.
 */
export function PageSkeleton() {
  return (
    <Container className="pt-10">
      <div
        role="status"
        aria-live="polite"
        className="animate-rise [animation-delay:150ms]"
      >
        <span className="sr-only">Loading</span>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-5 h-8 w-72 max-w-full" />
        <Skeleton className="mt-4 h-4 w-96 max-w-full" />

        <div className="mt-10 rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2.5 h-3.5 w-80 max-w-full" />
          </div>
          {[0, 1, 2, 3, 4].map((row) => (
            <div
              key={row}
              className="flex items-center gap-6 border-b border-border px-5 py-4 last:border-b-0"
            >
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="hidden h-5 w-16 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}
