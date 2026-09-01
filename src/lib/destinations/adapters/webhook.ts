import { parseConfig } from "../config.ts";
import { serialisePayload } from "../payload.ts";
import { classifyStatus, classifyTransportError, describeFailure, transportDetail } from "../retry.ts";
import {
  HEADER_ATTEMPT,
  HEADER_DELIVERY_ID,
  HEADER_EVENT,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  signPayload,
} from "../signature.ts";
import { assertDeliverableUrl, DestinationUrlError } from "../url-guard.ts";
import type { Adapter, AdapterContext, AdapterResult } from "../types.ts";

/**
 * The generic signed webhook — the destination everything else is a special
 * case of, and the one an agency uses to reach the internal system nobody has
 * built an integration for.
 *
 * Four decisions worth stating:
 *
 * 1. **The URL is re-checked on every delivery**, not only when it was saved.
 *    A hostname that resolved to a public address in March can resolve to
 *    `127.0.0.1` in June, and the row was written once.
 * 2. **`redirect: "manual"`.** A 3xx is a failure, not a hop. Following one
 *    would re-open the SSRF hole the guard closes — a public URL that 302s to
 *    the metadata service — and a receiver that redirects its own webhook
 *    endpoint has a configuration problem worth telling them about.
 * 3. **The response body is read and kept, capped.** #42 is the issue about
 *    telling someone *why* their integration is broken, and the why is usually
 *    in the body their server returned.
 * 4. **A timeout.** Left to itself `fetch` will wait a very long time, and this
 *    runs inside a serverless invocation somebody pays for.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
/** Enough to hold an error message and a stack trace, not enough to be storage. */
const MAX_RESPONSE_BYTES = 16_000;

export const webhookAdapter: Adapter = {
  kind: "webhook",
  available: true,
  label: "Webhook",
  blurb: "Signed JSON POST to any URL you control. The one everything else is a special case of.",
  deliver: deliverWebhook,
};

export async function deliverWebhook(context: AdapterContext): Promise<AdapterResult> {
  const doFetch = context.fetchImpl ?? fetch;

  let config;
  try {
    config = parseConfig("webhook", context.config);
  } catch (error) {
    return configurationFailure(context, error);
  }

  let url: URL;
  try {
    url = assertDeliverableUrl(config.url, {
      // The tests deliver to a loopback server. Nothing else sets this.
      allowPrivateHosts: process.env.ALLOW_PRIVATE_DESTINATIONS === "1",
    });
  } catch (error) {
    if (error instanceof DestinationUrlError) return configurationFailure(context, error);
    throw error;
  }

  const body = serialisePayload(context.payload);
  const timestamp = Math.floor(Date.parse(context.payload.delivery.sentAt) / 1000);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    "user-agent": "EndpointForms/1.0 (+https://endpointforms.com/docs/destinations)",
    [HEADER_EVENT]: context.payload.type,
    [HEADER_DELIVERY_ID]: context.payload.delivery.id,
    [HEADER_ATTEMPT]: String(context.payload.delivery.attempt),
    [HEADER_TIMESTAMP]: String(timestamp),
    [HEADER_SIGNATURE]: signPayload(config.secret, timestamp, body),
    ...(config.headers ?? {}),
  };

  // What goes in the delivery log. The signature is a MAC rather than a key, so
  // it is not a secret — but a customer's own `Authorization` header is, and it
  // would otherwise be sitting in a jsonb column that the whole team can read.
  const loggedHeaders = redactHeadersForLog(headers, Object.keys(config.headers ?? {}));

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    context.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await doFetch(url.toString(), {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: controller.signal,
    });

    const responseBody = await readCapped(response);

    // `redirect: "manual"` surfaces a 3xx as an opaque-redirect response with
    // status 0 in some runtimes and the real status in others. Both are the
    // same answer: we did not deliver.
    const isRedirect = response.status === 0 || (response.status >= 300 && response.status < 400);
    if (isRedirect) {
      return {
        ok: false,
        requestBody: body,
        requestHeaders: loggedHeaders,
        responseStatus: response.status || null,
        responseBody,
        error: `${context.destinationName} redirected the delivery instead of accepting it. Point the destination at the final URL — we do not follow redirects, because a redirect is how a webhook gets pointed somewhere it should not go.`,
        failure: "rejected",
      };
    }

    if (response.ok) {
      return {
        ok: true,
        requestBody: body,
        requestHeaders: loggedHeaders,
        responseStatus: response.status,
        responseBody,
        error: null,
        failure: null,
      };
    }

    const failure = classifyStatus(response.status);
    return {
      ok: false,
      requestBody: body,
      requestHeaders: loggedHeaders,
      responseStatus: response.status,
      responseBody,
      error: describeFailure(failure, context.destinationName),
      failure,
    };
  } catch (error) {
    const failure = classifyTransportError(error);
    return {
      ok: false,
      requestBody: body,
      requestHeaders: loggedHeaders,
      responseStatus: null,
      responseBody: null,
      // The transport message is appended because "could not be reached" and
      // "certificate has expired" send someone to two different places.
      error: `${describeFailure(failure, context.destinationName)} (${transportDetail(error)})`,
      failure,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The response body, truncated rather than streamed in full.
 *
 * A destination that answers with a 40MB HTML error page must not put 40MB in
 * our database on every retry. Truncation is announced in the stored text, so
 * nobody debugs against a body they think is complete.
 */
export async function readCapped(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    if (text.length <= MAX_RESPONSE_BYTES) return text === "" ? null : text;
    return `${text.slice(0, MAX_RESPONSE_BYTES)}\n\n… truncated at ${MAX_RESPONSE_BYTES} characters.`;
  } catch {
    return null;
  }
}

/**
 * Headers as they are stored.
 *
 * Everything we set is kept verbatim — a delivery log without the signature
 * header cannot be used to debug a signature. Everything the *customer* added
 * is masked, because that is where an API key lives.
 */
export function redactHeadersForLog(
  headers: Record<string, string>,
  customHeaderNames: string[],
): Record<string, string> {
  const custom = new Set(customHeaderNames.map((name) => name.toLowerCase()));
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = custom.has(name.toLowerCase()) ? "[redacted]" : value;
  }
  return out;
}

/** A destination that cannot deliver because of how it is set up. Never retried. */
function configurationFailure(context: AdapterContext, error: unknown): AdapterResult {
  return {
    ok: false,
    requestBody: null,
    requestHeaders: null,
    responseStatus: null,
    responseBody: null,
    error: error instanceof Error ? error.message : String(error),
    failure: "configuration",
  };
}
