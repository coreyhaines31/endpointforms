import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/container";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import {
  AddDestinationForm,
  UnavailableKinds,
} from "@/components/app/destinations-forms";
import { DeliveryAlert, HealthChip, HealthLine } from "@/components/app/destinations-health";
import { DataTable, Td, Th } from "@/components/app/table";
import { ADAPTER_OPTIONS } from "@/lib/destinations/adapters/index";
import { listDestinations } from "@/lib/destinations/store";
import { getEndpointByPublicId } from "@/lib/workspaces/endpoints";
import { requireWorkspace } from "@/lib/workspaces/server";

/**
 * Where this endpoint's data goes (#41), and whether it is getting there (#42).
 *
 * The health banner is the first thing on the page and it is *absent* when
 * nothing is wrong. A banner that is always there is furniture; one that only
 * appears when a destination has stopped delivering is the thing
 * `docs/00-positioning-spine.md` promises — *"your data goes wherever you need
 * it — and says so when it doesn't."*
 *
 * The kinds we have not built appear at the bottom of the add form as
 * unavailable, named and dated, rather than being hidden or — much worse —
 * offered and stubbed.
 */
export default async function DestinationsPage({
  params,
}: {
  params: Promise<{ slug: string; publicId: string }>;
}) {
  const { slug, publicId } = await params;
  const { workspace } = await requireWorkspace(slug);

  const endpoint = await getEndpointByPublicId(workspace.id, publicId);
  if (!endpoint) notFound();

  const rows = await listDestinations(workspace.id, endpoint.publicId);
  const base = `/app/${workspace.slug}/endpoints/${endpoint.publicId}`;

  return (
    <Container className="max-w-[60rem] pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">
        <Link
          href={`/app/${workspace.slug}/endpoints`}
          className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Endpoints
        </Link>
        {" / "}
        <Link
          href={base}
          className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {endpoint.name}
        </Link>
      </p>
      <h1 className="mt-4 text-h2">Destinations</h1>
      <p className="mt-3 max-w-[64ch] text-base text-muted-foreground">
        Every submission to this endpoint is stored first and delivered second, so
        a destination that breaks costs you a delivery and never a lead. When one
        stops working, this page says so.
      </p>

      {rows.length > 0 ? (
        <div className="mt-8">
          <DeliveryAlert
            failing={rows.filter((row) => row.health.state === "failing")}
            degraded={rows.filter((row) => row.health.state === "degraded")}
            href={`${base}/destinations`}
          />
        </div>
      ) : null}

      <Panel className="mt-8">
        <PanelHeader
          title="Where it goes"
          description={
            rows.length > 0
              ? `${rows.length} ${rows.length === 1 ? "destination" : "destinations"}. Each one gets every submission, independently — one failing does not hold up another.`
              : undefined
          }
        />

        {rows.length === 0 ? (
          <EmptyState title="Nothing leaves this endpoint yet.">
            Submissions are being stored, and they will still be here whenever you
            add a destination — including the ones that arrived before you did.
            Add one below and send it a test to prove it works before a real lead
            depends on it.
          </EmptyState>
        ) : (
          <DataTable
            caption="Every destination on this endpoint, with whether it is currently delivering."
            scrollLabel="Destinations"
            tableClassName="min-w-[46rem]"
          >
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Kind</Th>
                <Th>Where</Th>
                <Th>Health</Th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <Link
                      href={`${base}/destinations/${row.id}`}
                      className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {row.name}
                    </Link>
                  </Td>
                  <Td dim>
                    {ADAPTER_OPTIONS.find((option) => option.kind === row.kind)?.label ??
                      row.kind}
                  </Td>
                  <Td dim className="max-w-[22rem] truncate font-mono">
                    {row.config.summary[0]?.value ?? "—"}
                  </Td>
                  <Td>
                    <HealthChip state={row.health.state} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {rows.length > 0 ? (
        <Panel className="mt-6">
          <PanelHeader
            title="What each one is doing"
            description="The last thing that actually happened, with a timestamp on it. Never “everything is fine”."
          />
          <PanelBody className="grid gap-4">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-baseline sm:gap-5"
              >
                <div className="flex shrink-0 items-center gap-3 sm:w-56">
                  <HealthChip state={row.health.state} />
                </div>
                <p className="min-w-0 max-w-[62ch] text-sm text-muted-foreground">
                  <Link
                    href={`${base}/destinations/${row.id}`}
                    className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {row.name}
                  </Link>{" "}
                  — <HealthLine health={row.health} />
                </p>
              </div>
            ))}
          </PanelBody>
        </Panel>
      ) : null}

      <Panel className="mt-6">
        <PanelHeader
          title="Add a destination"
          description="Webhook, email and Slack work today. The rest are named below so you know what is coming rather than finding out by trying one."
        />
        <PanelBody>
          <AddDestinationForm
            slug={workspace.slug}
            endpointPublicId={endpoint.publicId}
            options={[...ADAPTER_OPTIONS]}
          />
          <UnavailableKinds options={[...ADAPTER_OPTIONS]} />
        </PanelBody>
      </Panel>
    </Container>
  );
}
