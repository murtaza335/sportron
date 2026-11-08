-- 094_add_tournament_engine_v2.sql
-- Tournaments v2 engine core: shared helpers, single-elimination refactor (behaviour UNCHANGED),
-- round-robin / league, draws, league table, new read RPCs. See docs/tournaments/PLAN-v2.md §5, §6.
--
-- Layout:
--   1. helpers  (_downstream_blocked, _reset_auto_bye, _resolve_auto_bye)
--   2. _unadvance / _advance  (side-aware: main, winners, losers, grand_final, league, group)
--   3. builders (_build_single_elim, _build_round_robin) + format stubs replaced in 095 / 097
--   4. completion (_complete_main, _complete_round_robin, dispatcher; groups / DE stubs)
--   5. generate_bracket (dispatch on format)
--   6. record_tournament_result / walkover / reset (draws, STAGE_LOCKED, _downstream_blocked)
--   7. set_module_status (+ format checks, §5.6)
--   8. _league_table, get_module_matches, get_module_standings_v2
--   9. notification body for draws
-- Internal helpers (prefixed `_`) are not granted to any client role.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Helpers
-- ───────────────────────────────────────────────────────────────────────────

-- true when a match reachable through next / loser_next is decided. Resolved auto-bye matches
-- are looked through (recurse into their own next). A `cancelled` GF2 never blocks.
create or replace function public._downstream_blocked(p_match uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m public.tournament_matches;
  n public.tournament_matches;
  v_id uuid;
begin
  select * into m from public.tournament_matches where id = p_match;
  if not found then
    return false;
  end if;
  foreach v_id in array array[m.next_match_id, m.loser_next_match_id] loop
    if v_id is null then
      continue;
    end if;
    select * into n from public.tournament_matches where id = v_id;
    if not found then
      continue;
    end if;
    if n.status in ('completed','walkover') then
      return true;
    end if;
    if n.auto_bye and n.status = 'bye' and public._downstream_blocked(n.id) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- auto-bye: a losers-bracket match that can only ever receive ONE entry resolves itself
create or replace function public._resolve_auto_bye(p_match uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n public.tournament_matches;
begin
  select * into n from public.tournament_matches where id = p_match;
  if not found or not n.auto_bye or n.status not in ('pending','scheduled') then
    return;
  end if;
  if (n.entry_a_id is null) = (n.entry_b_id is null) then
    return;   -- both empty (nothing arrived yet) or both present (cannot happen for an auto-bye)
  end if;
  update public.tournament_matches set
    status = 'bye',
    winner_entry_id = coalesce(n.entry_a_id, n.entry_b_id),
    completed_at = now(),
    recorded_by = auth.uid()
  where id = n.id;
  perform public._advance_tournament_match(n.id);
end;
$$;

-- inverse of _resolve_auto_bye: called after an entry was removed from p_match
create or replace function public._reset_auto_bye(p_match uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n public.tournament_matches;
begin
  select * into n from public.tournament_matches where id = p_match;
  if not found or not n.auto_bye or n.status <> 'bye' then
    return;
  end if;
  perform public._unadvance_tournament_match(n.id);
  update public.tournament_matches set
    status = 'pending', winner_entry_id = null, completed_at = null, recorded_by = null
  where id = n.id;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Advance / un-advance
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
  if m.bracket_side in ('league','group') then
    return;   -- nothing was pushed anywhere
  end if;
  v_w := m.winner_entry_id;
  if v_w is null then
    return;
  end if;
  v_l := case when m.entry_a_id = v_w then m.entry_b_id else m.entry_a_id end;

  if m.bracket_side = 'grand_final' then
    if m.round_number = 1 then
      update public.tournament_matches g set
        entry_a_id = null, entry_b_id = null, status = 'pending'
      where g.module_id = m.module_id and g.bracket_side = 'grand_final' and g.round_number = 2;
    end if;
    update public.tournament_modules set champion_entry_id = null, runner_up_entry_id = null
    where id = m.module_id;
    update public.tournament_entries set eliminated_side = null
    where module_id = m.module_id and eliminated_side = 'grand_final';
    return;
  end if;

  if m.next_match_id is not null then
    update public.tournament_matches n set
      entry_a_id = case when m.next_slot = 'a' and n.entry_a_id = v_w then null else n.entry_a_id end,
      entry_b_id = case when m.next_slot = 'b' and n.entry_b_id = v_w then null else n.entry_b_id end,
      status = case when n.status = 'scheduled' then 'pending' else n.status end
    where n.id = m.next_match_id;
    perform public._reset_auto_bye(m.next_match_id);
  end if;

  if m.loser_next_match_id is not null and v_l is not null then
    update public.tournament_matches n set
      entry_a_id = case when m.loser_next_slot = 'a' and n.entry_a_id = v_l then null else n.entry_a_id end,
      entry_b_id = case when m.loser_next_slot = 'b' and n.entry_b_id = v_l then null else n.entry_b_id end,
      status = case when n.status = 'scheduled' then 'pending' else n.status end
    where n.id = m.loser_next_match_id;
    perform public._reset_auto_bye(m.loser_next_match_id);
  end if;

  if v_l is not null then
    if m.bracket_side = 'main' and (m.loser_next_match_id is null or m.is_third_place) then
      update public.tournament_entries set eliminated_round = null, eliminated_side = null
      where id = v_l and eliminated_round = m.round_number;
    elsif m.bracket_side = 'losers' then
      update public.tournament_entries set eliminated_round = null, eliminated_side = null
      where id = v_l and eliminated_side = 'losers' and eliminated_round = m.round_number;
    end if;
  end if;

  if m.bracket_side = 'main' then
    if m.is_third_place then
      update public.tournament_modules set third_place_entry_id = null where id = m.module_id;
    elsif m.next_match_id is null then
      update public.tournament_modules set champion_entry_id = null, runner_up_entry_id = null
      where id = m.module_id;
    end if;
  end if;
end;
$$;

-- Push winner (and loser) forward; finish the module when everything is decided.
-- The match row must already hold its winner (null only for a drawn league/group match).
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
  v_gf2 uuid;
begin
  select * into m from public.tournament_matches where id = p_match;
  v_w := m.winner_entry_id;

  -- league / group stage: no bracket to push into; only the completion check
  if m.bracket_side in ('league','group') then
    perform public._complete_tournament_module(m.module_id);
    return;
  end if;

  if v_w is null then
    raise exception 'INVALID_STATUS';
  end if;
  v_l := case when m.entry_a_id = v_w then m.entry_b_id else m.entry_a_id end;

  -- grand final (double elimination)
  if m.bracket_side = 'grand_final' then
    select g.id into v_gf2 from public.tournament_matches g
    where g.module_id = m.module_id and g.bracket_side = 'grand_final' and g.round_number = 2;

    if m.round_number = 1 then
      if v_w = m.entry_a_id then
        -- winners-bracket champion wins: no reset needed
        update public.tournament_modules set champion_entry_id = v_w, runner_up_entry_id = v_l
        where id = m.module_id;
        update public.tournament_entries set eliminated_side = 'grand_final' where id = v_l;
        if v_gf2 is not null then
          update public.tournament_matches set status = 'cancelled', entry_a_id = null, entry_b_id = null
          where id = v_gf2;
        end if;
      elsif v_gf2 is not null then
        -- losers-bracket champion wins and a reset is allowed → play GF2
        update public.tournament_matches set
          entry_a_id = m.entry_a_id, entry_b_id = m.entry_b_id,
          status = case when scheduled_at is not null then 'scheduled' else 'pending' end
        where id = v_gf2;
      else
        update public.tournament_modules set champion_entry_id = v_w, runner_up_entry_id = v_l
        where id = m.module_id;
        update public.tournament_entries set eliminated_side = 'grand_final' where id = v_l;
      end if;
    else
      update public.tournament_modules set champion_entry_id = v_w, runner_up_entry_id = v_l
      where id = m.module_id;
      update public.tournament_entries set eliminated_side = 'grand_final' where id = v_l;
    end if;

    perform public._complete_tournament_module(m.module_id);
    return;
  end if;

  -- winner → next match slot
  if m.next_match_id is not null then
    update public.tournament_matches n set
      entry_a_id = case when m.next_slot = 'a' then v_w else n.entry_a_id end,
      entry_b_id = case when m.next_slot = 'b' then v_w else n.entry_b_id end
    where n.id = m.next_match_id;
    update public.tournament_matches n set status = 'scheduled'
    where n.id = m.next_match_id and n.status = 'pending' and n.scheduled_at is not null
      and n.entry_a_id is not null and n.entry_b_id is not null;
    perform public._resolve_auto_bye(m.next_match_id);
  end if;

  -- loser → 3rd place / losers-bracket slot
  if m.loser_next_match_id is not null and v_l is not null then
    update public.tournament_matches n set
      entry_a_id = case when m.loser_next_slot = 'a' then v_l else n.entry_a_id end,
      entry_b_id = case when m.loser_next_slot = 'b' then v_l else n.entry_b_id end
    where n.id = m.loser_next_match_id;
    update public.tournament_matches n set status = 'scheduled'
    where n.id = m.loser_next_match_id and n.status = 'pending' and n.scheduled_at is not null
      and n.entry_a_id is not null and n.entry_b_id is not null;
    perform public._resolve_auto_bye(m.loser_next_match_id);
  end if;

  -- elimination bookkeeping
  if v_l is not null then
    if m.bracket_side = 'main' and (m.loser_next_match_id is null or m.is_third_place) then
      update public.tournament_entries set eliminated_round = m.round_number, eliminated_side = 'main'
      where id = v_l;
    elsif m.bracket_side = 'losers' then
      update public.tournament_entries set eliminated_round = m.round_number, eliminated_side = 'losers'
      where id = v_l;
    end if;
  end if;

  -- terminal matches of a knockout bracket
  if m.bracket_side = 'main' then
    if m.is_third_place then
      update public.tournament_modules set third_place_entry_id = v_w where id = m.module_id;
    elsif m.next_match_id is null then
      update public.tournament_modules set champion_entry_id = v_w, runner_up_entry_id = v_l
      where id = m.module_id;
    end if;
  end if;

  perform public._complete_tournament_module(m.module_id);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Builders
-- ───────────────────────────────────────────────────────────────────────────

-- Single-elimination structure for one stage/side. p_ordered[i] = seed i. Does NOT touch
-- tournament_entries.seed. Resolves first-round byes and advances them.
create or replace function public._build_single_elim(
  p_module uuid,
  p_stage int,
  p_ordered uuid[],
  p_third boolean,
  p_labels text[] default null,
  p_side text default 'main',
  p_prefix text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int := coalesce(array_length(p_ordered, 1), 0);
  v_size int := 2;
  v_rounds int := 1;
  v_order int[];
  v_r int;
  v_remaining int;
  v_round_id uuid;
  v_name text;
  v_i int;
  v_s1 int;
  v_s2 int;
  v_a uuid;
  v_b uuid;
  v_match record;
  v_third_round uuid;
  v_third_match uuid;
  v_letter text := case p_side when 'winners' then 'W' else 'R' end;
begin
  if v_n < 2 then
    raise exception 'NOT_ENOUGH_ENTRIES';
  end if;
  while v_size < v_n loop
    v_size := v_size * 2;
    v_rounds := v_rounds + 1;
  end loop;
  v_order := public._tournament_seed_order(v_size);

  for v_r in 1..v_rounds loop
    v_remaining := v_size >> (v_r - 1);
    v_name := p_prefix || case v_remaining
      when 2 then 'Final' when 4 then 'Semi-finals' when 8 then 'Quarter-finals'
      else 'Round of ' || v_remaining end;
    insert into public.tournament_rounds (module_id, stage_number, bracket_side, round_number, is_third_place, name)
    values (p_module, p_stage, p_side, v_r, false, v_name)
    returning id into v_round_id;

    insert into public.tournament_matches
      (module_id, round_id, stage_number, bracket_side, round_number, match_number, code)
    select p_module, v_round_id, p_stage, p_side, v_r, g,
           case
             when p_side = 'main' and v_remaining = 2 then 'F'
             when p_side = 'main' and v_remaining = 4 then 'SF' || g
             when p_side = 'main' and v_remaining = 8 then 'QF' || g
             else v_letter || v_r || '-' || g
           end
    from generate_series(1, v_size >> v_r) g;
  end loop;

  -- winner path links
  update public.tournament_matches mm set
    next_match_id = nx.id,
    next_slot = case when mm.match_number % 2 = 1 then 'a' else 'b' end
  from public.tournament_matches nx
  where mm.module_id = p_module and nx.module_id = p_module
    and mm.stage_number = p_stage and nx.stage_number = p_stage
    and mm.bracket_side = p_side and nx.bracket_side = p_side
    and not mm.is_third_place and not nx.is_third_place
    and nx.round_number = mm.round_number + 1
    and nx.match_number = (mm.match_number + 1) / 2;

  -- optional 3rd-place match (main bracket only; needs semi-finals)
  if p_third and p_side = 'main' and v_rounds >= 2 then
    insert into public.tournament_rounds (module_id, stage_number, bracket_side, round_number, is_third_place, name)
    values (p_module, p_stage, 'main', v_rounds, true, '3rd Place')
    returning id into v_third_round;
    insert into public.tournament_matches
      (module_id, round_id, stage_number, bracket_side, round_number, match_number, is_third_place, code)
    values (p_module, v_third_round, p_stage, 'main', v_rounds, 1, true, '3P')
    returning id into v_third_match;

    update public.tournament_matches sf set
      loser_next_match_id = v_third_match,
      loser_next_slot = case when sf.match_number = 1 then 'a' else 'b' end
    where sf.module_id = p_module and sf.stage_number = p_stage and sf.bracket_side = 'main'
      and not sf.is_third_place and sf.round_number = v_rounds - 1;
  end if;

  -- round 1 from the seed order (seed > N = bye)
  for v_i in 1..(v_size / 2) loop
    v_s1 := v_order[2 * v_i - 1];
    v_s2 := v_order[2 * v_i];
    v_a := case when v_s1 <= v_n then p_ordered[v_s1] end;
    v_b := case when v_s2 <= v_n then p_ordered[v_s2] end;
    update public.tournament_matches set
      entry_a_id = v_a, entry_b_id = v_b,
      entry_a_label = case when p_labels is not null and v_s1 <= v_n then p_labels[v_s1] end,
      entry_b_label = case when p_labels is not null and v_s2 <= v_n then p_labels[v_s2] end
    where module_id = p_module and stage_number = p_stage and bracket_side = p_side
      and round_number = 1 and match_number = v_i and not is_third_place;
  end loop;

  -- byes advance immediately
  for v_match in
    select tm.id, tm.entry_a_id, tm.entry_b_id from public.tournament_matches tm
    where tm.module_id = p_module and tm.stage_number = p_stage and tm.bracket_side = p_side
      and tm.round_number = 1 and not tm.is_third_place
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
end;
$$;

-- Round-robin fixtures (circle method) — shared by the league and by each group.
-- Rounds are get-or-created per (stage, side, round_number) so every group shares "Matchday n".
-- match_number runs across all groups of a round; code = prefix || running number.
create or replace function public._build_round_robin(
  p_module uuid,
  p_stage int,
  p_side text,
  p_group uuid,
  p_entries uuid[],
  p_legs int,
  p_prefix text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l uuid[];
  v_n int;
  v_rounds int;
  v_leg int;
  v_r int;
  v_i int;
  v_round_no int;
  v_round_id uuid;
  v_home uuid;
  v_away uuid;
  v_last uuid;
  v_mn int;
  v_cnt int;
begin
  for v_leg in 1..greatest(p_legs, 1) loop
    v_l := p_entries;
    if coalesce(array_length(v_l, 1), 0) % 2 = 1 then
      v_l := array_append(v_l, null::uuid);
    end if;
    v_n := coalesce(array_length(v_l, 1), 0);
    if v_n < 2 then
      return;
    end if;
    v_rounds := v_n - 1;

    for v_r in 0..v_rounds - 1 loop
      v_round_no := (v_leg - 1) * v_rounds + v_r + 1;
      insert into public.tournament_rounds (module_id, stage_number, bracket_side, round_number, is_third_place, name)
      values (p_module, p_stage, p_side, v_round_no, false, 'Matchday ' || v_round_no)
      on conflict (module_id, stage_number, bracket_side, round_number, is_third_place) do nothing;
      select r.id into v_round_id from public.tournament_rounds r
      where r.module_id = p_module and r.stage_number = p_stage and r.bracket_side = p_side
        and r.round_number = v_round_no and not r.is_third_place;

      for v_i in 0..(v_n / 2 - 1) loop
        v_home := v_l[v_i + 1];
        v_away := v_l[v_n - v_i];
        if v_i = 0 and v_r % 2 = 1 then
          v_last := v_home; v_home := v_away; v_away := v_last;
        end if;
        if v_leg = 2 then
          v_last := v_home; v_home := v_away; v_away := v_last;
        end if;
        if v_home is null or v_away is null then
          continue;   -- rest slot
        end if;

        select coalesce(max(tm.match_number), 0) + 1 into v_mn from public.tournament_matches tm
        where tm.module_id = p_module and tm.stage_number = p_stage and tm.bracket_side = p_side
          and tm.round_number = v_round_no;
        select count(*) + 1 into v_cnt from public.tournament_matches tm
        where tm.module_id = p_module and tm.stage_number = p_stage and tm.bracket_side = p_side
          and (p_group is null or tm.group_id = p_group);

        insert into public.tournament_matches
          (module_id, round_id, stage_number, bracket_side, group_id, round_number, match_number,
           code, entry_a_id, entry_b_id)
        values
          (p_module, v_round_id, p_stage, p_side, p_group, v_round_no, v_mn,
           p_prefix || v_cnt, v_home, v_away);
      end loop;

      -- rotate: keep position 1 fixed, last element goes to position 2
      v_last := v_l[v_n];
      v_l := array_cat(array_append(array[v_l[1]], v_last), v_l[2:v_n - 1]);
    end loop;
  end loop;
end;
$$;

-- Stubs: replaced by 095 (groups) and 097 (double elimination).
create or replace function public._generate_groups(p_module uuid, p_ordered uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'INVALID_STATUS';
end;
$$;

create or replace function public._generate_double_elimination(p_module uuid, p_ordered uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'INVALID_STATUS';
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. League table + completion
-- ───────────────────────────────────────────────────────────────────────────

-- Rows for the league (p_group null) or for one group. Tiebreakers (B11):
-- points → head-to-head points → score diff → score for → wins → seed → name.
create or replace function public._league_table(p_module uuid, p_group uuid)
returns table (
  entry_id uuid,
  name text,
  seed int,
  played int,
  won int,
  drawn int,
  lost int,
  score_for int,
  score_against int,
  score_diff int,
  points int,
  h2h_points int,
  form text[],
  rnk int,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_pw int;
  v_pd int;
  v_pl int;
begin
  select m.points_win, m.points_draw, m.points_loss into v_pw, v_pd, v_pl
  from public.tournament_modules m where m.id = p_module;

  return query
  with ents as (
    select e.id as eid, e.name as ename, e.seed as eseed, e.status as estatus
    from public.tournament_entries e
    where e.module_id = p_module
      and (
        (p_group is null and exists (
           select 1 from public.tournament_matches tm
           where tm.module_id = p_module and tm.bracket_side = 'league'
             and (tm.entry_a_id = e.id or tm.entry_b_id = e.id)))
        or (p_group is not null and exists (
           select 1 from public.tournament_group_entries ge
           where ge.group_id = p_group and ge.entry_id = e.id))
      )
  ),
  pm as (
    select tm.id as match_id, tm.completed_at, tm.status as mstatus, tm.is_draw, tm.winner_entry_id,
           s.entry_id as pid, s.opp_id,
           case when s.side = 'a' then tm.score_a else tm.score_b end as own,
           case when s.side = 'a' then tm.score_b else tm.score_a end as opp
    from public.tournament_matches tm
    cross join lateral (values ('a', tm.entry_a_id, tm.entry_b_id), ('b', tm.entry_b_id, tm.entry_a_id))
      as s(side, entry_id, opp_id)
    where tm.module_id = p_module and tm.status in ('completed','walkover')
      and ((p_group is null and tm.bracket_side = 'league')
           or (p_group is not null and tm.bracket_side = 'group' and tm.group_id = p_group))
      and s.entry_id is not null
  ),
  res as (
    select pm.*,
           case when pm.is_draw then 'D'
                when pm.winner_entry_id = pm.pid then 'W'
                else 'L' end as r
    from pm
  ),
  agg as (
    select r.pid,
           count(*)::int as played,
           count(*) filter (where r.r = 'W')::int as won,
           count(*) filter (where r.r = 'D')::int as drawn,
           count(*) filter (where r.r = 'L')::int as lost,
           coalesce(sum(r.own) filter (where r.mstatus = 'completed'), 0)::int as sf,
           coalesce(sum(r.opp) filter (where r.mstatus = 'completed'), 0)::int as sa
    from res r group by r.pid
  ),
  pts as (
    select a.pid, (a.won * v_pw + a.drawn * v_pd + a.lost * v_pl)::int as p from agg a
  ),
  h2h as (
    select r.pid,
           sum(case r.r when 'W' then v_pw when 'D' then v_pd else v_pl end)::int as hp
    from res r
    join pts po on po.pid = r.opp_id
    join pts ps on ps.pid = r.pid
    where po.p = ps.p
    group by r.pid
  ),
  last5 as (
    select x.pid, array_agg(x.r order by x.completed_at asc nulls first, x.match_id) as f
    from (
      select r.pid, r.r, r.completed_at, r.match_id,
             row_number() over (partition by r.pid order by r.completed_at desc nulls last, r.match_id) as rn
      from res r
    ) x
    where x.rn <= 5
    group by x.pid
  ),
  base as (
    select e.eid, e.ename, e.eseed, e.estatus,
           coalesce(a.played, 0) as played, coalesce(a.won, 0) as won,
           coalesce(a.drawn, 0) as drawn, coalesce(a.lost, 0) as lost,
           coalesce(a.sf, 0) as sf, coalesce(a.sa, 0) as sa,
           coalesce(p.p, 0) as pts, coalesce(h.hp, 0) as hp,
           coalesce(l.f, '{}'::text[]) as form
    from ents e
    left join agg a on a.pid = e.eid
    left join pts p on p.pid = e.eid
    left join h2h h on h.pid = e.eid
    left join last5 l on l.pid = e.eid
  )
  select b.eid, b.ename, b.eseed, b.played, b.won, b.drawn, b.lost,
         b.sf, b.sa, (b.sf - b.sa), b.pts, b.hp, b.form,
         (row_number() over (order by b.pts desc, b.hp desc, (b.sf - b.sa) desc, b.sf desc, b.won desc,
                             b.eseed asc nulls last, lower(b.ename), b.eid))::int,
         case when b.estatus = 'withdrawn' then 'withdrawn' else 'active' end
  from base b
  order by 14;
end;
$$;

-- Single-elimination bracket of one stage. Returns true when every terminal match of that
-- stage is decided (and writes final ranks); p_finish also marks the module completed.
create or replace function public._complete_main(p_module uuid, p_stage int, p_finish boolean default true)
returns boolean
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
  if not exists (select 1 from public.tournament_matches t
                 where t.module_id = p_module and t.stage_number = p_stage and t.bracket_side = 'main') then
    return false;
  end if;
  if exists (select 1 from public.tournament_matches t
             where t.module_id = p_module and t.stage_number = p_stage and t.bracket_side = 'main'
               and t.next_match_id is null and t.status not in ('completed','walkover')) then
    return false;
  end if;
  select max(r.round_number) into v_r from public.tournament_rounds r
  where r.module_id = p_module and r.stage_number = p_stage and r.bracket_side = 'main' and not r.is_third_place;
  select * into v_third_match from public.tournament_matches t
  where t.module_id = p_module and t.stage_number = p_stage and t.bracket_side = 'main' and t.is_third_place;
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
                where t.module_id = p_module and t.stage_number = p_stage and t.bracket_side = 'main'
                  and (t.entry_a_id = e.id or t.entry_b_id = e.id));

  if p_finish then
    update public.tournament_modules set status = 'completed' where id = p_module;
  end if;
  return true;
end;
$$;

create or replace function public._complete_round_robin(p_module uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c uuid;
  v_r uuid;
  v_t uuid;
begin
  if not exists (select 1 from public.tournament_matches t
                 where t.module_id = p_module and t.bracket_side = 'league') then
    return;
  end if;
  if exists (select 1 from public.tournament_matches t
             where t.module_id = p_module and t.bracket_side = 'league'
               and t.status not in ('completed','walkover')) then
    return;
  end if;

  update public.tournament_entries e set final_rank = lt.rnk
  from public._league_table(p_module, null) lt
  where e.id = lt.entry_id;

  select lt.entry_id into v_c from public._league_table(p_module, null) lt where lt.rnk = 1;
  select lt.entry_id into v_r from public._league_table(p_module, null) lt where lt.rnk = 2;
  select lt.entry_id into v_t from public._league_table(p_module, null) lt where lt.rnk = 3;

  update public.tournament_modules set
    champion_entry_id = v_c, runner_up_entry_id = v_r, third_place_entry_id = v_t,
    status = 'completed'
  where id = p_module;
end;
$$;

-- Stubs replaced by 096 (groups + knockout) and 097 (double elimination).
create or replace function public._complete_groups_knockout(p_module uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;

create or replace function public._complete_double_elimination(p_module uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;

-- Dispatcher: called after every decided match. Cheap early returns when not finished.
create or replace function public._complete_tournament_module(p_module uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_format text;
  v_status text;
begin
  select m.format, m.status into v_format, v_status from public.tournament_modules m where m.id = p_module;
  if v_status is distinct from 'in_progress' then
    return;
  end if;
  if v_format = 'single_elimination' then
    perform public._complete_main(p_module, 1, true);
  elsif v_format = 'round_robin' then
    perform public._complete_round_robin(p_module);
  elsif v_format = 'groups_knockout' then
    perform public._complete_groups_knockout(p_module);
  elsif v_format = 'double_elimination' then
    perform public._complete_double_elimination(p_module);
  end if;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. generate_bracket (public, same signature) — dispatches on format
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
  v_ordered uuid[];
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
  if v_m.format = 'round_robin' and v_n > 20 then
    raise exception 'TOO_MANY_ENTRIES';
  end if;

  -- 1. wipe any previous structure
  delete from public.tournament_groups where module_id = p_module;
  delete from public.tournament_rounds where module_id = p_module;
  update public.tournament_entries
  set eliminated_round = null, eliminated_side = null, final_rank = null
  where module_id = p_module;
  update public.tournament_modules
  set champion_entry_id = null, runner_up_entry_id = null, third_place_entry_id = null,
      current_stage = 1
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

  select array_agg(e.id order by e.seed) into v_ordered
  from public.tournament_entries e where e.module_id = p_module and e.status = 'active';

  -- 3. structure
  if v_m.format = 'single_elimination' then
    perform public._build_single_elim(p_module, 1, v_ordered, v_m.third_place_match);
  elsif v_m.format = 'round_robin' then
    perform public._build_round_robin(p_module, 1, 'league', null, v_ordered, v_m.rr_legs, 'M');
  elsif v_m.format = 'groups_knockout' then
    perform public._generate_groups(p_module, v_ordered);
  elsif v_m.format = 'double_elimination' then
    perform public._generate_double_elimination(p_module, v_ordered);
  else
    raise exception 'INVALID_STATUS';
  end if;

  update public.tournament_modules set bracket_generated_at = now() where id = p_module;

  select count(*) into v_count from public.tournament_matches where module_id = p_module;
  return v_count;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Results
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
  v_draw boolean := false;
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
  if m.bracket_side = 'group' and v_mod.current_stage = 2 then
    raise exception 'STAGE_LOCKED';
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
  elsif m.bracket_side in ('league','group') and v_mod.allow_draws then
    v_draw := true;          -- level score in a league / group match: a draw, no winner
    v_winner := null;
  else
    if p_winner is null or p_winner not in (m.entry_a_id, m.entry_b_id) then
      raise exception 'TIE_NEEDS_WINNER';
    end if;
    v_winner := p_winner;
  end if;

  -- editing an already-decided match: downstream must be untouched
  if m.status in ('completed','walkover') then
    if public._downstream_blocked(p_match) then
      raise exception 'DOWNSTREAM_PLAYED';
    end if;
    perform public._unadvance_tournament_match(p_match);
  end if;

  update public.tournament_matches set
    status = 'completed',
    score_a = p_score_a, score_b = p_score_b, score_detail = p_score_detail,
    winner_entry_id = v_winner, is_draw = v_draw, result_note = v_note,
    recorded_by = auth.uid(), completed_at = now()
  where id = p_match;

  perform public._advance_tournament_match(p_match);

  select * into m from public.tournament_matches where id = p_match;
  return to_jsonb(m);
end;
$$;

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
  if m.bracket_side = 'group' and v_mod.current_stage = 2 then
    raise exception 'STAGE_LOCKED';
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
    if public._downstream_blocked(p_match) then
      raise exception 'DOWNSTREAM_PLAYED';
    end if;
    perform public._unadvance_tournament_match(p_match);
  end if;

  update public.tournament_matches set
    status = 'walkover',
    score_a = null, score_b = null, score_detail = null,
    winner_entry_id = p_winner, is_draw = false, result_note = v_note,
    recorded_by = auth.uid(), completed_at = now()
  where id = p_match;

  perform public._advance_tournament_match(p_match);

  select * into m from public.tournament_matches where id = p_match;
  return to_jsonb(m);
end;
$$;

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
  if m.bracket_side = 'group' and v_mod.current_stage = 2 then
    raise exception 'STAGE_LOCKED';
  end if;
  if public._downstream_blocked(p_match) then
    raise exception 'DOWNSTREAM_PLAYED';
  end if;

  perform public._unadvance_tournament_match(p_match);

  update public.tournament_matches set
    score_a = null, score_b = null, score_detail = null,
    winner_entry_id = null, is_draw = false, result_note = null, recorded_by = null, completed_at = null,
    status = case when scheduled_at is not null then 'scheduled' else 'pending' end
  where id = p_match;

  select * into m from public.tournament_matches where id = p_match;
  return to_jsonb(m);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. set_module_status: 091 rules + per-format checks on open → seeding (PLAN-v2 §5.6)
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

    if v_m.format = 'round_robin' then
      if v_active > 20 then raise exception 'TOO_MANY_ENTRIES'; end if;
    elsif v_m.format = 'groups_knockout' then
      if v_m.group_count is null then raise exception 'FIELD_INVALID:group_count'; end if;
      if v_m.advance_per_group is null then raise exception 'FIELD_INVALID:advance_per_group'; end if;
      if v_active < 2 * v_m.group_count then raise exception 'NOT_ENOUGH_ENTRIES'; end if;
      if ceil(v_active::numeric / v_m.group_count) > 8 then raise exception 'FIELD_INVALID:group_count'; end if;
      if v_m.group_count * v_m.advance_per_group < 2 then raise exception 'FIELD_INVALID:advance_per_group'; end if;
      if v_m.advance_per_group >= floor(v_active::numeric / v_m.group_count) then
        raise exception 'FIELD_INVALID:advance_per_group';
      end if;
    elsif v_m.format = 'double_elimination' then
      if v_active < 3 then raise exception 'NOT_ENOUGH_ENTRIES'; end if;
      if v_active > 64 then raise exception 'TOO_MANY_ENTRIES'; end if;
      if v_m.third_place_match then raise exception 'FIELD_INVALID:third_place_match'; end if;
    end if;
  elsif v_m.status = 'seeding' and p_status = 'in_progress' then
    if v_m.bracket_generated_at is null
       or not exists (select 1 from public.tournament_matches tm where tm.module_id = p_module) then
      raise exception 'INVALID_STATUS';
    end if;
  elsif v_m.status = 'seeding' and p_status = 'open' then
    -- deletes the generated structure (rounds cascade to matches; groups cascade group entries)
    delete from public.tournament_groups where module_id = p_module;
    delete from public.tournament_rounds where module_id = p_module;
    update public.tournament_entries
      set eliminated_round = null, eliminated_side = null, final_rank = null
      where module_id = p_module;
    update public.tournament_modules
      set bracket_generated_at = null, current_stage = 1,
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
-- 8. Reads
-- ───────────────────────────────────────────────────────────────────────────

-- get_module_matches: everything get_module_bracket returns + v2 structure columns.
create or replace function public.get_module_matches(p_module uuid)
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
  best_of int,
  stage_number int,
  bracket_side text,
  group_id uuid,
  group_letter text,
  code text,
  entry_a_label text,
  entry_b_label text,
  loser_next_match_id uuid,
  loser_next_slot text,
  is_draw boolean,
  auto_bye boolean,
  can_draw boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_draws boolean;
begin
  if auth.uid() is null or not public.can_view_module(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select m.allow_draws into v_draws from public.tournament_modules m where m.id = p_module;

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
    r.name, r.best_of,
    tm.stage_number, tm.bracket_side, tm.group_id, g.letter, tm.code,
    tm.entry_a_label, tm.entry_b_label, tm.loser_next_match_id, tm.loser_next_slot,
    tm.is_draw, tm.auto_bye,
    (coalesce(v_draws, false) and tm.bracket_side in ('league','group'))
  from public.tournament_matches tm
  join public.tournament_rounds r on r.id = tm.round_id
  left join public.tournament_entries ea on ea.id = tm.entry_a_id
  left join public.tournament_entries eb on eb.id = tm.entry_b_id
  left join public.tournament_groups g on g.id = tm.group_id
  where tm.module_id = p_module
  order by tm.stage_number,
           case tm.bracket_side when 'winners' then 1 when 'losers' then 2 when 'grand_final' then 3
                                when 'main' then 4 when 'group' then 5 else 6 end,
           tm.is_third_place, tm.round_number, tm.match_number;
end;
$$;

-- JSON helpers for standings (replaced by later migrations where noted)
create or replace function public._standings_league_rows(p_module uuid, p_group uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'rank', t.rnk, 'entry_id', t.entry_id, 'name', t.name, 'seed', t.seed,
      'profile_ids', to_jsonb(public._entry_profile_ids(t.entry_id)),
      'played', t.played, 'won', t.won, 'drawn', t.drawn, 'lost', t.lost,
      'score_for', t.score_for, 'score_against', t.score_against, 'score_diff', t.score_diff,
      'points', t.points, 'form', to_jsonb(t.form), 'status', t.status
    ) order by t.rnk), '[]'::jsonb)
  from public._league_table(p_module, p_group) t;
$$;

-- knockout rows: the v1 standings function (single elimination). 096 / 097 replace this.
create or replace function public._standings_knockout_rows(p_module uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.get_module_standings(p_module) s;
$$;

-- group tables (stub: replaced by 095)
create or replace function public._standings_groups(p_module uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select '[]'::jsonb;
$$;

create or replace function public._standings_final(p_module uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'rank', x.final_rank,
      'rank_label', case when x.shared > 1 then 'T-' || x.final_rank else x.final_rank::text end,
      'entry_id', x.id, 'name', x.name
    ) order by x.final_rank, x.name), '[]'::jsonb)
  from (
    select e.id, e.name, e.final_rank, count(*) over (partition by e.final_rank) as shared
    from public.tournament_entries e
    where e.module_id = p_module and e.final_rank is not null
  ) x;
$$;

create or replace function public.get_module_standings_v2(p_module uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_kind text;
  v_out jsonb;
begin
  if auth.uid() is null or not public.can_view_module(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module;
  v_kind := case v_m.format
    when 'round_robin' then 'league'
    when 'groups_knockout' then 'groups'
    else 'knockout' end;
  v_out := jsonb_build_object('kind', v_kind);

  if v_kind = 'knockout' then
    v_out := v_out || jsonb_build_object('rows', public._standings_knockout_rows(p_module));
  elsif v_kind = 'league' then
    v_out := v_out || jsonb_build_object('table', public._standings_league_rows(p_module, null));
  else
    v_out := v_out || jsonb_build_object('groups', public._standings_groups(p_module));
    if v_m.current_stage = 2 then
      v_out := v_out || jsonb_build_object('knockout', public._standings_knockout_rows(p_module));
    end if;
  end if;

  if v_m.status = 'completed' then
    v_out := v_out || jsonb_build_object('final', public._standings_final(p_module));
  end if;
  return v_out;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 9. Notifications: draws read "A drew with B x–x" (092 body otherwise unchanged)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.trg_tournament_match_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_tournament_status text;
  v_module_name text;
  v_round_name text;
  v_a public.tournament_entries;
  v_b public.tournament_entries;
  v_winner_name text;
  v_loser_name text;
  v_score text;
  v_when text;
  v_data jsonb;
  v_profile uuid;
  v_body text;
begin
  if NEW.entry_a_id is null or NEW.entry_b_id is null then
    return NEW;
  end if;

  select m.tournament_id, m.name, t.status
    into v_tournament_id, v_module_name, v_tournament_status
  from public.tournament_modules m
  join public.tournaments t on t.id = m.tournament_id
  where m.id = NEW.module_id;

  if v_tournament_status is distinct from 'published' then
    return NEW;
  end if;

  select r.name into v_round_name from public.tournament_rounds r where r.id = NEW.round_id;
  select * into v_a from public.tournament_entries where id = NEW.entry_a_id;
  select * into v_b from public.tournament_entries where id = NEW.entry_b_id;
  v_data := jsonb_build_object('tournamentId', v_tournament_id, 'moduleId', NEW.module_id, 'matchId', NEW.id);

  -- Scheduled (time set or changed while undecided)
  if NEW.scheduled_at is not null
     and NEW.status in ('pending','scheduled')
     and NEW.scheduled_at is distinct from OLD.scheduled_at then
    v_when := to_char(NEW.scheduled_at at time zone 'Asia/Karachi', 'Dy DD Mon, HH12:MI AM');
    for v_profile in
      select distinct p from unnest(
        public._entry_profile_ids(v_a.id) || public._entry_profile_ids(v_b.id)) p where p is not null
    loop
      perform public._tournament_notify(
        v_profile,
        'tournament_match_scheduled',
        'Match scheduled',
        coalesce(v_a.name, 'TBD') || ' vs ' || coalesce(v_b.name, 'TBD') || ' · '
          || coalesce(v_round_name, 'Match') || ' · ' || v_when || ' (PKT)'
          || coalesce(' · ' || nullif(concat_ws(' ', NEW.venue, NEW.court), ''), ''),
        v_data
      );
    end loop;
  end if;

  -- Result (status becomes decided, or the winner / draw flag changed on an edit)
  if NEW.status in ('completed','walkover')
     and (OLD.status is distinct from NEW.status
          or OLD.winner_entry_id is distinct from NEW.winner_entry_id
          or OLD.is_draw is distinct from NEW.is_draw) then
    if NEW.is_draw then
      v_body := v_a.name || ' drew with ' || v_b.name
        || case when NEW.score_a is not null and NEW.score_b is not null
                then ' ' || NEW.score_a || '–' || NEW.score_b else '' end
        || ' · ' || coalesce(v_round_name, 'Match') || ' · ' || coalesce(v_module_name, '');
    else
      if NEW.winner_entry_id = v_a.id then
        v_winner_name := v_a.name; v_loser_name := v_b.name;
      else
        v_winner_name := v_b.name; v_loser_name := v_a.name;
      end if;
      v_score := case
        when NEW.status = 'walkover' then ' (walkover)'
        when NEW.score_a is not null and NEW.score_b is not null then ' ' || NEW.score_a || '–' || NEW.score_b
        else ''
      end;
      v_body := v_winner_name || ' beat ' || v_loser_name || v_score || ' · ' || coalesce(v_round_name, 'Match')
        || ' · ' || coalesce(v_module_name, '');
    end if;
    for v_profile in
      select distinct p from unnest(
        public._entry_profile_ids(v_a.id) || public._entry_profile_ids(v_b.id)) p where p is not null
    loop
      perform public._tournament_notify(v_profile, 'tournament_match_result', 'Match result', v_body, v_data);
    end loop;
  end if;

  return NEW;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Grants
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function public._downstream_blocked(uuid) from public, anon, authenticated;
revoke all on function public._resolve_auto_bye(uuid) from public, anon, authenticated;
revoke all on function public._reset_auto_bye(uuid) from public, anon, authenticated;
revoke all on function public._unadvance_tournament_match(uuid) from public, anon, authenticated;
revoke all on function public._advance_tournament_match(uuid) from public, anon, authenticated;
revoke all on function public._build_single_elim(uuid, int, uuid[], boolean, text[], text, text) from public, anon, authenticated;
revoke all on function public._build_round_robin(uuid, int, text, uuid, uuid[], int, text) from public, anon, authenticated;
revoke all on function public._generate_groups(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public._generate_double_elimination(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public._league_table(uuid, uuid) from public, anon, authenticated;
revoke all on function public._complete_main(uuid, int, boolean) from public, anon, authenticated;
revoke all on function public._complete_round_robin(uuid) from public, anon, authenticated;
revoke all on function public._complete_groups_knockout(uuid) from public, anon, authenticated;
revoke all on function public._complete_double_elimination(uuid) from public, anon, authenticated;
revoke all on function public._complete_tournament_module(uuid) from public, anon, authenticated;
revoke all on function public._standings_league_rows(uuid, uuid) from public, anon, authenticated;
revoke all on function public._standings_knockout_rows(uuid) from public, anon, authenticated;
revoke all on function public._standings_groups(uuid) from public, anon, authenticated;
revoke all on function public._standings_final(uuid) from public, anon, authenticated;

revoke all on function public.generate_bracket(uuid) from public, anon;
revoke all on function public.record_tournament_result(uuid, int, int, jsonb, uuid, text) from public, anon;
revoke all on function public.record_tournament_walkover(uuid, uuid, text) from public, anon;
revoke all on function public.reset_tournament_match(uuid) from public, anon;
revoke all on function public.set_module_status(uuid, text) from public, anon;
revoke all on function public.get_module_matches(uuid) from public, anon;
revoke all on function public.get_module_standings_v2(uuid) from public, anon;

grant execute on function public.generate_bracket(uuid) to authenticated;
grant execute on function public.record_tournament_result(uuid, int, int, jsonb, uuid, text) to authenticated;
grant execute on function public.record_tournament_walkover(uuid, uuid, text) to authenticated;
grant execute on function public.reset_tournament_match(uuid) to authenticated;
grant execute on function public.set_module_status(uuid, text) to authenticated;
grant execute on function public.get_module_matches(uuid) to authenticated;
grant execute on function public.get_module_standings_v2(uuid) to authenticated;
