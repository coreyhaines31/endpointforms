import { handleRest } from "@/lib/api/rest";

/** `/api/v1/endpoints/{id}` — the agent API (#133). Logic lives in `src/lib/api/`. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRest(request, "getEndpoint", await ctx.params);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRest(request, "updateEndpoint", await ctx.params);
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRest(request, "deleteEndpoint", await ctx.params);
}
