"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { activateVersionAction, clearSchemaAction } from "@/actions/schemas";
import { QuietButton } from "./inputs";
import { idleSchemaState } from "./state";
import { RelativeTime } from "@/components/app/time";

/**
 * Every version this endpoint's schema has ever had (#35).
 *
 * ## Why a rollback is not a special case
 *
 * `form_schemas` is append-only and the live version is a pointer on the
 * endpoint, so "make version 3 live again" is the same single UPDATE as "make
 * version 7 live" — `activateSchemaVersion` in `store.ts` does not know which
 * direction it is going. That is why every row here has the same button. A
 * rollback path that is separate code is a rollback path that is broken the
 * first time somebody needs it, and the first time somebody needs it is the
 * worst possible moment to find out.
 *
 * ## Why nothing here deletes
 *
 * There is no delete, because there is nothing to delete against: a submission
 * carries the immutable `schema_version_id` it arrived under, and removing that
 * row would make every submission taken under it unreadable. Taking the schema
 * *off* an endpoint is the last button on this panel, and it is a pointer set
 * to null — the endpoint goes back to accepting anything, which is a working
 * state and not a broken one.
 */

export type VersionSummary = {
  id: string;
  version: number;
  mode: "warn" | "strict";
  source: "html_import" | "file" | "inferred" | "builder";
  /** ISO 8601. A Date does not survive the Server Component boundary. */
  createdAt: string;
  active: boolean;
  fieldCount: number | null;
};

const SOURCE_LABELS: Record<VersionSummary["source"], string> = {
  html_import: "imported from HTML",
  file: "applied from a file",
  inferred: "proposed from submissions",
  builder: "edited here",
};

export function VersionsPanel({
  slug,
  publicId,
  versions,
  hasActive,
  archived,
}: {
  slug: string;
  publicId: string;
  versions: VersionSummary[];
  hasActive: boolean;
  archived: boolean;
}) {
  const [activateState, activate] = useActionState(activateVersionAction, idleSchemaState);
  const [clearState, clear] = useActionState(clearSchemaAction, idleSchemaState);

  if (versions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing has been saved yet. Publishing writes version 1.
      </p>
    );
  }

  return (
    <div className="min-w-0">
      <ul className="grid gap-2">
        {versions.map((version) => (
          <li
            key={version.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                <span className="font-mono">v{version.version}</span>
                {version.active ? (
                  <span className="ml-2 inline-flex items-center rounded-sm border border-signal-edge/30 bg-signal/15 px-1.5 py-0.5 font-mono text-label uppercase text-signal-ink">
                    live
                  </span>
                ) : null}
                {version.mode === "strict" ? (
                  <span className="ml-2 inline-flex items-center rounded-sm border border-border px-1.5 py-0.5 font-mono text-label uppercase text-muted-foreground">
                    strict
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {version.fieldCount === null
                  ? "This build cannot read that version"
                  : `${version.fieldCount} field${version.fieldCount === 1 ? "" : "s"}`}
                {" · "}
                {SOURCE_LABELS[version.source]}
                {" · "}
                <RelativeTime value={new Date(version.createdAt)} />
              </p>
            </div>

            {version.active ? null : (
              <form action={activate}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="publicId" value={publicId} />
                <input type="hidden" name="versionId" value={version.id} />
                <input type="hidden" name="versionNumber" value={version.version} />
                <RowSubmit disabled={archived || version.fieldCount === null}>
                  Make v{version.version} live
                </RowSubmit>
              </form>
            )}
          </li>
        ))}
      </ul>

      <Message message={activateState.message} error={activateState.status === "error"} />

      {hasActive ? (
        <form action={clear} className="mt-5 border-t border-border pt-4">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="publicId" value={publicId} />
          <p className="max-w-[64ch] text-sm text-muted-foreground">
            Taking the schema off does not delete anything. The endpoint goes back to
            accepting whatever is posted to it — which is how it worked before you
            declared one — and every version above stays here to be made live again.
            What you lose is the hosted form, the agent-callable tool and server-side
            validation.
          </p>
          <RowSubmit>Take the schema off this endpoint</RowSubmit>
        </form>
      ) : null}

      <Message message={clearState.message} error={clearState.status === "error"} />
    </div>
  );
}

function RowSubmit({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <QuietButton type="submit" disabled={pending || disabled} className="mt-3 shrink-0">
      {pending ? "Working…" : children}
    </QuietButton>
  );
}

function Message({ message, error }: { message: string; error: boolean }) {
  if (message === "") return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={error ? "mt-3 text-sm text-destructive" : "mt-3 text-sm text-muted-foreground"}
    >
      {message}
    </p>
  );
}
