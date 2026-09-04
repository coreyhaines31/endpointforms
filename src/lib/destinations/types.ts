import type { destinationKind } from "../../db/schema.ts";
import type { OriginReason, OriginState } from "../origin/types.ts";

/**
 * The shapes the delivery engine passes around.
 *
 * Runtime-free on purpose — no database handle, no `fetch`, no Next import —
 * so a Client Component that needs to name one of these types can, and so the
 * tests can build a delivery by hand without a workspace behind it.
 */

/**
 * Derived from the enum rather than retyped, so adding a seventh kind to
 * `destination_kind` is a type error here until an adapter exists for it. The
 * schema does not export a named alias for this one, and a hand-written union
 * would be a second list to keep in step.
 */
export type DestinationKind = (typeof destinationKind.enumValues)[number];

export type DeliveryStatus = "pending" | "succeeded" | "failed";

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

/**
 * What a destination receives. **This is a public contract.** Someone else's
 * integration parses it, so fields are added and never renamed or removed;
 * `docs/28-destinations.md` is the copy of this that customers read.
 *
 * `origin` and `verdict` are the two fields that make this payload ours rather
 * than every other form builder's webhook: the receiving system gets to know
 * whether a human filled this in, and what it turned out to be worth.
 */
export type SubmissionPayload = {
  /** Always `submission.created` today. Named so a second event can exist later. */
  type: "submission.created";
  delivery: {
    /**
     * Stable across every retry of the same submission to the same destination.
     * A receiver dedupes on this; see `deliveryIdFor` in `./signature.ts`.
     */
    id: string;
    /** 1-based, and it increments. The `id` above does not. */
    attempt: number;
    /** When this attempt was made, not when the submission arrived. */
    sentAt: string;
    /** True when this was fired by the "Send a test" button, not by a real lead. */
    test: boolean;
  };
  endpoint: {
    id: string;
    name: string;
  };
  submission: {
    /** The public submission id. Also what a CRM sends back with an outcome (#43). */
    id: string;
    submittedAt: string;
    /** Human · Agent · Unverified (#30). */
    origin: OriginState;
    /** Why that stamp. A receiver can route on the signals, not just the verdict. */
    originReasons: OriginReason[];
    /** won · lost · disqualified · awaiting. Almost always `awaiting` at delivery time. */
    verdict: "won" | "lost" | "disqualified" | "awaiting";
    /** A decimal string, never a float — this is money. Null until an outcome lands. */
    verdictValue: string | null;
    verdictCurrency: string | null;
    /** The customer's own fields, exactly as stored. */
    values: Record<string, unknown>;
    attribution: {
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      utmTerm: string | null;
      utmContent: string | null;
      clickIds: Record<string, unknown>;
      referrer: string | null;
    };
    /** Which schema version this was read against, or null (#50/#51). */
    schemaVersionId: string | null;
  };
};

/** Everything the payload builder needs, read from a submission row. */
export type PayloadSource = {
  endpointPublicId: string;
  endpointName: string;
  submissionPublicId: string;
  submittedAt: Date;
  origin: OriginState;
  originReasons: OriginReason[];
  verdict: "won" | "lost" | "disqualified" | "awaiting";
  verdictValue: string | null;
  verdictCurrency: string | null;
  values: Record<string, unknown>;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  clickIds: Record<string, unknown>;
  referrer: string | null;
  schemaVersionId: string | null;
};

// ---------------------------------------------------------------------------
// Failure classification (#42)
// ---------------------------------------------------------------------------

/**
 * Why a delivery failed, in the terms the person fixing it thinks in.
 *
 * #42's whole complaint about the category is that `"It failed"` is not
 * actionable and `"your HubSpot token expired"` is. The classifier turns a
 * status code or a socket error into one of these, and the UI turns one of
 * these into a sentence with a next step in it.
 */
export type FailureKind =
  /** 401/403. Credentials are wrong, expired, or were revoked. */
  | "auth"
  /** 400/422. The target understood us and rejected the shape of the payload. */
  | "rejected"
  /** 404/410. The URL is gone. */
  | "missing"
  /** 429. We are being throttled. Always worth retrying. */
  | "throttled"
  /** 5xx. Their end is broken, not ours. */
  | "target_down"
  /** DNS, TLS, connection refused, timeout — no HTTP response at all. */
  | "network"
  /** The destination's own settings are incomplete or unusable. Ours to state. */
  | "configuration"
  /** Nothing above fits. Kept so classification never silently invents a kind. */
  | "unknown";

/** Whether a failure of this kind could plausibly succeed on a retry. */
export const RETRYABLE_FAILURES: ReadonlySet<FailureKind> = new Set<FailureKind>([
  "throttled",
  "target_down",
  "network",
  "unknown",
]);

// ---------------------------------------------------------------------------
// What an adapter does
// ---------------------------------------------------------------------------

/** One attempt, as an adapter reports it. Written straight into `delivery_attempts`. */
export type AdapterResult = {
  ok: boolean;
  /** The bytes we sent, retained so "the data is wrong" can be settled (#29). */
  requestBody: string | null;
  /** Header values are redacted before they get here. Never store a live secret. */
  requestHeaders: Record<string, string> | null;
  responseStatus: number | null;
  responseBody: string | null;
  /** Present only when `ok` is false. One sentence, aimed at whoever must fix it. */
  error: string | null;
  failure: FailureKind | null;
};

export type AdapterContext = {
  destinationName: string;
  payload: SubmissionPayload;
  /** The parsed, validated config for this kind — secrets still present. */
  config: unknown;
  /** Injected by the tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type Adapter = {
  kind: DestinationKind;
  /**
   * False for a kind we have not built. A false here keeps the option out of the
   * "add a destination" menu entirely rather than offering something that would
   * accept a lead and drop it — which is the failure mode this whole issue pair
   * exists to prevent.
   */
  available: boolean;
  /** What the option is called in the UI. */
  label: string;
  /** One line under the label. Says what it does, or why it isn't here yet. */
  blurb: string;
  deliver?: (context: AdapterContext) => Promise<AdapterResult>;
};

// ---------------------------------------------------------------------------
// What the UI reads
// ---------------------------------------------------------------------------

/**
 * The shapes the queries in `./store.ts` return.
 *
 * They live here, in the module with no runtime imports, for the same reason
 * `src/lib/workspaces/types.ts` exists: a component that needs to name one must
 * not have to import a module that opens database connections — or, for
 * `RedactedConfig`, one that pulls `node:crypto` and `zod` into the browser
 * bundle. `./store.ts` and `./config.ts` re-export these so a server module can
 * keep importing them from where the code is.
 */

/** A config as the UI receives it. Every value here is safe to render and log. */
export type RedactedConfig = {
  /** `Name: value` pairs, with secret-ish values masked. Rendered as a list. */
  summary: { label: string; value: string }[];
  /** The webhook URL, when there is one — the UI wants it as its own line. */
  url: string | null;
  /** Email recipients, for the edit form to prefill. Not a secret. */
  to: string[];
  /** Custom header names only. Values are never returned, even masked. */
  headerNames: string[];
  /** True when this kind holds a signing secret at all. Drives the rotate button. */
  hasSecret: boolean;
};

/**
 * What a destination's recent history says about whether it is working.
 *
 * `consecutiveFailures` counts failed attempts **since the last success**, which
 * is the only count that means anything: a destination with four hundred
 * lifetime failures and a success ninety seconds ago is fine, and one with two
 * failures and no success since Tuesday is not.
 *
 * `untested` is a first-class state, not a synonym for healthy. A destination
 * nobody has ever delivered to is unproven, and saying it is fine would be the
 * dashboard `docs/00-positioning-spine.md` names as the enemy.
 */
export type DestinationHealth = {
  state: "untested" | "healthy" | "degraded" | "failing" | "paused";
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastAttemptAt: Date | null;
  pendingCount: number;
  /** Deliveries that used up every attempt and stopped. The dead-letter count. */
  deadLetterCount: number;
};

export type DestinationListItem = {
  id: string;
  kind: DestinationKind;
  name: string;
  enabled: boolean;
  createdAt: Date;
  config: RedactedConfig;
  health: DestinationHealth;
  /**
   * True when this is the notification the endpoint was created with (#64)
   * rather than something the customer added. Carried so a screen can explain a
   * row nobody remembers making; it changes nothing about delivery.
   */
  defaultNotification: boolean;
};

/** One attempt, as the delivery log renders it. Both sides of the exchange. */
export type DeliveryLogRow = {
  id: string;
  attempt: number;
  status: DeliveryStatus;
  responseStatus: number | null;
  responseBody: string | null;
  requestBody: string | null;
  requestHeaders: Record<string, unknown> | null;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  nextRetryAt: Date | null;
  createdAt: Date;
  submissionId: string;
  submissionPublicId: string | null;
};

/**
 * One entry in the "add a destination" menu, with nothing behind it.
 *
 * `Adapter` carries a `deliver` function; handing one to a Client Component
 * would mean passing a server function across the boundary. This is the
 * serialisable half, and it is what the menu is actually built from.
 */
export type AdapterOption = {
  kind: DestinationKind;
  label: string;
  blurb: string;
  /** False keeps it out of the working options and into the "not yet" list. */
  available: boolean;
};
