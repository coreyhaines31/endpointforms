import { eq } from "drizzle-orm";

import { unsafeDb } from "../../db/client.ts";
import { withWorkspace } from "../../db/scoped.ts";
import { endpoints, formSchemas } from "../../db/schema.ts";
import { readStoredDocument, type FormSchemaDocument } from "../schema/format.ts";
import { assignVariant } from "./assign.ts";
import { readRunningTest } from "./query.ts";

/**
 * Serving a variant to a visitor (#45).
 *
 * The bridge between `./assign.ts`, which is pure, and the two routes that need
 * an answer from it: the page that renders a form and the route that takes its
 * submission.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SUBMIT PATH RE-DERIVES THE ARM RATHER THAN BEING TOLD IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The obvious design carries the variant from the rendered page to the
 * submission — a hidden input, or a query parameter on the form's action. Both
 * work and both are **forgeable**: the value is in the visitor's browser, so a
 * submission can name whichever arm it likes, and a split test whose arm
 * assignment can be typed by the person being tested is not one.
 *
 * Because assignment is a pure function of the test id and the visitor's key,
 * the submit route can simply run it again. Same cookie, same test, same arm,
 * with nothing round-tripped through the client and nothing to forge: the worst
 * a visitor can do is clear their own cookie and re-roll their own arm, which
 * is one submission moving between two buckets and is true of every split test
 * ever built.
 *
 * It also means **`src/components/render/form-view.tsx` is not touched**. No
 * hidden field, no extra markup, and no change to a form that renders without
 * JavaScript.
 *
 * The one seam: if a test is stopped between the render and the submit, the
 * re-derivation finds no running test and the submission is stamped with no
 * variant. It lands, it is delivered, it counts in Yield, and it is simply not
 * in the test — which is the correct treatment of a lead that arrived after the
 * experiment ended.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHO IS NOT ENROLLED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Everything here returns null — meaning "render the endpoint's ordinary active
 * schema and stamp nothing" — when there is no visitor key, no running test, or
 * an arm that points at no schema of its own. None of those is an error. A
 * visitor who blocks cookies has no key and is deliberately not fingerprinted
 * into one (`./visitor.ts` has the reasoning); they submit normally and their
 * lead is counted everywhere except in the test.
 */

/** Same shape check the render and ingest paths use, so junk never reaches Postgres. */
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,64}$/;

export type ServedVariant = {
  workspaceId: string;
  testId: string;
  variantId: string;
  variantName: string;
  /**
   * The version id of the form this arm serves, or null when it serves the
   * endpoint's own active schema. Carried alongside the parsed document because
   * the ingest path stamps the id and validates against the document, and the
   * two must describe the same form.
   */
  schemaVersionId: string | null;
  /**
   * The form to render for this arm, or null when the arm serves the
   * endpoint's own active schema — which is the ordinary shape of a control.
   */
  document: FormSchemaDocument | null;
};

/**
 * Which arm this visitor gets on this endpoint, or null if they are not in a
 * test.
 *
 * The endpoint lookup is unscoped for the same reason `loadForm` and
 * `resolveEndpoint` are, and named as the same category in `src/db/scoped.ts`:
 * a visitor arrives with a public id and no session, so there is no workspace
 * to scope to until this query says which one it is. It reads two columns of
 * one row on a unique index and no customer data at all. Everything after it —
 * the test, the arms, the exposure — runs inside `withWorkspace`.
 */
export async function resolveVariant(
  formPublicId: string,
  visitorKey: string | null,
): Promise<ServedVariant | null> {
  if (!visitorKey) return null;
  if (!PUBLIC_ID.test(formPublicId)) return null;

  const [endpoint] = await unsafeDb
    .select({ id: endpoints.id, workspaceId: endpoints.workspaceId })
    .from(endpoints)
    .where(eq(endpoints.publicId, formPublicId))
    .limit(1);

  if (!endpoint) return null;

  const test = await readRunningTest(endpoint.workspaceId, endpoint.id);
  if (!test || test.variants.length === 0) return null;

  const variant = assignVariant(test.id, test.variants, visitorKey);
  if (!variant) return null;

  const document =
    variant.schemaVersionId === null
      ? null
      : await readVariantDocument(endpoint.workspaceId, variant.schemaVersionId);

  return {
    workspaceId: endpoint.workspaceId,
    testId: test.id,
    variantId: variant.id,
    variantName: variant.name,
    schemaVersionId: variant.schemaVersionId,
    document,
  };
}

/**
 * The arm's own form definition.
 *
 * Null when the row cannot be read by this build, which falls the visitor back
 * to the endpoint's active schema rather than showing them nothing. A schema we
 * cannot parse is our bug, and it must not become a lost lead — the same rule
 * `src/lib/ingest/store.ts` follows when it stamps a submission with a version
 * id it could not read.
 */
async function readVariantDocument(
  workspaceId: string,
  schemaVersionId: string,
): Promise<FormSchemaDocument | null> {
  // Scoped, unlike the endpoint lookup above, because by this point the
  // workspace *is* known — so there is no reason to read a form definition
  // outside the predicate and the row-level security policy. Returning nothing
  // here shows the endpoint's own form rather than someone else's.
  return withWorkspace(workspaceId, async (ws) => {
    const [row] = await ws.tx
      .select({ fields: formSchemas.fields })
      .from(formSchemas)
      .where(ws.where(formSchemas, eq(formSchemas.id, schemaVersionId)))
      .limit(1);

    return row ? readStoredDocument(row.fields) : null;
  });
}
