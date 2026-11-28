-- 143_organizer_tournament_lifecycle.sql
-- Organizations Phase 1, step C1 (docs/organizations/PLAN.md §5.5 "Tournament lifecycle"):
-- organizers create, publish, cancel and delete-draft; co-organizers; hide; reopen a sport.
-- Every rule here applies to ORGANIZATION tournaments only; Sportron-run tournaments are unchanged.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Rules that must hold whichever function writes the row
-- ───────────────────────────────────────────────────────────────────────────
-- For organization tournaments, signed-in non-staff:
--   * cannot move a tournament back to draft (otherwise "delete drafts only" could be bypassed
--     by unpublishing first, through update_tournament)
--   * cannot change the organization it belongs to, nor the organization label shown on cards
create or replace function public._guard_org_tournament()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.platform_role(auth.uid()) is not null or old.organization_id is null then
    return new;
  end if;
  if new.status = 'draft' and old.status <> 'draft' then
    raise exception 'INVALID_STATUS';
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'NOT_ALLOWED';
  end if;
  new.organization := old.organization;
  return new;
end;
$$;
revoke all on function public._guard_org_tournament() from public, anon, authenticated;
drop trigger if exists trg_guard_org_tournament on public.tournaments;
create trigger trg_guard_org_tournament
  before update on public.tournaments
  for each row execute function public._guard_org_tournament();

-- A new round of an organization tournament starts with the sport's saved best-of (the column
-- default is 1, which would otherwise override "best of 3" in the live rules).
create or replace function public._org_round_best_of()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_best text;
begin
  if new.best_of <> 1 then
    return new;
  end if;
  select m.live_rules ->> 'bestOf' into v_best
    from public.tournament_modules m
    join public.tournaments t on t.id = m.tournament_id
   where m.id = new.module_id and t.organization_id is not null;
  if v_best in ('3', '5', '7') then
    new.best_of := v_best::int;
  end if;
  return new;
end;
$$;
revoke all on function public._org_round_best_of() from public, anon, authenticated;
drop trigger if exists trg_org_round_best_of on public.tournament_rounds;
create trigger trg_org_round_best_of
  before insert on public.tournament_rounds
  for each row execute function public._org_round_best_of();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Create
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.org_create_tournament(p_org uuid, p_set jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.tournaments;
  v_id uuid;
  v_org_name text;
begin
  perform public._assert_org_role(p_org);
  v := public._admin_apply_tournament_patch(null::public.tournaments, p_set);
  if v.name is null then
    raise exception 'FIELD_INVALID:name';
  end if;
  select name into v_org_name from public.organizations where id = p_org;

  insert into public.tournaments (name, description, organization, location, image_url, starts_at, ends_at,
                                  status, created_by, organization_id)
  values (v.name, v.description, left(v_org_name, 80), v.location, v.image_url, v.starts_at, v.ends_at,
          'draft', auth.uid(), p_org)
  returning id into v_id;

  insert into public.tournament_admins (tournament_id, profile_id) values (v_id, auth.uid());
  return v_id;
end;
$$;

-- The wizard's sports, all or nothing. Each item:
--   { name, sport, custom_sport_name?, sport_key?, venue?, third_place?,
--     settings?: update_tournament_module_settings keys, live_rules?: full rules object }
create or replace function public.org_create_tournament_modules(p_tournament uuid, p_modules jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if auth.uid() is null or not public.is_tournament_admin(p_tournament)
     or not exists (select 1 from public.tournaments t
                     where t.id = p_tournament and t.organization_id is not null) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_modules is null or jsonb_typeof(p_modules) <> 'array'
     or jsonb_array_length(p_modules) not between 1 and 20 then
    raise exception 'FIELD_INVALID:modules';
  end if;
  for v_item in select * from jsonb_array_elements(p_modules) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'FIELD_INVALID:modules';
    end if;
    v_id := public.create_tournament_module(
      p_tournament, v_item ->> 'name', v_item ->> 'sport', null, null, v_item ->> 'venue', null, null,
      coalesce((v_item ->> 'third_place')::boolean, false), 'manual',
      v_item ->> 'custom_sport_name', v_item ->> 'sport_key');
    if jsonb_typeof(v_item -> 'settings') = 'object' and v_item -> 'settings' <> '{}'::jsonb then
      perform public.update_tournament_module_settings(v_id, v_item -> 'settings');
    end if;
    if jsonb_typeof(v_item -> 'live_rules') = 'object' then
      perform public.set_module_live_rules(v_id, v_item -> 'live_rules');
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Publish / cancel / delete draft / hide
-- ───────────────────────────────────────────────────────────────────────────
-- problems block publishing; warnings are shown in the confirm sheet.
create or replace function public.get_publish_check(p_tournament uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  v_problems text[] := '{}';
  v_warnings text[];
begin
  if auth.uid() is null or not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into t from public.tournaments where id = p_tournament;
  if t.status <> 'draft' then
    raise exception 'INVALID_STATUS';
  end if;
  if t.starts_at is null then
    v_problems := v_problems || 'Set a start date.'::text;
  end if;
  if not exists (select 1 from public.tournament_modules m
                  where m.tournament_id = p_tournament and m.status <> 'cancelled') then
    v_problems := v_problems || 'Add at least one sport.'::text;
  end if;
  select coalesce(array_agg(m.name || ' has no players yet.' order by m.sort_order), '{}') into v_warnings
    from public.tournament_modules m
   where m.tournament_id = p_tournament and m.status <> 'cancelled'
     and not exists (select 1 from public.tournament_entries e where e.module_id = m.id and e.status = 'active');
  return jsonb_build_object('problems', to_jsonb(v_problems), 'warnings', to_jsonb(v_warnings));
end;
$$;

-- Publishing also opens the draft sports, so players can see them.
create or replace function public.publish_tournament(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check jsonb;
  v_m uuid;
begin
  if not exists (select 1 from public.tournaments t where t.id = p_tournament and t.organization_id is not null) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_check := public.get_publish_check(p_tournament);      -- permission + draft status
  if jsonb_array_length(v_check -> 'problems') > 0 then
    raise exception 'NOT_READY';
  end if;
  update public.tournaments set status = 'published' where id = p_tournament and status = 'draft';
  for v_m in select id from public.tournament_modules where tournament_id = p_tournament and status = 'draft' loop
    perform public.set_module_status(v_m, 'open');
  end loop;
end;
$$;

create or replace function public.cancel_tournament(p_tournament uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if not found or auth.uid() is null or not public.is_tournament_admin(p_tournament)
     or t.organization_id is null then
    raise exception 'NOT_ALLOWED';
  end if;
  if t.status <> 'published' then
    raise exception 'INVALID_STATUS';
  end if;
  if char_length(v_reason) > 200 then
    raise exception 'FIELD_INVALID:reason';
  end if;
  update public.tournament_live_scores
     set state = 'abandoned', updated_at = clock_timestamp(), seq = seq + 1
   where tournament_id = p_tournament and state in ('live', 'break');
  update public.tournaments set status = 'cancelled' where id = p_tournament;
  if v_reason is not null then
    perform public._org_log(t.organization_id, 'cancel_reason', p_tournament,
                            'gave the reason: ' || v_reason);
  end if;
end;
$$;

create or replace function public.delete_draft_tournament(p_tournament uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if not found or auth.uid() is null or not public.is_tournament_admin(p_tournament)
     or t.organization_id is null then
    raise exception 'NOT_ALLOWED';
  end if;
  if t.status <> 'draft' then
    raise exception 'NOT_ALLOWED';
  end if;
  if btrim(coalesce(p_confirm_name, '')) <> btrim(t.name) then
    raise exception 'CONFIRM_MISMATCH';
  end if;
  delete from public.tournaments where id = p_tournament;
end;
$$;

create or replace function public.set_tournament_hidden(p_tournament uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.tournaments where id = p_tournament;
  if v_org is null or auth.uid() is null or not public.is_org_admin(v_org) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_hidden is null then
    raise exception 'FIELD_INVALID:hidden';
  end if;
  update public.tournaments
     set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end,
         hidden_by = case when p_hidden then coalesce(hidden_by, auth.uid()) end
   where id = p_tournament;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Co-organizers
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.add_tournament_admin(p_tournament uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.tournaments where id = p_tournament;
  if v_org is null or auth.uid() is null or not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(p_tournament);
  if public._org_role(v_org, p_profile) is null then
    raise exception 'NOT_ORG_MEMBER';
  end if;
  insert into public.tournament_admins (tournament_id, profile_id)
  values (p_tournament, p_profile)
  on conflict (tournament_id, profile_id) do nothing;
end;
$$;

create or replace function public.remove_tournament_admin(p_tournament uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.tournaments where id = p_tournament for update;
  if v_org is null or auth.uid() is null or not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  -- never leave a tournament with nobody to run it
  if not exists (select 1 from public.tournament_admins
                  where tournament_id = p_tournament and profile_id <> p_profile)
     and not exists (select 1 from public.organization_members m
                      where m.organization_id = v_org and m.role = 'admin' and m.removed_at is null) then
    raise exception 'LAST_ADMIN';
  end if;
  delete from public.tournament_admins where tournament_id = p_tournament and profile_id = p_profile;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Reopen a finished sport (same engine as the admin panel's)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._reopen_module_core(p_module uuid, p_clear_results boolean)
returns public.tournament_modules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_tstatus text;
begin
  select * into v_m from public.tournament_modules where id = p_module for update;
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
  return v_m;                                             -- the row as it was before
end;
$$;
revoke all on function public._reopen_module_core(uuid, boolean) from public, anon, authenticated;

create or replace function public.admin_reopen_module(p_module uuid, p_clear_results boolean default false, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.tournament_modules;
begin
  perform public.assert_platform_role(array['super_admin']);
  v_old := public._reopen_module_core(p_module, p_clear_results);
  perform public.log_admin_action(
    'REOPEN_MODULE', 'tournament_modules', p_module,
    jsonb_build_object('status', v_old.status, 'champion_entry_id', v_old.champion_entry_id),
    jsonb_build_object('status', 'in_progress', 'cleared_results', coalesce(p_clear_results, false)),
    p_note
  );
end;
$$;

create or replace function public.reopen_tournament_module(p_module uuid, p_clear_results boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.tournament_modules;
  v_t public.tournaments;
begin
  select t.* into v_t from public.tournaments t
    join public.tournament_modules m on m.tournament_id = t.id where m.id = p_module;
  if v_t.organization_id is null or auth.uid() is null or not public.is_tournament_admin(v_t.id) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_old := public._reopen_module_core(p_module, p_clear_results);
  perform public._org_log(v_t.organization_id, 'sport_reopened', v_t.id,
                          'reopened “' || v_old.name || '” in “' || v_t.name || '”');
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'org_create_tournament(uuid, jsonb)',
    'org_create_tournament_modules(uuid, jsonb)',
    'get_publish_check(uuid)',
    'publish_tournament(uuid)',
    'cancel_tournament(uuid, text)',
    'delete_draft_tournament(uuid, text)',
    'set_tournament_hidden(uuid, boolean)',
    'add_tournament_admin(uuid, uuid)',
    'remove_tournament_admin(uuid, uuid)',
    'reopen_tournament_module(uuid, boolean)',
    'admin_reopen_module(uuid, boolean, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
