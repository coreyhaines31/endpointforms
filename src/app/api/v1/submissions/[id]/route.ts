import { handleRest } from "@/lib/api/rest";

/** `/api/v1/submissions/{id}` — the agent API (#133). Logic lives in `src/lib/api/`. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRest(request, "getSubmission", await ctx.params);
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRest(request, "deleteSubmission", await ctx.params);
}
