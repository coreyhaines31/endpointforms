/**
 * The shapes Origin writes down (#30).
 *
 * Kept in their own module with no imports so that a component rendering the
 * stamp, a test asserting on it, and the ingest path deciding it all name the
 * same types without any of them pulling in `node:crypto`.
 */

/**
 * Named for what we know, not what we suspect. `unverified` states our
 * confidence rather than accusing the visitor — settled in
 * `docs/00-positioning-spine.md`. Do not reintroduce "suspected bot".
 */
export type OriginState = "human" | "agent" | "unverified";

/**
 * Which door the submission came through. This is the primary fact, not an
 * inference: `manifest` is the machine-callable tool surface (#32), and `form`
 * is the endpoint a human page posts to.
 */
export type OriginSurface = "form" | "manifest";

/** Every signal we look at, as a stable key that is safe to filter and store. */
export type OriginSignalCode =
  | "surface"
  | "declared_agent"
  | "fetch_metadata"
  | "user_agent"
  | "accept"
  | "accept_language"
  | "accept_encoding"
  | "origin_referer"
  | "client_token"
  | "dwell_time"
  /**
   * The arithmetic itself, recorded as a final entry. `origin_reasons` is the
   * only column the stamp gets, so the bar the score was compared against has
   * to live inside it — otherwise a row read next year is scored against a
   * threshold that has since moved, and is quietly unreadable.
   */
  | "threshold";

/** Which way a signal pointed. `neither` is recorded, and counts for nothing. */
export type OriginDirection = "browser" | "software" | "neither";

/**
 * One line of the answer to "why is this Unverified?".
 *
 * `note` is written for the person reading a quarantined submission and
 * deciding whether to trust it, so it says what was observed rather than what
 * we concluded. `weight` is included because a reader who disagrees with the
 * verdict should be able to see exactly how much each signal moved it.
 */
export type OriginReason = {
  code: OriginSignalCode;
  direction: OriginDirection;
  /** What was actually seen, short and never the raw value of a header. */
  observed: string;
  /** Positive leans browser, negative leans software, zero is recorded only. */
  weight: number;
  note: string;
};

export type OriginDecision = {
  origin: OriginState;
  reasons: OriginReason[];
  /**
   * The sum of the weights. Stored so the threshold is inspectable rather than
   * a number buried in the code that decided someone's lead was junk.
   */
  score: number;
  /** The threshold `score` was compared against, for the same reason. */
  threshold: number;
};
