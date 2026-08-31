import type {
  OriginDecision,
  OriginDirection,
  OriginReason,
  OriginSignalCode,
  OriginSurface,
} from "./types.ts";
import { verifyOriginToken, type OriginTokenCheck } from "./token.ts";

/**
 * Deciding provenance (#30).
 *
 * ## The claim this makes, exactly
 *
 * The stamp answers **which surface was used**, and how coherently the caller
 * behaved on it. It is not an identity check and it is not a spam score:
 *
 *   - `manifest` — the machine-callable tool surface (#32) — is **Agent**,
 *     full stop. Software that identifies itself as software gets a clean way
 *     through, which is the entire point of publishing that surface.
 *   - `form` is where the judgement lives, because the human page is the door
 *     everything already knocks on. A caller that looks like a browser session
 *     is **Human**; a caller that does not is **Unverified**.
 *
 * ## Why this is evidential on the form surface, and honest about it
 *
 * Every input below is a header, and every header is set by the caller. There
 * is no signal here a determined adversary cannot copy — `docs/23-origin-findings.md`
 * documents exactly how, because we tried it. What this function actually does
 * is separate **software that did not bother to look like a browser** from
 * everything else, and note when a caller told on itself.
 *
 * That is a narrower claim than "we know who filled out your form", and it is
 * the one we make.
 *
 * ## Why weights rather than a rule tree
 *
 * A rule tree hides why it fired. Every signal below is recorded with what was
 * observed and how much it counted, including the ones that counted nothing,
 * so a customer reading a quarantined lead can see the whole arithmetic and
 * disagree with it. `score` and `threshold` are stored for the same reason.
 *
 * One rule sits outside the arithmetic: a caller whose User-Agent names an HTTP
 * library is Unverified regardless of what else it sent. It declared itself.
 */

/**
 * The bar for Human on the form surface.
 *
 * Set at 2 rather than 3 deliberately. The realistic false positive is a real
 * person behind a corporate proxy that strips `Sec-Fetch-*` and `Origin`, who
 * scores around +2; the realistic false negative is a forger who copies a full
 * browser header set and clears any threshold we could pick. Raising the bar
 * therefore costs real leads and buys nothing against the adversary it is aimed
 * at, so it is set where the honest visitor is safe.
 */
export const HUMAN_THRESHOLD = 2;

export type OriginInput = {
  surface: OriginSurface;
  headers: Headers;
  /** The endpoint the token must be bound to. */
  endpointPublicId: string;
  /** Echoed by the page, from a reserved field or the header. */
  token?: string | null;
  /**
   * What the caller said it was, on the manifest surface. Recorded, never used
   * to *grant* the Agent stamp — the surface already did that.
   */
  agentDeclaration?: string | null;
  now?: number;
};

export function decideOrigin(input: OriginInput): OriginDecision {
  const now = input.now ?? Date.now();

  if (input.surface === "manifest") return decideManifest(input);

  const reasons: OriginReason[] = [
    reason("surface", "neither", "form", 0, "Submitted to the human form endpoint."),
  ];

  const declared = userAgentSignal(input.headers);
  reasons.push(declared.reason);
  reasons.push(fetchMetadataSignal(input.headers));
  reasons.push(acceptSignal(input.headers));
  reasons.push(acceptLanguageSignal(input.headers));
  reasons.push(acceptEncodingSignal(input.headers));
  reasons.push(originRefererSignal(input.headers));

  const check = verifyOriginToken(input.token, input.endpointPublicId, now);
  reasons.push(tokenSignal(check));
  const dwell = dwellSignal(check);
  if (dwell) reasons.push(dwell);

  const score = reasons.reduce((total, r) => total + r.weight, 0);

  // The one rule outside the arithmetic. A caller naming an HTTP library or a
  // browser-driving framework in its User-Agent has told us what it is, and no
  // amount of well-formed headers elsewhere should talk us out of believing it.
  const origin = declared.selfDeclared || score < HUMAN_THRESHOLD ? "unverified" : "human";

  reasons.push(
    reason(
      "threshold",
      "neither",
      `score=${score} threshold=${HUMAN_THRESHOLD}`,
      0,
      declared.selfDeclared
        ? `Unverified because the caller's User-Agent named it as software, which settles the question regardless of the score of ${score}.`
        : `Scored ${score} against a bar of ${HUMAN_THRESHOLD}.`,
    ),
  );

  return { origin, reasons, score, threshold: HUMAN_THRESHOLD };
}

/**
 * The manifest surface is categorical: using it *is* the declaration.
 *
 * Note what this does and does not mean. Agent does not mean "legitimate" — a
 * spam bot is welcome to call the tool surface and will be stamped Agent. It
 * means "this did not claim to be a person", which is the only thing that has
 * to be true for the number at the top of a customer's dashboard to stop lying.
 */
function decideManifest(input: OriginInput): OriginDecision {
  const reasons: OriginReason[] = [
    reason(
      "surface",
      "software",
      "manifest",
      0,
      "Submitted through the machine-callable tool surface, which is only reachable by software that went looking for it.",
    ),
  ];

  const declaration = clean(input.agentDeclaration) ?? clean(input.headers.get("user-agent"));
  reasons.push(
    declaration
      ? reason(
          "declared_agent",
          "software",
          truncate(declaration, 120),
          0,
          "The caller identified itself. Recorded as given and not verified — an agent can call itself anything.",
        )
      : reason(
          "declared_agent",
          "neither",
          "none",
          0,
          "The caller offered no identity. The surface it used is the stamp; naming itself is a courtesy, not a requirement.",
        ),
  );

  return { origin: "agent", reasons, score: 0, threshold: HUMAN_THRESHOLD };
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * Clients that say what they are.
 *
 * Deliberately a list of **HTTP libraries and automation frameworks**, not a
 * list of "bots". Absent from it, and absent on purpose: `libwww`, which is
 * what Lynx sends, and the various `bot`/`crawler`/`spider` tokens. Search
 * crawlers do not POST lead forms, and a text-browser user is a person. Neither
 * belongs in a rule that overrides every other signal.
 */
const AUTOMATION_UA =
  /\b(curl|wget|python-requests|python-urllib|httpx|aiohttp|okhttp|axios|node-fetch|undici|got|superagent|guzzle|libcurl|go-http-client|java|apache-httpclient|restsharp|postmanruntime|insomnia|scrapy|httpie|powershell|winhttp|lwp-request)\b/i;

/**
 * Automation that drives a real browser engine and leaves its name in the
 * User-Agent. Treated as a declaration for the same reason as the list above —
 * it said what it was — but kept separate because it is a far weaker one: the
 * whole set disappears behind a single flag, and a driven browser that clears
 * its User-Agent is indistinguishable from a person. That is measured rather
 * than assumed in `docs/23-origin-findings.md`.
 */
const HEADLESS_UA = /\b(headlesschrome|phantomjs|puppeteer|playwright|selenium|webdriver)\b/i;

/** What a browser's User-Agent has always looked like, engine token and all. */
const BROWSER_UA = /^Mozilla\/5\.0\b/i;
const BROWSER_ENGINE = /\b(gecko|applewebkit|khtml|trident|edge|edg|presto)\b/i;

function userAgentSignal(headers: Headers): { reason: OriginReason; selfDeclared: boolean } {
  const ua = clean(headers.get("user-agent"));

  if (!ua) {
    return {
      selfDeclared: false,
      reason: reason(
        "user_agent",
        "software",
        "none",
        -3,
        "No User-Agent. Every browser sends one; most scripts do not bother.",
      ),
    };
  }

  const library = AUTOMATION_UA.exec(ua)?.[0];
  if (library) {
    return {
      selfDeclared: true,
      reason: reason(
        "user_agent",
        "software",
        truncate(ua, 120),
        -6,
        `The User-Agent names ${library}, an HTTP client rather than a browser. The caller said what it was.`,
      ),
    };
  }

  const headless = HEADLESS_UA.exec(ua)?.[0];
  if (headless) {
    return {
      selfDeclared: true,
      reason: reason(
        "user_agent",
        "software",
        truncate(ua, 120),
        -4,
        `The User-Agent names ${headless}, a browser being driven by a script. Believed because it was volunteered — a driven browser that hides this is not distinguishable from a person.`,
      ),
    };
  }

  if (BROWSER_UA.test(ua) && BROWSER_ENGINE.test(ua)) {
    return {
      selfDeclared: false,
      reason: reason(
        "user_agent",
        "browser",
        truncate(ua, 120),
        2,
        "The User-Agent has the shape a browser sends. Trivially copied, so it counts for something and not for much.",
      ),
    };
  }

  return {
    selfDeclared: false,
    reason: reason(
      "user_agent",
      "software",
      truncate(ua, 120),
      -2,
      "The User-Agent is neither a browser's nor a named HTTP client's.",
    ),
  };
}

/**
 * `Sec-Fetch-*` — the strongest signal available, and still only a header.
 *
 * Its value is that browsers set it themselves and forbid page scripts from
 * touching it, so it is *internally consistent* in a way a forger has to
 * understand to reproduce: a form navigation is `mode=navigate` with
 * `dest=document`; a `fetch()` is `mode=cors|same-origin` with `dest=empty`.
 * Getting the set half-right is more telling than omitting it.
 */
function fetchMetadataSignal(headers: Headers): OriginReason {
  const mode = clean(headers.get("sec-fetch-mode"));
  const dest = clean(headers.get("sec-fetch-dest"));
  const site = clean(headers.get("sec-fetch-site"));

  if (!mode && !dest && !site) {
    return reason(
      "fetch_metadata",
      "software",
      "none",
      -1,
      "No Sec-Fetch headers. Current browsers always send them, but older ones and some corporate proxies do not, so this counts lightly.",
    );
  }

  const observed = `mode=${mode ?? "-"} dest=${dest ?? "-"} site=${site ?? "-"}`;

  // Contradiction is judged only on the pair that decides it, and only when
  // both halves arrived. A middlebox that drops one of the three is a real
  // thing; treating that as a forgery would quarantine everyone behind it.
  if (mode && dest) {
    const coherent =
      (mode === "navigate" && dest === "document") ||
      ((mode === "cors" || mode === "same-origin" || mode === "no-cors") && dest === "empty");

    if (!coherent) {
      return reason(
        "fetch_metadata",
        "software",
        observed,
        -2,
        "The Sec-Fetch headers contradict each other — not a combination a browser produces. Something set them by hand.",
      );
    }

    if (site) {
      return reason(
        "fetch_metadata",
        "browser",
        observed,
        2,
        "The Sec-Fetch headers are present and internally consistent — the combination a browser actually produces for this kind of request.",
      );
    }
  }

  // Some of the set, none of it contradictory. Worth no more than silence:
  // a partial set is what a stripping proxy leaves behind and also what a
  // half-hearted forgery looks like, and there is nothing here to separate them.
  return reason(
    "fetch_metadata",
    "software",
    observed,
    -1,
    "Only part of the Sec-Fetch set arrived. A proxy may have stripped the rest; nothing here distinguishes that from a partial forgery.",
  );
}

/** A navigating browser sends a long, q-weighted list. A script sends a wildcard. */
function acceptSignal(headers: Headers): OriginReason {
  const accept = clean(headers.get("accept"));

  if (!accept) {
    return reason("accept", "software", "none", -1, "No Accept header.");
  }
  if (/text\/html/i.test(accept)) {
    return reason(
      "accept",
      "browser",
      truncate(accept, 120),
      1,
      "Accept asks for HTML, which is what a browser rendering a page does.",
    );
  }
  if (accept.trim() === "*/*") {
    return reason(
      "accept",
      "software",
      "*/*",
      -1,
      "Accept is the bare wildcard most HTTP clients send by default.",
    );
  }
  return reason(
    "accept",
    "neither",
    truncate(accept, 120),
    0,
    "Accept names a specific type. A page's own fetch() does this too, so it settles nothing.",
  );
}

function acceptLanguageSignal(headers: Headers): OriginReason {
  const value = clean(headers.get("accept-language"));
  return value
    ? reason(
        "accept_language",
        "browser",
        truncate(value, 60),
        1,
        "Accept-Language is set. Browsers always send it; most scripts never think to.",
      )
    : reason(
        "accept_language",
        "software",
        "none",
        -1,
        "No Accept-Language. A browser would have sent one.",
      );
}

/**
 * `br` and `zstd` are the tell. Node, Python and Go all send `gzip, deflate` by
 * default; Brotli and Zstandard need a browser-grade decompressor, so almost
 * nothing offers them unless it really has one.
 */
function acceptEncodingSignal(headers: Headers): OriginReason {
  const value = clean(headers.get("accept-encoding"));
  if (!value) {
    return reason(
      "accept_encoding",
      "software",
      "none",
      -1,
      "No Accept-Encoding. Browsers always send one.",
    );
  }
  if (/\b(br|zstd)\b/i.test(value)) {
    return reason(
      "accept_encoding",
      "browser",
      truncate(value, 60),
      1,
      "Accept-Encoding offers Brotli or Zstandard, which needs a decompressor most HTTP clients do not ship.",
    );
  }
  return reason(
    "accept_encoding",
    "neither",
    truncate(value, 60),
    0,
    "Accept-Encoding offers only the encodings every HTTP client defaults to.",
  );
}

/**
 * A cross-origin form POST carries `Origin`; a same-origin one carries at least
 * `Referer`. Their *disagreement* is the interesting case — a value copied out
 * of one page and replayed against another.
 */
function originRefererSignal(headers: Headers): OriginReason {
  const originHost = host(headers.get("origin"));
  const refererHost = host(headers.get("referer"));

  if (!originHost && !refererHost) {
    return reason(
      "origin_referer",
      "software",
      "none",
      -1,
      "Neither Origin nor Referer. A browser posting a form sends at least one, though some privacy setups and proxies strip both.",
    );
  }

  if (originHost && refererHost && originHost !== refererHost) {
    return reason(
      "origin_referer",
      "software",
      `origin=${originHost} referer=${refererHost}`,
      -2,
      "Origin and Referer name different sites. A browser cannot produce that on a form post.",
    );
  }

  return reason(
    "origin_referer",
    "browser",
    `${originHost ?? refererHost}`,
    1,
    "Origin and Referer are present and agree about which page this came from.",
  );
}

/**
 * The browser-set token. **Absence is scored zero on purpose.**
 *
 * Real people block JavaScript, and a form that only works with JS is a form
 * that loses leads. A token that is present and wrong is a different matter: a
 * stale or altered one is worse evidence than none at all.
 */
function tokenSignal(check: OriginTokenCheck): OriginReason {
  switch (check.status) {
    case "valid":
      return reason(
        "client_token",
        "browser",
        `valid, ${Math.round((check.ageMs ?? 0) / 1000)}s old`,
        3,
        "The page ran JavaScript, asked this endpoint for a token, and echoed it back. Replayable by anyone who fetches one, so it is corroboration rather than proof.",
      );
    case "absent":
      return reason(
        "client_token",
        "neither",
        "none",
        0,
        "No token, which is not held against the submission — plenty of real people block JavaScript.",
      );
    case "expired":
      return reason(
        "client_token",
        "software",
        `expired, ${Math.round((check.ageMs ?? 0) / 3_600_000)}h old`,
        -3,
        "The token is ours but far older than any page session. It was kept and replayed.",
      );
    case "endpoint_mismatch":
      return reason(
        "client_token",
        "software",
        "issued for a different endpoint",
        -3,
        "The token is ours but was minted for another form. It was moved here.",
      );
    case "not_yet_valid":
      return reason(
        "client_token",
        "software",
        "timestamped in the future",
        -3,
        "The token claims to have been issued after the submission arrived.",
      );
    default:
      return reason(
        "client_token",
        "software",
        check.status,
        -3,
        "A token was sent but it is not one we issued. Something is fabricating them.",
      );
  }
}

/**
 * How long between the page asking for a token and the form arriving.
 *
 * The bar is set low — under a second — and weighted lightly, because autofill
 * is real and a returning visitor can genuinely be quick. Anything stricter
 * quarantines the people who were fastest to convert, which is precisely
 * backwards.
 */
const IMPLAUSIBLY_FAST_MS = 800;

function dwellSignal(check: OriginTokenCheck): OriginReason | null {
  if (check.status !== "valid" || check.ageMs === null) return null;

  if (check.ageMs < IMPLAUSIBLY_FAST_MS) {
    return reason(
      "dwell_time",
      "software",
      `${check.ageMs}ms`,
      -1,
      "The form arrived less than a second after the page asked for its token. Fast, but autofill is also fast, so this counts lightly.",
    );
  }

  return reason(
    "dwell_time",
    "neither",
    `${Math.round(check.ageMs / 1000)}s`,
    0,
    "Time between page load and submit, recorded for the record.",
  );
}

// ---------------------------------------------------------------------------

function reason(
  code: OriginSignalCode,
  direction: OriginDirection,
  observed: string,
  weight: number,
  note: string,
): OriginReason {
  return { code, direction, observed, weight, note };
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function host(value: string | null): string | null {
  const cleaned = clean(value);
  if (!cleaned || cleaned === "null") return null;
  try {
    return new URL(cleaned).host || null;
  } catch {
    return null;
  }
}
