CREATE TYPE "public"."split_test_basis" AS ENUM('exposure', 'submission');--> statement-breakpoint
CREATE TABLE "verdict_api_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"secret_hash" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"last_used_at" timestamp with time zone,
	"last_used_ip" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	CONSTRAINT "verdict_api_keys_workspace_id_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "split_tests" ADD COLUMN "mde_relative" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "split_tests" ADD COLUMN "mde_baseline_rate" numeric(9, 8);--> statement-breakpoint
ALTER TABLE "split_tests" ADD COLUMN "mde_basis" "split_test_basis";--> statement-breakpoint
ALTER TABLE "split_tests" ADD COLUMN "mde_registered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "derived_key_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "derived_key_last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verdict_api_keys" ADD CONSTRAINT "verdict_api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verdict_api_keys" ADD CONSTRAINT "verdict_api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verdict_api_keys" ADD CONSTRAINT "verdict_api_keys_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "verdict_api_keys_public_id_key" ON "verdict_api_keys" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "verdict_api_keys_workspace_idx" ON "verdict_api_keys" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "split_tests" ADD CONSTRAINT "split_tests_mde_all_or_nothing" CHECK (("split_tests"."mde_relative" is null and "split_tests"."mde_baseline_rate" is null and "split_tests"."mde_basis" is null and "split_tests"."mde_registered_at" is null) or ("split_tests"."mde_relative" is not null and "split_tests"."mde_baseline_rate" is not null and "split_tests"."mde_basis" is not null and "split_tests"."mde_registered_at" is not null));--> statement-breakpoint
ALTER TABLE "split_tests" ADD CONSTRAINT "split_tests_mde_relative_positive" CHECK ("split_tests"."mde_relative" is null or "split_tests"."mde_relative" > 0);--> statement-breakpoint
ALTER TABLE "split_tests" ADD CONSTRAINT "split_tests_mde_baseline_rate_range" CHECK ("split_tests"."mde_baseline_rate" is null or ("split_tests"."mde_baseline_rate" > 0 and "split_tests"."mde_baseline_rate" < 1));--> statement-breakpoint

-- Row-level security, matching 0001, 0005, 0006 and 0007 exactly.
--
-- A key row holds no secret — `secret_hash` is one-way and the plaintext is
-- never written down — but it is still one tenant's row: its label, its
-- last-used address and even the count of live keys belong to one workspace and
-- to nobody else. The policy is written identically to every other scoped
-- table's rather than adapted, because a table whose isolation is phrased a
-- slightly different way is a table somebody has to read twice to trust.
--
-- The permissive branch (`app_current_workspace_id() IS NULL`) is what lets the
-- outcome webhook authenticate before a workspace is known. That read is the
-- same chicken-and-egg as the auth layer's membership lookup: "which workspace
-- is this key for?" cannot be asked from inside a scope keyed on the answer.
-- Everything downstream of it runs inside `withWorkspace`.
ALTER TABLE "verdict_api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verdict_api_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "verdict_api_keys_workspace_isolation" ON "verdict_api_keys"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
