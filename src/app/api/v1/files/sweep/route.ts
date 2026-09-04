import { handleUploadSweep } from "@/lib/uploads/sweep";

/**
 * `GET|POST /api/v1/files/sweep` — the scheduled file retention sweep (#66).
 *
 * Glue only; everything real is in `src/lib/uploads/sweep.ts`. Guarded by the
 * same `Authorization: Bearer $CRON_SECRET` as the deliveries sweep, which is
 * what Vercel Cron sends automatically.
 *
 * GET and POST both work and go through one handler, because Vercel Cron issues
 * a GET and a route that refused it would silently 405 forever.
 *
 * **Note the route order.** This sits at `/api/v1/files/sweep` alongside the
 * dynamic `/api/v1/files/[publicId]`, and Next matches the static segment
 * first — so `sweep` can never be read as a file id. It could not be one
 * anyway: reaching the bytes needs a signature over the id, and nobody can sign
 * `sweep`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Bounded per invocation, but a large backlog of expired files is still a lot
// of rows to rewrite. Leave room rather than dying halfway through.
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  return handleUploadSweep(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleUploadSweep(request);
}
