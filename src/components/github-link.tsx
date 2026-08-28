import { GITHUB_REPO, GITHUB_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The single highest-value nav element a pre-launch open-source project has,
 * and 1 of the 9 sites in the teardown uses it (docs/05 §8.1). The count is
 * live and revalidates hourly; if GitHub is unreachable we render the link
 * without a number rather than a stale or invented one.
 */
async function getStars(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      next: { revalidate: 3600 },
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const stars = (data as { stargazers_count?: unknown }).stargazers_count;
    return typeof stars === "number" ? stars : null;
  } catch {
    return null;
  }
}

type GithubLinkProps = {
  className?: string;
  /** Hides the word "GitHub" below `sm`, where the header runs out of room. */
  compact?: boolean;
};

export async function GithubLink({ className, compact }: GithubLinkProps) {
  const stars = await getStars();
  const count = stars === null ? null : stars.toLocaleString("en-US");

  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={
        count === null
          ? "GitHub repository (opens in a new tab)"
          : `GitHub repository, ${count} stars (opens in a new tab)`
      }
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border-control px-3 text-sm text-foreground transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-4 fill-current" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
      <span className={cn(compact && "hidden sm:inline")} aria-hidden="true">
        GitHub
      </span>
      {count === null ? null : (
        <span className="font-mono text-label tabular text-muted-foreground" aria-hidden="true">
          {count}
        </span>
      )}
    </a>
  );
}
