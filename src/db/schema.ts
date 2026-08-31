import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  char,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    imageUrl: text("image_url"),
    /** Magic link and Google only (#34). There is deliberately no password column. */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
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
    index("submissions_endpoint_verdict_idx").on(t.endpointId, t.verdict),
    // Searching inside submitted values is plausible enough to pay for up front.
    index("submissions_values_gin_idx").using("gin", t.values),
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

/**
 * Tables that carry `workspace_id` and are therefore both scoped by
 * `withWorkspace` and covered by row-level security. `src/db/scoped.ts` and the
 * isolation test both read this list, so adding a scoped table to the schema
 * without adding it here is caught by `npm run test:db`.
 */
export const workspaceScopedTables = [
  memberships,
  endpoints,
  formSchemas,
  submissions,
  destinations,
  deliveryAttempts,
] as const;

export const workspaceScopedTableNames = [
  "memberships",
  "endpoints",
  "form_schemas",
  "submissions",
  "destinations",
  "delivery_attempts",
] as const;

export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Endpoint = typeof endpoints.$inferSelect;
export type FormSchema = typeof formSchemas.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Destination = typeof destinations.$inferSelect;
export type DeliveryAttempt = typeof deliveryAttempts.$inferSelect;
