import { handleSweep } from "@/lib/destinations/sweep";

/**
 * `GET|POST /api/v1/deliveries/sweep` — the scheduled retry sweep (#42).
 *
 * Glue only. Everything real lives in `src/lib/destinations/sweep.ts`, which is
 * plain Web `Request`/`Response` and no Next APIs, so the whole sweep — auth
 * included — is testable by calling a function rather than by standing up a
 * server. Same shape as `/api/v1/verdict`.
 *
 * **Why this route exists at all:** without a scheduler, a due retry waits to be
 * swept up by the next submission to the same endpoint. An endpoint that takes
 * one lead a week and then breaks would not retry for a week — which makes
 * #42's claim, that a broken integration gets noticed, untrue for exactly the
 * customers least able to notice on their own.
 *
 * **Auth is `Authorization: Bearer $CRON_SECRET`**, which is what Vercel Cron
 * sends automatically. With no `CRON_SECRET` set the route refuses everything:
 * an unguarded sweep is a free way for a stranger to make our server issue
 * outbound requests, so the failure mode of a misconfiguration has to be
 * "nothing runs", never "anyone can run it".
 *
 * **GET and POST both work**, and every verb goes through one handler rather
 * than two implementations that could drift. Vercel Cron issues a GET, so
 * refusing it would mean the schedule silently 405s forever.
 *
 * `/api/v1` for the same reason the verdict webhook is versioned: this URL is
 * written into a schedule once and never looked at again.
 */

// Reads and writes on every call, and the outbound requests are the point.
export const dynamic = "force-dynamic";
// `node:crypto` for the signatures, and the Postgres driver. Not an edge route.
export const runtime = "nodejs";
// Retries are bounded per invocation, but a slow receiver still costs a timeout
// each, so leave room rather than dying halfway through a sweep.
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  return handleSweep(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleSweep(request);
}

// Everything else gets the handler's own 405 with an `Allow` header, so someone
// poking at the URL is told what it wants rather than seeing a framework error.
export async function PUT(request: Request): Promise<Response> {
  return handleSweep(request);
}

export async function PATCH(request: Request): Promise<Response> {
  return handleSweep(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleSweep(request);
}
