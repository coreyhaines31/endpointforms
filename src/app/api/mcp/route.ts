import {
  handleAccountMcpPreflight,
  handleAccountMcpRequest,
  handleAccountMcpUnsupportedMethod,
} from "@/lib/account/mcp";

/**
 * The account MCP server (#128) — sign up, create endpoints and mint keys from
 * an AI chat. `/api/*` answers on every host (`src/lib/hosts.ts`); the
 * canonical address is `https://app.endpointforms.com/api/mcp`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleAccountMcpRequest(request);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return handleAccountMcpPreflight(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleAccountMcpUnsupportedMethod(request);
}
