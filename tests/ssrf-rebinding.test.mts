/**
 * DNS rebinding (#58) — the address we checked must be the address we connect to.
 *
 * The two guards this project ships check a **hostname**. `attacker.example` is
 * not private, so it passes; then the fetch resolves the same name again and
 * connects to whatever the second answer says. Between those two moments an
 * attacker with a one-second TTL gets to change the answer, and the guard has
 * already said yes.
 *
 * This project has shipped an SSRF test that passed against a guard which could
 * not fire (665a495 — it called the function with a spelling `new URL()` never
 * emits). So this file refuses to assert an absence on its own. Every claim
 * here is paired with a demonstration that the same setup **does** reach the
 * private service when the fix is removed:
 *
 *   1. `hostnameOnlyFetch` — the guard as it was: check the name, connect by
 *      name. It fetches the internal service's credentials. That is the bug.
 *   2. `resolveThenConnectByName` — the tempting half-fix: resolve, check every
 *      address, then still connect by name. Under a rebinding resolver it
 *      fetches the same credentials. Checking is not the fix; pinning is.
 *   3. `createPinnedFetch` — resolve, check, and connect to the checked
 *      address. It refuses, or it lands on the verified server, and the
 *      internal service's hit counter never moves.
 *
 * The stand-ins, since nothing here may touch a real 169.254.169.254:
 *
 *   - **127.0.0.1** plays the public internet. The test's `isBlockedAddress`
 *     treats it as fine, which is the only way a local test can have a "public"
 *     host at all.
 *   - **::1** plays the cloud metadata service. The test's predicate blocks it.
 *     Both loopbacks are blocked by the real default (`isPrivateHost`), which
 *     `tests/form-schema.test.mts` covers; narrowing it here is what makes the
 *     two roles distinguishable from one machine.
 *   - Both servers listen on the **same port number**, so one name can rebind
 *     from one to the other with nothing else about the URL changing.
 *
 * No database. `node --experimental-strip-types tests/ssrf-rebinding.test.mts`.
 */

import http from "node:http";
import type { LookupFunction } from "node:net";
import { lookup as realLookup } from "node:dns/promises";
import { Agent, request } from "undici";

import {
  createPinnedFetch,
  PinnedFetchError,
  resolveAndVerify,
  type ResolvedAddress,
} from "../src/lib/net/pinned-fetch.ts";
import { isPrivateHost } from "../src/lib/net/private-address.ts";
import { fetchHtml, HtmlFetchError } from "../src/lib/schema/import-url.ts";
import { deliveryFetch } from "../src/lib/destinations/url-guard.ts";
import { deliverWebhook } from "../src/lib/destinations/adapters/webhook.ts";
import { buildPayload, sampleSource } from "../src/lib/destinations/index.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const isOk = JSON.stringify(got) === JSON.stringify(want);
  if (isOk) pass++;
  else fail++;
  console.log(`  ${isOk ? "PASS" : "FAIL"}  ${name}`);
  if (!isOk) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

// ---------------------------------------------------------------------------
// The two servers, on one port
// ---------------------------------------------------------------------------

const PUBLIC_ADDRESS = "127.0.0.1";
/** Stands in for 169.254.169.254. Nothing in this file talks to the real one. */
const INTERNAL_ADDRESS = "::1";
const CREDENTIALS = "INTERNAL-CREDENTIALS-abc123";

let publicHits: string[] = [];
let internalHits: string[] = [];

const publicServer = http.createServer((req, res) => {
  publicHits.push(req.url ?? "");
  if (req.url?.startsWith("/redirect-to/")) {
    const target = decodeURIComponent(req.url.slice("/redirect-to/".length));
    res.writeHead(302, { location: target });
    res.end("moved");
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end('<html><body><form action="/x"><input name="email"></form>PUBLIC-PAGE</body></html>');
});

const internalServer = http.createServer((req, res) => {
  internalHits.push(req.url ?? "");
  res.writeHead(200, { "content-type": "text/html" });
  res.end(CREDENTIALS);
});

/** Both servers on the same port, on different addresses. Retries if the port is taken on ::1. */
async function listenBoth(): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const port = await new Promise<number>((resolve) => {
      publicServer.listen(0, PUBLIC_ADDRESS, () => {
        resolve((publicServer.address() as { port: number }).port);
      });
    });
    try {
      await new Promise<void>((resolve, reject) => {
        internalServer.once("error", reject);
        internalServer.listen(port, INTERNAL_ADDRESS, resolve);
      });
      return port;
    } catch {
      await new Promise<void>((resolve) => publicServer.close(() => resolve()));
    }
  }
  throw new Error("could not put both servers on the same port");
}

const PORT = await listenBoth();

// ---------------------------------------------------------------------------
// The attacker's resolver
// ---------------------------------------------------------------------------

/**
 * Answers from a queue, repeating the last entry. The rebinding cases hand it
 * `[public, internal]`: the first lookup is the one a guard performs, the second
 * is the one the connect performs, and an attacker controls both.
 */
function rebindingResolver(answers: string[]) {
  let calls = 0;
  const next = (): ResolvedAddress => {
    const address = answers[Math.min(calls, answers.length - 1)];
    calls += 1;
    return { address, family: address.includes(":") ? 6 : 4 };
  };
  return {
    get calls() {
      return calls;
    },
    /** For `PinnedFetchOptions.lookupImpl`. */
    lookupImpl: async () => [next()],
    /** For an undici Agent's `connect.lookup` — i.e. resolution at connect time. */
    nodeLookup: ((_hostname, options, callback) => {
      const entry = next();
      if (options?.all) callback(null, [entry]);
      else callback(null, entry.address, entry.family);
    }) as LookupFunction,
  };
}

/** A fixed map from name to address, for the cases where nothing rebinds. */
function fixedResolver(map: Record<string, string>) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    lookupImpl: async (hostname: string): Promise<ResolvedAddress[]> => {
      calls += 1;
      const addresses = map[hostname];
      if (!addresses) throw new Error(`no fixture for ${hostname}`);
      return addresses.split(",").map((address) => ({
        address,
        family: address.includes(":") ? (6 as const) : (4 as const),
      }));
    },
  };
}

/** The test's narrowed rules: ::1 is the metadata service, 127.0.0.1 is the internet. */
const isBlockedAddress = (address: string) => address === INTERNAL_ADDRESS;

// ---------------------------------------------------------------------------
// The two implementations that are supposed to fail
// ---------------------------------------------------------------------------

/** The guard as it was before #58: check the hostname, hand the hostname to fetch. */
async function hostnameOnlyFetch(
  url: string,
  resolver: ReturnType<typeof rebindingResolver>,
): Promise<{ status: number; body: string }> {
  if (isPrivateHost(new URL(url).hostname)) throw new Error("blocked by hostname guard");
  const agent = new Agent({ connect: { lookup: resolver.nodeLookup } });
  try {
    const response = await request(url, { dispatcher: agent });
    return { status: response.statusCode, body: await response.body.text() };
  } finally {
    await agent.close();
  }
}

/** The half-fix: resolve, check every address, then connect by name anyway. */
async function resolveThenConnectByName(
  url: string,
  resolver: ReturnType<typeof rebindingResolver>,
): Promise<{ status: number; body: string }> {
  const verified = await resolver.lookupImpl();
  for (const entry of verified) {
    if (isBlockedAddress(entry.address)) throw new Error(`blocked ${entry.address}`);
  }
  const agent = new Agent({ connect: { lookup: resolver.nodeLookup } });
  try {
    const response = await request(url, { dispatcher: agent });
    return { status: response.statusCode, body: await response.body.text() };
  } finally {
    await agent.close();
  }
}

const reset = () => {
  publicHits = [];
  internalHits = [];
};

const errorOf = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
    return null;
  } catch (error) {
    return error;
  }
};

// ---------------------------------------------------------------------------
// 1. The hole, demonstrated
// ---------------------------------------------------------------------------

console.log("\nthe hole, before the fix");
{
  ok(
    "a hostname tells the old guard nothing — rebind.test is not private",
    !isPrivateHost("rebind.test"),
  );

  // The attacker does not even need the TTL trick against a hostname-only
  // guard: the guard never asks DNS, so one private answer is enough.
  reset();
  const resolver = rebindingResolver([INTERNAL_ADDRESS]);
  const response = await hostnameOnlyFetch(`http://rebind.test:${PORT}/creds`, resolver);
  t("the old guard fetched the internal service", response.body, CREDENTIALS);
  t("...and the internal service logged the hit", internalHits.length, 1);

  // The rebinding case proper: the answer that passes the check is not the
  // answer the socket gets.
  reset();
  const rebinder = rebindingResolver([PUBLIC_ADDRESS, INTERNAL_ADDRESS]);
  const viaHalfFix = await resolveThenConnectByName(`http://rebind.test:${PORT}/creds`, rebinder);
  t("resolving and checking, then connecting by name, still reaches it", viaHalfFix.body, CREDENTIALS);
  t("...because the connect asked DNS a second time", rebinder.calls, 2);
  t("...and the internal service logged that hit too", internalHits.length, 1);
}

// ---------------------------------------------------------------------------
// 2. The hole, closed
// ---------------------------------------------------------------------------

console.log("\nthe hole, with the pinned transport");
{
  reset();
  const resolver = rebindingResolver([INTERNAL_ADDRESS]);
  const pinned = createPinnedFetch({ lookupImpl: resolver.lookupImpl, isBlockedAddress });
  const error = await errorOf(() => pinned(`http://rebind.test:${PORT}/creds`, { redirect: "manual" }));

  ok("a name resolving to the internal address is refused", error instanceof PinnedFetchError, error);
  t("...as a blocked address, not a network failure", (error as PinnedFetchError)?.code, "blocked_address");
  ok(
    "...and the message names the address, not just the host",
    String((error as Error)?.message).includes(INTERNAL_ADDRESS),
    (error as Error)?.message,
  );
  t("the internal service was never contacted", internalHits.length, 0);

  // The rebinding case: the first answer passes, the second would not.
  reset();
  const rebinder = rebindingResolver([PUBLIC_ADDRESS, INTERNAL_ADDRESS]);
  const pinnedRebind = createPinnedFetch({ lookupImpl: rebinder.lookupImpl, isBlockedAddress });
  const response = await pinnedRebind(`http://rebind.test:${PORT}/creds`, { redirect: "manual" });
  const body = await response.text();

  t("the connection lands on the address that was verified", body.includes("PUBLIC-PAGE"), true);
  t("...the public server served it", publicHits.length, 1);
  t("...the internal service never saw the request", internalHits.length, 0);
  // The load-bearing assertion. One lookup means the second answer was never
  // asked for, which is what "pinned" means; two would mean re-resolution.
  t("...and DNS was asked exactly once", rebinder.calls, 1);
}

// ---------------------------------------------------------------------------
// 3. Every address, not the first
// ---------------------------------------------------------------------------

console.log("\nevery address in the answer");
{
  const mixed = fixedResolver({ "split.test": `${PUBLIC_ADDRESS},${INTERNAL_ADDRESS}` });
  const error = await errorOf(() =>
    resolveAndVerify("split.test", { lookupImpl: mixed.lookupImpl, isBlockedAddress }),
  );
  ok("one public and one private address is refused", error instanceof PinnedFetchError, error);
  ok(
    "...and the refusal names the private one",
    String((error as Error)?.message).includes(INTERNAL_ADDRESS),
    (error as Error)?.message,
  );

  // The control: the identical call with the private address removed must be
  // allowed, or the assertion above would pass for the wrong reason.
  const clean = fixedResolver({ "split.test": PUBLIC_ADDRESS });
  const allowed = await resolveAndVerify("split.test", {
    lookupImpl: clean.lookupImpl,
    isBlockedAddress,
  });
  t("the same name with only public addresses is allowed", allowed, [
    { address: PUBLIC_ADDRESS, family: 4 },
  ]);

  // Order must not matter: an attacker choosing which address comes first must
  // not choose which one we look at.
  const reversed = fixedResolver({ "split.test": `${INTERNAL_ADDRESS},${PUBLIC_ADDRESS}` });
  const reversedError = await errorOf(() =>
    resolveAndVerify("split.test", { lookupImpl: reversed.lookupImpl, isBlockedAddress }),
  );
  ok("the private address is caught wherever it sits in the answer", reversedError instanceof PinnedFetchError);
}

// ---------------------------------------------------------------------------
// 4. The importer, including every redirect hop
// ---------------------------------------------------------------------------

console.log("\nthe schema importer");
{
  const target = `http://internal.test:${PORT}/creds`;
  const entry = `http://entry.test:${PORT}/redirect-to/${encodeURIComponent(target)}`;

  // The control first: with internal.test pointed at the public server, the
  // redirect is genuinely followed and the import succeeds. Without this, the
  // refusal below could just be a broken chain.
  reset();
  const harmless = fixedResolver({
    "entry.test": PUBLIC_ADDRESS,
    "internal.test": PUBLIC_ADDRESS,
  });
  const imported = await fetchHtml(entry, {
    net: { lookupImpl: harmless.lookupImpl, isBlockedAddress },
  });
  t("a redirect is followed when the second hop is public", imported.url, target);
  ok("...and the body comes from the second hop", imported.body.includes("PUBLIC-PAGE"));
  t("...which took two lookups, one per hop", harmless.calls, 2);
  t("...and two requests to the public server", publicHits.length, 2);

  // Now the same chain, with the second hop rebound to the internal address.
  reset();
  const hostile = fixedResolver({
    "entry.test": PUBLIC_ADDRESS,
    "internal.test": INTERNAL_ADDRESS,
  });
  const error = await errorOf(() =>
    fetchHtml(entry, { net: { lookupImpl: hostile.lookupImpl, isBlockedAddress } }),
  );

  ok("a redirect to a name resolving internally is refused", error instanceof HtmlFetchError, error);
  t("...as a blocked host", (error as HtmlFetchError)?.code, "blocked_host");
  t("...after the first hop was fetched", publicHits.length, 1);
  t("...and the internal service was never contacted", internalHits.length, 0);

  // A single-hop import of a rebinding name is refused for the same reason.
  reset();
  const direct = fixedResolver({ "rebind.test": INTERNAL_ADDRESS });
  const directError = await errorOf(() =>
    fetchHtml(`http://rebind.test:${PORT}/creds`, {
      net: { lookupImpl: direct.lookupImpl, isBlockedAddress },
    }),
  );
  t("a first-hop rebind is refused too", (directError as HtmlFetchError)?.code, "blocked_host");
  t("...with nothing reaching the internal service", internalHits.length, 0);
}

// ---------------------------------------------------------------------------
// 5. Webhook delivery
// ---------------------------------------------------------------------------

console.log("\nwebhook delivery");
{
  reset();
  const resolver = rebindingResolver([PUBLIC_ADDRESS, INTERNAL_ADDRESS]);
  const post = deliveryFetch({ lookupImpl: resolver.lookupImpl, isBlockedAddress });
  const response = await post(`http://rebind.test:${PORT}/hook`, {
    method: "POST",
    body: '{"lead":1}',
    headers: { "content-type": "application/json" },
    redirect: "manual",
  });
  await response.text();

  t("a delivery connects to the verified address", publicHits, ["/hook"]);
  t("...not the rebound one", internalHits.length, 0);
  t("...having resolved exactly once", resolver.calls, 1);

  reset();
  const hostile = fixedResolver({ "rebind.test": INTERNAL_ADDRESS });
  const hostilePost = deliveryFetch({ lookupImpl: hostile.lookupImpl, isBlockedAddress });
  const error = await errorOf(() =>
    hostilePost(`http://rebind.test:${PORT}/hook`, { method: "POST", redirect: "manual" }),
  );
  t("a destination resolving internally is refused", (error as PinnedFetchError)?.code, "blocked_address");
  t("...with nothing delivered to it", internalHits.length, 0);

  // The Host header has to survive the pin, or every virtual-hosted receiver
  // breaks the day this ships.
  reset();
  const named = fixedResolver({ "crm.test": PUBLIC_ADDRESS });
  const hostChecker = deliveryFetch({ lookupImpl: named.lookupImpl, isBlockedAddress });
  let seenHost = "";
  const listener = (req: http.IncomingMessage) => {
    seenHost = req.headers.host ?? "";
  };
  publicServer.prependListener("request", listener);
  await (await hostChecker(`http://crm.test:${PORT}/hook`, { method: "POST", redirect: "manual" })).text();
  publicServer.removeListener("request", listener);
  t("the Host header is still the name, not the pinned address", seenHost, `crm.test:${PORT}`);
}

// ---------------------------------------------------------------------------
// 6. The adapter's default transport is the pinned one
// ---------------------------------------------------------------------------

console.log("\nthe webhook adapter's default transport");
{
  // Nothing can be injected here — that is the point. `deliverWebhook` with no
  // `fetchImpl` must use `deliveryFetch()`, and the way to tell from the outside
  // is the failure text: only our resolver says "did not resolve to any
  // address". Node's own fetch says "fetch failed".
  const sentinel = "no-such-host.invalid";
  let hijacked = false;
  try {
    await realLookup(sentinel);
    hijacked = true;
  } catch {
    hijacked = false;
  }

  if (hijacked) {
    // A resolver that answers for .invalid (an ISP hijacking NXDOMAIN) would
    // make this assertion meaningless. Say so rather than passing quietly.
    console.log(`  SKIP  ${sentinel} resolves on this machine, so the default-transport check cannot run`);
  } else {
    const previous = process.env.ALLOW_INSECURE_DESTINATIONS;
    process.env.ALLOW_INSECURE_DESTINATIONS = "1";
    try {
      const result = await deliverWebhook({
        destinationName: "CRM intake",
        payload: buildPayload(sampleSource({ publicId: "ep_abc123", name: "Contact form" }), {
          id: "dlv_fixed",
          attempt: 1,
          sentAt: new Date("2026-08-31T12:00:00.000Z"),
          test: false,
        }),
        config: { url: `http://${sentinel}/hook`, secret: "whsec_test_secret_that_is_long_enough" },
      });
      ok("the delivery failed", !result.ok);
      ok(
        "...through our pinned transport, not the global fetch",
        /did not resolve to any address/.test(
          `${result.error ?? ""} ${JSON.stringify(result.responseBody ?? "")}`,
        ),
        result.error,
      );
    } finally {
      if (previous === undefined) delete process.env.ALLOW_INSECURE_DESTINATIONS;
      else process.env.ALLOW_INSECURE_DESTINATIONS = previous;
    }
  }
}

// ---------------------------------------------------------------------------
// 7. The real rules, unnarrowed
// ---------------------------------------------------------------------------

console.log("\nthe default rules");
{
  // Everything above narrows `isBlockedAddress` so a loopback can play the
  // public internet. With the real predicate, the metadata address is refused
  // by resolution alone — no connection is attempted, which is why this file
  // never sends a packet to 169.254.169.254.
  const metadata = fixedResolver({ "rebind.test": "169.254.169.254" });
  const error = await errorOf(() =>
    resolveAndVerify("rebind.test", { lookupImpl: metadata.lookupImpl }),
  );
  t("a name resolving to the metadata service is refused", (error as PinnedFetchError)?.code, "blocked_address");

  const loopback = fixedResolver({ "rebind.test": "127.0.0.1" });
  const loopbackError = await errorOf(() =>
    resolveAndVerify("rebind.test", { lookupImpl: loopback.lookupImpl }),
  );
  t("...and so is one resolving to loopback", (loopbackError as PinnedFetchError)?.code, "blocked_address");

  const ipv6Loopback = fixedResolver({ "rebind.test": "::1" });
  const ipv6Error = await errorOf(() =>
    resolveAndVerify("rebind.test", { lookupImpl: ipv6Loopback.lookupImpl }),
  );
  t("...and IPv6 loopback", (ipv6Error as PinnedFetchError)?.code, "blocked_address");

  const publicName = fixedResolver({ "rebind.test": "93.184.216.34" });
  const allowed = await resolveAndVerify("rebind.test", { lookupImpl: publicName.lookupImpl });
  t("a public address is allowed", allowed, [{ address: "93.184.216.34", family: 4 }]);

  // Following a redirect is a bypass waiting to happen, so the transport
  // refuses to be asked for one.
  const followError = await errorOf(() =>
    createPinnedFetch({ lookupImpl: publicName.lookupImpl })("http://rebind.test/", {
      redirect: "follow",
    }),
  );
  ok("the transport refuses to follow redirects", followError instanceof PinnedFetchError, followError);
}

publicServer.close();
internalServer.close();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
