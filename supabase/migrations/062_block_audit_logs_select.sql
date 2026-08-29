-- Block all authenticated users from reading audit_logs
-- Only service_role (edge functions, triggers) can read via SECURITY DEFINER

DROP POLICY IF EXISTS "Audit logs are readable by authenticated users" ON public.audit_logs;

CREATE POLICY "Audit logs are not readable by authenticated users"
  ON public.audit_logs FOR select
  TO authenticated
  USING (false);