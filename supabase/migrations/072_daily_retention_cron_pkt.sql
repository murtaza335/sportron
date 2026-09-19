-- ============================================================
-- 072: Daily retention nudge cron at 6 AM PKT (1 AM UTC)
-- ============================================================
-- Sends "Plan a game for tomorrow, Now!" to all users with FCM tokens
-- via the streak-cron edge function (mode: "retention")

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule: 0 1 * * * = 1 AM UTC = 6 AM PKT (UTC+5)
select cron.schedule(
  'daily-retention-nudge-6am-pkt',
  '0 1 * * *',
  $$
  select net.http_post(
    url := 'https://wmnophypxgpievryowzy.supabase.co/functions/v1/streak-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body := '{"mode": "retention"}'::jsonb
  );
  $$
);

-- To remove later if needed:
-- select cron.unschedule('daily-retention-nudge-6am-pkt');