/**
 * The snippets somebody pastes into their site (#39).
 *
 * ## Why the comments are inside the snippet
 *
 * Every mode below has something it deliberately does not do, and in two of the
 * three cases that thing looks like a bug from the outside: a plain `<iframe>`
 * carries no attribution and never resizes, and a decorated link carries no
 * attribution until the script loads. Those limits are the same-origin policy,
 * not our omission, and the person who finds out is not the person who pasted
 * it — it is whoever is asked six weeks later why every lead says "direct".
 *
 * So the explanation ships **in the snippet**, as an HTML comment, where it
 * ends up in the page's source next to the thing it explains. The app renders
 * the same sentence above the block for whoever is reading the screen. Saying
 * it twice is the point.
 *
 * ## Pure, and therefore checkable
 *
 * No DOM, no React, no database: `tests/embed.test.mts` asserts what each
 * snippet does and does not contain, including that a hostile form id cannot
 * break out of the attribute it lands in.
 */

/** Matches the ingest and render paths' own shape check for a public id. */
const PUBLIC_ID_CHARS = /[^A-Za-z0-9_-]/g;

/**
 * A form id, reduced to the characters a public id can contain.
 *
 * Ids come from our own database and already match this, so in practice it
 * removes nothing. It is here because these strings are concatenated into HTML
 * attributes rather than rendered as React children: the escaping React would
 * normally do for us is not in this code path, so the value has to be one that
 * cannot need escaping. That is a stronger property than escaping correctly.
 */
export function safeFormId(formId: string): string {
  return formId.replace(PUBLIC_ID_CHARS, "").slice(0, 64);
}

export function formPageUrl(origin: string, formId: string): string {
  return `${origin}/f/${safeFormId(formId)}`;
}

export function embedScriptUrl(origin: string): string {
  return `${origin}/embed.js`;
}

export type SnippetId = "link" | "iframe" | "inline" | "popup";

export type EmbedSnippet = {
  id: SnippetId;
  label: string;
  /** What this mode is for, in one sentence. */
  summary: string;
  /** What it does not do on its own. Rendered on screen, not only in the code. */
  caveat: string;
  code: string;
};

/**
 * The height a plain `<iframe>` is given.
 *
 * Generous on purpose. With no script there is no handshake and no correct
 * answer, and of the two ways to be wrong — a gap underneath, or a form with
 * its submit button cut off — only one of them loses the lead. The first draft
 * of this was 720 and the seeded four-field form clipped at 1200px wide, which
 * is the whole argument for the inline mode in one number.
 */
const STATIC_FRAME_HEIGHT = 900;

export function embedSnippets(origin: string, formId: string): EmbedSnippet[] {
  const id = safeFormId(formId);
  const page = formPageUrl(origin, id);
  const script = embedScriptUrl(origin);

  return [
    {
      id: "link",
      label: "Link",
      summary:
        "The form on its own page. Nothing to embed, nothing to style around, and it is the only mode that works in an email or a QR code.",
      caveat:
        "A bare link carries no UTMs or click IDs — a static href cannot read the page it is on. Adding the script below decorates it at click time.",
      code: [
        `<!-- Works with no JavaScript at all. On its own it carries no UTM and no`,
        `     click ID: an href written into your HTML cannot read the query string`,
        `     of the page it is sitting on. Load embed.js as well and this link is`,
        `     decorated with them at click time, including ones from an earlier page`,
        `     in the same visit. -->`,
        `<a href="${page}" data-endpoint-link>Request a quote</a>`,
        ``,
        `<script src="${script}" async></script>`,
      ].join("\n"),
    },

    {
      id: "iframe",
      label: "Plain iframe",
      summary:
        "No script on your page. Right when a CMS will not let you add one, or when a security review will not allow it.",
      caveat:
        "Two costs, both of them the same-origin policy rather than a gap in this: no parameter passthrough, and a fixed height.",
      code: [
        `<!-- No script anywhere, and therefore two limits worth knowing before you`,
        `     paste it. Neither is an omission on our side; both are the browser's`,
        `     same-origin policy doing its job.`,
        ``,
        `     1. This frame cannot read the URL of the page it is on, so nothing`,
        `        from ?utm_source=... or ?gclid=... reaches the submission.`,
        `     2. This frame cannot tell your page how tall it is, so the height`,
        `        below is fixed. Too small clips the form; too large leaves a gap.`,
        ``,
        `     \`ef_embed=inline\` is still worth having without a script: it drops`,
        `     the form's own page padding and background so it sits flush in`,
        `     whatever box you give it. Only the resizing and the passthrough`,
        `     need the script.`,
        ``,
        `     The inline snippet fixes both, with one script tag. -->`,
        `<iframe`,
        `  src="${page}?ef_embed=inline"`,
        `  title="Request a quote"`,
        `  width="100%"`,
        `  height="${STATIC_FRAME_HEIGHT}"`,
        `  style="border:0"`,
        `  loading="lazy"`,
        `></iframe>`,
      ].join("\n"),
    },

    {
      id: "inline",
      label: "Inline",
      summary:
        "The form rendered in place, sized to its own content. This is the one to use unless something stops you.",
      caveat:
        "The script reads this page's query string and appends it to the frame's URL. That is the whole mechanism — it is not automatic, and if the script does not run the form still submits, honestly unattributed.",
      code: [
        `<!-- What the script does, so nobody has to guess:`,
        ``,
        `     - Reads THIS page's query string and appends it to the form's URL.`,
        `       That is the only way a UTM or a click ID can reach the submission:`,
        `       a cross-origin iframe cannot read its parent's location, ever.`,
        `     - Remembers those parameters for the rest of the visit, so somebody`,
        `       who lands on / and submits on /pricing keeps their source.`,
        `     - Resizes the frame to its content, over postMessage, restricted to`,
        `       this page's origin.`,
        ``,
        `     It adds nothing to window, needs no jQuery, and if it fails to load`,
        `     it says so on the page instead of leaving an empty space. -->`,
        `<div data-endpoint-form="${id}"></div>`,
        ``,
        `<script src="${script}" async></script>`,
      ].join("\n"),
    },

    {
      id: "popup",
      label: "Popup",
      summary:
        "The same form behind a button. The frame is not requested until somebody opens it.",
      caveat:
        "Same passthrough as the inline mode. The button is yours — style it, or point at one you already have with data-endpoint-trigger.",
      code: [
        `<!-- Same script, same passthrough. The frame's URL is built when the`,
        `     dialog opens rather than on page load, so on a single-page app the`,
        `     parameters are the ones on the route the visitor is actually`,
        `     looking at.`,
        ``,
        `     The button below is an ordinary button and yours to style. To use one`,
        `     you already have, put data-endpoint-trigger="#your-button" on the div`,
        `     and leave it empty. -->`,
        `<div data-endpoint-form="${id}" data-endpoint-mode="popup">`,
        `  <button type="button">Request a quote</button>`,
        `</div>`,
        ``,
        `<script src="${script}" async></script>`,
      ].join("\n"),
    },
  ];
}

/**
 * What a strict-CSP customer has to add.
 *
 * Both directives, always, and never `'unsafe-inline'`: the script is an
 * external file and everything it draws is set through CSSOM properties rather
 * than a `style` attribute or an injected `<style>`, so a page with
 * `style-src 'self'` and no inline allowance renders the popup correctly.
 */
export function cspDirectives(origin: string): string {
  return `script-src ${origin}; frame-src ${origin}`;
}

/**
 * A link that arrives with fields already filled in.
 *
 * Only fields somebody can see and change are prefillable — see
 * `./prefill.ts`. A hidden field is not, which is why this example is built
 * from the visible ones only and why the panel says so out loud.
 */
export function prefillExample(
  origin: string,
  formId: string,
  keys: readonly string[],
): string | null {
  const usable = keys.slice(0, 2);
  if (usable.length === 0) return null;

  const query = usable
    .map((key, index) => `${encodeURIComponent(key)}=${encodeURIComponent(index === 0 ? "Ada Lovelace" : "ada@example.com")}`)
    .join("&");

  return `${formPageUrl(origin, formId)}?${query}`;
}
