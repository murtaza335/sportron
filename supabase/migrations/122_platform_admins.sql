-- 122_platform_admins.sql
-- Admin panel v1 (docs/admin-panel/PLAN.md §4): platform staff roles + helpers + staff management.
-- ADDITIVE ONLY: one new table and new functions; no existing object changes, so installed app
-- builds are unaffected. A staff role grants NO in-app powers.
--
-- Bootstrap (one-time, after applying):
--   insert into public.platform_admins (profile_id, role)
--   select id, 'super_admin' from public.profiles where username = '<your username>';

create table if not exists public.platform_admins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  role       text not null check (role in ('super_admin', 'tournament_manager')),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz                      -- soft revoke keeps the history
);

alter table public.platform_admins enable row level security;   -- no client policies
revoke all on public.platform_admins from anon, authenticated;

-- ── Internal helpers (service_role / definer functions only) ────────────────

-- Active role of a profile, or null. A soft-deleted profile has no role.
create or replace function public.platform_role(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select pa.role
  from public.platform_admins pa
  join public.profiles p on p.id = pa.profile_id
  where pa.profile_id = p_uid
    and pa.revoked_at is null
    and p.deleted_at is null
$$;

-- First line of every admin_* function. Raises NOT_ALLOWED; returns the caller's role.
create or replace function public.assert_platform_role(p_roles text[])
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'NOT_ALLOWED';
  end if;
  v_role := public.platform_role(auth.uid());
  if v_role is null or not (v_role = any (p_roles)) then
    raise exception 'NOT_ALLOWED';
  end if;
  return v_role;
end;
$$;

-- Writes an audit row flagged as an admin action. log_audit_event is trigger-only for clients (046),
-- but definer functions can call it. record_id must be a uuid (see plan notes).
create or replace function public.log_admin_action(
  p_action text,
  p_table  text,
  p_record uuid,
  p_old    jsonb default null,
  p_new    jsonb default null,
  p_note   text  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_audit_event(
    p_action, p_table, p_record, p_old, p_new,
    jsonb_build_object(
      'admin', true,
      'role', public.platform_role(auth.uid()),
      'note', nullif(btrim(coalesce(p_note, '')), '')
    )
  );
end;
$$;

revoke all on function public.platform_role(uuid) from public, anon, authenticated;
revoke all on function public.assert_platform_role(text[]) from public, anon, authenticated;
revoke all on function public.log_admin_action(text, text, uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.platform_role(uuid) to service_role;
grant execute on function public.assert_platform_role(text[]) to service_role;
grant execute on function public.log_admin_action(text, text, uuid, jsonb, jsonb, text) to service_role;

-- ── Client-callable functions ───────────────────────────────────────────────

-- Called by the site right after login. null = not staff.
create or replace function public.get_my_platform_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_ALLOWED';
  end if;
  return public.platform_role(auth.uid());
end;
$$;

create or replace function public.admin_get_overview()
returns table (
  role text,
  tournaments_draft bigint,
  tournaments_published bigint,
  tournaments_completed bigint,
  tournaments_cancelled bigint,
  maintenance_enabled boolean,
  min_app_version text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := public.assert_platform_role(array['super_admin', 'tournament_manager']);
  return query
  select
    v_role,
    count(*) filter (where t.status = 'draft'),
    count(*) filter (where t.status = 'published'),
    count(*) filter (where t.status = 'completed'),
    count(*) filter (where t.status = 'cancelled'),
    coalesce((select (sc.value->>'enabled')::boolean from public.site_config sc where sc.key = 'maintenance'), false),
    (select sc.value->>'min_version' from public.site_config sc where sc.key = 'min_app_version')
  from public.tournaments t;
end;
$$;

-- User picker. Username ilike (wildcards escaped, >= 2 chars) or exact id; skips deleted profiles.
create or replace function public.admin_search_profiles(p_query text, p_limit int default 10)
returns table (id uuid, username text, avatar_url text, platform_role text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_id uuid;
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 25);
begin
  perform public.assert_platform_role(array['super_admin', 'tournament_manager']);
  if char_length(v_q) < 2 then
    return;
  end if;
  begin
    v_id := v_q::uuid;
  exception when others then
    v_id := null;
  end;
  return query
  select p.id, p.username, p.avatar_url, public.platform_role(p.id)
  from public.profiles p
  where p.deleted_at is null
    and (
      p.id = v_id
      or p.username ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  order by (p.username ilike v_q) desc, p.username
  limit v_limit;
end;
$$;

create or replace function public.admin_list_platform_admins()
returns table (
  profile_id uuid,
  username text,
  avatar_url text,
  role text,
  granted_by uuid,
  granted_by_username text,
  granted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin']);
  return query
  select pa.profile_id, p.username, p.avatar_url, pa.role, pa.granted_by, g.username, pa.granted_at
  from public.platform_admins pa
  join public.profiles p on p.id = pa.profile_id and p.deleted_at is null
  left join public.profiles g on g.id = pa.granted_by
  where pa.revoked_at is null
  order by pa.granted_at;
end;
$$;

create or replace function public.admin_grant_platform_role(p_profile uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.platform_admins;
begin
  perform public.assert_platform_role(array['super_admin']);
  if p_role is null or p_role not in ('super_admin', 'tournament_manager') then
    raise exception 'INVALID_ROLE';
  end if;
  if p_profile = auth.uid() then
    raise exception 'CANNOT_CHANGE_SELF';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile and deleted_at is null) then
    raise exception 'NOT_FOUND';
  end if;

  select * into v_old from public.platform_admins where profile_id = p_profile;

  insert into public.platform_admins (profile_id, role, granted_by, granted_at, revoked_at)
  values (p_profile, p_role, auth.uid(), now(), null)
  on conflict (profile_id) do update
    set role = excluded.role, granted_by = excluded.granted_by,
        granted_at = excluded.granted_at, revoked_at = null;

  perform public.log_admin_action(
    'GRANT_ROLE', 'platform_admins', p_profile,
    case when v_old.profile_id is null then null else to_jsonb(v_old) end,
    jsonb_build_object('profile_id', p_profile, 'role', p_role), null
  );
end;
$$;

create or replace function public.admin_revoke_platform_role(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.platform_admins;
begin
  perform public.assert_platform_role(array['super_admin']);
  if p_profile = auth.uid() then
    raise exception 'CANNOT_CHANGE_SELF';
  end if;
  select * into v_old from public.platform_admins
   where profile_id = p_profile and revoked_at is null;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  update public.platform_admins set revoked_at = now() where profile_id = p_profile;

  perform public.log_admin_action(
    'REVOKE_ROLE', 'platform_admins', p_profile, to_jsonb(v_old), null, null
  );
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'get_my_platform_role()',
    'admin_get_overview()',
    'admin_search_profiles(text, int)',
    'admin_list_platform_admins()',
    'admin_grant_platform_role(uuid, text)',
    'admin_revoke_platform_role(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
