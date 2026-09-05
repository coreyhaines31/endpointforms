import { after } from "next/server";

import { FormDocument } from "@/components/render/form-document";
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
 * `GET /f/{formId}` — the form, rendered from its published schema (#56).
 *
 * ## A route handler, not a page
 *
 * Everything below used to be an App Router page and the logic is unchanged;
 * only the last step differs, where the tree is rendered to a string instead of
 * handed to the framework. The reason is arithmetic: an App Router route ships
 * react-dom plus the router runtime whether or not the page uses them, and this
 * page uses neither — no Client Component beneath it, no `useState`, no event
 * handler, and it submits with scripting switched off. That runtime was 134 KB
 * of the 150 KB this page transferred, on traffic the customer paid for.
 *
 * `renderToStaticMarkup` rather than `renderToString`: there is no hydration, so
 * the `data-reactroot` bookkeeping would be bytes describing a client that never
 * arrives.
 *
 * The published schema is still the only source — `loadForm` and everything
 * under `src/lib/render/` are untouched, so the hosted form and the MCP tool
 * (#32) keep deriving from one `FormSchemaDocument`.
 *
 * ## Server-rendered, from the version in force
 *
 * The definition is read on the server and the HTML arrives complete. There is
 * no client fetch of the schema and no loading state, because a form that
 * flashes empty is a form somebody leaves before it finishes.
 *
 * ## Three ways this page is not a form
 *
 * Unknown or deleted → 404. A live endpoint with **no** schema → an explanation,
 * not an error: that is #50 working as designed. A schema row this build cannot
 * parse → our bug, said plainly, with the endpoint still named.
 */

// The flash cookie and the A/B assignment are both read per request.
export const dynamic = "force-dynamic";
// `react-dom/server` and the Postgres driver.
export const runtime = "nodejs";

/** One cookie by name, from the request's own header. */
function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/**
 * The query in the shape the page used to receive it.
 *
 * A repeated key becomes an array, exactly as the App Router's `searchParams`
 * did, so `prefillFromQuery` and `readEmbedContext` see what they always saw.
 */
function queryRecord(url: URL): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

/**
 * One document, one response. `X-Robots-Tag` alongside the meta tag.
 *
 * `react-dom/server` is imported at call time rather than at the top of the
 * file because Next refuses a static import of it anywhere under `app/` — the
 * check exists to keep it out of client bundles and does not distinguish a
 * route handler, which has no client bundle at all. The import is cached by the
 * module system after the first request.
 */
async function html(body: React.ReactElement, status = 200): Promise<Response> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return new Response(`<!doctype html>${renderToStaticMarkup(body)}`, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ formId: string }> },
): Promise<Response> {
  const { formId } = await ctx.params;
  const form = await loadForm(formId);

  if (form.status === "not_found") {
    return await html(
      <FormDocument title="Form not found">
        <NotFound />
      </FormDocument>,
      404,
    );
  }

  if (form.status === "no_schema") {
    return await html(
      <FormDocument title={form.endpointName}>
        <NoSchema publicId={form.publicId} name={form.endpointName} />
      </FormDocument>,
    );
  }

  if (form.status === "unreadable_schema") {
    return await html(
      <FormDocument title={form.endpointName}>
        <UnreadableSchema publicId={form.publicId} name={form.endpointName} />
      </FormDocument>,
    );
  }

  const url = new URL(request.url);
  const query = queryRecord(url);

  // The retry cookie is only consulted when the redirect flag is present, so a
  // plain reload of this URL is always a clean form. See `flash.ts`.
  const retrying = query[ERROR_FLAG] === "1";
  const flash = retrying ? decodeFlash(readCookie(request, cookieName(formId))) : null;

  // Hindsight (#45). Null for most visitors most of the time — no running test,
  // or no visitor cookie because the browser refused one, in which case they are
  // deliberately not enrolled rather than fingerprinted into the test.
  const served = await resolveVariant(
    formId,
    readVisitorKey(readCookie(request, VISITOR_COOKIE)),
  );

  if (served) {
    // `after()` rather than an awaited write or a floating promise. A view count
    // is a denominator, and the page a visitor is waiting on must not wait on
    // it. It works in a route handler exactly as it did in the page.
    after(async () => {
      try {
        await recordExposure(served.workspaceId, served.testId, served.variantId);
      } catch (error) {
        console.error(`[hindsight] exposure not recorded for ${served.variantId}`, error);
      }
    });
  }

  const document = served?.document ?? form.document;
  const embed = readEmbedContext(query);

  // Prefill is skipped entirely whenever the retry cookie is in force: once
  // somebody has submitted, their answers are the truth about this form and a
  // query parameter is a stale instruction from before they touched it.
  const prefill = flash === null ? prefillFromQuery(document, query) : NO_PREFILL;
  const values = flash?.values ?? prefill.values;

  // Null for every form with no steps, and null for every failure — our
  // bookkeeping failing must never be the reason somebody cannot send a form.
  const step = await resolveStepContext(formId, document, query, values);

  const carried = carriedParams(new URLSearchParams(queryEntries(query)));
  const encoded = encodeURIComponent(form.publicId);

  return await html(
    <FormDocument
      title={form.title}
      // The embedded ground is transparent and the padding goes to zero, so the
      // frame shows the customer's own page behind the form rather than ours.
      bodyClassName={embed.mode === null ? undefined : "bg-transparent"}
    >
      <FormView
        document={document}
        title={form.title}
        action={withQuery(`/f/${encoded}/submit`, carried)}
        redirectTo={withQuery(`/f/${encoded}/thanks`, carried)}
        theme={embed.mode === null ? form.theme : embeddedTheme(form.theme, embed.mode)}
        errors={
          step
            ? step.errors.map((issue) => ({ field: issue.field, code: issue.code }))
            : (flash?.errors ?? [])
        }
        values={step?.values ?? values}
        truncated={flash?.truncated ?? false}
        controlFields={embed.pageUrl === null ? undefined : { _page_url: embed.pageUrl }}
        step={step}
        stepAction={withQuery(`/f/${encoded}/step`, carried)}
      />
      <EmbedFrame context={embed} />
    </FormDocument>,
  );
}

/**
 * No such form.
 *
 * A plain 404 body rather than the framework's, because the framework's belongs
 * to the marketing site and would drag its chrome onto a customer's domain.
 */
function NotFound() {
  return (
    <Notice title="This form does not exist">
      <p className="mt-4 text-base text-muted-foreground">
        The link may be mistyped, or the endpoint behind it may have been removed.
      </p>
    </Notice>
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
