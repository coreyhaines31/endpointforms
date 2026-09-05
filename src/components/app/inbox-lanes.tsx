import Link from "next/link";

import { filtersToSearchParams } from "@/lib/workspaces/submissions";
import type { SubmissionFilters } from "@/lib/workspaces/types";

/**
 * The two lanes of the inbox, and their two counts (#37).
 *
 * ## The one rule this component exists to enforce
 *
 * **The numbers are never added up.** They are drawn side by side, each labelled
 * with what it counts, and the sentence under the partials lane says out loud
 * that it is not a submission count. A single "1,204 leads" that quietly folded
 * in people who never pressed submit would move every figure a customer has
 * already learned to read — the inbox headline, the endpoint list, and Yield's
 * denominator, which is submissions and only submissions.
 *
 * That is a discipline the data model already enforces (two tables, no query
 * that spans them), and this is where it has to hold on screen as well, because
 * a screen is where a customer forms the belief.
 *
 * Plain links carrying the current filters, so switching lanes keeps the
 * endpoint, the dates and the search — and so every combination is a URL, which
 * is what the filter bar beside it already promises.
 */
export function InboxLanes({
  slug,
  filters,
  submissionCount,
  partialCount,
}: {
  slug: string;
  filters: SubmissionFilters;
  submissionCount: number;
  partialCount: number;
}) {
  const href = (lane: SubmissionFilters["lane"]) => {
    const params = filtersToSearchParams({ ...filters, lane }, { page: 1 });
    const query = params.toString();
    return `/app/${slug}/submissions${query ? `?${query}` : ""}`;
  };

  return (
    <nav aria-label="Inbox" className="mt-6 flex flex-wrap gap-3">
      <Lane
        href={href("submissions")}
        current={filters.lane === "submissions"}
        count={submissionCount}
        label="Submitted"
        note="Counted, and in Yield"
      />
      <Lane
        href={href("partials")}
        current={filters.lane === "partials"}
        count={partialCount}
        label="Unfinished"
        note="Not counted anywhere"
      />
    </nav>
  );
}

function Lane({
  href,
  current,
  count,
  label,
  note,
}: {
  href: string;
  current: boolean;
  count: number;
  label: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`flex min-w-[11rem] flex-col rounded-md border px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        current
          ? "border-foreground bg-sunken"
          : "border-border-control hover:bg-sunken"
      }`}
    >
      <span className="text-h3 tabular-nums text-foreground">
        {count.toLocaleString("en-GB")}
      </span>
      <span className="mt-1 text-sm font-medium text-foreground">{label}</span>
      {/* The half of the label that stops the two numbers reading as one total.
          It is not a caption to be trimmed later; it is the claim. */}
      <span className="mt-0.5 text-sm text-muted-foreground">{note}</span>
    </Link>
  );
}
