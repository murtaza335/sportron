-- 140_organization_permissions.sql
-- Organizations Phase 1, step B2 (docs/organizations/PLAN.md §5.1, §5.2, §8): organization rights are
-- added INSIDE the permission helpers, so every existing tournament function picks them up.
--  * an organization's admins hold tournament-admin powers over its tournaments (computed, no rows)
--  * hidden tournaments are invisible to players, guests and public screens
--  * a suspended organization's tournaments are read-only (platform staff can still act)
-- Tournaments without an organization behave exactly as before. Function signatures are unchanged.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Permission helpers
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.is_tournament_admin(p_tournament uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.tournament_admins ta
      where ta.tournament_id = p_tournament and ta.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.tournaments t
      where t.id = p_tournament and t.organization_id is not null
        and public._org_role(t.organization_id, auth.uid()) = 'admin'
    )
  );
$$;

create or replace function public.is_module_admin(p_module uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.tournament_module_admins tma
      where tma.module_id = p_module and tma.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.tournament_modules m
      where m.id = p_module and public.is_tournament_admin(m.tournament_id)
    )
  );
$$;

create or replace function public.can_view_tournament(p_tournament uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.tournaments t
    where t.id = p_tournament
      and (
        (t.status <> 'draft' and t.hidden_at is null)
        or public.is_tournament_admin(t.id)
        or exists (
          select 1
          from public.tournament_modules m
          join public.tournament_module_admins tma on tma.module_id = m.id
          where m.tournament_id = t.id and tma.profile_id = auth.uid()
        )
        or exists (
          select 1
          from public.tournament_modules m
          join public.tournament_module_scorers s on s.module_id = m.id
          where m.tournament_id = t.id and s.profile_id = auth.uid()
        )
      )
  );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Public (signed-out) screens never show hidden tournaments
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_live_board(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t public.tournaments;
begin
  -- Projector read: anon allowed. Guard = published AND live_public AND not hidden.
  select * into v_t from public.tournaments where lower(live_code) = lower(btrim(coalesce(p_code, '')));
  if not found or v_t.status <> 'published' or not v_t.live_public or v_t.hidden_at is not null then
    return jsonb_build_object('active', false, 'server_now', now());
  end if;
  return public._live_board(v_t.id, true);
end;
$$;

create or replace function public._live_topic_readable(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t public.tournaments;
begin
  if p_topic is null or p_topic !~ '^live:' then
    return false;
  end if;
  select * into v_t from public.tournaments where lower(live_code) = lower(substr(p_topic, 6));
  if not found then
    return false;
  end if;
  return (v_t.status = 'published' and v_t.live_public and v_t.hidden_at is null)
      or (auth.uid() is not null and public.can_view_tournament(v_t.id));
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Reads that looked at the role tables directly (patched from their live definitions)
-- ───────────────────────────────────────────────────────────────────────────
do $do$
declare
  v_fn regprocedure;
  v_def text;
  v_new text;
  v_step text;
begin
  -- get_tournaments (the usage-analytics inner copy when migration 136 is applied)
  v_fn := coalesce(to_regprocedure('public._usage_inner_get_tournaments(text)'),
                   to_regprocedure('public.get_tournaments(text)'));
  v_def := pg_get_functiondef(v_fn);
  if position('is_module_scorer' in v_def) = 0 and position('tournament_module_scorers' in v_def) = 0 then
    v_new := regexp_replace(v_def,
      'when exists \(select 1 from public\.tournament_admins ta\s+where ta\.tournament_id = t\.id and ta\.profile_id = v_uid\) then ''tournament_admin''',
      'when public.is_tournament_admin(t.id) then ''tournament_admin''');
    if v_new = v_def then raise exception 'org patch: admin branch not found in get_tournaments'; end if;
    v_step := v_new;
    v_new := replace(v_new, 'then ''module_admin''',
      'then ''module_admin'' when exists (select 1 from public.tournament_module_scorers s join public.tournament_modules m on m.id = s.module_id where m.tournament_id = t.id and s.profile_id = v_uid) then ''scorer''');
    if v_new = v_step then raise exception 'org patch: module_admin branch not found in get_tournaments'; end if;
    v_step := v_new;
    v_new := replace(v_new, 'public.is_module_admin(m.id))', 'public.can_score_module(m.id))');
    if v_new = v_step then raise exception 'org patch: draft filter not found in get_tournaments'; end if;
    execute v_new;
  end if;

  -- get_tournament_detail
  v_fn := coalesce(to_regprocedure('public._get_tournament_detail_v1(uuid)'),
                   to_regprocedure('public._usage_inner_get_tournament_detail(uuid)'),
                   to_regprocedure('public.get_tournament_detail(uuid)'));
  v_def := pg_get_functiondef(v_fn);
  if position('my_org_role' in v_def) = 0 then
    -- tournament role: scorer after module admin (first occurrence only)
    v_new := regexp_replace(v_def,
      '(where m\.tournament_id = p_tournament and tma\.profile_id = v_uid\) then ''module_admin'')',
      '\1 when exists (select 1 from public.tournament_module_scorers s join public.tournament_modules m on m.id = s.module_id where m.tournament_id = p_tournament and s.profile_id = v_uid) then ''scorer''');
    if v_new = v_def then raise exception 'org patch: tournament role not found in detail'; end if;
    v_step := v_new;
    v_new := replace(v_new, 'when public.is_module_admin(m.id) then ''module_admin''',
      'when public.is_module_admin(m.id) then ''module_admin'' when public.is_module_scorer(m.id) then ''scorer''');
    if v_new = v_step then raise exception 'org patch: module role not found in detail'; end if;
    v_step := v_new;
    v_new := replace(v_new, 'public.is_module_admin(m.id))', 'public.can_score_module(m.id))');
    if v_new = v_step then raise exception 'org patch: draft filter not found in detail'; end if;
    v_step := v_new;
    v_new := replace(v_new, '''created_at'', v_t.created_at, ''updated_at'', v_t.updated_at),',
      '''created_at'', v_t.created_at, ''updated_at'', v_t.updated_at, ''organization_id'', v_t.organization_id, ''organization_name'', (select o.name from public.organizations o where o.id = v_t.organization_id), ''organization_suspended'', coalesce((select o.status = ''suspended'' from public.organizations o where o.id = v_t.organization_id), false), ''hidden'', v_t.hidden_at is not null), ''my_org_role'', public._org_role(v_t.organization_id, v_uid),');
    if v_new = v_step then raise exception 'org patch: tournament keys not found in detail'; end if;
    execute v_new;
  end if;

  -- people search: organization members may search (to appoint co-organizers, managers, scorers)
  v_fn := to_regprocedure('public.search_profiles_for_tournament(text)');
  v_def := pg_get_functiondef(v_fn);
  if position('organization_members' in v_def) = 0 then
    v_new := replace(v_def,
      'or exists (select 1 from public.tournament_module_admins tma where tma.profile_id = v_uid)) then',
      'or exists (select 1 from public.tournament_module_admins tma where tma.profile_id = v_uid) or exists (select 1 from public.organization_members om where om.profile_id = v_uid and public._org_role(om.organization_id, v_uid) is not null)) then');
    if v_new = v_def then raise exception 'org patch: gate not found in search_profiles_for_tournament'; end if;
    execute v_new;
  end if;

  -- creating your own tournament must not notify you
  v_fn := to_regprocedure('public.trg_tournament_admin_assigned()');
  v_def := pg_get_functiondef(v_fn);
  if position('NEW.profile_id = auth.uid()' in v_def) = 0 then
    v_new := regexp_replace(v_def, '\mbegin\M', 'begin if NEW.profile_id = auth.uid() then return NEW; end if;', 'i');
    if v_new = v_def then raise exception 'org patch: admin assigned trigger'; end if;
    execute v_new;
  end if;

  -- no player notifications about a hidden tournament
  v_fn := to_regprocedure('public._tournament_notify(uuid, text, text, text, jsonb)');
  v_def := pg_get_functiondef(v_fn);
  if position('hidden_at' in v_def) = 0 then
    v_new := regexp_replace(v_def, '\mbegin\M',
      'begin if p_type not like ''%assigned'' and exists (select 1 from public.tournaments t where t.id::text = p_data ->> ''tournamentId'' and t.hidden_at is not null) then return; end if;', 'i');
    if v_new = v_def then raise exception 'org patch: notify helper'; end if;
    execute v_new;
  end if;
end
$do$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Removing a member (used by the org admin and platform staff functions)
-- ───────────────────────────────────────────────────────────────────────────
-- Access ends at once: the membership closes, their tournament-admin rows on this organization's
-- tournaments go, and any live match they could only score through those rights is released.
-- Tournaments stay with the organization. Sport manager / scorer assignments are separate and stay.
create or replace function public._org_remove_member(p_org uuid, p_profile uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.organization_members
     set removed_at = now(), removed_by = auth.uid()
   where organization_id = p_org and profile_id = p_profile and removed_at is null;
  if not found then
    return false;
  end if;

  update public.tournament_live_scores ls
     set scorer_id = null
   where ls.scorer_id = p_profile and ls.state in ('live', 'break')
     and ls.tournament_id in (select t.id from public.tournaments t where t.organization_id = p_org)
     and not exists (select 1 from public.tournament_module_admins a
                      where a.module_id = ls.module_id and a.profile_id = p_profile)
     and not exists (select 1 from public.tournament_module_scorers s
                      where s.module_id = ls.module_id and s.profile_id = p_profile);

  delete from public.tournament_admins ta
   using public.tournaments t
   where t.id = ta.tournament_id and t.organization_id = p_org and ta.profile_id = p_profile;
  return true;
end;
$$;
revoke all on function public._org_remove_member(uuid, uuid) from public, anon, authenticated;

-- Scorer removal: an organization admin keeps their claim too (they still manage the sport).
create or replace function public.remove_module_scorer(p_module uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.tournaments;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select t.* into v_t from public.tournaments t
    join public.tournament_modules m on m.tournament_id = t.id where m.id = p_module;
  delete from public.tournament_module_scorers
  where module_id = p_module and profile_id = p_profile;

  if not exists (select 1 from public.tournament_module_admins a
                  where a.module_id = p_module and a.profile_id = p_profile)
     and not exists (select 1 from public.tournament_admins ta
                      where ta.tournament_id = v_t.id and ta.profile_id = p_profile)
     and public._org_role(v_t.organization_id, p_profile) is distinct from 'admin' then
    update public.tournament_live_scores
       set scorer_id = null
     where module_id = p_module and scorer_id = p_profile and state in ('live', 'break');
  end if;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Suspension: one guard on every tournament table, so no write path can be missed
-- ───────────────────────────────────────────────────────────────────────────
-- Applies to signed-in users who are not platform staff. Cron jobs / service role (auth.uid() null)
-- and the admin panel keep working.
create or replace function public._guard_org_suspended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(NEW) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(OLD) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_t uuid;
  v_orgs uuid[];
begin
  if auth.uid() is null or public.platform_role(auth.uid()) is not null then
    return coalesce(NEW, OLD);
  end if;

  if tg_argv[0] = 'self' then
    v_orgs := array[(v_new ->> 'organization_id')::uuid, (v_old ->> 'organization_id')::uuid];
  else
    case tg_argv[0]
      when 'tournament' then
        v_t := (v_row ->> 'tournament_id')::uuid;
      when 'module' then
        select m.tournament_id into v_t from public.tournament_modules m
         where m.id = (v_row ->> 'module_id')::uuid;
      when 'entry' then
        select e.tournament_id into v_t from public.tournament_entries e
         where e.id = (v_row ->> 'entry_id')::uuid;
    end case;
    v_orgs := array(select t.organization_id from public.tournaments t where t.id = v_t);
  end if;

  if exists (select 1 from public.organizations o where o.id = any (v_orgs) and o.status = 'suspended') then
    raise exception 'ORG_SUSPENDED';
  end if;
  return coalesce(NEW, OLD);
end;
$$;
revoke all on function public._guard_org_suspended() from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('tournaments', 'self'),
      ('tournament_modules', 'tournament'),
      ('tournament_entries', 'tournament'),
      ('tournament_entry_fields', 'tournament'),
      ('tournament_admins', 'tournament'),
      ('tournament_promos', 'tournament'),
      ('tournament_live_scores', 'tournament'),
      ('tournament_module_admins', 'module'),
      ('tournament_module_scorers', 'module'),
      ('tournament_rounds', 'module'),
      ('tournament_matches', 'module'),
      ('tournament_groups', 'module'),
      ('tournament_entry_members', 'entry'),
      ('tournament_group_entries', 'module')
    ) as x(tbl, kind)
  loop
    execute format('drop trigger if exists trg_org_suspended on public.%I', r.tbl);
    execute format(
      'create trigger trg_org_suspended before insert or update or delete on public.%I '
      'for each row execute function public._guard_org_suspended(%L)', r.tbl, r.kind);
  end loop;
end $$;
