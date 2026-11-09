-- SEC-C4: community match integrity.
--   1. The recorder could set approval_status='approved' on their own match (UPDATE policy
--      allowed recorded_by) and any participant could rewrite scores at any time.
--   2. INSERT did not force approval_status='pending', so an already-approved match could be
--      inserted without opponent consent.
--
-- Backward compatible: installed builds only insert pending matches and only the opponent
-- updates approval_status (pending -> approved|disputed).

-- 1. Force pending on client INSERTs (extends the participant validation from 061).
create or replace function public.validate_community_match_participants()
returns trigger
language plpgsql
as $$
begin
  if new.recorded_by not in (
    new.player_id, new.player_partner_id, new.opponent_id, new.opponent_partner_id
  ) then
    raise exception 'Only match participants can record this match';
  end if;

  if not exists (
    select 1 from public.community_members
    where community_id = new.community_id and profile_id = new.player_id and approval_status = 'approved'
  ) then
    raise exception 'Player is not a member of this community';
  end if;

  if not exists (
    select 1 from public.community_members
    where community_id = new.community_id and profile_id = new.opponent_id and approval_status = 'approved'
  ) then
    raise exception 'Opponent is not a member of this community';
  end if;

  if new.player_partner_id is not null and not exists (
    select 1 from public.community_members
    where community_id = new.community_id and profile_id = new.player_partner_id and approval_status = 'approved'
  ) then
    raise exception 'Player partner is not a member of this community';
  end if;

  if new.opponent_partner_id is not null and not exists (
    select 1 from public.community_members
    where community_id = new.community_id and profile_id = new.opponent_partner_id and approval_status = 'approved'
  ) then
    raise exception 'Opponent partner is not a member of this community';
  end if;

  -- Client inserts always start pending; service role / internal writes keep their value.
  if auth.uid() is not null then
    new.approval_status := 'pending';
  end if;

  return new;
end;
$$;

-- 2. Guard UPDATEs.
create or replace function public.guard_community_match_update()
returns trigger
language plpgsql
as $$
declare
  v_recorder_on_player_side boolean;
  v_actor_on_player_side boolean;
  v_actor_on_opponent_side boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Match content is immutable for clients.
  if new.community_id is distinct from old.community_id
     or new.recorded_by is distinct from old.recorded_by
     or new.player_id is distinct from old.player_id
     or new.player_partner_id is distinct from old.player_partner_id
     or new.opponent_id is distinct from old.opponent_id
     or new.opponent_partner_id is distinct from old.opponent_partner_id
     or new.sport is distinct from old.sport
     or new.custom_sport_name is distinct from old.custom_sport_name
     or new.team_a_name is distinct from old.team_a_name
     or new.team_b_name is distinct from old.team_b_name
     or new.player_score is distinct from old.player_score
     or new.opponent_score is distinct from old.opponent_score
     or new.created_at is distinct from old.created_at then
    raise exception 'NOT_ALLOWED';
  end if;

  if new.approval_status is distinct from old.approval_status then
    if old.approval_status <> 'pending' or new.approval_status not in ('approved', 'disputed') then
      raise exception 'NOT_ALLOWED';
    end if;

    v_recorder_on_player_side := coalesce(old.recorded_by in (old.player_id, old.player_partner_id), false);
    v_actor_on_player_side := coalesce(auth.uid() in (old.player_id, old.player_partner_id), false);
    v_actor_on_opponent_side := coalesce(auth.uid() in (old.opponent_id, old.opponent_partner_id), false);

    -- Only someone on the opposite side of the recorder may resolve the match.
    if v_recorder_on_player_side and not v_actor_on_opponent_side then
      raise exception 'NOT_ALLOWED';
    end if;
    if not v_recorder_on_player_side and not v_actor_on_player_side then
      raise exception 'NOT_ALLOWED';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_community_match_update on public.community_matches;
create trigger trg_guard_community_match_update
  before update on public.community_matches
  for each row execute function public.guard_community_match_update();

-- 3. UPDATE policy: same expression for USING and WITH CHECK.
drop policy if exists "Match participants can update approval status" on public.community_matches;
create policy "Match participants can update approval status"
  on public.community_matches for update
  to authenticated
  using (
    auth.uid() = opponent_id or auth.uid() = opponent_partner_id
    or auth.uid() = player_id or auth.uid() = player_partner_id
    or auth.uid() = recorded_by
  )
  with check (
    auth.uid() = opponent_id or auth.uid() = opponent_partner_id
    or auth.uid() = player_id or auth.uid() = player_partner_id
    or auth.uid() = recorded_by
  );
