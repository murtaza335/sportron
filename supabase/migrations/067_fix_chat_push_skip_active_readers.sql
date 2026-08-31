-- Fix get_chat_push_data RPC: skip active readers via chat_presence
--
-- The previous version only used chat_read cursors for unread filtering.
-- Active readers (heartbeat within 60s) should not receive push notifications.

CREATE OR REPLACE FUNCTION public.get_chat_push_data(
  p_message_id    uuid,
  p_chat_type     text,
  p_chat_id       uuid,
  p_sender_id     uuid,
  p_sender_name   text,
  p_reply_to_id   uuid
)
RETURNS public.chat_push_data
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chat_push_data;
begin
  if p_chat_type = 'session' then
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
         where m.profile_id <> p_sender_id
           -- Skip active readers (presence heartbeat within 60s)
           and not exists (
             select 1 from public.chat_presence cp
             where cp.chat_type = 'session'
               and cp.chat_id = p_chat_id
               and cp.profile_id = m.profile_id
               and cp.last_seen_at > now() - interval '60 seconds'
           )),
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
         where m.profile_id <> p_sender_id
           -- Skip active readers (presence heartbeat within 60s)
           and not exists (
             select 1 from public.chat_presence cp
             where cp.chat_type = 'community'
               and cp.chat_id = p_chat_id
               and cp.profile_id = m.profile_id
               and cp.last_seen_at > now() - interval '60 seconds'
           )),
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