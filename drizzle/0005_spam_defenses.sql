-- Spam and abuse defenses (#31).
--
-- Hand-written rather than generated, for the same reason 0001 and 0003 are:
-- the two new tables are workspace-scoped and therefore need row-level security
-- policies, which `drizzle-kit generate` does not emit. Written by hand also
-- because several agents were editing `src/db/schema.ts` at the time and a
-- generated diff would have swept their in-flight work into this file.
--
-- Everything here is additive. No column is dropped, no default changes, and
-- every new column has a default, so applying this to a live database cannot
-- fail a running submission.
--
-- ## Why spam is its own axis
--
-- Not `submission_origin` (human / agent / unverified): a person in Chrome can
-- send a casino advert and an agent using Manifest can send the best lead of
-- the quarter. Not `submission_verdict` (won / lost / disqualified / awaiting):
-- that column is the downstream business outcome and it is the input to Yield's
-- ranking, so a heuristic that could set `disqualified` would be a regex
-- deciding which form variant wins.

CREATE TYPE "public"."submission_spam_state" AS ENUM('clear', 'flagged', 'not_spam', 'confirmed_spam');--> statement-breakpoint
CREATE TYPE "public"."spam_list_kind" AS ENUM('ip', 'email_domain', 'keyword');--> statement-breakpoint
CREATE TYPE "public"."spam_list_effect" AS ENUM('block', 'allow');--> statement-breakpoint

-- Note the absence of a 'deleted', 'rejected' or 'blocked' state. A flagged
-- submission is stored, exported and visible like any other.
ALTER TABLE "submissions" ADD COLUMN "spam_state" "submission_spam_state" DEFAULT 'clear' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "spam_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "spam_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "spam_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "spam_reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_spam_reviewed_by_user_id_users_id_fk"
  FOREIGN KEY ("spam_reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_endpoint_spam_state_idx" ON "submissions" USING btree ("endpoint_id", "spam_state");--> statement-breakpoint

CREATE TABLE "spam_list_entries" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL,
  "kind" "spam_list_kind" NOT NULL,
  "effect" "spam_list_effect" NOT NULL,
  "value" text NOT NULL,
  "label" text,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "spam_list_entries" ADD CONSTRAINT "spam_list_entries_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_list_entries" ADD CONSTRAINT "spam_list_entries_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spam_list_entries_unique" ON "spam_list_entries" USING btree ("workspace_id", "kind", "effect", "value");--> statement-breakpoint
CREATE INDEX "spam_list_entries_workspace_idx" ON "spam_list_entries" USING btree ("workspace_id", "created_at" DESC);--> statement-breakpoint

-- A missing row means the defaults, which live in `src/lib/spam/assess.ts` and
-- are all-on. The columns exist so a customer can switch one signal off without
-- switching the feature off.
CREATE TABLE "endpoint_spam_policies" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL,
  "endpoint_id" uuid NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "honeypot" boolean DEFAULT true NOT NULL,
  "timing" boolean DEFAULT true NOT NULL,
  "duplicate" boolean DEFAULT true NOT NULL,
  "velocity" boolean DEFAULT true NOT NULL,
  "content" boolean DEFAULT true NOT NULL,
  "disposable_email" boolean DEFAULT true NOT NULL,
  "threshold" integer DEFAULT 5 NOT NULL,
  "honeypot_field" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "endpoint_spam_policies" ADD CONSTRAINT "endpoint_spam_policies_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Composite, so the denormalised workspace_id is proven to match the endpoint's
-- rather than merely believed to. Same device every other child table uses.
ALTER TABLE "endpoint_spam_policies" ADD CONSTRAINT "endpoint_spam_policies_endpoint_fk"
  FOREIGN KEY ("workspace_id", "endpoint_id") REFERENCES "public"."endpoints"("workspace_id", "id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "endpoint_spam_policies_endpoint_key" ON "endpoint_spam_policies" USING btree ("endpoint_id");--> statement-breakpoint

-- Row-level security, matching 0001 exactly. A workspace-scoped table without
-- these is a table `npm run test:db` fails on, which is the point of that test.
ALTER TABLE "spam_list_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "spam_list_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "spam_list_entries_workspace_isolation" ON "spam_list_entries"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
--> statement-breakpoint

ALTER TABLE "endpoint_spam_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "endpoint_spam_policies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "endpoint_spam_policies_workspace_isolation" ON "endpoint_spam_policies"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
