-- 141_admin_organizations.sql
-- Organizations Phase 1, step B3 (docs/organizations/PLAN.md §5.5): platform staff (super admin only)
-- create and suspend organizations, set their admins and settings, attach tournaments and hide them.
-- ADDITIVE ONLY, except admin_create_tournament which gains an optional "organization_id" key in
-- p_set (older admin panel builds never send it).

-- ── Reads ────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_organizations()
returns table (
  id uuid, name text, short_name text, status text, admin_count int, organizer_count int,
  tournament_count int, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  return query
  select o.id, o.name, o.short_name, o.status,
         (select count(*)::int from public.organization_members m
           where m.organization_id = o.id and m.removed_at is null and m.role = 'admin'),
         (select count(*)::int from public.organization_members m
           where m.organization_id = o.id and m.removed_at is null and m.role = 'organizer'),
         (select count(*)::int from public.tournaments t where t.organization_id = o.id),
         o.created_at
  from public.organizations o
  order by lower(o.name);
end;
$$;

create or replace function public.admin_get_organization(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o public.organizations;
begin
  perform public.assert_platform_role(array['super_admin']);
  select * into o from public.organizations where id = p_org;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  return jsonb_build_object(
    'id', o.id, 'name', o.name, 'short_name', o.short_name, 'status', o.status,
    'suspended_at', o.suspended_at, 'suspended_reason', o.suspended_reason,
    'settings', public._org_settings_clean(o.settings, null), 'created_at', o.created_at,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'profile_id', p.id, 'username', p.username, 'avatar_url', p.avatar_url,
               'role', m.role, 'added_at', m.added_at) order by m.role, lower(p.username))
      from public.organization_members m
      join public.public_profiles p on p.id = m.profile_id
      where m.organization_id = o.id and m.removed_at is null), '[]'::jsonb),
    'tournaments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'status', t.status, 'hidden', t.hidden_at is not null)
             order by t.created_at desc)
      from public.tournaments t where t.organization_id = o.id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_get_tournament_organization(p_tournament uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  select jsonb_build_object('organization_id', t.organization_id, 'organization_name', o.name,
                            'hidden', t.hidden_at is not null)
    into v
  from public.tournaments t left join public.organizations o on o.id = t.organization_id
  where t.id = p_tournament;
  if v is null then
    raise exception 'NOT_FOUND';
  end if;
  return v;
end;
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────
create or replace function public.admin_create_organization(
  p_name text, p_short_name text default null, p_settings jsonb default null, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_short text := nullif(btrim(coalesce(p_short_name, '')), '');
begin
  perform public.assert_platform_role(array['super_admin']);
  if char_length(v_name) < 3 or char_length(v_name) > 80 then
    raise exception 'FIELD_INVALID:name';
  end if;
  if char_length(v_short) > 20 then
    raise exception 'FIELD_INVALID:short_name';
  end if;
  begin
    insert into public.organizations (name, short_name, settings, created_by)
    values (v_name, v_short, public._org_settings_clean(null, p_settings), auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'DUPLICATE_ORGANIZATION';
  end;
  perform public.log_admin_action('CREATE_ORGANIZATION', 'organizations', v_id, null,
                                  jsonb_build_object('name', v_name), p_note);
  perform public._org_log(v_id, 'created', null, 'Organization created');
  return v_id;
end;
$$;

-- p_set keys: name, short_name, settings (partial). Anything else is ignored.
create or replace function public.admin_update_organization(p_org uuid, p_set jsonb, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.organizations;
  v_new public.organizations;
begin
  perform public.assert_platform_role(array['super_admin']);
  select * into v_old from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if p_set is null or jsonb_typeof(p_set) <> 'object' then
    raise exception 'FIELD_INVALID:settings';
  end if;
  v_new := v_old;
  if p_set ? 'name' then
    v_new.name := btrim(coalesce(p_set ->> 'name', ''));
    if char_length(v_new.name) < 3 or char_length(v_new.name) > 80 then
      raise exception 'FIELD_INVALID:name';
    end if;
  end if;
  if p_set ? 'short_name' then
    v_new.short_name := nullif(btrim(coalesce(p_set ->> 'short_name', '')), '');
    if char_length(v_new.short_name) > 20 then
      raise exception 'FIELD_INVALID:short_name';
    end if;
  end if;
  if p_set ? 'settings' then
    v_new.settings := public._org_settings_clean(v_old.settings, p_set -> 'settings');
  end if;
  begin
    update public.organizations
       set name = v_new.name, short_name = v_new.short_name, settings = v_new.settings
     where id = p_org;
  exception when unique_violation then
    raise exception 'DUPLICATE_ORGANIZATION';
  end;
  -- keep the label older app builds show on tournament cards in step with a rename
  if v_new.name is distinct from v_old.name then
    update public.tournaments set organization = left(v_new.name, 80)
     where organization_id = p_org and organization is not distinct from v_old.name;
  end if;
  perform public.log_admin_action('UPDATE_ORGANIZATION', 'organizations', p_org,
                                  to_jsonb(v_old), to_jsonb(v_new), p_note);
end;
$$;

create or replace function public.admin_set_organization_status(
  p_org uuid, p_status text, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.assert_platform_role(array['super_admin']);
  if p_status is null or p_status not in ('active', 'suspended') then
    raise exception 'INVALID_STATUS';
  end if;
  if char_length(v_reason) > 200 then
    raise exception 'FIELD_INVALID:reason';
  end if;
  select status into v_old from public.organizations where id = p_org for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  update public.organizations
     set status = p_status,
         suspended_at = case when p_status = 'suspended' then now() end,
         suspended_reason = case when p_status = 'suspended' then v_reason end
   where id = p_org;
  perform public.log_admin_action('SET_ORGANIZATION_STATUS', 'organizations', p_org,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status), v_reason);
  perform public._org_log(p_org, p_status, null,
    case when p_status = 'suspended' then 'Organization paused by Sportron' else 'Organization reactivated by Sportron' end);
end;
$$;

-- Adds a member, or changes the role of an existing one.
create or replace function public.admin_add_org_member(
  p_org uuid, p_profile uuid, p_role text, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_username text;
begin
  perform public.assert_platform_role(array['super_admin']);
  if p_role is null or p_role not in ('admin', 'organizer') then
    raise exception 'INVALID_ROLE';
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'NOT_FOUND';
  end if;
  select p.username into v_username from public.public_profiles p
   where p.id = p_profile and p.deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  select role into v_old from public.organization_members
   where organization_id = p_org and profile_id = p_profile and removed_at is null;
  if v_old = p_role then
    return;
  end if;
  if v_old is null then
    insert into public.organization_members (organization_id, profile_id, role, added_by)
    values (p_org, p_profile, p_role, auth.uid());
  else
    update public.organization_members set role = p_role
     where organization_id = p_org and profile_id = p_profile and removed_at is null;
  end if;
  perform public.log_admin_action('ADD_ORG_MEMBER', 'organizations', p_org,
    jsonb_build_object('profile', p_profile, 'role', v_old),
    jsonb_build_object('profile', p_profile, 'role', p_role), p_note);
  perform public._org_log(p_org, 'member_added', null,
    'Sportron made @' || coalesce(v_username, '?') || ' ' ||
    case when p_role = 'admin' then 'an organization admin' else 'an organizer' end);
end;
$$;

-- Returns how many admins remain, so the panel can warn when it reaches zero.
create or replace function public.admin_remove_org_member(p_org uuid, p_profile uuid, p_note text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin']);
  if not public._org_remove_member(p_org, p_profile) then
    raise exception 'NOT_FOUND';
  end if;
  perform public.log_admin_action('REMOVE_ORG_MEMBER', 'organizations', p_org,
    jsonb_build_object('profile', p_profile), null, p_note);
  perform public._org_log(p_org, 'member_removed', null, 'Sportron removed @' ||
    coalesce((select username from public.public_profiles where id = p_profile), '?'));
  return (select count(*)::int from public.organization_members
           where organization_id = p_org and removed_at is null and role = 'admin');
end;
$$;

create or replace function public.admin_set_tournament_organization(
  p_tournament uuid, p_org uuid, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.tournaments;
  v_name text;
begin
  perform public.assert_platform_role(array['super_admin']);
  select * into v_t from public.tournaments where id = p_tournament for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if p_org is not null then
    select name into v_name from public.organizations where id = p_org;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
  end if;
  update public.tournaments
     set organization_id = p_org,
         organization = case when p_org is not null then coalesce(organization, left(v_name, 80)) else organization end
   where id = p_tournament;
  perform public.log_admin_action('SET_TOURNAMENT_ORGANIZATION', 'tournaments', p_tournament,
    jsonb_build_object('organization_id', v_t.organization_id),
    jsonb_build_object('organization_id', p_org), p_note);
  perform public._org_log(p_org, 'tournament_attached', p_tournament, 'Sportron added "' || v_t.name || '"');
  if v_t.organization_id is distinct from p_org then
    perform public._org_log(v_t.organization_id, 'tournament_detached', p_tournament,
                            'Sportron moved out "' || v_t.name || '"');
  end if;
end;
$$;

create or replace function public.admin_set_tournament_hidden(
  p_tournament uuid, p_hidden boolean, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin']);
  if p_hidden is null then
    raise exception 'FIELD_INVALID:hidden';
  end if;
  update public.tournaments
     set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end,
         hidden_by = case when p_hidden then coalesce(hidden_by, auth.uid()) end
   where id = p_tournament;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  perform public.log_admin_action(case when p_hidden then 'HIDE_TOURNAMENT' else 'UNHIDE_TOURNAMENT' end,
    'tournaments', p_tournament, null, jsonb_build_object('hidden', p_hidden), p_note);
end;
$$;

-- admin_create_tournament (124): optional p_set.organization_id (super admin only).
create or replace function public.admin_create_tournament(p_set jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.tournaments;
  v_id uuid;
  v_org uuid;
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  v := public._admin_apply_tournament_patch(null::public.tournaments, p_set);
  if v.name is null then
    raise exception 'FIELD_INVALID:name';
  end if;
  begin
    v_org := nullif(p_set ->> 'organization_id', '')::uuid;
  exception when others then
    raise exception 'FIELD_INVALID:organization_id';
  end;
  if v_org is not null then
    perform public.assert_platform_role(array['super_admin']);
    if not exists (select 1 from public.organizations where id = v_org) then
      raise exception 'NOT_FOUND';
    end if;
  end if;

  insert into public.tournaments (name, description, organization, location, image_url, starts_at, ends_at,
                                  status, created_by, organization_id)
  values (v.name, v.description,
          coalesce(v.organization, (select left(name, 80) from public.organizations where id = v_org)),
          v.location, v.image_url, v.starts_at, v.ends_at, 'draft', auth.uid(), v_org)
  returning id into v_id;

  perform public.log_admin_action(
    'CREATE_TOURNAMENT', 'tournaments', v_id, null,
    jsonb_build_object('name', v.name, 'organization_id', v_org), p_note
  );
  perform public._org_log(v_org, 'tournament_created', v_id, 'Sportron created "' || v.name || '"');
  return v_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_list_organizations()',
    'admin_get_organization(uuid)',
    'admin_get_tournament_organization(uuid)',
    'admin_create_organization(text, text, jsonb, text)',
    'admin_update_organization(uuid, jsonb, text)',
    'admin_set_organization_status(uuid, text, text)',
    'admin_add_org_member(uuid, uuid, text, text)',
    'admin_remove_org_member(uuid, uuid, text)',
    'admin_set_tournament_organization(uuid, uuid, text)',
    'admin_set_tournament_hidden(uuid, boolean, text)',
    'admin_create_tournament(jsonb, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
