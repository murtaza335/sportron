-- 125_announcements.sql
-- Roadmap A3: remote-controlled announcement / promo banners.
-- ADDITIVE ONLY: new tables + functions. No existing object is touched, so installed builds are unaffected
-- (they never call these RPCs; new builds fall back to "no announcements" if the RPC is missing).
--
-- Clients have NO direct table access (RLS on, no policies). Reads go through get_active_announcements,
-- analytics through record_announcement_event, staff writes through admin_* RPCs (super_admin only).

create table if not exists public.announcements (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  body            text,
  image_url       text,
  cta_label       text,
  cta_url         text,                       -- in-app route (/tournament/..) or external https URL
  placement       text not null default 'home_banner',
  platforms       text[] not null default '{}',          -- empty = all
  min_app_version text,
  max_app_version text,
  sport_interests text[] not null default '{}',          -- empty = everyone
  audience        text not null default 'all',           -- all | new_users
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz,
  priority        int not null default 0,
  dismissible     boolean not null default true,
  max_shows       int,                                   -- per device, null = unlimited
  is_active       boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint announcements_placement_chk
    check (placement in ('app_open_modal', 'home_banner', 'tournaments_banner', 'sessions_banner')),
  constraint announcements_audience_chk check (audience in ('all', 'new_users'))
);

create index if not exists idx_announcements_active
  on public.announcements (is_active, starts_at, ends_at);

create table if not exists public.announcement_events (
  id              bigint generated always as identity primary key,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  event           text not null check (event in ('view', 'click', 'dismiss')),
  created_at      timestamptz not null default now()
);

create index if not exists idx_announcement_events_ann
  on public.announcement_events (announcement_id, event);

alter table public.announcements enable row level security;
alter table public.announcement_events enable row level security;
revoke all on public.announcements from anon, authenticated;
revoke all on public.announcement_events from anon, authenticated;

-- ── Internal: compare dotted versions. Returns -1 / 0 / 1 (missing segments = 0). ──────────────────
create or replace function public._app_version_cmp(a text, b text)
returns int
language plpgsql
immutable
set search_path = public
as $$
declare
  pa text[] := string_to_array(coalesce(nullif(btrim(a), ''), '0'), '.');
  pb text[] := string_to_array(coalesce(nullif(btrim(b), ''), '0'), '.');
  n int := greatest(coalesce(array_length(pa, 1), 0), coalesce(array_length(pb, 1), 0));
  x int;
  y int;
begin
  for i in 1..n loop
    x := coalesce(nullif(regexp_replace(coalesce(pa[i], '0'), '\D', '', 'g'), '')::int, 0);
    y := coalesce(nullif(regexp_replace(coalesce(pb[i], '0'), '\D', '', 'g'), '')::int, 0);
    if x < y then return -1; end if;
    if x > y then return 1; end if;
  end loop;
  return 0;
end;
$$;

-- ── Read path (clients) ────────────────────────────────────────────────────────────────────────────
create or replace function public.get_active_announcements(p_platform text, p_app_version text)
returns table (
  id uuid,
  title text,
  body text,
  image_url text,
  cta_label text,
  cta_url text,
  placement text,
  priority int,
  dismissible boolean,
  max_shows int,
  ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_interests text[];
  v_created timestamptz;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select coalesce(p.sport_interests, '{}'), p.created_at
    into v_interests, v_created
  from public.profiles p
  where p.id = v_uid;

  return query
  select a.id, a.title, a.body, a.image_url, a.cta_label, a.cta_url, a.placement,
         a.priority, a.dismissible, a.max_shows, a.ends_at
  from public.announcements a
  where a.is_active
    and a.starts_at <= now()
    and (a.ends_at is null or a.ends_at > now())
    and (cardinality(a.platforms) = 0 or lower(coalesce(p_platform, '')) = any (a.platforms))
    and (a.min_app_version is null or public._app_version_cmp(p_app_version, a.min_app_version) >= 0)
    and (a.max_app_version is null or public._app_version_cmp(p_app_version, a.max_app_version) <= 0)
    and (cardinality(a.sport_interests) = 0 or v_interests && a.sport_interests)
    and (a.audience = 'all' or (a.audience = 'new_users' and v_created > now() - interval '7 days'))
  order by a.priority desc, a.created_at desc;
end;
$$;

create or replace function public.record_announcement_event(p_announcement_id uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_event not in ('view', 'click', 'dismiss') then
    raise exception 'FIELD_INVALID:event';
  end if;
  if not exists (select 1 from public.announcements where id = p_announcement_id) then
    return;
  end if;
  insert into public.announcement_events (announcement_id, profile_id, event)
  values (p_announcement_id, auth.uid(), p_event);
end;
$$;

-- ── Admin (staff) ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_announcements()
returns table (
  id uuid, title text, body text, image_url text, cta_label text, cta_url text, placement text,
  platforms text[], min_app_version text, max_app_version text, sport_interests text[], audience text,
  starts_at timestamptz, ends_at timestamptz, priority int, dismissible boolean, max_shows int,
  is_active boolean, created_at timestamptz, views bigint, clicks bigint, dismissals bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin']);
  return query
  select a.id, a.title, a.body, a.image_url, a.cta_label, a.cta_url, a.placement,
         a.platforms, a.min_app_version, a.max_app_version, a.sport_interests, a.audience,
         a.starts_at, a.ends_at, a.priority, a.dismissible, a.max_shows,
         a.is_active, a.created_at,
         count(e.id) filter (where e.event = 'view'),
         count(e.id) filter (where e.event = 'click'),
         count(e.id) filter (where e.event = 'dismiss')
  from public.announcements a
  left join public.announcement_events e on e.announcement_id = a.id
  group by a.id
  order by a.created_at desc;
end;
$$;

-- Internal: validate + write one announcement from a jsonb payload. p_id null = create.
create or replace function public._admin_write_announcement(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.announcements;
  v_old jsonb;
  v_arr text[];
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'FIELD_INVALID:data';
  end if;

  if p_id is null then
    v.id := gen_random_uuid();
    v.created_by := auth.uid();
    v.created_at := now();
    v.starts_at := now();
    v.is_active := true;
    v.priority := 0;
    v.dismissible := true;
    v.placement := 'home_banner';
    v.audience := 'all';
    v.platforms := '{}';
    v.sport_interests := '{}';
  else
    select * into v from public.announcements where id = p_id;
    if not found then raise exception 'NOT_FOUND'; end if;
    v_old := to_jsonb(v);
  end if;

  if p_data ? 'title' then
    v.title := btrim(coalesce(p_data->>'title', ''));
  end if;
  if v.title is null or char_length(v.title) < 1 or char_length(v.title) > 80 then
    raise exception 'FIELD_INVALID:title';
  end if;
  if p_data ? 'body' then
    v.body := nullif(btrim(coalesce(p_data->>'body', '')), '');
    if char_length(v.body) > 400 then raise exception 'FIELD_INVALID:body'; end if;
  end if;
  if p_data ? 'image_url' then
    v.image_url := nullif(btrim(coalesce(p_data->>'image_url', '')), '');
    if v.image_url is not null and v.image_url !~ '^https://res\.cloudinary\.com/' then
      raise exception 'FIELD_INVALID:image_url';
    end if;
  end if;
  if p_data ? 'cta_label' then
    v.cta_label := nullif(btrim(coalesce(p_data->>'cta_label', '')), '');
    if char_length(v.cta_label) > 30 then raise exception 'FIELD_INVALID:cta_label'; end if;
  end if;
  if p_data ? 'cta_url' then
    v.cta_url := nullif(btrim(coalesce(p_data->>'cta_url', '')), '');
    if v.cta_url is not null and (char_length(v.cta_url) > 500 or v.cta_url !~ '^(/|https://)') then
      raise exception 'FIELD_INVALID:cta_url';
    end if;
  end if;
  if p_data ? 'placement' then
    v.placement := p_data->>'placement';
    if v.placement not in ('app_open_modal', 'home_banner', 'tournaments_banner', 'sessions_banner') then
      raise exception 'FIELD_INVALID:placement';
    end if;
  end if;
  if p_data ? 'audience' then
    v.audience := p_data->>'audience';
    if v.audience not in ('all', 'new_users') then raise exception 'FIELD_INVALID:audience'; end if;
  end if;
  if p_data ? 'platforms' then
    select coalesce(array_agg(lower(x)), '{}') into v_arr from jsonb_array_elements_text(p_data->'platforms') x;
    if exists (select 1 from unnest(v_arr) u where u not in ('android', 'ios', 'web')) then
      raise exception 'FIELD_INVALID:platforms';
    end if;
    v.platforms := v_arr;
  end if;
  if p_data ? 'sport_interests' then
    select coalesce(array_agg(x), '{}') into v_arr from jsonb_array_elements_text(p_data->'sport_interests') x;
    v.sport_interests := v_arr;
  end if;
  if p_data ? 'min_app_version' then v.min_app_version := nullif(btrim(coalesce(p_data->>'min_app_version', '')), ''); end if;
  if p_data ? 'max_app_version' then v.max_app_version := nullif(btrim(coalesce(p_data->>'max_app_version', '')), ''); end if;
  if p_data ? 'starts_at' then v.starts_at := coalesce((p_data->>'starts_at')::timestamptz, now()); end if;
  if p_data ? 'ends_at' then v.ends_at := (p_data->>'ends_at')::timestamptz; end if;
  if v.ends_at is not null and v.ends_at <= v.starts_at then raise exception 'FIELD_INVALID:ends_at'; end if;
  if p_data ? 'priority' then v.priority := coalesce((p_data->>'priority')::int, 0); end if;
  if p_data ? 'dismissible' then v.dismissible := coalesce((p_data->>'dismissible')::boolean, true); end if;
  if p_data ? 'max_shows' then
    v.max_shows := (p_data->>'max_shows')::int;
    if v.max_shows is not null and v.max_shows < 1 then raise exception 'FIELD_INVALID:max_shows'; end if;
  end if;
  if p_data ? 'is_active' then v.is_active := coalesce((p_data->>'is_active')::boolean, true); end if;

  if p_id is null then
    insert into public.announcements select v.*;
    perform public.log_admin_action('CREATE_ANNOUNCEMENT', 'announcements', v.id, null, to_jsonb(v), null);
  else
    update public.announcements set
      title = v.title, body = v.body, image_url = v.image_url, cta_label = v.cta_label, cta_url = v.cta_url,
      placement = v.placement, platforms = v.platforms, min_app_version = v.min_app_version,
      max_app_version = v.max_app_version, sport_interests = v.sport_interests, audience = v.audience,
      starts_at = v.starts_at, ends_at = v.ends_at, priority = v.priority, dismissible = v.dismissible,
      max_shows = v.max_shows, is_active = v.is_active
    where id = p_id;
    perform public.log_admin_action('UPDATE_ANNOUNCEMENT', 'announcements', p_id, v_old, to_jsonb(v), null);
  end if;
  return v.id;
end;
$$;

create or replace function public.admin_create_announcement(p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin']);
  return public._admin_write_announcement(null, p_data);
end;
$$;

create or replace function public.admin_update_announcement(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin']);
  return public._admin_write_announcement(p_id, p_data);
end;
$$;

create or replace function public.admin_end_announcement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
begin
  perform public.assert_platform_role(array['super_admin']);
  select to_jsonb(a) into v_old from public.announcements a where a.id = p_id;
  if v_old is null then raise exception 'NOT_FOUND'; end if;
  update public.announcements set is_active = false, ends_at = least(coalesce(ends_at, now()), now())
  where id = p_id;
  perform public.log_admin_action('END_ANNOUNCEMENT', 'announcements', p_id, v_old, null, null);
end;
$$;

-- ── Privileges ────────────────────────────────────────────────────────────────────────────────────
revoke all on function public._app_version_cmp(text, text) from public, anon;
revoke all on function public._admin_write_announcement(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._app_version_cmp(text, text) to authenticated, service_role;
grant execute on function public._admin_write_announcement(uuid, jsonb) to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'get_active_announcements(text, text)',
    'record_announcement_event(uuid, text)',
    'admin_list_announcements()',
    'admin_create_announcement(jsonb)',
    'admin_update_announcement(uuid, jsonb)',
    'admin_end_announcement(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
