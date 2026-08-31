import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { loadForm } from "@/lib/render/form";

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
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ formId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { formId } = await params;
  const form = await loadForm(formId);
  return { title: form.status === "ok" ? `${form.title} — sent` : "Sent" };
}

export default async function FormThanksPage({ params }: PageProps) {
  const { formId } = await params;
  const form = await loadForm(formId);

  // A thank-you page for a form that does not exist is a page that tells a
  // stranger an endpoint ID is real. It is the same 404 the form itself gives.
  if (form.status === "not_found") notFound();

  const title = form.status === "ok" ? form.title : form.endpointName;

  return (
    <main className="mx-auto w-full max-w-[40rem] flex-1 px-5 py-[clamp(2.5rem,7vw,4.5rem)]">
      <p className="font-mono text-label uppercase text-muted-foreground">{title}</p>
      <h1 className="mt-4 text-h2 text-balance">Thanks — that’s been sent.</h1>
      <p className="mt-4 max-w-[52ch] text-base text-muted-foreground">
        Your answers have been recorded. Nothing else is needed from you.
      </p>
      <p className="mt-8 text-sm">
        <Link
          href={`/f/${encodeURIComponent(formId)}`}
          className="rounded-sm text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Send another response
        </Link>
      </p>
    </main>
  );
}
