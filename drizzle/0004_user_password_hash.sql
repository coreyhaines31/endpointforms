-- Password sign-in (#34, revisited).
--
-- `password_hash` is nullable, and it stays nullable. Google users have no
-- password and never will; neither does anyone who signed up by magic link
-- before this column existed. A NOT NULL with a placeholder default would turn
-- "does not use a password" into "uses a password nobody knows", which is the
-- same thing right up until some future code path reads a non-null hash as
-- proof that password sign-in is available for that account.
--
-- No index on it. The only query that reads it has already found its row by
-- email, and an index on a password hash is a way to ask questions about
-- password hashes that nobody should be able to ask.
--
-- `users_email_lower_key` makes one-account-per-address hold whatever case the
-- address was typed in. `users_email_key` stays as it is because
-- `@auth/drizzle-adapter` looks users up with an exact match and that is the
-- index it uses; this one exists because password sign-up normalises the
-- address before storing it, and without it a person whose row was written as
-- `Alice@…` by an earlier magic link could sign up again as `alice@…` and end
-- up with two accounts. It also backs the case-insensitive lookup in
-- `src/lib/auth/account.ts`.
--
-- `users` carries no `workspace_id` and so gets no row-level security policy,
-- for the same reason `auth_sessions` does not: it is about a person, not a
-- tenant. See `drizzle/0001_tenant_isolation.sql`.

ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" USING btree (lower("email"));
