-- 095_add_tournament_group_stage.sql
-- Tournaments v2 (groups + knockout), part 1: the group stage. See docs/tournaments/PLAN-v2.md §5.3, §6.4.
--   _generate_groups (replaces the 094 stub), _rebuild_group_fixtures, move_group_entry,
--   get_module_groups, group tables in get_module_standings_v2, counts.groups_finished.
-- The knockout stage (preview / build / reset, completion) is 096.

-- ───────────────────────────────────────────────────────────────────────────
-- Fixtures for every group from the current group membership (letter order).
-- Deletes the stage-1 group rounds (matches cascade) first. Entries inside a group play in seed order.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._rebuild_group_fixtures(p_module uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_legs int;
  v_g record;
  v_entries uuid[];
begin
  select m.rr_legs into v_legs from public.tournament_modules m where m.id = p_module;
  delete from public.tournament_rounds
  where module_id = p_module and stage_number = 1 and bracket_side = 'group';

  for v_g in
    select g.id, g.letter from public.tournament_groups g
    where g.module_id = p_module order by g.sort_order, g.letter
  loop
    select array_agg(e.id order by e.seed, e.created_at) into v_entries
    from public.tournament_group_entries ge
    join public.tournament_entries e on e.id = ge.entry_id
    where ge.group_id = v_g.id;
    perform public._build_round_robin(p_module, 1, 'group', v_g.id, v_entries, v_legs, v_g.letter);
  end loop;
end;
$$;

-- Snake draw: seed 1→A, 2→B … g→last, g+1→last … back to A, and so on.
create or replace function public._generate_groups(p_module uuid, p_ordered uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_modules;
  v_g int;
  v_n int := coalesce(array_length(p_ordered, 1), 0);
  v_i int;
  v_row int;
  v_col int;
  v_idx int;
  v_group_ids uuid[] := '{}';
  v_gid uuid;
begin
  select * into v_m from public.tournament_modules where id = p_module;
  v_g := v_m.group_count;
  if v_g is null or v_m.advance_per_group is null or v_n < 2 * v_g or ceil(v_n::numeric / v_g) > 8 then
    raise exception 'FIELD_INVALID:group_count';
  end if;

  for v_i in 1..v_g loop
    insert into public.tournament_groups (module_id, name, letter, sort_order)
    values (p_module, 'Group ' || chr(64 + v_i), chr(64 + v_i), v_i)
    returning id into v_gid;
    v_group_ids := v_group_ids || v_gid;
  end loop;

  for v_i in 0..v_n - 1 loop
    v_row := v_i / v_g;
    v_col := v_i % v_g;
    v_idx := case when v_row % 2 = 0 then v_col else v_g - 1 - v_col end;
    insert into public.tournament_group_entries (group_id, entry_id, module_id)
    values (v_group_ids[v_idx + 1], p_ordered[v_i + 1], p_module);
  end loop;

  perform public._rebuild_group_fixtures(p_module);
  update public.tournament_modules set current_stage = 1 where id = p_module;
end;
$$;

-- Admin: move one entry to another group during seeding; fixtures of all groups are rebuilt.
create or replace function public.move_group_entry(p_entry uuid, p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.tournament_entries;
  v_m public.tournament_modules;
  v_from uuid;
begin
  select * into v_e from public.tournament_entries where id = p_entry;
  if not found or auth.uid() is null or not public.is_module_admin(v_e.module_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_m from public.tournament_modules where id = v_e.module_id for update;
  perform public._tournament_assert_writable(v_m.tournament_id);
  if v_m.status <> 'seeding' or v_m.format <> 'groups_knockout' then
    raise exception 'INVALID_STATUS';
  end if;

  select ge.group_id into v_from from public.tournament_group_entries ge where ge.entry_id = p_entry;
  if v_from is null then
    raise exception 'NOT_FOUND';
  end if;
  if not exists (select 1 from public.tournament_groups g where g.id = p_group and g.module_id = v_m.id) then
    raise exception 'NOT_FOUND';
  end if;
  if v_from = p_group then
    return;
  end if;
  if (select count(*) from public.tournament_group_entries where group_id = v_from) <= 2 then
    raise exception 'FIELD_INVALID:group';
  end if;
  if (select count(*) from public.tournament_group_entries where group_id = p_group) >= 8 then
    raise exception 'FIELD_INVALID:group';
  end if;

  update public.tournament_group_entries set group_id = p_group where entry_id = p_entry;
  perform public._rebuild_group_fixtures(v_m.id);
end;
$$;

-- Group draw (readable before any match is played).
create or replace function public.get_module_groups(p_module uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_view_module(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', g.id, 'letter', g.letter, 'name', g.name,
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object('entry_id', e.id, 'name', e.name, 'seed', e.seed)
                           order by e.seed nulls last, e.name)
          from public.tournament_group_entries ge
          join public.tournament_entries e on e.id = ge.entry_id
          where ge.group_id = g.id), '[]'::jsonb)
      ) order by g.sort_order, g.letter)
    from public.tournament_groups g where g.module_id = p_module), '[]'::jsonb);
end;
$$;

-- Group tables for standings v2 (replaces the 094 stub).
create or replace function public._standings_groups(p_module uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'letter', g.letter, 'name', g.name,
      'advance', (select m.advance_per_group from public.tournament_modules m where m.id = p_module),
      'table', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'rank', t.rnk, 'entry_id', t.entry_id, 'name', t.name, 'seed', t.seed,
            'profile_ids', to_jsonb(public._entry_profile_ids(t.entry_id)),
            'played', t.played, 'won', t.won, 'drawn', t.drawn, 'lost', t.lost,
            'score_for', t.score_for, 'score_against', t.score_against, 'score_diff', t.score_diff,
            'points', t.points, 'form', to_jsonb(t.form), 'status', t.status,
            'qualified', ge.qualified, 'final_position', ge.final_position
          ) order by t.rnk), '[]'::jsonb)
        from public._league_table(p_module, g.id) t
        left join public.tournament_group_entries ge on ge.group_id = g.id and ge.entry_id = t.entry_id)
    ) order by g.sort_order, g.letter), '[]'::jsonb)
  from public.tournament_groups g
  where g.module_id = p_module;
$$;

-- get_module_detail: counts.groups_finished (patched from the live definition)
do $do$
declare
  v_def text;
  v_new text;
  v_expr constant text := $e$'groups_finished', (v_m.format = 'groups_knockout'
        and exists (select 1 from public.tournament_matches tm where tm.module_id = p_module and tm.bracket_side = 'group')
        and not exists (select 1 from public.tournament_matches tm where tm.module_id = p_module
                        and tm.bracket_side = 'group' and tm.status not in ('completed','walkover'))),
      'rosters_incomplete'$e$;
begin
  v_def := pg_get_functiondef('public.get_module_detail(uuid)'::regprocedure);
  v_new := replace(v_def, '''rosters_incomplete''', v_expr);
  if v_new = v_def then
    raise exception 'groups_finished patch: rosters_incomplete not found';
  end if;
  execute v_new;
end
$do$;

revoke all on function public._rebuild_group_fixtures(uuid) from public, anon, authenticated;
revoke all on function public._generate_groups(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public._standings_groups(uuid) from public, anon, authenticated;
revoke all on function public.move_group_entry(uuid, uuid) from public, anon;
revoke all on function public.get_module_groups(uuid) from public, anon;
grant execute on function public.move_group_entry(uuid, uuid) to authenticated;
grant execute on function public.get_module_groups(uuid) to authenticated;
