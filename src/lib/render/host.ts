import { normaliseHost } from "../hosts.ts";

/**
 * Whether a hosted form may answer on the host it was requested on (#109).
 *
 * `acme.<render-domain>` is acme's: it is the origin acme's embed snippets
 * name, and a visitor reads the subdomain as whose form this is. Without this,
 * `acme.<render-domain>/f/{id}` rendered any workspace's form, so one tenant's
 * subdomain could be made to show another tenant's form.
 *
 * A mismatch is answered exactly as a form that does not exist — not a
 * redirect to the owner's subdomain, which would confirm the ID is real and
 * name the workspace that owns it.
 *
 * Only a subdomain of the render domain is ever refused:
 *
 * - The bare render domain serves every form. Embeds already shipped point at
 *   `<render-domain>/f/{id}` and must keep working.
 * - Any other host — localhost, a preview deployment, a self-hosted install —
 *   is not one we can read a workspace from, so it serves every form, exactly
 *   as `decideHost` leaves those hosts alone.
 *
 * A subdomain more than one label deep, or a reserved one like `www`, can never
 * equal a slug (slugs are single DNS labels and `www` is reserved), so those
 * refuse every form. Nothing links to forms there.
 *
 * Pure, so `tests/form-host.test.mts` can exercise every branch without a
 * database.
 */
export function formAnswersOnHost(
  hostHeader: string | null,
  workspaceSlug: string,
  renderDomain: string,
): boolean {
  const host = normaliseHost(hostHeader);
  if (!host) return true;

  const render = renderDomain.trim().toLowerCase().replace(/\.$/, "");
  if (!host.endsWith(`.${render}`)) return true;

  const subdomain = host.slice(0, -(render.length + 1));
  return subdomain === workspaceSlug.toLowerCase();
}
