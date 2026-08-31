/**
 * The waitlist, as an Endpoint form (#33, #24).
 *
 * Two things are asserted here, and both are the kind of thing that would
 * otherwise only be noticed in production:
 *
 * 1. The two paths — the visitor's browser and our server's fallback — write
 *    the same field names and differ only in `channel`. If they drifted, the
 *    inbox would hold two incompatible shapes of the same form.
 * 2. The server-forward path sends **no origin token**. That is the whole
 *    honesty property: a server posting a browser's token would be forging
 *    the provenance stamp on the one form we own.
 *
 * Plus the provenance the two paths actually earn, run through the real
 * `decideOrigin`, so this file fails if the scoring ever changes underneath the
 * assumption the design rests on.
 *
 * No database, no server, no Next runtime.
 */

import { decideOrigin } from "../src/lib/origin/index.ts";
import {
  acknowledged,
  buildWaitlistBody,
  pathnameOf,
  waitlistTokenUrl,
} from "../src/lib/waitlist-endpoint.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const isOk = JSON.stringify(got) === JSON.stringify(want);
  if (isOk) pass++;
  else fail++;
  console.log(`  ${isOk ? "PASS" : "FAIL"}  ${name}`);
  if (!isOk) {
    console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  }
};

const entries = (params: URLSearchParams) => Object.fromEntries(params.entries());

console.log("BODY — the two paths write the same form:");

t(
  "browser post carries email, channel, page, tool and the minted token",
  entries(
    buildWaitlistBody({
      email: "me@corey.co",
      channel: "browser",
      context: { page: "/tools/form-spam-cost-calculator", tool: "form-spam-cost-calculator" },
      token: "eo1.ef-waitlist.abc.def.ghi",
    }),
  ),
  {
    email: "me@corey.co",
    channel: "browser",
    page: "/tools/form-spam-cost-calculator",
    tool: "form-spam-cost-calculator",
    _origin_token: "eo1.ef-waitlist.abc.def.ghi",
  },
);

t(
  "server forward is the same form, labelled for what it is",
  entries(
    buildWaitlistBody({
      email: "me@corey.co",
      channel: "server-forward",
      context: { page: "/tools/form-spam-cost-calculator", tool: "form-spam-cost-calculator" },
    }),
  ),
  {
    email: "me@corey.co",
    channel: "server-forward",
    page: "/tools/form-spam-cost-calculator",
    tool: "form-spam-cost-calculator",
  },
);

t(
  "no token field when there is no token — absence, not an empty string",
  entries(buildWaitlistBody({ email: "a@b.com", channel: "server-forward", token: "" })),
  { email: "a@b.com", channel: "server-forward" },
);

t(
  "missing context is omitted rather than sent blank",
  entries(buildWaitlistBody({ email: "a@b.com", channel: "browser", context: {} })),
  { email: "a@b.com", channel: "browser" },
);

t(
  "context is capped so nobody can stuff a column through it",
  buildWaitlistBody({
    email: "a@b.com",
    channel: "browser",
    context: { page: `/${"x".repeat(5000)}` },
  }).get("page")?.length,
  200,
);

console.log("\nTOKEN URL — one segment on from the endpoint:");

t(
  "derives the mint route from the endpoint URL",
  waitlistTokenUrl("https://endpoint.endpointforms.app/e/ef-waitlist"),
  "https://endpoint.endpointforms.app/e/ef-waitlist/token",
);
t(
  "tolerates a trailing slash",
  waitlistTokenUrl("https://endpoint.endpointforms.app/e/ef-waitlist/"),
  "https://endpoint.endpointforms.app/e/ef-waitlist/token",
);
t("unconfigured endpoint means no token to fetch", waitlistTokenUrl(""), null);
t("unparseable endpoint fails quietly rather than throwing", waitlistTokenUrl("not a url"), null);

console.log("\nACKNOWLEDGEMENT — anything short of ok:true is a failure:");

t("ok:true is stored", acknowledged({ ok: true, id: "abc" }), true);
t("ok:false is not", acknowledged({ ok: false }), false);
t("a 200 with no body is not", acknowledged(null), false);
t("a truthy string is not", acknowledged({ ok: "true" }), false);

console.log("\nREFERER — the no-JavaScript path's only clue about the page:");

t("pathname only, never the query string", pathnameOf("https://endpointforms.com/spam?utm_source=x"), "/spam");
t("no referer is not an error", pathnameOf(null), null);
t("a mangled referer is not an error", pathnameOf("://"), null);

console.log("\nPROVENANCE — what each path actually earns:");

/** Chrome 128, cross-origin `fetch()` from endpointforms.com to the render domain. */
const browserHeaders = new Headers({
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  accept: "application/json",
  "accept-language": "en-US,en;q=0.9",
  "accept-encoding": "gzip, deflate, br, zstd",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  "sec-fetch-site": "cross-site",
  origin: "https://endpointforms.com",
  referer: "https://endpointforms.com/",
  "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
});

/** What `saveToEndpoint` in `src/lib/waitlist-store.ts` actually sends. */
const serverForwardHeaders = new Headers({
  "user-agent": "EndpointForms-Waitlist/1.0 (server-forwarded; +https://endpointforms.com/)",
  accept: "application/json",
  "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
});

const browser = decideOrigin({
  surface: "form",
  headers: browserHeaders,
  endpointPublicId: "ef-waitlist",
  token: null,
});

const forwarded = decideOrigin({
  surface: "form",
  headers: serverForwardHeaders,
  endpointPublicId: "ef-waitlist",
  token: null,
});

t("a real browser's own post is stamped Human, without a token", browser.origin, "human");
t(
  "our server's forward is stamped Unverified — it cannot corroborate a browser session",
  forwarded.origin,
  "unverified",
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
