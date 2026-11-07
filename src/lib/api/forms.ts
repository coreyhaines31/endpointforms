import { z } from "zod";

import { parseSchemaJson, type FormSchemaDocument } from "../schema/format.ts";
import { getActiveSchema, publishSchemaVersion } from "../schema/store.ts";
import { ApiError, requireApiScope, type ApiContext } from "./context.ts";
import { loadEndpoint, parseInput } from "./endpoints.ts";

/**
 * An endpoint's form schema (#51), as the agent API reads and writes it.
 *
 * Writing goes through `publishSchemaVersion` like every other producer — the
 * builder, the HTML importer — so versions stay append-only and the live one
 * stays a pointer. `source` is recorded as `file`, the developer-native path
 * `store.ts` already names for a CLI.
 */
export type ApiFormSchema = {
  endpoint_id: string;
  /** Null when the endpoint has no schema and accepts any field posted to it. */
  schema: {
    version: number;
    mode: "warn" | "strict";
    source: string;
    created_at: string;
    document: FormSchemaDocument | null;
  } | null;
};

export async function getFormSchema(ctx: ApiContext, endpointId: unknown): Promise<ApiFormSchema> {
  requireApiScope(ctx, "endpoints:read");
  const endpoint = await loadEndpoint(ctx, endpointId);
  const active = await getActiveSchema(ctx.caller.workspaceId, endpoint.id);

  return {
    endpoint_id: endpoint.publicId,
    schema: active
      ? {
          version: active.version,
          mode: active.mode,
          source: active.source,
          created_at: active.createdAt.toISOString(),
          document: active.document,
        }
      : null,
  };
}

const setSchema = z.strictObject({
  /** The schema document — an object, or the same as JSON text. */
  document: z.union([z.record(z.string(), z.unknown()), z.string()]),
  mode: z.enum(["warn", "strict"]).optional(),
  /** Defaults to true. False saves a draft version without changing the live form. */
  activate: z.boolean().optional(),
});

export type ApiPublishedSchema = {
  endpoint_id: string;
  version: number;
  mode: "warn" | "strict";
  active: boolean;
};

export async function setFormSchema(
  ctx: ApiContext,
  endpointId: unknown,
  input: unknown,
): Promise<ApiPublishedSchema> {
  requireApiScope(ctx, "endpoints:write");
  const body = parseInput(setSchema, input ?? {});
  const endpoint = await loadEndpoint(ctx, endpointId);

  // Drafts too: the schema store only writes versions for a live endpoint, the
  // same rule the builder follows.
  if (endpoint.archivedAt) {
    throw new ApiError(
      "conflict",
      "That endpoint is archived. Restore it (update it with archived: false) before changing its form schema.",
    );
  }

  const parsed = parseSchemaJson(typeof body.document === "string" ? body.document : JSON.stringify(body.document));
  if (!parsed.ok) {
    throw new ApiError("invalid_request", `The schema is not valid: ${parsed.errors.join("; ")}`, {
      errors: parsed.errors,
    });
  }

  const published = await publishSchemaVersion({
    workspaceId: ctx.caller.workspaceId,
    endpointId: endpoint.id,
    document: parsed.document,
    source: "file",
    mode: body.mode,
    createdByUserId: ctx.caller.createdByUserId,
    activate: body.activate ?? true,
  });

  return {
    endpoint_id: endpoint.publicId,
    version: published.version,
    mode: published.mode,
    active: published.active,
  };
}
