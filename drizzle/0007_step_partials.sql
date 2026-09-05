CREATE TABLE "submission_partials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"partial_key" text NOT NULL,
	"schema_version_id" uuid,
	"variant_id" uuid,
	"step_id" text,
	"step_number" integer,
	"steps_total" integer,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"origin" "submission_origin" DEFAULT 'unverified' NOT NULL,
	"origin_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"click_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"referrer" text,
	"user_agent" text,
	"ip_hash" text,
	"completed_at" timestamp with time zone,
	"submission_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "submission_partials_workspace_id_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "submission_partials" ADD CONSTRAINT "submission_partials_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_partials" ADD CONSTRAINT "submission_partials_schema_version_id_form_schemas_id_fk" FOREIGN KEY ("schema_version_id") REFERENCES "public"."form_schemas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_partials" ADD CONSTRAINT "submission_partials_endpoint_fk" FOREIGN KEY ("workspace_id","endpoint_id") REFERENCES "public"."endpoints"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_partials_public_id_key" ON "submission_partials" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_partials_endpoint_key" ON "submission_partials" USING btree ("endpoint_id","partial_key");--> statement-breakpoint
CREATE INDEX "submission_partials_workspace_updated_at_idx" ON "submission_partials" USING btree ("workspace_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "submission_partials_endpoint_updated_at_idx" ON "submission_partials" USING btree ("endpoint_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "submission_partials_open_idx" ON "submission_partials" USING btree ("endpoint_id","updated_at" DESC NULLS LAST) WHERE "submission_partials"."completed_at" is null and "submission_partials"."deleted_at" is null;
--> statement-breakpoint

-- Row-level security, matching 0001, 0005 and 0006 exactly.
--
-- A partial is a lead's half-finished answers, which is customer data of the
-- same kind as a submission and leaks the same way. The policy is identical to
-- the one on `submissions` on purpose: a table whose isolation is written a
-- slightly different way is a table somebody has to read twice to trust.
ALTER TABLE "submission_partials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "submission_partials" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "submission_partials_workspace_isolation" ON "submission_partials"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
