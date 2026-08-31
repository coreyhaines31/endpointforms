import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/container";
import { SchemaBuilder, type BuilderVersion } from "@/components/app/builder/builder";
import { EndpointFirstNote } from "@/components/app/builder/endpoint-first";
import type { VersionSummary } from "@/components/app/builder/versions-panel";
import { listSchemaVersions } from "@/lib/schema/store";
import { getEndpointByPublicId } from "@/lib/workspaces/endpoints";
import { requireWorkspace } from "@/lib/workspaces/server";
import { RENDER_DOMAIN } from "@/lib/workspaces/slug";

/**
 * The builder (#35).
 *
 * ## Draft and published are derived, not stored
 *
 * `form_schemas` is append-only and the endpoint holds a pointer at the live
 * version, which already answers both questions this page has to ask:
 *
 *   - **published** is the row the pointer names, or null.
 *   - **a draft exists** exactly when the newest row is not that one.
 *
 * There is no `is_draft` column and there must not be one. A flag alongside a
 * pointer is two facts that can disagree, and the day they disagree is the day
 * somebody's live form is not the version the screen says it is.
 *
 * ## Everything the editor needs arrives on the first paint
 *
 * The versions and their documents are read here, on the server, and handed
 * down as props. The builder is a Client Component because editing a list of
 * fields is genuinely interactive, but it does not fetch: there is no request
 * waterfall between opening this page and being able to type in it.
 */

export const dynamic = "force-dynamic";

export default async function BuilderPage({
  params,
}: {
  params: Promise<{ slug: string; publicId: string }>;
}) {
  const { slug, publicId } = await params;
  const { workspace } = await requireWorkspace(slug);

  const endpoint = await getEndpointByPublicId(workspace.id, publicId);
  if (!endpoint) notFound();

  const versions = await listSchemaVersions(workspace.id, endpoint.id);

  const active = versions.find((version) => version.active) ?? null;
  const newest = versions[0] ?? null;
  // The newest row not being the live one is the whole definition of "there is
  // an unpublished draft". See the note above.
  const draft = newest !== null && !newest.active ? newest : null;

  const published: BuilderVersion | null =
    active === null
      ? null
      : {
          id: active.id,
          version: active.version,
          mode: active.mode,
          document: active.document,
        };

  const draftVersion: BuilderVersion | null =
    draft === null
      ? null
      : { id: draft.id, version: draft.version, mode: draft.mode, document: draft.document };

  const summaries: VersionSummary[] = versions.map((version) => ({
    id: version.id,
    version: version.version,
    mode: version.mode,
    source: version.source,
    // ISO rather than a Date: a Date does not survive the boundary into a
    // Client Component, and `RelativeTime` wants one back on the other side.
    createdAt: version.createdAt.toISOString(),
    active: version.active,
    fieldCount: version.document === null ? null : version.document.fields.length,
  }));

  const encoded = encodeURIComponent(endpoint.publicId);

  return (
    <Container className="max-w-[76rem] pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">
        <Link
          href={`/app/${workspace.slug}/endpoints`}
          className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Endpoints
        </Link>
        {" / "}
        <Link
          href={`/app/${workspace.slug}/endpoints/${encoded}`}
          className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {endpoint.name}
        </Link>
      </p>

      <h1 className="mt-4 text-h2">Form</h1>
      <p className="mt-3 max-w-[66ch] text-base text-muted-foreground">
        One definition, three surfaces: the form we host, the tool an agent calls, and
        what a raw POST is checked against. Edit it here and nothing changes for anyone
        until you publish.
      </p>

      {published === null ? (
        <div className="mt-8">
          <EndpointFirstNote
            publicId={endpoint.publicId}
            endpointUrl={`https://${RENDER_DOMAIN}/e/${endpoint.publicId}`}
          />
        </div>
      ) : null}

      <div className="mt-6">
        <SchemaBuilder
          slug={workspace.slug}
          publicId={endpoint.publicId}
          endpointName={endpoint.name}
          archived={endpoint.archivedAt !== null}
          submissionCount={endpoint.submissionCount}
          published={published}
          draft={draftVersion}
          versions={summaries}
          formUrl={`https://${RENDER_DOMAIN}/f/${encoded}`}
          // The strings the hosted page itself passes to `FormView`, verbatim.
          // A preview that draws a different action is drawing a different form.
          formAction={`/f/${encoded}/submit`}
          formRedirect={`/f/${encoded}/thanks`}
        />
      </div>
    </Container>
  );
}
