-- 145_organization_screens_brand.sql
-- Organizations Phase 1, step E1 (docs/organizations/PLAN.md §5.5 "Screens" and "Brand"):
--  * a permanent SCREEN LINK per physical screen (/s/<code> on the projector site) that shows
--    whichever of the organization's tournaments is assigned to it
--  * get_screen_board: the second (and only other new) anonymous function
--  * brand lock: the Sportron promo cannot be switched off; discount codes off
-- Existing per-tournament links (get_live_board) are unchanged.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Screens
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.organization_screens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 40),
  venue text check (char_length(venue) <= 120),
  code text not null check (code ~ '^[a-z0-9][a-z0-9-]{2,22}[a-z0-9]$'),
  tournament_id uuid references public.tournaments(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  courts text[],                                    -- null = all courts
  layout text check (layout in ('auto', 'row', 'grid')),   -- null = the tournament's
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists organization_screens_code_unique
  on public.organization_screens (lower(code));
create index if not exists idx_organization_screens_org
  on public.organization_screens (organization_id) where archived_at is null;
alter table public.organization_screens enable row level security;
revoke all on public.organization_screens from anon, authenticated;

drop trigger if exists trg_organization_screens_updated_at on public.organization_screens;
create trigger trg_organization_screens_updated_at
  before update on public.organization_screens
  for each row execute function public.tournament_set_updated_at();
drop trigger if exists trg_audit_organization_screens on public.organization_screens;
create trigger trg_audit_organization_screens
  after insert or update or delete on public.organization_screens
  for each row execute function public.audit_tournament_table();

create or replace function public.org_list_screens(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._assert_org_role(p_org);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'name', s.name, 'venue', s.venue, 'code', s.code,
             'courts', to_jsonb(s.courts), 'layout', s.layout,
             'tournament', case when t.id is null then null else jsonb_build_object(
               'id', t.id, 'name', t.name, 'status', t.status, 'hidden', t.hidden_at is not null,
               'live_public', t.live_public,
               'courts', coalesce((select jsonb_agg(x.court order by x.court) from (
                  select distinct tm.court from public.tournament_matches tm
                  join public.tournament_modules m on m.id = tm.module_id
                  where m.tournament_id = t.id and tm.court is not null) x), '[]'::jsonb),
               'mine', public.is_tournament_admin(t.id)) end,
             'assigned_by', (select p.username from public.public_profiles p where p.id = s.assigned_by),
             'assigned_at', s.assigned_at,
             'base_url', coalesce((select rc.value #>> '{}' from public.remote_config rc
                                    where rc.key = 'live_projector_base_url'),
                                  'https://sportron-live-sigma.vercel.app'))
           order by lower(s.name))
    from public.organization_screens s
    left join public.tournaments t on t.id = s.tournament_id
    where s.organization_id = p_org and s.archived_at is null
  ), '[]'::jsonb);
end;
$$;

-- Create (p_screen null) or edit. p_set: { name, venue, code }. Organization admins only.
create or replace function public.org_upsert_screen(p_org uuid, p_screen uuid, p_set jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.organization_screens;
  v_code text;
begin
  perform public._assert_org_role(p_org, true);
  if p_set is null or jsonb_typeof(p_set) <> 'object' then
    raise exception 'FIELD_INVALID:settings';
  end if;
  if p_screen is not null then
    select * into s from public.organization_screens
     where id = p_screen and organization_id = p_org and archived_at is null for update;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
  end if;
  if p_set ? 'name' then s.name := btrim(coalesce(p_set ->> 'name', '')); end if;
  if s.name is null or char_length(s.name) not between 2 and 40 then
    raise exception 'FIELD_INVALID:name';
  end if;
  if p_set ? 'venue' then s.venue := nullif(btrim(coalesce(p_set ->> 'venue', '')), ''); end if;
  if char_length(s.venue) > 120 then
    raise exception 'FIELD_INVALID:venue';
  end if;
  v_code := lower(nullif(btrim(coalesce(p_set ->> 'code', '')), ''));
  if v_code is not null and v_code !~ '^[a-z0-9][a-z0-9-]{2,22}[a-z0-9]$' then
    raise exception 'FIELD_INVALID:code';
  end if;

  for i in 1..5 loop
    begin
      if p_screen is null then
        insert into public.organization_screens (organization_id, name, venue, code, created_by)
        values (p_org, s.name, s.venue, coalesce(v_code, public._live_gen_code()), auth.uid())
        returning * into s;
        perform public._org_log(p_org, 'screen_created', null, 'added the screen “' || s.name || '”');
      else
        update public.organization_screens
           set name = s.name, venue = s.venue, code = coalesce(v_code, code)
         where id = p_screen returning * into s;
      end if;
      return s.id;
    exception when unique_violation then
      if v_code is not null then
        raise exception 'SCREEN_CODE_TAKEN';
      end if;                                       -- random code clash: try another
    end;
  end loop;
  raise exception 'SCREEN_CODE_TAKEN';
end;
$$;

create or replace function public.org_archive_screen(p_screen uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.organization_screens;
begin
  select * into s from public.organization_screens where id = p_screen and archived_at is null for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  perform public._assert_org_role(s.organization_id, true);
  update public.organization_screens
     set archived_at = now(), tournament_id = null, assigned_by = null, assigned_at = null
   where id = p_screen;
  perform public._org_log(s.organization_id, 'screen_removed', null, 'removed the screen “' || s.name || '”');
end;
$$;

-- Put a tournament on a screen. Admins: any of the organization's; organizers: their own.
-- A screen showing another running tournament asks first (SCREEN_BUSY, details in DETAIL).
create or replace function public.assign_screen(p_screen uuid, p_tournament uuid, p_replace boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.organization_screens;
  t public.tournaments;
  cur public.tournaments;
  v_role text;
begin
  select * into s from public.organization_screens where id = p_screen and archived_at is null for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  v_role := public._assert_org_role(s.organization_id);
  select * into t from public.tournaments where id = p_tournament;
  if not found or t.organization_id is distinct from s.organization_id
     or (v_role <> 'admin' and not public.is_tournament_admin(t.id)) then
    raise exception 'NOT_ALLOWED';
  end if;
  if t.status <> 'published' or t.hidden_at is not null then
    raise exception 'INVALID_STATUS';
  end if;
  if not t.live_public then
    raise exception 'LIVE_NOT_PUBLIC';
  end if;

  if s.tournament_id is not null and s.tournament_id <> t.id and not coalesce(p_replace, false) then
    select * into cur from public.tournaments where id = s.tournament_id;
    if cur.status = 'published' and cur.hidden_at is null then
      raise exception 'SCREEN_BUSY' using detail = jsonb_build_object(
        'tournament', cur.name,
        'assigned_by', (select p.username from public.public_profiles p where p.id = s.assigned_by),
        'assigned_at', s.assigned_at)::text;
    end if;
  end if;

  perform public._ensure_live_code(t.id);
  update public.organization_screens
     set tournament_id = t.id, assigned_by = auth.uid(), assigned_at = now(),
         courts = case when tournament_id = t.id then courts end
   where id = p_screen;
  perform public._org_log(s.organization_id, 'screen_assigned', t.id,
                          'put “' || t.name || '” on “' || s.name || '”');
end;
$$;

-- Who may change what a screen shows: organization admins, or whoever runs the tournament on it.
create or replace function public._assert_screen_control(p_screen uuid)
returns public.organization_screens
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.organization_screens;
  v_role text;
begin
  select * into s from public.organization_screens where id = p_screen and archived_at is null for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  v_role := public._assert_org_role(s.organization_id);
  if v_role <> 'admin' and (s.tournament_id is null or not public.is_tournament_admin(s.tournament_id)) then
    raise exception 'NOT_ALLOWED';
  end if;
  return s;
end;
$$;
revoke all on function public._assert_screen_control(uuid) from public, anon, authenticated;

create or replace function public.unassign_screen(p_screen uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.organization_screens := public._assert_screen_control(p_screen);
begin
  update public.organization_screens
     set tournament_id = null, assigned_by = null, assigned_at = null, courts = null
   where id = p_screen;
  if s.tournament_id is not null then
    perform public._org_log(s.organization_id, 'screen_cleared', s.tournament_id, 'cleared the screen “' || s.name || '”');
  end if;
end;
$$;

-- p_patch: { courts: ["Court 1", …] | null, layout: "auto" | "row" | "grid" | null }
create or replace function public.set_screen_display(p_screen uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.organization_screens := public._assert_screen_control(p_screen);
  v_courts text[] := s.courts;
  v_layout text := s.layout;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'FIELD_INVALID:settings';
  end if;
  if p_patch ? 'courts' then
    if jsonb_typeof(p_patch -> 'courts') = 'null' then
      v_courts := null;
    elsif jsonb_typeof(p_patch -> 'courts') <> 'array' or jsonb_array_length(p_patch -> 'courts') > 20
          or exists (select 1 from jsonb_array_elements(p_patch -> 'courts') c
                      where jsonb_typeof(c) <> 'string' or char_length(btrim(c #>> '{}')) not between 1 and 40) then
      raise exception 'FIELD_INVALID:courts';
    else
      v_courts := nullif(array(select btrim(c) from jsonb_array_elements_text(p_patch -> 'courts') c), '{}');
    end if;
  end if;
  if p_patch ? 'layout' then
    v_layout := p_patch ->> 'layout';
    if v_layout is not null and v_layout not in ('auto', 'row', 'grid') then
      raise exception 'FIELD_INVALID:layout';
    end if;
  end if;
  update public.organization_screens set courts = v_courts, layout = v_layout where id = p_screen;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. The screen's board (anonymous). Scores and names only, via _live_board(…, projector => true).
-- ───────────────────────────────────────────────────────────────────────────
-- Keeps the board's matches on the chosen courts. Matches with no court yet stay in "up next".
create or replace function public._screen_court_filter(p_list jsonb, p_courts text[], p_keep_unset boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(e.item order by e.ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_list, '[]'::jsonb)) with ordinality as e(item, ord)
  join public.tournament_matches tm on tm.id = (e.item ->> 'match_id')::uuid
  where tm.court = any (p_courts) or (p_keep_unset and tm.court is null);
$$;
revoke all on function public._screen_court_filter(jsonb, text[], boolean) from public, anon, authenticated;

create or replace function public.get_screen_board(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.organization_screens;
  o public.organizations;
  t public.tournaments;
  v_board jsonb;
  v_next jsonb;
  v_base jsonb;
  v_showable boolean;
begin
  select * into s from public.organization_screens
   where lower(code) = lower(btrim(coalesce(p_code, ''))) and archived_at is null;
  if not found then
    return jsonb_build_object('found', false, 'waiting', true, 'server_now', now());
  end if;
  select * into o from public.organizations where id = s.organization_id;
  select * into t from public.tournaments where id = s.tournament_id;

  v_base := jsonb_build_object(
    'found', true,
    'screen', jsonb_build_object('name', s.name, 'venue', s.venue, 'courts', to_jsonb(s.courts), 'layout', s.layout),
    'org', jsonb_build_object('name', o.name, 'short_name', o.short_name),
    'server_now', now());

  -- the tournament must still belong to this organization and be publicly viewable
  v_showable := o.status = 'active' and t.id is not null and t.organization_id = o.id
                and t.status = 'published' and t.live_public and t.hidden_at is null;
  if not v_showable then
    return v_base || jsonb_build_object('waiting', true, 'live_code', null, 'board', null);
  end if;

  v_board := public._live_board(t.id, true);
  if s.courts is not null then
    v_board := v_board || jsonb_build_object(
      'live', public._screen_court_filter(v_board -> 'live', s.courts, false),
      'recent', public._screen_court_filter(v_board -> 'recent', s.courts, false),
      'up_next', public._screen_court_filter(v_board -> 'up_next', s.courts, true));
    v_board := jsonb_set(v_board, '{display,courts}', to_jsonb(s.courts));
  end if;
  if s.layout is not null then
    v_board := jsonb_set(v_board, '{display,layout}', to_jsonb(s.layout));
  end if;

  -- not started yet and nothing in play: a waiting page that announces it
  if t.starts_at > now() and jsonb_array_length(coalesce(v_board -> 'live', '[]'::jsonb)) = 0 then
    v_next := jsonb_build_object('name', t.name, 'starts_at', t.starts_at);
  end if;
  return v_base || jsonb_build_object(
    'waiting', v_next is not null, 'next', v_next, 'live_code', t.live_code, 'board', v_board);
end;
$$;

-- Screens listen on screen:<code> (told to re-read when the assignment changes) and live:<code>.
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
  if p_topic ~ '^screen:' then
    return exists (select 1 from public.organization_screens s
                    where lower(s.code) = lower(substr(p_topic, 8)) and s.archived_at is null);
  end if;
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

create or replace function public._screen_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.tournament_id, new.courts, new.layout, new.name, new.archived_at, new.code)
     is distinct from (old.tournament_id, old.courts, old.layout, old.name, old.archived_at, old.code) then
    perform realtime.send(jsonb_build_object('at', now()), 'assigned', 'screen:' || lower(old.code), true);
  end if;
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public._screen_broadcast() from public, anon, authenticated;
drop trigger if exists trg_screen_broadcast on public.organization_screens;
create trigger trg_screen_broadcast
  after update on public.organization_screens
  for each row execute function public._screen_broadcast();

do $$
declare
  f text;
begin
  foreach f in array array[
    'org_list_screens(uuid)',
    'org_upsert_screen(uuid, uuid, jsonb)',
    'org_archive_screen(uuid)',
    'assign_screen(uuid, uuid, boolean)',
    'unassign_screen(uuid)',
    'set_screen_display(uuid, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.get_screen_board(text) from public;
grant execute on function public.get_screen_board(text) to anon, authenticated;
revoke all on function public._live_topic_readable(text) from public;
grant execute on function public._live_topic_readable(text) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Brand lock + discount codes
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._org_brand_locked(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (public._org_settings_clean(o.settings, null) ->> 'brand_locked')::boolean
                     from public.organizations o where o.id = p_org), false);
$$;
create or replace function public._org_promos_allowed(p_tournament uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (public._org_settings_clean(o.settings, null) ->> 'promos_enabled')::boolean
                     from public.tournaments t join public.organizations o on o.id = t.organization_id
                    where t.id = p_tournament), true);          -- no organization: allowed as before
$$;
revoke all on function public._org_brand_locked(uuid) from public, anon, authenticated;
revoke all on function public._org_promos_allowed(uuid) from public, anon, authenticated;

do $do$
declare
  v_def text;
  v_new text;
  -- patch(function, find, replace): fails loudly when the expected text is not there
  r record;
begin
  for r in
    select * from (values
      ('public._live_board(uuid, boolean)',
       'v_disp := public._live_display_resolved(v_t.live_display);',
       'v_disp := public._live_display_resolved(v_t.live_display); if public._org_brand_locked(v_t.organization_id) then v_disp := v_disp || ''{"show_app_promo": true}''::jsonb; end if;'),
      ('public._live_board(uuid, boolean)',
       '''display'', v_disp,',
       '''brand'', jsonb_build_object(''locked'', public._org_brand_locked(v_t.organization_id)), ''display'', v_disp,'),
      ('public.get_tournament_live_settings(uuid)',
       '''live_display'', public._live_display_resolved(v_t.live_display),',
       '''live_display'', public._live_display_resolved(v_t.live_display) || case when public._org_brand_locked(v_t.organization_id) then ''{"show_app_promo": true}''::jsonb else ''{}''::jsonb end, ''promo_locked'', public._org_brand_locked(v_t.organization_id),'),
      ('public.set_tournament_live_display(uuid, jsonb)',
       'v_cleaned := public._live_display_clean(p_tournament, p_patch);',
       'v_cleaned := public._live_display_clean(p_tournament, p_patch); if public._org_brand_locked((select organization_id from public.tournaments where id = p_tournament)) and v_cleaned ? ''show_app_promo'' then v_cleaned := v_cleaned || ''{"show_app_promo": true}''::jsonb; end if;'),
      ('public.upsert_tournament_promo(uuid, uuid, jsonb)',
       'return public._write_tournament_promo(p_tournament, p_promo, p_set);',
       'if not public._org_promos_allowed(p_tournament) then raise exception ''PROMOS_DISABLED''; end if; return public._write_tournament_promo(p_tournament, p_promo, p_set);'),
      ('public.get_tournament_promos_manage(uuid)',
       'return query',
       'if not public._org_promos_allowed(p_tournament) then raise exception ''PROMOS_DISABLED''; end if; return query'),
      ('public.get_tournament_promos(uuid)',
       'if not public.can_view_tournament(p_tournament) then',
       'if not public.can_view_tournament(p_tournament) or not public._org_promos_allowed(p_tournament) then'),
      ('public.reveal_tournament_promo(uuid)',
       'if not found or not public.can_view_tournament(v.tournament_id) then',
       'if not found or not public.can_view_tournament(v.tournament_id) or not public._org_promos_allowed(v.tournament_id) then')
    ) as x(fn, find, repl)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.repl in v_def) > 0 then
      continue;                                            -- already patched
    end if;
    v_new := replace(v_def, r.find, r.repl);
    if v_new = v_def then
      raise exception 'brand patch: expected text not found in %', r.fn;
    end if;
    execute v_new;
  end loop;
end
$do$;
