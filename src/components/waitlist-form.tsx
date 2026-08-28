"use client";

import { useActionState, useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { joinWaitlist } from "@/actions/waitlist";
import { initialWaitlistState } from "@/actions/waitlist-state";
import { cn } from "@/lib/utils";

type WaitlistFormProps = {
  className?: string;
  /** Rendered above the field. Keep it to one line. */
  note?: string;
};

export function WaitlistForm({ className, note }: WaitlistFormProps) {
  const [state, formAction, pending] = useActionState(joinWaitlist, initialWaitlistState);
  const emailId = useId();
  const messageId = useId();
  // Controlled so a rejected address survives the round trip instead of being
  // wiped by the form action's reset.
  const [email, setEmail] = useState("");
  const failed = state.status === "error";

  if (state.status === "success") {
    return (
      <div className={cn("max-w-xl", className)}>
        <p className="font-mono text-label uppercase text-signal-ink">On the list</p>
        <p className="mt-3 text-base text-foreground">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className={cn("max-w-xl", className)} noValidate>
      {note ? (
        <p className="mb-3 font-mono text-label uppercase text-subtle-foreground">{note}</p>
      ) : null}

      <label htmlFor={emailId} className="sr-only">
        Work email
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@agency.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={failed || undefined}
          aria-describedby={state.message ? messageId : undefined}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-md border bg-card px-3 text-base text-foreground placeholder:text-subtle-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            failed ? "border-destructive" : "border-border-strong",
          )}
        />

        {/* Honeypot: off-screen, never announced, never tabbable. */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="sr-only"
        />

        <button
          type="submit"
          disabled={pending}
          className="signal-fill inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md pl-4 pr-3 text-base font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
        >
          {pending ? "Adding you…" : "Join the waitlist"}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <p
        id={messageId}
        role="status"
        aria-live="polite"
        className={cn(
          "mt-3 min-h-5 text-sm",
          failed ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {state.message}
      </p>
    </form>
  );
}
