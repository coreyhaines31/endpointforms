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
 *
 * DNS rebinding is not defended against here — the hostname is checked, not the
 * address it resolves to at connect time. Closing that needs a custom agent
 * that pins the resolved IP, which is worth doing before this is exposed to
 * untrusted tenants and is noted rather than pretended away.
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
  const doFetch = options.fetchImpl ?? fetch;
  const allowPrivate = options.allowPrivateHosts === true;

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

/**
 * Hostnames that must never be fetched on a user's behalf.
 *
 * Literal addresses are matched numerically rather than by prefix, because
 * `10.0.0.1` and `010.0.0.1` and `167772161` are the same host to a resolver
 * and only one of them looks private.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "" || host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) {
    return true;
  }
  if (host === "metadata.google.internal") return true;

  if (host.includes(":")) return isPrivateIpv6(host);

  const octets = parseIpv4(host);
  if (octets === null) return false;

  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. the metadata address
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved

  return false;
}

/**
 * IPv6, parsed numerically rather than matched as text.
 *
 * The previous version of this check tested for `::ffff:127.0.0.1` with a
 * regex over the dotted-quad spelling, and never fired. `new URL()` applies
 * WHATWG normalisation, which rewrites the embedded IPv4 as hex before this
 * function ever sees it:
 *
 *   new URL("https://[::ffff:169.254.169.254]/").hostname  //  "[::ffff:a9fe:a9fe]"
 *
 * `a9fe:a9fe` is 169.254.169.254 — the cloud instance metadata service. So the
 * one spelling the guard tested for was the one spelling that could not reach
 * it, and three different ways of writing loopback and link-local addresses
 * were fetchable. Anything that embeds an IPv4 address in its low 32 bits gets
 * those bits handed back to the IPv4 rules, which already understand octal,
 * hex and integer forms.
 */
function isPrivateIpv6(host: string): boolean {
  // A zone id (`fe80::1%eth0`) is not part of the address.
  const groups = parseIpv6(host.split("%")[0]);
  if (groups === null) return false;

  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;

  // Unspecified (::) and loopback (::1).
  const highIsZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (highIsZero && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) return true;

  if ((g0 & 0xfe00) === 0xfc00) return true; // unique-local, fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true; // link-local, fe80::/10

  // Prefixes that carry an IPv4 address in the low 32 bits. Hand those bits to
  // the IPv4 rules rather than duplicating them here.
  const embedsIpv4 =
    (highIsZero && g5 === 0xffff) || // IPv4-mapped,      ::ffff:0:0/96
    (highIsZero && g5 === 0) || //      IPv4-compatible,  ::/96 (deprecated, still resolvable)
    (g0 === 0x0064 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0); // NAT64, 64:ff9b::/96

  if (embedsIpv4) {
    const octets = [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff].join(".");
    return isPrivateHost(octets);
  }

  return false;
}

/** Eight 16-bit groups, or null if this is not an IPv6 literal. */
function parseIpv6(host: string): number[] | null {
  let text = host;

  // A trailing dotted quad is legal (`::ffff:127.0.0.1`). Normalise it to two
  // hex groups so the rest of the parse is uniform. `new URL()` usually does
  // this for us, but this function is also called directly by tests and by
  // callers that did not come through a URL.
  const tail = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail) {
    const parts = tail[2].split(".").map(Number);
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    text = `${tail[1]}${hex(parts[0])}${hex(parts[1])}:${hex(parts[2])}${hex(parts[3])}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const piece of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
      out.push(Number.parseInt(piece, 16));
    }
    return out;
  };

  const head = toGroups(halves[0]);
  if (head === null) return null;

  if (halves.length === 1) return head.length === 8 ? head : null;

  const rest = toGroups(halves[1]);
  if (rest === null) return null;

  const missing = 8 - head.length - rest.length;
  if (missing < 1) return null; // "::" must stand for at least one zero group

  return [...head, ...Array<number>(missing).fill(0), ...rest];
}

/** Dotted quad, decimal, octal and hex forms — all of which a resolver accepts. */
function parseIpv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length > 4 || parts.some((part) => part === "")) return null;

  const numbers: number[] = [];
  for (const part of parts) {
    let value: number;
    if (/^0[xX][0-9a-fA-F]+$/.test(part)) value = Number.parseInt(part, 16);
    else if (/^0[0-7]+$/.test(part)) value = Number.parseInt(part, 8);
    else if (/^\d+$/.test(part)) value = Number.parseInt(part, 10);
    else return null;
    if (!Number.isFinite(value) || value < 0) return null;
    numbers.push(value);
  }

  // A short form packs the remainder into the last part: `127.1` is 127.0.0.1.
  const last = numbers.pop();
  if (last === undefined) return null;

  const octets = [...numbers, ...unpack(last, 4 - numbers.length)];
  if (octets.length !== 4 || octets.some((octet) => octet > 255)) return null;

  return octets as [number, number, number, number];
}

function unpack(value: number, count: number): number[] {
  const out: number[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(Math.floor(value / 256 ** i) % 256);
  }
  return out;
}
