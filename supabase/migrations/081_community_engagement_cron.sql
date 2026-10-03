-- ============================================================================
-- 081: Community Admin Engagement Cron Job
-- ============================================================================
-- Schedules the community-engagement-cron edge function to run every 4 days
-- (approximately "4-5 days" as requested).
--
-- Requires the edge function to be deployed first:
--   supabase functions deploy community-engagement-cron
--
-- Then run this migration to schedule the cron job.
-- pg_cron is already enabled from migration 042/072.
-- ============================================================================

-- Schedule the cron job (every 4 days at 10 AM UTC)
-- Uses the service role key from Vault for authentication
select cron.schedule(
  'community-admin-engagement-every-4-days',
  '0 10 */4 * *',  -- Every 4 days at 10:00 UTC
  $$
  select net.http_post(
    url := 'https://wmnophypxgpievryowzy.supabase.co/functions/v1/community-engagement-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To unschedule later if needed:
-- select cron.unschedule('community-admin-engagement-every-4-days');