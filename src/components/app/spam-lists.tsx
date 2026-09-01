"use client";

import { useActionState, useId, useState } from "react";

import { idleFormState } from "@/actions/form-state";
import { addSpamListEntryAction, removeSpamListEntryAction } from "@/actions/spam";
import { FormMessage, SubmitButton } from "@/components/app/forms";
import { EmptyState, PanelBody } from "@/components/app/panel";
import type { SpamListRow } from "@/lib/spam/review";

/**
 * The blocklist and allowlist (#31).
 *
 * The only control in the whole spam feature that is not a heuristic, and the
 * only one that is precise. Everything else in `src/lib/spam/rules.ts` is a
 * guess about text; this is a customer telling us something true about their
 * own business.
 *
 * Two things the screen has to say out loud, and does:
 *
 * - **An allow entry ends scoring.** Nothing else is even consulted. That is
 *   what makes it usable for "our biggest client keeps getting flagged".
 * - **A block entry flags. It does not delete.** The word "block" is the one
 *   customers search for, so it is the word used — and then immediately
 *   qualified, because a label that overpromises is how "where did my lead go"
 *   starts.
 */

const KINDS = [
  {
    value: "email_domain",
    label: "Email domain",
    placeholder: "acme.com",
    hint: "Matches the domain and any subdomain of it.",
  },
  {
    value: "ip",
    label: "IP address",
    placeholder: "203.0.113.10",
    hint: "Stored as a hash — we never write the address itself down. What you typed is kept as the label so the list stays readable.",
  },
  {
    value: "keyword",
    label: "Keyword",
    placeholder: "crypto",
    hint: "Case-insensitive, matched anywhere in any field. Block only — there is no allow-keyword, because “never flag anything containing this word” has a blast radius nobody can predict.",
  },
] as const;

export function SpamListsForm({ slug, entries }: { slug: string; entries: SpamListRow[] }) {
  const [state, action] = useActionState(addSpamListEntryAction, idleFormState);
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("email_domain");
  const valueId = useId();
  const hintId = `${valueId}-hint`;
  const [effect, setEffect] = useState<"block" | "allow">("block");

  const selected = KINDS.find((entry) => entry.value === kind) ?? KINDS[0];
  const allowDisabled = kind === "keyword";

  return (
    <>
      <PanelBody className="border-b border-border">
        <form action={action} noValidate className="grid gap-4">
          <input type="hidden" name="slug" value={slug} />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col text-sm font-medium text-foreground">
              What to match
              <select
                name="kind"
                value={kind}
                onChange={(event) => {
                  const next = event.target.value as (typeof KINDS)[number]["value"];
                  setKind(next);
                  if (next === "keyword") setEffect("block");
                }}
                className="mt-2 h-11 rounded-md border border-border-control bg-card px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {KINDS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col text-sm font-medium text-foreground">
              What to do
              <select
                name="effect"
                value={effect}
                onChange={(event) => setEffect(event.target.value as "block" | "allow")}
                className="mt-2 h-11 rounded-md border border-border-control bg-card px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <option value="block">Always flag</option>
                <option value="allow" disabled={allowDisabled}>
                  Never flag
                </option>
              </select>
            </label>
          </div>

          {/* The input is labelled by `htmlFor` rather than by being wrapped in
              the label, because wrapping it would fold the Add button's text and
              the hint into the input's accessible name — a screen reader would
              announce the field as "Value Add Matches the domain and any
              subdomain of it." That is what wrapping does to any label
              containing more than the input. */}
          <div>
            <label htmlFor={valueId} className="text-sm font-medium text-foreground">
              Value
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
              <input
                id={valueId}
                name="value"
                placeholder={selected.placeholder}
                autoComplete="off"
                spellCheck={false}
                required
                aria-invalid={state.status === "error" || undefined}
                aria-describedby={hintId}
                className="h-11 w-full min-w-0 flex-1 rounded-md border border-border-control bg-card px-3 font-mono text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
            </div>
            <p id={hintId} className="mt-2 max-w-[62ch] text-sm text-muted-foreground">
              {selected.hint}
            </p>
          </div>

          <FormMessage state={state} />
        </form>
      </PanelBody>

      {entries.length === 0 ? (
        <EmptyState title="No entries yet.">
          These beat every heuristic we have, in both directions. If a real
          customer keeps getting flagged, put their domain on “never flag” and
          the score stops being consulted for them entirely.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((entry) => (
            <SpamListEntryRow key={entry.id} slug={slug} entry={entry} />
          ))}
        </ul>
      )}
    </>
  );
}

function SpamListEntryRow({ slug, entry }: { slug: string; entry: SpamListRow }) {
  const [state, action] = useActionState(removeSpamListEntryAction, idleFormState);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <p className="truncate font-mono text-base text-foreground">
          {entry.label ?? entry.value}
        </p>
        <p className="mt-1 font-mono text-label uppercase text-muted-foreground">
          {entry.kind === "email_domain"
            ? "Email domain"
            : entry.kind === "ip"
              ? "IP address"
              : "Keyword"}{" "}
          · {entry.effect === "allow" ? "Never flag" : "Always flag"}
        </p>
        {state.status === "error" ? (
          <p role="status" className="mt-1 text-sm text-destructive">
            {state.message}
          </p>
        ) : null}
      </div>

      <form action={action}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="id" value={entry.id} />
        <SubmitButton pendingLabel="Removing…" variant="quiet">
          Remove
        </SubmitButton>
      </form>
    </li>
  );
}
