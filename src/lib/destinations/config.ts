import { z } from "zod";

import { newDestinationSecret } from "./signature.ts";
import { assertDeliverableUrl, DestinationUrlError } from "./url-guard.ts";
import type { DestinationKind, RedactedConfig } from "./types.ts";

export type { RedactedConfig };

/**
 * What each kind of destination stores, and which parts of it never come back.
 *
 * ## Secrets
 *
 * `destinations.config` is jsonb, and some of what goes in it is a credential:
 * a webhook signing secret, a Slack incoming-webhook URL (which *is* the
 * credential — anyone holding it can post to that channel), an `Authorization`
 * header a customer pasted in, a Google refresh token that can edit every sheet
 * its account can. None of it may leave the server.
 *
 * The rule enforced here is that **there is one read path for the UI and it
 * redacts** (`redactConfig`), and one read path for the delivery engine and it
 * does not (`parseConfig`). A component cannot reach the second: it is called
 * only from `./dispatch.ts`, and the page passes down the redacted shape. The
 * redaction is not "hide it in the markup" — the plaintext never reaches the
 * response at all, so View Source has nothing in it either.
 *
 * A secret is shown exactly once, at the moment it is generated, the same way
 * the invitation link in `src/components/app/forms.tsx` is. Rotating replaces
 * it and shows the new one once. There is no "reveal" button, because a stored
 * secret we can re-display is a stored secret an exported database row hands to
 * whoever reads it.
 */

const MAX_HEADERS = 10;
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

/**
 * Headers a customer may not set, because we set them and they carry meaning.
 * Letting `x-endpoint-signature` be overridden would let a destination be
 * configured to lie to its own receiver.
 */
const RESERVED_HEADERS = new Set([
  "host",
  "content-length",
  "content-type",
  "x-endpoint-event",
  "x-endpoint-delivery-id",
  "x-endpoint-attempt",
  "x-endpoint-timestamp",
  "x-endpoint-signature",
]);

// ---------------------------------------------------------------------------
// Per-kind shapes
// ---------------------------------------------------------------------------

const headersSchema = z
  .record(z.string(), z.string().max(2048))
  .refine((headers) => Object.keys(headers).length <= MAX_HEADERS, {
    message: `At most ${MAX_HEADERS} extra headers.`,
  })
  .refine(
    (headers) =>
      Object.keys(headers).every(
        (name) => HEADER_NAME.test(name) && !RESERVED_HEADERS.has(name.toLowerCase()),
      ),
    { message: "One of those header names is not usable, or is one we set ourselves." },
  );

export const webhookConfigSchema = z.object({
  url: z.string().min(1),
  /** The HMAC key. Generated, never typed — see `newDestinationSecret`. */
  secret: z.string().min(16),
  headers: headersSchema.optional(),
});

export const emailConfigSchema = z.object({
  /** One or more addresses. Stored as an array so the UI never has to re-split. */
  to: z.array(z.email()).min(1).max(10),
  /** Optional override. Empty means the default subject in `./adapters/email.ts`. */
  subject: z.string().trim().max(200).optional(),
});

export const slackConfigSchema = z.object({
  /**
   * An incoming-webhook URL. It authenticates by being unguessable, so the whole
   * string is a secret and the whole string is redacted on read.
   */
  webhookUrl: z.string().min(1),
});

/**
 * A spreadsheet id, as it appears in `docs.google.com/spreadsheets/d/{id}/`.
 *
 * Checked against an allow-list of characters rather than merely URL-encoded,
 * because it is interpolated into the path of every request to the Sheets API
 * and a `/` or `..` in it would be a request to an endpoint we never meant to
 * call, with a customer's token on it.
 */
const SPREADSHEET_ID = /^[A-Za-z0-9_-]{10,200}$/;

export const googleSheetsConfigSchema = z.object({
  spreadsheetId: z.string().regex(SPREADSHEET_ID, { message: "That is not a spreadsheet id." }),
  /** The tab. Rows are appended under its first row, which is the header. */
  sheetName: z.string().trim().min(1).max(100),
  /**
   * The OAuth refresh token (#67). **The credential** — redacted on every read,
   * never written into the delivery log, and replaced, not edited, by
   * reconnecting. See `./google.ts`.
   */
  refreshToken: z.string().min(1),
  /** The Google account that granted it, for the settings screen. Not a secret. */
  account: z.string().nullable().optional(),
  /** The spreadsheet's own title when it was connected. A label only. */
  spreadsheetTitle: z.string().optional(),
  /**
   * When this grant was made, ISO 8601. A `revoked` failure older than this is
   * about the grant it replaced — see `isDisconnected` in `./store.ts`.
   */
  connectedAt: z.string(),
});

export type WebhookConfig = z.infer<typeof webhookConfigSchema>;
export type EmailConfig = z.infer<typeof emailConfigSchema>;
export type SlackConfig = z.infer<typeof slackConfigSchema>;
export type GoogleSheetsConfig = z.infer<typeof googleSheetsConfigSchema>;

const SCHEMAS = {
  webhook: webhookConfigSchema,
  email: emailConfigSchema,
  slack: slackConfigSchema,
  google_sheets: googleSheetsConfigSchema,
} as const;

export type ConfigFor<K extends DestinationKind> = K extends "webhook"
  ? WebhookConfig
  : K extends "email"
    ? EmailConfig
    : K extends "slack"
      ? SlackConfig
      : K extends "google_sheets"
        ? GoogleSheetsConfig
        : never;

/**
 * The spreadsheet id from whatever somebody pasted — the whole browser URL,
 * which is what people actually have, or the bare id. Null when it is neither.
 */
export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (SPREADSHEET_ID.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.hostname !== "docs.google.com") return null;
  const match = /^\/spreadsheets\/d\/([^/]+)/.exec(url.pathname);
  return match && SPREADSHEET_ID.test(match[1]) ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export class DestinationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DestinationConfigError";
  }
}

/**
 * The stored config for a kind, with secrets. **Server only, delivery only.**
 *
 * Throws rather than returning null: a destination whose config this build
 * cannot read must fail its delivery loudly and land in the log as a
 * `configuration` failure, not quietly deliver a half-formed request.
 */
export function parseConfig<K extends DestinationKind>(
  kind: K,
  raw: unknown,
): ConfigFor<K> {
  const schema = SCHEMAS[kind as keyof typeof SCHEMAS];
  if (!schema) {
    throw new DestinationConfigError(
      `${kind} destinations are not available yet, so there is nothing to deliver to.`,
    );
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new DestinationConfigError(
      `This destination's settings are incomplete: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  return parsed.data as ConfigFor<K>;
}

// ---------------------------------------------------------------------------
// Building a config from a form
// ---------------------------------------------------------------------------

export type BuildConfigResult =
  | { ok: true; config: Record<string, unknown>; secret: string | null }
  | { ok: false; message: string };

/**
 * Turns what someone typed into what gets stored.
 *
 * `previous` is the existing config on an edit, so a field the form did not
 * re-send — a secret, which is never rendered back — is carried forward rather
 * than blanked. That is the bug this parameter exists to prevent: saving a
 * rename should not silently un-sign every future delivery.
 *
 * The returned `secret` is non-null only when one was just generated, and it is
 * the only time it can be shown.
 */
export function buildConfig(
  kind: DestinationKind,
  input: {
    url?: string;
    to?: string;
    subject?: string;
    webhookUrl?: string;
    headers?: string;
    rotateSecret?: boolean;
    sheetName?: string;
  },
  previous: Record<string, unknown> | null = null,
): BuildConfigResult {
  try {
    switch (kind) {
      case "webhook": {
        const url = assertDeliverableUrl(input.url ?? "").toString();

        const headers = parseHeaderLines(input.headers ?? "");
        if ("error" in headers) return { ok: false, message: headers.error };

        const existingSecret =
          typeof previous?.secret === "string" && previous.secret.length >= 16
            ? previous.secret
            : null;
        const rotate = input.rotateSecret === true || existingSecret === null;
        const secret = rotate ? newDestinationSecret() : existingSecret;

        const config: Record<string, unknown> = { url, secret };
        if (Object.keys(headers.value).length > 0) config.headers = headers.value;

        return { ok: true, config, secret: rotate ? secret : null };
      }

      case "email": {
        const to = (input.to ?? "")
          .split(/[,\n]/)
          .map((address) => address.trim())
          .filter((address) => address !== "");

        if (to.length === 0) {
          return { ok: false, message: "Give it at least one address to notify." };
        }
        const parsed = emailConfigSchema.safeParse({
          to,
          subject: input.subject?.trim() || undefined,
        });
        if (!parsed.success) {
          return {
            ok: false,
            message:
              "One of those isn’t an email address. Separate several with commas or new lines.",
          };
        }
        return { ok: true, config: parsed.data, secret: null };
      }

      case "slack": {
        const raw = (input.webhookUrl ?? "").trim();
        // Carried forward on an edit that did not retype it — the field renders
        // empty because the value is a secret, and an empty field must not mean
        // "delete the credential".
        if (raw === "" && typeof previous?.webhookUrl === "string") {
          return { ok: true, config: { webhookUrl: previous.webhookUrl }, secret: null };
        }

        const url = assertDeliverableUrl(raw);
        if (url.hostname !== "hooks.slack.com") {
          return {
            ok: false,
            message:
              "That isn’t a Slack incoming webhook. It should start https://hooks.slack.com/services/ — create one under Incoming Webhooks in your Slack app.",
          };
        }
        return { ok: true, config: { webhookUrl: url.toString() }, secret: null };
      }

      case "google_sheets": {
        // There is no form that creates one. The credential comes from Google's
        // consent screen, so a new Sheets destination is only ever written by the
        // OAuth callback — a post that arrives here without a previous config is
        // one that skipped it.
        const parsed = googleSheetsConfigSchema.safeParse(previous);
        if (!parsed.success) {
          return {
            ok: false,
            message: "Connect a Google account to add a Google Sheets destination.",
          };
        }
        // An edit may rename the tab. Everything else — the token, the
        // spreadsheet, the account — changes only by reconnecting, because only
        // reconnecting can prove the new combination is writable.
        const sheetName = (input.sheetName ?? "").trim();
        if (sheetName.length > 100) return { ok: false, message: "That tab name is too long." };
        return {
          ok: true,
          config: { ...parsed.data, sheetName: sheetName || parsed.data.sheetName },
          secret: null,
        };
      }

      default:
        return {
          ok: false,
          message: `${kind} destinations are not available yet.`,
        };
    }
  } catch (error) {
    if (error instanceof DestinationUrlError) return { ok: false, message: error.message };
    throw error;
  }
}

/** `Name: value` per line. The format someone already has in their head. */
function parseHeaderLines(
  input: string,
): { value: Record<string, string> } | { error: string } {
  const headers: Record<string, string> = {};

  for (const line of input.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    const separator = trimmed.indexOf(":");
    if (separator <= 0) {
      return { error: `Headers go one per line, as "Name: value". Couldn’t read ${JSON.stringify(trimmed.slice(0, 40))}.` };
    }

    const name = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();

    if (!HEADER_NAME.test(name)) {
      return { error: `${JSON.stringify(name)} is not a usable header name.` };
    }
    if (RESERVED_HEADERS.has(name.toLowerCase())) {
      return { error: `${name} is set by us on every delivery and can’t be overridden.` };
    }
    headers[name] = value;
  }

  if (Object.keys(headers).length > MAX_HEADERS) {
    return { error: `At most ${MAX_HEADERS} extra headers.` };
  }
  return { value: headers };
}

// ---------------------------------------------------------------------------
// Redaction — the only shape a page or a component ever sees
// ---------------------------------------------------------------------------

/** `whsec_abc…xyz` — enough to tell two secrets apart, not enough to use one. */
export function maskSecret(value: string): string {
  if (value.length <= 12) return "•".repeat(8);
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

/**
 * A Slack webhook URL, masked. The path segments *are* the credential, so the
 * host survives and everything after `/services/` does not.
 */
function maskSlackUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}/services/…`;
  } catch {
    return "•".repeat(8);
  }
}

/**
 * The one read path a page is allowed to use.
 *
 * Deliberately total: an unknown kind, or a config this build cannot parse,
 * returns an empty-but-valid shape rather than throwing. A destinations screen
 * that 500s because one row is malformed is a screen on which nobody can find
 * out that a destination is broken — which is the one thing it exists to say.
 */
export function redactConfig(kind: DestinationKind, raw: unknown): RedactedConfig {
  const config = (raw ?? {}) as Record<string, unknown>;
  const empty: RedactedConfig = {
    summary: [],
    url: null,
    to: [],
    headerNames: [],
    hasSecret: false,
    sheet: null,
  };

  switch (kind) {
    case "webhook": {
      const url = typeof config.url === "string" ? config.url : null;
      const secret = typeof config.secret === "string" ? config.secret : null;
      const headerNames = Object.keys(
        (config.headers ?? {}) as Record<string, unknown>,
      ).sort();

      return {
        summary: [
          ...(url ? [{ label: "URL", value: url }] : []),
          { label: "Signing secret", value: secret ? maskSecret(secret) : "not set" },
          ...(headerNames.length > 0
            ? [{ label: "Extra headers", value: headerNames.join(", ") }]
            : []),
        ],
        url,
        to: [],
        headerNames,
        hasSecret: secret !== null,
        sheet: null,
      };
    }

    case "email": {
      const to = Array.isArray(config.to)
        ? config.to.filter((value): value is string => typeof value === "string")
        : [];
      const subject = typeof config.subject === "string" ? config.subject : null;
      return {
        summary: [
          { label: "To", value: to.length > 0 ? to.join(", ") : "not set" },
          ...(subject ? [{ label: "Subject", value: subject }] : []),
        ],
        url: null,
        to,
        headerNames: [],
        hasSecret: false,
        sheet: null,
      };
    }

    case "slack": {
      const webhookUrl = typeof config.webhookUrl === "string" ? config.webhookUrl : null;
      return {
        summary: [
          {
            label: "Incoming webhook",
            value: webhookUrl ? maskSlackUrl(webhookUrl) : "not set",
          },
        ],
        url: null,
        to: [],
        headerNames: [],
        hasSecret: false,
        sheet: null,
      };
    }

    case "google_sheets": {
      // The refresh token is the only secret, and it is the one field that is
      // never read here. The spreadsheet id is not a credential — opening the
      // link still needs a Google account with access — so it is shown.
      const spreadsheetId =
        typeof config.spreadsheetId === "string" ? config.spreadsheetId : null;
      const sheetName = typeof config.sheetName === "string" ? config.sheetName : null;
      const title =
        typeof config.spreadsheetTitle === "string" && config.spreadsheetTitle !== ""
          ? config.spreadsheetTitle
          : null;
      const account = typeof config.account === "string" ? config.account : null;

      return {
        summary: [
          { label: "Spreadsheet", value: title ?? spreadsheetId ?? "not set" },
          { label: "Tab", value: sheetName ?? "not set" },
          { label: "Connected as", value: account ?? "not set" },
        ],
        url: null,
        to: [],
        headerNames: [],
        hasSecret: false,
        sheet: spreadsheetId
          ? { spreadsheetId, sheetName: sheetName ?? "", account }
          : null,
      };
    }

    default:
      return empty;
  }
}
