-- 085_add_tournament_read_rpcs.sql
-- Read RPCs for tournaments (PLAN §6.1, §7). All SECURITY DEFINER, auth.uid()-guarded,
-- RETURNS TABLE / jsonb. Private entry fields (CMS ID, phone, email, private custom)
-- are stripped for anyone who is not a module admin or the linked entrant.
-- ADDITIVE ONLY.

-- ───────────────────────────────────────────────────────────────────────────
-- get_tournaments(p_scope)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_tournaments(p_scope text default 'all')
returns table (
  id uuid,
  name text,
  description text,
  organization text,
  location text,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  community_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  module_count int,
  sports text[],
  live_module_count int,
  my_role text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_scope not in ('live','upcoming','past','mine','all') then
    raise exception 'INVALID_SCOPE';
  end if;

  return query
  with base as (
    select
      t.*,
      (select count(*)::int from public.tournament_modules m
        where m.tournament_id = t.id
          and (m.status <> 'draft' or public.is_module_admin(m.id))) as module_count,
      (select coalesce(array_agg(distinct m.sport), '{}'::text[]) from public.tournament_modules m
        where m.tournament_id = t.id
          and (m.status <> 'draft' or public.is_module_admin(m.id))) as sports,
      (select count(*)::int from public.tournament_modules m
        where m.tournament_id = t.id and m.status = 'in_progress'
          and (m.status <> 'draft' or public.is_module_admin(m.id))) as live_module_count,
      (select count(*)::int from public.tournament_modules m
        where m.tournament_id = t.id and m.status = 'completed'
          and (m.status <> 'draft' or public.is_module_admin(m.id))) as completed_module_count,
      case
        when exists (select 1 from public.tournament_admins ta
                     where ta.tournament_id = t.id and ta.profile_id = v_uid) then 'tournament_admin'
        when exists (select 1 from public.tournament_module_admins tma
                     join public.tournament_modules m on m.id = tma.module_id
                     where m.tournament_id = t.id and tma.profile_id = v_uid) then 'module_admin'
        when exists (select 1 from public.tournament_entries e
                     where e.tournament_id = t.id and e.profile_id = v_uid) then 'entrant'
        else null
      end as my_role
    from public.tournaments t
    where public.can_view_tournament(t.id)
  )
  select b.id, b.name, b.description, b.organization, b.location, b.image_url,
         b.starts_at, b.ends_at, b.status, b.community_id, b.created_at, b.updated_at,
         b.module_count, b.sports, b.live_module_count, b.my_role
  from base b
  where case p_scope
    when 'all' then true
    when 'mine' then b.my_role is not null
    when 'live' then b.status = 'published' and b.live_module_count > 0
    when 'upcoming' then b.status = 'published'
      and b.live_module_count = 0
      and not (b.module_count > 0 and b.completed_module_count = b.module_count)
    when 'past' then b.status in ('completed','cancelled')
      or (b.status = 'published' and b.module_count > 0
          and b.completed_module_count = b.module_count)
  end
  order by
    case when p_scope = 'past' then null else b.live_module_count end desc nulls last,
    case when p_scope = 'past' then b.starts_at end desc nulls last,
    case when p_scope <> 'past' then b.starts_at end asc nulls last,
    b.created_at desc;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- get_tournament_detail(p_tournament) → jsonb
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_tournament_detail(p_tournament uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tournaments;
  v_role text;
  v_admins jsonb;
  v_modules jsonb;
  v_champions jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_ALLOWED';
  end if;
  if not public.can_view_tournament(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into v_t from public.tournaments where id = p_tournament;

  v_role := case
    when public.is_tournament_admin(p_tournament) then 'tournament_admin'
    when exists (select 1 from public.tournament_module_admins tma
                 join public.tournament_modules m on m.id = tma.module_id
                 where m.tournament_id = p_tournament and tma.profile_id = v_uid) then 'module_admin'
    when exists (select 1 from public.tournament_entries e
                 where e.tournament_id = p_tournament and e.profile_id = v_uid) then 'entrant'
    else null
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url)
           order by ta.added_at), '[]'::jsonb)
    into v_admins
  from public.tournament_admins ta
  join public.public_profiles p on p.id = ta.profile_id
  where ta.tournament_id = p_tournament;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id,
      'name', m.name,
      'sport', m.sport,
      'status', m.status,
      'entry_count', (select count(*) from public.tournament_entries e
                      where e.module_id = m.id and e.status = 'active'),
      'starts_at', m.starts_at,
      'venue', m.venue,
      'sort_order', m.sort_order,
      'current_round_name', case when m.status = 'in_progress' then (
          select r.name
          from public.tournament_matches tm
          join public.tournament_rounds r on r.id = tm.round_id
          where tm.module_id = m.id and not tm.is_third_place
            and tm.status in ('pending','scheduled')
          order by tm.round_number asc limit 1) end,
      'my_role', case
          when public.is_module_admin(m.id) then 'module_admin'
          when exists (select 1 from public.tournament_entries e
                       where e.module_id = m.id and e.profile_id = v_uid) then 'entrant'
          else null end
    ) order by m.sort_order, m.created_at), '[]'::jsonb)
    into v_modules
  from public.tournament_modules m
  where m.tournament_id = p_tournament
    and (m.status <> 'draft' or public.is_module_admin(m.id));

  select coalesce(jsonb_agg(jsonb_build_object(
      'module_id', m.id,
      'module_name', m.name,
      'sport', m.sport,
      'champion', (select jsonb_build_object('id', e.id, 'name', e.name)
                   from public.tournament_entries e where e.id = m.champion_entry_id),
      'runner_up', (select jsonb_build_object('id', e.id, 'name', e.name)
                    from public.tournament_entries e where e.id = m.runner_up_entry_id),
      'third', (select jsonb_build_object('id', e.id, 'name', e.name)
                from public.tournament_entries e where e.id = m.third_place_entry_id)
    ) order by m.sort_order, m.created_at), '[]'::jsonb)
    into v_champions
  from public.tournament_modules m
  where m.tournament_id = p_tournament
    and m.champion_entry_id is not null
    and (m.status <> 'draft' or public.is_module_admin(m.id));

  return jsonb_build_object(
    'tournament', jsonb_build_object(
      'id', v_t.id, 'name', v_t.name, 'description', v_t.description,
      'organization', v_t.organization, 'location', v_t.location,
      'image_url', v_t.image_url, 'starts_at', v_t.starts_at, 'ends_at', v_t.ends_at,
      'status', v_t.status, 'community_id', v_t.community_id,
      'created_at', v_t.created_at, 'updated_at', v_t.updated_at),
    'admins', v_admins,
    'my_role', v_role,
    'champions', v_champions,
    'modules', v_modules
  );
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- get_tournament_entry_fields(p_tournament, p_include_archived)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_tournament_entry_fields(
  p_tournament uuid,
  p_include_archived boolean default false
)
returns table (
  id uuid,
  tournament_id uuid,
  key text,
  label text,
  field_type text,
  options jsonb,
  placeholder text,
  is_required boolean,
  is_public boolean,
  is_core boolean,
  sort_order int,
  archived_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.can_view_tournament(p_tournament) then
    raise exception 'NOT_ALLOWED';
  end if;
  -- archived fields are only meaningful to admins
  if p_include_archived and not public.is_tournament_admin(p_tournament) then
    p_include_archived := false;
  end if;

  return query
  select f.id, f.tournament_id, f.key, f.label, f.field_type, f.options, f.placeholder,
         f.is_required, f.is_public, f.is_core, f.sort_order, f.archived_at
  from public.tournament_entry_fields f
  where f.tournament_id = p_tournament
    and (p_include_archived or f.archived_at is null)
  order by f.sort_order, f.created_at;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- get_module_detail(p_module) → jsonb
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_module_detail(p_module uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.tournament_modules;
  v_role text;
  v_rounds jsonb;
  v_admins jsonb;
begin
  if v_uid is null or not public.can_view_module(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into v_m from public.tournament_modules where id = p_module;

  v_role := case
    when public.is_module_admin(p_module) then 'module_admin'
    when exists (select 1 from public.tournament_entries e
                 where e.module_id = p_module and e.profile_id = v_uid) then 'entrant'
    else null
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'module_id', r.module_id, 'round_number', r.round_number,
      'is_third_place', r.is_third_place, 'name', r.name, 'best_of', r.best_of,
      'rules_text', r.rules_text, 'scheduled_start', r.scheduled_start
    ) order by r.is_third_place, r.round_number), '[]'::jsonb)
    into v_rounds
  from public.tournament_rounds r where r.module_id = p_module;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url
    ) order by tma.added_at), '[]'::jsonb)
    into v_admins
  from public.tournament_module_admins tma
  join public.public_profiles p on p.id = tma.profile_id
  where tma.module_id = p_module;

  return jsonb_build_object(
    'module', to_jsonb(v_m),
    'tournament', (select jsonb_build_object('id', t.id, 'name', t.name, 'status', t.status)
                   from public.tournaments t where t.id = v_m.tournament_id),
    'rounds', v_rounds,
    'admins', v_admins,
    'my_role', v_role,
    'counts', jsonb_build_object(
      'entries', (select count(*) from public.tournament_entries e
                  where e.module_id = p_module and e.status = 'active'),
      'withdrawn', (select count(*) from public.tournament_entries e
                    where e.module_id = p_module and e.status = 'withdrawn'),
      'matches', (select count(*) from public.tournament_matches tm where tm.module_id = p_module),
      'matches_decided', (select count(*) from public.tournament_matches tm
                          where tm.module_id = p_module and tm.status in ('completed','walkover','bye'))
    )
  );
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- get_module_entries(p_module): PII-safe. `fields` = public, non-archived keys for
-- everyone; ALL keys for module admins and for the linked entrant on their own entry.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_module_entries(p_module uuid)
returns table (
  id uuid,
  name text,
  seed int,
  status text,
  eliminated_round int,
  final_rank int,
  profile jsonb,
  fields jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_tournament uuid;
  v_admin boolean;
begin
  if v_uid is null or not public.can_view_module(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;
  select m.tournament_id into v_tournament from public.tournament_modules m where m.id = p_module;
  v_admin := public.is_module_admin(p_module);

  return query
  select
    e.id, e.name, e.seed, e.status, e.eliminated_round, e.final_rank,
    case when p.id is null then null
         else jsonb_build_object('id', p.id, 'username', p.username, 'avatar_url', p.avatar_url) end,
    case
      when v_admin or e.profile_id = v_uid then e.field_values
      else coalesce((
        select jsonb_object_agg(kv.key, kv.value)
        from jsonb_each(e.field_values) kv
        join public.tournament_entry_fields f
          on f.tournament_id = v_tournament and f.key = kv.key
        where f.is_public and f.archived_at is null
      ), '{}'::jsonb)
    end
  from public.tournament_entries e
  left join public.public_profiles p on p.id = e.profile_id
  where e.module_id = p_module
  order by e.seed asc nulls last, lower(e.name), e.created_at;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- get_module_bracket(p_module): every match with entry refs (no PII)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_module_bracket(p_module uuid)
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
  best_of int
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.can_view_module(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;

  return query
  select
    tm.id, tm.module_id, tm.round_id, tm.round_number, tm.match_number, tm.is_third_place,
    case when ea.id is null then null
         else jsonb_build_object('id', ea.id, 'name', ea.name, 'seed', ea.seed, 'profile_id', ea.profile_id) end,
    case when eb.id is null then null
         else jsonb_build_object('id', eb.id, 'name', eb.name, 'seed', eb.seed, 'profile_id', eb.profile_id) end,
    tm.next_match_id, tm.next_slot, tm.status, tm.scheduled_at, tm.venue, tm.court,
    tm.score_a, tm.score_b, tm.score_detail, tm.winner_entry_id, tm.result_note, tm.completed_at,
    r.name, r.best_of
  from public.tournament_matches tm
  join public.tournament_rounds r on r.id = tm.round_id
  left join public.tournament_entries ea on ea.id = tm.entry_a_id
  left join public.tournament_entries eb on eb.id = tm.entry_b_id
  where tm.module_id = p_module
  order by tm.is_third_place, tm.round_number, tm.match_number;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- get_module_standings(p_module)  (PLAN §7) — full implementation
--   rank: final_rank when decided; otherwise provisional (alive first, then deeper
--   elimination round first). rank_label: 'n', or 'T-n' when shared; '-' for entries
--   still alive in an unfinished module.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_module_standings(p_module uuid)
returns table (
  rank int,
  rank_label text,
  entry_id uuid,
  name text,
  seed int,
  profile_id uuid,
  played int,
  won int,
  lost int,
  score_for int,
  score_against int,
  score_diff int,
  reached_round int,
  reached_label text,
  status text,
  eliminated_by text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.can_view_module(p_module) then
    raise exception 'NOT_ALLOWED';
  end if;

  return query
  with mdl as (
    select m.* from public.tournament_modules m where m.id = p_module
  ),
  ents as (
    select e.* from public.tournament_entries e
    where e.module_id = p_module
      and exists (select 1 from public.tournament_matches tm
                  where tm.module_id = p_module
                    and (tm.entry_a_id = e.id or tm.entry_b_id = e.id))
  ),
  played_m as (   -- decided, non-bye matches, one row per participating entry
    select tm.id as match_id, tm.status as mstatus, tm.winner_entry_id, tm.round_number,
           tm.is_third_place, tm.completed_at,
           s.entry_id,
           case when s.side = 'a' then tm.score_a else tm.score_b end as own,
           case when s.side = 'a' then tm.score_b else tm.score_a end as opp,
           case when s.side = 'a' then tm.entry_b_id else tm.entry_a_id end as opp_id
    from public.tournament_matches tm
    cross join lateral (values ('a', tm.entry_a_id), ('b', tm.entry_b_id)) as s(side, entry_id)
    where tm.module_id = p_module
      and tm.status in ('completed','walkover')
      and s.entry_id is not null
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
      select tm.entry_a_id as entry_id, tm.round_number from public.tournament_matches tm
        where tm.module_id = p_module and not tm.is_third_place and tm.entry_a_id is not null
      union all
      select tm.entry_b_id, tm.round_number from public.tournament_matches tm
        where tm.module_id = p_module and not tm.is_third_place and tm.entry_b_id is not null
    ) x group by x.entry_id
  ),
  lost_to as (   -- the winner of the most recent main-bracket match each entry lost
    select distinct on (pm.entry_id) pm.entry_id, w.name as by_name
    from played_m pm
    join public.tournament_entries w on w.id = pm.winner_entry_id
    where pm.winner_entry_id is distinct from pm.entry_id and not pm.is_third_place
    order by pm.entry_id, pm.round_number desc
  ),
  rows_ as (
    select
      e.id as entry_id, e.name, e.seed, e.profile_id, e.final_rank, e.eliminated_round,
      coalesce(a.played, 0) as played, coalesce(a.won, 0) as won, coalesce(a.lost, 0) as lost,
      coalesce(a.sf, 0) as sf, coalesce(a.sa, 0) as sa,
      rc.rr as reached_round,
      case
        when e.id = (select champion_entry_id from mdl) then 'Champion'
        when e.id = (select third_place_entry_id from mdl) then '3rd'
        else (select r.name from public.tournament_rounds r
              where r.module_id = p_module and r.round_number = rc.rr and not r.is_third_place limit 1)
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
        when r.final_rank is not null then r.final_rank
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
  select
    l.rnk::int,
    case
      when l.mod_status <> 'completed' and l.pstatus in ('alive','champion') then '-'
      when l.shared > 1 then 'T-' || l.rnk
      else l.rnk::text
    end,
    l.entry_id, l.name, l.seed, l.profile_id,
    l.played, l.won, l.lost, l.sf, l.sa, l.sd,
    l.reached_round, l.reached_label, l.pstatus, l.by_name
  from labelled l
  order by l.rnk, l.sd desc, l.sf desc, l.seed asc nulls last, l.name;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- search_profiles_for_tournament(p_query): link entrants / pick module admins.
-- Caller must be a tournament admin or module admin of something.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.search_profiles_for_tournament(p_query text)
returns table (
  id uuid,
  username text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_q text := btrim(coalesce(p_query, ''));
begin
  if v_uid is null then
    raise exception 'NOT_ALLOWED';
  end if;
  if not (exists (select 1 from public.tournament_admins ta where ta.profile_id = v_uid)
       or exists (select 1 from public.tournament_module_admins tma where tma.profile_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  if char_length(v_q) < 2 then
    return;
  end if;

  return query
  select p.id, p.username, p.avatar_url
  from public.public_profiles p
  where p.deleted_at is null
    and p.username is not null
    and p.username ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by (lower(p.username) = lower(v_q)) desc,
           (lower(p.username) like lower(v_q) || '%') desc,
           lower(p.username)
  limit 20;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Grants
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function public.get_tournaments(text) from public, anon;
revoke all on function public.get_tournament_detail(uuid) from public, anon;
revoke all on function public.get_tournament_entry_fields(uuid, boolean) from public, anon;
revoke all on function public.get_module_detail(uuid) from public, anon;
revoke all on function public.get_module_entries(uuid) from public, anon;
revoke all on function public.get_module_bracket(uuid) from public, anon;
revoke all on function public.get_module_standings(uuid) from public, anon;
revoke all on function public.search_profiles_for_tournament(text) from public, anon;

grant execute on function public.get_tournaments(text) to authenticated;
grant execute on function public.get_tournament_detail(uuid) to authenticated;
grant execute on function public.get_tournament_entry_fields(uuid, boolean) to authenticated;
grant execute on function public.get_module_detail(uuid) to authenticated;
grant execute on function public.get_module_entries(uuid) to authenticated;
grant execute on function public.get_module_bracket(uuid) to authenticated;
grant execute on function public.get_module_standings(uuid) to authenticated;
grant execute on function public.search_profiles_for_tournament(text) to authenticated;
