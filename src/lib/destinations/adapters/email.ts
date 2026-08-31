import { parseConfig } from "../config.ts";
import { isMailConfigured, sendMail, MAIL_NOT_CONFIGURED } from "../mail.ts";
import { serialisePayload } from "../payload.ts";
import type { Adapter, AdapterContext, AdapterResult, SubmissionPayload } from "../types.ts";

/**
 * The email notification — the destination that exists because somebody wants a
 * lead to land in an inbox they already read.
 *
 * Two things it does that a form builder's notification email usually does not:
 *
 * - **It states the Origin stamp, first.** The subject line carries it. Someone
 *   triaging twenty of these on a phone should be able to see which one was
 *   filled in by a person without opening it, and that is the whole argument of
 *   the product reduced to seven characters in a subject line.
 * - **`Reply-To` is the lead's address** when the payload contains one, so the
 *   obvious action — hit reply — reaches the person who enquired instead of
 *   reaching us.
 *
 * Plain text and HTML both, because a notification that only renders in one is a
 * notification somebody cannot read.
 */

export const emailAdapter: Adapter = {
  kind: "email",
  available: true,
  label: "Email",
  blurb: "A notification to one or more inboxes, with the Origin stamp in the subject line.",
  deliver: deliverEmail,
};

export async function deliverEmail(context: AdapterContext): Promise<AdapterResult> {
  let config;
  try {
    config = parseConfig("email", context.config);
  } catch (error) {
    return {
      ok: false,
      requestBody: null,
      requestHeaders: null,
      responseStatus: null,
      responseBody: null,
      error: error instanceof Error ? error.message : String(error),
      failure: "configuration",
    };
  }

  if (!isMailConfigured()) {
    return {
      ok: false,
      requestBody: null,
      requestHeaders: null,
      responseStatus: null,
      responseBody: null,
      error: MAIL_NOT_CONFIGURED,
      failure: "configuration",
    };
  }

  const subject = config.subject?.trim() || defaultSubject(context.payload);
  const text = textBody(context.payload);

  const result = await sendMail(
    {
      to: config.to,
      subject,
      text,
      html: htmlBody(context.payload),
      replyTo: replyTo(context.payload) ?? undefined,
    },
    { fetchImpl: context.fetchImpl, timeoutMs: context.timeoutMs },
  );

  return {
    ok: result.ok,
    // The delivery log keeps what was sent, the same as a webhook's does. The
    // JSON rather than the rendered mail: it is the thing that can be diffed
    // against what a customer says they received.
    requestBody: serialisePayload(context.payload),
    requestHeaders: { to: config.to.join(", "), subject },
    responseStatus: result.status,
    responseBody: result.body,
    error: result.error,
    failure: result.ok ? null : result.configuration ? "configuration" : "target_down",
  };
}

const ORIGIN_LABEL = {
  human: "Human",
  agent: "Agent",
  unverified: "Unverified",
} as const;

function defaultSubject(payload: SubmissionPayload): string {
  const stamp = ORIGIN_LABEL[payload.submission.origin];
  const who = firstString(payload.submission.values, ["name", "full_name", "fullName", "email"]);
  const prefix = payload.delivery.test ? "[Test] " : "";
  return `${prefix}${stamp} submission — ${payload.endpoint.name}${who ? ` — ${who}` : ""}`;
}

/** The address a reply should reach, if the form collected one. */
function replyTo(payload: SubmissionPayload): string | null {
  const value = firstString(payload.submission.values, ["email", "work_email", "workEmail"]);
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

function textBody(payload: SubmissionPayload): string {
  const { submission, endpoint, delivery } = payload;
  const lines: string[] = [];

  if (delivery.test) {
    lines.push("THIS IS A TEST DELIVERY. Nobody submitted this form.", "");
  }

  lines.push(`${endpoint.name} — ${ORIGIN_LABEL[submission.origin]}`, "");

  for (const [key, value] of Object.entries(submission.values)) {
    lines.push(`${key}: ${formatValue(value)}`);
  }

  lines.push("", `Submitted: ${submission.submittedAt}`);
  lines.push(`Origin: ${ORIGIN_LABEL[submission.origin]}`);
  const reasons = submission.originReasons
    .map((reason) => reason.observed)
    .filter((observed) => typeof observed === "string" && observed !== "");
  if (reasons.length > 0) lines.push(`  because: ${reasons.join("; ")}`);

  const attribution = submission.attribution;
  if (attribution.utmSource || attribution.utmCampaign) {
    lines.push(
      `Source: ${attribution.utmSource ?? "—"} / ${attribution.utmMedium ?? "—"} / ${attribution.utmCampaign ?? "—"}`,
    );
  }
  lines.push(`Submission ID: ${submission.id}`);

  return lines.join("\n");
}

function htmlBody(payload: SubmissionPayload): string {
  const { submission, endpoint, delivery } = payload;

  const rows = Object.entries(submission.values)
    .map(
      ([key, value]) =>
        `<tr><th align="left" style="padding:6px 16px 6px 0;vertical-align:top;font:600 13px/1.5 ui-monospace,monospace;color:#6b6b66;text-transform:uppercase">${escapeHtml(key)}</th><td style="padding:6px 0;font:14px/1.6 system-ui,sans-serif;color:#1a1a17">${escapeHtml(formatValue(value))}</td></tr>`,
    )
    .join("");

  const banner = delivery.test
    ? `<p style="margin:0 0 20px;padding:10px 14px;border:1px solid #d8d3c4;border-radius:6px;font:14px/1.5 system-ui,sans-serif;color:#6b6b66">This is a <strong>test delivery</strong>. Nobody submitted this form.</p>`
    : "";

  return `<div style="max-width:640px;margin:0 auto;padding:24px;background:#faf8f3">
${banner}<p style="margin:0;font:600 12px/1.5 ui-monospace,monospace;color:#6b6b66;text-transform:uppercase">${escapeHtml(ORIGIN_LABEL[submission.origin])} submission</p>
<h1 style="margin:8px 0 20px;font:600 22px/1.3 system-ui,sans-serif;color:#1a1a17">${escapeHtml(endpoint.name)}</h1>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows}</table>
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e0d3;font:13px/1.7 system-ui,sans-serif;color:#6b6b66">
Submitted ${escapeHtml(submission.submittedAt)}<br>
Submission ID <code>${escapeHtml(submission.id)}</code>
</p>
</div>`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function firstString(values: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = values[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
