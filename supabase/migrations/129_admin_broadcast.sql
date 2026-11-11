-- 129_admin_broadcast.sql
-- Roadmap B7: staff broadcast push from the admin panel to a segment (all / sport / community).
-- Delivery reuses the existing path: one in_app_notifications row per recipient -> trg_fcm_push ->
-- send-notification edge function. NO edge function change is needed.
-- ADDITIVE ONLY apart from widening the type check constraint with 'admin_broadcast'.
-- Old app builds: the unknown type lands in Past Activity and the tap handler ignores it (the push
-- itself still shows, since FCM carries title + body).
-- Safety: super_admin only, recipient cap (pg_net fires one request per row), preview-count RPC.

-- 1. Widen the type check constraint (088 list + admin_broadcast)
ALTER TABLE public.in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;

ALTER TABLE public.in_app_notifications
  ADD CONSTRAINT in_app_notifications_type_check
  CHECK (type IN (
    'match_pending', 'match_approved', 'match_rejected', 'match_liked', 'match_commented',
    'session_application', 'session_accepted', 'session_rejected', 'session_left',
    'session_reminder', 'feedback_prompt', 'ping', 'join_request', 'join_approved',
    'join_rejected', 'match_approval_request', 'match_approved_community', 'match_disputed',
    'member_removed', 'admin_transferred', 'admin_promoted', 'community_match_pending',
    'community_match_approved', 'community_match_disputed', 'community_invite',
    'community_invite_accepted', 'community_invite_rejected', 'session_chat_message',
    'session_chat_reply', 'community_chat_message', 'community_chat_reply',
    'streak_reminder', 'streak_at_risk', 'streak_milestone', 'community_post_created',
    'community_post_liked', 'community_post_commented', 'member_joined',
    'community_engagement', 'new_community', 'tournament_admin_assigned',
    'tournament_module_admin_assigned', 'tournament_entry_added', 'tournament_match_scheduled',
    'tournament_match_result', 'tournament_module_completed',
    'admin_broadcast'
  ));

-- 2. History of sent broadcasts (staff-only, no client policies)
create table if not exists public.admin_broadcasts (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  body            text not null,
  cta_url         text,
  audience        text not null,
  sport           text,
  community_id    uuid references public.communities(id) on delete set null,
  recipient_count int not null default 0,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.admin_broadcasts enable row level security;
revoke all on public.admin_broadcasts from anon, authenticated;

-- 3. Audience resolution (internal, shared by preview + send)
create or replace function public._broadcast_audience(p_audience text, p_sport text, p_community uuid)
returns table (profile_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_audience = 'all' then
    return query select p.id from public.profiles p where p.deleted_at is null;
  elsif p_audience = 'sport' then
    if p_sport is null or btrim(p_sport) = '' then raise exception 'FIELD_INVALID:sport'; end if;
    return query
      select p.id from public.profiles p
       where p.deleted_at is null and p_sport = any (p.sport_interests);
  elsif p_audience = 'community' then
    if p_community is null or not exists (select 1 from public.communities where id = p_community) then
      raise exception 'FIELD_INVALID:community';
    end if;
    return query
      select p.id from public.profiles p
        join public.community_members cm on cm.profile_id = p.id
       where p.deleted_at is null and cm.community_id = p_community and cm.approval_status = 'approved';
  else
    raise exception 'FIELD_INVALID:audience';
  end if;
end;
$$;

revoke all on function public._broadcast_audience(text, text, uuid) from public, anon, authenticated;
grant execute on function public._broadcast_audience(text, text, uuid) to service_role;

-- 4. Preview: how many people would receive it
create or replace function public.admin_count_broadcast_audience(
  p_audience text, p_sport text default null, p_community uuid default null
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin']);
  return (select count(*)::int from public._broadcast_audience(p_audience, p_sport, p_community));
end;
$$;

-- 5. Send
create or replace function public.admin_send_broadcast(
  p_title text,
  p_body text,
  p_audience text,
  p_sport text default null,
  p_community uuid default null,
  p_cta_url text default null,
  p_note text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max constant int := 5000;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_cta text := nullif(btrim(coalesce(p_cta_url, '')), '');
  v_count int;
  v_id uuid;
begin
  perform public.assert_platform_role(array['super_admin']);
  if char_length(v_title) < 1 or char_length(v_title) > 60 then raise exception 'FIELD_INVALID:title'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 240 then raise exception 'FIELD_INVALID:body'; end if;
  if v_cta is not null and (char_length(v_cta) > 300
      or not (v_cta ~ '^/[^/]' or v_cta ~* '^https://')) then
    raise exception 'FIELD_INVALID:cta_url';
  end if;

  select count(*)::int into v_count from public._broadcast_audience(p_audience, p_sport, p_community);
  if v_count = 0 then raise exception 'AUDIENCE_EMPTY'; end if;
  if v_count > c_max then raise exception 'AUDIENCE_TOO_LARGE'; end if;

  insert into public.admin_broadcasts (title, body, cta_url, audience, sport, community_id, recipient_count, created_by)
  values (v_title, v_body, v_cta, p_audience,
          case when p_audience = 'sport' then p_sport end,
          case when p_audience = 'community' then p_community end,
          v_count, auth.uid())
  returning id into v_id;

  insert into public.in_app_notifications (user_id, type, title, body, data)
  select a.profile_id, 'admin_broadcast', v_title, v_body,
         jsonb_strip_nulls(jsonb_build_object('broadcastId', v_id, 'cta_url', v_cta))
    from public._broadcast_audience(p_audience, p_sport, p_community) a;

  perform public.log_admin_action(
    'SEND_BROADCAST', 'admin_broadcasts', v_id, null,
    jsonb_build_object('audience', p_audience, 'sport', p_sport, 'community_id', p_community,
                       'recipients', v_count, 'title', v_title),
    p_note
  );
  return v_count;
end;
$$;

-- 6. History
create or replace function public.admin_list_broadcasts(p_limit int default 25)
returns table (
  id uuid, title text, body text, cta_url text, audience text, sport text,
  community_id uuid, recipient_count int, created_by_username text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin']);
  return query
    select b.id, b.title, b.body, b.cta_url, b.audience, b.sport, b.community_id, b.recipient_count,
           p.username, b.created_at
      from public.admin_broadcasts b
      left join public.profiles p on p.id = b.created_by
     order by b.created_at desc
     limit least(greatest(coalesce(p_limit, 25), 1), 100);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_count_broadcast_audience(text, text, uuid)',
    'admin_send_broadcast(text, text, text, text, uuid, text, text)',
    'admin_list_broadcasts(int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
