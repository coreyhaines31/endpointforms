import { createHmac, timingSafeEqual } from "node:crypto";

import { SITE_URL } from "../site.ts";
import { DOWNLOAD_LINK_TTL_MS, type DownloadAudience } from "./limits.ts";
import { isStoredFileRef, type StoredFileRef } from "./types.ts";

/**
 * Signed, expiring download links (#66).
 *
 * ## Why a signature and not a session check
 *
 * The obvious design is "you are logged in and a member of the workspace, so
 * you may fetch the file". It is right for exactly one of the three readers.
 * A webhook receiver has no session. Neither does a spreadsheet. A capability —
 * a URL that carries its own authority and its own expiry — is the only shape
 * that serves all three, and it means there is **one** access path to audit
 * rather than three that could disagree about who may read what.
 *
 * ## What the URL is not
 *
 * It is not public and it is not permanent. There is no bucket, no CDN origin
 * and no unguessable-but-eternal object URL anywhere in this feature: the bytes
 * live in Postgres and the only way to them is this route, presenting a
 * signature over this file id and this expiry. A link that has expired is a
 * `403` with a sentence, not a `404` — the file is still there, the link is
 * what ran out, and telling somebody the difference is what stops a support
 * thread.
 *
 * ## The clamp
 *
 * `signDownloadUrl` takes the file's retention expiry and **never issues a link
 * that outlives it**. That is a property of the minting function rather than a
 * rule callers are asked to remember, because the caller who forgets is the one
 * that hands a customer's CV to a third party six months after we promised it
 * was deleted.
 *
 * Format: `/api/v1/files/{publicId}?e={expiryBase36}&s={signature}`
 */

const VERSION = "ef-file-v1";

/** Only in development. Production with no secret refuses to mint or verify. */
const DEV_SECRET = "endpointforms-upload-link-dev";

let warnedAboutSecret = false;

/**
 * The signing key.
 *
 * `UPLOAD_LINK_SECRET` if a deployment wants a dedicated one, otherwise
 * `AUTH_SECRET`, which every deployment already has to set — so uploads work
 * out of the box on any instance that can sign in a user, and nobody has to
 * discover a new required variable after their first customer attaches a CV.
 *
 * **In production, with neither set, this returns null and nothing is minted or
 * verified.** That is the `VERDICT_API_KEY_SECRET` rule from `docs/24` §3.1 and
 * not the `ORIGIN_TOKEN_SECRET` one, and the distinction is the same: a
 * forgeable origin token weakens a signal, whereas a forgeable download link is
 * read access to another company's files. This one refuses.
 */
function secret(): string | null {
  const configured =
    (process.env.UPLOAD_LINK_SECRET ?? "").trim() || (process.env.AUTH_SECRET ?? "").trim();
  if (configured !== "") return configured;

  if (process.env.NODE_ENV === "production") {
    if (!warnedAboutSecret) {
      warnedAboutSecret = true;
      console.warn(
        "[uploads] Neither UPLOAD_LINK_SECRET nor AUTH_SECRET is set. File uploads are refused, because a download link could not be signed.",
      );
    }
    return null;
  }
  return DEV_SECRET;
}

/**
 * Whether this instance can store files at all.
 *
 * Called on the ingest path **before** anything is written, so a deployment
 * that cannot sign a link refuses the upload at the door rather than accepting
 * bytes it could never hand back. Accepting a file you cannot serve is the same
 * dishonesty as discarding it, one step later.
 */
export function canStoreUploads(): boolean {
  return secret() !== null;
}

/** What a submitter is told when this instance cannot take files. */
export const UPLOADS_NOT_CONFIGURED =
  "This form cannot accept file attachments, so the submission was not stored — nothing was silently dropped. Remove the file and send the rest, or ask the form's owner to switch uploads on. (Self-hosting? Set AUTH_SECRET, or UPLOAD_LINK_SECRET, so download links can be signed.)";

function sign(publicId: string, expiresAt: number, key: string): string {
  return createHmac("sha256", key)
    .update(`${VERSION}\n${publicId}\n${expiresAt}`)
    .digest("base64url");
}

/**
 * A signed path for one file.
 *
 * `retentionExpiry` is the file's own expiry and is the ceiling: pass it and
 * the link cannot outlive the bytes. Pass null for a file kept indefinitely.
 *
 * Returns null when this instance has no signing key, which is the same
 * condition `canStoreUploads` reports — so a caller that skipped the check gets
 * nothing rather than an unsigned URL.
 */
export function signDownloadPath(
  publicId: string,
  audience: DownloadAudience,
  retentionExpiry: Date | null,
  now: Date = new Date(),
): string | null {
  const key = secret();
  if (key === null) return null;

  const requested = now.getTime() + DOWNLOAD_LINK_TTL_MS[audience];
  const expiresAt = retentionExpiry
    ? Math.min(requested, retentionExpiry.getTime())
    : requested;

  const signature = sign(publicId, expiresAt, key);
  return `/api/v1/files/${encodeURIComponent(publicId)}?e=${expiresAt.toString(36)}&s=${signature}`;
}

/** The same link, absolute, for a payload or a CSV cell that has no page around it. */
export function signDownloadUrl(
  publicId: string,
  audience: DownloadAudience,
  retentionExpiry: Date | null,
  now: Date = new Date(),
): string | null {
  const path = signDownloadPath(publicId, audience, retentionExpiry, now);
  return path === null ? null : new URL(path, SITE_URL).toString();
}

/** When a link minted now for this audience would stop working. */
export function linkExpiry(
  audience: DownloadAudience,
  retentionExpiry: Date | null,
  now: Date = new Date(),
): Date {
  const requested = now.getTime() + DOWNLOAD_LINK_TTL_MS[audience];
  return new Date(
    retentionExpiry ? Math.min(requested, retentionExpiry.getTime()) : requested,
  );
}

export type LinkCheck =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "malformed" | "expired" | "bad_signature" };

/**
 * Whether a presented link is good for this file, right now.
 *
 * The signature is checked with `timingSafeEqual`, and **expiry is checked
 * after the signature** so an attacker cannot use the response to learn whether
 * a guessed id exists before they have a valid signature for it.
 */
export function checkDownloadLink(
  publicId: string,
  expiryParam: string | null,
  signatureParam: string | null,
  now: Date = new Date(),
): LinkCheck {
  const key = secret();
  if (key === null) return { ok: false, reason: "unconfigured" };

  if (!expiryParam || !signatureParam) return { ok: false, reason: "malformed" };
  if (!/^[0-9a-z]{1,12}$/.test(expiryParam)) return { ok: false, reason: "malformed" };
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(signatureParam)) return { ok: false, reason: "malformed" };

  const expiresAt = Number.parseInt(expiryParam, 36);
  if (!Number.isFinite(expiresAt)) return { ok: false, reason: "malformed" };

  const expected = Buffer.from(sign(publicId, expiresAt, key), "utf8");
  const offered = Buffer.from(signatureParam, "utf8");
  // Length first: `timingSafeEqual` throws on a mismatch, and the length of a
  // signature is not itself a secret.
  if (offered.length !== expected.length) return { ok: false, reason: "bad_signature" };
  if (!timingSafeEqual(offered, expected)) return { ok: false, reason: "bad_signature" };

  if (now.getTime() > expiresAt) return { ok: false, reason: "expired" };
  return { ok: true };
}

/**
 * The same file reference, with a link minted now instead of at ingest.
 *
 * The `url` on a stored reference was signed when the submission arrived, for a
 * webhook receiver. By the time somebody exports that row it may be days old
 * and days from expiring. Re-signing on the way out means **an export is always
 * downloaded with working links**, and it costs one HMAC per file.
 *
 * Returns the reference untouched if this instance cannot sign — a dead link is
 * better than a forged one, and it will read as expired rather than as a lie.
 */
export function refreshFileRef(
  ref: StoredFileRef,
  audience: DownloadAudience,
  now: Date = new Date(),
): StoredFileRef {
  const expiry = ref.expiresAt ? new Date(ref.expiresAt) : null;
  const url = signDownloadUrl(ref.id, audience, expiry, now);
  if (url === null) return ref;
  return { ...ref, url, urlExpiresAt: linkExpiry(audience, expiry, now).toISOString() };
}

/** Every value in a payload, with each file reference re-signed. */
export function refreshFileRefsIn<T>(value: T, audience: DownloadAudience, now: Date = new Date()): T {
  if (isStoredFileRef(value)) return refreshFileRef(value, audience, now) as unknown as T;
  if (Array.isArray(value)) {
    return value.map((entry) => refreshFileRefsIn(entry, audience, now)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = refreshFileRefsIn(entry, audience, now);
    }
    return out as unknown as T;
  }
  return value;
}
