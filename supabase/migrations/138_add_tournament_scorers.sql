-- 138_add_tournament_scorers.sql
-- Organizations Phase 1, step A1 (docs/organizations/PLAN.md §5.4 / §5.5): the SCORER role.
-- A scorer is assigned per module. They can start, score and finish live matches (and take over a
-- dead phone's match). They cannot enter/edit/reset results, give walkovers, change match rules,
-- manage players or read private entry fields.
--
-- ADDITIVE for installed apps: new table + new functions; record_tournament_result keeps its signature
-- and behaviour (its body moved to an internal core so live_finish_match can use it for scorers).
-- Old builds see no change.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Table + helpers
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.tournament_module_scorers (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.tournament_modules(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  unique (module_id, profile_id)
);
create index if not exists idx_tournament_module_scorers_profile
  on public.tournament_module_scorers (profile_id);

-- No client access at all: reads/writes only through the functions below.
alter table public.tournament_module_scorers enable row level security;
revoke all on public.tournament_module_scorers from anon, authenticated;

drop trigger if exists trg_audit_tournament_module_scorers on public.tournament_module_scorers;
create trigger trg_audit_tournament_module_scorers
  after insert or update or delete on public.tournament_module_scorers
  for each row execute function public.audit_tournament_table();

create or replace function public.is_module_scorer(p_module uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.tournament_module_scorers s
    where s.module_id = p_module and s.profile_id = auth.uid()
  );
$$;

-- "May score live matches of this module": module admins (and above) or an assigned scorer.
create or replace function public.can_score_module(p_module uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_module_admin(p_module) or public.is_module_scorer(p_module);
$$;

revoke all on function public.is_module_scorer(uuid) from public, anon;
revoke all on function public.can_score_module(uuid) from public, anon;
grant execute on function public.is_module_scorer(uuid) to authenticated;
grant execute on function public.can_score_module(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Visibility: scorers can see the tournament/module they score, drafts included (to prepare)
-- ───────────────────────────────────────────────────────────────────────────
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
        t.status <> 'draft'
        or exists (
          select 1 from public.tournament_admins ta
          where ta.tournament_id = t.id and ta.profile_id = auth.uid()
        )
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

create or replace function public.can_view_module(p_module uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.tournament_modules m
    where m.id = p_module
      and public.can_view_tournament(m.tournament_id)
      and (m.status <> 'draft' or public.can_score_module(m.id))
  );
$$;

-- get_module_detail: my_role 'scorer' (patched from the live definition, so later changes to it are kept).
-- Old app builds treat an unknown role like "no role".
do $do$
declare
  v_def text;
  v_new text;
  v_old constant text := 'when public.is_module_admin(p_module) then ''module_admin''';
begin
  v_def := pg_get_functiondef('public.get_module_detail(uuid)'::regprocedure);
  if position('''scorer''' in v_def) > 0 then
    return;   -- already patched
  end if;
  v_new := replace(v_def, v_old, v_old || ' when public.is_module_scorer(p_module) then ''scorer''');
  if v_new = v_def then
    raise exception 'scorer patch: admin role expression not found in get_module_detail';
  end if;
  execute v_new;
end
$do$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Appoint / remove / list scorers (sport manager and above)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.add_module_scorer(p_module uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
begin
  select * into v_m from public.tournament_modules where id = p_module;
  if not found or auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if not exists (select 1 from public.public_profiles p
                 where p.id = p_profile and p.deleted_at is null) then
    raise exception 'NOT_FOUND';
  end if;
  insert into public.tournament_module_scorers (module_id, profile_id, added_by)
  values (p_module, p_profile, auth.uid())
  on conflict (module_id, profile_id) do nothing;
end;
$$;

create or replace function public.remove_module_scorer(p_module uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
begin
  select * into v_m from public.tournament_modules where id = p_module;
  if not found or auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  -- Removal is allowed even on a finished tournament: it only takes access away.
  delete from public.tournament_module_scorers
  where module_id = p_module and profile_id = p_profile;

  -- Release any live match they were scoring (unless they are also a manager), so the next scorer
  -- does not have to wait for the 2-minute claim.
  if not exists (select 1 from public.tournament_module_admins a
                  where a.module_id = p_module and a.profile_id = p_profile)
     and not exists (select 1 from public.tournament_admins ta
                      where ta.tournament_id = v_m.tournament_id and ta.profile_id = p_profile) then
    update public.tournament_live_scores
       set scorer_id = null
     where module_id = p_module and scorer_id = p_profile and state in ('live', 'break');
  end if;
end;
$$;

create or replace function public.get_module_scorers(p_module uuid)
returns table (id uuid, username text, avatar_url text, added_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  return query
  select p.id, p.username, p.avatar_url, s.added_at
  from public.tournament_module_scorers s
  join public.public_profiles p on p.id = s.profile_id
  where s.module_id = p_module and p.deleted_at is null
  order by s.added_at, p.username;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. "To score": open matches in modules the caller scores or manages. Names, time, venue, court,
--    live state only — no entry fields at all.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_my_scoring_matches()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_ALLOWED';
  end if;
  begin
    perform public._usage_track('to_score', null);
  exception when undefined_function then
    null;
  end;

  with mine as (
    select s.module_id, 'scorer'::text as role, 2 as rank
      from public.tournament_module_scorers s where s.profile_id = v_uid
    union all
    select a.module_id, 'manager', 1
      from public.tournament_module_admins a where a.profile_id = v_uid
    union all
    select m.id, 'manager', 1
      from public.tournament_admins ta
      join public.tournament_modules m on m.tournament_id = ta.tournament_id
     where ta.profile_id = v_uid
  ), roles as (
    select distinct on (module_id) module_id, role from mine order by module_id, rank
  ), open_matches as (
    select
      tm.id as match_id, m.id as module_id, t.id as tournament_id,
      t.name as tournament_name, m.name as module_name, m.sport, m.custom_sport_name,
      r.name as round_name,
      ea.name as a_name, eb.name as b_name,
      tm.scheduled_at, coalesce(tm.venue, m.venue) as venue, tm.court, tm.match_number,
      case when ls.state in ('live', 'break') then ls.state end as live_state,
      case when ls.state in ('live', 'break') then ls.updated_at end as live_updated_at,
      case when ls.state in ('live', 'break') then sp.username end as scorer_name,
      coalesce(ls.state in ('live', 'break') and ls.scorer_id = v_uid, false) as mine,
      roles.role as my_role
    from roles
    join public.tournament_modules m on m.id = roles.module_id
    join public.tournaments t on t.id = m.tournament_id
    join public.tournament_matches tm on tm.module_id = m.id
    join public.tournament_rounds r on r.id = tm.round_id
    join public.tournament_entries ea on ea.id = tm.entry_a_id
    join public.tournament_entries eb on eb.id = tm.entry_b_id
    left join public.tournament_live_scores ls on ls.match_id = tm.id
    left join public.public_profiles sp on sp.id = ls.scorer_id
    where t.status = 'published'
      and m.status = 'in_progress'
      and tm.status not in ('completed', 'walkover', 'bye', 'cancelled')
      and not (tm.bracket_side is not distinct from 'group' and m.current_stage = 2)
    order by (ls.state in ('live', 'break')) desc nulls last,
             coalesce(ls.scorer_id = v_uid, false) desc,
             tm.scheduled_at asc nulls last,
             t.name, m.sort_order, tm.match_number
    limit 100
  )
  select coalesce(jsonb_agg(to_jsonb(o) - 'match_number'
           order by (o.live_state is not null) desc, o.mine desc, o.scheduled_at asc nulls last,
                    o.tournament_name, o.module_name, o.match_number), '[]'::jsonb)
    into v_rows
  from open_matches o;

  return jsonb_build_object('matches', v_rows, 'server_now', now());
end;
$$;

revoke all on function public.add_module_scorer(uuid, uuid) from public, anon;
revoke all on function public.remove_module_scorer(uuid, uuid) from public, anon;
revoke all on function public.get_module_scorers(uuid) from public, anon;
revoke all on function public.get_my_scoring_matches() from public, anon;
grant execute on function public.add_module_scorer(uuid, uuid) to authenticated;
grant execute on function public.remove_module_scorer(uuid, uuid) to authenticated;
grant execute on function public.get_module_scorers(uuid) to authenticated;
grant execute on function public.get_my_scoring_matches() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Result engine split: same checks and behaviour, permission moved to the public wrapper
-- ───────────────────────────────────────────────────────────────────────────
do $do$
declare
  v_def text;
  v_new text;
  v_perm constant text := 'if not found or auth.uid() is null or not public.is_module_admin(m.module_id) then';
begin
  if to_regprocedure('public._record_tournament_result_core(uuid, integer, integer, jsonb, uuid, text)') is not null then
    return;   -- already split
  end if;
  v_def := pg_get_functiondef('public.record_tournament_result(uuid, integer, integer, jsonb, uuid, text)'::regprocedure);
  v_new := replace(v_def, 'public.record_tournament_result(', 'public._record_tournament_result_core(');
  v_new := replace(v_new, v_perm, 'if not found or auth.uid() is null then');
  if position('is_module_admin' in v_new) > 0 or position('_record_tournament_result_core' in v_new) = 0 then
    raise exception 'result core split: unexpected definition of record_tournament_result';
  end if;
  execute v_new;
end
$do$;
revoke all on function public._record_tournament_result_core(uuid, int, int, jsonb, uuid, text)
  from public, anon, authenticated;

create or replace function public.record_tournament_result(
  p_match uuid,
  p_score_a int,
  p_score_b int,
  p_score_detail jsonb default null,
  p_winner uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module uuid;
begin
  select module_id into v_module from public.tournament_matches where id = p_match;
  if v_module is null or auth.uid() is null or not public.is_module_admin(v_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  return public._record_tournament_result_core(p_match, p_score_a, p_score_b, p_score_detail, p_winner, p_note);
end;
$$;
revoke all on function public.record_tournament_result(uuid, int, int, jsonb, uuid, text) from public, anon;
grant execute on function public.record_tournament_result(uuid, int, int, jsonb, uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Scorers may not change match rules
-- ───────────────────────────────────────────────────────────────────────────
-- Mirrors DEFAULT_PRESET in src/lib/live/presets.ts (keep in step).
create or replace function public._live_default_preset(p_sport text, p_sport_key text)
returns text
language sql
immutable
as $$
  select coalesce(
    case when p_sport = 'other' then
      case p_sport_key
        when 'padel' then 'tennis_bo3'
        when 'beach_volleyball' then 'beach_volleyball_21'
        when 'futsal' then 'futsal'
        when 'hockey' then 'hockey_field'
      end
    end,
    case p_sport
      when 'table_tennis' then 'table_tennis_11'
      when 'badminton' then 'badminton_21'
      when 'squash' then 'squash_11'
      when 'pickleball' then 'pickleball_11_sideout'
      when 'tennis' then 'tennis_bo3'
      when 'volleyball' then 'volleyball_25'
      when 'basketball' then 'basketball_fiba'
      when 'football' then 'football_11'
      when 'handball' then 'handball'
      when 'cricket' then 'cricket_t20'
      else 'simple'
    end);
$$;

-- The rules a scorer sends when starting a match must be the module's own: its preset, every setting
-- it saved, and the round's best-of. (Preset internals the module did not override are resolved by the
-- app and cannot be re-derived here.)
create or replace function public._live_assert_scorer_rules(
  p_rules jsonb, p_module public.tournament_modules, p_round_best_of int
)
returns void
language plpgsql
immutable
as $$
declare
  v_saved jsonb := coalesce(p_module.live_rules, '{}'::jsonb);
  v_preset text := coalesce(v_saved ->> 'preset',
                            public._live_default_preset(p_module.sport, p_module.sport_key));
  v_key text;
  v_best int;
begin
  if p_rules is null or (p_rules ->> 'preset') is distinct from v_preset then
    raise exception 'RULES_LOCKED';
  end if;
  for v_key in select jsonb_object_keys(v_saved) loop
    if v_key not in ('preset', 'bestOf', 'drawAllowed')
       and p_rules ? v_key and (p_rules -> v_key) is distinct from (v_saved -> v_key) then
      raise exception 'RULES_LOCKED';
    end if;
  end loop;
  if p_rules ? 'bestOf' then
    if p_round_best_of is not null and p_round_best_of % 2 = 1 then
      v_best := case when p_rules ->> 'family' = 'tennis' then least(p_round_best_of, 5) else p_round_best_of end;
    elsif jsonb_typeof(v_saved -> 'bestOf') = 'number' then
      v_best := (v_saved ->> 'bestOf')::int;
    end if;
    if v_best is not null and (p_rules -> 'bestOf') is distinct from to_jsonb(v_best) then
      raise exception 'RULES_LOCKED';
    end if;
  end if;
end;
$$;
revoke all on function public._live_default_preset(text, text) from public, anon, authenticated;
revoke all on function public._live_assert_scorer_rules(jsonb, public.tournament_modules, int)
  from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Live referee functions: scorers allowed, role re-checked on EVERY write
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.live_start_match(
  p_match uuid,
  p_device text,
  p_takeover boolean default false,
  p_court text default null,
  p_rules jsonb default null,
  p_snapshot jsonb default null,
  p_summary jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.tournament_matches;
  v_mod public.tournament_modules;
  ls public.tournament_live_scores;
  v_found boolean;
  v_admin boolean;
  v_best_of int;
  v_rules jsonb;
  v_snap jsonb := coalesce(p_snapshot, jsonb_build_object('state', 'live'));
  v_sum jsonb := coalesce(p_summary, '{}'::jsonb);
  v_court text := nullif(btrim(coalesce(p_court, '')), '');
  v_device text := left(coalesce(p_device, ''), 64);
begin
  select * into m from public.tournament_matches where id = p_match;
  if not found or auth.uid() is null or not public.can_score_module(m.module_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_admin := public.is_module_admin(m.module_id);
  select * into v_mod from public.tournament_modules where id = m.module_id;
  perform public._tournament_assert_writable(v_mod.tournament_id);
  if v_mod.status <> 'in_progress' then
    raise exception 'INVALID_STATUS';
  end if;
  if m.bracket_side = 'group' and v_mod.current_stage = 2 then
    raise exception 'STAGE_LOCKED';
  end if;
  if m.status in ('completed', 'walkover', 'bye', 'cancelled') or m.entry_a_id is null or m.entry_b_id is null then
    raise exception 'INVALID_STATUS';
  end if;
  if v_court is not null and char_length(v_court) > 40 then
    raise exception 'FIELD_INVALID:court';
  end if;
  if jsonb_typeof(v_snap) <> 'object' or octet_length(v_snap::text) > 8192
     or jsonb_typeof(v_sum) <> 'object' or octet_length(v_sum::text) > 2048 then
    raise exception 'FIELD_INVALID:live_state';
  end if;

  v_rules := coalesce(p_rules, v_mod.live_rules);
  perform public._live_validate_rules(v_rules, public._live_module_scoring_mode(v_mod));

  perform public._ensure_live_code(v_mod.tournament_id);

  select * into ls from public.tournament_live_scores where match_id = p_match for update;
  v_found := found;

  -- Starting (or restarting) fixes the rules: a scorer may only use the module's. Resuming keeps the stored ones.
  if not v_admin and (not v_found or ls.state = 'abandoned') then
    select r.best_of into v_best_of from public.tournament_rounds r where r.id = m.round_id;
    perform public._live_assert_scorer_rules(v_rules, v_mod, v_best_of);
  end if;

  if v_found and ls.state in ('live', 'break') then
    if ls.scorer_id is not null and ls.scorer_id is distinct from auth.uid()
       and ls.updated_at > clock_timestamp() - interval '2 minutes'
       and not coalesce(p_takeover, false) then
      raise exception 'LIVE_TAKEN';
    end if;
    update public.tournament_live_scores
       set scorer_id = auth.uid(), scorer_device = v_device
     where match_id = p_match;
  elsif v_found and ls.state = 'abandoned' then
    update public.tournament_live_scores
       set state = 'live', family = v_rules ->> 'family', rules = v_rules, snapshot = v_snap, summary = v_sum,
           seq = ls.seq + 1, scorer_id = auth.uid(), scorer_device = v_device,
           started_at = clock_timestamp(), updated_at = clock_timestamp(), finished_at = null
     where match_id = p_match;
  elsif v_found then
    raise exception 'INVALID_STATUS';   -- already finished
  else
    insert into public.tournament_live_scores
      (match_id, module_id, tournament_id, state, family, rules, snapshot, summary, seq, scorer_id, scorer_device,
       started_at, updated_at)
    values
      (p_match, m.module_id, v_mod.tournament_id, 'live', v_rules ->> 'family', v_rules, v_snap, v_sum, 1,
       auth.uid(), v_device, clock_timestamp(), clock_timestamp());
  end if;

  if v_court is not null and m.court is distinct from v_court then
    update public.tournament_matches set court = v_court where id = p_match;
  end if;

  select * into ls from public.tournament_live_scores where match_id = p_match;
  return to_jsonb(ls);
end;
$$;

create or replace function public.live_push_score(
  p_match uuid,
  p_seq bigint,
  p_snapshot jsonb,
  p_summary jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ls public.tournament_live_scores;
  v_state text;
begin
  if auth.uid() is null then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into ls from public.tournament_live_scores where match_id = p_match for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if not public.can_score_module(ls.module_id) then
    raise exception 'NOT_ALLOWED';     -- role removed while scoring
  end if;
  if ls.scorer_id is distinct from auth.uid() then
    raise exception 'LIVE_TAKEN';
  end if;
  perform public._tournament_assert_writable(ls.tournament_id);
  if ls.state in ('finished', 'abandoned') or p_seq is null or p_seq <= ls.seq then
    return jsonb_build_object('seq', ls.seq, 'state', ls.state);          -- duplicate / out of order / ended: no error
  end if;
  if ls.updated_at > clock_timestamp() - interval '50 milliseconds' then
    return jsonb_build_object('seq', ls.seq, 'state', ls.state);          -- >20 writes/s: client resends the latest
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' or octet_length(p_snapshot::text) > 8192
     or p_summary is null or jsonb_typeof(p_summary) <> 'object' or octet_length(p_summary::text) > 2048 then
    raise exception 'FIELD_INVALID:live_state';
  end if;
  v_state := coalesce(p_snapshot ->> 'state', 'live');
  if v_state not in ('live', 'break', 'decided') then
    raise exception 'FIELD_INVALID:live_state';
  end if;
  update public.tournament_live_scores
     set snapshot = p_snapshot, summary = p_summary, seq = p_seq,
         state = case when v_state = 'break' then 'break' else 'live' end,
         updated_at = clock_timestamp()
   where match_id = p_match;
  return jsonb_build_object('seq', p_seq, 'state', case when v_state = 'break' then 'break' else 'live' end);
end;
$$;

create or replace function public.live_finish_match(
  p_match uuid,
  p_seq bigint,
  p_snapshot jsonb,
  p_summary jsonb,
  p_score_a int,
  p_score_b int,
  p_score_detail jsonb default null,
  p_winner uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ls public.tournament_live_scores;
  m public.tournament_matches;
  v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into ls from public.tournament_live_scores where match_id = p_match for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if not public.can_score_module(ls.module_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  if ls.scorer_id is distinct from auth.uid() then
    raise exception 'LIVE_TAKEN';
  end if;
  select * into m from public.tournament_matches where id = p_match;
  if ls.state = 'finished' then
    return to_jsonb(m);                                                  -- retry of an already saved finish
  end if;
  if ls.state = 'abandoned' then
    raise exception 'INVALID_STATUS';
  end if;
  -- A scorer can only record a result once; changing an existing one is a manager's job.
  if m.status in ('completed', 'walkover') and not public.is_module_admin(ls.module_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' or octet_length(p_snapshot::text) > 8192
     or p_summary is null or jsonb_typeof(p_summary) <> 'object' or octet_length(p_summary::text) > 2048 then
    raise exception 'FIELD_INVALID:live_state';
  end if;

  update public.tournament_live_scores
     set snapshot = p_snapshot, summary = p_summary, seq = greatest(ls.seq, coalesce(p_seq, 0)),
         updated_at = clock_timestamp()
   where match_id = p_match;

  -- All existing checks + bracket advancement run here (TIE_NEEDS_WINNER, STAGE_LOCKED, DOWNSTREAM_PLAYED, …).
  -- Any error rolls back this whole function, leaving the live row as it was.
  v_res := public._record_tournament_result_core(p_match, p_score_a, p_score_b, p_score_detail, p_winner, p_note);

  update public.tournament_live_scores
     set state = 'finished', finished_at = coalesce(finished_at, clock_timestamp()),
         updated_at = clock_timestamp(), seq = seq + 1
   where match_id = p_match and state <> 'finished';
  return v_res;
end;
$$;

create or replace function public.live_abandon_match(p_match uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module uuid;
begin
  select module_id into v_module from public.tournament_matches where id = p_match;
  if v_module is null or auth.uid() is null or not public.can_score_module(v_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  -- A scorer may only stop the match they are scoring themselves.
  if not public.is_module_admin(v_module)
     and not exists (select 1 from public.tournament_live_scores s
                      where s.match_id = p_match and s.scorer_id = auth.uid()) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.tournament_live_scores
     set state = 'abandoned', updated_at = clock_timestamp(), seq = seq + 1
   where match_id = p_match and state in ('live', 'break');
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Notification: "you can score …"
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;

ALTER TABLE public.in_app_notifications
  ADD CONSTRAINT in_app_notifications_type_check
  CHECK (type IN (
    'match_pending', 'match_approved', 'match_rejected', 'match_liked', 'match_commented',
    'session_application', 'session_accepted', 'session_rejected', 'session_left',
    'session_reminder', 'feedback_prompt', 'ping', 'join_request', 'join_approved',
    'join_rejected', 'match_approval_request', 'match_approved_community', 'match_disputed',
    'member_removed', 'admin_transferred', 'admin_promoted', 'community_match_pending',
    'community_match_approved', 'community_match_disputed', 'community_invite',
    'community_invite_accepted', 'community_invite_rejected', 'session_chat_message',
    'session_chat_reply', 'community_chat_message', 'community_chat_reply',
    'streak_reminder', 'streak_at_risk', 'streak_milestone', 'community_post_created',
    'community_post_liked', 'community_post_commented', 'member_joined',
    'community_engagement', 'new_community', 'tournament_admin_assigned',
    'tournament_module_admin_assigned', 'tournament_entry_added', 'tournament_match_scheduled',
    'tournament_match_result', 'tournament_module_completed',
    'admin_broadcast', 'tournament_scorer_assigned'
  ));

create or replace function public.trg_tournament_scorer_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_name text;
  v_tournament_id uuid;
  v_tournament_name text;
begin
  if NEW.profile_id = auth.uid() then
    return NEW;
  end if;
  select m.name, m.tournament_id, t.name
    into v_module_name, v_tournament_id, v_tournament_name
  from public.tournament_modules m
  join public.tournaments t on t.id = m.tournament_id
  where m.id = NEW.module_id;
  perform public._tournament_notify(
    NEW.profile_id,
    'tournament_scorer_assigned',
    'You''re a scorer',
    'You can now score ' || coalesce(v_module_name, 'matches') || ' in ' || coalesce(v_tournament_name, 'a tournament') || '.',
    jsonb_build_object('tournamentId', v_tournament_id, 'moduleId', NEW.module_id)
  );
  return NEW;
end;
$$;
revoke all on function public.trg_tournament_scorer_assigned() from public, anon, authenticated;

drop trigger if exists trg_tournament_scorer_assigned on public.tournament_module_scorers;
create trigger trg_tournament_scorer_assigned
  after insert on public.tournament_module_scorers
  for each row execute function public.trg_tournament_scorer_assigned();
