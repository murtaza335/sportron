-- BUG-M15: handle_approved_community_match only added stats when a match became 'approved'
-- and never subtracted them when it stopped being approved, so approved -> disputed -> approved
-- counted the same match twice. Stats are now maintained symmetrically:
--   * becoming 'approved'            -> +1 played, +1 win/loss (or draw) per participant
--   * leaving 'approved' (any other) -> the exact reverse
-- Participant sets are never updated after insert (guard in 101), so the reversal always
-- matches what was added.

create or replace function public.apply_community_match_stats(
  p_match public.community_matches,
  p_delta int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_none constant uuid := '00000000-0000-0000-0000-000000000000';
  v_player_side uuid[] := array[p_match.player_id, coalesce(p_match.player_partner_id, v_none)];
  v_opponent_side uuid[] := array[p_match.opponent_id, coalesce(p_match.opponent_partner_id, v_none)];
begin
  if p_match.player_score > p_match.opponent_score then
    update public.community_members
       set matches_played = greatest(0, matches_played + p_delta), wins = greatest(0, wins + p_delta)
     where community_id = p_match.community_id and profile_id = any (v_player_side);
    update public.community_members
       set matches_played = greatest(0, matches_played + p_delta), losses = greatest(0, losses + p_delta)
     where community_id = p_match.community_id and profile_id = any (v_opponent_side);
  elsif p_match.opponent_score > p_match.player_score then
    update public.community_members
       set matches_played = greatest(0, matches_played + p_delta), wins = greatest(0, wins + p_delta)
     where community_id = p_match.community_id and profile_id = any (v_opponent_side);
    update public.community_members
       set matches_played = greatest(0, matches_played + p_delta), losses = greatest(0, losses + p_delta)
     where community_id = p_match.community_id and profile_id = any (v_player_side);
  else
    -- Draw: counts as played, neither win nor loss.
    update public.community_members
       set matches_played = greatest(0, matches_played + p_delta)
     where community_id = p_match.community_id
       and profile_id = any (v_player_side || v_opponent_side);
  end if;
end;
$$;

revoke all on function public.apply_community_match_stats(public.community_matches, int) from public, anon, authenticated;

create or replace function public.handle_approved_community_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.approval_status = 'approved' and old.approval_status is distinct from 'approved' then
    perform public.apply_community_match_stats(new, 1);
  elsif old.approval_status = 'approved' and new.approval_status is distinct from 'approved' then
    perform public.apply_community_match_stats(old, -1);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_community_matches_after_approval on public.community_matches;
create trigger trg_community_matches_after_approval
  after update of approval_status
  on public.community_matches
  for each row
  when (old.approval_status is distinct from new.approval_status)
  execute function public.handle_approved_community_match();
