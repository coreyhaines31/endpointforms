import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { FormView } from "@/components/render/form-view";
import { embeddedTheme } from "@/lib/embed/layout";
import {
  carriedParams,
  queryEntries,
  readEmbedContext,
  withQuery,
} from "@/lib/embed/params";
import { NO_PREFILL, prefillFromQuery } from "@/lib/embed/prefill";
import { readVisitorKey } from "@/lib/hindsight/assign";
import { resolveVariant } from "@/lib/hindsight/serve";
import { recordExposure } from "@/lib/hindsight/store";
import { VISITOR_COOKIE } from "@/lib/hindsight/visitor";
import { cookieName, decodeFlash, ERROR_FLAG } from "@/lib/render/flash";
import { loadForm } from "@/lib/render/form";
import { resolveStepContext } from "@/lib/steps/serve";
import { EmbedFrame } from "./embed-frame";

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
 *
 * ## The same page, inside somebody else's site (#39)
 *
 * `?ef_embed=inline` is the only difference between this page in a tab and this
 * page in a customer's `<iframe>`, and it changes three things and no others:
 * the ground goes transparent and the page padding goes to zero, a ~500-byte
 * inline script starts reporting the content height to the parent, and the
 * parent page's URL is carried into the submission as `_page_url`.
 *
 * Everything the frame knows about the page it is in arrived on that query
 * string, because a cross-origin frame cannot read its parent's location. The
 * snippet in `public/embed.js` is what puts it there; `src/lib/embed/params.ts`
 * is what refuses to believe most of it.
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
  const jar = await cookies();
  const flash = retrying ? decodeFlash(jar.get(cookieName(formId))?.value) : null;

  // Hindsight (#45). Null for most visitors most of the time — no running test,
  // or no visitor cookie because the browser refused one, in which case they are
  // deliberately not enrolled rather than fingerprinted into the test. Either
  // way the endpoint's own form renders and nothing downstream changes.
  const served = await resolveVariant(
    formId,
    readVisitorKey(jar.get(VISITOR_COOKIE)?.value),
  );

  if (served) {
    // `after()` rather than an awaited write or a floating promise. A view
    // count is a denominator, and the page a visitor is waiting on — traffic
    // somebody paid for — must not wait on it. If the write fails, one exposure
    // is missed and the panel reports a marginally lower completion rate; if it
    // were awaited, a slow database would cost the lead itself.
    after(async () => {
      try {
        await recordExposure(served.workspaceId, served.testId, served.variantId);
      } catch (error) {
        console.error(`[hindsight] exposure not recorded for ${served.variantId}`, error);
      }
    });
  }

  const document = served?.document ?? form.document;

  // Embedding (#39). `NOT_EMBEDDED` for every direct visit, which is most of
  // them, and nothing below changes shape when it is.
  const embed = readEmbedContext(query);

  /**
   * Prefill, and the one rule that keeps it from being a lie.
   *
   * **Skipped entirely whenever the retry cookie is in force.** Once somebody
   * has submitted, their answers are the truth about this form and a query
   * parameter is a stale instruction from before they touched it. Merging the
   * two would mean a URL silently restoring a value they had just deleted —
   * indistinguishable, in the row that gets stored, from them having typed it.
   *
   * A cookie that expired is not the same thing: `flash` is null, nothing was
   * carried back, and the page is a fresh form again — so it prefills again,
   * which is what somebody reloading a prefilled link expects.
   */
  const prefill = flash === null ? prefillFromQuery(document, query) : NO_PREFILL;
  const values = flash?.values ?? prefill.values;

  /**
   * Which screen of a multi-step form this is (#37).
   *
   * **Null for every form with no steps, and null for every failure** — a
   * partial key that expired, one naming a visit that already finished, one
   * somebody typed, a database we could not reach. All of them land on the same
   * branch, and that branch is the form this page has always rendered: every
   * field, one screen, one Submit button. Our bookkeeping failing must never be
   * the reason somebody cannot send a form.
   *
   * Answers come back from the partial rather than from the request, because a
   * 303 turns the step POST into a GET and the body is gone by the time this
   * runs. `src/lib/steps/plan.ts` explains why that trade was worth making.
   */
  const step = await resolveStepContext(formId, document, query, values);

  // Carried onto the `action` rather than left on this page's URL: the POST
  // goes to a different path, and `extractAttribution` reads the endpoint URL's
  // own query string as its fourth source. It is also what lets the submit
  // route rebuild an embedded form's URL when it has to send somebody back.
  const carried = carriedParams(new URLSearchParams(queryEntries(query)));
  const encoded = encodeURIComponent(form.publicId);

  return (
    <>
      <FormView
        document={document}
        title={form.title}
        action={withQuery(`/f/${encoded}/submit`, carried)}
        // The thank-you page has to know it is in a frame too, or a successful
        // submission repaints the full-height page inside somebody's section
        // and stops resizing at the moment the form finally worked.
        redirectTo={withQuery(`/f/${encoded}/thanks`, carried)}
        theme={embed.mode === null ? form.theme : embeddedTheme(form.theme, embed.mode)}
        // On a stepped form the errors are re-derived from the stored answers
        // by the same validator, so nothing has to survive the redirect — no
        // cookie to be blocked inside somebody's iframe, nothing to truncate.
        errors={
          step
            ? step.errors.map((issue) => ({ field: issue.field, code: issue.code }))
            : (flash?.errors ?? [])
        }
        values={step?.values ?? values}
        truncated={flash?.truncated ?? false}
        controlFields={embed.pageUrl === null ? undefined : { _page_url: embed.pageUrl }}
        step={step}
        // Every screen posts here, the last one included: the step route
        // forwards the final screen's identical bytes to `handleSubmission`.
        stepAction={withQuery(`/f/${encoded}/step`, carried)}
      />
      <EmbedFrame context={embed} />
    </>
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
