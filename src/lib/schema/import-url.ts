import {
  createPinnedFetch,
  PinnedFetchError,
  type PinnedFetchOptions,
} from "../net/pinned-fetch.ts";
import { isPrivateHost } from "../net/private-address.ts";
import { importSchemaFromHtml, type HtmlImportResult } from "./import-html.ts";

/**
 * Importing a schema from a live URL (#51, producer one, second half).
 *
 * "Point us at your form" is the version of this feature people ask for, and it
 * is a **server making an HTTP request to an address a user typed**, which is
 * the textbook shape of server-side request forgery. So the guard below is not
 * decoration:
 *
 * - Only `http` and `https`. No `file:`, no `gopher:`, no `data:`.
 * - No loopback, link-local, private or `.local` address. The interesting
 *   target on a cloud host is `169.254.169.254`, which serves instance
 *   credentials to anything that asks.
 * - Redirects are followed **manually**, so every hop is checked. A public URL
 *   that 302s to `127.0.0.1` defeats a check that only looks at the first one.
 * - A byte cap and a timeout, because the response is somebody else's server.
 * - DNS rebinding is defended against, which the hostname check alone did not
 *   do: `../net/pinned-fetch.ts` resolves the name here, requires **every**
 *   address it answers with to pass `isPrivateHost`, and then connects to those
 *   addresses rather than to the name. Between the check and the connect there
 *   is no second lookup for an attacker to answer differently. Each redirect
 *   hop goes through the same two steps.
 *
 * The guard itself now lives in `../net/private-address.ts` — the delivery path
 * needs the identical rules and a guard that exists twice is a guard that is
 * right once. It is re-exported here because that is where its tests and its
 * history are.
 */

export class HtmlFetchError extends Error {
  readonly code:
    | "invalid_url"
    | "blocked_host"
    | "too_many_redirects"
    | "not_html"
    | "too_large"
    | "request_failed";

  constructor(code: HtmlFetchError["code"], message: string) {
    super(message);
    this.name = "HtmlFetchError";
    this.code = code;
  }
}

const MAX_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10_000;

export type FetchImportOptions = {
  timeoutMs?: number;
  /** Injected by the tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Off by default and never on in production. The test suite sets it so the
   * redirect and content-type paths can be exercised against a loopback server.
   */
  allowPrivateHosts?: boolean;
  /**
   * Passed to the pinned transport. The rebinding tests use it to install a stub
   * resolver; production passes nothing.
   */
  net?: PinnedFetchOptions;
};

export type UrlImportResult = HtmlImportResult & {
  /** The URL the HTML actually came from, after redirects. */
  resolvedUrl: string;
};

export async function importSchemaFromUrl(
  input: string,
  options: FetchImportOptions = {},
): Promise<UrlImportResult> {
  const html = await fetchHtml(input, options);
  const result = importSchemaFromHtml(html.body, { sourceUrl: html.url });
  return { ...result, resolvedUrl: html.url };
}

export async function fetchHtml(
  input: string,
  options: FetchImportOptions = {},
): Promise<{ url: string; body: string }> {
  const allowPrivate = options.allowPrivateHosts === true;
  // Reading one byte past the cap is what makes the overrun detectable below —
  // a body truncated to exactly MAX_HTML_BYTES is indistinguishable from a page
  // that happens to be that size.
  const doFetch =
    options.fetchImpl ??
    createPinnedFetch({
      maxBytes: MAX_HTML_BYTES + 1,
      allowPrivateAddresses: allowPrivate,
      ...options.net,
    });

  let url = assertFetchable(input, allowPrivate);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await doFetch(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "EndpointForms-SchemaImport/1.0 (+https://endpointforms.com)",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new HtmlFetchError(
            "request_failed",
            `${url.toString()} answered ${response.status} with no Location header.`,
          );
        }
        // Resolved against the current URL, then re-checked from scratch.
        url = assertFetchable(new URL(location, url).toString(), allowPrivate);
        continue;
      }

      if (!response.ok) {
        throw new HtmlFetchError(
          "request_failed",
          `${url.toString()} answered ${response.status}. Check the URL is publicly reachable, or paste the markup instead.`,
        );
      }

      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (contentType !== "" && !/(text\/html|application\/xhtml\+xml|text\/plain)/.test(contentType)) {
        throw new HtmlFetchError(
          "not_html",
          `${url.toString()} returned ${contentType.split(";")[0]} rather than HTML.`,
        );
      }

      const declared = response.headers.get("content-length");
      if (declared && Number(declared) > MAX_HTML_BYTES) {
        throw new HtmlFetchError(
          "too_large",
          `The page is larger than the ${MAX_HTML_BYTES} byte import limit.`,
        );
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_HTML_BYTES) {
        throw new HtmlFetchError(
          "too_large",
          `The page is larger than the ${MAX_HTML_BYTES} byte import limit.`,
        );
      }

      return { url: url.toString(), body: new TextDecoder("utf-8").decode(buffer) };
    }

    throw new HtmlFetchError(
      "too_many_redirects",
      `${input} redirected more than ${MAX_REDIRECTS} times.`,
    );
  } catch (error) {
    if (error instanceof HtmlFetchError) throw error;
    if (error instanceof PinnedFetchError) {
      // A name that resolved to a private address is the same refusal as a
      // private hostname, and has to read as one rather than as "site down".
      throw new HtmlFetchError(
        error.code === "blocked_address" ? "blocked_host" : "request_failed",
        error.message,
      );
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new HtmlFetchError("request_failed", `${input} did not respond in time.`);
    }
    throw new HtmlFetchError(
      "request_failed",
      `${input} could not be fetched: ${error instanceof Error ? error.message : "unknown error"}.`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Re-exported from `../net/private-address.ts`, where the rules now live so the
 * delivery path can share them. This is still the import site the guard's tests
 * use, and the name is part of this module's published surface.
 */
export { isPrivateHost };

/** Parsed, protocol-checked and host-checked. Throws rather than returning null. */
export function assertFetchable(input: string, allowPrivateHosts = false): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HtmlFetchError(
      "invalid_url",
      `${JSON.stringify(input)} is not a URL. Include the scheme, e.g. https://example.com/contact.`,
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HtmlFetchError(
      "invalid_url",
      `Only http and https URLs can be imported; got ${url.protocol.replace(":", "")}.`,
    );
  }

  if (!allowPrivateHosts && isPrivateHost(url.hostname)) {
    throw new HtmlFetchError(
      "blocked_host",
      `${url.hostname} is a private or local address, which this server will not fetch.`,
    );
  }

  return url;
}
