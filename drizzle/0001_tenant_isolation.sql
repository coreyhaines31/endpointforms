-- Tenant isolation, enforced by the database.
--
-- `withWorkspace()` (src/db/scoped.ts) opens a transaction and sets
-- `app.workspace_id`. For the life of that transaction these policies make every
-- other workspace's rows invisible — so a query inside a request handler that
-- forgets its `where` clause returns nothing instead of everything. That is the
-- realistic failure mode, and it is the one a hand-written predicate cannot
-- protect against.
--
-- Outside such a transaction the setting is empty and the policies are
-- permissive. That is deliberate: migrations, the seed script, and the auth
-- query that asks which workspaces a user belongs to all run before any
-- workspace is known. A scheme that cannot express those gets switched off
-- wholesale by the first person who needs one, and then protects nothing.
--
-- FORCE, not just ENABLE: the application connects as the table owner, and an
-- owner is exempt from its own policies unless forced.

CREATE OR REPLACE FUNCTION app_current_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$
    SELECT NULLIF(current_setting('app.workspace_id', true), '')::uuid;
  $$;
--> statement-breakpoint

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "memberships_workspace_isolation" ON "memberships"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
--> statement-breakpoint

ALTER TABLE "endpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "endpoints" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "endpoints_workspace_isolation" ON "endpoints"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
--> statement-breakpoint

ALTER TABLE "form_schemas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "form_schemas" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "form_schemas_workspace_isolation" ON "form_schemas"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
--> statement-breakpoint

ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "submissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "submissions_workspace_isolation" ON "submissions"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
--> statement-breakpoint

ALTER TABLE "destinations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "destinations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "destinations_workspace_isolation" ON "destinations"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
--> statement-breakpoint

ALTER TABLE "delivery_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "delivery_attempts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "delivery_attempts_workspace_isolation" ON "delivery_attempts"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
