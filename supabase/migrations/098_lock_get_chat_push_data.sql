-- SEC-C1: get_chat_push_data was SECURITY DEFINER with default PUBLIC execute, so any
-- client (even anon) could read the last 50 messages of any chat plus every recipient's
-- FCM tokens. Only the send-chat-notification edge function (service_role) calls it.
--
-- Backward compatible: no app build calls this RPC. Trigger functions that use the helper
-- below are SECURITY DEFINER (run as owner), so revoking client roles does not affect them.

revoke all on function public.get_chat_push_data(uuid, text, uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_chat_push_data(uuid, text, uuid, uuid, text, uuid)
  to service_role;

revoke all on function public._notification_already_exists(uuid, text, jsonb, int)
  from public, anon, authenticated;
grant execute on function public._notification_already_exists(uuid, text, jsonb, int)
  to service_role;

-- insert_notification was locked in 069; re-assert (idempotent).
revoke all on function public.insert_notification(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.insert_notification(uuid, text, text, text, jsonb)
  to service_role;
