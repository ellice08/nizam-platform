-- HOW TO USE:
-- Go to Supabase dashboard → SQL Editor → New query → paste and run.

-- Allow authenticated users to read their own tenant_users record
CREATE POLICY "users_can_read_own_tenant"
ON tenant_users
FOR SELECT
USING (user_id = auth.uid());

-- Allow authenticated users to read their own tenant details
CREATE POLICY "users_can_read_own_tenant_details"
ON tenants
FOR SELECT
USING (
  id IN (
    SELECT tenant_id FROM tenant_users
    WHERE user_id = auth.uid()
  )
);
