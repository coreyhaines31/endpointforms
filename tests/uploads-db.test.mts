/**
 * File uploads, end to end through the real submission path (#66).
 *
 * `tests/uploads.test.mts` proves the arithmetic — signing, clamping, filename
 * reduction. This proves the thing a pure test cannot reach and the thing the
 * whole issue was about:
 *
 * > **A file that cannot be stored never produces a submission that looks like
 * > it was.**
 *
 * That claim is an assertion about an *absence* — no row — and an absence
 * proves nothing on its own. An empty result set is equally consistent with
 * "the guard works" and "the fixture posted nothing at all". So every refusal
 * below is paired with a control on the same endpoint, in the same run: a good
 * submission is posted first, the count is asserted to be exactly one, and then
 * the bad one is posted and the count is asserted to be *still* exactly one.
 * A broken guard shows up as two.
 *
 * The strongest of them is `storage failure rolls the submission back`, which
 * does not simulate anything: it makes the file insert genuinely fail, inside
 * the real transaction, and shows the submission row is not there afterwards.
 *
 * Needs a database: `npm run db:up && npm run db:migrate`.
 */

process.env.SUBMISSION_IP_SALT = "test-salt";
process.env.UPLOAD_LINK_SECRET = "uploads-db-test-secret";
process.env.INGEST_RATE_LIMIT_ENDPOINT_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_IP_PER_MINUTE = "1000000";
process.env.INGEST_RATE_LIMIT_ENDPOINT_IP_PER_MINUTE = "1000000";

import { and, eq, isNull } from "drizzle-orm";

import { sqlClient, unsafeDb } from "../src/db/client.ts";
import { newEndpointPublicId, newFilePublicId, newId } from "../src/db/ids.ts";
import { endpoints, submissionFiles, submissions, users, workspaces } from "../src/db/schema.ts";
import { handleSubmission } from "../src/lib/ingest/handler.ts";
import { resolveEndpoint, storeSubmission } from "../src/lib/ingest/store.ts";
import { handleFileDownload } from "../src/lib/uploads/download.ts";
import { signDownloadPath } from "../src/lib/uploads/links.ts";
import { purgeExpiredUploads } from "../src/lib/uploads/store.ts";
import { handleUploadSweep } from "../src/lib/uploads/sweep.ts";
import { getSubmission } from "../src/lib/workspaces/submissions.ts";
import { collectFileRefs, isStoredFileRef } from "../src/lib/uploads/types.ts";
import type { PendingUpload } from "../src/lib/uploads/types.ts";

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

const SLUG = "uploads-test-workspace";
const OTHER_SLUG = "uploads-test-neighbour";
const EMAIL = "uploads@test.invalid";
const BASE = "https://acme.endpointforms.test";
const DOWNLOAD_BASE = "https://app.endpointforms.test";

async function cleanup() {
  await unsafeDb.delete(workspaces).where(eq(workspaces.slug, SLUG));
  await unsafeDb.delete(workspaces).where(eq(workspaces.slug, OTHER_SLUG));
  await unsafeDb.delete(users).where(eq(users.email, EMAIL));
}

const BROWSER_HEADERS: Record<string, string> = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "sec-fetch-mode": "navigate",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0 Safari/537.36",
  "x-forwarded-for": "203.0.113.7",
};

/** A multipart post, with whatever parts the caller names. */
function multipart(endpointPublicId: string, build: (form: FormData) => void): Request {
  const form = new FormData();
  build(form);
  return new Request(`${BASE}/e/${endpointPublicId}`, {
    method: "POST",
    headers: BROWSER_HEADERS,
    body: form,
    redirect: "manual",
  });
}

function file(name: string, bytes: Uint8Array, type: string): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

/** Deterministic filler, so a large file is large rather than compressible-to-nothing. */
function filler(size: number): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = (i * 31 + 7) & 0xff;
  return out;
}

async function submissionRows(endpointPublicId: string) {
  const endpoint = await unsafeDb
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(eq(endpoints.publicId, endpointPublicId))
    .limit(1);
  if (!endpoint[0]) return [];
  return unsafeDb
    .select()
    .from(submissions)
    .where(and(eq(submissions.endpointId, endpoint[0].id), isNull(submissions.deletedAt)))
    .orderBy(submissions.createdAt);
}

async function fileRows(workspaceId: string) {
  return unsafeDb
    .select()
    .from(submissionFiles)
    .where(eq(submissionFiles.workspaceId, workspaceId))
    .orderBy(submissionFiles.createdAt);
}

function values(row: { values: unknown }): Record<string, Record<string, unknown>> {
  return row.values as Record<string, Record<string, unknown>>;
}

async function main() {
  await cleanup();

  const workspaceId = newId();
  const otherWorkspaceId = newId();
  const endpointId = newId();
  const capsEndpointId = newId();
  const publicId = newEndpointPublicId();
  const capsPublicId = newEndpointPublicId();

  await unsafeDb.insert(workspaces).values([
    { id: workspaceId, slug: SLUG, name: SLUG },
    { id: otherWorkspaceId, slug: OTHER_SLUG, name: OTHER_SLUG },
  ]);
  await unsafeDb.insert(users).values({ id: newId(), email: EMAIL });
  await unsafeDb.insert(endpoints).values([
    { id: endpointId, workspaceId, publicId, name: "Careers" },
    { id: capsEndpointId, workspaceId, publicId: capsPublicId, name: "Caps" },
  ]);

  // -------------------------------------------------------------------------
  console.log("\nthe bytes are kept — the control for everything below");
  // -------------------------------------------------------------------------

  const cv = filler(2048);
  const accepted = await handleSubmission(
    multipart(publicId, (form) => {
      form.set("email", "ruth@camdenworks.example");
      form.set("cv", file("cv.pdf", cv, "application/pdf"));
    }),
    publicId,
  );
  t("a multipart post with a file is accepted", accepted.status, 303);

  const rows = await submissionRows(publicId);
  t("one submission row", rows.length, 1);

  let files = await fileRows(workspaceId);
  t("one file row", files.length, 1);
  t("the filename survived", files[0].filename, "cv.pdf");
  t("the size is the byte count we actually hold", files[0].size, 2048);
  t("the field it arrived in is recorded", files[0].fieldKey, "cv");
  t("the declared type is recorded", files[0].declaredContentType, "application/pdf");
  ok(
    "the bytes are byte-for-byte what was posted",
    files[0].bytes !== null && Buffer.from(files[0].bytes!).equals(Buffer.from(cv)),
  );
  t("retention is stamped on the row", files[0].expiresAt !== null, true);
  t("and nothing has been purged", files[0].purgedAt, null);

  const ref = values(rows[0]).cv;
  t("the reference in `values` says it is stored", ref.stored, true);
  t("and names the row it points at", ref.id, files[0].publicId);
  ok("and carries a link a webhook could use", String(ref.url).includes("/api/v1/files/"), ref.url);

  // -------------------------------------------------------------------------
  console.log("\ndownloading it back");
  // -------------------------------------------------------------------------

  const path = signDownloadPath(files[0].publicId, "page", files[0].expiresAt);
  const good = await handleFileDownload(
    new Request(`${DOWNLOAD_BASE}${path}`, { headers: {} }),
    files[0].publicId,
  );
  t("a signed link downloads", good.status, 200);
  t("as an opaque attachment, never as the declared type", good.headers.get("content-type"), "application/octet-stream");
  ok("with a filename", good.headers.get("content-disposition")?.includes('filename="cv.pdf"') === true, good.headers.get("content-disposition"));
  t("and no sniffing", good.headers.get("x-content-type-options"), "nosniff");
  const downloaded = new Uint8Array(await good.arrayBuffer());
  ok("the bytes come back unchanged", Buffer.from(downloaded).equals(Buffer.from(cv)));

  const tampered = path!.replace(/&s=(.)/, (_m, c: string) => `&s=${c === "A" ? "B" : "A"}`);
  const refused = await handleFileDownload(
    new Request(`${DOWNLOAD_BASE}${tampered}`),
    files[0].publicId,
  );
  t("a tampered signature is refused", refused.status, 403);

  const unsigned = await handleFileDownload(
    new Request(`${DOWNLOAD_BASE}/api/v1/files/${files[0].publicId}`),
    files[0].publicId,
  );
  t("no signature at all is refused", unsigned.status, 403);

  const wrongFile = await handleFileDownload(
    new Request(`${DOWNLOAD_BASE}${path}`),
    "file000000000000",
  );
  t("a valid signature for another id is refused", wrongFile.status, 403);
  t(
    "and says the same thing as a bad signature, so it is not an oracle",
    await wrongFile.text(),
    await refused.clone().text(),
  );

  const expiredPath = signDownloadPath(
    files[0].publicId,
    "page",
    files[0].expiresAt,
    new Date(Date.now() - 60 * 60 * 1000),
  );
  const expired = await handleFileDownload(
    new Request(`${DOWNLOAD_BASE}${expiredPath}`),
    files[0].publicId,
  );
  t("an expired link is refused", expired.status, 403);
  ok("and says so, so nobody thinks we lost the file", (await expired.text()).includes("expired"));

  // -------------------------------------------------------------------------
  console.log("\nthe inbox reads attachments from the table, and only its own");
  // -------------------------------------------------------------------------

  const detail = await getSubmission(workspaceId, rows[0].publicId);
  t("the submission detail carries its files", detail?.files.length, 1);
  t("with the name", detail?.files[0].filename, "cv.pdf");

  const neighbour = await getSubmission(otherWorkspaceId, rows[0].publicId);
  t("another workspace cannot read the submission at all", neighbour, null);

  // -------------------------------------------------------------------------
  console.log("\nan unfilled file input is not a file");
  // -------------------------------------------------------------------------

  const withEmptyInput = await handleSubmission(
    multipart(publicId, (form) => {
      form.set("email", "sam@camdenworks.example");
      // What a browser posts for `<input type="file">` that nobody touched.
      form.set("cv", file("", new Uint8Array(), ""));
    }),
    publicId,
  );
  t("the submission goes through", withEmptyInput.status, 303);
  t("and no file row was invented for it", (await fileRows(workspaceId)).length, 1);

  const namedEmpty = await handleSubmission(
    multipart(publicId, (form) => {
      form.set("email", "nell@camdenworks.example");
      form.set("cv", file("empty.txt", new Uint8Array(), "text/plain"));
    }),
    publicId,
  );
  t("but a named zero-byte file is a file somebody attached", namedEmpty.status, 303);
  files = await fileRows(workspaceId);
  t("and it is stored", files.length, 2);
  t("with its real size", files[1].size, 0);

  // -------------------------------------------------------------------------
  console.log("\nover a cap: refused, and no submission is left behind");
  // -------------------------------------------------------------------------

  // The control. Everything after this asserts the count did NOT move, and an
  // assertion like that is worthless until the count has been shown to move.
  const capsGood = await handleSubmission(
    multipart(capsPublicId, (form) => {
      form.set("email", "control@camdenworks.example");
      form.set("cv", file("small.pdf", filler(512), "application/pdf"));
    }),
    capsPublicId,
  );
  t("a good submission on the caps endpoint is stored", capsGood.status, 303);
  t("the count is one", (await submissionRows(capsPublicId)).length, 1);

  process.env.UPLOAD_MAX_FILE_BYTES = "1024";
  const tooBig = await handleSubmission(
    multipart(capsPublicId, (form) => {
      form.set("email", "toobig@camdenworks.example");
      form.set("cv", file("huge.pdf", filler(4096), "application/pdf"));
    }),
    capsPublicId,
  );
  t("a file over the per-file cap is refused", tooBig.status, 413);
  ok("and the refusal names the file and says nothing was stored", (await tooBig.clone().text()).includes("huge.pdf"));
  t("the count is STILL one — the lead was not written down", (await submissionRows(capsPublicId)).length, 1);

  process.env.UPLOAD_MAX_TOTAL_BYTES = "1200";
  const tooMuch = await handleSubmission(
    multipart(capsPublicId, (form) => {
      form.set("email", "toomuch@camdenworks.example");
      form.append("cv", file("a.pdf", filler(800), "application/pdf"));
      form.append("cv", file("b.pdf", filler(800), "application/pdf"));
    }),
    capsPublicId,
  );
  t("files that add up over the per-submission cap are refused", tooMuch.status, 413);
  t("the count is still one", (await submissionRows(capsPublicId)).length, 1);
  delete process.env.UPLOAD_MAX_TOTAL_BYTES;

  process.env.UPLOAD_MAX_FILES = "1";
  const tooMany = await handleSubmission(
    multipart(capsPublicId, (form) => {
      form.set("email", "toomany@camdenworks.example");
      form.append("cv", file("a.pdf", filler(100), "application/pdf"));
      form.append("cv", file("b.pdf", filler(100), "application/pdf"));
    }),
    capsPublicId,
  );
  t("more files than the endpoint accepts is refused", tooMany.status, 413);
  t("the count is still one", (await submissionRows(capsPublicId)).length, 1);
  delete process.env.UPLOAD_MAX_FILES;

  process.env.UPLOAD_ALLOWED_TYPES = "application/pdf";
  const wrongType = await handleSubmission(
    multipart(capsPublicId, (form) => {
      form.set("email", "wrongtype@camdenworks.example");
      form.set("cv", file("payload.html", filler(64), "text/html"));
    }),
    capsPublicId,
  );
  t("a type this deployment refuses is refused", wrongType.status, 415);
  t("the count is still one", (await submissionRows(capsPublicId)).length, 1);
  delete process.env.UPLOAD_ALLOWED_TYPES;

  process.env.INGEST_MAX_MULTIPART_BODY_BYTES = "2048";
  const envelope = await handleSubmission(
    multipart(capsPublicId, (form) => {
      form.set("email", "envelope@camdenworks.example");
      form.set("cv", file("big.pdf", filler(8192), "application/pdf"));
    }),
    capsPublicId,
  );
  t("a body over the multipart envelope cap is refused before it is parsed", envelope.status, 413);
  t("the count is still one", (await submissionRows(capsPublicId)).length, 1);
  delete process.env.INGEST_MAX_MULTIPART_BODY_BYTES;
  delete process.env.UPLOAD_MAX_FILE_BYTES;

  // And the guard is not simply "this endpoint refuses everything": with the
  // caps back at their defaults the same shape of post goes through.
  const capsAfter = await handleSubmission(
    multipart(capsPublicId, (form) => {
      form.set("email", "after@camdenworks.example");
      form.set("cv", file("after.pdf", filler(4096), "application/pdf"));
    }),
    capsPublicId,
  );
  t("with the caps restored the same post is accepted", capsAfter.status, 303);
  t("and the count moves to two, so the assertions above measured something", (await submissionRows(capsPublicId)).length, 2);

  // -------------------------------------------------------------------------
  console.log("\nan instance that cannot sign a link refuses the submission");
  // -------------------------------------------------------------------------

  {
    const savedUpload = process.env.UPLOAD_LINK_SECRET;
    const savedAuth = process.env.AUTH_SECRET;
    const savedEnv = process.env.NODE_ENV;
    const countBefore = (await submissionRows(capsPublicId)).length;

    delete process.env.UPLOAD_LINK_SECRET;
    delete process.env.AUTH_SECRET;
    (process.env as Record<string, string>).NODE_ENV = "production";

    const unconfigured = await handleSubmission(
      multipart(capsPublicId, (form) => {
        form.set("email", "unconfigured@camdenworks.example");
        form.set("cv", file("cv.pdf", filler(64), "application/pdf"));
      }),
      capsPublicId,
    );
    t("a file post is refused with 503, not accepted", unconfigured.status, 503);
    ok(
      "and says the submission was not stored rather than implying it was",
      (await unconfigured.text()).includes("not stored"),
    );
    t("no row was written", (await submissionRows(capsPublicId)).length, countBefore);

    // The same endpoint still takes a submission with no file, so the refusal
    // is about the attachment and not about the instance being broken.
    const textOnly = await handleSubmission(
      multipart(capsPublicId, (form) => {
        form.set("email", "textonly@camdenworks.example");
      }),
      capsPublicId,
    );
    t("a submission with no file still goes through", textOnly.status, 303);
    t("and the count moves", (await submissionRows(capsPublicId)).length, countBefore + 1);

    (process.env as Record<string, string>).NODE_ENV = savedEnv ?? "test";
    if (savedAuth === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = savedAuth;
    if (savedUpload !== undefined) process.env.UPLOAD_LINK_SECRET = savedUpload;
  }

  // -------------------------------------------------------------------------
  console.log("\nstorage failure rolls the submission back");
  // -------------------------------------------------------------------------

  // Not a simulation. Two uploads share one public id, so the second insert
  // violates `submission_files_public_id_key` — a real failure of the real file
  // write, inside the real transaction that writes the submission.
  const endpoint = await resolveEndpoint(publicId);

  const collidingId = newFilePublicId();
  const upload = (publicIdFor: string, name: string): PendingUpload => ({
    publicId: publicIdFor,
    fieldKey: "cv",
    filename: name,
    declaredContentType: "application/pdf",
    detectedContentType: null,
    size: 3,
    sha256: "c".repeat(64),
    bytes: new Uint8Array([1, 2, 3]),
  });

  const record = (key: string, uploads: PendingUpload[]) => ({
    variantId: null,
    schemaVersionId: null,
    values: { email: "atomic@camdenworks.example" },
    rawBody: "email=atomic%40camdenworks.example",
    rawContentType: "multipart/form-data",
    idempotencyKey: key,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    clickIds: {},
    referrer: null,
    userAgent: null,
    ipHash: null,
    submittedAt: new Date(),
    origin: "unverified" as const,
    originReasons: [],
    spamState: "clear" as const,
    spamScore: 0,
    spamReasons: [],
    uploads,
    uploadsExpireAt: null,
  });

  const before = (await submissionRows(publicId)).length;
  const filesBefore = (await fileRows(workspaceId)).length;

  let threw = false;
  try {
    await storeSubmission(
      endpoint,
      record("atomic-fails", [upload(collidingId, "one.pdf"), upload(collidingId, "two.pdf")]),
    );
  } catch {
    threw = true;
  }
  ok("a failed file write throws rather than returning quietly", threw);
  t("and the submission row is not there", (await submissionRows(publicId)).length, before);
  t(
    "nor is the file that did insert before the collision",
    (await fileRows(workspaceId)).filter((row) => row.publicId === collidingId).length,
    0,
  );

  // The control: the identical call with distinct ids does write both. Without
  // this, "no row" above is equally consistent with `storeSubmission` never
  // having written a row in this test at all.
  const written = await storeSubmission(
    endpoint,
    record("atomic-succeeds", [upload(newFilePublicId(), "one.pdf"), upload(newFilePublicId(), "two.pdf")]),
  );
  ok("the same call without the collision writes the submission", written.duplicate === false);
  t("the count moved by one", (await submissionRows(publicId)).length, before + 1);
  t("and both files landed", (await fileRows(workspaceId)).length, filesBefore + 2);

  // -------------------------------------------------------------------------
  console.log("\nthe same file twice is one lead, not two");
  // -------------------------------------------------------------------------

  const dupeBase = (await submissionRows(publicId)).length;
  const dupeFilesBase = (await fileRows(workspaceId)).length;
  const dupeBody = (form: FormData) => {
    form.set("email", "double@camdenworks.example");
    form.set("cv", file("cv.pdf", cv, "application/pdf"));
  };
  const first = await handleSubmission(multipart(publicId, dupeBody), publicId);
  const second = await handleSubmission(multipart(publicId, dupeBody), publicId);
  t("both posts are answered", [first.status, second.status], [303, 303]);
  t(
    "but a double-clicked file upload is one row",
    (await submissionRows(publicId)).length,
    dupeBase + 1,
  );
  t(
    "and one copy of the bytes, not two",
    (await fileRows(workspaceId)).length,
    dupeFilesBase + 1,
  );

  // -------------------------------------------------------------------------
  console.log("\nretention takes the bytes and keeps the record");
  // -------------------------------------------------------------------------

  const target = (await fileRows(workspaceId))[0];
  await unsafeDb
    .update(submissionFiles)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(submissionFiles.id, target.id));

  // Before the sweep: the date has passed, so the file is already unreadable.
  // The rule is the date, not the schedule the sweep happens to run on.
  const beforeSweep = await handleFileDownload(
    new Request(`${DOWNLOAD_BASE}${signDownloadPath(target.publicId, "page", null)}`),
    target.publicId,
  );
  t("an overdue file is gone before the sweep reaches it", beforeSweep.status, 410);

  const swept = await purgeExpiredUploads();
  ok("the sweep took at least one", swept.purged >= 1, swept);

  const after = (await fileRows(workspaceId)).find((row) => row.id === target.id)!;
  t("the bytes are gone", after.bytes, null);
  ok("the purge is dated", after.purgedAt !== null);
  t("the name is still here", after.filename, target.filename);
  t("so is the hash, so integrity is still checkable against a copy", after.sha256, target.sha256);

  const gone = await handleFileDownload(
    new Request(`${DOWNLOAD_BASE}${signDownloadPath(target.publicId, "page", null)}`),
    target.publicId,
  );
  t("and a download says Gone rather than Not Found", gone.status, 410);
  ok("naming the retention rule", (await gone.text()).includes("retention"));

  // A second sweep must not double-count or resurrect anything.
  const again = await purgeExpiredUploads();
  t("a second sweep finds nothing left to do", again.purged, 0);

  // -------------------------------------------------------------------------
  console.log("\nthe sweep endpoint is not a way for a stranger to delete files");
  // -------------------------------------------------------------------------

  {
    const savedCron = process.env.CRON_SECRET;

    delete process.env.CRON_SECRET;
    const unguarded = await handleUploadSweep(
      new Request("https://app.endpointforms.test/api/v1/files/sweep"),
    );
    t("with no CRON_SECRET set it refuses everything", unguarded.status, 401);

    process.env.CRON_SECRET = "sweep-test-secret";
    const wrongToken = await handleUploadSweep(
      new Request("https://app.endpointforms.test/api/v1/files/sweep", {
        headers: { authorization: "Bearer not-the-secret" },
      }),
    );
    t("a wrong token is refused", wrongToken.status, 401);

    const authorised = await handleUploadSweep(
      new Request("https://app.endpointforms.test/api/v1/files/sweep", {
        headers: { authorization: "Bearer sweep-test-secret" },
      }),
    );
    t("the right one runs — so the 401s above measured the guard, not the route", authorised.status, 200);
    const summary = (await authorised.json()) as { ok: boolean; retentionDays: number };
    t("and reports the retention rule it ran under", summary.retentionDays, 90);

    process.env.UPLOAD_RETENTION_DAYS = "0";
    const off = await handleUploadSweep(
      new Request("https://app.endpointforms.test/api/v1/files/sweep", {
        headers: { authorization: "Bearer sweep-test-secret" },
      }),
    );
    const offSummary = (await off.json()) as { retentionDays: number; purged: number };
    t("with retention off it says so rather than silently doing nothing", offSummary.retentionDays, 0);
    delete process.env.UPLOAD_RETENTION_DAYS;

    if (savedCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = savedCron;
  }

  // -------------------------------------------------------------------------
  // A file posted on one of our reserved field names.
  //
  // `submission_files` is written from the parsed parts, not from `values`, so
  // before the fix the file was stored and the inbox showed it while
  // destinations and the CSV export — which both read `values` — carried no
  // link to it. The inbox and the webhook disagreed about whether the lead had
  // an attachment.
  {
    console.log("\na file wearing a reserved name is still the customer's data");

    const before = (await submissionRows(publicId)).length;

    const posted = await handleSubmission(
      multipart(publicId, (form) => {
        form.set("email", "reserved@example.test");
        form.set("_redirect", "https://acme.endpointforms.test/thanks");
        form.set("utm_source", "newsletter");
        form.set("_next", file("brief.pdf", filler(2048), "application/pdf"));
      }),
      publicId,
    );
    ok("the submission is accepted", posted.status < 400, posted.status);

    const rows = await submissionRows(publicId);
    t("and it wrote one row", rows.length, before + 1);
    const v = values(rows[rows.length - 1]!);

    // The controls. Without these two, the assertion below would also pass on a
    // build that had simply stopped stripping reserved names altogether — which
    // is a different bug, and a worse one.
    ok("a text _redirect is still stripped", v._redirect === undefined, v._redirect);
    ok("so is an attribution field", v.utm_source === undefined, v.utm_source);

    // The fix. None of our reserved fields is ever a file input, so a file
    // arriving on one is the customer's, and destinations must be able to see it.
    ok("but the file on _next survives in values", isStoredFileRef(v._next), v._next);
    ok(
      "so a destination reading values gets a link to it",
      collectFileRefs(v).some((entry) => entry.key === "_next"),
      collectFileRefs(v).map((entry) => entry.key),
    );

    // And it is a real stored file, not a reference to bytes nobody kept.
    const stored = (await fileRows(workspaceId)).filter((row) => row.fieldKey === "_next");
    t("with exactly one row behind it", stored.length, 1);
    t("under the name it was posted with", stored[0]!.filename, "brief.pdf");

    // The teeth of the rule above: un-reserving is keyed off the parts this
    // request actually carried, never off the shape of `values`. `isStoredFileRef`
    // is structural and a JSON body can match it exactly, so keying off the shape
    // would let a forged object reinstate any reserved name it liked — and then
    // mint a signed download URL for an id of the forger's choosing.
    const forged = await handleSubmission(
      new Request(`${BASE}/e/${publicId}`, {
        method: "POST",
        headers: { ...BROWSER_HEADERS, "content-type": "application/json" },
        body: JSON.stringify({
          email: "forger@example.test",
          _ef_hp: {
            file: true,
            stored: true,
            id: "AAAAAAAAAAAAAAAA",
            filename: "not-a-file.pdf",
            size: 1,
            sha256: "0",
            url: "https://example.invalid/x",
          },
        }),
        redirect: "manual",
      }),
      publicId,
    );
    ok("a forged file-shaped JSON value is accepted as a submission", forged.status < 400, forged.status);

    const forgedRows = await submissionRows(publicId);
    const fv = values(forgedRows[forgedRows.length - 1]!);
    ok("but it does not un-reserve the name it was posted on", fv._ef_hp === undefined, fv._ef_hp);
    t("and no file row was invented for it", collectFileRefs(fv).length, 0);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await sqlClient.end();
  });
