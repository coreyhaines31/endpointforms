-- Hindsight — split tests scored on outcomes (#45).
--
-- The DDL below is what `drizzle-kit generate` emitted for
-- `src/db/schema.ts`, kept verbatim so that it and
-- `drizzle/meta/0006_snapshot.json` cannot disagree — a hand-rolled
-- `CREATE UNIQUE INDEX` where the snapshot records a `UNIQUE` constraint is how
-- the next person's generated migration ends up trying to "fix" objects that
-- are already correct.
--
-- The row-level security block at the bottom is hand-written and appended, for
-- the same reason 0001, 0003 and 0005 are hand-written: drizzle-kit does not
-- emit policies, and a workspace-scoped table without them is a table
-- `npm run test:db` fails on. That failure is the point of that test.
--
-- Everything here is additive. No column is dropped, no default changes, no
-- table is rewritten, and the one change to an existing table is an index on
-- `submissions.variant_id` — a nullable column that has existed since 0000 and
-- has been NULL on every row written so far. Applying this to a live database
-- cannot fail a running submission.
--
-- ## Why there is no foreign key on submissions.variant_id
--
-- The column has carried a comment since 0000 saying it is forward-declared
-- with no foreign key, and that stays true. Variants are never hard-deleted — a
-- deleted arm would orphan every submission stamped with it, with no way to say
-- afterwards which leads belonged where — so referential integrity holds by
-- construction. Adding the constraint now would only create a way for a future
-- cleanup to fail loudly on rows nobody should be deleting. An index is added
-- instead, because Hindsight's per-variant tallies group on it.
--
-- ## Rolling this back
--
-- drizzle-kit does not emit down migrations and this repo has none, so
-- reversibility means two things, both deliberate:
--
-- 1. **Rolling back the application alone needs no database change.** Every
--    object below is additive; an older build ignores the three new tables and
--    the new index, and submissions keep being written.
-- 2. **Undoing the schema is five statements**, in this order, if it is ever
--    actually wanted. Note this destroys every split test and every exposure
--    count — it is not a no-op:
--
--      DROP INDEX "submissions_variant_id_idx";
--      DROP TABLE "split_test_exposures";
--      DROP TABLE "split_test_variants";
--      DROP TABLE "split_tests";
--      DROP TYPE "public"."split_test_status";

CREATE TYPE "public"."split_test_status" AS ENUM('draft', 'running', 'stopped');--> statement-breakpoint
CREATE TABLE "split_test_exposures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_test_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"schema_version_id" uuid,
	"name" text NOT NULL,
	"is_control" boolean DEFAULT false NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "split_test_variants_workspace_id_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "split_tests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "split_test_status" DEFAULT 'draft' NOT NULL,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "split_tests_workspace_id_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "split_test_exposures" ADD CONSTRAINT "split_test_exposures_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_test_exposures" ADD CONSTRAINT "split_test_exposures_variant_fk" FOREIGN KEY ("workspace_id","variant_id") REFERENCES "public"."split_test_variants"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_test_variants" ADD CONSTRAINT "split_test_variants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_test_variants" ADD CONSTRAINT "split_test_variants_schema_version_id_form_schemas_id_fk" FOREIGN KEY ("schema_version_id") REFERENCES "public"."form_schemas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_test_variants" ADD CONSTRAINT "split_test_variants_test_fk" FOREIGN KEY ("workspace_id","test_id") REFERENCES "public"."split_tests"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_tests" ADD CONSTRAINT "split_tests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_tests" ADD CONSTRAINT "split_tests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_tests" ADD CONSTRAINT "split_tests_endpoint_fk" FOREIGN KEY ("workspace_id","endpoint_id") REFERENCES "public"."endpoints"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "split_test_exposures_variant_day_key" ON "split_test_exposures" USING btree ("variant_id","day");--> statement-breakpoint
CREATE INDEX "split_test_exposures_test_id_idx" ON "split_test_exposures" USING btree ("test_id");--> statement-breakpoint
CREATE UNIQUE INDEX "split_test_variants_test_name_key" ON "split_test_variants" USING btree ("test_id","name");--> statement-breakpoint
CREATE INDEX "split_test_variants_test_id_idx" ON "split_test_variants" USING btree ("test_id");--> statement-breakpoint
CREATE UNIQUE INDEX "split_test_variants_one_control" ON "split_test_variants" USING btree ("test_id") WHERE "split_test_variants"."is_control";--> statement-breakpoint
CREATE UNIQUE INDEX "split_tests_public_id_key" ON "split_tests" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "split_tests_endpoint_id_idx" ON "split_tests" USING btree ("endpoint_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "split_tests_running_idx" ON "split_tests" USING btree ("endpoint_id") WHERE "split_tests"."status" = 'running' and "split_tests"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "submissions_variant_id_idx" ON "submissions" USING btree ("variant_id") WHERE "submissions"."variant_id" is not null;
--> statement-breakpoint

-- Row-level security, matching 0001 and 0005 exactly. A split test is a revenue
-- report with more columns; it leaking across a tenant boundary would be worse
-- than the inbox doing it.
ALTER TABLE "split_tests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "split_tests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "split_tests_workspace_isolation" ON "split_tests"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
--> statement-breakpoint

ALTER TABLE "split_test_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "split_test_variants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "split_test_variants_workspace_isolation" ON "split_test_variants"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
--> statement-breakpoint

ALTER TABLE "split_test_exposures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "split_test_exposures" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "split_test_exposures_workspace_isolation" ON "split_test_exposures"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
