import { parseConfig } from "../config.ts";
import { classifyStatus, classifyTransportError, describeFailure, transportDetail } from "../retry.ts";
import { assertDeliverableUrl, DestinationUrlError } from "../url-guard.ts";
import type { Adapter, AdapterContext, AdapterResult, SubmissionPayload } from "../types.ts";
import { readCapped } from "./webhook.ts";

/**
 * Slack, as an incoming webhook.
 *
 * Deliberately the incoming-webhook form rather than an OAuth app: there is no
 * token to refresh, no scopes to request, no install flow to build, and the
 * customer creates it themselves in a minute. The trade is that the URL *is* the
 * credential, so it is treated as one everywhere — masked in the UI (see
 * `redactConfig`), never rendered back into the edit form, and constrained to
 * `hooks.slack.com` at save time so a typo cannot quietly post leads to
 * somebody else's server.
 *
 * The message leads with the Origin stamp for the same reason the email subject
 * line does: a channel full of these is exactly where "sales drowns in junk"
 * happens, and the stamp is what stops it.
 *
 * Slack answers `200 ok` on success and `400 invalid_payload` /
 * `403 action_prohibited` / `404 no_service` on failure, with the reason in the
 * body — which is why the body is retained rather than discarded on a 2xx.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

export const slackAdapter: Adapter = {
  kind: "slack",
  available: true,
  label: "Slack",
  blurb: "Posts to a channel through an incoming webhook, stamped Human, Agent or Unverified.",
  deliver: deliverSlack,
};

export async function deliverSlack(context: AdapterContext): Promise<AdapterResult> {
  const doFetch = context.fetchImpl ?? fetch;

  let config;
  try {
    config = parseConfig("slack", context.config);
  } catch (error) {
    return failure(error, "configuration");
  }

  let url: URL;
  try {
    url = assertDeliverableUrl(config.webhookUrl, {
      allowPrivateHosts: process.env.ALLOW_PRIVATE_DESTINATIONS === "1",
    });
  } catch (error) {
    if (error instanceof DestinationUrlError) return failure(error, "configuration");
    throw error;
  }

  const body = JSON.stringify(slackMessage(context.payload));

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    context.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await doFetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      redirect: "manual",
      signal: controller.signal,
    });

    const responseBody = await readCapped(response);

    // The URL is the credential, so it must not be written into the delivery
    // log's request headers — the log is readable by every member of the
    // workspace, and this one line would let any of them post to the channel.
    const requestHeaders = { "content-type": "application/json", url: "[redacted]" };

    if (response.ok) {
      return {
        ok: true,
        requestBody: body,
        requestHeaders,
        responseStatus: response.status,
        responseBody,
        error: null,
        failure: null,
      };
    }

    const kind = classifyStatus(response.status);
    return {
      ok: false,
      requestBody: body,
      requestHeaders,
      responseStatus: response.status,
      responseBody,
      // Slack's own word is more useful than our generic sentence, so it goes
      // first when there is one: "no_service" means the webhook was deleted.
      error: responseBody
        ? `Slack answered ${response.status}: ${responseBody.slice(0, 200)}`
        : describeFailure(kind, context.destinationName),
      failure: response.status === 404 || response.status === 410 ? "configuration" : kind,
    };
  } catch (error) {
    const kind = classifyTransportError(error);
    return {
      ok: false,
      requestBody: body,
      requestHeaders: { "content-type": "application/json", url: "[redacted]" },
      responseStatus: null,
      responseBody: null,
      error: `${describeFailure(kind, context.destinationName)} (${transportDetail(error)})`,
      failure: kind,
    };
  } finally {
    clearTimeout(timeout);
  }
}

const ORIGIN_EMOJI = {
  human: ":bust_in_silhouette:",
  agent: ":robot_face:",
  unverified: ":grey_question:",
} as const;

const ORIGIN_LABEL = {
  human: "Human",
  agent: "Agent",
  unverified: "Unverified",
} as const;

/**
 * Block Kit, with a `text` fallback.
 *
 * The fallback is not optional: it is what appears in a notification, on a
 * watch, and in a screen reader, and a message that is blank in all three
 * places is a message nobody acts on.
 */
export function slackMessage(payload: SubmissionPayload): Record<string, unknown> {
  const { submission, endpoint, delivery } = payload;
  const stamp = ORIGIN_LABEL[submission.origin];
  const heading = `${delivery.test ? "[Test] " : ""}${stamp} submission — ${endpoint.name}`;

  const fields = Object.entries(submission.values)
    .slice(0, 10)
    .map(([key, value]) => ({
      type: "mrkdwn",
      text: `*${escapeMrkdwn(key)}*\n${escapeMrkdwn(formatValue(value)).slice(0, 500) || "—"}`,
    }));

  const blocks: Record<string, unknown>[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${ORIGIN_EMOJI[submission.origin]} *${escapeMrkdwn(heading)}*`,
      },
    },
  ];

  // Slack caps a section at 10 fields and renders them two per row.
  for (let index = 0; index < fields.length; index += 10) {
    blocks.push({ type: "section", fields: fields.slice(index, index + 10) });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Origin *${stamp}* · submitted ${submission.submittedAt} · \`${submission.id}\``,
      },
    ],
  });

  return { text: heading, blocks };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Slack's three reserved characters. A lead named `<script>` must not render as one. */
function escapeMrkdwn(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function failure(error: unknown, kind: "configuration"): AdapterResult {
  return {
    ok: false,
    requestBody: null,
    requestHeaders: null,
    responseStatus: null,
    responseBody: null,
    error: error instanceof Error ? error.message : String(error),
    failure: kind,
  };
}
