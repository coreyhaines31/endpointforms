/**
 * The wire format Manifest speaks (#32).
 *
 * MCP is JSON-RPC 2.0 carried over HTTP POST. This module is only the envelope:
 * parsing one, telling a request from a notification, and building the two
 * kinds of answer. It knows nothing about forms, so the transport can be
 * tested — and corrected — without a database or a schema anywhere near it.
 *
 * ## The distinction that matters most here
 *
 * A **protocol error** and a **tool error** are different things, and confusing
 * them is the most common way an MCP server becomes useless to a model:
 *
 *   - A protocol error (`error` on the envelope) means the request was not
 *     something the server could act on at all — an unknown method, malformed
 *     params. The client library raises it; the model usually never sees it.
 *   - A tool error (`result.isError === true`) means the call was well-formed
 *     and the *work* did not succeed. It goes back to the model, which is the
 *     entire point: "this email address is not valid" is only useful if the
 *     thing that can fix it gets to read it.
 *
 * Every rejection this server produces is therefore a tool error, not a
 * protocol error.
 */

export const JSONRPC_VERSION = "2.0";

/** Standard JSON-RPC codes, plus the one implementation-defined range we use. */
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  /** Implementation-defined. Used for refusals that are about this server. */
  SERVER_ERROR: -32000,
} as const;

/** An id is a string or a number; anything else is not a JSON-RPC id. */
export type RpcId = string | number;

export type RpcRequest = {
  method: string;
  params: Record<string, unknown>;
  /** Absent for a notification, which takes no answer. */
  id: RpcId | null;
};

export type RpcParseFailure = {
  code: number;
  message: string;
  /** The id, when it survived far enough to be echoed back. */
  id: RpcId | null;
};

export type RpcParsed =
  | { ok: true; request: RpcRequest }
  | { ok: false; failure: RpcParseFailure };

/**
 * Reads one JSON-RPC message out of already-decoded JSON.
 *
 * Batches are refused rather than half-supported. JSON-RPC batching was removed
 * from MCP in the 2025-06-18 revision, and a server that accepts an array while
 * answering only the first entry loses calls silently — which on this endpoint
 * means losing leads.
 */
export function parseRpc(payload: unknown): RpcParsed {
  if (Array.isArray(payload)) {
    return {
      ok: false,
      failure: {
        code: RPC.INVALID_REQUEST,
        message:
          "Batched requests are not supported. MCP removed JSON-RPC batching in revision 2025-06-18; send one request per POST.",
        id: null,
      },
    };
  }

  if (payload === null || typeof payload !== "object") {
    return {
      ok: false,
      failure: {
        code: RPC.INVALID_REQUEST,
        message: "A JSON-RPC request must be a JSON object.",
        id: null,
      },
    };
  }

  const record = payload as Record<string, unknown>;
  const id = readId(record.id);

  if (record.jsonrpc !== JSONRPC_VERSION) {
    return {
      ok: false,
      failure: {
        code: RPC.INVALID_REQUEST,
        message: `Expected "jsonrpc": "2.0"; got ${JSON.stringify(record.jsonrpc ?? null)}.`,
        id,
      },
    };
  }

  if (typeof record.method !== "string" || record.method === "") {
    return {
      ok: false,
      failure: {
        code: RPC.INVALID_REQUEST,
        message: "A JSON-RPC request needs a non-empty string \"method\".",
        id,
      },
    };
  }

  const params =
    record.params === undefined || record.params === null
      ? {}
      : typeof record.params === "object" && !Array.isArray(record.params)
        ? (record.params as Record<string, unknown>)
        : null;

  if (params === null) {
    return {
      ok: false,
      failure: {
        code: RPC.INVALID_PARAMS,
        message: "\"params\" must be an object. Positional parameters are not used by MCP.",
        id,
      },
    };
  }

  return { ok: true, request: { method: record.method, params, id } };
}

function readId(value: unknown): RpcId | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export function rpcResult(id: RpcId, result: unknown): Record<string, unknown> {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

export function rpcError(
  id: RpcId | null,
  code: number,
  message: string,
  data?: unknown,
): Record<string, unknown> {
  return {
    jsonrpc: JSONRPC_VERSION,
    // A null id is legal on an error response and is what the spec asks for
    // when the request was too broken to have one read off it.
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}
