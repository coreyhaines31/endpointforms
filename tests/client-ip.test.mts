/**
 * Which forwarded header may be believed, and when.
 *
 * A forwarded header is a claim by whoever is upstream. With nothing
 * trustworthy in front of the app, that "whoever" is the caller.
 *
 * Demonstrated before the fix, against a local server: 25 submissions each
 * carrying a distinct spoofed `X-Forwarded-For` were all accepted, while the
 * identical 25 without the header hit a 429 at request 21. The limiter was
 * working perfectly; the identity it was handed was forged. That is the shape
 * of the bug — not a broken limit, a trusted lie.
 *
 * The case that matters most is the second assertion: **on Vercel a spoofed
 * `x-forwarded-for` must be ignored**, because Vercel sets its own header and a
 * caller can freely send that one. Reading both would have quietly reinstated
 * the whole bypass on the deployment that actually serves customers.
 */

import { trustedClientIp } from "../src/lib/net/client-ip.ts";

const REAL = "203.0.113.9";
const SPOOF = "198.51.100.1";

let pass = 0;
let fail = 0;

const check = (name: string, got: string | null, want: string | null) => {
  if (got === want) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}`);
    console.log(`        got ${got ?? "null"}, want ${want ?? "null"}`);
  }
};

const headers = (o: Record<string, string>) => new Headers(o);

function withEnv(env: Record<string, string | undefined>, run: () => void) {
  const before = { VERCEL: process.env.VERCEL, TRUST_PROXY_HEADERS: process.env.TRUST_PROXY_HEADERS };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    run();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

console.log("\nON VERCEL — only Vercel's own header is believed\n");

withEnv({ VERCEL: "1", TRUST_PROXY_HEADERS: undefined }, () => {
  check(
    "uses x-vercel-forwarded-for",
    trustedClientIp(headers({ "x-vercel-forwarded-for": REAL, "x-forwarded-for": SPOOF })),
    REAL,
  );
  // The one that reinstates the bypass if it regresses.
  check(
    "ignores a spoofed x-forwarded-for entirely",
    trustedClientIp(headers({ "x-forwarded-for": SPOOF })),
    null,
  );
  check(
    "ignores cf-connecting-ip",
    trustedClientIp(headers({ "cf-connecting-ip": SPOOF })),
    null,
  );
  check(
    "takes the first entry of a chain",
    trustedClientIp(headers({ "x-vercel-forwarded-for": `${REAL}, 10.0.0.1` })),
    REAL,
  );
});

console.log("\nSELF-HOST WITH NO OPT-IN — nothing is believed\n");

withEnv({ VERCEL: undefined, TRUST_PROXY_HEADERS: undefined }, () => {
  for (const header of ["x-forwarded-for", "cf-connecting-ip", "x-real-ip"]) {
    check(`ignores ${header}`, trustedClientIp(headers({ [header]: SPOOF })), null);
  }
  check("no headers at all is null", trustedClientIp(headers({})), null);
});

console.log("\nSELF-HOST BEHIND A DECLARED PROXY — believed on purpose\n");

withEnv({ VERCEL: undefined, TRUST_PROXY_HEADERS: "1" }, () => {
  check("believes x-forwarded-for", trustedClientIp(headers({ "x-forwarded-for": REAL })), REAL);
  check("believes cf-connecting-ip", trustedClientIp(headers({ "cf-connecting-ip": REAL })), REAL);
  check(
    "prefers Vercel's header when both are present",
    trustedClientIp(headers({ "x-vercel-forwarded-for": REAL, "x-forwarded-for": SPOOF })),
    REAL,
  );
});

withEnv({ VERCEL: undefined, TRUST_PROXY_HEADERS: "true" }, () => {
  check('"true" also opts in', trustedClientIp(headers({ "x-forwarded-for": REAL })), REAL);
});

withEnv({ VERCEL: undefined, TRUST_PROXY_HEADERS: "0" }, () => {
  check('"0" does not opt in', trustedClientIp(headers({ "x-forwarded-for": SPOOF })), null);
});

console.log("\nBOTH CALLERS USE THE SAME RESOLVER\n");

// Two copies of this logic existed and both had the flaw. If either grows its
// own header list again, one of these goes stale without anything failing.
const { clientIp } = await import("../src/lib/ingest/client.ts");
const { clientIpFromHeaders } = await import("../src/lib/auth/rate-limit.ts");

withEnv({ VERCEL: undefined, TRUST_PROXY_HEADERS: undefined }, () => {
  check("ingest ignores a spoofed header", clientIp(headers({ "x-forwarded-for": SPOOF })), null);
  check(
    "auth ignores a spoofed header",
    clientIpFromHeaders(headers({ "x-forwarded-for": SPOOF })),
    null,
  );
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
