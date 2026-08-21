-- supabase/migrations/042_setup_streak_cron.sql
-- Schedules the streak notification cron job.
-- NOTE: replace YOUR_SERVICE_ROLE_KEY with the real service_role key before applying.
-- The key is a secret — do NOT commit the real value to a public repo.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

SELECT cron.schedule(
  'streak-daily-nudge',
  '0 5 * * *',
  $$SELECT net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/streak-cron',
    body := '{"mode":"daily"}'::jsonb,
    headers := '{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );$$
);

SELECT cron.schedule(
  'streak-at-risk',
  '0 * * * *',
  $$SELECT net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/streak-cron',
    body := '{"mode":"at-risk"}'::jsonb,
    headers := '{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );$$
);