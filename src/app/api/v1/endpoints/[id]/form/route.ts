import { handleRest } from "@/lib/api/rest";

/** `/api/v1/endpoints/{id}/form` — the agent API (#133). Logic lives in `src/lib/api/`. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRest(request, "getFormSchema", await ctx.params);
}

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRest(request, "setFormSchema", await ctx.params);
}
