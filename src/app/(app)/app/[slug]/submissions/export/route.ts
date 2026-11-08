import { requireUser } from "@/lib/auth/session";
import { getWorkspaceAccess } from "@/lib/workspaces/queries";
import {
  EXPORT_LIMIT,
  listSubmissionsForExport,
  parseSubmissionFilters,
} from "@/lib/workspaces/submissions";
import { toCsv, toJson, toPartialsCsv, toPartialsJson } from "@/lib/workspaces/export-format";
import { listPartialsForExport, PARTIALS_EXPORT_LIMIT } from "@/lib/workspaces/partials";

/**
 * `GET /app/{slug}/submissions/export` — your data, out.
 *
 * **Never paywalled, on any plan.** `docs/00-positioning-spine.md` makes getting
 * your data out a table stake, and a product whose pitch is that other people's
 * dashboards lie to you cannot then hold the raw rows hostage. There is no plan
 * check in this file and there should never be one.
 *
 * It takes the same query string the inbox does and runs it through the same
 * `parseSubmissionFilters` and the same predicate, so the file matches the screen
 * by construction rather than by two implementations agreeing.
 *
 * A route handler rather than a page, so it re-derives the workspace itself:
 * `requireUser` for the session, `getWorkspaceAccess` for the membership, and a
 * plain 404 for either failure — the same answer for "no such workspace" and
 * "not yours", because distinguishing them hands out a customer list.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;

  const user = await requireUser();
  const access = await getWorkspaceAccess(slug, user.id);
  if (!access) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const filters = parseSubmissionFilters(Object.fromEntries(url.searchParams));
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";

  const stamp = new Date().toISOString().slice(0, 10);

  // The partials lane exports too (#37). "Export is never behind anything" is a
  // promise about the screen somebody is looking at, and a lane you can read
  // and cannot take away with you is the dashboard-shaped thing this product
  // spends its positioning arguing against. It is a separate file with separate
  // columns rather than extra rows in the submissions export, for the same
  // reason the two are separate tables: a spreadsheet of "submissions" that
  // silently contained people who never submitted would be worse than no
  // export at all.
  if (filters.lane === "partials") {
    const partials = await listPartialsForExport(access.workspace.id, filters);
    return download(
      format === "json" ? toPartialsJson(partials) : toPartialsCsv(partials),
      format,
      `${access.workspace.slug}-partials-${stamp}.${format}`,
      partials.length,
      PARTIALS_EXPORT_LIMIT,
    );
  }

  const rows = await listSubmissionsForExport(access.workspace.id, filters);

  return download(
    format === "json" ? toJson(rows) : toCsv(rows),
    format,
    `${access.workspace.slug}-submissions-${stamp}.${format}`,
    rows.length,
    EXPORT_LIMIT,
  );
}

function download(
  body: string,
  format: "csv" | "json",
  filename: string,
  count: number,
  limit: number,
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type":
        format === "json"
          ? "application/json; charset=utf-8"
          : "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      // One tenant's rows behind one person's session.
      "cache-control": "no-store",
      // Says out loud when the export was capped, rather than letting someone
      // discover it by counting rows in a spreadsheet.
      "x-export-row-count": String(count),
      ...(count >= limit ? { "x-export-truncated": "true" } : {}),
    },
  });
}
