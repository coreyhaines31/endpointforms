import { getWorkspaceAccess } from "../workspaces/queries.ts";
import { inspectSpreadsheet } from "./adapters/google-sheets.ts";
import { exchangeCode, openPendingConnection, type PendingConnection } from "./google.ts";
import { createDestination, getDestination, rawConfig, updateDestination } from "./store.ts";

/**
 * Finishing a Google Sheets connection — what the OAuth callback does (#67).
 *
 * Plain module, no Next APIs, for the reason `./sweep.ts` gives: the route at
 * `src/app/api/v1/integrations/google-sheets/callback` is glue, and the part
 * worth testing is testable by calling a function with a fake `fetch` rather
 * than by standing up a server and a Google project.
 *
 * The order of the checks is the design:
 *
 * 1. **The cookie and the nonce** (`openPendingConnection`). A callback whose
 *    state does not match the cookie in *this* browser did not start here, and
 *    nothing it carries is used — not even to choose where to redirect.
 * 2. **Membership, again.** The cookie says which workspace; the session says
 *    whether this person may still write to it. Someone removed from the
 *    workspace in the ten minutes they spent on Google's screen is refused.
 * 3. **Google's answer.** A denied consent, a grant without the Sheets scope,
 *    or a code that will not exchange all stop here with nothing written.
 * 4. **The spreadsheet.** Opened with the new token before the destination
 *    exists, so a link to a sheet the account cannot see is said on this
 *    screen rather than in a delivery log.
 *
 * Only then is a row written — created, or for a reconnect, updated in place
 * with a new `connectedAt`, which is what clears the `disconnected` state.
 */

/** Short codes rather than sentences in the URL. The page maps them to words. */
export type ConnectResult =
  | "connected"
  | "reconnected"
  | "denied"
  | "failed"
  | "forbidden"
  | "missing"
  | "no_tab"
  | "expired";

export type ConnectOutcome = {
  result: ConnectResult;
  /** Same-origin path. Never built from anything that failed step 1. */
  location: string;
  /** For the log line and the tests; never shown. */
  detail?: string;
};

export async function completeGoogleConnection(input: {
  code: string | null;
  state: string | null;
  /** Google's `error` parameter — `access_denied` when the person said no. */
  error: string | null;
  sealed: string | null | undefined;
  userId: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<ConnectOutcome> {
  const now = input.now ?? new Date();
  const pending = openPendingConnection(input.sealed, input.state, now);
  if (!pending) return { result: "expired", location: "/app" };
  // Same treatment as a bad nonce: nothing in the cookie is used, not even to
  // choose where to send the person.
  if (pending.userId !== input.userId) return { result: "expired", location: "/app" };

  const back = (result: ConnectResult, detail?: string): ConnectOutcome => ({
    result,
    location: `${returnPath(pending)}?google=${result}`,
    detail,
  });

  const access = await getWorkspaceAccess(pending.slug, input.userId);
  if (!access) return { result: "expired", location: "/app" };
  const workspaceId = access.workspace.id;

  if (input.error) return back("denied", input.error);
  if (!input.code) return back("failed", "no code");

  const exchanged = await exchangeCode({
    code: input.code,
    redirectUri: input.redirectUri,
    fetchImpl: input.fetchImpl,
  });
  if (!exchanged.ok) return back("failed", exchanged.error);

  const sheet = await inspectSpreadsheet({
    accessToken: exchanged.accessToken,
    spreadsheetId: pending.spreadsheetId,
    sheetName: pending.sheetName,
    fetchImpl: input.fetchImpl,
  });
  if (!sheet.ok) {
    return back(sheet.reason === "unreachable" ? "failed" : sheet.reason, sheet.detail);
  }

  const config = {
    spreadsheetId: pending.spreadsheetId,
    sheetName: sheet.sheetName,
    refreshToken: exchanged.refreshToken,
    account: exchanged.email,
    spreadsheetTitle: sheet.title,
    connectedAt: now.toISOString(),
  };

  if (pending.destinationId) {
    const existing = await getDestination(workspaceId, pending.endpointPublicId, pending.destinationId);
    if (!existing || existing.kind !== "google_sheets") return back("failed", "destination gone");
    // Read so a field this flow does not own survives the replacement. Today
    // that is nothing, and the line costs one query to keep it that way.
    const previous = (await rawConfig(workspaceId, existing.id)) ?? {};
    await updateDestination(workspaceId, existing.id, { config: { ...previous, ...config } });
    return back("reconnected");
  }

  const created = await createDestination(workspaceId, pending.endpointPublicId, {
    kind: "google_sheets",
    name: pending.name,
    config,
  });
  if (!created) return back("failed", "endpoint gone");
  return back("connected");
}

/**
 * Where the person lands. Built from the verified cookie, encoded segment by
 * segment, and always a path on this origin — so even a value that somehow
 * held `//evil.example` would stay a path segment rather than become a host.
 */
function returnPath(pending: PendingConnection): string {
  const base = `/app/${encodeURIComponent(pending.slug)}/endpoints/${encodeURIComponent(pending.endpointPublicId)}/destinations`;
  return pending.destinationId ? `${base}/${encodeURIComponent(pending.destinationId)}` : base;
}
