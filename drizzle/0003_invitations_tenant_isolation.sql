-- `invitations` is workspace-scoped, so it gets the same treatment as every
-- other scoped table: FORCE ROW LEVEL SECURITY and a policy keyed on the
-- `app.workspace_id` setting that `withWorkspace()` sets for the transaction.
--
-- An invitation holds an email address someone typed into our product. Leaving
-- it outside the boundary because "it is only an invite" is exactly how a scoped
-- table gets missed — which is why `tests/tenant-isolation.test.mts` asserts that
-- the set of forced tables equals `workspaceScopedTableNames` and fails when a
-- new table is added to the schema without this file.
--
-- Redeeming an invitation looks it up by token *outside* a scoped transaction,
-- where the policies are permissive by design. That is the same category as the
-- auth query asking which workspaces a user belongs to: it runs before any
-- workspace is known, and the token itself is the secret.

ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invitations_workspace_isolation" ON "invitations"
  USING (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id())
  WITH CHECK (app_current_workspace_id() IS NULL OR "workspace_id" = app_current_workspace_id());
