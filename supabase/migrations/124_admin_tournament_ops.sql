-- 124_admin_tournament_ops.sql
-- Admin panel v1 (docs/admin-panel/PLAN.md §4): tournament operations that used to be owner SQL.
-- ADDITIVE ONLY: new functions. update_tournament / rename_tournament etc. are untouched.
-- Roles: super_admin + tournament_manager, except reopen-module and delete-tournament (super only).
-- Status changes go only through admin_set_tournament_status (one code path), never through the
-- jsonb patch of create/update.

-- ── Internal: shared validation for create + update (keeps them from drifting apart) ─────────────
-- Returns the tournaments row with the patch applied (NOT written). Rules match update_tournament (089)
-- plus the Cloudinary-only image rule of migration 113.
create or replace function public._admin_apply_tournament_patch(p_base public.tournaments, p_set jsonb)
returns public.tournaments
language plpgsql
stable
set search_path = public
as $$
declare
  v public.tournaments := p_base;
begin
  if p_set is null or jsonb_typeof(p_set) <> 'object' then
    raise exception 'FIELD_INVALID:settings';
  end if;
  if p_set ? 'status' then
    raise exception 'FIELD_INVALID:status';
  end if;

  if p_set ? 'name' then
    v.name := btrim(coalesce(p_set->>'name', ''));
    if char_length(v.name) < 3 or char_length(v.name) > 80 then
      raise exception 'FIELD_INVALID:name';
    end if;
  end if;
  if p_set ? 'description' then
    v.description := nullif(btrim(coalesce(p_set->>'description', '')), '');
    if char_length(v.description) > 2000 then raise exception 'FIELD_INVALID:description'; end if;
  end if;
  if p_set ? 'organization' then
    v.organization := nullif(btrim(coalesce(p_set->>'organization', '')), '');
    if char_length(v.organization) > 80 then raise exception 'FIELD_INVALID:organization'; end if;
  end if;
  if p_set ? 'location' then
    v.location := nullif(btrim(coalesce(p_set->>'location', '')), '');
    if char_length(v.location) > 120 then raise exception 'FIELD_INVALID:location'; end if;
  end if;
  if p_set ? 'image_url' then
    v.image_url := nullif(btrim(coalesce(p_set->>'image_url', '')), '');
    if v.image_url is not null and v.image_url not like 'https://res.cloudinary.com/%' then
      raise exception 'INVALID_IMAGE_URL';
    end if;
  end if;
  begin
    if p_set ? 'starts_at' then v.starts_at := nullif(p_set->>'starts_at', '')::timestamptz; end if;
  exception when others then
    raise exception 'FIELD_INVALID:starts_at';
  end;
  begin
    if p_set ? 'ends_at' then v.ends_at := nullif(p_set->>'ends_at', '')::timestamptz; end if;
  exception when others then
    raise exception 'FIELD_INVALID:ends_at';
  end;
  if v.starts_at is not null and v.ends_at is not null and v.ends_at < v.starts_at then
    raise exception 'FIELD_INVALID:ends_at';
  end if;
  return v;
end;
$$;

revoke all on function public._admin_apply_tournament_patch(public.tournaments, jsonb) from public, anon, authenticated;
grant execute on function public._admin_apply_tournament_patch(public.tournaments, jsonb) to service_role;

-- ── Reads ────────────────────────────────────────────────────────────────────

create or replace function public.admin_list_tournaments(
  p_status text default null,
  p_search text default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  status text,
  organization text,
  location text,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz,
  module_count bigint,
  admin_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := btrim(coalesce(p_search, ''));
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  if p_status is not null and p_status not in ('draft', 'published', 'completed', 'cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  return query
  with f as (
    select t.* from public.tournaments t
    where (p_status is null or t.status = p_status)
      and (v_q = '' or t.name ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  )
  select f.id, f.name, f.status, f.organization, f.location, f.image_url, f.starts_at, f.ends_at, f.created_at,
         (select count(*) from public.tournament_modules m where m.tournament_id = f.id),
         (select count(*) from public.tournament_admins a where a.tournament_id = f.id),
         count(*) over ()
  from f
  order by f.created_at desc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_get_tournament(p_tournament uuid)
returns table (
  id uuid,
  name text,
  description text,
  organization text,
  location text,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  created_by uuid,
  created_by_username text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  return query
  select t.id, t.name, t.description, t.organization, t.location, t.image_url, t.starts_at, t.ends_at,
         t.status, t.created_by, p.username, t.created_at, t.updated_at
  from public.tournaments t
  left join public.profiles p on p.id = t.created_by
  where t.id = p_tournament;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
end;
$$;

create or replace function public.admin_list_tournament_modules(p_tournament uuid)
returns table (
  id uuid,
  name text,
  sport text,
  format text,
  status text,
  sort_order int,
  active_entries bigint,
  champion_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  return query
  select m.id, m.name, m.sport, m.format, m.status, m.sort_order,
         (select count(*) from public.tournament_entries e where e.module_id = m.id and e.status = 'active'),
         (select e.name from public.tournament_entries e where e.id = m.champion_entry_id)
  from public.tournament_modules m
  where m.tournament_id = p_tournament
  order by m.sort_order, m.created_at;
end;
$$;

create or replace function public.admin_list_tournament_admins(p_tournament uuid)
returns table (profile_id uuid, username text, avatar_url text, added_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  return query
  select a.profile_id, p.username, p.avatar_url, a.added_at
  from public.tournament_admins a
  join public.profiles p on p.id = a.profile_id
  where a.tournament_id = p_tournament
  order by a.added_at;
end;
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────

create or replace function public.admin_create_tournament(p_set jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.tournaments;
  v_id uuid;
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  v := public._admin_apply_tournament_patch(null::public.tournaments, p_set);
  if v.name is null then
    raise exception 'FIELD_INVALID:name';
  end if;

  insert into public.tournaments (name, description, organization, location, image_url, starts_at, ends_at,
                                  status, created_by)
  values (v.name, v.description, v.organization, v.location, v.image_url, v.starts_at, v.ends_at,
          'draft', auth.uid())
  returning id into v_id;

  perform public.log_admin_action(
    'CREATE_TOURNAMENT', 'tournaments', v_id, null, jsonb_build_object('name', v.name), p_note
  );
  return v_id;
end;
$$;

create or replace function public.admin_update_tournament(p_tournament uuid, p_set jsonb, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.tournaments;
  v_new public.tournaments;
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  select * into v_old from public.tournaments where id = p_tournament;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  v_new := public._admin_apply_tournament_patch(v_old, p_set);

  update public.tournaments
     set name = v_new.name, description = v_new.description, organization = v_new.organization,
         location = v_new.location, image_url = v_new.image_url, starts_at = v_new.starts_at,
         ends_at = v_new.ends_at
   where id = p_tournament;

  perform public.log_admin_action(
    'UPDATE_TOURNAMENT', 'tournaments', p_tournament, to_jsonb(v_old), to_jsonb(v_new), p_note
  );
end;
$$;

create or replace function public.admin_set_tournament_status(p_tournament uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  if p_status is null or p_status not in ('draft', 'published', 'completed', 'cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  select status into v_old from public.tournaments where id = p_tournament;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  update public.tournaments set status = p_status where id = p_tournament;

  perform public.log_admin_action(
    'SET_TOURNAMENT_STATUS', 'tournaments', p_tournament,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status), p_note
  );
end;
$$;

create or replace function public.admin_add_tournament_admin(p_tournament uuid, p_profile uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  if not exists (select 1 from public.tournaments where id = p_tournament) then
    raise exception 'NOT_FOUND';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile and deleted_at is null) then
    raise exception 'NOT_FOUND';
  end if;

  insert into public.tournament_admins (tournament_id, profile_id)
  values (p_tournament, p_profile)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    perform public.log_admin_action(
      'ADD_TOURNAMENT_ADMIN', 'tournaments', p_tournament, null,
      jsonb_build_object('profile_id', p_profile), p_note
    );
  end if;
end;
$$;

create or replace function public.admin_remove_tournament_admin(p_tournament uuid, p_profile uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  delete from public.tournament_admins where tournament_id = p_tournament and profile_id = p_profile;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  perform public.log_admin_action(
    'REMOVE_TOURNAMENT_ADMIN', 'tournaments', p_tournament,
    jsonb_build_object('profile_id', p_profile), null, p_note
  );
end;
$$;

-- Super admin: put a completed module back to in_progress so admins can fix a result in the app.
create or replace function public.admin_reopen_module(p_module uuid, p_clear_results boolean default false, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_tstatus text;
begin
  perform public.assert_platform_role(array['super_admin']);
  select * into v_m from public.tournament_modules where id = p_module;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_m.status <> 'completed' then
    raise exception 'NOT_COMPLETED';
  end if;
  select status into v_tstatus from public.tournaments where id = v_m.tournament_id;
  if v_tstatus in ('completed', 'cancelled') then
    raise exception 'TOURNAMENT_FINISHED';
  end if;

  update public.tournament_modules set status = 'in_progress' where id = p_module;
  if coalesce(p_clear_results, false) then
    update public.tournament_modules
       set champion_entry_id = null, runner_up_entry_id = null, third_place_entry_id = null
     where id = p_module;
    update public.tournament_entries set final_rank = null where module_id = p_module;
  end if;

  perform public.log_admin_action(
    'REOPEN_MODULE', 'tournament_modules', p_module,
    jsonb_build_object('status', v_m.status, 'champion_entry_id', v_m.champion_entry_id),
    jsonb_build_object('status', 'in_progress', 'cleared_results', coalesce(p_clear_results, false)),
    p_note
  );
end;
$$;

-- Super admin: irreversible. The audit row keeps the deleted tournament's data.
create or replace function public.admin_delete_tournament(p_tournament uuid, p_confirm_name text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.tournaments;
begin
  perform public.assert_platform_role(array['super_admin']);
  select * into v_t from public.tournaments where id = p_tournament;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if p_confirm_name is null or p_confirm_name <> v_t.name then
    raise exception 'CONFIRM_MISMATCH';
  end if;

  -- log first: the row (and its audit trigger output) goes away with the cascade
  perform public.log_admin_action('DELETE_TOURNAMENT', 'tournaments', p_tournament, to_jsonb(v_t), null, p_note);
  delete from public.tournaments where id = p_tournament;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_list_tournaments(text, text, int, int)',
    'admin_get_tournament(uuid)',
    'admin_list_tournament_modules(uuid)',
    'admin_list_tournament_admins(uuid)',
    'admin_create_tournament(jsonb, text)',
    'admin_update_tournament(uuid, jsonb, text)',
    'admin_set_tournament_status(uuid, text, text)',
    'admin_add_tournament_admin(uuid, uuid, text)',
    'admin_remove_tournament_admin(uuid, uuid, text)',
    'admin_reopen_module(uuid, boolean, text)',
    'admin_delete_tournament(uuid, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
