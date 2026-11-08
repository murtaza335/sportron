-- 096_add_tournament_knockout_stage.sql
-- Tournaments v2 (groups + knockout), part 2: qualifiers → knockout stage, completion, standings.
-- See docs/tournaments/PLAN-v2.md §5.3. Builds stage 2 as a single-elimination bracket
-- (_build_single_elim from 094) once every group match is decided.
-- No new notification types; building the knockout sends no extra notification.

-- ───────────────────────────────────────────────────────────────────────────
-- helpers
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._groups_finished(p_module uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.tournament_matches tm where tm.module_id = p_module and tm.bracket_side = 'group')
     and not exists (select 1 from public.tournament_matches tm where tm.module_id = p_module
                     and tm.bracket_side = 'group' and tm.status not in ('completed','walkover'));
$$;

-- number of first-round pairs whose two entries come from the same group
-- p_groups[i] = group letter of seed i (1..p_q); p_order = _tournament_seed_order(S)
create or replace function public._ko_conflicts(p_groups text[], p_order int[], p_q int)
returns int
language plpgsql
immutable
as $$
declare
  v_c int := 0;
  v_i int;
  v_a int;
  v_b int;
begin
  for v_i in 1..array_length(p_order, 1) / 2 loop
    v_a := p_order[2 * v_i - 1];
    v_b := p_order[2 * v_i];
    if v_a <= p_q and v_b <= p_q and p_groups[v_a] = p_groups[v_b] then
      v_c := v_c + 1;
    end if;
  end loop;
  return v_c;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- preview_knockout_qualifiers: the suggested bracket order (no writes)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.preview_knockout_qualifiers(p_module uuid)
returns table (
  entry_id uuid,
  name text,
  group_letter text,
  "position" int,
  label text,
  suggested_seed int
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_m public.tournament_modules;
  v_q int;
  v_s int;
  v_order int[];
  v_ids uuid[];
  v_names text[];
  v_letters text[];
  v_pos int[];
  v_i int;
  v_c int;
  v_guard int := 0;
  v_improved boolean;
  v_lo int;
  v_tmp_id uuid; v_tmp_name text; v_tmp_letter text; v_tmp_pos int;
  v_before int;
  v_after int;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module;
  if v_m.format <> 'groups_knockout' then
    raise exception 'INVALID_STATUS';
  end if;
  if not public._groups_finished(p_module) then
    raise exception 'GROUPS_NOT_FINISHED';
  end if;

  -- qualifiers sorted: group position, then points / diff / score for across groups, then letter
  select array_agg(x.eid order by x.pos, x.pts desc, x.sd desc, x.sf desc, x.letter),
         array_agg(x.ename order by x.pos, x.pts desc, x.sd desc, x.sf desc, x.letter),
         array_agg(x.letter order by x.pos, x.pts desc, x.sd desc, x.sf desc, x.letter),
         array_agg(x.pos order by x.pos, x.pts desc, x.sd desc, x.sf desc, x.letter)
    into v_ids, v_names, v_letters, v_pos
  from (
    select t.entry_id as eid, t.name as ename, g.letter, t.rnk as pos, t.points as pts,
           t.score_diff as sd, t.score_for as sf
    from public.tournament_groups g
    cross join lateral public._league_table(p_module, g.id) t
    where g.module_id = p_module and t.rnk <= v_m.advance_per_group
  ) x;

  v_q := coalesce(array_length(v_ids, 1), 0);
  if v_q < 2 then
    raise exception 'INVALID_STATUS';
  end if;
  v_s := 2;
  while v_s < v_q loop v_s := v_s * 2; end loop;
  v_order := public._tournament_seed_order(v_s);

  -- avoid same-group first-round meetings: swap the lower seed of a conflicting pair with a lower
  -- seed of the same group position whenever that reduces the total number of conflicts
  loop
    v_improved := false;
    v_guard := v_guard + 1;
    exit when v_guard > 200;
    v_before := public._ko_conflicts(v_letters, v_order, v_q);
    exit when v_before = 0;
    for v_i in 1..v_s / 2 loop
      if v_order[2 * v_i - 1] <= v_q and v_order[2 * v_i] <= v_q
         and v_letters[v_order[2 * v_i - 1]] = v_letters[v_order[2 * v_i]] then
        v_lo := greatest(v_order[2 * v_i - 1], v_order[2 * v_i]);
        for v_c in v_lo + 1..v_q loop
          if v_pos[v_c] = v_pos[v_lo] then
            -- swap seeds v_lo and v_c
            v_tmp_id := v_ids[v_lo]; v_ids[v_lo] := v_ids[v_c]; v_ids[v_c] := v_tmp_id;
            v_tmp_name := v_names[v_lo]; v_names[v_lo] := v_names[v_c]; v_names[v_c] := v_tmp_name;
            v_tmp_letter := v_letters[v_lo]; v_letters[v_lo] := v_letters[v_c]; v_letters[v_c] := v_tmp_letter;
            v_tmp_pos := v_pos[v_lo]; v_pos[v_lo] := v_pos[v_c]; v_pos[v_c] := v_tmp_pos;
            v_after := public._ko_conflicts(v_letters, v_order, v_q);
            if v_after < v_before then
              v_improved := true;
              exit;
            end if;
            -- not better: undo
            v_tmp_id := v_ids[v_lo]; v_ids[v_lo] := v_ids[v_c]; v_ids[v_c] := v_tmp_id;
            v_tmp_name := v_names[v_lo]; v_names[v_lo] := v_names[v_c]; v_names[v_c] := v_tmp_name;
            v_tmp_letter := v_letters[v_lo]; v_letters[v_lo] := v_letters[v_c]; v_letters[v_c] := v_tmp_letter;
            v_tmp_pos := v_pos[v_lo]; v_pos[v_lo] := v_pos[v_c]; v_pos[v_c] := v_tmp_pos;
          end if;
        end loop;
      end if;
      exit when v_improved;
    end loop;
    exit when not v_improved;
  end loop;

  return query
  select v_ids[i], v_names[i], v_letters[i], v_pos[i], v_letters[i] || v_pos[i], i
  from generate_series(1, v_q) i
  order by i;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- build_knockout_stage: writes group positions + qualified flags, builds stage 2
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.build_knockout_stage(p_module uuid, p_entry_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_order uuid[];
  v_labels text[];
  v_expected uuid[];
  v_count int;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module for update;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.format <> 'groups_knockout' or v_m.status <> 'in_progress' or v_m.current_stage <> 1 then
    raise exception 'INVALID_STATUS';
  end if;
  if not public._groups_finished(p_module) then
    raise exception 'GROUPS_NOT_FINISHED';
  end if;

  select array_agg(q.entry_id order by q.suggested_seed) into v_expected
  from public.preview_knockout_qualifiers(p_module) q;

  if p_entry_ids is null then
    v_order := v_expected;
  else
    if coalesce(array_length(p_entry_ids, 1), 0) <> coalesce(array_length(v_expected, 1), 0)
       or (select count(distinct x) from unnest(p_entry_ids) x) <> array_length(v_expected, 1)
       or exists (select 1 from unnest(p_entry_ids) x where not (x = any (v_expected))) then
      raise exception 'FIELD_INVALID:entry_ids';
    end if;
    v_order := p_entry_ids;
  end if;

  -- group positions + qualified flags
  update public.tournament_group_entries ge set
    final_position = t.rnk,
    qualified = (t.rnk <= v_m.advance_per_group)
  from public.tournament_groups g
  cross join lateral public._league_table(p_module, g.id) t
  where ge.group_id = g.id and ge.entry_id = t.entry_id and g.module_id = p_module;

  update public.tournament_entries e set eliminated_side = 'group', eliminated_round = null
  where e.module_id = p_module
    and exists (select 1 from public.tournament_group_entries ge
                where ge.entry_id = e.id and ge.qualified is false);

  -- label = <group letter><position>
  select array_agg(g.letter || ge.final_position order by o.ord) into v_labels
  from unnest(v_order) with ordinality as o(id, ord)
  join public.tournament_group_entries ge on ge.entry_id = o.id
  join public.tournament_groups g on g.id = ge.group_id;

  perform public._build_single_elim(p_module, 2, v_order, v_m.third_place_match, v_labels);
  update public.tournament_modules set current_stage = 2 where id = p_module;

  select count(*) into v_count from public.tournament_matches where module_id = p_module and stage_number = 2;
  return v_count;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- reset_knockout_stage: undo the knockout while nothing in it has been played
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.reset_knockout_stage(p_module uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
begin
  if auth.uid() is null or not public.is_module_admin(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = p_module for update;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.format <> 'groups_knockout' or v_m.status <> 'in_progress' or v_m.current_stage <> 2 then
    raise exception 'INVALID_STATUS';
  end if;
  if exists (select 1 from public.tournament_matches tm
             where tm.module_id = p_module and tm.stage_number = 2
               and tm.status in ('completed','walkover')) then
    raise exception 'DOWNSTREAM_PLAYED';
  end if;

  delete from public.tournament_rounds where module_id = p_module and stage_number = 2;
  update public.tournament_group_entries set qualified = null, final_position = null where module_id = p_module;
  update public.tournament_entries
    set eliminated_side = null, eliminated_round = null, final_rank = null
    where module_id = p_module;
  update public.tournament_modules
    set current_stage = 1, champion_entry_id = null, runner_up_entry_id = null, third_place_entry_id = null
    where id = p_module;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- completion (replaces the 094 stub)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._complete_groups_knockout(p_module uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q int;
begin
  if (select m.current_stage from public.tournament_modules m where m.id = p_module) <> 2 then
    return;
  end if;
  if not public._complete_main(p_module, 2, false) then
    return;
  end if;

  select count(*) into v_q from public.tournament_group_entries ge
  where ge.module_id = p_module and ge.qualified is true;

  -- non-qualifiers: Q + 1 + (number of non-qualifiers with a better group position); ties share
  update public.tournament_entries e set final_rank = v_q + 1 + (
      select count(*) from public.tournament_group_entries o
      where o.module_id = p_module and o.qualified is false and o.final_position < ge.final_position)
  from public.tournament_group_entries ge
  where ge.entry_id = e.id and ge.module_id = p_module and ge.qualified is false;

  update public.tournament_modules set status = 'completed' where id = p_module;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Standings rows for a single-elimination bracket of one stage (v1 logic + stage filter).
-- Row shape is identical to get_module_standings (085) so the client can reuse StandingsTable.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._standings_main_rows(p_module uuid, p_stage int)
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
    select tm.* from public.tournament_matches tm
    where tm.module_id = p_module and tm.stage_number = p_stage and tm.bracket_side = 'main'
  ),
  ents as (
    select e.* from public.tournament_entries e
    where e.module_id = p_module
      and exists (select 1 from mt where mt.entry_a_id = e.id or mt.entry_b_id = e.id)
  ),
  played_m as (
    select mt.id as match_id, mt.status as mstatus, mt.winner_entry_id, mt.round_number, mt.is_third_place,
           s.entry_id,
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
    select x.entry_id, max(x.round_number) as rr
    from (
      select mt.entry_a_id as entry_id, mt.round_number from mt where not mt.is_third_place and mt.entry_a_id is not null
      union all
      select mt.entry_b_id, mt.round_number from mt where not mt.is_third_place and mt.entry_b_id is not null
    ) x group by x.entry_id
  ),
  lost_to as (
    select distinct on (pm.entry_id) pm.entry_id, w.name as by_name
    from played_m pm
    join public.tournament_entries w on w.id = pm.winner_entry_id
    where pm.winner_entry_id is distinct from pm.entry_id and not pm.is_third_place
    order by pm.entry_id, pm.round_number desc
  ),
  rows_ as (
    select
      e.id as entry_id, e.name, e.seed, e.profile_id, e.final_rank, e.eliminated_round, e.eliminated_side,
      coalesce(a.played, 0) as played, coalesce(a.won, 0) as won, coalesce(a.lost, 0) as lost,
      coalesce(a.sf, 0) as sf, coalesce(a.sa, 0) as sa,
      rc.rr as reached_round,
      case
        when e.id = (select champion_entry_id from mdl) then 'Champion'
        when e.id = (select third_place_entry_id from mdl) then '3rd'
        else (select r.name from public.tournament_rounds r
              where r.module_id = p_module and r.stage_number = p_stage and r.bracket_side = 'main'
                and r.round_number = rc.rr and not r.is_third_place limit 1)
      end as reached_label,
      case
        when e.id = (select champion_entry_id from mdl) then 'champion'
        when e.status = 'withdrawn' then 'withdrawn'
        when e.eliminated_round is not null or e.final_rank is not null then 'eliminated'
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
      'played', l.played, 'won', l.won, 'lost', l.lost,
      'score_for', l.sf, 'score_against', l.sa, 'score_diff', l.sd,
      'reached_round', l.reached_round, 'reached_label', l.reached_label,
      'status', l.pstatus, 'eliminated_by', l.by_name, 'eliminated_side', l.eliminated_side
    ) order by l.rnk, l.sd desc, l.sf desc, l.seed asc nulls last, l.name), '[]'::jsonb)
  into v_out
  from labelled l;
  return v_out;
end;
$$;

-- knockout rows: the stage-2 bracket for groups + knockout, else the v1 function (097 adds double elimination)
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
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.get_module_standings(p_module) s);
end;
$$;

revoke all on function public._groups_finished(uuid) from public, anon, authenticated;
revoke all on function public._ko_conflicts(text[], int[], int) from public, anon, authenticated;
revoke all on function public._complete_groups_knockout(uuid) from public, anon, authenticated;
revoke all on function public._standings_main_rows(uuid, int) from public, anon, authenticated;
revoke all on function public._standings_knockout_rows(uuid) from public, anon, authenticated;
revoke all on function public.preview_knockout_qualifiers(uuid) from public, anon;
revoke all on function public.build_knockout_stage(uuid, uuid[]) from public, anon;
revoke all on function public.reset_knockout_stage(uuid) from public, anon;
grant execute on function public.preview_knockout_qualifiers(uuid) to authenticated;
grant execute on function public.build_knockout_stage(uuid, uuid[]) to authenticated;
grant execute on function public.reset_knockout_stage(uuid) to authenticated;
