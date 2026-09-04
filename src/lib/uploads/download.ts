import { checkDownloadLink } from "./links.ts";
import { downloadHeaders } from "./serve.ts";
import { loadFile } from "./store.ts";

/**
 * `GET /api/v1/files/{publicId}` — the only way to an uploaded file (#66).
 *
 * Plain Web `Request`/`Response` and no Next APIs, so the whole thing —
 * signature check included — is testable by calling a function rather than by
 * standing up a server. Same shape as `../verdict/handler.ts` and
 * `../destinations/sweep.ts`; the route under `src/app` is glue.
 *
 * ## What it answers, and what it deliberately does not distinguish
 *
 * A bad signature and an id that does not exist get the **same** `403` with the
 * same sentence. Telling them apart would turn this into an oracle: try ids
 * until one answers differently and you have learned which files exist and,
 * with a bit of patience, how many a competitor is receiving. An **expired**
 * link is different and does say so, because that is a person with a real link
 * that has run out and the fix is "open it from the inbox again" — a `404` there
 * would send them to support convinced we had lost their file.
 *
 * A **purged** file gets a `410 Gone` naming the retention rule. Gone rather
 * than not-found for the same reason a deleted endpoint does: the row is still
 * here, we know exactly what happened to it, and saying so ends the question.
 *
 * ## Why every response is an attachment
 *
 * See `./serve.ts`. Nothing is ever rendered inline, nothing is served as the
 * type the uploader declared, and the headers that enforce that are built in
 * one place so a second code path cannot ship with three of the four.
 */
export async function handleFileDownload(
  request: Request,
  publicId: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return refuse(405, "Use GET to download a file.", { allow: "GET, HEAD" });
  }

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(publicId)) {
    return refuse(403, DENIED);
  }

  const url = new URL(request.url);
  const check = checkDownloadLink(publicId, url.searchParams.get("e"), url.searchParams.get("s"));

  if (!check.ok) {
    if (check.reason === "expired") {
      return refuse(
        403,
        "This download link has expired. The file is still here — open the submission again for a fresh link.",
      );
    }
    if (check.reason === "unconfigured") {
      return refuse(
        503,
        "File downloads are not switched on for this deployment. (Self-hosting? Set AUTH_SECRET, or UPLOAD_LINK_SECRET.)",
      );
    }
    return refuse(403, DENIED);
  }

  const loaded = await loadFile(publicId);

  if (loaded.state === "missing") {
    // The signature was valid, so this is a file that was deleted with its
    // submission rather than a guess. Still the same sentence — see the note
    // above about not becoming an oracle.
    return refuse(403, DENIED);
  }

  if (loaded.state === "purged") {
    return refuse(
      410,
      `${loaded.filename} was removed on ${loaded.purgedAt.toISOString().slice(0, 10)} under this deployment's file retention rule. The submission and everything else about it are still here.`,
    );
  }

  const headers = downloadHeaders(loaded.file.filename, loaded.file.size);
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  return new Response(loaded.file.bytes as unknown as BodyInit, { status: 200, headers });
}

/** One sentence for every "you may not have this", so none of them leak which. */
const DENIED =
  "That download link is not valid. Open the submission in your inbox and use the link there.";

function refuse(
  status: number,
  message: string,
  extra: Record<string, string> = {},
): Response {
  return new Response(`${message}\n`, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra,
    },
  });
}
