import Link from "next/link";

import { Container } from "@/components/container";
import { EmptyState, Panel, PanelHeader } from "@/components/app/panel";
import { ProvenanceChip } from "@/components/provenance-chip";
import { SubmissionFilterBar } from "@/components/app/submission-filters";
import { DataTable, Td, Th } from "@/components/app/table";
import { RelativeTime } from "@/components/app/time";
import { VerdictChip } from "@/components/app/verdict-chip";
import { describeSource, summariseValues } from "@/lib/submission-values";
import { listEndpointsWithStats } from "@/lib/workspaces/endpoints";
import { countPartialsMatching, listPartials } from "@/lib/workspaces/partials";
import { PartialsTable } from "@/components/app/partials-table";
import { InboxLanes } from "@/components/app/inbox-lanes";
import { requireWorkspace } from "@/lib/workspaces/server";
import {
  filtersToSearchParams,
  hasActiveFilters,
  listSubmissions,
  parseSubmissionFilters,
} from "@/lib/workspaces/submissions";

/**
 * The inbox (#40).
 *
 * The screen customers live in, and the one every complaint about "flying blind
 * after the lead form" is really about. Two rules run through it:
 *
 * 1. **The counts are the headline.** "142 submissions awaiting verdict" is the
 *    line `docs/02-messaging.md` §8 identified as the one that sells the product,
 *    so it is the first sentence on the page rather than a stat tile in a corner.
 * 2. **Export is never behind anything.** `docs/00` makes getting your data out a
 *    table stake, on every plan including free, so the buttons sit in the header
 *    beside the count and not in a settings screen.
 */
export default async function SubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { workspace } = await requireWorkspace(slug);

  const filters = parseSubmissionFilters(query);

  /**
   * Two lanes, and the count of the other one (#37).
   *
   * The partial count is fetched on both lanes and shown on both, and it is
   * **never added to the submission count**. That is the whole discipline of
   * this feature on this screen: somebody who filled in three screens of five
   * and left is a lead worth seeing, and is not a submission. A single merged
   * total would have quietly changed every number a customer had already
   * learned to read — including Yield's denominator, which is submissions and
   * nothing else.
   */
  const [page, endpoints, partialCount, partials] = await Promise.all([
    listSubmissions(workspace.id, filters),
    listEndpointsWithStats(workspace.id),
    countPartialsMatching(workspace.id, filters),
    filters.lane === "partials" ? listPartials(workspace.id, filters) : null,
  ]);
  const onPartials = filters.lane === "partials" && partials !== null;

  const filtered = hasActiveFilters(filters);
  // The export carries the same filters, minus the page — a file that stopped
  // at row 50 because that is where the screen stopped would be a quiet lie.
  const exportQuery = filtersToSearchParams(filters, { page: 1 });
  const exportHref = (format: "csv" | "json") => {
    const params = new URLSearchParams(exportQuery);
    params.set("format", format);
    return `/app/${workspace.slug}/submissions/export?${params.toString()}`;
  };

  const shown = onPartials ? partials : page;
  const lastPage = Math.max(1, Math.ceil(shown.total / shown.pageSize));
  const firstOnPage = shown.total === 0 ? 0 : (shown.page - 1) * shown.pageSize + 1;
  const lastOnPage = Math.min(shown.page * shown.pageSize, shown.total);

  return (
    <Container className="pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">
        {onPartials ? "Unfinished" : "Submissions"}
      </p>
      {onPartials ? (
        <>
          <h1 className="mt-4 text-h2">
            {partials.total === 0
              ? filtered
                ? "Nothing matches those filters"
                : "Nobody has left a form half-finished"
              : `${partials.total.toLocaleString("en-GB")} ${partials.total === 1 ? "person" : "people"} filled something in and stopped`}
          </h1>
          <p className="mt-3 max-w-[60ch] text-base text-muted-foreground">
            They completed at least one step of a multi-step form and never
            submitted it. <span className="text-foreground">None of them is
            counted as a submission</span>, here or in Yield — the numbers on the
            Submissions lane are unchanged by anything on this one.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-4 text-h2">
            {page.total === 0
              ? filtered
                ? "Nothing matches those filters"
                : "Nothing has arrived yet"
              : `${page.awaiting.toLocaleString("en-GB")} ${page.awaiting === 1 ? "submission awaits" : "submissions awaiting"} verdict`}
          </h1>

          {page.total > 0 ? (
            <p className="mt-3 max-w-[60ch] text-base text-muted-foreground">
              Out of {page.total.toLocaleString("en-GB")}{" "}
              {filtered ? "matching this filter" : "in this workspace"}. A submission
              awaits a verdict until something downstream says what it was worth — that
              is the number the split tests will eventually rank on.
            </p>
          ) : null}
        </>
      )}

      {/* The two counts, side by side and never summed. Hidden entirely when a
          workspace has never captured a partial, so a customer with no
          multi-step forms sees the screen they always saw. */}
      {partialCount > 0 || onPartials ? (
        <InboxLanes
          slug={workspace.slug}
          filters={filters}
          submissionCount={page.total}
          partialCount={partialCount}
        />
      ) : null}

      {/* Hidden only when the workspace has genuinely never received anything —
          two buttons that produce a header row and nothing else read as
          unconsidered. A filter that matches nothing still gets them: an empty
          result for a specific question is a real answer worth exporting. */}
      {shown.total > 0 || filtered ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ExportLink href={exportHref("csv")} format="CSV" />
          <ExportLink href={exportHref("json")} format="JSON" />
          <p className="text-sm text-muted-foreground">
            {onPartials
              ? "The unfinished ones too, on every plan. Exports are never paywalled."
              : "Everything shown here, on every plan. Exports are never paywalled."}
          </p>
        </div>
      ) : null}

      <Panel className="mt-6">
        <PanelHeader title="Filter" />
        <SubmissionFilterBar
          slug={workspace.slug}
          filters={filters}
          endpoints={endpoints}
          active={filtered}
        />
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title={
            shown.total === 0
              ? onPartials
                ? "Unfinished"
                : "Inbox"
              : `Showing ${firstOnPage.toLocaleString("en-GB")}–${lastOnPage.toLocaleString("en-GB")} of ${shown.total.toLocaleString("en-GB")}`
          }
          description={
            shown.total === 0
              ? undefined
              : onPartials
                ? "Most recent activity first. Each row is one visit, not one screen — the answers update in place as somebody goes forward."
                : "Newest first. Every row carries the stamp it arrived with; nothing here is re-scored after the fact."
          }
        />

        {onPartials ? (
          partials.rows.length === 0 ? (
            <EmptyPartials slug={workspace.slug} filtered={filtered} />
          ) : (
            <PartialsTable slug={workspace.slug} rows={partials.rows} />
          )
        ) : page.rows.length === 0 ? (
          <Empty slug={workspace.slug} filtered={filtered} hasEndpoints={endpoints.length > 0} />
        ) : (
          <DataTable
            caption="Submissions, newest first: when each arrived, what was submitted, its Origin stamp, its downstream verdict, where the traffic came from, and which endpoint took it."
            scrollLabel="Submissions"
            tableClassName="min-w-[62rem]"
          >
            <thead>
              <tr>
                <Th>Received</Th>
                <Th>Submitted</Th>
                <Th>Origin</Th>
                <Th>Verdict</Th>
                <Th>Source</Th>
                <Th>Endpoint</Th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {page.rows.map((row) => (
                <tr key={row.publicId} className="hover:bg-sunken">
                  <Td dim className="whitespace-nowrap">
                    <Link
                      href={`/app/${workspace.slug}/submissions/${row.publicId}`}
                      className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <RelativeTime value={row.submittedAt} />
                    </Link>
                  </Td>
                  <Td className="max-w-[26rem]">{summariseValues(row.values)}</Td>
                  <Td>
                    <ProvenanceChip origin={row.origin} />
                  </Td>
                  <Td>
                    <VerdictChip verdict={row.verdict} />
                  </Td>
                  <Td dim className="whitespace-nowrap">
                    {describeSource(row)}
                  </Td>
                  <Td dim className="whitespace-nowrap">
                    <Link
                      href={`/app/${workspace.slug}/endpoints/${row.endpointPublicId}`}
                      className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {row.endpointName}
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {lastPage > 1 ? (
        <Pagination
          slug={workspace.slug}
          filters={filters}
          page={page.page}
          lastPage={lastPage}
        />
      ) : null}
    </Container>
  );
}

/**
 * The partials lane's empty state.
 *
 * Deliberately not phrased as good news. Zero unfinished visits on a workspace
 * with multi-step forms is worth reading twice — it is much more often a form
 * nobody has reached than a form nobody abandons.
 */
function EmptyPartials({ slug, filtered }: { slug: string; filtered: boolean }) {
  if (filtered) {
    return (
      <EmptyState title="No unfinished visits match those filters.">
        Nothing is missing — this combination just excludes all of them.{" "}
        <Link
          href={`/app/${slug}/submissions?lane=partials`}
          className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Clear the filters
        </Link>
        .
      </EmptyState>
    );
  }

  return (
    <EmptyState title="Nothing half-finished, yet.">
      A visit lands here the moment somebody completes a step of a multi-step
      form and does not submit it. Only forms with steps can produce one — a
      single-screen form stores nothing until it is sent.
    </EmptyState>
  );
}

function ExportLink({ href, format }: { href: string; format: "CSV" | "JSON" }) {
  return (
    <a
      href={href}
      className="inline-flex h-10 items-center rounded-md border border-border-control px-4 text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Export {format}
    </a>
  );
}

/**
 * The empty states.
 *
 * Three different situations that a single "No data found" would flatten into
 * one: no endpoints at all, an endpoint with nothing in it yet, and a filter
 * that excluded everything. Only the last of those is the person's own doing,
 * and only the first two need instructions.
 */
function Empty({
  slug,
  filtered,
  hasEndpoints,
}: {
  slug: string;
  filtered: boolean;
  hasEndpoints: boolean;
}) {
  if (filtered) {
    return (
      <EmptyState title="No submissions match those filters.">
        Nothing is missing — the rows are still here, this combination just
        excludes all of them. Widen the dates, or{" "}
        <Link
          href={`/app/${slug}/submissions`}
          className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          clear the filters
        </Link>
        .
      </EmptyState>
    );
  }

  if (!hasEndpoints) {
    return (
      <EmptyState title="This is where your leads will land.">
        Nothing can arrive until something is pointed here.{" "}
        <Link
          href={`/app/${slug}/endpoints`}
          className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Create an endpoint
        </Link>{" "}
        — it takes a name and nothing else — then change one attribute on a form
        you already have.
      </EmptyState>
    );
  }

  return (
    <EmptyState title="Your endpoints are live and nothing has come through yet.">
      That is the expected state right up until the first person hits submit.
      Copy the snippet from{" "}
      <Link
        href={`/app/${slug}/endpoints`}
        className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        an endpoint
      </Link>{" "}
      and fire the curl command at it if you would rather not wait to find out
      whether it works.
    </EmptyState>
  );
}

function Pagination({
  slug,
  filters,
  page,
  lastPage,
}: {
  slug: string;
  filters: Parameters<typeof filtersToSearchParams>[0];
  page: number;
  lastPage: number;
}) {
  const href = (target: number) => {
    const params = filtersToSearchParams(filters, { page: target }).toString();
    return `/app/${slug}/submissions${params ? `?${params}` : ""}`;
  };

  return (
    <nav aria-label="Submissions pages" className="mt-6 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          rel="prev"
          className="inline-flex h-10 items-center rounded-md border border-border-control px-4 text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Newer
        </Link>
      ) : (
        <span />
      )}

      <p className="text-sm text-muted-foreground">
        Page {page.toLocaleString("en-GB")} of {lastPage.toLocaleString("en-GB")}
      </p>

      {page < lastPage ? (
        <Link
          href={href(page + 1)}
          rel="next"
          className="inline-flex h-10 items-center rounded-md border border-border-control px-4 text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Older
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
