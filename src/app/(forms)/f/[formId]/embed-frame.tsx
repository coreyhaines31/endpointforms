import type { EmbedContext } from "@/lib/embed/params";

/**
 * What a hosted form adds when it is somebody's `<iframe>` (#39).
 *
 * Two things, both of them nothing when the page is opened directly: a small
 * stylesheet that undoes the full-height layout, and a ~500-byte inline script
 * that tells the parent how tall the content is.
 *
 * ## Why this is not a Client Component
 *
 * `src/app/(forms)/layout.tsx` is an argument about payload — a hosted form's
 * traffic is bought, and every kilobyte is spent on a lead somebody paid for.
 * A Client Component here would put this file, its imports and a hydration
 * boundary into the page's JavaScript for a fixed 25-line routine that runs
 * once and never re-renders. An inline `<script>` in a Server Component costs
 * its own length and nothing else, adds no request, and — the part that
 * matters — leaves the "this form submits with JavaScript disabled" property
 * exactly where it was. Turn scripting off inside the frame and the form still
 * works; the frame simply keeps whatever height the snippet gave it.
 *
 * ## Why the values arrive as attributes
 *
 * The parent origin and the instance id come off a query string, which makes
 * them attacker-controlled. Interpolating either into the script body would be
 * building JavaScript out of user input — the classic hole, and one that
 * validation in `params.ts` would only be *probably* closing. They are passed
 * as `data-` attributes instead, which React escapes as attribute values, and
 * read back with `getAttribute`. There is then no context in which a quote or a
 * `</` can mean anything, whatever `params.ts` did or did not catch.
 *
 * ## The origin, and why `*` is not here
 *
 * `postMessage` is told exactly which origin may receive the message. A `*`
 * would broadcast the frame's content height to whatever page happens to be
 * embedding it, including one that framed a customer's form without asking. It
 * is a small leak and there is no reason to take it: the snippet knows its own
 * origin and passes it. **If no valid origin arrived, no script is emitted at
 * all** — the frame keeps its declared height and the snippet says, visibly,
 * that the handshake did not happen. Silence with a `*` fallback would be worse
 * than the fixed height it was meant to fix.
 */

/**
 * Undoing `h-full` / `min-h-full` / `flex-1`, which are right for a page and
 * wrong for a frame.
 *
 * Left alone, `document.documentElement.scrollHeight` is the height of the
 * *frame* — the layout stretches to fill whatever the parent gave it — so the
 * handshake would report back the number the parent already knew and the form
 * would never resize. `!important` because these compete with Tailwind
 * utilities, which are classes and would otherwise win on specificity.
 *
 * The transparent ground is the other half of looking embedded, and it is
 * inline-only: a form that paints its own paper colour inside somebody's
 * section is a rectangle sitting on their page rather than part of it, while a
 * popup has nothing behind it but the dialog and must paint its own.
 */
const LAYOUT_CSS = [
  "html{height:auto!important}",
  "body{min-height:0!important}",
  "body>*{flex:0 0 auto!important}",
  "main{flex:0 0 auto!important}",
].join("");

/**
 * Inline only. A popup keeps its own opaque ground — see `embedded()` in
 * `page.tsx` — and a transparent body under it would show the dialog through
 * the strip between the frame's declared height and its real one, for the one
 * frame before the handshake lands.
 */
const TRANSPARENT_CSS = "body{background:transparent!important}";

/**
 * The child half of the resize handshake.
 *
 * ## Why not `scrollHeight`, which is what everybody writes
 *
 * `document.documentElement.scrollHeight` **cannot return less than the
 * viewport**, and inside an iframe the viewport is the frame's current height.
 * So a frame that starts at 420px and holds 674px of form grows correctly once
 * and is then stuck: when the form is replaced by a four-line thank-you page,
 * `scrollHeight` still reports the frame's own 674 and the parent is told
 * nothing has changed. That is exactly what happened here — the form submitted,
 * the frame filled with 250px of "Thanks", and 400px of the customer's page
 * stayed blank underneath it. It looks like the resize working, right up until
 * the one moment it matters most.
 *
 * `getBoundingClientRect()` on the root element has no such floor once
 * `html { height: auto }` is in force (the stylesheet above), so it measures the
 * content in both directions. `body.scrollHeight` is taken alongside it as a
 * ceiling, for content positioned outside the root's own box.
 *
 * A repeat of the last height is not sent. Without that guard a `ResizeObserver`
 * whose callback resizes the frame that changes the observed box is a loop, and
 * a cheap equality check is the whole fix.
 */
const RESIZE_SCRIPT = `(function(){var s=document.currentScript;if(!s||window.parent===window)return;var o=s.getAttribute("data-ef-origin"),i=s.getAttribute("data-ef-instance");if(!o||!i)return;var last=-1;function send(){var b=document.body;var h=Math.ceil(Math.max(document.documentElement.getBoundingClientRect().height,b?b.scrollHeight:0));if(h<1||h===last)return;last=h;try{window.parent.postMessage({source:"endpointforms",version:1,type:"resize",id:i,height:h},o)}catch(e){}}send();addEventListener("load",send);addEventListener("pageshow",send);if(window.ResizeObserver){new ResizeObserver(send).observe(document.body)}else{setInterval(send,400)}})()`;

export function EmbedFrame({ context }: { context: EmbedContext }) {
  if (context.mode === null) return null;

  const handshake = context.parentOrigin !== null && context.instanceId !== null;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html:
            context.mode === "inline" ? `${LAYOUT_CSS}${TRANSPARENT_CSS}` : LAYOUT_CSS,
        }}
      />
      {handshake ? (
        <script
          data-ef-origin={context.parentOrigin}
          data-ef-instance={context.instanceId}
          dangerouslySetInnerHTML={{ __html: RESIZE_SCRIPT }}
        />
      ) : null}
    </>
  );
}
