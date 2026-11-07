import { handleRest } from "@/lib/api/rest";

/** `/api/v1/submissions/export` — the agent API (#133). Logic lives in `src/lib/api/`. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleRest(request, "exportSubmissions");
}
