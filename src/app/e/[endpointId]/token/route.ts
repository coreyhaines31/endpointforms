import { mintOriginToken } from "@/lib/origin/token";

/**
 * `GET /e/{publicId}/token` — the value a rendered page echoes back on submit (#30).
 *
 * Unauthenticated, because it grants nothing. The token proves that a page load
 * for this endpoint happened recently; it is corroboration for the Human stamp,
 * never a requirement for one, and a submission without it is accepted and
 * scored exactly as if this route did not exist.
 *
 * That also means anyone can fetch one. This is a known and deliberate
 * limitation — see `docs/23-origin-findings.md`, which measures what the signal
 * is actually worth once you assume the adversary makes one extra request.
 *
 * The snippet a customer pastes:
 *
 * ```html
 * <form method="post" action="https://…/e/abc123">
 *   <input type="hidden" name="_origin_token">
 *   …
 * </form>
 * <script>
 *   fetch("https://…/e/abc123/token")
 *     .then((r) => r.json())
 *     .then(({ token }) => {
 *       document.querySelector('input[name="_origin_token"]').value = token;
 *     })
 *     .catch(() => {});
 * </script>
 * ```
 *
 * The `catch` is the important line: if this request fails, the form still submits.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLIC_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * No database lookup, on purpose. The token is HMAC-bound to whatever id it was
 * minted for, so one issued for an endpoint that does not exist is worthless —
 * and a query here would put a database round trip on every page view of every
 * form our customers host.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ endpointId: string }> },
): Promise<Response> {
  const { endpointId } = await ctx.params;

  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate",
    "access-control-allow-origin": request.headers.get("origin") ?? "*",
    "access-control-allow-methods": "GET, OPTIONS",
    vary: "Origin",
  };

  if (!PUBLIC_ID.test(endpointId)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "endpoint_not_found",
          message: "That is not a valid endpoint ID. Check the URL in your form's action attribute.",
        },
      }),
      { status: 404, headers },
    );
  }

  const issuedAt = Date.now();
  return new Response(
    JSON.stringify({ ok: true, token: mintOriginToken(endpointId, issuedAt), issuedAt }),
    { status: 200, headers },
  );
}

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": request.headers.get("origin") ?? "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers":
        request.headers.get("access-control-request-headers") ?? "content-type",
      "access-control-max-age": "86400",
      vary: "Origin",
    },
  });
}
