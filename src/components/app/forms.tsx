"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  idleFormState,
  idleInviteState,
  type FormState,
} from "@/actions/form-state";
import { requestMagicLink, signInWithGoogle } from "@/actions/auth";
import {
  acceptInvitationAction,
  inviteMemberAction,
  revokeInvitationAction,
} from "@/actions/invitations";
import {
  createWorkspaceAction,
  removeMemberAction,
  renameWorkspaceAction,
} from "@/actions/workspaces";
import { suggestSlug } from "@/lib/workspaces/slug";
import { cn } from "@/lib/utils";

/**
 * Every form in the app surface.
 *
 * They all follow the same shape: a Server Action, `useActionState` for the
 * result, and one sentence of feedback in a live region. The actions are the
 * authority — each re-checks the session and the membership — so nothing here
 * is load-bearing for access control. What it is responsible for is telling the
 * truth about what happened.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const inputClass =
  "h-11 w-full min-w-0 rounded-md border bg-card px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function Field({
  label,
  hint,
  invalid,
  prefix,
  suffix,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: React.ReactNode;
  invalid?: boolean;
  prefix?: string;
  suffix?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>

      <div
        className={cn(
          "mt-2 flex items-center rounded-md border bg-card focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
          invalid ? "border-destructive" : "border-border-control",
        )}
      >
        {prefix ? (
          <span aria-hidden="true" className="pl-3 font-mono text-sm text-muted-foreground">
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={invalid || undefined}
          {...props}
          className={cn(inputClass, "border-0 bg-transparent focus-visible:outline-none")}
        />
        {suffix ? (
          <span aria-hidden="true" className="pr-3 font-mono text-sm text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>

      {hint ? (
        <p id={hintId} className="mt-2 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel: string;
  variant?: "primary" | "quiet" | "destructive";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      {...props}
      className={cn(
        "inline-flex h-11 shrink-0 items-center justify-center rounded-md px-4 text-base font-medium transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
        variant === "primary" && "signal-fill hover:opacity-90",
        variant === "quiet" &&
          "border border-border-control text-foreground hover:bg-sunken",
        variant === "destructive" &&
          "border border-border-control text-destructive hover:bg-destructive-surface",
        className,
      )}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * One line of feedback, in a live region.
 *
 * `min-h-5` reserves the line so the layout does not jump when a message
 * appears — a form that shifts under the cursor as you submit it reads as
 * broken even when it worked.
 */
export function FormMessage({ state }: { state: FormState }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "mt-3 min-h-5 text-sm",
        state.status === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {state.message}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export function MagicLinkForm({ next }: { next: string }) {
  const [state, action] = useActionState(requestMagicLink, idleFormState);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      <Field
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        required
        invalid={state.status === "error"}
      />
      <div className="mt-4">
        <SubmitButton pendingLabel="Sending…" className="w-full">
          Email me a sign-in link
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function GoogleSignInForm({ next }: { next: string }) {
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next} />
      <SubmitButton pendingLabel="Redirecting…" variant="quiet" className="w-full">
        Continue with Google
      </SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export function CreateWorkspaceForm({ renderDomain }: { renderDomain: string }) {
  const [state, action] = useActionState(createWorkspaceAction, idleFormState);
  const [name, setName] = useState("");
  // null means "still following the name". Once someone edits the URL by hand it
  // holds their text and stops tracking. Derived rather than synced in an
  // effect, so there is no render where the two disagree.
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const slug = slugOverride ?? suggestSlug(name);

  return (
    <form action={action} noValidate>
      <div className="grid gap-5">
        <Field
          label="Workspace name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Northwind"
          autoComplete="organization"
          required
        />

        <Field
          label="Workspace URL"
          name="slug"
          value={slug}
          onChange={(event) => setSlugOverride(event.target.value)}
          placeholder="northwind"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          suffix={`.${renderDomain}`}
          hint={
            <>
              This becomes the address your forms are served from, so it is
              public and effectively permanent. Lowercase letters, numbers and
              hyphens.
            </>
          }
        />
      </div>

      <div className="mt-6">
        <SubmitButton pendingLabel="Creating…">Create workspace</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function RenameWorkspaceForm({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const [state, action] = useActionState(renameWorkspaceAction, idleFormState);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="slug" value={slug} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Workspace name" name="name" defaultValue={name} required />
        </div>
        <SubmitButton pendingLabel="Saving…" variant="quiet">
          Save
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Members and invitations
// ---------------------------------------------------------------------------

export function InviteForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(inviteMemberAction, idleInviteState);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            label="Email address"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="teammate@company.com"
            required
            invalid={state.status === "error"}
          />
        </div>

        <div className="flex flex-col">
          <label htmlFor="invite-role" className="text-sm font-medium text-foreground">
            Role
          </label>
          <select
            id="invite-role"
            name="role"
            defaultValue="member"
            className="mt-2 h-11 rounded-md border border-border-control bg-card px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <option value="member">Member</option>
            <option value="owner">Owner</option>
          </select>
        </div>

        <SubmitButton pendingLabel="Inviting…" variant="quiet">
          Invite
        </SubmitButton>
      </div>

      <FormMessage state={state} />

      {state.inviteUrl ? <InviteLink url={state.inviteUrl} /> : null}
    </form>
  );
}

/**
 * The invitation link, shown once.
 *
 * There is no mail transport yet (#41), so nothing was emailed and the screen
 * must not pretend otherwise. Only the token's hash is stored, so this really is
 * the only time the link can be shown — which is worth saying plainly rather
 * than letting someone discover it after closing the tab.
 */
function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-4 rounded-md border border-border bg-sunken p-4">
      <p className="font-mono text-label uppercase text-muted-foreground">
        Send them this link
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        We can’t send email yet, so nothing has been delivered. This link is shown
        once and cannot be shown again — only its hash is stored.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-card px-3 py-2.5 font-mono text-sm">
          {url}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => setCopied(true));
          }}
          className="h-11 shrink-0 rounded-md border border-border-control px-4 text-sm font-medium text-foreground hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function RevokeInvitationForm({
  slug,
  invitationId,
}: {
  slug: string;
  invitationId: string;
}) {
  const [state, action] = useActionState(revokeInvitationAction, idleFormState);

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <QuietSubmit pendingLabel="Withdrawing…">Withdraw</QuietSubmit>
      <InlineMessage state={state} />
    </form>
  );
}

export function RemoveMemberForm({
  slug,
  membershipId,
  label,
}: {
  slug: string;
  membershipId: string;
  label: string;
}) {
  const [state, action] = useActionState(removeMemberAction, idleFormState);

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <QuietSubmit pendingLabel="Removing…" aria-label={`Remove ${label}`}>
        Remove
      </QuietSubmit>
      <InlineMessage state={state} />
    </form>
  );
}

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitationAction, idleFormState);

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Joining…">Accept invitation</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------

/** A row-level action: small, quiet, and never the loudest thing on the screen. */
function QuietSubmit({
  children,
  pendingLabel,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      {...props}
      className="rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border-control hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

function InlineMessage({ state }: { state: FormState }) {
  if (!state.message) return null;

  return (
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
  );
}
