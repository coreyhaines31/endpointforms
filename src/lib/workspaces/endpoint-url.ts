/**
 * The URL an endpoint receives submissions at, on the workspace's own
 * subdomain of the render domain. Shared by the endpoint screen's snippet and
 * the account MCP server, so the address an agent hands someone is the same
 * one the web app shows them.
 */
export function endpointUrl(slug: string, renderDomain: string, publicId: string): string {
  return `https://${slug}.${renderDomain}/e/${publicId}`;
}
