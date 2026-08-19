-- Migration: Server-side FCM push triggering (pg_net)
--
-- Push notifications are now triggered by the DATABASE, not by the client.
-- When a row is inserted into `in_app_notifications` (all in-app notification
-- types — match pending, pings, join requests, session apps, invites, ...) or
-- into `session_messages` / `community_messages` (FCM-only chat), a Postgres
-- trigger fires an async pg_net HTTP request to an edge function, which sends
-- the FCM push. This means web sends are just as reliable as native sends:
-- web cannot RECEIVE FCM, but it can always cause app users to receive it.
--
-- SETUP (one time, required for pushes to fire):
--   create extension if not exists supabase_vault;
--   select vault.create_secret('<YOUR_SUPABASE_URL>', 'supabase_url');
--   select vault.create_secret('<YOUR_SERVICE_ROLE_KEY>', 'service_role_key');
-- The trigger functions skip (and raise a notice) if these secrets are absent,
-- so the migration is safe to run before the secrets are populated.
--
-- Also requires the edge functions deployed (function bodies changed):
--   supabase functions deploy send-notification send-chat-notification

create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- ---------------------------------------------------------------------------
-- In-app notifications: push to the recipient's devices.
-- ---------------------------------------------------------------------------

create or replace function public.notify_fcm_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_key text;
  base_url text;
begin
  select decrypted_secret into service_key
    from vault.decrypted_secrets
    where name = 'service_role_key';

  select decrypted_secret into base_url
    from vault.decrypted_secrets
    where name = 'supabase_url';

  if service_key is null or base_url is null then
    raise notice 'FCM push skipped for notification %: vault secrets service_role_key/supabase_url not configured', new.id;
    return new;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('notification_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists trg_fcm_push on public.in_app_notifications;
create trigger trg_fcm_push
  after insert on public.in_app_notifications
  for each row
  execute function public.notify_fcm_push();

-- ---------------------------------------------------------------------------
-- Chat messages: FCM-only push to chat recipients (session/community).
-- ---------------------------------------------------------------------------

create or replace function public.notify_chat_fcm_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_key text;
  base_url text;
  chat_type text;
  chat_id uuid;
begin
  select decrypted_secret into service_key
    from vault.decrypted_secrets
    where name = 'service_role_key';

  select decrypted_secret into base_url
    from vault.decrypted_secrets
    where name = 'supabase_url';

  if service_key is null or base_url is null then
    raise notice 'FCM chat push skipped for message %: vault secrets service_role_key/supabase_url not configured', new.id;
    return new;
  end if;

  if tg_table_name = 'session_messages' then
    chat_type := 'session';
    chat_id := new.session_id;
  else
    chat_type := 'community';
    chat_id := new.community_id;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/send-chat-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'chat_type', chat_type,
      'chat_id', chat_id,
      'message_id', new.id
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_session_chat_fcm_push on public.session_messages;
create trigger trg_session_chat_fcm_push
  after insert on public.session_messages
  for each row
  execute function public.notify_chat_fcm_push();

drop trigger if exists trg_community_chat_fcm_push on public.community_messages;
create trigger trg_community_chat_fcm_push
  after insert on public.community_messages
  for each row
  execute function public.notify_chat_fcm_push();