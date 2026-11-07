import { openApiDocument } from "@/lib/api/openapi";

/**
 * `GET /api/v1/openapi.json` — the agent API's OpenAPI 3.1 document (#133).
 * Public: it describes the API and contains no workspace data.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.endpointforms.com";
  return new Response(`${JSON.stringify(openApiDocument(appUrl), null, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
}
