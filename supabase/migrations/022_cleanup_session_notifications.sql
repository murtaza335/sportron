-- Migration: Delete pending "session_application" notifications when a session ends
--
-- A session "ends" when its status becomes terminal (closed/completed/cancelled) —
-- e.g. auto-closed by close_expired_sessions() — or when the session row is deleted.
-- Pending applicant-approval notifications ("wanna let X in the session?") are
-- meaningless once the session is over, so we remove them server-side. This keeps the
-- "Action Required" inbox free of stale entries for the session creator.
--
-- SECURITY DEFINER so the cleanup can delete notifications for any user regardless of
-- which client/user triggered the closure (RLS on in_app_notifications would otherwise
-- block cross-user deletion).

create or replace function public.cleanup_session_application_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.in_app_notifications
  where type = 'session_application'
    and (data->>'sessionId')::uuid = old.id;
  return old;
end;
$$;

-- Fire when a session transitions to a terminal status
create trigger cleanup_session_application_notifications_on_close
after update of status on public.sessions
for each row
when (new.status in ('closed', 'completed', 'cancelled'))
execute function public.cleanup_session_application_notifications();

-- Fire when a session is deleted
create trigger cleanup_session_application_notifications_on_delete
after delete on public.sessions
for each row
execute function public.cleanup_session_application_notifications();
