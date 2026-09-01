"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  importHtmlAction,
  importUrlAction,
  proposeFromSubmissionsAction,
} from "@/actions/schemas";
import { QuietButton, TextAreaField, TextField } from "./inputs";
import {
  idleImportState,
  type ImportActionState,
  type ImportCandidate,
} from "./state";
import { cn } from "@/lib/utils";

/**
 * Getting a schema from somewhere other than typing it (#35).
 *
 * ## Why this is the first thing on the page and not a menu item
 *
 * The person opening this screen already has a form. It is on their site, it
 * has been collecting leads for months, and the reason they are here is that
 * they want *this* endpoint to know what it is. Making them retype eleven
 * fields they already have working markup for is the single most avoidable way
 * to lose them, and `import-html.ts` has been able to do it since #51.
 *
 * ## Nothing here publishes
 *
 * Every one of these paths ends in the editor with an unsaved draft, never in
 * a live schema. An import is a *reading* of somebody's markup and inference is
 * a *guess about* somebody's traffic; both are usually right and neither is
 * ever certain. `store.ts` refuses to publish an inferred schema without a user
 * id for exactly this reason, and the same principle applies to an import: a
 * person looks at it before it becomes the thing their endpoint validates
 * against.
 *
 * ## Three producers, one screen
 *
 * `src/lib/schema/index.ts` names four ways a schema comes to exist. Three of
 * them are here — markup, a URL, and what the endpoint has already received —
 * and the fourth is the editor this panel loads into. The fifth, a committed
 * JSON file applied by CLI, deliberately has no button: it belongs in a repo,
 * not in a dashboard.
 */

export type ImportPanelProps = {
  slug: string;
  publicId: string;
  submissionCount: number;
  /** Hands the chosen document to the editor as an unsaved draft. */
  onAdopt: (candidate: ImportCandidate) => void;
};

type ImportTab = "html" | "url" | "submissions";

export function ImportPanel({
  slug,
  publicId,
  submissionCount,
  onAdopt,
}: ImportPanelProps) {
  const [tab, setTab] = useState<ImportTab>("html");

  const [htmlState, htmlAction] = useActionState(importHtmlAction, idleImportState);
  const [urlState, urlAction] = useActionState(importUrlAction, idleImportState);
  const [inferState, inferAction] = useActionState(
    proposeFromSubmissionsAction,
    idleImportState,
  );

  const state =
    tab === "html" ? htmlState : tab === "url" ? urlState : inferState;

  return (
    <div className="min-w-0">
      <div role="group" aria-label="Where to import from" className="flex flex-wrap gap-1.5">
        <Tab id="html" active={tab} onSelect={setTab}>
          Paste your markup
        </Tab>
        <Tab id="url" active={tab} onSelect={setTab}>
          From a URL
        </Tab>
        <Tab id="submissions" active={tab} onSelect={setTab}>
          From what has arrived
        </Tab>
      </div>

      <div className="mt-4">
        {tab === "html" ? (
          <form action={htmlAction}>
            <input type="hidden" name="slug" value={slug} />
            <TextAreaField
              label="Your form's HTML"
              name="html"
              rows={7}
              spellCheck={false}
              placeholder={'<form action="/contact" method="post">\n  <input type="email" name="email" required>\n</form>'}
              hint="Everything from <form> to </form>. If the form is drawn by JavaScript, copy it out of the browser's element inspector rather than from View Source."
            />
            <Submit pendingLabel="Reading…">Read this markup</Submit>
          </form>
        ) : null}

        {tab === "url" ? (
          <form action={urlAction}>
            <input type="hidden" name="slug" value={slug} />
            <TextField
              label="Page address"
              name="url"
              type="url"
              inputMode="url"
              spellCheck={false}
              placeholder="https://example.com/contact"
              hint="We fetch the page and read its markup. Only what the server sends — a form assembled in the browser will not be there, so paste it instead."
            />
            <Submit pendingLabel="Fetching…">Fetch and read</Submit>
          </form>
        ) : null}

        {tab === "submissions" ? (
          <form action={inferAction}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="publicId" value={publicId} />
            <p className="max-w-[60ch] text-sm text-muted-foreground">
              {submissionCount === 0
                ? "This endpoint has not received anything yet, so there is nothing to read. Come back once a submission has landed, or paste your markup instead."
                : `This endpoint has taken ${submissionCount.toLocaleString("en-GB")} submission${submissionCount === 1 ? "" : "s"}. We can propose a schema from what actually arrived — which is a description of your real traffic rather than of the markup you believe is on the page.`}
            </p>
            <Submit pendingLabel="Reading submissions…" disabled={submissionCount === 0}>
              Propose from submissions
            </Submit>
          </form>
        ) : null}
      </div>

      <Result state={state} onAdopt={onAdopt} />
    </div>
  );
}

/**
 * A segmented choice, as a plain toggle button rather than an ARIA tab.
 *
 * The tab pattern owes arrow-key navigation, roving tabindex and a `tabpanel`
 * for every tab, and half an implementation of it is worse than none: a screen
 * reader announces "tab, 1 of 3" and then the arrow keys do nothing. Three
 * buttons with `aria-pressed` promise only what they deliver.
 */
function Tab({
  id,
  active,
  onSelect,
  children,
}: {
  id: ImportTab;
  active: ImportTab;
  onSelect: (tab: ImportTab) => void;
  children: React.ReactNode;
}) {
  const selected = active === id;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(id)}
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected
          ? "border-border-control bg-sunken text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Submit({
  children,
  pendingLabel,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <QuietButton type="submit" disabled={pending || disabled} className="mt-3">
      {pending ? pendingLabel : children}
    </QuietButton>
  );
}

function Result({
  state,
  onAdopt,
}: {
  state: ImportActionState;
  onAdopt: (candidate: ImportCandidate) => void;
}) {
  if (state.status === "idle") return null;

  return (
    <div className="mt-4" role="status" aria-live="polite">
      <p
        className={
          state.status === "error"
            ? "text-sm text-destructive"
            : "text-sm text-foreground"
        }
      >
        {state.message}
      </p>

      {state.notes.length > 0 ? <Notes notes={state.notes} /> : null}

      {state.candidates.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {state.candidates.map((candidate) => (
            <li
              key={candidate.id}
              className="rounded-lg border border-border bg-card px-3.5 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {candidate.label}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {candidate.fieldCount} field
                    {candidate.fieldCount === 1 ? "" : "s"}
                    {candidate.action ? ` · posts to ${candidate.action}` : null}
                  </p>
                </div>
                <QuietButton onClick={() => onAdopt(candidate)}>
                  Load into the editor
                </QuietButton>
              </div>

              {candidate.notes.length > 0 ? <Notes notes={candidate.notes} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * What the importer could not do cleanly.
 *
 * Shown rather than swallowed, and shown next to the thing it is about. A
 * control with no `name` was skipped, two fields collided, an option had an
 * empty value — every one of those produces a *plausible* wrong schema, and a
 * plausible wrong schema is worse than a failed import because nobody checks it.
 */
function Notes({ notes }: { notes: string[] }) {
  return (
    <ul className="mt-2.5 grid gap-1.5 border-l-2 border-border pl-3">
      {notes.map((note, index) => (
        <li key={index} className="text-sm text-muted-foreground">
          {note}
        </li>
      ))}
    </ul>
  );
}
