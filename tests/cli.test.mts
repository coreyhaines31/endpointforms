/**
 * The `endpointforms` CLI (#133), end to end against the real API.
 *
 * A local HTTP server routes `/api/v1/*` to the real REST handler and
 * `/api/mcp` to the real account MCP server, over a real database. The CLI's
 * `run` is called in-process with that server as its API URL, so this proves
 * the CLI, the REST surface and the core agree — not that the CLI agrees with
 * a mock of them.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq, inArray, like } from "drizzle-orm";

import { run, type Io } from "../packages/cli/src/commands.ts";
import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { newEndpointPublicId, newId, newSubmissionPublicId } from "../src/db/ids.ts";
import { emailCodes, endpoints, memberships, submissions, users, workspaces } from "../src/db/schema.ts";
import { handleAccountMcpRequest } from "../src/lib/account/mcp.ts";
import { ALL_SCOPES } from "../src/lib/account/scopes.ts";
import { handleRest, type OperationName } from "../src/lib/api/rest.ts";
import type { MailMessage, MailResult } from "../src/lib/destinations/mail.ts";
import { resetRateLimits } from "../src/lib/ingest/rate-limit.ts";
import { createVerdictApiKey } from "../src/lib/verdict/key-store.ts";

let pass = 0;
let fail = 0;
const t = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (good) pass++;
  else fail++;
  console.log(`  ${good ? "PASS" : "FAIL"}  ${name}`);
  if (!good) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};
const ok = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

const SLUGS = ["cli-test-alpha", "cli-test-beta"];
const DOMAIN = "cli-test.test";

// ---------------------------------------------------------------------------
// A real server in front of the real handlers
// ---------------------------------------------------------------------------

const ROUTES: [string, RegExp, OperationName][] = [
  ["GET", /^\/api\/v1\/me$/, "whoami"],
  ["GET", /^\/api\/v1\/endpoints$/, "listEndpoints"],
  ["POST", /^\/api\/v1\/endpoints$/, "createEndpoint"],
  ["GET", /^\/api\/v1\/endpoints\/([^/]+)$/, "getEndpoint"],
  ["GET", /^\/api\/v1\/endpoints\/([^/]+)\/form$/, "getFormSchema"],
  ["PUT", /^\/api\/v1\/endpoints\/([^/]+)\/form$/, "setFormSchema"],
  ["GET", /^\/api\/v1\/submissions$/, "listSubmissions"],
  ["GET", /^\/api\/v1\/submissions\/export$/, "exportSubmissions"],
  ["GET", /^\/api\/v1\/submissions\/([^/]+)$/, "getSubmission"],
];

const sent: MailMessage[] = [];
async function sink(message: MailMessage): Promise<MailResult> {
  sent.push(message);
  return { ok: true, status: 200, body: "{}", error: null, configuration: false };
}

async function toRequest(req: IncomingMessage, base: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  return new Request(new URL(req.url ?? "/", base), { method: req.method, headers, body });
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

const options = { renderDomain: "forms.test", appUrl: "https://app.test" };
let requests: { method: string; path: string; auth: string | null }[] = [];

const server = createServer(async (req, res) => {
  const base = `http://${req.headers.host}`;
  const request = await toRequest(req, base);
  const path = new URL(request.url).pathname;
  requests.push({ method: request.method, path, auth: request.headers.get("authorization") });

  if (path === "/api/mcp") return send(res, await handleAccountMcpRequest(request, { send: sink, ...options }));
  for (const [method, pattern, name] of ROUTES) {
    const match = pattern.exec(path);
    if (match && method === request.method) {
      return send(res, await handleRest(request, name, match[1] ? { id: decodeURIComponent(match[1]) } : {}, options));
    }
  }
  res.statusCode = 404;
  res.end();
});

// ---------------------------------------------------------------------------

type Result = { code: number; out: string; err: string };

let apiUrl = "";
let configDir = "";

async function cli(args: string[], extra: { env?: Record<string, string>; answers?: (string | (() => string))[]; stdin?: string; tty?: boolean } = {}): Promise<Result> {
  let out = "";
  let err = "";
  const answers = [...(extra.answers ?? [])];
  const io: Io = {
    env: { ENDPOINTFORMS_CONFIG_DIR: configDir, ENDPOINTFORMS_API_URL: apiUrl, ...extra.env },
    out: (text) => (out += text),
    err: (text) => (err += text),
    readStdin: async () => extra.stdin ?? "",
    stdoutIsTTY: extra.tty ?? false,
    prompt: async () => {
      const next = answers.shift();
      return typeof next === "function" ? next() : (next ?? "");
    },
  };
  const code = await run(args, io);
  return { code, out, err };
}

async function cleanup() {
  await unsafeDb.delete(workspaces).where(inArray(workspaces.slug, [...SLUGS, "cli-signup-co"]));
  const testUsers = await unsafeDb.select({ id: users.id }).from(users).where(like(users.email, `%@${DOMAIN}`));
  if (testUsers.length > 0) {
    const owned = await unsafeDb.select({ workspaceId: memberships.workspaceId }).from(memberships).where(inArray(memberships.userId, testUsers.map((u) => u.id)));
    if (owned.length > 0) await unsafeDb.delete(workspaces).where(inArray(workspaces.id, owned.map((m) => m.workspaceId)));
    await unsafeDb.delete(users).where(inArray(users.id, testUsers.map((u) => u.id)));
  }
  await unsafeDb.delete(emailCodes).where(like(emailCodes.email, `%@${DOMAIN}`));
}

async function fixture(index: number, count: number) {
  const workspaceId = newId();
  const ownerId = newId();
  const endpointId = newId();
  const endpointPublicId = newEndpointPublicId();
  await unsafeDb.insert(workspaces).values({ id: workspaceId, slug: SLUGS[index], name: SLUGS[index] });
  await unsafeDb.insert(users).values({ id: ownerId, email: `owner${index}@${DOMAIN}` });
  await unsafeDb.insert(memberships).values({ id: newId(), workspaceId, userId: ownerId, role: "owner" });
  await unsafeDb.insert(endpoints).values({ id: endpointId, workspaceId, publicId: endpointPublicId, name: "Contact" });
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const publicId = newSubmissionPublicId();
    ids.push(publicId);
    await unsafeDb.insert(submissions).values({
      id: newId(),
      workspaceId,
      endpointId,
      publicId,
      values: { email: `lead${i}@example.com`, note: `ws${index}` },
      verdict: i === 0 ? "won" : "awaiting",
      submittedAt: new Date(Date.UTC(2026, 3, 1, 0, 0, i)),
    });
  }
  const key = await createVerdictApiKey({ workspaceId, label: "cli", createdByUserId: ownerId, scopes: ALL_SCOPES, createdVia: "mcp" });
  return { endpointPublicId, ids, key: key.key };
}

async function main() {
  await cleanup();
  resetRateLimits();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  configDir = await mkdtemp(join(tmpdir(), "endpointforms-cli-"));

  const a = await fixture(0, 5);
  const b = await fixture(1, 1);

  console.log("\nusage");
  {
    t("no command prints help and exits 2", (await cli([])).code, 2);
    ok("--help exits 0", (await cli(["--help"])).code === 0);
    t("an unknown command is a usage error", (await cli(["frobnicate"])).code, 2);
    t("an unknown flag is a usage error", (await cli(["whoami", "--nope"])).code, 2);
    const notIn = await cli(["whoami"]);
    t("logged out is a usage error", [notIn.code, /login/.test(notIn.err)], [2, true]);
    const insecure = await cli(["whoami", "--api-url", "http://example.com"], { env: { ENDPOINTFORMS_API_KEY: a.key } });
    t("a key is never sent over plain http to a remote host", [insecure.code, /https/.test(insecure.err)], [2, true]);
  }

  console.log("\nlogin");
  {
    requests = [];
    const bad = await cli(["login", "--key", "efv2.aaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);
    t("a bad key is refused with exit 1", bad.code, 1);
    let configured = true;
    try {
      await stat(join(configDir, "config.json"));
    } catch {
      configured = false;
    }
    t("and nothing is saved", configured, false);

    const good = await cli(["login", "--key", a.key, "--json"]);
    t("a good key logs in", good.code, 0);
    t("and names the workspace", JSON.parse(good.out).workspace.slug, SLUGS[0]);
    const info = await stat(join(configDir, "config.json"));
    t("the config file is private (0600)", (info.mode & 0o777).toString(8), "600");
    t("and holds the key", JSON.parse(await readFile(join(configDir, "config.json"), "utf8")).apiKey, a.key);
    ok("the key went as a bearer header", requests.some((r) => r.auth === `Bearer ${a.key}`));

    const me = await cli(["whoami"]);
    t("whoami uses the saved key", [me.code, me.out.includes(SLUGS[0])], [0, true]);
    const env = await cli(["whoami", "--json"], { env: { ENDPOINTFORMS_API_KEY: b.key } });
    t("ENDPOINTFORMS_API_KEY overrides it", JSON.parse(env.out).workspace.slug, SLUGS[1]);

    // The email-code flow, through the real account MCP server.
    const email = `newperson@${DOMAIN}`;
    const isolatedDir = await mkdtemp(join(tmpdir(), "endpointforms-cli-email-"));
    const viaEmail = await cli(["login", "--email", email, "--json"], {
      env: { ENDPOINTFORMS_CONFIG_DIR: isolatedDir },
      answers: [
        () => {
          const message = [...sent].reverse().find((m) => m.to[0] === email);
          return message?.subject.match(/^(\d{6}) /)?.[1] ?? "";
        },
      ],
    });
    t("login --email sends a code, takes it, and logs in", viaEmail.code, 0);
    ok("with a key saved", JSON.parse(await readFile(join(isolatedDir, "config.json"), "utf8")).apiKey?.startsWith("efv2."));
  }

  console.log("\nendpoints");
  {
    const ls = await cli(["endpoints", "ls", "--json"]);
    t("ls --json lists the workspace's endpoints", JSON.parse(ls.out).map((e: { id: string }) => e.id), [a.endpointPublicId]);
    const human = await cli(["endpoints", "ls"]);
    ok("ls prints a table", human.out.startsWith("ID") && human.out.includes(a.endpointPublicId));
    const created = await cli(["endpoints", "create", "Demo request", "--json"]);
    const made = JSON.parse(created.out);
    t("create makes one", [created.code, made.name], [0, "Demo request"]);
    t("get reads it back", JSON.parse((await cli(["endpoints", "get", made.id, "--json"])).out).name, "Demo request");
    const other = await cli(["endpoints", "get", b.endpointPublicId, "--json"]);
    t("another workspace's endpoint is not found (exit 1)", [other.code, JSON.parse(other.err).error.code], [1, "not_found"]);
    t(
      "positive control: its owner can read it",
      (await cli(["endpoints", "get", b.endpointPublicId], { env: { ENDPOINTFORMS_API_KEY: b.key } })).code,
      0,
    );
  }

  console.log("\nsubmissions");
  {
    const one = JSON.parse((await cli(["submissions", "ls", "--limit", "2", "--json"])).out);
    t("ls --limit 2 returns a page", one.data.length, 2);
    ok("with a cursor", typeof one.next_cursor === "string");
    const next = JSON.parse((await cli(["submissions", "ls", "--limit", "2", "--cursor", one.next_cursor, "--json"])).out);
    t("--cursor fetches the next page", next.data.length, 2);
    const all = JSON.parse((await cli(["submissions", "ls", "--limit", "2", "--all", "--json"])).out);
    t("--all follows every page", all.data.map((s: { id: string }) => s.id), [...a.ids].reverse());
    t("and ends with no cursor", all.next_cursor, null);
    t("filters pass through", JSON.parse((await cli(["submissions", "ls", "--verdict", "won", "--json"])).out).data.length, 1);
    const bad = await cli(["submissions", "ls", "--verdict", "maybe"]);
    t("a bad filter is the API's 400, exit 1", [bad.code, /invalid_request/.test(bad.err)], [1, true]);
    ok("the human table shows values", (await cli(["submissions", "ls"])).out.includes("email=lead"));
    t("get", JSON.parse((await cli(["submissions", "get", a.ids[0]])).out).id, a.ids[0]);
    ok("ls never shows another workspace's rows", !(await cli(["submissions", "ls", "--all", "--json"])).out.includes("ws1"));

    const csv = await cli(["submissions", "export"]);
    ok("export prints CSV", csv.code === 0 && csv.out.includes("submission_id") && csv.out.includes("lead4@example.com"));
    const file = join(configDir, "export.json");
    const toFile = await cli(["submissions", "export", "--format", "json", "--output", file]);
    t("export --output writes a file", toFile.code, 0);
    t("with every row", JSON.parse(await readFile(file, "utf8")).count, 5);
    t("privately (0600)", ((await stat(file)).mode & 0o777).toString(8), "600");
    const shared = join(configDir, "shared.csv");
    await writeFile(shared, "old", { mode: 0o644 });
    t("positive control: the existing file starts world-readable", ((await stat(shared)).mode & 0o777).toString(8), "644");
    t("exporting over it", (await cli(["submissions", "export", "--output", shared])).code, 0);
    t("leaves it private", ((await stat(shared)).mode & 0o777).toString(8), "600");
    ok("with the new contents", (await readFile(shared, "utf8")).includes("lead4@example.com"));

    // A stranger's submission carrying terminal escapes: OSC 52 (clipboard),
    // a carriage return, a newline, and a C1 CSI.
    const hostile = "\u001b]52;c;cHduZWQ=\u0007x\rFAKE\nrow\u009b31m";
    await unsafeDb.update(submissions).set({ values: { email: hostile } }).where(eq(submissions.publicId, a.ids[1]));
    const table = (await cli(["submissions", "ls"])).out;
    ok("the table shows escapes instead of obeying them", !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(table) && table.includes("\\u001b]52"), table);
    ok("and an embedded newline does not start a fake row", !table.includes("\nrow"));
    const detail = (await cli(["submissions", "get", a.ids[1]])).out;
    ok("submission get output carries no raw control characters", !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(detail));
    t("and is still the same JSON", JSON.parse(detail).values.email, hostile);
    const ttyCsv = (await cli(["submissions", "export"], { tty: true })).out;
    ok("export to a terminal escapes them too", !ttyCsv.includes("\u001b") && ttyCsv.includes("\\u001b"));
    const piped = (await cli(["submissions", "export"])).out;
    ok("positive control: piped, the export is byte-for-byte", piped.includes("\u001b]52"));
  }

  console.log("\nform");
  {
    const empty = await cli(["form", "get", a.endpointPublicId]);
    ok("get with no schema says so", empty.out.includes("no form schema"));
    const schemaFile = join(configDir, "schema.json");
    await writeFile(schemaFile, JSON.stringify({ formatVersion: 1, fields: [{ key: "email", type: "email", required: true }] }));
    const set = await cli(["form", "set", a.endpointPublicId, schemaFile, "--json"]);
    t("set publishes from a file", [set.code, JSON.parse(set.out).version, JSON.parse(set.out).active], [0, 1, true]);
    const got = await cli(["form", "get", a.endpointPublicId]);
    t("get prints the document, so it round-trips", JSON.parse(got.out).fields[0].key, "email");
    const draft = await cli(["form", "set", a.endpointPublicId, "-", "--draft", "--json"], { stdin: got.out });
    t("set - --draft reads stdin and saves a draft", [JSON.parse(draft.out).version, JSON.parse(draft.out).active], [2, false]);
    t("invalid JSON is a usage error", (await cli(["form", "set", a.endpointPublicId, "-"], { stdin: "{nope" })).code, 2);
    const invalid = await cli(["form", "set", a.endpointPublicId, "-"], { stdin: JSON.stringify({ fields: [{ key: "x", type: "nope" }] }) });
    t("an invalid schema is the API's 400", [invalid.code, /invalid_request/.test(invalid.err)], [1, true]);
    const missing = await cli(["form", "set", a.endpointPublicId, join(configDir, "does-not-exist.json"), "--json"]);
    t("a missing file is exit 1 with a JSON error under --json", [missing.code, JSON.parse(missing.err).error.code], [1, "file_error"]);
    const echoed = await cli(["form", "set", a.endpointPublicId, "-"], {
      stdin: JSON.stringify({ fields: [{ key: "c", type: "select", options: [{ value: "\u001b]52;c;eA==\u0007", label: "a" }, { value: "\u001b]52;c;eA==\u0007", label: "b" }] }] }),
    });
    t("positive control: the API's error quotes the bad value", [echoed.code, echoed.err.includes("52;c;eA==")], [1, true]);
    ok("but stderr carries no raw escape", !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(echoed.err), echoed.err);
  }

  console.log("\nlogout");
  {
    t("logout", (await cli(["logout"])).code, 0);
    t("and the saved key is gone", (await cli(["whoami"])).code, 2);
  }

  await cleanup();
  const [stray] = await unsafeDb.select().from(workspaces).where(eq(workspaces.slug, SLUGS[0]));
  ok("cleaned up", !stray);
  console.log(`\n${pass} passed, ${fail} failed`);
}

main()
  .catch((error) => {
    console.error(error);
    fail++;
  })
  .finally(async () => {
    server.close();
    await sqlClient.end();
    process.exit(fail > 0 ? 1 : 0);
  });
