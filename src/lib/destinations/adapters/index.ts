import type { Adapter, AdapterOption, DestinationKind } from "../types.ts";
import { emailAdapter } from "./email.ts";
import { slackAdapter } from "./slack.ts";
import { webhookAdapter } from "./webhook.ts";

/**
 * Every kind of destination the enum knows about, and — honestly — which of
 * them actually work.
 *
 * `destination_kind` in the schema lists six. Three of them are built. The other
 * three appear here with `available: false` and a sentence saying so, and the
 * "add a destination" screen renders them as unavailable rather than leaving
 * them out.
 *
 * That is a deliberate choice and it is the whole argument of #42 applied to our
 * own UI. The tempting alternatives are both worse:
 *
 * - **Offer them and stub the delivery.** Someone connects HubSpot, sees a row
 *   appear in a list, and finds out three weeks later that no lead ever
 *   arrived. That is precisely "the dashboard that says everything is fine while
 *   sales drowns in junk", with our logo on it.
 * - **Hide them entirely.** Then the answer to "do you do HubSpot?" is silence,
 *   and silence reads as no. Naming them and saying "not yet" is the true
 *   answer, and it is also the one that keeps the roadmap honest.
 *
 * A kind with `available: false` has no `deliver`, so there is no code path in
 * which one silently accepts a submission.
 */

const googleSheetsAdapter: Adapter = {
  kind: "google_sheets",
  available: false,
  label: "Google Sheets",
  blurb:
    "Not yet available. It needs OAuth and token refresh, and a half-built one would drop rows silently.",
};

const hubspotAdapter: Adapter = {
  kind: "hubspot",
  available: false,
  label: "HubSpot",
  blurb:
    "Not yet available. Until it maps your properties correctly it would create contacts you'd have to clean up.",
};

const salesforceAdapter: Adapter = {
  kind: "salesforce",
  available: false,
  label: "Salesforce",
  blurb:
    "Not yet available. Send it a webhook in the meantime — Salesforce Flow can receive one.",
};

export const ADAPTERS: Record<DestinationKind, Adapter> = {
  webhook: webhookAdapter,
  email: emailAdapter,
  slack: slackAdapter,
  google_sheets: googleSheetsAdapter,
  hubspot: hubspotAdapter,
  salesforce: salesforceAdapter,
};

/** In the order the "add a destination" menu shows them: simplest first. */
export const ADAPTER_ORDER: readonly DestinationKind[] = [
  "webhook",
  "email",
  "slack",
  "google_sheets",
  "hubspot",
  "salesforce",
] as const;

export const AVAILABLE_KINDS: readonly DestinationKind[] = ADAPTER_ORDER.filter(
  (kind) => ADAPTERS[kind].available,
);

export function adapterFor(kind: DestinationKind): Adapter {
  return ADAPTERS[kind];
}

export function isAvailableKind(value: string): value is DestinationKind {
  return (
    Object.hasOwn(ADAPTERS, value) && ADAPTERS[value as DestinationKind].available
  );
}

export type { AdapterOption };

export const ADAPTER_OPTIONS: readonly AdapterOption[] = ADAPTER_ORDER.map((kind) => {
  const adapter = ADAPTERS[kind];
  return {
    kind,
    label: adapter.label,
    blurb: adapter.blurb,
    available: adapter.available,
  };
});

export { emailAdapter, slackAdapter, webhookAdapter };
