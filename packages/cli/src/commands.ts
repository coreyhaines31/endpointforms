import { randomBytes } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { ApiFailure, callAccountTool, createClient, type Client, type Fetch } from "./client.ts";
import {
  clearConfig,
  DEFAULT_API_URL,
  readConfig,
  resolveApiUrl,
  UsageError,
  writeConfig,
  type Env,
} from "./config.ts";

/**
 * Every command. `run` takes its whole world as arguments — argv, env, the
 * streams, `fetch` — so the tests drive the real CLI without a subprocess.
 */

export type Io = {
  env: Env;
  out: (text: string) => void;
  err: (text: string) => void;
  /** Reads all of stdin, for `form set -`. */
  readStdin: () => Promise<string>;
  /** Asks one question on the terminal, for `login`. */
  prompt: (question: string) => Promise<string>;
  /** True when stdout is a terminal, so raw file output is made safe to display. */
  stdoutIsTTY?: boolean;
  fetch?: Fetch;
};

export const HELP = `endpointforms — endpoints, form schemas and submissions from the command line

Usage
  endpointforms login [--key <efv2.key>] [--email <you@work.com>]
  endpointforms logout
  endpointforms whoami
  endpointforms endpoints ls
  endpointforms endpoints get <endpoint-id>
  endpointforms endpoints create <name>
  endpointforms submissions ls [filters] [--limit n] [--cursor c] [--all]
  endpointforms submissions get <submission-id>
  endpointforms submissions export [filters] [--format csv|json] [--output <file>]
  endpointforms form get <endpoint-id>
  endpointforms form set <endpoint-id> <schema.json | -> [--mode warn|strict] [--draft]

Filters
  --endpoint <id>  --origin human,agent,unverified  --verdict won,lost,disqualified,awaiting
  --spam clear,flagged,not_spam,confirmed_spam  --from <date>  --to <date>  --q <text>

Everywhere
  --json            machine-readable output
  --api-url <url>   defaults to ${DEFAULT_API_URL} (or ENDPOINTFORMS_API_URL)
  ENDPOINTFORMS_API_KEY overrides the saved key.
`;

const OPTIONS = {
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  "api-url": { type: "string" },
  key: { type: "string" },
  email: { type: "string" },
  endpoint: { type: "string" },
  origin: { type: "string" },
  verdict: { type: "string" },
  spam: { type: "string" },
  from: { type: "string" },
  to: { type: "string" },
  q: { type: "string" },
  limit: { type: "string" },
  cursor: { type: "string" },
  all: { type: "boolean" },
  format: { type: "string" },
  output: { type: "string", short: "o" },
  mode: { type: "string" },
  draft: { type: "boolean" },
} as const;

type Values = ReturnType<typeof parse>["values"];

function parse(argv: string[]) {
  try {
    return parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

const FILTERS = ["endpoint", "origin", "verdict", "spam", "from", "to", "q"] as const;

function filterQuery(values: Values): URLSearchParams {
  const query = new URLSearchParams();
  for (const name of FILTERS) {
    const value = values[name];
    if (typeof value === "string" && value !== "") query.set(name, value);
  }
  return query;
}

type Context = { io: Io; values: Values; apiUrl: string; json: boolean };

async function authed(ctx: Context): Promise<Client> {
  const key = ctx.io.env.ENDPOINTFORMS_API_KEY || (await readConfig(ctx.io.env)).apiKey;
  if (!key) throw new UsageError("Not logged in. Run `endpointforms login` first, or set ENDPOINTFORMS_API_KEY.");
  return createClient(ctx.apiUrl, key, ctx.io.fetch);
}

/**
 * Submitted values are typed by strangers, and a terminal obeys escape
 * sequences in what it prints — an OSC 52 can rewrite the clipboard. So every
 * control character from the API is shown, not obeyed. `keep` lets our own
 * line breaks through.
 */
export function visible(text: string, keep: RegExp = /(?!)/): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, (c) =>
    keep.test(c) ? c : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * A CSV for a terminal: the record separators stay, and every control
 * character inside a quoted cell — a submitted `\r` or line break included —
 * is escaped, so a cell can neither overwrite the line nor fake a row.
 */
export function visibleCsv(text: string): string {
  let out = "";
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    out += !quoted && (c === "\r" || c === "\n") ? c : visible(c);
  }
  return out;
}

/**
 * JSON already escapes C0 controls; C1 (U+0080–U+009F) passes through, and
 * some terminals treat U+009B as CSI. Escaping it keeps the JSON identical.
 */
export function safeJson(data: unknown): string {
  return JSON.stringify(data, null, 2).replace(
    /[\u007f-\u009f]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function print(ctx: Context, data: unknown, human: () => string): void {
  ctx.io.out(ctx.json ? `${safeJson(data)}\n` : `${visible(human(), /\n/)}\n`);
}

function need(value: string | undefined, what: string): string {
  if (!value) throw new UsageError(`Missing ${what}. See \`endpointforms --help\`.`);
  return value;
}

type Endpoint = {
  id: string;
  name: string;
  archived: boolean;
  submission_count: number;
  awaiting_outcome_count: number;
  submit_url: string;
  dashboard_url: string;
};

type Submission = {
  id: string;
  submitted_at: string;
  endpoint: { id: string; name: string };
  origin: string;
  spam: { state: string };
  outcome: { verdict: string };
  values: Record<string, unknown>;
};

function table(rows: string[][]): string {
  if (rows.length === 0) return "";
  rows = rows.map((row) => row.map((cell) => visible(cell)));
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => (row[i] ?? "").length)));
  return rows.map((row) => row.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd()).join("\n");
}

function summary(values: Record<string, unknown>): string {
  // Escaped before truncating, so a cut can never land inside a sequence.
  const preferred = ["email", "name", "message"];
  const keys = [...preferred.filter((k) => k in values), ...Object.keys(values).filter((k) => !preferred.includes(k))];
  const text = keys
    .slice(0, 2)
    .map((k) => visible(`${k}=${typeof values[k] === "string" ? values[k] : JSON.stringify(values[k])}`))
    .join(" ");
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/**
 * Writes a file of leads readable only by its owner — including when it
 * replaces one that was not: `mode` applies only to a file being created, so
 * the bytes go to a fresh 0600 file that is then renamed over the target.
 */
async function writePrivately(path: string, body: string): Promise<void> {
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, body, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

// ---------------------------------------------------------------------------

async function login(ctx: Context): Promise<void> {
  let key = ctx.values.key;

  if (!key) {
    const email = ctx.values.email || (await ctx.io.prompt("Work email: ")).trim();
    if (!email) throw new UsageError("An email address, or --key, is needed to log in.");
    await callAccountTool(ctx.apiUrl, "start_signup", { email }, ctx.io.fetch);
    ctx.io.err(`A 6-digit code is on its way to ${email}.\n`);
    const code = (await ctx.io.prompt("Code: ")).trim();
    const verified = await callAccountTool(ctx.apiUrl, "verify_signup", { email, code, client_name: "endpointforms CLI" }, ctx.io.fetch);
    if (typeof verified.api_key !== "string") throw new ApiFailure(0, "bad_response", "The server did not return a key.");
    key = verified.api_key;
  }

  // Prove the key before keeping it.
  const me = (await createClient(ctx.apiUrl, key, ctx.io.fetch).get("/me")) as { workspace: { slug: string }; scopes: string[] };
  const path = await writeConfig(ctx.io.env, {
    apiKey: key,
    ...(ctx.apiUrl !== DEFAULT_API_URL ? { apiUrl: ctx.apiUrl } : {}),
  });

  print(ctx, { ...me, config: path }, () => `Logged in to ${me.workspace.slug} (scopes: ${me.scopes.join(", ")}). Key saved to ${path}.`);
}

async function logout(ctx: Context): Promise<void> {
  await clearConfig(ctx.io.env);
  print(ctx, { logged_out: true }, () => "Logged out. The key still works until it is revoked in workspace settings.");
}

async function whoami(ctx: Context): Promise<void> {
  const me = (await (await authed(ctx)).get("/me")) as { workspace: { slug: string; name: string | null }; scopes: string[] };
  print(ctx, me, () => `${me.workspace.name ?? me.workspace.slug} (${me.workspace.slug})\nScopes: ${me.scopes.join(", ")}`);
}

async function endpoints(ctx: Context, sub: string | undefined, arg: string | undefined): Promise<void> {
  const client = await authed(ctx);
  switch (sub) {
    case "ls":
    case "list": {
      const rows = (await client.get("/endpoints")) as Endpoint[];
      print(ctx, rows, () =>
        rows.length === 0
          ? "No endpoints yet. Create one with `endpointforms endpoints create <name>`."
          : table([
              ["ID", "NAME", "SUBMISSIONS", "AWAITING", "STATUS"],
              ...rows.map((e) => [e.id, e.name, String(e.submission_count), String(e.awaiting_outcome_count), e.archived ? "archived" : "live"]),
            ]),
      );
      return;
    }
    case "get": {
      const e = (await client.get(`/endpoints/${encodeURIComponent(need(arg, "an endpoint id"))}`)) as Endpoint;
      print(ctx, e, () =>
        [`${e.name} (${e.id})${e.archived ? " — archived" : ""}`, `Submit URL: ${e.submit_url}`, `Submissions: ${e.submission_count} (${e.awaiting_outcome_count} awaiting an outcome)`, `Dashboard: ${e.dashboard_url}`].join("\n"),
      );
      return;
    }
    case "create": {
      const e = (await client.send("POST", "/endpoints", { name: need(arg, "a name") })) as Endpoint & { notifies: string | null };
      print(ctx, e, () =>
        [`Created ${e.name} (${e.id}).`, `Point a form's action at ${e.submit_url}`, e.notifies ? `Submissions are emailed to ${e.notifies}.` : ""].filter(Boolean).join("\n"),
      );
      return;
    }
    default:
      throw new UsageError("Usage: endpointforms endpoints ls | get <id> | create <name>");
  }
}

async function submissions(ctx: Context, sub: string | undefined, arg: string | undefined): Promise<void> {
  const client = await authed(ctx);
  switch (sub) {
    case "ls":
    case "list": {
      const query = filterQuery(ctx.values);
      if (ctx.values.limit) query.set("limit", ctx.values.limit);
      if (ctx.values.cursor) query.set("cursor", ctx.values.cursor);

      const rows: Submission[] = [];
      let next: string | null = null;
      do {
        if (next) query.set("cursor", next);
        const page = await client.getPage("/submissions", query);
        rows.push(...(page.data as Submission[]));
        next = page.next_cursor;
      } while (ctx.values.all && next);

      print(ctx, { data: rows, next_cursor: next }, () =>
        [
          rows.length === 0
            ? "No submissions match."
            : table([
                ["ID", "SUBMITTED", "ENDPOINT", "ORIGIN", "VERDICT", "SPAM", "VALUES"],
                ...rows.map((s) => [s.id, s.submitted_at.slice(0, 19).replace("T", " "), s.endpoint.name, s.origin, s.outcome.verdict, s.spam.state, summary(s.values)]),
              ]),
          next ? `\nMore: --cursor ${next}  (or --all)` : "",
        ].join(""),
      );
      return;
    }
    case "get": {
      const s = await client.get(`/submissions/${encodeURIComponent(need(arg, "a submission id"))}`);
      // The detail is nested and arbitrary; JSON is the honest human format too.
      ctx.io.out(`${safeJson(s)}\n`);
      return;
    }
    case "export": {
      const format = ctx.values.format ?? (ctx.json ? "json" : "csv");
      if (format !== "csv" && format !== "json") throw new UsageError("--format must be csv or json.");
      const query = filterQuery(ctx.values);
      query.set("format", format);
      const file = await client.download("/submissions/export", query);
      if (ctx.values.output) {
        await writePrivately(ctx.values.output, file.body);
        ctx.io.err(`Wrote ${file.count ?? "?"} submissions to ${ctx.values.output}${file.truncated ? " (truncated at the export limit; narrow the filters for the rest)" : ""}.\n`);
      } else {
        // Piped, the file is passed through untouched. On a terminal, its
        // control characters are shown rather than obeyed; line ends are kept.
        ctx.io.out(ctx.io.stdoutIsTTY ? (format === "csv" ? visibleCsv(file.body) : visible(file.body, /\n/)) : file.body);
        if (file.truncated) ctx.io.err("Export truncated at the export limit; narrow the filters for the rest.\n");
      }
      return;
    }
    default:
      throw new UsageError("Usage: endpointforms submissions ls | get <id> | export");
  }
}

async function form(ctx: Context, sub: string | undefined, endpointId: string | undefined, source: string | undefined): Promise<void> {
  const client = await authed(ctx);
  const path = `/endpoints/${encodeURIComponent(need(endpointId, "an endpoint id"))}/form`;
  switch (sub) {
    case "get": {
      const result = (await client.get(path)) as { schema: { version: number; mode: string; document: unknown } | null };
      if (ctx.json) {
        print(ctx, result, () => "");
      } else if (!result.schema) {
        ctx.io.out("This endpoint has no form schema; it accepts any field posted to it.\n");
      } else {
        // The document alone, so `form get id > schema.json` round-trips into `form set`.
        ctx.io.out(`${safeJson(result.schema.document)}\n`);
        ctx.io.err(`Version ${result.schema.version}, ${result.schema.mode} mode.\n`);
      }
      return;
    }
    case "set": {
      const file = need(source, "a schema file (or - for stdin)");
      const text = file === "-" ? await ctx.io.readStdin() : await readFile(file, "utf8");
      let document: unknown;
      try {
        document = JSON.parse(text);
      } catch {
        throw new UsageError(`${file === "-" ? "stdin" : file} is not valid JSON.`);
      }
      const mode = ctx.values.mode;
      if (mode !== undefined && mode !== "warn" && mode !== "strict") throw new UsageError("--mode must be warn or strict.");
      const published = (await client.send("PUT", path, {
        document,
        ...(mode ? { mode } : {}),
        ...(ctx.values.draft ? { activate: false } : {}),
      })) as { version: number; active: boolean };
      print(ctx, published, () =>
        published.active ? `Published version ${published.version}. It is live now.` : `Saved version ${published.version} as a draft. The live form has not changed.`,
      );
      return;
    }
    default:
      throw new UsageError("Usage: endpointforms form get <endpoint-id> | set <endpoint-id> <file|->");
  }
}

/** Runs one command line. Returns the exit code: 0 ok, 1 the API said no, 2 a usage mistake. */
export async function run(argv: string[], io: Io): Promise<number> {
  let json = argv.includes("--json");
  try {
    const { values, positionals } = parse(argv);
    json = values.json === true;
    const [command, sub, arg, extra] = positionals;

    if (values.help || !command || command === "help") {
      io.out(HELP);
      return command || values.help ? 0 : 2;
    }

    const saved = await readConfig(io.env);
    const apiUrl = resolveApiUrl(values["api-url"] ?? io.env.ENDPOINTFORMS_API_URL ?? saved.apiUrl ?? DEFAULT_API_URL);
    const ctx: Context = { io, values, apiUrl, json };

    switch (command) {
      case "login":
        await login(ctx);
        break;
      case "logout":
        await logout(ctx);
        break;
      case "whoami":
        await whoami(ctx);
        break;
      case "endpoints":
        await endpoints(ctx, sub, arg);
        break;
      case "submissions":
        await submissions(ctx, sub, arg);
        break;
      case "form":
        await form(ctx, sub, arg, extra);
        break;
      default:
        throw new UsageError(`Unknown command ${JSON.stringify(command)}. See \`endpointforms --help\`.`);
    }
    return 0;
  } catch (error) {
    return report(io, json, error);
  }
}

/** A file the CLI was asked to read or write could not be. */
function isFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && typeof (error as NodeJS.ErrnoException).syscall === "string";
}

/**
 * Every failure, in the format the caller asked for. Messages can echo what
 * a stranger submitted — a validation error quotes the bad value — so they
 * are escaped like any other API text.
 */
function report(io: Io, json: boolean, error: unknown): number {
  const write = (exit: number, code: string, message: string, extra: Record<string, unknown> = {}) => {
    io.err(json ? `${safeJson({ ok: false, error: { code, message, ...extra } }).replace(/\n\s*/g, "")}\n` : `${visible(message)}\n`);
    return exit;
  };
  if (error instanceof UsageError) return write(2, "usage", error.message);
  if (error instanceof ApiFailure) {
    return json
      ? write(1, error.code, error.message, { status: error.status })
      : write(1, error.code, `Error (${error.code}): ${error.message}`);
  }
  if (isFileError(error)) return write(1, "file_error", error.message);
  throw error;
}
