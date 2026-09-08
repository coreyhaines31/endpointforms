/**
 * The TracerKit loader, on the marketing site only.
 *
 * ## Why this is not in `RootShell`
 *
 * `RootShell` is shared by four roots, and only one of them should carry
 * analytics. `docs/05` §4 is explicit: **customer form traffic must never share
 * a cookie domain with our analytics vendor.** A hosted form is somebody else's
 * lead capture running on their paid traffic, and putting our measurement on it
 * would mean their visitors are counted by our vendor, on a page we render for
 * them. So this is mounted by `(site)/layout.tsx` and by nothing else.
 *
 * `(forms)` cannot pick it up even by accident: `/f/{formId}` builds its own
 * document in `FormDocument` and never touches a layout at all (#56).
 *
 * `(app)` is left out too, but for a different reason — that is the signed-in
 * dashboard, and measuring what customers do inside their own account is a
 * decision to take deliberately rather than inherit from a marketing tag.
 *
 * ## Why `async` and not `next/script`
 *
 * This is the snippet TracerKit itself issues, unchanged. `next/script` would
 * add a client component and a hydration dependency to a set of pages that are
 * otherwise static, to control a load order the vendor already specifies.
 */
export function TracerKit() {
  const key = process.env.NEXT_PUBLIC_TRACERKIT_KEY;

  // Unset in development and on a fork, and that is the point: a clone of this
  // repo should not report to our analytics. No key, no script, no request.
  if (!key) return null;

  return <script async src="https://tracerkit.com/t.js" data-key={key} />;
}
