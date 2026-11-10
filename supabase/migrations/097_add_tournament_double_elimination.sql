-- 097_add_tournament_double_elimination.sql
-- Tournaments v2: double elimination (winners bracket + losers bracket + grand final with optional reset).
-- See docs/tournaments/PLAN-v2.md §5.4. The shared advance / un-advance / auto-bye logic already lives in 094;
-- this migration adds the generator, the completion rule and the standings rows.

-- ───────────────────────────────────────────────────────────────────────────
-- Generator (replaces the 094 stub)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._generate_double_elimination(p_module uuid, p_ordered uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_n int := coalesce(array_length(p_ordered, 1), 0);
  v_s int := 2;
  v_k int := 1;
  v_lb int;
  v_r int;
  v_j int;
  v_cnt int;
  v_round_id uuid;
  v_gf1 uuid;
  v_gf2 uuid;
  v_x record;
  v_changed boolean;
begin
  select * into v_m from public.tournament_modules where id = p_module;
  if v_n < 3 then
    raise exception 'NOT_ENOUGH_ENTRIES';
  end if;
  if v_n > 64 then
    raise exception 'TOO_MANY_ENTRIES';
  end if;
  while v_s < v_n loop
    v_s := v_s * 2;
    v_k := v_k + 1;
  end loop;

  -- winners bracket: a normal single-elimination tree on side 'winners' (byes already advanced)
  perform public._build_single_elim(p_module, 1, p_ordered, false, null, 'winners', 'WB ');

  -- losers bracket: 2(k-1) rounds; round r has S / 2^(ceil(r/2)+1) matches
  v_lb := 2 * (v_k - 1);
  for v_r in 1..v_lb loop
    v_cnt := v_s >> (((v_r + 1) / 2) + 1);
    insert into public.tournament_rounds (module_id, stage_number, bracket_side, round_number, is_third_place, name)
    values (p_module, 1, 'losers', v_r, false, case when v_r = v_lb then 'LB Final' else 'LB Round ' || v_r end)
    returning id into v_round_id;
    insert into public.tournament_matches (module_id, round_id, stage_number, bracket_side, round_number, match_number, code)
    select p_module, v_round_id, 1, 'losers', v_r, g, 'L' || v_r || '-' || g from generate_series(1, v_cnt) g;
  end loop;

  -- grand final (+ optional reset)
  insert into public.tournament_rounds (module_id, stage_number, bracket_side, round_number, is_third_place, name)
  values (p_module, 1, 'grand_final', 1, false, 'Grand Final') returning id into v_round_id;
  insert into public.tournament_matches (module_id, round_id, stage_number, bracket_side, round_number, match_number, code)
  values (p_module, v_round_id, 1, 'grand_final', 1, 1, 'GF') returning id into v_gf1;
  if v_m.grand_final_reset then
    insert into public.tournament_rounds (module_id, stage_number, bracket_side, round_number, is_third_place, name)
    values (p_module, 1, 'grand_final', 2, false, 'Grand Final — Reset') returning id into v_round_id;
    insert into public.tournament_matches (module_id, round_id, stage_number, bracket_side, round_number, match_number, code)
    values (p_module, v_round_id, 1, 'grand_final', 2, 1, 'GF2') returning id into v_gf2;
    update public.tournament_matches set next_match_id = v_gf2 where id = v_gf1;
  end if;

  -- links inside the losers bracket
  for v_r in 1..v_lb loop
    if v_r % 2 = 1 then
      -- odd round: winner meets a dropped-in winners-bracket loser in the next round (same match number, slot a)
      update public.tournament_matches lb set next_match_id = nx.id, next_slot = 'a'
      from public.tournament_matches nx
      where lb.module_id = p_module and lb.bracket_side = 'losers' and lb.round_number = v_r
        and nx.module_id = p_module and nx.bracket_side = 'losers' and nx.round_number = v_r + 1
        and nx.match_number = lb.match_number;
    elsif v_r < v_lb then
      -- even round: winners pair up (halving)
      update public.tournament_matches lb set
        next_match_id = nx.id,
        next_slot = case when lb.match_number % 2 = 1 then 'a' else 'b' end
      from public.tournament_matches nx
      where lb.module_id = p_module and lb.bracket_side = 'losers' and lb.round_number = v_r
        and nx.module_id = p_module and nx.bracket_side = 'losers' and nx.round_number = v_r + 1
        and nx.match_number = (lb.match_number + 1) / 2;
    else
      update public.tournament_matches set next_match_id = v_gf1, next_slot = 'b'
      where module_id = p_module and bracket_side = 'losers' and round_number = v_r;
    end if;
  end loop;

  -- winners-bracket final winner → grand final slot a
  update public.tournament_matches set next_match_id = v_gf1, next_slot = 'a'
  where module_id = p_module and bracket_side = 'winners' and round_number = v_k;

  -- winners-bracket losers drop into the losers bracket (byes have no loser → no link)
  update public.tournament_matches wb set
    loser_next_match_id = lb.id,
    loser_next_slot = case when wb.match_number % 2 = 1 then 'a' else 'b' end
  from public.tournament_matches lb
  where wb.module_id = p_module and wb.bracket_side = 'winners' and wb.round_number = 1 and wb.status <> 'bye'
    and lb.module_id = p_module and lb.bracket_side = 'losers' and lb.round_number = 1
    and lb.match_number = (wb.match_number + 1) / 2;

  for v_j in 1..v_k - 1 loop
    select count(*) into v_cnt from public.tournament_matches
    where module_id = p_module and bracket_side = 'losers' and round_number = 2 * v_j;
    update public.tournament_matches wb set loser_next_match_id = lb.id, loser_next_slot = 'b'
    from public.tournament_matches lb
    where wb.module_id = p_module and wb.bracket_side = 'winners' and wb.round_number = v_j + 1
      and lb.module_id = p_module and lb.bracket_side = 'losers' and lb.round_number = 2 * v_j
      and lb.match_number = case when v_j % 2 = 1 then v_cnt - wb.match_number + 1 else wb.match_number end;
  end loop;

  -- dead slots: a winners-round-1 bye never produces a loser. Mark the slot it would have fed ('BYE').
  for v_x in
    select wb.match_number from public.tournament_matches wb
    where wb.module_id = p_module and wb.bracket_side = 'winners' and wb.round_number = 1 and wb.status = 'bye'
  loop
    update public.tournament_matches set
      entry_a_label = case when v_x.match_number % 2 = 1 then 'BYE' else entry_a_label end,
      entry_b_label = case when v_x.match_number % 2 = 0 then 'BYE' else entry_b_label end
    where module_id = p_module and bracket_side = 'losers' and round_number = 1
      and match_number = (v_x.match_number + 1) / 2;
  end loop;

  -- a losers match with BOTH slots dead is deleted and the slot it fed becomes dead; repeat until stable
  loop
    v_changed := false;
    for v_x in
      select lb.id, lb.next_match_id, lb.next_slot from public.tournament_matches lb
      where lb.module_id = p_module and lb.bracket_side = 'losers'
        and lb.entry_a_label = 'BYE' and lb.entry_b_label = 'BYE'
    loop
      if v_x.next_match_id is not null then
        update public.tournament_matches set
          entry_a_label = case when v_x.next_slot = 'a' then 'BYE' else entry_a_label end,
          entry_b_label = case when v_x.next_slot = 'b' then 'BYE' else entry_b_label end
        where id = v_x.next_match_id;
      end if;
      delete from public.tournament_matches where id = v_x.id;
      v_changed := true;
    end loop;
    exit when not v_changed;
  end loop;

  -- exactly one dead slot → the match resolves itself when its single entry arrives
  update public.tournament_matches set auto_bye = true
  where module_id = p_module and bracket_side = 'losers'
    and (coalesce(entry_a_label, '') = 'BYE') <> (coalesce(entry_b_label, '') = 'BYE');

  -- slot labels for every still-empty slot that a match feeds
  update public.tournament_matches n set entry_a_label = f.lbl
  from (
    select s.next_match_id as tgt, s.next_slot as slot, 'Winner ' || s.code as lbl
    from public.tournament_matches s
    where s.module_id = p_module and s.next_match_id is not null and s.next_slot is not null
    union all
    select s.loser_next_match_id, s.loser_next_slot, 'Loser ' || s.code
    from public.tournament_matches s
    where s.module_id = p_module and s.loser_next_match_id is not null and s.loser_next_slot is not null
  ) f
  where n.id = f.tgt and f.slot = 'a' and n.entry_a_id is null and n.entry_a_label is null;

  update public.tournament_matches n set entry_b_label = f.lbl
  from (
    select s.next_match_id as tgt, s.next_slot as slot, 'Winner ' || s.code as lbl
    from public.tournament_matches s
    where s.module_id = p_module and s.next_match_id is not null and s.next_slot is not null
    union all
    select s.loser_next_match_id, s.loser_next_slot, 'Loser ' || s.code
    from public.tournament_matches s
    where s.module_id = p_module and s.loser_next_match_id is not null and s.loser_next_slot is not null
  ) f
  where n.id = f.tgt and f.slot = 'b' and n.entry_b_id is null and n.entry_b_label is null;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Completion (replaces the 094 stub): the champion is set by the grand-final logic in _advance.
-- Ranks: champion 1, runner-up 2, then by losers-bracket round of elimination (shared within a round).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._complete_double_elimination(p_module uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_champ uuid;
  v_runner uuid;
begin
  select m.champion_entry_id, m.runner_up_entry_id into v_champ, v_runner
  from public.tournament_modules m where m.id = p_module;
  if v_champ is null then
    return;
  end if;

  update public.tournament_entries e set final_rank = case
      when e.id = v_champ then 1
      when e.id = v_runner then 2
      when e.eliminated_side = 'losers' then 3 + (
        select count(*) from public.tournament_entries o
        where o.module_id = p_module and o.eliminated_side = 'losers' and o.eliminated_round > e.eliminated_round)
      else null end
  where e.module_id = p_module
    and exists (select 1 from public.tournament_matches t
                where t.module_id = p_module and (t.entry_a_id = e.id or t.entry_b_id = e.id));

  update public.tournament_modules set
    third_place_entry_id = (select e.id from public.tournament_entries e
                            where e.module_id = p_module and e.final_rank = 3 limit 1),
    status = 'completed'
  where id = p_module;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Standings rows for double elimination (same shape as the v1 rows + losses / eliminated_side)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._standings_de_rows(p_module uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  with mdl as (
    select m.* from public.tournament_modules m where m.id = p_module
  ),
  mt as (
    select tm.*, r.name as rname,
           case tm.bracket_side when 'grand_final' then 3 when 'losers' then 2 else 1 end as prio
    from public.tournament_matches tm
    join public.tournament_rounds r on r.id = tm.round_id
    where tm.module_id = p_module and tm.status <> 'cancelled'
  ),
  ents as (
    select e.* from public.tournament_entries e
    where e.module_id = p_module
      and exists (select 1 from mt where mt.entry_a_id = e.id or mt.entry_b_id = e.id)
  ),
  played_m as (
    select mt.id as match_id, mt.status as mstatus, mt.winner_entry_id, mt.round_number, s.entry_id,
           case when s.side = 'a' then mt.score_a else mt.score_b end as own,
           case when s.side = 'a' then mt.score_b else mt.score_a end as opp
    from mt
    cross join lateral (values ('a', mt.entry_a_id), ('b', mt.entry_b_id)) as s(side, entry_id)
    where mt.status in ('completed','walkover') and s.entry_id is not null
  ),
  agg as (
    select pm.entry_id,
           count(*)::int as played,
           count(*) filter (where pm.winner_entry_id = pm.entry_id)::int as won,
           count(*) filter (where pm.winner_entry_id is distinct from pm.entry_id)::int as lost,
           coalesce(sum(pm.own) filter (where pm.mstatus = 'completed'), 0)::int as sf,
           coalesce(sum(pm.opp) filter (where pm.mstatus = 'completed'), 0)::int as sa
    from played_m pm group by pm.entry_id
  ),
  reach as (
    select x.entry_id,
           (array_agg(x.rname order by x.prio desc, x.round_number desc))[1] as reached_label,
           max(x.round_number) as rr
    from (
      select mt.entry_a_id as entry_id, mt.rname, mt.prio, mt.round_number from mt where mt.entry_a_id is not null
      union all
      select mt.entry_b_id, mt.rname, mt.prio, mt.round_number from mt where mt.entry_b_id is not null
    ) x group by x.entry_id
  ),
  lost_to as (
    select distinct on (pm.entry_id) pm.entry_id, w.name as by_name
    from played_m pm
    join public.tournament_entries w on w.id = pm.winner_entry_id
    where pm.winner_entry_id is distinct from pm.entry_id
    order by pm.entry_id, pm.match_id desc
  ),
  rows_ as (
    select
      e.id as entry_id, e.name, e.seed, e.profile_id, e.final_rank, e.eliminated_round, e.eliminated_side,
      coalesce(a.played, 0) as played, coalesce(a.won, 0) as won, coalesce(a.lost, 0) as lost,
      coalesce(a.sf, 0) as sf, coalesce(a.sa, 0) as sa,
      rc.rr as reached_round,
      case when e.id = (select champion_entry_id from mdl) then 'Champion' else rc.reached_label end as reached_label,
      case
        when e.id = (select champion_entry_id from mdl) then 'champion'
        when e.status = 'withdrawn' then 'withdrawn'
        when e.eliminated_side is not null or e.final_rank is not null then 'eliminated'
        else 'alive'
      end as pstatus,
      lt.by_name
    from ents e
    left join agg a on a.entry_id = e.id
    left join reach rc on rc.entry_id = e.id
    left join lost_to lt on lt.entry_id = e.id
  ),
  ranked as (
    select r.*,
      case
        when r.final_rank is not null and (select m.status from mdl m) = 'completed' then r.final_rank
        else rank() over (
          order by (case when r.pstatus in ('champion','alive') then 0 else 1 end),
                   (case when r.eliminated_side = 'grand_final' then 0 else 1 end),
                   r.eliminated_round desc nulls first)
      end as rnk,
      (r.sf - r.sa) as sd
    from rows_ r
  ),
  labelled as (
    select k.*,
      count(*) over (partition by k.rnk) as shared,
      (select m.status from mdl m) as mod_status
    from ranked k
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'rank', l.rnk,
      'rank_label', case
        when l.mod_status <> 'completed' and l.pstatus in ('alive','champion') then '-'
        when l.shared > 1 then 'T-' || l.rnk
        else l.rnk::text end,
      'entry_id', l.entry_id, 'name', l.name, 'seed', l.seed, 'profile_id', l.profile_id,
      'played', l.played, 'won', l.won, 'lost', l.lost, 'losses', l.lost,
      'score_for', l.sf, 'score_against', l.sa, 'score_diff', l.sd,
      'reached_round', l.reached_round, 'reached_label', l.reached_label,
      'status', l.pstatus, 'eliminated_by', l.by_name, 'eliminated_side', l.eliminated_side
    ) order by l.rnk, l.lost, l.sd desc, l.sf desc, l.seed asc nulls last, l.name), '[]'::jsonb)
  into v_out
  from labelled l;
  return v_out;
end;
$$;

create or replace function public._standings_knockout_rows(p_module uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_format text;
begin
  select m.format into v_format from public.tournament_modules m where m.id = p_module;
  if v_format = 'groups_knockout' then
    return public._standings_main_rows(p_module, 2);
  elsif v_format = 'double_elimination' then
    return public._standings_de_rows(p_module);
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.get_module_standings(p_module) s);
end;
$$;

revoke all on function public._generate_double_elimination(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public._complete_double_elimination(uuid) from public, anon, authenticated;
revoke all on function public._standings_de_rows(uuid) from public, anon, authenticated;
revoke all on function public._standings_knockout_rows(uuid) from public, anon, authenticated;
