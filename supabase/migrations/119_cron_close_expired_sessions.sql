-- BUG-L7: expired sessions only closed when some client happened to call close_expired_sessions().
-- Schedule it in the database every 5 minutes (pg_cron). The function is SECURITY DEFINER and
-- touches only sessions past their expires_at. The client-side calls stay as a harmless
-- fast path.

create extension if not exists pg_cron;

-- Idempotent: drop a previous schedule of the same name, if any.
do $$
begin
  perform cron.unschedule('close-expired-sessions');
exception when others then
  null;
end $$;

select cron.schedule(
  'close-expired-sessions',
  '*/5 * * * *',
  $$select public.close_expired_sessions();$$
);
