-- 135_usage_analytics_core.sql
-- Usage analytics, step 1 (docs/usage-analytics/PLAN.md §2-3): storage, kill switch, tracking helper,
-- 15-minute activity snapshot, rollups, retention. ADDITIVE ONLY: no existing object is changed.
-- No app change and no new API call: everything is measured from data the app already causes.
--
-- Days / hours are bucketed in the team's timezone (_usage_tz(), default Asia/Karachi).
-- Nothing here is readable by clients: RLS on, every privilege revoked. Staff read through the
-- admin_usage_* functions (migration 137).

-- ── Kill switch ──────────────────────────────────────────────────────────────
-- {"enabled": true}. Off = nothing is recorded; the app behaves identically.
insert into public.site_config (key, value)
values ('usage_tracking', '{"enabled": true}'::jsonb)
on conflict (key) do nothing;

create or replace function public._usage_tz()
returns text language sql immutable as $$ select 'Asia/Karachi'::text $$;

create or replace function public._usage_enabled()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  select value into v from public.site_config where key = 'usage_tracking';
  if v is null then return false; end if;
  return coalesce((v ->> 'enabled')::boolean, false);
exception when others then
  return false;
end;
$$;

-- ── Tables (no client access) ────────────────────────────────────────────────
-- 00000000-0000-0000-0000-000000000000 is the sentinel for "no user" (guest) / "no target".

-- One row per (user, day): when the person was around. Fed by auth.sessions + screen views.
create table if not exists public.usage_user_days (
  user_id uuid not null,
  day date not null,
  first_seen timestamptz not null,
  last_seen timestamptz not null,
  active_hours integer not null default 0,        -- bit h set = active in hour h (team timezone)
  platforms text[] not null default '{}',         -- android | ios | web | other
  primary key (user_id, day)
);
create index if not exists usage_user_days_day_idx on public.usage_user_days (day);

-- Screen visit counters, one row per (hour, user, screen, target, platform).
create table if not exists public.usage_views (
  bucket_hour timestamptz not null,
  user_id uuid not null,
  view text not null,
  target_id uuid not null,
  platform text not null,                          -- native | web | other
  hits integer not null default 1,
  primary key (bucket_hour, user_id, view, target_id, platform)
);
create index if not exists usage_views_view_idx on public.usage_views (view, bucket_hour);

-- Platform-wide numbers per day.
create table if not exists public.usage_daily (
  day date not null,
  metric text not null,
  value numeric not null default 0,
  primary key (day, metric)
);

-- Per-community activity per day.
create table if not exists public.usage_community_daily (
  day date not null,
  community_id uuid not null,
  views integer not null default 0,
  viewers integer not null default 0,
  messages integer not null default 0,
  chatters integer not null default 0,
  posts integer not null default 0,
  reactions integer not null default 0,            -- post likes + post comments + match comments
  matches integer not null default 0,
  pings integer not null default 0,
  joins integer not null default 0,
  primary key (day, community_id)
);
create index if not exists usage_community_daily_comm_idx on public.usage_community_daily (community_id, day);

-- Chat frequency per chat per hour (counts only, never content).
create table if not exists public.usage_chat_hourly (
  hour timestamptz not null,
  chat_type text not null check (chat_type in ('community', 'session')),
  chat_id uuid not null,
  messages integer not null default 0,
  senders integer not null default 0,
  replies integer not null default 0,
  primary key (hour, chat_type, chat_id)
);
create index if not exists usage_chat_hourly_chat_idx on public.usage_chat_hourly (chat_type, chat_id, hour);

alter table public.usage_user_days enable row level security;
alter table public.usage_views enable row level security;
alter table public.usage_daily enable row level security;
alter table public.usage_community_daily enable row level security;
alter table public.usage_chat_hourly enable row level security;
revoke all on public.usage_user_days, public.usage_views, public.usage_daily,
  public.usage_community_daily, public.usage_chat_hourly from public, anon, authenticated;

-- ── Tracking helper (called from inside existing read RPCs by migration 136) ─
-- Never raises: tracking must not be able to break a read.
create or replace function public._usage_track(p_view text, p_target uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
  v_info text;
  v_platform text := 'other';
begin
  if not public._usage_enabled() then return; end if;
  begin
    v_info := lower(coalesce(current_setting('request.headers', true)::json ->> 'x-client-info', ''));
  exception when others then
    v_info := '';
  end;
  if v_info like '%react-native%' then v_platform := 'native';
  elsif v_info like '%web%' or v_info like '%js%' then v_platform := 'web';
  end if;

  insert into public.usage_views (bucket_hour, user_id, view, target_id, platform, hits)
  values (date_trunc('hour', now()), coalesce(auth.uid(), v_zero), p_view, coalesce(p_target, v_zero), v_platform, 1)
  on conflict (bucket_hour, user_id, view, target_id, platform)
  do update set hits = public.usage_views.hits + 1;
exception when others then
  null;
end;
$$;

-- ── Activity snapshot: auth.sessions + recent views → usage_user_days ────────
create or replace function public._usage_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := public._usage_tz();
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  -- 1. Sessions the auth server touched in the last 2 hours (token refresh ≈ hourly while the app is open).
  begin
    execute format($q$
      insert into public.usage_user_days (user_id, day, first_seen, last_seen, active_hours, platforms)
      select s.user_id,
             (s.ts at time zone %1$L)::date,
             min(s.ts), max(s.ts),
             bit_or(1 << extract(hour from (s.ts at time zone %1$L))::int),
             array_agg(distinct s.platform)
      from (
        select user_id,
               coalesce(refreshed_at at time zone 'utc', updated_at, created_at) as ts,
               case
                 when lower(coalesce(user_agent, '')) like '%%mozilla%%' then 'web'
                 when lower(coalesce(user_agent, '')) like '%%okhttp%%'
                   or lower(coalesce(user_agent, '')) like '%%android%%' then 'android'
                 when lower(coalesce(user_agent, '')) like '%%cfnetwork%%'
                   or lower(coalesce(user_agent, '')) like '%%iphone%%' then 'ios'
                 else 'other'
               end as platform
        from auth.sessions
        where user_id is not null
          and coalesce(refreshed_at at time zone 'utc', updated_at, created_at) > now() - interval '2 hours'
      ) s
      group by 1, 2
      on conflict (user_id, day) do update set
        first_seen = least(public.usage_user_days.first_seen, excluded.first_seen),
        last_seen = greatest(public.usage_user_days.last_seen, excluded.last_seen),
        active_hours = public.usage_user_days.active_hours | excluded.active_hours,
        platforms = (select coalesce(array_agg(distinct p), '{}')
                     from unnest(public.usage_user_days.platforms || excluded.platforms) p)
    $q$, v_tz);
  exception when others then
    raise warning 'usage snapshot (auth.sessions) skipped: %', sqlerrm;
  end;

  -- 2. Screen views of the last 2 hours also prove the person was active in that hour.
  begin
    insert into public.usage_user_days (user_id, day, first_seen, last_seen, active_hours, platforms)
    select v.user_id,
           (v.bucket_hour at time zone v_tz)::date,
           min(v.bucket_hour), max(v.bucket_hour) + interval '59 minutes',
           bit_or(1 << extract(hour from (v.bucket_hour at time zone v_tz))::int),
           array_agg(distinct case v.platform when 'native' then 'android' when 'web' then 'web' else 'other' end)
    from public.usage_views v
    where v.user_id <> v_zero and v.bucket_hour > now() - interval '2 hours'
    group by 1, 2
    on conflict (user_id, day) do update set
      first_seen = least(public.usage_user_days.first_seen, excluded.first_seen),
      last_seen = greatest(public.usage_user_days.last_seen, excluded.last_seen),
      active_hours = public.usage_user_days.active_hours | excluded.active_hours,
      platforms = (select coalesce(array_agg(distinct p), '{}')
                   from unnest(public.usage_user_days.platforms || excluded.platforms) p);
  exception when others then
    raise warning 'usage snapshot (views) skipped: %', sqlerrm;
  end;
end;
$$;

-- ── Rollup of one day ────────────────────────────────────────────────────────
-- Idempotent: recomputes the whole day from the source tables. A missing source table counts as 0.
create or replace function public._usage_count(p_sql text, p_from timestamptz, p_to timestamptz)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare v numeric;
begin
  execute p_sql into v using p_from, p_to;
  return coalesce(v, 0);
exception when undefined_table or undefined_column then
  return 0;
end;
$$;

create or replace function public._usage_rollup_day(p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := public._usage_tz();
  v_from timestamptz := (p_day::timestamp at time zone v_tz);
  v_to timestamptz := ((p_day + 1)::timestamp at time zone v_tz);
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
  r record;
begin
  -- Platform-wide metrics.
  delete from public.usage_daily where day = p_day;
  insert into public.usage_daily (day, metric, value)
  select p_day, m.metric, public._usage_count(m.q, v_from, v_to)
  from (values
    ('new_users',            'select count(*) from public.profiles where created_at >= $1 and created_at < $2'),
    ('messages_community',   'select count(*) from public.community_messages where created_at >= $1 and created_at < $2'),
    ('messages_session',     'select count(*) from public.session_messages where created_at >= $1 and created_at < $2'),
    ('chatters',             'select count(distinct s) from (select sender_id s from public.community_messages where created_at >= $1 and created_at < $2 union select sender_id from public.session_messages where created_at >= $1 and created_at < $2) x'),
    ('posts',                'select count(*) from public.community_posts where created_at >= $1 and created_at < $2'),
    ('post_likes',           'select count(*) from public.community_post_likes where created_at >= $1 and created_at < $2'),
    ('post_comments',        'select count(*) from public.community_post_comments where created_at >= $1 and created_at < $2'),
    ('matches_recorded',     'select count(*) from public.community_matches where created_at >= $1 and created_at < $2'),
    ('sessions_created',     'select count(*) from public.sessions where created_at >= $1 and created_at < $2'),
    ('session_applications', 'select count(*) from public.commitments where created_at >= $1 and created_at < $2'),
    ('pings',                'select count(*) from public.pings where created_at >= $1 and created_at < $2'),
    ('community_joins',      'select count(*) from public.community_members where joined_at >= $1 and joined_at < $2'),
    ('communities_created',  'select count(*) from public.communities where created_at >= $1 and created_at < $2'),
    ('views_total',          'select coalesce(sum(hits), 0) from public.usage_views where bucket_hour >= $1 and bucket_hour < $2'),
    ('views_guest',          $g$select coalesce(sum(hits), 0) from public.usage_views where bucket_hour >= $1 and bucket_hour < $2 and user_id = '00000000-0000-0000-0000-000000000000'$g$)
  ) as m(metric, q);

  insert into public.usage_daily (day, metric, value)
  select p_day, 'dau', count(*) from public.usage_user_days where day = p_day
  on conflict (day, metric) do update set value = excluded.value;
  insert into public.usage_daily (day, metric, value)
  select p_day, 'dau_web', count(*) from public.usage_user_days where day = p_day and 'web' = any (platforms)
  on conflict (day, metric) do update set value = excluded.value;
  insert into public.usage_daily (day, metric, value)
  select p_day, 'dau_android', count(*) from public.usage_user_days where day = p_day and 'android' = any (platforms)
  on conflict (day, metric) do update set value = excluded.value;

  -- Per-community metrics: each query returns (community_id, n).
  delete from public.usage_community_daily where day = p_day;
  for r in
    select * from (values
      ('views',     'select target_id, sum(hits)::int from public.usage_views where bucket_hour >= $1 and bucket_hour < $2 and view in (''community'', ''community_feed'') and target_id <> ''00000000-0000-0000-0000-000000000000'' group by 1'),
      ('viewers',   'select target_id, count(distinct user_id)::int from public.usage_views where bucket_hour >= $1 and bucket_hour < $2 and view in (''community'', ''community_feed'') and target_id <> ''00000000-0000-0000-0000-000000000000'' and user_id <> ''00000000-0000-0000-0000-000000000000'' group by 1'),
      ('messages',  'select community_id, count(*)::int from public.community_messages where created_at >= $1 and created_at < $2 group by 1'),
      ('chatters',  'select community_id, count(distinct sender_id)::int from public.community_messages where created_at >= $1 and created_at < $2 group by 1'),
      ('posts',     'select community_id, count(*)::int from public.community_posts where created_at >= $1 and created_at < $2 group by 1'),
      ('reactions', 'select p.community_id, count(*)::int from (select post_id from public.community_post_likes where created_at >= $1 and created_at < $2 union all select post_id from public.community_post_comments where created_at >= $1 and created_at < $2) x join public.community_posts p on p.id = x.post_id group by 1'),
      ('matches',   'select community_id, count(*)::int from public.community_matches where created_at >= $1 and created_at < $2 group by 1'),
      ('pings',     'select community_id, count(*)::int from public.pings where created_at >= $1 and created_at < $2 group by 1'),
      ('joins',     'select community_id, count(*)::int from public.community_members where joined_at >= $1 and joined_at < $2 group by 1')
    ) as q(col, sql)
  loop
    begin
      execute format(
        'insert into public.usage_community_daily (day, community_id, %1$I) '
        'select $3, t.c, t.n from (%2$s) as t(c, n) '
        'on conflict (day, community_id) do update set %1$I = excluded.%1$I',
        r.col, r.sql)
      using v_from, v_to, p_day;
    exception when undefined_table or undefined_column then
      null;
    end;
  end loop;
end;
$$;

-- Chat frequency per hour for a window (rebuilt each time; counts only).
create or replace function public._usage_rollup_chat(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.usage_chat_hourly where hour >= date_trunc('hour', p_from) and hour < p_to;
  begin
    insert into public.usage_chat_hourly (hour, chat_type, chat_id, messages, senders, replies)
    select date_trunc('hour', created_at), 'community', community_id,
           count(*), count(distinct sender_id), count(reply_to_id)
    from public.community_messages
    where created_at >= date_trunc('hour', p_from) and created_at < p_to
    group by 1, 3
    on conflict (hour, chat_type, chat_id) do nothing;
  exception when undefined_table or undefined_column then null;
  end;
  begin
    insert into public.usage_chat_hourly (hour, chat_type, chat_id, messages, senders, replies)
    select date_trunc('hour', created_at), 'session', session_id,
           count(*), count(distinct sender_id), count(reply_to_id)
    from public.session_messages
    where created_at >= date_trunc('hour', p_from) and created_at < p_to
    group by 1, 3
    on conflict (hour, chat_type, chat_id) do nothing;
  exception when undefined_table or undefined_column then null;
  end;
end;
$$;

-- ── The single scheduled entry point (every 15 minutes) ──────────────────────
create or replace function public.usage_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := public._usage_tz();
  v_today date := (now() at time zone v_tz)::date;
  v_local timestamp := (now() at time zone v_tz);
begin
  if not public._usage_enabled() then return; end if;

  perform public._usage_snapshot();

  -- Once an hour: refresh today + yesterday (late rows, deletes) and the last 48 h of chat.
  if extract(minute from v_local) < 15 then
    perform public._usage_rollup_day(v_today - 1);
    perform public._usage_rollup_day(v_today);
    perform public._usage_rollup_chat(now() - interval '48 hours', now() + interval '1 hour');
  end if;

  -- Nightly (03:xx local): drop raw per-user rows past their retention.
  if extract(hour from v_local) = 3 and extract(minute from v_local) < 15 then
    delete from public.usage_views where bucket_hour < now() - interval '90 days';
    delete from public.usage_user_days where day < v_today - 90;
    delete from public.usage_chat_hourly where hour < now() - interval '180 days';
  end if;
exception when others then
  raise warning 'usage_tick failed: %', sqlerrm;
end;
$$;

revoke all on function public._usage_tz() from public, anon, authenticated;
revoke all on function public._usage_enabled() from public, anon, authenticated;
revoke all on function public._usage_track(text, uuid) from public, anon, authenticated;
revoke all on function public._usage_snapshot() from public, anon, authenticated;
revoke all on function public._usage_count(text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public._usage_rollup_day(date) from public, anon, authenticated;
revoke all on function public._usage_rollup_chat(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.usage_tick() from public, anon, authenticated;
grant execute on function public.usage_tick() to service_role;

-- ── Schedule (pg_cron is already enabled by earlier migrations) ──────────────
do $$
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron not available here: usage_tick() was not scheduled';
    return;
  end if;
  begin
    perform cron.unschedule('usage-tick');
  exception when others then
    null;
  end;
  perform cron.schedule('usage-tick', '*/15 * * * *', 'select public.usage_tick();');
end $$;
