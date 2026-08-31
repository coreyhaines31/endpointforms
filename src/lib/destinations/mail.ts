/**
 * Sending mail, over HTTP.
 *
 * There was no mail transport in this codebase before #41 — `src/actions/form-state.ts`
 * and the invitation form both say so out loud, and hand the inviter a link to
 * pass on rather than claim an email was sent. This module is the smallest thing
 * that makes the email destination real without changing what the app depends on.
 *
 * **Why an HTTP API and not SMTP.** Adding `nodemailer` means adding a
 * dependency to a `package.json` three other agents are editing this afternoon,
 * and hand-rolling an SMTP client — EHLO, STARTTLS, AUTH, DATA, dot-stuffing —
 * means shipping a few hundred lines of protocol code that nothing in this
 * environment can actually exercise against a real server. An unverified mail
 * client is worse than no mail client: it fails in production, quietly, on the
 * exact feature whose entire pitch is that it fails loudly. So this is `fetch`
 * against Resend's HTTP API, which is a request/response we can reason about.
 *
 * **When it is not configured it says so.** No `RESEND_API_KEY` means the email
 * destination fails with a `configuration` error naming the variable. It does
 * not queue, it does not pretend, and it does not report success. A self-hoster
 * who wants SMTP has a real gap here, and it is written down in the report
 * rather than papered over.
 */

export type MailMessage = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  /** Set so a reply goes to the lead, not to us. */
  replyTo?: string;
};

export type MailResult = {
  ok: boolean;
  /** The provider's HTTP status, or null when the request never got made. */
  status: number | null;
  /** The provider's response, capped. Retained for the delivery log. */
  body: string | null;
  error: string | null;
  /** True when the failure is ours to fix by setting an env var. */
  configuration: boolean;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Who the notification appears to be from. Overridable for a self-host. */
export function mailFrom(): string {
  return process.env.MAIL_FROM ?? "Endpoint Forms <notifications@endpointforms.com>";
}

export function isMailConfigured(): boolean {
  return (process.env.RESEND_API_KEY ?? "").trim() !== "";
}

/**
 * What to tell someone whose email destination cannot send.
 *
 * **Written for two readers, and it used to be written for only one.** The
 * first draft said "Set RESEND_API_KEY (and MAIL_FROM…)", which is exactly
 * right for a self-hoster and useless-to-alarming for a customer of the hosted
 * product: they cannot set an environment variable on our deployment, and being
 * told to reads as our internals leaking through a support surface.
 *
 * So the first sentence states the fact and the consequence in terms that are
 * true for anyone, and the self-hosting instruction is parenthetical — present
 * for whoever it applies to, ignorable by everyone else. The line that matters
 * most to both is the same one: **the submission is still here.**
 */
export const MAIL_NOT_CONFIGURED =
  "Email delivery is not switched on for this deployment, so nothing was sent. The submission is still here — turn it on and redeliver from the log and nothing is lost. (Self-hosting? Set RESEND_API_KEY, and MAIL_FROM for the sender address.)";

export async function sendMail(
  message: MailMessage,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<MailResult> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  if (apiKey === "") {
    return {
      ok: false,
      status: null,
      body: null,
      error: MAIL_NOT_CONFIGURED,
      configuration: true,
    };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await doFetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: mailFrom(),
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: controller.signal,
    });

    const body = (await response.text().catch(() => "")).slice(0, 4_000) || null;

    return {
      ok: response.ok,
      status: response.status,
      body,
      error: response.ok ? null : `The mail provider answered ${response.status}.`,
      configuration: response.status === 401 || response.status === 403,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: null,
      error: `The mail provider could not be reached: ${
        error instanceof Error ? error.message : String(error)
      }`,
      configuration: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}
