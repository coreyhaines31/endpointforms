import { eq } from "drizzle-orm";
import { z } from "zod";

import { unsafeDb } from "../../db/client.ts";
import { users, workspaces } from "../../db/schema.ts";
import { endpointUrl } from "../workspaces/endpoint-url.ts";
import {
  createEndpoint as createEndpointRow,
  getEndpointByPublicId,
  listEndpointsWithStats,
  renameEndpointByPublicId,
  setEndpointArchived,
} from "../workspaces/endpoints.ts";
import type { EndpointListItem } from "../workspaces/types.ts";
import {
  ApiError,
  appUrlOf,
  iso,
  publicIdArg,
  renderDomainOf,
  requireApiScope,
  type ApiContext,
} from "./context.ts";

/** An endpoint as every surface returns it. */
export type ApiEndpoint = {
  id: string;
  name: string;
  /** Archived endpoints refuse new submissions and keep every one they have. */
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  has_form_schema: boolean;
  submission_count: number;
  awaiting_outcome_count: number;
  last_submission_at: string | null;
  submit_url: string;
  manifest_url: string;
  dashboard_url: string;
};

export type ApiWhoami = {
  workspace: { slug: string; name: string | null; url: string };
  scopes: string[];
};

export async function whoami(ctx: ApiContext): Promise<ApiWhoami> {
  // `workspaces` is the tenant itself and has no row-level policy; the id is
  // the caller's own, so this can only read the caller's workspace.
  const [workspace] = await unsafeDb
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.caller.workspaceId))
    .limit(1);

  return {
    workspace: {
      slug: ctx.caller.workspaceSlug,
      name: workspace?.name ?? null,
      url: `${appUrlOf(ctx)}/app/${ctx.caller.workspaceSlug}`,
    },
    scopes: ctx.caller.scopes,
  };
}

export function endpointLinks(ctx: ApiContext, publicId: string) {
  const url = endpointUrl(ctx.caller.workspaceSlug, renderDomainOf(ctx), publicId);
  return {
    submit_url: url,
    manifest_url: `${url}/mcp`,
    dashboard_url: `${appUrlOf(ctx)}/app/${ctx.caller.workspaceSlug}/endpoints/${publicId}`,
  };
}

function toApiEndpoint(ctx: ApiContext, row: EndpointListItem): ApiEndpoint {
  return {
    id: row.publicId,
    name: row.name,
    archived: row.archivedAt !== null,
    archived_at: iso(row.archivedAt),
    created_at: row.createdAt.toISOString(),
    has_form_schema: row.hasSchema,
    submission_count: row.submissionCount,
    awaiting_outcome_count: row.awaitingCount,
    last_submission_at: iso(row.lastSubmissionAt),
    ...endpointLinks(ctx, row.publicId),
  };
}

/** Archived endpoints are included and marked; hiding them reads as lost data. */
export async function listEndpoints(ctx: ApiContext): Promise<ApiEndpoint[]> {
  requireApiScope(ctx, "endpoints:read");
  const rows = await listEndpointsWithStats(ctx.caller.workspaceId);
  return rows.map((row) => toApiEndpoint(ctx, row));
}

/** The endpoint row, or `not_found` — the same answer for another workspace's id. */
export async function loadEndpoint(ctx: ApiContext, id: unknown) {
  const publicId = publicIdArg(id, "endpoint");
  const row = await getEndpointByPublicId(ctx.caller.workspaceId, publicId);
  if (!row) throw new ApiError("not_found", `No endpoint ${JSON.stringify(publicId)} in this workspace.`);
  return row;
}

export async function getEndpoint(ctx: ApiContext, id: unknown): Promise<ApiEndpoint> {
  requireApiScope(ctx, "endpoints:read");
  return toApiEndpoint(ctx, await loadEndpoint(ctx, id));
}

const nameSchema = z.string().trim().min(1, "name must not be empty").max(120, "name must be at most 120 characters");

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(
      "invalid_request",
      result.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; "),
    );
  }
  return result.data;
}

export { parse as parseInput };

const createSchema = z.strictObject({ name: nameSchema });

export type CreatedEndpoint = ApiEndpoint & {
  /** The address each submission is emailed to, or null when none was set up. */
  notifies: string | null;
};

/**
 * Creates an endpoint. Its notification goes to the person who created the key
 * — read from the key, never from an argument, because this address decides
 * where strangers' leads are sent.
 */
export async function createEndpoint(ctx: ApiContext, input: unknown): Promise<CreatedEndpoint> {
  requireApiScope(ctx, "endpoints:write");
  const { name } = parse(createSchema, input ?? {});

  const notifyEmail = ctx.caller.createdByUserId ? await userEmail(ctx.caller.createdByUserId) : null;
  const created = await createEndpointRow(ctx.caller.workspaceId, name, { notifyEmail });
  const row = await getEndpointByPublicId(ctx.caller.workspaceId, created.publicId);
  if (!row) throw new Error("createEndpoint: the endpoint just created could not be read back");

  return { ...toApiEndpoint(ctx, row), notifies: created.notified };
}

const updateSchema = z
  .strictObject({ name: nameSchema.optional(), archived: z.boolean().optional() })
  .refine((value) => value.name !== undefined || value.archived !== undefined, {
    message: "send at least one of name or archived",
  });

export async function updateEndpoint(ctx: ApiContext, id: unknown, input: unknown): Promise<ApiEndpoint> {
  requireApiScope(ctx, "endpoints:write");
  const patch = parse(updateSchema, input ?? {});
  const row = await loadEndpoint(ctx, id);

  if (patch.name !== undefined) await renameEndpointByPublicId(ctx.caller.workspaceId, row.publicId, patch.name);
  if (patch.archived !== undefined) await setEndpointArchived(ctx.caller.workspaceId, row.publicId, patch.archived);

  return toApiEndpoint(ctx, await loadEndpoint(ctx, row.publicId));
}

/**
 * "Deletes" an endpoint by archiving it, which is the only delete the data
 * model has: it stops accepting submissions and keeps every one it received.
 * `updateEndpoint(..., { archived: false })` restores it.
 */
export async function deleteEndpoint(ctx: ApiContext, id: unknown): Promise<ApiEndpoint> {
  requireApiScope(ctx, "endpoints:write");
  const row = await loadEndpoint(ctx, id);
  await setEndpointArchived(ctx.caller.workspaceId, row.publicId, true);
  return toApiEndpoint(ctx, await loadEndpoint(ctx, row.publicId));
}

async function userEmail(userId: string): Promise<string | null> {
  const [row] = await unsafeDb.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.email ?? null;
}
