import {
  handleVerdict,
  handleVerdictPreflight,
  handleVerdictUnsupportedMethod,
} from "@/lib/verdict/handler";

/**
 * `POST /api/v1/verdict` — the outcome webhook (#43).
 *
 * Glue only. Everything real lives in `src/lib/verdict`, which is plain Web
 * `Request`/`Response` and no Next APIs, so the whole outcome path is testable
 * by calling a function rather than by standing up a server —
 * `tests/verdict.test.mts` is that test.
 *
 * `/api/v1` rather than a bare path because this one is versioned on purpose: a
 * customer's CRM automation is written once and never touched again, and the day
 * we need a different shape it must be a second URL rather than a silent change
 * under a live integration.
 */

// Every request has a body, authenticates, and writes a row.
export const dynamic = "force-dynamic";
// `node:crypto` and the Postgres driver. Not an edge route.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleVerdict(request);
}

export async function OPTIONS(): Promise<Response> {
  return handleVerdictPreflight();
}

export async function GET(request: Request): Promise<Response> {
  return handleVerdictUnsupportedMethod(request);
}

export async function PUT(request: Request): Promise<Response> {
  return handleVerdictUnsupportedMethod(request);
}

export async function PATCH(request: Request): Promise<Response> {
  return handleVerdictUnsupportedMethod(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleVerdictUnsupportedMethod(request);
}
