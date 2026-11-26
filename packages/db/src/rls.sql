-- APIWatch - PostgreSQL 16 Row-Level Security (RLS) & Least-Privilege App Role
-- Enforces multi-tenant data isolation at the storage layer via current_setting('app.org_id')

-- 1. Create Least-Privilege Application Role (no BYPASSRLS, no SUPERUSER)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'apiwatch_app') THEN
    CREATE ROLE apiwatch_app WITH LOGIN PASSWORD 'apiwatch_app_secure_password';
  END IF;
END
$$;

ALTER ROLE apiwatch_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT CONNECT ON DATABASE apiwatch TO apiwatch_app;
GRANT USAGE ON SCHEMA public TO apiwatch_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apiwatch_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO apiwatch_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO apiwatch_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO apiwatch_app;

-- 2. Helper function to safely read current tenant context
CREATE OR REPLACE FUNCTION current_tenant_org_id() RETURNS text AS $$
BEGIN
  RETURN NULLIF(current_setting('app.org_id', true), '');
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. Enable and Force RLS on all tenant-scoped tables

-- Memberships
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "memberships";
CREATE POLICY tenant_isolation_policy ON "memberships"
  FOR ALL
  USING ("organizationId" = current_tenant_org_id())
  WITH CHECK ("organizationId" = current_tenant_org_id());

-- Custom Roles
ALTER TABLE "custom_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_roles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "custom_roles";
CREATE POLICY tenant_isolation_policy ON "custom_roles"
  FOR ALL
  USING ("organizationId" = current_tenant_org_id())
  WITH CHECK ("organizationId" = current_tenant_org_id());

-- Invitations
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "invitations";
CREATE POLICY tenant_isolation_policy ON "invitations"
  FOR ALL
  USING ("organizationId" = current_tenant_org_id())
  WITH CHECK ("organizationId" = current_tenant_org_id());

-- API Keys
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "api_keys";
CREATE POLICY tenant_isolation_policy ON "api_keys"
  FOR ALL
  USING ("organizationId" = current_tenant_org_id())
  WITH CHECK ("organizationId" = current_tenant_org_id());

-- Monitors
ALTER TABLE "monitors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "monitors" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "monitors";
CREATE POLICY tenant_isolation_policy ON "monitors"
  FOR ALL
  USING ("organizationId" = current_tenant_org_id())
  WITH CHECK ("organizationId" = current_tenant_org_id());

-- Check Results
ALTER TABLE "check_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "check_results" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "check_results";
CREATE POLICY tenant_isolation_policy ON "check_results"
  FOR ALL
  USING ("organizationId" = current_tenant_org_id())
  WITH CHECK ("organizationId" = current_tenant_org_id());

-- Incidents
ALTER TABLE "incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incidents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "incidents";
CREATE POLICY tenant_isolation_policy ON "incidents"
  FOR ALL
  USING ("organizationId" = current_tenant_org_id())
  WITH CHECK ("organizationId" = current_tenant_org_id());

-- Audit Logs
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "audit_logs";
CREATE POLICY tenant_isolation_policy ON "audit_logs"
  FOR ALL
  USING ("organizationId" = current_tenant_org_id())
  WITH CHECK ("organizationId" = current_tenant_org_id());

-- Organization Keys (Vault)
ALTER TABLE "organization_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_keys" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "organization_keys";
CREATE POLICY tenant_isolation_policy ON "organization_keys"
  FOR ALL
  USING ("organizationId" = current_tenant_org_id())
  WITH CHECK ("organizationId" = current_tenant_org_id());
