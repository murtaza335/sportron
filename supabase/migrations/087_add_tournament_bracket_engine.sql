-- 087_add_tournament_bracket_engine.sql
-- Single-elimination bracket engine (PLAN §5, §7): generate, results, walkovers, reset, schedule.
-- ADDITIVE ONLY. Internal helpers (prefixed `_`) are not granted to any client role.
-- Error codes: NOT_ALLOWED, NOT_FOUND, INVALID_STATUS, NOT_ENOUGH_ENTRIES, TIE_NEEDS_WINNER,
--              DOWNSTREAM_PLAYED, FIELD_INVALID:<name>.

-- ───────────────────────────────────────────────────────────────────────────
-- Internal: standard seed placement order for a bracket of `size` (power of two).
-- order(2) = [1,2]; order(2k) = for each s in order(k): [s, 2k+1-s]
--   size 8 → {1,8,4,5,2,7,3,6}
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._tournament_seed_order(p_size int)
returns int[]
language plpgsql
immutable
as $$
declare
  v_order int[] := array[1, 2];
  v_k int := 2;
  v_next int[];
  s int;
begin
  if p_size < 2 or (p_size & (p_size - 1)) <> 0 then
    raise exception 'FIELD_INVALID:size';
  end if;
  while v_k < p_size loop
    v_next := '{}';
    foreach s in array v_order loop
      v_next := v_next || s || (2 * v_k + 1 - s);
    end loop;
    v_order := v_next;
    v_k := v_k * 2;
  end loop;
  return v_order;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Internal: undo the advancement of a decided match (used by edits and resets).
-- Callers must already have verified that downstream matches are undecided.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._unadvance_tournament_match(p_match uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.tournament_matches;
  v_w uuid;
  v_l uuid;
begin
  select * into m from public.tournament_matches where id = p_match;
  v_w := m.winner_entry_id;
  if v_w is null then
    return;
  end if;
  v_l := case when m.entry_a_id = v_w then m.entry_b_id else m.entry_a_id end;

  if m.next_match_id is not null then
    update public.tournament_matches n set
      entry_a_id = case when m.next_slot = 'a' and n.entry_a_id = v_w then null else n.entry_a_id end,
      entry_b_id = case when m.next_slot = 'b' and n.entry_b_id = v_w then null else n.entry_b_id end,
      status = case when n.status = 'scheduled' then 'pending' else n.status end
    where n.id = m.next_match_id;
  end if;

  if m.loser_next_match_id is not null and v_l is not null then
    update public.tournament_matches n set
      entry_a_id = case when m.loser_next_slot = 'a' and n.entry_a_id = v_l then null else n.entry_a_id end,
      entry_b_id = case when m.loser_next_slot = 'b' and n.entry_b_id = v_l then null else n.entry_b_id end,
      status = case when n.status = 'scheduled' then 'pending' else n.status end
    where n.id = m.loser_next_match_id;
  end if;

  if v_l is not null and (m.loser_next_match_id is null or m.is_third_place) then
    update public.tournament_entries set eliminated_round = null
    where id = v_l and eliminated_round = m.round_number;
  end if;

  if m.is_third_place then
    update public.tournament_modules set third_place_entry_id = null where id = m.module_id;
  elsif m.next_match_id is null then
    update public.tournament_modules set champion_entry_id = null, runner_up_entry_id = null
    where id = m.module_id;
  end if;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Internal: push winner (and loser → 3rd place) forward; finish the module when all
-- terminal matches are decided. The match row must already hold its winner.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._advance_tournament_match(p_match uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.tournament_matches;
  v_w uuid;
  v_l uuid;
begin
  select * into m from public.tournament_matches where id = p_match;
  v_w := m.winner_entry_id;
  if v_w is null then
    raise exception 'INVALID_STATUS';
  end if;
  v_l := case when m.entry_a_id = v_w then m.entry_b_id else m.entry_a_id end;

  -- winner → next match slot
  if m.next_match_id is not null then
    update public.tournament_matches n set
      entry_a_id = case when m.next_slot = 'a' then v_w else n.entry_a_id end,
      entry_b_id = case when m.next_slot = 'b' then v_w else n.entry_b_id end
    where n.id = m.next_match_id;
    update public.tournament_matches n set status = 'scheduled'
    where n.id = m.next_match_id and n.status = 'pending' and n.scheduled_at is not null
      and n.entry_a_id is not null and n.entry_b_id is not null;
  end if;

  -- loser → 3rd place slot
  if m.loser_next_match_id is not null and v_l is not null then
    update public.tournament_matches n set
      entry_a_id = case when m.loser_next_slot = 'a' then v_l else n.entry_a_id end,
      entry_b_id = case when m.loser_next_slot = 'b' then v_l else n.entry_b_id end
    where n.id = m.loser_next_match_id;
    update public.tournament_matches n set status = 'scheduled'
    where n.id = m.loser_next_match_id and n.status = 'pending' and n.scheduled_at is not null
      and n.entry_a_id is not null and n.entry_b_id is not null;
  end if;

  -- loser elimination (SF losers feeding a 3rd-place match are eliminated when that resolves)
  if v_l is not null and (m.loser_next_match_id is null or m.is_third_place) then
    update public.tournament_entries set eliminated_round = m.round_number where id = v_l;
  end if;

  -- terminal matches
  if m.is_third_place then
    update public.tournament_modules set third_place_entry_id = v_w where id = m.module_id;
  elsif m.next_match_id is null then
    update public.tournament_modules set champion_entry_id = v_w, runner_up_entry_id = v_l
    where id = m.module_id;
  end if;

  -- any terminal match (final or 3rd place) may be the last one decided
  if m.next_match_id is null then
    perform public._complete_tournament_module(m.module_id);
  end if;
end;
$$;

-- Completion pass: no-op until every terminal match is decided; then final ranks + status.
create or replace function public._complete_tournament_module(p_module uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r int;
  v_champ uuid;
  v_runner uuid;
  v_third uuid;
  v_fourth uuid;
  v_third_match public.tournament_matches;
  v_has_third boolean;
begin
  if exists (select 1 from public.tournament_matches t
             where t.module_id = p_module and t.next_match_id is null
               and t.status not in ('completed','walkover')) then
    return;
  end if;
  select max(r.round_number) into v_r from public.tournament_rounds r
  where r.module_id = p_module and not r.is_third_place;
  select * into v_third_match from public.tournament_matches t
  where t.module_id = p_module and t.is_third_place;
  v_has_third := found;
  select champion_entry_id, runner_up_entry_id, third_place_entry_id
    into v_champ, v_runner, v_third from public.tournament_modules where id = p_module;
  v_fourth := null;
  if v_has_third then
    v_fourth := case when v_third_match.entry_a_id = v_third_match.winner_entry_id
                     then v_third_match.entry_b_id else v_third_match.entry_a_id end;
  end if;

  update public.tournament_entries e set final_rank = case
      when e.id = v_champ then 1
      when e.id = v_runner then 2
      when v_has_third and e.id = v_third then 3
      when v_has_third and e.id = v_fourth then 4
      when e.eliminated_round is not null then power(2, v_r - e.eliminated_round)::int + 1
      else null end
  where e.module_id = p_module
    and exists (select 1 from public.tournament_matches t
                where t.module_id = p_module and (t.entry_a_id = e.id or t.entry_b_id = e.id));

  update public.tournament_modules set status = 'completed' where id = p_module;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- generate_bracket(p_module) → number of matches created
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.generate_bracket(p_module uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_n int;
  v_size int;
  v_rounds int;
  v_order int[];
  v_r int;
  v_round_id uuid;
  v_third_round uuid;
  v_third_match uuid;
  v_remaining int;
  v_name text;
  v_i int;
  v_a uuid;
  v_b uuid;
  v_match record;
  v_count int;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module for update;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.status <> 'seeding' then
    raise exception 'INVALID_STATUS';
  end if;

  select count(*) into v_n from public.tournament_entries e
  where e.module_id = p_module and e.status = 'active';
  if v_n < 2 then
    raise exception 'NOT_ENOUGH_ENTRIES';
  end if;

  -- 1. wipe any previous bracket
  delete from public.tournament_rounds where module_id = p_module;
  update public.tournament_entries set eliminated_round = null, final_rank = null
  where module_id = p_module;
  update public.tournament_modules
  set champion_entry_id = null, runner_up_entry_id = null, third_place_entry_id = null
  where id = p_module;

  -- 2. final seed order → write back as seed 1..N
  update public.tournament_entries e set seed = o.rn
  from (
    select x.id, row_number() over (order by x.sort_unseeded, x.seed, x.rnd, x.created_at) as rn
    from (
      select t.id, t.seed, t.created_at,
             (t.seed is null) as sort_unseeded,
             case when v_m.seeding_method = 'random' and t.seed is null then random() else 0 end as rnd
      from public.tournament_entries t
      where t.module_id = p_module and t.status = 'active'
    ) x
  ) o
  where e.id = o.id;

  -- 3. sizes
  v_size := 2;
  v_rounds := 1;
  while v_size < v_n loop
    v_size := v_size * 2;
    v_rounds := v_rounds + 1;
  end loop;
  v_order := public._tournament_seed_order(v_size);

  -- 4. rounds + matches
  for v_r in 1..v_rounds loop
    v_remaining := v_size >> (v_r - 1);
    v_name := case v_remaining
      when 2 then 'Final' when 4 then 'Semi-finals' when 8 then 'Quarter-finals'
      else 'Round of ' || v_remaining end;
    insert into public.tournament_rounds (module_id, round_number, is_third_place, name)
    values (p_module, v_r, false, v_name)
    returning id into v_round_id;

    insert into public.tournament_matches (module_id, round_id, round_number, match_number)
    select p_module, v_round_id, v_r, g from generate_series(1, v_size >> v_r) g;
  end loop;

  -- next-match links (winner path)
  update public.tournament_matches mm set
    next_match_id = nx.id,
    next_slot = case when mm.match_number % 2 = 1 then 'a' else 'b' end
  from public.tournament_matches nx
  where mm.module_id = p_module and nx.module_id = p_module
    and not mm.is_third_place and not nx.is_third_place
    and nx.round_number = mm.round_number + 1
    and nx.match_number = (mm.match_number + 1) / 2;

  -- optional 3rd-place match (needs semi-finals, i.e. at least 2 rounds)
  if v_m.third_place_match and v_rounds >= 2 then
    insert into public.tournament_rounds (module_id, round_number, is_third_place, name)
    values (p_module, v_rounds, true, '3rd Place')
    returning id into v_third_round;
    insert into public.tournament_matches (module_id, round_id, round_number, match_number, is_third_place)
    values (p_module, v_third_round, v_rounds, 1, true)
    returning id into v_third_match;

    update public.tournament_matches sf set
      loser_next_match_id = v_third_match,
      loser_next_slot = case when sf.match_number = 1 then 'a' else 'b' end
    where sf.module_id = p_module and not sf.is_third_place and sf.round_number = v_rounds - 1;
  end if;

  -- 5. fill round 1 from the seed order (seed > N = bye)
  for v_i in 1..(v_size / 2) loop
    select e.id into v_a from public.tournament_entries e
      where e.module_id = p_module and e.status = 'active' and e.seed = v_order[2 * v_i - 1];
    select e.id into v_b from public.tournament_entries e
      where e.module_id = p_module and e.status = 'active' and e.seed = v_order[2 * v_i];
    update public.tournament_matches set entry_a_id = v_a, entry_b_id = v_b
    where module_id = p_module and round_number = 1 and match_number = v_i and not is_third_place;
  end loop;

  -- 6. byes advance immediately
  for v_match in
    select tm.id, tm.entry_a_id, tm.entry_b_id from public.tournament_matches tm
    where tm.module_id = p_module and tm.round_number = 1 and not tm.is_third_place
      and ((tm.entry_a_id is null) <> (tm.entry_b_id is null))
    order by tm.match_number
  loop
    update public.tournament_matches set
      status = 'bye',
      winner_entry_id = coalesce(v_match.entry_a_id, v_match.entry_b_id),
      completed_at = now(),
      recorded_by = auth.uid()
    where id = v_match.id;
    perform public._advance_tournament_match(v_match.id);
  end loop;

  update public.tournament_modules set bracket_generated_at = now() where id = p_module;

  select count(*) into v_count from public.tournament_matches where module_id = p_module;
  return v_count;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- record_tournament_result
-- ───────────────────────────────────────────────────────────────────────────
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
  m public.tournament_matches;
  v_mod public.tournament_modules;
  v_winner uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into m from public.tournament_matches where id = p_match for update;
  if not found or auth.uid() is null or not public.is_module_admin(m.module_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_mod from public.tournament_modules where id = m.module_id for update;
  perform public._tournament_assert_writable(v_mod.tournament_id);
  if v_mod.status <> 'in_progress' then
    raise exception 'INVALID_STATUS';
  end if;
  if m.status in ('bye','cancelled') or m.entry_a_id is null or m.entry_b_id is null then
    raise exception 'INVALID_STATUS';
  end if;
  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0 then
    raise exception 'FIELD_INVALID:score';
  end if;
  if p_score_detail is not null and jsonb_typeof(p_score_detail) <> 'array' then
    raise exception 'FIELD_INVALID:score_detail';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'FIELD_INVALID:result_note';
  end if;

  if p_score_a > p_score_b then
    v_winner := m.entry_a_id;
  elsif p_score_b > p_score_a then
    v_winner := m.entry_b_id;
  else
    if p_winner is null or p_winner not in (m.entry_a_id, m.entry_b_id) then
      raise exception 'TIE_NEEDS_WINNER';
    end if;
    v_winner := p_winner;
  end if;

  -- editing an already-decided match: downstream must be untouched
  if m.status in ('completed','walkover') then
    if exists (select 1 from public.tournament_matches n
               where n.id in (m.next_match_id, m.loser_next_match_id)
                 and n.status in ('completed','walkover')) then
      raise exception 'DOWNSTREAM_PLAYED';
    end if;
    perform public._unadvance_tournament_match(p_match);
  end if;

  update public.tournament_matches set
    status = 'completed',
    score_a = p_score_a, score_b = p_score_b, score_detail = p_score_detail,
    winner_entry_id = v_winner, result_note = v_note,
    recorded_by = auth.uid(), completed_at = now()
  where id = p_match;

  perform public._advance_tournament_match(p_match);

  select * into m from public.tournament_matches where id = p_match;
  return to_jsonb(m);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- record_tournament_walkover
--   Deviation from PLAN §5.4: BOTH entries must be present. A one-sided walkover would let the
--   still-undecided feeder match later push an entry into the empty slot and corrupt the bracket.
--   (If an entry drops out, record the walkover on the match where it faces its opponent.)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.record_tournament_walkover(
  p_match uuid,
  p_winner uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.tournament_matches;
  v_mod public.tournament_modules;
  v_note text := coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Walkover');
begin
  select * into m from public.tournament_matches where id = p_match for update;
  if not found or auth.uid() is null or not public.is_module_admin(m.module_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_mod from public.tournament_modules where id = m.module_id for update;
  perform public._tournament_assert_writable(v_mod.tournament_id);
  if v_mod.status <> 'in_progress' then
    raise exception 'INVALID_STATUS';
  end if;
  if m.status in ('bye','cancelled') or m.entry_a_id is null or m.entry_b_id is null then
    raise exception 'INVALID_STATUS';
  end if;
  if p_winner is null or p_winner not in (m.entry_a_id, m.entry_b_id) then
    raise exception 'FIELD_INVALID:winner';
  end if;
  if char_length(v_note) > 200 then
    raise exception 'FIELD_INVALID:result_note';
  end if;

  if m.status in ('completed','walkover') then
    if exists (select 1 from public.tournament_matches n
               where n.id in (m.next_match_id, m.loser_next_match_id)
                 and n.status in ('completed','walkover')) then
      raise exception 'DOWNSTREAM_PLAYED';
    end if;
    perform public._unadvance_tournament_match(p_match);
  end if;

  update public.tournament_matches set
    status = 'walkover',
    score_a = null, score_b = null, score_detail = null,
    winner_entry_id = p_winner, result_note = v_note,
    recorded_by = auth.uid(), completed_at = now()
  where id = p_match;

  perform public._advance_tournament_match(p_match);

  select * into m from public.tournament_matches where id = p_match;
  return to_jsonb(m);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- reset_tournament_match
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.reset_tournament_match(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.tournament_matches;
  v_mod public.tournament_modules;
begin
  select * into m from public.tournament_matches where id = p_match for update;
  if not found or auth.uid() is null or not public.is_module_admin(m.module_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_mod from public.tournament_modules where id = m.module_id for update;
  perform public._tournament_assert_writable(v_mod.tournament_id);
  if v_mod.status <> 'in_progress' or m.status not in ('completed','walkover') then
    raise exception 'INVALID_STATUS';
  end if;
  if exists (select 1 from public.tournament_matches n
             where n.id in (m.next_match_id, m.loser_next_match_id)
               and n.status in ('completed','walkover')) then
    raise exception 'DOWNSTREAM_PLAYED';
  end if;

  perform public._unadvance_tournament_match(p_match);

  update public.tournament_matches set
    score_a = null, score_b = null, score_detail = null,
    winner_entry_id = null, result_note = null, recorded_by = null, completed_at = null,
    status = case when scheduled_at is not null then 'scheduled' else 'pending' end
  where id = p_match;

  select * into m from public.tournament_matches where id = p_match;
  return to_jsonb(m);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- schedule_tournament_match
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.schedule_tournament_match(
  p_match uuid,
  p_at timestamptz,
  p_venue text default null,
  p_court text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.tournament_matches;
  v_mod public.tournament_modules;
  v_venue text := nullif(btrim(coalesce(p_venue, '')), '');
  v_court text := nullif(btrim(coalesce(p_court, '')), '');
begin
  select * into m from public.tournament_matches where id = p_match for update;
  if not found or auth.uid() is null or not public.is_module_admin(m.module_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_mod from public.tournament_modules where id = m.module_id;
  perform public._tournament_assert_writable(v_mod.tournament_id);
  if v_mod.status not in ('seeding','in_progress') or m.status not in ('pending','scheduled') then
    raise exception 'INVALID_STATUS';
  end if;
  if v_venue is not null and char_length(v_venue) > 120 then
    raise exception 'FIELD_INVALID:venue';
  end if;
  if v_court is not null and char_length(v_court) > 40 then
    raise exception 'FIELD_INVALID:court';
  end if;

  update public.tournament_matches set
    scheduled_at = p_at, venue = v_venue, court = v_court,
    status = case when p_at is not null and entry_a_id is not null and entry_b_id is not null
                  then 'scheduled' else 'pending' end
  where id = p_match;

  select * into m from public.tournament_matches where id = p_match;
  return to_jsonb(m);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Grants
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function public._tournament_seed_order(int) from public, anon, authenticated;
revoke all on function public._unadvance_tournament_match(uuid) from public, anon, authenticated;
revoke all on function public._advance_tournament_match(uuid) from public, anon, authenticated;
revoke all on function public._complete_tournament_module(uuid) from public, anon, authenticated;

revoke all on function public.generate_bracket(uuid) from public, anon;
revoke all on function public.record_tournament_result(uuid, int, int, jsonb, uuid, text) from public, anon;
revoke all on function public.record_tournament_walkover(uuid, uuid, text) from public, anon;
revoke all on function public.reset_tournament_match(uuid) from public, anon;
revoke all on function public.schedule_tournament_match(uuid, timestamptz, text, text) from public, anon;

grant execute on function public.generate_bracket(uuid) to authenticated;
grant execute on function public.record_tournament_result(uuid, int, int, jsonb, uuid, text) to authenticated;
grant execute on function public.record_tournament_walkover(uuid, uuid, text) to authenticated;
grant execute on function public.reset_tournament_match(uuid) to authenticated;
grant execute on function public.schedule_tournament_match(uuid, timestamptz, text, text) to authenticated;
