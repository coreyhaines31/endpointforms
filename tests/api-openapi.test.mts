/**
 * The OpenAPI document cannot drift from the API it describes (#133).
 *
 * Three ways it could: an operation in `src/lib/api/rest.ts` that the document
 * never mentions, an operationId in the document that names nothing, and a
 * documented path with no route file (or a route file that does not export the
 * documented method). Each is checked, and the check itself is shown to fire.
 *
 * No database.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { openApiDocument } from "../src/lib/api/openapi.ts";
import { OPERATIONS } from "../src/lib/api/rest.ts";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

type Doc = ReturnType<typeof openApiDocument>;

function documented(doc: Doc): { operationId: string; path: string; method: string }[] {
  const out: { operationId: string; path: string; method: string }[] = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const operation = (item as Record<string, { operationId?: string }>)[method];
      if (operation?.operationId) out.push({ operationId: operation.operationId, path, method });
    }
  }
  return out;
}

function routeFile(path: string): string {
  return join("src/app/api/v1", path.replace(/\{id\}/g, "[id]"), "route.ts");
}

function problems(doc: Doc, operations: readonly string[]): string[] {
  const found: string[] = [];
  const ops = documented(doc);
  const ids = ops.map((o) => o.operationId);

  for (const name of operations) if (!ids.includes(name)) found.push(`undocumented operation ${name}`);
  for (const id of ids) if (!operations.includes(id)) found.push(`documented operation ${id} does not exist`);
  if (new Set(ids).size !== ids.length) found.push("duplicate operationId");

  for (const { path, method, operationId } of ops) {
    const file = routeFile(path);
    if (!existsSync(file)) {
      found.push(`no route file for ${path}`);
      continue;
    }
    const source = readFileSync(file, "utf8");
    if (!new RegExp(`export async function ${method.toUpperCase()}\\b`).test(source)) {
      found.push(`${file} does not export ${method.toUpperCase()}`);
    }
    if (!source.includes(`"${operationId}"`)) found.push(`${file} does not call ${operationId}`);
  }
  return found;
}

const doc = openApiDocument("https://app.test");
const names = Object.keys(OPERATIONS);

console.log("\nopenapi");
ok("is OpenAPI 3.1", doc.openapi === "3.1.0");
ok("points at /api/v1 on the app host", doc.servers[0]?.url === "https://app.test/api/v1", doc.servers);
ok("describes every operation, and only those, each with a route file", problems(doc, names).length === 0, problems(doc, names));
ok("every operation names the scope it needs", documented(doc).every(({ path, method }) => {
  const operation = (doc.paths as Record<string, Record<string, { "x-required-scope"?: string }>>)[path][method];
  return typeof operation["x-required-scope"] === "string";
}));

// Positive controls: the checker can actually find each kind of drift.
ok("control: an operation missing from the document is caught", problems(doc, [...names, "listWidgets"]).some((p) => p.includes("listWidgets")));
const broken = structuredClone(doc) as Doc & { paths: Record<string, unknown> };
broken.paths["/widgets"] = { get: { operationId: "listEndpoints" } };
ok("control: a path with no route file is caught", problems(broken, names).some((p) => p.includes("/widgets")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
