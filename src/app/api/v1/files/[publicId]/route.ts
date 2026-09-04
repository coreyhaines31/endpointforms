import { handleFileDownload } from "@/lib/uploads/download";

/**
 * `GET /api/v1/files/{publicId}` — an uploaded file, behind a signature (#66).
 *
 * Glue only. Everything real lives in `src/lib/uploads/download.ts`, which is
 * plain Web `Request`/`Response` and no Next APIs, so `tests/uploads-db.test.mts`
 * exercises it by calling a function. Same shape as `/api/v1/deliveries/sweep`.
 *
 * `/api/v1` because this URL is written into a webhook payload and a CSV that
 * outlive any refactor of ours.
 *
 * **There is no session check here and that is not an oversight.** The URL is a
 * capability: it carries a file id, an expiry and an HMAC over both. A webhook
 * receiver and a spreadsheet have no session, and inventing a second access path
 * for them is how two access paths come to disagree about who may read what.
 */

// The signature is checked per request and the bytes are one tenant's.
export const dynamic = "force-dynamic";
// `node:crypto` for the signature, and the Postgres driver for the bytes.
export const runtime = "nodejs";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  const { publicId } = await ctx.params;
  return handleFileDownload(request, publicId);
}

export async function HEAD(
  request: Request,
  ctx: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  const { publicId } = await ctx.params;
  return handleFileDownload(request, publicId);
}
