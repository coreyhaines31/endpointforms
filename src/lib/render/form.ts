import { eq } from "drizzle-orm";

import { unsafeDb } from "../../db/client.ts";
import { endpoints, formSchemas } from "../../db/schema.ts";
import { readStoredDocument, type FormSchemaDocument } from "../schema/format.ts";
import { readTheme, type FormTheme } from "./theme.ts";

/**
 * Loading a form for the hosted renderer (#28).
 *
 * ## Why this query is unscoped, and why that is safe
 *
 * A visitor arrives with a public form ID and no session. There is no workspace
 * to scope to until this query answers which one it is — the same category
 * `src/db/scoped.ts` names, and the same one `src/lib/ingest/store.ts` sits in.
 * It is kept as narrow as a read can be: two tables joined on a primary key,
 * one indexed unique column in the predicate, and **no submission data of any
 * kind**. The only rows it can return are a form definition its owner published
 * to be shown to the public.
 *
 * This module lives under `src/lib` rather than `src/app` for the same reason
 * `ingest/store.ts` does: the ESLint rule that keeps `unsafeDb` out of route
 * code stays intact for the route itself.
 *
 * ## Three outcomes, not two
 *
 * A form ID that resolves to nothing and a form ID that resolves to an endpoint
 * with no schema are different answers to different questions. The second is
 * the bring-your-own-form case (#50) working exactly as designed — the endpoint
 * is live and accepting posts, we simply have no definition to draw a form
 * from. Rendering a 404 there would tell someone their working endpoint is
 * broken.
 */

export type RenderableForm = {
  status: "ok";
  /** What goes in `<form action=".../e/{publicId}">`. */
  publicId: string;
  /** The endpoint's name, used as the page title when the schema names nothing. */
  endpointName: string;
  document: FormSchemaDocument;
  /** The title the form shows, from the schema's name or the endpoint's. */
  title: string;
  theme: FormTheme;
};

export type FormLookup =
  | RenderableForm
  /** No such endpoint, or it was deleted. */
  | { status: "not_found" }
  /** A live endpoint with no active schema — #50's case, not an error. */
  | { status: "no_schema"; publicId: string; endpointName: string }
  /** A schema row this build cannot read. Our bug; say so rather than 404. */
  | { status: "unreadable_schema"; publicId: string; endpointName: string };

/** Matches the ingest path's shape check, so a junk ID never reaches Postgres. */
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function loadForm(formId: string): Promise<FormLookup> {
  if (!PUBLIC_ID.test(formId)) return { status: "not_found" };

  const rows = await unsafeDb
    .select({
      publicId: endpoints.publicId,
      name: endpoints.name,
      deletedAt: endpoints.deletedAt,
      activeSchemaVersionId: endpoints.activeSchemaVersionId,
      schemaFields: formSchemas.fields,
    })
    .from(endpoints)
    .leftJoin(formSchemas, eq(formSchemas.id, endpoints.activeSchemaVersionId))
    .where(eq(endpoints.publicId, formId))
    .limit(1);

  const row = rows[0];
  // A deleted endpoint is a 404 here rather than the ingest path's 410: that
  // 410 answers a developer reading a response body, and this answers a visitor
  // who followed a link. There is nothing for them to do with the distinction.
  if (!row || row.deletedAt) return { status: "not_found" };

  if (row.activeSchemaVersionId === null) {
    return { status: "no_schema", publicId: row.publicId, endpointName: row.name };
  }

  const document = readStoredDocument(row.schemaFields);
  if (!document) {
    return { status: "unreadable_schema", publicId: row.publicId, endpointName: row.name };
  }

  return {
    status: "ok",
    publicId: row.publicId,
    endpointName: row.name,
    document,
    title: document.name?.trim() || row.name,
    // Read from the stored JSON rather than from the parsed document.
    // `format.ts` now carries a theme and `readStoredDocument` preserves one
    // (#38), so both would answer the same today — but the raw row is the more
    // durable source. `readStoredDocument` returns null for a schema this build
    // cannot read at all, and a form whose *fields* we cannot parse should
    // still be able to fail in the customer's own colours.
    theme: readTheme(row.schemaFields),
  };
}

/**
 * The fields a visitor is actually shown.
 *
 * `hidden` fields are still rendered — as real `<input type="hidden">` — because
 * dropping them would silently stop posting a value the form's owner declared.
 * They just do not get a label, a row, or a place in the error summary.
 */
export function visibleFields(document: FormSchemaDocument) {
  return document.fields.filter((field) => field.type !== "hidden");
}

export function hiddenFields(document: FormSchemaDocument) {
  return document.fields.filter((field) => field.type === "hidden");
}
