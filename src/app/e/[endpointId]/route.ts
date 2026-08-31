import {
  handlePreflight,
  handleSubmission,
  handleUnsupportedMethod,
} from "@/lib/ingest/handler";

/**
 * `POST /e/{publicId}` — the endpoint a customer points an existing form at.
 *
 * Deliberately three lines of glue. Everything real lives in `src/lib/ingest`,
 * which is plain Web `Request`/`Response` and no Next APIs, so the whole
 * submission path is testable by calling a function rather than by standing up
 * a server. `tests/ingest.test.mts` is that test.
 *
 * Host-based routing for the render domain (#26) lands separately; this path
 * works on any host in the meantime.
 */

// Never cached, never statically analysed: every request has a body and writes a row.
export const dynamic = "force-dynamic";
// `node:crypto` and the Postgres driver. Not an edge route.
export const runtime = "nodejs";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ endpointId: string }> },
): Promise<Response> {
  const { endpointId } = await ctx.params;
  return handleSubmission(request, endpointId);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return handlePreflight(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleUnsupportedMethod(request);
}

export async function PUT(request: Request): Promise<Response> {
  return handleUnsupportedMethod(request);
}

export async function PATCH(request: Request): Promise<Response> {
  return handleUnsupportedMethod(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleUnsupportedMethod(request);
}
