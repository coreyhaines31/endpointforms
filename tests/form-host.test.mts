/**
 * Which hosts a workspace's hosted form answers on (src/lib/render/host.ts, #109).
 *
 * The case this file exists for is the refusal: `other.<render-domain>` must not
 * serve northwind's form. It is asserted as `false` next to the matching host
 * asserted as `true` for the same form, so the refusal is a difference between
 * two answers rather than a lone negative that a helper returning `false` for
 * everything would also pass.
 *
 * The second group is the hosts that must never refuse: the bare render domain,
 * which embeds already shipped point at, and every host we do not recognise.
 */

import { formAnswersOnHost } from "../src/lib/render/host.ts";

const RENDER = "endpointforms.app";

let pass = 0;
let fail = 0;

function check(name: string, host: string | null, slug: string, want: boolean, render = RENDER) {
  const got = formAnswersOnHost(host, slug, render);
  if (got === want) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}\n        want ${want}\n        got  ${got}`);
  }
}

console.log("\nthe owning workspace's subdomain");
check("matching subdomain serves", "northwind.endpointforms.app", "northwind", true);
check("uppercase host serves", "NorthWind.EndpointForms.App", "northwind", true);
check("with a port serves", "northwind.endpointforms.app:443", "northwind", true);
check("with a trailing dot serves", "northwind.endpointforms.app.", "northwind", true);
check("with surrounding whitespace serves", "  northwind.endpointforms.app ", "northwind", true);

console.log("\nanother workspace's subdomain");
check("a different slug refuses", "other.endpointforms.app", "northwind", false);
check("a different slug with a port refuses", "other.endpointforms.app:3000", "northwind", false);
check("a different slug with a trailing dot refuses", "OTHER.endpointforms.app.", "northwind", false);
check("a slug that merely starts the same refuses", "northwind2.endpointforms.app", "northwind", false);
check("a slug that is a prefix refuses", "north.endpointforms.app", "northwind", false);
check("two labels deep refuses", "northwind.other.endpointforms.app", "northwind", false);
check("two labels ending in the slug refuses", "other.northwind.endpointforms.app", "northwind", false);
check("www refuses", "www.endpointforms.app", "northwind", false);

console.log("\nthe bare render domain serves every form");
check("bare", "endpointforms.app", "northwind", true);
check("bare with a port", "endpointforms.app:443", "northwind", true);
check("bare uppercase with a trailing dot", "ENDPOINTFORMS.APP.", "northwind", true);

console.log("\nhosts we do not recognise serve every form");
check("localhost", "localhost:3000", "northwind", true);
check("127.0.0.1", "127.0.0.1:3000", "northwind", true);
check("a preview deployment", "endpointforms-git-fix-abc.vercel.app", "northwind", true);
check("a self-hosted install", "forms.example.com", "northwind", true);
check("a lookalike that only ends with the render domain's text", "otherendpointforms.app", "northwind", true);
check("the marketing apex", "endpointforms.com", "northwind", true);
check("a missing host", null, "northwind", true);
check("an empty host", "", "northwind", true);

console.log("\na render domain configured differently");
check("custom render domain matches", "northwind.forms.example.com", "northwind", true, "forms.example.com");
check("custom render domain mismatch refuses", "other.forms.example.com", "northwind", false, "forms.example.com");
check("custom render domain in uppercase", "other.forms.example.com", "northwind", false, "Forms.Example.com");
check("the default domain is unrecognised under a custom one", "other.endpointforms.app", "northwind", true, "forms.example.com");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
