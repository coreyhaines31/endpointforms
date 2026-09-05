import { lookup as dnsLookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent, request } from "undici";

import { isPrivateHost } from "./private-address.ts";

/**
 * A fetch that connects to the address it checked (#58).
 *
 * `isPrivateHost()` in `./private-address.ts` decides whether an address is off
 * limits, and both SSRF guards call it — the schema importer and webhook
 * delivery. Until this module existed they called it with a **hostname**, and
 * then handed that same hostname to `fetch`, which resolved it again. Those are
 * two different questions with a gap between them:
 *
 *   1. we ask DNS what `attacker.com` is, and are told `93.184.216.34`
 *   2. the guard says a public address is fine
 *   3. `fetch` asks DNS what `attacker.com` is, and is told `169.254.169.254`
 *   4. we connect to the cloud metadata service and hand back its credentials
 *
 * A one-second TTL is all that takes, and it is not exotic — it is the standard
 * DNS-rebinding attack, and it defeats a hostname check completely. `tests/
 * ssrf-rebinding.test.mts` performs exactly that sequence against a loopback
 * stand-in and shows both halves: a hostname-only guard connects, and so does
 * the tempting half-fix that resolves, checks, and then connects *by name*.
 * Checking is not the fix. Pinning is.
 *
 * So this module does the resolving itself:
 *
 * - `dns.lookup(all: true)` — and **every** address returned must pass. A name
 *   answering with one public and one private address is refused; picking the
 *   first would let an attacker decide which one we look at.
 * - The connection is then made through an `undici` Agent whose `connect.lookup`
 *   hands back those verified addresses and never consults DNS again. There is
 *   no second resolution to poison.
 * - The URL keeps its hostname, so `Host` and TLS SNI are still the name.
 *   Virtual-hosted sites and certificate validation both keep working; only the
 *   address the socket goes to is fixed.
 * - **Redirects are never followed.** Each hop is a new request that must go
 *   back through the caller's guard and through this function, because hop two
 *   is a fresh name with a fresh resolution. Passing `redirect: "follow"` is an
 *   error rather than a silent bypass.
 * - The body is read with a byte cap and the whole thing runs under the
 *   caller's `AbortSignal`, so the existing timeouts and size limits are kept.
 *
 * What this does **not** do: it does not protect against a server whose single
 * resolved address is itself the attack (that is `isPrivateHost`'s job, and it
 * is only as good as its list of ranges), and it cannot see through a proxy
 * that resolves names on our behalf. Node-only — it imports `node:dns`, so it
 * belongs to server code.
 */

export class PinnedFetchError extends Error {
  readonly code: "blocked_address" | "unresolvable" | "invalid_url";
  /** What the name resolved to, when it resolved at all. Safe to log. */
  readonly addresses: string[];

  constructor(code: PinnedFetchError["code"], message: string, addresses: string[] = []) {
    super(message);
    this.name = "PinnedFetchError";
    this.code = code;
    this.addresses = addresses;
  }
}

export type ResolvedAddress = { address: string; family: 4 | 6 };

export type PinnedFetchOptions = {
  /**
   * Stop reading the response body after this many bytes. Callers pass their
   * own limit + 1 when they want to *detect* the overrun rather than truncate.
   */
  maxBytes?: number;
  /**
   * Skip the private-address refusal. A self-hoster delivering inside their own
   * network sets the env flag that turns this on; the tests set it directly.
   * Resolution and pinning still happen — only the verdict is skipped.
   */
  allowPrivateAddresses?: boolean;
  /**
   * Test seam: the resolver. Defaults to `dns.lookup(all: true)`. The rebinding
   * tests hand over a stub that answers differently on the second call, which is
   * the only way to write that test without a live authoritative nameserver.
   */
  lookupImpl?: (hostname: string) => Promise<ResolvedAddress[]>;
  /**
   * Test seam: which addresses are off limits. Defaults to `isPrivateHost`.
   * The tests narrow it so a loopback server can play the part of the public
   * internet while another loopback address plays 169.254.169.254 — nothing in
   * production sets it.
   */
  isBlockedAddress?: (address: string) => boolean;
};

/** 4 MB. Callers that care pass their own; nobody should read an unbounded body. */
const DEFAULT_MAX_BYTES = 4_000_000;

/** Statuses that must not carry a body, per the Response constructor. */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/**
 * A `fetch`-shaped function that resolves, verifies, and pins.
 *
 * Deliberately `fetch`-shaped: both call sites already accept an injected
 * `fetchImpl` for their tests, and this slots into that seam rather than
 * forcing a second transport abstraction through the delivery adapters.
 *
 * The response it returns is fully buffered — the cap has to be applied while
 * reading, and the connection has to be closed after, so there is no streaming
 * body to hand back. Both callers read the whole body anyway.
 */
export function createPinnedFetch(options: PinnedFetchOptions = {}): typeof fetch {
  return async function pinnedFetch(input, init) {
    const url = toUrl(input);
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

    if (init?.redirect === "follow") {
      throw new PinnedFetchError(
        "invalid_url",
        "A pinned fetch never follows redirects: hop two is a different name and has to be checked again. Use redirect: \"manual\" and re-check each hop.",
      );
    }

    const addresses = await resolveAndVerify(url.hostname, options);

    const agent = new Agent({ connect: { lookup: pinnedLookup(addresses) } });
    try {
      const response = await request(url, {
        method: (init?.method ?? "GET") as "GET",
        headers: headerRecord(init?.headers),
        body: requestBody(init?.body),
        signal: init?.signal ?? undefined,
        // undici's `request` does not follow redirects; a 3xx comes back as a
        // 3xx, which is what `redirect: "manual"` asks for.
        dispatcher: agent,
      });

      const body = await readCapped(response.body, maxBytes);
      const hasBody = !NULL_BODY_STATUSES.has(response.statusCode) && init?.method !== "HEAD";

      return new Response(hasBody ? asBytes(body) : null, {
        status: response.statusCode,
        headers: responseHeaders(response.headers),
      });
    } finally {
      await agent.close().catch(() => {});
    }
  } as typeof fetch;
}

/**
 * Every address a name resolves to, once each has passed the private-address
 * rules. Throws rather than filtering: an attacker who can add one private
 * address to an answer set must not be able to steer us onto it by having the
 * others discarded.
 */
export async function resolveAndVerify(
  hostname: string,
  options: PinnedFetchOptions = {},
): Promise<ResolvedAddress[]> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const blocked = options.isBlockedAddress ?? isPrivateHost;
  const allow = options.allowPrivateAddresses === true;

  // A literal address is its own resolution. `new URL()` has already
  // canonicalised the decimal, octal and hex spellings by this point.
  const literalFamily = isIP(host);
  if (literalFamily !== 0) {
    if (!allow && blocked(host)) {
      throw new PinnedFetchError("blocked_address", `${host} is a private or local address.`, [host]);
    }
    return [{ address: host, family: literalFamily === 6 ? 6 : 4 }];
  }

  // Names that never need a resolver to be recognisable: localhost, .local,
  // .internal, metadata.google.internal.
  if (!allow && blocked(host)) {
    throw new PinnedFetchError("blocked_address", `${host} is a private or local name.`);
  }

  let resolved: ResolvedAddress[];
  try {
    resolved = options.lookupImpl
      ? await options.lookupImpl(host)
      : (await dnsLookup(host, { all: true, verbatim: true })).map((entry) => ({
          address: entry.address,
          family: entry.family === 6 ? 6 : 4,
        }));
  } catch (error) {
    throw new PinnedFetchError(
      "unresolvable",
      `${host} did not resolve to any address (${error instanceof Error ? error.message : "lookup failed"}).`,
    );
  }

  if (resolved.length === 0) {
    throw new PinnedFetchError("unresolvable", `${host} did not resolve to any address.`);
  }

  if (!allow) {
    // All of them, not the first. One private answer poisons the set.
    const offenders = resolved.filter((entry) => blocked(entry.address));
    if (offenders.length > 0) {
      throw new PinnedFetchError(
        "blocked_address",
        `${host} resolves to ${offenders.map((entry) => entry.address).join(", ")}, which is a private or local address. It will not be fetched.`,
        resolved.map((entry) => entry.address),
      );
    }
  }

  return resolved;
}

/**
 * The `connect.lookup` handed to undici: it answers from the verified list and
 * never asks DNS. This is the pin — everything above it is only a check.
 */
function pinnedLookup(addresses: ResolvedAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const requested = options?.family;
    const wanted =
      requested === "IPv4" ? 4 : requested === "IPv6" ? 6 : typeof requested === "number" ? requested : 0;
    const matching = wanted === 0 ? addresses : addresses.filter((entry) => entry.family === wanted);

    if (matching.length === 0) {
      const error: NodeJS.ErrnoException = new Error(
        `No verified address for this connection (wanted IPv${wanted}).`,
      );
      error.code = "ENOTFOUND";
      callback(error, "", 0);
      return;
    }

    if (options?.all) callback(null, matching);
    else callback(null, matching[0].address, matching[0].family);
  };
}

/**
 * The same bytes in an array the `Response` constructor accepts. A `Buffer` is
 * backed by a shared pool, and TypeScript's `BodyInit` will not take one; the
 * copy is bounded by `maxBytes`.
 */
function asBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes;
}

function toUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  // A Request object carries its own body stream and redirect mode; nothing here
  // passes one, and silently ignoring half of it would be worse than refusing.
  throw new PinnedFetchError("invalid_url", "A pinned fetch takes a URL or a string, not a Request.");
}

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  new Headers(headers).forEach((value, name) => {
    out[name] = value;
  });
  return out;
}

function requestBody(body: BodyInit | null | undefined): string | Buffer | undefined {
  if (body === null || body === undefined) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(new Uint8Array(body));
  throw new PinnedFetchError(
    "invalid_url",
    "A pinned fetch takes a string or bytes as the body; a stream cannot be replayed per hop.",
  );
}

function responseHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const out = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) out.append(name, item);
    else out.append(name, value);
  }
  return out;
}

/** Reads at most `maxBytes` and hangs up rather than trusting somebody else's server. */
async function readCapped(
  body: AsyncIterable<Buffer> & { destroy?: (error?: Error) => void },
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of body) {
    const remaining = maxBytes - total;
    if (remaining <= 0) {
      body.destroy?.();
      break;
    }
    if (chunk.length > remaining) {
      chunks.push(chunk.subarray(0, remaining));
      total = maxBytes;
      body.destroy?.();
      break;
    }
    chunks.push(chunk);
    total += chunk.length;
  }

  return Buffer.concat(chunks, total);
}
