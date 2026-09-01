import type { MembershipRole } from "../../db/schema.ts";
import type { OriginReason, OriginState } from "../origin/types.ts";
import type { SpamReason, SpamState } from "../spam/types.ts";

/**
 * The shapes the workspace queries return.
 *
 * Separated from `./queries.ts` so a component can name one without importing a
 * module that opens database connections. `eslint.config.mjs` blocks components
 * from importing the query modules at all; this is where the types they still
 * need live.
 */

export type { MembershipRole, OriginReason, OriginState, SpamReason, SpamState };

export type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  role: MembershipRole;
};

export type WorkspaceAccess = {
  workspace: { id: string; slug: string; name: string };
  role: MembershipRole;
};

export type Member = {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  role: MembershipRole;
  joinedAt: Date;
};

export type EndpointSummary = {
  id: string;
  publicId: string;
  name: string;
  createdAt: Date;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: MembershipRole;
  createdAt: Date;
  expiresAt: Date;
  invitedByEmail: string | null;
};

export type InvitationPreview = {
  invitationId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  email: string;
  role: MembershipRole;
};

// ---------------------------------------------------------------------------
// Endpoints (#50)
// ---------------------------------------------------------------------------

/**
 * An endpoint as the list screen shows it.
 *
 * `archivedAt` rather than `deletedAt`: the column is a soft delete, but the
 * word the UI uses has to promise what actually happens, and nothing is deleted.
 */
export type EndpointListItem = {
  id: string;
  publicId: string;
  name: string;
  createdAt: Date;
  archivedAt: Date | null;
  hasSchema: boolean;
  submissionCount: number;
  /** Submissions with no downstream outcome yet. The number the product is about. */
  awaitingCount: number;
  lastSubmissionAt: Date | null;
};

export type EndpointDetail = EndpointListItem;

// ---------------------------------------------------------------------------
// Submissions (#40)
// ---------------------------------------------------------------------------

export type SubmissionVerdict = "won" | "lost" | "disqualified" | "awaiting";

/**
 * Which lane of the inbox is being looked at (#37).
 *
 * Two lanes, never one merged list. `submissions` is what arrived; `partials`
 * is people who filled something in and never finished. They live in different
 * tables and their counts are never added together, so that adding partial
 * capture to a workspace cannot change a single number that was already on the
 * screen. See `src/lib/workspaces/partials.ts`.
 */
export type InboxLane = "submissions" | "partials";

export type SubmissionFilters = {
  /** Defaults to `submissions`, so every existing link keeps its meaning. */
  lane: InboxLane;
  endpointPublicId: string | null;
  origin: OriginState[];
  verdict: SubmissionVerdict[];
  from: Date | null;
  /** Exclusive. See `parseSubmissionFilters` — it holds the day *after* the one typed. */
  to: Date | null;
  q: string | null;
  page: number;
};

export type SubmissionListItem = {
  publicId: string;
  endpointPublicId: string;
  endpointName: string;
  submittedAt: Date;
  origin: OriginState;
  /**
   * Spam scoring (#31), a third axis alongside `origin` and `verdict`. `clear`
   * is the normal state and renders as nothing; there is deliberately no state
   * here that means a submission was withheld, because none ever is.
   */
  spamState: SpamState;
  spamScore: number;
  verdict: SubmissionVerdict;
  /** `numeric` comes back as a string. Kept as one — a float would round money. */
  verdictValue: string | null;
  verdictCurrency: string | null;
  values: Record<string, unknown>;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
};

export type SubmissionPage = {
  rows: SubmissionListItem[];
  total: number;
  awaiting: number;
  page: number;
  pageSize: number;
};

export type DeliveryAttemptRow = {
  id: string;
  attempt: number;
  status: "pending" | "succeeded" | "failed";
  responseStatus: number | null;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  nextRetryAt: Date | null;
  createdAt: Date;
  destinationName: string | null;
  destinationKind: string | null;
};

export type SubmissionDetail = SubmissionListItem & {
  originReasons: OriginReason[];
  /** Every spam signal consulted, including the ones that scored nothing. */
  spamReasons: SpamReason[];
  utmTerm: string | null;
  utmContent: string | null;
  clickIds: Record<string, unknown>;
  userAgent: string | null;
  ipHash: string | null;
  rawBody: string | null;
  rawContentType: string | null;
  verdictAt: Date | null;
  verdictSource: string | null;
  schemaVersionId: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  deliveries: DeliveryAttemptRow[];
};

export type SubmissionExportRow = SubmissionListItem & {
  originReasons: OriginReason[];
  spamReasons: SpamReason[];
  utmTerm: string | null;
  utmContent: string | null;
  clickIds: Record<string, unknown>;
  userAgent: string | null;
  verdictAt: Date | null;
  verdictSource: string | null;
  rawBody: string | null;
  rawContentType: string | null;
};
