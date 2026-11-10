-- 091_add_tournament_roster_rpcs.sql
-- Tournaments v2 (rosters): write + read RPCs for team modules. See docs/tournaments/PLAN-v2.md §4.1.
--  * _validate_entry_field_values  (refactor of the v1 field loop; upsert_tournament_entry now uses it)
--  * update_tournament_module_settings  (jsonb patch RPC; roster keys now, format keys in 093)
--  * upsert_team_entry
--  * upsert_tournament_entry / set_module_status  (create or replace, same signatures + new guards)
--  * get_module_entries  (DROP + CREATE: two new trailing columns; tournaments are not released — PROGRESS Decisions)
--  * get_module_detail / get_module_bracket (create or replace), get_tournaments / get_tournament_detail (my_role patch)

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Shared field validation (same rules as v1 upsert_tournament_entry)
--    p_keep: previous field_values — answers of archived fields are carried over.
--    p_suffix: appended to error codes, e.g. '@2' for the third roster member.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._validate_entry_field_values(
  p_tournament uuid,
  p_in jsonb,
  p_keep jsonb default null,
  p_suffix text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clean jsonb := '{}'::jsonb;
  v_f record;
  v_raw text;
  v_in jsonb := coalesce(p_in, '{}'::jsonb);
begin
  if jsonb_typeof(v_in) <> 'object' then
    raise exception 'FIELD_INVALID:field_values%', p_suffix;
  end if;

  if p_keep is not null then
    v_clean := coalesce((
      select jsonb_object_agg(kv.key, kv.value)
      from jsonb_each(p_keep) kv
      where exists (select 1 from public.tournament_entry_fields f
                    where f.tournament_id = p_tournament and f.key = kv.key
                      and f.archived_at is not null)
    ), '{}'::jsonb);
  end if;

  for v_f in
    select f.* from public.tournament_entry_fields f
    where f.tournament_id = p_tournament and f.archived_at is null and f.key <> 'name'
    order by f.sort_order, f.created_at
  loop
    v_raw := case when jsonb_typeof(v_in -> v_f.key) in ('string','number')
                  then btrim(v_in ->> v_f.key) else null end;
    if v_raw is null or v_raw = '' then
      if v_f.is_required then
        raise exception 'FIELD_REQUIRED:%', v_f.key || p_suffix;
      end if;
      continue;
    end if;
    if char_length(v_raw) > 200 then
      raise exception 'FIELD_INVALID:%', v_f.key || p_suffix;
    end if;
    if v_f.field_type = 'email' and v_raw !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'FIELD_INVALID:%', v_f.key || p_suffix;
    elsif v_f.field_type = 'phone' and v_raw !~ '^\+?[0-9\s-]{7,20}$' then
      raise exception 'FIELD_INVALID:%', v_f.key || p_suffix;
    elsif v_f.field_type = 'number' and v_raw !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception 'FIELD_INVALID:%', v_f.key || p_suffix;
    elsif v_f.field_type = 'select' and not exists (
        select 1 from jsonb_array_elements_text(coalesce(v_f.options, '[]'::jsonb)) o
        where o = v_raw) then
      raise exception 'FIELD_INVALID:%', v_f.key || p_suffix;
    end if;
    v_clean := v_clean || jsonb_build_object(v_f.key, v_raw);
  end loop;

  return v_clean;
end;
$$;
revoke all on function public._validate_entry_field_values(uuid, jsonb, jsonb, text) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. upsert_tournament_entry: same behaviour, loop moved to the helper, + team guard
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.upsert_tournament_entry(
  p_module uuid,
  p_entry uuid,
  p_name text,
  p_profile uuid,
  p_field_values jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_name text := btrim(coalesce(p_name, ''));
  v_in jsonb := coalesce(p_field_values, '{}'::jsonb);
  v_clean jsonb := '{}'::jsonb;
  v_old public.tournament_entries;
  v_id uuid;
  v_constraint text;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.participant_type = 'team' then
    raise exception 'WRONG_PARTICIPANT_TYPE';
  end if;
  if v_m.status not in ('draft','open') then
    raise exception 'INVALID_STATUS';
  end if;

  if jsonb_typeof(v_in) <> 'object' then
    raise exception 'FIELD_INVALID:field_values';
  end if;
  if v_name = '' then
    raise exception 'FIELD_REQUIRED:name';
  end if;
  if char_length(v_name) > 60 then
    raise exception 'FIELD_INVALID:name';
  end if;

  if p_profile is not null and not exists (
       select 1 from public.public_profiles p where p.id = p_profile and p.deleted_at is null) then
    raise exception 'NOT_FOUND';
  end if;

  if p_entry is not null then
    select * into v_old from public.tournament_entries e
    where e.id = p_entry and e.module_id = p_module;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if v_old.status <> 'active' then
      raise exception 'INVALID_STATUS';
    end if;
    v_clean := public._validate_entry_field_values(v_m.tournament_id, v_in, v_old.field_values, '');
  else
    if v_m.max_entries is not null
       and (select count(*) from public.tournament_entries e
            where e.module_id = p_module and e.status = 'active') >= v_m.max_entries then
      raise exception 'MAX_ENTRIES';
    end if;
    v_clean := public._validate_entry_field_values(v_m.tournament_id, v_in, null, '');
  end if;

  begin
    if p_entry is null then
      insert into public.tournament_entries
        (module_id, tournament_id, name, profile_id, field_values, created_by)
      values (p_module, v_m.tournament_id, v_name, p_profile, v_clean, auth.uid())
      returning id into v_id;
    else
      update public.tournament_entries
      set name = v_name, profile_id = p_profile, field_values = v_clean
      where id = p_entry
      returning id into v_id;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'tournament_entries_cms_unique' then
      raise exception 'DUPLICATE_CMS_ID';
    elsif v_constraint = 'tournament_entries_profile_unique' then
      raise exception 'DUPLICATE_PROFILE';
    end if;
    raise;
  end;

  return v_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. update_tournament_module_settings (jsonb patch). Roster keys here; 093 adds format keys.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.update_tournament_module_settings(p_module uuid, p_set jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_key text;
  v_ptype text;
  v_rmin int;
  v_rmax int;
  v_lineup int;
  v_max_members int;
  v_entries int;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.status in ('completed','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_set is null or jsonb_typeof(p_set) <> 'object' then
    raise exception 'FIELD_INVALID:settings';
  end if;

  for v_key in select jsonb_object_keys(p_set) loop
    if v_key not in ('participant_type','roster_min','roster_max','lineup_size') then
      raise exception 'FIELD_INVALID:%', v_key;
    end if;
  end loop;

  v_ptype := v_m.participant_type;
  v_rmin := v_m.roster_min;
  v_rmax := v_m.roster_max;
  v_lineup := v_m.lineup_size;

  if p_set ? 'participant_type' then
    if jsonb_typeof(p_set -> 'participant_type') <> 'string'
       or (p_set ->> 'participant_type') not in ('individual','team') then
      raise exception 'FIELD_INVALID:participant_type';
    end if;
    v_ptype := p_set ->> 'participant_type';
    if v_ptype is distinct from v_m.participant_type then
      if v_m.status not in ('draft','open') then
        raise exception 'INVALID_STATUS';
      end if;
      select count(*) into v_entries from public.tournament_entries e where e.module_id = p_module;
      if v_entries > 0 then
        raise exception 'INVALID_STATUS';
      end if;
      if v_ptype = 'individual'
         and v_m.sport in ('football','cricket','volleyball','handball','basketball') then
        raise exception 'FIELD_INVALID:participant_type';
      end if;
    end if;
  end if;

  if v_ptype = 'individual' then
    v_rmin := null; v_rmax := null; v_lineup := null;
  else
    if p_set ? 'roster_min' then
      if jsonb_typeof(p_set -> 'roster_min') <> 'number' then raise exception 'FIELD_INVALID:roster_min'; end if;
      v_rmin := (p_set ->> 'roster_min')::numeric::int;
    end if;
    if p_set ? 'roster_max' then
      if jsonb_typeof(p_set -> 'roster_max') <> 'number' then raise exception 'FIELD_INVALID:roster_max'; end if;
      v_rmax := (p_set ->> 'roster_max')::numeric::int;
    end if;
    if p_set ? 'lineup_size' then
      if jsonb_typeof(p_set -> 'lineup_size') = 'null' then
        v_lineup := null;
      elsif jsonb_typeof(p_set -> 'lineup_size') <> 'number' then
        raise exception 'FIELD_INVALID:lineup_size';
      else
        v_lineup := (p_set ->> 'lineup_size')::numeric::int;
      end if;
    end if;
    if v_rmin is null then raise exception 'FIELD_REQUIRED:roster_min'; end if;
    if v_rmax is null then raise exception 'FIELD_REQUIRED:roster_max'; end if;
    if v_rmin not between 1 and 40 then raise exception 'FIELD_INVALID:roster_min'; end if;
    if v_rmax not between 1 and 40 or v_rmax < v_rmin then raise exception 'FIELD_INVALID:roster_max'; end if;
    if v_lineup is not null and v_lineup not between 1 and 40 then raise exception 'FIELD_INVALID:lineup_size'; end if;

    -- B5: no shrinking below existing teams; no raising the minimum once seeding has begun
    select coalesce(max(c), 0) into v_max_members from (
      select count(*) as c from public.tournament_entry_members tem
      where tem.module_id = p_module group by tem.entry_id) s;
    if v_rmax < v_max_members then
      raise exception 'ROSTER_TOO_LARGE';
    end if;
    if v_m.participant_type = 'team' and v_rmin is distinct from v_m.roster_min
       and v_m.status not in ('draft','open') then
      raise exception 'INVALID_STATUS';
    end if;
  end if;

  update public.tournament_modules set
    participant_type = v_ptype,
    roster_min = v_rmin,
    roster_max = v_rmax,
    lineup_size = v_lineup
  where id = p_module;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. upsert_team_entry — the full roster is sent every time
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.upsert_team_entry(
  p_module uuid,
  p_entry uuid,
  p_name text,
  p_members jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_name text := btrim(coalesce(p_name, ''));
  v_old public.tournament_entries;
  v_id uuid;
  v_count int;
  v_i int;
  v_mem jsonb;
  v_mname text;
  v_mid uuid;
  v_profile uuid;
  v_fv jsonb;
  v_prev jsonb;
  v_captain boolean;
  v_captains int := 0;
  v_squad int;
  v_clean jsonb[] := '{}';
  v_ids uuid[] := '{}';
  v_cms text;
  v_seen_cms text[] := '{}';
  v_seen_profile uuid[] := '{}';
  v_seen_squad int[] := '{}';
  v_team_sport boolean;
  v_constraint text;
  v_item jsonb;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.participant_type <> 'team' then
    raise exception 'WRONG_PARTICIPANT_TYPE';
  end if;

  if v_name = '' then raise exception 'FIELD_REQUIRED:name'; end if;
  if char_length(v_name) > 60 then raise exception 'FIELD_INVALID:name'; end if;
  if p_members is null or jsonb_typeof(p_members) <> 'array' then
    raise exception 'FIELD_INVALID:members';
  end if;
  v_count := jsonb_array_length(p_members);

  if p_entry is null then
    if v_m.status not in ('draft','open') then raise exception 'INVALID_STATUS'; end if;
    if v_m.max_entries is not null
       and (select count(*) from public.tournament_entries e
            where e.module_id = p_module and e.status = 'active') >= v_m.max_entries then
      raise exception 'MAX_ENTRIES';
    end if;
  else
    select * into v_old from public.tournament_entries e where e.id = p_entry and e.module_id = p_module;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_old.status <> 'active' or v_m.status not in ('draft','open','seeding','in_progress') then
      raise exception 'INVALID_STATUS';
    end if;
  end if;

  if v_count > v_m.roster_max then raise exception 'ROSTER_TOO_LARGE'; end if;
  if v_m.status in ('seeding','in_progress') and v_count < v_m.roster_min then
    raise exception 'ROSTER_INCOMPLETE';
  end if;

  v_team_sport := v_m.sport not in ('table_tennis','badminton','tennis','squash','pickleball');

  -- pass 1: validate + normalise every member (no writes yet)
  for v_i in 0 .. v_count - 1 loop
    v_mem := p_members -> v_i;
    if jsonb_typeof(v_mem) <> 'object' then raise exception 'FIELD_INVALID:members'; end if;

    v_mname := btrim(coalesce(v_mem ->> 'name', ''));
    if v_mname = '' then raise exception 'FIELD_REQUIRED:name@%', v_i; end if;
    if char_length(v_mname) > 60 then raise exception 'FIELD_INVALID:name@%', v_i; end if;

    v_mid := null;
    if coalesce(v_mem ->> 'id', '') <> '' then
      if (v_mem ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'NOT_FOUND';
      end if;
      v_mid := (v_mem ->> 'id')::uuid;
      if p_entry is null or not exists (
           select 1 from public.tournament_entry_members tem
           where tem.id = v_mid and tem.entry_id = p_entry) then
        raise exception 'NOT_FOUND';
      end if;
    end if;

    v_profile := null;
    if coalesce(v_mem ->> 'profile_id', '') <> '' then
      if (v_mem ->> 'profile_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'NOT_FOUND';
      end if;
      v_profile := (v_mem ->> 'profile_id')::uuid;
      if not exists (select 1 from public.public_profiles p
                     where p.id = v_profile and p.deleted_at is null) then
        raise exception 'NOT_FOUND';
      end if;
      if v_profile = any (v_seen_profile) then
        raise exception 'DUPLICATE_MEMBER_PROFILE@%', v_i;
      end if;
      v_seen_profile := v_seen_profile || v_profile;
    end if;

    v_prev := null;
    if v_mid is not null then
      select tem.field_values into v_prev from public.tournament_entry_members tem where tem.id = v_mid;
    end if;
    v_fv := public._validate_entry_field_values(
      v_m.tournament_id, coalesce(v_mem -> 'field_values', '{}'::jsonb), v_prev, '@' || v_i);

    v_cms := lower(coalesce(v_fv ->> 'cms_id', ''));
    if v_cms <> '' then
      if v_cms = any (v_seen_cms) then
        raise exception 'DUPLICATE_MEMBER_CMS_ID@%', v_i;
      end if;
      v_seen_cms := v_seen_cms || v_cms;
    end if;

    v_captain := coalesce((v_mem ->> 'is_captain')::boolean, false);
    if v_captain then
      v_captains := v_captains + 1;
      if v_captains > 1 then raise exception 'FIELD_INVALID:is_captain'; end if;
    end if;

    v_squad := null;
    if v_team_sport and coalesce(v_mem ->> 'squad_number', '') <> '' then
      if (v_mem ->> 'squad_number') !~ '^[0-9]{1,2}$' then
        raise exception 'FIELD_INVALID:squad_number@%', v_i;
      end if;
      v_squad := (v_mem ->> 'squad_number')::int;
      if v_squad = any (v_seen_squad) then raise exception 'DUPLICATE_SQUAD_NUMBER'; end if;
      v_seen_squad := v_seen_squad || v_squad;
    end if;

    v_clean := v_clean || jsonb_build_object(
      'id', v_mid, 'name', v_mname, 'profile_id', v_profile, 'field_values', v_fv,
      'is_captain', v_captain, 'squad_number', v_squad, 'sort_order', v_i);
    if v_mid is not null then v_ids := v_ids || v_mid; end if;
  end loop;

  -- pass 2: writes
  begin
    if p_entry is null then
      insert into public.tournament_entries
        (module_id, tournament_id, name, profile_id, field_values, created_by)
      values (p_module, v_m.tournament_id, v_name, null, '{}'::jsonb, auth.uid())
      returning id into v_id;
    else
      update public.tournament_entries set name = v_name, profile_id = null, field_values = '{}'::jsonb
      where id = p_entry;
      v_id := p_entry;
      delete from public.tournament_entry_members tem
      where tem.entry_id = v_id and not (tem.id = any (v_ids));
      -- free the one-per-team slots first so members can swap captain / numbers
      update public.tournament_entry_members tem set is_captain = false, squad_number = null
      where tem.entry_id = v_id;
    end if;

    foreach v_item in array v_clean loop
      if (v_item ->> 'id') is not null then
        update public.tournament_entry_members tem set
          name = v_item ->> 'name',
          profile_id = nullif(v_item ->> 'profile_id', '')::uuid,
          field_values = v_item -> 'field_values',
          is_captain = (v_item ->> 'is_captain')::boolean,
          squad_number = nullif(v_item ->> 'squad_number', '')::int,
          sort_order = (v_item ->> 'sort_order')::int
        where tem.id = (v_item ->> 'id')::uuid;
      else
        insert into public.tournament_entry_members
          (entry_id, module_id, tournament_id, name, profile_id, field_values,
           is_captain, squad_number, sort_order, created_by)
        values
          (v_id, p_module, v_m.tournament_id, v_item ->> 'name',
           nullif(v_item ->> 'profile_id', '')::uuid, v_item -> 'field_values',
           (v_item ->> 'is_captain')::boolean, nullif(v_item ->> 'squad_number', '')::int,
           (v_item ->> 'sort_order')::int, auth.uid());
      end if;
    end loop;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'tem_cms_unique' then
      raise exception 'DUPLICATE_MEMBER_CMS_ID';
    elsif v_constraint = 'tem_profile_unique' then
      raise exception 'DUPLICATE_MEMBER_PROFILE';
    elsif v_constraint = 'tem_squad_number' then
      raise exception 'DUPLICATE_SQUAD_NUMBER';
    end if;
    raise;
  end;

  return v_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. set_module_status: v1 rules + roster completeness on open → seeding
--    (format checks are added in 094)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.set_module_status(p_module uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_active int;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module for update;
  perform public._tournament_assert_writable(v_m.tournament_id);

  if p_status is null or p_status not in ('draft','open','seeding','in_progress','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  if v_m.status in ('completed','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;

  select count(*) into v_active from public.tournament_entries e
  where e.module_id = p_module and e.status = 'active';

  if v_m.status = 'draft' and p_status = 'open' then
    null;
  elsif v_m.status = 'open' and p_status = 'draft' then
    null;
  elsif v_m.status = 'open' and p_status = 'seeding' then
    if v_active < 2 then
      raise exception 'NOT_ENOUGH_ENTRIES';
    end if;
    if v_m.participant_type = 'team' and exists (
         select 1 from public.tournament_entries e
         where e.module_id = p_module and e.status = 'active'
           and (select count(*) from public.tournament_entry_members tem where tem.entry_id = e.id)
               not between v_m.roster_min and v_m.roster_max) then
      raise exception 'ROSTER_INCOMPLETE';
    end if;
  elsif v_m.status = 'seeding' and p_status = 'in_progress' then
    if v_m.bracket_generated_at is null
       or not exists (select 1 from public.tournament_matches tm where tm.module_id = p_module) then
      raise exception 'INVALID_STATUS';
    end if;
  elsif v_m.status = 'seeding' and p_status = 'open' then
    -- deletes the generated bracket (rounds cascade to matches)
    delete from public.tournament_rounds where module_id = p_module;
    update public.tournament_entries
      set eliminated_round = null, final_rank = null
      where module_id = p_module;
    update public.tournament_modules
      set bracket_generated_at = null,
          champion_entry_id = null, runner_up_entry_id = null, third_place_entry_id = null
      where id = p_module;
  elsif p_status = 'cancelled' then
    null;
  else
    raise exception 'INVALID_STATUS';
  end if;

  update public.tournament_modules set status = p_status where id = p_module;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Reads
-- ───────────────────────────────────────────────────────────────────────────

-- get_module_entries: + member_count, members (drop + create: RETURNS TABLE shape changes)
drop function if exists public.get_module_entries(uuid);
create function public.get_module_entries(p_module uuid)
returns table (
  id uuid,
  name text,
  seed int,
  status text,
  eliminated_round int,
  final_rank int,
  profile jsonb,
  fields jsonb,
  member_count int,
  members jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_tournament uuid;
  v_admin boolean;
begin
  if v_uid is null or not public.can_view_module(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select m.tournament_id into v_tournament from public.tournament_modules m where m.id = p_module;
  v_admin := public.is_module_admin(p_module);

  return query
  select
    e.id, e.name, e.seed, e.status, e.eliminated_round, e.final_rank,
    case when p.id is null then null
         else jsonb_build_object('id', p.id, 'username', p.username, 'avatar_url', p.avatar_url) end,
    case
      when v_admin or e.profile_id = v_uid then e.field_values
      else coalesce((
        select jsonb_object_agg(kv.key, kv.value)
        from jsonb_each(e.field_values) kv
        join public.tournament_entry_fields f
          on f.tournament_id = v_tournament and f.key = kv.key
        where f.is_public and f.archived_at is null
      ), '{}'::jsonb)
    end,
    (select count(*)::int from public.tournament_entry_members tem where tem.entry_id = e.id),
    coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', tem.id,
          'name', tem.name,
          'is_captain', tem.is_captain,
          'squad_number', tem.squad_number,
          'profile', case when mp.id is null then null
                          else jsonb_build_object('id', mp.id, 'username', mp.username,
                                                  'avatar_url', mp.avatar_url) end,
          'fields', case
            when v_admin or tem.profile_id = v_uid then tem.field_values
            else coalesce((
              select jsonb_object_agg(kv.key, kv.value)
              from jsonb_each(tem.field_values) kv
              join public.tournament_entry_fields f
                on f.tournament_id = v_tournament and f.key = kv.key
              where f.is_public and f.archived_at is null
            ), '{}'::jsonb)
          end
        ) order by tem.is_captain desc, tem.squad_number asc nulls last, tem.sort_order, tem.created_at)
      from public.tournament_entry_members tem
      left join public.public_profiles mp on mp.id = tem.profile_id
      where tem.entry_id = e.id
    ), '[]'::jsonb)
  from public.tournament_entries e
  left join public.public_profiles p on p.id = e.profile_id
  where e.module_id = p_module
  order by e.seed asc nulls last, lower(e.name), e.created_at;
end;
$$;

-- get_module_bracket: entry refs gain profile_ids (same columns otherwise)
create or replace function public.get_module_bracket(p_module uuid)
returns table (
  id uuid,
  module_id uuid,
  round_id uuid,
  round_number int,
  match_number int,
  is_third_place boolean,
  entry_a jsonb,
  entry_b jsonb,
  next_match_id uuid,
  next_slot text,
  status text,
  scheduled_at timestamptz,
  venue text,
  court text,
  score_a int,
  score_b int,
  score_detail jsonb,
  winner_entry_id uuid,
  result_note text,
  completed_at timestamptz,
  round_name text,
  best_of int
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.can_view_module(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;

  return query
  select
    tm.id, tm.module_id, tm.round_id, tm.round_number, tm.match_number, tm.is_third_place,
    case when ea.id is null then null
         else jsonb_build_object('id', ea.id, 'name', ea.name, 'seed', ea.seed,
                                 'profile_id', ea.profile_id,
                                 'profile_ids', to_jsonb(public._entry_profile_ids(ea.id))) end,
    case when eb.id is null then null
         else jsonb_build_object('id', eb.id, 'name', eb.name, 'seed', eb.seed,
                                 'profile_id', eb.profile_id,
                                 'profile_ids', to_jsonb(public._entry_profile_ids(eb.id))) end,
    tm.next_match_id, tm.next_slot, tm.status, tm.scheduled_at, tm.venue, tm.court,
    tm.score_a, tm.score_b, tm.score_detail, tm.winner_entry_id, tm.result_note, tm.completed_at,
    r.name, r.best_of
  from public.tournament_matches tm
  join public.tournament_rounds r on r.id = tm.round_id
  left join public.tournament_entries ea on ea.id = tm.entry_a_id
  left join public.tournament_entries eb on eb.id = tm.entry_b_id
  where tm.module_id = p_module
  order by tm.is_third_place, tm.round_number, tm.match_number;
end;
$$;

-- get_module_detail: 'entrant' now includes team members; counts.rosters_incomplete
create or replace function public.get_module_detail(p_module uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.tournament_modules;
  v_role text;
  v_rounds jsonb;
  v_admins jsonb;
begin
  if v_uid is null or not public.can_view_module(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into v_m from public.tournament_modules where id = p_module;

  v_role := case
    when public.is_module_admin(p_module) then 'module_admin'
    when public.is_module_participant(p_module) then 'entrant'
    else null
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'module_id', r.module_id, 'round_number', r.round_number,
      'is_third_place', r.is_third_place, 'name', r.name, 'best_of', r.best_of,
      'rules_text', r.rules_text, 'scheduled_start', r.scheduled_start
    ) order by r.is_third_place, r.round_number), '[]'::jsonb)
    into v_rounds
  from public.tournament_rounds r where r.module_id = p_module;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url
    ) order by tma.added_at), '[]'::jsonb)
    into v_admins
  from public.tournament_module_admins tma
  join public.public_profiles p on p.id = tma.profile_id
  where tma.module_id = p_module;

  return jsonb_build_object(
    'module', to_jsonb(v_m),
    'tournament', (select jsonb_build_object('id', t.id, 'name', t.name, 'status', t.status)
                   from public.tournaments t where t.id = v_m.tournament_id),
    'rounds', v_rounds,
    'admins', v_admins,
    'my_role', v_role,
    'counts', jsonb_build_object(
      'entries', (select count(*) from public.tournament_entries e
                  where e.module_id = p_module and e.status = 'active'),
      'withdrawn', (select count(*) from public.tournament_entries e
                    where e.module_id = p_module and e.status = 'withdrawn'),
      'matches', (select count(*) from public.tournament_matches tm where tm.module_id = p_module),
      'matches_decided', (select count(*) from public.tournament_matches tm
                          where tm.module_id = p_module and tm.status in ('completed','walkover','bye')),
      'rosters_incomplete', case when v_m.participant_type = 'team' then (
          select count(*) from public.tournament_entries e
          where e.module_id = p_module and e.status = 'active'
            and (select count(*) from public.tournament_entry_members tem where tem.entry_id = e.id)
                < coalesce(v_m.roster_min, 0)) else 0 end
    )
  );
end;
$$;

-- get_tournaments / get_tournament_detail: 'entrant' role also for team members.
-- Patched from the live definition so unrelated logic is untouched.
do $do$
declare
  v_def text;
  v_new text;
  v_old_expr constant text := 'e.profile_id = v_uid';
  v_new_expr constant text := '(e.profile_id = v_uid or exists (select 1 from public.tournament_entry_members tem where tem.entry_id = e.id and tem.profile_id = v_uid))';
  v_fn text;
begin
  foreach v_fn in array array['public.get_tournaments(text)', 'public.get_tournament_detail(uuid)'] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    v_new := replace(v_def, v_old_expr, v_new_expr);
    if v_new = v_def then
      raise exception 'roster patch: expression not found in %', v_fn;
    end if;
    execute v_new;
  end loop;
end
$do$;

-- ───────────────────────────────────────────────────────────────────────────
-- Grants
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function public.upsert_tournament_entry(uuid, uuid, text, uuid, jsonb) from public, anon;
revoke all on function public.update_tournament_module_settings(uuid, jsonb) from public, anon;
revoke all on function public.upsert_team_entry(uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.set_module_status(uuid, text) from public, anon;
revoke all on function public.get_module_entries(uuid) from public, anon;
revoke all on function public.get_module_bracket(uuid) from public, anon;
revoke all on function public.get_module_detail(uuid) from public, anon;

grant execute on function public.upsert_tournament_entry(uuid, uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.update_tournament_module_settings(uuid, jsonb) to authenticated;
grant execute on function public.upsert_team_entry(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.set_module_status(uuid, text) to authenticated;
grant execute on function public.get_module_entries(uuid) to authenticated;
grant execute on function public.get_module_bracket(uuid) to authenticated;
grant execute on function public.get_module_detail(uuid) to authenticated;
