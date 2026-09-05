/*!
 * Endpoint Forms — embed (#39)
 *
 * One script, three modes: an inline form, a popup, and a decorated link.
 * It is loaded from the render domain, so its own `src` is where the forms are
 * and there is no second URL to get wrong.
 *
 *   <div data-endpoint-form="FORM_ID"></div>
 *   <script src="https://acme.endpointforms.app/embed.js" async></script>
 *
 * WHAT IT DOES THAT AN IFRAME CANNOT DO ON ITS OWN
 *
 *   An iframe cannot read the URL of the page it is on. That is the same-origin
 *   policy and it is not going to change. So the UTMs and click IDs on
 *   /pricing?utm_source=google&gclid=... reach the submission because THIS
 *   SCRIPT reads them, here, on your page, and appends them to the frame's URL.
 *   Nothing about it is automatic. Remove the script and the form still works
 *   and is honestly unattributed; it does not post an empty gclid forever.
 *
 * CONVENTIONS THIS FILE HOLDS TO, BECAUSE IT RUNS ON SOMEBODY ELSE'S PAGE
 *
 *   - No global variables. Nothing is added to `window`. State lives in this
 *     closure and on the elements themselves.
 *   - No dependencies, no `eval`, no `new Function`, no injected <style>, and
 *     no `setAttribute("style", ...)`. Everything is CSSOM property assignment,
 *     which a strict `style-src` allows. See the CSP note in the app.
 *   - No exceptions escape. Storage can throw on access alone in a locked-down
 *     browser; every touch is wrapped.
 *   - It fails LOUDLY. A missing form id, a frame that never answers: both draw
 *     a visible message where the form should be and log to the console. A
 *     silent embed is a lead-capture page that collects nothing and looks fine.
 */
(function () {
  "use strict";

  var SOURCE = "endpointforms";
  var LOG = "[endpointforms]";

  /**
   * Attribution names carried forward across pages within one visit.
   *
   * Kept in step with `ATTRIBUTION_FIELD_KEYS` in
   * `src/lib/ingest/attribution.ts` by `tests/embed.test.mts`, which fails if a
   * click ID is added there and not here. Written as one space-separated string
   * so that test can read it back without parsing JavaScript.
   */
  var PERSIST =
    "utm_source utm_medium utm_campaign utm_term utm_content gclid gbraid wbraid dclid fbclid msclkid ttclid li_fat_id twclid rdt_cid epik irclickid sccid obclid tblci".split(
      " "
    );

  /** Session, not local: "this visit", which is what the requirement says. */
  var STORE_KEY = "endpointforms.attribution";

  var MAX_PARAMS = 25;
  var MAX_VALUE = 512;
  var MAX_URL = 1900;
  /** How long a frame has to say hello before we call it broken. */
  var HANDSHAKE_MS = 8000;
  var DEFAULT_HEIGHT = 420;

  var script = document.currentScript;
  if (!script) {
    // Only reachable if the file is re-executed out of band (a module import,
    // a bundler inlining it). There is no way to find our own origin then.
    console.error(LOG + " embed.js must be loaded with a <script src> tag.");
    return;
  }

  var base = originOf(script.src);
  if (!base) {
    console.error(LOG + " could not read an origin from " + script.src);
    return;
  }

  var counter = 0;
  /** instanceId -> function(height). One listener, however many forms. */
  var frames = {};

  window.addEventListener("message", onMessage);

  ready(scan);

  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  function scan() {
    each(document.querySelectorAll("[data-endpoint-form]"), mount);
    each(document.querySelectorAll("a[data-endpoint-link]"), decorate);
  }

  function mount(el) {
    if (el.getAttribute("data-endpoint-ready") === "1") return;
    el.setAttribute("data-endpoint-ready", "1");

    var id = (el.getAttribute("data-endpoint-form") || "").trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      return fail(el, 'data-endpoint-form is missing or not a form id: "' + id + '"');
    }

    if ((el.getAttribute("data-endpoint-mode") || "inline") === "popup") popup(el, id);
    else inline(el, id);
  }

  // -------------------------------------------------------------------------
  // Inline
  // -------------------------------------------------------------------------

  function inline(el, id) {
    var instance = mint();
    var frame = document.createElement("iframe");
    var height = parseInt(el.getAttribute("data-endpoint-height"), 10) || DEFAULT_HEIGHT;

    frame.src = frameUrl(id, "inline", instance);
    frame.title = el.getAttribute("data-endpoint-title") || "Form";
    frame.loading = "eager";
    frame.style.display = "block";
    frame.style.width = "100%";
    frame.style.border = "0";
    frame.style.height = height + "px";
    // A frame that never resizes should still not clip its own content.
    frame.setAttribute("scrolling", "auto");

    var answered = false;
    frames[instance] = function (next) {
      answered = true;
      frame.style.height = next + "px";
    };

    el.appendChild(frame);

    window.setTimeout(function () {
      if (answered) return;
      // The frame is ours, so if our page loaded, our script ran and answered.
      // Not answering means the frame did not load: a wrong form id, a blocked
      // request, or — much the commonest — a Content-Security-Policy on this
      // page with no frame-src for us.
      fail(
        el,
        "the form at " +
          base +
          " did not load. If this page sets a Content-Security-Policy it needs " +
          "frame-src " +
          base +
          " and script-src " +
          base +
          "."
      );
    }, HANDSHAKE_MS);
  }

  // -------------------------------------------------------------------------
  // Popup
  // -------------------------------------------------------------------------

  function popup(el, id) {
    var selector = el.getAttribute("data-endpoint-trigger");
    var trigger = selector ? document.querySelector(selector) : el.firstElementChild;

    if (!trigger) {
      trigger = document.createElement("button");
      trigger.type = "button";
      trigger.textContent = el.getAttribute("data-endpoint-label") || "Open the form";
      el.appendChild(trigger);
    }

    var overlay = null;
    var frame = null;
    var closer = null;
    var restore = null;
    var instance = mint();

    trigger.addEventListener("click", function (event) {
      event.preventDefault();
      open();
    });

    function open() {
      if (overlay) return;
      restore = document.activeElement;

      overlay = document.createElement("div");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", el.getAttribute("data-endpoint-title") || "Form");
      style(overlay, {
        position: "fixed",
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
        zIndex: "2147483000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Room at the top for the close button, which sits on the scrim rather
        // than on the panel. See below.
        padding: "56px 16px 16px",
        background: "rgba(0,0,0,.55)"
      });
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) close();
      });

      // Deliberately transparent. The form inside paints its own ground, which
      // is the only way this dialog can be right in both colour schemes: the
      // script cannot know whether the visitor prefers dark and the frame does,
      // so a hardcoded white panel is a dark form rendered unreadable. A radius
      // still clips a scrollable child, so the corners are round either way.
      var panel = document.createElement("div");
      style(panel, {
        position: "relative",
        width: "100%",
        maxWidth: "560px",
        maxHeight: "100%",
        overflow: "auto",
        borderRadius: "10px",
        background: "transparent",
        boxShadow: "0 24px 60px rgba(0,0,0,.35)"
      });

      // On the scrim, not on the panel: white on a dark overlay is legible
      // whatever colours the form is using, and a button drawn over the frame
      // would sit on top of its first field on a small screen.
      closer = document.createElement("button");
      closer.type = "button";
      closer.setAttribute("aria-label", "Close");
      closer.textContent = "×";
      style(closer, {
        position: "absolute",
        top: "10px",
        right: "14px",
        border: "0",
        background: "transparent",
        cursor: "pointer",
        font: "30px/1 system-ui, sans-serif",
        color: "#fff",
        padding: "4px 10px"
      });
      closer.addEventListener("click", close);

      frame = document.createElement("iframe");
      // Built at open time, not at mount time: the visitor may have navigated
      // within a single-page app since the script ran, and the parameters that
      // matter are the ones on the page they are looking at now.
      frame.src = frameUrl(id, "popup", instance);
      frame.title = el.getAttribute("data-endpoint-title") || "Form";
      style(frame, { display: "block", width: "100%", border: "0", height: DEFAULT_HEIGHT + "px" });

      frames[instance] = function (next) {
        frame.style.height = next + "px";
      };

      panel.appendChild(frame);
      overlay.appendChild(closer);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      document.addEventListener("keydown", onKey);
      closer.focus();
    }

    function close() {
      if (!overlay) return;
      document.removeEventListener("keydown", onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      frame = null;
      delete frames[instance];
      // A new frame each time it opens, so a second visitor on a kiosk does not
      // reopen the first one's half-filled form.
      instance = mint();
      if (restore && restore.focus) restore.focus();
    }

    function onKey(event) {
      if (event.key === "Escape" || event.keyCode === 27) close();
    }
  }

  // -------------------------------------------------------------------------
  // A plain link, decorated
  // -------------------------------------------------------------------------

  /**
   * `<a href="https://acme.endpointforms.app/f/ID" data-endpoint-link>`.
   *
   * The href in the markup already works with no script at all — it is a link
   * to the form. What this adds is the parameters, so a full-page form opened
   * from an ad landing page carries the ad's attribution with it. Degrading to
   * "the link works, unattributed" is the right failure and is why the href is
   * written out rather than built here.
   */
  function decorate(a) {
    if (a.getAttribute("data-endpoint-ready") === "1") return;
    a.setAttribute("data-endpoint-ready", "1");

    var url;
    try {
      url = new URL(a.href, location.href);
    } catch {
      return fail(null, "data-endpoint-link on an anchor with no usable href");
    }
    if (url.origin !== base) {
      return fail(null, "data-endpoint-link points at " + url.origin + ", not " + base);
    }

    var carry = collect();
    for (var name in carry) {
      if (!has(carry, name)) continue;
      if (!url.searchParams.has(name)) url.searchParams.set(name, carry[name]);
    }
    url.searchParams.set("ef_page", trim(location.href, MAX_VALUE));

    var next = url.toString();
    if (next.length <= MAX_URL) a.href = next;
  }

  // -------------------------------------------------------------------------
  // Parameters
  // -------------------------------------------------------------------------

  /**
   * Everything on this page's URL, plus anything stored from an earlier page.
   *
   * Precedence is current-page-first: somebody who arrives on /pricing from a
   * second ad is on that second ad's click, and the stored value only fills a
   * gap. The merged set is written back, so it travels forward to the next page
   * in the visit — which is the "lands on the homepage, submits on /pricing"
   * requirement, and the reason a script beats a hidden field for this.
   */
  function collect() {
    var out = {};
    var count = 0;
    var here;

    try {
      here = new URL(location.href).searchParams;
    } catch {
      here = null;
    }

    if (here) {
      here.forEach(function (value, name) {
        if (count >= MAX_PARAMS) return;
        // Ours. Never taken from the host page, so a URL on somebody's site can
        // never choose the embed mode, the parent origin or the instance id.
        if (name.indexOf("ef_") === 0) return;
        if (!value || value.length > MAX_VALUE) return;
        if (has(out, name)) return;
        out[name] = value;
        count++;
      });
    }

    var stored = read();
    var persisted = {};
    for (var i = 0; i < PERSIST.length; i++) {
      var key = PERSIST[i];
      if (has(out, key)) persisted[key] = out[key];
      else if (has(stored, key)) {
        persisted[key] = stored[key];
        if (count < MAX_PARAMS) {
          out[key] = stored[key];
          count++;
        }
      }
    }
    write(persisted);

    return out;
  }

  function frameUrl(id, mode, instance) {
    var url = new URL(base + "/f/" + encodeURIComponent(id));
    var carry = collect();

    for (var name in carry) {
      if (has(carry, name)) url.searchParams.set(name, carry[name]);
    }

    url.searchParams.set("ef_embed", mode);
    url.searchParams.set("ef_o", location.origin);
    url.searchParams.set("ef_i", instance);
    url.searchParams.set("ef_page", trim(location.href, MAX_VALUE));

    var out = url.toString();
    if (out.length <= MAX_URL) return out;

    // Rather than let a proxy truncate it somewhere arbitrary, drop the
    // pass-through and keep the four parameters the frame cannot work without.
    console.warn(LOG + " too many URL parameters to pass through; kept the embed ones only.");
    var minimal = new URL(base + "/f/" + encodeURIComponent(id));
    minimal.searchParams.set("ef_embed", mode);
    minimal.searchParams.set("ef_o", location.origin);
    minimal.searchParams.set("ef_i", instance);
    minimal.searchParams.set("ef_page", trim(location.href, MAX_VALUE));
    return minimal.toString();
  }

  // -------------------------------------------------------------------------
  // The parent half of the resize handshake
  // -------------------------------------------------------------------------

  /**
   * Four checks, and every one of them earns its place.
   *
   * `event.origin` is the only one people usually write, and on its own it is
   * not enough: any frame from our origin on this page — including a second
   * customer's form — would pass it. `event.source` identifies the actual
   * window, which is what makes one form unable to resize another, and the
   * instance id makes that true again after a popup is closed and reopened.
   */
  function onMessage(event) {
    if (event.origin !== base) return;

    var data = event.data;
    if (!data || data.source !== SOURCE || data.type !== "resize") return;

    var apply = frames[data.id];
    if (!apply) return;

    var height = Number(data.height);
    if (!isFinite(height) || height < 1 || height > 20000) return;

    apply(Math.ceil(height));
  }

  // -------------------------------------------------------------------------
  // Plumbing
  // -------------------------------------------------------------------------

  function mint() {
    counter++;
    return "i" + counter + "-" + Math.random().toString(36).slice(2, 8);
  }

  function originOf(src) {
    try {
      return new URL(src, location.href).origin;
    } catch {
      return null;
    }
  }

  function read() {
    try {
      var raw = window.sessionStorage.getItem(STORE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      // Private mode, disabled storage, a quota error, or a browser that throws
      // on the property access itself. None of it is worth a broken form.
      return {};
    }
  }

  function write(map) {
    try {
      var empty = true;
      for (var key in map) {
        if (has(map, key)) {
          empty = false;
          break;
        }
      }
      if (empty) return;
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify(map));
    } catch {
      /* nothing stored; the current page's own parameters still work */
    }
  }

  /**
   * Says so, where the form was supposed to be.
   *
   * A console error alone is not enough. The person who pasted the snippet is
   * not the person who opens the page a week later, and a form that quietly
   * renders nothing looks identical to a section that was meant to be empty.
   */
  function fail(el, message) {
    console.error(LOG + " " + message);
    if (!el) return;

    var note = document.createElement("div");
    note.setAttribute("role", "status");
    note.textContent = "This form could not be loaded.";
    style(note, {
      padding: "12px 14px",
      border: "1px solid #d4d4d8",
      borderRadius: "8px",
      font: "14px/1.5 system-ui, sans-serif",
      color: "#3f3f46",
      background: "#fafafa"
    });
    el.appendChild(note);
  }

  function style(el, props) {
    for (var name in props) {
      if (has(props, name)) el.style[name] = props[name];
    }
  }

  function has(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function trim(value, max) {
    return value.length > max ? value.slice(0, max) : value;
  }

  function each(list, fn) {
    for (var i = 0; i < list.length; i++) fn(list[i]);
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }
})();
