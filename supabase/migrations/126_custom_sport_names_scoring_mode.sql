-- 126_custom_sport_names_scoring_mode.sql
-- Roadmap A4: "Other" sports need an exact name (tournament modules + communities), "More" sports are stored
-- as sport='other' + custom_sport_name + sport_key, and a module's scoring is described by `scoring_mode`.
--
-- BACKWARD COMPATIBILITY (AGENTS.md):
--  * All new columns are nullable. Old builds keep working: they never send the new params, still see
--    sport='other', and ignore the extra keys/columns.
--  * "Name required for Other" cannot be a hard rule while old builds (which cannot send a name) are installed.
--    It is enforced by the NEW client always, and server-side only once
--    site_config 'require_custom_sport_name' = {"enabled": true} (flip it after raising min_app_version).
--    Until then the DB only validates length/trim of a name that is provided.
--  * Existing Other modules/communities stay valid with a null name (validated on change only, never a CHECK).
--  * Changed read RPCs keep every old column/key and only append new ones.
--  * create_tournament_module / update_tournament_module get two trailing DEFAULTed params (old 10-arg named
--    calls still resolve); the old signatures are dropped in this same transaction.

-- ── Columns ─────────────────────────────────────────────────────────────────────────────────────────
alter table public.tournament_modules add column if not exists custom_sport_name text;
alter table public.tournament_modules add column if not exists sport_key text;
alter table public.tournament_modules add column if not exists scoring_mode text;
alter table public.communities add column if not exists custom_sport_name text;

-- ── Server-side "name required" switch (see header) ────────────────────────────────────────────────
create or replace function public._custom_sport_required()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value->>'enabled')::boolean from public.site_config
                   where key = 'require_custom_sport_name'), false);
$$;
revoke all on function public._custom_sport_required() from public, anon;
grant execute on function public._custom_sport_required() to authenticated, service_role;

create or replace function public.admin_set_require_custom_sport_name(p_enabled boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_old jsonb; v_new jsonb;
begin
  perform public.assert_platform_role(array['super_admin']);
  if p_enabled is null then raise exception 'FIELD_INVALID:enabled'; end if;
  select value into v_old from public.site_config where key = 'require_custom_sport_name';
  v_new := jsonb_build_object('enabled', p_enabled);
  insert into public.site_config (key, value, updated_at) values ('require_custom_sport_name', v_new, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.log_admin_action('SET_REQUIRE_CUSTOM_SPORT_NAME', 'site_config',
    md5('site_config:require_custom_sport_name')::uuid, v_old, v_new, p_note);
end;
$$;
revoke all on function public.admin_set_require_custom_sport_name(boolean, text) from public, anon;
grant execute on function public.admin_set_require_custom_sport_name(boolean, text) to authenticated;

-- ── Validation triggers (ON CHANGE only; never a CHECK) ─────────────────────────────────────────────
create or replace function public.guard_module_sport_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.custom_sport_name is not distinct from old.custom_sport_name
     and new.sport_key is not distinct from old.sport_key
     and new.scoring_mode is not distinct from old.scoring_mode
     and new.sport is not distinct from old.sport then
    return new;
  end if;

  new.custom_sport_name := nullif(btrim(coalesce(new.custom_sport_name, '')), '');
  if new.custom_sport_name is not null and char_length(new.custom_sport_name) > 30 then
    raise exception 'FIELD_INVALID:custom_sport_name';
  end if;
  if new.sport_key is not null and new.sport_key !~ '^[a-z0-9_]{2,30}$' then
    raise exception 'FIELD_INVALID:sport_key';
  end if;
  if new.scoring_mode is not null and new.scoring_mode not in ('games', 'score') then
    raise exception 'FIELD_INVALID:scoring_mode';
  end if;
  if new.sport <> 'other' then
    -- name / key only make sense for Other (More sports are stored as Other + key)
    new.custom_sport_name := null;
    new.sport_key := null;
  elsif new.custom_sport_name is null and public._custom_sport_required() then
    raise exception 'CUSTOM_SPORT_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_module_sport_fields on public.tournament_modules;
create trigger trg_guard_module_sport_fields
  before insert or update on public.tournament_modules
  for each row execute function public.guard_module_sport_fields();

create or replace function public.guard_community_custom_sport()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.custom_sport_name is not distinct from old.custom_sport_name
     and new.sport is not distinct from old.sport then
    return new;
  end if;
  new.custom_sport_name := nullif(btrim(coalesce(new.custom_sport_name, '')), '');
  if new.custom_sport_name is not null and char_length(new.custom_sport_name) > 30 then
    raise exception 'FIELD_INVALID:custom_sport_name';
  end if;
  if new.sport::text <> 'other' then
    new.custom_sport_name := null;
  elsif tg_op = 'INSERT' and new.custom_sport_name is null and public._custom_sport_required() then
    raise exception 'CUSTOM_SPORT_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_community_custom_sport on public.communities;
create trigger trg_guard_community_custom_sport
  before insert or update on public.communities
  for each row execute function public.guard_community_custom_sport();

-- ── create / update module: trailing optional params ───────────────────────────────────────────────
drop function if exists public.create_tournament_module(uuid, text, text, text, text, text, timestamptz, int, boolean, text);
create or replace function public.create_tournament_module(
  p_tournament uuid,
  p_name text,
  p_sport text,
  p_description text,
  p_rules_text text,
  p_venue text,
  p_starts_at timestamptz,
  p_max_entries int,
  p_third_place boolean,
  p_seeding_method text,
  p_custom_sport_name text default null,
  p_sport_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if auth.uid() is null or not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(p_tournament);
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'FIELD_INVALID:name';
  end if;
  if p_sport is null or p_sport not in ('table_tennis','badminton','tennis','squash','pickleball',
       'football','cricket','volleyball','handball','basketball','other') then
    raise exception 'FIELD_INVALID:sport';
  end if;
  if p_max_entries is not null and (p_max_entries < 2 or p_max_entries > 128) then
    raise exception 'FIELD_INVALID:max_entries';
  end if;
  if coalesce(p_seeding_method, 'manual') not in ('manual','random') then
    raise exception 'FIELD_INVALID:seeding_method';
  end if;

  insert into public.tournament_modules
    (tournament_id, name, sport, description, rules_text, venue, starts_at, max_entries,
     third_place_match, seeding_method, status, sort_order, created_by,
     custom_sport_name, sport_key)
  values
    (p_tournament, v_name, p_sport,
     nullif(btrim(coalesce(p_description, '')), ''),
     nullif(btrim(coalesce(p_rules_text, '')), ''),
     nullif(btrim(coalesce(p_venue, '')), ''),
     p_starts_at, p_max_entries,
     coalesce(p_third_place, false), coalesce(p_seeding_method, 'manual'), 'draft',
     (select coalesce(max(m.sort_order), 0) + 10 from public.tournament_modules m
      where m.tournament_id = p_tournament),
     auth.uid(),
     p_custom_sport_name, p_sport_key)   -- validated + normalised by guard_module_sport_fields
  returning id into v_id;

  return v_id;
end;
$$;

drop function if exists public.update_tournament_module(uuid, text, text, text, text, text, timestamptz, int, boolean, text);
create or replace function public.update_tournament_module(
  p_module uuid,
  p_name text,
  p_sport text,
  p_description text,
  p_rules_text text,
  p_venue text,
  p_starts_at timestamptz,
  p_max_entries int,
  p_third_place boolean,
  p_seeding_method text,
  p_custom_sport_name text default null,
  p_sport_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_name text := btrim(coalesce(p_name, ''));
  v_third boolean;
  v_seeding text;
  v_sport text;
  v_custom text;
  v_key text;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.status in ('completed','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'FIELD_INVALID:name';
  end if;
  if p_max_entries is not null and (p_max_entries < 2 or p_max_entries > 128) then
    raise exception 'FIELD_INVALID:max_entries';
  end if;
  if p_max_entries is not null
     and (select count(*) from public.tournament_entries e
          where e.module_id = p_module and e.status = 'active') > p_max_entries then
    raise exception 'MAX_ENTRIES';
  end if;

  -- Old clients send neither new param: keep what is stored. New clients send both (null clears).
  v_sport := coalesce(p_sport, v_m.sport);
  v_custom := coalesce(p_custom_sport_name, v_m.custom_sport_name);
  v_key := coalesce(p_sport_key, v_m.sport_key);
  if p_sport is not null and p_sport <> 'other' then v_custom := null; v_key := null; end if;

  -- sport / More-sport key: only draft/open and no bracket yet
  if p_sport is distinct from v_m.sport or v_key is distinct from v_m.sport_key then
    if p_sport is not null and p_sport not in ('table_tennis','badminton','tennis','squash','pickleball',
         'football','cricket','volleyball','handball','basketball','other') then
      raise exception 'FIELD_INVALID:sport';
    end if;
    if p_sport is null and v_key is not distinct from v_m.sport_key then
      null;
    elsif v_m.status not in ('draft','open')
       or exists (select 1 from public.tournament_matches tm where tm.module_id = p_module) then
      raise exception 'INVALID_STATUS';
    end if;
  end if;

  v_third := coalesce(p_third_place, v_m.third_place_match);
  v_seeding := coalesce(p_seeding_method, v_m.seeding_method);
  if v_seeding not in ('manual','random') then
    raise exception 'FIELD_INVALID:seeding_method';
  end if;
  if v_third is distinct from v_m.third_place_match then
    if v_m.status not in ('draft','open','seeding') or v_m.bracket_generated_at is not null then
      raise exception 'INVALID_STATUS';
    end if;
  end if;
  if v_seeding is distinct from v_m.seeding_method and v_m.status not in ('draft','open','seeding') then
    raise exception 'INVALID_STATUS';
  end if;

  update public.tournament_modules set
    name = v_name,
    sport = v_sport,
    custom_sport_name = v_custom,
    sport_key = v_key,
    description = nullif(btrim(coalesce(p_description, '')), ''),
    rules_text = nullif(btrim(coalesce(p_rules_text, '')), ''),
    venue = nullif(btrim(coalesce(p_venue, '')), ''),
    starts_at = p_starts_at,
    max_entries = p_max_entries,
    third_place_match = v_third,
    seeding_method = v_seeding
  where id = p_module;
end;
$$;

revoke all on function public.create_tournament_module(uuid, text, text, text, text, text, timestamptz, int, boolean, text, text, text) from public, anon;
revoke all on function public.update_tournament_module(uuid, text, text, text, text, text, timestamptz, int, boolean, text, text, text) from public, anon;
grant execute on function public.create_tournament_module(uuid, text, text, text, text, text, timestamptz, int, boolean, text, text, text) to authenticated;
grant execute on function public.update_tournament_module(uuid, text, text, text, text, text, timestamptz, int, boolean, text, text, text) to authenticated;

-- ── scoring_mode via update_tournament_module_settings (wrapper; same lock as the other settings) ──
-- The 093 function is renamed (its body is untouched) and a new function with the SAME signature handles the
-- `scoring_mode` key, then delegates the remaining keys. Old callers and old patches behave exactly as before.
alter function public.update_tournament_module_settings(uuid, jsonb) rename to _update_tournament_module_settings_v1;
revoke all on function public._update_tournament_module_settings_v1(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._update_tournament_module_settings_v1(uuid, jsonb) to service_role;

create or replace function public.update_tournament_module_settings(p_module uuid, p_set jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_mode text;
  v_rest jsonb;
begin
  if p_set is not null and jsonb_typeof(p_set) = 'object' and p_set ? 'scoring_mode' then
    if auth.uid() is null or not public.is_module_admin(p_module) then
      raise exception 'NOT_ALLOWED';
    end if;
    select * into v_m from public.tournament_modules where id = p_module for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    perform public._tournament_assert_writable(v_m.tournament_id);
    if v_m.status in ('completed','cancelled') then raise exception 'INVALID_STATUS'; end if;

    if jsonb_typeof(p_set -> 'scoring_mode') = 'null' then
      v_mode := null;
    elsif jsonb_typeof(p_set -> 'scoring_mode') = 'string' and (p_set ->> 'scoring_mode') in ('games', 'score') then
      v_mode := p_set ->> 'scoring_mode';
    else
      raise exception 'FIELD_INVALID:scoring_mode';
    end if;
    if v_mode is distinct from v_m.scoring_mode
       and (v_m.bracket_generated_at is not null
            or exists (select 1 from public.tournament_matches tm where tm.module_id = p_module)) then
      raise exception 'INVALID_STATUS';   -- same "no bracket yet" lock as format/roster settings
    end if;
    update public.tournament_modules set scoring_mode = v_mode where id = p_module;
    v_rest := p_set - 'scoring_mode';
    if v_rest = '{}'::jsonb then return; end if;
    perform public._update_tournament_module_settings_v1(p_module, v_rest);
    return;
  end if;
  perform public._update_tournament_module_settings_v1(p_module, p_set);
end;
$$;
revoke all on function public.update_tournament_module_settings(uuid, jsonb) from public, anon;
grant execute on function public.update_tournament_module_settings(uuid, jsonb) to authenticated;

-- ── get_tournament_detail: add the new module fields (wrapper; v1 body untouched) ──────────────────
alter function public.get_tournament_detail(uuid) rename to _get_tournament_detail_v1;
revoke all on function public._get_tournament_detail_v1(uuid) from public, anon, authenticated;
grant execute on function public._get_tournament_detail_v1(uuid) to service_role;

create or replace function public.get_tournament_detail(p_tournament uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb := public._get_tournament_detail_v1(p_tournament);
begin
  if v is null or jsonb_typeof(v -> 'modules') <> 'array' then
    return v;
  end if;
  return jsonb_set(v, '{modules}', coalesce((
    select jsonb_agg(
             m.elem || jsonb_build_object(
               'custom_sport_name', tm.custom_sport_name,
               'sport_key', tm.sport_key,
               'scoring_mode', tm.scoring_mode)
             order by m.ord)
    from jsonb_array_elements(v -> 'modules') with ordinality as m(elem, ord)
    left join public.tournament_modules tm on tm.id = (m.elem ->> 'id')::uuid
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.get_tournament_detail(uuid) from public, anon;
grant execute on function public.get_tournament_detail(uuid) to authenticated;

-- ── Community reads: append custom_sport_name (drop + recreate, same transaction) ───────────────────
-- Column order is unchanged; the new column is last. Bodies are copied from 048 / 120.
drop function if exists public.get_public_communities();
create or replace function public.get_public_communities()
returns table (
  id uuid, name text, description text, organization text, location text, image_url text,
  visibility text, sport text, created_by uuid, created_at timestamptz, updated_at timestamptz,
  pings_enabled boolean, member_count bigint, creator_username text, creator_avatar_url text,
  custom_sport_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id, c.name, c.description, c.organization, c.location,
    c.image_url, c.visibility, c.sport, c.created_by,
    c.created_at, c.updated_at, c.pings_enabled,
    coalesce(cm.cnt, 0) as member_count,
    p.username as creator_username,
    p.avatar_url as creator_avatar_url,
    c.custom_sport_name
  from public.communities c
  left join lateral (
    select count(*) as cnt
    from public.community_members m
    where m.community_id = c.id and m.approval_status = 'approved'
  ) cm on true
  left join public.profiles p on p.id = c.created_by
  order by c.created_at desc;
$$;

drop function if exists public.get_my_communities();
create or replace function public.get_my_communities()
returns table (
  id uuid, name text, description text, organization text, location text, image_url text,
  visibility text, sport text, created_by uuid, created_at timestamptz, updated_at timestamptz,
  pings_enabled boolean, member_count bigint, creator_username text, creator_avatar_url text,
  custom_sport_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id, c.name, c.description, c.organization, c.location,
    c.image_url, c.visibility, c.sport, c.created_by,
    c.created_at, c.updated_at, c.pings_enabled,
    coalesce(cm.cnt, 0) as member_count,
    p.username as creator_username,
    p.avatar_url as creator_avatar_url,
    c.custom_sport_name
  from public.communities c
  inner join public.community_members member
    on member.community_id = c.id
    and member.profile_id = auth.uid()
    and member.approval_status = 'approved'
  left join lateral (
    select count(*) as cnt
    from public.community_members m
    where m.community_id = c.id and m.approval_status = 'approved'
  ) cm on true
  left join public.profiles p on p.id = c.created_by
  order by c.created_at desc;
$$;

drop function if exists public.get_community_by_id(uuid);
create or replace function public.get_community_by_id(p_community_id uuid)
returns table (
  id uuid, name text, description text, organization text, location text, image_url text,
  visibility text, sport text, created_by uuid, created_at timestamptz, updated_at timestamptz,
  pings_enabled boolean, member_count bigint, creator_username text, creator_avatar_url text,
  custom_sport_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id, c.name, c.description, c.organization, c.location,
    c.image_url, c.visibility, c.sport, c.created_by,
    c.created_at, c.updated_at, c.pings_enabled,
    coalesce(cm.cnt, 0) as member_count,
    p.username as creator_username,
    p.avatar_url as creator_avatar_url,
    c.custom_sport_name
  from public.communities c
  left join lateral (
    select count(*) as cnt
    from public.community_members m
    where m.community_id = c.id and m.approval_status = 'approved'
  ) cm on true
  left join public.profiles p on p.id = c.created_by
  where c.id = p_community_id;
$$;

drop function if exists public.get_discover_communities();
create or replace function public.get_discover_communities()
returns table (
  id uuid, name text, description text, organization text, location text, image_url text,
  visibility text, sport text, created_by uuid, created_at timestamptz, updated_at timestamptz,
  pings_enabled boolean, member_count bigint, creator_username text, creator_avatar_url text,
  my_role text, activity_14d bigint, popularity numeric,
  custom_sport_name text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_interests text[];
begin
  if v_uid is null then
    raise exception 'NOT_ALLOWED';
  end if;

  select coalesce(p.sport_interests, '{}') into v_interests from public.profiles p where p.id = v_uid;

  return query
  select
    c.id, c.name, c.description, c.organization, c.location,
    c.image_url, c.visibility::text, c.sport::text, c.created_by,
    c.created_at, c.updated_at, c.pings_enabled,
    coalesce(mc.cnt, 0)::bigint as member_count,
    pr.username as creator_username,
    pr.avatar_url as creator_avatar_url,
    me.role::text as my_role,
    (coalesce(ma.cnt, 0) + coalesce(po.cnt, 0))::bigint as activity_14d,
    round((
      ln(1 + coalesce(mc.cnt, 0)) * 2
      + ln(1 + coalesce(ma.cnt, 0) + coalesce(po.cnt, 0)) * 3
      + case when c.sport::text = any (v_interests) then 1 else 0 end
      + case when c.created_at > now() - interval '7 days' then 1.5 else 0 end
    )::numeric, 3) as popularity,
    c.custom_sport_name
  from public.communities c
  left join lateral (
    select count(*) as cnt from public.community_members m
    where m.community_id = c.id and m.approval_status = 'approved'
  ) mc on true
  left join lateral (
    select count(*) as cnt from public.community_matches x
    where x.community_id = c.id and x.approval_status = 'approved'
      and x.created_at > now() - interval '14 days'
  ) ma on true
  left join lateral (
    select count(*) as cnt from public.community_posts x
    where x.community_id = c.id and x.created_at > now() - interval '14 days'
  ) po on true
  left join public.community_members me
    on me.community_id = c.id and me.profile_id = v_uid and me.approval_status = 'approved'
  left join public.profiles pr on pr.id = c.created_by
  order by
    (me.profile_id is not null) asc,
    popularity desc,
    c.created_at desc;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'get_public_communities()', 'get_my_communities()', 'get_community_by_id(uuid)', 'get_discover_communities()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ── Optional hardening (A5): no matches for Other communities ───────────────────────────────────────
-- Old builds cannot complete the flow for Other communities (no opponent can be picked), so this only
-- stops direct API calls. INSERT-only; existing rows are untouched.
create or replace function public.guard_no_matches_in_other_communities()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.communities c where c.id = new.community_id and c.sport::text = 'other') then
    raise exception 'NOT_ALLOWED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_no_matches_in_other_communities on public.community_matches;
create trigger trg_no_matches_in_other_communities
  before insert on public.community_matches
  for each row execute function public.guard_no_matches_in_other_communities();
