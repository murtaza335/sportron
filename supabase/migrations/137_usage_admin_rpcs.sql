-- 137_usage_admin_rpcs.sql
-- Usage analytics, step 3 (docs/usage-analytics/PLAN.md §6-7): the staff-only read functions behind the admin
-- panel's Usage section. super_admin only (assert_platform_role first line), revoked from public/anon, granted to
-- authenticated. They read the rollup tables from migration 135; each returns ONE jsonb document.
-- Counts and timestamps only: no message / post text is ever returned. ADDITIVE ONLY.
-- Days are in the team timezone (_usage_tz()). Ranges are capped at 366 days (FIELD_INVALID:range).

create or replace function public._usage_chat_name(p_type text, p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v text;
begin
  if p_type = 'community' then
    select name into v from public.communities where id = p_id;
  else
    select coalesce(nullif(title, ''), purpose) into v from public.sessions where id = p_id;
  end if;
  return coalesce(v, '(deleted)');
end;
$$;
revoke all on function public._usage_chat_name(text, uuid) from public, anon, authenticated;

-- ── Status / switch / backfill ───────────────────────────────────────────────
create or replace function public.admin_usage_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin']);
  return jsonb_build_object(
    'enabled', public._usage_enabled(),
    'timezone', public._usage_tz(),
    'last_view_hour', (select max(bucket_hour) from public.usage_views),
    'last_seen', (select max(last_seen) from public.usage_user_days),
    'first_day', (select min(day) from public.usage_daily),
    'rows', jsonb_build_object(
      'usage_views', (select count(*) from public.usage_views),
      'usage_user_days', (select count(*) from public.usage_user_days),
      'usage_daily', (select count(*) from public.usage_daily),
      'usage_community_daily', (select count(*) from public.usage_community_daily),
      'usage_chat_hourly', (select count(*) from public.usage_chat_hourly)));
end;
$$;

create or replace function public.admin_set_usage_tracking(p_enabled boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_old jsonb; v_new jsonb;
begin
  perform public.assert_platform_role(array['super_admin']);
  if p_enabled is null then raise exception 'FIELD_INVALID:enabled'; end if;
  select value into v_old from public.site_config where key = 'usage_tracking';
  v_new := jsonb_build_object('enabled', p_enabled);
  insert into public.site_config (key, value, updated_at) values ('usage_tracking', v_new, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.log_admin_action('SET_USAGE_TRACKING', 'site_config', md5('site_config:usage_tracking')::uuid,
    v_old, v_new, p_note);
end;
$$;

-- Rebuilds the daily + chat rollups from the source tables for history (views / active users cannot be
-- backfilled: they only exist from the day tracking started).
create or replace function public.admin_usage_backfill(p_from date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := public._usage_tz();
  v_today date := (now() at time zone v_tz)::date;
  d date;
  n int := 0;
begin
  perform public.assert_platform_role(array['super_admin']);
  if p_from is null or p_from > v_today or v_today - p_from > 400 then raise exception 'FIELD_INVALID:range'; end if;
  for d in select g::date from generate_series(p_from, v_today, interval '1 day') g loop
    perform public._usage_rollup_day(d);
    n := n + 1;
  end loop;
  perform public._usage_rollup_chat((p_from::timestamp at time zone v_tz), now() + interval '1 hour');
  perform public.log_admin_action('USAGE_BACKFILL', 'site_config', md5('site_config:usage_tracking')::uuid,
    null, jsonb_build_object('from', p_from, 'days', n), null);
  return n;
end;
$$;

-- ── Overview ─────────────────────────────────────────────────────────────────
create or replace function public.admin_usage_overview(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text := public._usage_tz();
  v_today date := (now() at time zone v_tz)::date;
  v_from date := coalesce(p_from, v_today - 29);
  v_to date := coalesce(p_to, v_today);
  v_ts timestamptz;
  v_te timestamptz;
begin
  perform public.assert_platform_role(array['super_admin']);
  if v_to < v_from or v_to - v_from > 365 then raise exception 'FIELD_INVALID:range'; end if;
  v_ts := v_from::timestamp at time zone v_tz;
  v_te := (v_to + 1)::timestamp at time zone v_tz;

  return jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'tracking_enabled', public._usage_enabled(),
    'tiles', jsonb_build_object(
      'dau', (select count(*) from public.usage_user_days where day = v_today),
      'wau', (select count(distinct user_id) from public.usage_user_days where day > v_today - 7),
      'mau', (select count(distinct user_id) from public.usage_user_days where day > v_today - 30),
      'online_now', (select count(*) from public.usage_user_days
                     where day = v_today and last_seen > now() - interval '15 minutes'),
      'new_users_7d', (select coalesce(sum(value), 0) from public.usage_daily
                       where metric = 'new_users' and day > v_today - 7),
      'total_users', (select count(*) from public.profiles)),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', g.d::date,
        'dau', coalesce(m.dau, 0), 'new_users', coalesce(m.new_users, 0),
        'messages', coalesce(m.msgs_c, 0) + coalesce(m.msgs_s, 0),
        'posts', coalesce(m.posts, 0), 'matches', coalesce(m.matches, 0),
        'views', coalesce(m.views, 0)) order by g.d), '[]'::jsonb)
      from generate_series(v_from, v_to, interval '1 day') g(d)
      left join (
        select day,
          max(value) filter (where metric = 'dau') dau,
          max(value) filter (where metric = 'new_users') new_users,
          max(value) filter (where metric = 'messages_community') msgs_c,
          max(value) filter (where metric = 'messages_session') msgs_s,
          max(value) filter (where metric = 'posts') posts,
          max(value) filter (where metric = 'matches_recorded') matches,
          max(value) filter (where metric = 'views_total') views
        from public.usage_daily where day between v_from and v_to group by day
      ) m on m.day = g.d::date),
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', h, 'users', n)), '[]'::jsonb)
      from (
        select extract(isodow from day)::int dow, h, sum((active_hours >> h) & 1)::int n
        from public.usage_user_days cross join generate_series(0, 23) h
        where day between v_from and v_to
        group by 1, 2 having sum((active_hours >> h) & 1) > 0
      ) x),
    'platforms', coalesce((
      select jsonb_object_agg(p, n) from (
        select p, count(distinct user_id) n
        from public.usage_user_days, unnest(platforms) p
        where day between v_from and v_to group by p) x), '{}'::jsonb),
    'top_communities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.community_id, 'name', coalesce(c.name, '(deleted)'), 'sport', c.sport,
        'score', t.score, 'views', t.views, 'messages', t.messages, 'posts', t.posts) order by t.score desc), '[]'::jsonb)
      from (
        select community_id, sum(views) views, sum(messages) messages, sum(posts) posts,
               sum(views + 2 * messages + 3 * posts + 3 * matches + reactions + pings + 2 * joins) score
        from public.usage_community_daily where day between v_from and v_to
        group by community_id order by score desc limit 5) t
      left join public.communities c on c.id = t.community_id where t.score > 0),
    'top_chats', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'type', t.chat_type, 'id', t.chat_id, 'name', public._usage_chat_name(t.chat_type, t.chat_id),
        'messages', t.messages, 'senders', t.senders) order by t.messages desc), '[]'::jsonb)
      from (
        select chat_type, chat_id, sum(messages)::int messages, max(senders) senders
        from public.usage_chat_hourly where hour >= v_ts and hour < v_te
        group by 1, 2 order by sum(messages) desc limit 5) t));
end;
$$;

-- ── Communities ──────────────────────────────────────────────────────────────
create or replace function public.admin_usage_communities(
  p_from date default null, p_to date default null, p_limit int default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text := public._usage_tz();
  v_today date := (now() at time zone v_tz)::date;
  v_from date := coalesce(p_from, v_today - 29);
  v_to date := coalesce(p_to, v_today);
  v_len int;
begin
  perform public.assert_platform_role(array['super_admin']);
  if v_to < v_from or v_to - v_from > 365 then raise exception 'FIELD_INVALID:range'; end if;
  v_len := v_to - v_from + 1;
  return (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.score desc, r.name), '[]'::jsonb) from (
      select c.id, c.name, c.sport, c.visibility, c.created_at,
        (select count(*) from public.community_members m where m.community_id = c.id and m.approval_status = 'approved')::int members,
        coalesce(a.views, 0)::int views, coalesce(a.viewer_days, 0)::int viewer_days,
        coalesce(a.messages, 0)::int messages, coalesce(a.chatter_days, 0)::int chatter_days,
        coalesce(a.posts, 0)::int posts, coalesce(a.reactions, 0)::int reactions,
        coalesce(a.matches, 0)::int matches, coalesce(a.pings, 0)::int pings, coalesce(a.joins, 0)::int joins,
        coalesce(a.score, 0)::int score, coalesce(pv.score, 0)::int prev_score,
        l.last_activity,
        (c.created_at < now() - interval '14 days' and (l.last_activity is null or l.last_activity < v_today - 14)) dead
      from public.communities c
      left join (
        select community_id, sum(views) views, sum(viewers) viewer_days, sum(messages) messages, sum(chatters) chatter_days,
               sum(posts) posts, sum(reactions) reactions, sum(matches) matches, sum(pings) pings, sum(joins) joins,
               sum(views + 2 * messages + 3 * posts + 3 * matches + reactions + pings + 2 * joins) score
        from public.usage_community_daily where day between v_from and v_to group by community_id) a on a.community_id = c.id
      left join (
        select community_id, sum(views + 2 * messages + 3 * posts + 3 * matches + reactions + pings + 2 * joins) score
        from public.usage_community_daily where day between v_from - v_len and v_from - 1 group by community_id) pv on pv.community_id = c.id
      left join (
        select community_id, max(day) last_activity from public.usage_community_daily
        where views + messages + posts + reactions + matches + pings + joins > 0 group by community_id) l on l.community_id = c.id
      order by coalesce(a.score, 0) desc, c.name limit greatest(1, least(coalesce(p_limit, 500), 1000))
    ) r);
end;
$$;

create or replace function public.admin_usage_community(p_id uuid, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text := public._usage_tz();
  v_today date := (now() at time zone v_tz)::date;
  v_from date := coalesce(p_from, v_today - 29);
  v_to date := coalesce(p_to, v_today);
  v_ts timestamptz;
  v_te timestamptz;
  v_info jsonb;
begin
  perform public.assert_platform_role(array['super_admin']);
  if v_to < v_from or v_to - v_from > 365 then raise exception 'FIELD_INVALID:range'; end if;
  v_ts := v_from::timestamp at time zone v_tz;
  v_te := (v_to + 1)::timestamp at time zone v_tz;

  select jsonb_build_object('id', c.id, 'name', c.name, 'sport', c.sport, 'visibility', c.visibility,
    'created_at', c.created_at,
    'members', (select count(*) from public.community_members m where m.community_id = c.id and m.approval_status = 'approved'))
  into v_info from public.communities c where c.id = p_id;
  if v_info is null then raise exception 'NOT_FOUND'; end if;

  return jsonb_build_object(
    'community', v_info,
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', g.d::date, 'views', coalesce(u.views, 0), 'viewers', coalesce(u.viewers, 0),
        'messages', coalesce(u.messages, 0), 'chatters', coalesce(u.chatters, 0), 'posts', coalesce(u.posts, 0),
        'reactions', coalesce(u.reactions, 0), 'matches', coalesce(u.matches, 0), 'pings', coalesce(u.pings, 0),
        'joins', coalesce(u.joins, 0)) order by g.d), '[]'::jsonb)
      from generate_series(v_from, v_to, interval '1 day') g(d)
      left join public.usage_community_daily u on u.community_id = p_id and u.day = g.d::date),
    'chat_hours', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'messages', coalesce(n, 0)) order by h), '[]'::jsonb)
      from generate_series(0, 23) h
      left join (
        select extract(hour from hour at time zone v_tz)::int hh, sum(messages)::int n
        from public.usage_chat_hourly
        where chat_type = 'community' and chat_id = p_id and hour >= v_ts and hour < v_te group by 1) x on x.hh = h),
    'top_chatters', (
      select coalesce(jsonb_agg(jsonb_build_object('username', username, 'messages', n) order by n desc), '[]'::jsonb)
      from (
        select pp.username, count(*) n
        from public.community_messages cm join public.public_profiles pp on pp.id = cm.sender_id
        where cm.community_id = p_id and cm.created_at >= v_ts and cm.created_at < v_te
        group by pp.username order by n desc limit 5) t));
end;
$$;

-- ── Chat ─────────────────────────────────────────────────────────────────────
create or replace function public.admin_usage_chat(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text := public._usage_tz();
  v_today date := (now() at time zone v_tz)::date;
  v_from date := coalesce(p_from, v_today - 29);
  v_to date := coalesce(p_to, v_today);
  v_ts timestamptz;
  v_te timestamptz;
begin
  perform public.assert_platform_role(array['super_admin']);
  if v_to < v_from or v_to - v_from > 365 then raise exception 'FIELD_INVALID:range'; end if;
  v_ts := v_from::timestamp at time zone v_tz;
  v_te := (v_to + 1)::timestamp at time zone v_tz;

  return jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'totals', (
      select jsonb_build_object(
        'messages', coalesce(sum(messages), 0), 'community', coalesce(sum(messages) filter (where chat_type = 'community'), 0),
        'session', coalesce(sum(messages) filter (where chat_type = 'session'), 0),
        'active_chats', count(distinct (chat_type, chat_id)), 'replies', coalesce(sum(replies), 0))
      from public.usage_chat_hourly where hour >= v_ts and hour < v_te),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', g.d::date, 'community', coalesce(m.mc, 0), 'session', coalesce(m.ms, 0), 'chatters', coalesce(m.ch, 0))
        order by g.d), '[]'::jsonb)
      from generate_series(v_from, v_to, interval '1 day') g(d)
      left join (
        select day, max(value) filter (where metric = 'messages_community') mc,
               max(value) filter (where metric = 'messages_session') ms,
               max(value) filter (where metric = 'chatters') ch
        from public.usage_daily where day between v_from and v_to group by day) m on m.day = g.d::date),
    'hours', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'messages', coalesce(n, 0)) order by h), '[]'::jsonb)
      from generate_series(0, 23) h
      left join (
        select extract(hour from hour at time zone v_tz)::int hh, sum(messages)::int n
        from public.usage_chat_hourly where hour >= v_ts and hour < v_te group by 1) x on x.hh = h),
    'busiest', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'type', t.chat_type, 'id', t.chat_id, 'name', public._usage_chat_name(t.chat_type, t.chat_id),
        'messages', t.messages, 'peak_senders', t.senders, 'replies', t.replies) order by t.messages desc), '[]'::jsonb)
      from (
        select chat_type, chat_id, sum(messages)::int messages, max(senders) senders, sum(replies)::int replies
        from public.usage_chat_hourly where hour >= v_ts and hour < v_te
        group by 1, 2 order by sum(messages) desc limit 15) t),
    'edited', (
      select (select count(*) from public.community_messages where edited_at >= v_ts and edited_at < v_te)
           + (select count(*) from public.session_messages where edited_at >= v_ts and edited_at < v_te)));
end;
$$;

-- ── Screens (page visits) ────────────────────────────────────────────────────
create or replace function public.admin_usage_screens(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text := public._usage_tz();
  v_today date := (now() at time zone v_tz)::date;
  v_from date := coalesce(p_from, v_today - 29);
  v_to date := coalesce(p_to, v_today);
  v_ts timestamptz;
  v_te timestamptz;
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  perform public.assert_platform_role(array['super_admin']);
  if v_to < v_from or v_to - v_from > 365 then raise exception 'FIELD_INVALID:range'; end if;
  v_ts := v_from::timestamp at time zone v_tz;
  v_te := (v_to + 1)::timestamp at time zone v_tz;

  return jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'retention_days', 90,
    'screens', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.hits desc), '[]'::jsonb) from (
        select view, sum(hits)::int hits,
               count(distinct user_id) filter (where user_id <> v_zero)::int viewers,
               coalesce(sum(hits) filter (where user_id = v_zero), 0)::int guest_hits,
               coalesce(sum(hits) filter (where platform = 'native'), 0)::int native_hits,
               coalesce(sum(hits) filter (where platform = 'web'), 0)::int web_hits
        from public.usage_views where bucket_hour >= v_ts and bucket_hour < v_te group by view) s),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'view', view, 'hits', hits) order by d, view), '[]'::jsonb)
      from (
        select (bucket_hour at time zone v_tz)::date d, view, sum(hits)::int hits
        from public.usage_views where bucket_hour >= v_ts and bucket_hour < v_te group by 1, 2) x));
end;
$$;

-- ── Users & retention ────────────────────────────────────────────────────────
create or replace function public.admin_usage_retention(
  p_weeks int default 8, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text := public._usage_tz();
  v_today date := (now() at time zone v_tz)::date;
  v_from date := coalesce(p_from, v_today - 29);
  v_to date := coalesce(p_to, v_today);
  v_weeks int := greatest(1, least(coalesce(p_weeks, 8), 13));
  v_cur_week date := date_trunc('week', v_today::timestamp)::date;
  v_ts timestamptz;
  v_te timestamptz;
begin
  perform public.assert_platform_role(array['super_admin']);
  if v_to < v_from or v_to - v_from > 365 then raise exception 'FIELD_INVALID:range'; end if;
  v_ts := v_from::timestamp at time zone v_tz;
  v_te := (v_to + 1)::timestamp at time zone v_tz;

  return jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'funnel', (
      select jsonb_build_object(
        'signed_up', count(*),
        'joined_community', count(*) filter (where exists (
          select 1 from public.community_members m where m.profile_id = p.id and m.approval_status = 'approved')),
        'did_action', count(*) filter (where
          exists (select 1 from public.community_messages x where x.sender_id = p.id)
          or exists (select 1 from public.community_posts x where x.author_id = p.id)
          or exists (select 1 from public.community_matches x where x.recorded_by = p.id)
          or exists (select 1 from public.sessions x where x.created_by = p.id)
          or exists (select 1 from public.commitments x where x.user_id = p.id)),
        'came_back', count(*) filter (where exists (
          select 1 from public.usage_user_days d where d.user_id = p.id and d.day > (p.created_at at time zone v_tz)::date)))
      from public.profiles p where p.created_at >= v_ts and p.created_at < v_te and p.deleted_at is null),
    'cohorts', (
      with cohorts as (
        select date_trunc('week', p.created_at at time zone v_tz)::date w, p.id
        from public.profiles p
        where p.created_at >= ((v_cur_week - 7 * (v_weeks - 1))::timestamp at time zone v_tz)
      ), act as (
        select c.w, ((date_trunc('week', d.day::timestamp)::date - c.w) / 7) k, count(distinct d.user_id) n
        from cohorts c join public.usage_user_days d on d.user_id = c.id and d.day >= c.w
        group by 1, 2
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'week', s.w, 'size', s.size,
        'active', (select coalesce(jsonb_agg(coalesce(a.n, 0) order by gs.kk), '[]'::jsonb)
                   from generate_series(0, (v_cur_week - s.w) / 7) as gs(kk)
                   left join act a on a.w = s.w and a.k = gs.kk)) order by s.w), '[]'::jsonb)
      from (select w, count(*) size from cohorts group by w) s),
    'push', jsonb_build_object(
      'users', (select count(*) from public.profiles where deleted_at is null),
      'with_token', (select count(*) from public.profiles where deleted_at is null and coalesce(array_length(fcm_tokens, 1), 0) > 0),
      'notifications', (select count(*) from public.in_app_notifications where created_at >= v_ts and created_at < v_te),
      'notifications_read', (select count(*) from public.in_app_notifications
                             where created_at >= v_ts and created_at < v_te and read)),
    'streaks', jsonb_build_object(
      'ge_1', (select count(*) from public.profiles where streak_count >= 1),
      'ge_3', (select count(*) from public.profiles where streak_count >= 3),
      'ge_7', (select count(*) from public.profiles where streak_count >= 7),
      'ge_30', (select count(*) from public.profiles where streak_count >= 30)),
    'per_user', (
      select jsonb_build_object(
        'median_active_days', coalesce(percentile_cont(0.5) within group (order by n), 0),
        'users', count(*))
      from (select user_id, count(*) n from public.usage_user_days where day between v_from and v_to group by 1) x));
end;
$$;

-- ── Sessions & tournaments ───────────────────────────────────────────────────
create or replace function public.admin_usage_sessions_tournaments(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text := public._usage_tz();
  v_today date := (now() at time zone v_tz)::date;
  v_from date := coalesce(p_from, v_today - 29);
  v_to date := coalesce(p_to, v_today);
  v_ts timestamptz;
  v_te timestamptz;
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  perform public.assert_platform_role(array['super_admin']);
  if v_to < v_from or v_to - v_from > 365 then raise exception 'FIELD_INVALID:range'; end if;
  v_ts := v_from::timestamp at time zone v_tz;
  v_te := (v_to + 1)::timestamp at time zone v_tz;

  return jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'sessions_series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', g.d::date, 'created', coalesce(m.cr, 0), 'applications', coalesce(m.ap, 0)) order by g.d), '[]'::jsonb)
      from generate_series(v_from, v_to, interval '1 day') g(d)
      left join (
        select day, max(value) filter (where metric = 'sessions_created') cr,
               max(value) filter (where metric = 'session_applications') ap
        from public.usage_daily where day between v_from and v_to group by day) m on m.day = g.d::date),
    'sessions_by_sport', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'purpose', purpose, 'created', created, 'filled', filled) order by created desc), '[]'::jsonb)
      from (
        select purpose, count(*)::int created, count(*) filter (where status in ('full', 'completed'))::int filled
        from public.sessions where created_at >= v_ts and created_at < v_te group by purpose) x),
    'feedback', (
      select jsonb_build_object(
        'showed_up', count(*) filter (where feedback_status = 'showed_up'),
        'no_show', count(*) filter (where feedback_status = 'no_show'))
      from public.commitments where updated_at >= v_ts and updated_at < v_te),
    'tournament_series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', g.d::date, 'views', coalesce(m.hits, 0), 'live', coalesce(m.live, 0)) order by g.d), '[]'::jsonb)
      from generate_series(v_from, v_to, interval '1 day') g(d)
      left join (
        select (bucket_hour at time zone v_tz)::date d,
               sum(hits) filter (where view in ('tournaments_list', 'tournament', 'module', 'tournament_today')) hits,
               sum(hits) filter (where view in ('live', 'live_match')) live
        from public.usage_views where bucket_hour >= v_ts and bucket_hour < v_te group by 1) m on m.d = g.d::date),
    'top_tournaments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.target_id, 'name', coalesce(tn.name, '(deleted)'), 'views', t.views, 'viewers', t.viewers,
        'live_views', t.live_views) order by t.views desc), '[]'::jsonb)
      from (
        select target_id, sum(hits)::int views, count(distinct user_id) filter (where user_id <> v_zero)::int viewers,
               coalesce(sum(hits) filter (where view = 'live'), 0)::int live_views
        from public.usage_views
        where bucket_hour >= v_ts and bucket_hour < v_te and view in ('tournament', 'live', 'tournament_today')
          and target_id <> v_zero
        group by target_id order by sum(hits) desc limit 10) t
      left join public.tournaments tn on tn.id = t.target_id));
end;
$$;

revoke all on function public.admin_usage_status() from public, anon;
revoke all on function public.admin_set_usage_tracking(boolean, text) from public, anon;
revoke all on function public.admin_usage_backfill(date) from public, anon;
revoke all on function public.admin_usage_overview(date, date) from public, anon;
revoke all on function public.admin_usage_communities(date, date, int) from public, anon;
revoke all on function public.admin_usage_community(uuid, date, date) from public, anon;
revoke all on function public.admin_usage_chat(date, date) from public, anon;
revoke all on function public.admin_usage_screens(date, date) from public, anon;
revoke all on function public.admin_usage_retention(int, date, date) from public, anon;
revoke all on function public.admin_usage_sessions_tournaments(date, date) from public, anon;
grant execute on function public.admin_usage_status() to authenticated;
grant execute on function public.admin_set_usage_tracking(boolean, text) to authenticated;
grant execute on function public.admin_usage_backfill(date) to authenticated;
grant execute on function public.admin_usage_overview(date, date) to authenticated;
grant execute on function public.admin_usage_communities(date, date, int) to authenticated;
grant execute on function public.admin_usage_community(uuid, date, date) to authenticated;
grant execute on function public.admin_usage_chat(date, date) to authenticated;
grant execute on function public.admin_usage_screens(date, date) to authenticated;
grant execute on function public.admin_usage_retention(int, date, date) to authenticated;
grant execute on function public.admin_usage_sessions_tournaments(date, date) to authenticated;
