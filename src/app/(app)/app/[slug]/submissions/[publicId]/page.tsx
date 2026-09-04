import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/container";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { CopyButton } from "@/components/app/copy";
import { ProvenanceChip } from "@/components/provenance-chip";
import { Absent, DataTable, Fact, Td, Th } from "@/components/app/table";
import { AbsoluteTime, RelativeTime } from "@/components/app/time";
import { SpamChip } from "@/components/app/spam-chip";
import { SpamPanel } from "@/components/app/spam-panel";
import { VerdictChip } from "@/components/app/verdict-chip";
import {
  formatMoney,
  formatValue,
  isNoiseKey,
  orderedEntries,
} from "@/lib/submission-values";
import { requireWorkspace } from "@/lib/workspaces/server";
import { getSubmission } from "@/lib/workspaces/submissions";
import { signDownloadPath } from "@/lib/uploads/links";
import { formatBytes } from "@/lib/uploads/types";
import type { OriginReason, SubmissionFileRow } from "@/lib/workspaces/types";

/**
 * One submission, in full.
 *
 * The screen has one job beyond showing the values: **"why is this Unverified?"
 * must be answerable from here.** #30's whole claim is that the stamp is an
 * observation rather than a risk score, and a stamp you cannot interrogate is a
 * risk score with better manners. So every signal is listed, with what was
 * observed, which way it pointed, and how much it moved the total.
 */
export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ slug: string; publicId: string }>;
}) {
  const { slug, publicId } = await params;
  const { workspace } = await requireWorkspace(slug);

  const submission = await getSubmission(workspace.id, publicId);
  if (!submission) notFound();

  const entries = orderedEntries(submission.values);
  const money = formatMoney(submission.verdictValue, submission.verdictCurrency);

  const attribution: [string, string | null][] = [
    ["utm_source", submission.utmSource],
    ["utm_medium", submission.utmMedium],
    ["utm_campaign", submission.utmCampaign],
    ["utm_term", submission.utmTerm],
    ["utm_content", submission.utmContent],
    ...Object.entries(submission.clickIds).map(
      ([key, value]) => [key, formatValue(value)] as [string, string],
    ),
    ["referrer", submission.referrer],
  ];
  const hasAttribution = attribution.some(([, value]) => Boolean(value));

  return (
    <Container className="max-w-[60rem] pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">
        <Link
          href={`/app/${workspace.slug}/submissions`}
          className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Submissions
        </Link>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-h2">
          <AbsoluteTime value={submission.submittedAt} />
        </h1>
        <ProvenanceChip origin={submission.origin} />
        <VerdictChip verdict={submission.verdict} />
        <SpamChip state={submission.spamState} score={submission.spamScore} />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        <RelativeTime value={submission.submittedAt} /> · to{" "}
        <Link
          href={`/app/${workspace.slug}/endpoints/${submission.endpointPublicId}`}
          className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {submission.endpointName}
        </Link>{" "}
        · <span className="font-mono">{submission.publicId}</span>
      </p>

      <Panel className="mt-8">
        <PanelHeader
          title={entries.length === 1 ? "1 field" : `${entries.length} fields`}
          description="Exactly what was submitted, in the order it is most useful to read. Nothing is renamed and nothing is dropped."
        />

        {entries.length === 0 ? (
          <EmptyState title="This submission carried no fields.">
            The request arrived and was accepted, but its body held nothing we
            could read as values. The raw body below is what actually came in.
          </EmptyState>
        ) : (
          <dl className="[&>div:last-child]:border-b-0">
            {entries.map(([key, value]) => (
              <Fact key={key} label={key}>
                {isNoiseKey(key) ? (
                  <span className="text-muted-foreground">
                    {formatValue(value) || <Absent>empty</Absent>}
                    <span className="ml-2 font-mono text-label uppercase">plumbing</span>
                  </span>
                ) : (
                  formatValue(value) || <Absent>empty</Absent>
                )}
              </Fact>
            ))}
          </dl>
        )}
      </Panel>

      <AttachmentsPanel files={submission.files} />

      <OriginPanel origin={submission.origin} reasons={submission.originReasons} />

      <SpamPanel
        slug={workspace.slug}
        publicId={submission.publicId}
        state={submission.spamState}
        score={submission.spamScore}
        reasons={submission.spamReasons}
      />

      <Panel className="mt-6">
        <PanelHeader
          title="Outcome"
          description="What happened downstream. Until something says otherwise, a submission awaits a verdict — which is a real state, not a missing one."
        />
        <dl className="[&>div:last-child]:border-b-0">
          <Fact label="Verdict">
            <VerdictChip verdict={submission.verdict} />
          </Fact>
          <Fact label="Value">{money ?? <Absent>not recorded</Absent>}</Fact>
          <Fact label="Recorded">
            {submission.verdictAt ? (
              <AbsoluteTime value={submission.verdictAt} />
            ) : (
              <Absent>not yet</Absent>
            )}
          </Fact>
          <Fact label="Reported by">
            {submission.verdictSource ?? <Absent>nothing yet</Absent>}
          </Fact>
        </dl>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Attribution"
          description="Where the traffic came from, captured at submit rather than reconstructed later."
        />
        {hasAttribution ? (
          <dl className="[&>div:last-child]:border-b-0">
            {attribution.map(([key, value]) =>
              value ? (
                <Fact key={key} label={key} mono>
                  {value}
                </Fact>
              ) : null,
            )}
          </dl>
        ) : (
          <EmptyState title="No campaign parameters came with this one.">
            No UTMs, no click IDs, no referrer. That usually means someone typed
            the address, arrived from a bookmark, or came through a link that
            strips them — not that anything went wrong.
          </EmptyState>
        )}
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Raw body"
          description="Byte for byte what arrived. When someone says the data is wrong, this is the thing that settles it."
          action={
            submission.rawBody ? (
              <CopyButton value={submission.rawBody} label="Copy raw body" />
            ) : null
          }
        />
        {submission.rawBody ? (
          <PanelBody>
            <p className="font-mono text-label uppercase text-muted-foreground">
              {submission.rawContentType ?? "content type not sent"}
            </p>
            <pre
              tabIndex={0}
              role="region"
              aria-label="Raw request body"
              className="mt-3 max-h-96 overflow-auto rounded-md border border-border bg-sunken px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <code className="font-mono text-sm break-words whitespace-pre-wrap text-foreground">
                {submission.rawBody}
              </code>
            </pre>
          </PanelBody>
        ) : (
          <EmptyState title="No raw body was retained for this submission." />
        )}
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Delivery"
          description="Every attempt to hand this submission on, and what came back."
        />
        {submission.deliveries.length === 0 ? (
          <EmptyState title="Nothing is forwarding this endpoint yet.">
            Destinations — webhook, email, Slack, your CRM — land with #42. Until
            one exists, the submission lives here and in your exports, which is
            everything it needs to not be lost.
          </EmptyState>
        ) : (
          <DataTable
            caption="Delivery attempts for this submission: the destination, the attempt number, its status, and the response."
            scrollLabel="Delivery attempts"
            tableClassName="min-w-[40rem]"
          >
            <thead>
              <tr>
                <Th>Destination</Th>
                <Th numeric>Attempt</Th>
                <Th>Status</Th>
                <Th>Response</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {submission.deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <Td>
                    {delivery.destinationName ?? <Absent>removed destination</Absent>}
                    {delivery.destinationKind ? (
                      <span className="ml-2 font-mono text-label uppercase text-muted-foreground">
                        {delivery.destinationKind}
                      </span>
                    ) : null}
                  </Td>
                  <Td numeric>{delivery.attempt}</Td>
                  <Td dim={delivery.status === "pending"}>{delivery.status}</Td>
                  <Td dim>
                    {delivery.responseStatus ?? delivery.error ?? <Absent>no response</Absent>}
                  </Td>
                  <Td dim>
                    <RelativeTime value={delivery.completedAt ?? delivery.createdAt} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      <Panel className="mt-6">
        <PanelHeader title="Record" />
        <dl className="[&>div:last-child]:border-b-0">
          <Fact label="Submission ID" mono>
            {submission.publicId}
          </Fact>
          <Fact label="Submitted at" mono>
            {submission.submittedAt.toISOString()}
          </Fact>
          <Fact label="Stored at" mono>
            {submission.createdAt.toISOString()}
          </Fact>
          <Fact label="Schema version" mono>
            {submission.schemaVersionId ?? <Absent>none — the endpoint had no schema</Absent>}
          </Fact>
          <Fact label="Idempotency key" mono>
            {submission.idempotencyKey ?? <Absent>none sent</Absent>}
          </Fact>
          <Fact label="User agent">
            {submission.userAgent ?? <Absent>none sent</Absent>}
          </Fact>
          <Fact label="IP" mono>
            {submission.ipHash ? (
              <>
                {submission.ipHash}
                <span className="ml-2 font-mono text-label uppercase text-muted-foreground">
                  hashed
                </span>
              </>
            ) : (
              <Absent>not recorded</Absent>
            )}
          </Fact>
        </dl>
      </Panel>
    </Container>
  );
}

/**
 * The files somebody attached (#66).
 *
 * ## Every link on this screen is minted here, fresh, on every render
 *
 * The reference stored in `values` carries a long-lived link for a webhook
 * receiver that may not fetch it until the weekend. That link is deliberately
 * not the one a person clicks: this panel signs a new one with a fifteen-minute
 * life, which only has to survive the click that follows it. A screenshot of
 * this page, or the URL copied out of it into a ticket, stops working almost
 * immediately — which is the correct behaviour for a link to somebody's CV.
 *
 * ## Why a purged file still has a row
 *
 * Retention takes the bytes, not the record. A file whose bytes are gone shows
 * its name, its size and its hash, and says the date they were removed and why.
 * The alternative — dropping it from this list — would leave a submission that
 * used to mention a CV and now does not, which is indistinguishable from us
 * having lost it. This product does not get to look like that.
 *
 * ## Declared against detected
 *
 * Both are shown, and they are shown separately rather than reconciled, because
 * the interesting case is when they disagree. `invoice.pdf` that begins `MZ` is
 * a Windows executable somebody renamed, and the person reading this screen is
 * the one who should decide what that means. Neither value affects how the file
 * is served: downloads always leave as `application/octet-stream`, always as an
 * attachment. See `src/lib/uploads/serve.ts`.
 */
function AttachmentsPanel({ files }: { files: SubmissionFileRow[] }) {
  if (files.length === 0) return null;

  const now = new Date();

  return (
    <Panel className="mt-6">
      <PanelHeader
        title={files.length === 1 ? "1 attachment" : `${files.length} attachments`}
        description="The bytes, kept. Links are signed and expire in fifteen minutes — reload this page for a fresh one."
      />
      <DataTable
        caption="Files attached to this submission: the name, the field it arrived in, its size, what it claims to be against what it looks like, and how long it is kept."
        scrollLabel="Attachments"
        tableClassName="min-w-[46rem]"
      >
        <thead>
          <tr>
            <Th>File</Th>
            <Th>Field</Th>
            <Th numeric>Size</Th>
            <Th>Type</Th>
            <Th>Kept until</Th>
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {files.map((file) => {
            const href = file.purgedAt
              ? null
              : signDownloadPath(file.publicId, "page", file.expiresAt, now);
            return (
              <tr key={file.publicId}>
                <Td className="align-top">
                  {href ? (
                    <a
                      href={href}
                      className="rounded-sm text-foreground underline decoration-border-control underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {file.filename}
                    </a>
                  ) : (
                    <span className="text-muted-foreground line-through">{file.filename}</span>
                  )}
                  <span className="mt-1 block font-mono text-label text-muted-foreground">
                    sha256 {file.sha256.slice(0, 16)}…
                  </span>
                </Td>
                <Td dim className="align-top font-mono">
                  {file.fieldKey}
                </Td>
                <Td numeric className="align-top">
                  {formatBytes(file.size)}
                </Td>
                <Td className="align-top">
                  <span className="font-mono">
                    {file.declaredContentType || <Absent>none declared</Absent>}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    looks like{" "}
                    <span className="font-mono">
                      {file.detectedContentType ?? "nothing we recognise"}
                    </span>
                  </span>
                </Td>
                <Td dim className="align-top">
                  {file.purgedAt ? (
                    <>
                      removed <AbsoluteTime value={file.purgedAt} />
                      <span className="mt-1 block text-sm">
                        retention took the bytes; the record stays
                      </span>
                    </>
                  ) : file.expiresAt ? (
                    <AbsoluteTime value={file.expiresAt} />
                  ) : (
                    <Absent>kept indefinitely</Absent>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </Panel>
  );
}

/**
 * Why the stamp says what it says.
 *
 * The threshold entry is pulled out of the list and used as the summary, because
 * it holds the arithmetic — the score and the bar it was compared against — and
 * a reader who disagrees with the verdict needs both before the individual
 * signals mean anything.
 */
function OriginPanel({
  origin,
  reasons,
}: {
  origin: "human" | "agent" | "unverified";
  reasons: OriginReason[];
}) {
  const threshold = reasons.find((reason) => reason.code === "threshold");
  const signals = reasons.filter((reason) => reason.code !== "threshold");

  return (
    <Panel className="mt-6">
      <PanelHeader
        title={
          origin === "human"
            ? "Why this is stamped Human"
            : origin === "agent"
              ? "Why this is stamped Agent"
              : "Why this is Unverified"
        }
        description="The stamp is an observation about which door was used and how coherently, not a risk score. Here is everything it was made of."
      />

      {threshold ? (
        <PanelBody className="border-b border-border">
          <p className="max-w-[68ch] text-base text-foreground">{threshold.note}</p>
          <p className="mt-2 font-mono text-sm text-muted-foreground">{threshold.observed}</p>
        </PanelBody>
      ) : null}

      {signals.length === 0 ? (
        <EmptyState title="No signals were recorded for this submission.">
          It predates the Origin decision being written down, or arrived through a
          path that does not score. The stamp above is what the row carries.
        </EmptyState>
      ) : (
        <DataTable
          caption="Every signal behind the Origin stamp: what was observed, which way it pointed, and how much weight it carried."
          scrollLabel="Origin signals"
          tableClassName="min-w-[46rem]"
        >
          <thead>
            <tr>
              <Th>Signal</Th>
              <Th>Observed</Th>
              <Th>Points to</Th>
              <Th numeric>Weight</Th>
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-b-0">
            {signals.map((reason, index) => (
              <tr key={`${reason.code}-${index}`}>
                <Td className="align-top font-mono">{reason.code}</Td>
                <Td className="align-top">
                  <span className="font-mono">{reason.observed}</span>
                  <span className="mt-1 block max-w-[52ch] text-sm text-muted-foreground">
                    {reason.note}
                  </span>
                </Td>
                <Td dim className="align-top whitespace-nowrap">
                  {reason.direction === "browser"
                    ? "a browser"
                    : reason.direction === "software"
                      ? "software"
                      : "neither way"}
                </Td>
                <Td numeric className="align-top">
                  {reason.weight > 0 ? `+${reason.weight}` : reason.weight}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  );
}
