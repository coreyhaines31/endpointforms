"use client";

import { ExternalLink } from "lucide-react";

import { FormView } from "@/components/render/form-view";
import { EMPTY_THEME, resolveTheme } from "@/lib/render/theme";
import type { FormSchemaDocument } from "@/lib/schema/format";

/**
 * The form, drawn by the code that draws the real one (#35).
 *
 * ## There is exactly one renderer
 *
 * `FormView` below is the same component `src/app/(forms)/f/[formId]/page.tsx`
 * renders to the public. Not a copy of it, not a simplified version of it, and
 * not a second component that happens to agree with it today: the same import,
 * fed the same `FormSchemaDocument`, the same `action`, the same
 * `redirectTo`. A preview that can drift from production is worse than no
 * preview, because it is the thing people trust instead of looking.
 *
 * `FormView` is a plain Server Component with no server-only import beneath it
 * — it reaches only for `lib/render/controls`, `lib/render/messages` and
 * `lib/schema/format`, all of them pure — so it compiles into this client tree
 * unchanged. Nothing had to be relaxed to make that true, and if anything ever
 * makes it untrue, this file stops building rather than quietly forking.
 *
 * ## Why it is inert
 *
 * Two reasons, and the second is the serious one.
 *
 * The preview carries a real `<form method="post">` pointed at the real
 * endpoint. Clicking Submit in it would post a live submission from inside the
 * dashboard. More importantly, an interactive preview puts a *second copy of
 * every control on the page* into the tab order and the accessibility tree —
 * so somebody using a screen reader would meet two "Work email" fields and
 * have no way to tell which one is the editor. `inert` takes the whole subtree
 * out of both. To actually fill the form in, there is a link to the live one.
 *
 * The cost, stated plainly: `FormView` renders a `<main>`, and the app layout
 * already has one, so the preview nests a `<main>` inside a `<main>`. `inert`
 * keeps it out of the accessibility tree, which removes the part that would
 * affect a person. It stays a markup wart, and the alternative — a second
 * renderer, or an iframe re-fetched on every keystroke — is worse than the
 * wart.
 */

export type PreviewPaneProps = {
  document: FormSchemaDocument;
  title: string;
  /** The real form action, so what is drawn is what would ship. */
  action: string;
  redirectTo: string;
  /** Fields left out because they do not yet parse. */
  skipped: number;
  /** Where the live form is, when there is one. */
  liveUrl: string | null;
};

export function PreviewPane({
  document,
  title,
  action,
  redirectTo,
  skipped,
  liveUrl,
}: PreviewPaneProps) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-label uppercase text-muted-foreground">
          Preview — the draft
        </p>
        {liveUrl ? (
          <a
            href={liveUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground underline decoration-border-control underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Open the live form
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Drawn by the same code as the hosted form, from the draft as it stands. It
        is not interactive here — open the live form to fill it in.
      </p>

      {document.fields.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border px-5 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing to draw yet. Add a field and it appears here.
          </p>
        </div>
      ) : (
        <div
          inert
          className="mt-4 overflow-hidden rounded-lg border border-border bg-background"
        >
          <FormView
            document={document}
            title={title}
            action={action}
            redirectTo={redirectTo}
            /* The draft's own theme (#38), resolved by the same function the
               hosted page resolves it with. The preview is only evidence if it
               is drawn the way the real thing is drawn — that goes for the
               colours as much as for the fields. */
            theme={resolveTheme(document.theme ?? EMPTY_THEME)}
            errors={[]}
            values={{}}
            truncated={false}
          />
        </div>
      )}

      {skipped > 0 ? (
        <p className="mt-3 text-sm text-destructive">
          {skipped === 1
            ? "One field is missing from the preview because it does not yet describe a valid field."
            : `${skipped} fields are missing from the preview because they do not yet describe valid fields.`}{" "}
          Their cards say what is wrong.
        </p>
      ) : null}
    </div>
  );
}
