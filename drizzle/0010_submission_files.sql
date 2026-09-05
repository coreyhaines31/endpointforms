CREATE TABLE "submission_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"field_key" text NOT NULL,
	"filename" text NOT NULL,
	"declared_content_type" text,
	"detected_content_type" text,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"bytes" "bytea",
	"expires_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_files_workspace_id_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_endpoint_fk" FOREIGN KEY ("workspace_id","endpoint_id") REFERENCES "public"."endpoints"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_submission_fk" FOREIGN KEY ("workspace_id","submission_id") REFERENCES "public"."submissions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_files_public_id_key" ON "submission_files" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "submission_files_submission_idx" ON "submission_files" USING btree ("workspace_id","submission_id");--> statement-breakpoint
CREATE INDEX "submission_files_expiry_idx" ON "submission_files" USING btree ("expires_at") WHERE "submission_files"."purged_at" is null and "submission_files"."expires_at" is not null;
--> statement-breakpoint

-- Row-level security, matching 0001, 0005, 0006 and 0007 exactly.
--
-- An uploaded file is the most sensitive thing in the product: a CV, a set of
-- accounts, a photograph of a passport. It leaks the same way a submission does
-- and is guarded the same way, deliberately word-for-word — a table whose
-- isolation is written a slightly different way is a table somebody has to read
-- twice to trust.
ALTER TABLE "submission_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "submission_files" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "submission_files_workspace_isolation" ON "submission_files"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
