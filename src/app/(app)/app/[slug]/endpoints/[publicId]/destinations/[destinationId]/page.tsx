import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/container";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import {
  DeleteDestinationForm,
  EditDestinationForm,
  PauseDestinationForm,
  RedeliverForm,
  TestDeliveryForm,
} from "@/components/app/destinations-forms";
import { HealthChip, HealthLine } from "@/components/app/destinations-health";
import { Absent, DataTable, Fact, Td, Th } from "@/components/app/table";
import { AbsoluteTime, RelativeTime } from "@/components/app/time";
import { ADAPTER_OPTIONS } from "@/lib/destinations/adapters/index";
import { getDestination, listDeliveryAttempts } from "@/lib/destinations/store";
import { HEADER_SIGNATURE, HEADER_TIMESTAMP } from "@/lib/destinations/signature";
import type { DeliveryLogRow } from "@/lib/destinations/types";
import { getEndpointByPublicId } from "@/lib/workspaces/endpoints";
import { requireWorkspace } from "@/lib/workspaces/server";

/**
 * One destination, and every attempt ever made against it.
 *
 * The delivery log is the point of this screen. `docs/00`'s best "what would
 * you pay for" quote asks for integrations that **fail loudly**, and the
 * loudness has to be legible: what we sent, what came back, what the status
 * code was, and what happens next. An attempt row without its response is a log
 * line nobody can act on, so both sides of the exchange are retained and both
 * are shown.
 */
export default async function DestinationDetailPage({
  params,
}: {
  params: Promise<{ slug: string; publicId: string; destinationId: string }>;
}) {
  const { slug, publicId, destinationId } = await params;
  const { workspace } = await requireWorkspace(slug);

  const endpoint = await getEndpointByPublicId(workspace.id, publicId);
  if (!endpoint) notFound();

  const destination = await getDestination(workspace.id, endpoint.publicId, destinationId);
  if (!destination) notFound();

  const attempts = await listDeliveryAttempts(workspace.id, destination.id);
  const base = `/app/${workspace.slug}/endpoints/${endpoint.publicId}`;
  const kindLabel =
    ADAPTER_OPTIONS.find((option) => option.kind === destination.kind)?.label ??
    destination.kind;

  return (
    <Container className="max-w-[60rem] pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">
        <Link
          href={base}
          className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {endpoint.name}
        </Link>
        {" / "}
        <Link
          href={`${base}/destinations`}
          className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Destinations
        </Link>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="text-h2">{destination.name}</h1>
        <HealthChip state={destination.health.state} />
      </div>
      <p className="mt-3 max-w-[64ch] text-sm text-muted-foreground">
        {kindLabel} · <HealthLine health={destination.health} />
      </p>

      <Panel className="mt-8">
        <PanelHeader
          title="Settings"
          description="What is stored, minus anything that is a credential. Secrets are shown once when they are created and never read back."
        />
        <dl>
          {destination.config.summary.map((entry) => (
            <Fact key={entry.label} label={entry.label} mono>
              {entry.value === "not set" ? <Absent>not set</Absent> : entry.value}
            </Fact>
          ))}
          <Fact label="Added">
            <AbsoluteTime value={destination.createdAt} />
          </Fact>
        </dl>
      </Panel>

      {/* Second on the page, deliberately. Being able to prove it works — before
          a real lead is the thing that finds out — is what #42 asks for, and
          burying it under an edit form would make it the thing nobody presses. */}
      <Panel className="mt-6">
        <PanelHeader
          title="Prove it works"
          description="Sends a sample payload in exactly the shape a real submission takes, and shows you the response it actually got — status code and body, not a green tick."
        />
        <PanelBody>
          <TestDeliveryForm
            slug={workspace.slug}
            endpointPublicId={endpoint.publicId}
            destinationId={destination.id}
          />
        </PanelBody>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Delivery log"
          description={
            attempts.length > 0
              ? "Every attempt, newest first. Retries append rather than overwrite, so the failure that explains an outage is still here after it recovers."
              : undefined
          }
        />

        {attempts.length === 0 ? (
          <EmptyState title="Nothing has been delivered here yet.">
            The next submission to this endpoint will appear here within seconds
            of landing, with what we sent and what came back.
          </EmptyState>
        ) : (
          <DataTable
            caption="Every delivery attempt to this destination, with the status, the response code and what happens next."
            scrollLabel="Delivery log"
            tableClassName="min-w-[52rem]"
          >
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Submission</Th>
                <Th numeric>Attempt</Th>
                <Th>Result</Th>
                <Th>What happened</Th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <Td dim>
                    <RelativeTime value={attempt.createdAt} />
                  </Td>
                  <Td dim className="font-mono">
                    {attempt.submissionPublicId ? (
                      <Link
                        href={`/app/${workspace.slug}/submissions/${attempt.submissionPublicId}`}
                        className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {attempt.submissionPublicId}
                      </Link>
                    ) : (
                      <Absent>removed</Absent>
                    )}
                  </Td>
                  <Td numeric dim>
                    {attempt.attempt}
                  </Td>
                  <Td>
                    <StatusChip attempt={attempt} />
                  </Td>
                  <Td dim className="max-w-[26rem]">
                    {attempt.error ?? (
                      <span className="text-muted-foreground">
                        Accepted{attempt.responseStatus ? ` with ${attempt.responseStatus}` : ""}.
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {attempts.length > 0 ? (
        <Panel className="mt-6">
          <PanelHeader
            title="The exchange"
            description="Both halves of the most recent attempts, kept verbatim. When someone says the data was wrong, this is the only thing that settles it."
          />
          <PanelBody className="grid gap-6">
            {attempts.slice(0, 5).map((attempt) => (
              <Exchange
                key={attempt.id}
                attempt={attempt}
                slug={workspace.slug}
                endpointPublicId={endpoint.publicId}
                destinationId={destination.id}
              />
            ))}
          </PanelBody>
        </Panel>
      ) : null}

      <Panel className="mt-6">
        <PanelHeader
          title="Edit"
          description="Changing the URL or the recipients takes effect on the next submission. Nothing that has already been delivered is re-sent."
        />
        <PanelBody>
          <EditDestinationForm
            slug={workspace.slug}
            endpointPublicId={endpoint.publicId}
            destinationId={destination.id}
            kind={destination.kind}
            name={destination.name}
            config={destination.config}
          />
        </PanelBody>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title={destination.enabled ? "Pause" : "Resume"}
          description={
            destination.enabled
              ? "Stops deliveries without losing anything. Submissions keep arriving and keep being stored — you can send them here by hand from the log once it is fixed."
              : "Start delivering new submissions here again. The ones that arrived while it was paused stay where they are; send them from the log if you want them."
          }
        />
        <PanelBody>
          <PauseDestinationForm
            slug={workspace.slug}
            endpointPublicId={endpoint.publicId}
            destinationId={destination.id}
            enabled={destination.enabled}
          />
        </PanelBody>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Remove"
          description="Stops delivery and takes it off the list. The delivery history stays readable — “why did this lead never reach my CRM in June?” has to still have an answer."
        />
        <PanelBody>
          <DeleteDestinationForm
            slug={workspace.slug}
            endpointPublicId={endpoint.publicId}
            destinationId={destination.id}
          />
        </PanelBody>
      </Panel>
    </Container>
  );
}

/** succeeded · failed · pending, with a glyph so colour is not carrying it alone. */
function StatusChip({ attempt }: { attempt: DeliveryLogRow }) {
  const styles = {
    succeeded: "border-signal-edge/40 bg-signal/15 text-signal-ink",
    failed: "border-destructive/40 bg-destructive-surface text-destructive",
    pending: "border-border text-muted-foreground",
  } as const;

  const glyphs = {
    succeeded: <path d="M1 5.4 3.8 8.2 9 1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />,
    failed: <path d="M1.6 1.6 8.4 8.4M8.4 1.6 1.6 8.4" fill="none" stroke="currentColor" strokeWidth="1.8" />,
    pending: <circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  } as const;

  const label =
    attempt.status === "succeeded"
      ? attempt.responseStatus
        ? `${attempt.responseStatus}`
        : "OK"
      : attempt.status === "failed"
        ? attempt.responseStatus
          ? `${attempt.responseStatus}`
          : "No reply"
        : "Pending";

  return (
    <span
      // Not cn(): twMerge reads `text-label` as a colour and drops it beside
      // `text-destructive`. Same caveat as verdict-chip.tsx.
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-label uppercase ${styles[attempt.status]}`}
    >
      <svg viewBox="0 0 10 10" className="size-2.5 shrink-0" aria-hidden="true">
        {glyphs[attempt.status]}
      </svg>
      {label}
    </span>
  );
}

/**
 * One attempt, opened up.
 *
 * A `<details>` rather than a scripted disclosure — it works before hydration
 * and is keyboard-reachable for free, the same trade `nav.tsx` makes for the
 * workspace switcher. Failed attempts start open, because the reason someone is
 * on this page is that something failed.
 */
function Exchange({
  attempt,
  slug,
  endpointPublicId,
  destinationId,
}: {
  attempt: DeliveryLogRow;
  slug: string;
  endpointPublicId: string;
  destinationId: string;
}) {
  const headers = (attempt.requestHeaders ?? {}) as Record<string, unknown>;
  const interesting = [HEADER_SIGNATURE, HEADER_TIMESTAMP, "content-type", "to", "subject"]
    .map((name) => [name, headers[name]] as const)
    .filter(([, value]) => typeof value === "string" && value !== "");

  return (
    <details open={attempt.status === "failed"} className="min-w-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 rounded-md border border-border bg-sunken px-4 py-3 hover:border-border-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <StatusChip attempt={attempt} />
        <span className="font-mono text-sm text-muted-foreground">
          attempt {attempt.attempt}
        </span>
        <span className="text-sm text-muted-foreground">
          <RelativeTime value={attempt.createdAt} />
        </span>
        {attempt.nextRetryAt ? (
          <span className="text-sm text-muted-foreground">
            · retrying <RelativeTime value={attempt.nextRetryAt} />
          </span>
        ) : null}
      </summary>

      <div className="mt-3 grid gap-4 rounded-md border border-border px-4 py-4">
        {attempt.error ? (
          <p className="max-w-[70ch] text-sm text-foreground">{attempt.error}</p>
        ) : null}

        {interesting.length > 0 ? (
          <div>
            <p className="font-mono text-label uppercase text-muted-foreground">
              Request headers
            </p>
            <dl className="mt-2 grid gap-1">
              {interesting.map(([name, value]) => (
                <div key={name} className="flex min-w-0 flex-wrap gap-x-3 text-sm">
                  <dt className="shrink-0 font-mono text-muted-foreground">{name}</dt>
                  <dd className="min-w-0 break-all font-mono text-foreground">
                    {String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <Body label="What we sent" value={attempt.requestBody} />
        <Body
          label={
            attempt.responseStatus === null
              ? "What came back"
              : `What came back (${attempt.responseStatus})`
          }
          value={attempt.responseBody}
        />

        {attempt.submissionPublicId ? (
          <RedeliverForm
            slug={slug}
            endpointPublicId={endpointPublicId}
            destinationId={destinationId}
            submissionPublicId={attempt.submissionPublicId}
          />
        ) : null}
      </div>
    </details>
  );
}

function Body({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-label uppercase text-muted-foreground">{label}</p>
      {value === null ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing — the request never left, or the response had no body.
        </p>
      ) : (
        <pre
          tabIndex={0}
          role="region"
          aria-label={label}
          className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-sunken px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <code className="font-mono text-sm whitespace-pre-wrap break-words text-foreground">
            {value}
          </code>
        </pre>
      )}
    </div>
  );
}
