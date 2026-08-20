-- Fix community member stats:
--   1. The approval trigger skipped draws entirely (returned before even
--      incrementing matches_played), so members with drawn matches were
--      undercounted. Rewrite it to count draws as played (no win/loss).
--   2. Backfill existing community_members rows from the approved matches
--      they actually participated in (player / opponent / partners).

create or replace function public.handle_approved_community_match()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Guard against re-approvals double-counting.
  if old.approval_status is distinct from 'approved' then
    if new.player_score > new.opponent_score then
      update public.community_members
      set matches_played = matches_played + 1, wins = wins + 1
      where community_id = new.community_id
        and profile_id in (
          new.player_id,
          coalesce(new.player_partner_id, '00000000-0000-0000-0000-000000000000')
        );
      update public.community_members
      set matches_played = matches_played + 1, losses = losses + 1
      where community_id = new.community_id
        and profile_id in (
          new.opponent_id,
          coalesce(new.opponent_partner_id, '00000000-0000-0000-0000-000000000000')
        );
    elsif new.opponent_score > new.player_score then
      update public.community_members
      set matches_played = matches_played + 1, wins = wins + 1
      where community_id = new.community_id
        and profile_id in (
          new.opponent_id,
          coalesce(new.opponent_partner_id, '00000000-0000-0000-0000-000000000000')
        );
      update public.community_members
      set matches_played = matches_played + 1, losses = losses + 1
      where community_id = new.community_id
        and profile_id in (
          new.player_id,
          coalesce(new.player_partner_id, '00000000-0000-0000-0000-000000000000')
        );
    else
      -- Draw — counts as played for everyone involved, neither win nor loss.
      update public.community_members
      set matches_played = matches_played + 1
      where community_id = new.community_id
        and profile_id in (
          new.player_id,
          coalesce(new.player_partner_id, '00000000-0000-0000-0000-000000000000'),
          new.opponent_id,
          coalesce(new.opponent_partner_id, '00000000-0000-0000-0000-000000000000')
        );
    end if;
  end if;

  return new;
end;
$$;

-- Reconcile stored stats with the approved matches each member took part in.
-- The compute_win_ratio trigger keeps win_ratio in sync as we write wins/losses.
with participants as (
  select
    m.community_id,
    p.pid as profile_id,
    (m.player_score = m.opponent_score) as is_draw,
    case
      when m.player_score > m.opponent_score then (p.side = 'player')
      when m.opponent_score > m.player_score then (p.side = 'opponent')
      else false
    end as won
  from public.community_matches m
  cross join lateral (
    select m.player_id as pid, 'player'::text as side
    where m.player_id is not null
    union all
    select m.player_partner_id, 'player'
    where m.player_partner_id is not null
    union all
    select m.opponent_id, 'opponent'
    where m.opponent_id is not null
    union all
    select m.opponent_partner_id, 'opponent'
    where m.opponent_partner_id is not null
  ) p
  where m.approval_status = 'approved'
),
agg as (
  select
    community_id,
    profile_id,
    count(*)::int as played,
    count(*) filter (where won)::int as wins,
    count(*) filter (where not won and not is_draw)::int as losses
  from participants
  group by community_id, profile_id
)
update public.community_members cm
set
  matches_played = a.played,
  wins = a.wins,
  losses = a.losses
from agg a
where cm.community_id = a.community_id
  and cm.profile_id = a.profile_id;