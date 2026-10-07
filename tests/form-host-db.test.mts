/**
 * A hosted form answers only on its own workspace's subdomain (#109).
 *
 * `tests/form-host.test.mts` proves the host decision given a slug. This proves
 * the slug the routes hand it is the **owning** workspace's: two workspaces,
 * one form each, and every form/host pair decided the way the routes decide it
 * — `loadForm` for the page, submit and thank-you routes, `resolveEndpoint`
 * plus `workspaceSlugOf` for the step route.
 *
 * Each refusal sits next to an acceptance of the same form on its own
 * subdomain, so a lookup that returned nothing, or the wrong workspace for
 * every form, fails here rather than passing as a run of "refused" answers.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */

import { inArray } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { describeDatabase } from "../src/db/env.ts";
import { newEndpointPublicId, newId } from "../src/db/ids.ts";
import { endpoints, workspaces } from "../src/db/schema.ts";
import { resolveEndpoint } from "../src/lib/ingest/store.ts";
import { loadForm, workspaceSlugOf } from "../src/lib/render/form.ts";
import { formAnswersOnHost } from "../src/lib/render/host.ts";

const RENDER = "endpointforms.app";
const SLUGS = ["form-host-test-one", "form-host-test-two"] as const;

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const equal = JSON.stringify(got) === JSON.stringify(want);
  if (equal) pass++;
  else fail++;
  console.log(`  ${equal ? "PASS" : "FAIL"}  ${name}`);
  if (!equal) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

async function cleanup() {
  // Endpoints cascade with their workspace.
  await unsafeDb.delete(workspaces).where(inArray(workspaces.slug, [...SLUGS]));
}

async function createForm(slug: string): Promise<string> {
  const workspaceId = newId();
  const publicId = newEndpointPublicId();
  await unsafeDb.insert(workspaces).values({ id: workspaceId, slug, name: slug });
  await unsafeDb
    .insert(endpoints)
    .values({ id: newId(), workspaceId, publicId, name: `${slug} contact` });
  return publicId;
}

/** As the page, submit and thank-you routes decide it. */
async function viaLoadForm(publicId: string, host: string): Promise<string> {
  const form = await loadForm(publicId);
  if (form.status === "not_found") return "not_found";
  return formAnswersOnHost(host, form.workspaceSlug, RENDER) ? "serve" : "not_found";
}

/** As the step route decides it. */
async function viaResolveEndpoint(publicId: string, host: string): Promise<string> {
  const endpoint = await resolveEndpoint(publicId);
  const slug = await workspaceSlugOf(endpoint.workspaceId);
  if (slug === null) return "no_workspace";
  return formAnswersOnHost(host, slug, RENDER) ? "serve" : "not_found";
}

async function main() {
  console.log(`form host ownership against ${describeDatabase()}`);
  await cleanup();

  const [one, two] = SLUGS;
  const formOne = await createForm(one);
  const formTwo = await createForm(two);

  const loaded = await loadForm(formOne);
  t(
    "loadForm names the owning workspace",
    loaded.status === "not_found" ? null : loaded.workspaceSlug,
    one,
  );

  for (const [label, decide] of [
    ["loadForm", viaLoadForm],
    ["resolveEndpoint", viaResolveEndpoint],
  ] as const) {
    console.log(`\n${label}`);
    t("form one on its own subdomain is served", await decide(formOne, `${one}.${RENDER}`), "serve");
    t("form one on workspace two's subdomain is not found", await decide(formOne, `${two}.${RENDER}`), "not_found");
    t("form two on its own subdomain is served", await decide(formTwo, `${two}.${RENDER}`), "serve");
    t("form two on workspace one's subdomain is not found", await decide(formTwo, `${one}.${RENDER}`), "not_found");
    t("form one on the bare render domain is served", await decide(formOne, RENDER), "serve");
    t("form two on the bare render domain is served", await decide(formTwo, RENDER), "serve");
    t("form one on localhost is served", await decide(formOne, "127.0.0.1:3000"), "serve");
  }

  console.log("\nan id that does not exist");
  t("is not found on the bare render domain", await viaLoadForm("nope-not-a-form", RENDER), "not_found");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await sqlClient.end();
  });
