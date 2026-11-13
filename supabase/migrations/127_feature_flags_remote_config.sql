-- 127_feature_flags_remote_config.sql
-- Roadmap B2 (feature flags), B3/B4/B5 (remote What's New, lists & limits, tips), B6 (soft update prompt).
-- ADDITIVE ONLY: new tables/functions. Installed builds never call them; new builds fall back to bundled
-- values when a call fails or a key is missing, so this can be applied before or after a release.
--
-- Clients have NO direct table access (RLS on, no policies): reads via get_feature_flags /
-- get_remote_config, writes via admin_* (super_admin only, audited).

-- ── Feature flags ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.feature_flags (
  key             text primary key,
  enabled         boolean not null default false,
  description     text,
  min_app_version text,
  rollout_percent int not null default 100,
  platforms       text[] not null default '{}',   -- empty = all
  updated_at      timestamptz not null default now(),
  constraint feature_flags_key_chk check (key ~ '^[a-z0-9_]{2,40}$'),
  constraint feature_flags_rollout_chk check (rollout_percent between 0 and 100)
);

-- ── Remote config (lists, limits, content) ──────────────────────────────────────────────────────────
create table if not exists public.remote_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;
alter table public.remote_config enable row level security;
revoke all on public.feature_flags from anon, authenticated;
revoke all on public.remote_config from anon, authenticated;

-- Flags this release knows about (all start OFF except announcements' read path, which is harmless).
insert into public.feature_flags (key, enabled, description) values
  ('announcements', true, 'Show announcement banners / pop-ups (A3)'),
  ('tournament_promos', true, 'Show tournament discount code card (A8)')
on conflict (key) do nothing;

-- Seed lists: today's sports (so a remote list is never "less" than the bundled one) + the "More" tier.
-- scoring_mode: games = best-of games/sets/maps, score = one final score.
insert into public.remote_config (key, value) values
('sports', '[
  {"key":"table_tennis","label":"Table Tennis","emoji":"🏓","kind":"racket","tier":"primary"},
  {"key":"badminton","label":"Badminton","emoji":"🏸","kind":"racket","tier":"primary"},
  {"key":"tennis","label":"Tennis","emoji":"🎾","kind":"racket","tier":"primary"},
  {"key":"squash","label":"Squash","emoji":"🟡","kind":"racket","tier":"primary"},
  {"key":"pickleball","label":"Pickleball","emoji":"🥒","kind":"racket","tier":"primary"},
  {"key":"football","label":"Football","emoji":"⚽","kind":"team","tier":"primary"},
  {"key":"cricket","label":"Cricket","emoji":"🏏","kind":"team","tier":"primary"},
  {"key":"volleyball","label":"Volleyball","emoji":"🏐","kind":"team","tier":"primary"},
  {"key":"handball","label":"Handball","emoji":"🤾","kind":"team","tier":"primary"},
  {"key":"basketball","label":"Basketball","emoji":"🏀","kind":"team","tier":"primary"},
  {"key":"futsal","label":"Futsal","emoji":"⚽","kind":"team","tier":"more","participant_type":"team","roster_min":5,"roster_max":10,"lineup_size":5,"scoring_mode":"score","allow_draws":true,"enabled_for":["tournaments"]},
  {"key":"chess","label":"Chess","emoji":"♟️","kind":"racket","tier":"more","participant_type":"individual","roster_min":1,"roster_max":1,"scoring_mode":"score","allow_draws":true,"enabled_for":["tournaments"]},
  {"key":"egaming","label":"Egaming","emoji":"🎮","kind":"racket","tier":"more","participant_type":"individual","roster_min":1,"roster_max":1,"scoring_mode":"games","allow_draws":false,"unit_label":"Game","enabled_for":["tournaments"]},
  {"key":"athletics","label":"Athletics (sprints & runs)","emoji":"🏃","kind":"racket","tier":"more","participant_type":"individual","roster_min":1,"roster_max":1,"scoring_mode":"score","allow_draws":false,"enabled_for":["tournaments"]}
]'::jsonb),
('expire_options', '[
  {"label":"30 min","value":30},{"label":"1 hr","value":60},{"label":"2 hr","value":120},
  {"label":"3 hr","value":180},{"label":"4 hr","value":240},{"label":"5 hr","value":300},{"label":"6 hr","value":360}
]'::jsonb),
('limits', '{"chat_max_length":1000,"session_max_days_ahead":7}'::jsonb)
on conflict (key) do nothing;

-- ── Read paths (clients) ────────────────────────────────────────────────────────────────────────────
-- Flags are evaluated server-side so the rollout bucket is stable per (user, flag).
create or replace function public.get_feature_flags(p_platform text, p_app_version text)
returns table (key text, enabled boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  return query
  select f.key,
         (f.enabled
          and (cardinality(f.platforms) = 0 or lower(coalesce(p_platform, '')) = any (f.platforms))
          and (f.min_app_version is null or public._app_version_cmp(p_app_version, f.min_app_version) >= 0)
          and ((hashtext(v_uid::text || f.key)::bigint & 2147483647) % 100) < f.rollout_percent)
  from public.feature_flags f;
end;
$$;

create or replace function public.get_remote_config()
returns table (key text, value jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  return query select rc.key, rc.value from public.remote_config rc;
end;
$$;

-- ── Admin: flags ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_feature_flags()
returns table (key text, enabled boolean, description text, min_app_version text,
               rollout_percent int, platforms text[], updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin']);
  return query
  select f.key, f.enabled, f.description, f.min_app_version, f.rollout_percent, f.platforms, f.updated_at
  from public.feature_flags f order by f.key;
end;
$$;

create or replace function public.admin_upsert_feature_flag(
  p_key text,
  p_enabled boolean,
  p_rollout_percent int default 100,
  p_min_app_version text default null,
  p_platforms text[] default '{}',
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_key text := lower(btrim(coalesce(p_key, '')));
  v_plat text[] := coalesce(p_platforms, '{}');
begin
  perform public.assert_platform_role(array['super_admin']);
  if v_key !~ '^[a-z0-9_]{2,40}$' then raise exception 'FIELD_INVALID:key'; end if;
  if p_enabled is null then raise exception 'FIELD_INVALID:enabled'; end if;
  if p_rollout_percent is null or p_rollout_percent < 0 or p_rollout_percent > 100 then
    raise exception 'FIELD_INVALID:rollout_percent';
  end if;
  if exists (select 1 from unnest(v_plat) u where u not in ('android', 'ios', 'web')) then
    raise exception 'FIELD_INVALID:platforms';
  end if;
  select to_jsonb(f) into v_old from public.feature_flags f where f.key = v_key;
  insert into public.feature_flags (key, enabled, description, min_app_version, rollout_percent, platforms, updated_at)
  values (v_key, p_enabled, nullif(btrim(p_description), ''), nullif(btrim(p_min_app_version), ''),
          p_rollout_percent, v_plat, now())
  on conflict (key) do update set
    enabled = excluded.enabled, description = excluded.description, min_app_version = excluded.min_app_version,
    rollout_percent = excluded.rollout_percent, platforms = excluded.platforms, updated_at = now();
  perform public.log_admin_action('SET_FEATURE_FLAG', 'feature_flags', md5('feature_flags:' || v_key)::uuid, v_old,
    jsonb_build_object('key', v_key, 'enabled', p_enabled, 'rollout_percent', p_rollout_percent), null);
end;
$$;

create or replace function public.admin_delete_feature_flag(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_old jsonb;
begin
  perform public.assert_platform_role(array['super_admin']);
  select to_jsonb(f) into v_old from public.feature_flags f where f.key = p_key;
  if v_old is null then raise exception 'NOT_FOUND'; end if;
  delete from public.feature_flags where key = p_key;
  perform public.log_admin_action('DELETE_FEATURE_FLAG', 'feature_flags', md5('feature_flags:' || p_key)::uuid, v_old, null, null);
end;
$$;

-- ── Admin: remote config ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_get_remote_config()
returns table (key text, value jsonb, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin']);
  return query select rc.key, rc.value, rc.updated_at from public.remote_config rc order by rc.key;
end;
$$;

-- Keys are an allowlist; each has a shape check so a typo in the admin panel cannot break installed apps.
create or replace function public.admin_set_remote_config(p_key text, p_value jsonb, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  e jsonb;
  v_seen text[] := '{}';
begin
  perform public.assert_platform_role(array['super_admin']);
  if p_key not in ('sports', 'expire_options', 'limits', 'whats_new', 'tips', 'session_purposes') then
    raise exception 'FIELD_INVALID:key';
  end if;
  if p_value is null then raise exception 'FIELD_INVALID:value'; end if;

  if p_key = 'sports' then
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 80 then raise exception 'FIELD_INVALID:sports'; end if;
    for e in select * from jsonb_array_elements(p_value) loop
      if jsonb_typeof(e) <> 'object'
         or coalesce(e->>'key', '') !~ '^[a-z0-9_]{2,30}$' or e->>'key' = 'other'
         or char_length(btrim(coalesce(e->>'label', ''))) not between 1 and 40
         or coalesce(e->>'kind', '') not in ('racket', 'team')
         or coalesce(e->>'tier', '') not in ('primary', 'more')
         or coalesce(e->>'scoring_mode', 'score') not in ('games', 'score')
         or coalesce(e->>'participant_type', 'individual') not in ('individual', 'team')
         or (e->>'key') = any (v_seen) then
        raise exception 'FIELD_INVALID:sports';
      end if;
      v_seen := v_seen || (e->>'key');
    end loop;
  elsif p_key in ('expire_options', 'whats_new', 'tips', 'session_purposes') then
    if p_key = 'tips' then
      if jsonb_typeof(p_value) <> 'object' then raise exception 'FIELD_INVALID:tips'; end if;
    elsif p_key = 'whats_new' then
      if jsonb_typeof(p_value) <> 'object' or coalesce(p_value->>'version', '') = ''
         or jsonb_typeof(coalesce(p_value->'items', 'null'::jsonb)) <> 'array' then
        raise exception 'FIELD_INVALID:whats_new';
      end if;
    else
      if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 40 then raise exception 'FIELD_INVALID:%', p_key; end if;
    end if;
  elsif p_key = 'limits' then
    if jsonb_typeof(p_value) <> 'object' then raise exception 'FIELD_INVALID:limits'; end if;
  end if;

  select value into v_old from public.remote_config where key = p_key;
  insert into public.remote_config (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.log_admin_action('SET_REMOTE_CONFIG', 'remote_config', md5('remote_config:' || p_key)::uuid,
    v_old, p_value, p_note);
end;
$$;

-- ── Admin: soft update prompt (B6) ──────────────────────────────────────────────────────────────────
-- site_config.recommended_app_version -> {"version": "x.y.z", "store_url": text, "message": text}.
-- site_config is already world-readable (047); the app reads it next to maintenance / min_app_version.
create or replace function public.admin_set_recommended_app_version(
  p_version text, p_store_url text, p_message text, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  perform public.assert_platform_role(array['super_admin']);
  if coalesce(p_version, '') !~ '^\d+\.\d+\.\d+$' then raise exception 'FIELD_INVALID:min_version'; end if;
  if coalesce(p_store_url, '') <> '' and p_store_url !~ '^https://' then raise exception 'FIELD_INVALID:store_url'; end if;
  if char_length(coalesce(p_message, '')) > 300 then raise exception 'FIELD_INVALID:message'; end if;
  select value into v_old from public.site_config where key = 'recommended_app_version';
  v_new := jsonb_build_object('version', p_version, 'store_url', coalesce(p_store_url, ''), 'message', coalesce(p_message, ''));
  insert into public.site_config (key, value, updated_at) values ('recommended_app_version', v_new, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.log_admin_action('SET_RECOMMENDED_APP_VERSION', 'site_config',
    md5('site_config:recommended_app_version')::uuid, v_old, v_new, p_note);
end;
$$;

-- admin_get_site_config now also returns the recommended-version row (extra row; existing admin pages pick rows by key).
create or replace function public.admin_get_site_config()
returns table (key text, value jsonb, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin']);
  return query
  select sc.key, sc.value, sc.updated_at
  from public.site_config sc
  where sc.key in ('maintenance', 'min_app_version', 'recommended_app_version')
  order by sc.key;
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'get_feature_flags(text, text)',
    'get_remote_config()',
    'admin_list_feature_flags()',
    'admin_upsert_feature_flag(text, boolean, int, text, text[], text)',
    'admin_delete_feature_flag(text)',
    'admin_get_remote_config()',
    'admin_set_remote_config(text, jsonb, text)',
    'admin_set_recommended_app_version(text, text, text, text)',
    'admin_get_site_config()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
