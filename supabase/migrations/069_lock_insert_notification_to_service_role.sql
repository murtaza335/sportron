-- ============================================================
-- 069: Lock insert_notification RPC to service_role only
-- ============================================================
-- After 068 deployed server-side notification triggers, the client
-- no longer needs to call insert_notification directly. Old client
-- builds still call it but:
--   1. Their notifications are already created by the triggers (068)
--   2. The dedup guard in insert_notification prevents duplicates
--   3. All callers wrap the RPC in try/catch — failures are silent
--
-- Locking the RPC to service_role:
--   - Prevents any authenticated/anon user from forging notifications
--   - The streak-cron edge function (which uses service_role) still works
--   - Old client builds see RPC errors that are caught gracefully
--
-- This is the CRITICAL security fix: with 068's dedup guard and this
-- migration, no user can insert arbitrary notifications via the client.

-- Revoke from all roles that the client uses
REVOKE EXECUTE ON FUNCTION public.insert_notification(
  uuid, text, text, text, jsonb
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.insert_notification(
  uuid, text, text, text, jsonb
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.insert_notification(
  uuid, text, text, text, jsonb
) FROM anon;

-- Grant only to service_role (used by streak-cron edge function)
GRANT EXECUTE ON FUNCTION public.insert_notification(
  uuid, text, text, text, jsonb
) TO service_role;
