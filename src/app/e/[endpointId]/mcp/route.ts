import {
  handleManifestPreflight,
  handleManifestRequest,
  handleManifestUnsupportedMethod,
} from "@/lib/manifest/handler";

/**
 * `POST /e/{publicId}/mcp` — Manifest, the agent-callable surface (#32).
 *
 * The same three lines of glue as `../route.ts`, and for the same reason:
 * everything real lives in `src/lib/manifest`, which is plain Web
 * `Request`/`Response` and no Next APIs, so the whole surface is testable by
 * calling a function. `tests/manifest.test.mts` is that test.
 *
 * An agent discovers the tool with `tools/list` and submits with `tools/call`.
 * A submission that arrives here is stamped `agent` because it arrived here —
 * the surface is passed as a constant inside the handler and is never read from
 * the request.
 */

// Never cached: the tool definition is generated from the form's live schema,
// and a call writes a row.
export const dynamic = "force-dynamic";
// `node:crypto` and the Postgres driver. Not an edge route.
export const runtime = "nodejs";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ endpointId: string }> },
): Promise<Response> {
  const { endpointId } = await ctx.params;
  return handleManifestRequest(request, endpointId);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return handleManifestPreflight(request);
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ endpointId: string }> },
): Promise<Response> {
  const { endpointId } = await ctx.params;
  return handleManifestUnsupportedMethod(request, endpointId);
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ endpointId: string }> },
): Promise<Response> {
  const { endpointId } = await ctx.params;
  return handleManifestUnsupportedMethod(request, endpointId);
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ endpointId: string }> },
): Promise<Response> {
  const { endpointId } = await ctx.params;
  return handleManifestUnsupportedMethod(request, endpointId);
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ endpointId: string }> },
): Promise<Response> {
  const { endpointId } = await ctx.params;
  return handleManifestUnsupportedMethod(request, endpointId);
}
