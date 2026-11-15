"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { joinWaitlist } from "@/actions/waitlist";
import { initialWaitlistState, type WaitlistState } from "@/actions/waitlist-state";
import {
  acknowledged,
  buildWaitlistBody,
  WAITLIST_ENDPOINT_URL,
  WAITLIST_SUCCESS,
  waitlistTokenUrl,
} from "@/lib/waitlist-endpoint";
import { decideWaitlist } from "@/lib/waitlist-validate";
import { cn } from "@/lib/utils";

type WaitlistFormProps = {
  className?: string;
  /** Rendered above the field. Keep it to one line. */
  note?: string;
  /**
   * The calculator this form is sitting under, when it is sitting under one.
   * Recorded with the signup so the eight `/tools` pages stop being eight
   * anonymous placements. Nothing typed into a calculator is ever sent.
   */
  tool?: string;
};

/**
 * The waitlist, and the first form Endpoint Forms handles for itself (#33).
 *
 * Two paths, in this order:
 *
 *   1. **The browser posts to the endpoint**, exactly as a customer's embedded
 *      form would — its own headers, its own IP, its own origin token, its own
 *      provenance stamp. This is the whole point: our own public site is how we
 *      find out what Risk 1 actually costs, and it can only tell us that if the
 *      requests are real visitors' requests rather than our datacentre's.
 *   2. **The server action**, for a visitor with no JavaScript and as the retry
 *      when the post above fails. It forwards under a channel that says so.
 *
 * With no endpoint configured, path 1 does not exist and this is byte-for-byte
 * the progressively-enhanced form it was before: `action={formAction}`, no
 * `preventDefault`, no fetch. That is also what a failed configuration degrades
 * to, which is why turning this on cannot be worse than leaving it off.
 */
export function WaitlistForm({ className, note, tool }: WaitlistFormProps) {
  const [state, formAction, pending] = useActionState(joinWaitlist, initialWaitlistState);
  const emailId = useId();
  const messageId = useId();
  // Controlled so a rejected address survives the round trip instead of being
  // wiped by the form action's reset.
  const [email, setEmail] = useState("");

  /** The result of the browser's own post, when it decided the outcome. */
  const [direct, setDirect] = useState<WaitlistState | null>(null);
  const [sending, setSending] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // Set by typing after an error, cleared by the next send: once someone
  // starts fixing the address, stop shouting at them about the old one.
  const [editing, setEditing] = useState(false);

  const result = direct ?? state;
  const succeeded = result.status === "success";
  const failed = result.status === "error" && !editing;
  const shown = result.status === "error" && editing ? { ...result, message: "" } : result;
  const busy = sending || pending;
  const successRef = useRef<HTMLDivElement>(null);
  // The form's height at the moment it was sent. The confirmation that
  // replaces it keeps at least this much room, so nothing below it jumps.
  const [reserved, setReserved] = useState<number | null>(null);

  // Minted on page load rather than on submit, so the gap between the two is a
  // real dwell time rather than a number we manufactured. Failure is silent and
  // harmless: a submission with no token is scored exactly as if this route did
  // not exist.
  useEffect(() => {
    const url = waitlistTokenUrl(WAITLIST_ENDPOINT_URL);
    if (!url) return;

    let live = true;
    fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        if (!live || !acknowledged(payload)) return;
        const value = (payload as { token?: unknown }).token;
        if (typeof value === "string") setToken(value);
      })
      .catch(() => {});

    return () => {
      live = false;
    };
  }, []);

  // Success replaces the form, which removes the focused submit button from the
  // DOM. Without this, focus falls back to <body> and a screen reader announces
  // nothing at all — the one moment the page most needs to confirm.
  useEffect(() => {
    if (succeeded) successRef.current?.focus();
  }, [succeeded]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    setReserved(event.currentTarget.offsetHeight);
    setEditing(false);

    // No endpoint configured: let the form action submit natively, exactly as
    // it did before any of this existed.
    if (!WAITLIST_ENDPOINT_URL) return;

    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const decision = decideWaitlist(formData.get("email"), formData.get("company"));

    if (decision.kind === "invalid") {
      setDirect({ status: "error", message: decision.message });
      return;
    }

    // Same answer the server gives: accept, discard, say nothing. A bot that
    // could tell the two apart would just stop filling the field.
    if (decision.kind === "honeypot") {
      setDirect({ status: "success", message: "You’re on the list." });
      return;
    }

    setDirect(null);
    setSending(true);
    const stored = await postToEndpoint(decision.email, tool, token);
    setSending(false);

    if (stored) {
      setDirect({ status: "success", message: WAITLIST_SUCCESS });
      return;
    }

    // The browser could not reach the endpoint. Hand it to the server, which
    // forwards it honestly labelled and — if that fails too — refuses out loud
    // rather than claiming a success it cannot deliver.
    startTransition(() => formAction(formData));
  }

  if (succeeded) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        style={reserved ? { minHeight: reserved } : undefined}
        className={cn("animate-rise max-w-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring", className)}
      >
        <p className="flex items-center gap-2 font-mono text-label uppercase text-signal-ink">
          <Check className="animate-pop size-3.5 [animation-delay:var(--dur-quick)]" aria-hidden="true" />
          On the list
        </p>
        <p className="mt-3 text-base text-foreground">{shown.message}</p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className={cn("max-w-xl", className)}
      noValidate
    >
      {/* Visible, not placeholder-only: the placeholder disappears the moment
          someone starts typing, and with it the only cue for what goes here. */}
      <label
        htmlFor={emailId}
        className="mb-3 block font-mono text-label uppercase text-muted-foreground"
      >
        {note ? `${note} · Work email` : "Work email"}
      </label>

      {/* Carried on the no-JavaScript path too, so a signup from a calculator
          page is attributable however it was sent. */}
      {tool ? <input type="hidden" name="tool" value={tool} /> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@agency.com"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (result.status === "error") setEditing(true);
          }}
          aria-invalid={failed || undefined}
          aria-describedby={shown.message ? messageId : undefined}
          className={cn(
            // w-full when stacked, flex-1 only in a row: flex-1 in a column
            // sets a zero basis and collapsed the box to one line of text.
            "h-11 w-full min-w-0 rounded-md border bg-card px-3 text-base text-foreground transition-colors duration-(--dur-quick) placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:flex-1",
            failed ? "border-destructive" : "border-border-control",
          )}
        />

        {/* Honeypot: off-screen, never announced, never tabbable. A filled value
            is discarded server-side — it is never a validation error, so an
            over-eager autofill can't lock a real person out. */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="sr-only"
        />

        {/* Both labels sit in one grid cell, so the button is always as wide
            as the longer one and never resizes while sending. */}
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy || undefined}
          className="signal-fill press group/submit grid h-11 shrink-0 place-items-center rounded-md pl-4 pr-3 text-base font-medium hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70"
        >
          <span
            aria-hidden={busy || undefined}
            className={cn(
              "col-start-1 row-start-1 inline-flex items-center gap-1.5 transition-[opacity,translate,scale,rotate] duration-(--dur-quick) ease-enter",
              busy && "-translate-y-1 opacity-0",
            )}
          >
            Join the waitlist
            <ArrowRight
              className="size-4 transition-transform duration-(--dur-quick) ease-enter group-hover/submit:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
          <span
            aria-hidden={!busy || undefined}
            className={cn(
              "col-start-1 row-start-1 inline-flex items-center gap-1.5 transition-[opacity,translate,scale,rotate] duration-(--dur-quick) ease-enter",
              !busy && "translate-y-1 opacity-0",
            )}
          >
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Adding you
          </span>
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
        {shown.message ? (
          <span key={shown.message} className="animate-swap block">
            {shown.message}
          </span>
        ) : null}
      </p>
    </form>
  );
}

/**
 * The visitor's own request to the endpoint.
 *
 * Form-encoded with no custom headers, so it is a CORS *simple* request: no
 * preflight, one round trip, and byte-for-byte the shape a plain `<form>` post
 * from a customer's site produces. `credentials: "omit"` matches an endpoint
 * that sets no `Access-Control-Allow-Credentials` and reads no cookie.
 *
 * Every failure returns `false` rather than throwing, because the caller's
 * answer to a failure is to try the server rather than to give up.
 */
async function postToEndpoint(
  email: string,
  tool: string | undefined,
  token: string | null,
): Promise<boolean> {
  const body = buildWaitlistBody({
    email,
    channel: "browser",
    context: { page: window.location.pathname, tool },
    token,
  });

  try {
    const response = await fetch(WAITLIST_ENDPOINT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        accept: "application/json",
      },
      body: body.toString(),
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return false;
    return acknowledged(await response.json().catch(() => null));
  } catch {
    return false;
  }
}
