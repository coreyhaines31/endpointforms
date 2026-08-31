import Link from "next/link";

import type { EndpointListItem, SubmissionFilters } from "@/lib/workspaces/types";

/**
 * The inbox's filter bar.
 *
 * A plain `<form method="get">` and no client JavaScript at all. Filtering by
 * navigating means every combination is a URL — bookmarkable, shareable, and
 * the back button does what it looks like it does. It also means the export
 * button beside it can be an ordinary link carrying the same query string,
 * which is how "the CSV matches what I am looking at" stops being a promise and
 * becomes the same code path.
 *
 * The cost is a deliberate Apply button rather than filtering as you type. For a
 * screen whose whole job is answering "where did these leads come from", a query
 * that only runs when you say so is the right trade.
 */

const ORIGINS = [
  { value: "human", label: "Human" },
  { value: "agent", label: "Agent" },
  { value: "unverified", label: "Unverified" },
] as const;

const VERDICTS = [
  { value: "awaiting", label: "Awaiting" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "disqualified", label: "Disqualified" },
] as const;

export function SubmissionFilterBar({
  slug,
  filters,
  endpoints,
  active,
}: {
  slug: string;
  filters: SubmissionFilters;
  endpoints: EndpointListItem[];
  active: boolean;
}) {
  // The end date is held exclusive — the day after the one typed — so the input
  // has to show the day back. See `parseSubmissionFilters`.
  const toValue = filters.to ? shiftDay(filters.to, -1) : "";

  return (
    <form method="get" className="px-5 py-5">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col text-sm font-medium text-foreground">
          Search values
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="dana@, mailinator, /pricing"
            className="mt-2 h-10 w-full min-w-0 rounded-md border border-border-control bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </label>

        <label className="flex flex-col text-sm font-medium text-foreground">
          Endpoint
          <select
            name="endpoint"
            defaultValue={filters.endpointPublicId ?? ""}
            className="mt-2 h-10 w-full rounded-md border border-border-control bg-card pl-3 pr-9 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <option value="">All endpoints</option>
            {endpoints.map((endpoint) => (
              <option key={endpoint.publicId} value={endpoint.publicId}>
                {endpoint.name}
                {endpoint.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-sm font-medium text-foreground">
          From
          <input
            type="date"
            name="from"
            defaultValue={filters.from ? filters.from.toISOString().slice(0, 10) : ""}
            className="mt-2 h-10 w-full rounded-md border border-border-control bg-card px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </label>

        <label className="flex flex-col text-sm font-medium text-foreground">
          To
          <input
            type="date"
            name="to"
            defaultValue={toValue}
            className="mt-2 h-10 w-full rounded-md border border-border-control bg-card px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </label>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <CheckGroup
          legend="Origin"
          name="origin"
          options={ORIGINS}
          selected={filters.origin as readonly string[]}
        />
        <CheckGroup
          legend="Verdict"
          name="verdict"
          options={VERDICTS}
          selected={filters.verdict as readonly string[]}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="signal-fill inline-flex h-10 items-center rounded-md px-4 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Apply filters
        </button>

        {active ? (
          <Link
            href={`/app/${slug}/submissions`}
            className="inline-flex h-10 items-center rounded-md border border-border-control px-4 text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function CheckGroup({
  legend,
  name,
  options,
  selected,
}: {
  legend: string;
  name: string;
  options: readonly { value: string; label: string }[];
  selected: readonly string[];
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="font-mono text-label uppercase text-muted-foreground">
        {legend}
      </legend>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors has-[:checked]:border-border-control has-[:checked]:bg-sunken has-[:checked]:text-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
          >
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={selected.includes(option.value)}
              className="size-3.5 accent-foreground"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function shiftDay(value: Date, days: number): string {
  const shifted = new Date(value);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
