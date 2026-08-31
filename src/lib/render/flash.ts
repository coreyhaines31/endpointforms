import { z } from "zod";

import type { IssueCode, ValidationIssue } from "../schema/validate.ts";

/**
 * Carrying a rejected submission back to the form, without JavaScript.
 *
 * ## The problem
 *
 * A form posts, the server finds an error, and the visitor has to see it *on
 * the form, in the fields, with what they typed still in them*. With no
 * JavaScript there are exactly two ways to do that: answer the POST with the
 * re-rendered page, or redirect and carry the state across. The first makes
 * refresh re-post the lead; the second is Post/Redirect/Get, which is the
 * pattern the web settled on for this thirty years ago.
 *
 * So: a short-lived, path-scoped, HttpOnly cookie, set on the redirect and read
 * once by the page. It holds the visitor's own answers on their way back to
 * their own browser, for two minutes.
 *
 * ## Why the messages are not in here
 *
 * Only `{field, code}` pairs travel. The sentence a visitor reads is built at
 * render time from the code and the schema field (`./messages.ts`), which means
 * a cookie somebody hand-writes cannot put text on the page — there is nothing
 * in the payload that is ever printed. It also means the wording can change
 * without a stale cookie showing yesterday's copy.
 *
 * ## Why the page does not clear it
 *
 * A Server Component cannot set a cookie in Next.js, so the page cannot delete
 * what it reads. Instead the redirect target carries `?e=1` and the cookie is
 * only consulted when that flag is present: a plain reload of the form's own
 * URL is always a clean form, and the cookie ages out on its own.
 */

/** Query flag on the redirect target. Its absence means "ignore any cookie". */
export const ERROR_FLAG = "e";

/**
 * Two minutes. Long enough to survive the redirect and a slow phone, short
 * enough that a shared machine does not hand the next person a filled form.
 */
const MAX_AGE_SECONDS = 120;

/**
 * Browsers cap a cookie at about 4 KB including the name and attributes. This
 * is the ceiling for the encoded payload, left short of it on purpose.
 */
const MAX_PAYLOAD_BYTES = 3_300;

/** A defensive cap; a schema may declare 250 fields but no visitor fixes 250. */
const MAX_ERRORS = 50;

const payloadSchema = z.object({
  /** `[fieldKey, code]` pairs. A null key is an error about the whole form. */
  e: z.array(z.tuple([z.string().nullable(), z.string()])).max(MAX_ERRORS),
  /** What the visitor typed, by field key. */
  v: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  /** True when an answer was too large to carry back and had to be dropped. */
  t: z.boolean().optional(),
});

export type FlashPayload = {
  errors: { field: string | null; code: IssueCode }[];
  values: Record<string, string | string[]>;
  truncated: boolean;
};

export function cookieName(formId: string): string {
  return `ef_retry_${formId}`;
}

/**
 * Builds the cookie value.
 *
 * Values are added one field at a time, in schema order, and any single answer
 * that would push the payload over the cap is **dropped whole rather than
 * truncated**. A silently shortened message is one the visitor sends without
 * noticing; an empty box is one they refill.
 */
export function encodeFlash(
  errors: ValidationIssue[],
  values: Record<string, string | string[]>,
  fieldOrder: readonly string[],
): string {
  const payload: z.infer<typeof payloadSchema> = {
    e: errors.slice(0, MAX_ERRORS).map((issue) => [issue.field, issue.code]),
  };

  const kept: Record<string, string | string[]> = {};
  let dropped = false;

  for (const key of fieldOrder) {
    const value = values[key];
    if (value === undefined) continue;
    kept[key] = value;
    if (encodedSize({ ...payload, v: kept }) > MAX_PAYLOAD_BYTES) {
      delete kept[key];
      dropped = true;
    }
  }

  if (Object.keys(kept).length > 0) payload.v = kept;
  if (dropped) payload.t = true;

  return encode(payload);
}

export function decodeFlash(raw: string | undefined): FlashPayload | null {
  if (!raw) return null;

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return null;

  return {
    errors: parsed.data.e.map(([field, code]) => ({ field, code: code as IssueCode })),
    values: parsed.data.v ?? {},
    truncated: parsed.data.t === true,
  };
}

/**
 * The `Set-Cookie` header for a rejected submission.
 *
 * `Path` is the form's own URL, so one form's retry state is never sent to
 * another's. `SameSite=Lax` is what makes it arrive at all: the redirect is a
 * top-level GET navigation, which Lax allows and Strict would not after a
 * cross-site POST.
 */
export function flashCookie(formId: string, value: string, secure: boolean): string {
  const parts = [
    `${cookieName(formId)}=${value}`,
    `Path=/f/${formId}`,
    `Max-Age=${MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function encodedSize(payload: unknown): number {
  return encode(payload).length;
}
