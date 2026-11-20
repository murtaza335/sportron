-- 133_add_live_match_scoring.sql
-- Follow-live-match: referee scores a tournament match live; app viewers and a projector page follow it.
-- Plan: docs/live-match/PLAN.md
--
-- BACKWARD COMPATIBILITY (AGENTS.md): ADDITIVE ONLY.
--  * New columns are nullable or have defaults; nothing is renamed or dropped.
--  * tournament_matches (schema + status values) and record_tournament_result are NOT changed. A live score lives
--    in its own table; only the final result is written to tournament_matches, through the existing function.
--  * Existing read RPCs (get_tournaments, get_tournament_detail, get_module_matches) are unchanged.
--  * No edge function change, no new notification type.
--  * Installed builds never call any of the new functions. New builds hide all live UI when a function is missing.
--
-- DELIBERATE EXCEPTION to "every SECURITY DEFINER function starts with an auth.uid() guard" (049/109):
-- get_live_board(p_code) is callable by anon (the projector page has no sign-in). Its guard is
-- "tournament published AND live_public"; it returns names + scores only, plus extra fields the organiser
-- switched on (live_display), and never private entry fields. Every other function below keeps the auth guard.
--
-- Board / settings reads return a single jsonb document (not RETURNS TABLE): one round trip, and the shape
-- can grow additively without drop/recreate.

-- ── Columns ─────────────────────────────────────────────────────────────────────────────────────────
alter table public.tournaments add column if not exists live_public boolean not null default true;
alter table public.tournaments add column if not exists live_code text;
alter table public.tournaments add column if not exists live_display jsonb not null default '{}'::jsonb;
alter table public.tournament_modules add column if not exists live_rules jsonb;

create unique index if not exists tournaments_live_code_unique
  on public.tournaments (lower(live_code)) where live_code is not null;

-- ── Live score rows ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.tournament_live_scores (
  match_id      uuid primary key references public.tournament_matches(id) on delete cascade,
  module_id     uuid not null references public.tournament_modules(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  state         text not null default 'live' check (state in ('live','break','finished','abandoned')),
  family        text not null check (family in ('sets','tennis','timed','cricket','simple')),
  rules         jsonb not null,
  snapshot      jsonb not null,
  summary       jsonb not null default '{}'::jsonb,
  seq           bigint not null default 0,
  scorer_id     uuid references public.profiles(id) on delete set null,
  scorer_device text check (char_length(scorer_device) <= 64),
  started_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists idx_live_scores_tournament on public.tournament_live_scores (tournament_id, state);
create index if not exists idx_live_scores_idle on public.tournament_live_scores (state, updated_at);

alter table public.tournament_live_scores enable row level security;
revoke all on public.tournament_live_scores from anon, authenticated;

-- Change log for the "max 10 code changes / day" limit
create table if not exists public.tournament_live_code_log (
  id bigint generated always as identity primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists idx_live_code_log on public.tournament_live_code_log (tournament_id, changed_at);
alter table public.tournament_live_code_log enable row level security;
revoke all on public.tournament_live_code_log from anon, authenticated;

-- ── Internal helpers (not granted to clients) ───────────────────────────────────────────────────────
create or replace function public._live_gen_code()
returns text
language plpgsql
volatile
as $$
declare
  v_alpha constant text := 'abcdefghjkmnpqrstuvwxyz23456789';   -- no 0 o 1 l i
  v_bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_out text := '';
  i int;
begin
  for i in 0..5 loop
    v_out := v_out || substr(v_alpha, 1 + (get_byte(v_bytes, i) % length(v_alpha)), 1);
  end loop;
  return v_out;
end;
$$;
revoke all on function public._live_gen_code() from public, anon, authenticated;

create or replace function public._ensure_live_code(p_tournament uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_try int := 0;
begin
  select live_code into v_code from public.tournaments where id = p_tournament;
  if v_code is not null then
    return v_code;
  end if;
  loop
    v_try := v_try + 1;
    v_code := public._live_gen_code();
    begin
      update public.tournaments set live_code = v_code
      where id = p_tournament and live_code is null;
      select live_code into v_code from public.tournaments where id = p_tournament;
      return v_code;
    exception when unique_violation then
      if v_try > 10 then raise; end if;
    end;
  end loop;
end;
$$;
revoke all on function public._ensure_live_code(uuid) from public, anon, authenticated;

create or replace function public._live_display_defaults()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'show_school', false, 'show_fields', '[]'::jsonb, 'show_module', true, 'show_court', true,
    'show_up_next', true, 'show_recent', true, 'show_app_promo', true, 'title', null,
    'courts', '[]'::jsonb, 'layout', 'auto', 'max_per_page', 6, 'final_hold_seconds', 60
  );
$$;
revoke all on function public._live_display_defaults() from public, anon, authenticated;

create or replace function public._live_display_resolved(p_display jsonb)
returns jsonb
language sql
immutable
as $$
  select public._live_display_defaults() || coalesce(p_display, '{}'::jsonb);
$$;
revoke all on function public._live_display_resolved(jsonb) from public, anon, authenticated;

-- Validates a (merged) display object; returns it cleaned. Raises FIELD_INVALID:<key>.
create or replace function public._live_display_clean(p_tournament uuid, p_display jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_known text[] := array['show_school','show_fields','show_module','show_court','show_up_next','show_recent',
                          'show_app_promo','title','courts','layout','max_per_page','final_hold_seconds'];
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
  v_item jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_courts jsonb := '[]'::jsonb;
  v_text text;
begin
  if p_display is null or jsonb_typeof(p_display) <> 'object' then
    raise exception 'FIELD_INVALID:live_display';
  end if;
  for v_key, v_val in select * from jsonb_each(p_display) loop
    if not (v_key = any (v_known)) then
      raise exception 'FIELD_INVALID:live_display';
    end if;
    if v_key in ('show_school','show_module','show_court','show_up_next','show_recent','show_app_promo') then
      if jsonb_typeof(v_val) <> 'boolean' then raise exception 'FIELD_INVALID:%', v_key; end if;
      v_out := v_out || jsonb_build_object(v_key, v_val);
    elsif v_key = 'title' then
      if jsonb_typeof(v_val) = 'null' then
        v_out := v_out || jsonb_build_object('title', null);
      elsif jsonb_typeof(v_val) = 'string' then
        v_text := nullif(btrim(v_val #>> '{}'), '');
        if v_text is not null and char_length(v_text) > 60 then raise exception 'FIELD_INVALID:title'; end if;
        v_out := v_out || jsonb_build_object('title', v_text);
      else
        raise exception 'FIELD_INVALID:title';
      end if;
    elsif v_key = 'layout' then
      if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') not in ('auto','row','grid') then
        raise exception 'FIELD_INVALID:layout';
      end if;
      v_out := v_out || jsonb_build_object('layout', v_val);
    elsif v_key = 'max_per_page' then
      if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}')::numeric not between 1 and 8
         or (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric) then
        raise exception 'FIELD_INVALID:max_per_page';
      end if;
      v_out := v_out || jsonb_build_object('max_per_page', v_val);
    elsif v_key = 'final_hold_seconds' then
      if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}')::numeric not between 0 and 300
         or (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric) then
        raise exception 'FIELD_INVALID:final_hold_seconds';
      end if;
      v_out := v_out || jsonb_build_object('final_hold_seconds', v_val);
    elsif v_key = 'courts' then
      if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) > 12 then
        raise exception 'FIELD_INVALID:courts';
      end if;
      for v_item in select * from jsonb_array_elements(v_val) loop
        if jsonb_typeof(v_item) <> 'string' then raise exception 'FIELD_INVALID:courts'; end if;
        v_text := btrim(v_item #>> '{}');
        if v_text = '' or char_length(v_text) > 40 then raise exception 'FIELD_INVALID:courts'; end if;
        if exists (select 1 from jsonb_array_elements_text(v_courts) c where lower(c) = lower(v_text)) then
          raise exception 'FIELD_INVALID:courts';
        end if;
        v_courts := v_courts || to_jsonb(v_text);
      end loop;
      v_out := v_out || jsonb_build_object('courts', v_courts);
    elsif v_key = 'show_fields' then
      if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) > 2 then
        raise exception 'FIELD_INVALID:show_fields';
      end if;
      for v_item in select * from jsonb_array_elements(v_val) loop
        if jsonb_typeof(v_item) <> 'string' or (v_item #>> '{}') !~ '^[0-9a-f-]{36}$' then
          raise exception 'FIELD_INVALID:show_fields';
        end if;
        if not exists (
          select 1 from public.tournament_entry_fields f
          where f.id = (v_item #>> '{}')::uuid and f.tournament_id = p_tournament
            and f.is_public and f.archived_at is null and not f.is_core
        ) then
          raise exception 'FIELD_INVALID:show_fields';
        end if;
        v_ids := v_ids || v_item;
      end loop;
      v_out := v_out || jsonb_build_object('show_fields', v_ids);
    end if;
  end loop;
  return v_out;
end;
$$;
revoke all on function public._live_display_clean(uuid, jsonb) from public, anon, authenticated;

create or replace function public._live_module_scoring_mode(p_module public.tournament_modules)
returns text
language sql
immutable
as $$
  select coalesce(
    p_module.scoring_mode,
    case when p_module.sport in ('table_tennis','badminton','tennis','squash','pickleball') then 'games' else 'score' end
  );
$$;
revoke all on function public._live_module_scoring_mode(public.tournament_modules) from public, anon, authenticated;

-- Rules are resolved by the client engine (single source of truth for sport presets); the server validates
-- the envelope: object, size, known family, and family <-> module scoring mode.
create or replace function public._live_validate_rules(p_rules jsonb, p_mode text)
returns void
language plpgsql
immutable
as $$
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' or octet_length(p_rules::text) > 4096 then
    raise exception 'FIELD_INVALID:live_rules';
  end if;
  if coalesce(p_rules ->> 'family', '') not in ('sets','tennis','timed','cricket','simple') then
    raise exception 'FIELD_INVALID:live_rules';
  end if;
  if p_rules ? 'preset' and (jsonb_typeof(p_rules -> 'preset') <> 'string' or char_length(p_rules ->> 'preset') > 40) then
    raise exception 'FIELD_INVALID:live_rules';
  end if;
  -- A module scored as 'games' (racket sports) must use a games family; 'score' modules can use any
  -- (e.g. volleyball keeps scoring_mode 'score' with sets-based rules).
  if p_mode = 'games' and (p_rules ->> 'family') not in ('sets','tennis') then
    raise exception 'FIELD_INVALID:live_rules_family';
  end if;
end;
$$;
revoke all on function public._live_validate_rules(jsonb, text) from public, anon, authenticated;

-- One entry as shown to viewers. p_keys = entry-field keys to include; only fields that are
-- currently public + not archived are ever returned (so a field made private later can't leak).
create or replace function public._live_side(p_entry uuid, p_tournament uuid, p_keys text[], p_with_profile boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when e.id is null then null else
    jsonb_build_object('id', e.id, 'name', e.name)
    || case when p_with_profile then jsonb_build_object('profile_id', e.profile_id) else '{}'::jsonb end
    || jsonb_build_object('fields', coalesce((
         select jsonb_agg(jsonb_build_object('label', f.label, 'value', e.field_values ->> f.key) order by f.sort_order)
         from public.tournament_entry_fields f
         where f.tournament_id = p_tournament
           and f.key = any (coalesce(p_keys, '{}'))
           and f.is_public and f.archived_at is null
           and coalesce(e.field_values ->> f.key, '') <> ''
       ), '[]'::jsonb))
  end
  from public.tournament_entries e
  where e.id = p_entry;
$$;
revoke all on function public._live_side(uuid, uuid, text[], boolean) from public, anon, authenticated;

-- One match row of a board. Tournament id comes from the module (matches only carry module_id).
create or replace function public._live_match_json(
  p_match public.tournament_matches,
  p_live public.tournament_live_scores,
  p_projector boolean,
  p_display jsonb,
  p_keys text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mod public.tournament_modules;
  v_round text;
  v_out jsonb;
begin
  select * into v_mod from public.tournament_modules where id = p_match.module_id;
  select r.name into v_round from public.tournament_rounds r where r.id = p_match.round_id;
  v_out := jsonb_build_object(
    'match_id', p_match.id,
    'module_id', p_match.module_id,
    'sport', v_mod.sport,
    'custom_sport_name', v_mod.custom_sport_name,
    'scoring_mode', public._live_module_scoring_mode(v_mod),
    'stage_number', p_match.stage_number,
    'bracket_side', p_match.bracket_side,
    'round_number', p_match.round_number,
    'match_number', p_match.match_number,
    'round_name', v_round,
    'code', p_match.code,
    'status', p_match.status,
    'scheduled_at', p_match.scheduled_at,
    'venue', p_match.venue,
    'a', public._live_side(p_match.entry_a_id, v_mod.tournament_id, p_keys, not p_projector),
    'b', public._live_side(p_match.entry_b_id, v_mod.tournament_id, p_keys, not p_projector)
  );
  if not p_projector or coalesce((p_display ->> 'show_module')::boolean, true) then
    v_out := v_out || jsonb_build_object('module_name', v_mod.name);
  end if;
  if not p_projector or coalesce((p_display ->> 'show_court')::boolean, true) then
    v_out := v_out || jsonb_build_object('court', p_match.court);
  end if;
  if p_live.match_id is not null then
    v_out := v_out || jsonb_build_object(
      'state', p_live.state, 'family', p_live.family, 'summary', p_live.summary,
      'snapshot', p_live.snapshot, 'seq', p_live.seq, 'updated_at', p_live.updated_at,
      'started_at', p_live.started_at, 'finished_at', p_live.finished_at);
  end if;
  return v_out;
end;
$$;
revoke all on function public._live_match_json(public.tournament_matches, public.tournament_live_scores, boolean, jsonb, text[])
  from public, anon, authenticated;

-- Whole board for a tournament: live + recently finished + up next.
create or replace function public._live_board(p_tournament uuid, p_projector boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t public.tournaments;
  v_disp jsonb;
  v_keys text[];
  v_live jsonb;
  v_recent jsonb;
  v_next jsonb := '[]'::jsonb;
  v_app_link text;
begin
  select * into v_t from public.tournaments where id = p_tournament;
  if not found then
    return null;
  end if;
  v_disp := public._live_display_resolved(v_t.live_display);

  if p_projector then
    v_keys := array(
      select f.key from public.tournament_entry_fields f
      where f.tournament_id = p_tournament and f.key = 'school' and coalesce((v_disp ->> 'show_school')::boolean, false)
      union
      select f.key from public.tournament_entry_fields f
      where f.tournament_id = p_tournament
        and f.id::text in (select jsonb_array_elements_text(v_disp -> 'show_fields'))
    );
  else
    v_keys := array(
      select f.key from public.tournament_entry_fields f
      where f.tournament_id = p_tournament and f.is_public and f.archived_at is null and f.key <> 'name'
    );
  end if;

  select coalesce(jsonb_agg(public._live_match_json(m, ls, p_projector, v_disp, v_keys)
           order by m.court nulls last, ls.started_at), '[]'::jsonb)
    into v_live
  from public.tournament_live_scores ls
  join public.tournament_matches m on m.id = ls.match_id
  where ls.tournament_id = p_tournament and ls.state in ('live', 'break');

  select coalesce(jsonb_agg(x.j order by x.fin desc), '[]'::jsonb)
    into v_recent
  from (
    select public._live_match_json(m, ls, p_projector, v_disp, v_keys) as j, ls.finished_at as fin
    from public.tournament_live_scores ls
    join public.tournament_matches m on m.id = ls.match_id
    where ls.tournament_id = p_tournament and ls.state = 'finished'
      and ls.finished_at > now() - interval '30 minutes'
    order by ls.finished_at desc
    limit 20
  ) x;

  if not p_projector or coalesce((v_disp ->> 'show_up_next')::boolean, true) then
    select coalesce(jsonb_agg(x.j order by x.at), '[]'::jsonb)
      into v_next
    from (
      select public._live_match_json(m, null::public.tournament_live_scores, p_projector, v_disp, v_keys) as j,
             m.scheduled_at as at
      from public.tournament_matches m
      join public.tournament_modules md on md.id = m.module_id
      where md.tournament_id = p_tournament
        and md.status = 'in_progress'
        and m.status in ('pending', 'scheduled')
        and m.entry_a_id is not null and m.entry_b_id is not null
        and m.scheduled_at is not null
        and m.scheduled_at >= now() - interval '1 hour'
        and m.scheduled_at < now() + interval '24 hours'
        and not exists (select 1 from public.tournament_live_scores l where l.match_id = m.id)
      order by m.scheduled_at
      limit 12
    ) x;
  end if;

  select rc.value #>> '{}' into v_app_link from public.remote_config rc where rc.key = 'live_app_link';

  return jsonb_build_object(
    'active', true,
    'server_now', now(),
    'tournament', jsonb_build_object(
      'id', v_t.id,
      'name', coalesce(nullif(v_disp ->> 'title', ''), v_t.name),
      'location', v_t.location,
      'live_code', v_t.live_code,
      'status', v_t.status
    ),
    'display', v_disp,
    'app_link', coalesce(v_app_link, 'https://sportron.app/get'),
    'live', v_live,
    'recent', v_recent,
    'up_next', v_next
  );
end;
$$;
revoke all on function public._live_board(uuid, boolean) from public, anon, authenticated;

-- ── Referee functions ───────────────────────────────────────────────────────────────────────────────
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
  v_rules jsonb;
  v_snap jsonb := coalesce(p_snapshot, jsonb_build_object('state', 'live'));
  v_sum jsonb := coalesce(p_summary, '{}'::jsonb);
  v_court text := nullif(btrim(coalesce(p_court, '')), '');
  v_device text := left(coalesce(p_device, ''), 64);
begin
  select * into m from public.tournament_matches where id = p_match;
  if not found or auth.uid() is null or not public.is_module_admin(m.module_id) then
    raise exception 'NOT_ALLOWED';
  end if;
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
  if found and ls.state in ('live', 'break') then
    if ls.scorer_id is distinct from auth.uid()
       and ls.updated_at > clock_timestamp() - interval '2 minutes'
       and not coalesce(p_takeover, false) then
      raise exception 'LIVE_TAKEN';
    end if;
    update public.tournament_live_scores
       set scorer_id = auth.uid(), scorer_device = v_device
     where match_id = p_match;
  elsif found and ls.state = 'abandoned' then
    update public.tournament_live_scores
       set state = 'live', family = v_rules ->> 'family', rules = v_rules, snapshot = v_snap, summary = v_sum,
           seq = ls.seq + 1, scorer_id = auth.uid(), scorer_device = v_device,
           started_at = clock_timestamp(), updated_at = clock_timestamp(), finished_at = null
     where match_id = p_match;
  elsif found then
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
  if ls.scorer_id is distinct from auth.uid() then
    raise exception 'LIVE_TAKEN';
  end if;
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
  if ls.scorer_id is distinct from auth.uid() then
    raise exception 'LIVE_TAKEN';
  end if;
  if ls.state = 'finished' then
    select * into m from public.tournament_matches where id = p_match;
    return to_jsonb(m);                                                  -- retry of an already saved finish
  end if;
  if ls.state = 'abandoned' then
    raise exception 'INVALID_STATUS';
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
  v_res := public.record_tournament_result(p_match, p_score_a, p_score_b, p_score_detail, p_winner, p_note);

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
  if v_module is null or auth.uid() is null or not public.is_module_admin(v_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.tournament_live_scores
     set state = 'abandoned', updated_at = clock_timestamp(), seq = seq + 1
   where match_id = p_match and state in ('live', 'break');
end;
$$;

create or replace function public.set_module_live_rules(p_module uuid, p_rules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mod public.tournament_modules;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_mod from public.tournament_modules where id = p_module;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  perform public._tournament_assert_writable(v_mod.tournament_id);
  if p_rules is not null then
    perform public._live_validate_rules(p_rules, public._live_module_scoring_mode(v_mod));
  end if;
  update public.tournament_modules set live_rules = p_rules where id = p_module;
  return p_rules;
end;
$$;

-- ── Organiser (tournament admin) functions ──────────────────────────────────────────────────────────
create or replace function public.get_tournament_live_settings(p_tournament uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.tournaments;
  v_base text;
begin
  if auth.uid() is null or not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._ensure_live_code(p_tournament);
  select * into v_t from public.tournaments where id = p_tournament;
  select rc.value #>> '{}' into v_base from public.remote_config rc where rc.key = 'live_projector_base_url';
  return jsonb_build_object(
    'live_public', v_t.live_public,
    'live_code', v_t.live_code,
    'live_display', public._live_display_resolved(v_t.live_display),
    'base_url', coalesce(v_base, 'https://sportron-live-sigma.vercel.app')
  );
end;
$$;

create or replace function public.set_tournament_live_public(p_tournament uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.tournaments;
begin
  if auth.uid() is null or not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(p_tournament);
  if p_on is null then
    raise exception 'FIELD_INVALID:live_public';
  end if;
  update public.tournaments set live_public = p_on where id = p_tournament;
  if p_on then
    perform public._ensure_live_code(p_tournament);
  end if;
  select * into v_t from public.tournaments where id = p_tournament;
  return jsonb_build_object('live_public', v_t.live_public, 'live_code', v_t.live_code,
                            'live_display', public._live_display_resolved(v_t.live_display));
end;
$$;

create or replace function public.set_tournament_live_code(p_tournament uuid, p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(nullif(btrim(coalesce(p_code, '')), ''));
  v_reserved text[] := array['admin','api','app','live','www','projector','login','static','assets','health',
                             'support','help','sportron','test','demo','null','undefined'];
  v_try int := 0;
begin
  if auth.uid() is null or not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(p_tournament);
  if (select count(*) from public.tournament_live_code_log
       where tournament_id = p_tournament and changed_at > now() - interval '24 hours') >= 10 then
    raise exception 'RATE_LIMITED';
  end if;

  if v_code is not null then
    if v_code !~ '^[a-z0-9][a-z0-9-]{2,22}[a-z0-9]$' or v_code = any (v_reserved) then
      raise exception 'FIELD_INVALID:live_code';
    end if;
    begin
      update public.tournaments set live_code = v_code where id = p_tournament;
    exception when unique_violation then
      raise exception 'LIVE_CODE_TAKEN';
    end;
  else
    loop
      v_try := v_try + 1;
      v_code := public._live_gen_code();
      begin
        update public.tournaments set live_code = v_code where id = p_tournament;
        exit;
      exception when unique_violation then
        if v_try > 10 then raise; end if;
      end;
    end loop;
  end if;
  insert into public.tournament_live_code_log (tournament_id, changed_by) values (p_tournament, auth.uid());
  return jsonb_build_object('live_code', v_code);
end;
$$;

create or replace function public.set_tournament_live_display(p_tournament uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cleaned jsonb;
  v_new jsonb;
begin
  if auth.uid() is null or not public.is_tournament_admin(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._tournament_assert_writable(p_tournament);
  v_cleaned := public._live_display_clean(p_tournament, p_patch);
  update public.tournaments
     set live_display = coalesce(live_display, '{}'::jsonb) || v_cleaned
   where id = p_tournament
  returning live_display into v_new;
  return public._live_display_resolved(v_new);
end;
$$;

-- ── Viewer reads ────────────────────────────────────────────────────────────────────────────────────
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
  -- Projector read: anon allowed. Guard = published AND live_public (see header).
  select * into v_t from public.tournaments where lower(live_code) = lower(btrim(coalesce(p_code, '')));
  if not found or v_t.status <> 'published' or not v_t.live_public then
    return jsonb_build_object('active', false, 'server_now', now());
  end if;
  return public._live_board(v_t.id, true);
end;
$$;

create or replace function public.get_live_tournament_board(p_tournament uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_view_tournament(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  return public._live_board(p_tournament, false);
end;
$$;

create or replace function public.get_live_match(p_match uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m public.tournament_matches;
  ls public.tournament_live_scores;
  v_tid uuid;
  v_keys text[];
  v_code text;
begin
  select * into m from public.tournament_matches where id = p_match;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  select tournament_id into v_tid from public.tournament_modules where id = m.module_id;
  if auth.uid() is null or not public.can_view_tournament(v_tid) then
    raise exception 'NOT_FOUND';
  end if;
  select * into ls from public.tournament_live_scores where match_id = p_match;
  if not found then
    return null;
  end if;
  v_keys := array(
    select f.key from public.tournament_entry_fields f
    where f.tournament_id = v_tid and f.is_public and f.archived_at is null and f.key <> 'name'
  );
  select live_code into v_code from public.tournaments where id = v_tid;
  return public._live_match_json(m, ls, false, '{}'::jsonb, v_keys)
         || jsonb_build_object('tournament_id', v_tid, 'live_code', v_code, 'rules', ls.rules,
                               'scorer_id', ls.scorer_id, 'server_now', now());
end;
$$;

create or replace function public.get_live_tournaments()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_ALLOWED';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'cover_url', t.image_url, 'live_count', c.n)
                     order by c.n desc, t.name)
    from (
      select ls.tournament_id, count(*)::int as n
      from public.tournament_live_scores ls
      where ls.state in ('live', 'break')
      group by ls.tournament_id
    ) c
    join public.tournaments t on t.id = c.tournament_id
    where public.can_view_tournament(t.id)
  ), '[]'::jsonb);
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.live_start_match(uuid, text, boolean, text, jsonb, jsonb, jsonb)',
    'public.live_push_score(uuid, bigint, jsonb, jsonb)',
    'public.live_finish_match(uuid, bigint, jsonb, jsonb, int, int, jsonb, uuid, text)',
    'public.live_abandon_match(uuid)',
    'public.set_module_live_rules(uuid, jsonb)',
    'public.get_tournament_live_settings(uuid)',
    'public.set_tournament_live_public(uuid, boolean)',
    'public.set_tournament_live_code(uuid, text)',
    'public.set_tournament_live_display(uuid, jsonb)',
    'public.get_live_tournament_board(uuid)',
    'public.get_live_match(uuid)',
    'public.get_live_tournaments()'
  ] loop
    execute format('revoke all on function %s from public, anon', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end $$;

revoke all on function public.get_live_board(text) from public;
grant execute on function public.get_live_board(text) to anon, authenticated;

-- ── Broadcast (database → viewers). Never allowed to fail a score write. ────────────────────────────
create or replace function public._live_scores_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if tg_op = 'DELETE' then
    select live_code into v_code from public.tournaments where id = old.tournament_id;
    if v_code is not null then
      perform realtime.send(jsonb_build_object('match_id', old.match_id, 'removed', true), 'score',
                            'live:' || lower(v_code), true);
    end if;
    return old;
  end if;
  select live_code into v_code from public.tournaments where id = new.tournament_id;
  if v_code is not null then
    perform realtime.send(
      jsonb_build_object('match_id', new.match_id, 'seq', new.seq, 'state', new.state,
                         'summary', new.summary, 'snapshot', new.snapshot, 'updated_at', new.updated_at),
      'score', 'live:' || lower(v_code), true);
  end if;
  return new;
exception when others then
  return coalesce(new, old);
end;
$$;
revoke all on function public._live_scores_broadcast() from public, anon, authenticated;

drop trigger if exists trg_live_scores_broadcast on public.tournament_live_scores;
create trigger trg_live_scores_broadcast
  after insert or update or delete on public.tournament_live_scores
  for each row execute function public._live_scores_broadcast();

-- Settings / code changes → tell open screens to refetch (old code gets the news so old projectors go quiet).
create or replace function public._live_tournament_config_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.live_code is not null then
    perform realtime.send('{}'::jsonb, 'config', 'live:' || lower(old.live_code), true);
  end if;
  if new.live_code is not null and new.live_code is distinct from old.live_code then
    perform realtime.send('{}'::jsonb, 'config', 'live:' || lower(new.live_code), true);
  end if;
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public._live_tournament_config_broadcast() from public, anon, authenticated;

drop trigger if exists trg_live_tournament_config_broadcast on public.tournaments;
create trigger trg_live_tournament_config_broadcast
  after update of live_public, live_code, live_display on public.tournaments
  for each row
  when (old.live_public is distinct from new.live_public
        or old.live_code is distinct from new.live_code
        or old.live_display is distinct from new.live_display)
  execute function public._live_tournament_config_broadcast();

-- ── Keep live rows honest when a match changes through another path (e.g. an old app build) ─────────
create or replace function public._live_sync_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('completed', 'walkover') and old.status is distinct from new.status then
    update public.tournament_live_scores
       set state = 'finished', finished_at = coalesce(finished_at, clock_timestamp()),
           updated_at = clock_timestamp(), seq = seq + 1
     where match_id = new.id and state in ('live', 'break');
  elsif old.status in ('completed', 'walkover') and new.status not in ('completed', 'walkover') then
    delete from public.tournament_live_scores where match_id = new.id;       -- result reset
  elsif new.entry_a_id is distinct from old.entry_a_id or new.entry_b_id is distinct from old.entry_b_id then
    delete from public.tournament_live_scores where match_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public._live_sync_match() from public, anon, authenticated;

drop trigger if exists trg_live_sync_match on public.tournament_matches;
create trigger trg_live_sync_match
  after update of status, entry_a_id, entry_b_id on public.tournament_matches
  for each row execute function public._live_sync_match();

-- ── Who may listen on the realtime topic ────────────────────────────────────────────────────────────
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
  return (v_t.status = 'published' and v_t.live_public)
      or (auth.uid() is not null and public.can_view_tournament(v_t.id));
end;
$$;
revoke all on function public._live_topic_readable(text) from public;
grant execute on function public._live_topic_readable(text) to anon, authenticated;

-- realtime.messages only exists on Supabase (and in the local test stub). No INSERT policy: clients cannot send.
do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    execute 'drop policy if exists live_scores_read on realtime.messages';
    execute $p$
      create policy live_scores_read on realtime.messages
        for select to anon, authenticated
        using (realtime.messages.extension = 'broadcast' and public._live_topic_readable(realtime.topic()))
    $p$;
  end if;
end $$;

-- ── Cleanup (pg_cron if present): stuck live rows → abandoned; old abandoned rows deleted ───────────
create or replace function public.live_cleanup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tournament_live_scores
     set state = 'abandoned', updated_at = clock_timestamp(), seq = seq + 1
   where state in ('live', 'break') and updated_at < now() - interval '6 hours';
  delete from public.tournament_live_scores
   where state = 'abandoned' and updated_at < now() - interval '7 days';
  delete from public.tournament_live_code_log where changed_at < now() - interval '3 days';
end;
$$;
revoke all on function public.live_cleanup() from public, anon, authenticated;

do $$
begin
  if to_regnamespace('cron') is not null then
    begin
      perform cron.unschedule('live-cleanup');
    exception when others then null;
    end;
    perform cron.schedule('live-cleanup', '*/10 * * * *', $c$select public.live_cleanup();$c$);
  end if;
exception when others then
  raise notice 'live-cleanup cron not scheduled: %', sqlerrm;
end $$;

-- ── Flag + remote config (client falls back to bundled values when missing) ─────────────────────────
insert into public.feature_flags (key, enabled, description)
values ('live_scoring', false, 'Live match scoring: Start live scoring, projector card, scoring rules, full-screen result entry')
on conflict (key) do nothing;

insert into public.remote_config (key, value) values
  ('live_projector_base_url', '"https://sportron-live-sigma.vercel.app"'::jsonb),
  ('live_app_link', '"https://sportron.app/get"'::jsonb),
  ('live_realtime', 'true'::jsonb),
  ('live_poll_seconds', '10'::jsonb)
on conflict (key) do nothing;
