import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { FormView } from "@/components/render/form-view";
import { cookieName, decodeFlash, ERROR_FLAG } from "@/lib/render/flash";
import { loadForm } from "@/lib/render/form";

/**
 * `GET /f/{formId}` — the form, rendered from its published schema.
 *
 * ## Server-rendered, from the version in force
 *
 * The definition is read on the server and the HTML arrives complete. There is
 * no client fetch of the schema and no loading state, because a form that
 * flashes empty is a form somebody leaves before it finishes, and the traffic
 * that reached it was usually paid for.
 *
 * ## What it costs
 *
 * No analytics, no tracking pixel, no webfont request of its own, and no client
 * component anywhere beneath this file. What JavaScript the page carries is the
 * App Router's own runtime, which comes with the framework; nothing here adds a
 * byte to it, and nothing here needs it to run. Turn scripting off and the form
 * still submits — see the note in `submit/route.ts`.
 *
 * ## Three ways this page is not a form
 *
 * Unknown or deleted → 404. A live endpoint with **no** schema → an explanation,
 * not an error: that is #50 working as designed, and the endpoint is accepting
 * posts from the customer's own markup right now. A schema row this build cannot
 * parse → our bug, said plainly, with the endpoint still named so the customer
 * can point their existing form at it.
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
  if (form.status !== "ok") return { title: "Form" };

  return {
    title: form.title,
    // Deliberately no description, no canonical and no Open Graph. The page is
    // noindex (see `layout.tsx`), and inventing a description for someone
    // else's form is us writing copy on their behalf.
  };
}

export default async function FormPage({ params, searchParams }: PageProps) {
  const { formId } = await params;
  const form = await loadForm(formId);

  if (form.status === "not_found") notFound();

  if (form.status === "no_schema") {
    return <NoSchema publicId={form.publicId} name={form.endpointName} />;
  }

  if (form.status === "unreadable_schema") {
    return <UnreadableSchema publicId={form.publicId} name={form.endpointName} />;
  }

  // The retry cookie is only consulted when the redirect flag is present, so a
  // plain reload of this URL is always a clean form. See `flash.ts`.
  const query = await searchParams;
  const retrying = query[ERROR_FLAG] === "1";
  const flash = retrying
    ? decodeFlash((await cookies()).get(cookieName(formId))?.value)
    : null;

  return (
    <FormView
      document={form.document}
      title={form.title}
      action={`/f/${encodeURIComponent(form.publicId)}/submit`}
      redirectTo={`/f/${encodeURIComponent(form.publicId)}/thanks`}
      theme={form.theme}
      errors={flash?.errors ?? []}
      values={flash?.values ?? {}}
      truncated={flash?.truncated ?? false}
    />
  );
}

/**
 * A live endpoint with no schema.
 *
 * The single most important thing on this page is that it does not read as a
 * failure. The endpoint works. It is accepting submissions from the customer's
 * own HTML right now, which is the whole premise of #50 — a schema is what you
 * declare when you want us to render the form *for* you, and not declaring one
 * is a supported, permanent state.
 */
function NoSchema({ publicId, name }: { publicId: string; name: string }) {
  return (
    <Notice title="This endpoint has no form to render">
      <p className="mt-4 text-base text-muted-foreground">
        <span className="text-foreground">{name}</span> is live and accepting submissions.
        It just has no schema declared, so there is no definition for us to draw a form
        from — which is normal. Point your own markup at it:
      </p>
      <pre className="mt-5 overflow-x-auto rounded-md border border-border bg-sunken p-4">
        <code className="font-mono text-sm">{`<form method="POST" action="/e/${publicId}">`}</code>
      </pre>
      <p className="mt-5 text-base text-muted-foreground">
        Declare a schema on the endpoint and this page starts rendering the form itself.
      </p>
    </Notice>
  );
}

/**
 * A schema row this build cannot read.
 *
 * Stored schemas are immutable and can outlive the code that wrote them, so
 * this is reachable and it is always our fault. It says so, and it still gives
 * the customer the endpoint ID, because their existing form keeps working
 * against it either way.
 */
function UnreadableSchema({ publicId, name }: { publicId: string; name: string }) {
  return (
    <Notice title="This form could not be rendered">
      <p className="mt-4 text-base text-muted-foreground">
        <span className="text-foreground">{name}</span> has a schema this version of
        Endpoint Forms cannot read. That is a bug on our side, not a problem with your
        endpoint — it is still accepting submissions at{" "}
        <code className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-sm">
          /e/{publicId}
        </code>
        .
      </p>
    </Notice>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[40rem] flex-1 px-5 py-[clamp(2.5rem,7vw,4.5rem)]">
      <h1 className="text-h2 text-balance">{title}</h1>
      {children}
    </main>
  );
}
