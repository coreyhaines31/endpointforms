import { adapterFor } from "./adapters/index.ts";
import { buildPayload, sampleSource, serialisePayload } from "./payload.ts";
import { decideRetry } from "./retry.ts";
import { deliveryIdFor } from "./signature.ts";
import {
  beginAttempt,
  claimDueRetries,
  lastAttemptNumber,
  loadDeliveryJob,
  reapStaleAttempts,
  settleAttempt,
  workspacesWithDeliveryWork,
  type Deliverable,
  type DeliveryJob,
} from "./store.ts";
import type { AdapterResult, PayloadSource } from "./types.ts";

/**
 * Delivery — the part that runs after the visitor has already been thanked.
 *
 * Two rules, and everything in this file is downstream of them:
 *
 * 1. **The submitter never waits on a third party.** A destination that takes
 *    ten seconds must not add ten seconds to a form post on somebody's paid
 *    landing page.
 * 2. **A destination failure is never a submission failure.** The lead is
 *    already committed by the time anything here runs, and every path below
 *    swallows its own errors into a `delivery_attempts` row. `handleSubmission`
 *    in `src/lib/ingest/handler.ts` calls this and does not await it.
 *
 * ## The honest part: there is no queue
 *
 * This stack has no job runner. Pretending otherwise would be the exact
 * dishonesty #42 is about, so here is what actually happens:
 *
 * - The **first attempt** runs in `after()` — Next's post-response hook — so it
 *   is outside the response but inside the same invocation, and the platform
 *   keeps the function alive for it.
 * - A **retry** is scheduled by writing `next_retry_at`, and then it waits for
 *   someone to come and get it. Two things do: the next submission to the same
 *   endpoint sweeps a handful of due retries (`sweepLimit` below), and the
 *   redeliver button in the delivery log runs one immediately.
 * - Nothing else. **An endpoint that takes one lead a week and then breaks will
 *   not retry on schedule** — its retry waits for the next lead. That is a real
 *   limitation, not a rounding error, and the fix is a cron calling
 *   `sweepDueRetries` every minute. It is written here rather than in a ticket
 *   because a comment in the file is where the next person looks.
 *
 * The retry *policy* is complete and tested either way: attempt rows append,
 * backoff is exponential with jitter, attempts are capped, and a delivery that
 * exhausts them stops with `next_retry_at` null — which is what the dead-letter
 * count in `./store.ts` counts, and what the redeliver button replays.
 */

export type DispatchOptions = {
  /** Injected by the tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** How many due retries to pick up alongside a new submission. */
  sweepLimit?: number;
  now?: Date;
};

export type DispatchSummary = {
  delivered: number;
  failed: number;
  skipped: number;
};

// ---------------------------------------------------------------------------
// The entry point the ingest path uses
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget delivery for one submission.
 *
 * Returns `void`, synchronously, on purpose: a caller that could accidentally
 * `await` this would put a webhook on the critical path of a form post, and the
 * type is the thing that stops them. It cannot throw.
 */
export function dispatchSubmission(input: {
  workspaceId: string;
  endpointId: string;
  submissionPublicId: string;
}): void {
  runAfterResponse(async () => {
    await deliverSubmission(input.workspaceId, input.submissionPublicId);
    // Opportunistic, and bounded. See the note at the top of the file: this is
    // what stands in for a cron, and it is not as good as one.
    await sweepDueRetries(input.workspaceId, { endpointId: input.endpointId, limit: 5 });
  });
}

/**
 * Delivers one submission to every enabled destination on its endpoint.
 *
 * Awaited by the tests and by the redeliver action; never by the ingest path.
 * Destinations run in parallel, because one slow receiver must not delay
 * another — they are independent systems and a customer with three of them
 * should not be waiting on the sum.
 */
export async function deliverSubmission(
  workspaceId: string,
  submissionPublicId: string,
  options: DispatchOptions & { destinationId?: string; force?: boolean } = {},
): Promise<DispatchSummary> {
  const job = await loadDeliveryJob(workspaceId, submissionPublicId, {
    destinationId: options.destinationId,
    // A manual redeliver targets one destination by id, and being able to
    // redeliver to a destination you have paused is the point of pausing it.
    includeDisabled: options.force === true,
  });

  if (!job) return { delivered: 0, failed: 0, skipped: 0 };

  const results = await Promise.all(
    job.destinations.map((destination) =>
      attemptDelivery(workspaceId, job, destination, options),
    ),
  );

  return {
    delivered: results.filter((result) => result === "delivered").length,
    failed: results.filter((result) => result === "failed").length,
    skipped: results.filter((result) => result === "skipped").length,
  };
}

/**
 * One attempt at one destination, written down whatever happens.
 *
 * The `catch` at the end is the load-bearing part. An adapter that throws — a
 * bug in ours, not a failure of theirs — must still produce a row, because a
 * delivery that vanishes without a trace is indistinguishable from one that
 * succeeded, and that is the thing this product is named against.
 */
async function attemptDelivery(
  workspaceId: string,
  job: DeliveryJob,
  destination: Deliverable,
  options: DispatchOptions,
): Promise<"delivered" | "failed" | "skipped"> {
  const adapter = adapterFor(destination.kind);
  const startedAt = options.now ?? new Date();

  const previous = await lastAttemptNumber(
    workspaceId,
    destination.destinationId,
    job.submissionId,
  );
  const attempt = previous + 1;

  if (!adapter.available || !adapter.deliver) {
    // Should be unreachable — an unavailable kind cannot be created through the
    // UI — but a row could predate the check, or arrive from a seed. Recorded as
    // a failed attempt rather than silently ignored, so the destinations screen
    // shows a broken destination rather than a quiet one.
    const id = await safely(() =>
      beginAttempt(workspaceId, {
        destinationId: destination.destinationId,
        submissionId: job.submissionId,
        attempt,
        requestBody: null,
        requestHeaders: null,
        startedAt,
      }),
    );
    if (id) {
      await safely(() =>
        settleAttempt(workspaceId, id, {
          status: "failed",
          requestBody: null,
          requestHeaders: null,
          responseStatus: null,
          responseBody: null,
          error: `${adapter.label} destinations are not available in this build, so nothing was delivered. The submission is still here.`,
          completedAt: new Date(),
          nextRetryAt: null,
        }),
      );
    }
    return "skipped";
  }

  const payload = buildPayload(job.source, {
    id: deliveryIdFor(destination.destinationId, job.submissionId),
    attempt,
    sentAt: startedAt,
    test: false,
  });

  // Opened BEFORE the request goes out. If this process is torn down mid-flight
  // — a serverless function frozen once the response is flushed, a connection
  // dropped under load — the row is already on disk as `pending`, and
  // `reapStaleAttempts` turns it into an honest failure later. Writing the row
  // only on completion is what makes a delivery log develop silent holes, and a
  // destination that reads "no failures recorded" while it has been failing for
  // three weeks is exactly the dashboard this product is named against.
  const attemptId = await safely(() =>
    beginAttempt(workspaceId, {
      destinationId: destination.destinationId,
      submissionId: job.submissionId,
      attempt,
      requestBody: serialisePayload(payload),
      requestHeaders: null,
      startedAt,
    }),
  );

  let result: AdapterResult;
  try {
    result = await adapter.deliver({
      destinationName: destination.name,
      payload,
      config: destination.config,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });
  } catch (error) {
    result = {
      ok: false,
      requestBody: null,
      requestHeaders: null,
      responseStatus: null,
      responseBody: null,
      error: `The delivery could not be attempted: ${
        error instanceof Error ? error.message : String(error)
      }. This is our bug, not the destination's.`,
      failure: "unknown",
    };
  }

  const retry = result.ok
    ? { willRetry: false, nextRetryAt: null, reason: "" }
    : decideRetry({ attempt, failure: result.failure, now: startedAt });

  if (attemptId) {
    await safely(() =>
      settleAttempt(workspaceId, attemptId, {
        status: result.ok ? "succeeded" : "failed",
        // The adapter's own copy wins — it knows the exact bytes and the
        // redacted headers. Falls back to the payload opened with, so a row
        // never loses the body it was created with.
        requestBody: result.requestBody ?? serialisePayload(payload),
        requestHeaders: result.requestHeaders,
        responseStatus: result.responseStatus,
        responseBody: result.responseBody,
        // The retry decision is appended to the error so the log line says both
        // what went wrong and what happens next. "Failed" without "retrying in
        // 30s" is the log line that generates the support ticket.
        error: result.ok ? null : `${result.error ?? "Delivery failed."} ${retry.reason}`.trim(),
        completedAt: new Date(),
        nextRetryAt: retry.nextRetryAt,
      }),
    );
  }

  return result.ok ? "delivered" : "failed";
}

/**
 * Retries whose backoff has elapsed.
 *
 * Bounded, always. An unbounded sweep on the ingest path would turn one
 * submission arriving after an outage into a thousand outbound requests inside
 * a single function invocation, and the second failure mode of a delivery
 * system is that recovering from an outage causes the next one.
 */
export async function sweepDueRetries(
  workspaceId: string,
  options: DispatchOptions & { endpointId?: string; limit?: number } = {},
): Promise<DispatchSummary> {
  const summary: DispatchSummary = { delivered: 0, failed: 0, skipped: 0 };

  try {
    const due = await claimDueRetries(workspaceId, {
      endpointId: options.endpointId,
      limit: options.limit ?? 20,
      now: options.now,
    });

    for (const row of due) {
      const result = await deliverSubmission(workspaceId, row.submissionPublicId, {
        ...options,
        destinationId: row.destinationId,
      });
      summary.delivered += result.delivered;
      summary.failed += result.failed;
      summary.skipped += result.skipped;
    }
  } catch (error) {
    console.error("[destinations] retry sweep failed", error);
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Test delivery (#42) — being able to prove it works
// ---------------------------------------------------------------------------

export type TestDeliveryResult = {
  ok: boolean;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  /** The exact bytes sent, so the payload contract can be checked against a real one. */
  requestBody: string | null;
};

/**
 * Sends a sample payload and reports **the real response**.
 *
 * The status code and the body come back verbatim rather than being reduced to
 * a green tick. A "test" that says "success" and hides a 202 from a receiver
 * that queued and then dropped the message is a test that manufactures
 * confidence, which is worse than no test.
 *
 * Deliberately **not** written to `delivery_attempts`: the delivery log is the
 * record of real leads, and a row in it for a submission nobody made would make
 * the health numbers lie. The response is shown to the person who pressed the
 * button, once, which is who it is for.
 */
export async function sendTestDelivery(
  endpoint: { publicId: string; name: string },
  destination: { id: string; kind: Deliverable["kind"]; name: string },
  config: Record<string, unknown>,
  options: DispatchOptions = {},
): Promise<TestDeliveryResult> {
  const adapter = adapterFor(destination.kind);
  if (!adapter.available || !adapter.deliver) {
    return {
      ok: false,
      responseStatus: null,
      responseBody: null,
      error: `${adapter.label} destinations are not available yet, so there is nothing to test.`,
      requestBody: null,
    };
  }

  const source: PayloadSource = sampleSource(endpoint);
  const payload = buildPayload(source, {
    id: deliveryIdFor(destination.id, "test"),
    attempt: 1,
    sentAt: options.now ?? new Date(),
    test: true,
  });

  try {
    const result = await adapter.deliver({
      destinationName: destination.name,
      payload,
      config,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });

    return {
      ok: result.ok,
      responseStatus: result.responseStatus,
      responseBody: result.responseBody,
      error: result.error,
      requestBody: result.requestBody,
    };
  } catch (error) {
    return {
      ok: false,
      responseStatus: null,
      responseBody: null,
      error: `The test could not be sent: ${
        error instanceof Error ? error.message : String(error)
      }`,
      requestBody: null,
    };
  }
}

// ---------------------------------------------------------------------------

/**
 * Runs work after the response has been sent.
 *
 * `after()` is imported **dynamically**, and that is not stylistic. This module
 * is reached from `src/lib/ingest/handler.ts`, which `tests/ingest.test.mts`
 * loads under plain `node` — and plain `node` cannot resolve `next/server`
 * (`ERR_MODULE_NOT_FOUND`, verified). A static import would break the ingest
 * test suite for a function the test never calls. The dynamic import is
 * evaluated at call time and its rejection is caught, so both runtimes work:
 * Next gets the post-response hook, node falls back to running it detached.
 *
 * The fallback is genuinely worse — a detached promise in a serverless
 * invocation can be killed when the response is flushed — which is why it is a
 * fallback and not the design.
 */
function runAfterResponse(task: () => Promise<void>): void {
  // Registered synchronously, before the dynamic import below resolves. If the
  // tracking happened inside the `.then()`, a test that called `drainDispatch`
  // on the next line would find an empty set and conclude the work was done.
  let settle: () => void = () => {};
  const tracked = new Promise<void>((resolve) => {
    settle = resolve;
  });
  inFlight.add(tracked);
  void tracked.finally(() => inFlight.delete(tracked));

  const run = () => {
    void task()
      .catch((error) => {
        // The last line of defence. Nothing above this should throw, but if it
        // does, it must not become an unhandled rejection that takes down the
        // process handling somebody's form post.
        console.error("[destinations] delivery failed", error);
      })
      .finally(settle);
  };

  import("next/server")
    .then(({ after }) => {
      try {
        after(run);
      } catch {
        // `after()` throws outside a request scope. The import succeeded, so
        // this is caught here rather than by the `.catch` below — letting it
        // fall through would run the task twice and deliver the lead twice.
        run();
      }
    })
    .catch(() => run());
}

/**
 * Deliveries started by `dispatchSubmission` that have not finished.
 *
 * A set rather than a counter so `drainDispatch` can await the actual promises.
 * It only ever holds the already-caught wrapper, so nothing in here can reject.
 */
const inFlight = new Set<Promise<void>>();

/**
 * Waits for every fire-and-forget delivery started so far.
 *
 * **A test seam, and a deliberate one.** The whole design of
 * `dispatchSubmission` is that nothing can await it — that is what keeps a
 * webhook off the critical path of a form post — which also makes it invisible
 * to a test, and an untestable delivery path is how "a broken destination
 * cannot cost a lead" becomes a claim rather than a fact.
 *
 * It is also the honest answer for a runtime with no `after()`: a process that
 * is about to exit can await this instead of dropping the work on the floor.
 * Nothing in the request path calls it.
 */
export async function drainDispatch(): Promise<void> {
  // A settling delivery can start another (the retry sweep), so this loops
  // rather than awaiting one snapshot of the set.
  while (inFlight.size > 0) {
    await Promise.all([...inFlight]);
  }
}

/**
 * Runs a database write that must never be the thing that throws.
 *
 * A delivery is already off the response path, so an error here cannot reach a
 * visitor — but it can lose the row, so it is logged rather than swallowed
 * silently, and the caller gets `null` and skips the write that depended on it.
 */
async function safely<T>(write: () => Promise<T>): Promise<T | null> {
  try {
    return await write();
  } catch (error) {
    console.error("[destinations] could not write a delivery attempt", error);
    return null;
  }
}
