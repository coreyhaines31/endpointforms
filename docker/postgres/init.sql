-- Runs once, on first boot of an empty data volume.
--
-- The application must NOT connect as a superuser. A superuser bypasses row
-- level security unconditionally — FORCE ROW LEVEL SECURITY does not apply to
-- it — so connecting as one would silently disable the tenant isolation in
-- drizzle/0001_tenant_isolation.sql and every cross-tenant query would quietly
-- start working. `npm run test:db` is what catches that, and it caught exactly
-- this during the build.
--
-- So: `postgres` stays the bootstrap superuser and is not used by the app.
-- `endpoint` is an ordinary role that owns the database, which is enough to run
-- migrations (DDL ignores RLS) while still being subject to the policies on the
-- tables it owns.

CREATE ROLE endpoint LOGIN PASSWORD 'endpoint' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

CREATE DATABASE endpointforms OWNER endpoint;
