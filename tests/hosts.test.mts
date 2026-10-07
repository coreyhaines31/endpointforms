/**
 * Which surface answers on which host (src/lib/hosts.ts, docs/05 §4.4).
 *
 * The cases that matter most are the refusals: a hosted form must never render
 * on the marketing apex, where our ad pixels run, and the signed-in app must
 * never answer on the render domain, where customer markup runs. Those are
 * asserted as redirects, so each one is a positive claim about where the
 * request went, not an absence.
 *
 * The second group is the hosts we do not recognise. localhost, a preview
 * deployment and a self-hosted install must keep serving everything, or this
 * would take down every environment that is not production.
 */

import { decideHost, type HostConfig } from "../src/lib/hosts.ts";

const config: HostConfig = {
  siteUrl: "https://endpointforms.com",
  appUrl: "https://app.endpointforms.com",
  renderDomain: "endpointforms.app",
};

let pass = 0;
let fail = 0;

function check(name: string, host: string | null, path: string, want: string, search = "") {
  const decision = decideHost(host, path, search, config);
  const got =
    decision.action === "serve" ? "serve" : `${decision.status} ${decision.location}`;
  if (got === want) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}\n        want ${want}\n        got  ${got}`);
  }
}

console.log("\nsite: endpointforms.com");
check("marketing page is served", "endpointforms.com", "/features", "serve");
check("home is served", "endpointforms.com", "/", "serve");
check("www is the site too", "www.endpointforms.com", "/tools", "serve");
check(
  "a hosted form goes to the render domain",
  "endpointforms.com",
  "/f/abc123def456",
  "308 https://endpointforms.app/f/abc123def456",
);
check(
  "and keeps its query string",
  "endpointforms.com",
  "/f/abc123def456",
  "308 https://endpointforms.app/f/abc123def456?ef_variant=b",
  "?ef_variant=b",
);
check("the embed script goes to the render domain", "endpointforms.com", "/embed.js", "308 https://endpointforms.app/embed.js");
check("the app goes to the app host", "endpointforms.com", "/app/acme", "308 https://app.endpointforms.com/app/acme");
check("login goes to the app host", "endpointforms.com", "/login", "308 https://app.endpointforms.com/login?next=%2Fapp", "?next=%2Fapp");
check("signup goes to the app host", "endpointforms.com", "/signup", "308 https://app.endpointforms.com/signup");
check("/features is not /f", "endpointforms.com", "/features/agent-forms", "serve");
check("/applications would not be /app", "endpointforms.com", "/applications", "serve");
check("ingest still answers — existing posts must land", "endpointforms.com", "/e/abc123def456", "serve");
check("the API still answers", "endpointforms.com", "/api/v1/outcomes", "serve");
check("assets are served", "endpointforms.com", "/logo.svg", "serve");

console.log("\napp: app.endpointforms.com");
check("the app is served", "app.endpointforms.com", "/app/acme/submissions", "serve");
check("login is served", "app.endpointforms.com", "/login", "serve");
check("auth API is served", "app.endpointforms.com", "/api/auth/session", "serve");
check("root goes into the app", "app.endpointforms.com", "/", "307 https://app.endpointforms.com/app");
check("marketing goes to the site", "app.endpointforms.com", "/features", "308 https://endpointforms.com/features");
check("a hosted form goes to the render domain", "app.endpointforms.com", "/f/abc123def456", "308 https://endpointforms.app/f/abc123def456");

console.log("\nrender: endpointforms.app and workspaces");
check("a hosted form is served", "endpointforms.app", "/f/abc123def456", "serve");
check("on a workspace subdomain too", "acme.endpointforms.app", "/f/abc123def456/thanks", "serve");
check("the embed script is served", "endpointforms.app", "/embed.js", "serve");
check("ingest is served", "acme.endpointforms.app", "/e/abc123def456/mcp", "serve");
check("root goes to the site", "endpointforms.app", "/", "308 https://endpointforms.com/");
check("a workspace root goes to the site", "acme.endpointforms.app", "/", "308 https://endpointforms.com/");
check("marketing goes to the site", "endpointforms.app", "/features", "308 https://endpointforms.com/features");
check("the app never answers here", "endpointforms.app", "/app/acme", "308 https://app.endpointforms.com/app/acme");
check("nor on a workspace subdomain", "acme.endpointforms.app", "/login", "308 https://app.endpointforms.com/login");

console.log("\nhost header shapes");
check("a port is ignored", "endpointforms.com:443", "/f/abc123def456", "308 https://endpointforms.app/f/abc123def456");
check("case is ignored", "EndpointForms.App", "/app", "308 https://app.endpointforms.com/app");
check("a trailing dot is ignored", "endpointforms.app.", "/app", "308 https://app.endpointforms.com/app");
check(
  "a trailing slash in a configured URL does not double up",
  "endpointforms.app",
  "/features",
  "308 https://endpointforms.com/features",
);

console.log("\nhosts we do not recognise serve everything");
check("localhost", "localhost:3000", "/app/acme", "serve");
check("loopback form", "127.0.0.1:4001", "/f/abc123def456", "serve");
check("a preview deployment", "endpointforms-git-x-coreys-apps.vercel.app", "/app", "serve");
check("no host header", null, "/app", "serve");
check("a look-alike is not the render domain", "evilendpointforms.app", "/app", "serve");
check("a look-alike is not the site", "notendpointforms.com", "/f/abc123def456", "serve");

const slashed = decideHost("endpointforms.app", "/about", "", {
  ...config,
  siteUrl: "https://endpointforms.com/",
});
const slashedOk = slashed.action === "redirect" && slashed.location === "https://endpointforms.com/about";
if (slashedOk) {
  pass += 1;
  console.log("  PASS  a configured site URL with a trailing slash");
} else {
  fail += 1;
  console.log("  FAIL  a configured site URL with a trailing slash", slashed);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
