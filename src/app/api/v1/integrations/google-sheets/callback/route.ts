import { NextResponse, type NextRequest } from "next/server";

import { currentUser } from "@/lib/auth/session";
import { completeGoogleConnection } from "@/lib/destinations/connect";
import { GOOGLE_CALLBACK_PATH, googleRedirectUri, PENDING_COOKIE } from "@/lib/destinations/google";

/**
 * `GET /api/v1/integrations/google-sheets/callback` — where Google's consent
 * screen sends the person back to (#67).
 *
 * Glue only, like `/api/v1/deliveries/sweep`. Everything that decides anything
 * is `completeGoogleConnection` in `src/lib/destinations/connect.ts`, which the
 * tests call directly with a fake Google.
 *
 * The pending-connection cookie is cleared on **every** outcome, success or
 * not. A second visit to this URL — the back button, a reload — must find
 * nothing to complete, because the code in it has already been spent.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  const url = request.nextUrl;

  const user = await currentUser();
  if (!user) {
    const next = `${url.pathname}${url.search}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, url.origin));
  }

  const outcome = await completeGoogleConnection({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    error: url.searchParams.get("error"),
    sealed: request.cookies.get(PENDING_COOKIE)?.value,
    userId: user.id,
    redirectUri: googleRedirectUri(url.origin),
  });

  if (outcome.result !== "connected" && outcome.result !== "reconnected") {
    console.warn("[google-sheets] connection not completed", outcome.result, outcome.detail ?? "");
  }

  const response = NextResponse.redirect(new URL(outcome.location, url.origin));
  response.cookies.delete({ name: PENDING_COOKIE, path: GOOGLE_CALLBACK_PATH });
  return response;
}
