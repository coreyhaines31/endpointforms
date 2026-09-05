"use client";

import { useState } from "react";

import { CopyBlock } from "@/components/app/copy";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import {
  cspDirectives,
  embedSnippets,
  prefillExample,
  type SnippetId,
} from "@/lib/embed/snippets";
import { isReservedFieldName } from "@/lib/schema/reserved";

/**
 * Getting the form onto somebody's site (#39).
 *
 * ## Why four snippets and not one
 *
 * They are not four ways of doing the same thing. A plain `<iframe>` cannot
 * pass a UTM through and cannot resize; a link works in an email and nothing
 * else does; a popup does not request the frame until somebody asks for it.
 * Collapsing them into one "embed code" would mean picking the compromise for
 * everybody, and the compromise is the iframe — the mode that silently drops
 * the attribution this product exists to keep.
 *
 * So each one is offered by name, with what it costs written next to it rather
 * than in documentation nobody reaches. The caveat line is not marketing hedge:
 * for two of the four, it is the difference between attributed leads and a
 * quarter of "direct".
 *
 * ## Why prefill gets its own section
 *
 * Because the rule is surprising and it is better to be surprised here than in
 * a support thread: **a URL can fill in a field somebody can see, and never one
 * they cannot.** A hidden field is the natural place people want to put a plan
 * name or a partner id, and it is exactly the case that turns the submitter's
 * row into the embedder's assertion. Saying so on this screen is cheaper than
 * explaining it after somebody has built a campaign on it.
 */

export type EmbedField = { key: string; type: string };

export type EmbedPanelProps = {
  slug: string;
  renderDomain: string;
  publicId: string;
  /** The draft's fields, so the prefill example uses this form's real names. */
  fields: readonly EmbedField[];
  /** False while nothing is live: the URL below renders an explanation, not a form. */
  published: boolean;
  archived: boolean;
};

export function EmbedPanel({
  slug,
  renderDomain,
  publicId,
  fields,
  published,
  archived,
}: EmbedPanelProps) {
  const [selected, setSelected] = useState<SnippetId>("inline");

  const origin = `https://${slug}.${renderDomain}`;
  const snippets = embedSnippets(origin, publicId);
  const snippet = snippets.find((entry) => entry.id === selected) ?? snippets[0];

  // The same rule `src/lib/embed/prefill.ts` enforces, asked of the draft the
  // person is looking at. Reading it from the shared predicate rather than
  // restating it is what keeps the screen and the renderer from disagreeing
  // about which of somebody's fields a link can fill in.
  const prefillable = fields
    .filter((field) => field.type !== "hidden" && !isReservedFieldName(field.key))
    .map((field) => field.key);

  const hiddenCount = fields.filter((field) => field.type === "hidden").length;

  // The example is written with a name and an email address in it, so it is
  // only honest about a field that takes free text. Aiming it at a `select`
  // would print a link that this form would refuse — a choice field accepts its
  // own declared options and nothing else (`src/lib/embed/prefill.ts`).
  const example = prefillExample(
    origin,
    publicId,
    prefillable.filter((key) => {
      const type = fields.find((field) => field.key === key)?.type;
      return type === "text" || type === "email" || type === "phone" || type === "textarea";
    }),
  );

  return (
    <Panel>
      <PanelHeader
        title="Put it on your site"
        description="Four modes, one script. What each one cannot do is written into the snippet, because the two that drop attribution look identical to the two that do not until somebody checks a report."
      />

      {/* `grid-cols-[minmax(0,1fr)]` rather than a bare `grid`. An implicit grid
          column is `auto`, which sizes to max-content and happily grows past
          its container — so a snippet with a 70-character line pushed the whole
          panel out over the column beside it, and the `overflow-x: auto` on the
          code block never engaged because the block was never narrower than its
          content. Naming the track with a zero minimum is what makes the code
          scroll inside the panel instead of the panel scrolling the page. */}
      <PanelBody className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {!published ? (
          <p className="rounded-md border border-bot-edge bg-bot-surface px-4 py-3 text-sm text-bot">
            Nothing is published yet, so this URL currently renders an explanation
            rather than a form. The snippets are already correct — publish and they
            start working with no edit.
          </p>
        ) : null}

        {archived ? (
          <p className="rounded-md border border-bot-edge bg-bot-surface px-4 py-3 text-sm text-bot">
            This endpoint is archived and is refusing submissions with a 410. Restore
            it before putting any of this on a page.
          </p>
        ) : null}

        <div>
          <div role="group" aria-label="Embed mode" className="flex flex-wrap gap-2">
            {snippets.map((entry) => {
              const active = entry.id === selected;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(entry.id)}
                  // Written out rather than merged: twMerge reads our size
                  // tokens as colours. See `src/lib/utils.ts`.
                  className={
                    active
                      ? "rounded-md border border-foreground bg-sunken px-3 py-1.5 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      : "rounded-md border border-border-control px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-sunken hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  }
                >
                  {entry.label}
                </button>
              );
            })}
          </div>

          <p className="mt-4 max-w-[68ch] text-sm text-muted-foreground">{snippet.summary}</p>
          <p className="mt-2 max-w-[68ch] text-sm text-foreground">{snippet.caveat}</p>
        </div>

        <CopyBlock label={`${snippet.label} snippet`} code={snippet.code} />

        <div>
          <p className="font-mono text-label uppercase text-muted-foreground">
            Prefilling from a link
          </p>
          <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
            A query parameter whose name matches a field fills that field in.{" "}
            <span className="text-foreground">
              Only fields somebody can see and change.
            </span>{" "}
            A hidden field is never prefilled from a URL: the person submitting cannot
            read it, so a value put there would be your claim carrying their signature.
            Attribution has its own path and its own columns and is unaffected.
            {hiddenCount > 0 ? (
              <>
                {" "}
                This form has {hiddenCount === 1 ? "one hidden field" : `${hiddenCount} hidden fields`};{" "}
                {hiddenCount === 1 ? "it is" : "they are"} not prefillable.
              </>
            ) : null}
          </p>

          {example === null ? (
            <p className="mt-3 max-w-[68ch] text-sm text-muted-foreground">
              Add a visible field and an example link appears here.
            </p>
          ) : (
            <pre
              tabIndex={0}
              role="region"
              aria-label="Prefill example"
              className="mt-3 overflow-x-auto rounded-md border border-border bg-sunken px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <code className="font-mono text-sm text-foreground">{example}</code>
            </pre>
          )}
        </div>

        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-sm text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <svg
              viewBox="0 0 12 12"
              className="size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
              aria-hidden="true"
            >
              <path d="M4.5 2 8.5 6 4.5 10" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            If your site sets a Content-Security-Policy
          </summary>

          <div className="mt-4">
            <CopyBlock
              label="CSP directives"
              code={cspDirectives(origin)}
              description="Two directives, and no 'unsafe-inline' in either. The script is an external file and everything it draws is set as CSSOM properties rather than a style attribute, so a page with script-src 'self' plus this origin renders the popup correctly."
            />
          </div>
        </details>
      </PanelBody>
    </Panel>
  );
}
