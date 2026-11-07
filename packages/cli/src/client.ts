/**
 * The REST API (`/api/v1`) and, for `login`, the account MCP server
 * (`/api/mcp`). The CLI decides nothing about who may see what: every
 * request carries the key, and the server scopes it.
 */

export type Fetch = typeof fetch;

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiFailure";
    this.status = status;
    this.code = code;
  }
}

const USER_AGENT = "endpointforms-cli/0.1.0";

export type Client = {
  get(path: string, query?: URLSearchParams): Promise<unknown>;
  /** The whole envelope, for lists that carry `next_cursor`. */
  getPage(path: string, query?: URLSearchParams): Promise<{ data: unknown[]; next_cursor: string | null }>;
  send(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<unknown>;
  download(path: string, query?: URLSearchParams): Promise<{ body: string; count: string | null; truncated: boolean }>;
};

export function createClient(apiUrl: string, apiKey: string, fetchImpl: Fetch = fetch): Client {
  async function request(method: string, path: string, query?: URLSearchParams, body?: unknown): Promise<Response> {
    const url = `${apiUrl}/api/v1${path}${query && [...query.keys()].length > 0 ? `?${query}` : ""}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      "user-agent": USER_AGENT,
    };
    if (body !== undefined) headers["content-type"] = "application/json";

    let response: Response;
    try {
      response = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (error) {
      throw new ApiFailure(0, "network_error", `Could not reach ${apiUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) throw await failureFrom(response);
    return response;
  }

  async function envelope(response: Response): Promise<Record<string, unknown>> {
    const parsed: unknown = await response.json().catch(() => null);
    if (!parsed || typeof parsed !== "object") {
      throw new ApiFailure(response.status, "bad_response", "The server sent something that is not JSON.");
    }
    return parsed as Record<string, unknown>;
  }

  return {
    async get(path, query) {
      return (await envelope(await request("GET", path, query))).data;
    },
    async getPage(path, query) {
      const body = await envelope(await request("GET", path, query));
      return {
        data: Array.isArray(body.data) ? body.data : [],
        next_cursor: typeof body.next_cursor === "string" ? body.next_cursor : null,
      };
    },
    async send(method, path, body) {
      return (await envelope(await request(method, path, undefined, body))).data;
    },
    async download(path, query) {
      const response = await request("GET", path, query);
      return {
        body: await response.text(),
        count: response.headers.get("x-export-row-count"),
        truncated: response.headers.get("x-export-truncated") === "true",
      };
    },
  };
}

async function failureFrom(response: Response): Promise<ApiFailure> {
  const parsed = (await response.json().catch(() => null)) as { error?: { code?: unknown; message?: unknown } } | null;
  const code = typeof parsed?.error?.code === "string" ? parsed.error.code : `http_${response.status}`;
  const message =
    typeof parsed?.error?.message === "string" ? parsed.error.message : `The server answered ${response.status} ${response.statusText}.`;
  return new ApiFailure(response.status, code, message);
}

/** One tool call on the account MCP server. Used only by `login --email`. */
export async function callAccountTool(
  apiUrl: string,
  name: string,
  args: Record<string, unknown>,
  fetchImpl: Fetch = fetch,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(`${apiUrl}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": USER_AGENT },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
  } catch (error) {
    throw new ApiFailure(0, "network_error", `Could not reach ${apiUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const reply = (await response.json().catch(() => null)) as {
    result?: { isError?: boolean; structuredContent?: Record<string, unknown>; content?: { text?: string }[] };
    error?: { message?: string };
  } | null;
  if (!reply?.result) {
    throw new ApiFailure(response.status, "bad_response", reply?.error?.message ?? `The server answered ${response.status}.`);
  }
  const structured = reply.result.structuredContent ?? {};
  if (reply.result.isError) {
    throw new ApiFailure(
      response.status,
      typeof structured.code === "string" ? structured.code : "error",
      typeof structured.message === "string" ? structured.message : (reply.result.content?.[0]?.text ?? "The call failed."),
    );
  }
  return structured;
}
