-- Migration: Consolidate chat push notification queries into a single RPC
--
-- Problem: the send-chat-notification edge function makes 8-9 separate REST
-- queries per message (message, session/community, recipients, presence,
-- profiles, recent messages, read cursors, reply target). This causes massive
-- connection pool overhead, heavy read traffic, and excessive WAL processing.
--
-- Solution:
--   1. A single RPC `get_chat_push_data` returns chat name, recent messages,
--      recipients with FCM tokens + read cursors, and reply target in one
--      round-trip. The edge function does trivial in-memory unread filtering.
--   2. The trigger payload is enriched with sender_username, content, and
--      reply_to_id (all available on the NEW row) so the edge function
--      doesn't even need to fetch the message row.
--
-- The edge function goes from 8-9 DB queries to exactly 1 (the RPC call).

-- ---------------------------------------------------------------------------
-- Return types for get_chat_push_data
-- ---------------------------------------------------------------------------

drop type if exists public.chat_push_recipient cascade;
create type public.chat_push_recipient as (
  profile_id   uuid,
  fcm_tokens   text[],
  last_read_at timestamptz
);

drop type if exists public.chat_push_message cascade;
create type public.chat_push_message as (
  sender_username text,
  content         text,
  created_at      timestamptz
);

drop type if exists public.chat_push_profile cascade;
create type public.chat_push_profile as (
  id           uuid,
  fcm_tokens   text[]
);

drop type if exists public.chat_push_data cascade;
create type public.chat_push_data as (
  chat_name     text,
  messages      public.chat_push_message[],
  recipients    public.chat_push_recipient[],
  reply_target  public.chat_push_profile,
  sender_tokens public.chat_push_profile
);

-- ---------------------------------------------------------------------------
-- Consolidated RPC: returns everything the edge function needs in 1 query
-- ---------------------------------------------------------------------------

create or replace function public.get_chat_push_data(
  p_message_id    uuid,
  p_chat_type     text,
  p_chat_id       uuid,
  p_sender_id     uuid,
  p_sender_name   text,
  p_reply_to_id   uuid
)
returns public.chat_push_data
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chat_push_data;
begin
  if p_chat_type = 'session' then
    -- Session: chat name, recent messages, recipients (creator + accepted),
    -- and sender's own FCM tokens — all in one query.
    with sess as (
      select s.id, s.created_by, s.title, s.purpose, s.date_time
      from public.sessions s
      where s.id = p_chat_id
    ),
    recent as (
      select
        sm.sender_username,
        sm.content,
        sm.created_at
      from public.session_messages sm
      where sm.session_id = p_chat_id
      order by sm.created_at desc
      limit 50
    ),
    members as (
      select sess.created_by as profile_id from sess
      union
      select c.user_id from public.commitments c
      where c.session_id = p_chat_id and c.status = 'accepted'
    ),
    msgs as (
      select coalesce(
        (select array_agg(row(r.sender_username, r.content, r.created_at)::public.chat_push_message)
         from (select * from recent order by created_at asc) r),
        array[]::public.chat_push_message[]
      ) as arr
    ),
    rcps as (
      select coalesce(
        (select array_agg(row(m.profile_id, p.fcm_tokens, rc.last_read_at)::public.chat_push_recipient)
         from members m
         join public.profiles p on p.id = m.profile_id
         left join public.session_chat_read rc
           on rc.session_id = p_chat_id and rc.profile_id = m.profile_id
         where m.profile_id <> p_sender_id),
        array[]::public.chat_push_recipient[]
      ) as arr
    )
    select
      case
        when sess.title is not null and sess.title <> '' then sess.title
        else sess.purpose || ' session'
      end,
      msgs.arr,
      rcps.arr,
      (select row(p.id, p.fcm_tokens)::public.chat_push_profile
       from public.profiles p where p.id = sess.created_by),
      (select row(p.id, p.fcm_tokens)::public.chat_push_profile
       from public.profiles p where p.id = p_sender_id)
    into v_result.chat_name, v_result.messages, v_result.recipients,
         v_result.reply_target, v_result.sender_tokens
    from sess, msgs, rcps;

  else
    -- Community: chat name, recent messages, approved members, and sender tokens.
    with comm as (
      select c.id, c.name
      from public.communities c
      where c.id = p_chat_id
    ),
    recent as (
      select
        cm.sender_username,
        cm.content,
        cm.created_at
      from public.community_messages cm
      where cm.community_id = p_chat_id
      order by cm.created_at desc
      limit 50
    ),
    members as (
      select cm.profile_id
      from public.community_members cm
      where cm.community_id = p_chat_id and cm.approval_status = 'approved'
    ),
    msgs as (
      select coalesce(
        (select array_agg(row(r.sender_username, r.content, r.created_at)::public.chat_push_message)
         from (select * from recent order by created_at asc) r),
        array[]::public.chat_push_message[]
      ) as arr
    ),
    rcps as (
      select coalesce(
        (select array_agg(row(m.profile_id, p.fcm_tokens, rc.last_read_at)::public.chat_push_recipient)
         from members m
         join public.profiles p on p.id = m.profile_id
         left join public.community_chat_read rc
           on rc.community_id = p_chat_id and rc.profile_id = m.profile_id
         where m.profile_id <> p_sender_id),
        array[]::public.chat_push_recipient[]
      ) as arr
    )
    select
      comm.name,
      msgs.arr,
      rcps.arr,
      null::public.chat_push_profile,
      (select row(p.id, p.fcm_tokens)::public.chat_push_profile
       from public.profiles p where p.id = p_sender_id)
    into v_result.chat_name, v_result.messages, v_result.recipients,
         v_result.reply_target, v_result.sender_tokens
    from comm, msgs, rcps;
  end if;

  -- Resolve reply target if reply_to_id is set and sender isn't replying to self
  if p_reply_to_id is not null and v_result.reply_target is not null then
    if p_chat_type = 'session' then
      select row(sm.sender_id, rp.fcm_tokens)::public.chat_push_profile
      into v_result.reply_target
      from public.session_messages sm
      join public.profiles rp on rp.id = sm.sender_id
      where sm.id = p_reply_to_id
        and sm.sender_id <> p_sender_id;
    else
      select row(cm.sender_id, rp.fcm_tokens)::public.chat_push_profile
      into v_result.reply_target
      from public.community_messages cm
      join public.profiles rp on rp.id = cm.sender_id
      where cm.id = p_reply_to_id
        and cm.sender_id <> p_sender_id;
    end if;
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enrich trigger payload: pass sender data available on the INSERT row so
-- the edge function doesn't need to re-fetch the message.
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
      'message_id', new.id,
      'sender_id', new.sender_id,
      'sender_username', new.sender_username,
      'content', new.content,
      'reply_to_id', new.reply_to_id
    )
  );

  return new;
end;
$$;
