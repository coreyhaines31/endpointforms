import type { ConnectResult } from "@/lib/destinations/connect";

/**
 * What happened on Google's consent screen, said once on the screen the person
 * comes back to (#67).
 *
 * The callback redirects with `?google=<result>` — a short code, never a
 * sentence and never anything Google said, so a crafted link can only ever
 * show one of the sentences below. An unknown code renders nothing.
 */

const MESSAGES: Partial<Record<ConnectResult, { ok: boolean; text: string }>> = {
  connected: {
    ok: true,
    text: "Connected. Send a test delivery to prove a row can be written — it adds one obviously fake row you can delete.",
  },
  reconnected: {
    ok: true,
    text: "Reconnected. Anything that missed this destination while it was disconnected is in the delivery log — send it again from there.",
  },
  denied: {
    ok: false,
    text: "Google was not given permission, so nothing was connected.",
  },
  failed: {
    ok: false,
    text: "Google did not complete the connection, so nothing was saved. Try again; if it keeps failing, this deployment’s Google client may be misconfigured.",
  },
  forbidden: {
    ok: false,
    text: "The Google account you chose cannot open that spreadsheet, so nothing was saved. Share it with that account, or connect as one that can see it.",
  },
  missing: {
    ok: false,
    text: "That spreadsheet does not exist, or the account you chose cannot see it. Nothing was saved.",
  },
  no_tab: {
    ok: false,
    text: "That spreadsheet has no tab with that name, so nothing was saved. Leave the tab empty to use the first one.",
  },
};

export function GoogleConnectNotice({
  result,
  className,
}: {
  result: string | string[] | undefined;
  className?: string;
}) {
  const code = typeof result === "string" ? result : undefined;
  const message = code ? MESSAGES[code as ConnectResult] : undefined;
  if (!message) return null;

  return (
    <p
      role="status"
      className={`max-w-[68ch] rounded-lg border px-5 py-4 text-sm text-foreground ${
        message.ok
          ? "border-signal-edge/40 bg-signal/10"
          : "border-destructive/40 bg-destructive-surface"
      } ${className ?? ""}`}
    >
      {message.text}
    </p>
  );
}
