/**
 * File uploads — the parts that need no database (#66).
 *
 * Written from the same question as `tests/ingest.test.mts`: **how does this
 * lose somebody's file, or hand it to the wrong person?** Not "which lines are
 * covered". So the assertions cluster around three things:
 *
 *   1. **A link cannot outlive the bytes.** The clamp in `signDownloadPath` is
 *      the only thing standing between a retention promise and a CV that is
 *      still fetchable a year after we said it was deleted.
 *   2. **A signature is a signature.** One bit changed anywhere — the id, the
 *      expiry, the MAC — and it fails.
 *   3. **A filename is display text, and hostile.** Path separators, control
 *      characters, quotes that would break out of a `Content-Disposition`.
 *
 * `tests/uploads-db.test.mts` covers the half that needs Postgres, including
 * the one that matters most: a file that cannot be stored does not produce a
 * submission that claims it was.
 */

process.env.UPLOAD_LINK_SECRET = "uploads-test-secret";

import {
  canStoreUploads,
  checkDownloadLink,
  linkExpiry,
  refreshFileRef,
  signDownloadPath,
  signDownloadUrl,
} from "../src/lib/uploads/links.ts";
import {
  allowedTypes,
  isTypeAllowed,
  retentionDays,
  retentionExpiry,
  uploadLimits,
} from "../src/lib/uploads/limits.ts";
import {
  contentDisposition,
  detectContentType,
  downloadHeaders,
  sanitizeFilename,
} from "../src/lib/uploads/serve.ts";
import {
  collectFileRefs,
  dropForgedFileRefsIn,
  formatBytes,
  isStoredFileRef,
  type StoredFileRef,
} from "../src/lib/uploads/types.ts";

let pass = 0;
let fail = 0;

const t = (name: string, got: unknown, want: unknown) => {
  const isOk = JSON.stringify(got) === JSON.stringify(want);
  if (isOk) pass++;
  else fail++;
  console.log(`  ${isOk ? "PASS" : "FAIL"}  ${name}`);
  if (!isOk) {
    console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  }
};

const ok = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) pass++;
  else fail++;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

const NOW = new Date("2026-09-04T12:00:00.000Z");

function expiryOf(path: string): number {
  const query = new URLSearchParams(path.slice(path.indexOf("?") + 1));
  return Number.parseInt(query.get("e") ?? "", 36);
}

function parts(path: string): { e: string; s: string } {
  const query = new URLSearchParams(path.slice(path.indexOf("?") + 1));
  return { e: query.get("e") ?? "", s: query.get("s") ?? "" };
}

// ---------------------------------------------------------------------------

console.log("\nsigned links — a link is a capability with an expiry on it");
{
  const path = signDownloadPath("file0000000000aa", "page", null, NOW);
  ok("a link is minted", path !== null, path);
  ok(
    "it points at the download route",
    path!.startsWith("/api/v1/files/file0000000000aa?"),
    path,
  );

  const { e, s } = parts(path!);
  t("the signature verifies", checkDownloadLink("file0000000000aa", e, s, NOW), { ok: true });

  t(
    "a tampered signature does not",
    checkDownloadLink("file0000000000aa", e, `${s.slice(0, -1)}${s.endsWith("A") ? "B" : "A"}`, NOW),
    { ok: false, reason: "bad_signature" },
  );
  t(
    "the same signature on another file does not",
    checkDownloadLink("file0000000000bb", e, s, NOW),
    { ok: false, reason: "bad_signature" },
  );
  t(
    "moving the expiry invalidates it — the MAC covers both",
    checkDownloadLink("file0000000000aa", (expiryOf(path!) + 1).toString(36), s, NOW),
    { ok: false, reason: "bad_signature" },
  );
  t(
    "a missing signature is malformed, not merely wrong",
    checkDownloadLink("file0000000000aa", e, null, NOW),
    { ok: false, reason: "malformed" },
  );

  const afterTtl = new Date(NOW.getTime() + 16 * 60 * 1000);
  t(
    "a page link is dead a quarter of an hour later",
    checkDownloadLink("file0000000000aa", e, s, afterTtl),
    { ok: false, reason: "expired" },
  );
  // The distinction matters: an expired link says so, so the person holding one
  // is told to reload rather than told the file does not exist.
  ok(
    "and expiry is reported as expiry, not as a bad signature",
    checkDownloadLink("file0000000000aa", e, s, afterTtl).ok === false,
  );
}

console.log("\nthe clamp — no link outlives the bytes it points at");
{
  // Retention two days out; a delivery link wants seven. The file wins.
  const retention = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
  const clamped = signDownloadPath("file0000000000cc", "delivery", retention, NOW);
  t("a seven-day link is cut to the two days the file has", expiryOf(clamped!), retention.getTime());
  t("and `linkExpiry` agrees with what was signed", linkExpiry("delivery", retention, NOW).getTime(), retention.getTime());

  // Retention far out; the audience TTL is the binding one.
  const far = new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000);
  const normal = signDownloadPath("file0000000000cc", "page", far, NOW);
  t(
    "a page link is fifteen minutes even when the file is kept for a year",
    expiryOf(normal!) - NOW.getTime(),
    15 * 60 * 1000,
  );

  // The control for the two assertions above: without a retention date the
  // delivery link really is seven days, so the clamp is doing work rather than
  // the number happening to match.
  const unclamped = signDownloadPath("file0000000000cc", "delivery", null, NOW);
  t(
    "with no retention a delivery link is its full seven days",
    expiryOf(unclamped!) - NOW.getTime(),
    7 * 24 * 60 * 60 * 1000,
  );

  // A file already past its retention cannot be linked into the future at all.
  const past = new Date(NOW.getTime() - 1000);
  const dead = signDownloadPath("file0000000000cc", "delivery", past, NOW);
  ok("a link for an already-expired file is born expired", expiryOf(dead!) < NOW.getTime());
  const { e, s } = parts(dead!);
  t("and it does not verify", checkDownloadLink("file0000000000cc", e, s, NOW), {
    ok: false,
    reason: "expired",
  });
}

console.log("\nre-signing — an export downloaded today has links that work today");
{
  const ref: StoredFileRef = {
    file: true,
    id: "file0000000000dd",
    filename: "cv.pdf",
    contentType: "application/pdf",
    detectedType: "application/pdf",
    size: 1024,
    sha256: "a".repeat(64),
    stored: true,
    url: "https://endpointforms.com/api/v1/files/file0000000000dd?e=0&s=stale",
    urlExpiresAt: new Date(NOW.getTime() - 1000).toISOString(),
    expiresAt: null,
  };

  const fresh = refreshFileRef(ref, "export", NOW);
  ok("the stale url is replaced", fresh.url !== ref.url, fresh.url);
  ok("everything else is untouched", fresh.sha256 === ref.sha256 && fresh.filename === ref.filename);

  const query = new URLSearchParams(fresh.url.slice(fresh.url.indexOf("?") + 1));
  t(
    "and the fresh one verifies",
    checkDownloadLink("file0000000000dd", query.get("e"), query.get("s"), NOW),
    { ok: true },
  );
}

console.log("\nfilenames — display text, and hostile");
{
  t("a path is reduced to its last segment", sanitizeFilename("../../etc/passwd"), "passwd");
  t("a Windows path too", sanitizeFilename("C:\\Users\\ana\\cv.pdf"), "cv.pdf");
  t("control characters go", sanitizeFilename("cv\u0000\u0007.pdf"), "cv.pdf");
  t("a name of only dots is not a name", sanitizeFilename(".."), "file");
  t("an empty name is not a name", sanitizeFilename(""), "file");
  t("a leading dot is fine", sanitizeFilename(".gitignore"), ".gitignore");
  t("ordinary names are untouched", sanitizeFilename("Ana's résumé (2026).pdf"), "Ana's résumé (2026).pdf");
  ok("a very long name is cut but keeps its extension", sanitizeFilename(`${"a".repeat(400)}.pdf`).endsWith(".pdf"));
  t("and to the cap", sanitizeFilename(`${"a".repeat(400)}.pdf`).length, 200);
}

console.log("\ncontent-disposition — a filename cannot break out of the header");
{
  const header = contentDisposition('ev"il\\.pdf');
  ok("quotes and backslashes are neutralised in the ASCII form", !/[\\]/.test(header.split(";")[1]), header);
  ok(
    "the quoted parameter closes where it should",
    header.split(";")[1].trim() === 'filename="ev_il_.pdf"',
    header,
  );
  ok("the extended form carries the real name", header.includes("filename*=UTF-8''ev%22il%5C.pdf"), header);

  const unicode = contentDisposition("履歴書.pdf");
  ok("a non-ASCII name survives in the extended form", unicode.includes("filename*=UTF-8''"), unicode);
  ok("and is replaced, not dropped, in the fallback", unicode.includes('filename="___.pdf"'), unicode);
}

console.log("\nserving — every download is an opaque attachment");
{
  const headers = downloadHeaders("evil.html", 12);
  t("never the declared type", headers["content-type"], "application/octet-stream");
  ok("always an attachment", headers["content-disposition"].startsWith("attachment;"), headers);
  t("the browser may not sniff around it", headers["x-content-type-options"], "nosniff");
  t("and the document is sandboxed", headers["content-security-policy"], "default-src 'none'; sandbox");
  t("never cached anywhere shared", headers["cache-control"], "private, no-store");
}

console.log("\ndetection — recorded, shown, never trusted");
{
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  t("a PDF is recognised", detectContentType(pdf), "application/pdf");

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  t("a PNG is recognised", detectContentType(png), "image/png");

  // The whole reason this exists: a Windows executable calling itself a PDF.
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
  t("an MZ header is named for what it is", detectContentType(exe), "application/x-msdownload");

  t("something unrecognised is null, not a guess", detectContentType(new Uint8Array([1, 2, 3])), null);
  t("and an empty file is null rather than a crash", detectContentType(new Uint8Array([])), null);
}

console.log("\ntype allow-list — off by default, exact when on");
{
  t("unset means everything is accepted", allowedTypes(), null);
  ok("and `isTypeAllowed` agrees", isTypeAllowed("text/html", null));

  process.env.UPLOAD_ALLOWED_TYPES = "application/pdf, image/*";
  const list = allowedTypes();
  t("a configured list is parsed", list, ["application/pdf", "image/*"]);
  ok("an exact match passes", isTypeAllowed("application/pdf", list));
  ok("a family wildcard passes", isTypeAllowed("image/png", list));
  ok("parameters on the header are ignored", isTypeAllowed("application/pdf; charset=binary", list));
  ok("case is ignored", isTypeAllowed("APPLICATION/PDF", list));
  ok("anything else is refused", !isTypeAllowed("text/html", list));
  ok("and a near miss is refused", !isTypeAllowed("application/pdfx", list));
  delete process.env.UPLOAD_ALLOWED_TYPES;
  t("unsetting it restores everything", allowedTypes(), null);
}

console.log("\ncaps and retention — read from the environment, at call time");
{
  const defaults = uploadLimits();
  t("the default per-file cap is 4 MiB", defaults.maxFileBytes, 4 * 1024 * 1024);
  t("the default per-submission cap is 4 MiB", defaults.maxTotalBytes, 4 * 1024 * 1024);
  ok(
    "the envelope is larger than the files it must carry, with room for fields",
    defaults.maxMultipartBodyBytes > defaults.maxTotalBytes,
    defaults,
  );
  ok(
    "and stays under Vercel's 4,500,000-byte request limit, so our refusal is the one seen",
    defaults.maxMultipartBodyBytes < 4_500_000,
    defaults.maxMultipartBodyBytes,
  );

  process.env.UPLOAD_MAX_FILE_BYTES = "1024";
  t("a cap can be lowered by configuration", uploadLimits().maxFileBytes, 1024);
  process.env.UPLOAD_MAX_FILE_BYTES = "not-a-number";
  t("and a nonsense value falls back rather than throwing", uploadLimits().maxFileBytes, 4 * 1024 * 1024);
  delete process.env.UPLOAD_MAX_FILE_BYTES;

  t("retention defaults to ninety days", retentionDays(), 90);
  const expires = retentionExpiry(NOW);
  t("which is what the expiry is set to", expires!.getTime() - NOW.getTime(), 90 * 24 * 60 * 60 * 1000);

  process.env.UPLOAD_RETENTION_DAYS = "0";
  t("zero means keep indefinitely", retentionExpiry(NOW), null);
  delete process.env.UPLOAD_RETENTION_DAYS;
  ok("and removing it brings retention back", retentionExpiry(NOW) !== null);
}

console.log("\nreading a reference back — a submitter cannot forge one");
{
  const real: StoredFileRef = {
    file: true,
    id: "file0000000000ee",
    filename: "cv.pdf",
    contentType: "application/pdf",
    detectedType: "application/pdf",
    size: 5,
    sha256: "b".repeat(64),
    stored: true,
    url: signDownloadUrl("file0000000000ee", "page", null, NOW)!,
    urlExpiresAt: NOW.toISOString(),
    expiresAt: null,
  };

  ok("a real reference is recognised", isStoredFileRef(real));

  // A submitter can post `<input name="cv" value='{"file":true,...}'>`. It
  // arrives as a *string*, but a JSON body can send the object itself — so the
  // predicate has to check every field rather than the flag.
  ok("a bare flag is not a file", !isStoredFileRef({ file: true, stored: true }));
  ok("nor is one with no id", !isStoredFileRef({ ...real, id: undefined }));
  ok("nor one with an id that could not be a URL segment", !isStoredFileRef({ ...real, id: "../../etc" }));
  ok("nor a string that looks like one", !isStoredFileRef(JSON.stringify(real)));
  ok("nor null", !isStoredFileRef(null));
  ok("nor an array", !isStoredFileRef([real]));

  const values = { cv: real, photos: [real, "not a file"], note: "hello" };
  t("references are found in fields and in arrays", collectFileRefs(values).map((entry) => entry.key), [
    "cv",
    "photos",
  ]);
  t("and nothing else is", collectFileRefs({ note: "hello" }), []);
}

console.log("\nan instance that cannot sign a link will not take a file");
{
  const savedUpload = process.env.UPLOAD_LINK_SECRET;
  const savedAuth = process.env.AUTH_SECRET;
  const savedEnv = process.env.NODE_ENV;

  ok("with a secret set, uploads are on — the control", canStoreUploads());

  delete process.env.UPLOAD_LINK_SECRET;
  delete process.env.AUTH_SECRET;
  ok("outside production a dev key stands in, so nothing has to be configured to develop", canStoreUploads());

  // `NODE_ENV` is a string on `process.env` like any other; assigning it here
  // is how the production branch gets exercised without a second process.
  (process.env as Record<string, string>).NODE_ENV = "production";
  ok(
    "in production with neither secret, uploads are refused rather than accepted",
    !canStoreUploads(),
  );
  t(
    "and nothing is minted, so no reference can point at a file nobody can fetch",
    signDownloadPath("file0000000000ff", "page", null, NOW),
    null,
  );
  t(
    "nor is anything verified",
    checkDownloadLink("file0000000000ff", "0", "x", NOW),
    { ok: false, reason: "unconfigured" },
  );

  process.env.AUTH_SECRET = "an-auth-secret";
  ok("AUTH_SECRET alone is enough — there is no new required variable", canStoreUploads());

  (process.env as Record<string, string>).NODE_ENV = savedEnv ?? "test";
  if (savedAuth === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = savedAuth;
  if (savedUpload !== undefined) process.env.UPLOAD_LINK_SECRET = savedUpload;
  ok("and the fixture's secret is restored", canStoreUploads());
}

console.log("\nsizes, as a person reads them");
{
  t("bytes", formatBytes(512), "512 B");
  t("kilobytes", formatBytes(241_000), "241 kB");
  t("megabytes with one decimal while small", formatBytes(1_400_000), "1.4 MB");
  t("and rounded once large", formatBytes(41_000_000), "41 MB");
  t("nonsense is said out loud rather than rendered as NaN", formatBytes(Number.NaN), "unknown size");
}

{
  console.log("\ndropForgedFileRefsIn never returns undefined for a values object");

  const REF = {
    file: true, stored: true, id: "aaaaaaaaaaaaaaaa",
    filename: "x.pdf", size: 1, sha256: "0", url: "https://x.invalid/y",
  };

  // The reason the entry point is separate from the recursion. A values object
  // can itself satisfy `isStoredFileRef` — every one of the seven keys is a
  // legal form field name — and an entry point that treated its own argument as
  // a candidate would return `undefined` and erase the whole submission.
  //
  // Not currently reachable through ingest: `normalizeKey` folds `_url` onto
  // `url`, so attribution consumes a plain `url` field before this runs and the
  // root stops matching. That is a coupling, not a guarantee — this asserts the
  // function is correct without relying on it.
  const rootShaped = dropForgedFileRefsIn({ ...REF }, new Set<string>());
  ok("a root-shaped values object survives", rootShaped !== undefined, rootShaped);
  t("with its ordinary fields intact", rootShaped.filename, "x.pdf");

  // The control: a forged ref *inside* a values object is still removed, so the
  // assertion above is not just "this function stopped doing anything".
  const nested = dropForgedFileRefsIn({ cv: { ...REF }, email: "a@b.test" }, new Set<string>());
  ok("but a forged reference inside one is dropped", nested.cv === undefined, nested.cv);
  t("leaving the rest", nested.email, "a@b.test");

  // And a genuine one is kept when its id is among the parts actually stored.
  const kept = dropForgedFileRefsIn({ cv: { ...REF } }, new Set(["aaaaaaaaaaaaaaaa"]));
  ok("a reference whose id was stored is kept", isStoredFileRef(kept.cv), kept.cv);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exitCode = 1;
