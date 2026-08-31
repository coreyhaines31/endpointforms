"use client";

import { ChevronDown } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createDestinationAction,
  deleteDestinationAction,
  redeliverAction,
  setDestinationEnabledAction,
  testDestinationAction,
  updateDestinationAction,
} from "@/actions/destinations";
import {
  idleDestinationState,
  type DestinationState,
} from "@/actions/destinations-state";
import { Field, FormMessage, SubmitButton } from "@/components/app/forms";
import type {
  AdapterOption,
  DestinationKind,
  RedactedConfig,
} from "@/lib/destinations/types";
import { cn } from "@/lib/utils";

/**
 * The forms on the destinations screens.
 *
 * Same shape as everything in `forms.tsx`: a Server Action, `useActionState`,
 * one sentence of feedback in a live region. The actions re-check the session
 * and the membership, so nothing here is load-bearing for access control.
 *
 * Two things are specific to this screen and both are about not lying:
 *
 * - **A signing secret is shown once**, in `SecretOnce`, and the copy says so
 *   plainly — the same treatment the invitation link gets in `forms.tsx`, for
 *   the same reason: only a hash-equivalent is kept, so there is no second
 *   chance and pretending otherwise is how someone loses it.
 * - **A test delivery shows the real response**, in `TestResult` — status code
 *   and body, not a green tick. A tick that hides a 202 from a receiver that
 *   queued and dropped the message would manufacture the exact false confidence
 *   #42 exists to attack.
 */

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const selectClass =
  "h-11 w-full appearance-none rounded-md border border-border-control bg-card pl-3 pr-10 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const textareaClass =
  "mt-2 w-full rounded-md border border-border-control bg-card px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * A select with our own chevron.
 *
 * `appearance-none`, then a positioned icon. Padding cannot move the native
 * arrow — the browser pins it a fixed distance from the border — so drawing it
 * ourselves is the only way to give it room. The select still owns focus and
 * keyboard behaviour; the chevron is decorative and pointer-transparent. Same
 * pattern as the role select in `forms.tsx`.
 */
function Select({
  label,
  hint,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative mt-2">
        <select id={id} {...props} className={selectClass}>
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Textarea({
  label,
  hint,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea id={id} rows={3} {...props} className={textareaClass} />
      {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A row-level action: small, quiet, never the loudest thing on the screen. */
function QuietSubmit({
  children,
  pendingLabel,
  tone = "quiet",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel: string;
  tone?: "quiet" | "destructive";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      {...props}
      className={cn(
        "shrink-0 rounded-md border border-border px-2.5 py-1.5 text-sm transition-colors hover:border-border-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
        tone === "destructive"
          ? "text-destructive hover:bg-destructive-surface"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * The signing secret, shown exactly once.
 *
 * Not a "reveal" toggle. A secret we can re-display is a secret sitting in a
 * column that a database export hands to whoever reads it, so this is the only
 * moment it exists outside the delivery path — and the copy has to say that
 * before someone closes the tab.
 */
function SecretOnce({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-4 rounded-md border border-signal-edge/40 bg-signal/10 p-4">
      <p className="font-mono text-label uppercase text-signal-ink">Signing secret</p>
      <p className="mt-2 max-w-[62ch] text-sm text-muted-foreground">
        Every delivery is signed with this. Store it wherever your receiver reads
        its config from — it is shown once and cannot be shown again.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-card px-3 py-2.5 font-mono text-sm">
          {secret}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(secret).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
          className="h-11 shrink-0 rounded-md border border-border-control px-4 text-sm font-medium text-foreground hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/**
 * The response a test delivery actually got.
 *
 * The status code and the body, verbatim. This is the component that makes the
 * product's claim checkable on camera: press the button, see the receiver's own
 * answer, including when it is a 500 with a stack trace in it.
 */
function TestResult({ test }: { test: NonNullable<DestinationState["test"]> }) {
  return (
    <div
      className={cn(
        "mt-4 rounded-md border p-4",
        test.ok
          ? "border-signal-edge/40 bg-signal/10"
          : "border-destructive/40 bg-destructive-surface",
      )}
    >
      <p
        className={
          test.ok
            ? "font-mono text-label uppercase text-signal-ink"
            : "font-mono text-label uppercase text-destructive"
        }
      >
        {test.ok ? "Accepted" : "Rejected"}
        {test.status === null ? " — no response" : ` — HTTP ${test.status}`}
      </p>
      {test.error ? (
        <p className="mt-2 max-w-[70ch] text-sm text-foreground">{test.error}</p>
      ) : null}
      {test.body ? (
        <pre
          tabIndex={0}
          role="region"
          aria-label="The response body"
          className="mt-3 max-h-56 overflow-auto rounded-md border border-border bg-card px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <code className="font-mono text-sm whitespace-pre-wrap break-words text-foreground">
            {test.body}
          </code>
        </pre>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          The response had no body.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-kind fields
// ---------------------------------------------------------------------------

/**
 * The fields one kind needs.
 *
 * A secret field is never prefilled, because it is never read back. On an edit
 * that means the input is empty and the placeholder says what happens if it is
 * left that way — leaving it blank keeps what is already stored. An empty field
 * that silently deleted a credential would be a very quiet way to break every
 * future delivery.
 */
function KindFields({
  kind,
  config,
  editing,
}: {
  kind: DestinationKind;
  config?: RedactedConfig;
  editing: boolean;
}) {
  if (kind === "webhook") {
    return (
      <>
        <Field
          label="URL"
          name="url"
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://crm.example.com/hooks/leads"
          defaultValue={config?.url ?? ""}
          required
          hint="https only. We POST signed JSON here and do not follow redirects — point it at the final URL."
        />
        <Textarea
          label="Extra headers"
          name="headers"
          placeholder={"Authorization: Bearer …\nX-Team: sales"}
          defaultValue=""
          hint={
            editing && (config?.headerNames.length ?? 0) > 0 ? (
              <>
                One per line, as <code className="font-mono">Name: value</code>. Currently
                set: <span className="text-foreground">{config?.headerNames.join(", ")}</span>.
                Values are not shown — retype them to keep them, or leave this empty to
                remove them.
              </>
            ) : (
              <>
                Optional, one per line, as <code className="font-mono">Name: value</code>.
                Values are never displayed again once saved.
              </>
            )
          }
        />
      </>
    );
  }

  if (kind === "email") {
    return (
      <>
        <Field
          label="Notify"
          name="to"
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="sales@yourcompany.com, ops@yourcompany.com"
          defaultValue={config?.to.join(", ") ?? ""}
          required
          hint="One or more addresses, separated by commas. The Origin stamp goes in the subject line, and replies go to the person who submitted."
        />
        <Field
          label="Subject"
          name="subject"
          type="text"
          placeholder="Leave empty for the default"
          hint="Optional. The default names the endpoint and leads with Human, Agent or Unverified."
        />
      </>
    );
  }

  if (kind === "slack") {
    return (
      <Field
        label="Incoming webhook URL"
        name="webhookUrl"
        type="url"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="https://hooks.slack.com/services/…"
        required={!editing}
        hint={
          editing ? (
            <>
              This URL is the credential, so it is never shown again. Leave this empty to
              keep the one already saved, or paste a new one to replace it.
            </>
          ) : (
            <>
              Create one under <span className="text-foreground">Incoming Webhooks</span> in
              your Slack app. The URL is the credential — anyone holding it can post to that
              channel — so we mask it everywhere after this.
            </>
          )
        }
      />
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

export function AddDestinationForm({
  slug,
  endpointPublicId,
  options,
}: {
  slug: string;
  endpointPublicId: string;
  options: AdapterOption[];
}) {
  const [state, action] = useActionState(createDestinationAction, idleDestinationState);
  const available = options.filter((option) => option.available);
  const [kind, setKind] = useState<DestinationKind>(available[0]?.kind ?? "webhook");
  const selected = options.find((option) => option.kind === kind);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="endpointPublicId" value={endpointPublicId} />

      <div className="grid gap-5">
        <Select
          label="Where to"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as DestinationKind)}
          hint={selected?.blurb}
        >
          {available.map((option) => (
            <option key={option.kind} value={option.kind}>
              {option.label}
            </option>
          ))}
        </Select>

        <Field
          label="Name"
          name="name"
          placeholder="CRM intake"
          required
          hint="Yours alone. It is what the delivery log and the health banner call this."
        />

        <KindFields kind={kind} editing={false} />
      </div>

      <div className="mt-6">
        <SubmitButton pendingLabel="Adding…">Add destination</SubmitButton>
      </div>
      <FormMessage state={state} />
      {state.secret ? <SecretOnce secret={state.secret} /> : null}
    </form>
  );
}

/**
 * The kinds we have not built, named rather than hidden.
 *
 * Hiding them makes the answer to "do you do HubSpot?" silence, and silence
 * reads as no. Offering them and stubbing the delivery would be far worse — a
 * lead accepted and dropped is the enemy in `docs/00-positioning-spine.md` with
 * our logo on it. So they are listed, greyed, and say when.
 */
export function UnavailableKinds({ options }: { options: AdapterOption[] }) {
  const pending = options.filter((option) => !option.available);
  if (pending.length === 0) return null;

  return (
    <div className="mt-6 border-t border-border pt-5">
      <p className="font-mono text-label uppercase text-muted-foreground">Not yet available</p>
      <dl className="mt-3 grid gap-3">
        {pending.map((option) => (
          <div key={option.kind} className="sm:flex sm:items-baseline sm:gap-4">
            <dt className="shrink-0 text-sm font-medium text-muted-foreground sm:w-36">
              {option.label}
            </dt>
            <dd className="mt-0.5 max-w-[62ch] text-sm text-subtle-foreground sm:mt-0">
              {option.blurb}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit, pause, delete, test, redeliver
// ---------------------------------------------------------------------------

export function EditDestinationForm({
  slug,
  endpointPublicId,
  destinationId,
  kind,
  name,
  config,
}: {
  slug: string;
  endpointPublicId: string;
  destinationId: string;
  kind: DestinationKind;
  name: string;
  config: RedactedConfig;
}) {
  const [state, action] = useActionState(updateDestinationAction, idleDestinationState);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="endpointPublicId" value={endpointPublicId} />
      <input type="hidden" name="destinationId" value={destinationId} />

      <div className="grid gap-5">
        <Field label="Name" name="name" defaultValue={name} required />
        <KindFields kind={kind} config={config} editing />

        {config.hasSecret ? (
          <label className="flex items-start gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              name="rotateSecret"
              value="true"
              className="mt-1 size-4 shrink-0 rounded-sm border-border-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <span>
              Rotate the signing secret
              <span className="mt-1 block text-sm text-muted-foreground">
                A new one is generated and shown once. Deliveries signed with the old secret
                stop verifying the moment you save, so update your receiver first.
              </span>
            </span>
          </label>
        ) : null}
      </div>

      <div className="mt-6">
        <SubmitButton pendingLabel="Saving…" variant="quiet">
          Save
        </SubmitButton>
      </div>
      <FormMessage state={state} />
      {state.secret ? <SecretOnce secret={state.secret} /> : null}
    </form>
  );
}

export function TestDeliveryForm({
  slug,
  endpointPublicId,
  destinationId,
}: {
  slug: string;
  endpointPublicId: string;
  destinationId: string;
}) {
  const [state, action] = useActionState(testDestinationAction, idleDestinationState);

  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="endpointPublicId" value={endpointPublicId} />
      <input type="hidden" name="destinationId" value={destinationId} />

      <SubmitButton pendingLabel="Sending…" variant="quiet">
        Send a test delivery
      </SubmitButton>
      {/* One message, not two. `TestResult` already carries the error sentence
          beside the status code, and rendering `FormMessage` as well printed
          the same paragraph twice — which is how a screen starts reading as
          generated. `FormMessage` is still what shows a refusal that never got
          as far as a delivery, such as a stale tab posting to a workspace
          someone was removed from. */}
      {state.test ? <TestResult test={state.test} /> : <FormMessage state={state} />}
    </form>
  );
}

export function PauseDestinationForm({
  slug,
  endpointPublicId,
  destinationId,
  enabled,
}: {
  slug: string;
  endpointPublicId: string;
  destinationId: string;
  enabled: boolean;
}) {
  const [state, action] = useActionState(setDestinationEnabledAction, idleDestinationState);

  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="endpointPublicId" value={endpointPublicId} />
      <input type="hidden" name="destinationId" value={destinationId} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />

      <SubmitButton pendingLabel={enabled ? "Pausing…" : "Resuming…"} variant="quiet">
        {enabled ? "Pause deliveries" : "Resume deliveries"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function DeleteDestinationForm({
  slug,
  endpointPublicId,
  destinationId,
}: {
  slug: string;
  endpointPublicId: string;
  destinationId: string;
}) {
  const [state, action] = useActionState(deleteDestinationAction, idleDestinationState);

  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="endpointPublicId" value={endpointPublicId} />
      <input type="hidden" name="destinationId" value={destinationId} />

      <SubmitButton pendingLabel="Removing…" variant="destructive">
        Remove destination
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/**
 * Replay, one row at a time (#42's dead-letter recovery).
 *
 * The redelivery carries the **same delivery id** as the original, so a receiver
 * that already wrote the lead recognises it and drops it. Pressing this twice by
 * mistake is safe, which is the only reason it can be a plain button rather than
 * a confirmation dialog.
 */
export function RedeliverForm({
  slug,
  endpointPublicId,
  destinationId,
  submissionPublicId,
}: {
  slug: string;
  endpointPublicId: string;
  destinationId: string;
  submissionPublicId: string;
}) {
  const [state, action] = useActionState(redeliverAction, idleDestinationState);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="endpointPublicId" value={endpointPublicId} />
      <input type="hidden" name="destinationId" value={destinationId} />
      <input type="hidden" name="submissionPublicId" value={submissionPublicId} />

      <QuietSubmit pendingLabel="Sending…" aria-label={`Send ${submissionPublicId} again`}>
        Send again
      </QuietSubmit>
      {state.message ? (
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "text-sm",
            state.status === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
