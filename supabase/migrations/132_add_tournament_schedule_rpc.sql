-- 132_add_tournament_schedule_rpc.sql
-- Tournament-wide schedule read: every scheduled match of a tournament inside a time window,
-- across all modules the caller can see. Powers the "Today's matches" section on the tournament
-- screen (docs/tournaments/PLAN-schedule.md, Phase 2).
--
-- ADDITIVE ONLY: one new function. Installed app builds never call it, and nothing existing changes.
-- The `entry_a` / `entry_b` jsonb shape is identical to `get_module_matches`.

create or replace function public.get_tournament_schedule(
  p_tournament uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  module_id uuid,
  module_name text,
  module_sport text,
  module_custom_sport_name text,
  module_sort_order int,
  id uuid,
  round_number int,
  match_number int,
  is_third_place boolean,
  round_name text,
  group_letter text,
  code text,
  bracket_side text,
  entry_a jsonb,
  entry_b jsonb,
  entry_a_label text,
  entry_b_label text,
  status text,
  scheduled_at timestamptz,
  venue text,
  court text,
  score_a int,
  score_b int,
  winner_entry_id uuid,
  is_draw boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '7 days' then
    raise exception 'INVALID_WINDOW';
  end if;

  return query
  select
    m.id, m.name, m.sport, m.custom_sport_name, m.sort_order,
    tm.id, tm.round_number, tm.match_number, tm.is_third_place,
    r.name, g.letter, tm.code, tm.bracket_side,
    case when ea.id is null then null
         else jsonb_build_object('id', ea.id, 'name', ea.name, 'seed', ea.seed,
                                 'profile_id', ea.profile_id,
                                 'profile_ids', to_jsonb(public._entry_profile_ids(ea.id))) end,
    case when eb.id is null then null
         else jsonb_build_object('id', eb.id, 'name', eb.name, 'seed', eb.seed,
                                 'profile_id', eb.profile_id,
                                 'profile_ids', to_jsonb(public._entry_profile_ids(eb.id))) end,
    tm.entry_a_label, tm.entry_b_label,
    tm.status, tm.scheduled_at, tm.venue, tm.court,
    tm.score_a, tm.score_b, tm.winner_entry_id, tm.is_draw
  from public.tournament_modules m
  join public.tournament_matches tm on tm.module_id = m.id
  join public.tournament_rounds r on r.id = tm.round_id
  left join public.tournament_entries ea on ea.id = tm.entry_a_id
  left join public.tournament_entries eb on eb.id = tm.entry_b_id
  left join public.tournament_groups g on g.id = tm.group_id
  where m.tournament_id = p_tournament
    and public.can_view_module(m.id)
    and tm.scheduled_at >= p_from
    and tm.scheduled_at < p_to
    and tm.status not in ('bye', 'cancelled')
  order by tm.scheduled_at, tm.court nulls last, m.sort_order, tm.match_number;
end;
$$;

revoke all on function public.get_tournament_schedule(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_tournament_schedule(uuid, timestamptz, timestamptz) to authenticated;
