import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  char,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { newId } from "./ids.ts";

/**
 * The data model. `docs/21-data-model.md` explains the reasoning; this file is
 * the source of truth for the shape.
 *
 * Two rules run through all of it:
 *
 * 1. Every workspace-scoped table carries `workspace_id` directly, even when it
 *    could be reached through a join. That is what lets both the `withWorkspace`
 *    helper and the row-level security policies filter without a join, and it is
 *    why a composite foreign key can guarantee the denormalised column is never
 *    wrong.
 * 2. Nothing a submission was read against is ever mutated. Schemas are
 *    append-only versions; the endpoint holds a movable pointer at one of them.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const membershipRole = pgEnum("membership_role", ["owner", "member"]);

/**
 * Provenance (#30). Named for what we know, not what we suspect: "unverified"
 * states our confidence rather than accusing the visitor. Settled in
 * `docs/00-positioning-spine.md` — do not reintroduce "suspected bot".
 */
export const submissionOrigin = pgEnum("submission_origin", [
  "human",
  "agent",
  "unverified",
]);

/**
 * Downstream outcome (#43). `awaiting` is a real, first-class state and the
 * default — a submission with no outcome yet is not a lost one, and the
 * difference is the entire point of the wedge.
 */
export const submissionVerdict = pgEnum("submission_verdict", [
  "won",
  "lost",
  "disqualified",
  "awaiting",
]);

/**
 * Spam scoring (#31). **A third axis, and it has to be.**
 *
 * Not `origin`: a person in Chrome can send a casino advert and an agent using
 * Manifest can send the best lead of the quarter. Not `verdict`: that column is
 * the downstream business outcome reported by a CRM, and it is the input to
 * Yield's ranking (#44) — a heuristic that could set `disqualified` would be a
 * regex deciding which form variant wins.
 *
 * Note what this enum does not contain. There is no `deleted`, no `rejected`,
 * no `blocked`. A flagged submission is stored, exported and visible like any
 * other; the flag is a mark on it. `/spam/honeypot-fields` is live on our own
 * site calling silent rejection "the thing to fix today", and #31's binding
 * constraint is that "where did my lead go" is worse than spam.
 *
 * `not_spam` and `confirmed_spam` are human decisions and outrank the score
 * permanently. Rescoring never overwrites either.
 */
export const submissionSpamState = pgEnum("submission_spam_state", [
  "clear",
  "flagged",
  "not_spam",
  "confirmed_spam",
]);

/** What a workspace list entry matches on (#31). */
export const spamListKind = pgEnum("spam_list_kind", ["ip", "email_domain", "keyword"]);

/** Whether an entry always flags or always clears. Allow beats block. */
export const spamListEffect = pgEnum("spam_list_effect", ["block", "allow"]);

/** How a schema came to exist (#51). The builder is one of four, not the foundation. */
export const schemaSource = pgEnum("schema_source", [
  "html_import",
  "file",
  "inferred",
  "builder",
]);

/**
 * `warn` is the default and the safe one: a schema annotates a submission that
 * does not match, and still stores it. `strict` rejects. #51's hard constraint
 * is that declaring a schema must never start dropping submissions that used to
 * succeed, so opting in to `strict` is a deliberate act.
 */
export const schemaMode = pgEnum("schema_mode", ["warn", "strict"]);

export const destinationKind = pgEnum("destination_kind", [
  "webhook",
  "email",
  "slack",
  "google_sheets",
  "hubspot",
  "salesforce",
]);

export const deliveryStatus = pgEnum("delivery_status", [
  "pending",
  "succeeded",
  "failed",
]);

/**
 * Hindsight (#45). Three states, and the transitions are one-way.
 *
 * `draft` is the only state in which a test's arms may be edited. Adding or
 * reweighting a variant moves the bucket boundaries every visitor was hashed
 * into, which silently reassigns some of them — their views counted under one
 * arm and their submissions land under another. There is no hash that avoids
 * that, so it is prevented instead: a running test's arms are frozen and
 * changing them means a new test. `src/lib/hindsight/assign.ts` explains why at
 * length.
 */
export const splitTestStatus = pgEnum("split_test_status", [
  "draft",
  "running",
  "stopped",
]);

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey(),
    /** Becomes the render subdomain (#34), so it is public and effectively permanent. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workspaces_slug_key").on(t.slug)],
);

/**
 * People.
 *
 * The property names `emailVerified` and `image` are what `@auth/drizzle-adapter`
 * reads and writes; the SQL columns keep this codebase's naming
 * (`email_verified_at`, `image_url`). Renaming the properties rather than the
 * columns is what let us use the official, well-exercised adapter instead of
 * hand-writing one — an adapter bug is an authentication bug.
 *
 * `$defaultFn` keeps the UUIDv7 convention for rows the adapter inserts. The
 * adapter checks `hasDefault` and lets ours win; without it every user would get
 * a UUIDv4 from `crypto.randomUUID()`. It is runtime-only and emits no DDL.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    email: text("email").notNull(),
    name: text("name"),
    image: text("image_url"),
    /**
     * When we last saw proof that this person controls this address — set by a
     * magic link or by Google. Password sign-up does not set it: choosing a
     * password proves nothing about the inbox, and pretending otherwise is how
     * an account gets created on someone else's address.
     */
    emailVerified: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
    /**
     * argon2id, parameters and salt encoded in the string. See
     * `src/lib/auth/password.ts`.
     *
     * **Nullable, permanently.** A Google user has no password and never will;
     * neither does anyone who signed up by magic link before this column
     * existed. Null means "this person does not sign in with a password", which
     * is a valid, ordinary account — not a broken row to be backfilled.
     *
     * Never selected into anything that leaves the server. The only query that
     * reads it is the one in `src/lib/auth/credentials.ts` that verifies against
     * it and then drops it.
     */
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    /**
     * One account per address, whatever case it was typed in.
     *
     * `@auth/drizzle-adapter` looks users up with an exact match, so the plain
     * index above is the one it uses and stays. This one exists because password
     * sign-up normalises the address before storing it: without it, someone
     * whose row was written as `Alice@…` by an earlier magic link could sign up
     * again as `alice@…` and end up with two accounts and half their data in
     * each. It also backs the case-insensitive lookup in `src/lib/auth/account.ts`.
     */
    uniqueIndex("users_email_lower_key").on(sql`lower(${t.email})`),
  ],
);

// ---------------------------------------------------------------------------
// Auth.js (#34)
// ---------------------------------------------------------------------------

/**
 * The three tables `@auth/drizzle-adapter` needs, plus invitations.
 *
 * Property names are dictated by the adapter and cannot be changed; the SQL
 * column names are ours. The `auth_` table prefix keeps "accounts" from ever
 * colliding with a billing concept later — in a B2B product that word is taken.
 *
 * None of the three carry `workspace_id`. They are about a person, not a tenant:
 * one human with one session can belong to several workspaces, and binding a
 * session to a workspace would mean re-authenticating to switch. The workspace
 * boundary is enforced on every workspace-scoped read instead, which is the only
 * place it can be enforced completely.
 */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("auth_accounts_user_id_idx").on(t.userId),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [
    index("auth_sessions_user_id_idx").on(t.userId),
    // Sweeping expired sessions is the only other query this table ever gets.
    index("auth_sessions_expires_idx").on(t.expires),
  ],
);

/**
 * Magic-link tokens. Auth.js stores them **hashed**, so a database leak does not
 * hand out live sign-in links.
 */
export const authVerificationTokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/**
 * An invitation to join a workspace.
 *
 * Workspace-scoped, so it is covered by row-level security like everything else
 * — an invitation names an email address, which is customer data.
 *
 * Only the **hash** of the token is stored. The raw token exists in the emailed
 * URL and nowhere else, so a leaked database row cannot be redeemed. Redemption
 * is by token alone rather than by (workspace, email) because the recipient may
 * sign in with a different address than the one invited, and we would rather
 * know that than silently match on something the inviter typed.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: membershipRole("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Withdrawn by an owner. Kept rather than deleted so the audit trail survives. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_token_hash_key").on(t.tokenHash),
    // At most one live invitation per address per workspace. Partial, so
    // re-inviting someone whose invitation was revoked or accepted still works.
    uniqueIndex("invitations_workspace_email_live_key")
      .on(t.workspaceId, t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    index("invitations_workspace_created_at_idx").on(t.workspaceId, t.createdAt.desc()),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Owner and member is enough until someone asks for more (#34). */
    role: membershipRole("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_workspace_user_key").on(t.workspaceId, t.userId),
    index("memberships_user_id_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Endpoints and their optional schemas
// ---------------------------------------------------------------------------

export const endpoints = pgTable(
  "endpoints",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** What appears in `<form action=".../e/{publicId}">`. Never the primary key. */
    publicId: text("public_id").notNull(),
    name: text("name").notNull(),
    /**
     * The live schema, or null. Null is a fully working endpoint (#50) — it
     * accepts anything posted to it and discovers fields from the payload.
     *
     * A pointer rather than a flag on the version row: activating a schema or
     * rolling back to an earlier one is a single atomic UPDATE, and the version
     * rows themselves stay append-only.
     */
    activeSchemaVersionId: uuid("active_schema_version_id").references(
      (): AnyPgColumn => formSchemas.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete. "I deleted the endpoint and lost the leads" is a support disaster. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("endpoints_public_id_key").on(t.publicId),
    // Referenced by the composite foreign keys below, which is how a child row's
    // denormalised workspace_id is proven to match its parent's.
    unique("endpoints_workspace_id_id_key").on(t.workspaceId, t.id),
    index("endpoints_active_schema_version_id_idx").on(t.activeSchemaVersionId),
  ],
);

export const formSchemas = pgTable(
  "form_schemas",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id").notNull(),
    /** Monotonic per endpoint. Unique with endpoint_id below. */
    version: integer("version").notNull(),
    /**
     * The field definitions. Immutable once written: a submission must stay
     * readable against the exact definition it arrived under, so editing a
     * schema writes a new row rather than changing this one. There is
     * deliberately no `updated_at` and no `deleted_at` on this table.
     */
    fields: jsonb("fields").notNull(),
    mode: schemaMode("mode").notNull().default("warn"),
    source: schemaSource("source").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.endpointId],
      foreignColumns: [endpoints.workspaceId, endpoints.id],
      name: "form_schemas_endpoint_fk",
    }).onDelete("cascade"),
    uniqueIndex("form_schemas_endpoint_version_key").on(t.endpointId, t.version),
    unique("form_schemas_workspace_id_id_key").on(t.workspaceId, t.id),
    index("form_schemas_endpoint_id_idx").on(t.endpointId),
  ],
);

// ---------------------------------------------------------------------------
// Submissions — the central row
// ---------------------------------------------------------------------------

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id").notNull(),
    /** Handed to a customer's CRM so an outcome can be matched back (#43). */
    publicId: text("public_id").notNull(),

    /**
     * The schema version in force when this arrived, or null when the endpoint
     * had no schema. Never updated. This column is what makes "read this
     * submission against what the form was that day" possible.
     */
    schemaVersionId: uuid("schema_version_id").references(() => formSchemas.id, {
      onDelete: "restrict",
    }),
    /**
     * Which variant was served (#45). Forward-declared with no foreign key —
     * the variants table arrives with Hindsight, and stamping the column from
     * day one means the first real submissions are not retroactively unreadable.
     */
    variantId: uuid("variant_id"),

    /** Parsed field values. */
    values: jsonb("values").notNull().default({}),
    /**
     * The payload exactly as received. When a customer says "the data is wrong"
     * (#29) this is the only thing that can settle it.
     */
    rawBody: text("raw_body"),
    rawContentType: text("raw_content_type"),

    origin: submissionOrigin("origin").notNull().default("unverified"),
    /**
     * Why that stamp (#30). "Why is this Unverified?" must be answerable, so the
     * signals that produced the verdict are stored, not just the verdict.
     */
    originReasons: jsonb("origin_reasons").notNull().default([]),

    /**
     * Spam scoring (#31). Modelled deliberately on the two columns above,
     * because they solved the same problem: a stamp nobody can interrogate is a
     * risk score with better manners.
     */
    spamState: submissionSpamState("spam_state").notNull().default("clear"),
    /** Higher is more spam-like. The sum of the weights in `spam_reasons`. */
    spamScore: integer("spam_score").notNull().default(0),
    /**
     * Every signal that was consulted, including the ones that scored nothing,
     * each with what was observed and how much it moved the total. The final
     * entry carries the threshold, so a row read next year is still readable
     * against the bar it was actually judged by rather than today's.
     */
    spamReasons: jsonb("spam_reasons").notNull().default([]),
    /** When a person overruled the score. Null while the score stands. */
    spamReviewedAt: timestamp("spam_reviewed_at", { withTimezone: true }),
    spamReviewedByUserId: uuid("spam_reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    verdict: submissionVerdict("verdict").notNull().default("awaiting"),
    /** Exact decimal, not a float. Meaningless without `verdict_currency`. */
    verdictValue: numeric("verdict_value", { precision: 18, scale: 2 }),
    verdictCurrency: char("verdict_currency", { length: 3 }),
    verdictAt: timestamp("verdict_at", { withTimezone: true }),
    /** webhook | crm | csv | manual — how the outcome reached us (#43). */
    verdictSource: text("verdict_source"),

    /** When the visitor submitted, which is not always when we wrote the row. */
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),

    // Source metadata. UTMs are columns because the inbox filters and Yield (#44)
    // groups by them; click IDs are jsonb because every ad network invents another.
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    clickIds: jsonb("click_ids").notNull().default({}),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    /** Hashed, never raw. Enough to correlate abuse, not enough to be a liability. */
    ipHash: text("ip_hash"),

    /** Collapses double-submits and retries (#29). Unique per endpoint. */
    idempotencyKey: text("idempotency_key"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.endpointId],
      foreignColumns: [endpoints.workspaceId, endpoints.id],
      name: "submissions_endpoint_fk",
    }).onDelete("cascade"),
    uniqueIndex("submissions_public_id_key").on(t.publicId),
    unique("submissions_workspace_id_id_key").on(t.workspaceId, t.id),
    // Partial, so the many submissions that arrive without a key do not all
    // collide on a single NULL slot.
    uniqueIndex("submissions_endpoint_idempotency_key")
      .on(t.endpointId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    // Every list query in the product is this index.
    index("submissions_endpoint_created_at_idx").on(t.endpointId, t.createdAt.desc()),
    index("submissions_workspace_created_at_idx").on(t.workspaceId, t.createdAt.desc()),
    index("submissions_schema_version_id_idx").on(t.schemaVersionId),
    // The inbox filters on these two constantly, and Yield reports group by them.
    index("submissions_endpoint_origin_idx").on(t.endpointId, t.origin),
    // The inbox's "hide flagged" toggle and the spam review queue are both this
    // index. Deliberately not partial: `clear` is the overwhelming majority and
    // the common query filters *to* it.
    index("submissions_endpoint_spam_state_idx").on(t.endpointId, t.spamState),
    index("submissions_endpoint_verdict_idx").on(t.endpointId, t.verdict),
    // Searching inside submitted values is plausible enough to pay for up front.
    index("submissions_values_gin_idx").using("gin", t.values),
    // Hindsight's per-variant tallies group on this column (#45). Partial,
    // because every submission written before any test existed has it NULL and
    // there is no reason for all of them to share one index entry.
    index("submissions_variant_id_idx")
      .on(t.variantId)
      .where(sql`${t.variantId} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// Destinations and delivery
// ---------------------------------------------------------------------------

export const destinations = pgTable(
  "destinations",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id").notNull(),
    kind: destinationKind("kind").notNull(),
    name: text("name").notNull(),
    /** Shape depends on `kind`. Secrets get their own handling in #41; not here. */
    config: jsonb("config").notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Soft-deleted so the delivery history that references it stays readable. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.endpointId],
      foreignColumns: [endpoints.workspaceId, endpoints.id],
      name: "destinations_endpoint_fk",
    }).onDelete("cascade"),
    unique("destinations_workspace_id_id_key").on(t.workspaceId, t.id),
    index("destinations_endpoint_id_idx").on(t.endpointId),
  ],
);

export const deliveryAttempts = pgTable(
  "delivery_attempts",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    destinationId: uuid("destination_id").notNull(),
    submissionId: uuid("submission_id").notNull(),
    /** 1-based. Retries append rows; they never overwrite the failed one. */
    attempt: integer("attempt").notNull().default(1),
    status: deliveryStatus("status").notNull().default("pending"),

    // Both sides of the exchange are retained. #42 is the issue about telling a
    // customer their integration is broken, and "broken how" needs the response.
    requestBody: text("request_body"),
    requestHeaders: jsonb("request_headers"),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    /** Transport-level failure, where there is no response at all. */
    error: text("error"),

    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.destinationId],
      foreignColumns: [destinations.workspaceId, destinations.id],
      name: "delivery_attempts_destination_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.workspaceId, t.submissionId],
      foreignColumns: [submissions.workspaceId, submissions.id],
      name: "delivery_attempts_submission_fk",
    }).onDelete("cascade"),
    index("delivery_attempts_workspace_id_idx").on(t.workspaceId),
    index("delivery_attempts_submission_id_idx").on(t.submissionId),
    index("delivery_attempts_destination_created_at_idx").on(
      t.destinationId,
      t.createdAt.desc(),
    ),
    // The retry worker's only query.
    index("delivery_attempts_retry_idx").on(t.status, t.nextRetryAt),
  ],
);

// ---------------------------------------------------------------------------
// Spam and abuse (#31)
// ---------------------------------------------------------------------------

/**
 * A workspace's own blocklist and allowlist entries.
 *
 * The only control in the whole spam feature that is not a heuristic. A
 * customer who types an address, a domain or a word in here knows something
 * about their business that no rule in `src/lib/spam/rules.ts` does, so an
 * `allow` entry ends scoring outright and a `block` entry always flags.
 *
 * IP entries store the **hash**, matching `submissions.ip_hash`, so a raw
 * address is never written down. `label` holds what the person typed, for the
 * settings screen — an unlabelled `sha256:…` row is a list nobody can maintain.
 */
export const spamListEntries = pgTable(
  "spam_list_entries",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: spamListKind("kind").notNull(),
    effect: spamListEffect("effect").notNull(),
    /** The matchable value: an ip hash, a lowercased bare domain, or a phrase. */
    value: text("value").notNull(),
    /** What the person typed, shown back to them. For an IP, the address itself. */
    label: text("label"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One entry per value per kind per effect. Adding the same domain twice is
    // a no-op rather than an error someone has to think about.
    uniqueIndex("spam_list_entries_unique").on(t.workspaceId, t.kind, t.effect, t.value),
    index("spam_list_entries_workspace_idx").on(t.workspaceId, t.createdAt.desc()),
  ],
);

/**
 * Per-endpoint spam policy. **A missing row means the defaults**, which are in
 * `src/lib/spam/assess.ts` and are all-on.
 *
 * Every signal is switchable individually because a form that legitimately
 * collects URLs should not have to choose between link scoring and no scoring
 * at all. `threshold` is per endpoint for the same reason: a support form and a
 * high-value quote form have different tolerances for a false positive, and the
 * customer is the only one who knows which is which.
 */
export const endpointSpamPolicies = pgTable(
  "endpoint_spam_policies",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    honeypot: boolean("honeypot").notNull().default(true),
    timing: boolean("timing").notNull().default(true),
    duplicate: boolean("duplicate").notNull().default(true),
    velocity: boolean("velocity").notNull().default(true),
    content: boolean("content").notNull().default(true),
    disposableEmail: boolean("disposable_email").notNull().default(true),
    threshold: integer("threshold").notNull().default(5),
    /** An extra decoy field name this endpoint renders, on top of the built-ins. */
    honeypotField: text("honeypot_field"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.endpointId],
      foreignColumns: [endpoints.workspaceId, endpoints.id],
      name: "endpoint_spam_policies_endpoint_fk",
    }).onDelete("cascade"),
    uniqueIndex("endpoint_spam_policies_endpoint_key").on(t.endpointId),
  ],
);

// ---------------------------------------------------------------------------
// Hindsight — split tests scored on outcomes (#45)
// ---------------------------------------------------------------------------

/**
 * One split test on one endpoint.
 *
 * `started_at` is not decoration. The decision rule in
 * `src/lib/hindsight/compare.ts` refuses to declare a winner on a test that has
 * run for less than one median time-to-verdict, because a window shorter than
 * that cannot have decided the median lead and everything that *has* resolved
 * is the fast tail — the small deals and the quick disqualifications. That
 * comparison needs a clock, and this is the clock.
 *
 * Soft-deleted rather than removed, like endpoints and destinations: the
 * submissions stamped with this test's variants stay readable, and "I deleted
 * the test and lost which variant produced the good leads" is a support
 * disaster of exactly the kind `endpoints.deleted_at` exists to prevent.
 */
export const splitTests = pgTable(
  "split_tests",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id").notNull(),
    /** What appears in the app URL. Never the primary key, same as everywhere else. */
    publicId: text("public_id").notNull(),
    name: text("name").notNull(),
    status: splitTestStatus("status").notNull().default("draft"),
    /** When traffic started splitting. Null while the test is a draft. */
    startedAt: timestamp("started_at", { withTimezone: true }),
    /** Stops the split. The report keeps working; it just stops moving. */
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.endpointId],
      foreignColumns: [endpoints.workspaceId, endpoints.id],
      name: "split_tests_endpoint_fk",
    }).onDelete("cascade"),
    uniqueIndex("split_tests_public_id_key").on(t.publicId),
    unique("split_tests_workspace_id_id_key").on(t.workspaceId, t.id),
    index("split_tests_endpoint_id_idx").on(t.endpointId, t.createdAt.desc()),
    // The serving path's only query: "is a test running on this endpoint?".
    // Partial, because at most one row per endpoint is ever in this state and
    // the index should be the size of that answer rather than of the table.
    index("split_tests_running_idx")
      .on(t.endpointId)
      .where(sql`${t.status} = 'running' and ${t.deletedAt} is null`),
  ],
);

/**
 * One arm of a test. `id` is what lands in `submissions.variant_id`.
 *
 * A variant does **not** carry its own copy of a form. It points at an existing
 * `form_schemas` row — immutable, versioned, already the thing a submission is
 * read against — so running a test introduces no second definition of what a
 * form is. Null means "whatever the endpoint's active schema is", which is the
 * ordinary shape of a control: the arm that changes nothing.
 *
 * Append-only in practice. Nothing deletes a variant, because a deleted variant
 * would orphan every submission stamped with it and there is no way to say
 * afterwards which arm those leads belonged to.
 */
export const splitTestVariants = pgTable(
  "split_test_variants",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    testId: uuid("test_id").notNull(),
    /** The form this arm serves, or null for the endpoint's active schema. */
    schemaVersionId: uuid("schema_version_id").references(() => formSchemas.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    /**
     * The arm everything else is compared against. Exactly one per test.
     *
     * Without one, "B beat A" and "A beat B" are the same sentence read from
     * opposite ends, and which variant a workspace keeps when the test never
     * resolves stops being defined.
     */
    isControl: boolean("is_control").notNull().default(false),
    /** Relative traffic share. Two arms at 1 and 3 split 25/75. */
    weight: integer("weight").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.testId],
      foreignColumns: [splitTests.workspaceId, splitTests.id],
      name: "split_test_variants_test_fk",
    }).onDelete("cascade"),
    unique("split_test_variants_workspace_id_id_key").on(t.workspaceId, t.id),
    uniqueIndex("split_test_variants_test_name_key").on(t.testId, t.name),
    index("split_test_variants_test_id_idx").on(t.testId),
    // At most one control per test, enforced by the database rather than by the
    // code that happens to write it.
    uniqueIndex("split_test_variants_one_control")
      .on(t.testId)
      .where(sql`${t.isControl}`),
  ],
);

/**
 * How many times each arm was actually rendered, by day.
 *
 * A rollup rather than a row per view: a form page is the hottest read in the
 * product and one insert per render is a write amplification nobody asked for.
 * By day rather than a single running counter so the row being contended on
 * rotates, and so a future surface can draw the split over time without a
 * schema change.
 *
 * The count is **server renders, not people** — a reload, a prefetch and a
 * crawler each add one. `VariantExposure` in `src/lib/hindsight/types.ts` says
 * why that is reported rather than corrected for, and why the absence of a row
 * has to read as "we were not watching" instead of "shown nought times".
 */
export const splitTestExposures = pgTable(
  "split_test_exposures",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    testId: uuid("test_id").notNull(),
    variantId: uuid("variant_id").notNull(),
    /** UTC date. The bucket, not a timestamp. */
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.variantId],
      foreignColumns: [splitTestVariants.workspaceId, splitTestVariants.id],
      name: "split_test_exposures_variant_fk",
    }).onDelete("cascade"),
    // The upsert target. One row per arm per day, by construction.
    uniqueIndex("split_test_exposures_variant_day_key").on(t.variantId, t.day),
    index("split_test_exposures_test_id_idx").on(t.testId),
  ],
);

// ---------------------------------------------------------------------------

/**
 * Tables that carry `workspace_id` and are therefore both scoped by
 * `withWorkspace` and covered by row-level security. `src/db/scoped.ts` and the
 * isolation test both read this list, so adding a scoped table to the schema
 * without adding it here is caught by `npm run test:db`.
 */
export const workspaceScopedTables = [
  memberships,
  invitations,
  endpoints,
  formSchemas,
  submissions,
  destinations,
  deliveryAttempts,
  spamListEntries,
  endpointSpamPolicies,
  splitTests,
  splitTestVariants,
  splitTestExposures,
] as const;

export const workspaceScopedTableNames = [
  "memberships",
  "invitations",
  "endpoints",
  "form_schemas",
  "submissions",
  "destinations",
  "delivery_attempts",
  "spam_list_entries",
  "endpoint_spam_policies",
  "split_tests",
  "split_test_variants",
  "split_test_exposures",
] as const;

export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type MembershipRole = (typeof membershipRole.enumValues)[number];
export type Invitation = typeof invitations.$inferSelect;
export type Endpoint = typeof endpoints.$inferSelect;
export type FormSchema = typeof formSchemas.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Destination = typeof destinations.$inferSelect;
export type DeliveryAttempt = typeof deliveryAttempts.$inferSelect;
export type SpamListEntry = typeof spamListEntries.$inferSelect;
export type EndpointSpamPolicy = typeof endpointSpamPolicies.$inferSelect;
export type SubmissionSpamState = (typeof submissionSpamState.enumValues)[number];
export type SpamListKind = (typeof spamListKind.enumValues)[number];
export type SpamListEffect = (typeof spamListEffect.enumValues)[number];
export type SplitTest = typeof splitTests.$inferSelect;
export type SplitTestVariant = typeof splitTestVariants.$inferSelect;
export type SplitTestExposure = typeof splitTestExposures.$inferSelect;
export type SplitTestStatus = (typeof splitTestStatus.enumValues)[number];
