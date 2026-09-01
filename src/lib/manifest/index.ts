/**
 * Manifest — the agent-callable surface every form publishes (#32).
 *
 * | Module | What it is |
 * | --- | --- |
 * | `tool.ts` | The tool definition, generated from `FormSchemaDocument`. Pure. |
 * | `arguments.ts` | An agent's JSON, normalised to what the page would have posted. Pure. |
 * | `jsonrpc.ts` | The MCP envelope. Knows nothing about forms. |
 * | `handler.ts` | The endpoint. Plain `Request`/`Response`, no Next APIs. |
 *
 * The two halves of Origin meet here. `decideOrigin` returns `agent`
 * categorically for `surface: "manifest"`, and `handler.ts` is the only thing
 * in the codebase that passes that value — as a constant, never from the
 * request. That is what makes the stamp unforgeable in both directions, and
 * `docs/23-origin-findings.md` is the measurement that made it the half worth
 * building.
 */

export {
  handleManifestPreflight,
  handleManifestRequest,
  handleManifestUnsupportedMethod,
  listTools,
  LATEST_PROTOCOL_VERSION,
  MANIFEST_SERVER_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  type ManifestOptions,
} from "./handler.ts";

export {
  buildToolDefinition,
  fieldToJsonSchema,
  OUTPUT_SCHEMA,
  toolName,
  type JsonSchema,
  type ManifestTool,
  type ToolContext,
} from "./tool.ts";

export { prepareSubmission, type CoercionResult } from "./arguments.ts";

export {
  parseRpc,
  rpcError,
  rpcResult,
  RPC,
  JSONRPC_VERSION,
  type RpcId,
  type RpcParsed,
  type RpcRequest,
} from "./jsonrpc.ts";
