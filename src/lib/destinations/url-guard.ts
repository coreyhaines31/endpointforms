import { isPrivateHost } from "../schema/import-url.ts";

/**
 * Where a delivery is allowed to go.
 *
 * A destination URL is typed by a user and fetched by our server, which is the
 * textbook shape of server-side request forgery — the same hazard
 * `src/lib/schema/import-url.ts` was written against, and worse, because a
 * destination fires on a schedule rather than once. `isPrivateHost` there
 * already parses every form a resolver accepts (`0x7f.0.0.1`, `2130706433`,
 * `127.1`, `::ffff:127.0.0.1`, and the `169.254.169.254` metadata address that
 * hands out instance credentials to anything that asks), so this module reuses
 * it rather than growing a second, subtly different list. A guard that exists
 * twice is a guard that is right once.
 *
 * What is different here, and why this is not just a re-export:
 *
 * - **https only, by default.** A schema import reads a public marketing page;
 *   a delivery carries a customer's leads and an HMAC secret. Sending those over
 *   plaintext http is a decision someone has to make deliberately, and
 *   `ALLOW_INSECURE_DESTINATIONS=1` is how a self-hoster posting to a service on
 *   their own network makes it.
 * - **No credentials in the URL.** `https://user:pass@host/` puts a secret in
 *   every log line and every screenshot of the destinations screen.
 *
 * Redirects are **not** followed at delivery time (see `./adapters/webhook.ts`),
 * which closes the hop-to-loopback hole differently: there are no hops.
 *
 * The DNS-rebinding caveat from `import-url.ts` applies here too and is stated
 * rather than pretended away — the hostname is checked, not the address it
 * resolves to at connect time. Closing it needs an agent that pins the resolved
 * IP, and it is worth doing before this is exposed to untrusted tenants.
 */

export class DestinationUrlError extends Error {
  readonly code: "invalid_url" | "insecure_scheme" | "blocked_host" | "credentials_in_url";

  constructor(code: DestinationUrlError["code"], message: string) {
    super(message);
    this.name = "DestinationUrlError";
    this.code = code;
  }
}

/** Off in production. A self-hoster delivering inside their own network sets it. */
export function allowsInsecureDestinations(): boolean {
  return process.env.ALLOW_INSECURE_DESTINATIONS === "1";
}

export type UrlGuardOptions = {
  /** Permit `http://`. Defaults to the env flag above. */
  allowInsecure?: boolean;
  /** Permit loopback and private ranges. Only ever set by the tests. */
  allowPrivateHosts?: boolean;
};

/**
 * Parses and checks a destination URL, or throws with a sentence someone can act
 * on. Returns the parsed URL so a caller never re-parses and gets a different one.
 */
export function assertDeliverableUrl(input: string, options: UrlGuardOptions = {}): URL {
  const allowInsecure = options.allowInsecure ?? allowsInsecureDestinations();

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new DestinationUrlError(
      "invalid_url",
      `${JSON.stringify(input)} is not a URL. Include the scheme, e.g. https://example.com/hooks/leads.`,
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new DestinationUrlError(
      "invalid_url",
      `A destination must be an http or https URL; got ${url.protocol.replace(":", "")}.`,
    );
  }

  if (url.protocol === "http:" && !allowInsecure) {
    throw new DestinationUrlError(
      "insecure_scheme",
      "Deliveries must go over https — this one carries your leads and a signing secret. Self-hosting on a private network? Set ALLOW_INSECURE_DESTINATIONS=1.",
    );
  }

  if (url.username !== "" || url.password !== "") {
    throw new DestinationUrlError(
      "credentials_in_url",
      "Take the username and password out of the URL — they would appear in every delivery log. Use a header instead.",
    );
  }

  if (!options.allowPrivateHosts && isPrivateHost(url.hostname)) {
    throw new DestinationUrlError(
      "blocked_host",
      `${url.hostname} is a loopback, private or link-local address, which this server will not deliver to.`,
    );
  }

  return url;
}

/** The same check, as a boolean, for a form that wants to show a hint before submit. */
export function isDeliverableUrl(input: string, options: UrlGuardOptions = {}): boolean {
  try {
    assertDeliverableUrl(input, options);
    return true;
  } catch {
    return false;
  }
}
