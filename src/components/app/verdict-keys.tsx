"use client";

import { useActionState } from "react";

import { idleVerdictKeyState } from "@/actions/form-state";
import { createVerdictKeyAction, revokeVerdictKeyAction } from "@/actions/verdict-keys";
import { CopyBlock } from "@/components/app/copy";
import { FormMessage, SubmitButton } from "@/components/app/forms";
import { EmptyState, PanelBody } from "@/components/app/panel";
import { absoluteTime, relativeTime } from "@/components/app/time";
import type { VerdictKeySummary } from "@/lib/verdict/key-store";

/**
 * The outcome API keys panel (#57).
 *
 * Three things this screen has to say, and the whole layout is arranged around
 * them:
 *
 * 1. **A new key is shown once.** It is stored as a hash, so there is no
 *    "reveal" button to look for later and no support path that recovers it.
 *    The sentence says so at the moment it matters rather than in a tooltip.
 * 2. **Last used is the fact people actually need.** Before revoking anything a
 *    person wants to know what will break. So it is a column, not a detail
 *    page — and when it is blank that is stated as "never used", because an
 *    empty cell reads as missing data rather than as an answer.
 * 3. **Revoked keys stay listed.** A revocation that erased the row would
 *    destroy the record of what existed, which is the thing you go looking for
 *    after a leak.
 *
 * The legacy derived key appears in the same list as the stored ones, with its
 * own explanation. Hiding it would produce a screen that answered "what can
 * write into my outcome data" incorrectly for every customer who has been using
 * the only key format that existed until now.
 */
export function VerdictKeysPanel({
  slug,
  keys,
  canManage,
  now,
}: {
  slug: string;
  keys: VerdictKeySummary[];
  canManage: boolean;
  /** Passed in so the relative times come from the same instant as the page. */
  now: Date;
}) {
  const [state, action] = useActionState(createVerdictKeyAction, idleVerdictKeyState);
  const live = keys.filter((key) => key.revokedAt === null);

  return (
    <>
      {canManage ? (
        <PanelBody className="border-b border-border">
          <form action={action} noValidate className="grid gap-4">
            <input type="hidden" name="slug" value={slug} />

            <div>
              <label htmlFor="verdict-key-label" className="text-sm font-medium text-foreground">
                Name this key
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
                <input
                  id="verdict-key-label"
                  name="label"
                  placeholder="Salesforce webhook"
                  autoComplete="off"
                  spellCheck={false}
                  required
                  maxLength={80}
                  aria-invalid={state.status === "error" || undefined}
                  aria-describedby="verdict-key-label-hint"
                  className="h-11 w-full min-w-0 flex-1 rounded-md border border-border-control bg-card px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                <SubmitButton pendingLabel="Creating…">Create key</SubmitButton>
              </div>
              <p
                id="verdict-key-label-hint"
                className="mt-2 max-w-[62ch] text-sm text-muted-foreground"
              >
                The name is only for you, and it is what you will be reading when
                you decide which key to kill. Several keys can be live at once,
                which is how a key gets rotated without an outage: create the new
                one, move the integration across, then revoke the old one.
              </p>
            </div>

            {state.apiKey ? (
              <CopyBlock
                label="New key"
                code={state.apiKey}
                description="Copy it now. It is stored as a hash, so nothing here — including us — can show it to you again. If you lose it, revoke it and create another."
              />
            ) : null}

            <FormMessage state={state} />
          </form>
        </PanelBody>
      ) : null}

      {keys.length === 0 ? (
        <EmptyState title="No outcome keys yet.">
          Until one exists, nothing can post a won or lost back to a submission —
          so every report in this workspace is a lead count rather than a revenue
          one.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {keys.map((key) => (
            <VerdictKeyRow
              key={key.id ?? "derived"}
              slug={slug}
              entry={key}
              canManage={canManage}
              now={now}
            />
          ))}
        </ul>
      )}

      {live.length === 0 && keys.length > 0 ? (
        <PanelBody className="border-t border-border">
          <p className="max-w-[62ch] text-sm text-muted-foreground">
            Every key here is revoked, so the outcome webhook currently refuses
            everything for this workspace. That is a safe state and not a working
            one — create a key when you are ready to reconnect.
          </p>
        </PanelBody>
      ) : null}
    </>
  );
}

function VerdictKeyRow({
  slug,
  entry,
  canManage,
  now,
}: {
  slug: string;
  entry: VerdictKeySummary;
  canManage: boolean;
  now: Date;
}) {
  const [state, action] = useActionState(revokeVerdictKeyAction, idleVerdictKeyState);
  const revoked = entry.revokedAt !== null;

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-base text-foreground">
            <span className="truncate">{entry.label}</span>
            {revoked ? (
              <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-label uppercase text-muted-foreground">
                Revoked
              </span>
            ) : null}
          </p>

          <p className="mt-1 font-mono text-label uppercase text-muted-foreground">
            {entry.kind === "derived" ? (
              "Derived · efv1"
            ) : (
              // Not uppercased. The public half of the key is a nanoid from a
              // case-sensitive alphabet, and this is the string a person reads
              // to tell two keys apart — printing `EFV2.UBGJDBPJVAJK` for
              // `efv2.uBgjdBpJvaJK` would make the identity of the key
              // unreadable in the one place it has to be read.
              <span className="normal-case">efv2.{entry.publicId}</span>
            )}
            {entry.createdAt ? (
              <>
                {" · created "}
                <time dateTime={entry.createdAt.toISOString()} title={absoluteTime(entry.createdAt)}>
                  {relativeTime(entry.createdAt, now)}
                </time>
              </>
            ) : null}
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            {entry.lastUsedAt ? (
              <>
                Last used{" "}
                <time dateTime={entry.lastUsedAt.toISOString()} title={absoluteTime(entry.lastUsedAt)}>
                  {relativeTime(entry.lastUsedAt, now)}
                </time>
                {entry.lastUsedIp ? ` from ${entry.lastUsedIp}` : null}
                {". Recorded to the nearest five minutes."}
              </>
            ) : (
              "Never used. Nothing has posted an outcome with this key."
            )}
          </p>

          {state.status === "error" ? (
            <p role="status" className="mt-1 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
        </div>

        {canManage && !revoked ? (
          <form action={action}>
            <input type="hidden" name="slug" value={slug} />
            {entry.id ? <input type="hidden" name="keyId" value={entry.id} /> : null}
            <SubmitButton pendingLabel="Revoking…" variant="quiet">
              Revoke
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {entry.kind === "derived" && entry.fullKey && !revoked ? (
        <div className="mt-4">
          <CopyBlock label="Bearer token" code={entry.fullKey} />
          <p className="mt-3 max-w-[62ch] text-sm text-muted-foreground">
            The original key format. It is derived from this workspace rather
            than stored, which is why it can still be displayed — and why
            anything holding our server secret could recompute it. Revoking it
            here now affects only this workspace. Renaming the workspace
            invalidates it. New integrations should use a key created above.
          </p>
        </div>
      ) : null}

      {entry.kind === "derived" && revoked ? (
        <p className="mt-3 max-w-[62ch] text-sm text-muted-foreground">
          The legacy key for this workspace is dead and cannot be brought back.
          Anything still sending it gets a 401 that says so by name.
        </p>
      ) : null}
    </li>
  );
}
