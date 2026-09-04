/**
 * "Paste the page your form is already on" (#68).
 *
 * ## Why this moved out of the builder
 *
 * Import-by-URL has worked since #51 and is guarded against SSRF including DNS
 * rebinding, and it sat behind *"Start from a form you already have"* **inside
 * the builder** — which meant you only found it after you had already decided to
 * build a form. That is the wrong order for the person it is for. Somebody at
 * the base tier does not want to build anything; they have a form on a Webflow
 * or hand-written page and they want it to work better. Importing it is the one
 * action that makes the rest of the product legible to them without asking them
 * to start over, and it is the single highest-leverage upgrade path there is.
 *
 * So the question is asked on the endpoint screen, in their words, before the
 * word "builder" appears anywhere.
 *
 * ## Why it is a plain GET form and not a Client Component
 *
 * It navigates to the builder with `?import=` set, and the builder runs the
 * fetch through `importUrlAction` exactly as it always has. That means:
 *
 * - No JavaScript is needed to use it, on a screen that otherwise needs none.
 * - The fetch still happens in one place, behind one guard, with one set of
 *   tests. This module adds **placement and copy, not capability** — the whole
 *   point of the issue — and a second call site for a server-side fetch of a
 *   user-supplied URL would be a second thing to keep guarded.
 * - The result lands where adopting it into the editor already works, so
 *   "paste a URL" and "pick which form" are not split across two screens.
 */
export function ImportUrlPrompt({ action }: { action: string }) {
  return (
    <form method="GET" action={action} className="min-w-0">
      <label
        htmlFor="import-url"
        className="text-sm font-medium text-foreground"
      >
        Already have a form? Paste the page it is on.
      </label>
      <p className="mt-1.5 max-w-[64ch] text-sm text-muted-foreground">
        We fetch the page, read its markup and show you what we found — nothing
        is saved and nothing is published until you say so. Only what the server
        sends: a form assembled in the browser will not be there, and the builder
        takes pasted markup instead.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="import-url"
          name="import"
          type="url"
          inputMode="url"
          spellCheck={false}
          required
          placeholder="https://example.com/contact"
          className="h-11 min-w-0 flex-1 rounded-md border border-border-control bg-card px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <button
          type="submit"
          className="h-11 shrink-0 rounded-md border border-border-control px-4 text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Read my form
        </button>
      </div>
    </form>
  );
}
