/**
 * Provisions the workspace, endpoint and schema that endpointforms.com's own
 * waitlist posts to (#33, #24).
 *
 * ## Why this is here and not a hand-run SQL script
 *
 * Because "run these statements once against production" is a form that exists
 * on one laptop. This runs on `npm run db:seed`, so a fresh clone, CI and the
 * hosted database all end up with the same endpoint under the same public ID,
 * and the marketing site's env var is the same string everywhere.
 *
 * ## Why it never deletes anything
 *
 * The main seed rebuilds its demo workspace from scratch on every run, which is
 * right for fixtures nobody typed. This one holds **real signups from real
 * people**, so it is strictly additive: every insert is skipped when the row is
 * already there. Running it twice is a no-op; running it against production
 * after launch cannot lose a lead.
 */
import { and, eq } from "drizzle-orm";

import { newId } from "../src/db/ids.ts";
import { endpoints, formSchemas, memberships, users, workspaces } from "../src/db/schema.ts";
import type { unsafeDb } from "../src/db/client.ts";

type Db = typeof unsafeDb;

/**
 * Reserved for us, and this is us. `validateWorkspaceSlug` refuses `endpoint`
 * precisely so that no customer can take the hostname we need for our own
 * forms — see the RESERVED list in `src/lib/workspaces/slug.ts`.
 */
export const WAITLIST_WORKSPACE_SLUG = "endpoint";
export const WAITLIST_OWNER_EMAIL = "hello@endpointforms.com";

/**
 * Fixed rather than generated, which is the one place this deliberately breaks
 * the house rule that public IDs are unguessable nanoids.
 *
 * A generated ID would be different in every database, which would mean the
 * marketing site's `NEXT_PUBLIC_WAITLIST_ENDPOINT_URL` could not be written
 * down anywhere — it would have to be read back out of whichever database was
 * seeded last. Unguessability buys nothing here anyway: this endpoint's URL is
 * shipped inside a public JavaScript bundle on a public marketing site, which
 * is exactly what a form endpoint is for.
 */
export const WAITLIST_ENDPOINT_PUBLIC_ID = "ef-waitlist";

/**
 * The form, as data. The builder does not exist yet and does not need to — a
 * form is four field definitions and a mode.
 *
 * `warn`, never `strict`. A schema that starts refusing signups because we
 * added a field to the marketing site is the exact failure #51 exists to
 * prevent, and this is the form where it would cost us the most.
 */
const WAITLIST_SCHEMA_FIELDS = {
  formatVersion: 1,
  fields: [
    {
      key: "email",
      label: "Work email",
      type: "email",
      required: true,
      help: "The only thing the visitor actually types.",
    },
    {
      key: "channel",
      label: "Channel",
      type: "hidden",
      required: false,
      help: "browser = the visitor's own browser posted this. server-forward = our server posted it for a visitor with no JavaScript. Written by the caller, so it describes our path rather than proving anything — the origin stamp is the part that cannot be set from outside.",
    },
    {
      key: "page",
      label: "Page",
      type: "hidden",
      required: false,
      help: "Pathname the signup came from. Never the query string.",
    },
    {
      key: "tool",
      label: "Tool",
      type: "hidden",
      required: false,
      help: "Which of the eight /tools calculators the signup came from, when it came from one. Never carries anything typed into the calculator.",
    },
  ],
};

export async function seedWaitlistEndpoint(db: Db): Promise<void> {
  const workspaceId = await ensureWorkspace(db);
  const userId = await ensureOwner(db, workspaceId);
  const endpointId = await ensureEndpoint(db, workspaceId);
  await ensureSchema(db, workspaceId, endpointId, userId);

  console.log(
    `waitlist endpoint ready: ${WAITLIST_WORKSPACE_SLUG} / ${WAITLIST_ENDPOINT_PUBLIC_ID}`,
  );
  console.log(
    `  NEXT_PUBLIC_WAITLIST_ENDPOINT_URL=https://${WAITLIST_WORKSPACE_SLUG}.<render-domain>/e/${WAITLIST_ENDPOINT_PUBLIC_ID}`,
  );
}

async function ensureWorkspace(db: Db): Promise<string> {
  const existing = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, WAITLIST_WORKSPACE_SLUG))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const id = newId();
  await db.insert(workspaces).values({
    id,
    slug: WAITLIST_WORKSPACE_SLUG,
    name: "Endpoint Forms",
  });
  return id;
}

/**
 * Somebody has to be able to open the inbox and read the signups, or the whole
 * exercise produces rows nobody looks at. No password: this account is claimed
 * by signing in with the address, not by a credential written into a seed.
 */
async function ensureOwner(db: Db, workspaceId: string): Promise<string> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, WAITLIST_OWNER_EMAIL))
    .limit(1);

  const userId = existing[0]?.id ?? newId();
  if (!existing[0]) {
    await db.insert(users).values({
      id: userId,
      email: WAITLIST_OWNER_EMAIL,
      name: "Endpoint Forms",
    });
  }

  const membership = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
    .limit(1);

  if (!membership[0]) {
    await db.insert(memberships).values({
      id: newId(),
      workspaceId,
      userId,
      role: "owner",
    });
  }

  return userId;
}

async function ensureEndpoint(db: Db, workspaceId: string): Promise<string> {
  const existing = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(eq(endpoints.publicId, WAITLIST_ENDPOINT_PUBLIC_ID))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const id = newId();
  await db.insert(endpoints).values({
    id,
    workspaceId,
    publicId: WAITLIST_ENDPOINT_PUBLIC_ID,
    name: "Waitlist — endpointforms.com",
  });
  return id;
}

async function ensureSchema(
  db: Db,
  workspaceId: string,
  endpointId: string,
  userId: string,
): Promise<void> {
  const existing = await db
    .select({ id: formSchemas.id })
    .from(formSchemas)
    .where(and(eq(formSchemas.endpointId, endpointId), eq(formSchemas.version, 1)))
    .limit(1);

  const schemaVersionId = existing[0]?.id ?? newId();
  if (!existing[0]) {
    await db.insert(formSchemas).values({
      id: schemaVersionId,
      workspaceId,
      endpointId,
      version: 1,
      fields: WAITLIST_SCHEMA_FIELDS,
      mode: "warn",
      // The form was written by hand in this file, from the markup that already
      // existed on the marketing site. `html_import` is the honest label.
      source: "html_import",
      createdByUserId: userId,
    });
  }

  await db
    .update(endpoints)
    .set({ activeSchemaVersionId: schemaVersionId })
    .where(eq(endpoints.id, endpointId));
}
