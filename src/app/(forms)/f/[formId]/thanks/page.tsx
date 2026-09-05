import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  carriedParams,
  queryEntries,
  readEmbedContext,
  withQuery,
} from "@/lib/embed/params";
import { loadForm } from "@/lib/render/form";
import { EmbedFrame } from "../embed-frame";

/**
 * Where a hosted form lands after a successful submission.
 *
 * The ingest path already decides where a browser goes — `_redirect`, checked
 * against the request's own origin, falling back to a default
 * (`src/lib/ingest/respond.ts`). This page is what the rendered form names in
 * that field, so the success state is reached through the endpoint's own
 * mechanism rather than through a second one invented here. A customer who
 * later sets their own thank-you URL will simply be sent there instead, and
 * nothing about this page has to change.
 *
 * It is a separate URL, not a flag on the form, because the redirect is a 303:
 * refreshing here cannot repost the lead, and neither can the back button.
 *
 * ## Inside a frame (#39)
 *
 * The embed parameters ride along on the `_redirect` the form posted, which is
 * the only way they can: this is a fresh navigation inside the frame and it has
 * no memory of the page before it. Without them a successful submission is the
 * moment an embedded form breaks — the frame keeps the height of a form and
 * fills it with four lines of thanks, or repaints the full-height layout inside
 * somebody's section. It resizes down instead.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  params: Promise<{ formId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { formId } = await params;
  const form = await loadForm(formId);
  return { title: form.status === "ok" ? `${form.title} — sent` : "Sent" };
}

export default async function FormThanksPage({ params, searchParams }: PageProps) {
  const { formId } = await params;
  const form = await loadForm(formId);

  // A thank-you page for a form that does not exist is a page that tells a
  // stranger an endpoint ID is real. It is the same 404 the form itself gives.
  if (form.status === "not_found") notFound();

  const title = form.status === "ok" ? form.title : form.endpointName;

  const query = await searchParams;
  const embed = readEmbedContext(query);
  const carried = carriedParams(new URLSearchParams(queryEntries(query)));
  const again = withQuery(`/f/${encodeURIComponent(formId)}`, carried);

  return (
    <>
      <main
        // `--form-pad` rather than the literal clamp, for the reason the form
        // itself uses one: an embedded thank-you is inside a section that has
        // already been given its spacing.
        // The same three overrides the form itself takes when it is embedded,
        // and for the same reason: a thank-you that is centred in its own 40rem
        // column inside somebody's section is visibly indented from the heading
        // above it, at the exact moment the visitor is looking for confirmation
        // that something worked. Inline drops all three; a popup keeps its
        // padding, because the dialog is the container.
        style={
          {
            "--form-pad": embed.mode === null ? "clamp(2.5rem,7vw,4.5rem)" : embed.mode === "popup" ? "1.75rem" : "0px",
            "--form-pad-x": embed.mode === null ? "1.25rem" : embed.mode === "popup" ? "1.5rem" : "0px",
            "--form-width": embed.mode === null ? "40rem" : "none",
          } as React.CSSProperties
        }
        className="mx-auto w-full max-w-[var(--form-width)] flex-1 px-[var(--form-pad-x)] py-[var(--form-pad)]"
      >
        <p className="font-mono text-label uppercase text-muted-foreground">{title}</p>
        <h1 className="mt-4 text-h2 text-balance">Thanks — that’s been sent.</h1>
        <p className="mt-4 max-w-[52ch] text-base text-muted-foreground">
          Your answers have been recorded. Nothing else is needed from you.
        </p>
        <p className="mt-8 text-sm">
          <Link
            href={again}
            className="rounded-sm text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Send another response
          </Link>
        </p>
      </main>
      <EmbedFrame context={embed} />
    </>
  );
}
