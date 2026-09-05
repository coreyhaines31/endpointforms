/**
 * What we call a file, what we think it is, and how it leaves the building.
 *
 * ## The declared content type is attacker-controlled
 *
 * `Content-Type` on a multipart part is a string the client chose. So is the
 * filename. Neither is evidence, and the consequence is specific: an uploaded
 * `.html` served back inline from a domain that carries our session cookie is
 * stored cross-site scripting, and an uploaded `.svg` is the same thing wearing
 * an image's clothes.
 *
 * The defence here is not a guess about the file. It is that **nothing is ever
 * served as anything except an opaque download**:
 *
 *   - `Content-Type: application/octet-stream`, always, for every file. Not the
 *     declared type, not the sniffed type. There is no allow-list of types we
 *     render inline, because an allow-list is a list somebody eventually adds
 *     `application/pdf` to, and a PDF renders JavaScript.
 *   - `Content-Disposition: attachment`, always, with the filename escaped both
 *     ways RFC 6266 allows so a comma or a quote in it cannot break the header.
 *   - `X-Content-Type-Options: nosniff`, so a browser does not overrule the
 *     first line by looking at the bytes itself.
 *   - `Content-Security-Policy: default-src 'none'; sandbox`, which neuters
 *     the document even if something above is bypassed.
 *
 * The sniffed type is therefore **not** a security control. It is recorded, and
 * shown in the inbox, for one reason: so a person looking at a submission can
 * see that the thing called `invoice.pdf` starts with `MZ`. That is worth
 * knowing and it is worth showing; it is not worth trusting.
 */

/** The only content type a stored file is ever served as. */
export const DOWNLOAD_CONTENT_TYPE = "application/octet-stream";

/**
 * The response headers every download carries. One object, so a second download
 * path cannot ship with three of the four.
 */
export function downloadHeaders(filename: string, size: number): Record<string, string> {
  return {
    "content-type": DOWNLOAD_CONTENT_TYPE,
    "content-length": String(size),
    "content-disposition": contentDisposition(filename),
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    // One tenant's file behind one signature. Never a shared cache.
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
  };
}

/**
 * `attachment; filename="cv.pdf"; filename*=UTF-8''cv.pdf`
 *
 * Both forms, per RFC 6266: the quoted one for anything that cannot read the
 * extended one, and the percent-encoded one so a name in Japanese survives. The
 * ASCII fallback is aggressively reduced — anything outside a safe set becomes
 * `_` — because a `"` or a `\` in it would end the quoted string early and let
 * a filename inject a header parameter.
 */
export function contentDisposition(filename: string): string {
  const safe = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "download";
  const encoded = encodeURIComponent(filename) || "download";
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

/**
 * The submitter's filename, made safe to store and to show.
 *
 * It is **display text and nothing else** — the storage key is a UUID and the
 * URL is a public id, so a traversal in here cannot reach a path. It is still
 * reduced, because it is rendered in a browser and put in a header:
 *
 *   - Everything up to the last `/` or `\` is dropped, so `../../etc/passwd`
 *     shows as `passwd`. Windows sends full paths in some browsers.
 *   - Control characters and NUL go, for the reason `sanitizeString` in
 *     `../ingest/body.ts` exists: Postgres refuses them in `text`.
 *   - A leading dot is kept but a name of only dots is not, so `..` cannot be a
 *     filename.
 *   - Capped at 200 characters, keeping the extension, because the tail is the
 *     informative half of a long name.
 */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (cleaned === "" || /^\.+$/.test(cleaned)) return "file";
  if (cleaned.length <= 200) return cleaned;

  const dot = cleaned.lastIndexOf(".");
  const extension = dot > 0 && cleaned.length - dot <= 16 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 200 - extension.length) + extension;
}

/**
 * What the first bytes say the file is, or null.
 *
 * A short table on purpose. This is a note for a human reading the inbox, not a
 * gate, so covering the formats a lead form actually receives — documents,
 * images, archives — is the whole requirement. An unrecognised file is
 * `null`, which the inbox shows as "not recognised", and that is a truthful
 * answer rather than a missing one.
 */
export function detectContentType(bytes: Uint8Array): string | null {
  for (const { magic, offset, type } of SIGNATURES) {
    if (startsWith(bytes, magic, offset)) return type;
  }
  return null;
}

function startsWith(bytes: Uint8Array, magic: number[], offset: number): boolean {
  if (bytes.length < offset + magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[offset + i] !== magic[i]) return false;
  }
  return true;
}

/**
 * Longest and most specific first, because `startsWith` takes the first match.
 * `application/zip` sits at the bottom: docx, xlsx and pptx are all zips, and
 * calling one a zip is less wrong than calling all zips a docx.
 */
const SIGNATURES: { magic: number[]; offset: number; type: string }[] = [
  { magic: [0x25, 0x50, 0x44, 0x46, 0x2d], offset: 0, type: "application/pdf" }, // %PDF-
  { magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0, type: "image/png" },
  { magic: [0xff, 0xd8, 0xff], offset: 0, type: "image/jpeg" },
  { magic: [0x47, 0x49, 0x46, 0x38], offset: 0, type: "image/gif" },
  { magic: [0x57, 0x45, 0x42, 0x50], offset: 8, type: "image/webp" }, // RIFF....WEBP
  { magic: [0x42, 0x4d], offset: 0, type: "image/bmp" },
  { magic: [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], offset: 4, type: "image/heic" },
  { magic: [0x66, 0x74, 0x79, 0x70], offset: 4, type: "video/mp4" },
  { magic: [0x1f, 0x8b], offset: 0, type: "application/gzip" },
  { magic: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], offset: 0, type: "application/x-7z-compressed" },
  { magic: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], offset: 0, type: "application/vnd.rar" },
  { magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], offset: 0, type: "application/x-ole-storage" }, // legacy .doc/.xls
  { magic: [0x4d, 0x5a], offset: 0, type: "application/x-msdownload" }, // MZ — a Windows executable
  { magic: [0x7f, 0x45, 0x4c, 0x46], offset: 0, type: "application/x-elf" },
  { magic: [0x50, 0x4b, 0x03, 0x04], offset: 0, type: "application/zip" },
];
