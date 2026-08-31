CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."destination_kind" AS ENUM('webhook', 'email', 'slack', 'google_sheets', 'hubspot', 'salesforce');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."schema_mode" AS ENUM('warn', 'strict');--> statement-breakpoint
CREATE TYPE "public"."schema_source" AS ENUM('html_import', 'file', 'inferred', 'builder');--> statement-breakpoint
CREATE TYPE "public"."submission_origin" AS ENUM('human', 'agent', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."submission_verdict" AS ENUM('won', 'lost', 'disqualified', 'awaiting');--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"destination_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"request_body" text,
	"request_headers" jsonb,
	"response_status" integer,
	"response_body" text,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destinations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"kind" "destination_kind" NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "destinations_workspace_id_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "endpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"active_schema_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "endpoints_workspace_id_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "form_schemas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"fields" jsonb NOT NULL,
	"mode" "schema_mode" DEFAULT 'warn' NOT NULL,
	"source" "schema_source" NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_schemas_workspace_id_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"schema_version_id" uuid,
	"variant_id" uuid,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_body" text,
	"raw_content_type" text,
	"origin" "submission_origin" DEFAULT 'unverified' NOT NULL,
	"origin_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verdict" "submission_verdict" DEFAULT 'awaiting' NOT NULL,
	"verdict_value" numeric(18, 2),
	"verdict_currency" char(3),
	"verdict_at" timestamp with time zone,
	"verdict_source" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"click_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"referrer" text,
	"user_agent" text,
	"ip_hash" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "submissions_workspace_id_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image_url" text,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_destination_fk" FOREIGN KEY ("workspace_id","destination_id") REFERENCES "public"."destinations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_submission_fk" FOREIGN KEY ("workspace_id","submission_id") REFERENCES "public"."submissions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_endpoint_fk" FOREIGN KEY ("workspace_id","endpoint_id") REFERENCES "public"."endpoints"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_active_schema_version_id_form_schemas_id_fk" FOREIGN KEY ("active_schema_version_id") REFERENCES "public"."form_schemas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_schemas" ADD CONSTRAINT "form_schemas_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_schemas" ADD CONSTRAINT "form_schemas_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_schemas" ADD CONSTRAINT "form_schemas_endpoint_fk" FOREIGN KEY ("workspace_id","endpoint_id") REFERENCES "public"."endpoints"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_schema_version_id_form_schemas_id_fk" FOREIGN KEY ("schema_version_id") REFERENCES "public"."form_schemas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_endpoint_fk" FOREIGN KEY ("workspace_id","endpoint_id") REFERENCES "public"."endpoints"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_attempts_workspace_id_idx" ON "delivery_attempts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "delivery_attempts_submission_id_idx" ON "delivery_attempts" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "delivery_attempts_destination_created_at_idx" ON "delivery_attempts" USING btree ("destination_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "delivery_attempts_retry_idx" ON "delivery_attempts" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "destinations_endpoint_id_idx" ON "destinations" USING btree ("endpoint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "endpoints_public_id_key" ON "endpoints" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "endpoints_active_schema_version_id_idx" ON "endpoints" USING btree ("active_schema_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_schemas_endpoint_version_key" ON "form_schemas" USING btree ("endpoint_id","version");--> statement-breakpoint
CREATE INDEX "form_schemas_endpoint_id_idx" ON "form_schemas" USING btree ("endpoint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_workspace_user_key" ON "memberships" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_public_id_key" ON "submissions" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_endpoint_idempotency_key" ON "submissions" USING btree ("endpoint_id","idempotency_key") WHERE "submissions"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "submissions_endpoint_created_at_idx" ON "submissions" USING btree ("endpoint_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "submissions_workspace_created_at_idx" ON "submissions" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "submissions_schema_version_id_idx" ON "submissions" USING btree ("schema_version_id");--> statement-breakpoint
CREATE INDEX "submissions_endpoint_origin_idx" ON "submissions" USING btree ("endpoint_id","origin");--> statement-breakpoint
CREATE INDEX "submissions_endpoint_verdict_idx" ON "submissions" USING btree ("endpoint_id","verdict");--> statement-breakpoint
CREATE INDEX "submissions_values_gin_idx" ON "submissions" USING gin ("values");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces" USING btree ("slug");